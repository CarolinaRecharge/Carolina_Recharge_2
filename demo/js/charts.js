// Hand-rolled SVG charts. No library, per the house rule against build steps.
//
// The palette below was validated with the data-viz colour checks against a
// white chart surface: lightness band, chroma floor, adjacent-pair CVD
// separation and normal-vision separation all pass. Three of the hues sit
// under 3:1 contrast on white, which is why every chart here ships a legend,
// direct labels and a table view rather than relying on colour alone.

export const PALETTE = {
  scenario: { wait: '#4A3AA7', bridge: '#EB6834', hybrid: '#0A7AFF', retained: '#1BAF7A' },
  dispatch: {
    solar: '#EDA100', grid: '#0A7AFF', gas: '#EB6834',
    bess: '#1BAF7A', diesel: '#4A3AA7', unserved: '#E34948',
  },
  ink: { primary: '#0F2060', secondary: '#475569', muted: '#94A3B8' },
  grid: '#E8EDF5',
  surface: '#FFFFFF',
  status: { pass: '#047857', warn: '#B45309', fail: '#B91C1C' },
};

const NS = 'http://www.w3.org/2000/svg';
const M = { top: 26, right: 18, bottom: 34, left: 62 };

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
}

function niceTicks(lo, hi, count = 5) {
  if (!isFinite(lo) || !isFinite(hi) || hi === lo) return [lo || 0, (lo || 0) + 1];
  const span = hi - lo;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
}

/** One tooltip per chart host, reused. */
function tooltipFor(host) {
  let tip = host.querySelector('.viz-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    tip.hidden = true;
    host.appendChild(tip);
  }
  return tip;
}

function frame(host, height) {
  host.querySelectorAll('svg').forEach((n) => n.remove());
  const w = Math.max(280, host.clientWidth || 640);
  const svg = svgEl('svg', { width: w, height, viewBox: `0 0 ${w} ${height}`, role: 'img' });
  host.insertBefore(svg, host.firstChild);
  return { svg, w, h: height, iw: w - M.left - M.right, ih: height - M.top - M.bottom };
}

function axes(svg, f, xTicks, yTicks, xFmt, yFmt, yLabel) {
  const g = svgEl('g');
  for (const t of yTicks) {
    const y = f.y(t);
    g.appendChild(svgEl('line', { x1: M.left, x2: M.left + f.iw, y1: y, y2: y, stroke: PALETTE.grid, 'stroke-width': 1 }));
    const lab = svgEl('text', { x: M.left - 8, y: y + 4, 'text-anchor': 'end', class: 'viz-axis' });
    lab.textContent = yFmt(t);
    g.appendChild(lab);
  }
  for (const t of xTicks) {
    const x = f.x(t.v);
    const lab = svgEl('text', { x, y: f.h - 12, 'text-anchor': 'middle', class: 'viz-axis' });
    lab.textContent = t.label;
    g.appendChild(lab);
  }
  g.appendChild(svgEl('line', {
    x1: M.left, x2: M.left + f.iw, y1: M.top + f.ih, y2: M.top + f.ih,
    stroke: '#CBD5E1', 'stroke-width': 1,
  }));
  if (yLabel) {
    const l = svgEl('text', { x: 4, y: 11, class: 'viz-axis-label' });
    l.textContent = yLabel;
    g.appendChild(l);
  }
  svg.appendChild(g);
  return g;
}

function scales(f, xMin, xMax, yMin, yMax) {
  const x = (v) => M.left + ((v - xMin) / (xMax - xMin || 1)) * f.iw;
  const y = (v) => M.top + f.ih - ((v - yMin) / (yMax - yMin || 1)) * f.ih;
  return { ...f, x, y, xMin, xMax, yMin, yMax };
}

// ── Multi-series line with a crosshair ──────────────────────────────────────
export function renderLines(host, cfg) {
  const f0 = frame(host, cfg.height || 280);
  const xs = cfg.x;
  let lo = cfg.yMin != null ? cfg.yMin : Infinity, hi = -Infinity;
  for (const s of cfg.series) for (const v of s.values) {
    if (v == null) continue;
    if (cfg.yMin == null && v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) lo = 0;
  const ticks = niceTicks(lo, hi, 5);
  const f = scales(f0, xs[0], xs[xs.length - 1], Math.min(lo, ticks[0]), Math.max(hi, ticks[ticks.length - 1]));
  axes(f0.svg, f, cfg.xTicks, ticks, cfg.xFmt, cfg.yFmt, cfg.yLabel);

  if (lo < 0 && hi > 0) {
    f0.svg.appendChild(svgEl('line', {
      x1: M.left, x2: M.left + f.iw, y1: f.y(0), y2: f.y(0), stroke: '#94A3B8', 'stroke-width': 1,
    }));
  }

  for (const s of cfg.series) {
    let d = '';
    s.values.forEach((v, i) => { if (v != null) d += `${d ? 'L' : 'M'}${f.x(xs[i]).toFixed(1)} ${f.y(v).toFixed(1)}`; });
    f0.svg.appendChild(svgEl('path', {
      d, fill: 'none', stroke: s.color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    // Direct label at the series end — identity never rests on colour alone.
    const last = s.values.length - 1;
    if (s.values[last] != null && cfg.directLabels !== false) {
      const t = svgEl('text', {
        x: f.x(xs[last]) - 4, y: f.y(s.values[last]) - 8, 'text-anchor': 'end', class: 'viz-label',
      });
      t.textContent = s.label;
      f0.svg.appendChild(t);
    }
  }

  attachCrosshair(host, f0, f, xs, cfg);
  return f;
}

function attachCrosshair(host, f0, f, xs, cfg) {
  const tip = tooltipFor(host);
  const cross = svgEl('line', {
    y1: M.top, y2: M.top + f.ih, stroke: '#94A3B8', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
  });
  f0.svg.appendChild(cross);
  const dots = svgEl('g');
  f0.svg.appendChild(dots);

  const hit = svgEl('rect', {
    x: M.left, y: M.top, width: f.iw, height: f.ih, fill: 'transparent', style: 'cursor:crosshair',
  });
  f0.svg.appendChild(hit);

  const move = (ev) => {
    const r = f0.svg.getBoundingClientRect();
    const px = ev.clientX - r.left;
    let best = 0, bd = Infinity;
    xs.forEach((v, i) => { const d = Math.abs(f.x(v) - px); if (d < bd) { bd = d; best = i; } });
    cross.setAttribute('x1', f.x(xs[best]));
    cross.setAttribute('x2', f.x(xs[best]));
    cross.setAttribute('opacity', 1);
    dots.replaceChildren();
    let rows = '';
    for (const s of cfg.series) {
      const v = s.values[best];
      if (v == null) continue;
      const c = svgEl('circle', { cx: f.x(xs[best]), cy: f.y(v), r: 4.5, fill: s.color, stroke: '#fff', 'stroke-width': 2 });
      dots.appendChild(c);
      rows += `<div class="viz-tip-row"><span class="viz-swatch" style="background:${s.color}"></span>` +
        `<span class="viz-tip-k">${s.label}</span><span class="viz-tip-v">${cfg.tipFmt ? cfg.tipFmt(v) : cfg.yFmt(v)}</span></div>`;
    }
    tip.innerHTML = `<div class="viz-tip-h">${cfg.xLabelFmt ? cfg.xLabelFmt(xs[best]) : xs[best]}</div>${rows}`;
    tip.hidden = false;
    const hr = host.getBoundingClientRect();
    const tx = Math.min(Math.max(8, ev.clientX - hr.left + 14), hr.width - tip.offsetWidth - 8);
    tip.style.left = `${tx}px`;
    tip.style.top = `${Math.max(8, ev.clientY - hr.top - 12)}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('opacity', 0); dots.replaceChildren(); });
}

// ── Stacked area ────────────────────────────────────────────────────────────
export function renderStackedArea(host, cfg) {
  const f0 = frame(host, cfg.height || 260);
  const xs = cfg.x;
  const n = xs.length;
  const tops = cfg.series.map(() => new Float64Array(n));
  const acc = new Float64Array(n);
  let hi = 0;
  cfg.series.forEach((s, si) => {
    for (let i = 0; i < n; i++) { acc[i] += s.values[i] || 0; tops[si][i] = acc[i]; if (acc[i] > hi) hi = acc[i]; }
  });
  if (cfg.overlay) for (const v of cfg.overlay.values) if (v > hi) hi = v;
  const ticks = niceTicks(0, hi, 5);
  const f = scales(f0, xs[0], xs[n - 1], 0, Math.max(hi, ticks[ticks.length - 1]));
  axes(f0.svg, f, cfg.xTicks, ticks, cfg.xFmt, cfg.yFmt, cfg.yLabel);

  for (let si = cfg.series.length - 1; si >= 0; si--) {
    const s = cfg.series[si];
    let d = `M${f.x(xs[0]).toFixed(1)} ${f.y(tops[si][0]).toFixed(1)}`;
    for (let i = 1; i < n; i++) d += `L${f.x(xs[i]).toFixed(1)} ${f.y(tops[si][i]).toFixed(1)}`;
    for (let i = n - 1; i >= 0; i--) {
      const below = si === 0 ? 0 : tops[si - 1][i];
      d += `L${f.x(xs[i]).toFixed(1)} ${f.y(below).toFixed(1)}`;
    }
    d += 'Z';
    f0.svg.appendChild(svgEl('path', { d, fill: s.color, 'fill-opacity': 0.92 }));
    // A hairline in the surface colour keeps adjacent fills legible.
    let top = `M${f.x(xs[0]).toFixed(1)} ${f.y(tops[si][0]).toFixed(1)}`;
    for (let i = 1; i < n; i++) top += `L${f.x(xs[i]).toFixed(1)} ${f.y(tops[si][i]).toFixed(1)}`;
    f0.svg.appendChild(svgEl('path', { d: top, fill: 'none', stroke: PALETTE.surface, 'stroke-width': 2 }));
  }

  if (cfg.overlay) {
    let d = '';
    cfg.overlay.values.forEach((v, i) => { d += `${d ? 'L' : 'M'}${f.x(xs[i]).toFixed(1)} ${f.y(v).toFixed(1)}`; });
    f0.svg.appendChild(svgEl('path', {
      d, fill: 'none', stroke: PALETTE.ink.primary, 'stroke-width': 2, 'stroke-dasharray': '5 4',
    }));
  }

  const all = cfg.overlay ? [...cfg.series, { ...cfg.overlay, dashed: true }] : cfg.series;
  attachCrosshair(host, f0, f, xs, { ...cfg, series: all });
  return f;
}

// ── Grouped bars ────────────────────────────────────────────────────────────
export function renderGroupedBars(host, cfg) {
  const f0 = frame(host, cfg.height || 260);
  const groups = cfg.groups;
  let hi = 0;
  for (const s of cfg.series) for (const v of s.values) if (v > hi) hi = v;
  const ticks = niceTicks(0, hi, 5);
  const f = scales(f0, 0, groups.length, 0, Math.max(hi, ticks[ticks.length - 1]));
  axes(f0.svg, f, [], ticks, null, cfg.yFmt, cfg.yLabel);

  const gw = f.iw / groups.length;
  const inner = gw * 0.74;
  const bw = Math.max(3, inner / cfg.series.length - 2);
  const tip = tooltipFor(host);

  groups.forEach((g, gi) => {
    const x0 = M.left + gi * gw + (gw - inner) / 2;
    cfg.series.forEach((s, si) => {
      const v = s.values[gi];
      if (v == null) return;
      const x = x0 + si * (bw + 2);
      const y = f.y(v);
      const h = Math.max(1, M.top + f.ih - y);
      const r = svgEl('rect', { x, y, width: bw, height: h, rx: Math.min(4, bw / 2), fill: s.color });
      r.addEventListener('pointerenter', (ev) => {
        tip.innerHTML = `<div class="viz-tip-h">${cfg.groupLabel ? cfg.groupLabel(g) : g}</div>` +
          `<div class="viz-tip-row"><span class="viz-swatch" style="background:${s.color}"></span>` +
          `<span class="viz-tip-k">${s.label}</span><span class="viz-tip-v">${cfg.yFmt(v)}</span></div>`;
        tip.hidden = false;
        const hr = host.getBoundingClientRect();
        tip.style.left = `${Math.min(x + 10, hr.width - tip.offsetWidth - 8)}px`;
        tip.style.top = `${Math.max(8, y - 8)}px`;
      });
      r.addEventListener('pointerleave', () => { tip.hidden = true; });
      f0.svg.appendChild(r);
    });
    const lab = svgEl('text', { x: M.left + gi * gw + gw / 2, y: f.h - 12, 'text-anchor': 'middle', class: 'viz-axis' });
    lab.textContent = cfg.groupTick ? cfg.groupTick(g, gi) : g;
    if (cfg.groupTick && cfg.groupTick(g, gi) === '') lab.textContent = '';
    f0.svg.appendChild(lab);
  });
  return f;
}

// ── Horizontal stacked bars (cost breakdown per scenario) ───────────────────
export function renderStackedBarsH(host, cfg) {
  const rows = cfg.rows;
  const height = cfg.height || rows.length * 46 + 42;
  const f0 = frame(host, height);
  const left = 108;
  const iw = f0.w - left - 84;   // room for the total, printed past the bar
  let hi = 0;
  for (const r of rows) hi = Math.max(hi, r.segments.reduce((a, s) => a + s.value, 0));
  const ticks = niceTicks(0, hi, 4);
  const max = Math.max(hi, ticks[ticks.length - 1]);
  const x = (v) => left + (v / max) * iw;
  const tip = tooltipFor(host);

  for (const t of ticks) {
    f0.svg.appendChild(svgEl('line', { x1: x(t), x2: x(t), y1: 8, y2: height - 24, stroke: PALETTE.grid, 'stroke-width': 1 }));
    const lab = svgEl('text', { x: x(t), y: height - 8, 'text-anchor': 'middle', class: 'viz-axis' });
    lab.textContent = cfg.xFmt(t);
    f0.svg.appendChild(lab);
  }

  rows.forEach((row, ri) => {
    const y = 14 + ri * 46;
    const lab = svgEl('text', { x: left - 10, y: y + 18, 'text-anchor': 'end', class: 'viz-rowlabel' });
    lab.textContent = row.label;
    f0.svg.appendChild(lab);
    let acc = 0;
    for (const seg of row.segments) {
      if (seg.value <= 0) continue;
      const x0 = x(acc), x1 = x(acc + seg.value);
      const w = Math.max(1, x1 - x0 - 2);
      const r = svgEl('rect', { x: x0, y, width: w, height: 26, rx: 3, fill: seg.color });
      r.addEventListener('pointerenter', () => {
        tip.innerHTML = `<div class="viz-tip-h">${row.label}</div>` +
          `<div class="viz-tip-row"><span class="viz-swatch" style="background:${seg.color}"></span>` +
          `<span class="viz-tip-k">${seg.label}</span><span class="viz-tip-v">${cfg.xFmt(seg.value)}</span></div>`;
        tip.hidden = false;
        const hr = host.getBoundingClientRect();
        tip.style.left = `${Math.min(x0 + 8, hr.width - tip.offsetWidth - 8)}px`;
        tip.style.top = `${y - 6}px`;
      });
      r.addEventListener('pointerleave', () => { tip.hidden = true; });
      f0.svg.appendChild(r);
      acc += seg.value;
    }
    const tot = svgEl('text', { x: Math.min(x(acc) + 8, f0.w - 6), y: y + 18, 'text-anchor': x(acc) + 8 > f0.w - 70 ? 'end' : 'start', class: 'viz-label' });
    tot.textContent = cfg.xFmt(acc);
    f0.svg.appendChild(tot);
  });
  return f0;
}

// ── Frontier: one line per retained-gas level, markers at each contract level ─
export function renderFrontier(host, cfg) {
  const f0 = frame(host, cfg.height || 300);
  let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
  for (const s of cfg.series) for (const p of s.points) {
    xlo = Math.min(xlo, p.x); xhi = Math.max(xhi, p.x);
    ylo = Math.min(ylo, p.y); yhi = Math.max(yhi, p.y);
  }
  const yTicks = niceTicks(ylo, yhi, 5);
  const xTicks = niceTicks(xlo, xhi, 5);
  const f = scales(f0, xTicks[0], xTicks[xTicks.length - 1], Math.min(ylo, yTicks[0]), Math.max(yhi, yTicks[yTicks.length - 1]));
  axes(f0.svg, f, xTicks.map((v) => ({ v, label: cfg.xFmt(v) })), yTicks, cfg.xFmt, cfg.yFmt, cfg.yLabel);

  const tip = tooltipFor(host);
  for (const s of cfg.series) {
    let d = '';
    for (const p of s.points) d += `${d ? 'L' : 'M'}${f.x(p.x).toFixed(1)} ${f.y(p.y).toFixed(1)}`;
    f0.svg.appendChild(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    for (const p of s.points) {
      const c = svgEl('circle', {
        cx: f.x(p.x), cy: f.y(p.y), r: p.highlight ? 7 : 5,
        fill: p.infeasible ? PALETTE.surface : p.highlight ? PALETTE.surface : s.color,
        stroke: p.infeasible ? PALETTE.status.fail : s.color,
        'stroke-width': p.highlight || p.infeasible ? 3 : 2,
        'stroke-dasharray': p.infeasible ? '2 2' : null,
      });
      c.addEventListener('pointerenter', () => {
        tip.innerHTML = `<div class="viz-tip-h">${s.label}</div>${cfg.tip(p)}`;
        tip.hidden = false;
        const hr = host.getBoundingClientRect();
        tip.style.left = `${Math.min(f.x(p.x) + 12, hr.width - tip.offsetWidth - 8)}px`;
        tip.style.top = `${Math.max(8, f.y(p.y) - 12)}px`;
      });
      c.addEventListener('pointerleave', () => { tip.hidden = true; });
      f0.svg.appendChild(c);
    }
    const last = s.points[s.points.length - 1];
    const t = svgEl('text', { x: f.x(last.x) - 10, y: f.y(last.y) - 10, 'text-anchor': 'end', class: 'viz-label' });
    t.textContent = s.label;
    f0.svg.appendChild(t);
  }
  return f;
}

// ── Lifecycle timeline ──────────────────────────────────────────────────────
export function renderTimeline(host, cfg) {
  const rowH = 34;
  const height = cfg.rows.length * rowH + 46;
  const f0 = frame(host, height);
  const left = 132;
  const iw = f0.w - left - 20;
  const x = (m) => left + (m / cfg.months) * iw;
  const tip = tooltipFor(host);

  for (let y = 0; y <= cfg.months; y += 12) {
    f0.svg.appendChild(svgEl('line', { x1: x(y), x2: x(y), y1: 6, y2: height - 26, stroke: PALETTE.grid, 'stroke-width': 1 }));
    const lab = svgEl('text', { x: x(y), y: height - 8, 'text-anchor': 'middle', class: 'viz-axis' });
    lab.textContent = `Y${y / 12 + 1}`;
    f0.svg.appendChild(lab);
  }

  cfg.rows.forEach((row, ri) => {
    const y = 10 + ri * rowH;
    const lab = svgEl('text', { x: left - 10, y: y + 17, 'text-anchor': 'end', class: 'viz-rowlabel' });
    lab.textContent = row.label;
    f0.svg.appendChild(lab);
    f0.svg.appendChild(svgEl('rect', { x: left, y: y + 4, width: iw, height: 18, rx: 3, fill: '#F1F5F9' }));
    for (const b of row.bars) {
      if (b.end <= b.start) continue;
      const r = svgEl('rect', {
        x: x(b.start), y: y + 4, width: Math.max(2, x(b.end) - x(b.start)), height: 18, rx: 3,
        fill: row.color, 'fill-opacity': b.opacity == null ? 1 : b.opacity,
      });
      r.addEventListener('pointerenter', () => {
        tip.innerHTML = `<div class="viz-tip-h">${row.label}</div><div class="viz-tip-row">` +
          `<span class="viz-tip-k">${b.note}</span></div>`;
        tip.hidden = false;
        const hr = host.getBoundingClientRect();
        tip.style.left = `${Math.min(x(b.start) + 8, hr.width - tip.offsetWidth - 8)}px`;
        tip.style.top = `${y - 4}px`;
      });
      r.addEventListener('pointerleave', () => { tip.hidden = true; });
      f0.svg.appendChild(r);
    }
  });

  for (const mk of cfg.markers || []) {
    f0.svg.appendChild(svgEl('line', {
      x1: x(mk.month), x2: x(mk.month), y1: 6, y2: height - 26,
      stroke: PALETTE.ink.primary, 'stroke-width': 2, 'stroke-dasharray': '4 3',
    }));
    const t = svgEl('text', { x: x(mk.month) + 5, y: 16, class: 'viz-label' });
    t.textContent = mk.label;
    f0.svg.appendChild(t);
  }
  return f0;
}

/** Legend markup — always present when a chart carries two or more series. */
export function legend(items) {
  return `<div class="viz-legend">${items.map((i) =>
    `<span class="viz-legend-item"><span class="viz-swatch${i.dashed ? ' viz-swatch-dash' : ''}" style="background:${i.color}"></span>${i.label}</span>`
  ).join('')}</div>`;
}
