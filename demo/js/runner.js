// Talks to the worker, and coalesces.
//
// A slider drag emits far more requests than the model can answer. Only the
// most recent one matters, so at most one run is ever in flight and at most one
// is ever queued; everything in between is dropped. That is what keeps the
// numbers tracking the thumb instead of lagging a queue behind it.

import { buildPayload } from './payload.js';

export function createRunner(onResult, onError) {
  let worker = null;
  let inflight = false;
  let queued = null;
  let seq = 0;
  let fallback = null;

  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { ok, payload, error } = e.data;
      inflight = false;
      if (ok) onResult(payload); else onError?.(error);
      flush();
    };
    worker.onerror = () => { worker = null; };
  } catch {
    worker = null;
  }

  function flush() {
    if (inflight || !queued) return;
    const job = queued;
    queued = null;
    inflight = true;
    if (worker) {
      worker.postMessage({ id: ++seq, inputs: job.inputs, sweep: job.sweep });
    } else {
      // No module workers here — run on the main thread, after a paint so the
      // control that triggered this has already moved.
      requestAnimationFrame(() => setTimeout(async () => {
        try {
          if (!fallback) {
            const [{ createSession }, { runSweep }] = await Promise.all([
              import('./session.js'), import('./model.js'),
            ]);
            fallback = { session: createSession(), runSweep };
          }
          const run = fallback.session.update(job.inputs);
          const payload = buildPayload(run, job.inputs);
          if (job.sweep) {
            payload.sweep = fallback.runSweep(job.inputs, run.derived, run.events,
              job.sweep.contracts, job.sweep.retained);
          }
          onResult(payload);
        } catch (err) {
          onError?.(String(err && err.stack || err));
        } finally {
          inflight = false;
          flush();
        }
      }, 0));
    }
  }

  return {
    /** Ask for a run. Supersedes anything already queued but not yet started. */
    request(inputs, sweep) {
      queued = { inputs: { ...inputs }, sweep };
      flush();
    },
    get busy() { return inflight; },
    get usingWorker() { return !!worker; },
  };
}
