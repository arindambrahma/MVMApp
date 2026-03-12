import React, { useMemo, useRef, useState } from 'react';
import { runAnalysis } from '../utils/api';
import { sanitize } from '../utils/helpers';
import ImageExportDialog from './ImageExportDialog';

function pct(v, decimals = 2) {
  return `${((v || 0) * 100).toFixed(decimals)}%`;
}

function num(v, decimals = 4) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  return n.toFixed(decimals);
}

function matrixCellStyle(value) {
  const n = Number(value || 0);
  const strength = Math.abs(n);
  const bg = strength < 0.01 ? 'transparent'
    : strength < 0.05 ? '#F8FAFC'
    : strength < 0.15 ? '#E2E8F0'
    : '#CBD5E1';
  return {
    textAlign: 'right',
    padding: '5px 8px',
    fontSize: 10,
    color: '#1E293B',
    background: bg,
  };
}

function rankedEntries(obj) {
  return Object.entries(obj || {}).sort((a, b) => Math.abs(b[1] || 0) - Math.abs(a[1] || 0));
}

function extremaWithResponsible(obj) {
  const entries = Object.entries(obj || {})
    .map(([k, v]) => [k, Number(v)])
    .filter(([, v]) => Number.isFinite(v));
  if (!entries.length) {
    return {
      max: { value: NaN, responsible: [] },
      min: { value: NaN, responsible: [] },
    };
  }
  const vals = entries.map(([, v]) => v);
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);
  const tol = 1e-9;
  return {
    max: { value: maxVal, responsible: entries.filter(([, v]) => Math.abs(v - maxVal) <= tol).map(([k]) => k) },
    min: { value: minVal, responsible: entries.filter(([, v]) => Math.abs(v - minVal) <= tol).map(([k]) => k) },
  };
}

function MatrixTable({ title, rowKeys = [], colKeys = [], data = {}, rowLabel = 'Margin' }) {
  return (
    <div style={{ marginTop: 12, border: '1px solid #E2E8F0', borderRadius: 6, background: '#FFFFFF', overflow: 'hidden' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
        {title}
      </div>
      {!rowKeys.length || !colKeys.length ? (
        <div style={{ padding: '8px 10px', fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>No data available.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ textAlign: 'left', padding: '5px 8px', color: '#64748B' }}>{rowLabel}</th>
                {colKeys.map((c) => (
                  <th key={`${title}_head_${c}`} style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowKeys.map((r) => (
                <tr key={`${title}_row_${r}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '5px 8px', color: '#334155', fontWeight: 600 }}>{r.replace('E_', 'E')}</td>
                  {colKeys.map((c) => (
                    <td key={`${title}_${r}_${c}`} style={matrixCellStyle(data?.[r]?.[c])}>
                      {pct(data?.[r]?.[c], 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BubbleMVMPlot({
  baselinePoints = [],
  overlayPoints = [],
  width = 980,
  height = 380,
  axisFontSize = 10,
  xDomain = null,
  yDomain = null,
  plotData = null,
  exportName = 'redesign_plot',
  onAddToReport = null,
  tables = [],
}) {
  const svgRef = useRef(null);
  const [showImageExport, setShowImageExport] = useState(false);
  const [imageExportSrc, setImageExportSrc] = useState('');

  const capturePlotImage = () => {
    const svg = svgRef.current;
    if (!svg) return null;
    const svgStr = new XMLSerializer().serializeToString(svg);
    try {
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
    } catch {
      return null;
    }
  };

  const all = [...baselinePoints, ...overlayPoints];
  if (!all.length) {
    return <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>No plot data.</div>;
  }

  const xs = all.map((p) => Number(p.x)).filter(Number.isFinite);
  const ys = all.map((p) => Number(p.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;

  const minXRaw = Math.min(...xs);
  const maxXRaw = Math.max(...xs);
  const minYRaw = Math.min(...ys);
  const maxYRaw = Math.max(...ys);
  const xPad = Math.max(0.002, (maxXRaw - minXRaw) * 0.1);
  const yPad = Math.max(0.002, (maxYRaw - minYRaw) * 0.1);
  const autoMinX = minXRaw - xPad;
  const autoMaxX = maxXRaw + xPad;
  const autoMinY = minYRaw - yPad;
  const autoMaxY = maxYRaw + yPad;
  const minX = Number.isFinite(xDomain?.min) ? xDomain.min : autoMinX;
  const maxX = Number.isFinite(xDomain?.max) ? xDomain.max : autoMaxX;
  const minY = Number.isFinite(yDomain?.min) ? yDomain.min : autoMinY;
  const maxY = Number.isFinite(yDomain?.max) ? yDomain.max : autoMaxY;

  const left = 68;
  const right = 20;
  const top = 16;
  const bottom = 48;
  const w = width - left - right;
  const h = height - top - bottom;
  const xScale = (x) => (maxX === minX ? left + w / 2 : left + ((x - minX) / (maxX - minX)) * w);
  const yScale = (y) => (maxY === minY ? top + h / 2 : top + ((maxY - y) / (maxY - minY)) * h);

  const xTicks = 6;
  const yTicks = 6;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + (i / xTicks) * (maxX - minX));
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (i / yTicks) * (maxY - minY));
  const tickFontSize = Math.max(8, axisFontSize);
  const pointFontSize = Math.max(8, axisFontSize - 1);
  const axisLabelFontSize = Math.max(10, axisFontSize + 1);
  const baselineByLabel = new Map(baselinePoints.map((p) => [p.label, p]));
  const movedArrows = overlayPoints
    .map((p) => {
      const base = baselineByLabel.get(p.label);
      if (!base) return null;
      const dx = Number(p.x) - Number(base.x);
      const dy = Number(p.y) - Number(base.y);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
      if (Math.hypot(dx, dy) < 1e-6) return null;
      return { from: base, to: p };
    })
    .filter(Boolean);

  return (
    <div style={{ marginTop: 8, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 8, width: `${width}px`, maxWidth: '100%', boxSizing: 'border-box' }}>
      <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <marker id="redesign-arrowhead" markerWidth="6" markerHeight="6" refX="5.2" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="#94A3B8" />
          </marker>
        </defs>
        {yTickVals.map((tv, i) => {
          const yy = yScale(tv);
          return (
            <g key={`yg_${i}`}>
              <line x1={left} y1={yy} x2={left + w} y2={yy} stroke="#E2E8F0" strokeWidth="1" />
              <text x={left - 6} y={yy + 3} textAnchor="end" fontSize={tickFontSize} fill="#64748B">{(tv * 100).toFixed(2)}</text>
            </g>
          );
        })}
        {xTickVals.map((tv, i) => {
          const xx = xScale(tv);
          return (
            <g key={`xg_${i}`}>
              <line x1={xx} y1={top} x2={xx} y2={top + h} stroke="#F1F5F9" strokeWidth="1" />
              <text x={xx} y={top + h + 14} textAnchor="middle" fontSize={tickFontSize} fill="#64748B">{(tv * 100).toFixed(2)}</text>
            </g>
          );
        })}

        <line x1={left} y1={top} x2={left} y2={top + h} stroke="#475569" strokeWidth="1.2" />
        <line x1={left} y1={top + h} x2={left + w} y2={top + h} stroke="#475569" strokeWidth="1.2" />
        {/* y=0 reference line — always draw so zero is always identifiable */}
        {minY < 0 && (
          <line x1={left} y1={yScale(0)} x2={left + w} y2={yScale(0)} stroke="#94A3B8" strokeWidth="1.2" strokeDasharray="4,3" />
        )}

        {baselinePoints.map((p) => (
          <g key={`base_${p.key}`}>
            <circle
              cx={xScale(p.x)}
              cy={yScale(p.y)}
              r={Math.max(3, Math.min(26, Number(p.r || 6)))}
              fill="#9CA3AF"
              fillOpacity="0.35"
              stroke="#6B7280"
              strokeWidth="1"
            />
            <text x={xScale(p.x)} y={yScale(p.y) - 8} textAnchor="middle" fontSize={pointFontSize} fill="#334155">{p.label}</text>
          </g>
        ))}

        {movedArrows.map((a) => (
          <line
            key={`arrow_${a.from.label}`}
            x1={xScale(a.from.x)}
            y1={yScale(a.from.y)}
            x2={xScale(a.to.x)}
            y2={yScale(a.to.y)}
            stroke="#94A3B8"
            strokeOpacity="0.45"
            strokeWidth="1"
            markerEnd="url(#redesign-arrowhead)"
          />
        ))}

        {overlayPoints.map((p) => {
          const isViolating = Number.isFinite(p.excess) && p.excess <= 1e-8;
          return (
            <g key={`overlay_${p.key}`}>
              <circle
                cx={xScale(p.x)}
                cy={yScale(p.y)}
                r={Math.max(3, Math.min(26, Number(p.r || 6)))}
                fill={isViolating ? '#EF4444' : '#F59E0B'}
                fillOpacity="0.45"
                stroke={isViolating ? '#B91C1C' : '#B45309'}
                strokeWidth={isViolating ? 2 : 1.4}
              />
              <text x={xScale(p.x)} y={yScale(p.y) - 8} textAnchor="middle" fontSize={pointFontSize} fill={isViolating ? '#B91C1C' : '#9A3412'} fontWeight="700">{p.label}</text>
            </g>
          );
        })}

        <text x={left + w / 2} y={height - 8} textAnchor="middle" fontSize={axisLabelFontSize} fill="#475569">
          Undesirable impact on performance parameters (Impactm in %)
        </text>
        <text x={18} y={top + h / 2} transform={`rotate(-90 18 ${top + h / 2})`} textAnchor="middle" fontSize={axisLabelFontSize} fill="#475569">
          Change absorption potential (Absorptionm in %)
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 10, color: '#334155', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: '#9CA3AF', opacity: 0.6, border: '1px solid #6B7280' }} />
          Baseline
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: '#F59E0B', opacity: 0.6, border: '1px solid #B45309' }} />
          Redesigned
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: '#EF4444', opacity: 0.6, border: '2px solid #B91C1C' }} />
          Negative/zero excess
        </div>
      </div>
      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        {onAddToReport && (
          <button
            type="button"
            onClick={() => {
              const svg = svgRef.current;
              if (!svg) return;
              const svgStr = new XMLSerializer().serializeToString(svg);
              const b64 = btoa(unescape(encodeURIComponent(svgStr)));
              onAddToReport(exportName, 'data:image/svg+xml;base64,' + b64, tables);
            }}
            style={{ border: '1px solid #A7C7FA', background: '#EFF6FF', color: '#1E3A8A', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            📋 Add to report
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const src = capturePlotImage();
            if (!src) {
              window.alert('Could not capture the plot for export. Please try again.');
              return;
            }
            setImageExportSrc(src);
            setShowImageExport(true);
          }}
          style={{ border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#166534', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
        >
          ↓ Export image
        </button>
      </div>
      <ImageExportDialog
        open={showImageExport}
        onClose={() => setShowImageExport(false)}
        imageSrc={imageExportSrc}
        plotData={plotData}
        plotPoints={baselinePoints}
        plotOverlayPoints={overlayPoints}
        forcePlotMode
        defaultTitle="Redesign Plot"
        defaultName={exportName}
      />
    </div>
  );
}

// Build an array of { caption, headers, rows } table objects from redesign matrix data.
function buildMatrixTableData(titleSuffix, marginKeys, impactData, absorptionData, utilisationData, utilColKeys) {
  const makeTable = (title, rowKeys, colKeys, data) => {
    if (!rowKeys?.length || !colKeys?.length) return null;
    return {
      caption: title,
      headers: ['Margin', ...colKeys],
      rows: rowKeys.map(r => [r.replace('E_', 'E'), ...colKeys.map(c => pct(data?.[r]?.[c] ?? 0, 2))]),
    };
  };
  const impactCols = Object.keys(impactData?.[marginKeys?.[0]] || {});
  const absorbCols = Object.keys(absorptionData?.[marginKeys?.[0]] || {});
  return [
    makeTable(`Impact Matrix (${titleSuffix})`, marginKeys, impactCols, impactData || {}),
    makeTable(`Absorption Matrix (${titleSuffix})`, marginKeys, absorbCols, absorptionData || {}),
    makeTable(`Utilisation Matrix (${titleSuffix})`, marginKeys, utilColKeys, utilisationData || {}),
  ].filter(Boolean);
}

function RedesignAnalysisModule({
  analysisResult,
  analysisError,
  nodes = [],
  edges = [],
  appliedWeights = {},
  onAddChartToReport = null,
}) {
  const containerStyle = { flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' };
  const [selectedMargin, setSelectedMargin] = useState('');
  const [scenario, setScenario] = useState('reduce_to_limit');
  const [incrementPercent, setIncrementPercent] = useState('2');
  const [reduceByMode, setReduceByMode] = useState('percent');
  const [reduceByPercent, setReduceByPercent] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState(null);
  const [runProgress, setRunProgress] = useState(null);
  const [chartWidth, setChartWidth] = useState(650);
  const [chartHeight, setChartHeight] = useState(380);
  const [fontSize, setFontSize] = useState(10);
  const [lockXAxisScale, setLockXAxisScale] = useState(false);
  const [lockYAxisScale, setLockYAxisScale] = useState(false);
  const chartWidthMin = 520;
  const chartWidthMax = 1200;
  const chartHeightMin = 280;
  const chartHeightMax = 620;
  const fontSizeMin = 8;
  const fontSizeMax = 16;
  const handleChartWidthInput = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setChartWidth(Math.min(chartWidthMax, Math.max(chartWidthMin, parsed)));
  };
  const handleChartHeightInput = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setChartHeight(Math.min(chartHeightMax, Math.max(chartHeightMin, parsed)));
  };
  const handleFontSizeInput = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setFontSize(Math.min(fontSizeMax, Math.max(fontSizeMin, parsed)));
  };

  const result = analysisResult?.result || {};
  const marginKeys = useMemo(() => Object.keys(result.excess || {}), [result]);
  const effectiveMargin = useMemo(() => (
    (selectedMargin && marginKeys.includes(selectedMargin)) ? selectedMargin : (marginKeys[0] || '')
  ), [selectedMargin, marginKeys]);
  const sanitizedMarginName = useMemo(() => sanitize(effectiveMargin || ''), [effectiveMargin]);
  const marginThresholdValue = useMemo(() => {
    if (!sanitizedMarginName) return NaN;
    return Number(analysisResult?.paramValues?.[`${sanitizedMarginName}_threshold`] ?? NaN);
  }, [analysisResult, sanitizedMarginName]);
  const marginDecidedValue = useMemo(() => {
    if (!sanitizedMarginName) return NaN;
    return Number(analysisResult?.paramValues?.[`${sanitizedMarginName}_decided`] ?? NaN);
  }, [analysisResult, sanitizedMarginName]);
  const marginImpactStats = useMemo(
    () => extremaWithResponsible(result.impact_matrix?.[effectiveMargin] || {}),
    [result, effectiveMargin]
  );
  const marginAbsorptionStats = useMemo(
    () => extremaWithResponsible(result.absorption_matrix?.[effectiveMargin] || {}),
    [result, effectiveMargin]
  );
  const marginUtilisationStats = useMemo(
    () => extremaWithResponsible(result.utilisation_matrix?.[effectiveMargin] || {}),
    [result, effectiveMargin]
  );

  const baselinePoints = useMemo(() => (
    marginKeys.map((m) => ({
      key: `base_${m}`,
      label: m.replace('E_', 'E'),
      x: Number(result?.weighted_impact?.[m] || 0),
      y: Number(result?.weighted_absorption?.[m] || 0),
      r: 5 + Math.min(20, Math.abs(Number(result?.excess?.[m] || 0)) * 70),
    })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  ), [marginKeys, result]);

  const baselineInputs = useMemo(() => {
    const set = new Set();
    Object.keys(result.utilisation_matrix || {}).forEach((m) => {
      Object.keys(result.utilisation_matrix?.[m] || {}).forEach((i) => set.add(i));
    });
    return Array.from(set);
  }, [result]);

  const runRedesignSweep = async () => {
    if (!effectiveMargin) {
      setError('Select a margin to explore.');
      return;
    }
    const marginName = sanitize(effectiveMargin);
    let marginNode = nodes.find((n) => n.label === effectiveMargin);
    if (!marginNode) marginNode = nodes.find((n) => sanitize(n.label || '') === marginName);
    if (!marginNode) {
      setError(`Margin ${effectiveMargin} is not present in the model.`);
      return;
    }

    const marginEdges = edges.filter((e) => e.to === marginNode.id);
    const decidedEdge = marginEdges.find((e) => e.edgeType === 'decided');
    const fallbackEdge = marginEdges.find((e) => {
      const src = nodes.find((node) => node.id === e.from);
      return src?.type === 'decision';
    });
    const activeEdge = decidedEdge || fallbackEdge;
    const decisionNode = nodes.find((n) => n.id === activeEdge?.from && n.type === 'decision');
    if (!decisionNode) {
      setError('Decision node for the selected margin cannot be located.');
      return;
    }

    const thresholdValue = Number(analysisResult?.paramValues?.[`${marginName}_threshold`] ?? NaN);
    const decidedValue = Number(analysisResult?.paramValues?.[`${marginName}_decided`] ?? NaN);
    if (!Number.isFinite(thresholdValue) || !Number.isFinite(decidedValue)) {
      setError('Baseline decision or threshold for the margin is missing.');
      return;
    }

    const marginDiff = decidedValue - thresholdValue;
    if (Math.abs(marginDiff) <= 1e-9) {
      setError('The selected margin already sits at its threshold.');
      return;
    }

    const sign = Math.sign(marginDiff) || 1;
    const maxMargin = Math.abs(marginDiff);

    setLoading(true);
    setRunProgress(0);
    setError('');
    setRun(null);

    try {
      const evaluateDecidedValue = async (decidedVal) => {
        const variedNodes = nodes.map((node) => (
          node.id === decisionNode.id ? { ...node, decidedValue: String(decidedVal) } : node
        ));
        const subRes = await runAnalysis(variedNodes, edges, appliedWeights);
        const excessMap = subRes?.result?.excess || {};
        const violatingMargins = Object.entries(excessMap)
          .filter(([, ex]) => Number.isFinite(Number(ex)) && Number(ex) < -1e-8)
          .map(([name]) => name);
        return { subRes, decidedVal, violatingMargins, excessMap };
      };

      // Shared helper: run the incremental sweep loop.
      // stopAtMargin: how much margin to leave at the end (0 = go to threshold, >0 = stop early).
      const runIncrementalLoop = async ({ stopOnViolation, stopAtMargin = 0 }) => {
        const incFrac = Number(incrementPercent) / 100;
        if (!Number.isFinite(incFrac) || incFrac <= 0) {
          setError('Increment must be a positive percentage.');
          return null;
        }
        const sweepRange = maxMargin - stopAtMargin;
        if (sweepRange <= 1e-12) {
          setError('Target is at or above the current decided value — no reduction to perform.');
          return null;
        }
        let inc = Math.max(1e-6, Math.abs(marginDiff) * incFrac);
        const maxIncrementalSteps = 250;
        if (Math.ceil(sweepRange / inc) > maxIncrementalSteps) {
          inc = sweepRange / maxIncrementalSteps;
        }
        let currentMargin = maxMargin;
        let steps = 0;
        const maxSteps = Math.ceil(sweepRange / inc) + 4;
        let lastFeasible = null;
        let firstViolation = null;
        const history = [];
        while (currentMargin >= stopAtMargin - 1e-12 && steps < maxSteps) {
          const marginValue = Math.max(stopAtMargin, currentMargin);
          const decidedVal = thresholdValue + sign * marginValue;
          const evaluated = await evaluateDecidedValue(decidedVal);
          history.push({
            step: steps + 1,
            decidedValue: decidedVal,
            remainingMargin: marginValue,
            removedShare: maxMargin > 1e-12 ? (1 - (marginValue / maxMargin)) : 0,
            violatingMargins: [...(evaluated.violatingMargins || [])],
            excessMap: { ...evaluated.excessMap },
          });
          setRunProgress(Math.round(((steps + 1) / Math.max(1, maxSteps)) * 100));
          if (evaluated.violatingMargins.length) {
            firstViolation = evaluated;
            if (stopOnViolation) break;
          }
          if (!evaluated.violatingMargins.length) lastFeasible = evaluated;
          if (marginValue <= stopAtMargin + 1e-12) break;
          currentMargin -= inc;
          steps += 1;
        }
        return { inc, history, lastFeasible, firstViolation };
      };

      let localInc = null;
      let requestedDecided = thresholdValue;
      let appliedDecided = NaN;
      let removableShare = NaN;
      let limitingMargins = [];
      let recalculatedResult = null;
      let stepHistory = [];

      if (scenario === 'remove_once') {
        // Completely remove the margin: evaluate at the threshold directly.
        // Other margins may go negative — this is intentional and shown in the chart.
        setRunProgress(50);
        const finalEval = await evaluateDecidedValue(thresholdValue);
        setRunProgress(100);
        requestedDecided = thresholdValue;
        appliedDecided = thresholdValue;
        removableShare = 1.0;
        limitingMargins = finalEval.violatingMargins;
        recalculatedResult = finalEval.subRes?.result || null;
      } else if (scenario === 'reduce_to_limit') {
        // Incremental sweep that stops as soon as another margin hits 0.
        const sweep = await runIncrementalLoop({ stopOnViolation: true });
        if (!sweep) return;
        localInc = sweep.inc;
        stepHistory = sweep.history;
        const lastFeasible = sweep.lastFeasible;
        const firstViolation = sweep.firstViolation;
        requestedDecided = thresholdValue;
        appliedDecided = lastFeasible?.decidedVal ?? decidedValue;
        const totalRemovable = Math.abs(decidedValue - thresholdValue);
        const actualRemovable = Math.abs(decidedValue - appliedDecided);
        removableShare = totalRemovable > 1e-12 ? (actualRemovable / totalRemovable) : 0;
        limitingMargins = firstViolation?.violatingMargins || [];
        recalculatedResult = lastFeasible?.subRes?.result || null;
      } else if (scenario === 'reduce_to_value') {
        // Incremental sweep to a user-defined target decided value.
        let targetDecided;
        if (reduceByMode === 'max_utilisation') {
          const maxUtil = marginUtilisationStats.max.value;
          if (!Number.isFinite(maxUtil)) {
            setError('Max utilisation data not available for this margin.');
            return;
          }
          if (maxUtil >= 1 - 1e-9) {
            setError('Max utilisation ≥ 100% — no reduction is possible without violating another margin.');
            return;
          }
          targetDecided = thresholdValue + maxUtil * (decidedValue - thresholdValue);
        } else {
          const pctVal = Number(reduceByPercent) / 100;
          if (!Number.isFinite(pctVal) || pctVal <= 0 || pctVal > 100) {
            setError('Enter a valid percentage between 0 and 100.');
            return;
          }
          targetDecided = decidedValue - pctVal * (decidedValue - thresholdValue);
        }
        // stopAtMargin = the remaining margin at the target point
        const targetMargin = Math.abs(targetDecided - thresholdValue);
        const sweep = await runIncrementalLoop({ stopOnViolation: false, stopAtMargin: targetMargin });
        if (!sweep) return;
        localInc = sweep.inc;
        stepHistory = sweep.history;
        requestedDecided = targetDecided;
        const lastStep = sweep.history[sweep.history.length - 1];
        appliedDecided = lastStep?.decidedValue ?? targetDecided;
        const totalRange = Math.abs(decidedValue - thresholdValue);
        removableShare = totalRange > 1e-12 ? Math.abs(decidedValue - appliedDecided) / totalRange : 0;
        limitingMargins = sweep.firstViolation?.violatingMargins || [];
        recalculatedResult = (sweep.lastFeasible ?? sweep.firstViolation)?.subRes?.result || null;
      } else {
        // Full incremental sweep to threshold (no early stop).
        const sweep = await runIncrementalLoop({ stopOnViolation: false });
        if (!sweep) return;
        localInc = sweep.inc;
        stepHistory = sweep.history;
        requestedDecided = thresholdValue;
        const lastStep = sweep.history[sweep.history.length - 1];
        appliedDecided = lastStep?.decidedValue ?? thresholdValue;
        recalculatedResult = (sweep.lastFeasible ?? sweep.firstViolation)?.subRes?.result || null;
      }

      const redesignedPoints = marginKeys.map((m) => ({
        key: `new_${m}`,
        label: m.replace('E_', 'E'),
        x: Number(recalculatedResult?.weighted_impact?.[m] || 0),
        y: Number(recalculatedResult?.weighted_absorption?.[m] || 0),
        r: 5 + Math.min(20, Math.abs(Number(recalculatedResult?.excess?.[m] || 0)) * 70),
        excess: Number(recalculatedResult?.excess?.[m] ?? NaN),
      })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

      setRun({
        scenario,
        marginLabel: effectiveMargin,
        thresholdValue,
        decidedValue,
        incrementUsed: localInc,
        requestedDecided,
        appliedDecided,
        removableShare,
        limitingMargins,
        recalculated: recalculatedResult,
        redesignedPoints,
        stepHistory,
      });
      setRunProgress(100);
    } catch (err) {
      setError(err.message || 'Redesign analysis failed.');
    } finally {
      setLoading(false);
      setRunProgress(null);
    }
  };

  const recalculatedResult = run?.recalculated || null;
  const sharedBubbleDomain = useMemo(() => {
    const redesignedPoints = run?.redesignedPoints || [];
    const all = [...baselinePoints, ...redesignedPoints];
    if (!all.length) return null;
    const xs = all.map((p) => Number(p.x)).filter(Number.isFinite);
    const ys = all.map((p) => Number(p.y)).filter(Number.isFinite);
    if (!xs.length || !ys.length) return null;
    const minXRaw = Math.min(...xs);
    const maxXRaw = Math.max(...xs);
    const minYRaw = Math.min(...ys);
    const maxYRaw = Math.max(...ys);
    const xPad = Math.max(0.002, (maxXRaw - minXRaw) * 0.1);
    const yPad = Math.max(0.002, (maxYRaw - minYRaw) * 0.1);
    return {
      x: { min: minXRaw - xPad, max: maxXRaw + xPad },
      y: { min: minYRaw - yPad, max: maxYRaw + yPad },
    };
  }, [baselinePoints, run]);

  const recalculatedInputs = useMemo(() => {
    const set = new Set();
    Object.keys(recalculatedResult?.utilisation_matrix || {}).forEach((m) => {
      Object.keys(recalculatedResult?.utilisation_matrix?.[m] || {}).forEach((i) => set.add(i));
    });
    return Array.from(set);
  }, [recalculatedResult]);

  if (analysisError) {
    return (
      <div style={{ ...containerStyle, background: '#F9FAFB', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 10px' }}>
          {analysisError}
        </div>
      </div>
    );
  }
  if (!analysisResult) {
    return (
      <div style={{ ...containerStyle, background: '#F9FAFB', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 12, fontStyle: 'italic' }}>
        Run MVM analysis first to open Redesign Analysis.
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ width: 300, minWidth: 300, background: '#F1F5F9', borderRight: '1px solid #E2E8F0', padding: '16px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #E2E8F0' }}>
          Redesign Settings
        </div>

        <label style={{ display: 'block', marginTop: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>Margin</span>
          <select
            value={effectiveMargin}
            onChange={(e) => setSelectedMargin(e.target.value)}
            style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: '#0F172A', background: '#FFFFFF' }}
          >
            {marginKeys.map((m) => (
              <option key={m} value={m}>{m.replace('E_', 'E')}</option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', padding: 8 }}>
          <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6 }}>Selected Margin Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 4, columnGap: 8, fontSize: 11 }}>
            <div style={{ color: '#64748B' }}>Threshold</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>{num(marginThresholdValue, 4)}</div>
            <div style={{ color: '#64748B' }}>Decided value</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>{num(marginDecidedValue, 4)}</div>
            <div style={{ color: '#64748B' }}>Local excess</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>{pct(result.excess?.[effectiveMargin], 2)}</div>
            <div style={{ color: '#64748B' }}>Max absorption</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>
              {Number.isFinite(marginAbsorptionStats.max.value)
                ? `${pct(marginAbsorptionStats.max.value, 2)} (${marginAbsorptionStats.max.responsible.join(', ') || 'n/a'})`
                : 'n/a'}
            </div>
            <div style={{ color: '#64748B' }}>Min absorption</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>
              {Number.isFinite(marginAbsorptionStats.min.value)
                ? `${pct(marginAbsorptionStats.min.value, 2)} (${marginAbsorptionStats.min.responsible.join(', ') || 'n/a'})`
                : 'n/a'}
            </div>
            <div style={{ color: '#64748B' }}>Max impact</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>
              {Number.isFinite(marginImpactStats.max.value)
                ? `${pct(marginImpactStats.max.value, 2)} (${marginImpactStats.max.responsible.join(', ') || 'n/a'})`
                : 'n/a'}
            </div>
            <div style={{ color: '#64748B' }}>Min impact</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>
              {Number.isFinite(marginImpactStats.min.value)
                ? `${pct(marginImpactStats.min.value, 2)} (${marginImpactStats.min.responsible.join(', ') || 'n/a'})`
                : 'n/a'}
            </div>
            <div style={{ color: '#64748B' }}>Max utilisation</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>
              {Number.isFinite(marginUtilisationStats.max.value)
                ? `${pct(marginUtilisationStats.max.value, 2)} (${marginUtilisationStats.max.responsible.join(', ') || 'n/a'})`
                : 'n/a'}
            </div>
            <div style={{ color: '#64748B' }}>Min utilisation</div>
            <div style={{ color: '#0F172A', fontWeight: 700 }}>
              {Number.isFinite(marginUtilisationStats.min.value)
                ? `${pct(marginUtilisationStats.min.value, 2)} (${marginUtilisationStats.min.responsible.join(', ') || 'n/a'})`
                : 'n/a'}
            </div>
          </div>
        </div>

        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>Scenario</span>
          <div style={{ border: '1px solid #CBD5E1', borderRadius: 6, background: '#FFFFFF', padding: '6px 8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0F172A', marginBottom: 6, cursor: 'pointer' }}>
              <input type="radio" name="redesign-scenario" checked={scenario === 'remove_once'} onChange={() => setScenario('remove_once')} />
              <span>Remove selected margin completely</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0F172A', marginBottom: 6, cursor: 'pointer' }}>
              <input type="radio" name="redesign-scenario" checked={scenario === 'reduce_to_limit'} onChange={() => setScenario('reduce_to_limit')} />
              <span>Reduce until another margin hits 0</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0F172A', marginBottom: 6, cursor: 'pointer' }}>
              <input type="radio" name="redesign-scenario" checked={scenario === 'incremental'} onChange={() => setScenario('incremental')} />
              <span>Reduce selected margin incrementally</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0F172A', cursor: 'pointer' }}>
              <input type="radio" name="redesign-scenario" checked={scenario === 'reduce_to_value'} onChange={() => setScenario('reduce_to_value')} />
              <span>Reduce to specific point</span>
            </label>
            {scenario === 'reduce_to_value' && (
              <div style={{ marginTop: 8, marginLeft: 20, paddingLeft: 8, borderLeft: '2px solid #BFDBFE' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0F172A', marginBottom: 6, cursor: 'pointer' }}>
                  <input type="radio" name="reduce-by-mode" checked={reduceByMode === 'percent'} onChange={() => setReduceByMode('percent')} />
                  <span>By % of excess</span>
                </label>
                {reduceByMode === 'percent' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 20 }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={reduceByPercent}
                      onChange={(e) => setReduceByPercent(e.target.value)}
                      style={{ width: 70, border: '1px solid #CBD5E1', borderRadius: 6, padding: '4px 6px', fontSize: 12, color: '#0F172A', background: '#FFFFFF' }}
                    />
                    <span style={{ fontSize: 12, color: '#64748B' }}>% of excess removed</span>
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0F172A', cursor: 'pointer' }}>
                  <input type="radio" name="reduce-by-mode" checked={reduceByMode === 'max_utilisation'} onChange={() => setReduceByMode('max_utilisation')} />
                  <span>To max utilisation point</span>
                </label>
                {reduceByMode === 'max_utilisation' && (
                  <div style={{ marginLeft: 20, marginTop: 4, fontSize: 11, color: '#64748B' }}>
                    {Number.isFinite(marginUtilisationStats.max.value) && Number.isFinite(marginDecidedValue) && Number.isFinite(marginThresholdValue)
                      ? (() => {
                          const maxUtil = marginUtilisationStats.max.value;
                          const threshNew = marginThresholdValue + maxUtil * (marginDecidedValue - marginThresholdValue);
                          return `Max util = ${pct(maxUtil, 2)} (${marginUtilisationStats.max.responsible.join(', ') || 'n/a'}) → threshold_new = ${num(threshNew, 4)} → target decided = ${num(threshNew, 4)}`;
                        })()
                      : 'Max utilisation not available — run analysis first.'}
                  </div>
                )}
              </div>
            )}
          </div>
        </label>

        {(scenario === 'incremental' || scenario === 'reduce_to_limit' || scenario === 'reduce_to_value') && (
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>Increment in selected E</span>
            <input
              type="number"
              step="0.1"
              min="0.01"
              value={incrementPercent}
              onChange={(e) => setIncrementPercent(e.target.value)}
              style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: '#0F172A', background: '#FFFFFF', boxSizing: 'border-box' }}
            />
          </label>
        )}

        <button
          type="button"
          onClick={runRedesignSweep}
          disabled={loading || !effectiveMargin}
          style={{ width: '100%', marginTop: 12, padding: '8px 10px', border: '1px solid #93C5FD', borderRadius: 8, background: loading ? '#DBEAFE' : '#EFF6FF', color: '#1E3A8A', fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', position: 'relative', overflow: 'hidden' }}
        >
          {loading && (
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.max(0, Math.min(100, Number(runProgress) || 0))}%`,
                background: 'rgba(37, 99, 235, 0.22)',
                transition: 'width 120ms linear',
              }}
            />
          )}
          <span style={{ position: 'relative' }}>
            {loading
              ? `Running redesign... ${Math.max(0, Math.min(100, Number(runProgress) || 0))}%`
              : 'Run Redesign Analysis'}
          </span>
        </button>

        <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 6, background: '#FFFFFF', padding: '8px 9px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>
            Chart Settings
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>Chart height</span>
              <input
                type="number"
                min={chartHeightMin}
                max={chartHeightMax}
                step="10"
                value={chartHeight}
                onChange={(e) => handleChartHeightInput(e.target.value)}
                style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: '#0F172A', background: '#FFFFFF', boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>Chart width</span>
              <input
                type="number"
                min={chartWidthMin}
                max={chartWidthMax}
                step="10"
                value={chartWidth}
                onChange={(e) => handleChartWidthInput(e.target.value)}
                style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: '#0F172A', background: '#FFFFFF', boxSizing: 'border-box' }}
              />
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>Font size</span>
            <input
              type="number"
              min={fontSizeMin}
              max={fontSizeMax}
              step="1"
              value={fontSize}
              onChange={(e) => handleFontSizeInput(e.target.value)}
              style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: '#0F172A', background: '#FFFFFF', boxSizing: 'border-box' }}
            />
          </label>
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#334155', cursor: 'pointer', marginBottom: 5 }}>
              <input
                type="checkbox"
                checked={lockXAxisScale}
                onChange={(e) => setLockXAxisScale(e.target.checked)}
              />
              <span>Use same horizontal axis (X)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={lockYAxisScale}
                onChange={(e) => setLockYAxisScale(e.target.checked)}
              />
              <span>Use same vertical axis (Y)</span>
            </label>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, background: '#F9FAFB', overflowY: 'auto', padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Redesign Analysis</div>

        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '7px 9px' }}>{error}</div>
        )}

        <div style={{ fontSize: 11, color: '#64748B', marginTop: 6, marginBottom: 6 }}>
          {run ? 'Original (left) and redesigned overlay (right), each with aligned matrices' : 'Original MVM Analysis Plot'}
        </div>

        {run && (
          <>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 16 }}>
              {run.scenario === 'remove_once' ? (
                <>
                  Complete removal of {(run.marginLabel || '').replace('E_', 'E')}: decided value set to threshold ({num(run.appliedDecided, 4)}).
                  {run.limitingMargins?.length
                    ? ` Note: ${run.limitingMargins.map((m) => m.replace('E_', 'E')).join(', ')} went negative.`
                    : ' No other margins were violated.'}
                </>
              ) : run.scenario === 'reduce_to_limit' ? (
                <>
                  Reduced {(run.marginLabel || '').replace('E_', 'E')} until another margin reached 0:
                  decided value {num(run.appliedDecided, 4)} ({Number.isFinite(run.removableShare) ? pct(run.removableShare, 2) : 'n/a'} of margin removed).
                  {run.limitingMargins?.length
                    ? ` Limiting margin(s): ${run.limitingMargins.map((m) => m.replace('E_', 'E')).join(', ')}.`
                    : ' Margin was fully removable without violating others.'}
                </>
              ) : run.scenario === 'reduce_to_value' ? (
                <>
                  Reduced {(run.marginLabel || '').replace('E_', 'E')} to specific point:
                  decided value {num(run.appliedDecided, 4)} ({Number.isFinite(run.removableShare) ? pct(run.removableShare, 2) : 'n/a'} of margin removed).
                  {run.limitingMargins?.length
                    ? ` Note: ${run.limitingMargins.map((m) => m.replace('E_', 'E')).join(', ')} went negative.`
                    : ' No other margins were violated.'}
                </>
              ) : (
                <>
                  Incremental redesign completed for {(run.marginLabel || '').replace('E_', 'E')}.
                  Final decided value: {num(run.appliedDecided, 4)}
                </>
              )}
            </div>
            {(run.scenario === 'incremental' || run.scenario === 'reduce_to_limit' || run.scenario === 'reduce_to_value') && Array.isArray(run.stepHistory) && run.stepHistory.length > 0 && (() => {
              // Collect all margin keys present in the step history excess maps.
              const stepMarginKeys = Array.from(
                new Set(run.stepHistory.flatMap((s) => Object.keys(s.excessMap || {})))
              );
              return (
                <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, background: '#FFFFFF', overflow: 'hidden' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
                    {run.scenario === 'reduce_to_limit' ? 'Steps — Reduce to Limit' : run.scenario === 'reduce_to_value' ? 'Steps — Reduce to Specific Point' : 'Incremental Steps'}
                  </div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 10, whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B', position: 'sticky', left: 0, background: '#FFFFFF' }}>Step</th>
                          <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Decided value</th>
                          <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Removed (%)</th>
                          {stepMarginKeys.map((mk) => (
                            <th key={`th_${mk}`} style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>
                              {mk.replace('E_', 'E')} excess
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {run.stepHistory.map((s) => {
                          const isLimitStep = run.scenario === 'reduce_to_limit' && s.violatingMargins?.length > 0;
                          return (
                            <tr key={`step_${s.step}`} style={{ borderBottom: '1px solid #F1F5F9', background: isLimitStep ? '#FEF2F2' : (s.violatingMargins?.length ? '#FFF7ED' : undefined) }}>
                              <td style={{ textAlign: 'right', padding: '5px 8px', color: isLimitStep ? '#B91C1C' : '#334155', fontWeight: 600, position: 'sticky', left: 0, background: isLimitStep ? '#FEF2F2' : '#FFFFFF' }}>
                                {s.step}{isLimitStep ? ' ✕' : ''}
                              </td>
                              <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155' }}>{num(s.decidedValue, 4)}</td>
                              <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155' }}>{pct(s.removedShare, 2)}</td>
                              {stepMarginKeys.map((mk) => {
                                const ex = Number(s.excessMap?.[mk] ?? NaN);
                                const isNeg = Number.isFinite(ex) && ex <= 1e-8;
                                return (
                                  <td key={`cell_${s.step}_${mk}`} style={{ textAlign: 'right', padding: '5px 8px', color: isNeg ? '#B91C1C' : '#334155', fontWeight: isNeg ? 700 : undefined, background: isNeg ? '#FEF2F2' : undefined }}>
                                    {Number.isFinite(ex) ? pct(ex, 2) : '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Charts row — always on top */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: `0 1 ${chartWidth}px`, width: chartWidth, maxWidth: '100%', minWidth: 0 }}>
            <BubbleMVMPlot
              baselinePoints={baselinePoints}
              overlayPoints={[]}
              width={chartWidth}
              height={chartHeight}
              axisFontSize={fontSize}
              xDomain={run && lockXAxisScale ? (sharedBubbleDomain?.x || null) : null}
              yDomain={run && lockYAxisScale ? (sharedBubbleDomain?.y || null) : null}
              plotData={result}
              exportName="redesign_baseline_plot"
              onAddToReport={onAddChartToReport}
              tables={buildMatrixTableData('Baseline', marginKeys, result.impact_matrix, result.absorption_matrix, result.utilisation_matrix, baselineInputs)}
            />
          </div>
          {run && (
            <div style={{ flex: `0 1 ${chartWidth}px`, width: chartWidth, maxWidth: '100%', minWidth: 0 }}>
              <BubbleMVMPlot
                baselinePoints={baselinePoints}
                overlayPoints={run.redesignedPoints || []}
                width={chartWidth}
                height={chartHeight}
                axisFontSize={fontSize}
                xDomain={lockXAxisScale ? (sharedBubbleDomain?.x || null) : null}
                yDomain={lockYAxisScale ? (sharedBubbleDomain?.y || null) : null}
                plotData={result}
                exportName="redesign_recalculated_plot"
                onAddToReport={onAddChartToReport}
                tables={buildMatrixTableData('Recalculated', marginKeys, recalculatedResult?.impact_matrix, recalculatedResult?.absorption_matrix, recalculatedResult?.utilisation_matrix, recalculatedInputs)}
              />
            </div>
          )}
        </div>

        {/* Tables row — below charts */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: `0 1 ${chartWidth}px`, width: chartWidth, maxWidth: '100%', minWidth: 0 }}>
            <MatrixTable
              title="Impact Matrix (Baseline)"
              rowKeys={marginKeys}
              colKeys={Object.keys(result.impact_matrix?.[marginKeys[0]] || {})}
              data={result.impact_matrix || {}}
              rowLabel="Margin"
            />
            <MatrixTable
              title="Absorption Matrix (Baseline)"
              rowKeys={marginKeys}
              colKeys={Object.keys(result.absorption_matrix?.[marginKeys[0]] || {})}
              data={result.absorption_matrix || {}}
              rowLabel="Margin"
            />
            <MatrixTable
              title="Utilisation Matrix (Baseline)"
              rowKeys={marginKeys}
              colKeys={baselineInputs}
              data={result.utilisation_matrix || {}}
              rowLabel="Margin"
            />
          </div>
          {run && (
            <div style={{ flex: `0 1 ${chartWidth}px`, width: chartWidth, maxWidth: '100%', minWidth: 0 }}>
              <MatrixTable
                title="Impact Matrix (Recalculated)"
                rowKeys={marginKeys}
                colKeys={Object.keys(recalculatedResult?.impact_matrix?.[marginKeys[0]] || {})}
                data={recalculatedResult?.impact_matrix || {}}
                rowLabel="Margin"
              />
              <MatrixTable
                title="Absorption Matrix (Recalculated)"
                rowKeys={marginKeys}
                colKeys={Object.keys(recalculatedResult?.absorption_matrix?.[marginKeys[0]] || {})}
                data={recalculatedResult?.absorption_matrix || {}}
                rowLabel="Margin"
              />
              <MatrixTable
                title="Utilisation Matrix (Recalculated)"
                rowKeys={marginKeys}
                colKeys={recalculatedInputs}
                data={recalculatedResult?.utilisation_matrix || {}}
                rowLabel="Margin"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RedesignAnalysisModule;
