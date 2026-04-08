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

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { MATRIX2_MARGIN_CHARACTERISTICS, MATRIX2_CHARACTERISTIC_BY_ID } from '../constants/marginCharacteristics';

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
const HOVER_ENTER_DELAY_MS = 110;
const HOVER_LEAVE_DELAY_MS = 140;

function normalizeMatrix1Relationship(value) {
  if (value === 'deliberate' || value === 'inadvertent') return value;
  if (value === true) return 'deliberate';
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return 'deliberate';
  return null;
}

function normalizeMatrix2Relationship(value) {
  if (typeof value === 'string' && MATRIX2_CHARACTERISTIC_BY_ID[value]) return value;
  if (value === true) return MATRIX2_MARGIN_CHARACTERISTICS[0].id;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return MATRIX2_MARGIN_CHARACTERISTICS[0].id;
  return null;
}

function normalizeMatrix3Relationship(value) {
  if (value === true) return 1;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, n);
}

function matrix1Weight(value) {
  return normalizeMatrix1Relationship(value) ? 1 : 0;
}

function matrix2Weight(value) {
  return normalizeMatrix2Relationship(value) ? 1 : 0;
}

function matrix3Weight(value) {
  const parsed = normalizeMatrix3Relationship(value);
  return parsed == null ? 0 : parsed;
}

function importance(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function uncertaintyTypeShort(value) {
  return value === 'aleatory' ? 'A' : 'E';
}

function computeColumnScores(rows, columns, relationships, rowImportanceMap, weightResolver) {
  const scores = {};
  let total = 0;
  for (const col of columns) {
    let score = 0;
    for (const row of rows) {
      const rel = weightResolver(relationships?.[`${row.id}__${col.id}`]);
      if (rel <= 0) continue;
      score += importance(rowImportanceMap?.[row.id]) * rel;
    }
    scores[col.id] = score;
    total += score;
  }
  const priority = {};
  for (const col of columns) priority[col.id] = total > 0 ? (scores[col.id] / total) * 100 : 0;
  return { scores, priority };
}

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

  const svgW = SVG_PX * 2 + NODE_W + COL_STEP * (levels.length - 1) + 120;
  const svgH = maxColBottom + BOTTOM_PAD;

  return { nodePos, edgePorts, svgW, svgH, outEdges, inEdges };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function FlowPath({ edge, edgePorts, highlight, focused, dim, onEnter, onLeave, maxEdgeValue }) {
  const k  = `${edge.fromId}__${edge.toId}`;
  const pp = edgePorts[k];
  if (!pp?.x1 || !pp?.x2) return null;

  const { x1, y1, x2, y2 } = pp;
  const cpX = x1 + (x2 - x1) * 0.5;
  const d   = `M ${x1} ${y1} C ${cpX} ${y1}, ${cpX} ${y2}, ${x2} ${y2}`;

  const isUncert = edge.type === 'uncert';
  const C        = isUncert ? UNCERT_C : (LEVEL_C[edge.fromLevelIdx] || LEVEL_C[0]);
  const opacity  = dim ? 0.06 : focused ? 0.95 : highlight ? 0.80 : 0.28;
  const norm     = maxEdgeValue > 0 ? edge.value / maxEdgeValue : 0;
  const baseSw   = 1 + norm * 5;
  const sw       = focused ? baseSw + 1.6 : highlight ? baseSw + 1 : baseSw;

  return (
    <path
      d={d}
      fill="none"
      stroke={`rgba(${C.flowRgb},1)`}
      strokeWidth={sw}
      strokeOpacity={opacity}
      style={{ cursor: 'default', transition: 'stroke-opacity 0.28s ease, stroke-width 0.28s ease' }}
      title={`${edge.tagDetail ? `${edge.tagDetail}, ` : ''}w=${(edge.weight || 0).toFixed(2)}, contribution=${(edge.value || 0).toFixed(2)}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    />
  );
}

function FlowValueLabel({ edge, edgePorts, highlight, dim }) {
  const k = `${edge.fromId}__${edge.toId}`;
  const pp = edgePorts[k];
  if (!pp?.x1 || !pp?.x2 || dim) return null;

  const x = (pp.x1 + pp.x2) / 2;
  const y = (pp.y1 + pp.y2) / 2;
  const txt = (Number(edge.value) || 0).toFixed(1);

  return (
    <g pointerEvents="none" opacity={highlight ? 1 : 0.88}>
      <rect
        x={x - 14}
        y={y - 7}
        width={28}
        height={14}
        rx={4}
        fill="#FFFFFF"
        fillOpacity={0.88}
        stroke="#CBD5E1"
        strokeWidth={0.8}
      />
      <text
        x={x}
        y={y + 3}
        textAnchor="middle"
        fontSize={8.5}
        fontWeight={700}
        fill="#334155"
      >
        {txt}
      </text>
    </g>
  );
}

function FlowRelationshipTag({ edge, edgePorts, highlight, dim }) {
  if (!edge.tagShort || dim) return null;
  const k = `${edge.fromId}__${edge.toId}`;
  const pp = edgePorts[k];
  if (!pp?.x1 || !pp?.x2) return null;
  const isUncert = edge.type === 'uncert';
  const C = isUncert ? UNCERT_C : (LEVEL_C[edge.fromLevelIdx] || LEVEL_C[0]);

  const x = (pp.x1 + pp.x2) / 2;
  const y = (pp.y1 + pp.y2) / 2;
  const txt = edge.tagShort;
  const width = Math.max(34, Math.min(140, txt.length * 5.8 + 10));
  const tagTextColor = (edge.fromLevelIdx === 2 || isUncert) ? '#0F172A' : '#FFFFFF';

  return (
    <g pointerEvents="none" opacity={highlight ? 1 : 0.84}>
      <rect
        x={x - width / 2}
        y={y - 6}
        width={width}
        height={12}
        rx={4}
        fill={`rgba(${C.flowRgb},0.92)`}
        stroke={`rgba(${C.flowRgb},1)`}
        strokeWidth={0.8}
      />
      <text
        x={x}
        y={y + 2.8}
        textAnchor="middle"
        fontSize={7.8}
        fontWeight={700}
        fill={tagTextColor}
      >
        {txt}
      </text>
    </g>
  );
}

function CouplingPath({ edge, nodePos, dim }) {
  const a = nodePos[edge.aId];
  const b = nodePos[edge.bId];
  if (!a || !b) return null;

  const x = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const y2 = b.y + b.h / 2;
  const dx = 62 + Math.min(52, Math.abs(y2 - y1) * 0.28);
  const cpx = x + dx;
  const d = `M ${x} ${y1} C ${cpx} ${y1}, ${cpx} ${y2}, ${x} ${y2}`;
  const isPositive = edge.sign === '+';
  const stroke = isPositive ? '#16A34A' : '#EF4444';

  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeOpacity={dim ? 0.08 : 0.75}
      strokeDasharray="4 3"
      style={{ transition: 'stroke-opacity 0.28s ease' }}
    />
  );
}

function SankeyNode({ pos, isUncert, highlight, focused, dim, onEnter, onLeave }) {
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
        strokeWidth={focused ? 3.2 : highlight ? 2.5 : 1.5}
        style={{ transition: 'stroke-width 0.28s ease, opacity 0.28s ease' }}
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
export default function CascadeSankey({
  data,
  showFlowValues = true,
  showRelationshipTags = false,
  showCouplings = true,
}) {
  const [hoveredNodeId,  setHoveredNodeId]  = useState(null);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState(null);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [focusedEdgeKey, setFocusedEdgeKey] = useState(null);
  const hoverTimerRef = useRef(null);
  const clearTimerRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const scheduleNodeHover = useCallback((nodeId) => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setFocusedNodeId(nodeId);
    setFocusedEdgeKey(null);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredNodeId(nodeId);
      setHoveredEdgeKey(null);
    }, HOVER_ENTER_DELAY_MS);
  }, []);

  const scheduleEdgeHover = useCallback((edgeKey) => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setFocusedEdgeKey(edgeKey);
    setFocusedNodeId(null);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredEdgeKey(edgeKey);
      setHoveredNodeId(null);
    }, HOVER_ENTER_DELAY_MS);
  }, []);

  const scheduleHoverClear = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      setHoveredNodeId(null);
      setHoveredEdgeKey(null);
      setFocusedNodeId(null);
      setFocusedEdgeKey(null);
    }, HOVER_LEAVE_DELAY_MS);
  }, []);

  // ── Build levels + edges from cascade data ─────────────────────────────
  const { levels, edges } = useMemo(() => {
    const m1u = (data.m1Uncertainties || []).map((u) => ({
      ...u,
      label: `${u.label} [${uncertaintyTypeShort((data.m1UncertaintyTypes || {})[u.id])}]`,
    }));
    const m2u = (data.m2Uncertainties || []).map((u) => ({
      ...u,
      label: `${u.label} [${uncertaintyTypeShort((data.m2UncertaintyTypes || {})[u.id])}]`,
    }));
    const m3u = (data.m3Uncertainties || []).map((u) => ({
      ...u,
      label: `${u.label} [${uncertaintyTypeShort((data.m3UncertaintyTypes || {})[u.id])}]`,
    }));
    const m1Rows = data.m1Rows || [];
    const m1Cols = data.m1Columns || [];
    const m2Cols = data.m2Columns || [];
    const m3Cols = data.m3Columns || [];
    const m2uIds = new Set(m2u.map(u => u.id));
    const m3uIds = new Set(m3u.map(u => u.id));
    const m1AllRows = [...m1Rows, ...m1u];
    const m2AllRows = [...m1Cols, ...m2u];
    const m3AllRows = [...m2Cols, ...m3u];

    const m1RowImp = {
      ...(data.m1NeedImportance || {}),
      ...(data.m1UncertaintyImportance || {}),
    };
    const m1Score = computeColumnScores(m1AllRows, m1Cols, data.m1Relationships || {}, m1RowImp, matrix1Weight);
    const m2RowImp = {
      ...(m1Score.priority || {}),
      ...(data.m2UncertaintyImportance || {}),
    };
    const m3RowImp = {
      ...(data.m2ArchImportance || {}),
      ...(data.m3UncertaintyImportance || {}),
    };

    const levels = [
      [...m1Rows, ...m1u],   // L0: Needs + M1 uncert sources
      [...m1Cols, ...m2u],   // L1: Requirements + M2 uncert sources
      [...m2Cols, ...m3u],   // L2: Arch Elements + M3 uncert sources
      [...m3Cols],           // L3: Parameters
    ];

    const edges = [];

    // M1 relationships  (Needs / M1-uncert  →  Requirements)
    Object.entries(data.m1Relationships || {}).forEach(([k, v]) => {
      const weight = matrix1Weight(v);
      if (weight <= 0) return;
      const [fromId, toId] = k.split('__');
      const isU = m1u.some(u => u.id === fromId);
      const relKind = normalizeMatrix1Relationship(v);
      const tagShort = relKind === 'inadvertent' ? 'I' : 'D';
      edges.push({
        fromId, toId, fromLevelIdx: 0, toLevelIdx: 1, type: isU ? 'uncert' : 'm1',
        weight,
        value: importance(m1RowImp[fromId]) * weight,
        tagShort,
        tagDetail: relKind || 'deliberate',
      });
    });

    // M2 relationships  (Requirements / M2-uncert  →  Arch Elements)
    Object.entries(data.m2Relationships || {}).forEach(([k, v]) => {
      const weight = matrix2Weight(v);
      if (weight <= 0) return;
      const [fromId, toId] = k.split('__');
      const characteristicId = normalizeMatrix2Relationship(v);
      const characteristic = characteristicId ? (MATRIX2_CHARACTERISTIC_BY_ID[characteristicId] || null) : null;
      edges.push({
        fromId, toId, fromLevelIdx: 1, toLevelIdx: 2, type: m2uIds.has(fromId) ? 'uncert' : 'm2',
        weight,
        value: importance(m2RowImp[fromId]) * weight,
        tagShort: characteristic?.short || characteristic?.label || null,
        tagDetail: characteristic?.label || null,
      });
    });

    // M3 relationships  (Arch Elements / M3-uncert  →  Parameters)
    Object.entries(data.m3Relationships || {}).forEach(([k, v]) => {
      const weight = matrix3Weight(v);
      if (weight <= 0) return;
      const [fromId, toId] = k.split('__');
      const shortWeight = Math.abs(weight - Math.round(weight)) < 0.001
        ? String(Math.round(weight))
        : weight.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      edges.push({
        fromId, toId, fromLevelIdx: 2, toLevelIdx: 3, type: m3uIds.has(fromId) ? 'uncert' : 'm3',
        weight,
        value: importance(m3RowImp[fromId]) * weight,
        tagShort: `x${shortWeight}`,
        tagDetail: `amplification x${shortWeight}`,
      });
    });

    return { levels, edges };
  }, [data]);

  const layout = useMemo(() => computeLayout(levels, edges), [levels, edges]);
  const maxEdgeValue = useMemo(
    () => edges.reduce((m, e) => Math.max(m, Number.isFinite(e.value) ? e.value : 0), 0),
    [edges]
  );
  const couplingEdges = useMemo(() => {
    const out = [];
    const couplings = data.m3Couplings || {};
    for (const [key, sign] of Object.entries(couplings)) {
      if (sign !== '+' && sign !== '-') continue;
      const [aId, bId] = key.split('__');
      if (!layout.nodePos[aId] || !layout.nodePos[bId]) continue;
      out.push({ key, aId, bId, sign });
    }
    out.sort((x, y) => x.key.localeCompare(y.key));
    return out;
  }, [data.m3Couplings, layout.nodePos]);
  const couplingMaxX = useMemo(() => {
    return couplingEdges.reduce((maxX, ce) => {
      const a = layout.nodePos[ce.aId];
      const b = layout.nodePos[ce.bId];
      if (!a || !b) return maxX;
      const y1 = a.y + a.h / 2;
      const y2 = b.y + b.h / 2;
      const dx = 62 + Math.min(52, Math.abs(y2 - y1) * 0.28);
      return Math.max(maxX, a.x + a.w + dx + 8);
    }, 0);
  }, [couplingEdges, layout.nodePos]);
  const svgW = Math.max(layout.svgW, couplingMaxX + SVG_PX);

  // ── Hover: BFS to find connected chain ───────────────────────────────────
  const connected = useMemo(() => {
    if (!hoveredNodeId && !hoveredEdgeKey) return null;

    const cNodes = new Set();
    const cEdges = new Set();

    if (hoveredNodeId) {
      // Directional cascade from hovered node:
      // 1) upstream ancestors through incoming edges only
      // 2) downstream descendants through outgoing edges only
      cNodes.add(hoveredNodeId);

      const upQueue = [hoveredNodeId];
      const upVisited = new Set([hoveredNodeId]);
      while (upQueue.length) {
        const id = upQueue.shift();
        for (const e of layout.inEdges[id] || []) {
          const ek = `${e.fromId}__${e.toId}`;
          cEdges.add(ek);
          if (!upVisited.has(e.fromId)) {
            upVisited.add(e.fromId);
            upQueue.push(e.fromId);
            cNodes.add(e.fromId);
          }
        }
      }

      const downQueue = [hoveredNodeId];
      const downVisited = new Set([hoveredNodeId]);
      while (downQueue.length) {
        const id = downQueue.shift();
        for (const e of layout.outEdges[id] || []) {
          const ek = `${e.fromId}__${e.toId}`;
          cEdges.add(ek);
          if (!downVisited.has(e.toId)) {
            downVisited.add(e.toId);
            downQueue.push(e.toId);
            cNodes.add(e.toId);
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
  }, [hoveredNodeId, hoveredEdgeKey, edges, layout.outEdges, layout.inEdges]);

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
        width={svgW}
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
          const focused = focusedEdgeKey === ek || hoveredEdgeKey === ek;
          const dm = connected ? !connected.cEdges.has(ek) && !focused : false;
          return (
            <FlowPath
              key={idx}
              edge={e}
              edgePorts={layout.edgePorts}
              maxEdgeValue={maxEdgeValue}
              highlight={hl}
              focused={focused}
              dim={dm}
              onEnter={() => scheduleEdgeHover(ek)}
              onLeave={scheduleHoverClear}
            />
          );
        })}

        {/* ── Flow value labels ── */}
        {showFlowValues && edges.map((e, idx) => {
          const ek = `${e.fromId}__${e.toId}`;
          const hl = connected ? connected.cEdges.has(ek) : false;
          const dm = connected ? !connected.cEdges.has(ek) : false;
          return (
            <FlowValueLabel
              key={`val_${idx}`}
              edge={e}
              edgePorts={layout.edgePorts}
              highlight={hl}
              dim={dm}
            />
          );
        })}
        {showRelationshipTags && edges.map((e, idx) => {
          const ek = `${e.fromId}__${e.toId}`;
          const hl = connected ? connected.cEdges.has(ek) : false;
          const dm = connected ? !connected.cEdges.has(ek) : false;
          return (
            <FlowRelationshipTag
              key={`char_${idx}`}
              edge={e}
              edgePorts={layout.edgePorts}
              highlight={hl}
              dim={dm}
            />
          );
        })}
        {showCouplings && couplingEdges.map((ce) => (
          <CouplingPath
            key={`cpl_${ce.key}`}
            edge={ce}
            nodePos={layout.nodePos}
            dim={!!connected}
          />
        ))}

        {/* ── Nodes (on top of flows) ── */}
        {Object.entries(layout.nodePos).map(([id, pos]) => {
          const isUncert = pos.node.isUncertainty || false;
          const hl = connected ? connected.cNodes.has(id) : false;
          const focused = focusedNodeId === id || hoveredNodeId === id;
          const dm = connected ? !connected.cNodes.has(id) && !focused : false;
          return (
            <SankeyNode
              key={id}
              pos={pos}
              isUncert={isUncert}
              highlight={hl}
              focused={focused}
              dim={dm}
              onEnter={() => scheduleNodeHover(id)}
              onLeave={scheduleHoverClear}
            />
          );
        })}
      </svg>
    </div>
  );
}
