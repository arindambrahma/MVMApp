import React from 'react';
import { NODE_META } from '../../constants/nodeTypes';

const meta = NODE_META.performance;
const R = 15;

function PerformanceDonut({ node, selected, hasError }) {
  const stroke = hasError ? '#DC2626' : (selected ? '#2563EB' : meta.stroke);
  const strokeWidth = hasError ? 4.5 : meta.strokeWidth;
  return (
    <g>
      <circle
        r={R}
        fill={meta.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <circle
        r={R - strokeWidth}
        fill="#FFFFFF"
        stroke="none"
      />
      <text
        y={R + 14}
        textAnchor="middle"
        fontSize={11}
        fontFamily="system-ui, sans-serif"
        fill="#333"
      >
        {node.label}
      </text>
      {node.unit && (
        <text
          y={R + 26}
          textAnchor="middle"
          fontSize={9}
          fontFamily="system-ui, sans-serif"
          fill="#888"
        >
          [{node.unit}]
        </text>
      )}
    </g>
  );
}

export default React.memo(PerformanceDonut);
