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
  // Use matrix size (old DSM size), not elements length after insertion.
  const n = dsm.dependency.length;
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

const PLOTLY_SRC = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
const DOMAIN_COLOR = '#2563EB';
const RISK_COLOR_SCALE = ['#2E7D32', '#66BB6A', '#A5D6A7', '#FEE08B', '#F46D43', '#C62828'];

function buildCombinedImpactMatrix(riskMatrix, probMatrix) {
  if (!riskMatrix || !probMatrix) return [];
  const n = riskMatrix.length;
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  const epsilon = 1e-6;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const p = probMatrix[i]?.[j] ?? 0;
      const r = riskMatrix[i]?.[j] ?? 0;
      if (p > 0) out[i][j] = Math.max(0, Math.min(1, r / (p + epsilon)));
    }
  }
  return out;
}

function computeDirectRisk(likelihoodMatrix, impactMatrix, instigator = 'column') {
  const n = likelihoodMatrix.length;
  const incoming = new Array(n).fill(0);
  const outgoing = new Array(n).fill(0);
  const inCount = new Array(n).fill(0);
  const outCount = new Array(n).fill(0);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (row === col) continue;
      const L = likelihoodMatrix[row]?.[col] ?? 0;
      const I = impactMatrix[row]?.[col] ?? 0;
      if (L > 0 && I > 0) {
        const v = L * I;
        if (instigator === 'column') {
          outgoing[col] += v; outCount[col] += 1;
          incoming[row] += v; inCount[row] += 1;
        } else {
          outgoing[row] += v; outCount[row] += 1;
          incoming[col] += v; inCount[col] += 1;
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    outgoing[i] = outCount[i] ? outgoing[i] / outCount[i] : 0;
    incoming[i] = inCount[i] ? incoming[i] / inCount[i] : 0;
  }
  return { incoming, outgoing };
}

function buildOutgoingAdjacency(likelihoodMatrix, instigator = 'column') {
  const n = likelihoodMatrix.length;
  const adj = Array.from({ length: n }, () => []);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (r === c) continue;
      const w = likelihoodMatrix[r]?.[c] ?? 0;
      if (w > 0) {
        if (instigator === 'row') adj[r].push({ to: c, weight: w });
        else adj[c].push({ to: r, weight: w });
      }
    }
  }
  return adj;
}

function computeShortestLevels(adj, root) {
  const n = adj.length;
  const level = new Array(n).fill(Infinity);
  const q = [];
  level[root] = 0;
  q.push(root);
  while (q.length) {
    const u = q.shift();
    for (const e of adj[u]) {
      if (level[e.to] > level[u] + 1) {
        level[e.to] = level[u] + 1;
        q.push(e.to);
      }
    }
  }
  return level;
}

function computeWeightedBetweennessCentrality(likelihoodMatrix, valueMatrix, instigator = 'column') {
  const n = likelihoodMatrix.length;
  const adj = Array.from({ length: n }, () => []);
  const eps = 1e-6;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const l = likelihoodMatrix[i]?.[j] ?? 0;
      const v = valueMatrix[i]?.[j] ?? 0;
      if (l > 0 && v > 0) {
        const len = 1 / (v + eps);
        if (instigator === 'row') adj[i].push({ to: j, len });
        else adj[j].push({ to: i, len });
      }
    }
  }
  const centrality = new Array(n).fill(0);
  const tol = 1e-9;
  for (let s = 0; s < n; s++) {
    const stack = [];
    const pred = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0);
    const dist = new Array(n).fill(Infinity);
    const used = new Array(n).fill(false);
    sigma[s] = 1;
    dist[s] = 0;
    for (let k = 0; k < n; k++) {
      let v = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!used[i] && dist[i] < best) {
          best = dist[i];
          v = i;
        }
      }
      if (v < 0 || !Number.isFinite(best)) break;
      used[v] = true;
      stack.push(v);
      for (const e of adj[v]) {
        const w = e.to;
        const alt = dist[v] + e.len;
        if (alt + tol < dist[w]) {
          dist[w] = alt;
          sigma[w] = sigma[v];
          pred[w] = [v];
        } else if (Math.abs(alt - dist[w]) <= tol) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }
    const delta = new Array(n).fill(0);
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred[w]) {
        if (sigma[w] > 0) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s) centrality[w] += delta[w];
    }
  }
  return centrality;
}

function parseUnitInterval(raw) {
  const normalized = String(raw ?? '').trim().replace(',', '.');
  if (normalized === '') return { ok: false, empty: true, value: null };
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(normalized)) {
    return { ok: false, empty: false, value: null };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return { ok: false, empty: false, value: null };
  }
  return { ok: true, empty: false, value };
}

function parseNonNegative(raw) {
  const normalized = String(raw ?? '').trim().replace(',', '.');
  if (normalized === '') return { ok: false, empty: true, value: null };
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return { ok: false, empty: false, value: null };
  return { ok: true, empty: false, value };
}

function getMaxMatrixValue(matrix) {
  if (!matrix?.length) return 0;
  let maxVal = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      if (i === j) continue;
      const v = matrix[i][j];
      if (Number.isFinite(v) && v > maxVal) maxVal = v;
    }
  }
  return maxVal;
}

function valueToRiskColor(value, maxValue) {
  if (!Number.isFinite(value) || value <= 0 || maxValue <= 0) return '#CBD5E1';
  const t = Math.min(1, Math.max(0, value / maxValue));
  const idx = Math.min(RISK_COLOR_SCALE.length - 1, Math.floor(t * (RISK_COLOR_SCALE.length - 1)));
  return RISK_COLOR_SCALE[idx];
}

export default function ProbabilisticMarginAnalysis() {
  const navigate = useNavigate();
  const [dsm, setDsm] = useState(EMPTY_DSM);
  const [activeTab, setActiveTab] = useState('dependencies');
  const [selectedRow, setSelectedRow] = useState(-1);
  const [symmetric, setSymmetric] = useState(false);
  const [instigator, setInstigator] = useState('column'); // 'column' | 'row'
  const [depth, setDepth] = useState(4);
  const [analysisMode, setAnalysisMode] = useState('classic'); // 'classic' | 'margin_aware'
  const [nSamples, setNSamples] = useState('400');
  const [delta0, setDelta0] = useState('1.0');
  const [defaultMargin, setDefaultMargin] = useState('0');
  const [margins, setMargins] = useState([]);
  const [defaultL, setDefaultL] = useState('0.5');
  const [defaultI, setDefaultI] = useState('0.5');
  const elementCounterRef = useRef(0);

  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [plotlyReady, setPlotlyReady] = useState(false);
  const [vizRoot, setVizRoot] = useState(0);
  const [edgeMetric, setEdgeMetric] = useState('risk');
  const [matrixView, setMatrixView] = useState('color');
  const [matrixMetric, setMatrixMetric] = useState('risk');
  const [scatterScale, setScatterScale] = useState('fixed');
  const [showDirectOverlay, setShowDirectOverlay] = useState(false);

  const dragFromIdx = useRef(-1);
  const scatterRef = useRef(null);
  const distanceRef = useRef(null);
  const riskNetworkRef = useRef(null);
  const treeRef = useRef(null);
  const centralityRef = useRef(null);
  const treemapRef = useRef(null);

  const n = dsm.elements.length;

  const depCount = useMemo(() => {
    let c = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (i !== j && dsm.dependency[i]?.[j]) c++;
    return c;
  }, [dsm, n]);

  useEffect(() => {
    setMargins((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(0);
      if (next.length > n) next.length = n;
      return next;
    });
  }, [n]);

  /* ---------- Element CRUD ---------- */

  const addElement = useCallback((name) => {
    const parsedDefaultMargin = parseNonNegative(defaultMargin);
    const marginValue = parsedDefaultMargin.ok ? parsedDefaultMargin.value : 0;
    setDsm(prev => {
      const next = cloneDsm(prev);
      let label = name;
      if (!label || !label.trim()) {
        elementCounterRef.current += 1;
        label = `Element ${elementCounterRef.current}`;
      }
      const idx = next.elements.length;
      next.elements.splice(idx, 0, label);
      growMatrices(next, idx);
      return next;
    });
    setMargins(prev => [...prev, marginValue]);
  }, [defaultMargin]);

  const removeElement = useCallback((idx) => {
    setDsm(prev => {
      const next = cloneDsm(prev);
      next.elements.splice(idx, 1);
      shrinkMatrices(next, idx);
      return next;
    });
    setMargins(prev => prev.filter((_, i) => i !== idx));
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
    setMargins(prev => {
      const next = [...prev];
      const moved = next.splice(from, 1)[0] ?? 0;
      next.splice(to, 0, moved);
      return next;
    });
    setSelectedRow(to);
  }, []);

  const clearAll = useCallback(() => {
    setDsm(EMPTY_DSM());
    setMargins([]);
    setSelectedRow(-1);
    setResult(null);
    setError(null);
    elementCounterRef.current = 0;
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
    setMargins(new Array(labels.length).fill(0));
    elementCounterRef.current = labels.length;
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
    const parsedL = parseUnitInterval(defaultL);
    const parsedI = parseUnitInterval(defaultI);
    const hasL = parsedL.ok;
    const hasI = parsedI.ok;
    if ((!parsedL.empty && !parsedL.ok) || (!parsedI.empty && !parsedI.ok)) {
      setError('Default values must be numbers between 0 and 1 (for decimals, both 0.5 and 0,5 are accepted).');
      return;
    }
    if (!hasL && !hasI) return;
    setError(null);
    const lDefault = parsedL.value;
    const iDefault = parsedI.value;
    setDsm(prev => {
      const next = cloneDsm(prev);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j || !next.dependency[i][j]) continue;
          if (hasL) next.likelihood[i][j] = lDefault;
          if (hasI) next.impact[i][j] = iDefault;
        }
      }
      return next;
    });
  }, [defaultL, defaultI, n]);

  const setMarginAt = useCallback((index, rawValue) => {
    const parsed = parseNonNegative(rawValue);
    if (!parsed.ok) return;
    setMargins(prev => {
      const next = [...prev];
      next[index] = Math.round(parsed.value * 1000000) / 1000000;
      return next;
    });
  }, []);

  const applyDefaultMarginToAll = useCallback(() => {
    const parsed = parseNonNegative(defaultMargin);
    if (!parsed.ok) {
      setError('Default margin must be a non-negative number.');
      return;
    }
    setError(null);
    const val = Math.round(parsed.value * 1000000) / 1000000;
    setMargins(new Array(n).fill(val));
  }, [defaultMargin, n]);

  /* ---------- Run CPM ---------- */

  const runCpm = useCallback(async () => {
    if (n < 2) {
      setError('Need at least 2 elements');
      return;
    }

    const payload = {
      elements: dsm.elements,
      likelihood: dsm.likelihood,
      impact: dsm.impact,
      depth: Number(depth) || 4,
      instigator,
      mode: analysisMode,
    };

    if (analysisMode === 'margin_aware') {
      const parsedSamples = Number.parseInt(String(nSamples), 10);
      if (!Number.isFinite(parsedSamples) || parsedSamples < 1) {
        setError('nSamples must be a positive integer.');
        return;
      }
      const parsedDelta = parseNonNegative(delta0);
      if (!parsedDelta.ok || parsedDelta.value <= 0) {
        setError('delta0 must be a positive number.');
        return;
      }
      payload.nSamples = parsedSamples;
      payload.delta0 = parsedDelta.value;
      payload.margins = margins.map((m) => {
        const parsed = parseNonNegative(m);
        return parsed.ok ? parsed.value : 0;
      });
    }

    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/pma/run-cpm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let data = null;
      if (raw && raw.trim()) {
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(`Backend returned non-JSON response (HTTP ${res.status}). Check backend server logs.`);
        }
      }
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}: backend request failed`);
      }
      if (!data || data.success === false) {
        throw new Error(data?.error || 'Backend returned an empty response. Make sure the backend is running on port 5001.');
      }
      setResult(data);
      setActiveTab('results');
    } catch (e) {
      const msg = e?.message || 'Failed to run CPM';
      if (msg.includes('Failed to fetch')) {
        setError('Cannot reach backend API. Start backend/app.py on http://127.0.0.1:5001 and retry.');
      } else {
        setError(msg);
      }
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [analysisMode, delta0, dsm, n, depth, instigator, margins, nSamples]);

  /* ---------- Keyboard escape ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedRow(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (window.Plotly) {
      setPlotlyReady(true);
      return;
    }
    const existing = document.querySelector(`script[src="${PLOTLY_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => setPlotlyReady(true), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = PLOTLY_SRC;
    script.async = true;
    script.onload = () => setPlotlyReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    setVizRoot(0);
  }, [result]);

  useEffect(() => {
    if (analysisMode === 'margin_aware') {
      setScatterScale('auto');
    }
  }, [analysisMode]);

  useEffect(() => {
    if (!plotlyReady || !window.Plotly || !result || activeTab !== 'results') return;

    const riskMatrix = result.combinedRisk || [];
    const probMatrix = result.combinedLikelihood || [];
    const impactMatrix = buildCombinedImpactMatrix(riskMatrix, probMatrix);
    const edgeMatrix = edgeMetric === 'likelihood' ? probMatrix : (edgeMetric === 'impact' ? impactMatrix : riskMatrix);
    const elem = dsm.elements;
    const nLocal = elem.length;
    const safeRoot = Math.min(Math.max(vizRoot, 0), Math.max(nLocal - 1, 0));
    const labels = elem.map((e, i) => `${i + 1}. ${e}`);
    const plotly = window.Plotly;

    if (scatterRef.current) {
      const incoming = result.incoming || [];
      const outgoing = result.outgoing || [];
      const scatterRisk = incoming.map((v, i) => (v || 0) + (outgoing[i] || 0));
      const maxScatterRisk = Math.max(...scatterRisk, 0);
      const traces = [{
        x: outgoing,
        y: incoming,
        text: labels,
        mode: 'markers+text',
        type: 'scatter',
        textposition: 'top center',
        textfont: { size: 9, color: '#475569' },
        marker: {
          color: scatterRisk,
          colorscale: [
            [0, '#2E7D32'],
            [0.2, '#66BB6A'],
            [0.4, '#A5D6A7'],
            [0.6, '#FEE08B'],
            [0.8, '#F46D43'],
            [1, '#C62828'],
          ],
          cmin: 0,
          cmax: maxScatterRisk > 0 ? maxScatterRisk : 1,
          size: 11,
          opacity: 0.9,
          line: { color: '#fff', width: 1 },
          colorbar: { title: 'Risk', thickness: 10 },
        },
        hovertemplate: '%{text}<br>Outgoing: %{x:.3f}<br>Incoming: %{y:.3f}<extra></extra>',
        name: 'Combined',
      }];
      if (showDirectOverlay) {
        const direct = computeDirectRisk(dsm.likelihood, dsm.impact, instigator);
        traces.push({
          x: direct.outgoing,
          y: direct.incoming,
          text: labels,
          mode: 'markers',
          type: 'scatter',
          marker: { color: '#94A3B8', symbol: 'circle-open', size: 9, line: { color: '#64748B', width: 1.2 } },
          hovertemplate: '%{text}<br>Direct Outgoing: %{x:.3f}<br>Direct Incoming: %{y:.3f}<extra></extra>',
          name: 'Direct (1-hop)',
        });
      }
      const allX = traces.flatMap(t => t.x || []).map(Number).filter(Number.isFinite);
      const allY = traces.flatMap(t => t.y || []).map(Number).filter(Number.isFinite);
      const minX = allX.length ? Math.min(...allX) : 0;
      const maxX = allX.length ? Math.max(...allX) : 1;
      const minY = allY.length ? Math.min(...allY) : 0;
      const maxY = allY.length ? Math.max(...allY) : 1;
      const xPad = Math.max((maxX - minX) * 0.1, 0.02);
      const yPad = Math.max((maxY - minY) * 0.1, 0.02);
      const autoX = [Math.max(0, minX - xPad), maxX + xPad];
      const autoY = [Math.max(0, minY - yPad), maxY + yPad];
      if (Math.abs(autoX[1] - autoX[0]) < 1e-6) { autoX[0] = Math.max(0, autoX[0] - 0.05); autoX[1] += 0.05; }
      if (Math.abs(autoY[1] - autoY[0]) < 1e-6) { autoY[0] = Math.max(0, autoY[0] - 0.05); autoY[1] += 0.05; }
      const validAutoX = Number.isFinite(autoX[0]) && Number.isFinite(autoX[1]) && autoX[1] > autoX[0];
      const validAutoY = Number.isFinite(autoY[0]) && Number.isFinite(autoY[1]) && autoY[1] > autoY[0];
      const xRange = scatterScale === 'auto' && validAutoX ? autoX : [0, 1.05];
      const yRange = scatterScale === 'auto' && validAutoY ? autoY : [0, 1.05];
      const xMid = (xRange[0] + xRange[1]) / 2;
      const yMid = (yRange[0] + yRange[1]) / 2;
      plotly.react(scatterRef.current, traces, {
        title: 'Risk: Incoming vs Outgoing Propagation',
        xaxis: {
          title: 'Average Outgoing Risk',
          range: xRange,
          showline: true,
          linecolor: '#334155',
          linewidth: 1.4,
          mirror: true,
          ticks: 'outside',
          tickcolor: '#334155',
          ticklen: 5,
          tickfont: { color: '#1E293B' },
          titlefont: { color: '#0F172A' },
          zeroline: false,
          showgrid: true,
          gridcolor: '#D1D5DB',
        },
        yaxis: {
          title: 'Average Incoming Risk',
          range: yRange,
          showline: true,
          linecolor: '#334155',
          linewidth: 1.4,
          mirror: true,
          ticks: 'outside',
          tickcolor: '#334155',
          ticklen: 5,
          tickfont: { color: '#1E293B' },
          titlefont: { color: '#0F172A' },
          zeroline: false,
          showgrid: true,
          gridcolor: '#D1D5DB',
        },
        shapes: [
          { type: 'line', x0: xMid, x1: xMid, y0: yRange[0], y1: yRange[1], line: { color: '#cbd5e1', width: 1, dash: 'dash' } },
          { type: 'line', x0: xRange[0], x1: xRange[1], y0: yMid, y1: yMid, line: { color: '#cbd5e1', width: 1, dash: 'dash' } },
        ],
        paper_bgcolor: '#FFFFFF',
        plot_bgcolor: '#FFFFFF',
        font: { color: '#0F172A' },
        margin: { t: 50, r: 20, b: 55, l: 65 },
        legend: { x: 1.01, y: 1 },
      }, { responsive: true });
    }

    const adj = buildOutgoingAdjacency(dsm.likelihood, instigator);
    const levels = computeShortestLevels(adj, safeRoot);
    const reachable = levels.map((v) => Number.isFinite(v));
    const maxLev = Math.max(...levels.filter(Number.isFinite), 0);

    const makeColoredEdgeTraces = (nodes, edges) => {
      const maxEdge = Math.max(...edges.map(e => e.riskVal || 0), 0);
      const buckets = Array.from({ length: RISK_COLOR_SCALE.length }, () => ({ x: [], y: [] }));
      for (const edge of edges) {
        const fromNode = nodes[edge.from];
        const toNode = nodes[edge.to];
        if (!fromNode || !toNode) continue;
        const val = edge.riskVal || 0;
        const t = maxEdge > 0 ? Math.min(1, val / maxEdge) : 0;
        const bucket = Math.min(RISK_COLOR_SCALE.length - 1, Math.floor(t * (RISK_COLOR_SCALE.length - 1)));
        buckets[bucket].x.push(fromNode.x, toNode.x, null);
        buckets[bucket].y.push(fromNode.y, toNode.y, null);
      }
      return buckets
        .map((b, i) => (b.x.length ? {
          x: b.x,
          y: b.y,
          mode: 'lines',
          type: 'scatter',
          line: { color: RISK_COLOR_SCALE[i], width: 1.1 + i * 0.15 },
          hoverinfo: 'skip',
          showlegend: false,
        } : null))
        .filter(Boolean);
    };

    const makeNodeTrace = (nodes, nodeRiskVals, maxNodeRisk) => ({
      x: nodes.map(nNode => nNode.x),
      y: nodes.map(nNode => nNode.y),
      mode: 'markers+text',
      type: 'scatter',
      text: nodes.map(nNode => `${nNode.id + 1}`),
      textposition: 'middle center',
      textfont: { size: 9 },
      customdata: nodes.map(nNode => `${nNode.id + 1}. ${elem[nNode.id]}`),
      hovertemplate: '%{customdata}<extra></extra>',
      marker: {
        color: nodes.map((nNode) => {
          if (nNode.unreachable) return '#CBD5E1';
          const v = nodeRiskVals?.[nNode.comp ?? nNode.id] || 0;
          return valueToRiskColor(v, maxNodeRisk);
        }),
        size: nodes.map(nNode => nNode.size || 12),
        opacity: nodes.map(nNode => nNode.unreachable ? 0.6 : 0.92),
        line: { color: '#fff', width: 1 },
      },
      showlegend: false,
    });

    const distanceNodes = [];
    for (let i = 0; i < nLocal; i++) {
      const lev = reachable[i] ? levels[i] : maxLev + 1;
      const sameLev = [];
      for (let j = 0; j < nLocal; j++) {
        const lj = reachable[j] ? levels[j] : maxLev + 1;
        if (lj === lev) sameLev.push(j);
      }
      const idx = sameLev.indexOf(i);
      const radius = Math.max(0.15, lev / Math.max(maxLev + 1, 1));
      const theta = (idx / Math.max(sameLev.length, 1)) * Math.PI * 2;
      distanceNodes.push({ id: i, x: radius * Math.cos(theta), y: radius * Math.sin(theta), unreachable: !reachable[i], size: i === safeRoot ? 18 : 12 });
    }
    const riskFromRoot = riskMatrix[safeRoot] || [];
    const distanceEdges = [];
    for (let u = 0; u < nLocal; u++) {
      for (const e of adj[u]) {
        if (reachable[u] && reachable[e.to]) distanceEdges.push({ from: u, to: e.to, riskVal: edgeMatrix?.[u]?.[e.to] ?? 0 });
      }
    }
    const maxNodeRisk = Math.max(...riskFromRoot, 0);
    if (distanceRef.current) {
      plotly.react(distanceRef.current, [...makeColoredEdgeTraces(distanceNodes, distanceEdges), makeNodeTrace(distanceNodes, riskFromRoot, maxNodeRisk)], {
        title: 'Distance Network',
        margin: { t: 40, r: 10, b: 10, l: 10 },
        xaxis: { showgrid: false, zeroline: false, showticklabels: false },
        yaxis: { showgrid: false, zeroline: false, showticklabels: false, scaleanchor: 'x' },
      }, { responsive: true });
    }

    const maxRisk = Math.max(...riskFromRoot, 0);
    const riskNodes = distanceNodes.map((node) => {
      const r = riskFromRoot[node.id] || 0;
      const norm = maxRisk > 0 ? r / maxRisk : 0;
      const radius = node.id === safeRoot ? 0 : Math.max(0.12, 1 - Math.sqrt(norm));
      const angle = Math.atan2(node.y, node.x);
      return { ...node, x: radius * Math.cos(angle), y: radius * Math.sin(angle), size: node.id === safeRoot ? 18 : (10 + norm * 12) };
    });
    if (riskNetworkRef.current) {
      plotly.react(riskNetworkRef.current, [...makeColoredEdgeTraces(riskNodes, distanceEdges), makeNodeTrace(riskNodes, riskFromRoot, maxRisk)], {
        title: 'Risk Network',
        margin: { t: 40, r: 10, b: 10, l: 10 },
        xaxis: { showgrid: false, zeroline: false, showticklabels: false },
        yaxis: { showgrid: false, zeroline: false, showticklabels: false, scaleanchor: 'x' },
      }, { responsive: true });
    }

    const treeNodes = [{ comp: safeRoot, depth: 0, parent: -1 }];
    const visited = new Set([safeRoot]);
    for (let idx = 0; idx < treeNodes.length; idx++) {
      const curr = treeNodes[idx];
      if (curr.depth >= (Number(depth) || 4)) continue;
      for (const e of adj[curr.comp]) {
        if (visited.has(e.to)) continue;
        visited.add(e.to);
        treeNodes.push({ comp: e.to, depth: curr.depth + 1, parent: idx });
      }
    }
    const byDepth = new Map();
    treeNodes.forEach((node, idx) => {
      if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
      byDepth.get(node.depth).push({ ...node, idx });
    });
    const treeLayoutNodes = [];
    for (const [dLevel, nodesAtDepth] of byDepth.entries()) {
      const width = Math.max(nodesAtDepth.length - 1, 1);
      nodesAtDepth.forEach((node, i) => {
        treeLayoutNodes[node.idx] = {
          ...node,
          id: node.comp,
          x: nodesAtDepth.length === 1 ? 0 : (i / width) * 2 - 1,
          y: -dLevel,
          size: node.comp === safeRoot ? 18 : 11,
        };
      });
    }
    const treeEdges = treeLayoutNodes
      .map((nNode, idx) => ({ nNode, idx }))
      .filter(({ nNode }) => nNode.parent >= 0)
      .map(({ nNode, idx }) => ({
        from: nNode.parent,
        to: idx,
        riskVal: edgeMatrix?.[treeLayoutNodes[nNode.parent]?.comp]?.[nNode.comp] ?? 0,
      }));
    if (treeRef.current) {
      plotly.react(treeRef.current, [...makeColoredEdgeTraces(treeLayoutNodes, treeEdges), makeNodeTrace(treeLayoutNodes, riskFromRoot, maxRisk)], {
        title: 'Propagation Tree',
        margin: { t: 40, r: 10, b: 10, l: 10 },
        xaxis: { showgrid: false, zeroline: false, showticklabels: false },
        yaxis: { showgrid: false, zeroline: false, showticklabels: false },
      }, { responsive: true });
    }

    if (centralityRef.current) {
      const cent = computeWeightedBetweennessCentrality(dsm.likelihood, edgeMatrix, instigator);
      const ranked = cent.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, Math.min(10, cent.length)).reverse();
      plotly.react(centralityRef.current, [{
        x: ranked.map(r => r.v),
        y: ranked.map(r => `${r.i + 1}. ${elem[r.i]}`),
        type: 'bar',
        orientation: 'h',
        marker: { color: '#0EA5E9' },
        hovertemplate: '%{y}<br>Betweenness: %{x:.4f}<extra></extra>',
      }], {
        title: 'Critical Components (Betweenness)',
        margin: { t: 40, r: 10, b: 40, l: 220 },
        xaxis: { title: 'Weighted Betweenness' },
      }, { responsive: true });
    }

    if (treemapRef.current) {
      const totals = (result.incoming || []).map((inc, i) => Math.max((inc || 0) + (result.outgoing?.[i] || 0), 1e-4));
      plotly.react(treemapRef.current, [{
        type: 'treemap',
        labels: labels,
        parents: new Array(labels.length).fill(''),
        values: totals,
        marker: { colors: totals, colorscale: 'YlOrRd' },
        hovertemplate: '%{label}<br>Total: %{value:.4f}<extra></extra>',
      }], {
        title: 'Risk Distribution (Treemap)',
        margin: { t: 40, r: 10, b: 10, l: 10 },
      }, { responsive: true });
    }
  }, [plotlyReady, result, activeTab, edgeMetric, vizRoot, dsm, instigator, depth, matrixMetric, scatterScale, showDirectOverlay]);

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
                        const parsed = parseUnitInterval(raw);
                        if (!parsed.ok) {
                          e.target.classList.add('pma-input-error');
                          e.target.title = 'Value must be between 0 and 1';
                          return;
                        }
                        e.target.classList.remove('pma-input-error');
                        e.target.title = '';
                        const v = Math.round(parsed.value * 1000) / 1000;
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

  const renderResultsTable = (matrix, title) => {
    if (!matrix || matrix.length === 0) return null;
    // Colour-scale 0..max (low=green, high=red)
    let max = 0;
    for (const row of matrix) for (const v of row) if (v > max) max = v;
    if (max === 0) max = 1;
    const colorFor = (v) => {
      if (v === 0) return 'transparent';
      const t = Math.min(1, v / max);
      const hue = (1 - t) * 120; // 120=green, 0=red
      const alpha = 0.18 + 0.72 * t;
      return `hsla(${hue.toFixed(1)}, 70%, 48%, ${alpha.toFixed(3)})`;
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

  const renderClarksonMatrix = (riskMatrix, probMatrix, title) => {
    if (!riskMatrix?.length || !probMatrix?.length) return null;
    const impactMatrix = buildCombinedImpactMatrix(riskMatrix, probMatrix);
    return (
      <div className="pma-result-block">
        <h3>{title}</h3>
        <div className="pma-result-scroll">
          <table className="pma-table pma-result-table pma-clarkson-matrix">
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
                  <td className="pma-row-header" title={el}><span className="pma-element-name">{el}</span></td>
                  {dsm.elements.map((__, j) => {
                    if (i === j) return <td key={j} className="pma-diagonal"></td>;
                    const likelihood = Math.max(0, Math.min(1, probMatrix[i]?.[j] ?? 0));
                    const impact = Math.max(0, Math.min(1, impactMatrix[i]?.[j] ?? 0));
                    const risk = Math.max(0, Math.min(1, riskMatrix[i]?.[j] ?? 0));
                    return (
                      <td key={j} className="pma-clarkson-cell" title={`L=${likelihood.toFixed(3)}, I=${impact.toFixed(3)}, R=${risk.toFixed(3)}`}>
                        <div
                          className="pma-clarkson-box"
                          style={{
                            width: `${Math.max(2, likelihood * 26)}px`,
                            height: `${Math.max(2, impact * 26)}px`,
                            background: `hsla(${(1 - risk) * 120}, 72%, 48%, 0.55)`,
                            borderColor: `hsl(${(1 - risk) * 120}, 72%, 36%)`,
                          }}
                        />
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
    const risk = result.combinedRisk || [];
    const likelihood = result.combinedLikelihood || [];
    const impact = buildCombinedImpactMatrix(risk, likelihood);
    const isMarginAware = result.mode === 'margin_aware';
    const effectiveLikelihood = result.effectiveLikelihood || [];
    const numericRisk = matrixMetric === 'likelihood' ? likelihood : (matrixMetric === 'impact' ? impact : risk);
    return (
      <div className="pma-results-layout">
        <div className="pma-result-summary">
          <span>Method: <strong>{isMarginAware ? 'MA-CPM (Phase 2)' : 'Classic CPM (Phase 1)'}</strong></span>
          <span>Search depth: <strong>{result.depth}</strong></span>
          <span>Convention: <strong>{result.instigator === 'column' ? 'Column \u2192 Row' : 'Row \u2192 Column'}</strong></span>
          <span>Elements: <strong>{dsm.elements.length}</strong></span>
          {isMarginAware && (
            <>
              <span>Samples: <strong>{result.nSamples || '-'}</strong></span>
              <span>Initial \u0394: <strong>{Number(result.delta0 || 0).toFixed(3)}</strong></span>
            </>
          )}
        </div>
        <div className="pma-viz-card">
          <h3>Risk: Incoming vs Outgoing Propagation</h3>
          <div className="pma-scatter-controls">
            <label className="pma-panel-checkbox">
              <input type="checkbox" checked={showDirectOverlay} onChange={(e) => setShowDirectOverlay(e.target.checked)} />
              <span>Show direct (1-hop) overlay</span>
            </label>
            <div className="pma-viz-mode">
              <button type="button" className={`pma-viz-mode-btn ${scatterScale === 'fixed' ? 'active' : ''}`} onClick={() => setScatterScale('fixed')}>0 - 1</button>
              <button type="button" className={`pma-viz-mode-btn ${scatterScale === 'auto' ? 'active' : ''}`} onClick={() => setScatterScale('auto')}>Auto</button>
            </div>
          </div>
          <div ref={scatterRef} className="pma-plot-container" />
        </div>
        <div className="pma-viz-panel">
          <div className="pma-viz-controls">
            <div className="pma-viz-control">
              <label>Initiating component</label>
              <select value={vizRoot} onChange={(e) => setVizRoot(Number(e.target.value))}>
                {dsm.elements.map((el, i) => <option key={i} value={i}>{i + 1}. {el}</option>)}
              </select>
            </div>
            <div className="pma-viz-control">
              <label>Edge Color</label>
              <select value={edgeMetric} onChange={(e) => setEdgeMetric(e.target.value)}>
                <option value="risk">Combined Risk</option>
                <option value="likelihood">Combined Likelihood</option>
                <option value="impact">Combined Impact</option>
              </select>
            </div>
          </div>
          <div className="pma-viz-grid">
            <div className="pma-viz-card"><h3>Distance Network</h3><div ref={distanceRef} className="pma-plot-container pma-plot-container-sm" /></div>
            <div className="pma-viz-card"><h3>Risk Network</h3><div ref={riskNetworkRef} className="pma-plot-container pma-plot-container-sm" /></div>
            <div className="pma-viz-card"><h3>Propagation Tree</h3><div ref={treeRef} className="pma-plot-container pma-plot-container-sm" /></div>
            <div className="pma-viz-card"><h3>Critical Components (Betweenness)</h3><div ref={centralityRef} className="pma-plot-container pma-plot-container-sm" /></div>
            <div className="pma-viz-card"><h3>Risk Distribution (Treemap)</h3><div ref={treemapRef} className="pma-plot-container pma-plot-container-sm" /></div>
          </div>
        </div>
        <div className="pma-matrix-controls">
          <div className="pma-viz-control">
            <label>Matrix View</label>
            <select value={matrixView} onChange={(e) => setMatrixView(e.target.value)}>
              <option value="color">Coloured (Clarkson)</option>
              <option value="numbers">Numeric</option>
            </select>
          </div>
          {matrixView === 'numbers' && (
            <div className="pma-viz-control">
              <label>Numbers Show</label>
              <select value={matrixMetric} onChange={(e) => setMatrixMetric(e.target.value)}>
                <option value="risk">Combined Risk</option>
                <option value="likelihood">Combined Likelihood</option>
                <option value="impact">Combined Impact</option>
              </select>
            </div>
          )}
        </div>
        {matrixView === 'color'
          ? renderClarksonMatrix(risk, likelihood, isMarginAware ? 'MA-CPM Combined Risk Plot' : 'Combined Risk Plot')
          : renderResultsTable(numericRisk, `Risk Matrix - ${matrixMetric === 'risk' ? 'Combined Risk' : (matrixMetric === 'likelihood' ? 'Combined Likelihood' : 'Combined Impact')}`)}
        {isMarginAware && effectiveLikelihood.length > 0
          ? renderResultsTable(effectiveLikelihood, 'MA-CPM Effective Likelihood (L*)')
          : null}
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
          <span className="pma-subtitle">
            {analysisMode === 'margin_aware'
              ? 'Phase 2 — Margin-Aware Change Propagation Method'
              : 'Phase 1 — Clarkson Change Propagation Method'}
          </span>
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
            {running ? 'Running…' : (analysisMode === 'margin_aware' ? '\u25B6 Run MA-CPM' : '\u25B6 Run CPM')}
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
            <h3 className="pma-panel-heading">Analysis Method</h3>
            <div className="pma-panel-radio-group">
              <label className="pma-panel-radio">
                <input
                  type="radio"
                  name="pma-analysis-mode"
                  value="classic"
                  checked={analysisMode === 'classic'}
                  onChange={() => setAnalysisMode('classic')}
                />
                <span>Classic CPM</span>
              </label>
              <label className="pma-panel-radio">
                <input
                  type="radio"
                  name="pma-analysis-mode"
                  value="margin_aware"
                  checked={analysisMode === 'margin_aware'}
                  onChange={() => setAnalysisMode('margin_aware')}
                />
                <span>Margin-Aware CPM</span>
              </label>
            </div>

            {analysisMode === 'margin_aware' && (
              <div className="pma-margin-controls">
                <div className="pma-panel-field">
                  <label>Monte Carlo Samples</label>
                  <input
                    type="number"
                    min="50"
                    step="50"
                    value={nSamples}
                    onChange={(e) => setNSamples(e.target.value)}
                    placeholder="e.g. 400"
                  />
                </div>
                <div className="pma-panel-field">
                  <label>Initial Change (\u0394_0)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={delta0}
                    onChange={(e) => setDelta0(e.target.value)}
                    placeholder="e.g. 1.0"
                  />
                </div>
                <div className="pma-panel-field">
                  <label>Default Margin</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={defaultMargin}
                    onChange={(e) => setDefaultMargin(e.target.value)}
                    placeholder="e.g. 0.15"
                  />
                </div>
                <button type="button" className="pma-panel-btn" onClick={applyDefaultMarginToAll}>
                  Apply Margin to All
                </button>
                <div className="pma-margin-list">
                  {dsm.elements.length === 0 ? (
                    <p className="pma-margin-empty">Add elements to set margins.</p>
                  ) : (
                    dsm.elements.map((el, idx) => (
                      <label className="pma-margin-row" key={`${el}-${idx}`}>
                        <span title={el}>{idx + 1}. {el}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={margins[idx] ?? 0}
                          onChange={(e) => setMarginAt(idx, e.target.value)}
                        />
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
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
          &copy; {new Date().getFullYear()} Arindam Brahma &nbsp;&middot;&nbsp; {analysisMode === 'margin_aware' ? 'MA-CPM (phase 2)' : 'Clarkson CPM (phase 1)'} via cpm-lib
        </span>
      </div>
    </div>
  );
}
