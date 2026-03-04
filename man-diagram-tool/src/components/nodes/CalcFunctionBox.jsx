import React from 'react';
import { NODE_META } from '../../constants/nodeTypes';
import { sanitize } from '../../utils/helpers';
import { getCalcFunctionVisualSpec } from '../../utils/calcFunctionVisual';

function CalcFunctionBox({
  node,
  selected,
  hasError,
  connectedInPorts = [],
  connectedOutPorts = [],
  routePreference = 'horizontal',
  connecting,
  onStartConnect,
  onFinishConnect,
}) {
  const [hoveredInputPort, setHoveredInputPort] = React.useState(null);
  const meta = NODE_META.calcFunction;
  const isValidated = Boolean(
    node?.validationOutputs &&
    typeof node.validationOutputs === 'object' &&
    Object.keys(node.validationOutputs).length > 0
  );
  const validatedFill = '#DCFCE7';
  const stroke = hasError ? '#DC2626' : (selected ? '#2563EB' : meta.stroke);
  const strokeWidth = hasError ? 3 : (selected ? 2.5 : meta.strokeWidth);
  const spec = getCalcFunctionVisualSpec(node, { orientation: routePreference });
  const badge = spec.title || String(node.autoLabel || '').trim() || 'CF';
  const outputVar = sanitize(node.label || '') || (spec.outputs || ['out'])[0];
  const isConnecting = Boolean(connecting);
  const isSourceNode = isConnecting && connecting?.fromId === node.id;
  const isTargetNode = isConnecting && connecting?.fromId !== node.id;
  const selectedSourcePort = isSourceNode ? (connecting?.fromPort || null) : null;
  const connectedInSet = new Set(connectedInPorts || []);
  const connectedOutSet = new Set(connectedOutPorts || []);
  const isVertical = routePreference === 'vertical';

  const disconnectedColor = '#DC2626';
  const connectedColor = '#16A34A';

  const buildSlots = (count) => {
    const n = Math.max(1, count);
    if (n === 1) return [0];
    const min = -spec.width / 2 + 22;
    const max = spec.width / 2 - 22;
    const step = (max - min) / (n - 1);
    return Array.from({ length: n }, (_, i) => min + i * step);
  };
  const inVertX = buildSlots(spec.inputSlots.length);
  const outVertX = buildSlots(spec.outputSlots.length);

  return (
    <g>
      <rect
        x={-spec.width / 2}
        y={-spec.height / 2}
        width={spec.width}
        height={spec.height}
        rx={8}
        fill={isValidated ? validatedFill : meta.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />

      <text
        x={0}
        y={isVertical ? -4 : (-spec.height / 2 + 12)}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
        fill="#78350F"
      >
        {badge}
      </text>

      {spec.inputSlots.map((slot, idx) => (
        <g key={`in-${slot.name}-${idx}`}>
          {(() => {
            const portX = isVertical ? inVertX[idx] : -spec.width / 2 - 12;
            const portY = isVertical ? -spec.height / 2 - 12 : slot.y;
            const labelX = isVertical ? inVertX[idx] : -spec.width / 2 + 6;
            const labelY = isVertical ? (-spec.height / 2 + 11) : (slot.y + 3);
            const hitW = isVertical ? 18 : Math.max(36, slot.name.length * 6 + 16);
            const hitH = isVertical ? Math.max(36, slot.name.length * 6 + 16) : 18;
            const hitX = isVertical ? (labelX - hitW / 2) : (portX - 8);
            const hitY = isVertical ? (portY - 8) : (labelY - 11);
            return (
              <rect
                x={hitX}
                y={hitY}
                width={hitW}
                height={hitH}
                fill="transparent"
                style={{ cursor: connecting ? 'crosshair' : 'default' }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (connecting) onFinishConnect(slot.name);
                }}
              />
            );
          })()}
          {(() => {
            const isActiveTarget = isTargetNode && hoveredInputPort === slot.name;
            const isConnected = connectedInSet.has(slot.name);
            const stemColor = isActiveTarget
              ? '#F97316'
              : (isConnected ? connectedColor : disconnectedColor);
            const stemGlow = isActiveTarget ? 'drop-shadow(0 0 4px rgba(249,115,22,0.8))' : 'none';
            const stemWidth = isActiveTarget ? 1.8 : 1.2;
            const dotR = isActiveTarget ? 2.9 : 2.3;
            const x1 = isVertical ? inVertX[idx] : -spec.width / 2 - 12;
            const y1 = isVertical ? -spec.height / 2 - 12 : slot.y;
            const x2 = isVertical ? inVertX[idx] : -spec.width / 2;
            const y2 = isVertical ? -spec.height / 2 : slot.y;
            return (
              <>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stemColor}
                  strokeWidth={stemWidth}
                  strokeLinecap="round"
                  style={{ filter: stemGlow }}
                />
                <circle
                  cx={x1}
                  cy={y1}
                  r={dotR}
                  fill={stemColor}
                  style={{ filter: stemGlow }}
                />
              </>
            );
          })()}
          <circle
            cx={isVertical ? inVertX[idx] : -spec.width / 2 - 12}
            cy={isVertical ? -spec.height / 2 - 12 : slot.y}
            r={9}
            fill="transparent"
            style={{ cursor: connecting ? 'crosshair' : 'default' }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => {
              if (isTargetNode) setHoveredInputPort(slot.name);
            }}
            onMouseLeave={() => {
              if (isTargetNode) setHoveredInputPort((prev) => (prev === slot.name ? null : prev));
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (connecting) onFinishConnect(slot.name);
            }}
          />
          <text
            x={isVertical ? inVertX[idx] : -spec.width / 2 + 6}
            y={isVertical ? (-spec.height / 2 + 11) : (slot.y + 3)}
            textAnchor={isVertical ? 'middle' : 'start'}
            fontSize={9}
            fontFamily="'Consolas', 'Monaco', monospace"
            fill="#78350F"
            transform={isVertical ? `rotate(-90 ${inVertX[idx]} ${(-spec.height / 2 + 11)})` : undefined}
            style={{ cursor: connecting ? 'crosshair' : 'default' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (connecting) onFinishConnect(slot.name);
            }}
          >
            {slot.name}
          </text>
        </g>
      ))}

      {spec.outputSlots.map((slot, idx) => (
        <g key={`out-${slot.name}-${idx}`}>
          {(() => {
            const isActiveSource = isSourceNode && selectedSourcePort && selectedSourcePort === slot.name;
            const isConnected = connectedOutSet.has(slot.name);
            const stemColor = isActiveSource
              ? '#F97316'
              : (isConnected ? connectedColor : disconnectedColor);
            const stemGlow = isActiveSource ? 'drop-shadow(0 0 4px rgba(249,115,22,0.8))' : 'none';
            const stemWidth = isActiveSource ? 1.8 : 1.2;
            const dotR = isActiveSource ? 2.9 : 2.3;
            const x1 = isVertical ? outVertX[idx] : spec.width / 2;
            const y1 = isVertical ? spec.height / 2 : slot.y;
            const x2 = isVertical ? outVertX[idx] : spec.width / 2 + 12;
            const y2 = isVertical ? spec.height / 2 + 12 : slot.y;
            return (
              <>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stemColor}
                  strokeWidth={stemWidth}
                  strokeLinecap="round"
                  style={{ filter: stemGlow }}
                />
                <circle
                  cx={x2}
                  cy={y2}
                  r={dotR}
                  fill={stemColor}
                  style={{ filter: stemGlow }}
                />
              </>
            );
          })()}
          <circle
            cx={isVertical ? outVertX[idx] : spec.width / 2 + 12}
            cy={isVertical ? spec.height / 2 + 12 : slot.y}
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
            x={isVertical ? outVertX[idx] : spec.width / 2 - 6}
            y={isVertical ? (spec.height / 2 - 7) : (slot.y + 3)}
            textAnchor={isVertical ? 'middle' : 'end'}
            fontSize={9}
            fontFamily="'Consolas', 'Monaco', monospace"
            fill="#78350F"
            transform={isVertical ? `rotate(-90 ${outVertX[idx]} ${(spec.height / 2 - 7)})` : undefined}
          >
            {slot.name}
          </text>
        </g>
      ))}

      <text
        x={0}
        y={isVertical ? (spec.height / 2 - 22) : (spec.height / 2 - 8)}
        textAnchor="middle"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
        fill="#334155"
      >
        {outputVar}
      </text>
    </g>
  );
}

export default React.memo(CalcFunctionBox);
