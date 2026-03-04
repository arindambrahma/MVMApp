import { sanitize } from './helpers';

export function resolveEdgeRuntimeName(edge, srcNode) {
  if (!edge || !srcNode) return '';
  if (edge.fromPort) return sanitize(edge.fromPort);
  if (srcNode.type === 'decision') return `${sanitize(srcNode.label)}_D`;
  if (srcNode.type === 'margin') return `${sanitize(srcNode.label)}_decided`;
  return sanitize(srcNode.label);
}

export function resolveEdgeSignalValue(edge, nodeById, paramValues) {
  if (!edge || !nodeById) return { runtimeName: '', value: null, sourceLabel: '' };
  const srcNode = nodeById[edge.from];
  if (!srcNode) return { runtimeName: '', value: null, sourceLabel: '' };
  const runtimeName = resolveEdgeRuntimeName(edge, srcNode);
  const raw = runtimeName ? paramValues?.[runtimeName] : undefined;
  const numeric = Number(raw);
  return {
    runtimeName,
    value: Number.isFinite(numeric) ? numeric : null,
    sourceLabel: srcNode.label || '',
  };
}
