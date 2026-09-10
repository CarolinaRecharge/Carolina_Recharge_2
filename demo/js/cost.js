// §5 — the cost engine, customer view.
//
// `costOf(flows, problem)` is the shared scorer from §9: any solver's output
// goes through this one function, so the heuristic and a future LP are compared
// on identical terms. It returns only the costs that are proportional to the
// dispatch; monthly demand determinants come back alongside for the tariff, and
// capital and rent are layered on per month by the runner.

import { FUEL, NG_BRIDGE, DF_BACKUP, BESS, SOLAR, FINANCE } from './config.js';
import { crf } from './util.js';

/** Written as one literal for the same reason as the flow record — see solver.js. */
export function makeCostRecord() {
  return {
    gasFuel: 0, gasVarOM: 0, dieselFuel: 0, dieselVarOM: 0, gasFuelMMBtu: 0,
    dieselFuelMMBtu: 0, dieselGasMMBtu: 0, gasRunHours: 0, dieselRunHours: 0,
    gasMWh: 0, dieselMWh: 0, dieselTestMWh: 0, gridMWh: 0, solarMWh: 0,
    bessOutMWh: 0, bessInMWh: 0, unservedMWh: 0, shedMWh: 0, curtailedMWh: 0,
    reserveShortHours: 0, co2Tonnes: 0,
  };
}

/**
 * The shared scorer from §9. `out` is an optional reusable record — the horizon
 * calls this once per day per scenario, so the allocation matters more than the
 * arithmetic. Any solver's flows go through this one function, so a future LP
 * and the heuristic are scored on identical terms.
 */
export function costOf(flows, problem, out) {
  let gasFuelMMBtu = 0, gasRunHours = 0, gasMWh = 0;
  let dieselFuelMMBtu = 0, dieselGasMMBtu = 0, dieselRunHours = 0, dieselMWh = 0, dieselTestMWh = 0;
  let gridMWh = 0, solarMWh = 0, bessOutMWh = 0, bessInMWh = 0;
  let unservedMWh = 0, shedMWh = 0, curtailedMWh = 0, reserveShortHours = 0;

  for (const f of flows) {
    gasFuelMMBtu += f.gasFuelMMBtu; gasRunHours += f.gasRunHours; gasMWh += f.gas;
    dieselFuelMMBtu += f.dieselFuelMMBtu; dieselGasMMBtu += f.dieselGasMMBtu;
    dieselRunHours += f.dieselRunHours; dieselMWh += f.diesel; dieselTestMWh += f.dieselTestMW || 0;
    gridMWh += f.grid; solarMWh += f.solar;
    bessOutMWh += f.bessDischarge; bessInMWh += f.bessCharge;
    unservedMWh += f.unserved; shedMWh += f.shed; curtailedMWh += f.solarCurtail + f.curtailedEnergy;
    if (f.reserveShortfall > 0) reserveShortHours++;
  }

  const gasPrice = problem.prices.gasPerMMBtu;
  const dieselPrice = problem.prices.dieselPerMMBtu;

  const r = out || makeCostRecord();
  r.gasFuel = (gasFuelMMBtu + dieselGasMMBtu) * gasPrice;
  r.gasVarOM = gasRunHours * NG_BRIDGE.varOMPerRunHr;
  r.dieselFuel = dieselFuelMMBtu * dieselPrice;
  r.dieselVarOM = dieselRunHours * DF_BACKUP.varOMPerRunHr;
  // Volumes, for the KPI layer.
  r.gasFuelMMBtu = gasFuelMMBtu; r.dieselFuelMMBtu = dieselFuelMMBtu; r.dieselGasMMBtu = dieselGasMMBtu;
  r.gasRunHours = gasRunHours; r.dieselRunHours = dieselRunHours;
  r.gasMWh = gasMWh; r.dieselMWh = dieselMWh; r.dieselTestMWh = dieselTestMWh;
  r.gridMWh = gridMWh; r.solarMWh = solarMWh; r.bessOutMWh = bessOutMWh; r.bessInMWh = bessInMWh;
  r.unservedMWh = unservedMWh; r.shedMWh = shedMWh; r.curtailedMWh = curtailedMWh;
  r.reserveShortHours = reserveShortHours;
  r.co2Tonnes =
    ((gasFuelMMBtu + dieselGasMMBtu) * FUEL.ngKgCO2PerMMBtu +
      dieselFuelMMBtu * FUEL.dieselKgCO2PerMMBtu) / 1000;
  return r;
}

/** Delivered gas, $/MMBtu, in a given year of the horizon. */
export function gasPriceIn(yearIndex) {
  return FUEL.henryHubStart * Math.pow(1 + FUEL.henryHubEscalationPctPerYr / 100, yearIndex)
    + FUEL.basisAdder;
}

export function dieselPriceIn(yearIndex) {
  return (FUEL.dieselPerGallon / FUEL.dieselMMBtuPerGallon)
    * Math.pow(1 + FUEL.henryHubEscalationPctPerYr / 100, yearIndex);
}

/** Rent and mobilization charged to the customer for the gas fleet (D6 ✅). */
export function gasRentForMonth(units) {
  return units * NG_BRIDGE.ratedKW * NG_BRIDGE.rentPerKWMonth;
}

/** Capital outlays, laid down in the month the asset lands. */
export function capexEvents(life) {
  const out = [];
  let prevDiesel = 0, prevBessMW = 0, prevBessMWh = 0, prevSolar = 0, prevGas = 0;
  for (const m of life.months) {
    const nominalBessMWh = m.bessHealth > 0 ? m.bessMWh / m.bessHealth : 0;
    if (m.dieselUnits > prevDiesel) {
      const kW = (m.dieselUnits - prevDiesel) * DF_BACKUP.ratedKW;
      out.push({ month: m.month, item: 'Dual-fuel backup', amount: kW * DF_BACKUP.capexPerKW });
      prevDiesel = m.dieselUnits;
    }
    if (m.bessMW > prevBessMW + 1e-6) {
      const dMW = m.bessMW - prevBessMW, dMWh = nominalBessMWh - prevBessMWh;
      out.push({ month: m.month, item: 'BESS',
        amount: dMW * 1000 * BESS.capexPerKW + dMWh * 1000 * BESS.capexPerKWh });
      prevBessMW = m.bessMW; prevBessMWh = nominalBessMWh;
    }
    if (m.solarMWdc > prevSolar + 1e-6) {
      out.push({ month: m.month, item: 'Solar',
        amount: (m.solarMWdc - prevSolar) * 1e6 * SOLAR.capexPerWdc });
      prevSolar = m.solarMWdc;
    }
    if (m.gasUnits > prevGas) {
      out.push({ month: m.month, item: 'Gas mobilization',
        amount: (m.gasUnits - prevGas) * NG_BRIDGE.mobilizePerUnit });
    }
    if (m.gasUnits < prevGas) {
      out.push({ month: m.month, item: 'Gas demobilization',
        amount: (prevGas - m.gasUnits) * NG_BRIDGE.demobilizePerUnit });
    }
    prevGas = m.gasUnits;
  }
  return out;
}

/** Fixed O&M owed in a month for whatever is installed that month. */
export function fixedOMForMonth(m) {
  const nominalBessMWh = m.bessHealth > 0 ? m.bessMWh / m.bessHealth : 0;
  return (
    (m.dieselUnits * DF_BACKUP.ratedKW * (DF_BACKUP.fixedOMPerKWYr + DF_BACKUP.permitCompliancePerKWYr)) / 12 +
    (m.bessMW * 1000 * BESS.fixedOMPerKWYr) / 12 +
    (nominalBessMWh * 1000 * BESS.capexPerKWh * BESS.augmentationFracPerYr) / 12 +
    (m.solarMWdc * 1000 * SOLAR.fixedOMPerKWYr) / 12
  );
}

export function annualizedCapex(kind, amount) {
  const life = kind === 'bess' ? BESS.lifeYears : kind === 'solar' ? SOLAR.lifeYears : DF_BACKUP.lifeYears;
  return amount * crf(FINANCE.discountRatePct / 100, life);
}
