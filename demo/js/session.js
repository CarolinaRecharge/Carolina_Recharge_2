// Incremental model session.
//
// A slider drag asks for a new answer many times a second, and most drags do
// not invalidate most of the model. This keeps the expensive shared inputs and
// the per-scenario results, and recomputes only what the moved control actually
// reaches. Dragging retained gas re-runs one scenario; dragging the workload
// preset re-runs everything.

import { runScenario, buildDerived, buildEvents, sizingChecks, HORIZON_MONTHS } from './model.js';
import { SCENARIOS } from './lifecycle.js';

/** Inputs the shared weather / load / sizing layer depends on. */
const DERIVED_KEYS = ['workloadPreset', 'seed', 'facilityPeakMW'];
const EVENT_KEYS = ['seed'];

/** Inputs each scenario depends on, cumulative down the list. */
const COMMON = ['workloadPreset', 'seed', 'facilityPeakMW', 'gridEnergizationMonth',
  'contractedDemandPct', 'interimGridMW', 'horizonMonths'];
const WITH_GAS = [...COMMON, 'hybridFirstPowerMonth', 'gasOverlapMonths', 'dieselAsBridgeReserve'];
const WITH_STORAGE = [...WITH_GAS, 'bessMWPerPhase', 'bessHours', 'solarMWdc'];

const SCENARIO_KEYS = {
  wait: COMMON,
  bridge: WITH_GAS,
  hybrid: WITH_STORAGE,
  retained: [...WITH_STORAGE, 'retainedGasMW'],
};

const fingerprint = (inputs, keys) => keys.map((k) => `${k}=${inputs[k]}`).join('|');

export function createSession() {
  let derivedKey = null, derived = null;
  let eventKey = null, events = null;
  const scenarioKey = {}, scenarioResult = {};

  return {
    /**
     * @returns { derived, events, results, checks, recomputed } — `recomputed`
     *          lists what actually had to run, which the UI reports so the cost
     *          of a control is visible rather than mysterious.
     */
    update(inputs) {
      const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
      const recomputed = [];

      const dk = fingerprint(inputs, DERIVED_KEYS);
      if (dk !== derivedKey) { derived = buildDerived(inputs); derivedKey = dk; recomputed.push('weather+load'); }

      const ek = fingerprint(inputs, EVENT_KEYS);
      if (ek !== eventKey) { events = buildEvents(inputs); eventKey = ek; recomputed.push('events'); }

      const results = {};
      for (const s of SCENARIOS) {
        const k = fingerprint(inputs, SCENARIO_KEYS[s.key]) + '|' + derivedKey;
        if (k !== scenarioKey[s.key]) {
          scenarioResult[s.key] = runScenario(s.key, inputs, derived, events);
          scenarioKey[s.key] = k;
          recomputed.push(s.key);
        }
        results[s.key] = scenarioResult[s.key];
      }

      const checks = sizingChecks(inputs, derived, results);
      const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
      return { inputs, derived, events, results, checks, recomputed, ms };
    },
  };
}

export { HORIZON_MONTHS };
