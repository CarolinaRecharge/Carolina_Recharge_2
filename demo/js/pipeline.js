// The request path, drawn live.
//
// Three mechanisms keep this page answering while a control moves, and all
// three are invisible if you only look at the numbers: requests coalesce, the
// model runs off-thread, and only the scenarios a control actually reaches get
// re-solved. This draws them as one pipeline with the real counters on it, so
// dragging a slider shows you the queue filling, superseding and draining.

import { PALETTE } from './charts.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 980, H = 196;

function n(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

const STAGES = [
  { key: 'controls', title: 'Controls', sub: 'input events' },
  { key: 'runner', title: 'Coalescing queue', sub: '1 in flight · 1 queued' },
  { key: 'transport', title: 'Transport', sub: 'structured clone' },
  { key: 'session', title: 'Dependency cache', sub: 'invalidate by input' },
  { key: 'model', title: 'Model', sub: '131,400 h × 4' },
  { key: 'paint', title: 'Paint', sub: 'active tab only' },
];

/**
 * @param host  container
 * @param s     runner stats
 * @param extra { recomputedScenarios: [key], scenarioColors: {key: hex} }
 */
export function renderPipeline(host, s, extra = {}) {
  host.replaceChildren();
  const svg = n('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'pipe', preserveAspectRatio: 'xMidYMid meet',
    role: 'img', 'aria-label': 'Live request pipeline',
  });

  const boxW = 138, boxH = 70, gap = (W - 40 - STAGES.length * boxW) / (STAGES.length - 1);
  const y = 52;
  const active = s.inflight;

  STAGES.forEach((st, i) => {
    const x = 20 + i * (boxW + gap);
    // A stage is "hot" when work is actually passing through it right now.
    const hot = active && i >= 1 && i <= 4;
    const col = hot ? PALETTE.dispatch.grid : PALETTE.ink.muted;

    if (i < STAGES.length - 1) {
      const x0 = x + boxW, x1 = x + boxW + gap;
      const mid = y + boxH / 2;
      svg.appendChild(n('path', {
        d: `M${x0 + 2} ${mid} L${x1 - 8} ${mid}`, stroke: PALETTE.grid, 'stroke-width': 6,
        fill: 'none', 'stroke-linecap': 'round',
      }));
      if (active) {
        svg.appendChild(n('path', {
          d: `M${x0 + 2} ${mid} L${x1 - 8} ${mid}`, stroke: PALETTE.dispatch.grid,
          'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round',
          'stroke-dasharray': '6 12', class: 'pipe-flow',
        }));
      }
      svg.appendChild(n('path', {
        d: `M${x1 - 10} ${mid - 5} L${x1 - 3} ${mid} L${x1 - 10} ${mid + 5}`,
        fill: 'none', stroke: active ? PALETTE.dispatch.grid : PALETTE.ink.muted, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
    }

    svg.appendChild(n('rect', {
      x, y, width: boxW, height: boxH, rx: 8, fill: '#fff',
      stroke: col, 'stroke-width': hot ? 2.5 : 1.5, opacity: hot ? 1 : 0.7,
    }));
    svg.appendChild(n('text', { x: x + boxW / 2, y: y + 26, 'text-anchor': 'middle', class: 'pipe-t' }, st.title));
    svg.appendChild(n('text', { x: x + boxW / 2, y: y + 44, 'text-anchor': 'middle', class: 'pipe-s' }, st.sub));

    const badge = badgeFor(st.key, s, extra);
    if (badge) {
      svg.appendChild(n('text', {
        x: x + boxW / 2, y: y + 62, 'text-anchor': 'middle', class: 'pipe-n',
        fill: badge.hot ? PALETTE.dispatch.grid : PALETTE.ink.secondary,
      }, badge.text));
    }

    // Counters above each stage.
    const cap = capFor(st.key, s, extra);
    if (cap) {
      svg.appendChild(n('text', { x: x + boxW / 2, y: y - 22, 'text-anchor': 'middle', class: 'pipe-cap' }, cap[0]));
      svg.appendChild(n('text', { x: x + boxW / 2, y: y - 6, 'text-anchor': 'middle', class: 'pipe-val' }, cap[1]));
    }
  });

  // The dropped-request return path — the mechanism that keeps the queue at one.
  const rx0 = 20 + (boxW + gap) + boxW / 2;
  const yb = y + boxH + 28;
  svg.appendChild(n('path', {
    d: `M${rx0} ${y + boxH} L${rx0} ${yb} L${rx0 - 60} ${yb}`,
    fill: 'none', stroke: PALETTE.status.warn, 'stroke-width': 1.6,
    'stroke-dasharray': '4 4', opacity: s.dropped > 0 ? 0.85 : 0.25,
  }));
  svg.appendChild(n('text', {
    x: rx0 - 66, y: yb + 4, 'text-anchor': 'end', class: 'pipe-s',
    fill: s.dropped > 0 ? PALETTE.status.warn : PALETTE.ink.muted,
  }, `${s.dropped.toLocaleString()} superseded before running`));

  host.appendChild(svg);
}

function capFor(key, s, extra) {
  switch (key) {
    case 'controls': return ['asks', s.requested.toLocaleString()];
    case 'runner': return ['queued', String(s.queuedDepth)];
    case 'transport': return ['via', s.transport];
    case 'session': return ['re-solved', `${extra.recomputedScenarios?.length ?? 0} of 4`];
    case 'model': return ['last run', `${s.lastMs.toFixed(0)} ms`];
    case 'paint': return ['answers', s.completed.toLocaleString()];
    default: return null;
  }
}

function badgeFor(key, s, extra) {
  if (key === 'runner') return { text: s.inflight ? 'busy' : 'idle', hot: s.inflight };
  if (key === 'paint') return { text: `${s.lastWaitMs.toFixed(0)} ms end to end`, hot: false };
  if (key === 'session' && extra.recomputedScenarios?.length) {
    const n = extra.recomputedScenarios.length;
    // Four scenario names will not fit inside a 138px box; the count does.
    return { text: n === 4 ? 'all four' : extra.recomputedScenarios.join(' · ').slice(0, 22), hot: true };
  }
  if (key === 'session') return { text: 'all cached', hot: false };
  return null;
}
