import React from 'react';
import { NODE_META } from '../../constants/nodeTypes';
import { formatProbeValue, getProbeBoxSize } from '../../utils/probeVisual';

const meta = NODE_META.probe;

function trimLabel(s, max = 18) {
  const str = String(s || '');
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}...`;
}

function ProbeRect({ node, selected, hasError, probeDisplay }) {
  const rawValue = probeDisplay?.value;
  const valueTextRaw = Number.isFinite(rawValue)
    ? formatProbeValue(Number(rawValue))
    : (probeDisplay?.valueText || 'Connect input');
  const sourceTextRaw = probeDisplay?.source ? String(probeDisplay.source) : '';
  const box = getProbeBoxSize({
    label: node.label || 'Probe',
    valueText: valueTextRaw,
    source: sourceTextRaw,
  });
  const w = box.w;
  const h = box.h;
  const x = -w / 2;
  const y = -h / 2;
  const stroke = hasError ? '#DC2626' : (selected ? '#2563EB' : meta.stroke);
  const strokeWidth = hasError ? 3 : (selected ? 2.5 : meta.strokeWidth);
  const valueText = trimLabel(valueTextRaw, 30);
  const sourceText = sourceTextRaw ? trimLabel(sourceTextRaw, 34) : '';

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={7}
        fill={meta.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text
        x={0}
        y={y + 13}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
        fill="#78350F"
      >
        {trimLabel(node.label || 'Probe')}
      </text>
      <text
        x={0}
        y={3}
        textAnchor="middle"
        fontSize={14}
        fontWeight={800}
        fontFamily="'Consolas', 'Monaco', monospace"
        fill="#1E293B"
      >
        {valueText}
      </text>
      {sourceText && (
        <text
          x={0}
          y={y + h - 7}
          textAnchor="middle"
          fontSize={9}
          fontFamily="'Consolas', 'Monaco', monospace"
          fill="#334155"
        >
          {sourceText}
        </text>
      )}
    </g>
  );
}

export default React.memo(ProbeRect);
