import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import NodeRenderer from './nodes/NodeRenderer';
import EdgeRenderer from './edges/EdgeRenderer';
import { buildSubsystemContour } from '../utils/subsystemContour';
import { getNodeSize } from '../utils/nodeSize';
import { resolveEdgeSignalValue } from '../utils/edgeSignal';
import { formatProbeValue } from '../utils/probeVisual';
import { getCalcFunctionVisualSpec } from '../utils/calcFunctionVisual';

function nodeHalfSize(node) {
  const { w, h } = getNodeSize(node);
  return { hw: w / 2 + 26, hh: h / 2 + 26 };
}

function subsystemLabelPos(cluster, members) {
  if (!members || members.length === 0) {
    return { x: (cluster.x || 0) + 8, y: (cluster.y || 0) + 14 };
  }
  let minX = Infinity;
  let minY = Infinity;
  for (const n of members) {
    const s = nodeHalfSize(n);
    minX = Math.min(minX, n.x - s.hw);
    minY = Math.min(minY, n.y - s.hh);
  }
  return { x: minX + 8, y: minY + 14 };
}

function closestFractionOnPolyline(points, p) {
  if (!points || points.length < 2 || !p) return 0.5;
  let bestD2 = Infinity;
  let bestFrac = 0.5;
  let total = 0;
  const segLens = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    segLens.push(len);
    total += len;
  }
  if (total <= 1e-9) return 0.5;

  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const segLen2 = vx * vx + vy * vy;
    const t = segLen2 > 1e-9
      ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / segLen2))
      : 0;
    const qx = a.x + vx * t;
    const qy = a.y + vy * t;
    const dx = p.x - qx;
    const dy = p.y - qy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestFrac = (acc + segLens[i - 1] * t) / total;
    }
    acc += segLens[i - 1];
  }
  return bestFrac;
}

function calcFunctionInputAnchors(node, routePreference) {
  const spec = getCalcFunctionVisualSpec(node, { orientation: routePreference });
  const isVertical = routePreference === 'vertical';
  if (!isVertical) {
    return spec.inputSlots.map((slot) => ({
      name: slot.name,
      x: node.x - spec.width / 2 - 12,
      y: node.y + slot.y,
    }));
  }
  const n = Math.max(1, spec.inputSlots.length);
  const min = -spec.width / 2 + 22;
  const max = spec.width / 2 - 22;
  const step = n > 1 ? (max - min) / (n - 1) : 0;
  return spec.inputSlots.map((slot, i) => ({
    name: slot.name,
    x: node.x + (n > 1 ? (min + i * step) : 0),
    y: node.y - spec.height / 2 - 12,
  }));
}

function pickCalcFunctionInputPort(node, routePreference, worldPos, edges) {
  const anchors = calcFunctionInputAnchors(node, routePreference);
  if (anchors.length === 0) return null;

  const connected = new Set(
    (edges || [])
      .filter(e => e.to === node.id && e.toPort)
      .map(e => e.toPort)
  );

  const finitePos = worldPos && Number.isFinite(worldPos.x) && Number.isFinite(worldPos.y);
  if (finitePos) {
    let best = anchors[0];
    let bestD2 = Infinity;
    for (const a of anchors) {
      const dx = worldPos.x - a.x;
      const dy = worldPos.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = a;
      }
    }
    return best?.name || null;
  }

  const firstUnconnected = anchors.find(a => !connected.has(a.name));
  return (firstUnconnected || anchors[0])?.name || null;
}

function Canvas({
  nodes, edges, clusters, selectedId, zoom, panOffset, connecting,
  selectedClusterId,
  onMoveNode, onSelect, onSetZoom, onSetPan,
  onSelectCluster,
  onStartConnect, onFinishConnect, onCancelConnect,
  onDeleteEdge, onMoveCluster, paramValues, invalidNodeIds, routePreference, arrowJumpsEnabled,
  selectedEdgeId, onSelectEdge,
  onUpdateNode,
  onUpdateEdge,
  fitViewRequest = 0,
  onRegisterCapture,
}) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [draggingCluster, setDraggingCluster] = useState(null);
  const [panning, setPanning] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const visualNodes = useMemo(
    () => (nodes || []).map((n) => (
      n.type === 'calcFunction' ? { ...n, _cfOrientation: routePreference } : n
    )),
    [nodes, routePreference]
  );
  const nodeById = useMemo(
    () => Object.fromEntries((visualNodes || []).map(n => [n.id, n])),
    [visualNodes]
  );
  const probeDisplayByNodeId = useMemo(() => {
    const out = {};
    for (const n of (visualNodes || [])) {
      if (n.type !== 'probe') continue;
      const attached = n.probeEdgeId
        ? (edges || []).find(e => e.id === n.probeEdgeId)
        : null;
      const legacyIncoming = !attached ? (edges || []).find(e => e.to === n.id) : null;
      const edge = attached || legacyIncoming;
      if (!edge) {
        out[n.id] = { valueText: 'Attach to arrow', source: '' };
      } else {
        const sig = resolveEdgeSignalValue(edge, nodeById, paramValues);
        out[n.id] = {
          value: sig.value,
          valueText: sig.value === null ? 'n/a' : formatProbeValue(sig.value),
          source: sig.runtimeName || sig.sourceLabel,
        };
      }
    }
    return out;
  }, [visualNodes, edges, paramValues, nodeById]);

  const fitToView = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width < 20 || rect.height < 20) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of visualNodes || []) {
      const { w, h } = getNodeSize(n);
      minX = Math.min(minX, n.x - w / 2);
      minY = Math.min(minY, n.y - h / 2);
      maxX = Math.max(maxX, n.x + w / 2);
      maxY = Math.max(maxY, n.y + h / 2);
    }
    for (const c of clusters || []) {
      const cw = Number(c.w) || 0;
      const ch = Number(c.h) || 0;
      const cx = Number(c.x) || 0;
      const cy = Number(c.y) || 0;
      minX = Math.min(minX, cx);
      minY = Math.min(minY, cy);
      maxX = Math.max(maxX, cx + cw);
      maxY = Math.max(maxY, cy + ch);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      onSetZoom(1);
      onSetPan({ x: 0, y: 0 });
      return;
    }

    const pad = 36;
    const boundsW = Math.max(1, maxX - minX);
    const boundsH = Math.max(1, maxY - minY);
    const availW = Math.max(40, rect.width - pad * 2);
    const availH = Math.max(40, rect.height - pad * 2);
    const fitZoom = Math.min(availW / boundsW, availH / boundsH);
    const nextZoom = Math.max(0.2, Math.min(3, fitZoom));
    const cx = minX + boundsW / 2;
    const cy = minY + boundsH / 2;
    onSetZoom(nextZoom);
    onSetPan({
      x: rect.width / 2 - cx * nextZoom,
      y: rect.height / 2 - cy * nextZoom,
    });
  }, [visualNodes, clusters, onSetZoom, onSetPan]);

  useEffect(() => {
    if (!fitViewRequest) return;
    const id = window.requestAnimationFrame(() => {
      fitToView();
    });
    return () => window.cancelAnimationFrame(id);
  }, [fitViewRequest, fitToView]);

  const captureDiagramImage = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return '';
    const rect = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || 0));
    const height = Math.max(1, Math.round(rect.height || 0));
    if (width < 2 || height < 2) return '';
    const clone = svg.cloneNode(true);
    clone.querySelectorAll('[data-export-exclude="true"]').forEach((node) => node.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const xml = new XMLSerializer().serializeToString(clone);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }, []);

  useEffect(() => {
    if (!onRegisterCapture) return undefined;
    onRegisterCapture(captureDiagramImage);
    return () => onRegisterCapture(null);
  }, [onRegisterCapture, captureDiagramImage]);

  // Store latest zoom in a ref for the wheel handler
  const zoomRef = useRef(zoom);
  const onSetZoomRef = useRef(onSetZoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { onSetZoomRef.current = onSetZoom; }, [onSetZoom]);

  // Attach wheel handler as non-passive so preventDefault works
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e) => {
      e.preventDefault();
      onSetZoomRef.current(zoomRef.current - e.deltaY * 0.001);
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []);

  const screenToWorld = useCallback((clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - panOffset.x) / zoom,
      y: (clientY - rect.top - panOffset.y) / zoom,
    };
  }, [zoom, panOffset]);

  const handleMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.classList.contains('canvas-bg')) {
      setPanning({ sx: e.clientX - panOffset.x, sy: e.clientY - panOffset.y });
      onSelect(null);
      onSelectCluster(null);
      onSelectEdge(null);
      if (connecting) onCancelConnect();
    }
  }, [panOffset, connecting, onSelect, onSelectCluster, onSelectEdge, onCancelConnect]);

  const handleMouseMove = useCallback((e) => {
    if (panning) {
      onSetPan({
        x: e.clientX - panning.sx,
        y: e.clientY - panning.sy,
      });
      return;
    }
    if (dragging) {
      const pos = screenToWorld(e.clientX, e.clientY);
      const nx = pos.x - dragging.ox;
      const ny = pos.y - dragging.oy;
      onMoveNode(dragging.id, nx, ny);
      return;
    }
    if (draggingCluster) {
      const pos = screenToWorld(e.clientX, e.clientY);
      onMoveCluster(draggingCluster.id, pos.x - draggingCluster.ox, pos.y - draggingCluster.oy);
    }
  }, [panning, dragging, draggingCluster, onSetPan, onMoveNode, onMoveCluster, screenToWorld]);

  const handleMouseUp = useCallback(() => {
    setPanning(null);
    setDragging(null);
    setDraggingCluster(null);
  }, []);

  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    if (connecting) return;
    const node = visualNodes.find(n => n.id === nodeId);
    if (!node) return;
    const pos = screenToWorld(e.clientX, e.clientY);
    setDragging({ id: nodeId, ox: pos.x - node.x, oy: pos.y - node.y });
    onSelect(nodeId);
    onSelectCluster(null);
    onSelectEdge(null);
  }, [visualNodes, connecting, screenToWorld, onSelect, onSelectCluster, onSelectEdge]);

  const handleNodeClick = useCallback((e, nodeId, toPort = null) => {
    e.stopPropagation();
    if (connecting) {
      const src = nodeById[connecting.fromId];
      if (src?.type === 'probe') return;
      const targetNode = nodeById[nodeId];
      let resolvedPort = toPort;
      if (!resolvedPort && targetNode?.type === 'calcFunction') {
        const pos = screenToWorld(e.clientX, e.clientY);
        resolvedPort = pickCalcFunctionInputPort(targetNode, routePreference, pos, edges);
      }
      onFinishConnect(nodeId, resolvedPort);
    } else {
      onSelect(nodeId);
      onSelectCluster(null);
      onSelectEdge(null);
    }
  }, [connecting, onFinishConnect, onSelect, onSelectCluster, onSelectEdge, nodeById, screenToWorld, routePreference, edges]);

  const handleAttachProbeToEdge = useCallback((edgeId, routePoints, e) => {
    if (!connecting) return;
    const src = nodeById[connecting.fromId];
    if (!src || src.type !== 'probe') return;
    const world = screenToWorld(e.clientX, e.clientY);
    const frac = closestFractionOnPolyline(routePoints, world);
    onUpdateNode({
      ...src,
      probeEdgeId: edgeId,
      probeEdgeT: Number.isFinite(frac) ? frac : 0.5,
    });
    onCancelConnect();
  }, [connecting, nodeById, screenToWorld, onUpdateNode, onCancelConnect]);
  const handleDetachProbe = useCallback((probeId) => {
    const probe = nodeById[probeId];
    if (!probe || probe.type !== 'probe') return;
    onUpdateNode({
      ...probe,
      probeEdgeId: null,
      probeEdgeT: 0.5,
    });
  }, [nodeById, onUpdateNode]);

  const handleClusterMouseDown = useCallback((e, cluster) => {
    e.stopPropagation();
    if (connecting) return;
    onSelect(null);
    onSelectCluster(cluster.id);
    onSelectEdge(null);
    // Avoid accidental group moves: cluster drag requires Shift+drag.
    if (!e.shiftKey) return;
    const pos = screenToWorld(e.clientX, e.clientY);
    setDraggingCluster({ id: cluster.id, ox: pos.x - cluster.x, oy: pos.y - cluster.y });
  }, [connecting, screenToWorld, onSelect, onSelectCluster, onSelectEdge]);

  const gridSize = 30 * zoom;

  return (
    <svg
      ref={svgRef}
      style={{
        flex: 1,
        background: '#F8FAFC',
        cursor: panning ? 'grabbing' : connecting ? 'crosshair' : 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Grid pattern */}
      <defs>
        <pattern
          id="grid-dots"
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
          x={panOffset.x % gridSize}
          y={panOffset.y % gridSize}
        >
          <circle cx={1} cy={1} r={0.8} fill="#CBD5E1" />
        </pattern>
      </defs>
      <rect
        className="canvas-bg"
        width="100%"
        height="100%"
        fill="url(#grid-dots)"
      />

      {/* Pan + zoom container */}
      <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
        {/* Cosmetic subsystem boxes */}
        {(clusters || []).map((c) => (
          <g
            key={c.id}
            style={{ cursor: connecting ? 'default' : 'grab' }}
            onMouseDown={(e) => handleClusterMouseDown(e, c)}
          >
            {(() => {
              const members = (visualNodes || []).filter(n => n.clusterId === c.id);
              const contour = buildSubsystemContour(members, { allNodes: visualNodes });
              const lbl = subsystemLabelPos(c, members);
              if (contour?.paths?.length) {
                return (
                  <g>
                    {contour.paths.map((d, i) => (
                      <path
                        key={`${c.id}_shape_${i}`}
                        d={d}
                        fill={c.fill || '#E5E7EB'}
                        fillOpacity={0.42}
                        stroke={selectedClusterId === c.id ? '#334155' : (c.stroke || '#9CA3AF')}
                        strokeWidth={selectedClusterId === c.id ? 2 : 1.2}
                        strokeDasharray="6 4"
                      />
                    ))}
                  <text
                    x={lbl.x}
                    y={lbl.y}
                    fontSize={12}
                    fill="#475569"
                    fontStyle="italic"
                    fontFamily="system-ui, sans-serif"
                    pointerEvents="none"
                  >
                    {(c.label || 'Subsystem') + ' (Shift+drag to move)'}
                  </text>
                </g>
              );
              }
              return (
                <g>
                  <rect
                    x={c.x}
                    y={c.y}
                    width={c.w || 300}
                    height={c.h || 180}
                    rx={8}
                    fill={c.fill || '#E5E7EB'}
                    fillOpacity={0.42}
                    stroke={selectedClusterId === c.id ? '#334155' : (c.stroke || '#9CA3AF')}
                    strokeWidth={selectedClusterId === c.id ? 2 : 1.2}
                    strokeDasharray="6 4"
                  />
                  <text
                    x={(c.x || 0) + 8}
                    y={(c.y || 0) + 14}
                    fontSize={12}
                    fill="#475569"
                    fontStyle="italic"
                    fontFamily="system-ui, sans-serif"
                    pointerEvents="none"
                  >
                    {(c.label || 'Subsystem') + ' (Shift+drag to move)'}
                  </text>
                </g>
              );
            })()}
          </g>
        ))}

        {/* Edges layer */}
        <EdgeRenderer
          edges={edges}
          nodes={visualNodes}
          onDeleteEdge={onDeleteEdge}
          paramValues={paramValues}
          routePreference={routePreference}
          arrowJumpsEnabled={arrowJumpsEnabled}
          hoveredEdgeId={hoveredEdgeId}
          onHoveredEdgeChange={setHoveredEdgeId}
          selectedEdgeId={selectedEdgeId}
          onSelectEdge={onSelectEdge}
          onNudgeEdge={(edgeId, dx, dy) => {
            if (!onUpdateEdge) return;
            const edge = edges.find((e) => e.id === edgeId);
            if (!edge) return;
            const invZoom = 1 / Math.max(zoom, 0.001);
            const main = dx * invZoom * 2.8;
            const current = Number(edge.manualOffset) || 0;
            const next = Math.max(-420, Math.min(420, current + main));
            onUpdateEdge(edgeId, { manualOffset: next, routeOffset: 0 });
          }}
          probeConnectFromId={(() => {
            if (!connecting) return null;
            const src = nodeById[connecting.fromId];
            return src?.type === 'probe' ? src.id : null;
          })()}
          onAttachProbeToEdge={handleAttachProbeToEdge}
          onDetachProbe={handleDetachProbe}
        />

        {/* Nodes layer */}
        {visualNodes.map(node => (
          (() => {
            const connectedInPorts = edges
              .filter(e => e.to === node.id && e.toPort)
              .map(e => e.toPort);
            const connectedOutPorts = edges
              .filter(e => e.from === node.id && e.fromPort)
              .map(e => e.fromPort);
            return (
          <NodeRenderer
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            hasError={Boolean(invalidNodeIds?.has(node.id))}
            connectedInPorts={connectedInPorts}
            connectedOutPorts={connectedOutPorts}
            probeDisplay={probeDisplayByNodeId[node.id]}
            routePreference={routePreference}
            connecting={connecting}
            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
            onClick={(e, _ignoredNodeId, toPort) => handleNodeClick(e, node.id, toPort)}
            onStartConnect={onStartConnect}
          />
            );
          })()
        ))}

        {/* Hovered edge overlay on absolute top */}
        <EdgeRenderer
          edges={edges}
          nodes={visualNodes}
          onDeleteEdge={onDeleteEdge}
          paramValues={paramValues}
          routePreference={routePreference}
          arrowJumpsEnabled={arrowJumpsEnabled}
          hoveredEdgeId={hoveredEdgeId}
          selectedEdgeId={selectedEdgeId}
          onNudgeEdge={(edgeId, dx, dy) => {
            if (!onUpdateEdge) return;
            const edge = edges.find((e) => e.id === edgeId);
            if (!edge) return;
            const invZoom = 1 / Math.max(zoom, 0.001);
            const main = dx * invZoom * 2.8;
            const current = Number(edge.manualOffset) || 0;
            const next = Math.max(-420, Math.min(420, current + main));
            onUpdateEdge(edgeId, { manualOffset: next, routeOffset: 0 });
          }}
          overlayOnly
          probeConnectFromId={null}
          onAttachProbeToEdge={() => {}}
          onDetachProbe={() => {}}
        />
      </g>

      {/* HUD */}
      <text x={12} y={20} fontSize={11} fill="#64748B" fontFamily="system-ui, sans-serif" data-export-exclude="true">
        {`Zoom: ${(zoom * 100).toFixed(0)}%  |  ${nodes.length} nodes  |  ${edges.length} edges`}
        {connecting
          ? (() => {
            const src = nodeById[connecting.fromId];
            return src?.type === 'probe'
              ? '  |  Probe mode: click an arrow to attach (Esc to cancel)'
              : '  |  Click a target node to connect (Esc to cancel)';
          })()
          : ''}
      </text>
      {selectedEdgeId && (
        <g
          transform="translate(12, 30)"
          style={{ cursor: 'pointer' }}
          onMouseDown={(e) => e.stopPropagation()}
          data-export-exclude="true"
        >
          <rect
            x={0}
            y={0}
            width={232}
            height={44}
            rx={5}
            fill="#F8FAFC"
            stroke="#CBD5E1"
            strokeWidth={1}
          />
          <rect
            x={8}
            y={8}
            width={78}
            height={28}
            rx={4}
            fill="#FEF2F2"
            stroke="#FCA5A5"
            strokeWidth={1}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteEdge(selectedEdgeId);
              onSelectEdge(null);
            }}
          />
          <text
            x={47}
            y={26}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill="#B91C1C"
            fontFamily="system-ui, sans-serif"
          >
            Delete
          </text>
          <rect
            x={96}
            y={8}
            width={28}
            height={28}
            rx={4}
            fill="#EFF6FF"
            stroke="#93C5FD"
            strokeWidth={1}
            onClick={(e) => {
              e.stopPropagation();
              const edge = (edges || []).find((ed) => ed.id === selectedEdgeId);
              if (!edge || !onUpdateEdge) return;
              const current = Number(edge.manualOffset) || 0;
              onUpdateEdge(selectedEdgeId, { manualOffset: current - 18, routeOffset: 0 });
            }}
          />
          <text
            x={110}
            y={26}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill="#1D4ED8"
            fontFamily="system-ui, sans-serif"
          >
            -
          </text>
          <rect
            x={130}
            y={8}
            width={28}
            height={28}
            rx={4}
            fill="#EFF6FF"
            stroke="#93C5FD"
            strokeWidth={1}
            onClick={(e) => {
              e.stopPropagation();
              const edge = (edges || []).find((ed) => ed.id === selectedEdgeId);
              if (!edge || !onUpdateEdge) return;
              const current = Number(edge.manualOffset) || 0;
              onUpdateEdge(selectedEdgeId, { manualOffset: current + 18, routeOffset: 0 });
            }}
          />
          <text
            x={144}
            y={26}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill="#1D4ED8"
            fontFamily="system-ui, sans-serif"
          >
            +
          </text>
          <text
            x={166}
            y={26}
            textAnchor="start"
            fontSize={10}
            fontWeight={700}
            fill="#334155"
            fontFamily="system-ui, sans-serif"
          >
            Nudge edge
          </text>
        </g>
      )}
    </svg>
  );
}

export default Canvas;
