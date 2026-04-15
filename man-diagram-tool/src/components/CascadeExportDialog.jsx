import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import CascadeMatrix from './CascadeMatrix';

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function matrixCsvRows(matrix) {
  const rows = (matrix && matrix.props && matrix.props.rows) || [];
  const columns = (matrix && matrix.props && matrix.props.columns) || [];
  const relationships = (matrix && matrix.props && matrix.props.relationships) || {};
  const lines = [];
  lines.push([matrix.title || matrix.id || 'Matrix']);
  lines.push(['Row/Column', ...columns.map((c) => c.label || c.id)]);
  rows.forEach((row) => {
    const vals = columns.map((col) => {
      const raw = relationships[`${row.id}__${col.id}`];
      if (matrix.matrixType === 'needs-requirements') {
        if (raw === 'deliberate') return 'deliberate';
        if (raw === 'inadvertent') return 'inadvertent';
        if (raw === true) return 'deliberate';
        return '';
      }
      if (matrix.matrixType === 'requirements-architecture') {
        if (raw === true) return 'linked';
        return raw == null ? '' : String(raw);
      }
      if (raw === true) return '1';
      if (raw == null || raw === '') return '';
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : String(raw);
    });
    lines.push([row.label || row.id, ...vals]);
  });

  const colImportance = (matrix && matrix.props && matrix.props.columnImportanceValues) || null;
  if (colImportance && columns.length > 0) {
    lines.push([]);
    lines.push(['Column Importance']);
    lines.push(['Column', 'Value']);
    columns.forEach((col) => {
      lines.push([col.label || col.id, colImportance[col.id] ?? '']);
    });
  }

  const scoreValues = (matrix && matrix.props && matrix.props.scoreValues) || null;
  if (scoreValues && columns.length > 0) {
    lines.push([]);
    lines.push(['Total Score']);
    lines.push(['Column', 'Value']);
    columns.forEach((col) => {
      lines.push([col.label || col.id, scoreValues[col.id] ?? '']);
    });
  }

  const priorityValues = (matrix && matrix.props && matrix.props.priorityValues) || null;
  if (priorityValues && columns.length > 0) {
    lines.push([]);
    lines.push(['Priority (%)']);
    lines.push(['Column', 'Value']);
    columns.forEach((col) => {
      lines.push([col.label || col.id, priorityValues[col.id] ?? '']);
    });
  }

  if (matrix.matrixType === 'architecture-parameters') {
    const roof = (matrix && matrix.props && matrix.props.roofRelationships) || {};
    const keys = Object.keys(roof);
    if (keys.length > 0) {
      lines.push([]);
      lines.push(['Parameter Couplings']);
      lines.push(['Parameter A', 'Parameter B', 'Coupling']);
      keys.forEach((key) => {
        const [a, b] = key.split('__');
        const aLabel = columns.find((c) => c.id === a)?.label || a;
        const bLabel = columns.find((c) => c.id === b)?.label || b;
        lines.push([aLabel, bLabel, roof[key]]);
      });
    }
  }

  lines.push([]);
  return lines;
}

function buildMatricesCsv(matrices = []) {
  const allRows = [];
  (matrices || []).forEach((matrix) => {
    matrixCsvRows(matrix).forEach((line) => allRows.push(line));
  });
  return allRows.map((line) => line.map(escapeCsv).join(',')).join('\n');
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function sanitizeName(name = 'cascade_export') {
  return String(name).trim().replace(/[^\w.-]+/g, '_') || 'cascade_export';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function collectAllStyles() {
  const chunks = [];
  const sheets = Array.from(document.styleSheets || []);
  sheets.forEach((sheet) => {
    try {
      const rules = Array.from(sheet.cssRules || []);
      rules.forEach((rule) => chunks.push(rule.cssText));
    } catch {
      // Ignore cross-origin stylesheet access errors.
    }
  });
  return chunks.join('\n');
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function buildSvgFromNode(node, width, height) {
  const serializer = new XMLSerializer();
  const html = serializer.serializeToString(node);
  const cssText = collectAllStyles();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#ffffff;">
      <style>${cssText}</style>
      ${html}
    </div>
  </foreignObject>
</svg>`;
}

const THEME_PRESETS = {
  default: {
    label: 'Default',
    perMatrix: {},
  },
  slate: {
    label: 'Slate',
    perMatrix: {
      'needs-requirements': { accent: '#475569', accentDk: '#334155', headerBg: '#475569', blockBg: '#F8FAFC', blockBg2: '#E2E8F0', cellActive: '#CBD5E1', markColor: '#1E293B' },
      'requirements-architecture': { accent: '#0F766E', accentDk: '#115E59', headerBg: '#0F766E', blockBg: '#F0FDFA', blockBg2: '#CCFBF1', cellActive: '#99F6E4', markColor: '#134E4A' },
      'architecture-parameters': { accent: '#B45309', accentDk: '#92400E', headerBg: '#B45309', blockBg: '#FFFBEB', blockBg2: '#FDE68A', cellActive: '#FCD34D', markColor: '#78350F' },
    },
  },
  contrast: {
    label: 'High Contrast',
    perMatrix: {
      'needs-requirements': { accent: '#312E81', accentDk: '#1E1B4B', headerBg: '#312E81', blockBg: '#EEF2FF', blockBg2: '#C7D2FE', cellActive: '#A5B4FC', markColor: '#1E1B4B' },
      'requirements-architecture': { accent: '#0F766E', accentDk: '#042F2E', headerBg: '#0F766E', blockBg: '#ECFEFF', blockBg2: '#A5F3FC', cellActive: '#67E8F9', markColor: '#083344' },
      'architecture-parameters': { accent: '#C2410C', accentDk: '#7C2D12', headerBg: '#C2410C', blockBg: '#FFF7ED', blockBg2: '#FED7AA', cellActive: '#FDBA74', markColor: '#7C2D12' },
    },
  },
};

function defaultSelectedMap(matrices, selectedIds) {
  const selectedSet = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const hasExplicitSelection = selectedSet.size > 0;
  const next = {};
  (matrices || []).forEach((matrix) => {
    next[matrix.id] = hasExplicitSelection ? selectedSet.has(matrix.id) : true;
  });
  return next;
}

function themeStyleFor(themeId, matrixType, cornerRadius, styleOptions) {
  const theme = THEME_PRESETS[themeId] || THEME_PRESETS.default;
  return {
    cornerRadius,
    palette: (theme.perMatrix && theme.perMatrix[matrixType]) || {},
    elements: {
      showRoof: !!styleOptions.includeParameterCoupling,
      showWeighting: !!styleOptions.includeWeightingFactors,
      showNMS: !!styleOptions.includeNominalMarginSpecified,
      showDirection: !!styleOptions.includeDirection,
      showRationale: !!styleOptions.includeRationale,
      showUncertainty: !!styleOptions.includeUncertaintyRows,
      showScorePriority: !!styleOptions.includeScores,
      showBottom: true,
    },
    layout: {
      rowHeaderWidth: styleOptions.rowHeaderWidth,
      columnWidth: styleOptions.columnWidth,
      rowHeight: styleOptions.rowHeight,
      rationaleWidth: styleOptions.rationaleWidth,
    },
    typography: {
      fontFamily: styleOptions.fontFamily,
      textScale: styleOptions.textScale,
    },
  };
}

function MatrixPreview({ matrix, themeId, cornerRadius, styleOptions }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{matrix.title}</div>
      <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ pointerEvents: 'none' }}>
          <CascadeMatrix
            {...matrix.props}
            styleOverrides={themeStyleFor(themeId, matrix.matrixType, cornerRadius, styleOptions)}
            containerStyle={{ padding: 12, overflow: 'hidden' }}
          />
        </div>
      </div>
    </div>
  );
}

function CascadeExportDialog({ open, onClose, matrices, initialSelectedIds }) {
  const [leftTab, setLeftTab] = useState('output');
  const [format, setFormat] = useState('svg');
  const [filename, setFilename] = useState('cascade_matrix_export');
  const [canvasWidth, setCanvasWidth] = useState(1600);
  const [canvasHeight, setCanvasHeight] = useState(1200);
  const [cornerRadius, setCornerRadius] = useState(6);
  const [themeId, setThemeId] = useState('default');
  const [zoom, setZoom] = useState(60);
  const [selected, setSelected] = useState(() => defaultSelectedMap(matrices, initialSelectedIds));
  const [includeParameterCoupling, setIncludeParameterCoupling] = useState(true);
  const [includeWeightingFactors, setIncludeWeightingFactors] = useState(true);
  const [includeNominalMarginSpecified, setIncludeNominalMarginSpecified] = useState(true);
  const [includeDirection, setIncludeDirection] = useState(true);
  const [includeRationale, setIncludeRationale] = useState(true);
  const [includeUncertaintyRows, setIncludeUncertaintyRows] = useState(true);
  const [includeScores, setIncludeScores] = useState(true);
  const [rowHeaderWidth, setRowHeaderWidth] = useState(160);
  const [rationaleWidth, setRationaleWidth] = useState(90);
  const [columnWidth, setColumnWidth] = useState(132);
  const [rowHeight, setRowHeight] = useState(30);
  const [textScale, setTextScale] = useState(1);
  const [fontFamily, setFontFamily] = useState('Segoe UI, Tahoma, sans-serif');
  const [busy, setBusy] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSelected(defaultSelectedMap(matrices, initialSelectedIds));
    setLeftTab('output');
  }, [open, matrices, initialSelectedIds]);

  const selectedMatrices = useMemo(
    () => (matrices || []).filter((m) => selected[m.id]),
    [matrices, selected]
  );

  const styleOptions = useMemo(() => ({
    includeParameterCoupling,
    includeWeightingFactors,
    includeNominalMarginSpecified,
    includeDirection,
    includeRationale,
    includeUncertaintyRows,
    includeScores,
    rowHeaderWidth: clamp(rowHeaderWidth, 90, 360),
    rationaleWidth: clamp(rationaleWidth, 0, 220),
    columnWidth: clamp(columnWidth, 72, 360),
    rowHeight: clamp(rowHeight, 24, 88),
    textScale: clamp(textScale, 0.7, 1.8),
    fontFamily,
  }), [
    includeParameterCoupling,
    includeWeightingFactors,
    includeNominalMarginSpecified,
    includeDirection,
    includeRationale,
    includeUncertaintyRows,
    includeScores,
    rowHeaderWidth,
    rationaleWidth,
    columnWidth,
    rowHeight,
    textScale,
    fontFamily,
  ]);

  const toggleMatrix = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (format === 'csv') {
        const csv = buildMatricesCsv(matrices || []);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, `${sanitizeName(filename)}.csv`);
        return;
      }
      if (!exportRef.current || selectedMatrices.length === 0) return;
      const width = clamp(canvasWidth, 600, 6000);
      const height = clamp(canvasHeight, 600, 12000);
      const svg = buildSvgFromNode(exportRef.current, width, height);
      if (format === 'svg') {
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(blob, `${sanitizeName(filename)}.svg`);
      } else {
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const img = await loadImage(svgUrl);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(svgUrl);
        const pngData = canvas.toDataURL('image/png');
        const pdfWidth = (width / 96) * 72;
        const pdfHeight = (height / 96) * 72;
        const pdf = new jsPDF({
          unit: 'pt',
          format: [pdfWidth, pdfHeight],
          orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
        });
        pdf.addImage(pngData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${sanitizeName(filename)}.pdf`);
      }
    } catch (error) {
      alert(`Export failed: ${error.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 450,
      background: 'rgba(15, 23, 42, 0.48)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    }}>
      <div style={{
        width: 'min(1460px, 97vw)',
        height: 'min(900px, 95vh)',
        background: '#FFFFFF',
        borderRadius: 14,
        border: '1px solid #CBD5E1',
        boxShadow: '0 28px 55px rgba(15, 23, 42, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 54,
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Export Matrices</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: '1px solid #CBD5E1', borderRadius: 8, background: '#FFFFFF', padding: '6px 10px', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '390px minmax(0, 1fr)' }}>
          <div style={{ borderRight: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '124px minmax(0, 1fr)', minHeight: 0 }}>
            <div style={{ borderRight: '1px solid #E2E8F0', padding: 10, background: '#F8FAFC' }}>
              {[
                { id: 'output', label: 'OUTPUT' },
                { id: 'elements', label: 'ELEMENTS' },
                { id: 'row-col', label: 'Row-Column' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLeftTab(tab.id)}
                  style={{
                    width: '100%',
                    marginBottom: 8,
                    border: leftTab === tab.id ? '1px solid #2563EB' : '1px solid #CBD5E1',
                    borderRadius: 8,
                    background: leftTab === tab.id ? '#DBEAFE' : '#FFFFFF',
                    color: leftTab === tab.id ? '#1E40AF' : '#334155',
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: 0.2,
                    padding: '8px 6px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ padding: 12, overflowY: 'auto' }}>
              {leftTab === 'output' && (
                <>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 6, textTransform: 'uppercase', fontWeight: 700 }}>Output</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      File name
                      <input
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        style={{ marginTop: 4, width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '7px 8px' }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Format
                      <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ marginTop: 4, width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '7px 8px' }}>
                        <option value="svg">SVG</option>
                        <option value="pdf">PDF</option>
                        <option value="csv">CSV (all matrices)</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ fontSize: 11, color: '#64748B', margin: '16px 0 6px', textTransform: 'uppercase', fontWeight: 700 }}>Sub-Matrices</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {(matrices || []).map((matrix) => (
                      <label key={matrix.id} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#334155', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!selected[matrix.id]}
                          onChange={() => toggleMatrix(matrix.id)}
                        />
                        {matrix.title}
                      </label>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, color: '#64748B', margin: '16px 0 6px', textTransform: 'uppercase', fontWeight: 700 }}>Canvas</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Width (px)
                      <input
                        type="number"
                        min={600}
                        max={6000}
                        value={canvasWidth}
                        onChange={(e) => setCanvasWidth(clamp(e.target.value, 600, 6000))}
                        style={{ marginTop: 4, width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '7px 8px' }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Height (px)
                      <input
                        type="number"
                        min={600}
                        max={12000}
                        value={canvasHeight}
                        onChange={(e) => setCanvasHeight(clamp(e.target.value, 600, 12000))}
                        style={{ marginTop: 4, width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '7px 8px' }}
                      />
                    </label>
                  </div>

                  <div style={{ fontSize: 11, color: '#64748B', margin: '16px 0 6px', textTransform: 'uppercase', fontWeight: 700 }}>Look</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Theme
                      <select value={themeId} onChange={(e) => setThemeId(e.target.value)} style={{ marginTop: 4, width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '7px 8px' }}>
                        {Object.entries(THEME_PRESETS).map(([id, theme]) => (
                          <option key={id} value={id}>{theme.label}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Corner roundness ({cornerRadius}px)
                      <input
                        type="range"
                        min={0}
                        max={24}
                        value={cornerRadius}
                        onChange={(e) => setCornerRadius(clamp(e.target.value, 0, 24))}
                        style={{ marginTop: 6, width: '100%' }}
                      />
                    </label>
                  </div>
                </>
              )}

              {leftTab === 'elements' && (
                <>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>Elements</div>
                  <div style={{ display: 'grid', gap: 7 }}>
                    {[
                      { key: 'includeParameterCoupling', label: 'Include parameter coupling box', value: includeParameterCoupling, setter: setIncludeParameterCoupling },
                      { key: 'includeWeightingFactors', label: 'Include weighting factors', value: includeWeightingFactors, setter: setIncludeWeightingFactors },
                      { key: 'includeNominalMarginSpecified', label: 'Include nominal/margin/specified box', value: includeNominalMarginSpecified, setter: setIncludeNominalMarginSpecified },
                      { key: 'includeDirection', label: 'Include direction row', value: includeDirection, setter: setIncludeDirection },
                      { key: 'includeRationale', label: 'Include rationale column', value: includeRationale, setter: setIncludeRationale },
                      { key: 'includeUncertaintyRows', label: 'Include uncertainty rows', value: includeUncertaintyRows, setter: setIncludeUncertaintyRows },
                      { key: 'includeScores', label: 'Include score and priority rows', value: includeScores, setter: setIncludeScores },
                    ].map((item) => (
                      <label key={item.key} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#334155', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={item.value}
                          onChange={(e) => item.setter(e.target.checked)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </>
              )}

              {leftTab === 'row-col' && (
                <>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>Row-Column Customisation</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Row header width ({clamp(rowHeaderWidth, 90, 360)} px)
                      <input type="range" min={90} max={360} value={rowHeaderWidth} onChange={(e) => setRowHeaderWidth(clamp(e.target.value, 90, 360))} style={{ marginTop: 6, width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Rationale column width ({clamp(rationaleWidth, 0, 220)} px)
                      <input type="range" min={0} max={220} value={rationaleWidth} onChange={(e) => setRationaleWidth(clamp(e.target.value, 0, 220))} style={{ marginTop: 6, width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Column width ({clamp(columnWidth, 72, 360)} px)
                      <input type="range" min={72} max={360} value={columnWidth} onChange={(e) => setColumnWidth(clamp(e.target.value, 72, 360))} style={{ marginTop: 6, width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Row height ({clamp(rowHeight, 24, 88)} px)
                      <input type="range" min={24} max={88} value={rowHeight} onChange={(e) => setRowHeight(clamp(e.target.value, 24, 88))} style={{ marginTop: 6, width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Text size scale ({clamp(textScale, 0.7, 1.8).toFixed(2)}x)
                      <input type="range" min={0.7} max={1.8} step={0.05} value={textScale} onChange={(e) => setTextScale(clamp(e.target.value, 0.7, 1.8))} style={{ marginTop: 6, width: '100%' }} />
                    </label>
                    <label style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                      Font family
                      <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} style={{ marginTop: 4, width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '7px 8px' }}>
                        <option value="Segoe UI, Tahoma, sans-serif">Segoe UI</option>
                        <option value="Arial, Helvetica, sans-serif">Arial</option>
                        <option value="Calibri, Candara, Segoe, sans-serif">Calibri</option>
                        <option value="Georgia, Times New Roman, serif">Georgia</option>
                        <option value="Trebuchet MS, Verdana, sans-serif">Trebuchet MS</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 42, borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Preview Zoom</span>
              <input type="range" min={30} max={140} value={zoom} onChange={(e) => setZoom(clamp(e.target.value, 30, 140))} />
              <span style={{ fontSize: 12, color: '#64748B' }}>{zoom}%</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#F1F5F9', padding: 14 }}>
              <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left', width: clamp(canvasWidth, 600, 6000), height: clamp(canvasHeight, 600, 12000) }}>
                <div
                  ref={exportRef}
                  style={{
                    width: clamp(canvasWidth, 600, 6000),
                    height: clamp(canvasHeight, 600, 12000),
                    overflow: 'hidden',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: 10,
                    padding: 14,
                    boxSizing: 'border-box',
                  }}
                >
                  {selectedMatrices.length === 0 ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontWeight: 600 }}>
                      Select at least one sub-matrix to preview and export.
                    </div>
                  ) : (
                    selectedMatrices.map((matrix) => (
                      <MatrixPreview
                        key={matrix.id}
                        matrix={matrix}
                        themeId={themeId}
                        cornerRadius={cornerRadius}
                        styleOptions={styleOptions}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          height: 56,
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          padding: '0 12px',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{ border: '1px solid #CBD5E1', borderRadius: 8, background: '#FFFFFF', padding: '8px 12px', cursor: 'pointer', fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (format !== 'csv' && selectedMatrices.length === 0)}
            onClick={handleExport}
            style={{
              border: 'none',
              borderRadius: 8,
              background: busy || (format !== 'csv' && selectedMatrices.length === 0) ? '#94A3B8' : '#2563EB',
              color: '#FFFFFF',
              padding: '8px 14px',
              cursor: busy || (format !== 'csv' && selectedMatrices.length === 0) ? 'not-allowed' : 'pointer',
              fontWeight: 700,
            }}
          >
            {busy ? 'Exporting...' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CascadeExportDialog;
