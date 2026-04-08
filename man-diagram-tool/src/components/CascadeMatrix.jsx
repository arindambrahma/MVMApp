import React, { useState, useRef, useEffect } from 'react';

/**
 * CascadeMatrix renders one MDC matrix as a QFD "house" made of clean,
 * separated blocks matching the schematic diagram style.
 *
 * Visual structure (gaps between all blocks):
 *   ┌─────────────────────────────┐
 *   │     [Column Headers]        │   <- top block
 *   └─────────────────────────────┘
 *   ┌──────┐ ┌───────────┐ ┌─────┐
 *   │ Row  │ │ Relation- │ │Rat. │   <- middle row of blocks
 *   │ Hdrs │ │ ship      │ │     │
 *   └──────┘ └───────────┘ └─────┘
 *   ┌─────────────────────────────┐
 *   │  Margin type / Method       │   <- bottom block
 *   └─────────────────────────────┘
 */

/* Muted warm-gray palette matching the schematic image */
const BLOCK = {
  bg:       '#DCD6CE',   // main block fill
  bgLight:  '#E5E0D9',   // lighter variant
  bgMedium: '#CBC4BA',   // medium variant
  text:     '#3D3D3D',   // primary text
  textMuted:'#6B6560',   // secondary text
  gap:      4,           // px gap between blocks
  radius:   5,           // border-radius
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
          border: '1px solid #B5AFA7',
          borderRadius: 3,
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
      {value || <span style={{ color: '#B5AFA7', fontStyle: 'italic' }}>{placeholder || 'click to edit'}</span>}
    </span>
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
  const showNominalMarginStrip = matrixType === 'needs-requirements';
  const showRoof = matrixType === 'architecture-parameters';
  const showBottom = matrixType !== 'architecture-parameters';
  const mainRows = rows.filter(r => !r.isUncertainty);
  const uncertaintyRows = rows.filter(r => r.isUncertainty);
  const hasData = columns.length > 0 || rows.length > 0;

  const rowBlockLabel = matrixType === 'needs-requirements' ? 'Needs'
    : matrixType === 'requirements-architecture' ? 'Req.' : 'Arch. Elem.';
  const colBlockLabel = matrixType === 'needs-requirements' ? 'Requirements'
    : matrixType === 'requirements-architecture' ? 'Architectural Elements' : 'Parameters';

  const thinBorder = '1px solid rgba(0,0,0,0.06)';

  const renderDeleteBtn = (onClick) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Remove"
      style={{
        position: 'absolute', top: 2, right: 2,
        width: 14, height: 14, borderRadius: '50%',
        border: 'none', background: 'rgba(0,0,0,0.08)',
        color: '#6B6560', fontSize: 9, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1, opacity: 0,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
    >
      x
    </button>
  );

  // Render the empty-state house blocks
  if (!hasData) {
    return (
      <div className="cascade-matrix-wrapper">
        <div style={{ display: 'flex', flexDirection: 'column', gap: BLOCK.gap, maxWidth: 520, margin: '0 auto' }}>

          {/* Coupling roof (Matrix 3 only) */}
          {showRoof && (
            <div style={{
              display: 'flex', justifyContent: 'center',
            }}>
              <div style={{
                width: 0, height: 0,
                borderLeft: '120px solid transparent',
                borderRight: '120px solid transparent',
                borderBottom: `50px solid ${BLOCK.bgLight}`,
                borderRadius: '4px 4px 0 0',
                position: 'relative',
              }}>
                <span style={{
                  position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 10, fontWeight: 600, color: BLOCK.textMuted, whiteSpace: 'nowrap',
                }}>
                  Para. Coupling
                </span>
              </div>
            </div>
          )}

          {/* Column headers block */}
          <div style={{
            background: BLOCK.bg,
            borderRadius: BLOCK.radius,
            padding: '14px 16px',
            textAlign: 'center',
            fontSize: 12, fontWeight: 600, color: BLOCK.text,
          }}>
            {colBlockLabel}
          </div>

          {/* Middle row: Rows | Relationship | Rationale */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 56px', gap: BLOCK.gap }}>
            <div style={{
              background: BLOCK.bgLight,
              borderRadius: BLOCK.radius,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px 6px',
              fontSize: 11, fontWeight: 600, color: BLOCK.text, textAlign: 'center',
            }}>
              {rowBlockLabel}
            </div>
            <div style={{
              background: BLOCK.bgMedium,
              borderRadius: BLOCK.radius,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px 12px', minHeight: 100,
              fontSize: 13, fontWeight: 600, color: BLOCK.textMuted,
            }}>
              Relationship
            </div>
            <div style={{
              background: BLOCK.bgLight,
              borderRadius: BLOCK.radius,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '12px 4px',
              fontSize: 10, fontWeight: 600, color: BLOCK.textMuted,
            }}>
              Rat.
            </div>
          </div>

          {/* Uncertainty block */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 56px', gap: BLOCK.gap }}>
            <div style={{
              background: BLOCK.bgLight,
              borderRadius: BLOCK.radius,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 6px',
              fontSize: 8, fontWeight: 600, color: BLOCK.textMuted, textAlign: 'center',
            }}>
              {matrixType === 'requirements-architecture' ? 'Arch.\nUncert.' : matrixType === 'architecture-parameters' ? 'Para.\nUncert.' : 'Uncert.'}
            </div>
            <div style={{
              gridColumn: 'span 2',
              borderRadius: BLOCK.radius,
            }} />
          </div>

          {/* Bottom block: Margin type / Method */}
          {showBottom && (
            <div style={{
              background: BLOCK.bgLight,
              borderRadius: BLOCK.radius,
              padding: '10px 16px',
              textAlign: 'center',
              fontSize: 10, fontWeight: 600, color: BLOCK.textMuted,
            }}>
              Margin type / Method
            </div>
          )}

          <p style={{ textAlign: 'center', color: '#B5AFA7', fontSize: 11, marginTop: 8 }}>
            Use the left palette to add rows and columns.
          </p>
        </div>
      </div>
    );
  }

  // Render the populated house
  return (
    <div className="cascade-matrix-wrapper">
      <div style={{ display: 'flex', flexDirection: 'column', gap: BLOCK.gap }}>

        {/* Coupling roof (Matrix 3 only) */}
        {showRoof && columns.length > 0 && (
          <div style={{
            background: BLOCK.bgLight,
            borderRadius: BLOCK.radius,
            padding: '10px 16px',
            textAlign: 'center',
            fontSize: 10, fontWeight: 600, color: BLOCK.textMuted,
          }}>
            Parameter Coupling
          </div>
        )}

        {/* Column headers block */}
        <div style={{
          background: BLOCK.bg,
          borderRadius: BLOCK.radius,
          overflow: 'hidden',
        }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr>
                <td style={{
                  padding: '8px 10px',
                  fontSize: 9, fontWeight: 700, color: BLOCK.textMuted,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  minWidth: 180, borderRight: thinBorder,
                }}>
                  {colBlockLabel}
                </td>
                {columns.map((col) => (
                  <td key={col.id} style={{
                    padding: '8px 6px',
                    textAlign: 'center',
                    fontSize: 11, fontWeight: 700, color: BLOCK.text,
                    minWidth: 100, borderRight: thinBorder,
                    position: 'relative',
                  }}>
                    <EditableText
                      value={col.label}
                      onChange={(v) => onUpdateColumnLabel(col.id, v)}
                      placeholder="Column"
                      style={{ fontSize: 11, fontWeight: 700, color: BLOCK.text }}
                    />
                    {onDeleteColumn && (
                      <span style={{ position: 'absolute', top: 2, right: 2 }}>
                        {renderDeleteBtn(() => onDeleteColumn(col.id))}
                      </span>
                    )}
                  </td>
                ))}
                <td style={{
                  padding: '8px 6px',
                  textAlign: 'center',
                  fontSize: 9, fontWeight: 700, color: BLOCK.textMuted,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  minWidth: 90,
                }}>
                  Rationale
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Nominal / Margin / Specified strip (Matrix 1 only) */}
        {showNominalMarginStrip && (
          <div style={{
            background: BLOCK.bgLight,
            borderRadius: BLOCK.radius,
            overflow: 'hidden',
          }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {[
                  { key: 'nom', label: 'Nominal (A)', bg: '#EDE9E2', values: nominalValues, onChange: onUpdateNominal, textColor: BLOCK.text },
                  { key: 'mar', label: 'Margin (\u0394A)', bg: '#E8DFD0', values: marginValues, onChange: onUpdateMargin, textColor: '#7F6000' },
                  { key: 'spec', label: 'Specified (A+\u0394A)', bg: '#D8CFBF', values: specifiedValues, onChange: null, textColor: '#4A4540' },
                ].map((strip) => (
                  <tr key={strip.key}>
                    <td style={{
                      padding: '4px 10px',
                      fontSize: 10, fontWeight: 700, color: strip.textColor,
                      minWidth: 180, borderRight: thinBorder,
                      background: strip.bg,
                      borderBottom: thinBorder,
                    }}>
                      {strip.label}
                    </td>
                    {columns.map((col) => (
                      <td key={`${strip.key}_${col.id}`} style={{
                        padding: '4px 6px',
                        textAlign: 'center',
                        background: strip.bg,
                        borderRight: thinBorder,
                        borderBottom: thinBorder,
                        minWidth: 100,
                      }}>
                        {strip.onChange ? (
                          <EditableText
                            value={(strip.values || {})[col.id] || ''}
                            onChange={(v) => strip.onChange(col.id, v)}
                            placeholder="value"
                            style={{ fontSize: 10, color: strip.textColor }}
                          />
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 600, color: strip.textColor }}>
                            {(strip.values || {})[col.id] || '\u2014'}
                          </span>
                        )}
                      </td>
                    ))}
                    <td style={{ background: strip.bg, minWidth: 90, borderBottom: thinBorder }}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Middle section: Row headers | Relationship matrix | Rationale */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
          <div style={{
            background: BLOCK.bgLight,
            borderRadius: BLOCK.radius,
            overflow: 'hidden',
          }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {mainRows.map((row) => (
                  <tr key={row.id} className="cascade-row">
                    <td style={{
                      padding: '7px 10px',
                      fontSize: 11, fontWeight: 600, color: BLOCK.text,
                      minWidth: 180,
                      borderRight: thinBorder,
                      borderBottom: thinBorder,
                      background: BLOCK.bgLight,
                      position: 'relative',
                    }}>
                      <EditableText
                        value={row.label}
                        onChange={(v) => onUpdateRowLabel(row.id, v)}
                        placeholder="Row name"
                        style={{ fontSize: 11, fontWeight: 600, color: BLOCK.text }}
                      />
                      {onDeleteRow && renderDeleteBtn(() => onDeleteRow(row.id))}
                    </td>
                    {columns.map((col) => {
                      const key = `${row.id}__${col.id}`;
                      const active = relationships[key];
                      return (
                        <td
                          key={key}
                          onClick={() => onToggleCell(row.id, col.id)}
                          style={{
                            background: active ? BLOCK.bgMedium : BLOCK.bgLight,
                            borderRight: thinBorder,
                            borderBottom: thinBorder,
                            textAlign: 'center',
                            cursor: 'pointer',
                            fontSize: 15,
                            fontWeight: 700,
                            color: active ? BLOCK.text : 'transparent',
                            padding: '6px',
                            transition: 'background 0.12s',
                            userSelect: 'none',
                            minWidth: 100,
                          }}
                          title={active ? 'Click to remove' : 'Click to mark relationship'}
                        >
                          {active ? '\u25CF' : ''}
                        </td>
                      );
                    })}
                    <td style={{
                      padding: '4px 8px',
                      borderBottom: thinBorder,
                      background: BLOCK.bgLight,
                      textAlign: 'center',
                      minWidth: 90,
                    }}>
                      <EditableText
                        value={(rationale || {})[row.id] || ''}
                        onChange={(v) => onUpdateRationale(row.id, v)}
                        placeholder="rationale"
                        style={{ fontSize: 10, color: BLOCK.textMuted }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Uncertainty rows block */}
        {uncertaintyRows.length > 0 && (
          <div style={{
            background: '#E8DFD0',
            borderRadius: BLOCK.radius,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '4px 10px',
              fontSize: 8, fontWeight: 700, color: BLOCK.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.5,
              borderBottom: thinBorder,
            }}>
              Additional Uncertainties
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {uncertaintyRows.map((row) => (
                  <tr key={row.id} className="cascade-row">
                    <td style={{
                      padding: '6px 10px',
                      fontSize: 11, fontWeight: 600, color: BLOCK.textMuted,
                      fontStyle: 'italic',
                      minWidth: 180,
                      borderRight: thinBorder,
                      borderBottom: thinBorder,
                      position: 'relative',
                    }}>
                      <EditableText
                        value={row.label}
                        onChange={(v) => onUpdateRowLabel(row.id, v)}
                        placeholder="Uncertainty source"
                        style={{ fontSize: 11, fontWeight: 600, color: BLOCK.textMuted, fontStyle: 'italic' }}
                      />
                      {onDeleteRow && renderDeleteBtn(() => onDeleteRow(row.id))}
                    </td>
                    {columns.map((col) => {
                      const key = `${row.id}__${col.id}`;
                      const active = relationships[key];
                      return (
                        <td
                          key={key}
                          onClick={() => onToggleCell(row.id, col.id)}
                          style={{
                            background: active ? BLOCK.bgMedium : 'transparent',
                            borderRight: thinBorder,
                            borderBottom: thinBorder,
                            textAlign: 'center',
                            cursor: 'pointer',
                            fontSize: 15,
                            fontWeight: 700,
                            color: active ? '#7F6000' : 'transparent',
                            padding: '6px',
                            transition: 'background 0.12s',
                            userSelect: 'none',
                            minWidth: 100,
                          }}
                          title={active ? 'Click to remove' : 'Click to mark relationship'}
                        >
                          {active ? '\u25CF' : ''}
                        </td>
                      );
                    })}
                    <td style={{
                      padding: '4px 8px',
                      borderBottom: thinBorder,
                      textAlign: 'center',
                      minWidth: 90,
                    }}>
                      <EditableText
                        value={(rationale || {})[row.id] || ''}
                        onChange={(v) => onUpdateRationale(row.id, v)}
                        placeholder="rationale"
                        style={{ fontSize: 10, color: BLOCK.textMuted }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom block: Margin type / Method */}
        {showBottom && (
          <div style={{
            background: BLOCK.bgLight,
            borderRadius: BLOCK.radius,
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: 10, fontWeight: 600, color: BLOCK.textMuted,
          }}>
            Margin type / Method
          </div>
        )}
      </div>
    </div>
  );
}

export default CascadeMatrix;
