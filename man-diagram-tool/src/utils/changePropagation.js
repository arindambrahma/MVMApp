export function buildGraphData(nodes, edges) {
  const filteredNodes = (nodes || []).filter((n) => n.type !== 'probe');
  const nodeById = Object.fromEntries(filteredNodes.map((n) => [n.id, n]));
  const filteredEdges = (edges || []).filter((e) => nodeById[e.from] && nodeById[e.to]);
  return { nodes: filteredNodes, edges: filteredEdges, nodeById };
}

export function buildAdjacency(nodes, edges) {
  const out = new Map();
  const incoming = new Map();
  for (const n of nodes) {
    out.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    out.get(e.from).push(e.to);
    incoming.get(e.to).push(e.from);
  }
  return { out, incoming };
}

function bfsReach(startId, adjacency, nodeById, options = {}) {
  const { stopAtMargins = false } = options;
  const visited = new Set([startId]);
  const queue = [startId];
  const distances = new Map([[startId, 0]]);

  while (queue.length) {
    const current = queue.shift();
    const isStart = current === startId;
    const isMargin = nodeById[current]?.type === 'margin';
    if (stopAtMargins && !isStart && isMargin) {
      continue;
    }
    const neighbors = adjacency.get(current) || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next);
        distances.set(next, (distances.get(current) || 0) + 1);
        queue.push(next);
      }
    }
  }

  visited.delete(startId);
  distances.delete(startId);
  return { visited, distances };
}

export function computeReachability(nodes, edges, options = {}) {
  const { stopAtMargins = false } = options;
  const { nodeById } = buildGraphData(nodes, edges);
  const { out, incoming } = buildAdjacency(nodes, edges);

  const metrics = {};
  for (const n of nodes) {
    const downstream = bfsReach(n.id, out, nodeById, { stopAtMargins });
    const upstream = bfsReach(n.id, incoming, nodeById, { stopAtMargins: false });

    const downstreamIds = Array.from(downstream.visited);
    const upstreamIds = Array.from(upstream.visited);

    const countByType = (ids, type) => ids.filter((id) => nodeById[id]?.type === type).length;
    const distanceSum = Array.from(downstream.distances.values()).reduce((a, b) => a + b, 0);

    metrics[n.id] = {
      downstreamCount: downstreamIds.length,
      downstreamPerfCount: countByType(downstreamIds, 'performance'),
      downstreamMarginCount: countByType(downstreamIds, 'margin'),
      upstreamCount: upstreamIds.length,
      upstreamInputCount: countByType(upstreamIds, 'input'),
      downstreamDistanceAvg: downstreamIds.length ? distanceSum / downstreamIds.length : 0,
    };
  }
  return metrics;
}

export function computeEdgeBetweenness(nodes, edges) {
  const { out } = buildAdjacency(nodes, edges);
  const nodeIds = nodes.map((n) => n.id);
  const edgeScores = new Map();

  for (const s of nodeIds) {
    const stack = [];
    const pred = {};
    const sigma = {};
    const dist = {};
    for (const v of nodeIds) {
      pred[v] = [];
      sigma[v] = 0;
      dist[v] = -1;
    }
    sigma[s] = 1;
    dist[s] = 0;
    const queue = [s];

    while (queue.length) {
      const v = queue.shift();
      stack.push(v);
      const neighbors = out.get(v) || [];
      for (const w of neighbors) {
        if (dist[w] < 0) {
          queue.push(w);
          dist[w] = dist[v] + 1;
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }

    const delta = {};
    for (const v of nodeIds) delta[v] = 0;

    while (stack.length) {
      const w = stack.pop();
      for (const v of pred[w]) {
        const ratio = sigma[w] ? (sigma[v] / sigma[w]) : 0;
        const c = ratio * (1 + delta[w]);
        const key = `${v}::${w}`;
        edgeScores.set(key, (edgeScores.get(key) || 0) + c);
        delta[v] += c;
      }
    }
  }

  return edgeScores;
}
