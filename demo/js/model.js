// The orchestrator. Builds the shared inputs once, runs each scenario over the
// 15-year horizon at hourly resolution, and reduces the result to the monthly
// and annual series the dashboard reads.

import {
  DEFAULTS, PRESETS, NG_BRIDGE, DF_BACKUP, BESS, SOLAR, TARIFF, FUEL, FINANCE,
  STRESS, HORIZON_MONTHS, HORIZON_YEARS,
} from './config.js';
import { buildTMY, poa } from './weather.js';
import { deriveITCapacity, buildUtilization, pueAt } from './load.js';
import { screenBackup } from './sizing.js';
import { buildLifecycle, SCENARIOS } from './lifecycle.js';
import { solveWindow, makeFlowBuffer } from './solver.js';
import { costOf, makeCostRecord, gasPriceIn, dieselPriceIn, gasRentForMonth, capexEvents, fixedOMForMonth } from './cost.js';
import { newBillingMonth, addHour, determinants, billFor, ratchetFloor, isSummer } from './tariff.js';
import { rng, clamp, monthOfDay, DAYS_IN_MONTH, HOURS_PER_YEAR, crf } from './util.js';

const HOURS = HORIZON_YEARS * HOURS_PER_YEAR;

/** Shared inputs — weather, load shape, sizing. Rebuilt only when the preset,
 *  the seed or the facility peak changes. */
export function buildDerived(inputs) {
  const tmy = buildTMY(38.95, inputs.seed);
  const util = buildUtilization(inputs.workloadPreset, inputs.seed);
  const { mwIT, pueDesign, tDesignC } = deriveITCapacity(inputs.facilityPeakMW, tmy);

  // Full-build facility load for one TMY year, as a fraction of nameplate peak.
  const shape = new Float32Array(HOURS_PER_YEAR);
  let peak = 0, mean = 0;
  for (let i = 0; i < HOURS_PER_YEAR; i++) {
    const v = mwIT * util[i] * pueAt(tmy.temp[i]);
    shape[i] = v;
    if (v > peak) peak = v;
    mean += v;
  }
  mean /= HOURS_PER_YEAR;

  // The design day is the day with the highest *daily mean*, not the day the
  // annual peak happens to fall on. For an energy-limited battery the binding
  // case is a long hot spell it cannot recharge through, and that day can sit
  // several MW above the peak day's average while never touching the peak.
  let worstDay = 0, worstMean = -1;
  for (let d = 0; d < 365; d++) {
    let s = 0;
    for (let h = 0; h < 24; h++) s += shape[d * 24 + h];
    if (s > worstMean) { worstMean = s; worstDay = d; }
  }
  const designDay = [];
  for (let h = 0; h < 24; h++) designDay.push(shape[worstDay * 24 + h] / inputs.facilityPeakMW);
  const designDayMeanFrac = worstMean / 24 / inputs.facilityPeakMW;
  const peakFrac = peak / inputs.facilityPeakMW;

  // Solar AC output per MWdc installed, one TMY year.
  const solarPerMWdc = new Float32Array(HOURS_PER_YEAR);
  for (let i = 0; i < HOURS_PER_YEAR; i++) {
    const g = poa(tmy, i, SOLAR.tiltDeg, SOLAR.azimuthDeg);
    if (g <= 0) continue;
    const tCell = tmy.temp[i] + ((SOLAR.noct - 20) / 800) * g;
    const dc = (g / 1000) * (1 + SOLAR.tempCoeffPerC * (tCell - 25)) * (1 - SOLAR.systemLossFrac);
    solarPerMWdc[i] = Math.max(0, Math.min(dc, 1 / SOLAR.dcAcRatio));
  }

  const screen = screenBackup({
    facilityPeakMW: inputs.facilityPeakMW, mwIT,
    presetKey: inputs.workloadPreset, fin: FINANCE,
  });

  return {
    tmy, util, mwIT, pueDesign, tDesignC, shape, designDay, designDayMeanFrac, peakFrac,
    solarPerMWdc, screen, worstDay,
    simulatedPeakMW: peak, simulatedMeanMW: mean, loadFactor: mean / peak,
    annualPOAkWh: (() => { let s = 0; for (let i = 0; i < HOURS_PER_YEAR; i++) s += poa(tmy, i, SOLAR.tiltDeg, SOLAR.azimuthDeg); return s / 1000; })(),
  };
}

/** Deterministic stress-event calendar (§4.5). */
export function buildEvents(inputs) {
  const r = rng(inputs.seed ^ 0x1f2e3d4c);
  const gridOut = new Uint8Array(HOURS);
  const gasOut = new Uint8Array(HOURS);
  const dieselTest = new Uint8Array(HOURS);
  const eventHour = new Uint8Array(HOURS);
  const log = [];

  for (let y = 0; y < HORIZON_YEARS; y++) {
    const base = y * HOURS_PER_YEAR;
    // Grid outage — winter or summer storm, afternoon.
    for (let k = 0; k < STRESS.gridOutagesPerYear; k++) {
      const doy = 8 + Math.floor(r() * 40) + (k % 2 === 0 ? 0 : 180);
      const start = base + doy * 24 + 14;
      for (let h = 0; h < STRESS.gridOutageHours; h++) { gridOut[start + h] = 1; eventHour[start + h] = h; }
      log.push({ year: y, kind: 'Grid outage', doy, hours: STRESS.gridOutageHours });
    }
    // PJM curtailment — hottest summer afternoons.
    for (let k = 0; k < STRESS.curtailmentsPerYear; k++) {
      const doy = 190 + k * 14 + Math.floor(r() * 6);
      const start = base + doy * 24 + 14;
      for (let h = 0; h < STRESS.curtailmentHours; h++) { gridOut[start + h] = 1; eventHour[start + h] = h; }
      log.push({ year: y, kind: 'PJM curtailment', doy, hours: STRESS.curtailmentHours });
    }
    // Gas supply interruption — the bridge-phase equivalent (§4.5).
    for (let k = 0; k < STRESS.gasInterruptionsPerYear; k++) {
      const doy = 15 + Math.floor(r() * 25);
      const start = base + doy * 24 + 6;
      for (let h = 0; h < STRESS.gasInterruptionHours; h++) { gasOut[start + h] = 1; eventHour[start + h] = h; }
      log.push({ year: y, kind: 'Gas interruption', doy, hours: STRESS.gasInterruptionHours });
    }
    // Monthly load-bank test, first Tuesday-ish, mid-morning.
    for (let mo = 0; mo < 12; mo++) {
      let doy = 0;
      for (let i = 0; i < mo; i++) doy += DAYS_IN_MONTH[i];
      const start = base + (doy + 3) * 24 + 10;
      for (let h = 0; h < DF_BACKUP.testing.hrsPerMonth; h++) dieselTest[start + h] = 1;
    }
  }
  return { gridOut, gasOut, dieselTest, eventHour, log };
}

/** Run one scenario across the horizon. */
export function runScenario(scenarioKey, inputs, derived, events) {
  const life = buildLifecycle(scenarioKey, inputs, derived);
  const preset = PRESETS[inputs.workloadPreset];
  const capex = capexEvents(life);
  const capexByMonth = new Float64Array(HORIZON_MONTHS);
  const capexItems = {};
  for (const c of capex) {
    capexByMonth[c.month] += c.amount;
    capexItems[c.item] = (capexItems[c.item] || 0) + c.amount;
  }

  const state = { socMWh: 0, fecCount: 0 };
  let prevBessMWh = 0;
  const monthly = [];
  const summerHistory = [];
  const sampleDays = {};
  let sampleCount = 0;

  // The last full year at hourly resolution. 8,760 floats is small enough to
  // carry back to the UI and it is what the duration curve and the hour-by-month
  // heatmap are drawn from — both of which say things a monthly total cannot.
  const FINAL_YEAR_START = HORIZON_MONTHS - 12;
  const yearGrid = new Float32Array(HOURS_PER_YEAR);
  const yearLoad = new Float32Array(HOURS_PER_YEAR);
  const yearOnsite = new Float32Array(HOURS_PER_YEAR);
  let yearIdx = 0;

  // Per-day scratch buffers, reused across all 5,475 days.
  const flowBuffer = makeFlowBuffer(24);
  const costRecord = makeCostRecord();
  const load = new Float64Array(24), solar = new Float64Array(24), gridLimit = new Float64Array(24);
  const evGrid = new Uint8Array(24), evGas = new Uint8Array(24), evTest = new Uint8Array(24), evHour = new Uint8Array(24);

  // The problem object is built once and mutated. Rebuilding it — eight nested
  // literals — for each of the 5,475 simulated days cost more than solving them.
  const rte = Math.sqrt(BESS.rte);
  const problem = {
    hours: 24, load, solar, gridLimit, buffer: flowBuffer,
    islanded: false, gasAvailable: false,
    events: { gridOut: evGrid, gasOut: evGas, dieselTest: evTest, eventHour: evHour },
    assets: {
      gas: { units: 0, unit: NG_BRIDGE },
      diesel: { units: 0, unit: DF_BACKUP },
      bess: { powerMW: 0, energyMWh: 0, socMin: BESS.socMin, socMax: BESS.socMax, rteCharge: rte, rteDischarge: rte },
    },
    reserve: {
      stepMarginFrac: preset.stepSwingFracIT * (derived.mwIT / inputs.facilityPeakMW),
      criticalFrac: preset.criticalFrac,
      shedWindowMin: preset.shedWindowMin,
      socFloorMWh: 0,
      islandReserveMWh: 0,
      dieselCountsAsReserve: inputs.dieselAsBridgeReserve,
    },
    prices: { gasPerMMBtu: 0, dieselPerMMBtu: 0 },
  };
  const islandReserveFull = (NG_BRIDGE.ratedKW / 1000) * (NG_BRIDGE.startTimeMin / 60);

  let hourIdx = 0;
  let dayIdx = 0;

  for (let m = 0; m < HORIZON_MONTHS; m++) {
    const cfg = life.months[m];
    const yearIndex = Math.floor(m / 12);
    const monthOfYear = m % 12;
    const bm = newBillingMonth();

    const agg = {
      month: m, year: yearIndex, itFrac: cfg.itFrac,
      gasFuel: 0, gasVarOM: 0, dieselFuel: 0, dieselVarOM: 0,
      gasFuelMMBtu: 0, dieselFuelMMBtu: 0,
      gasMWh: 0, dieselMWh: 0, dieselTestMWh: 0, gridMWh: 0, solarMWh: 0, bessOutMWh: 0, bessInMWh: 0,
      loadMWh: 0, unservedMWh: 0, shedMWh: 0, curtailedMWh: 0,
      gasRunHours: 0, dieselRunHours: 0, dieselEventHours: 0, reserveShortHours: 0,
      co2Tonnes: 0, peakLoadMW: 0, minSOCfrac: 1,
    };

    // A new battery block arrives commissioned and charged. Without this the
    // fleet, which is sized assuming the battery works, spends the first days
    // of each phase short — an artefact of the model, not of the design.
    if (cfg.bessMWh > prevBessMWh + 1e-9) {
      state.socMWh += (cfg.bessMWh - prevBessMWh) * BESS.socMax;
      prevBessMWh = cfg.bessMWh;
    } else if (cfg.bessMWh < prevBessMWh) {
      prevBessMWh = cfg.bessMWh;
      state.socMWh = Math.min(state.socMWh, cfg.bessMWh * BESS.socMax);
    }

    const days = DAYS_IN_MONTH[monthOfYear];
    const gasPrice = gasPriceIn(yearIndex);
    const dieselPrice = dieselPriceIn(yearIndex);

    // Everything the solver reads that changes with the calendar, updated once
    // a month rather than once a day.
    problem.islanded = cfg.gridLimitMW <= 0;
    problem.gasAvailable = cfg.gasUnits > 0 || cfg.gridAvailMW > 0;
    problem.assets.gas.units = cfg.gasUnits;
    problem.assets.diesel.units = cfg.dieselUnits;
    problem.assets.bess.powerMW = cfg.bessMW;
    problem.assets.bess.energyMWh = cfg.bessMWh;
    problem.reserve.socFloorMWh = derived.screen.reservedEnergyMWh * cfg.itFrac;
    problem.reserve.islandReserveMWh = cfg.gasUnits > 0 ? islandReserveFull : 0;
    problem.prices.gasPerMMBtu = gasPrice;
    problem.prices.dieselPerMMBtu = dieselPrice;
    const gridOn = cfg.gridAvailMW > 0, backupOn = cfg.gasUnits > 0 || cfg.dieselUnits > 0;
    const testOn = cfg.dieselUnits > 0, bessOn = cfg.bessMWh > 0;
    const itFrac = cfg.itFrac, solarCap = cfg.solarMWdc, gridCap = cfg.gridLimitMW;
    const shape = derived.shape, solarUnit = derived.solarPerMWdc;

    for (let d = 0; d < days; d++) {
      const tmyBase = (dayIdx % 365) * 24;
      let dayPeak = agg.peakLoadMW;
      for (let h = 0; h < 24; h++) {
        const ti = tmyBase + h;
        const L = shape[ti] * itFrac;
        load[h] = L;
        solar[h] = solarUnit[ti] * solarCap;
        gridLimit[h] = gridCap;
        const gi = hourIdx + h;
        // A grid outage only means something once the grid is there.
        evGrid[h] = gridOn ? events.gridOut[gi] : 0;
        evGas[h] = backupOn ? events.gasOut[gi] : 0;
        evTest[h] = testOn ? events.dieselTest[gi] : 0;
        evHour[h] = events.eventHour[gi];
        if (L > dayPeak) dayPeak = L;
      }
      agg.peakLoadMW = dayPeak;

      const flows = solveWindow(problem, state);
      const c = costOf(flows, problem, costRecord);

      agg.gasFuel += c.gasFuel; agg.gasVarOM += c.gasVarOM;
      agg.gasFuelMMBtu += c.gasFuelMMBtu + c.dieselGasMMBtu; agg.dieselFuelMMBtu += c.dieselFuelMMBtu;
      agg.dieselFuel += c.dieselFuel; agg.dieselVarOM += c.dieselVarOM;
      agg.gasMWh += c.gasMWh; agg.dieselMWh += c.dieselMWh; agg.dieselTestMWh += c.dieselTestMWh; agg.gridMWh += c.gridMWh;
      agg.solarMWh += c.solarMWh; agg.bessOutMWh += c.bessOutMWh; agg.bessInMWh += c.bessInMWh;
      agg.unservedMWh += c.unservedMWh; agg.shedMWh += c.shedMWh; agg.curtailedMWh += c.curtailedMWh;
      agg.gasRunHours += c.gasRunHours; agg.dieselRunHours += c.dieselRunHours;
      agg.reserveShortHours += c.reserveShortHours; agg.co2Tonnes += c.co2Tonnes;
      // The billing accumulator is inlined: this is the innermost loop in the
      // model, 525,600 iterations per scenario.
      let loadMWh = 0, kWh = 0, peakKW = bm.peakKW, dslH = 0, minSOC = agg.minSOCfrac;
      const keepYear = m >= FINAL_YEAR_START && yearIdx < HOURS_PER_YEAR;
      for (let h = 0; h < 24; h++) {
        const f = flows[h];
        loadMWh += f.load;
        const g = f.grid * 1000;
        kWh += g;
        if (g > peakKW) peakKW = g;
        if (bessOn) { const sf = f.soc / cfg.bessMWh; if (sf < minSOC) minSOC = sf; }
        if (f.diesel > 0) dslH++;
        if (keepYear) {
          yearGrid[yearIdx] = f.grid;
          yearLoad[yearIdx] = f.load;
          yearOnsite[yearIdx] = f.gas + f.solar + f.bessDischarge + f.diesel;
          yearIdx++;
        }
      }
      agg.loadMWh += loadMWh;
      agg.dieselEventHours += dslH;
      agg.minSOCfrac = minSOC;
      bm.kWh += kWh; bm.peakKW = peakKW; bm.hours += 24;

      // Keep a handful of days at full resolution for the dispatch chart.
      if (sampleCount < 4) sampleCount = captureSample(sampleDays, cfg, m, d, dayIdx, flows);
      hourIdx += 24;
      dayIdx += 1;
    }

    // ── Grid bill ───────────────────────────────────────────────────────────
    const contractedKW = cfg.contractedMW * 1000;
    const ratchet = ratchetFloor(summerHistory);
    const det = determinants(bm, contractedKW, ratchet);
    const bill = cfg.gridAvailMW > 0 ? billFor(det, yearIndex) : { demand: 0, energy: 0, customer: 0, total: 0, minimumChargeExcessKW: 0 };
    if (isSummer(monthOfYear) && cfg.gridAvailMW > 0) {
      summerHistory.push(det.meteredKW);
      if (summerHistory.length > 4) summerHistory.shift(); // 11-month trailing window
    }

    // ── Everything else the customer pays ───────────────────────────────────
    const rent = gasRentForMonth(cfg.gasUnits);
    const fixedOM = fixedOMForMonth(cfg);
    const capexM = capexByMonth[m];
    const opex = agg.gasFuel + agg.gasVarOM + agg.dieselFuel + agg.dieselVarOM + rent + fixedOM;
    const total = opex + bill.total + capexM;
    const revenue = cfg.revenueITMW * 1000 * FINANCE.itRevenuePerKWMoIT;

    monthly.push({
      ...agg, bill, det, rent, fixedOM, capex: capexM, opex, total, revenue,
      net: revenue - total,
      gasUnits: cfg.gasUnits, dieselUnits: cfg.dieselUnits,
      bessMW: cfg.bessMW, bessMWh: cfg.bessMWh, solarMWdc: cfg.solarMWdc,
      contractedMW: cfg.contractedMW, gridLimitMW: cfg.gridLimitMW,
      revenueITMW: cfg.revenueITMW,
    });
  }

  return summarize(scenarioKey, life, monthly, capexItems, derived, inputs, sampleDays,
    { grid: yearGrid, load: yearLoad, onsite: yearOnsite, hours: yearIdx });
}

/** Descending-sorted series, resampled to `points` — a load duration curve. */
function durationCurve(series, n, points = 180) {
  const copy = Array.prototype.slice.call(series, 0, n);
  copy.sort((a, b) => b - a);
  const out = [];
  for (let i = 0; i < points; i++) out.push(copy[Math.min(n - 1, Math.round((i / (points - 1)) * (n - 1)))]);
  return out;
}

/** Mean value by hour of day and month of year — a 12 x 24 grid. */
function hourMonthGrid(series, n) {
  const sum = [], count = [];
  for (let mo = 0; mo < 12; mo++) { sum.push(new Float64Array(24)); count.push(new Float64Array(24)); }
  for (let i = 0; i < n; i++) {
    const mo = monthOfDay(Math.floor(i / 24));
    const h = i % 24;
    sum[mo][h] += series[i];
    count[mo][h] += 1;
  }
  return sum.map((row, mo) => Array.from(row, (v, h) => (count[mo][h] ? v / count[mo][h] : 0)));
}

/** Keeps one day of each interesting kind at full resolution, and returns how
 *  many kinds have been found so the caller can stop asking. */
function captureSample(store, cfg, month, day, dayIdx, flows) {
  const doy = dayIdx % 365;
  const island = cfg.gasUnits > 0 && cfg.gridLimitMW <= 0 && cfg.itFrac >= 0.5;
  const gridFull = cfg.gridLimitMW > 0 && cfg.itFrac === 1;
  let ranBackup = -1;
  const backupRan = () => {
    if (ranBackup < 0) {
      ranBackup = 0;
      for (let h = 0; h < flows.length; h++) if (flows[h].diesel > 0) { ranBackup = 1; break; }
    }
    return ranBackup === 1;
  };

  const take = (key, ok) => {
    if (!ok || store[key]) return;
    const copy = [];
    for (let h = 0; h < flows.length; h++) copy.push({ ...flows[h] });
    store[key] = { month, day, dayOfYear: doy, flows: copy, cfg: { ...cfg } };
  };

  if (!store['bridge-summer']) take('bridge-summer', island && doy > 190 && doy < 210);
  if (!store['bridge-event']) take('bridge-event', island && backupRan());
  if (!store['grid-summer']) take('grid-summer', gridFull && doy > 195 && doy < 215);
  if (!store['grid-outage']) take('grid-outage', gridFull && backupRan());

  let n = 0;
  for (const k of ['bridge-summer', 'bridge-event', 'grid-summer', 'grid-outage']) if (store[k]) n++;
  return n;
}

function summarize(key, life, monthly, capexItems, derived, inputs, sampleDays, finalYear) {
  const disc = Math.pow(1 + FINANCE.discountRatePct / 100, 1 / 12);
  let npvCost = 0, npvNet = 0, cum = 0;
  const cumulative = [], annual = [];

  let tot = { total: 0, revenue: 0, loadMWh: 0, gridMWh: 0, gasMWh: 0, solarMWh: 0,
    dieselMWh: 0, dieselTestMWh: 0, bessOutMWh: 0, unservedMWh: 0, shedMWh: 0, co2Tonnes: 0,
    gasFuel: 0, gasVarOM: 0, dieselFuel: 0, dieselVarOM: 0, rent: 0, fixedOM: 0,
    gasFuelMMBtu: 0, dieselFuelMMBtu: 0,
    capex: 0, gridBill: 0, gasRunHours: 0, dieselRunHours: 0, dieselEventHours: 0,
    reserveShortHours: 0, itMWMonths: 0, gasUnitMonths: 0 };

  for (let i = 0; i < monthly.length; i++) {
    const m = monthly[i];
    const df = Math.pow(disc, -(i + 1));
    npvCost += m.total * df;
    npvNet += m.net * df;
    cum += m.net;
    cumulative.push(cum);
    tot.total += m.total; tot.revenue += m.revenue; tot.loadMWh += m.loadMWh;
    tot.gridMWh += m.gridMWh; tot.gasMWh += m.gasMWh; tot.solarMWh += m.solarMWh;
    tot.dieselMWh += m.dieselMWh; tot.dieselTestMWh += m.dieselTestMWh; tot.bessOutMWh += m.bessOutMWh;
    tot.unservedMWh += m.unservedMWh; tot.shedMWh += m.shedMWh; tot.co2Tonnes += m.co2Tonnes;
    tot.gasFuel += m.gasFuel; tot.gasVarOM += m.gasVarOM;
    tot.gasFuelMMBtu += m.gasFuelMMBtu; tot.dieselFuelMMBtu += m.dieselFuelMMBtu;
    tot.dieselFuel += m.dieselFuel; tot.dieselVarOM += m.dieselVarOM;
    tot.rent += m.rent; tot.fixedOM += m.fixedOM; tot.capex += m.capex;
    tot.gridBill += m.bill.total; tot.gasRunHours += m.gasRunHours;
    tot.dieselRunHours += m.dieselRunHours; tot.dieselEventHours += m.dieselEventHours;
    tot.reserveShortHours += m.reserveShortHours;
    tot.itMWMonths += m.revenueITMW; tot.gasUnitMonths += m.gasUnits;

    if (i % 12 === 11) {
      const slice = monthly.slice(i - 11, i + 1);
      const s = (f) => slice.reduce((a, x) => a + f(x), 0);
      const mwh = s((x) => x.loadMWh);
      annual.push({
        year: Math.floor(i / 12) + 1,
        cost: s((x) => x.total), revenue: s((x) => x.revenue),
        loadMWh: mwh, gridMWh: s((x) => x.gridMWh), gasMWh: s((x) => x.gasMWh),
        solarMWh: s((x) => x.solarMWh), dieselMWh: s((x) => x.dieselMWh),
        perMWh: mwh > 0 ? s((x) => x.total) / mwh : 0,
        co2Tonnes: s((x) => x.co2Tonnes),
        dieselEventHours: s((x) => x.dieselEventHours),
        peakMW: Math.max(...slice.map((x) => x.peakLoadMW)),
        gridPeakKW: Math.max(...slice.map((x) => x.det.meteredKW)),
      });
    }
  }

  const full = life.months[life.months.length - 1];
  const n = finalYear.hours;
  return {
    key, life, monthly, annual, cumulative, capexItems, sampleDays,
    finalYear: {
      hours: n,
      gridDuration: durationCurve(finalYear.grid, n),
      loadDuration: durationCurve(finalYear.load, n),
      onsiteDuration: durationCurve(finalYear.onsite, n),
      gridHourMonth: hourMonthGrid(finalYear.grid, n),
      gridPeak: n ? Math.max(...Array.prototype.slice.call(finalYear.grid, 0, n)) : 0,
    },
    totals: tot,
    npvCost, npvNet,
    blendedPerMWh: tot.loadMWh > 0 ? tot.total / tot.loadMWh : 0,
    gridSharePct: tot.loadMWh > 0 ? (100 * tot.gridMWh) / (tot.gridMWh + tot.gasMWh + tot.solarMWh + tot.dieselMWh) : 0,
    solarSharePct: tot.loadMWh > 0 ? (100 * tot.solarMWh) / (tot.gridMWh + tot.gasMWh + tot.solarMWh + tot.dieselMWh) : 0,
    firstPowerMonth: life.firstPower,
    contractedFrac: full.contractedMW / inputs.facilityPeakMW,
    peakGasUnits: Math.max(...monthly.map((m) => m.gasUnits)),
    gasUnitMonths: tot.gasUnitMonths,
    redeployMonth: life.demobilizationMonth,
  };
}

/** Run everything. Returns the four scenarios plus the shared context. */
export function runAll(inputs) {
  const derived = buildDerived(inputs);
  const events = buildEvents(inputs);
  const results = {};
  for (const s of SCENARIOS) results[s.key] = runScenario(s.key, inputs, derived, events);
  return { inputs, derived, events, results, checks: sizingChecks(inputs, derived, results) };
}

/** §4.6 sizing checks, evaluated against the hybrid scenario at full build. */
export function sizingChecks(inputs, derived, results) {
  const h = results.hybrid;
  const full = h.life.months[h.life.months.length - 1];
  const preset = PRESETS[inputs.workloadPreset];
  const bridgeMonth = h.life.months[h.life.firstPower + 1];

  const blockAccept = bridgeMonth.gasUnits * (NG_BRIDGE.ratedKW / 1000) * NG_BRIDGE.blockLoadAcceptFrac;
  const stepMW = preset.stepSwingFracIT * derived.mwIT * bridgeMonth.itFrac;

  const dieselInstalledKW = full.dieselUnits * DF_BACKUP.ratedKW;
  // Tank sized for 48 h at full backup load; at the critical floor it lasts longer.
  const tankMMBtu = (dieselInstalledKW * 9400 * DF_BACKUP.onSiteDieselHours) / 1e6;
  const criticalKW = preset.criticalFrac * inputs.facilityPeakMW * 1000;
  const tankHoursAtCritical = criticalKW > 0 ? tankMMBtu / ((criticalKW * 9400) / 1e6) : Infinity;
  const longestEvent = Math.max(STRESS.gridOutageHours, STRESS.curtailmentHours, STRESS.gasInterruptionHours);

  const permitHours = h.annual.length ? Math.max(...h.annual.map((a) => a.dieselEventHours)) : 0;
  const eolHealth = 1 - (BESS.degradation.calendarPctYr / 100) * (HORIZON_YEARS - h.life.firstPower / 12);
  const eolEnergy = full.bessMW * inputs.bessHours * eolHealth;

  return [
    {
      id: 'transient',
      label: 'Transient: battery power + online block-load acceptance ≥ step swing',
      value: `${(bridgeMonth.bessMW + blockAccept).toFixed(1)} MW available vs ${stepMW.toFixed(1)} MW step`,
      pass: bridgeMonth.bessMW + blockAccept >= stepMW,
    },
    {
      id: 'unserved',
      label: 'Zero unserved energy across the horizon',
      value: h.totals.unservedMWh < 0.5 ? 'none' : `${h.totals.unservedMWh.toFixed(1)} MWh unserved`,
      pass: h.totals.unservedMWh < 0.5,
    },
    {
      id: 'reserve',
      label: 'Island reserve met in every islanded hour',
      value: h.totals.reserveShortHours === 0 ? 'met' : `${h.totals.reserveShortHours} hours short`,
      pass: h.totals.reserveShortHours === 0,
    },
    {
      id: 'permit',
      label: `Backup run-hours within the ${DF_BACKUP.permit.nonEmergencyHrCap} h non-emergency permit cap`,
      value: `${permitHours} h in the worst year`,
      pass: permitHours <= DF_BACKUP.permit.nonEmergencyHrCap,
      note: permitHours > DF_BACKUP.permit.nonEmergencyHrCap
        ? 'Curtailment run-hours exceed the cap unless the events are classified as emergencies. The model shows the gap rather than assuming it away (§4.5).'
        : null,
    },
    {
      id: 'tank',
      label: 'On-site diesel ≥ the longest stress event',
      value: `${tankHoursAtCritical === Infinity ? '∞' : tankHoursAtCritical.toFixed(0)} h at the critical floor vs a ${longestEvent} h event`,
      pass: tankHoursAtCritical >= longestEvent,
    },
    {
      id: 'eol',
      label: 'End-of-life battery capacity still covers the reserve floor',
      value: `${eolEnergy.toFixed(0)} MWh at year ${HORIZON_YEARS} vs a ${derived.screen.reservedEnergyMWh.toFixed(1)} MWh floor`,
      pass: eolEnergy >= derived.screen.reservedEnergyMWh,
    },
    {
      id: 'screen',
      label: 'Installed battery meets the §10 screening minimum',
      value: `${full.bessMW.toFixed(0)} MW / ${(full.bessMW * inputs.bessHours).toFixed(0)} MWh vs a ${derived.screen.bessPowerMW.toFixed(0)} MW / ${derived.screen.bessEnergyMWh.toFixed(0)} MWh minimum`,
      pass: full.bessMW >= derived.screen.bessPowerMW - 0.01
        && full.bessMW * inputs.bessHours >= derived.screen.bessEnergyMWh - 0.01,
    },
  ];
}

/**
 * §6 tradeoff sweep. A flat, high-load-factor site cannot cut contracted demand
 * far on the battery alone — above-contract load is sustained for hours, not
 * minutes — so the sweep varies contracted MW and retained gas MW *together*.
 * One representative full-build year, post-energization, annualized.
 */
export function runSweep(inputs, derived, events, contractPcts, retainedMWs) {
  const preset = PRESETS[inputs.workloadPreset];
  const probeMonth = Math.min(HORIZON_MONTHS - 1, inputs.gridEnergizationMonth + 60);
  const points = [];

  const load = new Float64Array(24), solar = new Float64Array(24), gridLimit = new Float64Array(24);
  const evGrid = new Uint8Array(24), evGas = new Uint8Array(24), evTest = new Uint8Array(24), evHour = new Uint8Array(24);

  for (const pct of contractPcts) {
    for (const rmw of retainedMWs) {
      const life = buildLifecycle('retained', { ...inputs, contractedDemandPct: pct, retainedGasMW: rmw }, derived);
      const cfg = life.months[probeMonth];
      const state = { socMWh: cfg.bessMWh * BESS.socMax, fecCount: 0 };
      const yearIndex = Math.floor(probeMonth / 12);
      const gasPrice = gasPriceIn(yearIndex), dieselPrice = dieselPriceIn(yearIndex);

      let cost = 0, mwh = 0, gridMWh = 0, unserved = 0, gasMWh = 0;
      let dayIdx = 0;

      for (let mo = 0; mo < 12; mo++) {
        const bm = newBillingMonth();
        for (let d = 0; d < DAYS_IN_MONTH[mo]; d++) {
          const tb = (dayIdx % 365) * 24;
          for (let h = 0; h < 24; h++) {
            load[h] = derived.shape[tb + h];
            solar[h] = derived.solarPerMWdc[tb + h] * cfg.solarMWdc;
            gridLimit[h] = cfg.gridLimitMW;
            const gi = (yearIndex * HOURS_PER_YEAR + (dayIdx % 365) * 24 + h) % (HORIZON_YEARS * HOURS_PER_YEAR);
            evGrid[h] = events.gridOut[gi]; evGas[h] = 0;
            evTest[h] = events.dieselTest[gi]; evHour[h] = events.eventHour[gi];
          }
          const problem = {
            hours: 24, load, solar, gridLimit,
            islanded: cfg.gridLimitMW <= 0, gasAvailable: true,
            events: { gridOut: evGrid, gasOut: evGas, dieselTest: evTest, eventHour: evHour },
            assets: {
              gas: { units: cfg.gasUnits, unit: NG_BRIDGE },
              diesel: { units: cfg.dieselUnits, unit: DF_BACKUP },
              bess: { powerMW: cfg.bessMW, energyMWh: cfg.bessMWh, socMin: BESS.socMin, socMax: BESS.socMax,
                rteCharge: Math.sqrt(BESS.rte), rteDischarge: Math.sqrt(BESS.rte) },
            },
            reserve: {
              stepMarginFrac: preset.stepSwingFracIT * (derived.mwIT / inputs.facilityPeakMW),
              criticalFrac: preset.criticalFrac, shedWindowMin: preset.shedWindowMin,
              socFloorMWh: derived.screen.reservedEnergyMWh,
              islandReserveMWh: cfg.gasUnits > 0 ? (NG_BRIDGE.ratedKW / 1000) * (NG_BRIDGE.startTimeMin / 60) : 0,
              dieselCountsAsReserve: inputs.dieselAsBridgeReserve,
            },
            prices: { gasPerMMBtu: gasPrice, dieselPerMMBtu: dieselPrice },
          };
          const flows = solveWindow(problem, state);
          const c = costOf(flows, problem);
          cost += c.gasFuel + c.gasVarOM + c.dieselFuel + c.dieselVarOM;
          gasMWh += c.gasMWh; gridMWh += c.gridMWh; unserved += c.unservedMWh;
          for (const f of flows) { mwh += f.load; addHour(bm, f.grid); }
          dayIdx++;
        }
        const det = determinants(bm, cfg.contractedMW * 1000, TARIFF.summerRatchetFrac * bm.peakKW);
        cost += billFor(det, yearIndex).total;
        cost += gasRentForMonth(cfg.gasUnits) + fixedOMForMonth(cfg);
      }
      points.push({
        contractPct: pct, retainedMW: rmw,
        contractedMW: cfg.contractedMW,
        annualCost: cost, perMWh: cost / mwh,
        gridSharePct: (100 * gridMWh) / Math.max(1e-9, mwh),
        unservedMWh: unserved, gasMWh,
      });
    }
  }
  return points;
}

/** Monthly weather, reduced for the assumptions panel. */
export function weatherSummary(derived) {
  const t = derived.tmy;
  const rows = [];
  for (let mo = 0; mo < 12; mo++) rows.push({ month: mo, tMin: 99, tMax: -99, tSum: 0, ghi: 0, poaSum: 0, n: 0 });
  for (let doy = 0; doy < 365; doy++) {
    const r = rows[monthOfDay(doy)];
    for (let h = 0; h < 24; h++) {
      const i = doy * 24 + h;
      const T = t.temp[i];
      if (T < r.tMin) r.tMin = T;
      if (T > r.tMax) r.tMax = T;
      r.tSum += T; r.n++;
      r.ghi += t.ghi[i] / 1000;
      r.poaSum += poa(t, i, SOLAR.tiltDeg, SOLAR.azimuthDeg) / 1000;
    }
  }
  return rows.map((r) => ({
    month: r.month, tMin: r.tMin, tMax: r.tMax, tMean: r.tSum / r.n,
    ghiKWh: r.ghi, poaKWh: r.poaSum,
  }));
}

/** §4.5 insurance panel — what the backup fleet costs, against what it avoids. */
export function insurancePanel(inputs, derived, results) {
  const h = results.hybrid;
  const full = h.life.months[h.life.months.length - 1];
  const kW = full.dieselUnits * DF_BACKUP.ratedKW;
  const premium =
    kW * DF_BACKUP.capexPerKW * crf(FINANCE.discountRatePct / 100, DF_BACKUP.lifeYears) +
    kW * (DF_BACKUP.fixedOMPerKWYr + DF_BACKUP.permitCompliancePerKWYr) +
    (h.totals.dieselFuel + h.totals.dieselVarOM) / HORIZON_YEARS;

  const outageValue = STRESS.gridOutagesPerYear * FINANCE.outageCostPerEvent;
  // Energy the backup fleet actually served during events — testing excluded,
  // since a load bank avoids nothing.
  const carriedMWh = h.totals.dieselMWh / HORIZON_YEARS;
  const curtailValue = carriedMWh * FINANCE.valueOfLostLoadPerMWh;
  const avoided = outageValue + curtailValue;

  return {
    installedMW: kW / 1000,
    premium, outageValue, curtailValue, avoided,
    ratio: avoided / premium,
    breakEvenOutagesPerYear: Math.max(0, (premium - curtailValue) / FINANCE.outageCostPerEvent),
    carriedMWh,
    bridgeNote:
      'During the bridge the same fleet covers a gas supply interruption or a multi-unit trip while the site is islanded — cover the grid-only case does not price.',
  };
}

export { SCENARIOS, HORIZON_MONTHS, HORIZON_YEARS };
