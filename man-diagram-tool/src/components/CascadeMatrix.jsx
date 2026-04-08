import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MATRIX2_MARGIN_CHARACTERISTICS, MATRIX2_CHARACTERISTIC_BY_ID } from '../constants/marginCharacteristics';

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
const ROW_HEADER_PAD_X = 20;
const ROW_PADDING_Y = 7;
const ROW_LINE_HEIGHT = 14;
const MIN_ROW_HEIGHT = 30;
const MIN_REL_BLOCK_WIDTH = 140;
const OUTER_BORDER = '1px solid rgba(15, 23, 42, 0.28)';
const INNER_BORDER = '1px solid rgba(15, 23, 42, 0.2)';

const measureTextWidth = (() => {
  let canvas;
  return (text, font) => {
    const raw = String(text || '');
    if (typeof document === 'undefined') return raw.length * 7;
    if (!canvas) canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw.length * 7;
    ctx.font = font;
    return ctx.measureText(raw).width;
  };
})();

function estimateWrappedLines(text, maxWidth) {
  const source = String(text || '').trim();
  if (!source) return 1;
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let lines = 1;
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    const w = measureTextWidth(candidate, '600 11px Segoe UI');
    if (line && w > maxWidth) {
      lines += 1;
      line = word;
    } else {
      line = candidate;
    }
  });
  return lines;
}

function getRowHeight(rows, textWidth) {
  const safeWidth = Math.max(36, textWidth);
  const maxLines = rows.reduce((max, row) => Math.max(max, estimateWrappedLines(row.label, safeWidth)), 1);
  return Math.max(MIN_ROW_HEIGHT, maxLines * ROW_LINE_HEIGHT + ROW_PADDING_Y * 2);
}

function getMainRowTextWidth(rowHeaderWidth, hasImportance) {
  const axisWidth = 30;
  const sidePadding = ROW_HEADER_PAD_X;
  const importanceWidth = hasImportance ? 30 : 0;
  return rowHeaderWidth - axisWidth - sidePadding - importanceWidth;
}

function getUncertaintyRowTextWidth(rowHeaderWidth, hasImportance) {
  const axisWidth = 30;
  const sidePadding = ROW_HEADER_PAD_X;
  const importanceWidth = hasImportance ? 30 : 0;
  return rowHeaderWidth - axisWidth - sidePadding - importanceWidth;
}

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
      style={{
        ...style,
        cursor: 'pointer',
        minWidth: 0,
        maxWidth: '100%',
        display: 'inline-block',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
      }}
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
      border: OUTER_BORDER,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CascadeMatrix({
  matrixType, rows, columns, relationships,
  roofRelationships,
  nominalValues, marginValues, specifiedValues, rationale,
  directionValues, onUpdateDirection,
  onToggleCell, onUpdateRowLabel, onUpdateColumnLabel,
  onSetCellValue,
  onSetRoofCell,
  onUpdateNominal, onUpdateMargin, onUpdateRationale,
  onDeleteRow, onDeleteColumn,
  onAddColumn, onInsertRowAt, onInsertColumnAt,
  onMoveRow, onMoveColumn,
  uncertaintyTypes, onUpdateUncertaintyType,
  rowImportanceValues, onUpdateRowImportance, rowImportanceReadOnly,
  isRowImportanceReadOnly,
  columnImportanceValues, onUpdateColumnImportance,
  scoreValues, priorityValues,
}) {
  const P = PALETTE[matrixType] || PALETTE['needs-requirements'];
  const showNMS = matrixType === 'needs-requirements';
  const showRoof = matrixType === 'architecture-parameters';
  const showBottom = matrixType !== 'architecture-parameters';
  const mainRows = rows.filter(r => !r.isUncertainty);
  const uncRows = rows.filter(r => r.isUncertainty);
  const wrapperRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(null);
  const baseRowHeaderWidth = matrixType === 'architecture-parameters' ? 136 : 160;
  const baseRationaleWidth = matrixType === 'architecture-parameters' ? 56 : 90;
  const minRowHeaderWidth = 90;
  const minRationaleWidth = 40;
  const sideWidths = useMemo(() => {
    let rowW = baseRowHeaderWidth;
    let ratW = baseRationaleWidth;
    if (!availableWidth) return { rowW, ratW };
    let deficit = rowW + ratW + GAP * 2 + MIN_REL_BLOCK_WIDTH - availableWidth;
    if (deficit > 0) {
      const cutRat = Math.min(deficit, ratW - minRationaleWidth);
      ratW -= cutRat;
      deficit -= cutRat;
      if (deficit > 0) {
        const cutRow = Math.min(deficit, rowW - minRowHeaderWidth);
        rowW -= cutRow;
      }
    }
    return { rowW, ratW };
  }, [availableWidth, baseRowHeaderWidth, baseRationaleWidth]);
  const rowHeaderWidth = sideWidths.rowW;
  const rationaleWidth = sideWidths.ratW;

  const rowLabel = matrixType === 'needs-requirements' ? 'Needs'
    : matrixType === 'requirements-architecture' ? 'Requirements' : 'Architecture';
  const colLabel = matrixType === 'needs-requirements' ? 'Requirements'
    : matrixType === 'requirements-architecture' ? 'Architecture' : 'Parameters';
  const uncLabel = matrixType === 'requirements-architecture' ? 'Arch. Uncert.'
    : matrixType === 'architecture-parameters' ? 'Para. Uncert.' : 'Uncert.';
  const showColumnImportance = !!columnImportanceValues;
  const canInsertRows = !!onInsertRowAt;
  const canInsertColumns = !!onInsertColumnAt;

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

  const tinyBtnStyle = {
    border: '1px solid #94A3B8',
    borderRadius: 4,
    background: '#FFFFFF',
    color: '#334155',
    fontSize: 9,
    fontWeight: 700,
    width: 16,
    height: 16,
    lineHeight: 1,
    padding: 0,
    cursor: 'pointer',
  };

  useEffect(() => {
    if (!wrapperRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const el = wrapperRef.current;
    const update = () => {
      setAvailableWidth(el.clientWidth);
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const colPct = columns.length > 0 ? `${100 / columns.length}%` : '100%';
  const mainRowHeight = useMemo(
    () => getRowHeight(mainRows, getMainRowTextWidth(rowHeaderWidth, !!rowImportanceValues)),
    [mainRows, rowHeaderWidth, rowImportanceValues]
  );
  const uncRowHeight = useMemo(
    () => getRowHeight(uncRows, getUncertaintyRowTextWidth(rowHeaderWidth, !!rowImportanceValues)),
    [uncRows, rowHeaderWidth, rowImportanceValues]
  );
  const minMainAxisHeight = useMemo(
    () => Math.max(mainRowHeight, Math.ceil(measureTextWidth(rowLabel, '700 11px Segoe UI')) + 16),
    [mainRowHeight, rowLabel]
  );
  const minUncAxisHeight = useMemo(
    () => Math.max(uncRowHeight, Math.ceil(measureTextWidth(uncLabel, '700 10px Segoe UI')) + 16),
    [uncRowHeight, uncLabel]
  );
  // ── The house grid is the same whether empty or populated ──
  // Columns: [rowHeaders] [relationship area] [rationale]
  const grid = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: `${rowHeaderWidth}px minmax(0, 1fr) ${rationaleWidth}px`,
    gap: GAP,
    width: '100%',
    minWidth: 0,
  }), [rowHeaderWidth, rationaleWidth]);

  const emptyPlaceholder = (label, bg, style) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 600, color: P.accentDk,
      opacity: 0.5, textAlign: 'center', whiteSpace: 'pre-line',
      padding: 12, ...style,
    }}>{label}</div>
  );

  const formatScore = (v) => {
    const num = Number(v || 0);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num * 10) / 10;
  };

  const formatPriority = (v) => {
    const num = Number(v || 0);
    if (!Number.isFinite(num)) return '0';
    return (Math.round(num * 10) / 10).toFixed(1);
  };

  const relationType = matrixType === 'needs-requirements'
    ? 'matrix1'
    : matrixType === 'requirements-architecture'
      ? 'matrix2'
      : 'matrix3';

  const normalizeMatrix1Relationship = (value) => {
    if (value === 'deliberate' || value === 'inadvertent') return value;
    if (value === true) return 'deliberate';
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return 'deliberate';
    return null;
  };

  const normalizeMatrix2Relationship = (value) => {
    if (typeof value === 'string' && MATRIX2_CHARACTERISTIC_BY_ID[value]) return value;
    if (value === true) return MATRIX2_MARGIN_CHARACTERISTICS[0].id;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return MATRIX2_MARGIN_CHARACTERISTICS[0].id;
    return null;
  };

  const normalizeMatrix3Relationship = (value) => {
    if (value === true) return 1;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(1, n);
  };

  const getCellValue = (value) => {
    if (relationType === 'matrix1') return normalizeMatrix1Relationship(value);
    if (relationType === 'matrix2') return normalizeMatrix2Relationship(value);
    return normalizeMatrix3Relationship(value);
  };

  const isCellOn = (value) => {
    if (relationType === 'matrix1' || relationType === 'matrix2') return !!getCellValue(value);
    const n = getCellValue(value);
    return n != null;
  };

  const formatMatrix3 = (value) => {
    const n = getCellValue(value);
    if (n == null) return '';
    if (Math.abs(n - Math.round(n)) < 0.0001) return String(Math.round(n));
    return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  const [hoveredRowInsert, setHoveredRowInsert] = useState(null);
  const [hoveredColInsert, setHoveredColInsert] = useState(null);
  const [draggingRowId, setDraggingRowId] = useState(null);
  const [draggingColId, setDraggingColId] = useState(null);
  const [dropRowTargetId, setDropRowTargetId] = useState(null);
  const [dropColTargetId, setDropColTargetId] = useState(null);
  const [editingRelKey, setEditingRelKey] = useState(null);
  const roofKey = (leftId, rightId) => {
    const pair = [leftId, rightId].sort();
    return `${pair[0]}__${pair[1]}`;
  };

  const renderRoof = () => {
    if (columns.length < 2) {
      return (
        <div style={{ padding: '10px 6px', textAlign: 'center', fontSize: 10, color: P.accentDk, opacity: 0.7 }}>
          Add at least two parameters to define coupling.
        </div>
      );
    }
    const n = columns.length;
    const rowGap = 26;
    const topPad = 16;
    const bottomPad = 8;
    const diamond = 24;
    const roofHeight = Math.max(94, topPad + (n - 1) * rowGap + bottomPad);

    const pairs = [];
    for (let d = 1; d < n; d += 1) {
      for (let i = 0; i < n - d; i += 1) {
        const j = i + d;
        const xPct = (((i + j + 1) / 2) / n) * 100;
        const y = topPad + (n - 1 - d) * rowGap;
        const key = roofKey(columns[i].id, columns[j].id);
        const value = (roofRelationships || {})[key] || '';
        pairs.push({ i, j, xPct, y, key, value });
      }
    }

    return (
      <div style={{ position: 'relative', width: '100%', height: roofHeight, marginTop: 6 }}>
        {pairs.map((cell) => {
          const isPlus = cell.value === '+';
          const isMinus = cell.value === '-';
          const fill = isPlus ? '#16A34A' : isMinus ? '#EF4444' : '#FFFFFF';
          const stroke = isPlus ? '#15803D' : isMinus ? '#DC2626' : 'rgba(148,163,184,0.45)';
          const text = isPlus || isMinus ? '#FFFFFF' : '#94A3B8';
          return (
            <button
              type="button"
              key={cell.key}
              onClick={() => {
                if (!onSetRoofCell) return;
                const next = cell.value === '+' ? '-' : cell.value === '-' ? '' : '+';
                onSetRoofCell(columns[cell.i].id, columns[cell.j].id, next);
              }}
              title={cell.value === '+' ? 'Positive coupling' : cell.value === '-' ? 'Negative coupling' : 'No coupling'}
              style={{
                position: 'absolute',
                left: `${cell.xPct}%`,
                top: cell.y,
                width: diamond,
                height: diamond,
                transform: 'translate(-50%, -50%) rotate(45deg)',
                borderRadius: 4,
                border: `1.2px solid ${stroke}`,
                background: fill,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: 'rotate(-45deg)',
                  fontSize: 12,
                  fontWeight: 800,
                  color: text,
                  lineHeight: 1,
                }}
              >
                {cell.value || ''}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  // ── Render a list of items as stacked rows inside a block ──
  const renderRows = (items, blockBg, isUncert) => {
    const activeRowHeight = isUncert ? uncRowHeight : mainRowHeight;
    if (items.length === 0) {
      if (!isUncert && canInsertRows) {
        return (
          <div style={{ minHeight: activeRowHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button type="button" onClick={() => onInsertRowAt(0)} style={{ ...tinyBtnStyle, width: 22, height: 22, opacity: 0.7 }}>+</button>
          </div>
        );
      }
      return emptyPlaceholder(isUncert ? uncLabel : rowLabel, undefined, { minHeight: activeRowHeight });
    }
    return items.map((row, i) => (
      <div
        key={row.id}
        className="cascade-row"
        draggable={!isUncert && !!onMoveRow}
        onDragStart={(e) => {
          if (isUncert || !onMoveRow) return;
          setDraggingRowId(row.id);
          setDropRowTargetId(null);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (isUncert || !onMoveRow || !draggingRowId || draggingRowId === row.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropRowTargetId(row.id);
        }}
        onDrop={(e) => {
          if (isUncert || !onMoveRow || !draggingRowId || draggingRowId === row.id) return;
          e.preventDefault();
          onMoveRow(draggingRowId, row.id);
          setDraggingRowId(null);
          setDropRowTargetId(null);
        }}
        onDragEnd={() => {
          setDraggingRowId(null);
          setDropRowTargetId(null);
        }}
        style={{
          padding: `0 ${ROW_HEADER_PAD_X / 2}px`, position: 'relative', overflow: 'visible',
          minHeight: activeRowHeight, height: activeRowHeight, display: 'flex', alignItems: 'stretch',
          borderBottom: i < items.length - 1 ? INNER_BORDER : 'none',
          fontSize: 11, fontWeight: 600,
          color: isUncert ? '#92400E' : '#1E293B',
          fontStyle: isUncert ? 'italic' : 'normal',
          cursor: !isUncert && onMoveRow ? 'grab' : 'default',
          opacity: draggingRowId === row.id ? 0.6 : 1,
        }}
      >
        {dropRowTargetId === row.id && (
          <div
            style={{
              position: 'absolute',
              left: 2,
              right: 2,
              top: -1,
              borderTop: '2px solid #2563EB',
              pointerEvents: 'none',
              zIndex: 6,
            }}
          />
        )}
        {!isUncert && canInsertRows && (
          <div
            onMouseEnter={() => setHoveredRowInsert(i)}
            onMouseLeave={() => setHoveredRowInsert((prev) => (prev === i ? null : prev))}
            style={{ position: 'absolute', left: 6, right: 6, top: 0, height: 8, transform: 'translateY(-50%)', zIndex: 3 }}
          >
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: INNER_BORDER, opacity: hoveredRowInsert === i ? 1 : 0 }} />
            <button
              type="button"
              onClick={() => onInsertRowAt(i)}
              style={{
                ...tinyBtnStyle,
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: hoveredRowInsert === i ? 1 : 0,
                pointerEvents: hoveredRowInsert === i ? 'auto' : 'none',
              }}
            >
              +
            </button>
          </div>
        )}
        {!isUncert && canInsertRows && i === items.length - 1 && (
          <div
            onMouseEnter={() => setHoveredRowInsert(items.length)}
            onMouseLeave={() => setHoveredRowInsert((prev) => (prev === items.length ? null : prev))}
            style={{ position: 'absolute', left: 6, right: 6, bottom: 0, height: 8, transform: 'translateY(50%)', zIndex: 3 }}
          >
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: INNER_BORDER, opacity: hoveredRowInsert === items.length ? 1 : 0 }} />
            <button
              type="button"
              onClick={() => onInsertRowAt(items.length)}
              style={{
                ...tinyBtnStyle,
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: hoveredRowInsert === items.length ? 1 : 0,
                pointerEvents: hoveredRowInsert === items.length ? 'auto' : 'none',
              }}
            >
              +
            </button>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {isUncert && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!onUpdateUncertaintyType) return;
                const cur = (uncertaintyTypes || {})[row.id] === 'aleatory' ? 'aleatory' : 'epistemic';
                onUpdateUncertaintyType(row.id, cur === 'aleatory' ? 'epistemic' : 'aleatory');
              }}
              title="Uncertainty type (click to toggle): A=Aleatory, E=Epistemic"
              style={{
                minWidth: 18,
                height: 16,
                borderRadius: 9,
                border: '1px solid rgba(146,64,14,0.45)',
                background: '#FFFFFF',
                color: '#92400E',
                fontSize: 9,
                fontWeight: 800,
                lineHeight: 1,
                cursor: 'pointer',
                padding: '0 4px',
                flexShrink: 0,
              }}
            >
              {(uncertaintyTypes || {})[row.id] === 'aleatory' ? 'A' : 'E'}
            </button>
          )}
          <EditableText
            value={row.label}
            onChange={(v) => onUpdateRowLabel(row.id, v)}
            placeholder={isUncert ? 'Uncertainty source' : 'Row name'}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: isUncert ? '#92400E' : '#1E293B',
              fontStyle: isUncert ? 'italic' : 'normal',
              lineHeight: `${ROW_LINE_HEIGHT}px`,
              width: '100%',
              minWidth: 0,
              wordBreak: 'break-word',
            }}
          />
        </div>
        {rowImportanceValues && (
          <div style={{
            width: 30,
            minWidth: 30,
            borderLeft: INNER_BORDER,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            padding: '0 1px',
          }}>
            {((isRowImportanceReadOnly && isRowImportanceReadOnly(row, isUncert)) || (!isRowImportanceReadOnly && rowImportanceReadOnly)) ? (
              <span style={{ fontSize: 9, fontWeight: 600, color: '#0F172A' }}>
                {formatScore((rowImportanceValues || {})[row.id] ?? 0)}
              </span>
            ) : (
              <EditableText
                value={(rowImportanceValues || {})[row.id] ?? ''}
                onChange={(v) => onUpdateRowImportance && onUpdateRowImportance(row.id, v)}
                placeholder="0"
                style={{
                  width: '100%',
                  textAlign: 'center',
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#0F172A',
                  background: 'transparent',
                  whiteSpace: 'nowrap',
                }}
              />
            )}
          </div>
        )}
        {onDeleteRow && delBtn(() => onDeleteRow(row.id))}
      </div>
    ));
  };

  // ── Render the relationship cell grid ──
  const renderRelCells = (rowItems, isUncert) => {
    if (rowItems.length === 0 || columns.length === 0) {
      return emptyPlaceholder('Relationship', undefined, { minHeight: isUncert ? uncRowHeight : Math.max(mainRowHeight, 80) });
    }
    return (
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          {columns.map((col) => (
            <col key={`rel_col_${col.id}`} style={{ width: colPct }} />
          ))}
        </colgroup>
        <tbody>
          {rowItems.map((row, ri) => (
            <tr key={row.id}>
              {columns.map((col) => {
                const k = `${row.id}__${col.id}`;
                const relValue = getCellValue(relationships[k]);
                const on = isCellOn(relationships[k]);
                const isMatrix1 = relationType === 'matrix1';
                const isMatrix2 = relationType === 'matrix2';
                const isMatrix3 = relationType === 'matrix3';
                const m2Entry = isMatrix2 && relValue ? MATRIX2_CHARACTERISTIC_BY_ID[relValue] : null;
                return (
                  <td
                    key={k}
                    onClick={() => {
                      if (isMatrix1) {
                        onToggleCell && onToggleCell(row.id, col.id);
                        return;
                      }
                      if (isMatrix2) {
                        setEditingRelKey(k);
                        return;
                      }
                      if (isMatrix3) {
                        if (!on) onSetCellValue && onSetCellValue(row.id, col.id, 1);
                        setEditingRelKey(k);
                      }
                    }}
                    style={{
                      background: on ? (isUncert ? P.uncertBg : P.cellActive) : 'transparent',
                      textAlign: 'center', cursor: 'pointer',
                      fontSize: isMatrix1 ? 11 : 10,
                      fontWeight: 700,
                      color: on ? (isUncert ? P.uncertMark : P.markColor) : (isMatrix3 ? '#94A3B8' : '#CBD5E1'),
                      height: isUncert ? uncRowHeight : mainRowHeight,
                      padding: '0 6px',
                      borderBottom: ri < rowItems.length - 1 ? INNER_BORDER : 'none',
                      borderRight: INNER_BORDER,
                      transition: 'background 0.1s', userSelect: 'none',
                    }}
                    title={
                      isMatrix1
                        ? `Click to cycle: none -> deliberate -> inadvertent${on ? ' -> none' : ''}`
                        : isMatrix2
                          ? (m2Entry ? `${m2Entry.label}: ${m2Entry.description}` : 'Click to select a margin characteristic')
                          : 'Click to set/edit amplification (>=1). Clear input to remove link.'
                    }
                  >
                    {isMatrix2 && editingRelKey === k ? (
                      <select
                        autoFocus
                        value={relValue || ''}
                        onChange={(e) => {
                          onSetCellValue && onSetCellValue(row.id, col.id, e.target.value || null);
                          setEditingRelKey(null);
                        }}
                        onBlur={() => setEditingRelKey(null)}
                        style={{
                          width: '100%',
                          border: '1px solid #94A3B8',
                          borderRadius: 3,
                          fontSize: 10,
                          background: '#FFFFFF',
                          padding: '1px 2px',
                        }}
                      >
                        <option value="">(none)</option>
                        {MATRIX2_MARGIN_CHARACTERISTICS.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    ) : isMatrix3 && editingRelKey === k ? (
                      <input
                        autoFocus
                        type="number"
                        min="1"
                        step="0.1"
                        value={formatMatrix3(relValue)}
                        onChange={(e) => onSetCellValue && onSetCellValue(row.id, col.id, e.target.value)}
                        onBlur={() => setEditingRelKey(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') setEditingRelKey(null);
                          if (e.key === 'Delete' || e.key === 'Backspace') {
                            const raw = e.currentTarget.value || '';
                            if (!raw.trim()) onSetCellValue && onSetCellValue(row.id, col.id, '');
                          }
                        }}
                        style={{
                          width: '100%',
                          maxWidth: 46,
                          border: '1px solid #94A3B8',
                          borderRadius: 3,
                          fontSize: 10,
                          textAlign: 'center',
                          background: '#FFFFFF',
                          padding: '1px 2px',
                        }}
                      />
                    ) : isMatrix3 ? (
                      formatMatrix3(relValue) || ''
                    ) : isMatrix2 ? (
                      m2Entry ? m2Entry.label : ''
                    ) : (
                      relValue === 'deliberate' ? 'D' : relValue === 'inadvertent' ? 'I' : ''
                    )}
                  </td>
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
    if (rowItems.length === 0) return emptyPlaceholder('Rat.', undefined, { minHeight: mainRowHeight });
    return rowItems.map((row, i) => (
      <div key={row.id} style={{
        padding: '0 6px', textAlign: 'center',
        minHeight: mainRowHeight, height: mainRowHeight, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: i < rowItems.length - 1 ? INNER_BORDER : 'none',
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
    <div className="cascade-matrix-wrapper" ref={wrapperRef}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>

        {/* ── Coupling roof (Matrix 3) ── */}
        {showRoof && (
          <div style={grid}>
            <div />
            <Block bg={P.blockBg2} style={{ padding: '8px 10px 4px', textAlign: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: P.accentDk }}>Parameter Coupling</span>
              {renderRoof()}
            </Block>
            <div />
          </div>
        )}

        {/* ── Column headers — center only ── */}
        <div style={grid}>
          <div />
          <Block bg={P.headerBg}>
            <div style={{
              minHeight: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.35)',
              padding: '0 8px',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: P.headerText, letterSpacing: 0.2 }}>
                {colLabel}
              </span>
            </div>
            {columns.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, position: 'relative' }}>
                {columns.map((col, i) => (
                  <div
                    key={col.id}
                    className="cascade-row"
                    draggable={!!onMoveColumn}
                    onDragStart={(e) => {
                      if (!onMoveColumn) return;
                      setDraggingColId(col.id);
                      setDropColTargetId(null);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (!onMoveColumn || !draggingColId || draggingColId === col.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropColTargetId(col.id);
                    }}
                    onDrop={(e) => {
                      if (!onMoveColumn || !draggingColId || draggingColId === col.id) return;
                      e.preventDefault();
                      onMoveColumn(draggingColId, col.id);
                      setDraggingColId(null);
                      setDropColTargetId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingColId(null);
                      setDropColTargetId(null);
                    }}
                    style={{
                      padding: '6px 5px',
                      boxSizing: 'border-box',
                      textAlign: 'center',
                      borderRight: i < columns.length - 1 ? '1px solid rgba(255,255,255,0.35)' : 'none',
                      position: 'relative',
                      cursor: onMoveColumn ? 'grab' : 'default',
                      opacity: draggingColId === col.id ? 0.6 : 1,
                    }}
                  >
                    {dropColTargetId === col.id && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 2,
                          bottom: 2,
                          left: -1,
                          borderLeft: '2px solid rgba(255,255,255,0.95)',
                          pointerEvents: 'none',
                          zIndex: 7,
                        }}
                      />
                    )}
                    {canInsertColumns && i === 0 && (
                      <div
                        onMouseEnter={() => setHoveredColInsert(0)}
                        onMouseLeave={() => setHoveredColInsert((prev) => (prev === 0 ? null : prev))}
                        style={{ position: 'absolute', left: -5, top: 0, bottom: 0, width: 10, zIndex: 4 }}
                      >
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: '1px solid rgba(255,255,255,0.65)', opacity: hoveredColInsert === 0 ? 1 : 0 }} />
                        <button
                          type="button"
                          title="Insert"
                          onClick={() => onInsertColumnAt(0)}
                          style={{
                            ...tinyBtnStyle,
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            opacity: hoveredColInsert === 0 ? 1 : 0,
                            pointerEvents: hoveredColInsert === 0 ? 'auto' : 'none',
                          }}
                        >
                          +
                        </button>
                      </div>
                    )}
                    {canInsertColumns && (
                      <div
                        onMouseEnter={() => setHoveredColInsert(i + 1)}
                        onMouseLeave={() => setHoveredColInsert((prev) => (prev === i + 1 ? null : prev))}
                        style={{ position: 'absolute', right: -5, top: 0, bottom: 0, width: 10, zIndex: 4 }}
                      >
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: '1px solid rgba(255,255,255,0.65)', opacity: hoveredColInsert === i + 1 ? 1 : 0 }} />
                        <button
                          type="button"
                          title="Insert"
                          onClick={() => onInsertColumnAt(i + 1)}
                          style={{
                            ...tinyBtnStyle,
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            opacity: hoveredColInsert === i + 1 ? 1 : 0,
                            pointerEvents: hoveredColInsert === i + 1 ? 'auto' : 'none',
                          }}
                        >
                          +
                        </button>
                      </div>
                    )}
                    <EditableText
                      value={col.label} onChange={(v) => onUpdateColumnLabel(col.id, v)}
                      placeholder="Column"
                      style={{ fontSize: 11, fontWeight: 700, color: P.headerText, whiteSpace: 'normal', lineHeight: '1.2' }}
                    />
                    {onDeleteColumn && delBtn(() => onDeleteColumn(col.id))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: P.headerText, opacity: 0.6 }}>
                Add the first column below
              </div>
            )}
            {columns.length === 0 && onAddColumn && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.35)', padding: '6px 10px', textAlign: 'center' }}>
                <button type="button" onClick={() => onAddColumn()} style={{ ...tinyBtnStyle, width: 22, height: 22 }}>+</button>
              </div>
            )}
          </Block>
          <div />
        </div>

        {showColumnImportance && columns.length > 0 && (
          <div style={grid}>
            <Block bg={P.blockBg}>
              <div style={{
                minHeight: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
                color: P.accentDk,
              }}>
                Importance
              </div>
            </Block>
            <Block bg={P.blockBg2}>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  {columns.map((col) => (
                    <col key={`imp_col_${col.id}`} style={{ width: colPct }} />
                  ))}
                </colgroup>
                <tbody>
                  <tr>
                    {columns.map((col) => (
                      <td key={`imp_${col.id}`} style={{ borderRight: INNER_BORDER, padding: '1px 2px', textAlign: 'center' }}>
                        <EditableText
                          value={(columnImportanceValues || {})[col.id] ?? ''}
                          onChange={(v) => onUpdateColumnImportance && onUpdateColumnImportance(col.id, v)}
                          placeholder="0"
                          style={{
                            width: '100%',
                            maxWidth: 24,
                            fontSize: 9,
                            fontWeight: 600,
                            textAlign: 'center',
                            color: '#0F172A',
                            whiteSpace: 'nowrap',
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </Block>
            <div />
          </div>
        )}

        {/* ── Direction Of Improvement (Matrix 1 only) ── */}
        {showNMS && columns.length > 0 && (
          <div style={grid}>
            <Block bg={P.blockBg}>
              <div style={{
                height: 26,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontSize: 10,
                fontWeight: 700,
                color: P.accentDk,
                borderBottom: INNER_BORDER,
              }}>
                Direction
              </div>
            </Block>
            <Block bg={P.blockBg2}>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  {columns.map((col) => (
                    <col key={`dir_col_${col.id}`} style={{ width: colPct }} />
                  ))}
                </colgroup>
                <tbody>
                  <tr>
                    {columns.map((col) => {
                      const current = (directionValues || {})[col.id] || 'up';
                      const arrow = current === 'down' ? '↓' : '↑';
                      return (
                        <td
                          key={`dir_${col.id}`}
                          onClick={() => onUpdateDirection && onUpdateDirection(col.id, current === 'up' ? 'down' : 'up')}
                          style={{
                            height: 26,
                            textAlign: 'center',
                            cursor: 'pointer',
                            borderRight: INNER_BORDER,
                            color: P.accentDk,
                            fontSize: 14,
                            fontWeight: 700,
                          }}
                          title="Click to toggle direction"
                        >
                          {arrow}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </Block>
            <div />
          </div>
        )}

        {/* ── Nominal / Margin / Specified strip (Matrix 1 only) ── */}
        {showNMS && columns.length > 0 && (
          <div style={grid}>
            <Block bg={P.blockBg}>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <tbody>
                  {[
                    { k: 'nom', label: 'Nominal (A)' },
                    { k: 'mar', label: 'Margin (\u0394A)' },
                    { k: 'spec', label: 'Specified (A+\u0394A)' },
                  ].map((s, i) => (
                    <tr key={s.k}>
                      <td style={{
                        height: 30,
                        padding: '0 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        color: P.accentDk,
                        borderBottom: i < 2 ? INNER_BORDER : 'none',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                      }}>
                        {s.label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
            <Block bg={P.blockBg2}>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  {columns.map((col) => (
                    <col key={`nms_col_${col.id}`} style={{ width: colPct }} />
                  ))}
                </colgroup>
                <tbody>
                  {[
                    { k: 'nom', vals: nominalValues, fn: onUpdateNominal },
                    { k: 'mar', vals: marginValues, fn: onUpdateMargin },
                    { k: 'spec', vals: specifiedValues, fn: null },
                  ].map((s, si) => (
                    <tr key={s.k}>
                      {columns.map((col) => (
                        <td key={`${s.k}_${col.id}`} style={{
                              height: 30,
                          padding: '0 6px', textAlign: 'center',
                          borderBottom: si < 2 ? INNER_BORDER : 'none',
                          borderRight: INNER_BORDER,
                          verticalAlign: 'middle',
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
            <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr', minHeight: mainRows.length === 0 ? minMainAxisHeight : undefined }}>
              <div style={{
                borderRight: INNER_BORDER,
                background: 'rgba(255,255,255,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 0',
              }}>
                <span style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  whiteSpace: 'nowrap',
                  fontSize: 11,
                  fontWeight: 700,
                  color: P.accentDk,
                  letterSpacing: 0.2,
                }}>
                  {rowLabel}
                </span>
              </div>
              <div>
                {renderRows(mainRows, P.blockBg, false)}
              </div>
            </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr', minHeight: uncRows.length === 0 ? minUncAxisHeight : undefined }}>
                <div style={{
                  borderRight: INNER_BORDER,
                  background: 'rgba(255,255,255,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 0',
                }}>
                  <span style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    whiteSpace: 'nowrap',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#92400E',
                    letterSpacing: 0.2,
                  }}>
                    {uncLabel}
                  </span>
                </div>
                <div>
                  {uncRows.length > 0
                    ? renderRows(uncRows, P.uncertBg, true)
                    : emptyPlaceholder('', undefined, { fontSize: 10, color: '#92400E', minHeight: uncRowHeight })
                  }
                </div>
              </div>
            </Block>
            <Block bg={uncRows.length > 0 ? '#FEF9EE' : P.blockBg}>
              {uncRows.length > 0
                ? renderRelCells(uncRows, true)
                : emptyPlaceholder('', undefined, { minHeight: uncRowHeight })
              }
            </Block>
            <div />
          </div>
        )}

        {/* ── Margin type / Method — center only ── */}
        {columns.length > 0 && scoreValues && priorityValues && (
          <div style={grid}>
            <Block bg="#E2E8F0">
              <div style={{
                minHeight: 28,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontSize: 11,
                fontWeight: 700,
                color: '#334155',
                borderBottom: INNER_BORDER,
              }}>
                Total Score
              </div>
              <div style={{
                minHeight: 28,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontSize: 11,
                fontWeight: 700,
                color: '#334155',
              }}>
                Priority (%)
              </div>
            </Block>
            <Block bg="#F8FAFC">
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  {columns.map((col) => (
                    <col key={`score_col_${col.id}`} style={{ width: colPct }} />
                  ))}
                </colgroup>
                <tbody>
                  <tr>
                    {columns.map((col) => (
                      <td key={`score_${col.id}`} style={{ borderBottom: INNER_BORDER, borderRight: INNER_BORDER, textAlign: 'center', padding: '5px 4px', fontSize: 11, fontWeight: 600, color: '#0F172A' }}>
                        {formatScore((scoreValues || {})[col.id])}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    {columns.map((col) => (
                      <td key={`priority_${col.id}`} style={{ borderRight: INNER_BORDER, textAlign: 'center', padding: '5px 4px', fontSize: 11, fontWeight: 600, color: '#0F172A' }}>
                        {formatPriority((priorityValues || {})[col.id])}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </Block>
            <div />
          </div>
        )}

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
