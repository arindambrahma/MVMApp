/**
 * CascadeSankey — SVG Sankey-style flow diagram for the MDC cascade.
 *
 * Four levels:
 *   L0  Needs  +  M1 uncertainty sources
 *   L1  Requirements  +  M2 uncertainty sources
 *   L2  Architectural Elements  +  M3 uncertainty sources
 *   L3  Parameters
 *
 * Flows are cubic-bezier paths.  Hovering a node traces its full
 * upstream/downstream chain; hovering a flow highlights just that link.
 * Uncertainty nodes / flows are rendered in amber.
 */

import React, { useMemo, useState } from 'react';

// ── Layout constants ─────────────────────────────────────────────────────────
const NODE_W     = 150;   // node rectangle width (px)
const LANE_W     = 190;   // horizontal gap between columns (bezier lane)
const COL_STEP   = NODE_W + LANE_W;
const FLOW_H     = 17;    // px per flow slot inside a node
const NODE_VPAD  = 10;    // top/bottom padding within node port area
const NODE_MIN_H = 42;    // minimum node height
const V_GAP      = 10;    // vertical gap between nodes in the same column
const SVG_PX     = 40;    // left/right SVG padding
const SVG_PY     = 52;    // top SVG padding (room for level labels)
const BOTTOM_PAD = 28;    // bottom SVG padding

// ── Colour palette ────────────────────────────────────────────────────────────
const LEVEL_C = [
  // L0  Needs      – indigo
  { bg: '#EEF2FF', stroke: '#6366F1', text: '#3730A3', flowRgb: '99,102,241' },
  // L1  Req        – teal
  { bg: '#F0FDFA', stroke: '#14B8A6', text: '#0F766E', flowRgb: '20,184,166' },
  // L2  Arch Elem  – amber
  { bg: '#FFFBEB', stroke: '#F59E0B', text: '#92400E', flowRgb: '245,158,11' },
  // L3  Parameters – emerald
  { bg: '#F0FDF4', stroke: '#22C55E', text: '#166534', flowRgb: '34,197,94' },
];
const UNCERT_C = { bg: '#FEF3C7', stroke: '#D97706', text: '#92400E', flowRgb: '217,119,6' };

const LEVEL_NAMES = ['Needs', 'Requirements', 'Architecture', 'Parameters'];

// ── Sankey layout engine ──────────────────────────────────────────────────────
/**
 * Given the four level arrays and edge list, returns:
 *   nodePos   – { [id]: { x, y, w, h, levelIdx, node } }
 *   edgePorts – { [fromId__toId]: { x1, y1, x2, y2 } }
 *   svgW, svgH
 *   outEdges, inEdges  (adjacency maps for BFS)
 */
function computeLayout(levels, edges) {
  // ── 1. Count flows per node ──────────────────────────────────────────────
  const outEdges = {};   // id → edge[]
  const inEdges  = {};   // id → edge[]
  for (const e of edges) {
    (outEdges[e.fromId] = outEdges[e.fromId] || []).push(e);
    (inEdges[e.toId]    = inEdges[e.toId]    || []).push(e);
  }

  // ── 2. Node heights based on connection count ────────────────────────────
  const nodeH = id => {
    const slots = Math.max(
      (outEdges[id] || []).length,
      (inEdges[id]  || []).length,
      1,
    );
    return Math.max(NODE_MIN_H, slots * FLOW_H + 2 * NODE_VPAD);
  };

  // ── 3. Position nodes (normal rows first, uncertainty rows below) ────────
  const nodePos = {};
  let maxColBottom = 0;

  for (let li = 0; li < levels.length; li++) {
    const x = SVG_PX + li * COL_STEP;
    let y = SVG_PY;

    const normal = levels[li].filter(n => !n.isUncertainty);
    const uncert = levels[li].filter(n =>  n.isUncertainty);

    for (const node of [...normal, ...uncert]) {
      const h = nodeH(node.id);
      nodePos[node.id] = { x, y, w: NODE_W, h, levelIdx: li, node };
      y += h + V_GAP;
    }
    maxColBottom = Math.max(maxColBottom, y);
  }

  // ── 4. Assign port Y-positions on each node's left/right edge ───────────
  // Outgoing (right edge): sorted by target vertical centre, top→bottom
  // Incoming (left edge):  sorted by source vertical centre, top→bottom
  const edgePorts = {};  // `fromId__toId` → { x1, y1, x2, y2 }

  const midY = pos => pos.y + pos.h / 2;

  const portY = (pos, idx, total) => {
    if (total === 1) return midY(pos);
    const usable = pos.h - 2 * NODE_VPAD;
    return pos.y + NODE_VPAD + (usable * idx) / (total - 1);
  };

  for (const [fromId, outs] of Object.entries(outEdges)) {
    const pos = nodePos[fromId];
    if (!pos) continue;
    const sorted = [...outs].sort(
      (a, b) => midY(nodePos[a.toId] || { y: 0, h: 0 })
              - midY(nodePos[b.toId] || { y: 0, h: 0 }),
    );
    sorted.forEach((e, i) => {
      const k = `${e.fromId}__${e.toId}`;
      (edgePorts[k] = edgePorts[k] || {}).x1 = pos.x + pos.w;
      edgePorts[k].y1 = portY(pos, i, sorted.length);
    });
  }

  for (const [toId, ins] of Object.entries(inEdges)) {
    const pos = nodePos[toId];
    if (!pos) continue;
    const sorted = [...ins].sort(
      (a, b) => midY(nodePos[a.fromId] || { y: 0, h: 0 })
              - midY(nodePos[b.fromId] || { y: 0, h: 0 }),
    );
    sorted.forEach((e, i) => {
      const k = `${e.fromId}__${e.toId}`;
      (edgePorts[k] = edgePorts[k] || {}).x2 = pos.x;
      edgePorts[k].y2 = portY(pos, i, sorted.length);
    });
  }

  const svgW = SVG_PX * 2 + NODE_W + COL_STEP * (levels.length - 1);
  const svgH = maxColBottom + BOTTOM_PAD;

  return { nodePos, edgePorts, svgW, svgH, outEdges, inEdges };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function FlowPath({ edge, edgePorts, highlight, dim, onEnter, onLeave }) {
  const k  = `${edge.fromId}__${edge.toId}`;
  const pp = edgePorts[k];
  if (!pp?.x1 || !pp?.x2) return null;

  const { x1, y1, x2, y2 } = pp;
  const cpX = x1 + (x2 - x1) * 0.5;
  const d   = `M ${x1} ${y1} C ${cpX} ${y1}, ${cpX} ${y2}, ${x2} ${y2}`;

  const isUncert = edge.type === 'uncert';
  const C        = isUncert ? UNCERT_C : (LEVEL_C[edge.fromLevelIdx] || LEVEL_C[0]);
  const opacity  = dim ? 0.06 : highlight ? 0.80 : 0.28;
  const sw       = highlight ? 3 : 2;

  return (
    <path
      d={d}
      fill="none"
      stroke={`rgba(${C.flowRgb},1)`}
      strokeWidth={sw}
      strokeOpacity={opacity}
      style={{ cursor: 'default', transition: 'stroke-opacity 0.12s, stroke-width 0.12s' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    />
  );
}

function SankeyNode({ pos, isUncert, highlight, dim, onEnter, onLeave }) {
  const { x, y, w, h, levelIdx, node } = pos;
  const C = isUncert ? UNCERT_C : (LEVEL_C[levelIdx] || LEVEL_C[0]);

  return (
    <g
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ cursor: 'default' }}
      opacity={dim ? 0.22 : 1}
    >
      <rect
        x={x} y={y} width={w} height={h} rx={5}
        fill={C.bg}
        stroke={C.stroke}
        strokeWidth={highlight ? 2.5 : 1.5}
        style={{ transition: 'stroke-width 0.1s, opacity 0.12s' }}
      />
      {/* Node label via foreignObject for text wrapping */}
      <foreignObject x={x + 6} y={y + 3} width={w - 12} height={h - 6}>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            fontSize: 10,
            fontWeight: isUncert ? 500 : 600,
            fontStyle: isUncert ? 'italic' : 'normal',
            color: C.text,
            lineHeight: 1.35,
            overflow: 'hidden',
            wordBreak: 'break-word',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {node.label || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CascadeSankey({ data }) {
  const [hoveredNodeId,  setHoveredNodeId]  = useState(null);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState(null);

  // ── Build levels + edges from cascade data ─────────────────────────────
  const { levels, edges } = useMemo(() => {
    const m1u = data.m1Uncertainties || [];
    const m2u = data.m2Uncertainties || [];
    const m3u = data.m3Uncertainties || [];
    const m2uIds = new Set(m2u.map(u => u.id));
    const m3uIds = new Set(m3u.map(u => u.id));

    const levels = [
      [...(data.m1Rows    || []), ...m1u],   // L0: Needs + M1 uncert sources
      [...(data.m1Columns || []), ...m2u],   // L1: Requirements + M2 uncert sources
      [...(data.m2Columns || []), ...m3u],   // L2: Arch Elements + M3 uncert sources
      [...(data.m3Columns || [])],           // L3: Parameters
    ];

    const edges = [];

    // M1 relationships  (Needs / M1-uncert  →  Requirements)
    Object.entries(data.m1Relationships || {}).forEach(([k, v]) => {
      if (!v) return;
      const [fromId, toId] = k.split('__');
      const isU = m1u.some(u => u.id === fromId);
      edges.push({ fromId, toId, fromLevelIdx: 0, toLevelIdx: 1, type: isU ? 'uncert' : 'm1' });
    });

    // M2 relationships  (Requirements / M2-uncert  →  Arch Elements)
    Object.entries(data.m2Relationships || {}).forEach(([k, v]) => {
      if (!v) return;
      const [fromId, toId] = k.split('__');
      edges.push({ fromId, toId, fromLevelIdx: 1, toLevelIdx: 2, type: m2uIds.has(fromId) ? 'uncert' : 'm2' });
    });

    // M3 relationships  (Arch Elements / M3-uncert  →  Parameters)
    Object.entries(data.m3Relationships || {}).forEach(([k, v]) => {
      if (!v) return;
      const [fromId, toId] = k.split('__');
      edges.push({ fromId, toId, fromLevelIdx: 2, toLevelIdx: 3, type: m3uIds.has(fromId) ? 'uncert' : 'm3' });
    });

    return { levels, edges };
  }, [data]);

  const layout = useMemo(() => computeLayout(levels, edges), [levels, edges]);

  // ── Hover: BFS to find connected chain ───────────────────────────────────
  const connected = useMemo(() => {
    if (!hoveredNodeId && !hoveredEdgeKey) return null;

    const cNodes = new Set();
    const cEdges = new Set();

    if (hoveredNodeId) {
      // Bidirectional BFS from hovered node
      const queue   = [hoveredNodeId];
      const visited = new Set([hoveredNodeId]);
      cNodes.add(hoveredNodeId);

      while (queue.length) {
        const id = queue.shift();
        for (const e of edges) {
          const ek = `${e.fromId}__${e.toId}`;
          if (e.fromId === id && !visited.has(e.toId)) {
            visited.add(e.toId);
            queue.push(e.toId);
            cNodes.add(e.toId);
            cEdges.add(ek);
          }
          if (e.toId === id && !visited.has(e.fromId)) {
            visited.add(e.fromId);
            queue.push(e.fromId);
            cNodes.add(e.fromId);
            cEdges.add(ek);
          }
        }
      }
    } else {
      // Edge hover: highlight only that edge + its two endpoints
      const [fromId, toId] = hoveredEdgeKey.split('__');
      cNodes.add(fromId);
      cNodes.add(toId);
      cEdges.add(hoveredEdgeKey);
    }

    return { cNodes, cEdges };
  }, [hoveredNodeId, hoveredEdgeKey, edges]);

  // ── Empty / no-data states ────────────────────────────────────────────────
  const hasNodes = levels.some(l => l.length > 0);
  if (!hasNodes) {
    return (
      <div className="sankey-empty">
        <span style={{ fontSize: 36 }}>🔀</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>No data yet</span>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>
          Add items and relationships in the matrix tabs first.
        </span>
      </div>
    );
  }

  return (
    <div className="sankey-scroll-area">
      {edges.length === 0 && (
        <div className="sankey-hint">
          No relationships marked yet — click cells in the matrix tabs to draw flows.
        </div>
      )}

      <svg
        width={layout.svgW}
        height={layout.svgH}
        style={{ fontFamily: 'system-ui, sans-serif', display: 'block' }}
      >
        {/* ── Column labels ── */}
        {LEVEL_NAMES.map((name, i) => (
          <text
            key={i}
            x={SVG_PX + i * COL_STEP + NODE_W / 2}
            y={SVG_PY - 16}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fill={LEVEL_C[i]?.stroke || '#64748B'}
          >
            {name}
          </text>
        ))}

        {/* ── Subtle dashed dividers in the lane areas ── */}
        {[0, 1, 2].map(i => {
          const lx = SVG_PX + (i + 1) * COL_STEP - LANE_W / 2;
          return (
            <line
              key={i}
              x1={lx} y1={SVG_PY - 8}
              x2={lx} y2={layout.svgH - BOTTOM_PAD}
              stroke="#E2E8F0" strokeWidth={1} strokeDasharray="4 4"
            />
          );
        })}

        {/* ── Flow paths (behind nodes) ── */}
        {edges.map((e, idx) => {
          const ek = `${e.fromId}__${e.toId}`;
          const hl = connected ? connected.cEdges.has(ek) : false;
          const dm = connected ? !connected.cEdges.has(ek) : false;
          return (
            <FlowPath
              key={idx}
              edge={e}
              edgePorts={layout.edgePorts}
              highlight={hl}
              dim={dm}
              onEnter={() => { setHoveredEdgeKey(ek); setHoveredNodeId(null); }}
              onLeave={() => setHoveredEdgeKey(null)}
            />
          );
        })}

        {/* ── Nodes (on top of flows) ── */}
        {Object.entries(layout.nodePos).map(([id, pos]) => {
          const isUncert = pos.node.isUncertainty || false;
          const hl = connected ? connected.cNodes.has(id) : false;
          const dm = connected ? !connected.cNodes.has(id) : false;
          return (
            <SankeyNode
              key={id}
              pos={pos}
              isUncert={isUncert}
              highlight={hl}
              dim={dm}
              onEnter={() => { setHoveredNodeId(id); setHoveredEdgeKey(null); }}
              onLeave={() => setHoveredNodeId(null)}
            />
          );
        })}
      </svg>
    </div>
  );
}
