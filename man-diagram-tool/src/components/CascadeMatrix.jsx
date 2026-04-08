import React, { useState, useRef, useEffect } from 'react';

/**
 * CascadeMatrix renders one MDC matrix as a QFD "house" made of
 * separated blocks matching the schematic diagram:
 *
 *              ┌─Col Headers──┐
 *              │              │
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

const B = {
  bg:       '#DCD6CE',
  bgLight:  '#E5E0D9',
  bgMedium: '#CBC4BA',
  text:     '#3D3D3D',
  muted:    '#6B6560',
  gap:      4,
  r:        5,
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
  matrixType, rows, columns, relationships,
  nominalValues, marginValues, specifiedValues, rationale,
  onToggleCell, onUpdateRowLabel, onUpdateColumnLabel,
  onUpdateNominal, onUpdateMargin, onUpdateRationale,
  onDeleteRow, onDeleteColumn,
}) {
  const showNMS = matrixType === 'needs-requirements';
  const showRoof = matrixType === 'architecture-parameters';
  const showBottom = matrixType !== 'architecture-parameters';
  const mainRows = rows.filter(r => !r.isUncertainty);
  const uncRows = rows.filter(r => r.isUncertainty);
  const hasData = columns.length > 0 || rows.length > 0;

  const rowLabel = matrixType === 'needs-requirements' ? 'Needs'
    : matrixType === 'requirements-architecture' ? 'Req.' : 'Arch.\nElem.';
  const colLabel = matrixType === 'needs-requirements' ? 'Requirements'
    : matrixType === 'requirements-architecture' ? 'Architectural Elements' : 'Parameters';
  const uncLabel = matrixType === 'requirements-architecture' ? 'Arch.\nUncert.'
    : matrixType === 'architecture-parameters' ? 'Para.\nUncert.' : 'Uncert.';

  const thin = '1px solid rgba(0,0,0,0.06)';

  const delBtn = (onClick) => (
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
        lineHeight: 1, opacity: 0, transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
    >
      x
    </button>
  );

  const block = (bg, radius, children, style) => (
    <div style={{
      background: bg, borderRadius: radius || B.r,
      overflow: 'hidden', ...style,
    }}>
      {children}
    </div>
  );

  // ──── EMPTY STATE ────
  if (!hasData) {
    const emptyBlock = (label, bg, style) => (
      <div style={{
        background: bg || B.bgLight, borderRadius: B.r,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '12px 8px', fontSize: 11, fontWeight: 600,
        color: B.muted, textAlign: 'center', whiteSpace: 'pre-line',
        ...style,
      }}>
        {label}
      </div>
    );

    return (
      <div className="cascade-matrix-wrapper">
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {/* Coupling roof */}
          {showRoof && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: B.gap }}>
              <div style={{
                width: 0, height: 0,
                borderLeft: '100px solid transparent', borderRight: '100px solid transparent',
                borderBottom: `45px solid ${B.bgLight}`, position: 'relative',
              }}>
                <span style={{
                  position: 'absolute', top: 25, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 9, fontWeight: 600, color: B.muted, whiteSpace: 'nowrap',
                }}>Para. Coupling</span>
              </div>
            </div>
          )}

          {/* Col headers — center only */}
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 48px', gap: B.gap, marginBottom: B.gap }}>
            <div />
            {emptyBlock(colLabel, B.bg, { padding: '14px 16px', fontSize: 12 })}
            <div />
          </div>

          {/* Row | Relationship | Rat */}
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 48px', gap: B.gap, marginBottom: B.gap }}>
            {emptyBlock(rowLabel, B.bgLight, { minHeight: 100 })}
            {emptyBlock('Relationship', B.bgMedium, { minHeight: 100, fontSize: 13 })}
            {emptyBlock('Rat.', B.bgLight)}
          </div>

          {/* Uncert | Uncert Rels */}
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 48px', gap: B.gap, marginBottom: B.gap }}>
            {emptyBlock(uncLabel, B.bgLight, { padding: '8px 6px', fontSize: 9 })}
            {emptyBlock('', B.bgLight, { padding: '8px', minHeight: 32 })}
            <div />
          </div>

          {/* Margin type / Method — center only */}
          {showBottom && (
            <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 48px', gap: B.gap }}>
              <div />
              {emptyBlock('Margin type / Method', B.bgLight, { padding: '10px 16px', fontSize: 10 })}
              <div />
            </div>
          )}

          <p style={{ textAlign: 'center', color: '#B5AFA7', fontSize: 11, marginTop: 14 }}>
            Use the left palette to add rows and columns.
          </p>
        </div>
      </div>
    );
  }

  // ──── POPULATED STATE ────
  // Use a single table with border-spacing for gaps.
  // Corner cells (top-left, top-right) are transparent to create
  // the effect of the column header block being only above the center.

  const cellPad = '7px 8px';
  const cellPadSm = '4px 6px';

  return (
    <div className="cascade-matrix-wrapper">
      <div style={{ display: 'flex', flexDirection: 'column', gap: B.gap }}>

        {/* Coupling roof block (Matrix 3 only) */}
        {showRoof && block(B.bgLight, B.r, (
          <div style={{ padding: '8px 16px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: B.muted }}>
            Parameter Coupling
          </div>
        ))}

        {/* Main table with border-spacing for gaps */}
        <table style={{ borderCollapse: 'separate', borderSpacing: B.gap }}>
          <thead>
            {/* Column header row — corner cells transparent */}
            <tr>
              {/* Top-left corner: empty/transparent */}
              <th style={{ background: 'transparent', minWidth: 180 }} />
              {columns.map((col) => (
                <th key={col.id} style={{
                  background: B.bg, borderRadius: B.r,
                  padding: cellPad, textAlign: 'center',
                  fontSize: 11, fontWeight: 700, color: B.text,
                  minWidth: 100, position: 'relative',
                }}>
                  <EditableText
                    value={col.label}
                    onChange={(v) => onUpdateColumnLabel(col.id, v)}
                    placeholder="Column"
                    style={{ fontSize: 11, fontWeight: 700, color: B.text }}
                  />
                  {onDeleteColumn && delBtn(() => onDeleteColumn(col.id))}
                </th>
              ))}
              {/* Top-right corner: empty/transparent */}
              <th style={{ background: 'transparent', minWidth: 90 }} />
            </tr>
          </thead>

          <tbody>
            {/* Nominal / Margin / Specified (Matrix 1 only) */}
            {showNMS && [
              { key: 'nom', label: 'Nominal (A)', bg: '#EDE9E2', vals: nominalValues, fn: onUpdateNominal, tc: B.text },
              { key: 'mar', label: 'Margin (\u0394A)', bg: '#E8DFD0', vals: marginValues, fn: onUpdateMargin, tc: '#7F6000' },
              { key: 'spec', label: 'Specified (A+\u0394A)', bg: '#D8CFBF', vals: specifiedValues, fn: null, tc: '#4A4540' },
            ].map((s, si) => (
              <tr key={s.key}>
                <td style={{
                  background: s.bg, padding: cellPadSm,
                  fontSize: 10, fontWeight: 700, color: s.tc,
                  borderRadius: si === 0 ? `${B.r}px 0 0 0` : si === 2 ? `0 0 0 ${B.r}px` : 0,
                }}>{s.label}</td>
                {columns.map((col, ci) => (
                  <td key={`${s.key}_${col.id}`} style={{
                    background: s.bg, padding: cellPadSm, textAlign: 'center',
                    borderRadius:
                      si === 0 && ci === columns.length - 1 ? `0 ${B.r}px 0 0` :
                      si === 2 && ci === columns.length - 1 ? `0 0 ${B.r}px 0` : 0,
                  }}>
                    {s.fn ? (
                      <EditableText
                        value={(s.vals || {})[col.id] || ''}
                        onChange={(v) => s.fn(col.id, v)}
                        placeholder="value"
                        style={{ fontSize: 10, color: s.tc }}
                      />
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 600, color: s.tc }}>
                        {(s.vals || {})[col.id] || '\u2014'}
                      </span>
                    )}
                  </td>
                ))}
                <td style={{ background: 'transparent' }} />
              </tr>
            ))}

            {/* Main rows: row-header | relationship cells | rationale */}
            {mainRows.map((row, ri) => (
              <tr key={row.id} className="cascade-row">
                {/* Row header */}
                <td style={{
                  background: B.bgLight, padding: cellPad,
                  fontSize: 11, fontWeight: 600, color: B.text,
                  position: 'relative',
                  borderRadius:
                    ri === 0 ? `${B.r}px 0 0 0` :
                    ri === mainRows.length - 1 ? `0 0 0 ${B.r}px` : 0,
                }}>
                  <EditableText
                    value={row.label}
                    onChange={(v) => onUpdateRowLabel(row.id, v)}
                    placeholder="Row name"
                    style={{ fontSize: 11, fontWeight: 600, color: B.text }}
                  />
                  {onDeleteRow && delBtn(() => onDeleteRow(row.id))}
                </td>

                {/* Relationship cells */}
                {columns.map((col, ci) => {
                  const k = `${row.id}__${col.id}`;
                  const on = relationships[k];
                  const isTopRight = ri === 0 && ci === columns.length - 1;
                  const isBotLeft = ri === mainRows.length - 1 && ci === 0;
                  const isBotRight = ri === mainRows.length - 1 && ci === columns.length - 1;
                  const isTopLeft = ri === 0 && ci === 0;
                  let br = 0;
                  if (isTopLeft) br = `${B.r}px 0 0 0`;
                  if (isTopRight) br = `0 ${B.r}px 0 0`;
                  if (isBotLeft) br = `0 0 0 ${B.r}px`;
                  if (isBotRight) br = `0 0 ${B.r}px 0`;
                  return (
                    <td
                      key={k}
                      onClick={() => onToggleCell(row.id, col.id)}
                      style={{
                        background: on ? B.bgMedium : B.bgLight,
                        padding: '6px', textAlign: 'center',
                        cursor: 'pointer', fontSize: 15, fontWeight: 700,
                        color: on ? B.text : 'transparent',
                        transition: 'background 0.12s', userSelect: 'none',
                        minWidth: 100, borderRadius: br,
                      }}
                      title={on ? 'Click to remove' : 'Click to mark relationship'}
                    >
                      {on ? '\u25CF' : ''}
                    </td>
                  );
                })}

                {/* Rationale */}
                <td style={{
                  background: B.bgLight, padding: cellPadSm, textAlign: 'center',
                  borderRadius:
                    ri === 0 ? `${B.r}px ${B.r}px 0 0` :
                    ri === mainRows.length - 1 ? `0 0 ${B.r}px ${B.r}px` : 0,
                }}>
                  <EditableText
                    value={(rationale || {})[row.id] || ''}
                    onChange={(v) => onUpdateRationale(row.id, v)}
                    placeholder="rationale"
                    style={{ fontSize: 10, color: B.muted }}
                  />
                </td>
              </tr>
            ))}

            {/* Uncertainty rows: uncert-label | uncert-relationship cells */}
            {uncRows.map((row, ri) => (
              <tr key={row.id} className="cascade-row">
                {/* Uncertainty row header */}
                <td style={{
                  background: '#E8DFD0', padding: cellPad,
                  fontSize: 11, fontWeight: 600, color: B.muted,
                  fontStyle: 'italic', position: 'relative',
                  borderRadius:
                    ri === 0 ? `${B.r}px 0 0 0` :
                    ri === uncRows.length - 1 ? `0 0 0 ${B.r}px` : 0,
                }}>
                  <EditableText
                    value={row.label}
                    onChange={(v) => onUpdateRowLabel(row.id, v)}
                    placeholder="Uncertainty source"
                    style={{ fontSize: 11, fontWeight: 600, color: B.muted, fontStyle: 'italic' }}
                  />
                  {onDeleteRow && delBtn(() => onDeleteRow(row.id))}
                </td>

                {/* Uncertainty relationship cells */}
                {columns.map((col, ci) => {
                  const k = `${row.id}__${col.id}`;
                  const on = relationships[k];
                  const isTopRight = ri === 0 && ci === columns.length - 1;
                  const isBotLeft = ri === uncRows.length - 1 && ci === 0;
                  const isBotRight = ri === uncRows.length - 1 && ci === columns.length - 1;
                  const isTopLeft = ri === 0 && ci === 0;
                  let br = 0;
                  if (isTopLeft) br = `${B.r}px 0 0 0`;
                  if (isTopRight) br = `0 ${B.r}px 0 0`;
                  if (isBotLeft) br = `0 0 0 ${B.r}px`;
                  if (isBotRight) br = `0 0 ${B.r}px 0`;
                  return (
                    <td
                      key={k}
                      onClick={() => onToggleCell(row.id, col.id)}
                      style={{
                        background: on ? B.bgMedium : '#E8DFD0',
                        padding: '6px', textAlign: 'center',
                        cursor: 'pointer', fontSize: 15, fontWeight: 700,
                        color: on ? '#7F6000' : 'transparent',
                        transition: 'background 0.12s', userSelect: 'none',
                        minWidth: 100, borderRadius: br,
                      }}
                      title={on ? 'Click to remove' : 'Click to mark relationship'}
                    >
                      {on ? '\u25CF' : ''}
                    </td>
                  );
                })}

                {/* No rationale for uncertainty rows */}
                <td style={{ background: 'transparent' }} />
              </tr>
            ))}

            {/* Margin type / Method row — center columns only */}
            {showBottom && (
              <tr>
                <td style={{ background: 'transparent' }} />
                <td
                  colSpan={columns.length}
                  style={{
                    background: B.bgLight, borderRadius: B.r,
                    padding: '8px 16px', textAlign: 'center',
                    fontSize: 10, fontWeight: 600, color: B.muted,
                  }}
                >
                  Margin type / Method
                </td>
                <td style={{ background: 'transparent' }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CascadeMatrix;
