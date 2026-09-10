// §3.7 — the Dominion GS-4 2026 structure used as the GS-5 proxy.
//
// Demand is computed from 1-hour averages (D3 ✅). Dominion bills on the
// highest 30-minute interval, so this understates billed demand slightly; the
// note travels with every export and appears on the UI.

import { TARIFF } from './config.js';

export function newBillingMonth() {
  return { kWh: 0, peakKW: 0, hours: 0 };
}

export function addHour(bm, gridMW) {
  bm.kWh += gridMW * 1000;
  if (gridMW * 1000 > bm.peakKW) bm.peakKW = gridMW * 1000;
  bm.hours++;
}

/**
 * Billing determinants for one month. Kept separate from the charge
 * calculation because the LP in §9 needs exactly these as its epigraph
 * variables, with the ratchet carried as a rolling-horizon parameter.
 */
export function determinants(bm, contractedKW, ratchetKW) {
  const contractGen = TARIFF.contractMinGenFrac * contractedKW;
  const contractDist = TARIFF.contractMinDistFrac * contractedKW;
  return {
    meteredKW: bm.peakKW,
    ratchetKW,
    billedGenKW: Math.max(bm.peakKW, contractGen, ratchetKW),
    billedTransKW: Math.max(bm.peakKW, contractGen, ratchetKW),
    billedDistKW: Math.max(bm.peakKW, contractDist, ratchetKW),
    kWh: bm.kWh,
    contractGen, contractDist,
  };
}

export function billFor(det, yearIndex) {
  const esc = Math.pow(1 + TARIFF.escalationPctPerYr / 100, yearIndex);
  const demand =
    det.billedGenKW * TARIFF.generationDemandPerKWMo +
    det.billedTransKW * TARIFF.transmissionDemandPerKWMo +
    det.billedDistKW * TARIFF.distributionDemandPerKWMo;
  const energy = det.kWh * (TARIFF.generationEnergyPerKWh + TARIFF.riderAdderPerKWh);
  const total = (demand + energy + TARIFF.customerChargePerMonth) * esc;
  return {
    demand: demand * esc,
    energy: energy * esc,
    customer: TARIFF.customerChargePerMonth * esc,
    total,
    // How much of the bill the customer pays for capacity they did not use.
    minimumChargeExcessKW: Math.max(0, det.billedGenKW - det.meteredKW),
  };
}

/** 75% of the highest summer demand in the trailing 11 months (§3.7). */
export function ratchetFloor(summerHistory) {
  let mx = 0;
  for (const v of summerHistory) if (v > mx) mx = v;
  return TARIFF.summerRatchetFrac * mx;
}

export const isSummer = (monthOfYear) => TARIFF.summerMonths.includes(monthOfYear);
