import { NODE_META } from '../constants/nodeTypes';
import { getCalcFunctionVisualSpec } from './calcFunctionVisual';

export function getNodeSize(node) {
  if (node?.type === 'calcFunction') {
    const spec = getCalcFunctionVisualSpec(node);
    return { w: spec.width, h: spec.height };
  }
  const meta = NODE_META[node?.type] || {};
  return { w: meta.size?.w ?? 44, h: meta.size?.h ?? 44 };
}

