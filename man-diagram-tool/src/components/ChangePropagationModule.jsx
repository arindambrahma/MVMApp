import React, { useMemo, useState } from 'react';
import { buildGraphData, computeReachability, computeEdgeBetweenness } from '../utils/changePropagation';

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

export default function ChangePropagationModule({ nodes, edges, analysisResult }) {
  const [propMode, setPropMode] = useState('pass');

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
