import { sanitize } from './helpers';
import { getDecisionThresholdRefs } from './preAnalysisPreview';

export function validateGraph(nodes, edges = [], previewParamValues = {}) {
  const issues = [];
  const byLabel = new Map();
  const byAutoType = new Map();

  for (const n of nodes || []) {
    const label = String(n?.label || '').trim();
    if (label) {
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label).push(n.id);
    }

    if (['calc', 'calcFunction', 'margin', 'decision'].includes(n?.type)) {
      const auto = String(n?.autoLabel || '').trim();
      if (auto) {
        const key = `${n.type}:${auto}`;
        if (!byAutoType.has(key)) byAutoType.set(key, []);
        byAutoType.get(key).push(n.id);
      }
    }
  }

  for (const [label, ids] of byLabel.entries()) {
    if (ids.length > 1) {
      issues.push({
        code: 'duplicate_label',
        message: `Duplicate label "${label}"`,
        nodeIds: ids,
      });
    }
  }

  for (const [key, ids] of byAutoType.entries()) {
    if (ids.length > 1) {
      issues.push({
        code: 'duplicate_auto',
        message: `Duplicate auto label "${key}"`,
        nodeIds: ids,
      });
    }
  }

  const nodeById = Object.fromEntries((nodes || []).map(n => [n.id, n]));
  for (const e of edges || []) {
    const src = nodeById[e.from];
    const tgt = nodeById[e.to];
    if (src?.type === 'probe' || tgt?.type === 'probe') {
      issues.push({
        code: 'probe_edge_forbidden',
        message: 'Probe nodes cannot have arrows. Attach probes directly to arrows instead.',
        nodeIds: [src?.id, tgt?.id].filter(Boolean),
      });
    }
  }

  for (const n of nodes || []) {
    if (n.type !== 'decision') continue;
    const decidedName = `${sanitize(n.label)}_D`;
    const decidedValue = Number(previewParamValues?.[decidedName]);
    if (!Number.isFinite(decidedValue)) continue;

    const refs = getDecisionThresholdRefs(nodes, edges, n.id, previewParamValues);
    for (const ref of refs) {
      const thresholdValue = Number(ref.thresholdValue);
      if (!Number.isFinite(thresholdValue)) continue;
      if (decidedValue < thresholdValue) {
        issues.push({
          code: 'decision_threshold_violation',
          message: `Decision "${n.label}" must be >= threshold (${decidedValue} < ${thresholdValue}) for margin "${ref.marginLabel}".`,
          nodeIds: [n.id, ref.marginId, ref.thresholdSourceId].filter(Boolean),
        });
      }
    }
  }

  const invalidNodeIds = new Set();
  for (const issue of issues) {
    for (const id of issue.nodeIds) invalidNodeIds.add(id);
  }

  return {
    issues,
    invalidNodeIds,
    isValid: issues.length === 0,
  };
}
