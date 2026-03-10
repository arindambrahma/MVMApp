import React, { useMemo } from 'react';
import { NODE_META } from '../constants/nodeTypes';

const TYPE_ORDER = [
  'input',
  'calc',
  'calcFunction',
  'calcHierarchical',
  'hierarchicalInput',
  'hierarchicalOutput',
  'probe',
  'decision',
  'margin',
  'performance',
];

function inferEdgeType(edge, nodeById) {
  if (edge.edgeType) return edge.edgeType;
  if (edge.isTarget === true) return 'threshold';
  const target = nodeById[edge.to];
  const source = nodeById[edge.from];
  if (target?.type === 'margin') {
    return source?.type === 'decision' ? 'decided' : 'threshold';
  }
  return 'plain';
}

function formatPortEdge(edge) {
  const fromPort = edge.fromPort || '';
  const toPort = edge.toPort || '';
  if (!fromPort && !toPort) return '';
  return `${fromPort || '\u2022'} -> ${toPort || '\u2022'}`;
}

export default function DsmAnalysisModule({ nodes, edges, analysisResult }) {
  const {
    grouped,
    orderedNodes,
    edgeMap,
    typeCounts,
    edgeTypeCounts,
  } = useMemo(() => {
    const nodeById = Object.fromEntries((nodes || []).map((n) => [n.id, n]));
    const knownTypes = new Set(TYPE_ORDER);
    const observedTypes = Array.from(new Set((nodes || []).map((n) => n.type)));
    const unknownTypes = observedTypes.filter((t) => !knownTypes.has(t));
    const finalOrder = TYPE_ORDER.filter((t) => observedTypes.includes(t)).concat(unknownTypes);

    const groups = finalOrder.map((type) => {
      const groupNodes = (nodes || []).filter((n) => n.type === type);
      return {
        type,
        label: NODE_META[type]?.label || type,
        nodes: groupNodes,
      };
    }).filter((g) => g.nodes.length > 0);

    const ordered = groups.flatMap((g) => g.nodes);

    const map = new Map();
    const edgeTypeTotals = { plain: 0, threshold: 0, decided: 0, other: 0 };
    for (const e of edges || []) {
      if (!e?.from || !e?.to) continue;
      const edgeType = inferEdgeType(e, nodeById);
      if (edgeTypeTotals[edgeType] === undefined) edgeTypeTotals.other += 1;
      else edgeTypeTotals[edgeType] += 1;
      const key = `${e.from}::${e.to}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ ...e, edgeType });
    }

    const counts = {};
    for (const g of groups) counts[g.type] = g.nodes.length;

    return {
      grouped: groups,
      orderedNodes: ordered,
      edgeMap: map,
      typeCounts: counts,
      edgeTypeCounts: edgeTypeTotals,
    };
  }, [nodes, edges]);

  if (!analysisResult) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: '#64748B' }}>
        Run deterministic analysis first to view the DSM.
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>DSM Analysis</div>
        <div style={{ fontSize: 12, color: '#475569' }}>
          Nodes are grouped by type. Cells show directed edges with edge type and ports when available.
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#334155' }}>
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          Nodes: {(nodes || []).length}
        </div>
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          Edges: {(edges || []).length}
        </div>
        {Object.entries(typeCounts).map(([type, count]) => (
          <div key={type} style={{ padding: '6px 10px', borderRadius: 6, background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
            {NODE_META[type]?.label || type}: {count}
          </div>
        ))}
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
          Edge types: plain {edgeTypeCounts.plain}, threshold {edgeTypeCounts.threshold}, decided {edgeTypeCounts.decided}
          {edgeTypeCounts.other ? `, other ${edgeTypeCounts.other}` : ''}
        </div>
      </div>

      <div style={{ overflow: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }} />
              {grouped.map((g) => (
                <th
                  key={`group_${g.type}`}
                  colSpan={g.nodes.length}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    borderRight: '1px solid #E2E8F0',
                    textAlign: 'center',
                    padding: '6px 4px',
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ position: 'sticky', top: 24, left: 0, zIndex: 3, background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }} />
              {orderedNodes.map((n) => (
                <th
                  key={`col_${n.id}`}
                  style={{
                    position: 'sticky',
                    top: 24,
                    zIndex: 2,
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    borderRight: '1px solid #E2E8F0',
                    padding: '6px 8px',
                    minWidth: 120,
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#1F2937',
                  }}
                >
                  {n.label || n.autoLabel || n.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedNodes.map((rowNode, rowIdx) => (
              <tr key={`row_${rowNode.id}`}>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    background: '#F8FAFC',
                    borderRight: '1px solid #E2E8F0',
                    borderBottom: '1px solid #E2E8F0',
                    padding: '6px 8px',
                    minWidth: 160,
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#1F2937',
                  }}
                >
                  {rowNode.label || rowNode.autoLabel || rowNode.id}
                </th>
                {orderedNodes.map((colNode, colIdx) => {
                  const cellEdges = edgeMap.get(`${rowNode.id}::${colNode.id}`) || [];
                  const hasEdge = cellEdges.length > 0;
                  const cellStyle = {
                    borderBottom: '1px solid #E2E8F0',
                    borderRight: '1px solid #E2E8F0',
                    padding: '6px 8px',
                    minWidth: 120,
                    verticalAlign: 'top',
                    background: hasEdge ? '#EFF6FF' : '#fff',
                    color: hasEdge ? '#1E3A8A' : '#94A3B8',
                    lineHeight: 1.3,
                  };
                  return (
                    <td key={`cell_${rowIdx}_${colIdx}`} style={cellStyle}>
                      {hasEdge ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {cellEdges.map((edge) => {
                            const portLabel = formatPortEdge(edge);
                            return (
                              <div key={edge.id} style={{ fontSize: 10 }}>
                                <div style={{ fontWeight: 600 }}>{edge.edgeType}</div>
                                {portLabel && (
                                  <div style={{ color: '#475569' }}>{portLabel}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ fontSize: 10 }}>-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
