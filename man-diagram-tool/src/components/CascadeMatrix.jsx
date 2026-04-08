import React, { useState, useRef, useEffect } from 'react';

/**
 * CascadeMatrix renders one of the three MDC matrices in a QFD "house" layout.
 *
 * The visual structure matches the house-of-quality schematic:
 *   - Column headers block (top)
 *   - Row headers (left) | Relationship matrix (center) | Rationale (right)
 *   - Uncertainty rows (bottom of matrix, distinct styling)
 *   - Nominal/Margin/Specified strip (Matrix 1 only, below column headers)
 *   - Coupling roof triangle (Matrix 3 only, above column headers)
 */

const MATRIX_COLORS = {
  'needs-requirements': {
    headerBg: '#2F5496',
    headerText: '#FFFFFF',
    markBg: '#D6E4F0',
    markColor: '#2F5496',
    borderColor: '#B4C6E7',
    rowHeaderBg: '#E8EEF7',
    sectionBorder: '#2F5496',
    sectionLabel: '#2F5496',
    houseBg: '#F8FAFF',
  },
  'requirements-architecture': {
    headerBg: '#0D7377',
    headerText: '#FFFFFF',
    markBg: '#CCFBF1',
    markColor: '#0D9488',
    borderColor: '#99F6E4',
    rowHeaderBg: '#F0FDFA',
    sectionBorder: '#0D7377',
    sectionLabel: '#0D7377',
    houseBg: '#F8FFFD',
  },
  'architecture-parameters': {
    headerBg: '#92400E',
    headerText: '#FFFFFF',
    markBg: '#FEF3C7',
    markColor: '#D97706',
    borderColor: '#FDE68A',
    rowHeaderBg: '#FFFBEB',
    sectionBorder: '#92400E',
    sectionLabel: '#92400E',
    houseBg: '#FFFEF8',
  },
};

function EditableText({ value, onChange, style, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onChange(draft); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { setEditing(false); if (draft !== value) onChange(draft); }
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        style={{
          ...style,
          border: '1px solid #93C5FD',
          borderRadius: 4,
          padding: '2px 4px',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          background: '#FFFFFF',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      style={{ ...style, cursor: 'pointer', minWidth: 30, display: 'inline-block' }}
      title="Click to edit"
    >
      {value || <span style={{ color: '#CBD5E1', fontStyle: 'italic' }}>{placeholder || 'click to edit'}</span>}
    </span>
  );
}

function SectionLabel({ label, color, style }) {
  return (
    <div style={{
      fontSize: 9,
      fontWeight: 700,
      color: color || '#64748B',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      padding: '3px 6px',
      ...style,
    }}>
      {label}
    </div>
  );
}

function CascadeMatrix({
  matrixType,
  rows,
  columns,
  relationships,
  nominalValues,
  marginValues,
  specifiedValues,
  rationale,
  onToggleCell,
  onUpdateRowLabel,
  onUpdateColumnLabel,
  onUpdateNominal,
  onUpdateMargin,
  onUpdateRationale,
  onDeleteRow,
  onDeleteColumn,
}) {
  const colors = MATRIX_COLORS[matrixType] || MATRIX_COLORS['needs-requirements'];
  const showNominalMarginStrip = matrixType === 'needs-requirements';
  const showRoof = matrixType === 'architecture-parameters';
  const mainRows = rows.filter(r => !r.isUncertainty);
  const uncertaintyRows = rows.filter(r => r.isUncertainty);

  const cellBorder = `1px solid ${colors.borderColor}`;
  const sectionBorder = `2px solid ${colors.sectionBorder}`;

  const headerStyle = {
    background: colors.headerBg,
    color: colors.headerText,
    fontWeight: 700,
    fontSize: 11,
    padding: '8px 6px',
    textAlign: 'center',
    border: cellBorder,
    minWidth: 100,
    position: 'relative',
  };
  const rowHeaderStyle = {
    background: colors.rowHeaderBg,
    fontWeight: 600,
    fontSize: 11,
    padding: '6px 8px',
    textAlign: 'left',
    border: cellBorder,
    minWidth: 180,
    whiteSpace: 'nowrap',
  };

  const renderDeleteBtn = (onClick, title, light) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        position: 'absolute', top: 2, right: 2,
        width: 16, height: 16, borderRadius: '50%',
        border: 'none',
        background: light ? '#FEE2E2' : 'rgba(255,255,255,0.3)',
        color: light ? '#DC2626' : '#FFF',
        fontSize: 10, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1, opacity: 0.6,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
    >
      x
    </button>
  );

  const hasData = columns.length > 0 || rows.length > 0;

  return (
    <div className="cascade-matrix-wrapper">
      {/* House container */}
      <div className="cascade-house" style={{
        border: sectionBorder,
        borderRadius: 10,
        background: colors.houseBg,
        overflow: 'hidden',
      }}>

        {/* Coupling roof (Matrix 3 only) */}
        {showRoof && columns.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '8px 0 0',
            background: colors.houseBg,
          }}>
            <svg width={Math.max(200, columns.length * 100)} height={50} style={{ display: 'block' }}>
              <polygon
                points={`10,48 ${Math.max(200, columns.length * 100) / 2},4 ${Math.max(200, columns.length * 100) - 10},48`}
                fill="#FEF3C7"
                stroke={colors.sectionBorder}
                strokeWidth={1.5}
                opacity={0.6}
              />
              <text
                x={Math.max(200, columns.length * 100) / 2} y={34}
                textAnchor="middle" fontSize={10} fontWeight={600} fill={colors.sectionLabel}
              >
                Parameter Coupling
              </text>
            </svg>
          </div>
        )}

        {/* Top section label: columns */}
        <SectionLabel
          label={matrixType === 'needs-requirements' ? 'Requirements' : matrixType === 'requirements-architecture' ? 'Architectural Elements' : 'Parameters'}
          color={colors.sectionLabel}
          style={{ borderBottom: `1px solid ${colors.borderColor}`, padding: '6px 12px', background: `${colors.headerBg}11` }}
        />

        {/* Matrix content */}
        <div className="cascade-matrix-scroll">
          {hasData ? (
            <table className="cascade-matrix-table" style={{ borderCollapse: 'collapse' }}>
              <thead>
                {/* Column headers */}
                <tr>
                  <th style={{ ...headerStyle, background: colors.sectionBorder, minWidth: 180 }}>
                    <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
                      {matrixType === 'needs-requirements' ? 'Needs' : matrixType === 'requirements-architecture' ? 'Requirements' : 'Arch. Elements'}
                    </span>
                  </th>
                  {columns.map((col) => (
                    <th key={col.id} style={headerStyle}>
                      <EditableText
                        value={col.label}
                        onChange={(v) => onUpdateColumnLabel(col.id, v)}
                        placeholder="Column name"
                        style={{ color: colors.headerText, fontWeight: 700, fontSize: 11 }}
                      />
                      {onDeleteColumn && renderDeleteBtn(() => onDeleteColumn(col.id), 'Remove column')}
                    </th>
                  ))}
                  <th style={{ ...headerStyle, background: '#6D28D9', minWidth: 110 }}>Rationale</th>
                </tr>

                {/* Nominal / Margin / Specified strip (Matrix 1 only) */}
                {showNominalMarginStrip && (
                  <>
                    <tr>
                      <td style={{ ...rowHeaderStyle, background: '#E8EEF7', fontWeight: 700, fontSize: 10 }}>Nominal (A)</td>
                      {columns.map((col) => (
                        <td key={`nom_${col.id}`} style={{ background: '#E8EEF7', border: cellBorder, textAlign: 'center', padding: '4px 6px' }}>
                          <EditableText
                            value={(nominalValues || {})[col.id] || ''}
                            onChange={(v) => onUpdateNominal(col.id, v)}
                            placeholder="value"
                            style={{ fontSize: 10, color: '#334155' }}
                          />
                        </td>
                      ))}
                      <td style={{ background: '#F5F3FF', border: cellBorder }} rowSpan={3}></td>
                    </tr>
                    <tr>
                      <td style={{ ...rowHeaderStyle, background: '#FFF2CC', fontWeight: 700, fontSize: 10 }}>Margin (&Delta;A)</td>
                      {columns.map((col) => (
                        <td key={`mar_${col.id}`} style={{ background: '#FFF2CC', border: cellBorder, textAlign: 'center', padding: '4px 6px' }}>
                          <EditableText
                            value={(marginValues || {})[col.id] || ''}
                            onChange={(v) => onUpdateMargin(col.id, v)}
                            placeholder="value"
                            style={{ fontSize: 10, color: '#92400E' }}
                          />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={{ ...rowHeaderStyle, background: '#E2EFDA', fontWeight: 700, fontSize: 10 }}>Specified (A+&Delta;A)</td>
                      {columns.map((col) => {
                        const specified = (specifiedValues || {})[col.id] || '';
                        return (
                          <td key={`spec_${col.id}`} style={{ background: '#E2EFDA', border: cellBorder, textAlign: 'center', padding: '4px 6px', fontSize: 10, fontWeight: 600, color: '#166534' }}>
                            {specified || '\u2014'}
                          </td>
                        );
                      })}
                    </tr>
                  </>
                )}
              </thead>

              <tbody>
                {/* Main rows (relationship section) */}
                {mainRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...rowHeaderStyle, position: 'relative' }}>
                      <EditableText
                        value={row.label}
                        onChange={(v) => onUpdateRowLabel(row.id, v)}
                        placeholder="Row name"
                        style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}
                      />
                      {onDeleteRow && renderDeleteBtn(() => onDeleteRow(row.id), 'Remove row', true)}
                    </td>
                    {columns.map((col) => {
                      const key = `${row.id}__${col.id}`;
                      const active = relationships[key];
                      return (
                        <td
                          key={key}
                          onClick={() => onToggleCell(row.id, col.id)}
                          style={{
                            background: active ? colors.markBg : '#FAFBFC',
                            border: cellBorder,
                            textAlign: 'center',
                            cursor: 'pointer',
                            fontSize: 16,
                            fontWeight: 700,
                            color: active ? colors.markColor : '#E2E8F0',
                            padding: '6px',
                            transition: 'background 0.15s',
                            userSelect: 'none',
                          }}
                          title={active ? 'Click to remove' : 'Click to mark relationship'}
                        >
                          {active ? '\u25CF' : ''}
                        </td>
                      );
                    })}
                    <td style={{ background: '#F5F3FF', border: cellBorder, textAlign: 'center', padding: '4px 6px' }}>
                      <EditableText
                        value={(rationale || {})[row.id] || ''}
                        onChange={(v) => onUpdateRationale(row.id, v)}
                        placeholder="rationale"
                        style={{ fontSize: 10, color: '#6D28D9' }}
                      />
                    </td>
                  </tr>
                ))}

                {/* Uncertainty section */}
                {uncertaintyRows.length > 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} style={{
                      background: '#FEF3C7', border: cellBorder,
                      fontSize: 9, fontWeight: 700, color: '#92400E',
                      textTransform: 'uppercase', letterSpacing: 0.5,
                      padding: '5px 8px',
                      borderTop: `2px solid ${colors.sectionBorder}`,
                    }}>
                      Additional Uncertainties at This Level
                    </td>
                  </tr>
                )}

                {uncertaintyRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...rowHeaderStyle, background: '#FBE5D6', fontStyle: 'italic', position: 'relative' }}>
                      <EditableText
                        value={row.label}
                        onChange={(v) => onUpdateRowLabel(row.id, v)}
                        placeholder="Uncertainty source"
                        style={{ fontSize: 11, fontWeight: 600, color: '#92400E', fontStyle: 'italic' }}
                      />
                      {onDeleteRow && renderDeleteBtn(() => onDeleteRow(row.id), 'Remove row', true)}
                    </td>
                    {columns.map((col) => {
                      const key = `${row.id}__${col.id}`;
                      const active = relationships[key];
                      return (
                        <td
                          key={key}
                          onClick={() => onToggleCell(row.id, col.id)}
                          style={{
                            background: active ? '#FFF2CC' : '#FFFBEB',
                            border: cellBorder,
                            textAlign: 'center',
                            cursor: 'pointer',
                            fontSize: 16,
                            fontWeight: 700,
                            color: active ? '#7F6000' : '#FDE68A',
                            padding: '6px',
                            transition: 'background 0.15s',
                            userSelect: 'none',
                          }}
                          title={active ? 'Click to remove' : 'Click to mark relationship'}
                        >
                          {active ? '\u25CF' : ''}
                        </td>
                      );
                    })}
                    <td style={{ background: '#F5F3FF', border: cellBorder, textAlign: 'center', padding: '4px 6px' }}>
                      <EditableText
                        value={(rationale || {})[row.id] || ''}
                        onChange={(v) => onUpdateRationale(row.id, v)}
                        placeholder="rationale"
                        style={{ fontSize: 10, color: '#6D28D9' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Empty house - show labeled block placeholders */
            <div className="cascade-house-empty">
              <div className="cascade-house-grid">
                <div className="cascade-block cascade-block--rows" style={{ borderColor: colors.sectionBorder, color: colors.sectionLabel }}>
                  {matrixType === 'needs-requirements' ? 'Needs' : matrixType === 'requirements-architecture' ? 'Req.' : 'Arch. Elem.'}
                </div>
                <div className="cascade-block cascade-block--relationship" style={{ borderColor: colors.borderColor, color: colors.sectionLabel }}>
                  Relationship
                </div>
                <div className="cascade-block cascade-block--rationale">
                  Rat.
                </div>
              </div>
              {matrixType !== 'architecture-parameters' && (
                <div className="cascade-block cascade-block--bottom" style={{ borderColor: colors.borderColor, color: '#64748B' }}>
                  Margin type / Method
                </div>
              )}
              <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12, marginTop: 12 }}>
                Use the left palette to add rows and columns to this matrix.
              </p>
            </div>
          )}
        </div>

        {/* Bottom section: Margin type / Method strip (for Matrix 1 & 2) */}
        {hasData && matrixType !== 'architecture-parameters' && (
          <div style={{
            borderTop: `2px solid ${colors.sectionBorder}`,
            background: '#F1F5F9',
            padding: '6px 12px',
          }}>
            <SectionLabel label="Margin type / Method" color="#64748B" />
          </div>
        )}
      </div>
    </div>
  );
}

export default CascadeMatrix;
