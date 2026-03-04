import React from 'react';
import { NODE_META } from '../../constants/nodeTypes';
import { sanitize } from '../../utils/helpers';
import { parseCalculationFunction } from '../../utils/calcFunctionParser';

const R = 22;

function CalcCircle({ node, selected, hasError }) {
  const meta = NODE_META[node.type] || NODE_META.calc;
  const label = String(node.label || '').trim();
  const defaultPrefix = node.type === 'calcFunction' ? 'CF' : 'F';
  const fLabel = label.match(new RegExp(`^${defaultPrefix}\\d+$`, 'i')) ? label.toUpperCase() : '';
  const badge = fLabel || node.autoLabel || (node.stepNumber ? `${defaultPrefix}${node.stepNumber}` : (node.type === 'calcFunction' ? 'f()' : ''));
  const showLabel = label && label !== badge;
  const stroke = hasError ? '#DC2626' : (selected ? '#2563EB' : meta.stroke);
  const strokeWidth = hasError ? 3 : (selected ? 2.5 : meta.strokeWidth);
  const parsedFn = node.type === 'calcFunction'
    ? parseCalculationFunction(node.functionCode || '')
    : null;
  const inputNames = parsedFn?.valid ? parsedFn.params : [];
  const maxShownInputs = 5;
  const shownInputs = inputNames.slice(0, maxShownInputs);
  const hiddenInputs = Math.max(0, inputNames.length - maxShownInputs);
  const outputName = sanitize(node.label || '');

  return (
    <g>
      <circle
        r={R}
        fill={meta.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={16}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
        fill="#333"
      >
        {badge || (node.type === 'calcFunction' ? 'f()' : '')}
      </text>
      {showLabel && (
        <text
          y={R + 14}
          textAnchor="middle"
          fontSize={11}
          fontFamily="system-ui, sans-serif"
          fill="#333"
        >
          {node.label}
        </text>
      )}

      {node.type === 'calcFunction' && (
        <>
          {/* Expected function inputs (left side) */}
          {shownInputs.map((p, idx) => (
            <text
              key={`in-${p}-${idx}`}
              x={-R - 10}
              y={-14 + idx * 7}
              textAnchor="end"
              fontSize={9}
              fontFamily="'Consolas', 'Monaco', monospace"
              fill="#92400E"
            >
              {p}
            </text>
          ))}
          {hiddenInputs > 0 && (
            <text
              x={-R - 10}
              y={-14 + maxShownInputs * 7}
              textAnchor="end"
              fontSize={9}
              fontFamily="'Consolas', 'Monaco', monospace"
              fill="#92400E"
            >
              +{hiddenInputs}
            </text>
          )}

          {/* Output variable (right side) */}
          <text
            x={R + 10}
            y={2}
            textAnchor="start"
            fontSize={9}
            fontFamily="'Consolas', 'Monaco', monospace"
            fill="#92400E"
          >
            {outputName || 'output'}
          </text>
        </>
      )}
    </g>
  );
}

export default React.memo(CalcCircle);
