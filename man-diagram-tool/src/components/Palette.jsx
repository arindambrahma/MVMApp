import React from 'react';
import { NODE_TYPES, NODE_META } from '../constants/nodeTypes';

// Small SVG icon previews for each node type
function PaletteIcon({ type }) {
  const size = 40;
  const cx = size / 2;
  const cy = size / 2;

  switch (type) {
    case 'input': {
      const S = 12;
      return (
        <svg width={size} height={size}>
          <polygon
            points={`${cx},${cy - S} ${cx + S},${cy} ${cx},${cy + S} ${cx - S},${cy}`}
            fill="#FFFFFF"
            stroke="#000"
            strokeWidth={1.5}
          />
        </svg>
      );
    }
    case 'calc': {
      return (
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={14} fill="#FFFFFF" stroke="#000" strokeWidth={1.5} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="#333">1</text>
        </svg>
      );
    }
    case 'calcFunction': {
      return (
        <svg width={size} height={size}>
          <rect x={6} y={9} width={28} height={22} rx={4} fill="#FFFBEB" stroke="#92400E" strokeWidth={1.5} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="#92400E">f()</text>
        </svg>
      );
    }
    case 'probe': {
      return (
        <svg width={size} height={size}>
          <rect x={6} y={9} width={28} height={22} rx={4} fill="#FDE68A" stroke="#92400E" strokeWidth={1.5} />
          <text x={cx} y={15} textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight={700} fill="#78350F">Probe</text>
          <text x={cx} y={24} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={800} fill="#1E293B">12.4</text>
        </svg>
      );
    }
    case 'decision': {
      const hw = 18, hh = 12;
      return (
        <svg width={size} height={size}>
          <polygon
            points={`${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`}
            fill="#DBEAFE"
            stroke="#000"
            strokeWidth={1.5}
          />
        </svg>
      );
    }
    case 'margin': {
      const W = 14, H = 10, IN = 6;
      const pts = [
        `${cx - W + IN},${cy - H}`,
        `${cx + W - IN},${cy - H}`,
        `${cx + W},${cy}`,
        `${cx + W - IN},${cy + H}`,
        `${cx - W + IN},${cy + H}`,
        `${cx - W},${cy}`,
      ].join(' ');
      return (
        <svg width={size} height={size}>
          <polygon points={pts} fill="#FFFFFF" stroke="#000" strokeWidth={1.5} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#333">E</text>
        </svg>
      );
    }
    case 'performance': {
      return (
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={10} fill="#fff" stroke="#DC2626" strokeWidth={4} />
        </svg>
      );
    }
    case 'cluster': {
      return (
        <svg width={size} height={size}>
          <rect
            x={6}
            y={9}
            width={28}
            height={22}
            rx={5}
            fill="#E5E7EB"
            fillOpacity={0.55}
            stroke="#64748B"
            strokeWidth={1.2}
            strokeDasharray="4 2"
          />
          <text x={cx} y={20} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#475569">SUB</text>
        </svg>
      );
    }
    default:
      return null;
  }
}

function WorkspaceIcon({ type, routePreference }) {
  const size = 24;
  if (type === 'autoArrange') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="2" fill="#E2E8F0" stroke="#64748B" strokeWidth="1.2" />
        <rect x="14" y="14" width="7" height="7" rx="2" fill="#E2E8F0" stroke="#64748B" strokeWidth="1.2" />
        <path d="M 10 7 H 14 M 12.5 4.8 L 14.8 7 L 12.5 9.2" fill="none" stroke="#475569" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 14 17 H 10 M 11.5 14.8 L 9.2 17 L 11.5 19.2" fill="none" stroke="#475569" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === 'route') {
    if (routePreference === 'vertical') {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M 7 4 V 20 M 17 4 V 20" fill="none" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 5.2 6.2 L 7 4 L 8.8 6.2 M 15.2 17.8 L 17 20 L 18.8 17.8" fill="none" stroke="#0F766E" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M 4 7 H 20 M 4 17 H 20" fill="none" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M 6.2 5.2 L 4 7 L 6.2 8.8 M 17.8 15.2 L 20 17 L 17.8 18.8" fill="none" stroke="#0369A1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === 'jumps') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M 3 14 H 9 M 15 14 H 21" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M 9 14 A 3 3 0 0 1 15 14" fill="none" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function Palette({
  onAddNode,
  onAutoArrange,
  onAddCluster,
  routePreference,
  onChangeRoutePreference,
  arrowJumpsEnabled,
  onToggleArrowJumps,
  frontendVersion,
  backendVersion,
}) {
  const types = [
    NODE_TYPES.INPUT,
    NODE_TYPES.CALC,
    NODE_TYPES.CALC_FUNCTION,
    NODE_TYPES.PROBE,
    NODE_TYPES.DECISION,
    NODE_TYPES.MARGIN,
    NODE_TYPES.PERFORMANCE,
  ];

  return (
    <div style={{
      width: 200,
      background: '#F1F5F9',
      borderRight: '1px solid #E2E8F0',
      padding: '16px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      overflowY: 'auto',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: '1px solid #E2E8F0',
      }}>
        Elements
      </div>

      {types.map(type => {
        const meta = NODE_META[type];
        return (
          <button
            key={type}
            onClick={() => onAddNode(type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
              textAlign: 'left',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#EFF6FF';
              e.currentTarget.style.borderColor = '#93C5FD';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.borderColor = '#E2E8F0';
            }}
          >
            <PaletteIcon type={type} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
              {meta.label}
            </span>
          </button>
        );
      })}

      <button
        key="cluster"
        onClick={onAddCluster}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
          textAlign: 'left',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#EFF6FF';
          e.currentTarget.style.borderColor = '#93C5FD';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = '#FFFFFF';
          e.currentTarget.style.borderColor = '#E2E8F0';
        }}
      >
        <PaletteIcon type="cluster" />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
          Subsystem Box
        </span>
      </button>

      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 12,
        marginBottom: 8,
        paddingTop: 10,
        borderTop: '1px solid #E2E8F0',
      }}>
        Workspace
      </div>

      {[
        { label: 'Auto Arrange', onClick: onAutoArrange },
        {
          label: `Change to ${routePreference === 'vertical' ? 'Horizontal' : 'Vertical'}`,
          onClick: () => onChangeRoutePreference(routePreference === 'horizontal' ? 'vertical' : 'horizontal'),
        },
        {
          label: `Arrow Jumps: ${arrowJumpsEnabled ? 'On' : 'Off'}`,
          onClick: onToggleArrowJumps,
        },
      ].map((item, idx) => (
        <button
          key={item.label}
          onClick={item.onClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 4,
            padding: '8px 10px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            color: '#334155',
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#EFF6FF';
            e.currentTarget.style.borderColor = '#93C5FD';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = '#E2E8F0';
          }}
        >
          <WorkspaceIcon
            type={idx === 0 ? 'autoArrange' : (idx === 1 ? 'route' : 'jumps')}
            routePreference={idx === 0 || idx === 2
              ? routePreference
              : (routePreference === 'horizontal' ? 'vertical' : 'horizontal')}
          />
          {item.label}
        </button>
      ))}

      <div style={{
        marginTop: 'auto',
        paddingTop: 12,
        borderTop: '1px solid #E2E8F0',
        fontSize: 10,
        color: '#94A3B8',
        lineHeight: 1.5,
      }}>
        Click to add to canvas.<br />
        Drag nodes to position.<br />
        Use the orange connector dot to connect.<br />
        Delete key to remove selected.
        <div style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid #E2E8F0',
          fontFamily: 'monospace',
          fontSize: 9,
          color: '#CBD5E1',
          lineHeight: 1.6,
        }}>
          <span style={{ color: backendVersion ? '#86EFAC' : '#FCA5A5' }}>●</span>
          {' '}UI: {frontendVersion || '—'}<br />
          <span style={{ color: backendVersion ? '#86EFAC' : '#FCA5A5' }}>●</span>
          {' '}API: {backendVersion || 'offline'}
        </div>
      </div>

    </div>
  );
}

export default Palette;
