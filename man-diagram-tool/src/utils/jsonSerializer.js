// JSON export/import with basic validation.

export function exportJSON(nodes, edges, clusters = []) {
  return JSON.stringify({ nodes, edges, clusters }, null, 2);
}

export function importJSON(raw) {
  const data = JSON.parse(raw);
  if (!data.nodes || !data.edges) {
    throw new Error('Invalid JSON: missing nodes or edges');
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Invalid JSON: nodes and edges must be arrays');
  }

  const seenIds = new Set();
  const dupIds = [];
  for (const n of data.nodes) {
    if (!n?.id) continue;
    if (seenIds.has(n.id)) dupIds.push(n.id);
    seenIds.add(n.id);
  }
  if (dupIds.length) {
    throw new Error(`Invalid JSON: duplicate node ids found (${[...new Set(dupIds)].join(', ')})`);
  }

  const migratedNodes = data.nodes.map((n) => {
    if (n?.type !== 'calc') return n;

    const next = { ...n };
    const label = String(next.label || '').trim();
    const auto = String(next.autoLabel || '').trim();

    // Migrate legacy calc naming:
    //   "Step 3" / autoLabel "3" -> "F3"
    const stepLabel = label.match(/^Step\s*(\d+)$/i);
    const numAuto = auto.match(/^(\d+)$/);
    const numFromStep = Number(next.stepNumber);
    const nLegacy = stepLabel ? Number(stepLabel[1])
      : numAuto ? Number(numAuto[1])
      : Number.isFinite(numFromStep) ? numFromStep
      : null;

    if (nLegacy !== null && Number.isFinite(nLegacy) && nLegacy > 0) {
      const fLabel = `F${nLegacy}`;
      if (!label || /^Step\s*\d+$/i.test(label)) next.label = fLabel;
      if (!auto || /^(\d+)$/.test(auto)) next.autoLabel = fLabel;
      if (!next.stepNumber) next.stepNumber = nLegacy;
    }

    return next;
  });

  const nodeById = Object.fromEntries(migratedNodes.map(n => [n.id, n]));

  // Handle old format (isTarget boolean -> edgeType string) with inference:
  // only edges into margin nodes should become decided/threshold.
  const edges = data.edges.map(e => {
    if (e.edgeType) return e;

    const target = nodeById[e.to];
    const source = nodeById[e.from];

    let edgeType = 'plain';
    if (target?.type === 'margin') {
      if (e.isTarget === true) {
        edgeType = 'threshold';
      } else {
        edgeType = source?.type === 'decision' ? 'decided' : 'threshold';
      }
    } else if (e.isTarget === true) {
      edgeType = 'threshold';
    }

    return { ...e, edgeType };
  });

  const clusters = Array.isArray(data.clusters) ? data.clusters : [];
  return { nodes: migratedNodes, edges, clusters };
}
