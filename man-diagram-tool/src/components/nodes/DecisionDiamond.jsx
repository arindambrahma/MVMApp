import React from 'react';
import { NODE_META } from '../../constants/nodeTypes';

const meta = NODE_META.decision;
const HW = 55; // half-width
const HH = 35; // half-height

function DecisionDiamond({ node, selected, hasError }) {
  const pts = `0,${-HH} ${HW},0 0,${HH} ${-HW},0`;
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
        fontSize={10}
        fontWeight={600}
        fontFamily="system-ui, sans-serif"
        fill="#333"
      >
        {node.autoLabel ? `${node.autoLabel}: ${node.label}` : node.label}
      </text>
    </g>
  );
}

export default React.memo(DecisionDiamond);
