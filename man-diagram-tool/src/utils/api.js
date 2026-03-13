/**
 * Thin fetch wrapper for the Flask backend.
 */

function sanitize(label) {
  if (!label) return 'unnamed';
  return String(label)
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unnamed';
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

function toLegacyCompatibleNodes(nodes, edges) {
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const normEdges = edges.map(e => ({ ...e, edgeType: normalizeEdgeType(e, nodeById) }));

  return nodes.map((node) => {
    if (node.type !== 'decision') return node;

    // Legacy backends expect a decision-level threshold formula.
    // In the current graph model, threshold comes through a connected margin node.
    const outMarginEdges = normEdges.filter((e) => {
      if (e.from !== node.id) return false;
      const tgt = nodeById[e.to];
      return tgt?.type === 'margin';
    });

    let thresholdSource = null;
    for (const dmEdge of outMarginEdges) {
      const marginIn = normEdges.filter(e => e.to === dmEdge.to);
      const thEdge = marginIn.find((e) => {
        const src = nodeById[e.from];
        return e.edgeType === 'threshold' || (src && src.type !== 'decision');
      });
      if (thEdge) {
        thresholdSource = nodeById[thEdge.from];
        break;
      }
    }

    // Fallback: if graph is still in legacy shape, use incoming non-decision edge to decision.
    if (!thresholdSource) {
      const inEdges = normEdges.filter(e => e.to === node.id);
      const thresholdEdge = inEdges.find((e) => {
        const src = nodeById[e.from];
        return e.edgeType === 'threshold' || (src && src.type !== 'decision');
      });
      thresholdSource = thresholdEdge ? nodeById[thresholdEdge.from] : null;
    }

    const thresholdFormula = thresholdSource ? sanitize(thresholdSource.label) : '';

    const decidedRaw = String(node.decidedValue ?? '').trim();
    const decidedFormula =
      String(node.decidedFormula ?? '').trim() ||
      String(node.equation ?? '').trim() ||
      decidedRaw;

    return {
      ...node,
      thresholdFormula: String(node.thresholdFormula ?? '').trim() || thresholdFormula,
      decidedFormula,
      equation: String(node.equation ?? '').trim() || decidedFormula,
    };
  });
}

export async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    const data = await res.json();
    return data.backendVersion || null;
  } catch {
    return null;
  }
}

export async function runAnalysis(nodes, edges, options = {}) {
  const compatNodes = toLegacyCompatibleNodes(nodes, edges);
  const perfWeights = options.perfWeights || null;
  const inputWeights = options.inputWeights || null;
  const res = await fetch('/api/analyse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes: compatNodes,
      edges,
      perfWeights,
      inputWeights,
    }),
  });

  const rawText = await res.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok || !data?.success) {
    const fallback = res.status === 500 && !rawText
      ? 'Backend unreachable via dev proxy. Ensure backend is running on 127.0.0.1:5001.'
      : `Server error: ${res.status}`;
    throw new Error(data?.error || fallback);
  }

  return data;
}

export async function validateFunction(functionCode, inputs, rootSelectionPolicy = 'min') {
  const res = await fetch('/api/validate-function', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ functionCode, inputs, rootSelectionPolicy }),
  });
  const rawText = await res.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      const snippet = rawText.slice(0, 160).replace(/\s+/g, ' ');
      const message = res.ok
        ? `Validation response was not valid JSON: ${snippet}`
        : `Server error ${res.status}: ${snippet}`;
      throw new Error(message);
    }
  }

  if (!res.ok || !data?.success) {
    const fallback = res.ok
      ? `Validation failed: ${res.status}`
      : `Server error: ${res.status}`;
    throw new Error(data?.error || fallback);
  }

  return data.outputs;
}

export async function runProbabilisticAnalysis(nodes, edges, options = {}) {
  const { perfWeights = {}, inputWeights = {}, nSamples = 1000, seed = null } = options;
  const compatNodes = toLegacyCompatibleNodes(nodes, edges);
  const res = await fetch('/api/analyse-probabilistic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes: compatNodes,
      edges,
      perfWeights,
      inputWeights,
      nSamples,
      seed: (seed !== '' && seed !== null && seed !== undefined) ? Number(seed) : null,
    }),
  });

  const rawText = await res.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok || !data?.success) {
    const fallback = res.status === 500 && !rawText
      ? 'Backend unreachable via dev proxy. Ensure backend is running on 127.0.0.1:5001.'
      : `Server error: ${res.status}`;
    throw new Error(data?.error || fallback);
  }

  return data;
}

export async function runCpmRisk(likelihood, impact, labels, options = {}) {
  const { instigator = 'column', depth = 4 } = options;
  const res = await fetch('/api/cpm-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ likelihood, impact, labels, instigator, depth }),
  });

  const rawText = await res.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok || !data?.success) {
    const fallback = res.status === 500 && !rawText
      ? 'Server error while computing CPM risk.'
      : `Server error: ${res.status}`;
    throw new Error(data?.error || fallback);
  }

  return data;
}
