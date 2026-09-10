// Small shared helpers. No dependencies, no DOM access — this file is imported
// by the solver, which per spec §9 must stay free of any UI framework.

/** Deterministic PRNG. Same seed, same run, every time — the demo has to be
 *  reproducible or two people looking at it see different numbers. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, drawing from a supplied uniform generator. */
export function gauss(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Linear interpolation on a [[x,y],...] curve, clamped at both ends.
 *  Used for the heat-rate curves in §3.3. */
export function curve(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const maxOf = (a) => a.reduce((m, x) => (x > m ? x : m), -Infinity);

/** Capital recovery factor — annualizes a capex over a life at a discount rate. */
export function crf(rate, years) {
  if (rate === 0) return 1 / years;
  const f = Math.pow(1 + rate, years);
  return (rate * f) / (f - 1);
}

// ── Calendar ────────────────────────────────────────────────────────────────
// 365-day years throughout. Leap days would shift the hourly index against the
// TMY without changing any answer, so the model does not carry them.
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const HOURS_PER_YEAR = 8760;

const MONTH_START_DAY = (() => {
  const out = [0];
  for (let m = 0; m < 12; m++) out.push(out[m] + DAYS_IN_MONTH[m]);
  return out;
})();

/** Day-of-year (0-based) → month-of-year (0-based). */
export function monthOfDay(doy) {
  for (let m = 11; m >= 0; m--) if (doy >= MONTH_START_DAY[m]) return m;
  return 0;
}

export const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Formatting ──────────────────────────────────────────────────────────────
export function money(x, digits = 0) {
  const sign = x < 0 ? '-' : '';
  const v = Math.abs(x);
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}k`;
  return `${sign}$${v.toFixed(digits)}`;
}

export function num(x, digits = 1) {
  if (!isFinite(x)) return '—';
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function int(x) {
  if (!isFinite(x)) return '—';
  return Math.round(x).toLocaleString('en-US');
}

/** Month index from NTP → a readable "Y2 M04" style label. */
export function monthLabel(m) {
  return `M${m}`;
}
export function yearMonth(m) {
  return `Y${Math.floor(m / 12) + 1} ${MONTH_ABBR[m % 12]}`;
}
