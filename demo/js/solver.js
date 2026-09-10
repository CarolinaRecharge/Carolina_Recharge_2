// §9 — LP-readiness.
//
// Dispatch lives behind one interface, `solveWindow(problem, state) → flows[]`.
// The heuristic below is one implementation of it. A future LP is another: it
// consumes the same `problem` object and its output is scored by the same
// `costOf()` in cost.js, so the two are directly comparable. Nothing in this
// file touches the DOM or knows a UI exists.

import { clamp, curve } from './util.js';
import { shaveThreshold } from './sizing.js';

/**
 * @param problem — one day: load, solar, grid limits, asset parameters, events
 * @param state   — carried across windows: { socMWh, fecCount }
 * @returns flows[24], one record per hour
 */
export function solveWindow(problem, state) {
  const H = problem.hours;
  const { assets, reserve, events } = problem;
  const gas = assets.gas, bess = assets.bess, diesel = assets.diesel;

  const gasUnitCapMW = (gas.unit.ratedKW / 1000) * gas.unit.maxContinuousFrac;
  const gasUnitMinMW = (gas.unit.ratedKW / 1000) * gas.unit.minLoadFrac;
  const dieselUnitCapMW = diesel.unit.ratedKW / 1000;
  const gasFleetCapMW = gas.units * gasUnitCapMW;

  // ── Pass 1: what each hour needs after solar and grid ─────────────────────
  //
  // Two series, deliberately. The *planned* one ignores outages, because the
  // plan is made before the outage happens; the outage is handled by the event
  // override inside the hour loop. Folding an outage into the plan would make a
  // grid-connected day with a six-hour curtailment in it look like an islanded
  // day, and the battery would then charge at full power from the grid to get
  // ready for an island that is not coming — setting the very demand peak it is
  // on site to shave.
  const solarUsed = new Float64Array(H);
  const gridPlanned = new Float64Array(H);
  const residual = new Float64Array(H);

  for (let h = 0; h < H; h++) {
    const L = problem.load[h];
    const s = Math.min(problem.solar[h], L);
    solarUsed[h] = s;
    gridPlanned[h] = Math.min(L - s, problem.gridLimit[h]);
    residual[h] = L - s - gridPlanned[h];
  }

  // ── Pass 2: the daily battery plan ────────────────────────────────────────
  // Aim the battery at whichever resource is scarce today. When something is
  // left over after grid and solar, the battery displaces gas or diesel; when
  // the grid covers the day, it shaves billed demand instead. Either way the
  // plan is one number — a threshold the day is flattened to — and charging is
  // capped at that same threshold, so refilling the battery can never create
  // the peak the battery exists to remove.
  let residualTotal = 0;
  for (let h = 0; h < H; h++) residualTotal += residual[h];
  const islandDay = residualTotal > 0.01;
  const target = islandDay ? residual : gridPlanned;

  const socCap = bess.energyMWh * bess.socMax;
  const socHardMin = bess.energyMWh * bess.socMin;
  // §10's dual-use rule: the reserved energy is off limits to peak shaving and
  // gas decommitment, which is what socBottom governs. It is emphatically not
  // off limits during an event — being spent then is the whole reason it is
  // held — so an event discharges against socHardMin instead, and the reserve
  // credit offered to the gas commitment counts it too.
  const socBottom = Math.max(
    socHardMin,
    Math.min(reserve.socFloorMWh + reserve.islandReserveMWh, bess.energyMWh * 0.9)
  );

  let soc = clamp(state.socMWh, 0, socCap);
  const dischargeBudget = Math.max(0, soc - socBottom) * bess.rteDischarge;
  const threshold = bess.powerMW > 0 && bess.energyMWh > 0
    ? shaveThreshold(target, dischargeBudget, bess.powerMW)
    : Infinity;
  // Refilling is capped at the lower of the shave threshold and the day's own
  // peak. Without the second term a battery that came out of an outage empty
  // would recharge hard the next morning and set the demand ratchet itself —
  // the one thing it is on site to prevent.
  let targetPeak = 0;
  for (let h = 0; h < H; h++) if (target[h] > targetPeak) targetPeak = target[h];
  const chargeCeiling = Math.min(threshold, targetPeak);

  const flows = [];
  let fec = state.fecCount || 0;

  for (let h = 0; h < H; h++) {
    const L = problem.load[h];
    const f = {
      hour: h, load: L,
      solar: solarUsed[h], solarCurtail: Math.max(0, problem.solar[h] - solarUsed[h]),
      grid: 0, gas: 0, gasUnits: 0, gasFuelMMBtu: 0, gasRunHours: 0,
      bessCharge: 0, bessDischarge: 0, soc,
      diesel: 0, dieselUnits: 0, dieselTestMW: 0, dieselFuelMMBtu: 0, dieselGasMMBtu: 0, dieselRunHours: 0,
      unserved: 0, shed: 0, reserveShortfall: 0, curtailedEnergy: 0,
    };

    const outage = events.gridOut[h] === 1;
    const gasOut = events.gasOut[h] === 1;
    const gasLost = gasOut && gas.units > 0;
    const inEvent = (outage && problem.gridLimit[h] > 0) || gasLost;

    // Load that must be served this hour. Inside a long event, presets with a
    // shed window drop to their critical fraction once the window has elapsed.
    // The shed window is minutes long and the timestep is an hour, so the hour
    // the window expires in is split pro-rata rather than counted whole either
    // way. Rounding it up would invent unserved energy; rounding it down would
    // hide the exposure the window is there to measure.
    let mustServe = L;
    if (inEvent && reserve.criticalFrac < 1 && reserve.shedWindowMin != null) {
      const minutesIn = events.eventHour[h] * 60;
      const atFull = clamp((reserve.shedWindowMin - minutesIn) / 60, 0, 1);
      mustServe = L * atFull + L * reserve.criticalFrac * (1 - atFull);
      f.shed = L - mustServe;
    }

    let need = Math.max(0, mustServe - f.solar);

    // ── 3. Battery, per the plan ────────────────────────────────────────────
    let chargeWant = 0;
    if (bess.powerMW > 0 && bess.energyMWh > 0) {
      const room = Math.max(0, soc - (inEvent ? socHardMin : socBottom));
      const x = islandDay ? residual[h] : Math.min(need, problem.gridLimit[h]);
      // §4.2: in an event the battery covers what the backup fleet cannot, not
      // the whole load. Diesel starts in ten seconds; draining a full battery
      // behind a fleet that could have carried the event leaves the site with
      // nothing when the grid returns, and the recovery hour then sets the
      // demand ratchet. D10's "keep diesel mild" is about run-hours, not about
      // making the battery do the fleet's job.
      const wantDischarge = inEvent
        ? Math.max(0, need - diesel.units * dieselUnitCapMW)
        : Math.max(0, x - threshold);
      const out = Math.min(bess.powerMW, wantDischarge, room * bess.rteDischarge);
      if (out > 0.0001) {
        f.bessDischarge = out;
        soc -= out / bess.rteDischarge;
        need -= out;
        fec += out / Math.max(1e-9, bess.energyMWh);
      } else if (!inEvent && soc < socCap && isFinite(threshold)) {
        // Refill, but never above the threshold the day is being flattened to.
        chargeWant = Math.min(
          bess.powerMW,
          (socCap - soc) / bess.rteCharge,
          Math.max(0, chargeCeiling - x)
        );
      }
    }

    // Everything that has to be produced this hour, load plus refill.
    let supply = need + chargeWant;

    // ── Grid, up to gridLimit ───────────────────────────────────────────────
    const gridCap = outage ? 0 : problem.gridLimit[h];
    const fromGrid = Math.min(supply, gridCap);
    f.grid = fromGrid;
    supply -= fromGrid;

    // ── 4. Gas commitment, with the battery's remaining power as reserve ────
    if (gas.units > 0 && !gasOut && supply > 0.0001) {
      let units = Math.min(gas.units, Math.max(1, Math.ceil(supply / gasUnitCapMW)));
      const resReq = Math.max(gasUnitCapMW, reserve.stepMarginFrac * L);
      const bessReserve = Math.min(
        bess.powerMW - f.bessDischarge,
        Math.max(0, soc - socHardMin) * bess.rteDischarge
      );
      const dieselReserve = reserve.dieselCountsAsReserve ? diesel.units * dieselUnitCapMW : 0;
      const served = Math.min(supply, gasFleetCapMW);
      while (units * gasUnitCapMW - served + bessReserve + dieselReserve < resReq && units < gas.units) units++;
      const spinning = units * gasUnitCapMW - served;
      if (spinning + bessReserve + dieselReserve < resReq - 1e-6) {
        f.reserveShortfall = resReq - (spinning + bessReserve + dieselReserve);
      }

      const minOut = units * gasUnitMinMW;
      const out = clamp(served, minOut, units * gasUnitCapMW);
      f.gas = out;
      f.gasUnits = units;
      f.gasRunHours = units;
      const perUnitFrac = clamp(out / (units * (gas.unit.ratedKW / 1000)), 0.05, 1);
      f.gasFuelMMBtu = (out * 1000 * curve(gas.unit.heatRateCurve, perUnitFrac)) / 1e6;
      supply -= Math.min(out, supply);

      // Gas held above its minimum load spills into the battery, then curtails.
      const spill = out - served;
      if (spill > 0.0001) {
        const room = Math.max(0, socCap - soc);
        const take = Math.min(bess.powerMW - f.bessCharge, spill, room / bess.rteCharge);
        if (take > 0) { f.bessCharge += take; soc += take * bess.rteCharge; }
        f.curtailedEnergy += spill - Math.max(0, take);
      }
    }

    // If the day still cannot cover the refill, drop the refill first.
    if (supply > 0.0001 && chargeWant > 0) {
      const back = Math.min(chargeWant, supply);
      chargeWant -= back;
      supply -= back;
    }
    if (chargeWant > 0.0001) {
      f.bessCharge += chargeWant;
      soc += chargeWant * bess.rteCharge;
    }

    // ── Backup: outages, gas interruptions, curtailment, monthly testing ────
    if (diesel.units > 0) {
      if (inEvent && supply > 0.0001) {
        const out = Math.min(supply, diesel.units * dieselUnitCapMW);
        f.diesel = out;
        f.dieselUnits = Math.min(diesel.units, Math.ceil(out / dieselUnitCapMW));
        f.dieselRunHours = f.dieselUnits;
        supply -= out;
      } else if (events.dieselTest[h] === 1) {
        f.dieselTestMW = diesel.units * dieselUnitCapMW * diesel.unit.testing.loadFrac;
        f.dieselUnits = diesel.units;
        f.dieselRunHours = diesel.units;
      }
      const totalOut = f.diesel + f.dieselTestMW;
      if (totalOut > 0) {
        const frac = clamp(totalOut / Math.max(1e-9, f.dieselUnits * dieselUnitCapMW), 0.05, 1);
        const btu = (totalOut * 1000 * curve(diesel.unit.dieselHeatRateCurve, frac)) / 1e6;
        // Dual-fuel: gas substitutes up to its limit whenever gas is flowing.
        const gasShare = gasOut || !problem.gasAvailable ? 0 : diesel.unit.gasSubstitutionMaxFrac;
        f.dieselGasMMBtu = btu * gasShare;
        f.dieselFuelMMBtu = btu * (1 - gasShare);
      }
    }

    // ── 5. Surplus solar to the battery, then curtailment ───────────────────
    if (f.solarCurtail > 0 && bess.powerMW > 0) {
      const room = Math.max(0, socCap - soc);
      const take = Math.min(bess.powerMW - f.bessCharge, f.solarCurtail, room / bess.rteCharge);
      if (take > 0) {
        f.bessCharge += take;
        f.solarCurtail -= take;
        soc += take * bess.rteCharge;
      }
    }

    // ── 6. Anything still short is unserved, and says so ────────────────────
    f.unserved = Math.max(0, supply);
    f.soc = soc;
    flows.push(f);
  }

  state.socMWh = soc;
  state.fecCount = fec;
  return flows;
}
