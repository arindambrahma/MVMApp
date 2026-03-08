import { NODE_META } from './nodeTypes';

let _idCounter = 0;

export function createNode(type, x, y, overrides = {}) {
  _idCounter++;
  const meta = NODE_META[type] || NODE_META['calc'];
  const base = {
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

  // Hierarchical calculation node — carries ports and embedded sub-graph
  if (type === 'calcHierarchical') {
    base.ports = overrides.ports || { inputs: ['in'], outputs: ['out'] };
    base.subGraph = overrides.subGraph || { nodes: [], edges: [] };
  }

  // Boundary port nodes inside sub-graphs
  if (type === 'hierarchicalInput' || type === 'hierarchicalOutput') {
    base.portName = overrides.portName || overrides.label || '';
  }

  return base;
}
