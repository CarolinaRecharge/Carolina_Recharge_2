# Site Energy Model

An interactive demonstration built to design spec v0.3. It runs a 15-year hourly
simulation of four ways to power a grid-constrained 100 MW campus in Northern
Virginia, and re-solves the whole model whenever a control moves — while it
moves. Nothing is precomputed and nothing is stored server-side; the page is
static files.

Served at `/demo/` on the main site.

**The page carries no product branding, deliberately.** See the "demo subtree"
section of the repository's `CLAUDE.md` for why, and for what happened to the
required disclosures. Do not restore the logo or the brand palette without
asking.

## Deploying

**Nothing to configure.** The demo lives at `/demo/` on the main site, so
whatever deploys the repository root already publishes it. No build command, no
output directory, no separate project, no DNS record. It references no file
outside `demo/`.

Local preview needs an HTTP server rather than opening the file directly,
because the page uses ES modules and a module worker:

```bash
python3 -m http.server 8000   # from the repository root
# then http://localhost:8000/demo/
```

The page carries `<meta name="robots" content="noindex, nofollow">`, so it will
not turn up in search or dilute the marketing site's ranking. Nothing on the
main site links to it — reach it by URL. Take the meta tag out and add a link
only if the demo is meant to be found.

**If it ever moves to its own subdomain,** either route works now that the
directory is self-contained: add the domain to the same project and rewrite `/`
to `/demo/` for that host, or point a separate project at `demo/` as its root.

## Layout

```
demo/
  index.html      page shell — header, control rail, tab panels, footer
  demo.css        all styles; neutral, no brand tokens
  icon.svg        favicon
  js/
    config.js     every input, each tagged confirmed / validate / decide
    util.js       seeded PRNG, curve interpolation, calendar, formatters
    weather.js    Northern Virginia TMY, synthesised and calibrated
    load.js       IT ramp, utilization by preset, PUE curve
    sizing.js     §10 backup screening optimizer (diesel vs battery)
    lifecycle.js  §2 monthly configuration state from the §3.8 event list
    solver.js     §9 solveWindow(problem, state) → flows[] — heuristic dispatch
    tariff.js     §3.7 billing determinants and the GS-5 proxy bill
    cost.js       §5 costOf(flows) — the shared scorer, plus capital and rent
    model.js      orchestrator, KPIs, §4.6 checks, sweep, insurance panel
    session.js    incremental cache — re-runs only the scenarios a control reaches
    payload.js    what crosses the wire: scalars and chart-ready series only
    worker.js     the model, off the main thread
    runner.js     request coalescing, with a main-thread fallback
    charts.js     hand-rolled SVG charts and the validated palette
    schematic.js  the live single-line diagram
    pipeline.js   the live request-path diagram on the Engine tab
    app.js        UI wiring only; no arithmetic that matters
```

## How it stays live under a drag

A slider emits far more requests than any model can answer, so three things do
the work:

1. **The model runs in a worker.** The thumb never waits on arithmetic.
2. **Requests coalesce.** At most one run is in flight and at most one queued;
   everything in between is dropped, so results track the thumb instead of
   lagging a queue behind it (`runner.js`).
3. **Only what changed is recomputed.** Each scenario declares which inputs it
   depends on. Dragging retained gas re-runs one scenario; dragging the workload
   preset re-runs the weather, the load and all four (`session.js`). The rail
   reports which, and how long it took, on every update.

Measured on a mid-range laptop: a full four-scenario re-solve is ~75 ms warm, so
the coarse controls land 4–8 updates a second and the cheap ones 12–15. The
Engine tab reports all of this live — if a change makes the page feel sluggish,
that tab will say which of the three mechanisms stopped doing its job.

**A performance trap worth knowing about.** The per-hour flow record and the
per-day cost record are written as single object literals. Building either by
assigning keys in a loop leaves it in V8 dictionary mode, and since the run
touches those objects 525,600 times per scenario, that alone took the model from
74 ms to 436 ms. If a run suddenly gets slow, look there first.

## The two interfaces that matter

Spec §9 asks for the model to be LP-ready from day one, so two contracts are
fixed and everything else is built behind them:

- **`solveWindow(problem, state) → flows[]`** in `solver.js`. The heuristic is
  one implementation. An LP would be another, consuming the same `problem`
  object — hourly load, solar, grid limits, asset parameters, prices.
- **`costOf(flows, problem)`** in `cost.js` scores any solver's output on
  identical terms, so a future LP is directly comparable to the heuristic
  without re-deriving anything.

Demand charges are already expressed as monthly billing determinants
(`tariff.js`), which is the form an LP needs: linear as an epigraph variable per
month, with the ratchet carried as a rolling-horizon parameter.

## Reading the page

Seven tabs. **Overview** carries the headline numbers, a live single-line diagram
whose ribbon widths are each source's share of energy served, and cumulative
cash. **Lifecycle** is the asset timeline and installed capacity against facility
peak. **Dispatch** is one day hour by hour, plus a grid-import duration curve and
an hour-by-month heatmap of the final year — the two charts that show what the
battery does to the billed peak. **Economics**, **Reliability** and **Tradeoff**
carry the cost engine, the §4.6 checks and the §6 frontier. **Assumptions**
renders the open-items register and the synthesised weather. **Engine** draws
the request path itself — the coalescing queue, the transport, the dependency
cache — with its real counters on it, so dragging a control shows you the queue
filling, superseding and draining rather than leaving you to trust that it does.

## Keeping the demo honest

- **The weather is synthesised, not measured.** A clear-sky model modulated by a
  seeded clearness process, calibrated so annual GHI, DNI, diffuse fraction and
  temperature extremes land within a few percent of NSRDB's Dulles values. Swap
  in a real TMY3 file before a number goes in front of a customer; nothing else
  in the model changes.
- **Open items surface themselves.** The Assumptions tab renders directly from
  `OPEN_ITEMS` in `config.js`. A `[VALIDATE]` default cannot quietly become an
  unmarked one.
- **Failures are shown, not smoothed.** Unserved energy, reserve shortfalls and
  permit-hour gaps are reported per scenario. Several are non-zero by design —
  the gas bridge alone cannot hold the step-swing reserve for an AI training
  load, and scenarios without a battery cannot cover the shed window. Those are
  results, not bugs.

## Verifying a change

```bash
# From the repository root — a full run, all three presets, with §4.6 checks.
node --input-type=module -e "
import {runAll} from './demo/js/model.js';
import {DEFAULTS, HORIZON_MONTHS} from './demo/js/config.js';
for (const p of ['colo-mixed','ai-inference','ai-training']) {
  const R = runAll({...DEFAULTS, workloadPreset: p, horizonMonths: HORIZON_MONTHS});
  console.log(p, R.checks.map(c => (c.pass ? '✓' : '✗') + c.id).join(' '));
}"
```
