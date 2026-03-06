import { getNodeSize } from './nodeSize';

function topologicalLayers(nodes, edges) {
  const nodeIds = new Set((nodes || []).map(n => n.id));
  const inDegree = new Map();
  const incoming = new Map();
  const outgoing = new Map();

  for (const n of nodes || []) {
    inDegree.set(n.id, 0);
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }

  for (const e of edges || []) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    incoming.get(e.to).push(e.from);
    outgoing.get(e.from).push(e.to);
  }

  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const child of outgoing.get(id) || []) {
      const d = (inDegree.get(child) || 0) - 1;
      inDegree.set(child, d);
      if (d === 0) queue.push(child);
    }
  }

  // Cycle fallback: append missing ids.
  if (order.length !== (nodes || []).length) {
    const seen = new Set(order);
    for (const n of nodes || []) {
      if (!seen.has(n.id)) order.push(n.id);
    }
  }

  const layerById = new Map();
  for (const id of order) {
    let layer = 0;
    for (const src of incoming.get(id) || []) {
      layer = Math.max(layer, (layerById.get(src) || 0) + 1);
    }
    layerById.set(id, layer);
  }

  const layers = new Map();
  for (const id of order) {
    const l = layerById.get(id) || 0;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l).push(id);
  }

  return { layers, incoming };
}

function nodeSpanAlongAxis(node, axis) {
  const { w, h } = getNodeSize(node || {});
  return axis === 'x' ? w : h;
}

function positionsForLayer(ids, nodeById, axis = 'y', gap = 18) {
  if (!ids.length) return [];
  const spans = ids.map(id => nodeSpanAlongAxis(nodeById.get(id) || {}, axis));
  const centers = [];
  let cursor = 0;
  for (let i = 0; i < ids.length; i++) {
    const prevSpan = i > 0 ? spans[i - 1] : 0;
    const curSpan = spans[i];
    if (i === 0) {
      centers.push(0);
      cursor = 0;
    } else {
      cursor += (prevSpan / 2) + gap + (curSpan / 2);
      centers.push(cursor);
    }
  }
  const mean = centers.reduce((s, v) => s + v, 0) / centers.length;
  return centers.map(c => c - mean);
}

export function autoArrangeNodes(nodes, edges, orientation = 'horizontal') {
  if (!nodes || nodes.length === 0) return nodes || [];

  const { layers, incoming } = topologicalLayers(nodes, edges);
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const layerKeys = [...layers.keys()].sort((a, b) => a - b);
  const clusterBand = new Map(); // clusterId -> preferred slot index across layers

  // Crossing reduction + subsystem clustering:
  // keep members of the same cluster in nearby slots across layers.
  for (const l of layerKeys) {
    const ids = layers.get(l);
    const prev = layers.get(l - 1) || [];
    const prevIndex = new Map(prev.map((id, i) => [id, i]));
    const scoreFor = (id) => {
      const preds = incoming.get(id) || [];
      if (!preds.length) return Number.POSITIVE_INFINITY;
      return preds.reduce((s, p) => s + (prevIndex.has(p) ? prevIndex.get(p) : 0), 0) / preds.length;
    };

    ids.sort((a, b) => {
      const na = nodeById.get(a) || {};
      const nb = nodeById.get(b) || {};
      const ca = na.clusterId || '';
      const cb = nb.clusterId || '';
      const ma = scoreFor(a);
      const mb = scoreFor(b);

      const ta = ca && clusterBand.has(ca) ? clusterBand.get(ca) : null;
      const tb = cb && clusterBand.has(cb) ? clusterBand.get(cb) : null;

      const sa = ta !== null ? ta : ma;
      const sb = tb !== null ? tb : mb;
      if (sa !== sb) return sa - sb;

      // If scores tie, keep clustered nodes together.
      if (ca !== cb) {
        if (ca && !cb) return -1;
        if (!ca && cb) return 1;
        return String(ca).localeCompare(String(cb));
      }

      if (ma !== mb) return ma - mb;
      return String(nodeById.get(a)?.label || '').localeCompare(String(nodeById.get(b)?.label || ''));
    });

    // Update preferred band positions for each cluster from this layer.
    ids.forEach((id, i) => {
      const cid = nodeById.get(id)?.clusterId;
      if (!cid) return;
      if (!clusterBand.has(cid)) {
        clusterBand.set(cid, i);
      } else {
        clusterBand.set(cid, (clusterBand.get(cid) * 2 + i) / 3);
      }
    });
  }

  const layerGap = 155;
  const itemGap = 18;
  const originX = 85;
  const originY = 70;

  const posById = new Map();
  for (const l of layerKeys) {
    const ids = layers.get(l) || [];
    const offsets = positionsForLayer(
      ids,
      nodeById,
      orientation === 'vertical' ? 'x' : 'y',
      itemGap
    );
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (orientation === 'vertical') {
        const x = originX + 240 + (offsets[i] || 0);
        const y = originY + l * layerGap;
        posById.set(id, { x, y });
      } else {
        const x = originX + l * layerGap;
        const y = originY + 180 + (offsets[i] || 0);
        posById.set(id, { x, y });
      }
    }
  }

  return nodes.map((n) => {
    const p = posById.get(n.id);
    return p ? { ...n, x: p.x, y: p.y } : n;
  });
}
