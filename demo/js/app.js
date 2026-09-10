// UI layer. It owns no arithmetic that matters: every number here arrives from
// the model, which runs in a worker so that dragging a control never competes
// with solving for the main thread.
//
// Each tab is split in two. `mount` builds its DOM once, when the tab is first
// shown. `paint` writes the current answer into that DOM and redraws its
// charts. A slider drag calls `paint` many times a second and `mount` not at
// all, which is what keeps the page tracking the thumb.

import {
  DEFAULTS, PRESETS, OPEN_ITEMS, SITE, TARIFF, FUEL, FINANCE, STRESS,
  NG_BRIDGE, DF_BACKUP, BESS, SOLAR, HORIZON_MONTHS, HORIZON_YEARS,
} from './config.js';
import { SCENARIOS } from './lifecycle.js';
import { createRunner } from './runner.js';
import { money, num, int, MONTH_ABBR } from './util.js';
import {
  PALETTE, renderLines, renderStackedArea, renderGroupedBars, renderStackedBarsH,
  renderFrontier, renderTimeline, renderHeatmap, renderRangeBand,
  legend, sparkline, meter, rampLegend,
} from './charts.js';
import { renderSchematic } from './schematic.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (s, r = document) => r.querySelector(s);

const inputs = { ...DEFAULTS, horizonMonths: HORIZON_MONTHS };
let P = null;                 // latest payload from the model
let SWEEP = null;             // latest tradeoff sweep
let sweepKey = null;
let active = 'overview';
let mounted = {};
let schematicScenario = 'hybrid';
let sampleKey = null;
let dragging = false;

const SC = PALETTE.scenario;
const D = PALETTE.dispatch;
const label = (k) => SCENARIOS.find((s) => s.key === k).label;
const short = (k) => SCENARIOS.find((s) => s.key === k).short;
const perMWh = (v) => `$${num(v, 1)}`;
const mw = (v) => `${num(v, 1)} MW`;
const dot = (c) => `<span class="dot" style="background:${c}"></span>`;
const YEAR_TICKS = Array.from({ length: HORIZON_YEARS }, (_, i) => ({ v: i * 12, label: `Y${i + 1}` }));
const CONTRACTS = [55, 65, 75, 85, 95, 100];
const RETAINED = [0, 10, 20, 30];

// ── Runner ──────────────────────────────────────────────────────────────────
const runner = createRunner((payload) => {
  P = payload;
  if (payload.sweep) { SWEEP = payload.sweep; sweepKey = sweepFingerprint(); }
  paintTick(payload);
  render();
}, (err) => {
  $('#tick').textContent = 'model error';
  console.error(err);
});

function sweepFingerprint() {
  return [inputs.workloadPreset, inputs.gridEnergizationMonth, inputs.hybridFirstPowerMonth,
    inputs.bessMWPerPhase, inputs.bessHours, inputs.solarMWdc, inputs.dieselAsBridgeReserve].join('|');
}

function request(withSweep) {
  const wantSweep = withSweep && active === 'tradeoff';
  runner.request(inputs, wantSweep ? { contracts: CONTRACTS, retained: RETAINED } : null);
}

function paintTick(p) {
  const t = $('#tick');
  const scen = p.recomputed.filter((x) => SCENARIOS.some((s) => s.key === x)).length;
  const what = !p.recomputed.length ? 'cached'
    : p.recomputed.includes('weather+load') ? 'full rebuild'
    : `${scen} scenario${scen === 1 ? '' : 's'}`;
  t.textContent = `${p.ms.toFixed(0)} ms · ${what}`;
  t.classList.add('live');
  clearTimeout(paintTick.timer);
  paintTick.timer = setTimeout(() => t.classList.remove('live'), 400);
}

// ── Controls ────────────────────────────────────────────────────────────────
const SLIDERS = [
  ['#c-grid', 'gridEnergizationMonth', '#v-grid', (v) => `M${v}`],
  ['#c-first', 'hybridFirstPowerMonth', '#v-first', (v) => `M${v}`],
  ['#c-contract', 'contractedDemandPct', '#v-contract', (v) => `${v}%`],
  ['#c-bess', 'bessMWPerPhase', '#v-bess', (v) => `${num(v, 0)} MW`],
  ['#c-hours', 'bessHours', '#v-hours', (v) => `${num(v, 1)} h`],
  ['#c-retain', 'retainedGasMW', '#v-retain', (v) => `${num(v, 0)} MW`],
  ['#c-solar', 'solarMWdc', '#v-solar', (v) => `${num(v, 0)} MWdc`],
];

function buildControls() {
  $('#preset-seg').innerHTML = Object.entries(PRESETS)
    .map(([k, p]) => `<button type="button" data-preset="${k}" aria-pressed="${k === inputs.workloadPreset}">${p.label}</button>`)
    .join('');
  $('#preset-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-preset]');
    if (!b) return;
    inputs.workloadPreset = b.dataset.preset;
    syncControls();
    request(true);
  });

  for (const [sel, key] of SLIDERS) {
    const node = $(sel);
    node.addEventListener('pointerdown', () => { dragging = true; });
    node.addEventListener('input', () => {
      inputs[key] = +node.value;
      // First power has to precede energization or the bridge has no job to do.
      if (key === 'gridEnergizationMonth') {
        inputs.hybridFirstPowerMonth = Math.min(inputs.hybridFirstPowerMonth, inputs.gridEnergizationMonth - 6);
      }
      if (key === 'hybridFirstPowerMonth') {
        inputs.hybridFirstPowerMonth = Math.min(inputs.hybridFirstPowerMonth, inputs.gridEnergizationMonth - 6);
      }
      syncControls();
      request(false);
    });
    // The sweep is 20 more model runs, so it waits for the thumb to settle.
    const settle = () => { dragging = false; request(true); };
    node.addEventListener('change', settle);
    node.addEventListener('pointerup', settle);
  }

  $('#c-reserve').addEventListener('change', (e) => {
    inputs.dieselAsBridgeReserve = e.target.checked;
    request(true);
  });
  $('#btn-reset').addEventListener('click', () => {
    Object.assign(inputs, DEFAULTS, { horizonMonths: HORIZON_MONTHS });
    syncControls();
    request(true);
  });
  $('#btn-export').addEventListener('click', exportJSON);

  $('#tabs').innerHTML = TAB_LIST.map(([k, l]) =>
    `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === active}">${l}</button>`).join('');
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    active = b.dataset.tab;
    $('#tabs').querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x.dataset.tab === active));
    TAB_LIST.forEach(([k]) => { $(`#p-${k}`).hidden = k !== active; });
    if (active === 'tradeoff' && sweepKey !== sweepFingerprint()) request(true);
    render();
  });
}

function syncControls() {
  $('#preset-seg').querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.preset === inputs.workloadPreset));
  for (const [sel, key, out, fmt] of SLIDERS) {
    $(sel).value = inputs[key];
    $(out).textContent = fmt(inputs[key]);
  }
  $('#c-reserve').checked = inputs.dieselAsBridgeReserve;
}

// ── Render loop ─────────────────────────────────────────────────────────────
const TAB_LIST = [
  ['overview', 'Overview'], ['lifecycle', 'Lifecycle'], ['dispatch', 'Dispatch'],
  ['economics', 'Economics'], ['reliability', 'Reliability'], ['tradeoff', 'Tradeoff'],
  ['assumptions', 'Assumptions'],
];

let frameQueued = false;
function render() {
  if (!P || frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    paintHead();
    const tab = TABS[active];
    const host = $(`#p-${active}`);
    if (!mounted[active]) { host.innerHTML = tab.mount(); tab.wire?.(host); mounted[active] = true; }
    tab.paint(host);
  });
}

function paintHead() {
  const d = P.derived;
  $('#head-meta').innerHTML = [
    `<b>100 MW</b> facility peak`,
    `<b>${num(d.mwIT, 1)} MW</b> IT capacity`,
    `<b>${num(d.loadFactor * 100, 0)}%</b> load factor`,
    `${SITE.utility} · ${SITE.rateClass}`,
    `<b>${int(HORIZON_YEARS * 8760)}</b> h × 4 scenarios`,
    `solved in <b>${num(P.ms, 0)} ms</b>${runner.usingWorker ? ' off-thread' : ''}`,
  ].map((s) => `<span>${s}</span>`).join('');
}

// ── Shared fragments ────────────────────────────────────────────────────────
function kpi(id, k) {
  return `<div class="kpi" id="${id}"><div class="kpi-k">${k}</div>
    <div class="kpi-row"><div class="kpi-v"></div><div class="kpi-spark"></div></div>
    <div class="kpi-d"></div></div>`;
}
function fillKpi(host, id, value, spark, desc) {
  const n = $(`#${id}`, host);
  $('.kpi-v', n).innerHTML = value;
  $('.kpi-spark', n).innerHTML = spark || '';
  $('.kpi-d', n).innerHTML = desc;
}
const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;

// ══════════════════════════════════════════════════════════════════ OVERVIEW
const TABS = {};

TABS.overview = {
  mount: () => `
    <div class="kpis">
      ${kpi('k-first', 'Time to first power')}
      ${kpi('k-mwmo', 'IT capacity sold sooner')}
      ${kpi('k-cost', 'Blended cost of energy')}
      ${kpi('k-npv', '15-year NPV, net of revenue')}
    </div>

    <div class="card">
      <div class="card-head">
        <div><div class="eyebrow">Single line, live</div><h2 class="sec">What is feeding the site</h2></div>
        <div class="seg" id="sch-seg">${SCENARIOS.map((s) =>
          `<button type="button" data-sch="${s.key}" aria-pressed="${s.key === schematicScenario}">${s.short}</button>`).join('')}</div>
      </div>
      <div id="sch-host"></div>
      <p class="note" id="sch-note" style="margin-top:6px"></p>
    </div>

    <div class="g-2-1">
      <div class="card">
        <div class="eyebrow">Cumulative cash</div><h2 class="sec">Revenue less total cost, from NTP</h2>
        <div class="viz" id="viz-cash"></div><div id="leg-cash"></div>
        <p class="note" id="cash-note" style="margin-top:8px"></p>
      </div>
      <div class="card">
        <h3 class="sub">Utility dependency</h3>
        <p class="note">Three measures, because they move independently.</p>
        <div id="meters" style="margin-top:14px"></div>
        <p class="note" id="dep-note" style="margin-top:14px"></p>
      </div>
    </div>

    <div class="card">
      <div class="eyebrow">The four scenarios</div><h2 class="sec">What each way of building costs</h2>
      <p class="lede" id="sc-lede"></p>
      <div class="grid2" style="margin-top:14px">
        <div><div class="viz" id="viz-permwh-cmp"></div></div>
        <div><div class="viz" id="viz-npv-cmp"></div></div>
      </div>
      <div class="tblwrap" style="margin-top:14px" id="sc-table"></div>
      <p class="note" style="margin-top:10px">
        Blended cost is total customer cost — grid bill, fuel, rent, operations and capital — divided by
        facility energy served. Reserve shortfalls are hours in which the islanded fleet could not hold the
        contingency reserve §4.3 requires; unserved energy is load the site could not carry at all.
      </p>
    </div>`,

  wire(host) {
    $('#sch-seg', host).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sch]');
      if (!b) return;
      schematicScenario = b.dataset.sch;
      $('#sch-seg', host).querySelectorAll('button').forEach((x) =>
        x.setAttribute('aria-pressed', x.dataset.sch === schematicScenario));
      render();
    });
  },

  paint(host) {
    const wait = P.results.wait, hy = P.results.hybrid, br = P.results.bridge;
    const monthsEarlier = wait.firstPowerMonth - hy.firstPowerMonth;
    const itMWMonths = hy.totals.itMWMonths - wait.totals.itMWMonths;
    const best = Object.values(P.results).reduce((a, b) => (b.npvNet > a.npvNet ? b : a));

    fillKpi(host, 'k-first', `${monthsEarlier}<small>mo earlier</small>`,
      sparkline(hy.life.months.map((m) => m.itFrac), SC.hybrid),
      `Hybrid energizes at <b>M${hy.firstPowerMonth}</b> against <b>M${wait.firstPowerMonth}</b> waiting for the grid.`);
    fillKpi(host, 'k-mwmo', `${int(itMWMonths)}<small>MW-mo</small>`,
      sparkline(hy.cumulative.map((v, i) => v - wait.cumulative[i]), SC.hybrid),
      `Revenue-carrying IT capacity the wait case never earns, at <b>$${FINANCE.itRevenuePerKWMoIT}/kW-mo</b>.`);
    fillKpi(host, 'k-cost', `${perMWh(hy.blendedPerMWh)}<small>/MWh</small>`,
      sparkline(hy.annual.filter((a) => a.loadMWh > 0).map((a) => a.perMWh), SC.hybrid),
      `Against <b>${perMWh(wait.blendedPerMWh)}</b> waiting and <b>${perMWh(br.blendedPerMWh)}</b> on the bridge alone.`);
    fillKpi(host, 'k-npv', money(hy.npvNet), sparkline(hy.cumulative, SC.hybrid),
      `<b>${money(hy.npvNet - wait.npvNet)}</b> ahead of waiting, discounted at ${FINANCE.discountRatePct}%.`);

    drawSchematic(host);

    // Cumulative cash.
    const xs = Array.from({ length: HORIZON_MONTHS }, (_, i) => i);
    const series = SCENARIOS.map((s) => ({
      label: s.short, color: SC[s.key], values: P.results[s.key].cumulative,
    }));
    renderLines($('#viz-cash', host), {
      x: xs, series, height: 260, xTicks: YEAR_TICKS, directLabels: false,
      yFmt: (v) => money(v), yLabel: 'Cumulative $',
      xLabelFmt: (m) => `Month ${m} · Y${Math.floor(m / 12) + 1} ${MONTH_ABBR[m % 12]}`,
    });
    $('#leg-cash', host).innerHTML = legend(series);
    $('#cash-note', host).innerHTML =
      `The wait case spends nothing for ${wait.firstPowerMonth} months and earns nothing either. Every other
       line pays for a bridge and starts earning against it.${inputs.retainedGasMW === 0
        ? ' At 0 MW retained the retained-gas line sits exactly on the hybrid line — move that control to separate them.' : ''}`;

    // Dependency meters.
    const m = SCENARIOS.map((s) => {
      const r = P.results[s.key];
      return meter(r.gridSharePct / 100, `${short(s.key)} — grid share of energy served`,
        `${num(r.gridSharePct, 1)}%`, SC[s.key]);
    });
    $('#meters', host).innerHTML = m.join('') + `<div class="tblwrap" style="margin-top:16px">
      <table class="data"><thead><tr><th>Scenario</th><th>Contracted</th><th>Peak drawn</th>
      <th>Never used</th><th>Island hrs</th></tr></thead><tbody>
      ${SCENARIOS.map((s) => {
        const r = P.results[s.key];
        const full = r.life.months[r.life.months.length - 1];
        const unused = Math.max(0, full.contractedMW - r.finalYear.gridPeak);
        return `<tr><td>${dot(SC[s.key])}${short(s.key)}</td>
          <td>${num(full.contractedMW, 0)} MW</td><td>${num(r.finalYear.gridPeak, 1)} MW</td>
          <td>${num(unused, 1)} MW</td><td>${num(islandHours(r), 0)} h</td></tr>`;
      }).join('')}</tbody></table></div>`;
    $('#dep-note', host).innerHTML =
      `"Never used" is contracted capacity the site never drew — still billed under the
       ${num(TARIFF.contractMinGenFrac * 100, 0)}% minimum. Island hours are how long the site can run at its
       critical floor on stored fuel and stored energy alone.`;

    // Comparison charts.
    const groups = SCENARIOS.map((s) => s.short);
    renderGroupedBars($('#viz-permwh-cmp', host), {
      groups, height: 190, yFmt: (v) => perMWh(v), yLabel: '$/MWh, 15-year blended',
      series: [{ label: 'Blended cost', color: PALETTE.ink.secondary,
        values: SCENARIOS.map((s) => P.results[s.key].blendedPerMWh) }],
      colorByGroup: SCENARIOS.map((s) => SC[s.key]),
      groupTick: (g) => g, groupLabel: (g) => g,
    });
    renderGroupedBars($('#viz-npv-cmp', host), {
      groups, height: 190, yFmt: (v) => money(v), yLabel: 'NPV, net of revenue',
      series: [{ label: 'NPV', color: PALETTE.ink.secondary,
        values: SCENARIOS.map((s) => P.results[s.key].npvNet) }],
      colorByGroup: SCENARIOS.map((s) => SC[s.key]),
      groupTick: (g) => g, groupLabel: (g) => g,
    });

    $('#sc-lede', host).innerHTML =
      `Every scenario serves the same load under the same weather and the same tariff. They differ only in
       what generates the power and when it arrives. On these assumptions <b>${label(best.key)}</b> carries the
       highest 15-year NPV, ${money(best.npvNet - wait.npvNet)} ahead of waiting.`;
    $('#sc-table', host).innerHTML = scenarioTable();
  },
};

/** Hours the site can run islanded at its critical floor on what is on site. */
function islandHours(r) {
  const full = r.life.months[r.life.months.length - 1];
  const criticalMW = PRESETS[inputs.workloadPreset].criticalFrac * inputs.facilityPeakMW;
  if (criticalMW <= 0) return 0;
  const tankMMBtu = (full.dieselUnits * DF_BACKUP.ratedKW * 9400 * DF_BACKUP.onSiteDieselHours) / 1e6;
  const burn = (Math.min(criticalMW, full.dieselCapMW) * 1000 * 9400) / 1e6;
  return (burn > 0 ? tankMMBtu / burn : 0) + full.bessMWh / criticalMW;
}

function drawSchematic(host) {
  const r = P.results[schematicScenario];
  const full = r.life.months[r.life.months.length - 1];
  const peakGasMW = Math.max(...r.life.months.map((x) => x.gasCapMW));
  const t = r.totals;
  const served = t.gridMWh + t.gasMWh + t.solarMWh + t.dieselMWh;
  const share = (v) => (served > 0 ? (100 * v) / served : 0);

  renderSchematic($('#sch-host', host), {
    ariaLabel: `Single-line diagram for the ${label(schematicScenario)} scenario`,
    sources: [
      { key: 'grid', installedMW: full.gridLimitMW, sharePct: share(t.gridMWh),
        active: full.gridLimitMW > 0, badge: `M${inputs.gridEnergizationMonth}` },
      { key: 'gas', installedMW: peakGasMW, sharePct: share(t.gasMWh),
        active: peakGasMW > 0, badge: r.life.hasGas ? `${r.peakGasUnits} units` : null },
      { key: 'solar', installedMW: full.solarMWdc, sharePct: share(t.solarMWh),
        active: full.solarMWdc > 0, badge: full.solarMWdc > 0 ? `M${r.life.solarMonth}` : null },
      { key: 'diesel', installedMW: full.dieselCapMW, sharePct: share(t.dieselMWh),
        active: full.dieselCapMW > 0, badge: `${full.dieselUnits} units` },
    ],
    storage: {
      powerMW: full.bessMW, energyMWh: full.bessMWh,
      throughputPct: share(t.bessOutMWh), active: full.bessMW > 0,
      badge: full.bessMW > 0 ? `${num(inputs.bessHours, 1)} h` : null,
    },
    loadMW: `${num(P.derived.simulatedPeakMW, 0)} MW peak`,
    loadLabel: `${num(P.derived.mwIT, 1)} MW IT · PUE ${num(P.derived.pueDesign, 2)} at design`,
    loadNote: `${int(t.loadMWh / 1000)} GWh over 15 years`,
  });

  $('#sch-note', host).innerHTML =
    `Ribbon thickness is each source's share of the energy served across the whole horizon, so the picture
     changes shape as the controls move. Sources meet on a common bus; storage sits on it in both directions.
     ${r.life.hasGas
      ? `Gas carries <b>${num(share(t.gasMWh), 1)}%</b> here and demobilizes at <b>M${r.life.gasEndMonth}</b>.`
      : 'This scenario has no on-site generation until the grid arrives.'}`;
}

function scenarioTable() {
  const rows = SCENARIOS.map((s) => {
    const r = P.results[s.key];
    const bad = r.totals.unservedMWh > 0.5 || r.totals.reserveShortHours > 0;
    return `<tr${s.key === 'hybrid' ? ' class="best"' : ''}>
      <td>${dot(SC[s.key])}${s.label}</td>
      <td>M${r.firstPowerMonth}</td><td>${perMWh(r.blendedPerMWh)}</td>
      <td>${money(r.totals.total)}</td><td>${money(r.totals.revenue)}</td><td>${money(r.npvNet)}</td>
      <td>${r.peakGasUnits || '—'}</td><td>${num(r.gridSharePct, 1)}%</td>
      <td style="color:${bad ? PALETTE.status.fail : PALETTE.status.pass};font-weight:650">
        ${bad ? `${num(r.totals.unservedMWh, 0)} MWh · ${int(r.totals.reserveShortHours)} h` : 'clean'}</td></tr>`;
  }).join('');
  return `<table class="data"><thead><tr><th>Scenario</th><th>First power</th><th>$/MWh</th>
    <th>15-yr cost</th><th>15-yr revenue</th><th>NPV net</th><th>Gas units</th><th>Grid share</th>
    <th>Unserved · reserve short</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ═════════════════════════════════════════════════════════════════ LIFECYCLE
TABS.lifecycle = {
  mount: () => `
    <div class="card">
      <div class="eyebrow">§2 lifecycle layer · §3.8 events</div><h2 class="sec">What is on site, and when</h2>
      <p class="lede" id="lc-lede"></p>
      <div class="viz" id="viz-timeline" style="margin-top:14px"></div>
    </div>
    <div class="card">
      <div class="eyebrow">Installed capacity</div><h2 class="sec">Firm capacity against facility peak</h2>
      <div class="viz" id="viz-cap"></div><div id="leg-cap"></div>
      <p class="note" id="cap-note" style="margin-top:8px"></p>
    </div>
    <div class="grid2">
      <div class="card"><h3 class="sub">Rented fleet, by scenario</h3>
        <p class="note">What the customer pays rent on, and what it frees for the next site (§5 company view).</p>
        <div class="tblwrap" style="margin-top:10px" id="fleet-table"></div></div>
      <div class="card"><h3 class="sub">Capital laid down</h3>
        <p class="note">Customer-owned assets. The gas fleet is company-owned and rented, so it never appears here.</p>
        <div class="viz" id="viz-capex" style="margin-top:10px"></div><div id="leg-capex"></div></div>
    </div>`,

  paint(host) {
    const hy = P.results.hybrid, L = hy.life;
    $('#lc-lede', host).innerHTML =
      `The hybrid timeline. Each band is an asset class; the dashed markers are the two dates the whole model
       turns on. Gas units stay ${inputs.gasOverlapMonths} months past energization to cover commissioning and
       grid shakedown, then demobilize and become available for the next site.`;

    const gasEnd = Math.min(HORIZON_MONTHS, L.gasEndMonth);
    renderTimeline($('#viz-timeline', host), {
      months: HORIZON_MONTHS - 1,
      markers: [
        { month: L.firstPower, label: `M${L.firstPower} first power` },
        { month: inputs.gridEnergizationMonth, label: `M${inputs.gridEnergizationMonth} grid` },
      ],
      rows: [
        { label: 'IT capacity', color: PALETTE.ink.primary, bars: L.phaseMonths.map((m, i) => ({
          start: m, end: HORIZON_MONTHS, opacity: 0.22 + i * 0.2,
          note: `Phase ${i + 1} — ${num(P.derived.mwIT / 4, 1)} MW IT from M${m}` })) },
        { label: 'Gas bridge', color: D.gas, bars: [{ start: L.firstPower, end: gasEnd,
          note: `${L.gasUnitsByPhase[3]} units at peak · demobilized M${L.gasEndMonth}` }].concat(
          inputs.retainedGasMW > 0 ? [{ start: gasEnd, end: HORIZON_MONTHS, opacity: 0.45,
            note: `${num(inputs.retainedGasMW, 0)} MW retained long-term` }] : []) },
        { label: 'Battery', color: D.bess, bars: inputs.bessMWPerPhase > 0 ? L.phaseMonths.map((m, i) => ({
          start: m, end: HORIZON_MONTHS, opacity: 0.25 + i * 0.19,
          note: `${num(inputs.bessMWPerPhase * (i + 1), 0)} MW / ${num(inputs.bessMWPerPhase * (i + 1) * inputs.bessHours, 0)} MWh from M${m}` })) : [] },
        { label: 'Solar', color: D.solar, bars: inputs.solarMWdc > 0
          ? [{ start: L.solarMonth, end: HORIZON_MONTHS, note: `${inputs.solarMWdc} MWdc from M${L.solarMonth}` }] : [] },
        { label: 'Dual-fuel backup', color: D.diesel, bars: L.phaseMonths.map((m, i) => ({
          start: m, end: HORIZON_MONTHS, opacity: 0.25 + i * 0.19, note: `Backup sized to IT phase ${i + 1}` })) },
        { label: 'Grid', color: D.grid, bars: [{ start: inputs.gridEnergizationMonth, end: HORIZON_MONTHS,
          note: `${num(inputs.facilityPeakMW, 0)} MW available · ${inputs.contractedDemandPct}% contracted` }] },
      ],
    });

    const xs = Array.from({ length: HORIZON_MONTHS }, (_, i) => i);
    const series = [
      { label: 'Grid contract', color: D.grid, values: hy.life.months.map((m) => m.gridLimitMW) },
      { label: 'Gas bridge', color: D.gas, values: hy.life.months.map((m) => m.gasCapMW) },
      { label: 'Battery power', color: D.bess, values: hy.life.months.map((m) => m.bessMW) },
      { label: 'Backup', color: D.diesel, values: hy.life.months.map((m) => m.dieselCapMW) },
    ];
    const overlay = { label: 'Facility peak', color: PALETTE.ink.primary, values: hy.peakLoadByMonth };
    renderStackedArea($('#viz-cap', host), {
      x: xs, series, overlay, height: 250, xTicks: YEAR_TICKS,
      yFmt: (v) => num(v, 0), tipFmt: (v) => mw(v), yLabel: 'MW', xLabelFmt: (m) => `Month ${m}`,
    });
    $('#leg-cap', host).innerHTML = legend([...series, { ...overlay, dashed: true }]);
    $('#cap-note', host).innerHTML =
      `The dashed line is the facility peak the site has to carry that month; everything below it is what can
       carry it. Backup is stacked because it is installed, not because it runs — and the spike at
       energization is real: for ${inputs.gasOverlapMonths} months the grid and the full gas fleet are both on
       site before the units leave.`;

    $('#fleet-table', host).innerHTML = fleetTable();

    const items = Object.entries(hy.capexItems).filter(([k]) => !k.startsWith('Gas'));
    const colors = { 'Dual-fuel backup': D.diesel, BESS: D.bess, Solar: D.solar };
    renderStackedBarsH($('#viz-capex', host), {
      rows: [{ label: 'Hybrid', segments: items.map(([k, v]) => ({ label: k, color: colors[k] || PALETTE.ink.muted, value: v })) }],
      xFmt: (v) => money(v), height: 88,
    });
    $('#leg-capex', host).innerHTML = legend(items.map(([k, v]) =>
      ({ label: `${k} — ${money(v)}`, color: colors[k] || PALETTE.ink.muted })));
  },
};

function fleetTable() {
  const rows = SCENARIOS.filter((s) => P.results[s.key].peakGasUnits > 0).map((s) => {
    const r = P.results[s.key];
    return `<tr><td>${dot(SC[s.key])}${s.short}</td><td>${r.peakGasUnits}</td>
      <td>${int(r.gasUnitMonths)}</td><td>${money(r.totals.rent)}</td><td>M${r.redeployMonth}</td></tr>`;
  }).join('');
  return `<table class="data"><thead><tr><th>Scenario</th><th>Peak units</th><th>Unit-months on rent</th>
    <th>15-yr rent</th><th>Redeploy available</th></tr></thead><tbody>${rows ||
      '<tr><td colspan="5">No rented fleet in any scenario.</td></tr>'}</tbody></table>`;
}

// ══════════════════════════════════════════════════════════════════ DISPATCH
const SAMPLE_LABELS = {
  'bridge-summer': 'Bridge · summer day',
  'bridge-event': 'Bridge · gas interruption',
  'grid-summer': 'Grid · summer day, full build',
  'grid-outage': 'Grid · outage or curtailment',
};

TABS.dispatch = {
  mount: () => `
    <div class="card">
      <div class="card-head">
        <div><div class="eyebrow">§4.3 hourly sequence</div><h2 class="sec">One day, hour by hour</h2></div>
        <div class="seg" id="sample-seg"></div>
      </div>
      <p class="lede" id="day-blurb"></p>
      <div class="viz" id="viz-day" style="margin-top:12px"></div><div id="leg-day"></div>
      <p class="note" id="day-note" style="margin-top:8px"></p>
      <h3 class="sub" style="margin-top:22px">State of charge</h3>
      <p class="note">On its own axis: MW and MWh do not share a scale. The floor is the reserve §10's
        dual-use rule holds back from peak shaving.</p>
      <div class="viz" id="viz-soc" style="margin-top:8px"></div>
    </div>

    <div class="grid2">
      <div class="card">
        <div class="eyebrow">Final year</div><h2 class="sec">Grid import duration curve</h2>
        <p class="note">Every hour of the last year, sorted highest to lowest. Where a line starts is the
          billed peak; how fast it falls is how much of the year sits near it.</p>
        <div class="viz" id="viz-duration" style="margin-top:10px"></div><div id="leg-duration"></div>
        <p class="note" id="dur-note" style="margin-top:8px"></p>
      </div>
      <div class="card">
        <div class="eyebrow">Final year, hybrid</div><h2 class="sec">Grid import by hour and month</h2>
        <p class="note">Mean import in each hour of each month. The pale band across summer afternoons is the
          battery discharging against the demand charge.</p>
        <div class="viz" id="viz-heat" style="margin-top:10px"></div><div id="leg-heat"></div>
      </div>
    </div>

    <div class="card">
      <h3 class="sub">Merit order</h3>
      <p class="lede">
        There is one merit order and the phases fall out of it rather than being switched between (§4.1).
        Solar first, then the grid up to <span class="mono">min(available, contracted)</span>, then the battery
        against its daily plan, then gas commitment with the battery counted as reserve, then surplus to
        storage and finally curtailment. Anything still short is flagged unserved rather than quietly absorbed.
      </p>
      <div class="tblwrap" style="margin-top:12px" id="day-table"></div>
    </div>`,

  wire(host) {
    $('#sample-seg', host).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sample]');
      if (!b) return;
      sampleKey = b.dataset.sample;
      render();
    });
  },

  paint(host) {
    const hy = P.results.hybrid;
    const keys = Object.keys(SAMPLE_LABELS).filter((k) => hy.sampleDays && hy.sampleDays[k]);
    if (!sampleKey || !keys.includes(sampleKey)) sampleKey = keys[0];
    $('#sample-seg', host).innerHTML = keys.map((k) =>
      `<button type="button" data-sample="${k}" aria-pressed="${k === sampleKey}">${SAMPLE_LABELS[k]}</button>`).join('');

    const day = sampleKey ? hy.sampleDays[sampleKey] : null;
    if (!day) {
      $('#day-blurb', host).textContent = 'No day of this kind occurs under the current settings.';
      $('#viz-day', host).innerHTML = ''; $('#viz-soc', host).innerHTML = '';
      $('#day-table', host).innerHTML = ''; $('#leg-day', host).innerHTML = '';
    } else {
      const c = day.cfg;
      $('#day-blurb', host).innerHTML =
        `Month ${day.month} — ${c.gridLimitMW <= 0 ? 'islanded on the gas bridge' : `grid contract ${num(c.gridLimitMW, 0)} MW`},
         ${num(c.itFrac * 100, 0)}% of IT capacity online, ${c.gasUnits} gas units installed,
         ${num(c.bessMW, 0)} MW / ${num(c.bessMWh, 0)} MWh of storage and ${c.dieselUnits} backup units.`;
      drawDay(host, day);
      $('#day-note', host).innerHTML =
        `Where the stack sits above the load line, generation is running above what the site is drawing and the
         surplus is going into the battery — either because a gas unit is pinned at its
         ${num(NG_BRIDGE.minLoadFrac * 100, 0)}% minimum load, or because the daily plan is refilling in a slack
         hour. Charging never rises above the threshold the day is being flattened to, so it cannot create the
         peak the battery is there to remove.`;
      $('#day-table', host).innerHTML = dayTable(day);
    }

    // Duration curves.
    const n = 180;
    const xs = Array.from({ length: n }, (_, i) => (100 * i) / (n - 1));
    const dseries = SCENARIOS.map((s) => ({
      label: short(s.key), color: SC[s.key], values: P.results[s.key].finalYear.gridDuration,
    }));
    renderLines($('#viz-duration', host), {
      x: xs, series: dseries, height: 230, yMin: 0, directLabels: false,
      xTicks: [0, 25, 50, 75, 100].map((v) => ({ v, label: `${v}%` })),
      yFmt: (v) => num(v, 0), tipFmt: (v) => mw(v), yLabel: 'MW imported',
      xLabelFmt: (v) => `${num(v, 0)}% of hours at or above`,
    });
    $('#leg-duration', host).innerHTML = legend(dseries);
    const gap = P.results.wait.finalYear.gridPeak - P.results.hybrid.finalYear.gridPeak;
    $('#dur-note', host).innerHTML =
      `The battery clips <b>${num(gap, 1)} MW</b> off the billed peak here — and the flatter the load, the less
       there is to clip. That is the whole of the §6 argument in one chart. Scenarios that end up identical
       draw on top of each other: wait and gas bridge are both grid-only by the final year, and hybrid and
       retained gas coincide whenever retained gas is 0 MW.`;

    const rows = P.results.hybrid.finalYear.gridHourMonth;
    const { lo, hi } = renderHeatmap($('#viz-heat', host), {
      rows, rowLabels: MONTH_ABBR, measure: 'Mean import', fmt: (v) => mw(v),
      title: 'Hour of day →',
    });
    $('#leg-heat', host).innerHTML = rampLegend(lo, hi, (v) => `${num(v, 0)} MW`);
  },
};

function drawDay(host, day) {
  const xs = Array.from({ length: 24 }, (_, i) => i);
  const f = day.flows;
  const series = [
    { label: 'Solar', color: D.solar, values: f.map((x) => x.solar) },
    { label: 'Grid', color: D.grid, values: f.map((x) => x.grid) },
    { label: 'Gas bridge', color: D.gas, values: f.map((x) => x.gas) },
    { label: 'Battery', color: D.bess, values: f.map((x) => x.bessDischarge) },
    { label: 'Backup', color: D.diesel, values: f.map((x) => x.diesel) },
    { label: 'Unserved', color: D.unserved, values: f.map((x) => x.unserved) },
  ].filter((s) => s.values.some((v) => v > 0.01));
  const overlay = { label: 'Facility load', color: PALETTE.ink.primary, values: f.map((x) => x.load) };
  renderStackedArea($('#viz-day', host), {
    x: xs, series, overlay, height: 270,
    xTicks: [0, 3, 6, 9, 12, 15, 18, 21, 23].map((v) => ({ v, label: `${String(v).padStart(2, '0')}` })),
    yFmt: (v) => num(v, 0), tipFmt: (v) => mw(v), yLabel: 'MW',
    xLabelFmt: (h) => `${String(h).padStart(2, '0')}:00`,
  });
  $('#leg-day', host).innerHTML = legend([...series, { ...overlay, dashed: true }]);

  renderLines($('#viz-soc', host), {
    x: xs, height: 150, yMin: 0, directLabels: false,
    series: [
      { label: 'SOC', color: D.bess, values: f.map((x) => x.soc) },
      { label: 'Reserve floor', color: PALETTE.ink.muted,
        values: f.map(() => P.derived.screen.reservedEnergyMWh * day.cfg.itFrac) },
    ],
    xTicks: [0, 6, 12, 18, 23].map((v) => ({ v, label: `${String(v).padStart(2, '0')}` })),
    yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 1)} MWh`,
    yLabel: `MWh of ${num(day.cfg.bessMWh, 0)}`, xLabelFmt: (h) => `${String(h).padStart(2, '0')}:00`,
  });
}

function dayTable(day) {
  const rows = day.flows.map((f, h) => `<tr>
    <td>${String(h).padStart(2, '0')}:00</td><td>${num(f.load, 1)}</td><td>${num(f.solar, 1)}</td>
    <td>${num(f.grid, 1)}</td><td>${num(f.gas, 1)}</td><td>${f.gasUnits || '—'}</td>
    <td>${num(f.bessDischarge - f.bessCharge, 1)}</td><td>${num(f.soc, 1)}</td><td>${num(f.diesel, 1)}</td>
    <td style="color:${f.unserved > 0.01 ? PALETTE.status.fail : 'inherit'}">${num(f.unserved, 2)}</td></tr>`).join('');
  return `<table class="data"><thead><tr><th>Hour</th><th>Load MW</th><th>Solar</th><th>Grid</th>
    <th>Gas</th><th>Units</th><th>Battery ±</th><th>SOC MWh</th><th>Backup</th><th>Unserved</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

// ═════════════════════════════════════════════════════════════════ ECONOMICS
TABS.economics = {
  mount: () => `
    <div class="card">
      <div class="eyebrow">§6 KPI</div><h2 class="sec">Blended cost of energy, by year</h2>
      <div class="viz" id="viz-permwh"></div><div id="leg-permwh"></div>
      <p class="note" style="margin-top:8px">
        Years in which a scenario serves no load carry no bar. The bridge years are expensive per MWh and cheap
        per month, because the site is small then — the cumulative chart on Overview answers the commercial
        question.
      </p>
    </div>
    <div class="card">
      <div class="eyebrow">§5 cost engine</div><h2 class="sec">Where fifteen years of money goes</h2>
      <div class="viz" id="viz-stack"></div><div id="leg-stack"></div>
    </div>
    <div class="grid2">
      <div class="card"><h3 class="sub">Grid bill, final year</h3>
        <div class="tblwrap" style="margin-top:8px" id="bill-table"></div>
        <p class="note" id="bill-note" style="margin-top:10px"></p></div>
      <div class="card"><h3 class="sub">Fuel and emissions</h3>
        <div class="tblwrap" style="margin-top:8px" id="fuel-table"></div>
        <p class="note" id="fuel-note" style="margin-top:10px"></p></div>
    </div>`,

  paint(host) {
    const groups = Array.from({ length: HORIZON_YEARS }, (_, i) => i + 1);
    const series = SCENARIOS.map((s) => ({
      label: short(s.key), color: SC[s.key],
      values: groups.map((y) => {
        const a = P.results[s.key].annual[y - 1];
        return a && a.loadMWh > 0 ? a.perMWh : null;
      }),
    }));
    renderGroupedBars($('#viz-permwh', host), {
      groups, series, height: 250, yFmt: (v) => perMWh(v), yLabel: '$/MWh',
      groupTick: (g) => `Y${g}`, groupLabel: (g) => `Year ${g}`,
    });
    $('#leg-permwh', host).innerHTML = legend(series);

    const segDefs = [
      ['Grid bill', D.grid, (t) => t.gridBill],
      ['Gas fuel', D.gas, (t) => t.gasFuel],
      ['Gas rent + O&M', '#f2a98a', (t) => t.rent + t.gasVarOM],
      ['Backup fuel + O&M', D.diesel, (t) => t.dieselFuel + t.dieselVarOM],
      ['Fixed O&M', PALETTE.ink.muted, (t) => t.fixedOM],
      ['Capital', D.bess, (t) => t.capex],
    ];
    renderStackedBarsH($('#viz-stack', host), {
      rows: SCENARIOS.map((s) => ({ label: s.short,
        segments: segDefs.map(([l, c, f]) => ({ label: l, color: c, value: f(P.results[s.key].totals) })) })),
      xFmt: (v) => money(v),
    });
    $('#leg-stack', host).innerHTML = legend(segDefs.map(([l, c]) => ({ label: l, color: c })));

    $('#bill-table', host).innerHTML = billTable();
    $('#bill-note', host).innerHTML =
      `"Above metered" is capacity billed under the ${num(TARIFF.contractMinGenFrac * 100, 0)}% contract minimum
       or the ${num(TARIFF.summerRatchetFrac * 100, 0)}% summer ratchet but never drawn. ${TARIFF.billingIntervalNote}`;
    $('#fuel-table', host).innerHTML = fuelTable();
    $('#fuel-note', host).innerHTML =
      `Unit-hours, not clock hours — a fleet of ten units running for an hour spends ten of them. Delivered gas
       is Henry Hub at ${money(FUEL.henryHubStart, 2)} escalating ${FUEL.henryHubEscalationPctPerYr}%/yr plus
       ${money(FUEL.basisAdder, 2)} basis, passed through. CO₂ covers the grid at
       ${FUEL.gridKgCO2PerMWh} kg/MWh plus on-site combustion.`;
  },
};

function billTable() {
  const rows = SCENARIOS.map((s) => {
    const r = P.results[s.key];
    const y = r.billYear.filter((x) => x.total > 0);
    if (!y.length) return `<tr><td>${dot(SC[s.key])}${s.short}</td><td colspan="4">no grid service in the horizon</td></tr>`;
    const dem = y.reduce((a, x) => a + x.demand, 0), ene = y.reduce((a, x) => a + x.energy, 0);
    const excess = y.reduce((a, x) => a + x.excessKW, 0) / y.length;
    return `<tr><td>${dot(SC[s.key])}${s.short}</td><td>${money(dem)}</td><td>${money(ene)}</td>
      <td>${num(Math.max(...y.map((x) => x.billedGenKW)) / 1000, 0)} MW</td>
      <td>${num(excess / 1000, 0)} MW</td></tr>`;
  }).join('');
  return `<table class="data"><thead><tr><th>Scenario</th><th>Demand</th><th>Energy</th>
    <th>Billed demand</th><th>Above metered</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fuelTable() {
  const rows = SCENARIOS.map((s) => {
    const t = P.results[s.key].totals;
    const gridCO2 = (t.gridMWh * FUEL.gridKgCO2PerMWh) / 1000;
    return `<tr><td>${dot(SC[s.key])}${s.short}</td><td>${int(t.gasFuelMMBtu / 1000)}</td>
      <td>${int(t.gasRunHours)}</td><td>${int(t.dieselRunHours)}</td>
      <td>${int((t.co2Tonnes + gridCO2) / 1000)} kt</td></tr>`;
  }).join('');
  return `<table class="data"><thead><tr><th>Scenario</th><th>Gas, k MMBtu</th><th>Gas unit-hrs</th>
    <th>Backup unit-hrs</th><th>15-yr CO₂</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ═══════════════════════════════════════════════════════════════ RELIABILITY
TABS.reliability = {
  mount: () => `
    <div class="card">
      <div class="eyebrow">§4.6 sizing checks</div><h2 class="sec">Does the hybrid design hold up</h2>
      <p class="lede">Run against every hour of the horizon, not against a design point.</p>
      <div style="margin-top:12px" id="checks"></div>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="eyebrow">§10 screening optimizer</div><h2 class="sec">Diesel or battery</h2>
        <p class="lede" id="preset-blurb"></p>
        <div class="tblwrap" style="margin-top:12px" id="screen-table"></div>
        <div class="callout c-warn" style="margin-top:14px" id="screen-note"></div>
      </div>
      <div class="card">
        <div class="eyebrow">§4.5 insurance panel</div><h2 class="sec">What the backup fleet buys</h2>
        <div class="tblwrap" style="margin-top:12px" id="ins-table"></div>
        <div class="callout c-neutral" style="margin-top:14px" id="ins-note"></div>
      </div>
    </div>
    <div class="card">
      <h3 class="sub">Permit hours against stress events</h3>
      <p class="lede" id="permit-lede"></p>
      <div class="tblwrap" style="margin-top:12px" id="permit-table"></div>
    </div>`,

  paint(host) {
    $('#checks', host).innerHTML = P.checks.map((c) => `<div class="check">
      <span class="check-badge ${c.pass ? 'b-pass' : 'b-fail'}">${c.pass ? 'Pass' : 'Fail'}</span>
      <div class="check-body">${c.label}<span>${c.value}</span>${c.note ? `<em>${c.note}</em>` : ''}</div>
    </div>`).join('');

    const sc = P.derived.screen, p = PRESETS[inputs.workloadPreset];
    $('#preset-blurb', host).textContent = p.blurb;
    $('#screen-table', host).innerHTML = `<table class="data"><tbody>
      ${row('Critical fraction', `${num(p.criticalFrac * 100, 0)}% of facility load`)}
      ${row('Shed window', p.shedWindowMin == null ? 'none — nothing sheds' : `${p.shedWindowMin} min`)}
      ${row('Step swing', `${num(p.stepSwingFracIT * 100, 0)}% of IT = ${mw(p.stepSwingFracIT * P.derived.mwIT)}`)}
      ${row('Firm backup required', mw(sc.dieselFirmMW))}
      ${row('Backup installed, N+1', `${mw(sc.dieselInstalledMW)} · ${sc.dieselUnits} units`)}
      ${row('Battery power, minimum', `${mw(sc.bessPowerMW)} <span style="color:${PALETTE.ink.muted}">— ${sc.powerBinding} binds</span>`)}
      ${row('Battery energy, minimum', `${num(sc.bessEnergyMWh, 0)} MWh <span style="color:${PALETTE.ink.muted}">— ${sc.energyBinding} binds</span>`)}
      ${row('Firm backup from diesel', `$${num(sc.dieselPerKWYr, 0)}/kW-yr`)}
      ${row('Firm backup from 1 h battery', `$${num(sc.bessPerKWYr, 0)}/kW-yr`)}
      ${row('Break-even ride-through', `${num(sc.breakEvenH, 2)} h`)}
    </tbody></table>`;
    $('#screen-note', host).innerHTML =
      `The optimum is a corner, not a blend: diesel at the critical floor, battery covering everything above it
       through the shed window. Below <b>${num(sc.breakEvenH, 1)} hours</b> of required ride-through the battery
       is cheaper per firm kW; above it diesel is. <b>The customer's SLA sets the answer, not the cost curve.</b>`;

    const ins = P.insurance;
    $('#ins-table', host).innerHTML = `<table class="data"><tbody>
      ${row('Installed backup', mw(ins.installedMW))}
      ${row('Annual premium', `${money(ins.premium)} <span style="color:${PALETTE.ink.muted}">— annualized capital, fixed O&amp;M, testing fuel, permit and CEMS</span>`)}
      ${row('Avoided outage cost', money(ins.outageValue))}
      ${row('Value of load carried', `${money(ins.curtailValue)} <span style="color:${PALETTE.ink.muted}">— ${int(ins.carriedMWh)} MWh/yr at $${int(FINANCE.valueOfLostLoadPerMWh)}/MWh</span>`)}
      ${row('Cover ÷ premium', `<b style="color:${ins.ratio >= 1 ? PALETTE.status.pass : PALETTE.status.warn}">${num(ins.ratio, 2)}×</b>`)}
      ${row('Break-even outage frequency', `${num(ins.breakEvenOutagesPerYear, 2)} per year`)}
    </tbody></table>`;
    $('#ins-note', host).innerHTML = (ins.ratio >= 1
      ? 'At the modelled outage frequency the fleet pays for itself on expected value alone. '
      : `At <b>${STRESS.gridOutagesPerYear} outage${STRESS.gridOutagesPerYear === 1 ? '' : 's'} a year</b> the
         fleet does not pay for itself on expected value — it would need <b>${num(ins.breakEvenOutagesPerYear, 1)}</b>.
         That is the normal result for backup generation, which is bought against the tail and against SLA
         exposure rather than against the mean. `) + ins.bridgeNote;

    $('#permit-lede', host).innerHTML =
      `The model runs ${STRESS.gridOutagesPerYear} grid outage of ${STRESS.gridOutageHours} h and
       ${STRESS.curtailmentsPerYear} PJM curtailments of ${STRESS.curtailmentHours} h each per year, plus one
       gas supply interruption of ${STRESS.gasInterruptionHours} h while the site is islanded. Curtailment
       run-hours can exceed the ${DF_BACKUP.permit.nonEmergencyHrCap}-hour non-emergency cap unless the events
       are classified as emergencies, so the model reports the gap rather than assuming it away.
       ${permitHeadroomNote()}`;
    $('#permit-table', host).innerHTML = permitTable();
  },
};

function permitHeadroomNote() {
  const cap = DF_BACKUP.permit.nonEmergencyHrCap;
  const used = STRESS.gridOutagesPerYear * STRESS.gridOutageHours
    + STRESS.curtailmentsPerYear * STRESS.curtailmentHours;
  const headroom = Math.floor((cap - STRESS.gridOutagesPerYear * STRESS.gridOutageHours) / STRESS.curtailmentHours);
  return used > cap
    ? `<b>The cap is already exceeded</b> at ${used} h of modelled event time against ${cap} h permitted.`
    : `At the modelled frequencies the site uses <b>${used} of ${cap}</b> permitted hours; the cap binds above
       <b>${headroom} curtailment events a year</b>.`;
}

function permitTable() {
  const rows = SCENARIOS.map((s) => {
    const r = P.results[s.key];
    const worst = r.annual.length ? Math.max(...r.annual.map((a) => a.dieselEventHours)) : 0;
    const over = worst > DF_BACKUP.permit.nonEmergencyHrCap;
    return `<tr><td>${dot(SC[s.key])}${s.short}</td><td>${int(worst)} h</td>
      <td>${int(r.totals.dieselTestMWh / HORIZON_YEARS)} MWh</td><td>${int(r.totals.shedMWh)} MWh</td>
      <td style="color:${over ? PALETTE.status.warn : PALETTE.status.pass};font-weight:650">
        ${over ? `${int(worst - DF_BACKUP.permit.nonEmergencyHrCap)} h over cap` : 'within cap'}</td></tr>`;
  }).join('');
  return `<table class="data"><thead><tr><th>Scenario</th><th>Worst-year event hours</th>
    <th>Annual test energy</th><th>15-yr load shed</th><th>Permit</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ══════════════════════════════════════════════════════════════════ TRADEOFF
TABS.tradeoff = {
  mount: () => `
    <div class="card">
      <div class="eyebrow">§6 tradeoff sweep</div><h2 class="sec">What grid independence costs</h2>
      <p class="lede" id="tr-lede"></p>
      <div class="viz" id="viz-frontier" style="margin-top:14px"></div><div id="leg-frontier"></div>
      <p class="note" style="margin-top:8px">
        Points ringed in red cannot carry the site's load at that contract level — they are on the chart, but
        they are not choices. The hollow marker is where the controls are set right now.
      </p>
    </div>
    <div class="card"><h3 class="sub">Frontier, in full</h3>
      <div class="tblwrap" style="margin-top:10px" id="sweep-table"></div></div>`,

  paint(host) {
    $('#tr-lede', host).innerHTML =
      `A flat, high-load-factor site cannot cut contracted demand far on the battery alone — above-contract load
       is sustained for hours, not minutes. Deep contract reduction needs generation that stays. So the sweep
       moves <b>contracted MW and retained gas MW together</b>, one representative full-build year, annualized.
       Your setting of ${num(inputs.retainedGasMW, 0)} MW retained at ${inputs.contractedDemandPct}% contract is
       one point on this frontier.`;

    if (!SWEEP) {
      $('#viz-frontier', host).innerHTML = '<div class="boot">Sweeping 24 configurations…</div>';
      $('#sweep-table', host).innerHTML = '';
      return;
    }
    const colors = [D.grid, D.gas, D.bess, D.diesel];
    const series = RETAINED.map((rm, i) => ({
      label: `${rm} MW retained`, color: colors[i],
      points: CONTRACTS.map((c) => {
        const p = SWEEP.find((x) => x.contractPct === c && x.retainedMW === rm);
        return { x: p.contractedMW, y: p.perMWh, p, infeasible: p.unservedMWh >= 1,
          highlight: c === inputs.contractedDemandPct && rm === inputs.retainedGasMW };
      }),
    }));
    renderFrontier($('#viz-frontier', host), {
      series, height: 300, xFmt: (v) => `${num(v, 0)} MW`, yFmt: (v) => perMWh(v),
      yLabel: '$/MWh, full-build year',
      tip: (pt) => `<div class="viz-tip-row"><span class="viz-tip-k">Contract</span><span class="viz-tip-v">${num(pt.p.contractedMW, 0)} MW</span></div>
        <div class="viz-tip-row"><span class="viz-tip-k">Cost</span><span class="viz-tip-v">${perMWh(pt.p.perMWh)}/MWh</span></div>
        <div class="viz-tip-row"><span class="viz-tip-k">Grid share</span><span class="viz-tip-v">${num(pt.p.gridSharePct, 1)}%</span></div>
        <div class="viz-tip-row"><span class="viz-tip-k">Unserved</span><span class="viz-tip-v">${num(pt.p.unservedMWh, 0)} MWh</span></div>`,
    });
    $('#leg-frontier', host).innerHTML = legend(series);

    const feasible = SWEEP.filter((p) => p.unservedMWh < 1);
    const cheapest = feasible.reduce((a, b) => (b.perMWh < a.perMWh ? b : a), feasible[0]);
    $('#sweep-table', host).innerHTML = `<table class="data">
      <thead><tr><th>Contract</th><th>Retained gas</th><th>$/MWh</th><th>Annual cost</th>
      <th>Grid share</th><th>Unserved</th></tr></thead><tbody>
      ${SWEEP.map((p) => `<tr${p === cheapest ? ' class="best"' : ''}>
        <td>${p.contractPct}% · ${num(p.contractedMW, 0)} MW</td><td>${num(p.retainedMW, 0)} MW</td>
        <td>${perMWh(p.perMWh)}</td><td>${money(p.annualCost)}</td><td>${num(p.gridSharePct, 1)}%</td>
        <td style="color:${p.unservedMWh >= 1 ? PALETTE.status.fail : PALETTE.status.pass};font-weight:600">
          ${p.unservedMWh >= 1 ? `${int(p.unservedMWh)} MWh` : 'none'}</td></tr>`).join('')}
      </tbody></table>
      <p class="note" style="margin-top:10px">Cheapest feasible point:
        <b>${cheapest.contractPct}% contract with ${num(cheapest.retainedMW, 0)} MW retained</b> at
        ${perMWh(cheapest.perMWh)}/MWh. Retained gas is company-owned and rented, so it shows up as ongoing
        operating cost rather than capital — which is what makes the far end of this frontier a conversation
        rather than a capital request.</p>`;
  },
};

// ═══════════════════════════════════════════════════════════════ ASSUMPTIONS
TABS.assumptions = {
  mount() {
    const counts = { confirmed: 0, validate: 0, decide: 0 };
    for (const i of OPEN_ITEMS) counts[i.status]++;
    return `
    <div class="card">
      <div class="eyebrow">Register</div><h2 class="sec">Every number, and how much it is trusted</h2>
      <p class="lede">
        ${counts.confirmed} decisions confirmed, ${counts.validate} defaults still needing judgment,
        ${counts.decide} open calls. The register is generated from the model's own configuration, so an open
        item cannot quietly become an unmarked default.
      </p>
      <div style="margin-top:14px">
        ${OPEN_ITEMS.map((i) => `<div class="reg-item">
          <div class="reg-id">${i.id}</div>
          <div><span class="pill p-${i.status}">${{ confirmed: 'Confirmed', validate: 'Validate', decide: 'Open call' }[i.status]}</span>
            <div class="reg-t">${i.title}</div>${i.note ? `<div class="reg-n">${i.note}</div>` : ''}</div>
        </div>`).join('')}
      </div>
    </div>

    <div class="grid2">
      <div class="card"><h3 class="sub">Dry-bulb temperature by month</h3>
        <p class="note">Range and mean from the synthesised year. The PUE curve rises above ${TARIFF ? 18 : 18} °C,
          so this chart is what drives cooling load.</p>
        <div class="viz" id="viz-temp" style="margin-top:10px"></div></div>
      <div class="card"><h3 class="sub">Plane-of-array irradiance by month</h3>
        <p class="note">At ${SOLAR.tiltDeg}° tilt, due south. Solar's single-digit energy share is a consequence
          of this against a flat round-the-clock load, not of the array being small.</p>
        <div class="viz" id="viz-irr" style="margin-top:10px"></div></div>
    </div>

    <div class="grid2">
      <div class="card"><h3 class="sub">Derived, not assumed</h3>
        <div class="tblwrap" style="margin-top:8px" id="derived-table"></div></div>
      <div class="card"><h3 class="sub">Tariff, as modelled</h3>
        <div class="tblwrap" style="margin-top:8px"><table class="data"><tbody>
          ${row('Structure', TARIFF.label)}
          ${row('Generation demand', `$${num(TARIFF.generationDemandPerKWMo, 2)}/kW-mo`)}
          ${row('Transmission demand', `$${num(TARIFF.transmissionDemandPerKWMo, 2)}/kW-mo`)}
          ${row('Distribution demand', `$${num(TARIFF.distributionDemandPerKWMo, 2)}/kW-mo`)}
          ${row('Energy + rider', `$${num(TARIFF.generationEnergyPerKWh + TARIFF.riderAdderPerKWh, 4)}/kWh`)}
          ${row('Contract minimums', `${num(TARIFF.contractMinGenFrac * 100, 0)}% generation · ${num(TARIFF.contractMinDistFrac * 100, 0)}% distribution`)}
          ${row('Summer ratchet', `${num(TARIFF.summerRatchetFrac * 100, 0)}% of the trailing summer peak`)}
          ${row('Escalation', `${num(TARIFF.escalationPctPerYr, 1)}%/yr`)}
        </tbody></table></div>
        <div class="callout c-warn" style="margin-top:14px"><b>Billing interval.</b> ${TARIFF.billingIntervalNote}</div>
      </div>
    </div>

    <div class="card"><h3 class="sub">What this model is not</h3>
      <div class="callout c-neutral" style="margin-top:8px">
        <b>The weather is synthesised, not measured.</b> A clear-sky model modulated by a seeded clearness
        process, calibrated so annual irradiance, diffuse fraction and temperature extremes land within a few
        percent of NSRDB's Dulles values. Swap in a real TMY3 file before any number here goes in front of a
        customer; nothing else in the model changes.<br><br>
        <b>The timestep is an hour.</b> Sub-hourly transients are handled analytically — the shed window is
        pro-rated within the hour it expires in, and block-load acceptance is checked against the step swing
        rather than simulated. Demand is billed off 1-hour averages per D3.<br><br>
        <b>Dispatch is a heuristic, built to an LP-ready interface.</b> One
        <span class="mono">solveWindow(problem, state)</span> contract, one shared cost model, demand charges
        expressed as monthly billing determinants. Swapping in a solver is a new implementation of the same
        interface, not a rewrite (§9).<br><br>
        <b>Financing, tax, rent pricing and fleet redeployment economics are out of scope</b> and live in the
        spreadsheet (§7). This tool exports gas unit-months on rent and the redeploy-available date to feed it.
      </div>
    </div>`;
  },

  paint(host) {
    const d = P.derived, w = d.weather;
    renderRangeBand($('#viz-temp', host), {
      categories: MONTH_ABBR, color: D.gas, height: 200, yLabel: '°C',
      yFmt: (v) => `${num(v, 0)}°`,
      rows: w.map((r) => ({ lo: r.tMin, mid: r.tMean, hi: r.tMax })),
    });
    renderGroupedBars($('#viz-irr', host), {
      groups: MONTH_ABBR, height: 200, yFmt: (v) => num(v, 0), yLabel: 'kWh/m² per month',
      series: [{ label: 'POA irradiance', color: D.solar, values: w.map((r) => r.poaKWh) }],
      groupTick: (g) => g, groupLabel: (g) => g,
    });
    $('#derived-table', host).innerHTML = `<table class="data"><tbody>
      ${row('IT capacity', `${mw(d.mwIT)} <span style="color:${PALETTE.ink.muted}">— facility peak ÷ PUE at the design dry-bulb</span>`)}
      ${row('Design dry-bulb', `${num(d.tDesignC, 1)} °C → PUE ${num(d.pueDesign, 3)}`)}
      ${row('Simulated facility peak', mw(d.simulatedPeakMW))}
      ${row('Simulated mean load', mw(d.simulatedMeanMW))}
      ${row('Load factor', `${num(d.loadFactor * 100, 1)}%`)}
      ${row('Design day', `day ${d.worstDay + 1} — the highest daily mean, not the annual peak hour`)}
      ${row('Plane-of-array irradiance', `${int(d.annualPOAkWh)} kWh/m²·yr at ${SOLAR.tiltDeg}° tilt`)}
      ${row('Solar energy share', `${num(P.results.hybrid.solarSharePct, 2)}% of energy served`)}
      ${row('Billed peak, hybrid', `${num(P.results.hybrid.finalYear.gridPeak, 1)} MW in the final year`)}
    </tbody></table>`;
  },
};

// ── Export ──────────────────────────────────────────────────────────────────
function exportJSON() {
  const payload = {
    generated: new Date().toISOString(),
    spec: 'Site Energy Model v0.3',
    note: TARIFF.billingIntervalNote,
    inputs, derived: P.derived, checks: P.checks, insurance: P.insurance,
    scenarios: Object.fromEntries(SCENARIOS.map((s) => {
      const r = P.results[s.key];
      return [s.key, {
        label: s.label, firstPowerMonth: r.firstPowerMonth, blendedPerMWh: r.blendedPerMWh,
        npvNet: r.npvNet, totals: r.totals, annual: r.annual,
        // §5 company view — the two figures the spreadsheet needs.
        gasUnitMonthsOnRent: r.gasUnitMonths, redeployAvailableMonth: r.redeployMonth,
      }];
    })),
    tradeoffSweep: SWEEP,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `site-energy-model-${inputs.workloadPreset}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Boot ────────────────────────────────────────────────────────────────────
for (const [k] of TAB_LIST) $(`#p-${k}`).innerHTML = '<div class="boot">Solving 131,400 hours…</div>';
buildControls();
syncControls();
request(true);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { mounted = {}; render(); }, 180);
});
