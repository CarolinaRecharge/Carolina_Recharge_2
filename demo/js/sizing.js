// §10 — Backup sizing module (diesel vs BESS, least cost).
//
// A closed-form screening pass that runs before the hourly simulation and sets
// the default diesel and BESS sizes for the selected preset. The user can
// override the result; the hourly run then verifies it against §4.6.

import { crf, clamp } from './util.js';
import { BESS, DF_BACKUP, NG_BRIDGE, PRESETS } from './config.js';

/** Annualized $/kW-yr of firm backup from diesel. */
export function dieselFirmCostPerKWYr(fin) {
  return DF_BACKUP.capexPerKW * crf(fin.discountRatePct / 100, DF_BACKUP.lifeYears)
    + DF_BACKUP.fixedOMPerKWYr
    + DF_BACKUP.permitCompliancePerKWYr;
}

/** Annualized $/kW-yr of firm backup from BESS at a given duration. */
export function bessFirmCostPerKWYr(hours, fin) {
  const capexPerKW = BESS.capexPerKWh * hours + BESS.capexPerKW;
  return capexPerKW * crf(fin.discountRatePct / 100, BESS.lifeYears)
    + BESS.fixedOMPerKWYr
    + BESS.capexPerKWh * hours * BESS.augmentationFracPerYr;
}

/** Ride-through duration at which diesel and BESS cost the same per firm kW. */
export function breakEvenHours(fin) {
  const d = dieselFirmCostPerKWYr(fin);
  const slope = BESS.capexPerKWh * crf(fin.discountRatePct / 100, BESS.lifeYears)
    + BESS.capexPerKWh * BESS.augmentationFracPerYr;
  const intercept = BESS.capexPerKW * crf(fin.discountRatePct / 100, BESS.lifeYears)
    + BESS.fixedOMPerKWYr;
  return (d - intercept) / slope;
}

/**
 * Screening optimizer. L is the full-build facility peak (MW), mwIT the IT
 * capacity behind it. Returns the binding constraint for each result so the UI
 * can say *why* a number is what it is, which is the whole point of the panel.
 */
export function screenBackup({ facilityPeakMW: L, mwIT, presetKey, fin }) {
  const p = PRESETS[presetKey];
  const largestGasUnitMW = NG_BRIDGE.ratedKW / 1000;
  const shedH = p.shedWindowMin == null ? 0 : p.shedWindowMin / 60;

  // Constraint 2 — sustained backup.
  const dieselFirmMW = p.criticalFrac * L;
  const dieselInstalledMW = dieselFirmMW * 1.10;           // N+1 block margin
  const dieselUnits = Math.ceil((dieselInstalledMW * 1000) / DF_BACKUP.ratedKW);

  // Constraint 1 — instant reserve during the bridge.
  const bessReserveMW = largestGasUnitMW + p.stepSwingFracIT * mwIT;
  // Constraint 3 — the shed window carries whatever diesel does not.
  const shedMW = Math.max(0, L - dieselFirmMW);
  const bessPowerMW = Math.max(bessReserveMW, shedMW);
  const powerBinding = bessReserveMW >= shedMW ? 'instant reserve (bridge)' : 'shed window';

  const shedEnergyMWh = (shedMW * shedH) / BESS.rte;
  // Constraint 4 — minimum duration.
  const minDurEnergyMWh = bessPowerMW * BESS.minDurationH;
  const bessEnergyMWh = Math.max(shedEnergyMWh, minDurEnergyMWh);
  const energyBinding = shedEnergyMWh >= minDurEnergyMWh ? 'shed window energy' : 'minimum duration';

  // Constraint 5 — fuel. 12 h at firm diesel on 100% diesel covers gas loss.
  const tankHoursRequired = 12;

  const dPerKWYr = dieselFirmCostPerKWYr(fin);
  const bPerKWYr = bessFirmCostPerKWYr(BESS.minDurationH, fin);

  const annualized =
    dieselInstalledMW * 1000 * dPerKWYr +
    bessPowerMW * 1000 * (BESS.capexPerKW * crf(fin.discountRatePct / 100, BESS.lifeYears) + BESS.fixedOMPerKWYr) +
    bessEnergyMWh * 1000 * (BESS.capexPerKWh * crf(fin.discountRatePct / 100, BESS.lifeYears)
      + BESS.capexPerKWh * BESS.augmentationFracPerYr);

  return {
    dieselFirmMW, dieselInstalledMW, dieselUnits,
    bessPowerMW, bessEnergyMWh, bessReserveMW, shedMW, shedH,
    powerBinding, energyBinding,
    tankHoursRequired,
    dieselPerKWYr: dPerKWYr,
    bessPerKWYr: bPerKWYr,
    breakEvenH: breakEvenHours(fin),
    annualizedCost: annualized,
    // The dual-use floor: this much stored energy is spoken for in every phase
    // and is not available for peak shaving or gas decommitment.
    reservedEnergyMWh: shedMW * shedH,
  };
}

/**
 * Threshold that a battery of the given power and usable energy can shave a
 * day's series down to. Shared by the sizing pass and the daily planner in the
 * solver so the two can never disagree about what the battery can do.
 */
export function shaveThreshold(series, usableEnergyMWh, powerMW, n = series.length) {
  // Indexed loops throughout: `series` is usually a Float64Array, and iterating
  // one with for..of goes through the iterator protocol, which costs more here
  // than the arithmetic. This runs once per simulated day.
  let hi = 0, lo = Infinity;
  for (let i = 0; i < n; i++) {
    const v = series[i];
    if (v > hi) hi = v;
    if (v < lo) lo = v;
  }
  if (usableEnergyMWh <= 0 || powerMW <= 0) return hi;
  // Bisect between the day's own floor and ceiling rather than from zero — same
  // absolute precision in fewer steps.
  for (let it = 0; it < 20; it++) {
    const mid = (lo + hi) / 2;
    let e = 0;
    for (let i = 0; i < n; i++) {
      const d = series[i] - mid;
      e += d > powerMW ? powerMW : d > 0 ? d : 0;
    }
    if (e > usableEnergyMWh) lo = mid; else hi = mid;
  }
  return hi;
}

export function presetSummary(presetKey) {
  const p = PRESETS[presetKey];
  return {
    label: p.label, blurb: p.blurb,
    step: p.stepSwingFracIT, critical: p.criticalFrac, shed: p.shedWindowMin,
  };
}

export { clamp };
