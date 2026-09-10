// The model runs here so that dragging a slider never competes with the model
// for the main thread. The page stays at 60 fps while answers arrive behind it.

import { createSession } from './session.js';
import { buildPayload } from './payload.js';
import { runSweep } from './model.js';
import { weatherSummary } from './model.js';

const session = createSession();
let lastDerivedKey = null;
let weather = null;

self.onmessage = (e) => {
  const { id, inputs, sweep } = e.data;
  try {
    const run = session.update(inputs);
    // The weather summary only changes when the weather does.
    if (run.recomputed.includes('weather+load') || !weather) {
      weather = weatherSummary(run.derived);
    }
    run.weather = weather;
    const payload = buildPayload(run, inputs);
    if (sweep) {
      payload.sweep = runSweep(inputs, run.derived, run.events, sweep.contracts, sweep.retained);
    }
    self.postMessage({ id, ok: true, payload });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.stack || err) });
  }
};
