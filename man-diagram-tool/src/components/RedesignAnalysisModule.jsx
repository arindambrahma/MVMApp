import React, { useMemo, useRef, useState } from 'react';
import { runAnalysis } from '../utils/api';
import { sanitize } from '../utils/helpers';

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
  exportName = 'redesign_plot',
  onAddToReport = null,
  tables = [],
}) {
  const svgRef = useRef(null);
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
  const autoMinX = Math.max(0, minXRaw - xPad);
  const autoMaxX = maxXRaw + xPad;
  const autoMinY = Math.max(0, minYRaw - yPad);
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

        {overlayPoints.map((p) => (
          <g key={`overlay_${p.key}`}>
            <circle
              cx={xScale(p.x)}
              cy={yScale(p.y)}
              r={Math.max(3, Math.min(26, Number(p.r || 6)))}
              fill="#F59E0B"
              fillOpacity="0.32"
              stroke="#B45309"
              strokeWidth="1.4"
            />
            <text x={xScale(p.x)} y={yScale(p.y) - 8} textAnchor="middle" fontSize={pointFontSize} fill="#9A3412" fontWeight="700">{p.label}</text>
          </g>
        ))}

        <text x={left + w / 2} y={height - 8} textAnchor="middle" fontSize={axisLabelFontSize} fill="#475569">
          Undesirable impact on performance parameters (Impactm in %)
        </text>
        <text x={18} y={top + h / 2} transform={`rotate(-90 18 ${top + h / 2})`} textAnchor="middle" fontSize={axisLabelFontSize} fill="#475569">
          Change absorption potential (Absorptionm in %)
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 10, color: '#334155' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: '#9CA3AF', opacity: 0.6, border: '1px solid #6B7280' }} />
          Baseline points
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: '#F59E0B', opacity: 0.6, border: '1px solid #B45309' }} />
          Redesigned points
        </div>
      </div>
      {onAddToReport && (
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
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
        </div>
      )}
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
  const [scenario, setScenario] = useState('incremental');
  const [incrementPercent, setIncrementPercent] = useState('2');
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
        return { subRes, decidedVal, violatingMargins };
      };

      let localInc = null;
      let requestedDecided = thresholdValue;
      let appliedDecided = NaN;
      let removableShare = NaN;
      let limitingMargins = [];
      let recalculatedResult = null;
      let stepHistory = [];

      if (scenario === 'remove_once') {
        const scanSteps = 40;
        let bestFeasible = await evaluateDecidedValue(decidedValue);
        setRunProgress(Math.round((1 / (scanSteps + 1)) * 100));
        let firstViolation = null;
        for (let i = 1; i <= scanSteps; i += 1) {
          const frac = i / scanSteps;
          const candidateDecided = decidedValue + (thresholdValue - decidedValue) * frac;
          const candidate = await evaluateDecidedValue(candidateDecided);
          setRunProgress(Math.round(((i + 1) / (scanSteps + 1)) * 100));
          if (candidate.violatingMargins.length) {
            firstViolation = candidate;
            break;
          }
          bestFeasible = candidate;
        }
        requestedDecided = thresholdValue;
        appliedDecided = bestFeasible.decidedVal;
        const totalRemovable = Math.abs(decidedValue - thresholdValue);
        const actualRemovable = Math.abs(decidedValue - appliedDecided);
        removableShare = totalRemovable > 1e-12 ? (actualRemovable / totalRemovable) : 0;
        limitingMargins = firstViolation?.violatingMargins || [];
        recalculatedResult = bestFeasible.subRes?.result || null;
      } else {
        const incFrac = Number(incrementPercent) / 100;
        if (!Number.isFinite(incFrac) || incFrac <= 0) {
          setError('Increment must be a positive percentage.');
          return;
        }
        localInc = Math.max(1e-6, Math.abs(marginDiff) * incFrac);
        const maxIncrementalSteps = 250;
        const estimatedSteps = Math.ceil(maxMargin / localInc);
        // Prevent very small user increments from creating thousands of backend runs.
        if (Number.isFinite(estimatedSteps) && estimatedSteps > maxIncrementalSteps) {
          localInc = Math.max(localInc, maxMargin / maxIncrementalSteps);
        }
        let currentMargin = maxMargin;
        let steps = 0;
        const maxSteps = Math.ceil(maxMargin / localInc) + 4;
        let lastEvaluated = null;
        while (currentMargin >= -1e-12 && steps < maxSteps) {
          const marginValue = Math.max(0, currentMargin);
          const decidedVal = thresholdValue + sign * marginValue;
          lastEvaluated = await evaluateDecidedValue(decidedVal);
          stepHistory.push({
            step: steps + 1,
            decidedValue: decidedVal,
            remainingMargin: marginValue,
            removedShare: maxMargin > 1e-12 ? (1 - (marginValue / maxMargin)) : 0,
            violatingMargins: [...(lastEvaluated?.violatingMargins || [])],
          });
          setRunProgress(Math.round(((steps + 1) / Math.max(1, maxSteps)) * 100));
          if (marginValue <= 1e-12) break;
          currentMargin -= localInc;
          steps += 1;
        }
        requestedDecided = thresholdValue;
        appliedDecided = lastEvaluated?.decidedVal;
        recalculatedResult = lastEvaluated?.subRes?.result || null;
      }

      const redesignedPoints = marginKeys.map((m) => ({
        key: `new_${m}`,
        label: m.replace('E_', 'E'),
        x: Number(recalculatedResult?.weighted_impact?.[m] || 0),
        y: Number(recalculatedResult?.weighted_absorption?.[m] || 0),
        r: 5 + Math.min(20, Math.abs(Number(recalculatedResult?.excess?.[m] || 0)) * 70),
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
      x: { min: Math.max(0, minXRaw - xPad), max: maxXRaw + xPad },
      y: { min: Math.max(0, minYRaw - yPad), max: maxYRaw + yPad },
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
              <span>Remove selected margin at once</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0F172A', cursor: 'pointer' }}>
              <input type="radio" name="redesign-scenario" checked={scenario === 'incremental'} onChange={() => setScenario('incremental')} />
              <span>Reduce selected margin incrementally</span>
            </label>
          </div>
        </label>

        {scenario === 'incremental' && (
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
                  One-shot redesign for {(run.marginLabel || '').replace('E_', 'E')}: requested {num(run.requestedDecided, 4)},
                  applied {num(run.appliedDecided, 4)}. Removable share {Number.isFinite(run.removableShare) ? pct(run.removableShare, 2) : 'n/a'}
                  {run.limitingMargins?.length ? ` (blocked by: ${run.limitingMargins.map((m) => m.replace('E_', 'E')).join(', ')})` : ''}
                </>
              ) : (
                <>
                  Incremental redesign completed for {(run.marginLabel || '').replace('E_', 'E')}.
                  Final decided value: {num(run.appliedDecided, 4)}
                </>
              )}
            </div>
            {run.scenario === 'incremental' && Array.isArray(run.stepHistory) && run.stepHistory.length > 0 && (
              <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, background: '#FFFFFF', overflow: 'hidden' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
                  Incremental Steps
                </div>
                <div style={{ maxHeight: 190, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Step</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Decided value</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Remaining margin</th>
                        <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Removed (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.stepHistory.map((s) => (
                        <tr key={`step_${s.step}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155', fontWeight: 600 }}>{s.step}</td>
                          <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155' }}>{num(s.decidedValue, 4)}</td>
                          <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155' }}>{num(s.remainingMargin, 4)}</td>
                          <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155' }}>{pct(s.removedShare, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {!run ? (
          <div style={{ width: chartWidth, maxWidth: '100%' }}>
            <BubbleMVMPlot
              baselinePoints={baselinePoints}
              overlayPoints={[]}
              width={chartWidth}
              height={chartHeight}
              axisFontSize={fontSize}
              xDomain={null}
              yDomain={null}
              exportName="redesign_baseline_plot"
              onAddToReport={onAddChartToReport}
              tables={buildMatrixTableData('Baseline', marginKeys, result.impact_matrix, result.absorption_matrix, result.utilisation_matrix, baselineInputs)}
            />
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
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: `0 1 ${chartWidth}px`, width: chartWidth, maxWidth: '100%', minWidth: 0 }}>
              <BubbleMVMPlot
                baselinePoints={baselinePoints}
                overlayPoints={[]}
                width={chartWidth}
                height={chartHeight}
                axisFontSize={fontSize}
                xDomain={lockXAxisScale ? (sharedBubbleDomain?.x || null) : null}
                yDomain={lockYAxisScale ? (sharedBubbleDomain?.y || null) : null}
                exportName="redesign_baseline_plot"
                onAddToReport={onAddChartToReport}
                tables={buildMatrixTableData('Baseline', marginKeys, result.impact_matrix, result.absorption_matrix, result.utilisation_matrix, baselineInputs)}
              />
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
            <div style={{ flex: `0 1 ${chartWidth}px`, width: chartWidth, maxWidth: '100%', minWidth: 0 }}>
              <BubbleMVMPlot
                baselinePoints={baselinePoints}
                overlayPoints={run.redesignedPoints || []}
                width={chartWidth}
                height={chartHeight}
                axisFontSize={fontSize}
                xDomain={lockXAxisScale ? (sharedBubbleDomain?.x || null) : null}
                yDomain={lockYAxisScale ? (sharedBubbleDomain?.y || null) : null}
                exportName="redesign_recalculated_plot"
                onAddToReport={onAddChartToReport}
                tables={buildMatrixTableData('Recalculated', marginKeys, recalculatedResult?.impact_matrix, recalculatedResult?.absorption_matrix, recalculatedResult?.utilisation_matrix, recalculatedInputs)}
              />
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
          </div>
        )}
      </div>
    </div>
  );
}

export default RedesignAnalysisModule;
