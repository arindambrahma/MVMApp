import React from 'react';

/**
 * Renders a boundary port node inside a hierarchical sub-canvas.
 * - hierarchicalInput: arrow pointing RIGHT (value flows in from left)
 * - hierarchicalOutput: arrow pointing RIGHT (value flows out to right)
 */
function HierarchicalPortNode({
  node,
  selected,
  connecting,
  onStartConnect,
  onFinishConnect,
}) {
  const isInput = node.type === 'hierarchicalInput';
  const portName = node.portName || node.label || '';
  const fill = isInput ? '#DBEAFE' : '#DCFCE7';
  const stroke = isInput ? '#1D4ED8' : '#15803D';
  const textColor = isInput ? '#1D4ED8' : '#15803D';
  const selectedStroke = '#2563EB';
  const w = 80;
  const h = 28;
  const hw = w / 2;
  const hh = h / 2;
  // Arrow body + tip points
  const arrowTip = hw - 2;
  const arrowBody = hw - 12;

  const points = isInput
    ? `${-hw},${-hh} ${arrowBody},${-hh} ${arrowTip},0 ${arrowBody},${hh} ${-hw},${hh}`
    : `${-hw},${-hh} ${arrowBody},${-hh} ${arrowTip},0 ${arrowBody},${hh} ${-hw},${hh}`;

  return (
    <g>
      <polygon
        points={points}
        fill={fill}
        stroke={selected ? selectedStroke : stroke}
        strokeWidth={selected ? 2 : 1.5}
      />
      <text
        x={isInput ? -2 : -2}
        y={4}
        textAnchor="middle"
        fontSize={9}
        fontWeight={600}
        fontFamily="'Consolas', 'Monaco', monospace"
        fill={textColor}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {portName}
      </text>
      {/* Connection point on right side for inputs (to connect downstream) */}
      {isInput && !connecting && (
        <circle
          cx={hw + 8}
          cy={0}
          r={6}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onStartConnect(node.id, null);
          }}
        />
      )}
      {/* Incoming connection target for outputs (to receive from upstream) */}
      {!isInput && connecting && (
        <circle
          cx={-hw - 8}
          cy={0}
          r={9}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onFinishConnect(null);
          }}
        />
      )}
    </g>
  );
}

export default React.memo(HierarchicalPortNode);
