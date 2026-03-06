import React from 'react';
import OrthogonalPath from './OrthogonalPath';
import { computeOrthogonalPath, selectPorts } from '../../utils/orthogonalRouter';
import { sanitize } from '../../utils/helpers';
import { parseCalculationFunction } from '../../utils/calcFunctionParser';
import { getCalcFunctionVisualSpec } from '../../utils/calcFunctionVisual';
import { resolveEdgeSignalValue } from '../../utils/edgeSignal';
import { formatProbeValue, getProbeBoxSize } from '../../utils/probeVisual';

// Draw plain (gray) edges first, decided (black) next, threshold (red) on top.
// This ensures colored signal edges are never hidden under gray routing lines.
const TYPE_Z = { plain: 0, decided: 1, threshold: 2 };

function segments(points) {
  const out = [];
  for (let i = 1; i < (points || []).length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.x === b.x || a.y === b.y) out.push({ a, b, idx: i - 1 });
  }
  return out;
}

function crossingPoint(s1, s2) {
  const s1Vert = s1.a.x === s1.b.x;
  const s2Vert = s2.a.x === s2.b.x;
  if (s1Vert === s2Vert) return null;
  const v = s1Vert ? s1 : s2;
  const h = s1Vert ? s2 : s1;
  const x = v.a.x;
  const y = h.a.y;
  const vx1 = Math.min(v.a.y, v.b.y);
  const vx2 = Math.max(v.a.y, v.b.y);
  const hy1 = Math.min(h.a.x, h.b.x);
  const hy2 = Math.max(h.a.x, h.b.x);
  const onSeg = x >= hy1 && x <= hy2 && y >= vx1 && y <= vx2;
  if (!onSeg) return null;
  return {
    x, y,
    seg1Vertical: s1Vert,
    seg2Vertical: s2Vert,
  };
}

function EdgeRenderer({
  edges, nodes, onDeleteEdge, paramValues, routePreference, arrowJumpsEnabled,
  hoveredEdgeId = null, onHoveredEdgeChange = () => {}, overlayOnly = false,
  overlayAll = false,
  selectedEdgeId = null, onSelectEdge = () => {},
  probeConnectFromId = null,
  onAttachProbeToEdge = () => {},
  onDetachProbe = () => {},
}) {
  // Stable routing mode keeps each edge local to its endpoints.
  // This avoids global "move together" reroutes when unrelated edges change.
  const STABLE_EDGE_ROUTING = true;
  const nodeMap = {};
  for (const n of nodes) {
    nodeMap[n.id] = n;
  }

  const pairBuckets = new Map();
  for (const e of edges) {
    const key = [e.from, e.to].sort().join('::');
    if (!pairBuckets.has(key)) pairBuckets.set(key, []);
    pairBuckets.get(key).push(e.id);
  }

  const sortedEdges = [...edges].sort(
    (a, b) => (TYPE_Z[a.edgeType] ?? 0) - (TYPE_Z[b.edgeType] ?? 0)
  );

  const portDirsByEdgeId = new Map();
  for (const edge of sortedEdges) {
    const srcNode = nodeMap[edge.from];
    const tgtNode = nodeMap[edge.to];
    if (!srcNode || !tgtNode) continue;
    portDirsByEdgeId.set(edge.id, selectPorts(srcNode, tgtNode, routePreference));
  }

  // Local per-node conflict resolution:
  // avoid using the same side for both incoming and outgoing flow on a node,
  // while keeping routing stable (no global re-optimization).
  const incomingByNode = new Map();
  const outgoingByNode = new Map();
  for (const edge of sortedEdges) {
    const dirs = portDirsByEdgeId.get(edge.id);
    if (!dirs) continue;
    if (!incomingByNode.has(edge.to)) incomingByNode.set(edge.to, new Set());
    if (!outgoingByNode.has(edge.from)) outgoingByNode.set(edge.from, new Set());
    incomingByNode.get(edge.to).add(dirs.tgtDir);
    outgoingByNode.get(edge.from).add(dirs.srcDir);
  }
  const axisAlt = (node, other, conflictedDir) => {
    if (conflictedDir === 'left' || conflictedDir === 'right') {
      return (other?.y ?? node.y) < node.y ? 'top' : 'bottom';
    }
    return (other?.x ?? node.x) < node.x ? 'left' : 'right';
  };
  for (const edge of sortedEdges) {
    const srcNode = nodeMap[edge.from];
    const tgtNode = nodeMap[edge.to];
    const dirs = portDirsByEdgeId.get(edge.id);
    if (!srcNode || !tgtNode || !dirs) continue;
    if (tgtNode.type !== 'calcFunction') {
      const outAtTarget = outgoingByNode.get(edge.to) || new Set();
      if (outAtTarget.has(dirs.tgtDir)) {
        dirs.tgtDir = axisAlt(tgtNode, srcNode, dirs.tgtDir);
      }
    }
    if (srcNode.type !== 'calcFunction') {
      const inAtSource = incomingByNode.get(edge.from) || new Set();
      if (inAtSource.has(dirs.srcDir)) {
        dirs.srcDir = axisAlt(srcNode, tgtNode, dirs.srcDir);
      }
    }
  }

  const outBuckets = new Map(); // nodeId:dir -> [edgeId]
  const inBuckets = new Map();  // nodeId:dir -> [edgeId]
  for (const edge of sortedEdges) {
    const dirs = portDirsByEdgeId.get(edge.id);
    if (!dirs) continue;
    const outKey = `${edge.from}:${dirs.srcDir}`;
    const inKey = `${edge.to}:${dirs.tgtDir}`;
    if (!outBuckets.has(outKey)) outBuckets.set(outKey, []);
    if (!inBuckets.has(inKey)) inBuckets.set(inKey, []);
    outBuckets.get(outKey).push(edge.id);
    inBuckets.get(inKey).push(edge.id);
  }

  const calcInDir = routePreference === 'vertical' ? 'top' : 'left';
  const calcOutDir = routePreference === 'vertical' ? 'bottom' : 'right';

  // General geometry-based ordering per shared side to reduce avoidable crossings.
  for (const [bucketKey, bucketEdgeIds] of inBuckets.entries()) {
    const [targetId, tgtDir] = bucketKey.split(':');
    const targetNode = nodeMap[targetId];
    if (!targetNode || bucketEdgeIds.length <= 1) continue;
    bucketEdgeIds.sort((ea, eb) => {
      const a = edges.find(e => e.id === ea);
      const b = edges.find(e => e.id === eb);
      const aSrc = a ? nodeMap[a.from] : null;
      const bSrc = b ? nodeMap[b.from] : null;
      const av = (tgtDir === 'left' || tgtDir === 'right')
        ? (aSrc?.y ?? 0)
        : (aSrc?.x ?? 0);
      const bv = (tgtDir === 'left' || tgtDir === 'right')
        ? (bSrc?.y ?? 0)
        : (bSrc?.x ?? 0);
      if (av !== bv) return av - bv;
      return String(ea).localeCompare(String(eb));
    });
  }
  for (const [bucketKey, bucketEdgeIds] of outBuckets.entries()) {
    const [sourceId, srcDir] = bucketKey.split(':');
    const sourceNode = nodeMap[sourceId];
    if (!sourceNode || bucketEdgeIds.length <= 1) continue;
    bucketEdgeIds.sort((ea, eb) => {
      const a = edges.find(e => e.id === ea);
      const b = edges.find(e => e.id === eb);
      const aTgt = a ? nodeMap[a.to] : null;
      const bTgt = b ? nodeMap[b.to] : null;
      const av = (srcDir === 'left' || srcDir === 'right')
        ? (aTgt?.y ?? 0)
        : (aTgt?.x ?? 0);
      const bv = (srcDir === 'left' || srcDir === 'right')
        ? (bTgt?.y ?? 0)
        : (bTgt?.x ?? 0);
      if (av !== bv) return av - bv;
      return String(ea).localeCompare(String(eb));
    });
  }

  // For calculation function nodes, incoming edges on the active input side should
  // map deterministically to function parameter order.
  for (const [bucketKey, bucketEdgeIds] of inBuckets.entries()) {
    const [targetId, tgtDir] = bucketKey.split(':');
    if (tgtDir !== calcInDir) continue;
    const targetNode = nodeMap[targetId];
    if (!targetNode || targetNode.type !== 'calcFunction') continue;

    const parsed = parseCalculationFunction(targetNode.functionCode || '');
    if (!parsed.valid || parsed.params.length === 0) continue;
    const paramIndex = new Map(parsed.params.map((p, i) => [p, i]));

    bucketEdgeIds.sort((ea, eb) => {
      const a = edges.find(e => e.id === ea);
      const b = edges.find(e => e.id === eb);
      const aSrc = a ? nodeMap[a.from] : null;
      const bSrc = b ? nodeMap[b.from] : null;
      const aName = aSrc ? sanitize(aSrc.label) : '';
      const bName = bSrc ? sanitize(bSrc.label) : '';
      const ai = paramIndex.has(aName) ? paramIndex.get(aName) : Number.MAX_SAFE_INTEGER;
      const bi = paramIndex.has(bName) ? paramIndex.get(bName) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return aName.localeCompare(bName);
    });
  }

  // For calculation function node outputs on the active output side, assign outgoing edges
  // in the order of parsed output labels.
  for (const [bucketKey, bucketEdgeIds] of outBuckets.entries()) {
    const [sourceId, srcDir] = bucketKey.split(':');
    if (srcDir !== calcOutDir) continue;
    const sourceNode = nodeMap[sourceId];
    if (!sourceNode || sourceNode.type !== 'calcFunction') continue;

    const parsed = parseCalculationFunction(sourceNode.functionCode || '');
    const outputs = parsed.valid ? (parsed.outputs || []) : [];
    const outIndex = new Map(outputs.map((o, i) => [sanitize(o), i]));

    bucketEdgeIds.sort((ea, eb) => {
      const a = edges.find(e => e.id === ea);
      const b = edges.find(e => e.id === eb);
      const aTgt = a ? nodeMap[a.to] : null;
      const bTgt = b ? nodeMap[b.to] : null;
      const aName = aTgt ? sanitize(aTgt.label) : '';
      const bName = bTgt ? sanitize(bTgt.label) : '';
      const ai = outIndex.has(aName) ? outIndex.get(aName) : Number.MAX_SAFE_INTEGER;
      const bi = outIndex.has(bName) ? outIndex.get(bName) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return aName.localeCompare(bName);
    });
  }

  const routedPaths = [];
  const routedByInBucket = new Map();
  const routedByOutBucket = new Map();
  const routeByEdgeId = new Map();
  for (const edge of sortedEdges) {
    const srcNode = nodeMap[edge.from];
    const tgtNode = nodeMap[edge.to];
    if (!srcNode || !tgtNode) continue;

    const key = [edge.from, edge.to].sort().join('::');
    const siblings = pairBuckets.get(key) || [edge.id];
    const idx = siblings.indexOf(edge.id);
    const centered = idx - (siblings.length - 1) / 2;
    const routeOffset = centered * 12;
    const dirs = portDirsByEdgeId.get(edge.id);
    const inKey = dirs ? `${edge.to}:${dirs.tgtDir}` : null;
    const outKey = dirs ? `${edge.from}:${dirs.srcDir}` : null;
    const localRouted = [];
    if (STABLE_EDGE_ROUTING) {
      if (inKey && routedByInBucket.has(inKey)) {
        localRouted.push(...routedByInBucket.get(inKey));
      }
      if (outKey && routedByOutBucket.has(outKey)) {
        localRouted.push(...routedByOutBucket.get(outKey));
      }
    }

    const points = computeOrthogonalPath(srcNode, tgtNode, {
      nodes,
      routedPaths: STABLE_EDGE_ROUTING ? localRouted : routedPaths,
      routeOffset,
      preferredAxis: routePreference,
      portDirs: dirs,
      srcSlot: (() => {
        if (srcNode.type === 'calcFunction' && edge.fromPort) {
          const spec = getCalcFunctionVisualSpec(srcNode);
          const idx = spec.outputSlots.findIndex(s => s.name === edge.fromPort);
          if (idx >= 0) return idx;
        }
        if (!dirs) return 0;
        const list = outBuckets.get(`${edge.from}:${dirs.srcDir}`) || [edge.id];
        const idx = list.indexOf(edge.id);
        return Math.max(0, idx);
      })(),
      tgtSlot: (() => {
        if (tgtNode.type === 'calcFunction' && edge.toPort) {
          const spec = getCalcFunctionVisualSpec(tgtNode);
          const idx = spec.inputSlots.findIndex(s => s.name === edge.toPort);
          if (idx >= 0) return idx;
        }
        if (!dirs) return 0;
        const list = inBuckets.get(`${edge.to}:${dirs.tgtDir}`) || [edge.id];
        const idx = list.indexOf(edge.id);
        return Math.max(0, idx);
      })(),
    });
    routeByEdgeId.set(edge.id, points);
    if (STABLE_EDGE_ROUTING) {
      if (inKey) {
        if (!routedByInBucket.has(inKey)) routedByInBucket.set(inKey, []);
        routedByInBucket.get(inKey).push(points);
      }
      if (outKey) {
        if (!routedByOutBucket.has(outKey)) routedByOutBucket.set(outKey, []);
        routedByOutBucket.get(outKey).push(points);
      }
    } else {
      routedPaths.push(points);
    }
  }

  const probesByEdgeId = new Map();
  for (const n of nodes || []) {
    if (n?.type !== 'probe' || !n.probeEdgeId) continue;
    const attachedEdge = edges.find(e => e.id === n.probeEdgeId);
    const sig = attachedEdge ? resolveEdgeSignalValue(attachedEdge, nodeMap, paramValues) : null;
    const valueText = sig && sig.value !== null ? formatProbeValue(sig.value) : 'n/a';
    const source = sig ? (sig.runtimeName || sig.sourceLabel || '') : '';
    const box = getProbeBoxSize({
      label: n.label || 'Probe',
      valueText,
      source,
    });
    if (!probesByEdgeId.has(n.probeEdgeId)) probesByEdgeId.set(n.probeEdgeId, []);
    probesByEdgeId.get(n.probeEdgeId).push({
      id: n.id,
      x: n.x,
      y: n.y,
      t: Number.isFinite(Number(n.probeEdgeT)) ? Number(n.probeEdgeT) : 0.5,
      label: n.label || 'Probe',
      boxW: box.w,
      boxH: box.h,
    });
  }

  // Build jump markers at orthogonal crossings.
  const jumpsByEdgeId = new Map();
  for (const edge of sortedEdges) jumpsByEdgeId.set(edge.id, []);
  if (arrowJumpsEnabled) {
    for (let i = 0; i < sortedEdges.length; i++) {
      const ei = sortedEdges[i];
      const pi = routeByEdgeId.get(ei.id) || [];
      const si = segments(pi);
      for (let j = i + 1; j < sortedEdges.length; j++) {
        const ej = sortedEdges[j];
        const pj = routeByEdgeId.get(ej.id) || [];
        const sj = segments(pj);
        for (const a of si) {
          for (const b of sj) {
            const c = crossingPoint(a, b);
            if (!c) continue;
            // Let later edge "jump" over earlier edge.
            const jumpEdge = ej.id;
            const jumpSeg = b;
            const vertical = jumpSeg.a.x === jumpSeg.b.x;
            jumpsByEdgeId.get(jumpEdge).push({
              x: c.x,
              y: c.y,
              vertical,
              segIdx: jumpSeg.idx,
            });
          }
        }
      }
    }
  }

  return (
    <g>
      {sortedEdges.map(edge => {
        if (overlayOnly && !overlayAll && edge.id !== hoveredEdgeId && edge.id !== selectedEdgeId) return null;
        const srcNode = nodeMap[edge.from];
        const tgtNode = nodeMap[edge.to];
        if (!srcNode || !tgtNode) return null;
        return (
          <OrthogonalPath
            key={edge.id}
            edge={edge}
            srcNode={srcNode}
            tgtNode={tgtNode}
            points={routeByEdgeId.get(edge.id)}
            jumps={jumpsByEdgeId.get(edge.id) || []}
            hovered={hoveredEdgeId === edge.id}
            selected={selectedEdgeId === edge.id}
            onHoverChange={(h) => {
              if (overlayOnly) return;
              if (h) onHoveredEdgeChange(edge.id);
              else onHoveredEdgeChange(prev => (prev === edge.id ? null : prev));
            }}
            overlayOnly={overlayOnly}
            onSelectEdge={onSelectEdge}
            onDelete={onDeleteEdge}
            paramValues={paramValues}
            attachedProbes={probesByEdgeId.get(edge.id) || []}
            probeConnectFromId={probeConnectFromId}
            onAttachProbeToEdge={(evt) => onAttachProbeToEdge(edge.id, routeByEdgeId.get(edge.id) || [], evt)}
            onDetachProbe={onDetachProbe}
          />
        );
      })}
    </g>
  );
}

export default React.memo(EdgeRenderer);
