// Every number the model runs on lives here, each tagged with the confidence
// the spec gives it. The Assumptions panel renders straight off these tags, so
// an open item can never quietly become an unmarked default.
//
//   'confirmed' → ✅ in the spec's decision log
//   'validate'  → [VALIDATE]: a default that still needs judgment
//   'decide'    → [DECIDE]: an open call
//   'derived'   → computed from other inputs, shown for transparency

export const SITE = {
  name: 'Grid-constrained NoVA campus',
  lat: 38.95,
  lon: -77.45,
  utility: 'Dominion Energy Virginia',
  rateClass: 'GS-5 (modelled on the GS-4 2026 structure)',
  serviceVoltage: 'transmission',
};

export const HORIZON_YEARS = 15;
export const HORIZON_MONTHS = HORIZON_YEARS * 12;

// ── 1. Display case ─────────────────────────────────────────────────────────
export const DEFAULTS = {
  facilityPeakMW: 100,        // full build, facility (IT × PUE)
  rampPhases: 4,              // 25% of IT capacity per year
  gridEnergizationMonth: 60,  // D1 ✅   slider 36–84
  interimGridMW: 0,           // optional interim block
  hybridFirstPowerMonth: 18,  // D2 ✅
  gasOverlapMonths: 3,        // [VALIDATE] commissioning + grid shakedown
  retainedGasMW: 0,           // D5 ✅ default; scenario 4 slider
  contractedDemandPct: 100,   // % of facility peak put under contract
  workloadPreset: 'colo-mixed',
  dieselAsBridgeReserve: false, // §8.2 — default (b), toggle exposes (a)
  bessMWPerPhase: 20,         // economic sizing; screening min is a floor
  bessHours: 2.0,
  solarMWdc: 8,               // added M24
  seed: 20260910,
};

// ── 3.2 Workload presets (D9) ───────────────────────────────────────────────
// step / critical / shed are the three numbers §8.1 flags as the ones that
// decide the diesel-vs-BESS answer. The load-shape terms below them are the
// model's own and carry the same flag.
export const PRESETS = {
  'colo-mixed': {
    label: 'Colo, mixed tenants',
    blurb: 'Tenant SLAs mean everything stays up. No load is sheddable, so firm backup is sized to the whole facility.',
    stepSwingFracIT: 0.03,
    criticalFrac: 1.00,
    shedWindowMin: null,        // n/a — nothing sheds
    base: 0.72, diurnalAmp: 0.10, weeklyAmp: 0.06, noiseSigma: 0.020,
  },
  'ai-inference': {
    label: 'AI inference',
    blurb: 'Traffic drains and redirects to other regions inside 15 minutes; 60% of load has to survive a long outage.',
    stepSwingFracIT: 0.08,
    criticalFrac: 0.60,
    shedWindowMin: 15,
    base: 0.75, diurnalAmp: 0.14, weeklyAmp: 0.05, noiseSigma: 0.028,
  },
  'ai-training': {
    label: 'AI training',
    blurb: 'Jobs checkpoint and pause in 20 minutes. Only storage, network and cooling — 35% — must ride through.',
    stepSwingFracIT: 0.15,
    criticalFrac: 0.35,
    shedWindowMin: 20,
    base: 0.92, diurnalAmp: 0.03, weeklyAmp: 0.012, noiseSigma: 0.035,
  },
};

// ── 3.2 Cooling (D4 ✅) ──────────────────────────────────────────────────────
export const COOLING = { pueMin: 1.20, tRefC: 18, slopePerC: 0.008, pueMax: 1.45 };

// ── 3.3 Genset unit types ───────────────────────────────────────────────────
export const NG_BRIDGE = {
  id: 'ng-bridge',
  label: 'Gas bridge recip',
  fuel: 'NG',
  ratedKW: 2500,
  heatRateCurve: [[0.3, 12000], [0.5, 10300], [0.75, 9200], [1.0, 8800]], // D4 ✅ Btu/kWh HHV
  minLoadFrac: 0.40,
  maxContinuousFrac: 0.95,
  startTimeMin: 5,
  blockLoadAcceptFrac: 0.25,
  varOMPerRunHr: 26,          // [VALIDATE]
  rentPerKWMonth: 20,         // [VALIDATE] customer-facing price = company revenue
  mobilizePerUnit: 35000,     // [VALIDATE]
  demobilizePerUnit: 25000,   // [VALIDATE]
};

export const DF_BACKUP = {
  id: 'df-backup',
  label: 'Dual-fuel backup',
  fuel: 'diesel + NG blend',
  ratedKW: 3000,
  gasSubstitutionMaxFrac: 0.70,  // [VALIDATE] starts and carries steps on diesel
  dieselHeatRateCurve: [[0.3, 11500], [0.5, 10200], [0.75, 9600], [1.0, 9400]], // [VALIDATE]
  startTimeSec: 10,
  blockLoadAcceptFrac: 0.50,
  onSiteDieselHours: 48,      // [VALIDATE] tank sizing at full backup load
  testing: { hrsPerMonth: 1, loadFrac: 0.4 },
  capexPerKW: 1110,           // [VALIDATE] Tier 4 + DGB kit, installed 2026 US
  fixedOMPerKWYr: 12,         // [VALIDATE]
  permitCompliancePerKWYr: 13, // [VALIDATE] non-emergency permit, CEMS, testing fuel
  varOMPerRunHr: 34,          // [VALIDATE]
  lifeYears: 20,
  permit: { emergencyOnly: false, nonEmergencyHrCap: 50 },
};

// ── 3.4 BESS ────────────────────────────────────────────────────────────────
export const BESS = {
  rte: 0.87,
  socMin: 0.05,
  socMax: 0.95,
  capexPerKWh: 245,           // [VALIDATE]
  capexPerKW: 180,            // [VALIDATE]
  fixedOMPerKWYr: 8,          // [VALIDATE]
  augmentationFracPerYr: 0.015, // of energy capex
  degradation: { calendarPctYr: 1.0, cyclePctPerFEC: 0.004 },
  minDurationH: 1.0,          // standard LFP
  lifeYears: 15,
};

// ── 3.5 Solar ───────────────────────────────────────────────────────────────
export const SOLAR = {
  tiltDeg: 30,
  azimuthDeg: 180,
  dcAcRatio: 1.20,
  systemLossFrac: 0.14,
  tempCoeffPerC: -0.0035,
  noct: 45,
  capexPerWdc: 1.15,          // [VALIDATE] installed 2026 US, ground mount
  fixedOMPerKWYr: 14,         // [VALIDATE]
  lifeYears: 25,
};

// ── 3.7 Tariff — GS-4 2026 structure used as the GS-5 proxy ─────────────────
// Every line is [VALIDATE]. The spec is explicit that the rider adder needs a
// real bill before anyone quotes these numbers.
export const TARIFF = {
  label: 'Dominion GS-4 2026 structure, transmission voltage (GS-5 proxy)',
  customerChargePerMonth: 2500,
  generationDemandPerKWMo: 8.00,
  transmissionDemandPerKWMo: 4.50,
  distributionDemandPerKWMo: 2.20,
  generationEnergyPerKWh: 0.0280,
  riderAdderPerKWh: 0.0325,   // [VALIDATE] needs a real bill
  contractMinGenFrac: 0.85,   // 85% of contracted demand
  contractMinDistFrac: 0.60,  // 60% of contracted demand
  summerRatchetFrac: 0.75,    // 75% of the highest summer demand, trailing 11 months
  summerMonths: [5, 6, 7, 8], // Jun–Sep, 0-based
  escalationPctPerYr: 2.5,    // [VALIDATE]
  billingIntervalNote:
    'Dominion bills demand on the highest 30-minute interval; hourly modeling slightly understates billed demand.',
};

// ── 5. Fuel, emissions, money ───────────────────────────────────────────────
export const FUEL = {
  henryHubStart: 3.50,        // [VALIDATE] $/MMBtu, year 1
  henryHubEscalationPctPerYr: 2.0, // [VALIDATE]
  basisAdder: 1.50,           // [VALIDATE] +$1.50 NoVA basis
  dieselPerGallon: 3.60,      // [VALIDATE]
  dieselMMBtuPerGallon: 0.1387,
  ngKgCO2PerMMBtu: 53.06,
  dieselKgCO2PerMMBtu: 73.16,
  gridKgCO2PerMWh: 310,       // [VALIDATE] Dominion system average, 2026 est.
};

export const FINANCE = {
  discountRatePct: 8.0,
  itRevenuePerKWMoIT: 130,    // [VALIDATE] NoVA critical-IT contract rate, $/kW-mo
  valueOfLostLoadPerMWh: 12000, // [VALIDATE]
  outageCostPerEvent: 2.8e6,  // [VALIDATE] per unplanned facility-wide outage
};

// ── 4.5 Stress events ───────────────────────────────────────────────────────
export const STRESS = {
  gridOutagesPerYear: 1,
  gridOutageHours: 4,
  curtailmentsPerYear: 3,     // [VALIDATE] IRAS pending at FERC
  curtailmentHours: 6,
  gasInterruptionsPerYear: 1, // bridge-phase equivalent of the grid outage
  gasInterruptionHours: 6,    // [VALIDATE]
};

// ── The open-items register the Assumptions panel renders ───────────────────
export const OPEN_ITEMS = [
  { id: 'D1', status: 'confirmed', title: 'Grid energization at month 60',
    note: 'Slider spans 36–84 months. Drives every scenario, including "wait".' },
  { id: 'D2', status: 'confirmed', title: 'Hybrid first power at month 18', note: 'Slider.' },
  { id: 'D3', status: 'confirmed', title: 'Demand billed on 1-hour intervals',
    note: TARIFF.billingIntervalNote },
  { id: 'D4', status: 'confirmed', title: 'v0.1 PUE curve and NG recip heat-rate curve',
    note: 'PUE 1.20 floor, +0.008/°C above 18 °C, 1.45 ceiling. Heat rate 12,000 → 8,800 Btu/kWh HHV.' },
  { id: 'D5', status: 'confirmed', title: 'Gas bridge units redeploy after energization',
    note: 'Tier 4 diesel covers the outage scenario. Scenario 4 exists to price the alternative.' },
  { id: 'D6', status: 'confirmed', title: 'Company owns the gas fleet, customer rents it', note: '' },
  { id: 'D7', status: 'confirmed', title: 'Backup fleet is dual-fuel',
    note: 'Read as diesel-start with NG blending, reusing the bridge gas interconnect. A gas interruption degrades to diesel-only rather than failing. Flag if a separate-units arrangement was meant instead.' },
  { id: 'D8', status: 'confirmed', title: 'Heuristic dispatch for the MVP, built LP-ready',
    note: 'solveWindow(problem, state) → flows[] with a shared cost model. See §9.' },
  { id: 'D9', status: 'confirmed', title: 'All three workload presets selectable',
    note: 'Each preset drives the load shape and the backup sizing.' },
  { id: 'D10', status: 'confirmed', title: 'Keep diesel mild',
    note: 'BESS carries load until gas or diesel is online; backup sized by least cost.' },

  { id: '§3.2', status: 'validate', title: 'Preset critical fractions and shed windows',
    note: 'colo 1.00 / n/a · inference 0.60 / 15 min · training 0.35 / 20 min. These three numbers decide the diesel-vs-BESS split more than any cost input.' },
  { id: '§3.2', status: 'validate', title: 'Load-shape terms behind each preset',
    note: 'Base utilization, diurnal and weekly amplitude, noise. The model\'s own defaults, not from the spec.' },
  { id: '§3.3', status: 'validate', title: 'Gas substitution max 70% on the dual-fuel units', note: '' },
  { id: '§3.3', status: 'validate', title: 'Diesel heat-rate curve', note: '11,500 → 9,400 Btu/kWh.' },
  { id: '§3.3', status: 'validate', title: 'On-site diesel 48 h at full backup load', note: '' },
  { id: '§3.7', status: 'validate', title: 'Rider adder — needs a real bill',
    note: `Modelled at $${TARIFF.riderAdderPerKWh.toFixed(4)}/kWh on top of a $${TARIFF.generationEnergyPerKWh.toFixed(4)}/kWh generation charge. This is the single largest unvalidated input in the grid bill.` },
  { id: '§4.5', status: 'validate', title: '3 PJM curtailment events per year of 6 h',
    note: 'IRAS pending at FERC. The model shows the permit-hour gap rather than assuming it away.' },
  { id: '§5', status: 'validate', title: 'Gas basis adder +$1.50/MMBtu over Henry Hub', note: '' },
  { id: '§10', status: 'validate', title: 'Installed cost defaults',
    note: `Tier 4 diesel + DGB $${DF_BACKUP.capexPerKW}/kW, O&M $${DF_BACKUP.fixedOMPerKWYr}/kW-yr plus $${DF_BACKUP.permitCompliancePerKWYr}/kW-yr permit/CEMS. BESS $${BESS.capexPerKWh}/kWh + $${BESS.capexPerKW}/kW.` },
  { id: '§1', status: 'validate', title: 'Gas fleet overlap of 3 months after energization',
    note: 'Covers commissioning and grid shakedown before demobilization.' },

  { id: '§8.2', status: 'decide', title: 'May diesel count as bridge contingency reserve?',
    note: 'Default is (b), backup-only, with the gas fleet carrying its own N+1. Toggle (a) to let diesel count as gas-loss and multi-unit-trip reserve and see what it removes from the rented fleet. The answer turns on how Virginia air permits treat diesel run-time as reserve.' },
  { id: '§3.8', status: 'decide', title: 'df-backup sizing at IT phase 1',
    note: 'The screening optimizer in §10 sets it from the preset. Override it in the sizing panel and the hourly run re-checks it.' },
];
