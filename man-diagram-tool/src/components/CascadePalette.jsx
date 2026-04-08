import React from 'react';

const TAB_ELEMENT_TYPES = {
  'needs-requirements': {
    rows: [
      { type: 'need', label: 'Need', color: '#2F5496' },
    ],
    columns: [
      { type: 'requirement', label: 'Requirement', color: '#2F5496' },
    ],
    extras: [
      { type: 'uncertainty', label: 'Uncertainty Source', color: '#D97706' },
    ],
  },
  'requirements-architecture': {
    rows: [],   // requirements cascade automatically
    columns: [
      { type: 'archElement', label: 'Arch. Element', color: '#0D9488' },
    ],
    extras: [
      { type: 'uncertainty', label: 'Uncertainty Source', color: '#D97706' },
    ],
  },
  'architecture-parameters': {
    rows: [],   // arch elements cascade automatically
    columns: [
      { type: 'parameter', label: 'Parameter', color: '#D97706' },
    ],
    extras: [
      { type: 'uncertainty', label: 'Uncertainty Source', color: '#D97706' },
    ],
  },
};

function ElementIcon({ type }) {
  const size = 32;
  const cx = size / 2;
  const cy = size / 2;
  switch (type) {
    case 'need':
      return (
        <svg width={size} height={size}>
          <rect x={4} y={6} width={24} height={20} rx={4} fill="#DBEAFE" stroke="#2F5496" strokeWidth={1.2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight={700} fill="#2F5496">N</text>
        </svg>
      );
    case 'requirement':
      return (
        <svg width={size} height={size}>
          <rect x={4} y={6} width={24} height={20} rx={4} fill="#E0E7FF" stroke="#2F5496" strokeWidth={1.2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight={700} fill="#2F5496">R</text>
        </svg>
      );
    case 'archElement':
      return (
        <svg width={size} height={size}>
          <rect x={4} y={6} width={24} height={20} rx={4} fill="#CCFBF1" stroke="#0D9488" strokeWidth={1.2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight={700} fill="#0D9488">AE</text>
        </svg>
      );
    case 'parameter':
      return (
        <svg width={size} height={size}>
          <rect x={4} y={6} width={24} height={20} rx={4} fill="#FEF3C7" stroke="#D97706" strokeWidth={1.2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight={700} fill="#D97706">P</text>
        </svg>
      );
    case 'uncertainty':
      return (
        <svg width={size} height={size}>
          <rect x={4} y={6} width={24} height={20} rx={4} fill="#FDE68A" stroke="#92400E" strokeWidth={1.2} strokeDasharray="3 2" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight={700} fill="#92400E">+</text>
        </svg>
      );
    default:
      return null;
  }
}

function CascadePalette({
  activeTab,
  onAddRow,
  onAddColumn,
  onAddUncertainty,
}) {
  const config = TAB_ELEMENT_TYPES[activeTab] || { rows: [], columns: [], extras: [] };

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
        Add Elements
      </div>

      {config.rows.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4, marginTop: 4 }}>
            Rows
          </div>
          {config.rows.map((item) => (
            <PaletteButton key={item.type} icon={<ElementIcon type={item.type} />} label={item.label} onClick={() => onAddRow(item.type)} />
          ))}
        </>
      )}

      {config.columns.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4, marginTop: 8 }}>
            Columns
          </div>
          {config.columns.map((item) => (
            <PaletteButton key={item.type} icon={<ElementIcon type={item.type} />} label={item.label} onClick={() => onAddColumn(item.type)} />
          ))}
        </>
      )}

      {config.extras.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4, marginTop: 8 }}>
            Additional
          </div>
          {config.extras.map((item) => (
            <PaletteButton key={`extra_${item.type}`} icon={<ElementIcon type={item.type} />} label={item.label} onClick={() => onAddUncertainty()} />
          ))}
        </>
      )}

      {config.rows.length === 0 && (
        <div style={{
          fontSize: 11, color: '#94A3B8', lineHeight: 1.5, marginTop: 4,
          padding: '8px 10px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #DBEAFE',
        }}>
          Row items cascade automatically from the previous matrix.
        </div>
      )}

      <div style={{
        marginTop: 'auto',
        paddingTop: 12,
        borderTop: '1px solid #E2E8F0',
        fontSize: 10,
        color: '#94A3B8',
        lineHeight: 1.5,
      }}>
        Matrix 1: Deliberate/Inadvertent links.<br />
        Matrix 2: Margin characteristic enum.<br />
        Matrix 3: Amplification number (&gt;=1).<br />
        Click headers to edit labels.<br />
        Use Forward/Back to navigate matrices.
      </div>
    </div>
  );
}

function PaletteButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
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
      {icon}
      <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{label}</span>
    </button>
  );
}

export default CascadePalette;
