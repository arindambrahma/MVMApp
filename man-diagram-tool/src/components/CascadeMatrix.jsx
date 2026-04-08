import React, { useState, useRef, useEffect } from 'react';

/**
 * CascadeMatrix — renders one MDC matrix as a QFD "house" of blocks.
 *
 * The grid layout is identical for empty and populated states:
 *
 *              ┌─Col Headers──┐
 *   ┌──────┐  ┌──────────────┐  ┌─────┐
 *   │ Row  │  │ Relationship │  │Rat. │
 *   │ Hdrs │  │              │  │     │
 *   └──────┘  └──────────────┘  └─────┘
 *   ┌──────┐  ┌──────────────┐
 *   │Uncert│  │ Uncert Rels  │
 *   └──────┘  └──────────────┘
 *              ┌──────────────┐
 *              │Margin Method │
 *              └──────────────┘
 */

const PALETTE = {
  'needs-requirements': {
    accent:    '#6366F1',   // indigo-500
    accentDk:  '#4F46E5',   // indigo-600
    blockBg:   '#EEF2FF',   // indigo-50
    blockBg2:  '#E0E7FF',   // indigo-100
    cellActive:'#C7D2FE',   // indigo-200
    markColor: '#4338CA',   // indigo-700
    headerBg:  '#6366F1',
    headerText:'#FFFFFF',
    uncertBg:  '#FEF3C7',   // amber-100
    uncertMark:'#B45309',
  },
  'requirements-architecture': {
    accent:    '#14B8A6',   // teal-500
    accentDk:  '#0D9488',   // teal-600
    blockBg:   '#F0FDFA',   // teal-50
    blockBg2:  '#CCFBF1',   // teal-100
    cellActive:'#99F6E4',   // teal-200
    markColor: '#0F766E',   // teal-700
    headerBg:  '#14B8A6',
    headerText:'#FFFFFF',
    uncertBg:  '#FEF3C7',
    uncertMark:'#B45309',
  },
  'architecture-parameters': {
    accent:    '#F59E0B',   // amber-500
    accentDk:  '#D97706',   // amber-600
    blockBg:   '#FFFBEB',   // amber-50
    blockBg2:  '#FEF3C7',   // amber-100
    cellActive:'#FDE68A',   // amber-200
    markColor: '#92400E',   // amber-800
    headerBg:  '#F59E0B',
    headerText:'#FFFFFF',
    uncertBg:  '#FFF7ED',   // orange-50
    uncertMark:'#C2410C',
  },
};

const GAP = 5;
const R = 6;

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
        ref={inputRef} type="text" value={draft} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onChange(draft); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { setEditing(false); if (draft !== value) onChange(draft); }
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        style={{
          ...style, border: '1px solid #CBD5E1', borderRadius: 3,
          padding: '2px 4px', fontSize: 'inherit', fontWeight: 'inherit',
          background: '#FFF', outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <span onClick={() => { setDraft(value); setEditing(true); }}
      style={{ ...style, cursor: 'pointer', minWidth: 30, display: 'inline-block' }}
      title="Click to edit"
    >
      {value || <span style={{ color: '#CBD5E1', fontStyle: 'italic' }}>{placeholder || 'click to edit'}</span>}
    </span>
  );
}

function Block({ bg, children, style, radius }) {
  return (
    <div style={{
      background: bg || '#F8FAFC',
      borderRadius: radius ?? R,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  );
}

function CascadeMatrix({
  matrixType, rows, columns, relationships,
  nominalValues, marginValues, specifiedValues, rationale,
  onToggleCell, onUpdateRowLabel, onUpdateColumnLabel,
  onUpdateNominal, onUpdateMargin, onUpdateRationale,
  onDeleteRow, onDeleteColumn,
}) {
  const P = PALETTE[matrixType] || PALETTE['needs-requirements'];
  const showNMS = matrixType === 'needs-requirements';
  const showRoof = matrixType === 'architecture-parameters';
  const showBottom = matrixType !== 'architecture-parameters';
  const mainRows = rows.filter(r => !r.isUncertainty);
  const uncRows = rows.filter(r => r.isUncertainty);

  const rowLabel = matrixType === 'needs-requirements' ? 'Needs'
    : matrixType === 'requirements-architecture' ? 'Req.' : 'Arch. Elem.';
  const colLabel = matrixType === 'needs-requirements' ? 'Requirements'
    : matrixType === 'requirements-architecture' ? 'Architectural Elements' : 'Parameters';
  const uncLabel = matrixType === 'requirements-architecture' ? 'Arch. Uncert.'
    : matrixType === 'architecture-parameters' ? 'Para. Uncert.' : 'Uncert.';

  const delBtn = (onClick) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="cascade-del-btn" title="Remove"
      style={{
        position: 'absolute', top: 3, right: 3,
        width: 16, height: 16, borderRadius: '50%',
        border: 'none', background: 'rgba(0,0,0,0.06)',
        color: '#94A3B8', fontSize: 9, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1, opacity: 0, transition: 'opacity 0.15s',
      }}
    >x</button>
  );

  // ── The house grid is the same whether empty or populated ──
  // Columns: [rowHeaders 160px] [gap] [relationship 1fr] [gap] [rationale 90px]
  const grid = {
    display: 'grid',
    gridTemplateColumns: '160px 1fr 90px',
    gap: GAP,
  };

  const emptyPlaceholder = (label, bg, style) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 600, color: P.accentDk,
      opacity: 0.5, textAlign: 'center', whiteSpace: 'pre-line',
      padding: 12, ...style,
    }}>{label}</div>
  );

  // ── Render a list of items as stacked rows inside a block ──
  const renderRows = (items, blockBg, isUncert) => {
    if (items.length === 0) return emptyPlaceholder(isUncert ? uncLabel : rowLabel);
    return items.map((row, i) => (
      <div key={row.id} className="cascade-row" style={{
        padding: '7px 10px', position: 'relative',
        borderBottom: i < items.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
        fontSize: 11, fontWeight: 600,
        color: isUncert ? '#92400E' : '#1E293B',
        fontStyle: isUncert ? 'italic' : 'normal',
      }}>
        <EditableText
          value={row.label}
          onChange={(v) => onUpdateRowLabel(row.id, v)}
          placeholder={isUncert ? 'Uncertainty source' : 'Row name'}
          style={{ fontSize: 11, fontWeight: 600, color: isUncert ? '#92400E' : '#1E293B', fontStyle: isUncert ? 'italic' : 'normal' }}
        />
        {onDeleteRow && delBtn(() => onDeleteRow(row.id))}
      </div>
    ));
  };

  // ── Render the relationship cell grid ──
  const renderRelCells = (rowItems, isUncert) => {
    if (rowItems.length === 0 || columns.length === 0) {
      return emptyPlaceholder('Relationship', undefined, { minHeight: isUncert ? 40 : 80 });
    }
    return (
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {rowItems.map((row, ri) => (
            <tr key={row.id}>
              {columns.map((col) => {
                const k = `${row.id}__${col.id}`;
                const on = relationships[k];
                return (
                  <td key={k} onClick={() => onToggleCell(row.id, col.id)}
                    style={{
                      background: on ? (isUncert ? P.uncertBg : P.cellActive) : 'transparent',
                      textAlign: 'center', cursor: 'pointer',
                      fontSize: 15, fontWeight: 700,
                      color: on ? (isUncert ? P.uncertMark : P.markColor) : 'transparent',
                      padding: '7px 6px',
                      borderBottom: ri < rowItems.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                      borderRight: '1px solid rgba(0,0,0,0.04)',
                      transition: 'background 0.1s', userSelect: 'none',
                    }}
                    title={on ? 'Click to remove' : 'Click to mark relationship'}
                  >{on ? '\u25CF' : ''}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ── Render rationale column ──
  const renderRationale = (rowItems) => {
    if (rowItems.length === 0) return emptyPlaceholder('Rat.');
    return rowItems.map((row, i) => (
      <div key={row.id} style={{
        padding: '7px 6px', textAlign: 'center',
        borderBottom: i < rowItems.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
      }}>
        <EditableText
          value={(rationale || {})[row.id] || ''}
          onChange={(v) => onUpdateRationale(row.id, v)}
          placeholder="—"
          style={{ fontSize: 10, color: '#64748B' }}
        />
      </div>
    ));
  };

  return (
    <div className="cascade-matrix-wrapper">
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>

        {/* ── Coupling roof (Matrix 3) ── */}
        {showRoof && (
          <div style={grid}>
            <div />
            <Block bg={P.blockBg2} style={{ padding: '8px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: P.accentDk }}>Parameter Coupling</span>
            </Block>
            <div />
          </div>
        )}

        {/* ── Column headers — center only ── */}
        <div style={grid}>
          <div />
          <Block bg={P.headerBg}>
            {columns.length > 0 ? (
              <div style={{ display: 'flex' }}>
                {columns.map((col, i) => (
                  <div key={col.id} className="cascade-row" style={{
                    flex: 1, padding: '9px 8px', textAlign: 'center',
                    borderRight: i < columns.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                    position: 'relative',
                  }}>
                    <EditableText
                      value={col.label} onChange={(v) => onUpdateColumnLabel(col.id, v)}
                      placeholder="Column" style={{ fontSize: 11, fontWeight: 700, color: P.headerText }}
                    />
                    {onDeleteColumn && delBtn(() => onDeleteColumn(col.id))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: P.headerText, opacity: 0.6 }}>
                {colLabel}
              </div>
            )}
          </Block>
          <div />
        </div>

        {/* ── Nominal / Margin / Specified strip (Matrix 1 only) ── */}
        {showNMS && columns.length > 0 && (
          <div style={grid}>
            <Block bg={P.blockBg}>
              {[
                { k: 'nom', label: 'Nominal (A)' },
                { k: 'mar', label: 'Margin (\u0394A)' },
                { k: 'spec', label: 'Specified (A+\u0394A)' },
              ].map((s, i) => (
                <div key={s.k} style={{
                  padding: '5px 10px', fontSize: 10, fontWeight: 700, color: P.accentDk,
                  borderBottom: i < 2 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                }}>{s.label}</div>
              ))}
            </Block>
            <Block bg={P.blockBg2}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {[
                    { k: 'nom', vals: nominalValues, fn: onUpdateNominal },
                    { k: 'mar', vals: marginValues, fn: onUpdateMargin },
                    { k: 'spec', vals: specifiedValues, fn: null },
                  ].map((s, si) => (
                    <tr key={s.k}>
                      {columns.map((col) => (
                        <td key={`${s.k}_${col.id}`} style={{
                          padding: '5px 6px', textAlign: 'center',
                          borderBottom: si < 2 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                          borderRight: '1px solid rgba(0,0,0,0.04)',
                        }}>
                          {s.fn ? (
                            <EditableText
                              value={(s.vals || {})[col.id] || ''} onChange={(v) => s.fn(col.id, v)}
                              placeholder="value" style={{ fontSize: 10, color: '#334155' }}
                            />
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 600, color: P.accentDk }}>
                              {(s.vals || {})[col.id] || '\u2014'}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
            <div />
          </div>
        )}

        {/* ── Main rows: Row headers | Relationship | Rationale ── */}
        <div style={grid}>
          <Block bg={P.blockBg}>
            {renderRows(mainRows, P.blockBg, false)}
          </Block>
          <Block bg={P.blockBg2}>
            {renderRelCells(mainRows, false)}
          </Block>
          <Block bg={P.blockBg}>
            {renderRationale(mainRows)}
          </Block>
        </div>

        {/* ── Uncertainty rows: Labels | Relationship cells ── */}
        {(uncRows.length > 0 || true) && (
          <div style={grid}>
            <Block bg={P.uncertBg}>
              {uncRows.length > 0
                ? renderRows(uncRows, P.uncertBg, true)
                : emptyPlaceholder(uncLabel, undefined, { fontSize: 10, color: '#92400E' })
              }
            </Block>
            <Block bg={uncRows.length > 0 ? '#FEF9EE' : P.blockBg}>
              {uncRows.length > 0
                ? renderRelCells(uncRows, true)
                : emptyPlaceholder('', undefined, { minHeight: 32 })
              }
            </Block>
            <div />
          </div>
        )}

        {/* ── Margin type / Method — center only ── */}
        {showBottom && (
          <div style={grid}>
            <div />
            <Block bg={P.blockBg} style={{ padding: '8px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: P.accentDk, opacity: 0.5 }}>Margin type / Method</span>
            </Block>
            <div />
          </div>
        )}
      </div>
    </div>
  );
}

export default CascadeMatrix;
