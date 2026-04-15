import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProbabilisticMarginAnalysis.css';

const TABS = [
  { id: 'dependencies', label: 'Dependencies', step: 1 },
  { id: 'likelihood',   label: 'Likelihood',   step: 2 },
  { id: 'impact',       label: 'Impact',       step: 3 },
  { id: 'results',      label: 'Results',      step: 4, results: true },
];

const EMPTY_DSM = () => ({
  elements: [],
  dependency: [],   // n×n boolean
  likelihood: [],   // n×n [0..1]
  impact: [],       // n×n [0..1]
});

function growMatrices(dsm, atIdx) {
  // Insert a new row and column at atIdx (defaults: false / 0)
  const n = dsm.elements.length;
  const insertRow = (mat, fill) => {
    for (let i = 0; i < n; i++) mat[i].splice(atIdx, 0, fill);
    mat.splice(atIdx, 0, new Array(n + 1).fill(fill));
  };
  insertRow(dsm.dependency, false);
  insertRow(dsm.likelihood, 0);
  insertRow(dsm.impact, 0);
}

function shrinkMatrices(dsm, idx) {
  dsm.dependency.splice(idx, 1);
  dsm.dependency.forEach(r => r.splice(idx, 1));
  dsm.likelihood.splice(idx, 1);
  dsm.likelihood.forEach(r => r.splice(idx, 1));
  dsm.impact.splice(idx, 1);
  dsm.impact.forEach(r => r.splice(idx, 1));
}

function moveInMatrix(dsm, from, to) {
  const move = (arr) => {
    const item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
  };
  move(dsm.elements);
  [dsm.dependency, dsm.likelihood, dsm.impact].forEach(mat => {
    move(mat);
    for (let i = 0; i < dsm.elements.length; i++) move(mat[i]);
  });
}

function cloneDsm(dsm) {
  return {
    elements: [...dsm.elements],
    dependency: dsm.dependency.map(r => [...r]),
    likelihood: dsm.likelihood.map(r => [...r]),
    impact: dsm.impact.map(r => [...r]),
  };
}

export default function ProbabilisticMarginAnalysis() {
  const navigate = useNavigate();
  const [dsm, setDsm] = useState(EMPTY_DSM);
  const [activeTab, setActiveTab] = useState('dependencies');
  const [selectedRow, setSelectedRow] = useState(-1);
  const [symmetric, setSymmetric] = useState(false);
  const [instigator, setInstigator] = useState('column'); // 'column' | 'row'
  const [depth, setDepth] = useState(4);
  const [defaultL, setDefaultL] = useState('0.5');
  const [defaultI, setDefaultI] = useState('0.5');
  const [elementCounter, setElementCounter] = useState(0);

  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const dragFromIdx = useRef(-1);

  const n = dsm.elements.length;

  const depCount = useMemo(() => {
    let c = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (i !== j && dsm.dependency[i]?.[j]) c++;
    return c;
  }, [dsm, n]);

  /* ---------- Element CRUD ---------- */

  const addElement = useCallback((name) => {
    setDsm(prev => {
      const next = cloneDsm(prev);
      let label = name;
      if (!label || !label.trim()) {
        label = `Element ${elementCounter + 1}`;
        setElementCounter(c => c + 1);
      }
      const idx = next.elements.length;
      next.elements.splice(idx, 0, label);
      growMatrices(next, idx);
      return next;
    });
  }, [elementCounter]);

  const removeElement = useCallback((idx) => {
    setDsm(prev => {
      const next = cloneDsm(prev);
      next.elements.splice(idx, 1);
      shrinkMatrices(next, idx);
      return next;
    });
    setSelectedRow(prev => {
      if (prev === idx) return -1;
      if (prev > idx) return prev - 1;
      return prev;
    });
  }, []);

  const renameElement = useCallback((idx, name) => {
    setDsm(prev => {
      const next = cloneDsm(prev);
      next.elements[idx] = name;
      return next;
    });
  }, []);

  const reorderElement = useCallback((from, to) => {
    if (from === to || to < 0) return;
    setDsm(prev => {
      const next = cloneDsm(prev);
      if (to >= next.elements.length) return prev;
      moveInMatrix(next, from, to);
      return next;
    });
    setSelectedRow(to);
  }, []);

  const clearAll = useCallback(() => {
    setDsm(EMPTY_DSM());
    setSelectedRow(-1);
    setResult(null);
    setError(null);
    setElementCounter(0);
  }, []);

  const loadExample = useCallback(() => {
    // Simple 5-element toy system (Clarkson-style).
    const labels = ['Engine', 'Gearbox', 'Chassis', 'Electronics', 'Cooling'];
    const L = [
      [0,   0.6, 0.3, 0.5, 0.8],
      [0.5, 0,   0.4, 0.2, 0.3],
      [0.4, 0.6, 0,   0.1, 0.2],
      [0.3, 0.2, 0.1, 0,   0.4],
      [0.7, 0.2, 0.2, 0.3, 0  ],
    ];
    const I = [
      [0,   0.7, 0.5, 0.4, 0.6],
      [0.6, 0,   0.5, 0.2, 0.3],
      [0.5, 0.5, 0,   0.1, 0.2],
      [0.3, 0.2, 0.1, 0,   0.4],
      [0.5, 0.2, 0.2, 0.3, 0  ],
    ];
    const dep = L.map(row => row.map(v => v > 0));
    setDsm({
      elements: labels,
      dependency: dep,
      likelihood: L.map(r => [...r]),
      impact: I.map(r => [...r]),
    });
    setElementCounter(labels.length);
    setResult(null);
    setError(null);
  }, []);

  /* ---------- Cell edits ---------- */

  const toggleDependency = useCallback((r, c) => {
    if (r === c) return;
    setDsm(prev => {
      const next = cloneDsm(prev);
      const val = !next.dependency[r][c];
      next.dependency[r][c] = val;
      if (!val) {
        next.likelihood[r][c] = 0;
        next.impact[r][c] = 0;
      }
      if (symmetric) {
        next.dependency[c][r] = val;
        if (!val) {
          next.likelihood[c][r] = 0;
          next.impact[c][r] = 0;
        }
      }
      return next;
    });
  }, [symmetric]);

  const setCellValue = useCallback((which, r, c, value) => {
    setDsm(prev => {
      const next = cloneDsm(prev);
      next[which][r][c] = value;
      return next;
    });
  }, []);

  const applyDefaultsToMarked = useCallback(() => {
    const lDefault = parseFloat(defaultL);
    const iDefault = parseFloat(defaultI);
    const hasL = Number.isFinite(lDefault);
    const hasI = Number.isFinite(iDefault);
    if (!hasL && !hasI) return;
    setDsm(prev => {
      const next = cloneDsm(prev);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j || !next.dependency[i][j]) continue;
          if (hasL && next.likelihood[i][j] === 0) next.likelihood[i][j] = lDefault;
          if (hasI && next.impact[i][j] === 0) next.impact[i][j] = iDefault;
        }
      }
      return next;
    });
  }, [defaultL, defaultI, n]);

  /* ---------- Run CPM ---------- */

  const runCpm = useCallback(async () => {
    if (n < 2) {
      setError('Need at least 2 elements');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/pma/run-cpm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elements: dsm.elements,
          likelihood: dsm.likelihood,
          impact: dsm.impact,
          depth: Number(depth) || 4,
          instigator,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult(data);
      setActiveTab('results');
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [dsm, n, depth, instigator]);

  /* ---------- Keyboard escape ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedRow(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- Render helpers ---------- */

  const renderMatrixTable = () => {
    if (n === 0) {
      return (
        <div className="pma-empty" onClick={() => addElement()}>
          <p>Click <strong>"+ Add Element"</strong> in the left panel to build your DSM.</p>
          <p>You can also click here to add a new element, or <button type="button" className="pma-empty-link" onClick={(e) => { e.stopPropagation(); loadExample(); }}>load the example</button>.</p>
        </div>
      );
    }

    const tab = activeTab;
    const showValues = tab === 'likelihood' || tab === 'impact';
    const valueKey = tab;
    const matrix = showValues ? dsm[valueKey] : dsm.dependency;

    return (
      <table className="pma-table">
        <thead>
          <tr>
            <th className="pma-sn-col">#</th>
            <th className="pma-corner">Element</th>
            <th className="pma-action-col"></th>
            {dsm.elements.map((_, j) => (
              <th key={j} className="pma-col-header" title={`${j + 1}. ${dsm.elements[j]}`}>{j + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dsm.elements.map((el, i) => (
            <tr
              key={i}
              className={`pma-row ${i === selectedRow ? 'pma-selected' : ''}`}
              data-row={i}
              draggable={tab === 'dependencies'}
              onClick={(e) => {
                if (e.target.closest('.pma-cell-input') || e.target.closest('.pma-btn-remove') || e.target.closest('.pma-dep-cell')) return;
                setSelectedRow(i);
              }}
              onDragStart={(e) => {
                dragFromIdx.current = i;
                e.dataTransfer.effectAllowed = 'move';
                e.currentTarget.classList.add('pma-dragging');
              }}
              onDragEnd={(e) => {
                dragFromIdx.current = -1;
                e.currentTarget.classList.remove('pma-dragging');
                document.querySelectorAll('.pma-drop-above, .pma-drop-below').forEach(el => el.classList.remove('pma-drop-above', 'pma-drop-below'));
              }}
              onDragOver={(e) => {
                if (tab !== 'dependencies' || dragFromIdx.current < 0) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                document.querySelectorAll('.pma-drop-above, .pma-drop-below').forEach(el => el.classList.remove('pma-drop-above', 'pma-drop-below'));
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.classList.add(e.clientY < rect.top + rect.height / 2 ? 'pma-drop-above' : 'pma-drop-below');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('pma-drop-above', 'pma-drop-below');
              }}
              onDrop={(e) => {
                if (tab !== 'dependencies') return;
                e.preventDefault();
                e.currentTarget.classList.remove('pma-drop-above', 'pma-drop-below');
                const from = dragFromIdx.current;
                let to = i;
                if (from < 0 || from === to) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY >= midY && to < from) to++;
                else if (e.clientY < midY && to > from) to--;
                reorderElement(from, to);
              }}
            >
              <td className="pma-sn-cell">{i + 1}</td>
              <td className="pma-row-header" title={el}>
                {tab === 'dependencies' && (
                  <span className="pma-drag-handle" title="Drag to reorder">&#9776;</span>
                )}
                <span
                  className="pma-element-name"
                  onDoubleClick={() => {
                    const newName = window.prompt('Rename element:', el);
                    if (newName && newName.trim()) renameElement(i, newName.trim());
                  }}
                >
                  {el}
                </span>
              </td>
              <td className="pma-action-col">
                <button
                  type="button"
                  className="pma-btn-remove"
                  title="Remove"
                  onClick={(e) => { e.stopPropagation(); removeElement(i); }}
                >&times;</button>
              </td>
              {dsm.elements.map((__, j) => {
                if (i === j) {
                  return <td key={j} className="pma-diagonal"></td>;
                }
                if (tab === 'dependencies') {
                  const dep = dsm.dependency[i][j];
                  return (
                    <td
                      key={j}
                      className={`pma-dep-cell ${dep ? 'pma-dep-active' : ''}`}
                      title={`${dsm.elements[i]} \u2192 ${dsm.elements[j]}`}
                      onClick={(e) => { e.stopPropagation(); toggleDependency(i, j); }}
                    >
                      {dep ? '✓' : ''}
                    </td>
                  );
                }
                // likelihood / impact
                if (!dsm.dependency[i][j]) {
                  return <td key={j} className="pma-no-dep-cell"></td>;
                }
                const val = matrix[i][j];
                const display = val === 0 ? '' : val;
                return (
                  <td key={j} className="pma-value-cell">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="pma-cell-input"
                      value={display}
                      placeholder="0-1"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        // Keep the typed value in DOM; commit on blur
                        e.target.dataset.typed = e.target.value;
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === '') {
                          setCellValue(valueKey, i, j, 0);
                          return;
                        }
                        const num = parseFloat(raw);
                        if (!Number.isFinite(num) || num < 0 || num > 1) {
                          e.target.classList.add('pma-input-error');
                          e.target.title = 'Value must be between 0 and 1';
                          return;
                        }
                        e.target.classList.remove('pma-input-error');
                        e.target.title = '';
                        const v = Math.round(num * 1000) / 1000;
                        setCellValue(valueKey, i, j, v);
                      }}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderResultsTable = (matrix, title, accent) => {
    if (!matrix || matrix.length === 0) return null;
    // Colour-scale 0..max (fallback 1)
    let max = 0;
    for (const row of matrix) for (const v of row) if (v > max) max = v;
    if (max === 0) max = 1;
    const colorFor = (v) => {
      if (v === 0) return 'transparent';
      const t = Math.min(1, v / max);
      const alpha = 0.15 + 0.75 * t;
      return `rgba(${accent}, ${alpha.toFixed(3)})`;
    };
    return (
      <div className="pma-result-block">
        <h3>{title}</h3>
        <div className="pma-result-scroll">
          <table className="pma-table pma-result-table">
            <thead>
              <tr>
                <th className="pma-sn-col">#</th>
                <th className="pma-corner">Element</th>
                {dsm.elements.map((_, j) => (
                  <th key={j} className="pma-col-header">{j + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dsm.elements.map((el, i) => (
                <tr key={i}>
                  <td className="pma-sn-cell">{i + 1}</td>
                  <td className="pma-row-header" title={el}>
                    <span className="pma-element-name">{el}</span>
                  </td>
                  {dsm.elements.map((__, j) => {
                    if (i === j) return <td key={j} className="pma-diagonal"></td>;
                    const v = matrix[i][j];
                    return (
                      <td
                        key={j}
                        className="pma-result-cell"
                        style={{ background: colorFor(v) }}
                        title={`${el} \u2192 ${dsm.elements[j]}: ${v.toFixed(3)}`}
                      >
                        {v > 0 ? v.toFixed(2) : ''}
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
  };

  const renderResults = () => {
    if (!result) {
      return (
        <div className="pma-empty">
          <p>Run CPM to see propagation results.</p>
        </div>
      );
    }
    return (
      <div className="pma-results-layout">
        <div className="pma-result-summary">
          <span>Search depth: <strong>{result.depth}</strong></span>
          <span>Convention: <strong>{result.instigator === 'column' ? 'Column \u2192 Row' : 'Row \u2192 Column'}</strong></span>
          <span>Elements: <strong>{dsm.elements.length}</strong></span>
        </div>
        {renderResultsTable(result.combinedRisk, 'Combined Risk Matrix', '220, 38, 38')}
        {renderResultsTable(result.combinedLikelihood, 'Combined Likelihood Matrix', '37, 99, 235')}
        <div className="pma-result-block">
          <h3>Incoming vs Outgoing Risk</h3>
          <div className="pma-result-scroll">
            <table className="pma-table pma-result-table">
              <thead>
                <tr>
                  <th className="pma-sn-col">#</th>
                  <th className="pma-corner">Element</th>
                  <th className="pma-result-numcol">Incoming</th>
                  <th className="pma-result-numcol">Outgoing</th>
                </tr>
              </thead>
              <tbody>
                {dsm.elements.map((el, i) => (
                  <tr key={i}>
                    <td className="pma-sn-cell">{i + 1}</td>
                    <td className="pma-row-header" title={el}>
                      <span className="pma-element-name">{el}</span>
                    </td>
                    <td className="pma-result-numcol">{(result.incoming[i] || 0).toFixed(3)}</td>
                    <td className="pma-result-numcol">{(result.outgoing[i] || 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pma-app">
      <header className="pma-header">
        <div className="pma-header-left">
          <button type="button" className="pma-home-btn" onClick={() => navigate('/')} title="Back to MARVIN home">&larr;</button>
          <h1 className="pma-title">MARVIN &middot; Probabilistic Margin Analysis</h1>
          <span className="pma-subtitle">Phase 1 &mdash; Clarkson Change Propagation Method</span>
        </div>
        <div className="pma-header-right">
          <label>Depth</label>
          <input
            type="number"
            min="1"
            max="10"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          />
          <button
            type="button"
            className="pma-btn-run"
            onClick={runCpm}
            disabled={running || n < 2}
          >
            {running ? 'Running…' : '\u25B6 Run CPM'}
          </button>
        </div>
      </header>

      <div className="pma-main-layout">
        <aside className="pma-tools-panel">
          <div className="pma-panel-section">
            <h3 className="pma-panel-heading">Example</h3>
            <button type="button" className="pma-panel-btn pma-panel-btn-accent" onClick={loadExample}>Load Example</button>
            <button type="button" className="pma-panel-btn" onClick={clearAll}>Clear All</button>
          </div>
          <div className="pma-panel-section">
            <h3 className="pma-panel-heading">DSM Elements</h3>
            <button type="button" className="pma-panel-btn" onClick={() => addElement()}>+ Add Element</button>
          </div>
          <div className="pma-panel-section">
            <h3 className="pma-panel-heading">Options</h3>
            <label className="pma-panel-checkbox">
              <input
                type="checkbox"
                checked={symmetric}
                onChange={(e) => setSymmetric(e.target.checked)}
              />
              <span>Symmetric DSM</span>
            </label>
            <div className="pma-panel-radio-group">
              <div className="pma-panel-radio-title">Dependency Convention</div>
              <label className="pma-panel-radio">
                <input
                  type="radio"
                  name="pma-instigator"
                  value="column"
                  checked={instigator === 'column'}
                  onChange={() => setInstigator('column')}
                />
                <span>Column &rarr; Row</span>
              </label>
              <label className="pma-panel-radio">
                <input
                  type="radio"
                  name="pma-instigator"
                  value="row"
                  checked={instigator === 'row'}
                  onChange={() => setInstigator('row')}
                />
                <span>Row &rarr; Column</span>
              </label>
            </div>
          </div>
          <div className="pma-panel-section">
            <h3 className="pma-panel-heading">Default Values</h3>
            <div className="pma-panel-field">
              <label>Likelihood (L)</label>
              <input
                type="text"
                inputMode="decimal"
                value={defaultL}
                onChange={(e) => setDefaultL(e.target.value)}
                placeholder="e.g. 0.5"
              />
            </div>
            <div className="pma-panel-field">
              <label>Impact (I)</label>
              <input
                type="text"
                inputMode="decimal"
                value={defaultI}
                onChange={(e) => setDefaultI(e.target.value)}
                placeholder="e.g. 0.5"
              />
            </div>
            <button type="button" className="pma-panel-btn" onClick={applyDefaultsToMarked}>
              Apply to marked
            </button>
          </div>
        </aside>

        <main className="pma-main-content">
          <div className="pma-step-tabs">
            {TABS.map(t => {
              if (t.results && !result) return null;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`pma-tab-btn ${activeTab === t.id ? 'pma-active' : ''} ${t.results ? 'pma-tab-results' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  <span className="pma-step-num">{t.step}</span> {t.label}
                </button>
              );
            })}
            <span className="pma-dep-count">{depCount} dependencies</span>
          </div>

          {error && <div className="pma-error">{error}</div>}

          <div className="pma-tab-content">
            {activeTab === 'results' ? renderResults() : (
              <div className="pma-dsm-container">
                <div className="pma-dsm-wrapper">
                  {renderMatrixTable()}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <div className="pma-footer">
        <span className="pma-footer-title">MARVIN &mdash; Probabilistic Margin Analysis</span>
        <span className="pma-footer-copy">
          &copy; {new Date().getFullYear()} Arindam Brahma &nbsp;&middot;&nbsp; Clarkson CPM via cpm-lib
        </span>
      </div>
    </div>
  );
}
