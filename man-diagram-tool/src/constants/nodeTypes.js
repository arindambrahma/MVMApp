// Node type identifiers
export const NODE_TYPES = {
  INPUT: 'input',
  CALC: 'calc',
  CALC_FUNCTION: 'calcFunction',
  PROBE: 'probe',
  DECISION: 'decision',
  MARGIN: 'margin',
  PERFORMANCE: 'performance',
};

// Visual metadata matching Table 5.2 of Brahma & Wynn (2020)
export const NODE_META = {
  input: {
    label: 'Input Parameter',
    shape: 'smallDiamond',
    size: { w: 28, h: 28 },
    fill: '#FFFFFF',
    fillInterest: '#F59E0B',
    stroke: '#000000',
    strokeWidth: 1.5,
  },
  calc: {
    label: 'Calculation Step',
    shape: 'circle',
    size: { w: 44, h: 44 },
    fill: '#FFFFFF',
    stroke: '#000000',
    strokeWidth: 1.5,
  },
  calcFunction: {
    label: 'Calculation Function',
    shape: 'functionBox',
    size: { w: 180, h: 80 },
    fill: '#FFFBEB',
    stroke: '#92400E',
    strokeWidth: 1.5,
  },
  probe: {
    label: 'Probe',
    shape: 'probeRect',
    size: { w: 120, h: 58 },
    fill: '#FDE68A',
    stroke: '#92400E',
    strokeWidth: 1.5,
  },
  decision: {
    label: 'Decision Step',
    shape: 'largeDiamond',
    size: { w: 100, h: 64 },
    fill: '#DBEAFE',
    stroke: '#000000',
    strokeWidth: 1.5,
  },
  margin: {
    label: 'Margin Node',
    shape: 'hexagon',
    size: { w: 48, h: 40 },
    fill: '#FFFFFF',
    stroke: '#000000',
    strokeWidth: 1.5,
  },
  performance: {
    label: 'Performance Parameter',
    shape: 'donut',
    size: { w: 30, h: 30 },
    fill: '#FFFFFF',
    stroke: '#DC2626',
    strokeWidth: 4,
  },
};

// Edge type identifiers
export const EDGE_TYPES = {
  DECIDED: 'decided',
  THRESHOLD: 'threshold',
  PLAIN: 'plain',
};
