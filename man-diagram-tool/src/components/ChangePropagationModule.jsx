import React, { useMemo, useState } from 'react';
import { buildGraphData, computeReachability, computeEdgeBetweenness } from '../utils/changePropagation';
import { sanitize } from '../utils/helpers';
import { runCpmRisk } from '../utils/api';

function formatNumber(value, decimals = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'n/a';
  return num.toFixed(decimals);
}

function topEntries(entries, limit = 10, accessor = (v) => v) {
  return [...entries]
    .sort((a, b) => accessor(b[1]) - accessor(a[1]))
    .slice(0, limit);
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ padding: 16, border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{title}</div>
      {subtitle ? (
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{subtitle}</div>
      ) : null}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function SimpleTable({ headers, rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
            {row.map((cell, cIdx) => (
              <td key={cIdx} style={{ padding: '6px 8px', color: '#1F2937', fontWeight: cIdx === 0 ? 600 : 500 }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function toPercent(value, decimals = 1) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 'n/a';
  return `${(v * 100).toFixed(decimals)}%`;
}

function buildCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row
    .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
    .join(',')
  );
  return lines.join('\n');
}

export default function ChangePropagationModule({ nodes, edges, analysisResult, probabilisticResult }) {
  const [propMode, setPropMode] = useState('pass');
  const [cpmThreshold, setCpmThreshold] = useState(0.01);
  const [cpmDepth, setCpmDepth] = useState(4);
  const [cpmRiskResult, setCpmRiskResult] = useState(null);
  const [cpmRiskError, setCpmRiskError] = useState(null);
  const [cpmRiskLoading, setCpmRiskLoading] = useState(false);

  const { nodeById, filteredNodes, filteredEdges } = useMemo(() => {
    const { nodes: filtered, edges: filteredEdgeList, nodeById: byId } = buildGraphData(nodes, edges);
    return { nodeById: byId, filteredNodes: filtered, filteredEdges: filteredEdgeList };
  }, [nodes, edges]);

  const reachability = useMemo(() => {
    const stopAtMargins = propMode === 'stop';
    return computeReachability(filteredNodes, filteredEdges, { stopAtMargins });
  }, [filteredNodes, filteredEdges, propMode]);

  const edgeBetweenness = useMemo(() => computeEdgeBetweenness(filteredNodes, filteredEdges), [filteredNodes, filteredEdges]);

  const nodeRows = useMemo(() => {
    const entries = filteredNodes.map((node) => {
      const metric = reachability[node.id] || {};
      return [
        node,
        metric.downstreamPerfCount || 0,
        metric.downstreamCount || 0,
        metric.upstreamInputCount || 0,
        metric.downstreamDistanceAvg || 0,
      ];
    });
    return topEntries(entries, 12, (row) => row[1] * 10 + row[2]);
  }, [filteredNodes, reachability]);

  const edgeRows = useMemo(() => {
    const edgePairs = new Map();
    for (const e of filteredEdges) {
      const key = `${e.from}::${e.to}`;
      if (!edgePairs.has(key)) edgePairs.set(key, []);
      edgePairs.get(key).push(e);
    }

    const entries = Array.from(edgePairs.entries()).map(([key, list]) => {
      const score = edgeBetweenness.get(key) || 0;
      const [fromId, toId] = key.split('::');
      const fromLabel = nodeById[fromId]?.label || nodeById[fromId]?.autoLabel || fromId;
      const toLabel = nodeById[toId]?.label || nodeById[toId]?.autoLabel || toId;
      return [
        `${fromLabel} → ${toLabel}`,
        score,
        list.length,
      ];
    });

    return topEntries(entries, 12, (row) => row[1]);
  }, [filteredEdges, edgeBetweenness, nodeById]);

  const marginPropagationRows = useMemo(() => {
    const result = analysisResult?.result;
    if (!result) return [];
    const impact = result.impact_matrix || {};
    const absorption = result.absorption_matrix || {};
    const rows = [];

    for (const [marginName, impactMap] of Object.entries(impact)) {
      const topPerf = Object.entries(impactMap || {})
        .sort((a, b) => Math.abs(b[1] || 0) - Math.abs(a[1] || 0))
        .slice(0, 3)
        .map(([name, value]) => `${name} (${formatNumber((value || 0) * 100, 1)}%)`)
        .join(', ');
      const absMap = absorption[marginName] || {};
      const topInputs = Object.entries(absMap)
        .sort((a, b) => Math.abs(b[1] || 0) - Math.abs(a[1] || 0))
        .slice(0, 3)
        .map(([name, value]) => `${name} (${formatNumber((value || 0) * 100, 1)}%)`)
        .join(', ');
      rows.push([
        marginName,
        topPerf || 'n/a',
        topInputs || 'n/a',
        formatNumber((result.excess || {})[marginName] * 100, 1) + '%',
      ]);
    }
    return rows;
  }, [analysisResult]);

  if (!analysisResult) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: '#64748B' }}>
        Run deterministic analysis first to view change propagation insights.
      </div>
    );
  }

  const nodeCount = filteredNodes.length;
  const edgeCount = filteredEdges.length;

  const cpmData = useMemo(() => {
    const prob = probabilisticResult;
    if (!prob?.samples) return null;
    const samples = prob.samples || {};
    const baseline = prob.baseline?.paramValues || analysisResult?.paramValues || {};
    const baselineExcess = prob.baseline?.result?.excess || analysisResult?.result?.excess || {};
    const tau = Math.max(0, Number(cpmThreshold) || 0);

    const nodeKey = (node) => {
      if (!node) return null;
      const base = sanitize(node.label || node.autoLabel || node.id || '');
      if (!base) return null;
      if (node.type === 'decision') return `${base}_D`;
      return base;
    };

    const sampleForNode = (node) => {
      if (!node) return null;
      if (node.type === 'margin') {
        const key = sanitize(node.label || node.autoLabel || node.id || '');
        return samples.excess?.[key] || null;
      }
      const key = nodeKey(node);
      return samples.params?.[key] || null;
    };

    const baselineForNode = (node) => {
      if (!node) return 0;
      if (node.type === 'margin') {
        const key = sanitize(node.label || node.autoLabel || node.id || '');
        const v = baselineExcess[key];
        return Number.isFinite(Number(v)) ? Number(v) : 0;
      }
      const key = nodeKey(node);
      const v = baseline?.[key];
      return Number.isFinite(Number(v)) ? Number(v) : 0;
    };

    const orderedNodes = filteredNodes;
    const nodeIndex = new Map(orderedNodes.map((n, i) => [n.id, i]));
    const size = orderedNodes.length;
    const L = Array.from({ length: size }, () => Array(size).fill(0));
    const I = Array.from({ length: size }, () => Array(size).fill(0));

    for (const e of filteredEdges) {
      const src = nodeById[e.from];
      const tgt = nodeById[e.to];
      if (!src || !tgt) continue;

      const srcSamples = sampleForNode(src);
      const tgtSamples = sampleForNode(tgt);
      if (!srcSamples || !tgtSamples) continue;

      const n = Math.min(srcSamples.length, tgtSamples.length);
      if (!n) continue;

      const bSrc = baselineForNode(src);
      const bTgt = baselineForNode(tgt);
      const denomSrc = Math.max(Math.abs(bSrc), 1e-9);
      const denomTgt = Math.max(Math.abs(bTgt), 1e-9);

      let aCount = 0;
      let bCount = 0;
      let impactSum = 0;

      for (let i = 0; i < n; i += 1) {
        const ds = (srcSamples[i] - bSrc) / denomSrc;
        const dt = (tgtSamples[i] - bTgt) / denomTgt;
        const aChanged = Math.abs(ds) >= tau;
        if (!aChanged) continue;
        aCount += 1;
        const bChanged = Math.abs(dt) >= tau;
        if (!bChanged) continue;
        bCount += 1;
        impactSum += Math.abs(dt);
      }

      const iFrom = nodeIndex.get(src.id);
      const iTo = nodeIndex.get(tgt.id);
      if (iFrom === undefined || iTo === undefined) continue;
      L[iTo][iFrom] = aCount > 0 ? bCount / aCount : 0;
      I[iTo][iFrom] = bCount > 0 ? impactSum / bCount : 0;
    }

    return { orderedNodes, L, I };
  }, [probabilisticResult, analysisResult, filteredNodes, filteredEdges, nodeById, cpmThreshold]);

  const handleExportCpmCsv = (matrix, name) => {
    if (!cpmData) return;
    const headers = ['RowLabel', ...cpmData.orderedNodes.map((n) => n.label || n.autoLabel || n.id)];
    const rows = cpmData.orderedNodes.map((rowNode, rIdx) => {
      const rowLabel = rowNode.label || rowNode.autoLabel || rowNode.id;
      const values = matrix[rIdx] || [];
      return [rowLabel, ...values.map((v) => formatNumber(v, 4))];
    });
    const csv = buildCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleComputeRisk = async () => {
    if (!cpmData) return;
    setCpmRiskLoading(true);
    setCpmRiskError(null);
    try {
      const res = await runCpmRisk(cpmData.L, cpmData.I, cpmData.orderedNodes.map((n) => n.label || n.autoLabel || n.id), {
        instigator: 'column',
        depth: cpmDepth,
      });
      setCpmRiskResult(res);
    } catch (err) {
      setCpmRiskError(err?.message || 'Failed to compute CPM risk.');
    } finally {
      setCpmRiskLoading(false);
    }
  };

  const topRiskRows = useMemo(() => {
    if (!cpmRiskResult?.risk || !cpmRiskResult?.labels) return [];
    const labels = cpmRiskResult.labels;
    const rows = [];
    for (let r = 0; r < cpmRiskResult.risk.length; r += 1) {
      for (let c = 0; c < cpmRiskResult.risk[r].length; c += 1) {
        if (r === c) continue;
        rows.push([labels[r], labels[c], cpmRiskResult.risk[r][c], cpmRiskResult.probability?.[r]?.[c]]);
      }
    }
    return topEntries(rows, 12, (row) => row[2]);
  }, [cpmRiskResult]);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Change Propagation</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Focused on how changes move through the Margin Analysis Network. The propagation model can treat margin nodes as
          absorbers (stop) or pass-through nodes (structural reach).
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12 }}>
          Nodes: {nodeCount}
        </div>
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12 }}>
          Edges: {edgeCount}
        </div>
        <label style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
          Propagation model
          <select
            value={propMode}
            onChange={(e) => setPropMode(e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #CBD5F5' }}
          >
            <option value="pass">Pass through margins</option>
            <option value="stop">Stop at margins (absorb)</option>
          </select>
        </label>
      </div>

      <Section
        title="Highest Downstream Influence"
        subtitle="Sorted by reachable performance nodes, then total downstream reach."
      >
        <SimpleTable
          headers={['Node', 'Perf Reach', 'Total Reach', 'Upstream Inputs', 'Avg Dist']}
          rows={nodeRows.map(([node, perf, total, upInputs, avgDist]) => [
            `${node.label || node.autoLabel || node.id} (${node.type})`,
            String(perf),
            String(total),
            String(upInputs),
            formatNumber(avgDist, 2),
          ])}
        />
      </Section>

      <Section
        title="Critical Propagation Links"
        subtitle="Edge betweenness highlights edges that sit on many shortest paths (directed)."
      >
        <SimpleTable
          headers={['Edge', 'Betweenness', 'Parallel Edges']}
          rows={edgeRows.map(([label, score, count]) => [
            label,
            formatNumber(score, 2),
            String(count),
          ])}
        />
      </Section>

      <Section
        title="Margin-Driven Propagation (MVM Core)"
        subtitle="Top performance impacts and change-absorption contributions per margin node, based on analysis matrices."
      >
        <SimpleTable
          headers={['Margin', 'Top Performance Effects', 'Top Input Absorption', 'Local Excess']}
          rows={marginPropagationRows.length ? marginPropagationRows : [['n/a', 'n/a', 'n/a', 'n/a']]}
        />
      </Section>

      <Section
        title="CPM DSMs From Probabilistic Runs"
        subtitle="Direct likelihood and impact matrices derived from Monte Carlo samples. Rows are receivers, columns are instigators."
      >
        {!probabilisticResult ? (
          <div style={{ fontSize: 12, color: '#64748B' }}>
            Run analysis in probabilistic mode to generate CPM likelihood and impact DSMs.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                Change threshold (relative)
                <input
                  type="number"
                  min="0"
                  step="0.005"
                  value={cpmThreshold}
                  onChange={(e) => setCpmThreshold(e.target.value)}
                  style={{ width: 90, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #CBD5F5' }}
                />
              </label>
              <label style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                Propagation depth
                <input
                  type="number"
                  min="1"
                  max="8"
                  step="1"
                  value={cpmDepth}
                  onChange={(e) => setCpmDepth(Number(e.target.value) || 1)}
                  style={{ width: 70, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #CBD5F5' }}
                />
              </label>
              <div style={{ fontSize: 11, color: '#64748B' }}>
                Interpretation: propagation occurs when |Δ| / |baseline| ≥ {toPercent(cpmThreshold, 1)}.
              </div>
              <button
                type="button"
                onClick={() => handleExportCpmCsv(cpmData?.L || [], 'cpm_likelihood.csv')}
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
                Export Likelihood DSM
              </button>
              <button
                type="button"
                onClick={() => handleExportCpmCsv(cpmData?.I || [], 'cpm_impact.csv')}
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
                Export Impact DSM
              </button>
              <button
                type="button"
                onClick={handleComputeRisk}
                disabled={cpmRiskLoading}
                style={{
                  border: '1px solid #86EFAC',
                  borderRadius: 6,
                  background: cpmRiskLoading ? '#E2E8F0' : '#ECFDF5',
                  color: '#166534',
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: cpmRiskLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {cpmRiskLoading ? 'Computing CPM Risk...' : 'Compute CPM Risk Matrix'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
              <strong>Likelihood</strong> is estimated as P(target changes | source changes) from Monte Carlo samples.
              <strong> Impact</strong> is the average magnitude of target change given propagation.
              This matches Clarksonâ€™s l/i DSM definition but uses the parametric network to estimate values.
            </div>
            {cpmRiskError && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#FEE2E2', color: '#991B1B', fontSize: 12 }}>
                {cpmRiskError}
              </div>
            )}
            {cpmRiskResult && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  CPM combined risk computed using cpmlib with depth {cpmRiskResult.depth}. Higher values indicate
                  higher expected downstream redesign effort.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleExportCpmCsv(cpmRiskResult.risk, 'cpm_risk.csv')}
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
                    Export Risk DSM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCpmCsv(cpmRiskResult.probability, 'cpm_probability.csv')}
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
                    Export Combined Likelihood DSM
                  </button>
                </div>
                <SimpleTable
                  headers={['Receiver', 'Instigator', 'Risk', 'Likelihood']}
                  rows={topRiskRows.map(([recv, inst, risk, prob]) => [
                    recv,
                    inst,
                    formatNumber(risk, 4),
                    formatNumber(prob, 4),
                  ])}
                />
              </div>
            )}
          </>
        )}
      </Section>

      <Section
        title="Interpretation Notes"
        subtitle="How this links to the Margin Value Method."
      >
        <ul style={{ fontSize: 12, color: '#334155', margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
          <li>Margin nodes represent local excess (decided vs threshold). Treating them as absorbers mirrors how change can be contained before it reaches performance parameters.</li>
          <li>Performance reach is a quick proxy for potential downstream influence; the MVM impact matrix provides the quantitative performance deterioration when a margin is removed.</li>
          <li>Absorption values summarise how much each margin buffers changes in input parameters (change propagation backward).</li>
        </ul>
      </Section>
    </div>
  );
}
