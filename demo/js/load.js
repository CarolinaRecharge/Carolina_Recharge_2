// Facility load: the IT ramp, the utilization shape for the selected workload
// preset, and the temperature-driven PUE curve on top of both.

import { rng, gauss, clamp, HOURS_PER_YEAR } from './util.js';
import { COOLING, PRESETS } from './config.js';

/** PUE at a given dry-bulb temperature (§3.2, D4 ✅). */
export function pueAt(tC) {
  return clamp(COOLING.pueMin + COOLING.slopePerC * Math.max(0, tC - COOLING.tRefC),
    COOLING.pueMin, COOLING.pueMax);
}

/**
 * IT capacity is derived from the facility peak, not the other way round.
 *
 * The spec fixes the *facility* peak at 100 MW. Peak facility load is IT
 * capacity × full utilization × the PUE reached at the design dry-bulb, so IT
 * capacity is the facility peak divided by that PUE. Using the 1.45 ceiling
 * instead would understate IT capacity by about 7% — NoVA never gets hot
 * enough to reach it.
 */
export function deriveITCapacity(facilityPeakMW, tmy) {
  let tDesign = -99;
  for (let i = 0; i < HOURS_PER_YEAR; i++) if (tmy.temp[i] > tDesign) tDesign = tmy.temp[i];
  const pueDesign = pueAt(tDesign);
  return { mwIT: facilityPeakMW / pueDesign, pueDesign, tDesignC: tDesign };
}

/**
 * Hourly utilization for a preset. Diurnal and weekly shapes plus a persistent
 * noise term, all from the seeded generator so a run is reproducible.
 * Returns one year of values, reused across the horizon.
 */
export function buildUtilization(presetKey, seed) {
  const p = PRESETS[presetKey];
  const r = rng(seed ^ 0x5bf03635);
  const u = new Float32Array(HOURS_PER_YEAR);
  let dev = 0;
  for (let i = 0; i < HOURS_PER_YEAR; i++) {
    const h = i % 24;
    const dow = Math.floor(i / 24) % 7;
    // Peak in the early afternoon; weekends run lighter.
    const diurnal = -Math.cos((2 * Math.PI * (h - 14)) / 24);
    const weekly = dow >= 5 ? -1 : 0.4;
    dev = 0.85 * dev + 0.15 * gauss(r) * 6;
    u[i] = clamp(
      p.base + p.diurnalAmp * diurnal + p.weeklyAmp * weekly + dev * p.noiseSigma,
      0.15, 1.0
    );
  }
  return u;
}

/**
 * The IT capacity online in a given month, as a fraction of full build.
 * Phases land on the schedule the scenario supplies.
 */
export function itFractionAt(month, phaseMonths) {
  let n = 0;
  for (const m of phaseMonths) if (month >= m) n++;
  return n / phaseMonths.length;
}
