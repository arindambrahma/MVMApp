import React, { useEffect, useRef, useState } from 'react';

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return n < min ? min : n > max ? max : n;
}

function sanitizeName(name = 'chart') {
  return String(name).trim().replace(/[^\w.-]+/g, '_') || 'chart';
}

function pxPerUnit(unit, dpi) {
  if (unit === 'cm') return dpi / 2.54;
  if (unit === 'mm') return dpi / 25.4;
  return 1; // px
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * ChartExportDialog
 *
 * Reusable export dialog for SVG-based charts (line charts, scatter/bubble plots).
 *
 * Props:
 *   open          - boolean
 *   onClose       - function
 *   svgRef        - React ref to the <svg> DOM element
 *   chartType     - 'line' | 'scatter'
 *   defaultName   - suggested filename (no extension)
 *   legendItems   - [{label, color, dashed}]  — for line charts: appended as SVG legend strip
 */
function ChartExportDialog({
  open,
  onClose,
  svgRef,
  chartType = 'line',
  defaultName = 'chart',
  legendItems = [],
}) {
  const LEGEND_ROW_H = 20;
  const LEGEND_PAD = 10;
  const LEGEND_COLS = 3;

  const [filename, setFilename] = useState(defaultName);
  const [widthVal, setWidthVal] = useState(16);
  const [heightVal, setHeightVal] = useState(10);
  const [unit, setUnit] = useState('cm');
  const [dpi, setDpi] = useState(300);
  const [format, setFormat] = useState('svg');
  const [lockAspect, setLockAspect] = useState(true);
  const [ratio, setRatio] = useState(16 / 10);
  const [background, setBackground] = useState('#ffffff');
  const [includeLegend, setIncludeLegend] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [previewZoom, setPreviewZoom] = useState(100);

  const previewRef = useRef(null);

  // Seed filename and ratio from SVG dimensions when dialog opens
  useEffect(() => {
    if (!open) return;
    setFilename(defaultName);
    const svg = svgRef?.current;
    if (svg) {
      const svgW = Number(svg.getAttribute('width')) || 860;
      const svgH = Number(svg.getAttribute('height')) || 340;
      const r = svgW / svgH;
      setRatio(r);
      // Default ~16 cm wide, height from ratio
      setWidthVal(16);
      setHeightVal(+(16 / r).toFixed(2));
    }
  }, [open, defaultName, svgRef]);

  const toPx = (v) => Math.round(Math.max(100, Math.min(8000, Number(v) * pxPerUnit(unit, dpi))));
  const widthPx = toPx(widthVal);
  const heightPx = toPx(heightVal);

  const onWidthChange = (v) => {
    setWidthVal(v);
    if (lockAspect && ratio > 0) setHeightVal(+(Number(v) / ratio).toFixed(3));
    else setRatio(Number(v) / Number(heightVal) || ratio);
  };

  const onHeightChange = (v) => {
    setHeightVal(v);
    if (lockAspect && ratio > 0) setWidthVal(+(Number(v) * ratio).toFixed(3));
    else setRatio(Number(widthVal) / Number(v) || ratio);
  };

  // Build the export SVG string at the requested pixel dimensions
  const buildSvgString = (w, h) => {
    const svg = svgRef?.current;
    if (!svg) return null;

    const origW = Number(svg.getAttribute('width')) || w;
    const origH = Number(svg.getAttribute('height')) || h;

    // Legend strip height in original coordinate space
    const hasLegend = chartType === 'line' && includeLegend && legendItems.length > 0;
    const legendRows = hasLegend ? Math.ceil(legendItems.length / LEGEND_COLS) : 0;
    const legendH = hasLegend ? legendRows * LEGEND_ROW_H + LEGEND_PAD * 2 : 0;

    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(Math.round(h * (origH + legendH) / origH)));
    clone.setAttribute('viewBox', `0 0 ${origW} ${origH + legendH}`);
    clone.removeAttribute('style'); // remove inline style that sets display:block

    // Background rect
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', String(origW));
    bgRect.setAttribute('height', String(origH + legendH));
    bgRect.setAttribute('fill', background || '#ffffff');
    clone.insertBefore(bgRect, clone.firstChild);

    // Remove movement arrows for scatter if opted out
    if (chartType === 'scatter' && !showArrows) {
      Array.from(clone.querySelectorAll('line[marker-end]')).forEach(el => el.remove());
      Array.from(clone.querySelectorAll('marker')).forEach(el => el.remove());
    }

    // Append SVG legend strip for line charts
    if (hasLegend) {
      const legendG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      legendG.setAttribute('transform', `translate(20, ${origH + LEGEND_PAD})`);

      const colW = (origW - 40) / LEGEND_COLS;
      legendItems.forEach(({ label, color, dashed }, i) => {
        const row = Math.floor(i / LEGEND_COLS);
        const col = i % LEGEND_COLS;
        const itemG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        itemG.setAttribute('transform', `translate(${col * colW}, ${row * LEGEND_ROW_H})`);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', '8');
        line.setAttribute('x2', '18');
        line.setAttribute('y2', '8');
        line.setAttribute('stroke', color || '#2563EB');
        line.setAttribute('stroke-width', '2.5');
        if (dashed) line.setAttribute('stroke-dasharray', '6 4');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '23');
        text.setAttribute('y', '12');
        text.setAttribute('font-size', '10');
        text.setAttribute('fill', '#334155');
        text.setAttribute('font-family', 'system-ui, Arial, sans-serif');
        text.textContent = String(label || '');

        itemG.appendChild(line);
        itemG.appendChild(text);
        legendG.appendChild(itemG);
      });
      clone.appendChild(legendG);
    }

    return new XMLSerializer().serializeToString(clone);
  };

  const renderToCanvas = async (w, h) => {
    const svgStr = buildSvgString(w, h);
    if (!svgStr) return null;
    const b64 = btoa(unescape(encodeURIComponent(svgStr)));
    const dataUrl = `data:image/svg+xml;base64,${b64}`;
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || w;
    canvas.height = img.naturalHeight || h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas;
  };

  const handleExport = async () => {
    if (format === 'svg') {
      const svgStr = buildSvgString(widthPx, heightPx);
      if (!svgStr) return;
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeName(filename)}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    const canvas = await renderToCanvas(widthPx, heightPx);
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeName(filename)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  // Redraw preview canvas whenever settings change
  useEffect(() => {
    if (!open) return;
    const canvas = previewRef.current;
    if (!canvas) return;
    const PREVIEW_MAX = 460;
    const pw = Math.min(PREVIEW_MAX, widthPx);
    const svgStr = buildSvgString(pw, Math.round(pw * heightPx / widthPx));
    if (!svgStr) return;
    const b64 = btoa(unescape(encodeURIComponent(svgStr)));
    const dataUrl = `data:image/svg+xml;base64,${b64}`;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth || pw;
      canvas.height = img.naturalHeight || Math.round(pw * heightPx / widthPx);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = background || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, widthPx, heightPx, background, includeLegend, showArrows]);

  if (!open) return null;

  const inputStyle = {
    width: '100%', padding: '5px 8px', borderRadius: 6,
    border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 };
  const typeLabel = chartType === 'line' ? 'Sensitivity Chart' : 'Redesign Plot';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', width: '92vw', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Export {typeLabel}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Settings panel */}
          <div style={{ width: 224, borderRight: '1px solid #e2e8f0', padding: '14px 12px', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

            <div>
              <label style={labelStyle}>Filename</label>
              <input style={inputStyle} value={filename} onChange={e => setFilename(e.target.value)} placeholder="chart" />
            </div>

            <div>
              <label style={labelStyle}>Format</label>
              <select style={inputStyle} value={format} onChange={e => setFormat(e.target.value)}>
                <option value="svg">SVG (vector)</option>
                <option value="png">PNG (raster)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <label style={labelStyle}>Width</label>
                <input style={inputStyle} type="text" inputMode="decimal" value={widthVal}
                  onChange={e => onWidthChange(e.target.value)}
                  onBlur={e => { const v = clamp(e.target.value, 0.1, 1000); onWidthChange(v); }} />
              </div>
              <div>
                <label style={labelStyle}>Height</label>
                <input style={inputStyle} type="text" inputMode="decimal" value={heightVal}
                  onChange={e => onHeightChange(e.target.value)}
                  onBlur={e => { const v = clamp(e.target.value, 0.1, 1000); onHeightChange(v); }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: format === 'png' ? '1fr 1fr' : '1fr', gap: 6 }}>
              <div>
                <label style={labelStyle}>Unit</label>
                <select style={inputStyle} value={unit} onChange={e => setUnit(e.target.value)}>
                  <option value="cm">cm</option>
                  <option value="mm">mm</option>
                  <option value="px">px</option>
                </select>
              </div>
              {format === 'png' && (
                <div>
                  <label style={labelStyle}>DPI</label>
                  <input style={inputStyle} type="number" value={dpi} min={72} max={1200}
                    onChange={e => setDpi(clamp(e.target.value, 72, 1200))} />
                </div>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
              <input type="checkbox" checked={lockAspect}
                onChange={e => { setLockAspect(e.target.checked); if (!e.target.checked) setRatio(Number(widthVal) / Number(heightVal)); }} />
              Lock aspect ratio
            </label>

            <div>
              <label style={labelStyle}>Background colour</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="color" value={background} onChange={e => setBackground(e.target.value)}
                  style={{ width: 36, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                <input style={{ ...inputStyle, flex: 1, minWidth: 0 }} value={background} onChange={e => setBackground(e.target.value)} />
              </div>
            </div>

            {chartType === 'line' && legendItems.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={includeLegend} onChange={e => setIncludeLegend(e.target.checked)} />
                Include series legend
              </label>
            )}

            {chartType === 'scatter' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={showArrows} onChange={e => setShowArrows(e.target.checked)} />
                Show movement arrows
              </label>
            )}

            <div style={{ fontSize: 10, color: '#94a3b8', paddingTop: 2, lineHeight: 1.6 }}>
              Output: {widthPx} × {heightPx} px
              {format === 'png' && <><br />@ {dpi} DPI</>}
            </div>
          </div>

          {/* Preview */}
          <div style={{ flex: 1, background: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden', gap: 8 }}>
            <canvas
              ref={previewRef}
              style={{
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 12px rgba(15,23,42,0.1)',
                maxWidth: '100%',
                maxHeight: 'calc(100% - 44px)',
                transform: `scale(${previewZoom / 100})`,
                transformOrigin: 'center center',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', flexShrink: 0 }}>
              <span>Zoom</span>
              <input type="range" min={25} max={200} step={5} value={previewZoom}
                onChange={e => setPreviewZoom(Number(e.target.value))} style={{ width: 90 }} />
              <span>{previewZoom}%</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fff' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button type="button" onClick={handleExport}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {format === 'svg' ? 'Export SVG' : 'Export PNG'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default ChartExportDialog;
