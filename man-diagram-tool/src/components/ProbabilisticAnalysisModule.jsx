import { useMemo, useState } from 'react';

// ─── tiny helpers ────────────────────────────────────────────────────────────

function fmt(v, decimals = 3) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return (Number(v) * 100).toFixed(decimals) + '%';
}

function fmtRaw(v, decimals = 3) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return Number(v).toFixed(decimals);
}

function ReliabilityBadge({ prob }) {
  if (prob === null || prob === undefined || !Number.isFinite(prob)) {
    return <span style={{ fontSize: 11, color: '#94A3B8' }}>—</span>;
  }
  const pct = Math.round(prob * 100);
  const bg = prob >= 0.9 ? '#D1FAE5' : prob >= 0.7 ? '#FEF3C7' : '#FEE2E2';
  const col = prob >= 0.9 ? '#065F46' : prob >= 0.7 ? '#92400E' : '#991B1B';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      background: bg, color: col,
      fontSize: 11, fontWeight: 700,
    }}>{pct}%</span>
  );
}

// ─── SVG mini-histogram ───────────────────────────────────────────────────────

function MiniHistogram({ values, baseline, width = 200, height = 64, color = '#3B82F6' }) {
  if (!values || values.length === 0) {
    return <div style={{ fontSize: 10, color: '#94A3B8', width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data</div>;
  }

  const N_BINS = 20;
  const min_v = Math.min(...values);
  const max_v = Math.max(...values);
  const range = max_v - min_v || 1;
  const binWidth = range / N_BINS;

  const bins = Array(N_BINS).fill(0);
  values.forEach(v => {
    const idx = Math.min(N_BINS - 1, Math.floor((v - min_v) / binWidth));
    bins[idx]++;
  });
  const maxCount = Math.max(...bins);

  const barW = width / N_BINS;
  const pad = 2;

  // x-position for zero line (the failure threshold)
  const zeroX = max_v <= 0 ? 0 : min_v >= 0 ? width : ((0 - min_v) / range) * width;
  const baselineX = baseline !== null && baseline !== undefined
    ? ((baseline - min_v) / range) * width : null;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {bins.map((count, i) => {
        const barH = maxCount > 0 ? (count / maxCount) * (height - 12) : 0;
        const x = i * barW + pad / 2;
        const barXCenter = x + barW / 2 - pad / 2;
        // red bars if entirely to the left of zero (negative excess)
        const binRight = min_v + (i + 1) * binWidth;
        const isBad = binRight <= 0;
        return (
          <rect
            key={i}
            x={x}
            y={height - 12 - barH}
            width={barW - pad}
            height={Math.max(1, barH)}
            fill={isBad ? '#EF4444' : color}
            opacity={0.75}
          />
        );
      })}
      {/* Zero line */}
      {zeroX > 0 && zeroX < width && (
        <line x1={zeroX} y1={0} x2={zeroX} y2={height - 12}
          stroke="#1F2937" strokeWidth={1.5} strokeDasharray="3,2" />
      )}
      {/* Baseline marker */}
      {baselineX !== null && (
        <line x1={baselineX} y1={0} x2={baselineX} y2={height - 12}
          stroke="#F59E0B" strokeWidth={1.5} />
      )}
      {/* x-axis labels */}
      <text x={0} y={height} fontSize={9} fill="#64748B" textAnchor="start">
        {(min_v * 100).toFixed(0)}%
      </text>
      <text x={width} y={height} fontSize={9} fill="#64748B" textAnchor="end">
        {(max_v * 100).toFixed(0)}%
      </text>
      <text x={width / 2} y={height} fontSize={9} fill="#64748B" textAnchor="middle">
        Excess
      </text>
    </svg>
  );
}

// ─── Probabilistic MVM scatter plot ──────────────────────────────────────────

function ProbMVMPlot({ statistics, baseline }) {
  if (!statistics?.margins) return null;

  const W = 480, H = 380, PAD = { top: 20, right: 20, bottom: 48, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const marginNames = Object.keys(statistics.margins);
  if (!marginNames.length) return null;

  // Gather all values for axis scaling
  const xVals = marginNames.map(m => statistics.margins[m].weighted_impact?.mean ?? 0);
  const yVals = marginNames.map(m => statistics.margins[m].weighted_absorption?.mean ?? 0);
  const xP5s = marginNames.map(m => statistics.margins[m].weighted_impact?.p5 ?? 0);
  const xP95s = marginNames.map(m => statistics.margins[m].weighted_impact?.p95 ?? 0);
  const yP5s = marginNames.map(m => statistics.margins[m].weighted_absorption?.p5 ?? 0);
  const yP95s = marginNames.map(m => statistics.margins[m].weighted_absorption?.p95 ?? 0);

  const xMin = Math.min(0, ...xVals, ...xP5s);
  const xMax = Math.max(0.001, ...xVals, ...xP95s);
  const yMin = Math.min(0, ...yVals, ...yP5s);
  const yMax = Math.max(0.001, ...yVals, ...yP95s);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const px = v => PAD.left + ((v - xMin) / xRange) * plotW;
  const py = v => PAD.top + plotH - ((v - yMin) / yRange) * plotH;

  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(t => (
        <g key={t}>
          <line x1={PAD.left} y1={PAD.top + t * plotH} x2={PAD.left + plotW} y2={PAD.top + t * plotH}
            stroke="#E5E7EB" strokeWidth={1} />
          <line x1={PAD.left + t * plotW} y1={PAD.top} x2={PAD.left + t * plotW} y2={PAD.top + plotH}
            stroke="#E5E7EB" strokeWidth={1} />
        </g>
      ))}
      {/* Quadrant dividers */}
      <line x1={PAD.left + plotW / 2} y1={PAD.top} x2={PAD.left + plotW / 2} y2={PAD.top + plotH}
        stroke="#9CA3AF" strokeWidth={1} strokeDasharray="4,3" />
      <line x1={PAD.left} y1={PAD.top + plotH / 2} x2={PAD.left + plotW} y2={PAD.top + plotH / 2}
        stroke="#9CA3AF" strokeWidth={1} strokeDasharray="4,3" />

      {/* Quadrant labels */}
      {[
        { tx: 0.25, ty: 0.25, label: 'High absorption\nLow impact\n(High value)' },
        { tx: 0.75, ty: 0.25, label: 'High absorption\nHigh impact\n(Trade-off)' },
        { tx: 0.25, ty: 0.75, label: 'Low absorption\nLow impact\n(Negligible)' },
        { tx: 0.75, ty: 0.75, label: 'Low absorption\nHigh impact\n(Reduce margin)' },
      ].map(({ tx, ty, label }) => (
        label.split('\n').map((line, i) => (
          <text key={`${tx}${ty}${i}`}
            x={PAD.left + tx * plotW}
            y={PAD.top + ty * plotH + (i - 1) * 11}
            textAnchor="middle" fontSize={8} fill="#9CA3AF" fontStyle="italic">
            {line}
          </text>
        ))
      ))}

      {/* Margin points with error bars */}
      {marginNames.map((m, i) => {
        const stats = statistics.margins[m];
        const cx = px(stats.weighted_impact?.mean ?? 0);
        const cy = py(stats.weighted_absorption?.mean ?? 0);
        const ex_lo = px(stats.weighted_impact?.p5 ?? stats.weighted_impact?.mean ?? 0);
        const ex_hi = px(stats.weighted_impact?.p95 ?? stats.weighted_impact?.mean ?? 0);
        const ey_lo = py(stats.weighted_absorption?.p5 ?? stats.weighted_absorption?.mean ?? 0);
        const ey_hi = py(stats.weighted_absorption?.p95 ?? stats.weighted_absorption?.mean ?? 0);
        const col = colors[i % colors.length];
        const excess_mean = stats.excess?.mean ?? 0;
        const r = Math.max(8, Math.min(20, Math.abs(excess_mean) * 200));
        const label = m.replace('E_', 'E');
        return (
          <g key={m}>
            {/* Error bars */}
            <line x1={ex_lo} y1={cy} x2={ex_hi} y2={cy} stroke={col} strokeWidth={1.5} opacity={0.5} />
            <line x1={ex_lo} y1={cy - 4} x2={ex_lo} y2={cy + 4} stroke={col} strokeWidth={1.5} opacity={0.5} />
            <line x1={ex_hi} y1={cy - 4} x2={ex_hi} y2={cy + 4} stroke={col} strokeWidth={1.5} opacity={0.5} />
            <line x1={cx} y1={ey_lo} x2={cx} y2={ey_hi} stroke={col} strokeWidth={1.5} opacity={0.5} />
            <line x1={cx - 4} y1={ey_lo} x2={cx + 4} y2={ey_lo} stroke={col} strokeWidth={1.5} opacity={0.5} />
            <line x1={cx - 4} y1={ey_hi} x2={cx + 4} y2={ey_hi} stroke={col} strokeWidth={1.5} opacity={0.5} />
            {/* Main dot */}
            <circle cx={cx} cy={cy} r={r} fill={col} opacity={0.7} stroke="#1F2937" strokeWidth={0.8} />
            <text x={cx + r + 4} y={cy + 4} fontSize={10} fontWeight={700} fill="#1F2937">{label}</text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
        stroke="#1F2937" strokeWidth={1.5} />
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
        stroke="#1F2937" strokeWidth={1.5} />

      {/* Axis ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <g key={t}>
          <line x1={PAD.left + t * plotW} y1={PAD.top + plotH}
            x2={PAD.left + t * plotW} y2={PAD.top + plotH + 4} stroke="#6B7280" strokeWidth={1} />
          <text x={PAD.left + t * plotW} y={PAD.top + plotH + 14}
            fontSize={8} fill="#6B7280" textAnchor="middle">
            {((xMin + t * xRange) * 100).toFixed(1)}%
          </text>
          <line x1={PAD.left - 4} y1={PAD.top + plotH - t * plotH}
            x2={PAD.left} y2={PAD.top + plotH - t * plotH} stroke="#6B7280" strokeWidth={1} />
          <text x={PAD.left - 6} y={PAD.top + plotH - t * plotH + 4}
            fontSize={8} fill="#6B7280" textAnchor="end">
            {((yMin + t * yRange) * 100).toFixed(1)}%
          </text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={PAD.left + plotW / 2} y={H - 4} fontSize={11} fontWeight={600} fill="#374151" textAnchor="middle">
        Impact on Performance (%)
      </text>
      <text transform={`translate(12,${PAD.top + plotH / 2}) rotate(-90)`}
        fontSize={11} fontWeight={600} fill="#374151" textAnchor="middle">
        Change Absorption Potential (%)
      </text>
    </svg>
  );
}

// ─── Performance distribution bar ────────────────────────────────────────────

function PerfDistBar({ name, stats }) {
  if (!stats || stats.mean === null) return null;
  const { mean, std, p5, p95 } = stats;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1F2937' }}>{name}</span>
        <span style={{ fontSize: 11, color: '#64748B' }}>
          {fmtRaw(mean, 4)} ± {fmtRaw(std, 4)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 14, background: '#F1F5F9', borderRadius: 7 }}>
        {/* p5–p95 range */}
        {Number.isFinite(p5) && Number.isFinite(p95) && p95 > p5 && (() => {
          const range = p95 - p5;
          // Just show the range as a full bar with labels
          return (
            <div style={{
              position: 'absolute', left: '5%', right: '5%', top: 2, bottom: 2,
              background: '#BFDBFE', borderRadius: 5,
            }} />
          );
        })()}
        {/* Mean marker */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2,
          background: '#1D4ED8', borderRadius: 1, transform: 'translateX(-50%)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
        <span>p5: {fmtRaw(p5, 4)}</span>
        <span>p95: {fmtRaw(p95, 4)}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProbabilisticAnalysisModule({ result, baseline, nodes }) {
  const [activePanel, setActivePanel] = useState('reliability');

  if (!result) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>No probabilistic analysis results</div>
        <div style={{ fontSize: 13 }}>
          Set Analysis Mode to "Probabilistic" in Pre-Analysis Settings and run the analysis.
        </div>
      </div>
    );
  }

  const { statistics, samples, n_samples, n_failed, baseline: baselineData } = result;
  const marginNames = statistics?.margins ? Object.keys(statistics.margins) : [];
  const perfNames = statistics?.performance ? Object.keys(statistics.performance) : [];

  const panelBtnStyle = (id) => ({
    padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', marginRight: 6,
    background: activePanel === id ? '#1D4ED8' : '#E2E8F0',
    color: activePanel === id ? '#fff' : '#374151',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#F8FAFC' }}>
      {/* Header */}
      <div style={{
        padding: '10px 24px', borderBottom: '1px solid #E2E8F0',
        background: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>Probabilistic Analysis</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
            Monte Carlo · {n_samples.toLocaleString()} successful samples
            {n_failed > 0 && <span style={{ color: '#EF4444', marginLeft: 8 }}> ({n_failed} failed)</span>}
          </div>
        </div>
        <div>
          {[
            { id: 'reliability', label: 'Reliability Table' },
            { id: 'histograms', label: 'Histograms' },
            { id: 'mvmplot', label: 'MVM Plot' },
            { id: 'performance', label: 'Performance' },
          ].map(({ id, label }) => (
            <button key={id} style={panelBtnStyle(id)} onClick={() => setActivePanel(id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

        {/* ── RELIABILITY TABLE ── */}
        {activePanel === 'reliability' && (
          <div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 12, lineHeight: 1.6 }}>
              <strong>P(excess &gt; 0)</strong> is the probability that the decided value exceeds the threshold —
              i.e. the margin is still positive despite uncertainty.
              Green ≥ 90%, yellow 70–90%, red &lt; 70%.
            </div>

            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#475569' }}>
              <strong>Interpretation:</strong> Use this table to spot margins at risk of going negative under uncertainty.
              Lower P(excess &gt; 0) indicates a higher chance of redesign or constraint violations in those margins.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9' }}>
                    {['Margin', 'P(excess > 0)', 'Mean Excess', 'Std', '5th pct', '95th pct', 'Mean Impact', 'Mean Absorption'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Margin' ? 'left' : 'center', fontWeight: 700, color: '#334155', fontSize: 11, borderBottom: '1px solid #E2E8F0' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {marginNames.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#94A3B8' }}>No margins found.</td></tr>
                  )}
                  {marginNames.map((m, i) => {
                    const ms = statistics.margins[m];
                    const label = m.replace('E_', 'E');
                    return (
                      <tr key={m} style={{ background: i % 2 ? '#F8FAFC' : '#fff', borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1E293B' }}>{label}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <ReliabilityBadge prob={ms.excess?.prob_positive} />
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#1F2937' }}>{fmt(ms.excess?.mean)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748B' }}>{fmt(ms.excess?.std)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748B', fontSize: 11 }}>{fmt(ms.excess?.p5)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748B', fontSize: 11 }}>{fmt(ms.excess?.p95)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{fmt(ms.weighted_impact?.mean)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{fmt(ms.weighted_absorption?.mean)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── HISTOGRAMS ── */}
        {activePanel === 'histograms' && (
          <div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>
              Distribution of excess for each margin across {n_samples.toLocaleString()} Monte Carlo samples.
              The dashed line at 0% marks failure (negative excess). The amber line is the deterministic baseline.
            </div>

            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#475569' }}>
              <strong>Interpretation:</strong> Wide or left-shifted histograms indicate unstable margins.
              If much of the distribution falls left of zero, that margin frequently fails under uncertainty.
            </div>
            {baselineData?.result && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
                <strong>Deterministic baseline:</strong> The amber line in each histogram and the nominal MVM values here.
                Baseline excess:{' '}
                {Object.entries(baselineData.result.excess || {}).map(([m, v]) =>
                  `${m.replace('E_', 'E')} = ${fmt(v)}`
                ).join('  |  ')}
              </div>
            )}

            {marginNames.length === 0 && (
              <div style={{ color: '#94A3B8', textAlign: 'center', marginTop: 40 }}>No margin samples collected.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {marginNames.map(m => {
                const ms = statistics.margins[m];
                const rawSamples = samples?.excess?.[m] || [];
                const baselineExcess = baselineData?.result?.excess?.[m];
                const label = m.replace('E_', 'E');
                const probPos = ms.excess?.prob_positive;
                return (
                  <div key={m} style={{ background: '#fff', borderRadius: 8, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{label}</span>
                      <ReliabilityBadge prob={probPos} />
                    </div>
                    <MiniHistogram
                      values={rawSamples}
                      baseline={baselineExcess}
                      width={220}
                      height={72}
                    />
                    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B' }}>
                      <span>Mean: {fmt(ms.excess?.mean)}</span>
                      <span>Std: {fmt(ms.excess?.std)}</span>
                      <span>p5–p95: [{fmt(ms.excess?.p5)}, {fmt(ms.excess?.p95)}]</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PROBABILISTIC MVM PLOT ── */}
        {activePanel === 'mvmplot' && (
          <div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>
              Probabilistic Margin Value Plot. Each bubble is placed at the mean (Impact, Absorption)
              and error bars show the 5th–95th percentile range across samples. Bubble size reflects mean excess.
            </div>
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#475569' }}>
              <strong>Interpretation:</strong> Prefer margins in the high-absorption/low-impact quadrant.
              Wide error bars indicate sensitivity to uncertainty and merit further attention.
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0' }}>
                <ProbMVMPlot statistics={statistics} baseline={baselineData?.result} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', fontSize: 11, color: '#475569' }}>
              {marginNames.map((m, i) => {
                const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
                return (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors[i % colors.length], border: '1px solid #1F2937' }} />
                    {m.replace('E_', 'E')}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PERFORMANCE DISTRIBUTIONS ── */}
        {activePanel === 'performance' && (
          <div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>
              Distribution of performance parameter values across Monte Carlo samples.
              The blue band spans the 5th–95th percentile; the dark line marks the mean.
            </div>
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#475569' }}>
              <strong>Interpretation:</strong> Use these distributions to gauge performance robustness.
              If critical performance parameters show wide spreads, the design may be sensitive to upstream uncertainty.
            </div>
            {perfNames.length === 0 && (
              <div style={{ color: '#94A3B8', textAlign: 'center', marginTop: 40 }}>No performance parameters tracked.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {perfNames.map(p => (
                <div key={p} style={{ background: '#fff', borderRadius: 8, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #E2E8F0' }}>
                  <PerfDistBar name={p} stats={statistics.performance[p]} />
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                      <span>n = {(samples?.performance?.[p] || []).length.toLocaleString()} samples</span>
                      <span>p25–p75: [{fmtRaw(statistics.performance[p]?.p25, 4)}, {fmtRaw(statistics.performance[p]?.p75, 4)}]</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
