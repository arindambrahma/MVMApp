import { NODE_META } from './nodeTypes';

let _idCounter = 0;

export function createNode(type, x, y, overrides = {}) {
  _idCounter++;
  const meta = NODE_META[type];
  return {
    id: overrides.id || `node_${Date.now()}_${_idCounter}`,
    type,
    x,
    y,
    label: overrides.label || meta.label,
    description: overrides.description || '',
    unit: overrides.unit || '',
    value: overrides.value || '',
    equation: overrides.equation || '',
    functionCode: overrides.functionCode || '',
    rootSelectionPolicy: overrides.rootSelectionPolicy || 'min',
    decidedValue: overrides.decidedValue || '',
    probeEdgeId: overrides.probeEdgeId || null,
    probeEdgeT: Number.isFinite(Number(overrides.probeEdgeT)) ? Number(overrides.probeEdgeT) : 0.5,
    clusterId: overrides.clusterId || null,
    isOfInterest: overrides.isOfInterest || false,
    stepNumber: overrides.stepNumber || null,
    autoLabel: overrides.autoLabel || null,
  };
}
