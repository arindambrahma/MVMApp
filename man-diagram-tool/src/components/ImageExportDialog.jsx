import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function pxPerUnit(unit, dpi) {
  if (unit === 'cm') return dpi / 2.54;
  if (unit === 'mm') return dpi / 25.4;
  return 1;
}

function toPx(value, unit, dpi) {
  return Number(value) * pxPerUnit(unit, dpi);
}

function toPt(value, unit, dpi) {
  if (unit === 'cm') return (Number(value) / 2.54) * 72;
  if (unit === 'mm') return (Number(value) / 25.4) * 72;
  return (Number(value) / Math.max(1, Number(dpi) || 300)) * 72;
}

function sanitizeName(name = 'graph') {
  return String(name).trim().replace(/[^\w.-]+/g, '_') || 'graph';
}

function exportCanvas(canvas, filenameBase) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeName(filenameBase)}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function hexToRgb(hex) {
  const raw = String(hex || '').trim();
  const cleaned = raw.startsWith('#') ? raw.slice(1) : raw;
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null;
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null;
  }
  return null;
}

function ImageExportDialog({
  open,
  onClose,
  imageSrc,
  plotData,
  defaultTitle = 'Margin Value Plot',
  defaultName = 'margin_value_plot',
}) {
  const SYSTEM_FONTS = [
    'Aptos Narrow',
    'System UI',
    'Segoe UI',
    'Helvetica',
    'Arial',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Calibri',
    'Cambria',
    'Georgia',
    'Times New Roman',
    'Garamond',
    'Palatino Linotype',
    'Century Gothic',
    'Courier New',
    'Consolas',
    'Lucida Sans Unicode',
    'Impact',
  ];

  const [filename, setFilename] = useState(defaultName);
  const [title, setTitle] = useState(defaultTitle);
  const [widthVal, setWidthVal] = useState(11.5);
  const [heightVal, setHeightVal] = useState(11.5);
  const [unit, setUnit] = useState('cm');
  const [dpi, setDpi] = useState(300);
  const [format, setFormat] = useState('svg');
  const [lockAspect, setLockAspect] = useState(true);
  const [ratio, setRatio] = useState(widthVal / heightVal);
  const [padding, setPadding] = useState(40);
  const [showTitle, setShowTitle] = useState(false);
  const [titleColor, setTitleColor] = useState('#202038');
  const [titleFont, setTitleFont] = useState('Aptos Narrow');
  const [titleSize, setTitleSize] = useState(10);
  const [showAxes, setShowAxes] = useState(true);
  const [showTopBorder, setShowTopBorder] = useState(true);
  const [showRightBorder, setShowRightBorder] = useState(true);
  const [showAxisLabels, setShowAxisLabels] = useState(true);
  const [showPointLabels, setShowPointLabels] = useState(true);
  const [showMidlines, setShowMidlines] = useState(true);
  const [showColorScale, setShowColorScale] = useState(true);
  const [showGridlines, setShowGridlines] = useState(false);
  const [quadOpacity, setQuadOpacity] = useState(32);
  const [quadTL, setQuadTL] = useState('#D4BEBA');
  const [quadTR, setQuadTR] = useState('#EADBD2');
  const [quadBL, setQuadBL] = useState('#9A8C98');
  const [quadBR, setQuadBR] = useState('#D4BEBA');
  const [quadInset, setQuadInset] = useState(0);
  const [showQuadrants, setShowQuadrants] = useState(true);
  const [showQuadrantText, setShowQuadrantText] = useState(true);
  const [quadrantTextSize, setQuadrantTextSize] = useState(10);
  const [axisFont, setAxisFont] = useState('Aptos Narrow');
  const [axisValueFontSize, setAxisValueFontSize] = useState(10);
  const [axisHeaderFontSize, setAxisHeaderFontSize] = useState(10);
  const [axisColor, setAxisColor] = useState('#202038');
  const [xAxisLabel, setXAxisLabel] = useState('Undesirable impact on performance parameters (%)');
  const [yAxisLabel, setYAxisLabel] = useState('Change absorption potential (%)');
  const [xAxisLabelPadding, setXAxisLabelPadding] = useState(-23);
  const [yAxisLabelPadding, setYAxisLabelPadding] = useState(-51);
  const [xAxisValuePadding, setXAxisValuePadding] = useState(-4);
  const [yAxisValuePadding, setYAxisValuePadding] = useState(15);
  const [xAxisDecimals, setXAxisDecimals] = useState(0);
  const [yAxisDecimals, setYAxisDecimals] = useState(0);
  const [useCustomBounds, setUseCustomBounds] = useState(true);
  const [xMin, setXMin] = useState('0');
  const [xMax, setXMax] = useState('10');
  const [yMin, setYMin] = useState('15');
  const [yMax, setYMax] = useState('55');
  const [pointLabelSize, setPointLabelSize] = useState(10);
  const [bubbleOpacity, setBubbleOpacity] = useState(100);
  const [pointLabelOpacity, setPointLabelOpacity] = useState(100);
  const [useCustomPlotSize, setUseCustomPlotSize] = useState(false);
  const [plotWidth, setPlotWidth] = useState(600);
  const [plotHeight, setPlotHeight] = useState(420);
  const [plotOffsetX, setPlotOffsetX] = useState(0);
  const [plotOffsetY, setPlotOffsetY] = useState(0);
  const [scaleStartColor, setScaleStartColor] = useState('#EADBD2');
  const [scaleEndColor, setScaleEndColor] = useState('#202038');
  const [scaleCaption, setScaleCaption] = useState('Local Excess (%)');
  const [scaleCaptionSize, setScaleCaptionSize] = useState(8);
  const [scaleLabelSize, setScaleLabelSize] = useState(8);
  const [scaleDecimals, setScaleDecimals] = useState(0);
  const [scaleCaptionPadding, setScaleCaptionPadding] = useState(12);
  const [scaleLabelPadding, setScaleLabelPadding] = useState(0);
  const [scaleEdgePadding, setScaleEdgePadding] = useState(-147);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [settingsTab, setSettingsTab] = useState('layout');
  const previewCanvasRef = useRef(null);
  const settingsFileInputRef = useRef(null);
  const isPlotMode = Boolean(plotData);

  useEffect(() => {
    if (!open) return;
    setFilename(defaultName);
    setTitle(defaultTitle);
  }, [open, defaultName, defaultTitle]);

  useEffect(() => {
    if (!open || isPlotMode) return;
    setShowAxes(false);
    setShowTopBorder(false);
    setShowRightBorder(false);
    setShowAxisLabels(false);
    setShowPointLabels(false);
    setShowMidlines(false);
    setShowColorScale(false);
    setShowGridlines(false);
    setShowQuadrants(false);
    setShowQuadrantText(false);
    setUseCustomBounds(false);
    setUseCustomPlotSize(false);
    if (!['layout', 'display', 'text'].includes(settingsTab)) {
      setSettingsTab('layout');
    }
  }, [open, isPlotMode, settingsTab]);

  const fontPx = (ptValue, minPt, maxPt) => {
    const clamped = clamp(ptValue, minPt, maxPt);
    const px = (Number(clamped) || 0) * (dpi / 72);
    return Math.max(1, px);
  };

  const buildAxisMetrics = (axisHeaderPx, axisValuePx) => {
    const xValuePad = clamp(xAxisValuePadding, -1000, 1000);
    const xLabelPad = clamp(xAxisLabelPadding, -1000, 1000);
    const yValuePad = clamp(yAxisValuePadding, -1000, 1000);
    const yLabelPad = clamp(yAxisLabelPadding, -1000, 1000);
    const xTickOffset = axisValuePx + 8 + xValuePad;
    const xLabelOffset = xTickOffset + axisValuePx * 0.7 + axisHeaderPx + 10 + xLabelPad;
    const yTickOffset = 8 + yValuePad;
    const yLabelOffset = yTickOffset + axisValuePx * 2.4 + axisHeaderPx * 0.8 + 8 + yLabelPad;
    return {
      xTickOffset,
      xLabelOffset,
      yTickOffset,
      yLabelOffset,
    };
  };

  const widthPx = useMemo(() => Math.round(Math.max(300, Math.min(10000, toPx(widthVal, unit, dpi)))), [widthVal, unit, dpi]);
  const heightPx = useMemo(() => Math.round(Math.max(300, Math.min(10000, toPx(heightVal, unit, dpi)))), [heightVal, unit, dpi]);

  const ensureRatio = (w, h) => {
    if (!lockAspect || h <= 0) return;
    setRatio(w / h);
  };

  const onWidthChange = (value) => {
    setWidthVal(value);
    if (lockAspect) {
      setHeightVal(Math.round(Number(value) / ratio) || heightVal);
    } else {
      ensureRatio(value, heightVal);
    }
  };

  const onHeightChange = (value) => {
    setHeightVal(value);
    if (lockAspect) {
      setWidthVal(Math.round(Number(value) * ratio) || widthVal);
    } else {
      ensureRatio(widthVal, value);
    }
  };

  const computeLayout = (w, h) => {
    const pad = clamp(padding, 0, 200);
    const titleHeight = showTitle ? fontPx(titleSize, 6, 90) : 0;
    const axisHeader = fontPx(axisHeaderFontSize, 6, 64);
    const axisValue = fontPx(axisValueFontSize, 6, 42);
    const metrics = buildAxisMetrics(axisHeader, axisValue);
    const leftFromTicks = showAxes ? Math.max(56, metrics.yTickOffset + axisValue * 3.2) : 12;
    const leftFromLabel = showAxisLabels ? metrics.yLabelOffset + axisHeader * 0.25 : 0;
    const left = pad + Math.max(leftFromTicks, leftFromLabel);
    const scaleLabelPx = fontPx(scaleLabelSize, 6, 32);
    const scaleCaptionPx = fontPx(scaleCaptionSize, 6, 32);
    const scaleLabelPad = clamp(scaleLabelPadding, 0, 200);
    const scaleCaptionPad = clamp(scaleCaptionPadding, 0, 200);
    const scalePagePad = clamp(scaleEdgePadding, -400, 400);
    const scaleMaxValueWidth = scaleLabelPx * 4.8;
    const scaleBarToText = 14 + Math.max(6 + scaleLabelPad + scaleMaxValueWidth, 16 + scaleCaptionPad + scaleCaptionPx * 0.9) + scalePagePad;
    const right = pad + (showColorScale ? Math.max(0, 18 + scaleBarToText) : 18);
    const top = pad + titleHeight + (showTitle ? 10 : 0);
    const bottomFromTicks = showAxes ? metrics.xTickOffset + axisValue * 0.45 : 12;
    const bottomFromLabel = showAxisLabels ? metrics.xLabelOffset + axisHeader * 0.45 : 0;
    const bottom = pad + Math.max(32, bottomFromTicks, bottomFromLabel);
    const avail = {
      x: left,
      y: top,
      w: Math.max(120, w - left - right),
      h: Math.max(120, h - top - bottom),
    };
    const plot = useCustomPlotSize
      ? {
        x: avail.x + Math.max(0, (avail.w - clamp(plotWidth, 120, avail.w)) / 2),
        y: avail.y + Math.max(0, (avail.h - clamp(plotHeight, 120, avail.h)) / 2),
        w: clamp(plotWidth, 120, avail.w),
        h: clamp(plotHeight, 120, avail.h),
      }
      : avail;
    const offsetX = clamp(plotOffsetX, -avail.w, avail.w);
    const offsetY = clamp(plotOffsetY, -avail.h, avail.h);
    plot.x = clamp(plot.x + offsetX, avail.x, avail.x + Math.max(0, avail.w - plot.w));
    plot.y = clamp(plot.y + offsetY, avail.y, avail.y + Math.max(0, avail.h - plot.h));
    return { pad, titleHeight, plot, axisHeader, axisValue };
  };

  const buildPoints = () => {
    if (!plotData) return null;
    const marginKeys = Object.keys(plotData.excess || {});
    if (!marginKeys.length) return null;
    const points = marginKeys.map((key) => {
      const impact = Number(plotData.weighted_impact?.[key] ?? 0) * 100;
      const absorption = Number(plotData.weighted_absorption?.[key] ?? 0) * 100;
      const excess = Number(plotData.excess?.[key] ?? 0) * 100;
      return {
        key,
        label: String(key || '').replace('E_', 'E'),
        x: impact,
        y: absorption,
        excess,
      };
    });
    const sizes = points.map((p) => Math.abs(p.excess));
    const maxSize = Math.max(1, ...sizes);
    return points.map((p) => {
      const area = Math.max(80, (Math.abs(p.excess) / maxSize) * 2000);
      const radius = Math.max(6, Math.sqrt(area / Math.PI));
      return { ...p, r: radius };
    });
  };

  const pickPointColor = (value, min, max) => {
    if (!Number.isFinite(value) || max === min) return scaleStartColor;
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const start = hexToRgb(scaleStartColor) || { r: 22, g: 163, b: 74 };
    const end = hexToRgb(scaleEndColor) || { r: 220, g: 38, b: 38 };
    const r = Math.round(start.r + (end.r - start.r) * t);
    const g = Math.round(start.g + (end.g - start.g) * t);
    const b = Math.round(start.b + (end.b - start.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const drawMultiline = (ctx, text, x, y, lineHeight) => {
    const lines = String(text || '').split('\n');
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  };

  const buildPlotScales = () => {
    const points = buildPoints();
    if (!points) return null;
    const xs = points.map((p) => p.x).filter(Number.isFinite);
    const ys = points.map((p) => p.y).filter(Number.isFinite);
    if (!xs.length || !ys.length) return null;
    const minXRaw = Math.min(...xs);
    const maxXRaw = Math.max(...xs);
    const minYRaw = Math.min(...ys);
    const maxYRaw = Math.max(...ys);
    const xPad = Math.max(0.5, (maxXRaw - minXRaw) * 0.1);
    const yPad = Math.max(0.5, (maxYRaw - minYRaw) * 0.1);
    const autoMinX = minXRaw - xPad;
    const autoMaxX = maxXRaw + xPad;
    const autoMinY = minYRaw - yPad;
    const autoMaxY = maxYRaw + yPad;
    const userMinX = Number(xMin);
    const userMaxX = Number(xMax);
    const userMinY = Number(yMin);
    const userMaxY = Number(yMax);
    const customMinX = useCustomBounds && Number.isFinite(userMinX) ? userMinX : null;
    const customMaxX = useCustomBounds && Number.isFinite(userMaxX) ? userMaxX : null;
    const customMinY = useCustomBounds && Number.isFinite(userMinY) ? userMinY : null;
    const customMaxY = useCustomBounds && Number.isFinite(userMaxY) ? userMaxY : null;
    const minX = customMinX !== null && customMaxX !== null && customMinX < customMaxX ? customMinX : autoMinX;
    const maxX = customMinX !== null && customMaxX !== null && customMinX < customMaxX ? customMaxX : autoMaxX;
    const minY = customMinY !== null && customMaxY !== null && customMinY < customMaxY ? customMinY : autoMinY;
    const maxY = customMinY !== null && customMaxY !== null && customMinY < customMaxY ? customMaxY : autoMaxY;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    return { points, minX, maxX, minY, maxY, midX, midY };
  };

  const drawPlot = (ctx, canvas, layout) => {
    const scales = buildPlotScales();
    if (!scales) return;
    const { points, minX, maxX, minY, maxY, midX, midY } = scales;

    const { plot } = layout;
    const xScale = (x) => (maxX === minX ? plot.x + plot.w / 2 : plot.x + ((x - minX) / (maxX - minX)) * plot.w);
    const yScale = (y) => (maxY === minY ? plot.y + plot.h / 2 : plot.y + plot.h - ((y - minY) / (maxY - minY)) * plot.h);

    const plotArea = {
      x: plot.x,
      y: plot.y,
      w: plot.w,
      h: plot.h,
    };

    if (showQuadrants && quadOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = quadOpacity / 100;
      ctx.fillStyle = quadTL;
      ctx.fillRect(plotArea.x, plotArea.y, plotArea.w / 2, plotArea.h / 2);
      ctx.fillStyle = quadTR;
      ctx.fillRect(plotArea.x + plotArea.w / 2, plotArea.y, plotArea.w / 2, plotArea.h / 2);
      ctx.fillStyle = quadBL;
      ctx.fillRect(plotArea.x, plotArea.y + plotArea.h / 2, plotArea.w / 2, plotArea.h / 2);
      ctx.fillStyle = quadBR;
      ctx.fillRect(plotArea.x + plotArea.w / 2, plotArea.y + plotArea.h / 2, plotArea.w / 2, plotArea.h / 2);
      ctx.restore();
    }

    const xTicks = 6;
    const yTicks = 6;
    const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + (i / xTicks) * (maxX - minX));
    const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (i / yTicks) * (maxY - minY));
    const tickFont = fontPx(axisValueFontSize, 6, 42);
    const axisHeader = fontPx(axisHeaderFontSize, 6, 64);
    const metrics = buildAxisMetrics(axisHeader, tickFont);
    if (showAxes) {
      ctx.font = `${tickFont}px ${axisFont}, Arial, sans-serif`;
      ctx.fillStyle = axisColor;
      ctx.textAlign = 'center';
      yTickVals.forEach((tv) => {
        const yy = yScale(tv);
        if (showGridlines) {
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(plot.x, yy);
          ctx.lineTo(plot.x + plot.w, yy);
          ctx.stroke();
        }
        ctx.textAlign = 'right';
        ctx.fillText(tv.toFixed(clamp(yAxisDecimals, 0, 6)), plot.x - metrics.yTickOffset, yy + 4);
      });
      xTickVals.forEach((tv) => {
        const xx = xScale(tv);
        if (showGridlines) {
          ctx.strokeStyle = '#F1F5F9';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xx, plot.y);
          ctx.lineTo(xx, plot.y + plot.h);
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.fillText(tv.toFixed(clamp(xAxisDecimals, 0, 6)), xx, plot.y + plot.h + metrics.xTickOffset);
      });

      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y);
      ctx.lineTo(plot.x, plot.y + plot.h);
      ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
      ctx.stroke();
      if (showTopBorder) {
        ctx.beginPath();
        ctx.moveTo(plot.x, plot.y);
        ctx.lineTo(plot.x + plot.w, plot.y);
        ctx.stroke();
      }
      if (showRightBorder) {
        ctx.beginPath();
        ctx.moveTo(plot.x + plot.w, plot.y);
        ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
        ctx.stroke();
      }
    }

    if (showMidlines) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xScale(midX), plot.y);
      ctx.lineTo(xScale(midX), plot.y + plot.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(plot.x, yScale(midY));
      ctx.lineTo(plot.x + plot.w, yScale(midY));
      ctx.stroke();
      ctx.restore();
    }

    const absValues = points.map((p) => Math.abs(p.excess));
    const minAbs = Math.min(...absValues);
    const maxAbs = Math.max(...absValues);

    const scaleRef = Math.max(1, Math.min(plot.w, plot.h) / 380);
    const minR = 4 * scaleRef;
    const maxR = 22 * scaleRef;
    if (showQuadrantText) {
      const quadTextOpacity = clamp(quadOpacity, 0, 100) / 100;
      ctx.fillStyle = '#334155';
      const quadPx = fontPx(quadrantTextSize, 6, 64);
      ctx.font = `italic ${quadPx}px ${axisFont}, Arial, sans-serif`;
      ctx.textAlign = 'center';
      const quadLine = Math.max(10, quadPx + 2);
      ctx.globalAlpha = quadTextOpacity;
      drawMultiline(ctx, 'High absorption\nLow impact\n(High value)', plotArea.x + plotArea.w * 0.25, plotArea.y + plotArea.h * 0.25 - quadLine, quadLine);
      drawMultiline(ctx, 'High absorption\nHigh impact\n(Trade-off)', plotArea.x + plotArea.w * 0.75, plotArea.y + plotArea.h * 0.25 - quadLine, quadLine);
      drawMultiline(ctx, 'Low absorption\nLow impact\n(Negligible)', plotArea.x + plotArea.w * 0.25, plotArea.y + plotArea.h * 0.75 - quadLine, quadLine);
      drawMultiline(ctx, 'Low absorption\nHigh impact\n(Reduce margin)', plotArea.x + plotArea.w * 0.75, plotArea.y + plotArea.h * 0.75 - quadLine, quadLine);
      ctx.globalAlpha = 1;
    }

    if (showAxisLabels && xAxisLabel) {
      ctx.font = `700 ${fontPx(axisHeaderFontSize, 6, 64)}px ${axisFont}, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = axisColor;
      ctx.fillText(xAxisLabel, plot.x + plot.w / 2, plot.y + plot.h + metrics.xLabelOffset);
    }
    if (showAxisLabels && yAxisLabel) {
      ctx.save();
      ctx.translate(plot.x - metrics.yLabelOffset, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = `700 ${fontPx(axisHeaderFontSize, 6, 64)}px ${axisFont}, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = axisColor;
      ctx.fillText(yAxisLabel, 0, 0);
      ctx.restore();
    }

    if (showColorScale) {
      const barW = 14;
      const barH = plot.h * 0.7;
      const barX = plot.x + plot.w + 18;
      const barY = plot.y + (plot.h - barH) / 2;
      const captionPad = clamp(scaleCaptionPadding, 0, 200);
      const labelPad = clamp(scaleLabelPadding, 0, 200);
      const captionPx = fontPx(scaleCaptionSize, 6, 32);
      const labelPx = fontPx(scaleLabelSize, 6, 32);
      const grad = ctx.createLinearGradient(barX, barY + barH, barX, barY);
      grad.addColorStop(0, scaleStartColor);
      grad.addColorStop(1, scaleEndColor);
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.font = `${captionPx}px ${axisFont}, Arial, sans-serif`;
      ctx.fillStyle = axisColor;
      ctx.textAlign = 'left';
      if (scaleCaption) {
        ctx.save();
        ctx.translate(barX + barW + 16 + captionPad, barY + barH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(scaleCaption, 0, 0);
        ctx.restore();
      }
      ctx.textAlign = 'left';
      ctx.font = `${labelPx}px ${axisFont}, Arial, sans-serif`;
      ctx.fillText(minAbs.toFixed(clamp(scaleDecimals, 0, 6)), barX + barW + 6 + labelPad, barY + barH);
      ctx.fillText(maxAbs.toFixed(clamp(scaleDecimals, 0, 6)), barX + barW + 6 + labelPad, barY + 8);
    }

    points.forEach((p) => {
      const cx = xScale(p.x);
      const cy = yScale(p.y);
      const r = clamp(p.r * scaleRef, minR, maxR);
      ctx.beginPath();
      ctx.fillStyle = pickPointColor(Math.abs(p.excess), minAbs, maxAbs);
      ctx.globalAlpha = clamp(bubbleOpacity, 0, 100) / 100;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    });

    if (showPointLabels) {
      ctx.font = `700 ${fontPx(pointLabelSize, 6, 64)}px ${axisFont}, Arial, sans-serif`;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.globalAlpha = clamp(pointLabelOpacity, 0, 100) / 100;
      points.forEach((p) => {
        const cx = xScale(p.x);
        const cy = yScale(p.y);
        const r = clamp(p.r * scaleRef, minR, maxR);
        ctx.fillText(p.label, cx + r + 6, cy - r / 2);
      });
      ctx.globalAlpha = 1;
    }
  };

  const buildSvgString = (w, h) => {
    const layout = computeLayout(w, h);
    const escape = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (!plotData) {
      if (!imageSrc) return null;
      const titlePx = fontPx(titleSize, 6, 90);
      const svg = [];
      svg.push('<?xml version="1.0" encoding="UTF-8"?>');
      svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
      svg.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`);
      if (showTitle) {
        svg.push(`<text x="${layout.pad}" y="${layout.pad + titlePx}" font-family="${escape(titleFont)}, Arial, sans-serif" font-size="${titlePx}" font-weight="700" fill="${escape(titleColor)}">${escape(title)}</text>`);
      }
      svg.push(`<image href="${escape(imageSrc)}" x="${layout.plot.x}" y="${layout.plot.y}" width="${layout.plot.w}" height="${layout.plot.h}" preserveAspectRatio="xMidYMid meet"/>`);
      svg.push('</svg>');
      return svg.join('');
    }
    const scales = buildPlotScales();
    if (!scales) return null;
    const { points, minX, maxX, minY, maxY, midX, midY } = scales;
    const { plot } = layout;
    const plotArea = {
      x: plot.x,
      y: plot.y,
      w: plot.w,
      h: plot.h,
    };
    const xScale = (x) => (maxX === minX ? plot.x + plot.w / 2 : plot.x + ((x - minX) / (maxX - minX)) * plot.w);
    const yScale = (y) => (maxY === minY ? plot.y + plot.h / 2 : plot.y + plot.h - ((y - minY) / (maxY - minY)) * plot.h);
    const xTicks = 6;
    const yTicks = 6;
    const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + (i / xTicks) * (maxX - minX));
    const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (i / yTicks) * (maxY - minY));
    const tickFont = fontPx(axisValueFontSize, 6, 42);
    const axisHeader = fontPx(axisHeaderFontSize, 6, 64);
    const metrics = buildAxisMetrics(axisHeader, tickFont);
    const quadPx = fontPx(quadrantTextSize, 6, 64);
    const quadLine = Math.max(10, quadPx + 2);
    const absValues = points.map((p) => Math.abs(p.excess));
    const minAbs = Math.min(...absValues);
    const maxAbs = Math.max(...absValues);
    const scaleRef = Math.max(1, Math.min(plot.w, plot.h) / 380);
    const minR = 4 * scaleRef;
    const maxR = 22 * scaleRef;

    const svg = [];
    svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
    svg.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`);
    if (showTitle) {
      const titlePx = fontPx(titleSize, 6, 90);
      svg.push(`<text x="${layout.pad}" y="${layout.pad + titlePx}" font-family="${escape(titleFont)}, Arial, sans-serif" font-size="${titlePx}" font-weight="700" fill="${escape(titleColor)}">${escape(title)}</text>`);
    }

    if (showQuadrants && quadOpacity > 0) {
      svg.push(`<rect x="${plotArea.x}" y="${plotArea.y}" width="${plotArea.w / 2}" height="${plotArea.h / 2}" fill="${escape(quadTL)}" opacity="${(quadOpacity / 100).toFixed(2)}"/>`);
      svg.push(`<rect x="${plotArea.x + plotArea.w / 2}" y="${plotArea.y}" width="${plotArea.w / 2}" height="${plotArea.h / 2}" fill="${escape(quadTR)}" opacity="${(quadOpacity / 100).toFixed(2)}"/>`);
      svg.push(`<rect x="${plotArea.x}" y="${plotArea.y + plotArea.h / 2}" width="${plotArea.w / 2}" height="${plotArea.h / 2}" fill="${escape(quadBL)}" opacity="${(quadOpacity / 100).toFixed(2)}"/>`);
      svg.push(`<rect x="${plotArea.x + plotArea.w / 2}" y="${plotArea.y + plotArea.h / 2}" width="${plotArea.w / 2}" height="${plotArea.h / 2}" fill="${escape(quadBR)}" opacity="${(quadOpacity / 100).toFixed(2)}"/>`);
    }

    if (showAxes) {
      yTickVals.forEach((tv) => {
        const yy = yScale(tv);
        if (showGridlines) {
          svg.push(`<line x1="${plot.x}" y1="${yy}" x2="${plot.x + plot.w}" y2="${yy}" stroke="#E2E8F0" stroke-width="1"/>`);
        }
        svg.push(`<text x="${plot.x - metrics.yTickOffset}" y="${yy + 4}" text-anchor="end" font-size="${tickFont}" fill="${escape(axisColor)}" font-family="${escape(axisFont)}, Arial, sans-serif">${tv.toFixed(clamp(yAxisDecimals, 0, 6))}</text>`);
      });
      xTickVals.forEach((tv) => {
        const xx = xScale(tv);
        if (showGridlines) {
          svg.push(`<line x1="${xx}" y1="${plot.y}" x2="${xx}" y2="${plot.y + plot.h}" stroke="#F1F5F9" stroke-width="1"/>`);
        }
        svg.push(`<text x="${xx}" y="${plot.y + plot.h + metrics.xTickOffset}" text-anchor="middle" font-size="${tickFont}" fill="${escape(axisColor)}" font-family="${escape(axisFont)}, Arial, sans-serif">${tv.toFixed(clamp(xAxisDecimals, 0, 6))}</text>`);
      });
      svg.push(`<polyline points="${plot.x},${plot.y} ${plot.x},${plot.y + plot.h} ${plot.x + plot.w},${plot.y + plot.h}" fill="none" stroke="#475569" stroke-width="1.2"/>`);
      if (showTopBorder) {
        svg.push(`<line x1="${plot.x}" y1="${plot.y}" x2="${plot.x + plot.w}" y2="${plot.y}" stroke="#475569" stroke-width="1.2"/>`);
      }
      if (showRightBorder) {
        svg.push(`<line x1="${plot.x + plot.w}" y1="${plot.y}" x2="${plot.x + plot.w}" y2="${plot.y + plot.h}" stroke="#475569" stroke-width="1.2"/>`);
      }
    }

    if (showMidlines) {
      svg.push(`<line x1="${xScale(midX)}" y1="${plot.y}" x2="${xScale(midX)}" y2="${plot.y + plot.h}" stroke="#94A3B8" stroke-width="1" stroke-dasharray="6 5"/>`);
      svg.push(`<line x1="${plot.x}" y1="${yScale(midY)}" x2="${plot.x + plot.w}" y2="${yScale(midY)}" stroke="#94A3B8" stroke-width="1" stroke-dasharray="6 5"/>`);
    }

    if (showQuadrantText) {
      const quadTextOpacity = (clamp(quadOpacity, 0, 100) / 100).toFixed(3);
      const quadText = (text, x, y) => {
        const lines = text.split('\n');
        const tspans = lines.map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : quadLine}">${escape(line)}</tspan>`).join('');
        svg.push(`<text x="${x}" y="${y - quadLine}" font-style="italic" font-size="${quadPx}" font-family="${escape(axisFont)}, Arial, sans-serif" text-anchor="middle" fill="#334155" fill-opacity="${quadTextOpacity}">${tspans}</text>`);
      };
      quadText('High absorption\nLow impact\n(High value)', plotArea.x + plotArea.w * 0.25, plotArea.y + plotArea.h * 0.25);
      quadText('High absorption\nHigh impact\n(Trade-off)', plotArea.x + plotArea.w * 0.75, plotArea.y + plotArea.h * 0.25);
      quadText('Low absorption\nLow impact\n(Negligible)', plotArea.x + plotArea.w * 0.25, plotArea.y + plotArea.h * 0.75);
      quadText('Low absorption\nHigh impact\n(Reduce margin)', plotArea.x + plotArea.w * 0.75, plotArea.y + plotArea.h * 0.75);
    }

    if (showAxisLabels && xAxisLabel) {
      svg.push(`<text x="${plot.x + plot.w / 2}" y="${plot.y + plot.h + metrics.xLabelOffset}" text-anchor="middle" font-size="${axisHeader}" font-weight="700" fill="${escape(axisColor)}" font-family="${escape(axisFont)}, Arial, sans-serif">${escape(xAxisLabel)}</text>`);
    }
    if (showAxisLabels && yAxisLabel) {
      const x = plot.x - metrics.yLabelOffset;
      svg.push(`<text x="${x}" y="${plot.y + plot.h / 2}" text-anchor="middle" font-size="${axisHeader}" font-weight="700" fill="${escape(axisColor)}" font-family="${escape(axisFont)}, Arial, sans-serif" transform="rotate(-90 ${x} ${plot.y + plot.h / 2})">${escape(yAxisLabel)}</text>`);
    }

    if (showColorScale) {
      svg.push(`<defs><linearGradient id="mvp-scale" x1="0" y1="1" x2="0" y2="0">`);
      svg.push(`<stop offset="0%" stop-color="${escape(scaleStartColor)}"/>`);
      svg.push(`<stop offset="100%" stop-color="${escape(scaleEndColor)}"/>`);
      svg.push(`</linearGradient></defs>`);
      const barW = 14;
      const barH = plot.h * 0.7;
      const barX = plot.x + plot.w + 18;
      const barY = plot.y + (plot.h - barH) / 2;
      const captionPad = clamp(scaleCaptionPadding, 0, 200);
      const labelPad = clamp(scaleLabelPadding, 0, 200);
      const captionPx = fontPx(scaleCaptionSize, 6, 32);
      const labelPx = fontPx(scaleLabelSize, 6, 32);
      svg.push(`<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" fill="url(#mvp-scale)" stroke="#0f172a" stroke-width="1"/>`);
      if (scaleCaption) {
        const tx = barX + barW + 16 + captionPad;
        const ty = barY + barH / 2;
        svg.push(`<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="${captionPx}" fill="${escape(axisColor)}" font-family="${escape(axisFont)}, Arial, sans-serif" transform="rotate(-90 ${tx} ${ty})">${escape(scaleCaption)}</text>`);
      }
      svg.push(`<text x="${barX + barW + 6 + labelPad}" y="${barY + barH}" text-anchor="start" font-size="${labelPx}" fill="${escape(axisColor)}" font-family="${escape(axisFont)}, Arial, sans-serif">${minAbs.toFixed(clamp(scaleDecimals, 0, 6))}</text>`);
      svg.push(`<text x="${barX + barW + 6 + labelPad}" y="${barY + 8}" text-anchor="start" font-size="${labelPx}" fill="${escape(axisColor)}" font-family="${escape(axisFont)}, Arial, sans-serif">${maxAbs.toFixed(clamp(scaleDecimals, 0, 6))}</text>`);
    }

    points.forEach((p) => {
      const cx = xScale(p.x);
      const cy = yScale(p.y);
      const fill = pickPointColor(Math.abs(p.excess), minAbs, maxAbs);
      const r = clamp(p.r * scaleRef, minR, maxR);
      svg.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" fill-opacity="${(clamp(bubbleOpacity, 0, 100) / 100).toFixed(3)}" stroke="#0f172a" stroke-width="0.9"/>`);
    });

    if (showPointLabels) {
      const labelPx = fontPx(pointLabelSize, 6, 64);
      const labelOpacity = (clamp(pointLabelOpacity, 0, 100) / 100).toFixed(3);
      points.forEach((p) => {
        const cx = xScale(p.x);
        const cy = yScale(p.y);
        const r = clamp(p.r * scaleRef, minR, maxR);
        svg.push(`<text x="${cx + r + 6}" y="${cy - r / 2}" font-family="${escape(axisFont)}, Arial, sans-serif" font-size="${labelPx}" font-weight="700" fill="#0f172a" fill-opacity="${labelOpacity}">${escape(p.label)}</text>`);
      });
    }

    svg.push(`</svg>`);
    return svg.join('');
  };

  const renderCanvas = async (w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(w);
    canvas.height = Math.floor(h);
    const ctx = canvas.getContext('2d');
    const layout = computeLayout(canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (showTitle) {
      ctx.fillStyle = titleColor;
      ctx.font = `700 ${fontPx(titleSize, 6, 90)}px ${titleFont}, Arial, sans-serif`;
      ctx.fillText(title, layout.pad, layout.pad);
    }
    if (plotData) {
      drawPlot(ctx, canvas, layout);
    } else if (imageSrc) {
      const img = await loadImage(imageSrc);
      const { plot } = layout;
      const imgRatio = img.width / img.height || 1;
      const plotRatio = plot.w / plot.h;
      let dw = plot.w;
      let dh = plot.h;
      if (imgRatio > plotRatio) dh = dw / imgRatio;
      else dw = dh * imgRatio;
      const dx = plot.x + (plot.w - dw) / 2;
      const dy = plot.y + (plot.h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    return canvas;
  };

  useEffect(() => {
    const preview = previewCanvasRef.current;
    if (!open || !preview) return;
    renderCanvas(widthPx, heightPx).then((canvas) => {
      preview.width = canvas.width;
      preview.height = canvas.height;
      const ctx = preview.getContext('2d');
      ctx.clearRect(0, 0, preview.width, preview.height);
      ctx.drawImage(canvas, 0, 0);
    });
  }, [
    open,
    widthPx,
    heightPx,
    padding,
    title,
    titleColor,
    titleFont,
    titleSize,
    showTitle,
    showAxes,
    showTopBorder,
    showRightBorder,
    showAxisLabels,
    showPointLabels,
    showMidlines,
    showColorScale,
    showGridlines,
    quadOpacity,
    quadTL,
    quadTR,
    quadBL,
    quadBR,
    quadInset,
    showQuadrants,
    showQuadrantText,
    quadrantTextSize,
    xAxisLabel,
    yAxisLabel,
    axisColor,
    axisFont,
    axisHeaderFontSize,
    axisValueFontSize,
    xAxisLabelPadding,
    yAxisLabelPadding,
    xAxisValuePadding,
    yAxisValuePadding,
    xAxisDecimals,
    yAxisDecimals,
    useCustomBounds,
    xMin,
    xMax,
    yMin,
    yMax,
    pointLabelSize,
    bubbleOpacity,
    pointLabelOpacity,
    useCustomPlotSize,
    plotWidth,
    plotHeight,
    plotOffsetX,
    plotOffsetY,
    scaleStartColor,
    scaleEndColor,
    scaleCaption,
    scaleCaptionSize,
    scaleLabelSize,
    scaleDecimals,
    scaleCaptionPadding,
    scaleLabelPadding,
    scaleEdgePadding,
    plotData,
    imageSrc,
  ]);

  const handleExport = async () => {
    if (format === 'svg') {
      const svg = buildSvgString(widthPx, heightPx);
      if (!svg) return;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${sanitizeName(filename)}.svg`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      return;
    }
    if (format === 'pdf') {
      const canvas = await renderCanvas(widthPx, heightPx);
      const imageData = canvas.toDataURL('image/png');
      const widthPt = Math.max(36, toPt(widthVal, unit, dpi));
      const heightPt = Math.max(36, toPt(heightVal, unit, dpi));
      const pdf = new jsPDF({
        orientation: widthPt >= heightPt ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [widthPt, heightPt],
        compress: true,
      });
      pdf.addImage(imageData, 'PNG', 0, 0, widthPt, heightPt, undefined, 'FAST');
      pdf.save(`${sanitizeName(filename)}.pdf`);
      return;
    }
    const canvas = await renderCanvas(widthPx, heightPx);
    exportCanvas(canvas, filename);
  };

  const buildSettingsSnapshot = () => ({
    version: 1,
    filename,
    title,
    widthVal,
    heightVal,
    unit,
    dpi,
    format,
    lockAspect,
    padding,
    showTitle,
    titleColor,
    titleFont,
    titleSize,
    showAxes,
    showTopBorder,
    showRightBorder,
    showAxisLabels,
    showPointLabels,
    showMidlines,
    showColorScale,
    showGridlines,
    quadOpacity,
    quadTL,
    quadTR,
    quadBL,
    quadBR,
    quadInset,
    showQuadrants,
    showQuadrantText,
    quadrantTextSize,
    axisFont,
    axisValueFontSize,
    axisHeaderFontSize,
    axisColor,
    xAxisLabel,
    yAxisLabel,
    xAxisLabelPadding,
    yAxisLabelPadding,
    xAxisValuePadding,
    yAxisValuePadding,
    xAxisDecimals,
    yAxisDecimals,
    useCustomBounds,
    xMin,
    xMax,
    yMin,
    yMax,
    pointLabelSize,
    bubbleOpacity,
    pointLabelOpacity,
    useCustomPlotSize,
    plotWidth,
    plotHeight,
    plotOffsetX,
    plotOffsetY,
    scaleStartColor,
    scaleEndColor,
    scaleCaption,
    scaleCaptionSize,
    scaleLabelSize,
    scaleDecimals,
    scaleCaptionPadding,
    scaleLabelPadding,
    scaleEdgePadding,
  });

  const handleSaveSettings = () => {
    const payload = JSON.stringify(buildSettingsSnapshot(), null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeName(filename || 'image_export_settings')}.image-export-settings.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const applyImportedSettings = (data) => {
    if (!data || typeof data !== 'object') return;
    const num = (value, min, max) => clamp(value, min, max);
    const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
    const has = (key) => Object.prototype.hasOwnProperty.call(data, key);

    if (has('filename')) setFilename(str(data.filename, filename));
    if (has('title')) setTitle(str(data.title, title));

    const nextWidth = has('widthVal') ? num(data.widthVal, 0.1, 1000) : Number(widthVal);
    const nextHeight = has('heightVal') ? num(data.heightVal, 0.1, 1000) : Number(heightVal);
    if (has('widthVal')) setWidthVal(nextWidth);
    if (has('heightVal')) setHeightVal(nextHeight);
    if (nextHeight > 0) setRatio(nextWidth / nextHeight);

    if (has('unit')) setUnit(['px', 'cm', 'mm'].includes(data.unit) ? data.unit : unit);
    if (has('dpi')) setDpi(num(data.dpi, 72, 1200));
    if (has('format')) setFormat(['png', 'svg', 'pdf'].includes(data.format) ? data.format : format);
    if (has('lockAspect')) setLockAspect(Boolean(data.lockAspect));
    if (has('padding')) setPadding(num(data.padding, 0, 200));
    if (has('showTitle')) setShowTitle(Boolean(data.showTitle));
    if (has('titleColor')) setTitleColor(str(data.titleColor, titleColor));
    if (has('titleFont')) setTitleFont(str(data.titleFont, titleFont));
    if (has('titleSize')) setTitleSize(num(data.titleSize, 8, 90));
    if (has('showAxes')) setShowAxes(Boolean(data.showAxes));
    if (has('showTopBorder')) setShowTopBorder(Boolean(data.showTopBorder));
    if (has('showRightBorder')) setShowRightBorder(Boolean(data.showRightBorder));
    if (has('showAxisLabels')) setShowAxisLabels(Boolean(data.showAxisLabels));
    if (has('showPointLabels')) setShowPointLabels(Boolean(data.showPointLabels));
    if (has('showMidlines')) setShowMidlines(Boolean(data.showMidlines));
    if (has('showColorScale')) setShowColorScale(Boolean(data.showColorScale));
    if (has('showGridlines')) setShowGridlines(Boolean(data.showGridlines));
    if (has('quadOpacity')) setQuadOpacity(num(data.quadOpacity, 0, 100));
    if (has('quadTL')) setQuadTL(str(data.quadTL, quadTL));
    if (has('quadTR')) setQuadTR(str(data.quadTR, quadTR));
    if (has('quadBL')) setQuadBL(str(data.quadBL, quadBL));
    if (has('quadBR')) setQuadBR(str(data.quadBR, quadBR));
    setQuadInset(0);
    if (has('showQuadrants')) setShowQuadrants(Boolean(data.showQuadrants));
    if (has('showQuadrantText')) setShowQuadrantText(Boolean(data.showQuadrantText));
    if (has('quadrantTextSize')) setQuadrantTextSize(num(data.quadrantTextSize, 6, 64));
    if (has('axisFont')) setAxisFont(str(data.axisFont, axisFont));
    if (has('axisValueFontSize')) setAxisValueFontSize(num(data.axisValueFontSize, 8, 40));
    if (has('axisHeaderFontSize')) setAxisHeaderFontSize(num(data.axisHeaderFontSize, 8, 64));
    if (has('axisColor')) setAxisColor(str(data.axisColor, axisColor));
    if (has('xAxisLabel')) setXAxisLabel(str(data.xAxisLabel, xAxisLabel));
    if (has('yAxisLabel')) setYAxisLabel(str(data.yAxisLabel, yAxisLabel));
    if (has('xAxisLabelPadding')) setXAxisLabelPadding(num(data.xAxisLabelPadding, -1000, 1000));
    if (has('yAxisLabelPadding')) setYAxisLabelPadding(num(data.yAxisLabelPadding, -1000, 1000));
    if (has('xAxisValuePadding')) setXAxisValuePadding(num(data.xAxisValuePadding, -1000, 1000));
    if (has('yAxisValuePadding')) setYAxisValuePadding(num(data.yAxisValuePadding, -1000, 1000));
    if (has('xAxisDecimals')) setXAxisDecimals(num(data.xAxisDecimals, 0, 6));
    if (has('yAxisDecimals')) setYAxisDecimals(num(data.yAxisDecimals, 0, 6));
    if (has('useCustomBounds')) setUseCustomBounds(Boolean(data.useCustomBounds));
    if (has('xMin')) setXMin(data.xMin === '' ? '' : String(data.xMin));
    if (has('xMax')) setXMax(data.xMax === '' ? '' : String(data.xMax));
    if (has('yMin')) setYMin(data.yMin === '' ? '' : String(data.yMin));
    if (has('yMax')) setYMax(data.yMax === '' ? '' : String(data.yMax));
    if (has('pointLabelSize')) setPointLabelSize(num(data.pointLabelSize, 6, 64));
    if (has('bubbleOpacity')) setBubbleOpacity(num(data.bubbleOpacity, 0, 100));
    if (has('pointLabelOpacity')) setPointLabelOpacity(num(data.pointLabelOpacity, 0, 100));
    if (has('useCustomPlotSize')) setUseCustomPlotSize(Boolean(data.useCustomPlotSize));
    if (has('plotWidth')) setPlotWidth(num(data.plotWidth, 120, 10000));
    if (has('plotHeight')) setPlotHeight(num(data.plotHeight, 120, 10000));
    if (has('plotOffsetX')) setPlotOffsetX(num(data.plotOffsetX, -10000, 10000));
    if (has('plotOffsetY')) setPlotOffsetY(num(data.plotOffsetY, -10000, 10000));
    if (has('scaleStartColor')) setScaleStartColor(str(data.scaleStartColor, scaleStartColor));
    if (has('scaleEndColor')) setScaleEndColor(str(data.scaleEndColor, scaleEndColor));
    if (has('scaleCaption')) setScaleCaption(str(data.scaleCaption, scaleCaption));
    if (has('scaleCaptionSize')) setScaleCaptionSize(num(data.scaleCaptionSize, 6, 32));
    if (has('scaleLabelSize')) setScaleLabelSize(num(data.scaleLabelSize, 6, 32));
    if (has('scaleDecimals')) setScaleDecimals(num(data.scaleDecimals, 0, 6));
    if (has('scaleCaptionPadding')) setScaleCaptionPadding(num(data.scaleCaptionPadding, 0, 200));
    if (has('scaleLabelPadding')) setScaleLabelPadding(num(data.scaleLabelPadding, 0, 200));
    if (has('scaleEdgePadding')) setScaleEdgePadding(num(data.scaleEdgePadding, -400, 400));
  };

  const handleImportSettings = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      applyImportedSettings(parsed);
    } catch (error) {
      window.alert('Could not import settings file. Please select a valid JSON export settings file.');
    } finally {
      event.target.value = '';
    }
  };

  if (!open) return null;

  const previewWidth = unit === 'px' ? `${widthVal}px` : `${widthVal}${unit}`;
  const previewHeight = unit === 'px' ? `${heightVal}px` : `${heightVal}${unit}`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(1500px, 96vw)', height: 'min(920px, 92vh)', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', boxShadow: '0 20px 60px rgba(15,23,42,0.25)', position: 'relative', paddingBottom: 62 }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#475569' }}>×</button>
          <div style={{ width: 380, flexShrink: 0, padding: 16, borderRight: '1px solid #e2e8f0', overflowY: 'auto', background: '#f1f5f9' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 12, marginLeft: 4 }}>Settings</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12, borderBottom: '1px solid #cbd5e1', paddingBottom: 0 }}>
            {(isPlotMode
              ? [
                ['layout', 'Layout'],
                ['display', 'Display'],
                ['scale', 'Plot'],
                ['text', 'Text'],
                ['quadrants', 'Quadrants'],
                ['axes', 'Axes'],
              ]
              : [
                ['layout', 'Layout'],
                ['display', 'Display'],
                ['text', 'Text'],
              ]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSettingsTab(id)}
                style={{
                  padding: '7px 10px',
                  marginBottom: -1,
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  border: '1px solid #cbd5e1',
                  borderBottomColor: settingsTab === id ? '#f1f5f9' : '#cbd5e1',
                  background: settingsTab === id ? '#f1f5f9' : '#ffffff',
                  color: settingsTab === id ? '#0f172a' : '#475569',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {settingsTab === 'layout' && (
            <>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Filename</span>
            <input value={filename} onChange={(e) => setFilename(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <label>
              <span style={{ fontSize: 11, color: '#475569' }}>Width</span>
              <input type="number" value={widthVal} onChange={(e) => onWidthChange(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4 }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#475569' }}>Height</span>
              <input type="number" value={heightVal} onChange={(e) => onHeightChange(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4 }} />
            </label>
          </div>
          {isPlotMode && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 8 }}>
                <input type="checkbox" checked={useCustomPlotSize} onChange={(e) => setUseCustomPlotSize(e.target.checked)} />
                Set graph area size
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <label>
                  <span style={{ fontSize: 11, color: '#475569' }}>Graph width (px)</span>
                  <input type="number" value={plotWidth} onChange={(e) => setPlotWidth(e.target.value)} disabled={!useCustomPlotSize} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: useCustomPlotSize ? '#fff' : '#f8fafc' }} />
                </label>
                <label>
                  <span style={{ fontSize: 11, color: '#475569' }}>Graph height (px)</span>
                  <input type="number" value={plotHeight} onChange={(e) => setPlotHeight(e.target.value)} disabled={!useCustomPlotSize} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: useCustomPlotSize ? '#fff' : '#f8fafc' }} />
                </label>
                <label>
                  <span style={{ fontSize: 11, color: '#475569' }}>Graph offset X (px)</span>
                  <input type="number" value={plotOffsetX} onChange={(e) => setPlotOffsetX(e.target.value)} disabled={!useCustomPlotSize} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: useCustomPlotSize ? '#fff' : '#f8fafc' }} />
                </label>
                <label>
                  <span style={{ fontSize: 11, color: '#475569' }}>Graph offset Y (px)</span>
                  <input type="number" value={plotOffsetY} onChange={(e) => setPlotOffsetY(e.target.value)} disabled={!useCustomPlotSize} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: useCustomPlotSize ? '#fff' : '#f8fafc' }} />
                </label>
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <label>
              <span style={{ fontSize: 11, color: '#475569' }}>Units</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4 }}>
                <option value="px">px</option>
                <option value="cm">cm</option>
                <option value="mm">mm</option>
              </select>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#475569' }}>DPI</span>
              <input type="number" value={dpi} onChange={(e) => setDpi(clamp(e.target.value, 72, 1200))} disabled={unit === 'px'} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: unit === 'px' ? '#f8fafc' : '#fff' }} />
            </label>
          </div>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4 }}>
              <option value="png">PNG (raster)</option>
              <option value="svg">SVG (vector)</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          {format === 'pdf' && (
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
              PDF export downloads directly.
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 8 }}>
            <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
            Lock aspect ratio
          </label>
            </>
          )}
          {settingsTab === 'display' && (
            <>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>Elements</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
            <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} />
            Show title
          </label>
          {isPlotMode && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showAxes} onChange={(e) => setShowAxes(e.target.checked)} />
                Show axes & ticks
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showTopBorder} onChange={(e) => setShowTopBorder(e.target.checked)} />
                Show top border
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showRightBorder} onChange={(e) => setShowRightBorder(e.target.checked)} />
                Show right border
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showGridlines} onChange={(e) => setShowGridlines(e.target.checked)} />
                Show gridlines
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showAxisLabels} onChange={(e) => setShowAxisLabels(e.target.checked)} />
                Show axis labels
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showMidlines} onChange={(e) => setShowMidlines(e.target.checked)} />
                Show midlines
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showQuadrants} onChange={(e) => setShowQuadrants(e.target.checked)} />
                Show quadrants
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showQuadrantText} onChange={(e) => setShowQuadrantText(e.target.checked)} />
                Show quadrant text
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
                <input type="checkbox" checked={showPointLabels} onChange={(e) => setShowPointLabels(e.target.checked)} />
                Show point labels
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 10 }}>
                <input type="checkbox" checked={showColorScale} onChange={(e) => setShowColorScale(e.target.checked)} />
                Show colour scale
              </label>
            </>
          )}
            </>
          )}
          {settingsTab === 'scale' && (
            <>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>Plot</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 10, width: '100%' }}>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Bubble opacity (%)</span>
              <input type="range" min="0" max="100" value={bubbleOpacity} onChange={(e) => setBubbleOpacity(e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Point label opacity (%)</span>
              <input type="range" min="0" max="100" value={pointLabelOpacity} onChange={(e) => setPointLabelOpacity(e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Scale start</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <input type="color" value={scaleStartColor} onChange={(e) => setScaleStartColor(e.target.value)} style={{ width: 44, height: 34, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                <input value={scaleStartColor} onChange={(e) => setScaleStartColor(e.target.value)} placeholder="#16a34a" style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Scale end</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <input type="color" value={scaleEndColor} onChange={(e) => setScaleEndColor(e.target.value)} style={{ width: 44, height: 34, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                <input value={scaleEndColor} onChange={(e) => setScaleEndColor(e.target.value)} placeholder="#dc2626" style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Scale caption</span>
              <input value={scaleCaption} onChange={(e) => setScaleCaption(e.target.value)} style={{ width: '100%', minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Caption size (pt)</span>
              <input type="text" inputMode="decimal" value={scaleCaptionSize} onChange={(e) => setScaleCaptionSize(e.target.value)} onBlur={(e) => setScaleCaptionSize(clamp(e.target.value, 6, 32))} style={{ width: '100%', minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Label size (pt)</span>
              <input type="text" inputMode="decimal" value={scaleLabelSize} onChange={(e) => setScaleLabelSize(e.target.value)} onBlur={(e) => setScaleLabelSize(clamp(e.target.value, 6, 32))} style={{ width: '100%', minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Scale decimals</span>
              <input type="number" value={scaleDecimals} onChange={(e) => setScaleDecimals(e.target.value)} onBlur={(e) => setScaleDecimals(clamp(e.target.value, 0, 6))} style={{ width: '100%', minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Caption padding (px)</span>
              <input type="number" value={scaleCaptionPadding} onChange={(e) => setScaleCaptionPadding(e.target.value)} onBlur={(e) => setScaleCaptionPadding(clamp(e.target.value, 0, 200))} style={{ width: '100%', minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Label padding (px)</span>
              <input type="number" value={scaleLabelPadding} onChange={(e) => setScaleLabelPadding(e.target.value)} onBlur={(e) => setScaleLabelPadding(clamp(e.target.value, 0, 200))} style={{ width: '100%', minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Right edge padding (px)</span>
              <input type="number" value={scaleEdgePadding} onChange={(e) => setScaleEdgePadding(e.target.value)} onBlur={(e) => setScaleEdgePadding(clamp(e.target.value, -400, 400))} style={{ width: '100%', minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
          </div>
            </>
          )}
          {settingsTab === 'text' && (
            <>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>Typography</div>
          <label style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Title font</span>
            <select value={titleFont} onChange={(e) => setTitleFont(e.target.value)} style={{ width: '100%', padding: 6, marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 6 }}>
              {SYSTEM_FONTS.map((f) => <option key={`title_${f}`} value={f}>{f}</option>)}
            </select>
          </label>
          <label style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Title size (pt)</span>
            <input type="number" value={titleSize} onChange={(e) => setTitleSize(clamp(e.target.value, 8, 90))} style={{ width: '100%', padding: 6, marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 6 }} />
          </label>
          <label style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Title color</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, width: '100%' }}>
              <input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} style={{ width: 44, height: 34, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              <input value={titleColor} onChange={(e) => setTitleColor(e.target.value)} placeholder="#0f172a" style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </div>
          </label>
            </>
          )}
          {settingsTab === 'quadrants' && (
            <>
          <div style={{ fontSize: 11, color: '#475569', margin: '10px 0 6px' }}>Quadrants</div>
          <label style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Label size (pt)</span>
            <input type="text" inputMode="decimal" value={quadrantTextSize} onChange={(e) => setQuadrantTextSize(e.target.value)} onBlur={(e) => setQuadrantTextSize(clamp(e.target.value, 6, 64))} style={{ width: '100%', padding: 6, marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 6 }} />
          </label>
          <label style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Point label size (pt)</span>
            <input type="text" inputMode="decimal" value={pointLabelSize} onChange={(e) => setPointLabelSize(e.target.value)} onBlur={(e) => setPointLabelSize(clamp(e.target.value, 6, 64))} style={{ width: '100%', padding: 6, marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 6 }} />
          </label>
          <label style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Opacity</span>
            <input type="range" min="0" max="100" value={quadOpacity} onChange={(e) => setQuadOpacity(e.target.value)} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 10, width: '100%' }}>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Top-left</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, width: '100%' }}>
                <input type="color" value={quadTL} onChange={(e) => setQuadTL(e.target.value)} style={{ width: 44, height: 32, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                <input value={quadTL} onChange={(e) => setQuadTL(e.target.value)} style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Top-right</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, width: '100%' }}>
                <input type="color" value={quadTR} onChange={(e) => setQuadTR(e.target.value)} style={{ width: 44, height: 32, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                <input value={quadTR} onChange={(e) => setQuadTR(e.target.value)} style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Bottom-left</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, width: '100%' }}>
                <input type="color" value={quadBL} onChange={(e) => setQuadBL(e.target.value)} style={{ width: 44, height: 32, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                <input value={quadBL} onChange={(e) => setQuadBL(e.target.value)} style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Bottom-right</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, width: '100%' }}>
                <input type="color" value={quadBR} onChange={(e) => setQuadBR(e.target.value)} style={{ width: 44, height: 32, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                <input value={quadBR} onChange={(e) => setQuadBR(e.target.value)} style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
            </label>
          </div>
            </>
          )}
          {settingsTab === 'axes' && (
            <>
          <div style={{ fontSize: 11, color: '#475569', margin: '10px 0 6px' }}>Axis Labels</div>
          <label style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Font</span>
            <select value={axisFont} onChange={(e) => setAxisFont(e.target.value)} style={{ width: '100%', padding: 6, marginTop: 4, borderRadius: 6, border: '1px solid #cbd5e1' }}>
              {SYSTEM_FONTS.map((f) => <option key={`axis_${f}`} value={f}>{f}</option>)}
            </select>
          </label>
          <label style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: '#64748b' }}>Header size (pt)</span><input type="text" inputMode="decimal" value={axisHeaderFontSize} onChange={(e) => setAxisHeaderFontSize(e.target.value)} onBlur={(e) => setAxisHeaderFontSize(clamp(e.target.value, 8, 64))} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          <label style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: '#64748b' }}>Value size (pt)</span><input type="text" inputMode="decimal" value={axisValueFontSize} onChange={(e) => setAxisValueFontSize(e.target.value)} onBlur={(e) => setAxisValueFontSize(clamp(e.target.value, 8, 40))} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <label><span style={{ fontSize: 11, color: '#64748b' }}>X-axis decimals</span><input type="number" value={xAxisDecimals} onChange={(e) => setXAxisDecimals(e.target.value)} onBlur={(e) => setXAxisDecimals(clamp(e.target.value, 0, 6))} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
            <label><span style={{ fontSize: 11, color: '#64748b' }}>Y-axis decimals</span><input type="number" value={yAxisDecimals} onChange={(e) => setYAxisDecimals(e.target.value)} onBlur={(e) => setYAxisDecimals(clamp(e.target.value, 0, 6))} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          </div>
          <label style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Color</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, width: '100%' }}>
              <input type="color" value={axisColor} onChange={(e) => setAxisColor(e.target.value)} style={{ width: 44, height: 34, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              <input value={axisColor} onChange={(e) => setAxisColor(e.target.value)} placeholder="#0f172a" style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </div>
          </label>
          <label style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: '#64748b' }}>X-axis header</span><input value={xAxisLabel} onChange={(e) => setXAxisLabel(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          <label style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: '#64748b' }}>Y-axis header</span><input value={yAxisLabel} onChange={(e) => setYAxisLabel(e.target.value)} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          <label style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: '#64748b' }}>X-axis value padding (px)</span><input type="number" value={xAxisValuePadding} onChange={(e) => setXAxisValuePadding(e.target.value)} onBlur={(e) => setXAxisValuePadding(clamp(e.target.value, -1000, 1000))} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          <label style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: '#64748b' }}>X-axis label padding (px)</span><input type="number" value={xAxisLabelPadding} onChange={(e) => setXAxisLabelPadding(e.target.value)} onBlur={(e) => setXAxisLabelPadding(clamp(e.target.value, -1000, 1000))} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          <label style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: '#64748b' }}>Y-axis value padding (px)</span><input type="number" value={yAxisValuePadding} onChange={(e) => setYAxisValuePadding(e.target.value)} onBlur={(e) => setYAxisValuePadding(clamp(e.target.value, -1000, 1000))} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          <label style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: '#64748b' }}>Y-axis label padding (px)</span><input type="number" value={yAxisLabelPadding} onChange={(e) => setYAxisLabelPadding(e.target.value)} onBlur={(e) => setYAxisLabelPadding(clamp(e.target.value, -1000, 1000))} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} /></label>
          <div style={{ fontSize: 11, color: '#475569', margin: '10px 0 6px' }}>Axis Bounds</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 8 }}>
            <input type="checkbox" checked={useCustomBounds} onChange={(e) => setUseCustomBounds(e.target.checked)} />
            Use custom bounds
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>X min</span>
            <input type="text" inputMode="decimal" value={xMin} onChange={(e) => setXMin(e.target.value)} disabled={!useCustomBounds} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: useCustomBounds ? '#fff' : '#f8fafc' }} />
          </label>
          <label>
            <span style={{ fontSize: 11, color: '#64748b' }}>X max</span>
            <input type="text" inputMode="decimal" value={xMax} onChange={(e) => setXMax(e.target.value)} disabled={!useCustomBounds} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: useCustomBounds ? '#fff' : '#f8fafc' }} />
          </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <label>
              <span style={{ fontSize: 11, color: '#64748b' }}>Y min</span>
            <input type="text" inputMode="decimal" value={yMin} onChange={(e) => setYMin(e.target.value)} disabled={!useCustomBounds} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: useCustomBounds ? '#fff' : '#f8fafc' }} />
          </label>
          <label>
            <span style={{ fontSize: 11, color: '#64748b' }}>Y max</span>
            <input type="text" inputMode="decimal" value={yMax} onChange={(e) => setYMax(e.target.value)} disabled={!useCustomBounds} style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, background: useCustomBounds ? '#fff' : '#f8fafc' }} />
          </label>
          </div>
            </>
          )}
        </div>
        <div style={{ flex: 1, background: '#fff', padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <canvas
            ref={previewCanvasRef}
            style={{
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              width: previewWidth,
              height: previewHeight,
              maxWidth: '100%',
              maxHeight: '100%',
              transform: `scale(${Number(previewZoom) / 100})`,
              transformOrigin: 'center center',
              boxShadow: '0 20px 30px rgba(15,23,42,0.12)',
            }}
          />
        </div>
        <input ref={settingsFileInputRef} type="file" accept=".json,application/json" onChange={handleImportSettings} style={{ display: 'none' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTop: '1px solid #e2e8f0', background: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleSaveSettings} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>Save settings</button>
            <button type="button" onClick={() => settingsFileInputRef.current?.click()} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>Import settings</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Zoom</span>
            <input type="range" min="25" max="200" step="5" value={previewZoom} onChange={(e) => setPreviewZoom(clamp(e.target.value, 25, 200))} style={{ width: 120 }} />
            <input type="number" value={previewZoom} onChange={(e) => setPreviewZoom(clamp(e.target.value, 25, 200))} style={{ width: 56, padding: 4, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>%</span>
          </div>
          <button type="button" onClick={onClose} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
          <button type="button" onClick={handleExport} style={{ padding: '10px 12px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 700 }}>
            {format === 'svg' ? 'Export SVG' : format === 'pdf' ? 'Export PDF' : 'Export PNG'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageExportDialog;

