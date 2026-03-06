import { sanitize } from './helpers';
import { parseCalculationFunction } from './calcFunctionParser';
import { resolveEdgeRuntimeName } from './edgeSignal';

function toFiniteNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeEdgeType(edge, nodeById) {
  if (edge.edgeType) return edge.edgeType;
  if (edge.isTarget === true) return 'threshold';
  const target = nodeById[edge.to];
  const source = nodeById[edge.from];
  if (target?.type === 'margin') {
    return source?.type === 'decision' ? 'decided' : 'threshold';
  }
  return 'plain';
}

function topoSortNodes(nodes, edges) {
  const nodeMap = new Map((nodes || []).map(n => [n.id, n]));
  const inDegree = new Map();
  const children = new Map();

  for (const n of nodes || []) {
    inDegree.set(n.id, 0);
    children.set(n.id, []);
  }

  for (const e of edges || []) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue;
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    children.get(e.from).push(e.to);
  }

  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    const node = nodeMap.get(id);
    if (node) ordered.push(node);
    for (const child of children.get(id) || []) {
      const next = (inDegree.get(child) || 0) - 1;
      inDegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  // If cyclic, append remaining nodes to keep preview best-effort.
  if (ordered.length !== (nodes || []).length) {
    const seen = new Set(ordered.map(n => n.id));
    for (const n of nodes || []) {
      if (!seen.has(n.id)) ordered.push(n);
    }
  }

  return ordered;
}

function applyInputAliases(formula, aliasToRuntime) {
  if (!formula) return '';
  let out = String(formula);
  const aliases = Object.keys(aliasToRuntime || {}).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const runtime = aliasToRuntime[alias];
    if (!alias || !runtime || alias === runtime) continue;
    out = out.replace(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), runtime);
  }
  return out;
}

function evaluateFormula(formula, aliasToRuntime, runtimeValues) {
  if (!formula || !String(formula).trim()) return null;
  const expr = applyInputAliases(formula, aliasToRuntime)
    .replace(/\^/g, '**')
    .replace(/\u00D7/g, '*')
    .replace(/\u00B7/g, '*')
    .replace(/\u2212/g, '-');

  const scope = {
    ...runtimeValues,
    Math,
    sqrt: Math.sqrt,
    abs: Math.abs,
    pow: Math.pow,
    log: Math.log,
    log10: Math.log10,
    exp: Math.exp,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    min: Math.min,
    max: Math.max,
    pi: Math.PI,
    e: Math.E,
  };

  try {
    // Eval is constrained by formula validation in the UI; this is a preview only.
    // eslint-disable-next-line no-new-func
    const fn = new Function('scope', `with (scope) { return (${expr}); }`);
    const out = fn(scope);
    return Number.isFinite(out) ? Number(out) : null;
  } catch {
    return null;
  }
}

export function getDecisionThresholdRefs(nodes, edges, decisionId, previewParamValues) {
  const nodeById = Object.fromEntries((nodes || []).map(n => [n.id, n]));
  const normEdges = (edges || []).map(e => ({ ...e, edgeType: normalizeEdgeType(e, nodeById) }));

  const outgoing = normEdges.filter(e => e.from === decisionId);
  const marginTargets = outgoing
    .map(e => nodeById[e.to])
    .filter(n => n?.type === 'margin');

  const refs = [];
  for (const margin of marginTargets) {
    const inEdges = normEdges.filter(e => e.to === margin.id);
    let thresholdEdge = inEdges.find(e => e.edgeType === 'threshold');
    if (!thresholdEdge) {
      thresholdEdge = inEdges.find(e => {
        const src = nodeById[e.from];
        return src && src.type !== 'decision';
      });
    }

    const thresholdSource = thresholdEdge ? nodeById[thresholdEdge.from] : null;
    const thresholdRuntime = (thresholdEdge && thresholdSource)
      ? resolveEdgeRuntimeName(thresholdEdge, thresholdSource)
      : '';
    const marginKey = sanitize(margin.label);
    const thresholdFromMargin = previewParamValues?.[`${marginKey}_threshold`];
    const thresholdValue = Number.isFinite(thresholdFromMargin)
      ? thresholdFromMargin
      : (thresholdRuntime ? previewParamValues?.[thresholdRuntime] : undefined);
    const thresholdSourceLabel = thresholdSource
      ? (thresholdEdge?.fromPort
          ? `${thresholdSource.label}.${sanitize(thresholdEdge.fromPort)}`
          : thresholdSource.label)
      : null;

    refs.push({
      marginId: margin.id,
      marginLabel: margin.label,
      thresholdSourceId: thresholdSource?.id || null,
      thresholdSourceLabel,
      thresholdRuntimeName: thresholdRuntime || null,
      thresholdValue,
    });
  }

  return refs;
}

export function buildPreviewParamValues(nodes, edges) {
  const nodeById = Object.fromEntries((nodes || []).map(n => [n.id, n]));
  const normEdges = (edges || []).map(e => ({ ...e, edgeType: normalizeEdgeType(e, nodeById) }));
  const edgesBySource = new Map();
  for (const e of normEdges) {
    if (!edgesBySource.has(e.from)) edgesBySource.set(e.from, []);
    edgesBySource.get(e.from).push(e);
  }
  const sortedNodes = topoSortNodes(nodes, normEdges);

  const nodeOutputName = {};
  const edgeRuntimeName = {};
  const values = {};

  for (const node of sortedNodes) {
    const nid = node.id;
    const varName = sanitize(node.label);
    const inEdges = normEdges.filter(e => e.to === nid);

    if (node.type === 'input') {
      nodeOutputName[nid] = varName;
      for (const e of edgesBySource.get(nid) || []) {
        edgeRuntimeName[e.id] = sanitize(e.fromPort || varName);
      }
      const val = toFiniteNumber(node.value);
      if (val !== null) values[varName] = val;
      continue;
    }

    if (node.type === 'decision') {
      const decidedName = `${varName}_D`;
      nodeOutputName[nid] = decidedName;
      for (const e of edgesBySource.get(nid) || []) {
        edgeRuntimeName[e.id] = sanitize(e.fromPort || decidedName);
      }

      const direct = toFiniteNumber(node.decidedValue);
      if (direct !== null) {
        values[decidedName] = direct;
        continue;
      }

      const aliasToRuntime = {};
      for (const e of inEdges) {
        const src = nodeById[e.from];
        const srcOut = edgeRuntimeName[e.id] || nodeOutputName[e.from];
        if (!src || !srcOut) continue;
        aliasToRuntime[sanitize(src.label)] = srcOut;
      }
      const legacy = evaluateFormula(node.equation, aliasToRuntime, values);
      if (legacy !== null) values[decidedName] = legacy;
      continue;
    }

    if (node.type === 'margin') {
      let decidedName = null;
      let thresholdName = null;

      for (const e of inEdges) {
        const srcOut = edgeRuntimeName[e.id] || nodeOutputName[e.from];
        if (!srcOut) continue;
        if (e.edgeType === 'decided') decidedName = srcOut;
        if (e.edgeType === 'threshold') thresholdName = srcOut;
      }
      if (!decidedName || !thresholdName) {
        for (const e of inEdges) {
          const src = nodeById[e.from];
          const srcOut = edgeRuntimeName[e.id] || nodeOutputName[e.from];
          if (!src || !srcOut) continue;
          if (src.type === 'decision') decidedName = decidedName || srcOut;
          else thresholdName = thresholdName || srcOut;
        }
      }

      const outputName = decidedName || varName;
      nodeOutputName[nid] = outputName;
      for (const e of edgesBySource.get(nid) || []) {
        edgeRuntimeName[e.id] = sanitize(e.fromPort || outputName);
      }

      const mk = sanitize(node.label);
      if (decidedName && thresholdName && Number.isFinite(values[decidedName]) && Number.isFinite(values[thresholdName])) {
        values[`${mk}_decided`] = values[decidedName];
        values[`${mk}_threshold`] = values[thresholdName];
      }
      continue;
    }

    if (node.type === 'calc' || node.type === 'performance' || node.type === 'calcFunction') {
      nodeOutputName[nid] = varName;
      for (const e of edgesBySource.get(nid) || []) {
        edgeRuntimeName[e.id] = sanitize(e.fromPort || varName);
      }

      const aliasToRuntime = {};
      let firstIncomingRuntime = null;
      let incomingCount = 0;
      for (const e of inEdges) {
        const src = nodeById[e.from];
        const srcOut = edgeRuntimeName[e.id] || nodeOutputName[e.from];
        if (!src || !srcOut) continue;
        const defaultAlias = sanitize(src.label);
        const aliasKey = node.type === 'calcFunction'
          ? (e.toPort || defaultAlias)
          : defaultAlias;
        aliasToRuntime[aliasKey] = srcOut;
        const aliasValue = values[srcOut];
        if (Number.isFinite(aliasValue)) {
          values[aliasKey] = aliasValue;
        }
        incomingCount += 1;
        if (!firstIncomingRuntime) firstIncomingRuntime = srcOut;
      }

      if (node.type === 'calcFunction') {
        const validated = node.validationOutputs;
        if (validated && typeof validated === 'object') {
          const entries = Object.entries(validated)
            .map(([k, v]) => [sanitize(k), toFiniteNumber(v)])
            .filter(([k, v]) => k && v !== null);
          for (const [k, v] of entries) values[k] = v;
          if (entries.length > 0) {
            // Keep a primary value on node label key for backward compatibility.
            values[varName] = entries[0][1];
            continue;
          }
        }

        const parsed = parseCalculationFunction(node.functionCode || '');
        if (parsed.valid) {
          const fnAliases = {};
          let allResolved = true;
          for (const p of parsed.params) {
            const runtime = aliasToRuntime[p] || p;
            if (!Number.isFinite(values[runtime])) {
              allResolved = false;
              break;
            }
            fnAliases[p] = runtime;
          }
          if (allResolved) {
            const fVal = evaluateFormula(parsed.returnExpr, fnAliases, values);
            if (fVal !== null) {
              values[varName] = fVal;
              continue;
            }
          }
        }
      } else {
        const formulaValue = evaluateFormula(node.equation, aliasToRuntime, values);
        if (formulaValue !== null) {
          values[varName] = formulaValue;
          continue;
        }
      }

      if (node.type === 'performance') {
        if (incomingCount === 1 && firstIncomingRuntime && Number.isFinite(values[firstIncomingRuntime])) {
          values[varName] = values[firstIncomingRuntime];
          continue;
        }
        const ownValue = toFiniteNumber(node.value);
        if (ownValue !== null) values[varName] = ownValue;
      }
    }
  }

  return values;
}
