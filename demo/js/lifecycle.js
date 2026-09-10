// §2 lifecycle layer and §3.8 events.
//
// A scenario is an ordered event list; this module turns it into a monthly
// configuration state that the hourly layer reads. Nothing downstream branches
// on "which phase are we in" — the phases emerge from the monthly state, per
// §4.1.

import { NG_BRIDGE, DF_BACKUP, BESS } from './config.js';
import { shaveThreshold } from './sizing.js';

export const SCENARIOS = [
  { key: 'wait',     label: 'Wait for grid',        short: 'Wait',
    blurb: 'No IT revenue until the grid arrives. Grid plus diesel backup after that.' },
  { key: 'bridge',   label: 'Gas bridge',           short: 'Gas bridge',
    blurb: 'Rented gas recips from first power to energization, then redeployed. No BESS or solar.' },
  { key: 'hybrid',   label: 'Hybrid (proposed)',    short: 'Hybrid',
    blurb: 'Gas bridge plus BESS and solar. The battery cuts online gas units during the bridge and shaves demand afterward.' },
  { key: 'retained', label: 'Hybrid, retained gas', short: 'Retained gas',
    blurb: 'Hybrid, but N MW of gas stays on site long-term. Default 0 — this is the frontier in §6.' },
];

/**
 * Build the monthly state array for one scenario.
 * Returns 180 entries, one per month from NTP.
 */
export function buildLifecycle(scenarioKey, inputs, derived) {
  const {
    facilityPeakMW, gridEnergizationMonth, interimGridMW, hybridFirstPowerMonth,
    gasOverlapMonths, retainedGasMW, contractedDemandPct, horizonMonths,
    bessMWPerPhase, bessHours, solarMWdc, dieselAsBridgeReserve,
  } = inputs;

  const isWait = scenarioKey === 'wait';
  const hasGas = !isWait;
  const hasBESS = scenarioKey === 'hybrid' || scenarioKey === 'retained';
  const hasSolar = hasBESS;
  const retainedMW = scenarioKey === 'retained' ? retainedGasMW : 0;

  const firstPower = isWait ? gridEnergizationMonth : hybridFirstPowerMonth;
  const phaseMonths = [0, 1, 2, 3].map((i) => firstPower + i * 12);
  const gasEndMonth = gridEnergizationMonth + gasOverlapMonths; // M60 + 3 → units leave
  const solarMonth = firstPower + 6;                            // M24 on the default timeline

  const unitCapMW = (NG_BRIDGE.ratedKW / 1000) * NG_BRIDGE.maxContinuousFrac;
  const spare = dieselAsBridgeReserve ? 0 : 1; // §8.2 — (a) lets diesel carry N+1

  // Gas fleet installed at each phase, sized against the design-day shape.
  const gasUnitsByPhase = [];
  const bessMWByPhase = [];
  for (let i = 0; i < 4; i++) {
    const frac = (i + 1) / 4;
    const phasePeak = facilityPeakMW * frac;
    const bessMW = hasBESS ? bessMWPerPhase * (i + 1) : 0;
    const bessMWh = bessMW * bessHours;
    bessMWByPhase.push(bessMW);
    let designLoad = phasePeak;
    if (hasBESS && bessMW > 0) {
      // The battery lets the fleet be sized nearer the design day's mean than
      // its peak — this is where the rented-unit count comes down. It cannot be
      // sized to the threshold alone, though: while the site is islanded the
      // gensets are the only thing that can put the energy back, so the fleet
      // has to carry the day's mean plus the round-trip recharge on top.
      const day = derived.designDay.map((v) => v * frac * facilityPeakMW);
      const usable = bessMWh * (BESS.socMax - BESS.socMin) * BESS.rte;
      const t = shaveThreshold(day, usable, bessMW);
      let dischargeE = 0, dayMean = 0;
      for (const v of day) { dischargeE += Math.max(0, v - t); dayMean += v / day.length; }
      const rechargeMW = dischargeE / BESS.rte / day.length;
      designLoad = Math.max(t, dayMean) + rechargeMW;
      // …and the annual peak hour still has to be servable with the battery at
      // full power, which is a capacity limit rather than an energy one.
      designLoad = Math.max(designLoad, derived.peakFrac * facilityPeakMW * frac - bessMW);
    }
    gasUnitsByPhase.push(Math.ceil(designLoad / unitCapMW) + spare);
  }

  const months = [];
  for (let m = 0; m < horizonMonths; m++) {
    let phases = 0;
    for (const pm of phaseMonths) if (m >= pm) phases++;
    const itFrac = phases / 4;

    // Grid: physically available at energization; import held to the contract.
    const gridAvailMW = m >= gridEnergizationMonth ? facilityPeakMW : interimGridMW;
    const contractedMW = m >= gridEnergizationMonth
      ? (contractedDemandPct / 100) * facilityPeakMW * Math.max(itFrac, 0.25)
      : interimGridMW;
    const gridLimitMW = Math.min(gridAvailMW, contractedMW);

    // Gas bridge: on from first power to demobilization; retained units stay.
    let gasUnits = 0;
    if (hasGas && m >= firstPower) {
      gasUnits = m < gasEndMonth
        ? gasUnitsByPhase[Math.max(0, phases - 1)]
        : Math.floor((retainedMW * 1000) / NG_BRIDGE.ratedKW);
    }

    const bessMW = hasBESS && phases > 0 ? bessMWByPhase[phases - 1] : 0;
    const bessMWh = bessMW * bessHours;
    const solarMW = hasSolar && m >= solarMonth ? solarMWdc : 0;

    // Backup fleet lands with each IT phase, in all scenarios (§8.2 ✅).
    const dieselUnits = phases > 0
      ? Math.ceil((derived.screen.dieselInstalledMW * itFrac * 1000) / DF_BACKUP.ratedKW)
      : 0;

    // Calendar degradation from the month the first block was installed.
    const bessAgeYears = hasBESS && phases > 0 ? Math.max(0, (m - firstPower) / 12) : 0;
    const bessHealth = Math.max(0.70, 1 - (BESS.degradation.calendarPctYr / 100) * bessAgeYears);

    months.push({
      month: m, itFrac, phases,
      gridAvailMW, contractedMW, gridLimitMW,
      gasUnits, gasCapMW: gasUnits * (NG_BRIDGE.ratedKW / 1000),
      bessMW, bessMWh: bessMWh * bessHealth, bessHealth,
      solarMWdc: solarMW,
      dieselUnits, dieselCapMW: (dieselUnits * DF_BACKUP.ratedKW) / 1000,
      islanded: m >= firstPower && gridLimitMW <= 0,
      revenueITMW: derived.mwIT * itFrac,
    });
  }

  return {
    key: scenarioKey, months, phaseMonths, firstPower, gasEndMonth, solarMonth,
    gasUnitsByPhase, bessMWByPhase, hasGas, hasBESS, hasSolar, retainedMW,
    // Fleet events, for the company-view export in §5.
    mobilizations: gasUnitsByPhase.map((u, i) => ({ month: phaseMonths[i], units: i === 0 ? u : u - gasUnitsByPhase[i - 1] })),
    demobilizationMonth: hasGas ? gasEndMonth : null,
  };
}
