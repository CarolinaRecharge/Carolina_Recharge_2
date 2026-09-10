// Northern Virginia TMY, synthesised rather than shipped.
//
// A real TMY3 file for Dulles is ~1.5 MB of CSV and this demo is meant to be a
// handful of static files with no build step. What follows is a clear-sky model
// modulated by a seeded clearness process, plus a temperature series built from
// an annual sinusoid, a diurnal sinusoid and synoptic noise. It reproduces the
// annual GHI total, the seasonal shape and the temperature extremes that drive
// the PUE curve and the solar yield. It is not a substitute for measured data
// when a number is going in front of a customer — swap in a real TMY3 file and
// the rest of the model does not change.

import { rng, gauss, clamp, monthOfDay, HOURS_PER_YEAR } from './util.js';

const SOLAR_CONSTANT = 1367;
const DEG = Math.PI / 180;

function solarGeometry(lat, doy, hour) {
  // Declination (Cooper) and equation of time (Spencer, truncated).
  const B = ((doy - 1) * 2 * Math.PI) / 365;
  const decl =
    0.006918 - 0.399912 * Math.cos(B) + 0.070257 * Math.sin(B) -
    0.006758 * Math.cos(2 * B) + 0.000907 * Math.sin(2 * B) -
    0.002697 * Math.cos(3 * B) + 0.00148 * Math.sin(3 * B);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(B) - 0.032077 * Math.sin(B) -
    0.014615 * Math.cos(2 * B) - 0.040849 * Math.sin(2 * B));
  // Hour angle at the midpoint of the hour, local standard time (EST, UTC-5).
  const solarTime = hour + 0.5 + eot / 60 + (-77.45 - (-75)) / 15;
  const omega = (solarTime - 12) * 15 * DEG;
  const phi = lat * DEG;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(omega);
  // Solar azimuth, measured from north, for the tilted-surface transposition.
  const sinAz = (Math.cos(decl) * Math.sin(omega)) / Math.max(1e-6, Math.sin(Math.acos(clamp(cosZ, -1, 1))));
  const cosAz = (cosZ * Math.sin(phi) - Math.sin(decl)) / Math.max(1e-6, Math.sin(Math.acos(clamp(cosZ, -1, 1))) * Math.cos(phi));
  const azimuth = Math.atan2(sinAz, cosAz) + Math.PI; // 0 = north, clockwise
  return { cosZ: Math.max(0, cosZ), decl, azimuth };
}

// Calibrated so the annual GHI, DNI and diffuse fraction land within a few
// percent of NSRDB's Dulles values (1,470 kWh/m² · 1,450 kWh/m² · 0.42).
const CLEAR_DAY_KT = 0.68;   // the clearness index a cloudless day reaches here
const HOUR_KT_SIGMA = 0.28;  // hour-to-hour cloud texture within a day

/** Monthly mean clearness index for the Mid-Atlantic — cloudiest in late
 *  winter and spring, clearest in early autumn. */
const KT_MEAN = [0.46, 0.49, 0.51, 0.53, 0.53, 0.55, 0.55, 0.55, 0.57, 0.56, 0.50, 0.45];

export function buildTMY(lat = 38.95, seed = 20260910) {
  const r = rng(seed);
  const ghi = new Float32Array(HOURS_PER_YEAR);
  const dni = new Float32Array(HOURS_PER_YEAR);
  const dhi = new Float32Array(HOURS_PER_YEAR);
  const cosZarr = new Float32Array(HOURS_PER_YEAR);
  const azArr = new Float32Array(HOURS_PER_YEAR);
  const temp = new Float32Array(HOURS_PER_YEAR);

  // Daily clearness follows an AR(1) walk — weather comes in multi-day systems,
  // not independent draws.
  let ktDev = 0;
  // Synoptic temperature anomaly, likewise persistent.
  let tDev = 0;

  for (let doy = 0; doy < 365; doy++) {
    const mo = monthOfDay(doy);
    ktDev = 0.72 * ktDev + 0.28 * gauss(r) * 0.55;
    const ktDay = clamp(KT_MEAN[mo] + ktDev * 0.30, 0.12, 0.78);

    tDev = 0.80 * tDev + 0.20 * gauss(r) * 12;
    // Annual cycle: mean 13.1 °C, peak around 20 July (doy 200).
    const annual = 13.1 - 11.6 * Math.cos((2 * Math.PI * (doy - 17)) / 365);
    // Clear days swing further between night and afternoon.
    const diurnalAmp = 4.2 + 5.6 * ktDay;

    for (let h = 0; h < 24; h++) {
      const i = doy * 24 + h;
      const { cosZ, azimuth } = solarGeometry(lat, doy + 1, h);
      cosZarr[i] = cosZ;
      azArr[i] = azimuth;

      if (cosZ > 0.017) {
        const am = clamp(1 / (cosZ + 0.50572 * Math.pow(96.08 - Math.acos(cosZ) / DEG, -1.634)), 1, 30);
        const ghiCS = SOLAR_CONSTANT * cosZ * 0.79 * Math.exp(-0.062 * am);
        const dniCS = SOLAR_CONSTANT * 0.86 * Math.exp(-0.106 * am);
        // Hour-to-hour cloud texture on top of the day's clearness.
        const ktH = clamp(ktDay + gauss(r) * HOUR_KT_SIGMA, 0.05, 0.80);
        const f = ktH / CLEAR_DAY_KT;
        const g = ghiCS * clamp(f, 0, 1.02);
        // Erbs: the diffuse fraction rises steeply as clearness falls.
        const kt = clamp(g / Math.max(1, SOLAR_CONSTANT * cosZ), 0.02, 0.95);
        let df;
        if (kt <= 0.22) df = 1 - 0.09 * kt;
        else if (kt <= 0.80) df = 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
        else df = 0.165;
        const d = g * clamp(df, 0.12, 1);
        ghi[i] = g;
        dhi[i] = d;
        dni[i] = Math.min(dniCS, Math.max(0, (g - d) / cosZ));
      }

      // Temperature lags the sun by about three hours.
      const diurnal = -diurnalAmp * Math.cos((2 * Math.PI * (h - 15)) / 24);
      temp[i] = annual + diurnal + tDev * 0.55;
    }
  }

  return { ghi, dni, dhi, temp, cosZ: cosZarr, azimuth: azArr, lat };
}

/** Plane-of-array irradiance, isotropic sky (Liu & Jordan). Deliberately the
 *  conservative transposition — it understates POA on clear days by a few
 *  percent rather than overstating it. */
export function poa(tmy, i, tiltDeg, azDeg) {
  const tilt = tiltDeg * DEG;
  const surfAz = azDeg * DEG;
  const cosZ = tmy.cosZ[i];
  if (cosZ <= 0) return 0;
  const zen = Math.acos(clamp(cosZ, -1, 1));
  const cosInc = Math.max(
    0,
    Math.cos(zen) * Math.cos(tilt) + Math.sin(zen) * Math.sin(tilt) * Math.cos(tmy.azimuth[i] - surfAz)
  );
  const beam = tmy.dni[i] * cosInc;
  const sky = tmy.dhi[i] * (1 + Math.cos(tilt)) / 2;
  const grnd = tmy.ghi[i] * 0.2 * (1 - Math.cos(tilt)) / 2;
  return beam + sky + grnd;
}
