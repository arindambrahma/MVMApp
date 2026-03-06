import React, { useEffect, useRef } from 'react';
import { pointsToSvgPath, computeArrowhead } from '../../utils/orthogonalRouter';
import { EDGE_TYPES } from '../../constants/nodeTypes';
import { sanitize } from '../../utils/helpers';

// Format a numeric value compactly
function formatValue(v) {
  if (typeof v !== 'number') return String(v);
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs >= 10000) return v.toFixed(0);
  if (abs >= 100)   return v.toFixed(1);
  if (abs >= 1)     return v.toPrecision(4);
  return v.toPrecision(3);
}

function pointAtFraction(points, fraction = 0.5) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  let total = 0;
  const lens = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    lens.push(len);
    total += len;
  }
  if (total <= 1e-9) return points[Math.floor(points.length / 2)];

  const target = Math.max(0, Math.min(1, fraction)) * total;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const segLen = lens[i - 1];
    if (acc + segLen >= target) {
      const t = segLen > 0 ? (target - acc) / segLen : 0;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    acc += segLen;
  }
  return points[points.length - 1];
}

function OrthogonalPath({
  edge, srcNode, tgtNode, points, jumps, onDelete, paramValues,
  hovered = false, selected = false, onHoverChange = () => {}, overlayOnly = false,
  onSelectEdge = () => {},
  onNudgeEdge = () => {},
  attachedProbes = [],
  probeConnectFromId = null,
  onAttachProbeToEdge = () => {},
  onDetachProbe = () => {},
}) {
  const dragRef = useRef(null);
  const dragCleanupRef = useRef(null);

  useEffect(() => {
    return () => {
      if (typeof dragCleanupRef.current === 'function') {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
    };
  }, []);

  const route = points || [srcNode, tgtNode];
  const pathD = pointsToSvgPath(route);
  const arrowPts = computeArrowhead(route);

  const color = edge.edgeType === EDGE_TYPES.THRESHOLD ? '#DC2626'
    : edge.edgeType === EDGE_TYPES.DECIDED ? '#111827'
    : '#9CA3AF'; // plain gray
  const hoverColor = edge.edgeType === EDGE_TYPES.THRESHOLD ? '#EF4444'
    : edge.edgeType === EDGE_TYPES.DECIDED ? '#0F172A'
    : '#64748B';

  // Midpoint for delete button and tooltip anchor
  const midIdx = Math.floor(route.length / 2);
  const mid = route[midIdx] || route[0];
  const hasPortBinding = Boolean(edge.fromPort || edge.toPort);
  const portLabel = hasPortBinding
    ? `${edge.fromPort || '*'} -> ${edge.toPort || '*'}`
    : '';

  // Resolve tooltip text based on source node type.
  let hasValue = false;
  let tooltipText = '';

  if (srcNode.type === 'margin') {
    // Margin nodes: show both decided (D) and threshold (T) values.
    const mk = sanitize(srcNode.label);
    const dVal = paramValues?.[mk + '_decided'];
    const tVal = paramValues?.[mk + '_threshold'];
    hasValue = dVal !== undefined && tVal !== undefined;
    if (hasValue) {
      tooltipText = `${srcNode.label}  D=${formatValue(dVal)}  T=${formatValue(tVal)}`;
    }
  } else {
    // All other nodes: show their single output value.
    let srcVarName = sanitize(srcNode.label);
    if (srcNode.type === 'decision') srcVarName = srcVarName + '_D';
    hasValue = Boolean(paramValues && srcVarName in paramValues);
    if (hasValue) {
      const value = paramValues[srcVarName];
      const unit = srcNode.unit || '';
      tooltipText = `${srcNode.label}: ${formatValue(value)}${unit ? ' ' + unit : ''}`;
    }
  }

  const tooltipLines = [];
  if (hasValue && tooltipText) tooltipLines.push(tooltipText);
  if (hasPortBinding && portLabel) tooltipLines.push(`Ports: ${portLabel}`);
  const showTooltip = tooltipLines.length > 0;
  const maxLineLen = tooltipLines.reduce((m, s) => Math.max(m, s.length), 0);
  const tooltipW = Math.min(260, Math.max(100, maxLineLen * 6.3 + 16));
  const tooltipH = 10 + tooltipLines.length * 12;
  const isProbeAttachMode = Boolean(probeConnectFromId);

  const probeAnchorOnRect = (probe, at) => {
    const hw = (probe.boxW || 120) / 2;
    const hh = (probe.boxH || 58) / 2;
    const dx = at.x - probe.x;
    const dy = at.y - probe.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: probe.x + (dx >= 0 ? hw : -hw), y: probe.y + Math.max(-hh + 6, Math.min(hh - 6, dy)) };
    }
    return { x: probe.x + Math.max(-hw + 8, Math.min(hw - 8, dx)), y: probe.y + (dy >= 0 ? hh : -hh) };
  };

  const buildProbeConnectorPath = (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const elbow = { x: to.x, y: from.y };
      return `M ${from.x} ${from.y} L ${elbow.x} ${elbow.y} L ${to.x} ${to.y}`;
    }
    const elbow = { x: from.x, y: to.y };
    return `M ${from.x} ${from.y} L ${elbow.x} ${elbow.y} L ${to.x} ${to.y}`;
  };

  return (
    <g>
      {/* Invisible wider hit area for hover */}
      {!overlayOnly && (
        <path
          d={pathD}
          fill="none"
          stroke={isProbeAttachMode ? 'rgba(14,116,144,0.001)' : 'transparent'}
          strokeWidth={16}
          style={{ cursor: isProbeAttachMode ? 'crosshair' : 'pointer', pointerEvents: 'stroke' }}
          onClick={(e) => {
            e.stopPropagation();
            if (isProbeAttachMode) {
              onAttachProbeToEdge(e);
              return;
            }
            onSelectEdge(edge.id);
          }}
          onMouseEnter={() => onHoverChange(true)}
          onMouseLeave={() => onHoverChange(false)}
        />
      )}

      {/* Visible line — thin, crisp */}
      <path
        d={pathD}
        fill="none"
        stroke={hovered ? hoverColor : color}
        strokeWidth={hovered || selected ? 1.9 : 1.0}
        strokeLinecap="round"
        opacity={hovered ? 1 : 0.95}
        style={{ pointerEvents: 'none' }}
      />

      {/* Crossing jumps */}
      {(jumps || []).map((j, idx) => {
        const r = 6;
        const h = 4.5;
        const bg = '#F8FAFC';
        const eps = 1.4; // overlap into main line to hide anti-alias seams
        const jumpD = j.vertical
          ? `M ${j.x} ${j.y - r - eps}
             C ${j.x} ${j.y - r * 0.45} ${j.x + h} ${j.y - r * 0.45} ${j.x + h} ${j.y}
             C ${j.x + h} ${j.y + r * 0.45} ${j.x} ${j.y + r * 0.45} ${j.x} ${j.y + r + eps}`
          : `M ${j.x - r - eps} ${j.y}
             C ${j.x - r * 0.45} ${j.y} ${j.x - r * 0.45} ${j.y - h} ${j.x} ${j.y - h}
             C ${j.x + r * 0.45} ${j.y - h} ${j.x + r * 0.45} ${j.y} ${j.x + r + eps} ${j.y}`;

        const baseW = hovered ? 1.8 : 1.0;
        if (j.vertical) {
          return (
            <g key={`jump_${idx}`} style={{ pointerEvents: 'none' }}>
              <line
                x1={j.x}
                y1={j.y - r}
                x2={j.x}
                y2={j.y + r}
                stroke={bg}
                strokeWidth={baseW + 2.6}
                strokeLinecap="round"
              />
              <path
                d={jumpD}
                fill="none"
                stroke={hovered ? hoverColor : color}
                strokeWidth={baseW}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={j.x} cy={j.y - r - eps} r={baseW * 0.5} fill={hovered ? hoverColor : color} />
              <circle cx={j.x} cy={j.y + r + eps} r={baseW * 0.5} fill={hovered ? hoverColor : color} />
            </g>
          );
        }
        return (
          <g key={`jump_${idx}`} style={{ pointerEvents: 'none' }}>
            <line
              x1={j.x - r}
              y1={j.y}
              x2={j.x + r}
              y2={j.y}
              stroke={bg}
              strokeWidth={baseW + 2.6}
              strokeLinecap="round"
            />
            <path
              d={jumpD}
              fill="none"
              stroke={hovered ? hoverColor : color}
              strokeWidth={baseW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={j.x - r - eps} cy={j.y} r={baseW * 0.5} fill={hovered ? hoverColor : color} />
            <circle cx={j.x + r + eps} cy={j.y} r={baseW * 0.5} fill={hovered ? hoverColor : color} />
          </g>
        );
      })}

      {/* Filled arrowhead */}
      <polygon
        points={arrowPts}
        fill={color}
        style={{ pointerEvents: 'none' }}
      />

      {/* Probe latches attached to this edge */}
      {!overlayOnly && (attachedProbes || []).map((probe) => {
        const latch = pointAtFraction(route, probe.t);
        const anchor = probeAnchorOnRect(probe, latch);
        const vx = anchor.x - latch.x;
        const vy = anchor.y - latch.y;
        const vLen = Math.hypot(vx, vy) || 1;
        const ux = vx / vLen;
        const uy = vy / vLen;
        const handleStart = { x: latch.x + ux * 6, y: latch.y + uy * 6 };
        const connectorD = buildProbeConnectorPath(handleStart, anchor);
        const delX = latch.x + 12;
        const delY = latch.y - 10;
        return (
          <g key={`probe_attach_${probe.id}`}>
            <path
              d={connectorD}
              fill="none"
              stroke="#92400E"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
            <circle
              cx={latch.x}
              cy={latch.y}
              r={6}
              fill="#FFFFFF"
              stroke="#92400E"
              strokeWidth={1.6}
            />
            <circle
              cx={latch.x}
              cy={latch.y}
              r={2}
              fill="#F59E0B"
            />
            {(hovered || selected) && (
              <g
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDetachProbe(probe.id);
                }}
              >
                <circle
                  cx={delX}
                  cy={delY}
                  r={6}
                  fill="#fff"
                  stroke="#92400E"
                  strokeWidth={1}
                />
                <text
                  x={delX}
                  y={delY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fill="#92400E"
                  style={{ pointerEvents: 'none' }}
                >
                  x
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Hover overlay: tooltip + delete button */}
      {(hovered || selected) && (
        <g
          onMouseEnter={() => { if (!overlayOnly) onHoverChange(true); }}
          onMouseLeave={() => { if (!overlayOnly) onHoverChange(false); }}
        >
          {/* Value tooltip — only when analysis has been run */}
          {showTooltip && (
            <g
              transform={`translate(${mid.x}, ${mid.y - 22})`}
              style={{ pointerEvents: 'none' }}
            >
              <rect
                x={-tooltipW / 2}
                y={-tooltipH + 8}
                width={tooltipW}
                height={tooltipH}
                rx={5}
                fill="#1E293B"
                opacity={0.92}
              />
              {tooltipLines.map((line, idx) => (
                <text
                  key={`tip-${idx}`}
                  x={0}
                  y={-tooltipH + 16 + idx * 12}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fill="#F1F5F9"
                  fontFamily="'Consolas', 'Monaco', monospace"
                >
                  {line}
                </text>
              ))}
            </g>
          )}

          {/* Delete button at midpoint */}
          <g
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onDelete(edge.id); onSelectEdge(null); }}
          >
            <circle
              cx={mid.x + 14}
              cy={mid.y - 14}
              r={6}
              fill="#fff"
              stroke={color}
              strokeWidth={1}
            />
            <text
              x={mid.x + 14}
              y={mid.y - 14}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fill={color}
              style={{ pointerEvents: 'none' }}
            >
              ×
            </text>
          </g>
          <g
            style={{ cursor: 'move' }}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              onSelectEdge(edge.id);
              dragRef.current = { x: e.clientX, y: e.clientY };
              const onMove = (ev) => {
                const d = dragRef.current;
                if (!d) return;
                const dx = ev.clientX - d.x;
                const dy = ev.clientY - d.y;
                if (dx !== 0 || dy !== 0) {
                  onNudgeEdge(edge.id, dx, dy);
                  d.x = ev.clientX;
                  d.y = ev.clientY;
                }
              };
              const onUp = () => {
                dragRef.current = null;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                dragCleanupRef.current = null;
              };
              dragCleanupRef.current = onUp;
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
              e.stopPropagation();
            }}
          >
            <circle
              cx={mid.x}
              cy={mid.y}
              r={4.5}
              fill="#fff"
              stroke={hovered ? hoverColor : color}
              strokeWidth={1.6}
            />
          </g>
          <g>
            <circle
              cx={mid.x - 10}
              cy={mid.y}
              r={4}
              fill="#fff"
              stroke="#64748B"
              strokeWidth={1}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEdge(edge.id);
                onNudgeEdge(edge.id, -24, 0);
              }}
            />
            <circle
              cx={mid.x + 10}
              cy={mid.y}
              r={4}
              fill="#fff"
              stroke="#64748B"
              strokeWidth={1}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEdge(edge.id);
                onNudgeEdge(edge.id, 24, 0);
              }}
            />
          </g>
        </g>
      )}
    </g>
  );
}

export default React.memo(OrthogonalPath);
