import React, { useState } from 'react';
import { sanitize } from '../utils/helpers';
import ImageExportDialog from './ImageExportDialog';

const TABS = [
  { id: 'plot',          label: 'Plot' },
  { id: 'impact',        label: 'Impact' },
  { id: 'absorption',    label: 'Absorption' },
  { id: 'deterioration', label: 'Deterioration' },
];

function pct(v, decimals = 1) {
  return ((v || 0) * 100).toFixed(decimals) + '%';
}

function cellHeat(value, mode = 'green') {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 'transparent';
  if (mode === 'orange') {
    if (n < 0.01) return 'transparent';
    if (n < 0.05) return '#FFF7ED';
    if (n < 0.15) return '#FED7AA';
    return '#FDBA74';
  }
  if (mode === 'red') {
    if (n < 0.01) return 'transparent';
    if (n < 0.05) return '#FEF2F2';
    if (n < 0.15) return '#FECACA';
    return '#FCA5A5';
  }
  if (n < 0.01) return 'transparent';
  if (n < 0.05) return '#F0FDF4';
  if (n < 0.15) return '#DCFCE7';
  return '#BBF7D0';
}

function MatrixTable({ rowKeys, colKeys, data, rowLabel, emptyMsg, colorMode = 'green' }) {
  if (!rowKeys.length || !colKeys.length) {
    return <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>{emptyMsg}</div>;
  }
  const cellStyle = { textAlign: 'right', padding: '3px 6px', fontSize: 10, color: '#334155' };
  const headStyle = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
            <th style={{ ...headStyle, textAlign: 'left' }}>{rowLabel}</th>
            {colKeys.map(c => <th key={c} style={headStyle}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map(r => (
            <tr key={r} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>
                {r.replace('E_', 'E')}
              </td>
              {colKeys.map(c => {
                const v = (data[r] || {})[c] || 0;
                const bg = cellHeat(v, colorMode);
                return <td key={c} style={{ ...cellStyle, background: bg }}>{pct(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ─── Probabilistic MVM scatter (used in model tab when prob result available) ─
function ProbMVMPlotSmall({ statistics }) {
  if (!statistics?.margins) return null;
  const marginNames = Object.keys(statistics.margins);
  if (!marginNames.length) return null;

  const W = 280, H = 220, PAD = { top: 16, right: 16, bottom: 40, left: 44 };
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;

  const xVals = marginNames.map(m => statistics.margins[m].weighted_impact?.mean ?? 0);
  const yVals = marginNames.map(m => statistics.margins[m].weighted_absorption?.mean ?? 0);
  const xP5s  = marginNames.map(m => statistics.margins[m].weighted_impact?.p5  ?? 0);
  const xP95s = marginNames.map(m => statistics.margins[m].weighted_impact?.p95 ?? 0);
  const yP5s  = marginNames.map(m => statistics.margins[m].weighted_absorption?.p5  ?? 0);
  const yP95s = marginNames.map(m => statistics.margins[m].weighted_absorption?.p95 ?? 0);

  const xMin = Math.min(0, ...xVals, ...xP5s), xMax = Math.max(0.001, ...xVals, ...xP95s);
  const yMin = Math.min(0, ...yVals, ...yP5s), yMax = Math.max(0.001, ...yVals, ...yP95s);
  const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;

  const px = v => PAD.left + ((v - xMin) / xRange) * plotW;
  const py = v => PAD.top + plotH - ((v - yMin) / yRange) * plotH;
  const colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16'];

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid */}
      {[0.5].map(t => (
        <g key={t}>
          <line x1={PAD.left} y1={PAD.top + t*plotH} x2={PAD.left+plotW} y2={PAD.top + t*plotH} stroke="#E5E7EB" strokeWidth={1}/>
          <line x1={PAD.left + t*plotW} y1={PAD.top} x2={PAD.left + t*plotW} y2={PAD.top+plotH} stroke="#E5E7EB" strokeWidth={1}/>
        </g>
      ))}
      {/* Quadrant dividers */}
      <line x1={PAD.left+plotW/2} y1={PAD.top} x2={PAD.left+plotW/2} y2={PAD.top+plotH} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3,2"/>
      <line x1={PAD.left} y1={PAD.top+plotH/2} x2={PAD.left+plotW} y2={PAD.top+plotH/2} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3,2"/>
      {/* Margins */}
      {marginNames.map((m, i) => {
        const s = statistics.margins[m];
        const cx = px(s.weighted_impact?.mean ?? 0), cy = py(s.weighted_absorption?.mean ?? 0);
        const exLo = px(s.weighted_impact?.p5 ?? s.weighted_impact?.mean ?? 0);
        const exHi = px(s.weighted_impact?.p95 ?? s.weighted_impact?.mean ?? 0);
        const eyLo = py(s.weighted_absorption?.p5 ?? s.weighted_absorption?.mean ?? 0);
        const eyHi = py(s.weighted_absorption?.p95 ?? s.weighted_absorption?.mean ?? 0);
        const col = colors[i % colors.length];
        const r = Math.max(6, Math.min(14, Math.abs(s.excess?.mean ?? 0) * 200));
        return (
          <g key={m}>
            <line x1={exLo} y1={cy} x2={exHi} y2={cy} stroke={col} strokeWidth={1.5} opacity={0.5}/>
            <line x1={exLo} y1={cy-3} x2={exLo} y2={cy+3} stroke={col} strokeWidth={1.5} opacity={0.5}/>
            <line x1={exHi} y1={cy-3} x2={exHi} y2={cy+3} stroke={col} strokeWidth={1.5} opacity={0.5}/>
            <line x1={cx} y1={eyLo} x2={cx} y2={eyHi} stroke={col} strokeWidth={1.5} opacity={0.5}/>
            <line x1={cx-3} y1={eyLo} x2={cx+3} y2={eyLo} stroke={col} strokeWidth={1.5} opacity={0.5}/>
            <line x1={cx-3} y1={eyHi} x2={cx+3} y2={eyHi} stroke={col} strokeWidth={1.5} opacity={0.5}/>
            <circle cx={cx} cy={cy} r={r} fill={col} opacity={0.75} stroke="#1F2937" strokeWidth={0.8}/>
            <text x={cx+r+3} y={cy+3} fontSize={8} fontWeight={700} fill="#1F2937">{m.replace('E_','E')}</text>
          </g>
        );
      })}
      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top+plotH} x2={PAD.left+plotW} y2={PAD.top+plotH} stroke="#1F2937" strokeWidth={1.5}/>
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top+plotH} stroke="#1F2937" strokeWidth={1.5}/>
      {/* Ticks */}
      {[0, 0.5, 1].map(t => (
        <g key={t}>
          <line x1={PAD.left+t*plotW} y1={PAD.top+plotH} x2={PAD.left+t*plotW} y2={PAD.top+plotH+3} stroke="#6B7280" strokeWidth={1}/>
          <text x={PAD.left+t*plotW} y={PAD.top+plotH+11} fontSize={7} fill="#6B7280" textAnchor="middle">
            {((xMin+t*xRange)*100).toFixed(1)}%
          </text>
          <line x1={PAD.left-3} y1={PAD.top+plotH-t*plotH} x2={PAD.left} y2={PAD.top+plotH-t*plotH} stroke="#6B7280" strokeWidth={1}/>
          <text x={PAD.left-5} y={PAD.top+plotH-t*plotH+3} fontSize={7} fill="#6B7280" textAnchor="end">
            {((yMin+t*yRange)*100).toFixed(1)}%
          </text>
        </g>
      ))}
      {/* Axis labels */}
      <text x={PAD.left+plotW/2} y={H-4} fontSize={8} fontWeight={600} fill="#374151" textAnchor="middle">Impact on Performance (%)</text>
      <text transform={`translate(9,${PAD.top+plotH/2}) rotate(-90)`} fontSize={8} fontWeight={600} fill="#374151" textAnchor="middle">Absorption Potential (%)</text>
    </svg>
  );
}

function MarginValuePlot({ analysisResult, analysisError, appliedWeights, nodes = [], probabilisticResult = null }) {
  const [activeTab, setActiveTab] = useState('plot');
  const [showExportDialog, setShowExportDialog] = useState(false);

  const containerStyle = {
    borderTop: '1px solid #E2E8F0',
    background: '#F9FAFB',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 200,
    overflowY: 'auto',
  };

  if (analysisError) {
    return (
      <div style={{ ...containerStyle, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Analysis Error
        </div>
        <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {analysisError}
        </div>
      </div>
    );
  }

  if (!analysisResult) {
    return (
      <div style={{ ...containerStyle, alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 12, fontStyle: 'italic' }}>
        Run analysis to see the Margin Value Plot
      </div>
    );
  }

  const { result, plot } = analysisResult;
  const plotSrc = plot ? `data:image/png;base64,${plot}` : '';
  const marginKeys = Object.keys(result.excess || {});
  const perfKeys   = Object.keys(result.impact_matrix?.[marginKeys[0]] || {});
  const inputKeys  = Object.keys(result.absorption_matrix?.[marginKeys[0]] || {});
  const inputBaseByRuntime = Object.fromEntries(
    (nodes || [])
      .filter(n => n.type === 'input')
      .map(n => [sanitize(n.label), Number(n.value)])
  );
  const inputUnitByRuntime = Object.fromEntries(
    (nodes || [])
      .filter(n => n.type === 'input')
      .map(n => [sanitize(n.label), n.unit || '-'])
  );

  return (
    <div style={containerStyle}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', background: '#F1F5F9', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '7px 4px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #3B82F6' : '2px solid transparent',
              background: 'transparent',
              fontSize: 10,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? '#1D4ED8' : '#64748B',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>

        {activeTab === 'plot' && (
          <>
            <div style={{ fontSize: 10, color: '#64748B', marginBottom: 8, lineHeight: 1.5 }}>
              Weighted sensitivity active.
              {' '}Wj: {Object.keys(appliedWeights?.perfWeights || {}).length}
              {' '}| Li: {Object.keys(appliedWeights?.inputWeights || {}).length}
            </div>
            {probabilisticResult?.statistics && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Probabilistic MVM Plot — error bars = 5th–95th pct
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ProbMVMPlotSmall statistics={probabilisticResult.statistics} />
                </div>
              </div>
            )}
            {!probabilisticResult?.statistics && plot && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={() => setShowExportDialog(true)}
                    style={{
                      border: '1px solid #93C5FD',
                      borderRadius: 6,
                      background: '#EFF6FF',
                      color: '#1E3A8A',
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Export Graph
                  </button>
                </div>
                <img
                  src={plotSrc}
                  alt="Margin Value Plot"
                  style={{ width: '100%', borderRadius: 6, border: '1px solid #E2E8F0', marginBottom: 10 }}
                />
                <ImageExportDialog
                  open={showExportDialog}
                  onClose={() => setShowExportDialog(false)}
                  imageSrc={plotSrc}
                  plotData={result}
                  defaultTitle="Margin Value Plot"
                  defaultName="margin_value_plot"
                />
              </>
            )}
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>
              Results Summary
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ textAlign: 'left', padding: '3px 4px', color: '#64748B' }}>Margin</th>
                  <th style={{ textAlign: 'right', padding: '3px 4px', color: '#64748B' }}>Excess</th>
                  <th style={{ textAlign: 'right', padding: '3px 4px', color: '#64748B' }}>Impact</th>
                  <th style={{ textAlign: 'right', padding: '3px 4px', color: '#64748B' }}>Absorb.</th>
                </tr>
              </thead>
              <tbody>
                {marginKeys.map(m => (
                  <tr key={m} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '3px 4px', fontWeight: 600, color: '#334155' }}>
                      {m.replace('E_', 'E')}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '3px 4px',
                        color: (result.excess[m] || 0) < 0 ? '#DC2626' : '#334155',
                        background: cellHeat(result.excess[m], 'orange'),
                      }}
                    >
                      {pct(result.excess[m])}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '3px 4px',
                        color: '#334155',
                        background: cellHeat(result.weighted_impact[m], 'red'),
                      }}
                    >
                      {pct(result.weighted_impact[m])}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '3px 4px',
                        color: '#334155',
                        background: cellHeat(result.weighted_absorption[m], 'green'),
                      }}
                    >
                      {pct(result.weighted_absorption[m])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {activeTab === 'impact' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
              Impact on Performance — Metric 2
            </div>
            <div style={{ fontSize: 9, color: '#94A3B8', marginBottom: 8, lineHeight: 1.5 }}>
              % change in each performance parameter when the margin excess is zeroed.
            </div>
            <MatrixTable
              rowKeys={marginKeys}
              colKeys={perfKeys}
              data={result.impact_matrix || {}}
              rowLabel="Margin → Perf."
              emptyMsg="No performance parameters connected."
              colorMode="red"
            />
          </>
        )}

        {activeTab === 'absorption' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
              Change Absorption — Metric 3
            </div>
            <div style={{ fontSize: 9, color: '#94A3B8', marginBottom: 8, lineHeight: 1.5 }}>
              Fraction of each input's max deterioration that this margin can absorb.
            </div>
            <MatrixTable
              rowKeys={marginKeys}
              colKeys={inputKeys}
              data={result.absorption_matrix || {}}
              rowLabel="Margin → Input"
              emptyMsg="No inputs of interest marked."
              colorMode="green"
            />
          </>
        )}

        {activeTab === 'deterioration' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
              Max Input Deterioration (Pmax)
            </div>
            <div style={{ fontSize: 9, color: '#94A3B8', marginBottom: 8, lineHeight: 1.5 }}>
              Maximum change each input can undergo before any margin is violated.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ textAlign: 'left', padding: '3px 4px', color: '#64748B' }}>Input</th>
                  <th style={{ textAlign: 'right', padding: '3px 4px', color: '#64748B' }}>Input value (baseline)</th>
                  <th style={{ textAlign: 'right', padding: '3px 4px', color: '#64748B' }}>Pmax</th>
                  <th style={{ textAlign: 'right', padding: '3px 4px', color: '#64748B' }}>Pmax (%)</th>
                  <th style={{ textAlign: 'left', padding: '3px 4px', color: '#64748B' }}>Unit</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.deterioration || {}).map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '3px 4px', fontWeight: 600, color: '#334155' }}>{k}</td>
                    <td style={{ textAlign: 'right', padding: '3px 4px', color: '#334155' }}>
                      {(() => {
                        const base = Number(inputBaseByRuntime[k]);
                        return Number.isFinite(base) ? base.toFixed(4) : 'n/a';
                      })()}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 4px', color: '#334155' }}>
                      {(() => {
                        const base = Number(inputBaseByRuntime[k]);
                        const frac = Number(v);
                        if (!Number.isFinite(base) || !Number.isFinite(frac)) return 'n/a';
                        return (base * (1 + frac)).toFixed(4);
                      })()}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 4px', color: '#334155' }}>{pct(v)}</td>
                    <td style={{ textAlign: 'left', padding: '3px 4px', color: '#334155' }}>{inputUnitByRuntime[k] || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {Object.keys(result.utilisation_matrix || {}).length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>
                  Margin Utilisation
                </div>
                <div style={{ fontSize: 9, color: '#94A3B8', marginBottom: 8, lineHeight: 1.5 }}>
                  Fraction of available margin consumed by each input's max deterioration.
                </div>
                <MatrixTable
                  rowKeys={marginKeys}
                  colKeys={inputKeys}
                  data={result.utilisation_matrix || {}}
                  rowLabel="Margin → Input"
                  emptyMsg="No utilisation data."
                  colorMode="green"
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default MarginValuePlot;




