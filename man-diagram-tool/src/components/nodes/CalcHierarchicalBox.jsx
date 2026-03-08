import React from 'react';
import { NODE_META } from '../../constants/nodeTypes';
import { getCalcHierarchicalVisualSpec } from '../../utils/calcHierarchicalVisual';

function CalcHierarchicalBox({
  node,
  selected,
  hasError,
  connectedInPorts = [],
  connectedOutPorts = [],
  connecting,
  onStartConnect,
  onFinishConnect,
}) {
  const [hoveredInputPort, setHoveredInputPort] = React.useState(null);
  const meta = NODE_META.calcHierarchical;
  const stroke = hasError ? '#DC2626' : (selected ? '#2563EB' : meta.stroke);
  const strokeWidth = hasError ? 3 : (selected ? 2.5 : meta.strokeWidth);
  const spec = getCalcHierarchicalVisualSpec(node);
  const badge = spec.title;
  const isConnecting = Boolean(connecting);
  const isSourceNode = isConnecting && connecting?.fromId === node.id;
  const isTargetNode = isConnecting && connecting?.fromId !== node.id;
  const selectedSourcePort = isSourceNode ? (connecting?.fromPort || null) : null;
  const connectedInSet = new Set(connectedInPorts || []);
  const connectedOutSet = new Set(connectedOutPorts || []);

  const disconnectedColor = '#1D4ED8';
  const connectedColor = '#16A34A';
  const hw = spec.width / 2;
  const hh = spec.height / 2;
  const STEM = 12;

  return (
    <g>
      {/* Main box */}
      <rect
        x={-hw}
        y={-hh}
        width={spec.width}
        height={spec.height}
        rx={8}
        fill={meta.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />

      {/* Badge / title */}
      <text
        x={0}
        y={-hh + 12}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
        fill="#1D4ED8"
      >
        {badge}
      </text>

      {/* Expand hint icon in top-right corner */}
      <text
        x={hw - 8}
        y={-hh + 12}
        textAnchor="middle"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
        fill="#93C5FD"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        ⊕
      </text>

      {/* Input port slots (left side) */}
      {spec.inputSlots.map((slot, idx) => {
        const portX = -hw - STEM;
        const portY = slot.y;
        const isActiveTarget = isTargetNode && hoveredInputPort === slot.name;
        const isConnected = connectedInSet.has(slot.name);
        const stemColor = isActiveTarget
          ? '#F97316'
          : (isConnected ? connectedColor : disconnectedColor);
        const stemGlow = isActiveTarget ? 'drop-shadow(0 0 4px rgba(249,115,22,0.8))' : 'none';
        const stemWidth = isActiveTarget ? 1.8 : 1.2;
        const dotR = isActiveTarget ? 2.9 : 2.3;
        return (
          <g key={`in-${slot.name}-${idx}`}>
            <line
              x1={portX}
              y1={portY}
              x2={-hw}
              y2={portY}
              stroke={stemColor}
              strokeWidth={stemWidth}
              strokeLinecap="round"
              style={{ filter: stemGlow }}
            />
            <circle
              cx={portX}
              cy={portY}
              r={dotR}
              fill={stemColor}
              style={{ filter: stemGlow }}
            />
            {/* Hit area */}
            <circle
              cx={portX}
              cy={portY}
              r={9}
              fill="transparent"
              style={{ cursor: connecting ? 'crosshair' : 'default' }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => { if (isTargetNode) setHoveredInputPort(slot.name); }}
              onMouseLeave={() => { if (isTargetNode) setHoveredInputPort((p) => p === slot.name ? null : p); }}
              onClick={(e) => {
                e.stopPropagation();
                if (connecting) onFinishConnect(slot.name);
              }}
            />
            <text
              x={-hw + 6}
              y={portY + 3}
              textAnchor="start"
              fontSize={9}
              fontFamily="'Consolas', 'Monaco', monospace"
              fill="#1D4ED8"
              style={{ cursor: connecting ? 'crosshair' : 'default', pointerEvents: 'none' }}
            >
              {slot.name}
            </text>
          </g>
        );
      })}

      {/* Output port slots (right side) */}
      {spec.outputSlots.map((slot, idx) => {
        const portX = hw + STEM;
        const portY = slot.y;
        const isActiveSource = isSourceNode && selectedSourcePort === slot.name;
        const isConnected = connectedOutSet.has(slot.name);
        const stemColor = isActiveSource
          ? '#F97316'
          : (isConnected ? connectedColor : disconnectedColor);
        const stemGlow = isActiveSource ? 'drop-shadow(0 0 4px rgba(249,115,22,0.8))' : 'none';
        const stemWidth = isActiveSource ? 1.8 : 1.2;
        const dotR = isActiveSource ? 2.9 : 2.3;
        return (
          <g key={`out-${slot.name}-${idx}`}>
            <line
              x1={hw}
              y1={portY}
              x2={portX}
              y2={portY}
              stroke={stemColor}
              strokeWidth={stemWidth}
              strokeLinecap="round"
              style={{ filter: stemGlow }}
            />
            <circle
              cx={portX}
              cy={portY}
              r={dotR}
              fill={stemColor}
              style={{ filter: stemGlow }}
            />
            {/* Hit area */}
            <circle
              cx={portX}
              cy={portY}
              r={9}
              fill="transparent"
              style={{ cursor: connecting ? 'default' : 'crosshair' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!connecting) onStartConnect(node.id, slot.name);
              }}
            />
            <text
              x={hw - 6}
              y={portY + 3}
              textAnchor="end"
              fontSize={9}
              fontFamily="'Consolas', 'Monaco', monospace"
              fill="#1D4ED8"
              style={{ pointerEvents: 'none' }}
            >
              {slot.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default React.memo(CalcHierarchicalBox);
