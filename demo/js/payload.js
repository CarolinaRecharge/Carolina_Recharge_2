// What crosses the wire between the model and the page.
//
// The model holds several megabytes of hourly weather and load series that the
// UI never draws directly. Everything here is either a scalar the page prints
// or a series already reduced to the shape a chart wants, so a re-run at slider
// speed does not spend its budget copying arrays.

import { insurancePanel, weatherSummary } from './model.js';
import { SCENARIOS } from './lifecycle.js';

export function buildPayload(run, inputs) {
  const { derived, results, checks, recomputed, ms } = run;
  const out = {
    ms, recomputed,
    derived: {
      mwIT: derived.mwIT, pueDesign: derived.pueDesign, tDesignC: derived.tDesignC,
      simulatedPeakMW: derived.simulatedPeakMW, simulatedMeanMW: derived.simulatedMeanMW,
      loadFactor: derived.loadFactor, annualPOAkWh: derived.annualPOAkWh,
      worstDay: derived.worstDay, designDayMeanFrac: derived.designDayMeanFrac,
      peakFrac: derived.peakFrac, screen: derived.screen,
      weather: run.weather || weatherSummary(derived),
    },
    checks,
    insurance: insurancePanel(inputs, derived, results),
    results: {},
  };
  for (const s of SCENARIOS) {
    const r = results[s.key];
    out.results[s.key] = {
      key: r.key,
      life: { months: r.life.months, phaseMonths: r.life.phaseMonths, firstPower: r.life.firstPower,
        gasEndMonth: r.life.gasEndMonth, solarMonth: r.life.solarMonth,
        gasUnitsByPhase: r.life.gasUnitsByPhase, bessMWByPhase: r.life.bessMWByPhase,
        hasGas: r.life.hasGas, hasBESS: r.life.hasBESS, retainedMW: r.life.retainedMW },
      annual: r.annual, cumulative: r.cumulative,
      // The 180-month detail is only ever read as a peak series and as the
      // final year's bill, so only those cross.
      peakLoadByMonth: r.monthly.map((m) => m.peakLoadMW),
      meteredPeakKW: r.monthly.reduce((a, m) => Math.max(a, m.det.meteredKW), 0),
      billYear: r.monthly.slice(-12).map((m) => ({
        demand: m.bill.demand, energy: m.bill.energy, total: m.bill.total,
        excessKW: m.bill.minimumChargeExcessKW,
        billedGenKW: m.det.billedGenKW, meteredKW: m.det.meteredKW,
      })),
      capexItems: r.capexItems, totals: r.totals, finalYear: r.finalYear,
      npvCost: r.npvCost, npvNet: r.npvNet, blendedPerMWh: r.blendedPerMWh,
      gridSharePct: r.gridSharePct, solarSharePct: r.solarSharePct,
      firstPowerMonth: r.firstPowerMonth, contractedFrac: r.contractedFrac,
      peakGasUnits: r.peakGasUnits, gasUnitMonths: r.gasUnitMonths, redeployMonth: r.redeployMonth,
      // Only the hybrid case is drawn hour by hour, so only it carries sample days.
      sampleDays: s.key === 'hybrid' ? r.sampleDays : null,
    };
  }
  return out;
}
