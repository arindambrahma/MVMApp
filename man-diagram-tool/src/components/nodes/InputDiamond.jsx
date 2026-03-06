import React from 'react';
import { NODE_META } from '../../constants/nodeTypes';

const meta = NODE_META.input;
const S = 18; // half-diagonal of diamond

function InputDiamond({ node, selected, hasError }) {
  const fill = node.isOfInterest ? meta.fillInterest : meta.fill;
  const pts = `0,${-S} ${S},0 0,${S} ${-S},0`;
  const rawValue = String(node?.value ?? '').trim();
  const valueNum = Number(rawValue);
  const missingInputValue = node?.type === 'input' && (rawValue === '' || !Number.isFinite(valueNum));
  const showError = Boolean(hasError || missingInputValue);
  const stroke = showError ? '#DC2626' : (selected ? '#2563EB' : meta.stroke);
  const strokeWidth = showError ? 3 : (selected ? 2.5 : meta.strokeWidth);

  return (
    <g>
      <polygon
        points={pts}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text
        y={S + 14}
        textAnchor="middle"
        fontSize={11}
        fontFamily="system-ui, sans-serif"
        fill="#333"
      >
        {node.label}
      </text>
      {node.unit && (
        <text
          y={S + 26}
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

export default React.memo(InputDiamond);
