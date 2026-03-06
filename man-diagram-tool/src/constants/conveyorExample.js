// Belt conveyor MAN example — Brahma & Wynn (2020), Figure 7.
// Node labels are clean variable names so they work as formula references.
// Formulas are simplified but numerically consistent; excesses are all positive.
//
// Computed baseline values (approx):
//   R=3.65 kN, P_A=9.13 kW, T=13.27 kN, P_M2=10.74 kW
//   P_GB=16.11 kW, T_BR=68.4 Nm, D_DR=0.812 m, D_s=0.050 m
//   E1≈68%, E2≈84%, E3≈24%, E4≈23%, E8≈10%

export function buildConveyorExample() {
  const mk = (id, type, x, y, label, extra = {}) => ({
    id,
    type,
    x,
    y,
    label,
    description: extra.desc || '',
    unit: extra.unit || '',
    value: extra.value || '',
    equation: extra.equation || '',
    decidedValue: extra.decidedValue || '',
    isOfInterest: extra.isOfInterest || false,
    stepNumber: extra.stepNumber || null,
    autoLabel: extra.autoLabel || null,
  });

  const nodes = [
    // ── Input parameters (labels = formula variable names) ──────────
    mk('C',   'input',  80,  100, 'C',     { unit: 'T/h',    value: '1200', desc: 'Required conveyor capacity', isOfInterest: true }),
    mk('V',   'input',  80,  180, 'V',     { unit: 'm/s',    value: '2.5',  desc: 'Belt speed',                 isOfInterest: true }),
    mk('rho', 'input',  80,  260, 'rho',   { unit: 'T/m\u00B3', value: '0.8', desc: 'Bulk density of material', isOfInterest: true }),
    mk('BCT', 'input',  80,  340, 'B_CT',  { unit: 'kg/m\u00B2', value: '6.4', desc: 'Belt carcass weight',    isOfInterest: true }),
    mk('mu',  'input',  80,  420, 'mu',    { value: '0.275', desc: 'Friction coefficient',                      isOfInterest: true }),

    // ── Calculation steps ───────────────────────────────────────────
    // R = effective running resistance [kN]
    // Inputs: C (T/h), V (m/s), rho (T/m³) → all directly connected
    mk('resist',  'calc', 280, 150, 'R',
      { stepNumber: 1, autoLabel: '1',
        desc: 'Effective running resistance (simplified)',
        equation: 'C * rho * 0.0025 + V * 0.5' }),

    // P_A = belt power absorbed [kW]  (V=2.5 baked in as constant)
    mk('power',   'calc', 480, 150, 'P_A',
      { stepNumber: 2, autoLabel: '2',
        desc: 'Belt power absorbed',
        equation: 'R * 2.5' }),

    // T = effective belt tension [kN]
    mk('tension', 'calc', 280, 320, 'T',
      { stepNumber: 3, autoLabel: '3',
        desc: 'Effective belt tension',
        equation: 'R / mu' }),

    // P_M2 = minimum motor power required [kW]  (eta=0.85, DF baked in)
    mk('motor_pm2', 'calc', 480, 240, 'P_M2',
      { stepNumber: 4, autoLabel: '4',
        desc: 'Minimum motor power (P_A / drive efficiency)',
        equation: 'P_A / 0.85' }),

    // ── Motor chain ─────────────────────────────────────────────────
    mk('motor_d', 'decision', 680, 200, 'D1',
      { autoLabel: null,
        desc: 'Catalogue selection: next motor above P_M2 [kW]',
        decidedValue: '18' }),
    mk('E1', 'margin', 870, 200, 'E1',
      { autoLabel: 'E1', desc: 'Motor power excess' }),

    // ── Gearbox chain ───────────────────────────────────────────────
    // P_GB = gearbox power requirement [kW]
    mk('gbox_pgb', 'calc', 480, 340, 'P_GB',
      { stepNumber: 5, autoLabel: '5',
        desc: 'Gearbox power requirement',
        equation: 'P_M2 * 1.5' }),
    mk('gbox_d', 'decision', 680, 330, 'D2',
      { autoLabel: null,
        desc: 'Catalogue selection: next gearbox above P_GB [kW]',
        decidedValue: '20' }),
    mk('E3', 'margin', 870, 330, 'E3',
      { autoLabel: 'E3', desc: 'Gearbox power excess' }),

    // ── Brake chain ─────────────────────────────────────────────────
    // T_BR = brake torque requirement [Nm]  (N1=1500 rpm baked in)
    mk('brake_tbr', 'calc', 480, 430, 'T_BR',
      { stepNumber: 6, autoLabel: '6',
        desc: 'Brake torque requirement (P_M2 * 9550 / 1500)',
        equation: 'P_M2 * 6.37' }),
    mk('brake_d', 'decision', 680, 430, 'D3',
      { autoLabel: null,
        desc: 'Catalogue selection: next brake above T_BR [Nm]',
        decidedValue: '126' }),
    mk('E2', 'margin', 870, 430, 'E2',
      { autoLabel: 'E2', desc: 'Brake torque excess' }),

    // ── Pulley chain ────────────────────────────────────────────────
    // D_DR = minimum drive pulley diameter [m]
    mk('pulley_req', 'calc', 280, 440, 'D_DR',
      { stepNumber: 7, autoLabel: '7',
        desc: 'Minimum drive pulley diameter from belt carcass',
        equation: 'B_CT * 0.08 + 0.3' }),
    mk('pulley_d', 'decision', 480, 530, 'D4',
      { autoLabel: null,
        desc: 'IS 1891 catalogue: next pulley diameter above D_DR [m]',
        decidedValue: '1.0' }),
    mk('E4', 'margin', 680, 530, 'E4',
      { autoLabel: 'E4', desc: 'Drive pulley diameter excess' }),

    // ── Shaft chain ─────────────────────────────────────────────────
    // D_s = minimum drive shaft diameter [m]  (uses belt tension T and decided pulley D4)
    mk('shaft_calc', 'calc', 480, 620, 'D_s',
      { stepNumber: 8, autoLabel: '8',
        desc: 'Minimum shaft diameter from bending + torsion',
        equation: 'T * 0.003 + D4 * 0.01' }),
    mk('drv_d', 'decision', 680, 610, 'D5',
      { autoLabel: null,
        desc: 'Standard shaft diameter selected [m]',
        decidedValue: '0.055' }),
    mk('E8', 'margin', 870, 610, 'E8',
      { autoLabel: 'E8', desc: 'Drive shaft diameter excess' }),

    // ── Performance parameters ──────────────────────────────────────
    // TCS and TWS have formulas to produce meaningful impact values.
    // IS and eta_m use single-input passthrough from E1.
    mk('TCS', 'performance', 1060, 250, 'TCS',
      { unit: '$', desc: 'Total system cost',
        equation: 'E1 * 1000 + E3 * 800 + E2 * 8 + E4 * 2000 + E8 * 500' }),
    mk('TWS', 'performance', 1060, 350, 'TWS',
      { unit: 'kg', desc: 'Total system weight',
        equation: 'E1 * 45 + E3 * 38 + E2 * 0.4 + E4 * 120 + E8 * 15' }),
    mk('IS',   'performance', 1060, 450, 'IS',
      { unit: 'kg\u00B7m\u00B2', desc: 'Drive inertia' }),
    mk('etam', 'performance', 1060, 550, 'eta_m',
      { unit: '', desc: 'Drive efficiency proxy' }),
  ];

  const edge = (from, to, edgeType = 'plain') => ({
    id: `e_${from}_${to}_${edgeType}`,
    from,
    to,
    edgeType,
  });

  const edges = [
    // Inputs → calculation steps
    edge('C',   'resist'),
    edge('V',   'resist'),
    edge('rho', 'resist'),
    edge('BCT', 'pulley_req'),
    edge('mu',  'tension'),

    // Calc chain
    edge('resist',    'power'),
    edge('resist',    'tension'),
    edge('power',     'motor_pm2'),

    // Motor margin (threshold = P_M2, decided = D1)
    edge('motor_pm2', 'motor_d'),
    edge('motor_pm2', 'E1', 'threshold'),
    edge('motor_d',   'E1', 'decided'),

    // Gearbox
    edge('motor_pm2', 'gbox_pgb'),
    edge('gbox_pgb',  'gbox_d'),
    edge('gbox_pgb',  'E3', 'threshold'),
    edge('gbox_d',    'E3', 'decided'),

    // Brake
    edge('motor_pm2', 'brake_tbr'),
    edge('brake_tbr', 'brake_d'),
    edge('brake_tbr', 'E2', 'threshold'),
    edge('brake_d',   'E2', 'decided'),

    // Pulleys
    edge('pulley_req', 'pulley_d'),
    edge('pulley_req', 'E4', 'threshold'),
    edge('pulley_d',   'E4', 'decided'),

    // Shafts — tension and decided pulley diameter feed shaft sizing
    edge('tension',   'shaft_calc'),
    edge('pulley_d',  'shaft_calc'),
    edge('shaft_calc','drv_d'),
    edge('shaft_calc','E8', 'threshold'),
    edge('drv_d',     'E8', 'decided'),

    // Margins → performance parameters
    edge('E1', 'TCS'),
    edge('E1', 'TWS'),
    edge('E1', 'IS'),
    edge('E1', 'etam'),
    edge('E3', 'TCS'),
    edge('E3', 'TWS'),
    edge('E2', 'TCS'),
    edge('E2', 'TWS'),
    edge('E4', 'TCS'),
    edge('E4', 'TWS'),
    edge('E8', 'TCS'),
    edge('E8', 'TWS'),
  ];

  return {
    nodes,
    edges,
    nextCalcNumber: 9,
    nextMarginNumber: 10,
    nextDecisionNumber: 6,
  };
}
