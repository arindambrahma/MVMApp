import React, { useMemo, useState, useEffect } from 'react';
import { NODE_META } from '../constants/nodeTypes';
import { sanitize } from '../utils/helpers';
import { validateFormula } from '../utils/formulaValidator';
import { getDecisionThresholdRefs } from '../utils/preAnalysisPreview';
import { validateFunction } from '../utils/api';
import { parseCalculationFunction } from '../utils/calcFunctionParser';
import { resolveEdgeSignalValue } from '../utils/edgeSignal';

function Field({ label, value, placeholder, multiline, onChange, type }) {
  const inputStyle = {
    padding: '6px 8px',
    border: '1px solid #D1D5DB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <label style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      marginBottom: 12,
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={3}
          value={value || ''}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      ) : (
        <input
          type={type || 'text'}
          value={value || ''}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </label>
  );
}

function FormulaField({ label, value, placeholder, onChange, availableVars }) {
  const validation = useMemo(
    () => value ? validateFormula(value, availableVars) : null,
    [value, availableVars]
  );

  const borderColor = !value ? '#D1D5DB'
    : validation?.valid ? '#22C55E'
    : '#EF4444';

  return (
    <label style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      marginBottom: 12,
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {label}
        {value && (
          <span style={{
            marginLeft: 6,
            color: validation?.valid ? '#22C55E' : '#EF4444',
            fontSize: 12,
          }}>
            {validation?.valid ? '\u2713' : '\u2717'}
          </span>
        )}
      </span>
      <input
        type="text"
        value={value || ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '6px 8px',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 6,
          fontSize: 12,
          fontFamily: "'Consolas', 'Monaco', monospace",
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
      {value && validation && !validation.valid && (
        <span style={{ fontSize: 10, color: '#EF4444', marginTop: 2 }}>
          {validation.error}
        </span>
      )}
    </label>
  );
}

function AvailableInputs({ varNames }) {
  if (varNames.length === 0) {
    return (
      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12, fontStyle: 'italic' }}>
        No incoming edges — connect inputs to this node first
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        display: 'block',
        marginBottom: 4,
      }}>
        Available Inputs
      </span>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
      }}>
        {varNames.map(v => (
          <code key={v} style={{
            fontSize: 11,
            background: '#E2E8F0',
            padding: '2px 6px',
            borderRadius: 4,
            color: '#334155',
            fontFamily: "'Consolas', 'Monaco', monospace",
          }}>
            {v}
          </code>
        ))}
      </div>
    </div>
  );
}

function PropertyPanel({
  node, cluster, nodes, edges, clusters, previewParamValues,
  onUpdateNode, onUpdateCluster, onDeleteCluster, onDeleteNode,
}) {
  // Check for duplicate label among other nodes
  const isDuplicateLabel = useMemo(() => {
    if (!node || !nodes || !node.label) return false;
    return nodes.some(n => n.id !== node.id && n.label === node.label);
  }, [node, nodes]);

  // Compute available input variable names for the selected node
  const availableVars = useMemo(() => {
    if (!node || !nodes || !edges) return [];
    const incomingEdges = edges.filter(e => e.to === node.id);
    return incomingEdges.map(e => {
      const srcNode = nodes.find(n => n.id === e.from);
      if (!srcNode) return null;
      if (node.type === 'calcFunction') {
        return sanitize(e.toPort || e.fromPort || srcNode.label);
      }
      return sanitize(e.fromPort || srcNode.label);
    }).filter(Boolean);
  }, [node, nodes, edges]);
  const nodeById = useMemo(
    () => Object.fromEntries((nodes || []).map(n => [n.id, n])),
    [nodes]
  );

  const parsedCalcFunction = useMemo(() => {
    if (!node || node.type !== 'calcFunction') return null;
    return parseCalculationFunction(node.functionCode || '');
  }, [node]);

  const [validationState, setValidationState] = useState({ status: 'idle', message: '' });
  const [validationOutputs, setValidationOutputs] = useState(node?.validationOutputs || null);

  useEffect(() => {
    setValidationOutputs(node?.validationOutputs || null);
  }, [node?.validationOutputs]);

  useEffect(() => {
    setValidationState({ status: 'idle', message: '' });
  }, [node?.functionCode]);

  const missingCalcFunctionInputs = useMemo(() => {
    if (!node || node.type !== 'calcFunction' || !parsedCalcFunction?.valid) return [];
    return parsedCalcFunction.params.filter((p) => !availableVars.includes(p));
  }, [node, parsedCalcFunction, availableVars]);

  const canValidateCalc = Boolean(parsedCalcFunction?.valid);

  const handleValidateFunction = async () => {
    if (!node || node.type !== 'calcFunction' || !parsedCalcFunction?.valid) return;
    const payload = {};
    for (const p of parsedCalcFunction.params) {
      const val = previewParamValues?.[p];
      if (!Number.isFinite(val)) {
        setValidationState({ status: 'error', message: `No value for ${p}` });
        return;
      }
      payload[p] = val;
    }
    setValidationState({ status: 'pending', message: 'Validating function…' });
    try {
      const outputs = await validateFunction(
        node.functionCode,
        payload,
        node.rootSelectionPolicy || 'min'
      );
      update('validationOutputs', outputs);
      setValidationOutputs(outputs);
      const summary = Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join(', ');
      setValidationState({ status: 'success', message: summary });
    } catch (err) {
      setValidationState({ status: 'error', message: err.message });
    }
  };

  const decisionThresholdRefs = useMemo(() => {
    if (!node || node.type !== 'decision') return [];
    return getDecisionThresholdRefs(nodes, edges, node.id, previewParamValues);
  }, [node, nodes, edges, previewParamValues]);

  const decisionValue = useMemo(() => {
    if (!node || node.type !== 'decision') return null;
    const key = `${sanitize(node.label)}_D`;
    const v = Number(previewParamValues?.[key]);
    return Number.isFinite(v) ? v : null;
  }, [node, previewParamValues]);

  const decisionViolations = useMemo(() => {
    if (!node || node.type !== 'decision') return [];
    if (!Number.isFinite(decisionValue)) return [];
    return decisionThresholdRefs.filter((ref) => {
      const t = Number(ref.thresholdValue);
      return Number.isFinite(t) && decisionValue < t;
    });
  }, [node, decisionValue, decisionThresholdRefs]);
  const probeDisplay = useMemo(() => {
    if (!node || node.type !== 'probe') return null;
    const edge = node.probeEdgeId ? (edges || []).find(e => e.id === node.probeEdgeId) : null;
    if (!edge) return { attached: false, value: null, runtimeName: '' };
    const sig = resolveEdgeSignalValue(edge, nodeById, previewParamValues);
    return { attached: true, ...sig };
  }, [node, edges, nodeById, previewParamValues]);

  if (!node && !cluster) {
    return (
      <div style={{
        flex: 1,
        padding: '20px 16px',
        background: '#F9FAFB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94A3B8',
        fontSize: 13,
      }}>
        Select a node to edit
      </div>
    );
  }

  if (cluster && !node) {
    const clusterNodes = (nodes || []).filter(n => n.clusterId === cluster.id);
    const isMember = (nid) => clusterNodes.some(n => n.id === nid);
    const grouped = (nodes || []).reduce((acc, n) => {
      if (!acc[n.type]) acc[n.type] = [];
      acc[n.type].push(n);
      return acc;
    }, {});
    const orderedTypes = ['input', 'calc', 'calcFunction', 'decision', 'margin', 'performance'];
    return (
      <div style={{
        flex: 1,
        padding: '16px',
        background: '#F9FAFB',
        overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid #E2E8F0',
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: '#64748B',
          }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>
            Subsystem Box
          </span>
        </div>

        <Field
          label="Subsystem Name"
          value={cluster.label}
          placeholder="e.g. Section_Conrod"
          onChange={v => onUpdateCluster({ ...cluster, label: v })}
        />

        <Field
          label="Description"
          value={cluster.description}
          placeholder="Optional notes for this subsystem..."
          multiline
          onChange={v => onUpdateCluster({ ...cluster, description: v })}
        />

        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#64748B',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8,
        }}>
          Elements in Subsystem
        </div>
        <div style={{
          border: '1px solid #E2E8F0',
          borderRadius: 6,
          background: '#FFFFFF',
          padding: '8px 10px',
          marginBottom: 12,
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          {orderedTypes.map((t) => {
            const list = grouped[t] || [];
            if (list.length === 0) return null;
            return (
              <div key={t} style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  marginBottom: 4,
                }}>
                  {NODE_META[t]?.label || t}
                </div>
                {list.map((n) => (
                  <label key={n.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '3px 0',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: '#334155',
                  }}>
                    <input
                      type="checkbox"
                      checked={isMember(n.id)}
                      onChange={(e) => {
                        const nextClusterId = e.target.checked ? cluster.id : null;
                        onUpdateNode({ ...n, clusterId: nextClusterId });
                      }}
                    />
                    <span>{n.label || n.id}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.45 }}>
          Assigned elements: {clusterNodes.length}. Box size auto-adjusts to fit assigned elements.
        </div>

        <button
          onClick={() => onDeleteCluster(cluster.id)}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '8px',
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: 6,
            color: '#DC2626',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Delete Subsystem
        </button>
      </div>
    );
  }

  const meta = NODE_META[node.type];

  const update = (key, value) => {
    onUpdateNode({ ...node, [key]: value });
  };

  const showFormula = node.type === 'calc' || node.type === 'performance';
  const showCalcFunction = node.type === 'calcFunction';

  return (
    <div style={{
      flex: 1,
      padding: '16px',
      background: '#F9FAFB',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid #E2E8F0',
      }}>
        <div style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: meta.stroke === '#DC2626' ? '#DC2626' : '#333',
          border: `2px solid ${meta.stroke}`,
        }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>
          {meta.label}
        </span>
      </div>

      {/* Common fields */}
      <Field
        label="Label / Name"
        value={node.label}
        placeholder="e.g. Belt Speed"
        onChange={v => update('label', v)}
      />
      {isDuplicateLabel && (
        <div style={{
          fontSize: 11,
          color: '#B45309',
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: 5,
          padding: '5px 8px',
          marginTop: -8,
          marginBottom: 10,
        }}>
          ⚠ Label &ldquo;{node.label}&rdquo; is already used — labels must be unique for correct analysis.
        </div>
      )}

      <Field
        label="Description"
        value={node.description}
        placeholder="What this node represents..."
        multiline
        onChange={v => update('description', v)}
      />

      <label style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        marginBottom: 12,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#64748B',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
          Subsystem
        </span>
        <select
          value={node.clusterId || ''}
          onChange={e => update('clusterId', e.target.value || null)}
          style={{
            padding: '6px 8px',
            border: '1px solid #D1D5DB',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'inherit',
            width: '100%',
            boxSizing: 'border-box',
            background: '#fff',
          }}
        >
          <option value="">None</option>
          {(clusters || []).map(c => (
            <option key={c.id} value={c.id}>{c.label || c.id}</option>
          ))}
        </select>
      </label>

      {/* Type-specific fields */}
      {(node.type === 'input' || node.type === 'performance') && (
        <Field
          label="Unit"
          value={node.unit}
          placeholder="e.g. kW, Nm, m/s"
          onChange={v => update('unit', v)}
        />
      )}

      {node.type === 'input' && (
        <Field
          label="Value"
          value={node.value}
          placeholder="e.g. 27.25"
          onChange={v => update('value', v)}
        />
      )}

      {/* Available inputs for calc/performance/calculation function nodes */}
      {(showFormula || showCalcFunction) && (
        <AvailableInputs varNames={availableVars} />
      )}

      {/* Calc/performance equation with validation */}
      {showFormula && (
        <FormulaField
          label="Equation / Formula"
          value={node.equation}
          placeholder={node.type === 'performance' ? 'e.g. E1 + E2' : 'e.g. P_A / eta_i'}
          onChange={v => update('equation', v)}
          availableVars={availableVars}
        />
      )}

      {showCalcFunction && (
        <>
          <Field
            label="Python Function"
            value={node.functionCode}
            placeholder={'def calc(P_A, eta_i):\n    return P_A / eta_i'}
            multiline
            onChange={v => update('functionCode', v)}
          />
          <label style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            marginBottom: 12,
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#64748B',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              Root Selection Policy
            </span>
            <select
              value={node.rootSelectionPolicy || 'min'}
              onChange={e => update('rootSelectionPolicy', e.target.value)}
              style={{
                padding: '6px 8px',
                border: '1px solid #D1D5DB',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'inherit',
                width: '100%',
                boxSizing: 'border-box',
                background: '#fff',
              }}
            >
              <option value="min">Smallest positive real root</option>
              <option value="max">Largest positive real root</option>
              <option value="first">First positive real root</option>
            </select>
            <span style={{ fontSize: 10, color: '#64748B' }}>
              Used when a function output is an array/vector (e.g. numpy roots).
            </span>
          </label>
          {node.functionCode && parsedCalcFunction && !parsedCalcFunction.valid && (
            <div style={{
              fontSize: 11,
              color: '#B91C1C',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 5,
              padding: '6px 8px',
              marginTop: -6,
              marginBottom: 10,
              lineHeight: 1.4,
            }}>
              {parsedCalcFunction.error}
            </div>
          )}
          {validationState.message && (
            <div style={{
              fontSize: 11,
              color: validationState.status === 'error' ? '#B91C1C' : '#075985',
              marginBottom: 10,
            }}>
              {validationState.status === 'pending' ? 'Validating…' : validationState.message}
            </div>
          )}
          {validationOutputs && Object.keys(validationOutputs).length > 0 && (
            <div style={{
              border: '1px solid #E2E8F0',
              borderRadius: 6,
              padding: '8px 10px',
              background: '#ffffff',
              marginBottom: 12,
              fontSize: 11,
              color: '#334155',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Validation outputs</div>
              {Object.entries(validationOutputs).map(([key, value]) => (
                <div key={key} style={{ lineHeight: 1.4 }}>
                  {key}: {Number.isFinite(value) ? value : value}
                </div>
              ))}
            </div>
          )}
          {parsedCalcFunction?.valid && (
            <div style={{
              marginBottom: 12,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              borderRadius: 6,
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Parsed Signature
              </div>
              <div style={{ fontSize: 11, color: '#334155', marginBottom: 6 }}>
                {`${parsedCalcFunction.name}(${parsedCalcFunction.params.join(', ')})`}
              </div>
              <div style={{ fontSize: 11, color: '#334155', marginBottom: 6 }}>
                Outputs: <code>{(parsedCalcFunction.outputs || ['out']).join(', ')}</code>
              </div>
              {(parsedCalcFunction.outputs || []).length > 1 && (
                <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.45, marginBottom: 6 }}>
                  Multiple outputs are visualized as separate right-side pins.
                </div>
              )}
              {missingCalcFunctionInputs.length > 0 && (
                <div style={{ fontSize: 11, color: '#B45309', lineHeight: 1.45 }}>
                  Missing connected inputs: {missingCalcFunctionInputs.join(', ')}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Decision node fields */}
      {node.type === 'decision' && (
        <>
          <Field
            label="Decided Value"
            value={node.decidedValue}
            placeholder="e.g. 30.0 (catalogue selected value)"
            onChange={v => update('decidedValue', v)}
          />
          {decisionViolations.length > 0 && (
            <div style={{
              fontSize: 11,
              color: '#B91C1C',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 5,
              padding: '6px 8px',
              marginTop: -6,
              marginBottom: 10,
              lineHeight: 1.4,
            }}>
              {`Decision must be greater than or equal to threshold. Violations: ${decisionViolations.map(v => v.marginLabel).join(', ')}`}
            </div>
          )}
          {decisionThresholdRefs.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12, fontStyle: 'italic', lineHeight: 1.5 }}>
              Connect this decision to a margin node to show threshold reference values.
            </div>
          ) : (
            <div style={{
              marginBottom: 12,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              borderRadius: 6,
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Threshold Reference (Rule: Decision &gt;= Threshold)
              </div>
              {decisionThresholdRefs.map(ref => {
                const t = Number(ref.thresholdValue);
                const hasThreshold = Number.isFinite(t);
                const hasDecision = Number.isFinite(decisionValue);
                const violated = hasThreshold && hasDecision && decisionValue < t;
                return (
                  <div key={ref.marginId} style={{
                    fontSize: 11,
                    lineHeight: 1.45,
                    marginBottom: 5,
                    color: violated ? '#B91C1C' : '#334155',
                  }}>
                    {`${ref.marginLabel}: ${ref.thresholdSourceLabel || 'Threshold source'} = ${hasThreshold ? t : '(unresolved)'}`}
                    {ref.thresholdRuntimeName ? `  [${ref.thresholdRuntimeName}]` : ''}
                    {hasDecision && hasThreshold ? ` | decided=${decisionValue}` : ''}
                    {violated ? '  [must increase decision value]' : ''}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Input of interest toggle */}
      {node.type === 'input' && (
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={node.isOfInterest || false}
            onChange={e => update('isOfInterest', e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: '#334155' }}>
            Input parameter of interest
          </span>
          </label>
        )}
      {node.type === 'probe' && (
        <div style={{
          marginBottom: 12,
          padding: '10px',
          border: '1px dashed #CBD5E1',
          borderRadius: 6,
          background: '#FFF',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Probe attachment</div>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
            {probeDisplay?.attached ? 'Attached to arrow' : 'Not attached (click connector, then click arrow)'}
          </div>
          {probeDisplay?.attached && (
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>
              Signal: <code>{probeDisplay.runtimeName || '(unknown)'}</code>
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Probe value</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {probeDisplay?.attached
              ? (Number.isFinite(probeDisplay?.value) ? String(probeDisplay.value) : 'n/a')
              : 'Attach to arrow'}
          </div>
        </div>
      )}

      {/* Node actions */}
      <div style={{
        marginTop: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {showCalcFunction && (
          <button
            type="button"
            disabled={!canValidateCalc}
            onClick={handleValidateFunction}
            style={{
              width: '100%',
              padding: '8px',
              background: canValidateCalc ? '#E0F2FE' : '#F1F5F9',
              border: '1px solid #7DD3FC',
              borderRadius: 6,
              color: '#0F172A',
              cursor: canValidateCalc ? 'pointer' : 'not-allowed',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Validate Function
          </button>
        )}
        <button
          type="button"
          onClick={() => onDeleteNode(node.id)}
          style={{
            width: '100%',
            padding: '8px',
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: 6,
            color: '#DC2626',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Delete Node
        </button>
      </div>
    </div>
  );
}

export default PropertyPanel;

