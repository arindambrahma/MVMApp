import React from 'react';
import { NODE_META } from '../../constants/nodeTypes';

const meta = NODE_META.margin;
const W = 24; // half-width
const H = 20; // half-height
const INSET = 10; // horizontal inset for the flat top/bottom

function MarginHexagon({ node, selected, hasError }) {
  // Hexagon: flat top and bottom
  const pts = [
    `${-W + INSET},${-H}`,
    `${W - INSET},${-H}`,
    `${W},0`,
    `${W - INSET},${H}`,
    `${-W + INSET},${H}`,
    `${-W},0`,
  ].join(' ');

  const stroke = hasError ? '#DC2626' : (selected ? '#2563EB' : meta.stroke);
  const strokeWidth = hasError ? 3 : (selected ? 2.5 : meta.strokeWidth);

  return (
    <g>
      <polygon
        points={pts}
        fill={meta.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
        fill="#333"
      >
        {node.autoLabel || node.label}
      </text>
    </g>
  );
}

export default React.memo(MarginHexagon);
