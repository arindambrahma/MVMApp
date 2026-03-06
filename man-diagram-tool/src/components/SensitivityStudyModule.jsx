import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const maxResponsible = entries.filter(([, v]) => Math.abs(v - maxVal) <= tol).map(([k]) => k);
  const minResponsible = entries.filter(([, v]) => Math.abs(v - minVal) <= tol).map(([k]) => k);
  return {
    max: { value: maxVal, responsible: maxResponsible },
    min: { value: minVal, responsible: minResponsible },
  };
}

function relChange(value, baseline) {
  const v = Number(value);
  const b = Number(baseline);
  if (!Number.isFinite(v) || !Number.isFinite(b)) return 0;
  if (Math.abs(b) <= 1e-9) return v - b;
  return (v - b) / Math.abs(b);
}

function pmaxAbs(limitFrac, baseValue) {
  const frac = Number(limitFrac);
  const base = Number(baseValue);
  if (!Number.isFinite(frac) || !Number.isFinite(base)) return null;
  return base * (1 + frac);
}

function tableCell(value) {
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

function SectionTable({ title, subtitle, rows, labelCol, valueLabel = 'Sensitivity' }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 2, marginBottom: 6 }}>
        {subtitle}
      </div>
      {!rows.length ? (
        <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>No data available.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', color: '#64748B' }}>{labelCol}</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', color: '#64748B' }}>{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, value]) => (
              <tr key={name} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '4px 6px', fontWeight: 600, color: '#334155' }}>{name}</td>
                <td style={tableCell(value)}>{pct(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MarginLineChart({
  series,
  xLabel,
  yLabel,
  height = 340,
  width = 860,
  extraLines = [],
  axisFontSize = 10,
  xDomain = null,
  yDomain = null,
  exportName = 'sensitivity_chart',
  onAddToReport = null,
  tables = [],
}) {
  const svgRef = useRef(null);

  if (!series?.length) {
    return (
      <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginTop: 6 }}>
        Run sub-analysis to generate the plot.
      </div>
    );
  }

  const colors = ['#2563EB', '#DC2626', '#0891B2', '#D97706', '#059669', '#7C3AED', '#DB2777'];
  const allPoints = series.flatMap(s => s.points || []);
  const xs = allPoints.map(p => p.x);
  const ys = allPoints.map(p => p.y);
  const minXRaw = Math.min(...xs);
  const maxXRaw = Math.max(...xs);
  const minYRaw = Math.min(...ys);
  const maxYRaw = Math.max(...ys);
  const minX = Number.isFinite(xDomain?.min) ? xDomain.min : minXRaw;
  const maxX = Number.isFinite(xDomain?.max) ? xDomain.max : maxXRaw;
  const yPad = Math.max(0.02, (maxYRaw - minYRaw) * 0.08);
  const autoMinY = Math.min(minYRaw - yPad, 0);
  const autoMaxY = Math.max(maxYRaw + yPad, 0);
  const minY = Number.isFinite(yDomain?.min) ? yDomain.min : autoMinY;
  const maxY = Number.isFinite(yDomain?.max) ? yDomain.max : autoMaxY;

  const viewWidth = width;
  const left = 58;
  const right = 20;
  const top = 16;
  const bottom = 40;
  const w = viewWidth - left - right;
  const h = height - top - bottom;
  const xScale = (x) => {
    if (maxX === minX) return left + w / 2;
    return left + ((x - minX) / (maxX - minX)) * w;
  };
  const yScale = (y) => {
    if (maxY === minY) return top + h / 2;
    return top + ((maxY - y) / (maxY - minY)) * h;
  };

  const yTicks = 5;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (i / yTicks) * (maxY - minY));
  const xTicks = 6;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + (i / xTicks) * (maxX - minX));
  const xAxisY = yScale(0);
  const tickFontSize = axisFontSize;
  const axisLabelFontSize = Math.max(axisFontSize + 1, 11);

  return (
    <div style={{ marginTop: 8, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 8, width: `${viewWidth}px`, maxWidth: '100%', boxSizing: 'border-box' }}>
      <svg ref={svgRef} width={viewWidth} height={height} viewBox={`0 0 ${viewWidth} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {tickVals.map((tv, i) => {
          const yy = yScale(tv);
          return (
            <g key={`grid_${i}`}>
              <line x1={left} y1={yy} x2={left + w} y2={yy} stroke="#E2E8F0" strokeWidth="1" />
              <text x={left - 6} y={yy + 3} textAnchor="end" fontSize={tickFontSize} fill="#64748B">
                {pct(tv, 1)}
              </text>
            </g>
          );
        })}
        {xTickVals.map((tv, i) => {
          const xx = xScale(tv);
          const labelY = Math.min(top + h + 13, xAxisY + 13);
          return (
            <g key={`xgrid_${i}`}>
              <line x1={xx} y1={top} x2={xx} y2={top + h} stroke="#F1F5F9" strokeWidth="1" />
              <line x1={xx} y1={xAxisY - 3} x2={xx} y2={xAxisY + 3} stroke="#475569" strokeWidth="1" />
              <text x={xx} y={labelY} textAnchor="middle" fontSize={tickFontSize} fill="#64748B">
                {num(tv, 3)}
              </text>
            </g>
          );
        })}

        <line x1={left} y1={top} x2={left} y2={top + h} stroke="#475569" strokeWidth="1.2" />
        <line
          x1={left}
          y1={xAxisY}
          x2={left + w}
          y2={xAxisY}
          stroke="#475569"
          strokeWidth="1.6"
        />
        {extraLines.map((line, idx) => {
          const yy = yScale(line.value);
          const color = line.color || '#f97316';
          return (
            <g key={`extra_${idx}`}>
              <line
                x1={left}
                y1={yy}
                x2={left + w}
                y2={yy}
                stroke={color}
                strokeWidth="1"
                strokeDasharray="6 4"
              />
              <text x={left + w - 4} y={yy - 4} textAnchor="end" fontSize="9" fill={color}>
                {line.label}
              </text>
            </g>
          );
        })}
        <text x={left + w / 2} y={height - 8} textAnchor="middle" fontSize={axisLabelFontSize} fill="#475569">{xLabel}</text>
        <text x={14} y={top + h / 2} transform={`rotate(-90 14 ${top + h / 2})`} textAnchor="middle" fontSize={axisLabelFontSize} fill="#475569">
          {yLabel}
        </text>

        {series.map((s, idx) => {
          const path = (s.points || []).map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x)} ${yScale(p.y)}`).join(' ');
          const c = colors[idx % colors.length];
          const isPerformance = String(s.key || '').startsWith('perf_');
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={c} strokeWidth="2.2" strokeDasharray={isPerformance ? '6 4' : undefined} />
            </g>
          );
        })}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {series.map((s, idx) => (
          <div key={`legend_${s.key}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#334155' }}>
            <span style={{
              width: 18,
              height: 0,
              borderTop: `2.5px solid ${colors[idx % colors.length]}`,
              display: 'inline-block',
            }} />
            <span>{s.label}</span>
          </div>
        ))}
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


function SensitivityStudyModule({
  analysisResult,
  analysisError,
  nodes = [],
  edges = [],
  appliedWeights = {},
  onAddChartToReport = null,
}) {
  const containerStyle = { flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' };
  const [studyType, setStudyType] = useState('input_variation');
  const [selectedInputId, setSelectedInputId] = useState('');
  const [selectedMargin, setSelectedMargin] = useState('');
  const [selectedMargins, setSelectedMargins] = useState([]);
  const [selectedPerformances, setSelectedPerformances] = useState([]);
  const [chartHeight, setChartHeight] = useState(340);
  const [lockXAxisScale, setLockXAxisScale] = useState(false);
  const [lockYAxisScale, setLockYAxisScale] = useState(false);
  const [showWeightedAbsorption, setShowWeightedAbsorption] = useState(false);
  const [showWeightedImpact, setShowWeightedImpact] = useState(false);
  const [direction, setDirection] = useState('increase');
  const [incrementPercent, setIncrementPercent] = useState('2');
  const [subLoading, setSubLoading] = useState(false);
  const [subRunProgress, setSubRunProgress] = useState(null);
  const [subError, setSubError] = useState('');
  const [subRun, setSubRun] = useState(null);
  const [comparisonSubRun, setComparisonSubRun] = useState(null);
  const [marginSubRun, setMarginSubRun] = useState(null);
  const [marginComparisonSubRun, setMarginComparisonSubRun] = useState(null);
  const [chartWidth, setChartWidth] = useState(860);
  const chartHeightMin = 220;
  const chartHeightMax = 640;
  const handleChartHeightInput = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(chartHeightMax, Math.max(chartHeightMin, parsed));
    setChartHeight(clamped);
  };
  const chartWidthMin = 520;
  const chartWidthMax = 1200;
  const handleChartWidthInput = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(chartWidthMax, Math.max(chartWidthMin, parsed));
    setChartWidth(clamped);
  };
  const [axisFontSize, setAxisFontSize] = useState(10);
  const axisFontSizeMin = 8;
  const axisFontSizeMax = 16;
  const handleAxisFontInput = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(axisFontSizeMax, Math.max(axisFontSizeMin, parsed));
    setAxisFontSize(clamped);
  };
  const graphAreaRef = useRef(null);
  const [graphAreaWidth, setGraphAreaWidth] = useState(0);
  useEffect(() => {
    const updateWidth = () => {
      setGraphAreaWidth(graphAreaRef.current?.clientWidth || 0);
    };
    updateWidth();
    const resizeObserver = typeof ResizeObserver !== 'undefined' && graphAreaRef.current
      ? new ResizeObserver(updateWidth)
      : null;
    if (graphAreaRef.current && resizeObserver) {
      resizeObserver.observe(graphAreaRef.current);
    }
    window.addEventListener('resize', updateWidth);
    return () => {
      window.removeEventListener('resize', updateWidth);
      resizeObserver?.disconnect();
    };
  }, []);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const columnLabelFont = 12;
  const columnTableFont = 11;

  const result = analysisResult?.result || {};
  const marginKeys = useMemo(() => Object.keys(result.excess || {}), [result]);
  const inputNodes = useMemo(
    () => (nodes || []).filter(n => n.type === 'input' && n.isOfInterest),
    [nodes]
  );
  const performanceNodes = useMemo(
    () => (nodes || []).filter(n => n.type === 'performance'),
    [nodes]
  );

  const selectedInputNode = useMemo(() => {
    if (!inputNodes.length) return null;
    const chosen = inputNodes.find(n => n.id === selectedInputId);
    return chosen || inputNodes[0];
  }, [inputNodes, selectedInputId]);

  const selectedRuntimeInput = useMemo(
    () => sanitize(selectedInputNode?.label || ''),
    [selectedInputNode]
  );
  const selectedInputBaseValue = useMemo(() => Number(selectedInputNode?.value), [selectedInputNode]);
  const selectedInputUnit = selectedInputNode?.unit || '-';
  const pmax = Number(result.deterioration?.[selectedRuntimeInput] || 0);
  const utilisationForInput = useMemo(
    () => rankedEntries(
      Object.fromEntries(
        marginKeys.map((m) => [m, result.utilisation_matrix?.[m]?.[selectedRuntimeInput] || 0])
      )
    ),
    [marginKeys, result, selectedRuntimeInput]
  );
  const governingMargin = utilisationForInput.length ? utilisationForInput[0][0] : '';

  const inputLimitRows = useMemo(() => {
    return inputNodes.map((node) => {
      const runtime = sanitize(node.label || '');
      const byMargin = rankedEntries(
        Object.fromEntries(
          marginKeys.map((m) => [m, result.utilisation_matrix?.[m]?.[runtime] || 0])
        )
      );
      return {
        inputLabel: node.label || runtime,
        inputUnit: node.unit || '-',
        runtime,
        baseValue: Number(node.value),
        limit: Number(result.deterioration?.[runtime] || 0),
        pmaxAbs: pmaxAbs(result.deterioration?.[runtime], Number(node.value)),
        governingMargin: byMargin[0]?.[0] || '',
        governingUtil: Number(byMargin[0]?.[1] || 0),
      };
    });
  }, [inputNodes, marginKeys, result]);

  const effectiveMargin = useMemo(() => (
    (selectedMargin && marginKeys.includes(selectedMargin)) ? selectedMargin : (marginKeys[0] || '')
  ), [selectedMargin, marginKeys]);
  const summaryMargin = useMemo(() => (
    studyType === 'input_variation' ? (governingMargin || marginKeys[0] || '') : effectiveMargin
  ), [studyType, governingMargin, marginKeys, effectiveMargin]);

  const activeMargins = useMemo(() => {
    return (selectedMargins || []).filter(m => marginKeys.includes(m));
  }, [selectedMargins, marginKeys]);
  const recordedMargins = marginKeys; // keep every margin in the sweep even if not displayed
  const displayedMargins = activeMargins.length ? activeMargins : marginKeys;
  const sanitizedMarginName = useMemo(() => sanitize(effectiveMargin || ''), [effectiveMargin]);
  const marginThresholdValue = useMemo(() => {
    if (!sanitizedMarginName) return NaN;
    const key = `${sanitizedMarginName}_threshold`;
    return Number(analysisResult?.paramValues?.[key] ?? NaN);
  }, [analysisResult, sanitizedMarginName]);
  const marginDecidedValue = useMemo(() => {
    if (!sanitizedMarginName) return NaN;
    const key = `${sanitizedMarginName}_decided`;
    return Number(analysisResult?.paramValues?.[key] ?? NaN);
  }, [analysisResult, sanitizedMarginName]);
  const marginExcess = useMemo(() => {
    if (!Number.isFinite(marginThresholdValue) || !Number.isFinite(marginDecidedValue)) return NaN;
    if (Math.abs(marginThresholdValue) < 1e-12) return NaN;
    return (marginDecidedValue - marginThresholdValue) / Math.abs(marginThresholdValue);
  }, [marginThresholdValue, marginDecidedValue]);
  const marginUtilisationRows = useMemo(
    () => rankedEntries(result.utilisation_matrix?.[effectiveMargin] || {}),
    [result, effectiveMargin]
  );
  const maxUtilisationForMargin = useMemo(() => {
    if (!marginUtilisationRows.length) return NaN;
    return Math.max(...marginUtilisationRows.map(([, v]) => Number(v)).filter(Number.isFinite));
  }, [marginUtilisationRows]);
  const governingInputsForMargin = useMemo(() => {
    if (!Number.isFinite(maxUtilisationForMargin)) return [];
    const tol = 1e-3;
    return marginUtilisationRows
      .filter(([, v]) => Number.isFinite(Number(v)) && Math.abs(Number(v) - maxUtilisationForMargin) <= tol)
      .map(([name]) => name);
  }, [marginUtilisationRows, maxUtilisationForMargin]);
  const isLimitingForAnyInput = useMemo(
    () => Number.isFinite(maxUtilisationForMargin) && maxUtilisationForMargin >= 0.995,
    [maxUtilisationForMargin]
  );
  const marginThresholdNewByInput = useMemo(() => {
    if (!Number.isFinite(marginDecidedValue) || !Number.isFinite(marginThresholdValue)) return [];
    const denom = marginDecidedValue - marginThresholdValue;
    if (Math.abs(denom) < 1e-12) return [];
    return marginUtilisationRows
      .map(([inputName, util]) => {
        const u = Number(util);
        if (!Number.isFinite(u)) return null;
        const thresholdNew = marginDecidedValue - (1 - u) * denom;
        return { inputName, util: u, thresholdNew };
      })
      .filter(Boolean);
  }, [marginUtilisationRows, marginDecidedValue, marginThresholdValue]);
  const minThresholdNew = useMemo(() => {
    if (!marginThresholdNewByInput.length) return NaN;
    return Math.min(...marginThresholdNewByInput.map((x) => x.thresholdNew));
  }, [marginThresholdNewByInput]);
  const nonUtilizedFraction = useMemo(() => {
    if (!Number.isFinite(marginDecidedValue) || !Number.isFinite(marginThresholdValue) || !Number.isFinite(minThresholdNew)) return NaN;
    const denom = marginDecidedValue - marginThresholdValue;
    if (Math.abs(denom) < 1e-12) return NaN;
    return Math.max(0, (marginDecidedValue - minThresholdNew) / Math.abs(denom));
  }, [marginDecidedValue, marginThresholdValue, minThresholdNew]);
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
  const filterNonNegativeRows = useCallback((rows = []) => {
    if (!recordedMargins.length) return rows;
    return rows.filter((row) => recordedMargins.every((m) => {
      const val = Number(row?.margins?.[m]);
      return Number.isFinite(val) ? val >= 0 : true;
    }));
  }, [recordedMargins]);

  const rowsForDisplay = useMemo(() => filterNonNegativeRows(subRun?.rows || []), [subRun, filterNonNegativeRows]);
  const rowsForComparison = useMemo(
    () => filterNonNegativeRows(comparisonSubRun?.rows || []),
    [comparisonSubRun, filterNonNegativeRows]
  );
  const filterMarginEffectRows = useCallback((rows = [], marginLabel = '') => {
    if (!marginLabel) return rows;
    return rows.filter((row) => {
      const val = Number(row?.margins?.[marginLabel]);
      return !Number.isFinite(val) || val >= 0;
    });
  }, []);

  const marginRowsForDisplay = useMemo(
    () => filterMarginEffectRows(marginSubRun?.rows || [], effectiveMargin),
    [marginSubRun, effectiveMargin, filterMarginEffectRows]
  );
  const marginRowsForComparison = useMemo(
    () => filterMarginEffectRows(
      marginComparisonSubRun?.rows || [],
      marginComparisonSubRun?.marginLabel || effectiveMargin
    ),
    [marginComparisonSubRun, effectiveMargin, filterMarginEffectRows]
  );
  const activePerformances = useMemo(() => {
    const runtimeSet = new Set(performanceNodes.map((n) => sanitize(n.label || '')));
    return (selectedPerformances || []).filter((p) => runtimeSet.has(p));
  }, [selectedPerformances, performanceNodes]);

  useEffect(() => {
    if (!inputNodes.length) return;
    const hasCurrent = inputNodes.some(n => n.id === selectedInputId);
    if (!hasCurrent) setSelectedInputId(inputNodes[0].id);
  }, [inputNodes, selectedInputId]);

  useEffect(() => {
    const cleaned = (selectedMargins || []).filter(m => marginKeys.includes(m));
    if (cleaned.length !== (selectedMargins || []).length) {
      setSelectedMargins(cleaned);
      return;
    }
    if (cleaned.length === 0 && marginKeys.length) {
      setSelectedMargins(marginKeys.slice(0, Math.min(3, marginKeys.length)));
    }
  }, [marginKeys, selectedMargins]);

  useEffect(() => {
    if (!selectedMargin && marginKeys.length) {
      setSelectedMargin(marginKeys[0]);
    }
  }, [marginKeys, selectedMargin]);

  useEffect(() => {
    const runtimePerf = performanceNodes.map((n) => sanitize(n.label || '')).filter(Boolean);
    const cleaned = (selectedPerformances || []).filter((p) => runtimePerf.includes(p));
    if (cleaned.length !== (selectedPerformances || []).length) {
      setSelectedPerformances(cleaned);
    }
  }, [performanceNodes, selectedPerformances]);

  useEffect(() => {
    if (studyType === 'margin_effect' && direction !== 'increase') {
      setDirection('increase');
    }
  }, [studyType, direction]);

  if (analysisError) {
    return (
      <div style={{ ...containerStyle, background: '#F9FAFB', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', marginBottom: 8 }}>
          Sensitivity unavailable due to analysis error.
        </div>
        <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 10px' }}>
          {analysisError}
        </div>
      </div>
    );
  }

  if (!analysisResult) {
    return (
      <div style={{ ...containerStyle, background: '#F9FAFB', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 12, fontStyle: 'italic' }}>
        Run MVM analysis first to open Sensitivity Study.
      </div>
    );
  }

  const runInputVariationStudy = async () => {
    if (!selectedInputNode) {
      setSubError('No input of interest is available. Mark at least one input as "of interest".');
      return;
    }
    if (!Number.isFinite(selectedInputBaseValue)) {
      setSubError('Selected input has no valid numeric base value.');
      return;
    }
    const pmaxMag = Math.abs(Number(pmax));
    if (!Number.isFinite(pmaxMag) || pmaxMag <= 0) {
      setSubError('Pmax is not available or non-positive for this input.');
      return;
    }
    const incFrac = Number(incrementPercent) / 100;
    if (!Number.isFinite(incFrac) || incFrac <= 0) {
      setSubError('Increment must be a positive percentage.');
      return;
    }

    const maxTarget = Math.max(2.0, pmaxMag * 4); // continue past reported Pmax if needed
    const localInc = incFrac;
    const maxSteps = Math.ceil(maxTarget / localInc) + 4;

    setSubLoading(true);
    setSubRunProgress(0);
    setSubError('');
    setSubRun(null);

    try {
      const sweepRows = [];
      const baselineExcess = Object.fromEntries(
        recordedMargins.map((m) => [m, Number(analysisResult?.result?.excess?.[m] || 0)])
      );
      const stopCandidateMargins = recordedMargins.filter(
        (m) => Number.isFinite(baselineExcess[m]) && baselineExcess[m] > 0
      );
      const prevExcess = { ...baselineExcess };
      let t = 0;
      let collapseReached = false;
      let steps = 0;

      while (t <= maxTarget + 1e-12) {
        const factor = direction === 'increase' ? (1 + t) : (1 - t);
        const variedValue = selectedInputBaseValue * factor;
        const variedNodes = nodes.map((n) => (
          n.id === selectedInputNode.id
            ? { ...n, value: String(variedValue) }
            : n
        ));
        const subRes = await runAnalysis(variedNodes, edges, appliedWeights);
        const rec = {
          t,
          x: variedValue,
          margins: {},
          performances: {},
        };
        for (const m of recordedMargins) {
          const excess = Number(subRes?.result?.excess?.[m] || 0);
          rec.margins[m] = excess;
        }
        for (const p of activePerformances) {
          const baselineP = analysisResult?.paramValues?.[p];
          const runP = subRes?.paramValues?.[p];
          rec.performances[p] = relChange(runP, baselineP);
        }
        sweepRows.push(rec);
        setSubRunProgress(Math.round(((steps + 1) / Math.max(1, maxSteps)) * 100));

        for (const m of stopCandidateMargins) {
          const prev = Number(prevExcess[m]);
          const curr = Number(rec.margins[m]);
          if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0 && curr <= 0) {
            collapseReached = true;
          }
          prevExcess[m] = curr;
        }

        steps += 1;
        if (collapseReached) break;
        if (steps >= maxSteps) break;
        t = Math.min(maxTarget, t + localInc);
        if (Math.abs(t - maxTarget) < 1e-12 && collapseReached) break;
      }

      // Replace overshoot sample with an interpolated zero-crossing row so
      // the plot/table still show where the first margin reaches zero.
      if (collapseReached && sweepRows.length > 1) {
        const last = sweepRows[sweepRows.length - 1];
        const prev = sweepRows[sweepRows.length - 2];
        const crossedMargin = activeMargins.find((m) => {
          const a = Number(prev?.margins?.[m]);
          const b = Number(last?.margins?.[m]);
          return Number.isFinite(a) && Number.isFinite(b) && a > 0 && b <= 0;
        });

        if (crossedMargin) {
          const a = Number(prev.margins[crossedMargin]);
          const b = Number(last.margins[crossedMargin]);
          const alpha = (a - b) !== 0 ? (a / (a - b)) : 1; // fraction from prev -> last at y=0
          const clamp = Math.max(0, Math.min(1, alpha));
          const interp = {
            t: prev.t + (last.t - prev.t) * clamp,
            x: prev.x + (last.x - prev.x) * clamp,
            margins: {},
            performances: {},
          };
          for (const m of activeMargins) {
            const av = Number(prev.margins[m]);
            const bv = Number(last.margins[m]);
            interp.margins[m] = Number.isFinite(av) && Number.isFinite(bv)
              ? av + (bv - av) * clamp
              : 0;
          }
          interp.margins[crossedMargin] = 0;

          for (const p of activePerformances) {
            const av = Number(prev.performances[p] || 0);
            const bv = Number(last.performances[p] || 0);
            interp.performances[p] = av + (bv - av) * clamp;
          }

          sweepRows[sweepRows.length - 1] = interp;
        }
      }

      setSubRun({
        inputLabel: selectedInputNode.label || selectedRuntimeInput,
        inputUnit: selectedInputUnit,
        baseValue: selectedInputBaseValue,
        pmax,
        direction,
        incrementUsed: localInc,
        collapseReached,
        rows: sweepRows,
      });
      setSubRunProgress(100);
    } catch (err) {
      setSubError(err.message || 'Sub-analysis failed.');
    } finally {
      setSubLoading(false);
      setSubRunProgress(null);
    }
  };

  const runMarginEffectStudy = async () => {
    if (!effectiveMargin) {
      setSubError('Select a margin to explore.');
      return;
    }
    const marginName = sanitize(effectiveMargin);
    let marginNode = nodes.find((n) => n.label === effectiveMargin);
    if (!marginNode) {
      marginNode = nodes.find((n) => sanitize(n.label || '') === marginName);
    }
    if (!marginNode) {
      setSubError(`Margin ${effectiveMargin} is not present in the model.`);
      return;
    }

    const marginEdges = edges.filter((e) => e.to === marginNode.id);
    const decidedEdge = marginEdges.find((e) => e.edgeType === 'decided');
    const fallbackEdge = marginEdges.find((e) => {
      const src = nodes.find((node) => node.id === e.from);
      return src?.type === 'decision';
    });
    const activeEdge = decidedEdge || fallbackEdge;
    if (!activeEdge) {
      setSubError('Unable to find the decision connection for the selected margin.');
      return;
    }
    const decisionNode = nodes.find((n) => n.id === activeEdge.from && n.type === 'decision');
    if (!decisionNode) {
      setSubError('Decision node for the margin cannot be located.');
      return;
    }

    const thresholdValue = Number(analysisResult?.paramValues?.[`${marginName}_threshold`] ?? NaN);
    const decidedValue = Number(analysisResult?.paramValues?.[`${marginName}_decided`] ?? NaN);
    if (!Number.isFinite(thresholdValue) || !Number.isFinite(decidedValue)) {
      setSubError('Baseline decision or threshold for the margin is missing.');
      return;
    }

    const marginDifference = decidedValue - thresholdValue;
    if (Math.abs(marginDifference) <= 1e-9) {
      setSubError('The selected margin already sits at its threshold.');
      return;
    }

    const incFrac = Number(incrementPercent) / 100;
    if (!Number.isFinite(incFrac) || incFrac <= 0) {
      setSubError('Increment must be a positive percentage.');
      return;
    }

    const localInc = Math.max(1e-6, Math.abs(marginDifference) * incFrac);
    if (!Number.isFinite(localInc) || localInc <= 0) {
      setSubError('Increment is too small for this margin range.');
      return;
    }

    setSubLoading(true);
    setSubRunProgress(0);
    setSubError('');
    setSubRun(null);

    try {
      const sweepRows = [];
      const sign = Math.sign(marginDifference) || 1;
      const maxMargin = Math.abs(marginDifference);
      let currentMargin = maxMargin;
      let steps = 0;
      const maxSteps = Math.ceil(maxMargin / localInc) + 4;

      const captureRow = async (marginValue) => {
        const decidedVal = thresholdValue + sign * marginValue;
        const variedNodes = nodes.map((node) => (
          node.id === decisionNode.id ? { ...node, decidedValue: String(decidedVal) } : node
        ));
        const subRes = await runAnalysis(variedNodes, edges, appliedWeights);
        const rec = {
          t: sign * marginValue,
          x: decidedVal,
          margins: {},
          performances: {},
        };
        for (const m of recordedMargins) {
          rec.margins[m] = Number(subRes?.result?.excess?.[m] || 0);
        }
        for (const p of activePerformances) {
          const baselineP = analysisResult?.paramValues?.[p];
          const runP = subRes?.paramValues?.[p];
          rec.performances[p] = relChange(runP, baselineP);
        }
        sweepRows.push(rec);
      };

      while (currentMargin >= -1e-12 && steps < maxSteps) {
        const marginValue = Math.max(0, currentMargin);
        await captureRow(marginValue);
        setSubRunProgress(Math.round(((steps + 1) / Math.max(1, maxSteps)) * 100));
        if (marginValue <= 1e-12) break;
        currentMargin -= localInc;
        steps += 1;
      }

      const lastRow = sweepRows[sweepRows.length - 1];
      const finalMarginReached = Boolean(lastRow && Math.abs(lastRow.t) <= 1e-6);
      if (!finalMarginReached) {
        await captureRow(0);
      }

      setMarginSubRun({
        studyType: 'margin_effect',
        marginLabel: effectiveMargin,
        marginThreshold: thresholdValue,
        marginDecided: decidedValue,
        direction: 'decrease',
        incrementUsed: localInc,
        rows: sweepRows,
      });
      setSubRunProgress(100);
    } catch (err) {
      setSubError(err.message || 'Sub-analysis failed.');
    } finally {
      setSubLoading(false);
      setSubRunProgress(null);
    }
  };

  const weightedImpact = result.weighted_impact?.[effectiveMargin] || 0;
  const weightedAbsorption = result.weighted_absorption?.[effectiveMargin] || 0;
  const excess = result.excess?.[effectiveMargin] || 0;
  const extraLines = [];
  const chartXLabel = studyType === 'input_variation'
    ? `${selectedInputNode?.label || 'Input'} value (${selectedInputUnit})`
    : `Margin ${(subRun?.marginLabel || effectiveMargin || 'Margin').replace('E_', 'E')} decided value`;
  if (showWeightedAbsorption && result.weighted_absorption) {
    activeMargins.forEach((m) => {
      const v = result.weighted_absorption[m];
      if (Number.isFinite(v)) {
        extraLines.push({
          label: `Absorption ${m.replace('E_', 'E')}`,
          value: v,
          color: '#f97316',
        });
      }
    });
  }
  if (showWeightedImpact && result.weighted_impact) {
    activeMargins.forEach((m) => {
      const v = result.weighted_impact[m];
      if (Number.isFinite(v)) {
        extraLines.push({
          label: `Impact ${m.replace('E_', 'E')}`,
          value: v,
          color: '#0ea5e9',
        });
      }
    });
  }
  const buildPerfLabel = (perfName) => {
    const perfNode = performanceNodes.find((n) => sanitize(n.label || '') === perfName);
    return perfNode?.label || perfName;
  };
  const buildInputLabel = (inputName) => {
    const inNode = inputNodes.find((n) => sanitize(n.label || '') === inputName);
    return inNode?.label || inputName;
  };
  const summaryImpactRows = rankedEntries(result.impact_matrix?.[summaryMargin] || {})
    .map(([k, v]) => [buildPerfLabel(k), v]);
  const summaryAbsorptionRows = rankedEntries(result.absorption_matrix?.[summaryMargin] || {})
    .map(([k, v]) => [buildInputLabel(k), v]);
  const summaryUtilisationRows = rankedEntries(result.utilisation_matrix?.[summaryMargin] || {})
    .map(([k, v]) => [buildInputLabel(k), v]);

  const buildSeriesForRows = (rows = []) => ([
    ...displayedMargins.map((m) => ({
      key: m,
      label: `M: ${m.replace('E_', 'E')} (local excess)`,
      points: rows.map((row) => ({ x: row.x, y: row.margins[m] })),
    })),
    ...activePerformances.map((p) => {
      const perfNode = performanceNodes.find((n) => sanitize(n.label || '') === p);
      return {
        key: `perf_${p}`,
        label: `P: ${perfNode?.label || p}`,
        points: rows.map((row) => ({ x: row.x, y: row.performances[p] || 0 })),
      };
    }),
  ]);

  const buildMarginEffectSeries = (rows = [], marginLabel = effectiveMargin) => {
    if (!marginLabel || !rows.length) return [];
    return activePerformances.map((p) => {
      const perfLabel = buildPerfLabel(p);
      const points = rows
        .map((row) => {
          const xVal = Number(row?.margins?.[marginLabel]);
          const yVal = Number(row?.performances?.[p] || 0);
          if (!Number.isFinite(xVal) || !Number.isFinite(yVal)) return null;
          return { x: xVal, y: yVal };
        })
        .filter(Boolean);
      return {
        key: `perf_margin_${p}`,
        label: `P: ${perfLabel}`,
        points,
      };
    }).filter((series) => series.points.length > 0);
  };

  const getSeriesDomain = (series = []) => {
    const points = (series || []).flatMap((s) => s.points || []);
    if (!points.length) return null;
    const xs = points.map((p) => Number(p.x)).filter(Number.isFinite);
    const ys = points.map((p) => Number(p.y)).filter(Number.isFinite);
    if (!xs.length || !ys.length) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minYRaw = Math.min(...ys);
    const maxYRaw = Math.max(...ys);
    const yPad = Math.max(0.02, (maxYRaw - minYRaw) * 0.08);
    return {
      x: { min: minX, max: maxX },
      y: { min: Math.min(minYRaw - yPad, 0), max: Math.max(maxYRaw + yPad, 0) },
    };
  };
  const inputComparisonDomain = useMemo(() => {
    const combinedRows = [...(rowsForDisplay || []), ...(comparisonSubRun ? rowsForComparison : [])];
    return getSeriesDomain(buildSeriesForRows(combinedRows));
  }, [rowsForDisplay, rowsForComparison, comparisonSubRun, displayedMargins, activePerformances]);
  const marginComparisonDomain = useMemo(() => {
    const combinedRows = [...(marginRowsForDisplay || []), ...(marginComparisonSubRun ? marginRowsForComparison : [])];
    return getSeriesDomain(buildMarginEffectSeries(combinedRows, effectiveMargin));
  }, [marginRowsForDisplay, marginRowsForComparison, marginComparisonSubRun, effectiveMargin, activePerformances]);

  const hasComparisonRun = studyType === 'input_variation'
    ? Boolean(comparisonSubRun)
    : Boolean(marginComparisonSubRun);
  const columnCount = hasComparisonRun ? 2 : 1;
  const gapSize = 14;
  const totalGap = columnCount > 1 ? gapSize * (columnCount - 1) : 0;
  const availableGraphWidth = Math.max(columnCount * 360, graphAreaWidth - totalGap);
  const columnWidth = Math.max(320, Math.floor(availableGraphWidth / columnCount));
  const chartWidthForRender = Math.max(360, Math.min(chartWidth, columnWidth));
  const graphAreaStyle = {
    display: 'flex',
    gap: gapSize,
    marginTop: 10,
    flexWrap: 'nowrap',
    overflowX: 'auto',
    paddingBottom: 8,
  };
  const renderSubRunColumn = (title, rows) => (
    <div
      key={title}
      style={{
        flex: `1 1 ${columnWidth}px`,
        minWidth: `${columnWidth}px`,
        maxWidth: `${columnWidth}px`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        fontSize: columnLabelFont,
        fontWeight: 600,
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
      }}>
        {title}
      </div>
      <MarginLineChart
        series={buildSeriesForRows(rows)}
        xLabel={chartXLabel}
        yLabel="Local excess / response (%)"
        height={chartHeight}
        extraLines={extraLines}
        axisFontSize={axisFontSize}
        width={chartWidthForRender}
        xDomain={lockXAxisScale ? (inputComparisonDomain?.x || null) : null}
        yDomain={lockYAxisScale ? (inputComparisonDomain?.y || null) : null}
        exportName={`input_variation_${String(title || 'run').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`}
        onAddToReport={onAddChartToReport}
        tables={rows.length ? [{
          caption: 'Sweep Samples',
          headers: ['Input value', ...displayedMargins.map(m => `${m.replace('E_', 'E')} local excess`)],
          rows: rows.map(row => [num(row.x, 4), ...displayedMargins.map(m => pct(row.margins[m], 2))]),
        }] : []}
      />
        {rows.length ? (
          <div style={{ marginTop: 12, border: '1px solid #E2E8F0', borderRadius: 6, background: '#FFFFFF', overflow: 'hidden' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
              Sweep Samples
            </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: columnTableFont }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B', fontSize: columnTableFont }}>Input value</th>
              {displayedMargins.map((m) => (
                <th
                  key={`head_${m}`}
                  style={{
                    textAlign: 'right',
                    padding: '5px 8px',
                    color: '#64748B',
                    fontSize: columnTableFont,
                  }}
                >
                  {m.replace('E_', 'E')} local excess
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`row_${idx}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155', fontWeight: 600 }}>
                    {num(row.x, 4)}
                  </td>
                  {displayedMargins.map((m) => (
                    <td
                      key={`cell_${idx}_${m}`}
                      style={{ ...tableCell(row.margins[m]), fontSize: columnTableFont }}
                    >
                      {pct(row.margins[m], 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
            No sweep samples remain after filtering out negative margins.
          </div>
        )}
      </div>
  );

  const renderMarginEffectColumn = (
    title,
    rows = [],
    marginLabel = effectiveMargin,
    emptyMessage = 'No sweep samples have been generated yet.'
  ) => {
    const displayMarginLabel = (marginLabel || '').replace('E_', 'E') || 'Margin';
    return (
      <div
        key={title}
        style={{
        flex: `1 1 ${columnWidth}px`,
        minWidth: `${columnWidth}px`,
        maxWidth: `${columnWidth}px`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        fontSize: columnLabelFont,
        fontWeight: 600,
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
      }}>
        {title}
      </div>
      <MarginLineChart
        series={buildMarginEffectSeries(rows, marginLabel)}
        xLabel={`E: ${displayMarginLabel} (local excess)`}
        yLabel="Performance change (%)"
        height={chartHeight}
        extraLines={[]}
        axisFontSize={axisFontSize}
        width={chartWidthForRender}
        xDomain={lockXAxisScale ? (marginComparisonDomain?.x || null) : null}
        yDomain={lockYAxisScale ? (marginComparisonDomain?.y || null) : null}
        exportName={`margin_effect_${String(title || 'run').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`}
        onAddToReport={onAddChartToReport}
        tables={rows.length ? [{
          caption: 'Sweep Samples',
          headers: ['Local excess (E)', ...activePerformances.map(p => buildPerfLabel(p))],
          rows: rows.map(row => [
            pct(row?.margins?.[marginLabel], 2),
            ...activePerformances.map(p => pct(row?.performances?.[p], 2)),
          ]),
        }] : []}
      />
      {rows.length ? (
        <div style={{ marginTop: 12, border: '1px solid #E2E8F0', borderRadius: 6, background: '#FFFFFF', overflow: 'hidden' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
            Sweep Samples
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: columnTableFont }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B', fontSize: columnTableFont }}>
                  Local excess (E)
                </th>
                {activePerformances.map((p) => (
                  <th
                    key={`perf_head_${p}`}
                    style={{
                      textAlign: 'right',
                      padding: '5px 8px',
                      color: '#64748B',
                      fontSize: columnTableFont,
                    }}
                  >
                    {buildPerfLabel(p)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`row_margin_${idx}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155', fontWeight: 600 }}>
                    {pct(row?.margins?.[marginLabel], 2)}
                  </td>
                  {activePerformances.map((p) => (
                    <td
                      key={`cell_margin_${idx}_${p}`}
                      style={{ ...tableCell(row?.performances?.[p]), fontSize: columnTableFont }}
                    >
                      {pct(row?.performances?.[p], 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
          {emptyMessage}
        </div>
      )}
    </div>
  );
};

  return (
    <div style={containerStyle}>
      <div style={{
        width: 260,
        minWidth: 260,
        background: '#F1F5F9',
        borderRight: '1px solid #E2E8F0',
        padding: '16px 12px',
        overflowY: 'auto',
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#64748B',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: '1px solid #E2E8F0',
        }}>
          Sensitivity Settings
        </div>

        <div className="study-type-tabs">
          <button
            type="button"
            className={`study-type-tab ${studyType === 'input_variation' ? 'active' : ''}`}
            onClick={() => setStudyType('input_variation')}
          >
            Input Variation Study
          </button>
          <button
            type="button"
            className={`study-type-tab ${studyType === 'margin_effect' ? 'active' : ''}`}
            onClick={() => setStudyType('margin_effect')}
          >
            Margin Effect on Performance
          </button>
        </div>

        {studyType === 'input_variation' ? (
          <>
            <label style={{ display: 'block', marginTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>
                Input Parameter (one at a time)
              </span>
              <select
                value={selectedInputNode?.id || ''}
                onChange={(e) => setSelectedInputId(e.target.value)}
                disabled={!inputNodes.length}
                style={{
                  width: '100%',
                  border: '1px solid #CBD5E1',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontSize: 12,
                  color: '#0F172A',
                  background: '#FFFFFF',
                }}
              >
                {inputNodes.length === 0 && (
                  <option value="">No inputs of interest</option>
                )}
                {inputNodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.label || n.id}</option>
                ))}
              </select>
            </label>
            {inputNodes.length === 0 && (
              <div style={{
                marginTop: 6,
                fontSize: 11,
                color: '#B45309',
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: 6,
                padding: '6px 8px',
                lineHeight: 1.4,
              }}>
                No inputs are marked as "of interest". Mark at least one input in Model tab.
              </div>
            )}

            <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', padding: 8 }}>
              <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6 }}>Base value</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 4, columnGap: 8, fontSize: 11 }}>
                <div style={{ color: '#64748B' }}>Input value</div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>{num(selectedInputBaseValue, 4)}</div>
                <div style={{ color: '#64748B' }}>Pmax</div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>
                  {(() => {
                    const v = pmaxAbs(pmax, selectedInputBaseValue);
                    return Number.isFinite(v) ? num(v, 4) : 'n/a';
                  })()}
                </div>
                <div style={{ color: '#64748B' }}>Pmax (%)</div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>{pct(pmax, 2)}</div>
                <div style={{ color: '#64748B' }}>Unit</div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>{selectedInputUnit}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <label style={{ display: 'block', marginTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>
                Margin
              </span>
              <select
                value={effectiveMargin}
                onChange={(e) => setSelectedMargin(e.target.value)}
                style={{
                  width: '100%',
                  border: '1px solid #CBD5E1',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontSize: 12,
                  color: '#0F172A',
                  background: '#FFFFFF',
                }}
              >
                {marginKeys.map((m) => (
                  <option key={m} value={m}>{m.replace('E_', 'E')}</option>
                ))}
              </select>
            </label>
            <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', padding: 8 }}>
              <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6 }}>Margin baseline</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 4, columnGap: 8, fontSize: 11 }}>
                <div style={{ color: '#64748B' }}>Threshold</div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>
                  {Number.isFinite(marginThresholdValue) ? num(marginThresholdValue, 4) : 'n/a'}
                </div>
                <div style={{ color: '#64748B' }}>Decided</div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>
                  {Number.isFinite(marginDecidedValue) ? num(marginDecidedValue, 4) : 'n/a'}
                </div>
                <div style={{ color: '#64748B' }}>Local excess</div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>
                  {Number.isFinite(marginExcess) ? pct(marginExcess, 2) : 'n/a'}
                </div>
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
          </>
        )}

        {studyType === 'input_variation' && (
          <>
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: '#64748B' }}>
              Margins to record
            </div>
            <div style={{ marginTop: 6, border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', padding: 8, maxHeight: 170, overflowY: 'auto' }}>
              {marginKeys.map((m) => {
                const checked = activeMargins.includes(m);
                return (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#334155', marginBottom: 5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedMargins((prev) => {
                          const cur = (prev || []).filter(x => marginKeys.includes(x));
                          if (e.target.checked) return [...new Set([...cur, m])];
                          return cur.filter(x => x !== m);
                        });
                      }}
                    />
                    <span>{m.replace('E_', 'E')}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: '#64748B' }}>
          Performance parameters to record
        </div>
        <div style={{ marginTop: 6, border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', padding: 8, maxHeight: 130, overflowY: 'auto' }}>
          {performanceNodes.length === 0 && (
            <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
              No performance parameters available.
            </div>
          )}
          {performanceNodes.map((pNode) => {
            const runtime = sanitize(pNode.label || '');
            const checked = activePerformances.includes(runtime);
            return (
              <label key={pNode.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#334155', marginBottom: 5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setSelectedPerformances((prev) => {
                      const cur = prev || [];
                      if (e.target.checked) return [...new Set([...cur, runtime])];
                      return cur.filter((x) => x !== runtime);
                    });
                  }}
                />
                <span>{pNode.label || runtime}</span>
              </label>
            );
          })}
        </div>

        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>
            Direction
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              onClick={() => setDirection('increase')}
              style={{
                padding: '7px 8px',
                borderRadius: 6,
                border: `1px solid ${direction === 'increase' ? '#93C5FD' : '#CBD5E1'}`,
                background: direction === 'increase' ? '#EFF6FF' : '#FFFFFF',
                color: '#0F172A',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Increase
            </button>
            <button
              type="button"
              onClick={() => setDirection('decrease')}
              disabled={studyType === 'margin_effect'}
              style={{
                padding: '7px 8px',
                borderRadius: 6,
                border: `1px solid ${direction === 'decrease' ? '#93C5FD' : '#CBD5E1'}`,
                background: direction === 'decrease' ? '#EFF6FF' : '#FFFFFF',
                color: studyType === 'margin_effect' ? '#94A3B8' : '#0F172A',
                fontSize: 12,
                fontWeight: 600,
                cursor: studyType === 'margin_effect' ? 'not-allowed' : 'pointer',
              }}
            >
              - Decrease
            </button>
          </div>
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>
            Increment in selected E
          </span>
          <input
            type="number"
            step="0.1"
            min="0.01"
            value={incrementPercent}
            onChange={(e) => setIncrementPercent(e.target.value)}
            style={{
              width: '100%',
              border: '1px solid #CBD5E1',
              borderRadius: 6,
              padding: '6px 8px',
              fontSize: 12,
              color: '#0F172A',
              background: '#FFFFFF',
              boxSizing: 'border-box',
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => {
            if (studyType === 'input_variation') {
              runInputVariationStudy();
            } else {
              runMarginEffectStudy();
            }
          }}
          disabled={(() => {
            if (subLoading) return true;
            if (studyType === 'input_variation') return !inputNodes.length;
            if (studyType === 'margin_effect') return !effectiveMargin;
            return false;
          })()}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '8px 10px',
            border: '1px solid #93C5FD',
            borderRadius: 8,
            background: (subLoading) ? '#DBEAFE' : '#EFF6FF',
            color: '#1E3A8A',
            fontSize: 12,
            fontWeight: 700,
            cursor: subLoading ? 'wait' : 'pointer',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {subLoading && (
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.max(0, Math.min(100, Number(subRunProgress) || 0))}%`,
                background: 'rgba(37, 99, 235, 0.22)',
                transition: 'width 120ms linear',
              }}
            />
          )}
          <span style={{ position: 'relative' }}>
            {subLoading
              ? `Running sub-analysis... ${Math.max(0, Math.min(100, Number(subRunProgress) || 0))}%`
              : 'Run Sub-Analysis'}
          </span>
        </button>

        <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 6, background: '#FFFFFF', padding: '8px 9px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>
            Chart Settings
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>
                Chart height
              </div>
              <div style={{ marginTop: 6 }}>
                <input
                  type="number"
                  min={chartHeightMin}
                  max={chartHeightMax}
                  step="10"
                  value={chartHeight}
                  onChange={(e) => handleChartHeightInput(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #CBD5E1',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 11,
                    color: '#0F172A',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>
                Chart width
              </div>
              <div style={{ marginTop: 6 }}>
                <input
                  type="number"
                  min={chartWidthMin}
                  max={chartWidthMax}
                  step="10"
                  value={chartWidth}
                  onChange={(e) => handleChartWidthInput(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #CBD5E1',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 11,
                    color: '#0F172A',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>
              Font size
            </div>
            <div style={{ marginTop: 6 }}>
              <input
                type="number"
                min={axisFontSizeMin}
                max={axisFontSizeMax}
                step="1"
                value={axisFontSize}
                onChange={(e) => handleAxisFontInput(e.target.value)}
                style={{
                  width: '100%',
                  border: '1px solid #CBD5E1',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontSize: 11,
                  color: '#0F172A',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

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

      <div style={{
        flex: 1,
        background: '#F9FAFB',
        overflowY: 'auto',
        padding: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
          {studyType === 'input_variation'
            ? 'Input Variation Study'
            : 'Margin Effect on Performance Parameters'}
        </div>

        {studyType === 'input_variation' ? (
          <div style={{ display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              {subError && (
                <div style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: '#B91C1C',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: 6,
                  padding: '7px 9px',
                }}>
                  {subError}
                </div>
              )}

              {subRun && (
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 10 }}>
                  {subRun.studyType === 'margin_effect' ? (
                    <>
                      Margin sweep for {(subRun.marginLabel || effectiveMargin || '').replace('E_', 'E')} from decided value to threshold,
                      increment {pct(subRun.incrementUsed, 2)} ({subRun.rows.length} points)
                    </>
                  ) : (
                    <>
                      Sweep: {subRun.direction === 'increase' ? 'increase' : 'decrease'} from base to Pmax,
                      increment {pct(subRun.incrementUsed, 2)} ({subRun.rows.length} points)
                    </>
                  )}
                </div>
              )}
              {studyType === 'input_variation' && subRun && !subRun.collapseReached && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#B45309' }}>
                  No selected margin crossed zero local excess within sweep range.
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => subRun && setComparisonSubRun(subRun)}
                    disabled={!subRun}
                    style={{
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      background: subRun ? '#EFF6FF' : '#F8FAFC',
                      padding: '6px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: subRun ? '#1E3A8A' : '#94A3B8',
                      cursor: subRun ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Save run for comparison
                  </button>
                  {comparisonSubRun && (
                    <button
                      type="button"
                      onClick={() => setComparisonSubRun(null)}
                      style={{
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        background: '#FFFFFF',
                        padding: '6px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#0F172A',
                        cursor: 'pointer',
                      }}
                    >
                      Clear comparison
                    </button>
                  )}
                </div>
                <div
                  ref={graphAreaRef}
                  style={graphAreaStyle}
                >
                  {renderSubRunColumn('Primary run', rowsForDisplay)}
                  {comparisonSubRun && renderSubRunColumn('Comparison run', rowsForComparison)}
                </div>
              </div>
            </div>

            <div style={{
              width: 320,
              minWidth: 320,
              borderLeft: '1px solid #E2E8F0',
              background: '#F1F5F9',
              padding: '10px 10px 12px',
              overflowY: 'auto',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Static Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 10, color: '#64748B' }}>Input</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{selectedInputNode?.label || 'n/a'}</div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6 }}>Input Values</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 4, columnGap: 8, fontSize: 11 }}>
                    <div style={{ color: '#64748B' }}>Input value</div>
                    <div style={{ color: '#0F172A', fontWeight: 700 }}>{num(selectedInputBaseValue, 4)}</div>
                    <div style={{ color: '#64748B' }}>Pmax</div>
                    <div style={{ color: '#0F172A', fontWeight: 700 }}>
                      {(() => {
                        const v = pmaxAbs(pmax, selectedInputBaseValue);
                        return Number.isFinite(v) ? num(v, 4) : 'n/a';
                      })()}
                    </div>
                    <div style={{ color: '#64748B' }}>Pmax (%)</div>
                    <div style={{ color: '#0F172A', fontWeight: 700 }}>{pct(pmax, 2)}</div>
                    <div style={{ color: '#64748B' }}>Unit</div>
                    <div style={{ color: '#0F172A', fontWeight: 700 }}>{selectedInputUnit}</div>
                  </div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 10, color: '#64748B' }}>Limiting margin</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                    {(governingMargin || 'n/a').replace('E_', 'E')}
                  </div>
                </div>
              </div>

              <SectionTable
                title="Constraining Margins"
                subtitle="Higher utilisation means margin reaches zero sooner for selected input."
                rows={utilisationForInput.map(([m, v]) => [m.replace('E_', 'E'), v])}
                labelCol="Margin"
                valueLabel="Utilisation"
              />

              <div style={{ marginTop: 12, border: '1px solid #E2E8F0', borderRadius: 6, background: '#FFFFFF', overflow: 'hidden' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
                  Inputs of Interest Overview
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ textAlign: 'left', padding: '5px 8px', color: '#64748B' }}>Input</th>
                      <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Input value</th>
                      <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Pmax</th>
                      <th style={{ textAlign: 'right', padding: '5px 8px', color: '#64748B' }}>Pmax (%)</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', color: '#64748B' }}>Unit</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', color: '#64748B' }}>Limiting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inputLimitRows.map((row) => (
                      <tr key={row.runtime} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 600, color: '#334155' }}>
                          {row.inputLabel}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155' }}>{num(row.baseValue, 4)}</td>
                        <td style={{ textAlign: 'right', padding: '5px 8px', color: '#334155' }}>
                          {Number.isFinite(row.pmaxAbs) ? num(row.pmaxAbs, 4) : 'n/a'}
                        </td>
                        <td style={tableCell(row.limit)}>{pct(row.limit, 2)}</td>
                        <td style={{ textAlign: 'left', padding: '5px 8px', color: '#334155' }}>{row.inputUnit}</td>
                        <td style={{ padding: '5px 8px', color: '#334155' }}>
                          {(row.governingMargin || 'n/a').replace('E_', 'E')}
                          {row.governingMargin ? ` (${pct(row.governingUtil, 1)})` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <SectionTable
                title="Impact"
                subtitle={`Change in performance parameters for ${(summaryMargin || 'n/a').replace('E_', 'E')}.`}
                rows={summaryImpactRows}
                labelCol="Performance Parameter"
              />
              <SectionTable
                title="Absorption"
                subtitle={`Input absorption for ${(summaryMargin || 'n/a').replace('E_', 'E')}.`}
                rows={summaryAbsorptionRows}
                labelCol="Input Parameter"
              />
              <SectionTable
                title="Utilisation"
                subtitle={`Margin utilisation for ${(summaryMargin || 'n/a').replace('E_', 'E')}.`}
                rows={summaryUtilisationRows}
                labelCol="Input Parameter"
                valueLabel="Utilisation"
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              {subError && (
                <div style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: '#B91C1C',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: 6,
                  padding: '7px 9px',
                }}>
                  {subError}
                </div>
              )}
              {marginSubRun && (
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 10 }}>
                  Margin sweep from decided value to threshold,
                  increment {pct(marginSubRun.incrementUsed, 2)} ({marginSubRun.rows.length} points)
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!marginSubRun) return;
                      setMarginComparisonSubRun({
                        ...marginSubRun,
                        rows: [...(marginSubRun.rows || [])],
                      });
                    }}
                    disabled={!marginSubRun}
                    style={{
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      background: marginSubRun ? '#EFF6FF' : '#F8FAFC',
                      padding: '6px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: marginSubRun ? '#1E3A8A' : '#94A3B8',
                      cursor: marginSubRun ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Save run for comparison
                  </button>
                  {marginComparisonSubRun && (
                    <button
                      type="button"
                      onClick={() => setMarginComparisonSubRun(null)}
                      style={{
                        border: '1px solid #CBD5E1',
                        borderRadius: 6,
                        background: '#FFFFFF',
                        padding: '6px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#0F172A',
                        cursor: 'pointer',
                      }}
                    >
                      Clear comparison
                    </button>
                  )}
                </div>
                <div ref={graphAreaRef} style={graphAreaStyle}>
                  {renderMarginEffectColumn(
                    'Primary run',
                    marginRowsForDisplay,
                    effectiveMargin,
                    marginSubRun ? undefined : 'No sweep samples have been generated yet.'
                  )}
                  {marginComparisonSubRun && renderMarginEffectColumn(
                    'Comparison run',
                    marginRowsForComparison,
                    marginComparisonSubRun?.marginLabel || effectiveMargin,
                    'Comparison run has no sweep samples after filtering negatives.'
                  )}
                </div>
              </div>
            </div>

            <div style={{
              width: 320,
              minWidth: 320,
              borderLeft: '1px solid #E2E8F0',
              background: '#F1F5F9',
              padding: '10px 10px 12px',
              overflowY: 'auto',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Static Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 10, color: '#64748B' }}>Selected Margin</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                    {(effectiveMargin || 'n/a').replace('E_', 'E')}
                  </div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 10, color: '#64748B' }}>Impact</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{pct(weightedImpact)}</div>
                  <div style={{ fontSize: 10, color: excess < 0 ? '#DC2626' : '#64748B' }}>
                    Excess: {pct(excess)}
                  </div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 10, color: '#64748B' }}>Absorption</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{pct(weightedAbsorption)}</div>
                  <div style={{ fontSize: 10, color: '#64748B' }}>
                    Max: {Number.isFinite(marginAbsorptionStats.max.value) ? pct(marginAbsorptionStats.max.value, 2) : 'n/a'}
                    {marginAbsorptionStats.max.responsible.length ? ` (${marginAbsorptionStats.max.responsible.join(', ')})` : ''}
                  </div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, background: '#FFFFFF' }}>
                  <div style={{ fontSize: 10, color: '#64748B' }}>Utilisation Status</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                    {isLimitingForAnyInput ? 'Limiting for at least one input' : 'Nonlimiting across inputs'}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748B' }}>
                    Max util: {Number.isFinite(marginUtilisationStats.max.value) ? pct(marginUtilisationStats.max.value, 2) : 'n/a'}
                    {marginUtilisationStats.max.responsible.length ? ` (${marginUtilisationStats.max.responsible.join(', ')})` : ''}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748B' }}>
                    Min util: {Number.isFinite(marginUtilisationStats.min.value) ? pct(marginUtilisationStats.min.value, 2) : 'n/a'}
                    {marginUtilisationStats.min.responsible.length ? ` (${marginUtilisationStats.min.responsible.join(', ')})` : ''}
                  </div>
                </div>
              </div>
              <SectionTable
                title="Impact"
                subtitle={`Change in performance parameters for ${(summaryMargin || 'n/a').replace('E_', 'E')}.`}
                rows={summaryImpactRows}
                labelCol="Performance Parameter"
              />
              <SectionTable
                title="Absorption"
                subtitle={`Input absorption for ${(summaryMargin || 'n/a').replace('E_', 'E')}.`}
                rows={summaryAbsorptionRows}
                labelCol="Input Parameter"
              />
              <SectionTable
                title="Utilisation"
                subtitle={`Margin utilisation for ${(summaryMargin || 'n/a').replace('E_', 'E')}.`}
                rows={summaryUtilisationRows}
                labelCol="Input Parameter"
                valueLabel="Utilisation"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SensitivityStudyModule;
