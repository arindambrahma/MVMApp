import React, { useEffect, useRef, useState } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return n < min ? min : n > max ? max : n;
}

function sanitizeName(name = 'chart') {
  return String(name).trim().replace(/[^\w.-]+/g, '_') || 'chart';
}

function pxPerUnit(unit, dpi) {
  if (unit === 'cm') return dpi / 2.54;
  if (unit === 'mm') return dpi / 25.4;
  return 1;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const SERIES_COLORS = ['#2563EB', '#DC2626', '#0891B2', '#D97706', '#059669', '#7C3AED', '#DB2777'];

const SYSTEM_FONTS = [
  'System UI', 'Aptos Narrow', 'Segoe UI', 'Helvetica', 'Arial',
  'Verdana', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman',
  'Century Gothic', 'Trebuchet MS', 'Courier New',
];

// ── Layout computation ────────────────────────────────────────────────────────

function fontPx(pt, dpi) {
  return Math.max(1, Number(pt) * (dpi / 72));
}

function computeLayout(W, H, opts) {
  const {
    dpi = 96, padding = 20,
    showTitle = false, titleSize = 11,
    showAxes = true, showAxisLabels = true,
    axisValueFontSize = 10, axisHeaderFontSize = 11,
    legendRows = 0, showLegend = false, legendFontSize = 10,
  } = opts;

  const tickPx  = fontPx(axisValueFontSize, dpi);
  const hdrPx   = fontPx(axisHeaderFontSize, dpi);
  const legPx   = fontPx(legendFontSize, dpi);
  const titlePx = showTitle ? fontPx(titleSize, dpi) : 0;

  const yTickApproxW = showAxes ? tickPx * 5.2 + 6 : 0;
  const yLabelW      = showAxisLabels ? hdrPx * 1.5 + 6 : 0;
  const xTickH       = showAxes ? tickPx + 6 : 0;
  const xLabelH      = showAxisLabels ? hdrPx * 1.5 + 4 : 0;
  const legH         = (showLegend && legendRows > 0) ? legendRows * (legPx * 1.7 + 2) + 6 : 0;

  const left   = padding + yTickApproxW + yLabelW;
  const right  = padding + 16;
  const top    = padding + (showTitle ? titlePx + 10 : 0) + 6;
  const bottom = padding + Math.max(xTickH, xLabelH);

  return {
    tickPx, hdrPx, legPx, titlePx,
    left, right, top, bottom, legH,
    plotX: left,
    plotY: top,
    plotW: Math.max(60, W - left - right),
    plotH: Math.max(60, H - top - bottom - legH),
    legY:  H - bottom - legH + 6,
  };
}

// ── Data scales ───────────────────────────────────────────────────────────────

function getLineScales(series, xDomainProp, yDomainProp) {
  const allPts = (series || []).flatMap(s => s.points || []);
  if (!allPts.length) return null;
  const xs = allPts.map(p => p.x);
  const ys = allPts.map(p => p.y);
  const xMin0 = Math.min(...xs), xMax0 = Math.max(...xs);
  const yMin0 = Math.min(...ys), yMax0 = Math.max(...ys);
  const yPad = Math.max(0.02, (yMax0 - yMin0) * 0.08);
  return {
    minX: xDomainProp?.min ?? xMin0,
    maxX: xDomainProp?.max ?? xMax0,
    minY: yDomainProp?.min ?? Math.min(yMin0 - yPad, 0),
    maxY: yDomainProp?.max ?? Math.max(yMax0 + yPad, 0),
  };
}

function getScatterScales(baselinePoints, overlayPoints, xDomainProp, yDomainProp) {
  const all = [...(baselinePoints || []), ...(overlayPoints || [])];
  if (!all.length) return null;
  const xs = all.map(p => Number(p.x)).filter(Number.isFinite);
  const ys = all.map(p => Number(p.y)).filter(Number.isFinite);
  const xMin0 = Math.min(...xs), xMax0 = Math.max(...xs);
  const yMin0 = Math.min(...ys), yMax0 = Math.max(...ys);
  const xPad = Math.max(0.002, (xMax0 - xMin0) * 0.1);
  const yPad = Math.max(0.002, (yMax0 - yMin0) * 0.1);
  return {
    minX: xDomainProp?.min ?? Math.max(0, xMin0 - xPad),
    maxX: xDomainProp?.max ?? xMax0 + xPad,
    minY: yDomainProp?.min ?? Math.max(0, yMin0 - yPad),
    maxY: yDomainProp?.max ?? yMax0 + yPad,
  };
}

// ── SVG builder (line chart) ──────────────────────────────────────────────────

function buildLineSvg(W, H, series, extraLines, opts) {
  const {
    dpi = 300, padding = 20, background = '#ffffff',
    showTitle = false, title = '', titleColor = '#0f172a', titleFont = 'Arial', titleSize = 11,
    showAxes = true, showGridlines = true, showAxisLabels = true, showLegend = true,
    axisFont = 'Arial', axisValueFontSize = 10, axisHeaderFontSize = 11, axisColor = '#475569',
    xAxisLabel = '', yAxisLabel = '', xDecimals = 3, yDecimals = 1,
    useCustomBounds = false, xMin = 0, xMax = 1, yMin = -0.1, yMax = 0.1,
    seriesColors = SERIES_COLORS, legendFontSize = 10,
    xDomainProp = null, yDomainProp = null,
  } = opts;

  const scales = getLineScales(series, xDomainProp, yDomainProp);
  if (!scales) return null;
  let { minX, maxX, minY, maxY } = scales;
  if (useCustomBounds) {
    const cMinX = Number(xMin), cMaxX = Number(xMax), cMinY = Number(yMin), cMaxY = Number(yMax);
    if (Number.isFinite(cMinX) && Number.isFinite(cMaxX) && cMinX < cMaxX) { minX = cMinX; maxX = cMaxX; }
    if (Number.isFinite(cMinY) && Number.isFinite(cMaxY) && cMinY < cMaxY) { minY = cMinY; maxY = cMaxY; }
  }

  const legendRows = showLegend ? Math.ceil((series || []).length / 3) : 0;
  const layout = computeLayout(W, H, {
    dpi, padding, showTitle, titleSize,
    showAxes, showAxisLabels, axisValueFontSize, axisHeaderFontSize,
    legendRows, showLegend, legendFontSize,
  });
  const { tickPx, hdrPx, legPx, titlePx, left, plotX, plotY, plotW, plotH, legY } = layout;

  const xScale = x => maxX === minX ? plotX + plotW / 2 : plotX + ((x - minX) / (maxX - minX)) * plotW;
  const yScale = y => maxY === minY ? plotY + plotH / 2 : plotY + ((maxY - y) / (maxY - minY)) * plotH;
  const xAxisY = Math.min(Math.max(yScale(0), plotY), plotY + plotH);

  const yTicks = 5;
  const xTicks = 6;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (i / yTicks) * (maxY - minY));
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + (i / xTicks) * (maxX - minX));
  const font = `${esc(axisFont)}, Arial, sans-serif`;

  const svg = [];
  svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svg.push(`<rect width="${W}" height="${H}" fill="${esc(background)}"/>`);

  if (showTitle && title) {
    svg.push(`<text x="${padding}" y="${padding + titlePx * 0.85}" font-family="${font}" font-size="${titlePx}" font-weight="700" fill="${esc(titleColor)}">${esc(title)}</text>`);
  }

  // Gridlines
  if (showGridlines) {
    yTickVals.forEach(v => {
      const yy = yScale(v);
      svg.push(`<line x1="${plotX}" y1="${yy}" x2="${plotX + plotW}" y2="${yy}" stroke="#E2E8F0" stroke-width="1"/>`);
    });
    xTickVals.forEach(v => {
      const xx = xScale(v);
      svg.push(`<line x1="${xx}" y1="${plotY}" x2="${xx}" y2="${plotY + plotH}" stroke="#F1F5F9" stroke-width="1"/>`);
    });
  }

  // Axes
  if (showAxes) {
    yTickVals.forEach(v => {
      const yy = yScale(v);
      svg.push(`<text x="${plotX - 6}" y="${yy + tickPx * 0.35}" text-anchor="end" font-size="${tickPx}" font-family="${font}" fill="${esc(axisColor)}">${(v * 100).toFixed(yDecimals)}%</text>`);
    });
    xTickVals.forEach(v => {
      const xx = xScale(v);
      const labelY = Math.min(plotY + plotH + tickPx + 4, xAxisY + tickPx + 4);
      svg.push(`<text x="${xx}" y="${labelY}" text-anchor="middle" font-size="${tickPx}" font-family="${font}" fill="${esc(axisColor)}">${v.toFixed(xDecimals)}</text>`);
    });
    // Y-axis line
    svg.push(`<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotH}" stroke="#475569" stroke-width="1.2"/>`);
    // X-axis at y=0
    svg.push(`<line x1="${plotX}" y1="${xAxisY}" x2="${plotX + plotW}" y2="${xAxisY}" stroke="#475569" stroke-width="1.6"/>`);
  }

  // Axis labels
  if (showAxisLabels) {
    if (xAxisLabel) {
      svg.push(`<text x="${plotX + plotW / 2}" y="${plotY + plotH + (showAxes ? tickPx + 10 : 6) + hdrPx}" text-anchor="middle" font-size="${hdrPx}" font-weight="700" font-family="${font}" fill="${esc(axisColor)}">${esc(xAxisLabel)}</text>`);
    }
    if (yAxisLabel) {
      const tx = Math.max(hdrPx * 0.8, left - tickPx * 5.2 - 8);
      svg.push(`<text x="${tx}" y="${plotY + plotH / 2}" text-anchor="middle" font-size="${hdrPx}" font-weight="700" font-family="${font}" fill="${esc(axisColor)}" transform="rotate(-90 ${tx} ${plotY + plotH / 2})">${esc(yAxisLabel)}</text>`);
    }
  }

  // Extra reference lines
  (extraLines || []).forEach(line => {
    const yy = yScale(line.value);
    const c = esc(line.color || '#f97316');
    svg.push(`<line x1="${plotX}" y1="${yy}" x2="${plotX + plotW}" y2="${yy}" stroke="${c}" stroke-width="1" stroke-dasharray="6 4"/>`);
    svg.push(`<text x="${plotX + plotW - 4}" y="${yy - 4}" text-anchor="end" font-size="${tickPx * 0.88}" font-family="${font}" fill="${c}">${esc(line.label || '')}</text>`);
  });

  // Series lines
  (series || []).forEach((s, idx) => {
    const color = esc(seriesColors[idx] || SERIES_COLORS[idx % SERIES_COLORS.length]);
    const isPerf = String(s.key || '').startsWith('perf_');
    const pts = (s.points || []).map(p => `${xScale(p.x)},${yScale(p.y)}`).join(' ');
    if (pts) {
      svg.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" ${isPerf ? 'stroke-dasharray="6 4"' : ''}/>`);
    }
  });

  // Legend
  if (showLegend && (series || []).length > 0) {
    const cols = 3;
    const colW = plotW / cols;
    (series || []).forEach((s, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const lx = plotX + col * colW;
      const ly = legY + row * (legPx * 1.7 + 2);
      const color = esc(seriesColors[idx] || SERIES_COLORS[idx % SERIES_COLORS.length]);
      const isPerf = String(s.key || '').startsWith('perf_');
      svg.push(`<line x1="${lx}" y1="${ly + legPx * 0.5}" x2="${lx + 18}" y2="${ly + legPx * 0.5}" stroke="${color}" stroke-width="2.5" ${isPerf ? 'stroke-dasharray="6 4"' : ''}/>`);
      svg.push(`<text x="${lx + 22}" y="${ly + legPx * 0.85}" font-size="${legPx}" font-family="${font}" fill="#334155">${esc(s.label || '')}</text>`);
    });
  }

  svg.push(`</svg>`);
  return svg.join('\n');
}

// ── SVG builder (scatter chart) ───────────────────────────────────────────────

function buildScatterSvg(W, H, baselinePoints, overlayPoints, opts) {
  const {
    dpi = 300, padding = 20, background = '#ffffff',
    showTitle = false, title = '', titleColor = '#0f172a', titleFont = 'Arial', titleSize = 11,
    showAxes = true, showGridlines = true, showAxisLabels = true,
    showPointLabels = true, showArrows = true,
    axisFont = 'Arial', axisValueFontSize = 10, axisHeaderFontSize = 11, axisColor = '#475569',
    xAxisLabel = 'Undesirable impact on performance parameters (%)',
    yAxisLabel = 'Change absorption potential (%)',
    xDecimals = 2, yDecimals = 2,
    useCustomBounds = false, xMin = 0, xMax = 10, yMin = 0, yMax = 50,
    baselineColor = '#9CA3AF', overlayColor = '#F59E0B', arrowColor = '#94A3B8',
    baselineOpacity = 35, overlayOpacity = 32, pointLabelSize = 10,
    xDomainProp = null, yDomainProp = null,
  } = opts;

  const scales = getScatterScales(baselinePoints, overlayPoints, xDomainProp, yDomainProp);
  if (!scales) return null;
  let { minX, maxX, minY, maxY } = scales;
  if (useCustomBounds) {
    const cMinX = Number(xMin), cMaxX = Number(xMax), cMinY = Number(yMin), cMaxY = Number(yMax);
    if (Number.isFinite(cMinX) && Number.isFinite(cMaxX) && cMinX < cMaxX) { minX = cMinX * 0.01; maxX = cMaxX * 0.01; }
    if (Number.isFinite(cMinY) && Number.isFinite(cMaxY) && cMinY < cMaxY) { minY = cMinY * 0.01; maxY = cMaxY * 0.01; }
  }

  const layout = computeLayout(W, H, {
    dpi, padding, showTitle, titleSize,
    showAxes, showAxisLabels, axisValueFontSize, axisHeaderFontSize,
    legendRows: 0, showLegend: false,
  });
  const { tickPx, hdrPx, titlePx, left, plotX, plotY, plotW, plotH } = layout;

  const xScale = x => maxX === minX ? plotX + plotW / 2 : plotX + ((x - minX) / (maxX - minX)) * plotW;
  const yScale = y => maxY === minY ? plotY + plotH / 2 : plotY + ((maxY - y) / (maxY - minY)) * plotH;

  const yTicks = 6, xTicks = 6;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (i / yTicks) * (maxY - minY));
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + (i / xTicks) * (maxX - minX));
  const font = `${esc(axisFont)}, Arial, sans-serif`;

  const all = [...(baselinePoints || []), ...(overlayPoints || [])];
  const allR = all.map(p => Math.abs(p.r || 6));
  const maxAllR = Math.max(1, ...allR);
  const scaleRef = Math.max(0.5, Math.min(plotW, plotH) / 380);
  const minR = 4 * scaleRef, maxRr = 22 * scaleRef;
  const getR = r => clamp(Number(r || 6) * scaleRef, minR, maxRr);

  const labelFontPx = fontPx(pointLabelSize, dpi);

  const svg = [];
  svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  svg.push(`<defs><marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="${esc(arrowColor)}" opacity="0.6"/></marker></defs>`);
  svg.push(`<rect width="${W}" height="${H}" fill="${esc(background)}"/>`);

  if (showTitle && title) {
    svg.push(`<text x="${padding}" y="${padding + titlePx * 0.85}" font-family="${font}" font-size="${titlePx}" font-weight="700" fill="${esc(titleColor)}">${esc(title)}</text>`);
  }

  // Gridlines
  if (showGridlines) {
    yTickVals.forEach(v => {
      const yy = yScale(v);
      svg.push(`<line x1="${plotX}" y1="${yy}" x2="${plotX + plotW}" y2="${yy}" stroke="#E2E8F0" stroke-width="1"/>`);
    });
    xTickVals.forEach(v => {
      const xx = xScale(v);
      svg.push(`<line x1="${xx}" y1="${plotY}" x2="${xx}" y2="${plotY + plotH}" stroke="#F1F5F9" stroke-width="1"/>`);
    });
  }

  // Axes
  if (showAxes) {
    yTickVals.forEach(v => {
      svg.push(`<text x="${plotX - 6}" y="${yScale(v) + tickPx * 0.35}" text-anchor="end" font-size="${tickPx}" font-family="${font}" fill="${esc(axisColor)}">${(v * 100).toFixed(yDecimals)}</text>`);
    });
    xTickVals.forEach(v => {
      svg.push(`<text x="${xScale(v)}" y="${plotY + plotH + tickPx + 4}" text-anchor="middle" font-size="${tickPx}" font-family="${font}" fill="${esc(axisColor)}">${(v * 100).toFixed(xDecimals)}</text>`);
    });
    svg.push(`<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotH}" stroke="#475569" stroke-width="1.2"/>`);
    svg.push(`<line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="#475569" stroke-width="1.2"/>`);
  }

  if (showAxisLabels) {
    if (xAxisLabel) {
      svg.push(`<text x="${plotX + plotW / 2}" y="${plotY + plotH + (showAxes ? tickPx + 10 : 6) + hdrPx}" text-anchor="middle" font-size="${hdrPx}" font-weight="700" font-family="${font}" fill="${esc(axisColor)}">${esc(xAxisLabel)}</text>`);
    }
    if (yAxisLabel) {
      const tx = Math.max(hdrPx * 0.8, left - tickPx * 5.2 - 8);
      svg.push(`<text x="${tx}" y="${plotY + plotH / 2}" text-anchor="middle" font-size="${hdrPx}" font-weight="700" font-family="${font}" fill="${esc(axisColor)}" transform="rotate(-90 ${tx} ${plotY + plotH / 2})">${esc(yAxisLabel)}</text>`);
    }
  }

  // Arrows
  if (showArrows) {
    const baseMap = new Map((baselinePoints || []).map(p => [p.label, p]));
    (overlayPoints || []).forEach(p => {
      const base = baseMap.get(p.label);
      if (!base) return;
      const dx = Number(p.x) - Number(base.x), dy = Number(p.y) - Number(base.y);
      if (Math.hypot(dx, dy) < 1e-6) return;
      svg.push(`<line x1="${xScale(base.x)}" y1="${yScale(base.y)}" x2="${xScale(p.x)}" y2="${yScale(p.y)}" stroke="${esc(arrowColor)}" stroke-width="1" stroke-opacity="0.5" marker-end="url(#arr)"/>`);
    });
  }

  // Baseline points
  const bOp = (clamp(baselineOpacity, 0, 100) / 100).toFixed(3);
  (baselinePoints || []).forEach(p => {
    const cx = xScale(Number(p.x)), cy = yScale(Number(p.y)), r = getR(p.r);
    svg.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(baselineColor)}" fill-opacity="${bOp}" stroke="${esc(baselineColor)}" stroke-width="1"/>`);
    if (showPointLabels) {
      svg.push(`<text x="${cx}" y="${cy - r - 3}" text-anchor="middle" font-size="${labelFontPx}" font-family="${font}" fill="#334155">${esc(p.label || '')}</text>`);
    }
  });

  // Overlay points
  const oOp = (clamp(overlayOpacity, 0, 100) / 100).toFixed(3);
  (overlayPoints || []).forEach(p => {
    const cx = xScale(Number(p.x)), cy = yScale(Number(p.y)), r = getR(p.r);
    svg.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(overlayColor)}" fill-opacity="${oOp}" stroke="#B45309" stroke-width="1.4"/>`);
    if (showPointLabels) {
      svg.push(`<text x="${cx}" y="${cy - r - 3}" text-anchor="middle" font-size="${labelFontPx}" font-weight="700" font-family="${font}" fill="#9A3412">${esc(p.label || '')}</text>`);
    }
  });

  svg.push(`</svg>`);
  return svg.join('\n');
}

// ── Canvas renderer (line chart) ──────────────────────────────────────────────

function renderLineCanvas(canvas, series, extraLines, opts) {
  const W = canvas.width, H = canvas.height;
  const {
    dpi = 96, padding = 20, background = '#ffffff',
    showTitle = false, title = '', titleColor = '#0f172a', titleFont = 'Arial', titleSize = 11,
    showAxes = true, showGridlines = true, showAxisLabels = true, showLegend = true,
    axisFont = 'Arial', axisValueFontSize = 10, axisHeaderFontSize = 11, axisColor = '#475569',
    xAxisLabel = '', yAxisLabel = '', xDecimals = 3, yDecimals = 1,
    useCustomBounds = false, xMin = 0, xMax = 1, yMin = -0.1, yMax = 0.1,
    seriesColors = SERIES_COLORS, legendFontSize = 10,
    xDomainProp = null, yDomainProp = null,
  } = opts;

  const scales = getLineScales(series, xDomainProp, yDomainProp);
  if (!scales) return;
  let { minX, maxX, minY, maxY } = scales;
  if (useCustomBounds) {
    const cMinX = Number(xMin), cMaxX = Number(xMax), cMinY = Number(yMin), cMaxY = Number(yMax);
    if (Number.isFinite(cMinX) && Number.isFinite(cMaxX) && cMinX < cMaxX) { minX = cMinX; maxX = cMaxX; }
    if (Number.isFinite(cMinY) && Number.isFinite(cMaxY) && cMinY < cMaxY) { minY = cMinY; maxY = cMaxY; }
  }

  const legendRows = showLegend ? Math.ceil((series || []).length / 3) : 0;
  const layout = computeLayout(W, H, {
    dpi, padding, showTitle, titleSize,
    showAxes, showAxisLabels, axisValueFontSize, axisHeaderFontSize,
    legendRows, showLegend, legendFontSize,
  });
  const { tickPx, hdrPx, legPx, titlePx, left, plotX, plotY, plotW, plotH, legY } = layout;

  const xScale = x => maxX === minX ? plotX + plotW / 2 : plotX + ((x - minX) / (maxX - minX)) * plotW;
  const yScale = y => maxY === minY ? plotY + plotH / 2 : plotY + ((maxY - y) / (maxY - minY)) * plotH;
  const xAxisY = Math.min(Math.max(yScale(0), plotY), plotY + plotH);

  const yTicks = 5, xTicks = 6;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (i / yTicks) * (maxY - minY));
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + (i / xTicks) * (maxX - minX));
  const fontStr = `${axisFont}, Arial, sans-serif`;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  if (showTitle && title) {
    ctx.font = `700 ${titlePx}px ${titleFont}, Arial, sans-serif`;
    ctx.fillStyle = titleColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, padding, padding);
  }

  if (showGridlines) {
    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
    yTickVals.forEach(v => { const yy = yScale(v); ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke(); });
    ctx.strokeStyle = '#F1F5F9';
    xTickVals.forEach(v => { const xx = xScale(v); ctx.beginPath(); ctx.moveTo(xx, plotY); ctx.lineTo(xx, plotY + plotH); ctx.stroke(); });
  }

  if (showAxes) {
    ctx.font = `${tickPx}px ${fontStr}`;
    ctx.fillStyle = axisColor;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yTickVals.forEach(v => { ctx.fillText(`${(v * 100).toFixed(yDecimals)}%`, plotX - 6, yScale(v)); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xTickVals.forEach(v => {
      const xx = xScale(v);
      const labelY = Math.min(plotY + plotH + 4, xAxisY + 4);
      ctx.fillText(v.toFixed(xDecimals), xx, labelY + tickPx * 0.1);
    });
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(plotX, plotY); ctx.lineTo(plotX, plotY + plotH); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(plotX, xAxisY); ctx.lineTo(plotX + plotW, xAxisY); ctx.stroke();
  }

  if (showAxisLabels) {
    ctx.font = `700 ${hdrPx}px ${fontStr}`; ctx.fillStyle = axisColor;
    if (xAxisLabel) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(xAxisLabel, plotX + plotW / 2, plotY + plotH + (showAxes ? tickPx + 8 : 4) + 2);
    }
    if (yAxisLabel) {
      const tx = Math.max(hdrPx * 0.8, left - tickPx * 5.2 - 8);
      ctx.save();
      ctx.translate(tx, plotY + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(yAxisLabel, 0, 0);
      ctx.restore();
    }
  }

  (extraLines || []).forEach(line => {
    const yy = yScale(line.value);
    ctx.save(); ctx.setLineDash([6, 4]);
    ctx.strokeStyle = line.color || '#f97316'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = line.color || '#f97316';
    ctx.font = `${tickPx * 0.88}px ${fontStr}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(line.label || '', plotX + plotW - 4, yy - 2);
  });

  (series || []).forEach((s, idx) => {
    const color = seriesColors[idx] || SERIES_COLORS[idx % SERIES_COLORS.length];
    const isPerf = String(s.key || '').startsWith('perf_');
    ctx.save();
    if (isPerf) ctx.setLineDash([6, 4]);
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
    ctx.beginPath();
    (s.points || []).forEach((p, i) => {
      const xx = xScale(p.x), yy = yScale(p.y);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    });
    ctx.stroke(); ctx.restore();
  });

  if (showLegend && (series || []).length > 0) {
    const cols = 3;
    const colW = plotW / cols;
    (series || []).forEach((s, idx) => {
      const row = Math.floor(idx / cols), col = idx % cols;
      const lx = plotX + col * colW, ly = legY + row * (legPx * 1.7 + 2);
      const color = seriesColors[idx] || SERIES_COLORS[idx % SERIES_COLORS.length];
      const isPerf = String(s.key || '').startsWith('perf_');
      ctx.save();
      if (isPerf) ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(lx, ly + legPx * 0.5); ctx.lineTo(lx + 18, ly + legPx * 0.5); ctx.stroke();
      ctx.restore();
      ctx.font = `${legPx}px ${fontStr}`; ctx.fillStyle = '#334155';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(s.label || '', lx + 22, ly);
    });
  }
}

// ── Canvas renderer (scatter chart) ──────────────────────────────────────────

function renderScatterCanvas(canvas, baselinePoints, overlayPoints, opts) {
  const W = canvas.width, H = canvas.height;
  const {
    dpi = 96, padding = 20, background = '#ffffff',
    showTitle = false, title = '', titleColor = '#0f172a', titleFont = 'Arial', titleSize = 11,
    showAxes = true, showGridlines = true, showAxisLabels = true,
    showPointLabels = true, showArrows = true,
    axisFont = 'Arial', axisValueFontSize = 10, axisHeaderFontSize = 11, axisColor = '#475569',
    xAxisLabel = 'Undesirable impact on performance parameters (%)',
    yAxisLabel = 'Change absorption potential (%)',
    xDecimals = 2, yDecimals = 2,
    useCustomBounds = false, xMin = 0, xMax = 10, yMin = 0, yMax = 50,
    baselineColor = '#9CA3AF', overlayColor = '#F59E0B', arrowColor = '#94A3B8',
    baselineOpacity = 35, overlayOpacity = 32, pointLabelSize = 10,
    xDomainProp = null, yDomainProp = null,
  } = opts;

  const scales = getScatterScales(baselinePoints, overlayPoints, xDomainProp, yDomainProp);
  if (!scales) return;
  let { minX, maxX, minY, maxY } = scales;
  if (useCustomBounds) {
    const cMinX = Number(xMin), cMaxX = Number(xMax), cMinY = Number(yMin), cMaxY = Number(yMax);
    if (Number.isFinite(cMinX) && Number.isFinite(cMaxX) && cMinX < cMaxX) { minX = cMinX * 0.01; maxX = cMaxX * 0.01; }
    if (Number.isFinite(cMinY) && Number.isFinite(cMaxY) && cMinY < cMaxY) { minY = cMinY * 0.01; maxY = cMaxY * 0.01; }
  }

  const layout = computeLayout(W, H, {
    dpi, padding, showTitle, titleSize,
    showAxes, showAxisLabels, axisValueFontSize, axisHeaderFontSize,
    legendRows: 0, showLegend: false,
  });
  const { tickPx, hdrPx, titlePx, left, plotX, plotY, plotW, plotH } = layout;

  const xScale = x => maxX === minX ? plotX + plotW / 2 : plotX + ((x - minX) / (maxX - minX)) * plotW;
  const yScale = y => maxY === minY ? plotY + plotH / 2 : plotY + ((maxY - y) / (maxY - minY)) * plotH;

  const yTicks = 6, xTicks = 6;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (i / yTicks) * (maxY - minY));
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + (i / xTicks) * (maxX - minX));
  const fontStr = `${axisFont}, Arial, sans-serif`;

  const all = [...(baselinePoints || []), ...(overlayPoints || [])];
  const scaleRef = Math.max(0.5, Math.min(plotW, plotH) / 380);
  const minRr = 4 * scaleRef, maxRr = 22 * scaleRef;
  const getR = r => clamp(Number(r || 6) * scaleRef, minRr, maxRr);
  const labelFontPx = fontPx(pointLabelSize, dpi);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  if (showTitle && title) {
    ctx.font = `700 ${titlePx}px ${titleFont}, Arial, sans-serif`;
    ctx.fillStyle = titleColor; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, padding, padding);
  }

  if (showGridlines) {
    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
    yTickVals.forEach(v => { const yy = yScale(v); ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke(); });
    ctx.strokeStyle = '#F1F5F9';
    xTickVals.forEach(v => { const xx = xScale(v); ctx.beginPath(); ctx.moveTo(xx, plotY); ctx.lineTo(xx, plotY + plotH); ctx.stroke(); });
  }

  if (showAxes) {
    ctx.font = `${tickPx}px ${fontStr}`; ctx.fillStyle = axisColor;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yTickVals.forEach(v => { ctx.fillText((v * 100).toFixed(yDecimals), plotX - 6, yScale(v)); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xTickVals.forEach(v => { ctx.fillText((v * 100).toFixed(xDecimals), xScale(v), plotY + plotH + 4); });
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(plotX, plotY); ctx.lineTo(plotX, plotY + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(plotX, plotY + plotH); ctx.lineTo(plotX + plotW, plotY + plotH); ctx.stroke();
  }

  if (showAxisLabels) {
    ctx.font = `700 ${hdrPx}px ${fontStr}`; ctx.fillStyle = axisColor;
    if (xAxisLabel) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(xAxisLabel, plotX + plotW / 2, plotY + plotH + (showAxes ? tickPx + 8 : 4) + 2);
    }
    if (yAxisLabel) {
      const tx = Math.max(hdrPx * 0.8, left - tickPx * 5.2 - 8);
      ctx.save(); ctx.translate(tx, plotY + plotH / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(yAxisLabel, 0, 0); ctx.restore();
    }
  }

  // Arrows
  if (showArrows) {
    const baseMap = new Map((baselinePoints || []).map(p => [p.label, p]));
    ctx.strokeStyle = arrowColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    (overlayPoints || []).forEach(p => {
      const base = baseMap.get(p.label);
      if (!base) return;
      if (Math.hypot(Number(p.x) - Number(base.x), Number(p.y) - Number(base.y)) < 1e-6) return;
      ctx.beginPath(); ctx.moveTo(xScale(base.x), yScale(base.y)); ctx.lineTo(xScale(p.x), yScale(p.y)); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  // Baseline points
  (baselinePoints || []).forEach(p => {
    const cx = xScale(Number(p.x)), cy = yScale(Number(p.y)), r = getR(p.r);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.globalAlpha = clamp(baselineOpacity, 0, 100) / 100;
    ctx.fillStyle = baselineColor; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = baselineColor; ctx.lineWidth = 1; ctx.stroke();
    if (showPointLabels) {
      ctx.font = `${labelFontPx}px ${fontStr}`; ctx.fillStyle = '#334155';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.label || '', cx, cy - r - 2);
    }
  });

  // Overlay points
  (overlayPoints || []).forEach(p => {
    const cx = xScale(Number(p.x)), cy = yScale(Number(p.y)), r = getR(p.r);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.globalAlpha = clamp(overlayOpacity, 0, 100) / 100;
    ctx.fillStyle = overlayColor; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#B45309'; ctx.lineWidth = 1.4; ctx.stroke();
    if (showPointLabels) {
      ctx.font = `700 ${labelFontPx}px ${fontStr}`; ctx.fillStyle = '#9A3412';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.label || '', cx, cy - r - 2);
    }
  });
}

// ── Dialog Component ──────────────────────────────────────────────────────────

/**
 * ChartExportDialog
 *
 * Full-featured export dialog for analysis charts. Re-renders the chart
 * programmatically (not by stretching the existing SVG), so text scales
 * correctly at any output size.
 *
 * Props (line chart):  chartType='line', series, extraLines, xLabel, yLabel, xDomain, yDomain
 * Props (scatter):     chartType='scatter', baselinePoints, overlayPoints, xDomain, yDomain
 */
function ChartExportDialog({
  open,
  onClose,
  chartType = 'line',
  defaultName = 'chart',
  // Line chart data
  series,
  extraLines,
  xLabel,
  yLabel,
  // Scatter chart data
  baselinePoints,
  overlayPoints,
  // Shared
  xDomain: xDomainProp = null,
  yDomain: yDomainProp = null,
}) {
  const isLine = chartType === 'line';

  // ── Layout settings ──
  const [filename, setFilename]     = useState(defaultName);
  const [format, setFormat]         = useState('svg');
  const [widthVal, setWidthVal]     = useState(16);
  const [heightVal, setHeightVal]   = useState(10);
  const [unit, setUnit]             = useState('cm');
  const [dpi, setDpi]               = useState(300);
  const [lockAspect, setLockAspect] = useState(true);
  const [ratio, setRatio]           = useState(16 / 10);
  const [padding, setPadding]       = useState(20);
  const [showTitle, setShowTitle]   = useState(false);
  const [title, setTitle]           = useState('');
  const [titleFont, setTitleFont]   = useState('Arial');
  const [titleSize, setTitleSize]   = useState(11);
  const [titleColor, setTitleColor] = useState('#0f172a');
  const [background, setBackground] = useState('#ffffff');

  // ── Display settings ──
  const [showAxes, setShowAxes]             = useState(true);
  const [showGridlines, setShowGridlines]   = useState(true);
  const [showAxisLabels, setShowAxisLabels] = useState(true);
  const [showLegend, setShowLegend]         = useState(true);      // line only
  const [showPointLabels, setShowPointLabels] = useState(true);    // scatter only
  const [showArrows, setShowArrows]         = useState(true);      // scatter only

  // ── Line style ──
  const [seriesColors, setSeriesColors] = useState([...SERIES_COLORS]);
  const [legendFontSize, setLegendFontSize] = useState(10);

  // ── Scatter style ──
  const [baselineColor, setBaselineColor]   = useState('#9CA3AF');
  const [overlayColor, setOverlayColor]     = useState('#F59E0B');
  const [arrowColor, setArrowColor]         = useState('#94A3B8');
  const [baselineOpacity, setBaselineOpacity] = useState(35);
  const [overlayOpacity, setOverlayOpacity]   = useState(32);
  const [pointLabelSize, setPointLabelSize]   = useState(10);

  // ── Axis settings ──
  const [axisFont, setAxisFont]                     = useState('Arial');
  const [axisValueFontSize, setAxisValueFontSize]   = useState(10);
  const [axisHeaderFontSize, setAxisHeaderFontSize] = useState(11);
  const [axisColor, setAxisColor]                   = useState('#475569');
  const [xAxisLabel, setXAxisLabel] = useState(
    isLine ? (xLabel || '') : 'Undesirable impact on performance parameters (%)'
  );
  const [yAxisLabel, setYAxisLabel] = useState(
    isLine ? (yLabel || '') : 'Change absorption potential (%)'
  );
  const [xDecimals, setXDecimals]   = useState(isLine ? 3 : 2);
  const [yDecimals, setYDecimals]   = useState(isLine ? 1 : 2);
  const [useCustomBounds, setUseCustomBounds] = useState(false);
  const [xMin, setXMin] = useState('0');
  const [xMax, setXMax] = useState(isLine ? '1' : '10');
  const [yMin, setYMin] = useState(isLine ? '-10' : '0');
  const [yMax, setYMax] = useState(isLine ? '10' : '50');

  // ── UI state ──
  const [settingsTab, setSettingsTab] = useState('layout');
  const [previewZoom, setPreviewZoom] = useState(100);
  const previewRef = useRef(null);

  // Seed on open
  useEffect(() => {
    if (!open) return;
    setFilename(defaultName);
    setXAxisLabel(isLine ? (xLabel || '') : 'Undesirable impact on performance parameters (%)');
    setYAxisLabel(isLine ? (yLabel || '') : 'Change absorption potential (%)');
  }, [open, defaultName, xLabel, yLabel, isLine]);

  const widthPx  = Math.round(Math.max(200, Math.min(8000, Number(widthVal)  * pxPerUnit(unit, dpi))));
  const heightPx = Math.round(Math.max(100, Math.min(8000, Number(heightVal) * pxPerUnit(unit, dpi))));

  const onWidthChange = v => {
    setWidthVal(v);
    if (lockAspect && ratio > 0) setHeightVal(+(Number(v) / ratio).toFixed(3));
    else setRatio(Number(v) / Number(heightVal) || ratio);
  };
  const onHeightChange = v => {
    setHeightVal(v);
    if (lockAspect && ratio > 0) setWidthVal(+(Number(v) * ratio).toFixed(3));
    else setRatio(Number(widthVal) / Number(v) || ratio);
  };

  const buildOpts = (w, h) => ({
    dpi: format === 'png' ? dpi : 96,
    padding: clamp(padding, 0, 200),
    background,
    showTitle, title, titleFont, titleSize: clamp(titleSize, 6, 60), titleColor,
    showAxes, showGridlines, showAxisLabels,
    axisFont, axisValueFontSize: clamp(axisValueFontSize, 6, 40),
    axisHeaderFontSize: clamp(axisHeaderFontSize, 6, 60), axisColor,
    xAxisLabel, yAxisLabel,
    xDecimals: clamp(xDecimals, 0, 6), yDecimals: clamp(yDecimals, 0, 6),
    useCustomBounds, xMin, xMax, yMin, yMax,
    // line-specific
    showLegend, seriesColors, legendFontSize: clamp(legendFontSize, 7, 20),
    // scatter-specific
    showPointLabels, showArrows,
    baselineColor, overlayColor, arrowColor,
    baselineOpacity: clamp(baselineOpacity, 0, 100),
    overlayOpacity:  clamp(overlayOpacity,  0, 100),
    pointLabelSize:  clamp(pointLabelSize, 6, 40),
    // domains
    xDomainProp, yDomainProp,
  });

  const buildSvg = (w, h) => {
    const opts = { ...buildOpts(w, h), dpi: 96 };
    return isLine
      ? buildLineSvg(w, h, series, extraLines, opts)
      : buildScatterSvg(w, h, baselinePoints, overlayPoints, opts);
  };

  const buildCanvas = (w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const opts = buildOpts(w, h);
    if (isLine) renderLineCanvas(canvas, series, extraLines, opts);
    else        renderScatterCanvas(canvas, baselinePoints, overlayPoints, opts);
    return canvas;
  };

  const handleExport = () => {
    if (format === 'svg') {
      const str = buildSvg(widthPx, heightPx);
      if (!str) return;
      const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${sanitizeName(filename)}.svg`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      return;
    }
    const canvas = buildCanvas(widthPx, heightPx);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${sanitizeName(filename)}.png`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }, 'image/png');
  };

  // Preview — always render at screen-friendly size
  useEffect(() => {
    if (!open) return;
    const preview = previewRef.current;
    if (!preview) return;
    const PW = Math.min(520, widthPx);
    const PH = Math.round(PW * heightPx / widthPx);
    preview.width = PW; preview.height = PH;
    const opts = { ...buildOpts(PW, PH), dpi: 96 };
    if (isLine) renderLineCanvas(preview, series, extraLines, opts);
    else        renderScatterCanvas(preview, baselinePoints, overlayPoints, opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open, widthPx, heightPx, padding, background,
    showTitle, title, titleFont, titleSize, titleColor,
    showAxes, showGridlines, showAxisLabels, showLegend, showPointLabels, showArrows,
    axisFont, axisValueFontSize, axisHeaderFontSize, axisColor,
    xAxisLabel, yAxisLabel, xDecimals, yDecimals,
    useCustomBounds, xMin, xMax, yMin, yMax,
    seriesColors, legendFontSize,
    baselineColor, overlayColor, arrowColor, baselineOpacity, overlayOpacity, pointLabelSize,
  ]);

  if (!open) return null;

  // ── Styles ──
  const inp = { width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' };
  const lbl = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 };
  const row = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 };
  const TAB_STYLE = (active) => ({
    padding: '5px 10px', fontSize: 11, fontWeight: active ? 700 : 500,
    borderRadius: 5, border: 'none', cursor: 'pointer',
    background: active ? '#EFF6FF' : 'transparent', color: active ? '#1D4ED8' : '#64748b',
  });

  const TABS = isLine
    ? [['layout', 'Layout'], ['display', 'Display'], ['lines', 'Lines'], ['axes', 'Axes']]
    : [['layout', 'Layout'], ['display', 'Display'], ['points', 'Points'], ['axes', 'Axes']];

  const typeLabel = isLine ? 'Sensitivity Chart' : 'Redesign Plot';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', width: '95vw', maxWidth: 980, maxHeight: '93vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Export {typeLabel}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Settings panel */}
          <div style={{ width: 250, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, padding: '8px 10px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              {TABS.map(([key, label]) => (
                <button key={key} type="button" style={TAB_STYLE(settingsTab === key)} onClick={() => setSettingsTab(key)}>{label}</button>
              ))}
            </div>
            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ── LAYOUT tab ── */}
              {settingsTab === 'layout' && (<>
                <div><label style={lbl}>Filename</label><input style={inp} value={filename} onChange={e => setFilename(e.target.value)} /></div>
                <div><label style={lbl}>Format</label>
                  <select style={inp} value={format} onChange={e => setFormat(e.target.value)}>
                    <option value="svg">SVG (vector)</option>
                    <option value="png">PNG (raster)</option>
                  </select>
                </div>
                <div style={row}>
                  <div><label style={lbl}>Width</label><input style={inp} type="text" inputMode="decimal" value={widthVal} onChange={e => onWidthChange(e.target.value)} onBlur={e => onWidthChange(clamp(e.target.value, 0.1, 1000))} /></div>
                  <div><label style={lbl}>Height</label><input style={inp} type="text" inputMode="decimal" value={heightVal} onChange={e => onHeightChange(e.target.value)} onBlur={e => onHeightChange(clamp(e.target.value, 0.1, 1000))} /></div>
                </div>
                <div style={row}>
                  <div><label style={lbl}>Unit</label>
                    <select style={inp} value={unit} onChange={e => setUnit(e.target.value)}>
                      <option value="cm">cm</option><option value="mm">mm</option><option value="px">px</option>
                    </select>
                  </div>
                  {format === 'png' && <div><label style={lbl}>DPI</label><input style={inp} type="number" value={dpi} min={72} max={1200} onChange={e => setDpi(clamp(e.target.value, 72, 1200))} /></div>}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={lockAspect} onChange={e => { setLockAspect(e.target.checked); if (!e.target.checked) setRatio(Number(widthVal) / Number(heightVal)); }} />
                  Lock aspect ratio
                </label>
                <div><label style={lbl}>Padding (px)</label><input style={inp} type="number" value={padding} min={0} max={200} onChange={e => setPadding(clamp(e.target.value, 0, 200))} /></div>
                <div><label style={lbl}>Background</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="color" value={background} onChange={e => setBackground(e.target.value)} style={{ width: 36, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                    <input style={{ ...inp, flex: 1, minWidth: 0 }} value={background} onChange={e => setBackground(e.target.value)} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}><input type="checkbox" checked={showTitle} onChange={e => setShowTitle(e.target.checked)} />Show title</label>
                {showTitle && (<>
                  <div><label style={lbl}>Title text</label><input style={inp} value={title} onChange={e => setTitle(e.target.value)} /></div>
                  <div><label style={lbl}>Title font</label>
                    <select style={inp} value={titleFont} onChange={e => setTitleFont(e.target.value)}>
                      {SYSTEM_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={row}>
                    <div><label style={lbl}>Size (pt)</label><input style={inp} type="number" value={titleSize} onChange={e => setTitleSize(clamp(e.target.value, 6, 60))} /></div>
                    <div><label style={lbl}>Colour</label>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="color" value={titleColor} onChange={e => setTitleColor(e.target.value)} style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'pointer', padding: 2 }} />
                        <input style={{ ...inp, flex: 1, minWidth: 0 }} value={titleColor} onChange={e => setTitleColor(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </>)}
                <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.6 }}>Output: {widthPx} × {heightPx} px{format === 'png' ? ` @ ${dpi} DPI` : ''}</div>
              </>)}

              {/* ── DISPLAY tab ── */}
              {settingsTab === 'display' && (<>
                {[
                  [showAxes, setShowAxes, 'Show axes & tick labels'],
                  [showGridlines, setShowGridlines, 'Show gridlines'],
                  [showAxisLabels, setShowAxisLabels, 'Show axis header labels'],
                  ...(isLine ? [[showLegend, setShowLegend, 'Show series legend']] : [
                    [showPointLabels, setShowPointLabels, 'Show point labels'],
                    [showArrows, setShowArrows, 'Show movement arrows'],
                  ]),
                ].map(([val, setter, label]) => (
                  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                    <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} />{label}
                  </label>
                ))}
              </>)}

              {/* ── LINES tab (line chart only) ── */}
              {settingsTab === 'lines' && isLine && (<>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Series colours</div>
                {(series || []).slice(0, 7).map((s, idx) => (
                  <div key={`sc_${idx}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="color" value={seriesColors[idx] || SERIES_COLORS[idx % SERIES_COLORS.length]}
                      onChange={e => { const c = [...seriesColors]; c[idx] = e.target.value; setSeriesColors(c); }}
                      style={{ width: 32, height: 26, borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                    <input style={{ ...inp, flex: 1, minWidth: 0 }}
                      value={seriesColors[idx] || SERIES_COLORS[idx % SERIES_COLORS.length]}
                      onChange={e => { const c = [...seriesColors]; c[idx] = e.target.value; setSeriesColors(c); }} />
                    <span style={{ fontSize: 10, color: '#64748b', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  </div>
                ))}
                <div><label style={lbl}>Legend font size (pt)</label><input style={inp} type="number" value={legendFontSize} min={7} max={20} onChange={e => setLegendFontSize(clamp(e.target.value, 7, 20))} /></div>
                <button type="button" onClick={() => setSeriesColors([...SERIES_COLORS])}
                  style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', marginTop: 4 }}>Reset to defaults</button>
              </>)}

              {/* ── POINTS tab (scatter only) ── */}
              {settingsTab === 'points' && !isLine && (<>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Baseline (original) points</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={baselineColor} onChange={e => setBaselineColor(e.target.value)} style={{ width: 32, height: 26, borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'pointer', padding: 2 }} />
                  <input style={{ ...inp, flex: 1, minWidth: 0 }} value={baselineColor} onChange={e => setBaselineColor(e.target.value)} />
                </div>
                <div><label style={lbl}>Opacity (%)</label>
                  <input type="range" min={0} max={100} value={baselineOpacity} onChange={e => setBaselineOpacity(Number(e.target.value))} style={{ width: '100%' }} />
                  <span style={{ fontSize: 10, color: '#64748b' }}>{baselineOpacity}%</span>
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 6, marginBottom: 2 }}>Redesigned points</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={overlayColor} onChange={e => setOverlayColor(e.target.value)} style={{ width: 32, height: 26, borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'pointer', padding: 2 }} />
                  <input style={{ ...inp, flex: 1, minWidth: 0 }} value={overlayColor} onChange={e => setOverlayColor(e.target.value)} />
                </div>
                <div><label style={lbl}>Opacity (%)</label>
                  <input type="range" min={0} max={100} value={overlayOpacity} onChange={e => setOverlayOpacity(Number(e.target.value))} style={{ width: '100%' }} />
                  <span style={{ fontSize: 10, color: '#64748b' }}>{overlayOpacity}%</span>
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 6, marginBottom: 2 }}>Arrows</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={arrowColor} onChange={e => setArrowColor(e.target.value)} style={{ width: 32, height: 26, borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'pointer', padding: 2 }} />
                  <input style={{ ...inp, flex: 1, minWidth: 0 }} value={arrowColor} onChange={e => setArrowColor(e.target.value)} />
                </div>
                <div><label style={lbl}>Point label size (pt)</label><input style={inp} type="number" value={pointLabelSize} min={6} max={40} onChange={e => setPointLabelSize(clamp(e.target.value, 6, 40))} /></div>
              </>)}

              {/* ── AXES tab ── */}
              {settingsTab === 'axes' && (<>
                <div><label style={lbl}>Font</label>
                  <select style={inp} value={axisFont} onChange={e => setAxisFont(e.target.value)}>
                    {SYSTEM_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div style={row}>
                  <div><label style={lbl}>Header size (pt)</label><input style={inp} type="number" value={axisHeaderFontSize} min={6} max={60} onChange={e => setAxisHeaderFontSize(clamp(e.target.value, 6, 60))} /></div>
                  <div><label style={lbl}>Tick size (pt)</label><input style={inp} type="number" value={axisValueFontSize} min={6} max={40} onChange={e => setAxisValueFontSize(clamp(e.target.value, 6, 40))} /></div>
                </div>
                <div><label style={lbl}>Colour</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="color" value={axisColor} onChange={e => setAxisColor(e.target.value)} style={{ width: 32, height: 26, borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'pointer', padding: 2 }} />
                    <input style={{ ...inp, flex: 1, minWidth: 0 }} value={axisColor} onChange={e => setAxisColor(e.target.value)} />
                  </div>
                </div>
                <div style={row}>
                  <div><label style={lbl}>X decimals</label><input style={inp} type="number" value={xDecimals} min={0} max={6} onChange={e => setXDecimals(clamp(e.target.value, 0, 6))} /></div>
                  <div><label style={lbl}>Y decimals</label><input style={inp} type="number" value={yDecimals} min={0} max={6} onChange={e => setYDecimals(clamp(e.target.value, 0, 6))} /></div>
                </div>
                <div><label style={lbl}>X-axis label</label><input style={inp} value={xAxisLabel} onChange={e => setXAxisLabel(e.target.value)} /></div>
                <div><label style={lbl}>Y-axis label</label><input style={inp} value={yAxisLabel} onChange={e => setYAxisLabel(e.target.value)} /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                  <input type="checkbox" checked={useCustomBounds} onChange={e => setUseCustomBounds(e.target.checked)} />
                  Custom axis bounds
                </label>
                {useCustomBounds && (
                  <div style={row}>
                    <div><label style={lbl}>X min</label><input style={inp} type="text" inputMode="decimal" value={xMin} onChange={e => setXMin(e.target.value)} disabled={!useCustomBounds} /></div>
                    <div><label style={lbl}>X max</label><input style={inp} type="text" inputMode="decimal" value={xMax} onChange={e => setXMax(e.target.value)} disabled={!useCustomBounds} /></div>
                    <div><label style={lbl}>Y min</label><input style={inp} type="text" inputMode="decimal" value={yMin} onChange={e => setYMin(e.target.value)} disabled={!useCustomBounds} /></div>
                    <div><label style={lbl}>Y max</label><input style={inp} type="text" inputMode="decimal" value={yMax} onChange={e => setYMax(e.target.value)} disabled={!useCustomBounds} /></div>
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  {isLine ? 'Y-axis values are shown as %. X-axis is the raw input value.' : 'Both axes are shown as %.'}
                </div>
              </>)}

            </div>
          </div>

          {/* Preview */}
          <div style={{ flex: 1, background: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden', gap: 8 }}>
            <canvas ref={previewRef} style={{
              borderRadius: 6, border: '1px solid #e2e8f0',
              boxShadow: '0 2px 12px rgba(15,23,42,0.10)',
              maxWidth: '100%', maxHeight: 'calc(100% - 44px)',
              transform: `scale(${previewZoom / 100})`, transformOrigin: 'center center',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', flexShrink: 0 }}>
              <span>Zoom</span>
              <input type="range" min={25} max={200} step={5} value={previewZoom} onChange={e => setPreviewZoom(Number(e.target.value))} style={{ width: 90 }} />
              <span>{previewZoom}%</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fff' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button type="button" onClick={handleExport} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {format === 'svg' ? 'Export SVG' : 'Export PNG'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default ChartExportDialog;
