// The site as a single line, drawn live.
//
// Sources feed a common bus, the load hangs off it, and storage sits on it
// bidirectionally — which is the actual topology, not a decorative arrangement.
// Ribbon width is proportional to the share of energy each source delivered
// over the horizon, so the picture changes shape as the controls move: the gas
// ribbon swells while the site is islanded and thins to nothing once the grid
// arrives.

import { PALETTE } from './charts.js';

const W = 940, H = 360;
const NS = 'http://www.w3.org/2000/svg';

const SOURCES = [
  { key: 'grid', label: 'Utility grid', color: PALETTE.dispatch.grid },
  { key: 'gas', label: 'Gas bridge', color: PALETTE.dispatch.gas },
  { key: 'solar', label: 'Solar', color: PALETTE.dispatch.solar },
  { key: 'diesel', label: 'Dual-fuel backup', color: PALETTE.dispatch.diesel },
];

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

function node(g, { x, y, w, h, color, title, big, small, dim, badge }) {
  const op = dim ? 0.32 : 1;
  const box = el('rect', {
    x, y, width: w, height: h, rx: 8,
    fill: '#fff', stroke: color, 'stroke-width': 2, opacity: op,
  });
  g.appendChild(box);
  g.appendChild(el('rect', { x, y, width: 4, height: h, rx: 2, fill: color, opacity: op }));
  g.appendChild(el('text', { x: x + 16, y: y + 21, class: 'sch-title', opacity: op }, title));
  g.appendChild(el('text', { x: x + 16, y: y + 45, class: 'sch-big', opacity: op }, big));
  if (small) g.appendChild(el('text', { x: x + 16, y: y + 63, class: 'sch-small', opacity: op }, small));
  if (badge) {
    const bw = badge.length * 6.4 + 14;
    g.appendChild(el('rect', { x: x + w - bw - 10, y: y + 10, width: bw, height: 18, rx: 9, fill: color, opacity: op * 0.14 }));
    g.appendChild(el('text', { x: x + w - bw / 2 - 10, y: y + 23, 'text-anchor': 'middle', class: 'sch-badge', fill: color, opacity: op }, badge));
  }
  return box;
}

/**
 * @param host   container element
 * @param model  { sources: [{key, installedMW, sharePct, active}], loadMW, loadLabel,
 *                 storage: {powerMW, energyMWh, throughputPct, active}, caption }
 */
export function renderSchematic(host, model) {
  host.replaceChildren();
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'sch', preserveAspectRatio: 'xMidYMid meet',
    role: 'img', 'aria-label': model.ariaLabel || 'Site single-line diagram',
  });

  const ribbons = el('g');
  const nodes = el('g');
  svg.appendChild(ribbons);
  svg.appendChild(nodes);

  const srcX = 20, srcW = 210, srcH = 74, gap = 12;
  const busX = 470;
  const loadX = 706, loadW = 214;
  const MAX_RIBBON = 34;

  // Bus bar — everything meets here.
  const busTop = 26, busBot = H - 118;
  ribbons.appendChild(el('rect', {
    x: busX - 4, y: busTop, width: 8, height: busBot - busTop, rx: 4, fill: PALETTE.ink.primary, opacity: 0.85,
  }));
  nodes.appendChild(el('text', {
    x: busX, y: busTop - 10, 'text-anchor': 'middle', class: 'sch-small',
  }, 'COMMON BUS'));

  const total = model.sources.reduce((a, s) => a + Math.max(0, s.sharePct), 0) || 1;

  model.sources.forEach((s, i) => {
    const def = SOURCES.find((d) => d.key === s.key);
    const y = 20 + i * (srcH + gap);
    const cy = y + srcH / 2;
    const active = s.active && s.sharePct > 0.01;
    // Ribbon thickness carries the share of energy; 2px minimum so an installed
    // but barely-used source still reads as connected rather than absent.
    const t = active ? Math.min(MAX_RIBBON, Math.max(2.5, (s.sharePct / total) * MAX_RIBBON * 1.35)) : 2;
    const x0 = srcX + srcW + 2, x1 = busX - 4;
    const mid = (x0 + x1) / 2;
    const d = `M${x0} ${cy} C${mid} ${cy} ${mid} ${cy} ${x1} ${cy}`;
    // Butt caps: a round cap on a 30px ribbon overshoots the bus by 15px and
    // reads as a blob hanging off it.
    const path = el('path', {
      d, fill: 'none', stroke: def.color, 'stroke-width': t,
      opacity: s.active ? (active ? 0.9 : 0.25) : 0.12, 'stroke-linecap': 'butt',
    });
    ribbons.appendChild(path);
    if (active) {
      const flow = el('path', {
        d, fill: 'none', stroke: '#fff', 'stroke-width': Math.max(1, t * 0.3),
        'stroke-dasharray': '5 13', opacity: 0.7, class: 'sch-flow', 'stroke-linecap': 'butt',
      });
      ribbons.appendChild(flow);
    }
    node(nodes, {
      x: srcX, y, w: srcW, h: srcH, color: def.color, title: def.label,
      big: s.installedMW > 0 ? `${s.installedMW.toFixed(s.installedMW < 10 ? 1 : 0)} MW` : 'not installed',
      small: s.active ? `${s.sharePct.toFixed(s.sharePct < 1 ? 2 : 1)}% of energy served` : null,
      dim: !s.active, badge: s.badge,
    });
  });

  // Storage hangs off the bus, bidirectional.
  const stY = H - 82, stX = busX - 130, stW = 260, stH = 74;
  const st = model.storage;
  ribbons.appendChild(el('path', {
    d: `M${busX} ${busBot} L${busX} ${stY}`,
    stroke: PALETTE.dispatch.bess,
    'stroke-width': st.active ? Math.min(26, Math.max(3, st.throughputPct * 2.2)) : 2,
    opacity: st.active ? 0.9 : 0.12, fill: 'none', 'stroke-linecap': 'butt',
  }));
  if (st.active) {
    ribbons.appendChild(el('path', {
      d: `M${busX} ${busBot} L${busX} ${stY}`, stroke: '#fff',
      'stroke-width': 1.6, 'stroke-dasharray': '4 10', opacity: 0.8, fill: 'none',
      class: 'sch-flow-v', 'stroke-linecap': 'butt',
    }));
  }
  node(nodes, {
    x: stX, y: stY, w: stW, h: stH, color: PALETTE.dispatch.bess, title: 'Battery storage',
    big: st.powerMW > 0 ? `${st.powerMW.toFixed(0)} MW / ${st.energyMWh.toFixed(0)} MWh` : 'not installed',
    small: st.active ? `${st.throughputPct.toFixed(1)}% of energy served through storage` : null,
    dim: !st.active, badge: st.badge,
  });

  // Load.
  const loadY = 96, loadH = 128;
  const lcy = loadY + loadH / 2;
  const lt = 40;
  const lx0 = busX + 4, lx1 = loadX;
  const lmid = (lx0 + lx1) / 2;
  const ld = `M${lx0} ${lcy} C${lmid} ${lcy} ${lmid} ${lcy} ${lx1} ${lcy}`;
  ribbons.appendChild(el('path', { d: ld, fill: 'none', stroke: PALETTE.ink.primary, 'stroke-width': lt, opacity: 0.14, 'stroke-linecap': 'butt' }));
  ribbons.appendChild(el('path', { d: ld, fill: 'none', stroke: PALETTE.ink.primary, 'stroke-width': 2.5, 'stroke-dasharray': '7 13', opacity: 0.5, class: 'sch-flow', 'stroke-linecap': 'butt' }));

  const box = el('rect', { x: loadX, y: loadY, width: loadW, height: loadH, rx: 10, fill: PALETTE.ink.primary });
  nodes.appendChild(box);
  nodes.appendChild(el('text', { x: loadX + 20, y: loadY + 26, class: 'sch-title sch-on-dark' }, 'Facility load'));
  nodes.appendChild(el('text', { x: loadX + 20, y: loadY + 60, class: 'sch-big sch-on-dark' }, model.loadMW));
  nodes.appendChild(el('text', { x: loadX + 20, y: loadY + 82, class: 'sch-small sch-on-dark' }, model.loadLabel));
  if (model.loadNote) nodes.appendChild(el('text', { x: loadX + 20, y: loadY + 104, class: 'sch-small sch-on-dark' }, model.loadNote));

  host.appendChild(svg);
}
