import React, { useState } from 'react';
import { sanitize } from '../utils/helpers';

const TABS = [
  { id: 'plot',          label: 'Plot' },
  { id: 'impact',        label: 'Impact' },
  { id: 'absorption',    label: 'Absorption' },
  { id: 'deterioration', label: 'Deterioration' },
];

function pct(v, decimals = 1) {
  return ((v || 0) * 100).toFixed(decimals) + '%';
}

function MatrixTable({ rowKeys, colKeys, data, rowLabel, emptyMsg }) {
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
                const abs = Math.abs(v * 100);
                const bg = abs < 1 ? 'transparent'
                  : abs < 20 ? '#F0FDF4'
                  : abs < 50 ? '#DCFCE7'
                  : '#BBF7D0';
                return <td key={c} style={{ ...cellStyle, background: bg }}>{pct(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarginValuePlot({ analysisResult, analysisError, appliedWeights, nodes = [] }) {
  const [activeTab, setActiveTab] = useState('plot');

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
            {plot && (
              <img
                src={`data:image/png;base64,${plot}`}
                alt="Margin Value Plot"
                style={{ width: '100%', borderRadius: 6, border: '1px solid #E2E8F0', marginBottom: 10 }}
              />
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
                    <td style={{ textAlign: 'right', padding: '3px 4px', color: (result.excess[m] || 0) < 0 ? '#DC2626' : '#334155' }}>
                      {pct(result.excess[m])}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 4px', color: '#334155' }}>
                      {pct(result.weighted_impact[m])}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 4px', color: '#334155' }}>
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
