import React, { useState } from 'react';
import InputDiamond from './InputDiamond';
import CalcCircle from './CalcCircle';
import CalcFunctionBox from './CalcFunctionBox';
import ProbeRect from './ProbeRect';
import DecisionDiamond from './DecisionDiamond';
import MarginHexagon from './MarginHexagon';
import PerformanceDonut from './PerformanceDonut';

const SHAPE_MAP = {
  input: InputDiamond,
  calc: CalcCircle,
  calcFunction: CalcFunctionBox,
  probe: ProbeRect,
  decision: DecisionDiamond,
  margin: MarginHexagon,
  performance: PerformanceDonut,
};

function NodeRenderer({
  node,
  selected,
  hasError,
  connectedInPorts = [],
  connectedOutPorts = [],
  probeDisplay,
  routePreference = 'horizontal',
  connecting,
  onMouseDown,
  onClick,
  onStartConnect,
}) {
  const [hovered, setHovered] = useState(false);
  const ShapeComponent = SHAPE_MAP[node.type];
  if (!ShapeComponent) return null;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: connecting ? 'crosshair' : 'grab' }}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Invisible hover capture area so tiny nodes (especially inputs) keep hover
          while moving toward the connector target above. */}
      {!connecting && (
        <ellipse
          cx={0}
          cy={-8}
          rx={30}
          ry={34}
          fill="rgba(0,0,0,0.001)"
          pointerEvents="all"
        />
      )}

      <ShapeComponent
        node={node}
        selected={selected}
        hasError={hasError}
        connectedInPorts={connectedInPorts}
        connectedOutPorts={connectedOutPorts}
        probeDisplay={probeDisplay}
        routePreference={routePreference}
        connecting={connecting}
        onStartConnect={onStartConnect}
        onFinishConnect={(toPort) => {
          if (!connecting) return;
          onClick({ stopPropagation: () => {} }, node.id, toPort);
        }}
      />

      {/* Small connect button - appears only on hover */}
      {!connecting && hovered && node.type !== 'calcFunction' && (
        <g transform="translate(0, -24)">
          <circle
            cx={0}
            cy={0}
            r={4.2}
            fill="#FFFFFF"
            stroke="#F97316"
            strokeWidth={1.2}
            style={{ cursor: 'crosshair' }}
            onClick={(e) => {
              e.stopPropagation();
              onStartConnect(node.id);
            }}
          />
          <circle
            cx={0}
            cy={0}
            r={1.4}
            fill="#FB923C"
            stroke="#fff"
            strokeWidth={0.5}
            style={{ pointerEvents: 'none' }}
          />
          <path
            d="M -2.4 0 L 2.4 0 M 0 -2.4 L 0 2.4"
            stroke="#EA580C"
            strokeWidth={0.7}
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
          <circle
            cx={0}
            cy={0}
            r={7.2}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onClick={(e) => {
              e.stopPropagation();
              onStartConnect(node.id);
            }}
          />
        </g>
      )}
    </g>
  );
}

export default React.memo(NodeRenderer);
