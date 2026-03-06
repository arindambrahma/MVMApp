import React, { useEffect, useMemo, useState } from 'react';

function downloadBlob(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmt(v, decimals) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  return n.toFixed(decimals);
}

function fmtPct(v, decimals) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  return `${(n * 100).toFixed(decimals)}%`;
}

function matrixToRows(matrixObj = {}, decimals = 4) {
  const rows = [];
  const margins = Object.keys(matrixObj || {});
  for (const margin of margins) {
    const cols = matrixObj[margin] || {};
    for (const [k, v] of Object.entries(cols)) {
      rows.push({ margin, key: k, value: fmt(v, decimals), valueRaw: Number(v) });
    }
  }
  return rows;
}

function ReportTable({ title, columns = [], rows = [] }) {
  return (
    <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0', fontSize: 11, fontWeight: 700, color: '#475569' }}>
        {title}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
              {columns.map((c) => (
                <th key={`${title}_${c.key}`} style={{ textAlign: c.align || 'left', padding: '6px 8px', color: '#64748B' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '8px', color: '#94A3B8', fontStyle: 'italic' }}>
                  No data.
                </td>
              </tr>
            ) : rows.map((r, idx) => (
              <tr key={`${title}_row_${idx}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                {columns.map((c) => (
                  <td key={`${title}_${idx}_${c.key}`} style={{ textAlign: c.align || 'left', padding: '6px 8px', color: '#334155' }}>
                    {r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportingModule({
  analysisResult,
  analysisError,
  appliedWeights = {},
  nodes = [],
  edges = [],
  reportCharts = [],
}) {
  const [title, setTitle] = useState('Margin Value Analysis Report');
  const [author, setAuthor] = useState('');
  const [decimals, setDecimals] = useState(4);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeWeights, setIncludeWeights] = useState(true);
  const [includeExcess, setIncludeExcess] = useState(true);
  const [includeWeighted, setIncludeWeighted] = useState(true);
  const [includeDeterioration, setIncludeDeterioration] = useState(true);
  const [includeImpactMatrix, setIncludeImpactMatrix] = useState(true);
  const [includeAbsorptionMatrix, setIncludeAbsorptionMatrix] = useState(true);
  const [includeUtilisationMatrix, setIncludeUtilisationMatrix] = useState(false);
  const [includePlot, setIncludePlot] = useState(true);
  // Per-chart inclusion toggles: { [id]: boolean }. New charts default to true (included).
  const [chartToggles, setChartToggles] = useState({});
  useEffect(() => {
    setChartToggles(prev => {
      let changed = false;
      const next = { ...prev };
      for (const c of reportCharts) {
        if (!(c.id in next)) { next[c.id] = true; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [reportCharts]);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const result = analysisResult?.result || {};
  const margins = Object.keys(result.excess || {});
  const hasData = Boolean(analysisResult?.result);

  const excessRows = useMemo(
    () => margins.map((m) => ({ margin: m, excess: fmtPct(result.excess?.[m], 2) })),
    [margins, result]
  );

  const weightedRows = useMemo(
    () => margins.map((m) => ({
      margin: m,
      impact: fmtPct(result.weighted_impact?.[m], 2),
      absorption: fmtPct(result.weighted_absorption?.[m], 2),
    })),
    [margins, result]
  );

  const deteriorationRows = useMemo(
    () => Object.entries(result.deterioration || {}).map(([k, v]) => ({ input: k, deterioration: fmtPct(v, 2) })),
    [result]
  );

  const impactMatrixRows = useMemo(
    () => matrixToRows(result.impact_matrix, decimals),
    [result, decimals]
  );

  const absorptionMatrixRows = useMemo(
    () => matrixToRows(result.absorption_matrix, decimals),
    [result, decimals]
  );

  const utilisationMatrixRows = useMemo(
    () => matrixToRows(result.utilisation_matrix, decimals),
    [result, decimals]
  );

  const exportPayload = useMemo(() => {
    const payload = {
      metadata: {
        title,
        author,
        generatedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
    };
    if (includeSummary) payload.summary = result.summary || '';
    if (includeWeights) payload.weights = appliedWeights || {};
    if (includeExcess) payload.excess = result.excess || {};
    if (includeWeighted) {
      payload.weighted_impact = result.weighted_impact || {};
      payload.weighted_absorption = result.weighted_absorption || {};
    }
    if (includeDeterioration) payload.deterioration = result.deterioration || {};
    if (includeImpactMatrix) payload.impact_matrix = result.impact_matrix || {};
    if (includeAbsorptionMatrix) payload.absorption_matrix = result.absorption_matrix || {};
    if (includeUtilisationMatrix) payload.utilisation_matrix = result.utilisation_matrix || {};
    if (includePlot && analysisResult?.plot) payload.plot_base64_png = analysisResult.plot;
    const includedCharts = reportCharts.filter(c => chartToggles[c.id] ?? true);
    if (includedCharts.length) {
      payload.analysis_charts = includedCharts.map(c => ({
        label: c.label,
        data_url: c.dataUrl,
        tables: c.tables || [],
      }));
    }
    return payload;
  }, [
    analysisResult,
    appliedWeights,
    author,
    chartToggles,
    edges.length,
    includeAbsorptionMatrix,
    includeDeterioration,
    includeExcess,
    includeImpactMatrix,
    includePlot,
    includeSummary,
    includeUtilisationMatrix,
    includeWeighted,
    includeWeights,
    nodes.length,
    reportCharts,
    result,
    title,
  ]);

  const exportJson = () => {
    const text = JSON.stringify(exportPayload, null, 2);
    downloadBlob('mvm_report.json', 'application/json;charset=utf-8', text);
  };

  const exportCsv = () => {
    const lines = [];
    lines.push('section,key1,key2,value');
    if (includeExcess) {
      for (const [m, v] of Object.entries(result.excess || {})) {
        lines.push(`excess,${m},,${Number(v)}`);
      }
    }
    if (includeWeighted) {
      for (const [m, v] of Object.entries(result.weighted_impact || {})) {
        lines.push(`weighted_impact,${m},,${Number(v)}`);
      }
      for (const [m, v] of Object.entries(result.weighted_absorption || {})) {
        lines.push(`weighted_absorption,${m},,${Number(v)}`);
      }
    }
    if (includeDeterioration) {
      for (const [i, v] of Object.entries(result.deterioration || {})) {
        lines.push(`deterioration,${i},,${Number(v)}`);
      }
    }
    if (includeImpactMatrix) {
      for (const [m, cols] of Object.entries(result.impact_matrix || {})) {
        for (const [p, v] of Object.entries(cols || {})) {
          lines.push(`impact_matrix,${m},${p},${Number(v)}`);
        }
      }
    }
    if (includeAbsorptionMatrix) {
      for (const [m, cols] of Object.entries(result.absorption_matrix || {})) {
        for (const [i, v] of Object.entries(cols || {})) {
          lines.push(`absorption_matrix,${m},${i},${Number(v)}`);
        }
      }
    }
    if (includeUtilisationMatrix) {
      for (const [m, cols] of Object.entries(result.utilisation_matrix || {})) {
        for (const [i, v] of Object.entries(cols || {})) {
          lines.push(`utilisation_matrix,${m},${i},${Number(v)}`);
        }
      }
    }
    downloadBlob('mvm_report.csv', 'text/csv;charset=utf-8', lines.join('\n'));
  };

  const buildHtml = () => {
    const esc = (s) => String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const tableHtml = (caption, headers, rows) => `
      <h3>${esc(caption)}</h3>
      <table>
        <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length ? rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">No data</td></tr>`}
        </tbody>
      </table>
    `;
    const img = includePlot && analysisResult?.plot
      ? `<h3>Margin Value Plot</h3><img alt="MVM plot" src="data:image/png;base64,${analysisResult.plot}" style="max-width:100%;border:1px solid #ddd;border-radius:8px;" />`
      : '';
    const chartsHtml = reportCharts
      .filter(c => chartToggles[c.id] ?? true)
      .map(c => [
        `<h3>${esc(c.label)}</h3>`,
        `<img alt="${esc(c.label)}" src="${c.dataUrl}" style="max-width:100%;border:1px solid #ddd;border-radius:8px;" />`,
        ...(c.tables || []).map(t => tableHtml(t.caption, t.headers, t.rows)),
      ].join(''))
      .join('');
    return `
<!doctype html>
<html><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
  h1, h2, h3 { margin: 0 0 10px; }
  .meta { color: #4b5563; margin-bottom: 14px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
  th { background: #f9fafb; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; white-space: pre-wrap; }
</style></head><body>
  <h1>${esc(title)}</h1>
  <div class="meta">Author: ${esc(author || 'n/a')} | Generated: ${esc(new Date().toLocaleString())}</div>
  ${includeSummary ? `<h2>Summary</h2><pre>${esc(result.summary || '')}</pre>` : ''}
  ${includeExcess ? tableHtml('Local Excess', ['Margin', 'Excess'], excessRows.map((r) => [r.margin, r.excess])) : ''}
  ${includeWeighted ? tableHtml('Weighted Metrics', ['Margin', 'Weighted Impact', 'Weighted Absorption'], weightedRows.map((r) => [r.margin, r.impact, r.absorption])) : ''}
  ${includeDeterioration ? tableHtml('Deterioration', ['Input', 'Deterioration'], deteriorationRows.map((r) => [r.input, r.deterioration])) : ''}
  ${includeImpactMatrix ? tableHtml('Impact Matrix', ['Margin', 'Performance/Input', 'Value'], impactMatrixRows.map((r) => [r.margin, r.key, r.value])) : ''}
  ${includeAbsorptionMatrix ? tableHtml('Absorption Matrix', ['Margin', 'Performance/Input', 'Value'], absorptionMatrixRows.map((r) => [r.margin, r.key, r.value])) : ''}
  ${includeUtilisationMatrix ? tableHtml('Utilisation Matrix', ['Margin', 'Performance/Input', 'Value'], utilisationMatrixRows.map((r) => [r.margin, r.key, r.value])) : ''}
  ${img}
  ${chartsHtml}
</body></html>`;
  };

  const exportHtml = () => {
    downloadBlob('mvm_report.html', 'text/html;charset=utf-8', buildHtml());
  };

  const printReport = () => {
    const win = window.open('', '_blank', 'width=1100,height=900');
    if (!win) return;
    win.document.write(buildHtml());
    win.document.close();
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        // no-op: browser popup/print policies vary
      }
    }, 120);
  };

  if (analysisError) {
    return (
      <div style={{ flex: 1, background: '#F9FAFB', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 10px' }}>
          {analysisError}
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div style={{ flex: 1, background: '#F9FAFB', alignItems: 'center', justifyContent: 'center', display: 'flex', color: '#94A3B8', fontSize: 12, fontStyle: 'italic' }}>
        Run MVM analysis first to open Reporting.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ width: 320, minWidth: 320, background: '#F1F5F9', borderRight: '1px solid #E2E8F0', padding: '14px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>
          Report Settings
        </div>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Report title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Author</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Numeric decimals</span>
          <input type="number" min="1" max="8" value={decimals} onChange={(e) => setDecimals(Math.max(1, Math.min(8, Number(e.target.value) || 4)))} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #CBD5E1', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
        </label>

        <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Include Sections</div>
          {[
            ['Summary text', includeSummary, setIncludeSummary],
            ['Applied weights', includeWeights, setIncludeWeights],
            ['Local excess', includeExcess, setIncludeExcess],
            ['Weighted metrics', includeWeighted, setIncludeWeighted],
            ['Deterioration', includeDeterioration, setIncludeDeterioration],
            ['Impact matrix', includeImpactMatrix, setIncludeImpactMatrix],
            ['Absorption matrix', includeAbsorptionMatrix, setIncludeAbsorptionMatrix],
            ['Utilisation matrix', includeUtilisationMatrix, setIncludeUtilisationMatrix],
            ['Plot image', includePlot, setIncludePlot],
          ].map(([label, val, setter]) => (
            <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#334155', marginBottom: 5 }}>
              <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} />
              <span>{label}</span>
            </label>
          ))}
          {reportCharts.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, marginBottom: 3, fontStyle: 'italic' }}>Analysis charts</div>
              {reportCharts.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#334155', marginBottom: 5 }}>
                  <input
                    type="checkbox"
                    checked={chartToggles[c.id] ?? true}
                    onChange={(e) => setChartToggles(prev => ({ ...prev, [c.id]: e.target.checked }))}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }} title={c.label}>{c.label}</span>
                </label>
              ))}
            </>
          )}
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          <button type="button" onClick={exportJson} style={{ border: '1px solid #93C5FD', background: '#EFF6FF', color: '#1E3A8A', borderRadius: 7, padding: '7px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Export JSON
          </button>
          <button type="button" onClick={exportCsv} style={{ border: '1px solid #93C5FD', background: '#EFF6FF', color: '#1E3A8A', borderRadius: 7, padding: '7px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Export CSV
          </button>
          <button type="button" onClick={exportHtml} style={{ border: '1px solid #93C5FD', background: '#EFF6FF', color: '#1E3A8A', borderRadius: 7, padding: '7px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Export HTML
          </button>
          <button type="button" onClick={printReport} style={{ border: '1px solid #10B981', background: '#ECFDF5', color: '#065F46', borderRadius: 7, padding: '7px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Print / Save PDF
          </button>
        </div>
      </div>

      <div style={{ flex: 1, background: '#F9FAFB', overflowY: 'auto', padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
          Author: {author || 'n/a'} | Generated: {new Date(nowIso).toLocaleString()}
        </div>

        {includeSummary && (
          <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Summary</div>
            <pre style={{ margin: 0, fontSize: 11, color: '#334155', whiteSpace: 'pre-wrap' }}>{result.summary || 'No summary available.'}</pre>
          </div>
        )}

        {includeExcess && (
          <ReportTable
            title="Local Excess"
            columns={[{ key: 'margin', label: 'Margin' }, { key: 'excess', label: 'Excess', align: 'right' }]}
            rows={excessRows}
          />
        )}
        {includeWeighted && (
          <ReportTable
            title="Weighted Metrics"
            columns={[
              { key: 'margin', label: 'Margin' },
              { key: 'impact', label: 'Weighted Impact', align: 'right' },
              { key: 'absorption', label: 'Weighted Absorption', align: 'right' },
            ]}
            rows={weightedRows}
          />
        )}
        {includeDeterioration && (
          <ReportTable
            title="Deterioration"
            columns={[{ key: 'input', label: 'Input' }, { key: 'deterioration', label: 'Deterioration', align: 'right' }]}
            rows={deteriorationRows}
          />
        )}
        {includeImpactMatrix && (
          <ReportTable
            title="Impact Matrix"
            columns={[{ key: 'margin', label: 'Margin' }, { key: 'key', label: 'Performance/Input' }, { key: 'value', label: 'Value', align: 'right' }]}
            rows={impactMatrixRows}
          />
        )}
        {includeAbsorptionMatrix && (
          <ReportTable
            title="Absorption Matrix"
            columns={[{ key: 'margin', label: 'Margin' }, { key: 'key', label: 'Performance/Input' }, { key: 'value', label: 'Value', align: 'right' }]}
            rows={absorptionMatrixRows}
          />
        )}
        {includeUtilisationMatrix && (
          <ReportTable
            title="Utilisation Matrix"
            columns={[{ key: 'margin', label: 'Margin' }, { key: 'key', label: 'Performance/Input' }, { key: 'value', label: 'Value', align: 'right' }]}
            rows={utilisationMatrixRows}
          />
        )}
        {includeWeights && (
          <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Applied Weights</div>
            <pre style={{ margin: 0, fontSize: 11, color: '#334155', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(appliedWeights || {}, null, 2)}
            </pre>
          </div>
        )}
        {includePlot && analysisResult?.plot && (
          <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Margin Value Plot</div>
            <img alt="MVM Plot" src={`data:image/png;base64,${analysisResult.plot}`} style={{ maxWidth: '100%', border: '1px solid #E2E8F0', borderRadius: 6 }} />
          </div>
        )}
        {reportCharts.filter(c => chartToggles[c.id] ?? true).map(c => (
          <div key={c.id} style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{c.label}</div>
            <img alt={c.label} src={c.dataUrl} style={{ maxWidth: '100%', border: '1px solid #E2E8F0', borderRadius: 6 }} />
            {(c.tables || []).map((t, ti) => (
              <ReportTable
                key={ti}
                title={t.caption}
                columns={t.headers.map((h, i) => ({ key: String(i), label: h, align: i === 0 ? 'left' : 'right' }))}
                rows={t.rows.map(r => Object.fromEntries(r.map((v, i) => [String(i), v])))}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ReportingModule;
