// Talks to the worker, and coalesces.
//
// A slider drag emits far more requests than the model can answer. Only the
// most recent one matters, so at most one run is ever in flight and at most one
// is ever queued; everything in between is dropped. That is what keeps the
// numbers tracking the thumb instead of lagging a queue behind it.

import { buildPayload } from './payload.js';

export function createRunner(onResult, onError, onStat) {
  let worker = null;
  let inflight = false;
  let queued = null;
  let seq = 0;
  let fallback = null;

  // Instrumentation. The Engine tab draws these, because a coalescing queue you
  // cannot see is indistinguishable from one that is silently dropping work.
  const stats = {
    requested: 0,     // asks that came in from the controls
    dropped: 0,       // asks superseded before they ever ran
    started: 0,       // runs actually handed to the model
    completed: 0,     // answers that came back
    lastMs: 0,        // model time for the last completed run
    lastWaitMs: 0,    // request → answer, including queueing
    lastRecomputed: [],
    inflight: false,
    queuedDepth: 0,
    transport: 'starting',
    recent: [],       // last 60 completions, for the sparkline
  };
  let startedAt = 0, askedAt = 0;
  const emit = () => { stats.inflight = inflight; stats.queuedDepth = queued ? 1 : 0; onStat?.(stats); };

  function record(payload) {
    stats.completed++;
    stats.lastMs = payload.ms;
    stats.lastWaitMs = performance.now() - startedAt;
    stats.lastRecomputed = payload.recomputed;
    stats.recent.push({ ms: payload.ms, wait: stats.lastWaitMs, n: payload.recomputed.length });
    if (stats.recent.length > 60) stats.recent.shift();
  }

  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { ok, payload, error } = e.data;
      inflight = false;
      if (ok) { record(payload); onResult(payload); } else onError?.(error);
      emit();
      flush();
    };
    worker.onerror = () => { worker = null; stats.transport = 'main thread'; emit(); };
    stats.transport = 'worker';
  } catch {
    worker = null;
    stats.transport = 'main thread';
  }

  function flush() {
    if (inflight || !queued) return;
    const job = queued;
    queued = null;
    inflight = true;
    stats.started++;
    startedAt = performance.now();
    emit();
    if (worker) {
      worker.postMessage({ id: ++seq, inputs: job.inputs, sweep: job.sweep });
    } else {
      // No module workers here — run on the main thread, after a paint so the
      // control that triggered this has already moved.
      requestAnimationFrame(() => setTimeout(async () => {
        try {
          stats.transport = 'main thread';
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
          record(payload);
          onResult(payload);
        } catch (err) {
          onError?.(String(err && err.stack || err));
        } finally {
          inflight = false;
          emit();
          flush();
        }
      }, 0));
    }
  }

  return {
    /** Ask for a run. Supersedes anything already queued but not yet started. */
    request(inputs, sweep) {
      stats.requested++;
      if (queued) stats.dropped++;     // this ask supersedes one that never ran
      askedAt = performance.now();
      queued = { inputs: { ...inputs }, sweep };
      emit();
      flush();
    },
    stats,
    get busy() { return inflight; },
    get usingWorker() { return !!worker; },
  };
}
