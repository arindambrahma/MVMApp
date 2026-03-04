import React, { useMemo } from 'react';
import { sanitize } from '../utils/helpers';

function PreAnalysisModal({
  nodes,
  onToggleInterest,
  onClose,
  analysisWeights,
  onChangeWeights,
}) {
  const inputNodes = nodes.filter(n => n.type === 'input');
  const performanceNodes = nodes.filter(n => n.type === 'performance');

  const inputWeightNodes = useMemo(() => {
    const marked = inputNodes.filter(n => n.isOfInterest);
    return marked.length > 0 ? marked : inputNodes;
  }, [inputNodes]);

  const perfWeightNodes = useMemo(() => performanceNodes, [performanceNodes]);

  const readWeight = (kind, key) => {
    const v = Number((analysisWeights?.[kind] || {})[key]);
    return Number.isFinite(v) ? String(v) : '1';
  };

  const updateWeight = (kind, key, raw) => {
    const trimmed = String(raw || '').trim();
    const next = { ...(analysisWeights || {}), [kind]: { ...(analysisWeights?.[kind] || {}) } };
    if (trimmed === '') {
      delete next[kind][key];
      onChangeWeights(next);
      return;
    }
    const v = Number(trimmed);
    if (Number.isFinite(v) && v >= 0) {
      next[kind][key] = v;
      onChangeWeights(next);
    }
  };

  const applyEqualWeights = (kind, nodesList) => {
    const next = { ...(analysisWeights || {}), [kind]: { ...(analysisWeights?.[kind] || {}) } };
    for (const n of nodesList) next[kind][sanitize(n.label)] = 1;
    onChangeWeights(next);
  };

  const normalizeWeights = (kind, nodesList) => {
    if (!nodesList.length) return;
    const keys = nodesList.map(n => sanitize(n.label));
    const vals = keys.map(k => {
      const v = Number((analysisWeights?.[kind] || {})[k]);
      return Number.isFinite(v) && v >= 0 ? v : 1;
    });
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) return;
    const next = { ...(analysisWeights || {}), [kind]: { ...(analysisWeights?.[kind] || {}) } };
    keys.forEach((k, idx) => { next[kind][k] = vals[idx] / sum; });
    onChangeWeights(next);
  };

  const resetWeights = (kind, nodesList) => {
    const next = { ...(analysisWeights || {}), [kind]: { ...(analysisWeights?.[kind] || {}) } };
    for (const n of nodesList) delete next[kind][sanitize(n.label)];
    onChangeWeights(next);
  };

  const sectionTitleStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 12,
    fontWeight: 700,
    color: '#334155',
    marginBottom: 8,
    marginTop: 12,
  };

  const smallBtn = {
    border: '1px solid #CBD5E1',
    background: '#fff',
    borderRadius: 6,
    padding: '4px 7px',
    fontSize: 10,
    color: '#475569',
    cursor: 'pointer',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12,
        width: 420, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '14px 20px', borderBottom: '1px solid #E5E7EB',
        }}>
          <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>Pre-Analysis Settings</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6B7280',
          }}>
            ×
          </button>
        </div>

        {/* Description */}
        <div style={{ padding: '12px 20px', fontSize: 12, color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>
          Mark which input parameters are <strong>of interest</strong> for deterioration analysis.
          Marked inputs will appear orange on the diagram.
          Weighted sensitivity uses these equations from the manuscript:
          {' '}<code>Impact_m = sum(Impact_mj * Wj)/sum(Wj)</code>{' '}
          and{' '}
          <code>Absorption_m = sum(Absorption_im * Li)/sum(Li)</code>.
        </div>

        {/* Settings + input list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
          <div style={sectionTitleStyle}>
            <span>Performance Weights (Wj)</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn} onClick={() => applyEqualWeights('perf', perfWeightNodes)}>Equal</button>
              <button style={smallBtn} onClick={() => normalizeWeights('perf', perfWeightNodes)}>Normalize</button>
              <button style={smallBtn} onClick={() => resetWeights('perf', perfWeightNodes)}>Reset</button>
            </div>
          </div>
          {perfWeightNodes.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8, fontStyle: 'italic' }}>
              No performance nodes in the diagram.
            </div>
          ) : (
            perfWeightNodes.map((node) => {
              const key = sanitize(node.label);
              return (
                <div key={`perf_${node.id}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  borderBottom: '1px solid #F8FAFC',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{node.label}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8' }}><code>{key}</code></div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={readWeight('perf', key)}
                    onChange={(e) => updateWeight('perf', key, e.target.value)}
                    style={{
                      width: 92,
                      padding: '5px 7px',
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                </div>
              );
            })
          )}

          <div style={sectionTitleStyle}>
            <span>Input Weights (Li)</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtn} onClick={() => applyEqualWeights('input', inputWeightNodes)}>Equal</button>
              <button style={smallBtn} onClick={() => normalizeWeights('input', inputWeightNodes)}>Normalize</button>
              <button style={smallBtn} onClick={() => resetWeights('input', inputWeightNodes)}>Reset</button>
            </div>
          </div>
          {inputWeightNodes.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8, fontStyle: 'italic' }}>
              No input nodes in the diagram.
            </div>
          ) : (
            inputWeightNodes.map((node) => {
              const key = sanitize(node.label);
              return (
                <div key={`inp_${node.id}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  borderBottom: '1px solid #F8FAFC',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{node.label}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8' }}><code>{key}</code></div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={readWeight('input', key)}
                    onChange={(e) => updateWeight('input', key, e.target.value)}
                    style={{
                      width: 92,
                      padding: '5px 7px',
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                </div>
              );
            })
          )}

          <div style={{ height: 1, background: '#E5E7EB', margin: '12px 0 8px' }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
            Inputs of Interest
          </div>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
            Mark inputs used for deterioration and `Li` weighting scope.
          </div>
          {inputNodes.length === 0 ? (
            <div style={{ padding: '10px 0', color: '#94A3B8', textAlign: 'center', fontSize: 13 }}>
              No input parameter nodes in the diagram yet.
            </div>
          ) : (
            inputNodes.map(node => (
              <label
                key={node.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid #F1F5F9',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={node.isOfInterest || false}
                  onChange={() => onToggleInterest(node.id)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {node.label}
                  </div>
                  {node.description && (
                    <div style={{ fontSize: 11, color: '#64748B' }}>{node.description}</div>
                  )}
                  {node.value && (
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>
                      Value: {node.value}{node.unit ? ` ${node.unit}` : ''}
                    </div>
                  )}
                </div>
                {node.isOfInterest && (
                  <div style={{
                    marginLeft: 'auto',
                    width: 10, height: 10,
                    borderRadius: 2,
                    background: '#F59E0B',
                  }} />
                )}
              </label>
            ))
          )}
        </div>

        {/* Close */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB' }}>
          <button onClick={onClose} style={{
            width: '100%', padding: '8px',
            background: '#1E293B', color: '#fff',
            border: 'none', borderRadius: 6,
            cursor: 'pointer', fontWeight: 600,
          }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default PreAnalysisModal;
