import React, { useMemo } from 'react';
import { NODE_META } from '../constants/nodeTypes';
import { PaletteIcon } from './Palette';

const TYPE_ORDER = [
  'input',
  'calc',
  'calcFunction',
  'calcHierarchical',
  'hierarchicalInput',
  'hierarchicalOutput',
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

const EDGE_SYMBOLS = {
  plain: 'o',
  threshold: '^',
  decided: 'x',
  other: '?',
};

const EDGE_PRIORITY = {
  decided: 3,
  threshold: 2,
  plain: 1,
  other: 0,
};

function formatPortEdge(edge) {
  const fromPort = edge.fromPort || '';
  const toPort = edge.toPort || '';
  if (!fromPort && !toPort) return '';
  return `${fromPort || '\u2022'} -> ${toPort || '\u2022'}`;
}

function alphaKey(index) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = letters[rem] + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function summarizeCellEdges(cellEdges) {
  if (!cellEdges || cellEdges.length === 0) return null;
  let topType = 'other';
  for (const e of cellEdges) {
    const t = e.edgeType || 'other';
    if ((EDGE_PRIORITY[t] ?? 0) > (EDGE_PRIORITY[topType] ?? 0)) topType = t;
  }
  const symbol = EDGE_SYMBOLS[topType] || EDGE_SYMBOLS.other;
  const lines = cellEdges.map((edge, idx) => {
    const portLabel = formatPortEdge(edge);
    const typeLabel = edge.edgeType || 'other';
    const sym = EDGE_SYMBOLS[typeLabel] || EDGE_SYMBOLS.other;
    return `${idx + 1}. ${sym} ${typeLabel}${portLabel ? ` ${portLabel}` : ''}`;
  });
  const title = `${cellEdges.length} edge(s)\n${lines.join('\n')}`;
  return { symbol, title };
}

function typeIconKey(type) {
  if (type === 'calcFunction') return 'calcFunction';
  if (type === 'calcHierarchical') return 'calcHierarchical';
  if (type === 'hierarchicalInput') return 'hierarchicalInput';
  if (type === 'hierarchicalOutput') return 'hierarchicalOutput';
  if (type === 'decision') return 'decision';
  if (type === 'margin') return 'margin';
  if (type === 'performance') return 'performance';
  if (type === 'input') return 'input';
  return 'calc';
}

export default function DsmAnalysisModule({ nodes, edges, analysisResult }) {
  const {
    orderedNodes,
    rowMeta,
    edgeMap,
    keyById,
    typeCounts,
    edgeTypeCounts,
  } = useMemo(() => {
    const filteredNodes = (nodes || []).filter((n) => n.type !== 'probe');
    const nodeById = Object.fromEntries(filteredNodes.map((n) => [n.id, n]));
    const filteredEdges = (edges || []).filter((e) => nodeById[e.from] && nodeById[e.to]);
    const knownTypes = new Set(TYPE_ORDER);
    const observedTypes = Array.from(new Set(filteredNodes.map((n) => n.type)));
    const unknownTypes = observedTypes.filter((t) => !knownTypes.has(t));
    const finalOrder = TYPE_ORDER.filter((t) => observedTypes.includes(t)).concat(unknownTypes);

    const groups = finalOrder.map((type) => {
      const groupNodes = filteredNodes.filter((n) => n.type === type);
      return {
        type,
        label: NODE_META[type]?.label || type,
        nodes: groupNodes,
      };
    }).filter((g) => g.nodes.length > 0);

    const ordered = groups.flatMap((g) => g.nodes);

    const map = new Map();
    const edgeTypeTotals = { plain: 0, threshold: 0, decided: 0, other: 0 };
    for (const e of filteredEdges) {
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

    const keys = {};
    ordered.forEach((n, idx) => {
      keys[n.id] = alphaKey(idx);
    });

    const rows = [];
    for (const g of groups) {
      g.nodes.forEach((n, idx) => {
        rows.push({
          node: n,
          isGroupStart: idx === 0,
          typeLabel: g.label,
          typeKey: g.type,
        });
      });
    }

    return {
      orderedNodes: ordered,
      rowMeta: rows,
      edgeMap: map,
      keyById: keys,
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

  const headerBg = '#E2E8F0';
  const cornerBg = '#CBD5E1';
  const rowHeaderBg = '#E2E8F0';
  const diagBg = '#D1D5DB';
  const cellSize = 28;
  const rowLabelWidth = 130;
  const typeColWidth = 32;

  const handleExportCsv = () => {
    const colKeys = orderedNodes.map((n) => keyById[n.id]);
    const header = ['RowKey', 'RowLabel', 'RowType', ...colKeys];
    const rows = rowMeta.map((row) => {
      const rowNode = row.node;
      const rowKey = keyById[rowNode.id] || '';
      const rowLabel = rowNode.label || rowNode.autoLabel || rowNode.id || '';
      const rowType = NODE_META[rowNode.type]?.label || rowNode.type || '';
      const cells = orderedNodes.map((colNode) => {
        const cellEdges = edgeMap.get(`${rowNode.id}::${colNode.id}`) || [];
        if (!cellEdges.length) return '';
        const summary = summarizeCellEdges(cellEdges);
        return summary?.symbol || '';
      });
      return [rowKey, rowLabel, rowType, ...cells];
    });

    const lines = [header, ...rows].map((row) => row
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(',')
    );
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dsm.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>DSM Analysis</div>
        <div style={{ fontSize: 12, color: '#475569' }}>
          Nodes are grouped by type. Columns use alphabetical keys; rows show key plus label.
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#334155' }}>
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          Nodes: {orderedNodes.length}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, color: '#475569' }}>
          Legend: symbol shows edge type. Tooltip shows full details (e.g., 1 o • {'->'} t).
          Symbols: o plain, ^ threshold, x decided, ? other
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
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
          Export DSM CSV
        </button>
      </div>

      <div style={{ fontSize: 10, color: '#475569' }}>
        Keys: {orderedNodes.map((n) => `${keyById[n.id]} = ${n.label || n.autoLabel || n.id}`).join(', ')}
      </div>

      <div style={{ overflow: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', maxHeight: '70vh' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: typeColWidth }} />
            <col style={{ width: rowLabelWidth }} />
            {orderedNodes.map((n) => (
              <col key={`colw_${n.id}`} style={{ width: cellSize }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 4, background: cornerBg, borderBottom: '1px solid #94A3B8', borderRight: '1px solid #94A3B8', boxShadow: 'inset 0 -1px #94A3B8' }} />
              <th style={{ position: 'sticky', top: 0, left: typeColWidth, zIndex: 4, background: cornerBg, borderBottom: '1px solid #94A3B8', borderRight: '1px solid #94A3B8', boxShadow: 'inset 0 -1px #94A3B8' }} />
              {orderedNodes.map((n) => (
                <th
                  key={`col_${n.id}`}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 3,
                    background: headerBg,
                    borderBottom: '1px solid #94A3B8',
                    borderRight: '1px solid #94A3B8',
                    boxShadow: 'inset 0 -1px #94A3B8',
                    padding: '2px 2px',
                    width: cellSize,
                    minWidth: cellSize,
                    maxWidth: cellSize,
                    height: cellSize,
                    textAlign: 'center',
                    fontWeight: 700,
                    color: '#1F2937',
                  }}
                  title={n.label || n.autoLabel || n.id}
                >
                  {keyById[n.id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowMeta.map((row, rowIdx) => {
              const rowNode = row.node;
              const showLabel = true;
              const typeCellStyle = {
                position: 'sticky',
                left: 0,
                zIndex: 3,
                background: rowHeaderBg,
                borderRight: '1px solid #94A3B8',
                borderBottom: '1px solid #94A3B8',
                borderTop: '1px solid #94A3B8',
                padding: 0,
                width: typeColWidth,
                minWidth: typeColWidth,
                maxWidth: typeColWidth,
                textAlign: 'center',
                fontWeight: 700,
                color: '#1F2937',
                overflow: 'hidden',
                verticalAlign: 'middle',
              };
              const rowIsInterest = rowNode.type === 'input' && rowNode.isOfInterest;
              return (
                <tr key={`row_${rowNode.id}`}>
                  <th style={typeCellStyle}>
                    {showLabel ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: typeColWidth,
                          height: cellSize,
                        }}
                        title={row.typeLabel}
                      >
                        <div style={{ transform: 'scale(0.55)', filter: rowIsInterest && rowNode.type === 'input' ? 'sepia(1) saturate(3) hue-rotate(5deg)' : 'none' }}>
                          <PaletteIcon type={typeIconKey(row.typeKey)} />
                        </div>
                      </div>
                    ) : null}
                  </th>
                  <th
                    style={{
                      position: 'sticky',
                      left: typeColWidth,
                      zIndex: 2,
                      background: rowHeaderBg,
                      borderRight: '1px solid #94A3B8',
                      borderBottom: '1px solid #94A3B8',
                      padding: '2px 4px',
                      width: rowLabelWidth,
                      minWidth: rowLabelWidth,
                      maxWidth: rowLabelWidth,
                      height: cellSize,
                      textAlign: 'left',
                      fontWeight: 700,
                      color: '#1F2937',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={rowNode.label || rowNode.autoLabel || rowNode.id}
                  >
                    {keyById[rowNode.id]} - {rowNode.label || rowNode.autoLabel || rowNode.id}
                  </th>
                  {orderedNodes.map((colNode, colIdx) => {
                    const cellEdges = edgeMap.get(`${rowNode.id}::${colNode.id}`) || [];
                    const hasEdge = cellEdges.length > 0;
                    const summary = summarizeCellEdges(cellEdges);
                    const isDiag = rowIdx === colIdx;
                    const cellStyle = {
                      borderBottom: '1px solid #E2E8F0',
                      borderRight: '1px solid #E2E8F0',
                      padding: 0,
                      width: cellSize,
                      minWidth: cellSize,
                      maxWidth: cellSize,
                      height: cellSize,
                      verticalAlign: 'middle',
                      background: isDiag ? diagBg : (hasEdge ? '#EFF6FF' : '#fff'),
                      color: hasEdge ? '#1E3A8A' : '#94A3B8',
                      lineHeight: 1,
                      textAlign: 'center',
                      fontWeight: 700,
                    };
                    return (
                      <td
                        key={`cell_${rowIdx}_${colIdx}`}
                        style={cellStyle}
                        title={summary?.title || ''}
                      >
                        {hasEdge ? summary?.symbol : '-'}
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
}
