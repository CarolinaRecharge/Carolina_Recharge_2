# carolinarecharge.com/demo/ — Site Energy Model

An interactive demonstration of the Site Energy Model, built to design spec v0.3.
It runs a 15-year, hourly simulation of four ways to power a grid-constrained
100 MW campus in Northern Virginia, and recomputes everything from the physics
whenever a control moves. A full run — 131,400 hours × 4 scenarios plus a
20-point tradeoff sweep — takes well under a second in the browser.

Nothing is precomputed and nothing is stored server-side. The page is static
files.

## Deploying

**Nothing to configure.** The demo lives at `/demo/` on the main site, so
whatever deploys the repository root already publishes it. No build command, no
output directory, no separate project, no DNS record.

It draws its logo and icons from `../images/`, the same files the marketing site
uses, so there is one copy of each brand asset and nothing to keep in sync.

Local preview needs an HTTP server rather than opening the file directly,
because the page uses ES modules:

```bash
python3 -m http.server 8000   # from the repository root
# then http://localhost:8000/demo/
```

The page carries `<meta name="robots" content="noindex, nofollow">`, so it will
not turn up in search or dilute the marketing site's ranking. Nothing on the
main site links to it — reach it by URL. Take the meta tag out and add a link
only if the demo is meant to be found.

**If it ever moves to its own subdomain,** the simplest route is to add the
domain to the same project and rewrite `/` to `/demo/` for that host — the
relative asset paths keep working. A separate project with Root Directory set to
`demo` would not: that would need the four brand assets copied into `demo/` and
the paths changed from `../images/` to `images/`.

## Layout

```
demo/
  index.html      page shell — header, control rail, tab panels, footer
  demo.css        all styles; brand tokens match ../styles.css
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
    charts.js     hand-rolled SVG charts and the validated palette
    app.js        UI wiring only; no arithmetic that matters
```

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
