# demo.carolinarecharge.com — Site Energy Model

An interactive demonstration of the Site Energy Model, built to design spec v0.3.
It runs a 15-year, hourly simulation of four ways to power a grid-constrained
100 MW campus in Northern Virginia, and recomputes everything from the physics
whenever a control moves. A full run — 131,400 hours × 4 scenarios plus a
20-point tradeoff sweep — takes well under a second in the browser.

Nothing is precomputed and nothing is stored server-side. The page is static
files.

## Deploying to the subdomain

The demo is self-contained: `demo/` has its own copy of the brand assets it
needs and no path escapes the directory. There are two ways to serve it.

**As a separate Vercel project (recommended for a subdomain).**
Create a project from this repository with **Root Directory = `demo`**, add
`demo.carolinarecharge.com` as a domain, and point a CNAME at Vercel. No build
command and no output directory — it is plain static output.

**As a path on the main site.** Deploying the repository root also serves the
demo at `carolinarecharge.com/demo/`. To put that path behind the subdomain
instead, add the domain to the existing project and rewrite `/` to `/demo/` for
that host.

Either way the demo needs **no build step, no npm install and no server**. It
does need to be served over HTTP rather than opened from the filesystem, because
it uses ES modules — `python3 -m http.server` is enough for local preview.

The page carries `<meta name="robots" content="noindex, nofollow">`. Take that
out only if the demo is meant to be found by search.

## Layout

```
demo/
  index.html      page shell — header, control rail, tab panels, footer
  demo.css        all styles; brand tokens match ../styles.css
  images/         copies of the brand assets, so the directory can deploy alone
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

`images/` duplicates four files from `../images/`. If the logo or the favicon is
ever regenerated, copy them across — the originals stay the source of truth.

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
