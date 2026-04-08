import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CascadeMenuBar from '../components/CascadeMenuBar';
import CascadePalette from '../components/CascadePalette';
import CascadeMatrix from '../components/CascadeMatrix';
import CascadeSankey from '../components/CascadeSankey';
import './CascadeAnalysis.css';

const TAB_ORDER = ['needs-requirements', 'requirements-architecture', 'architecture-parameters', 'flow-view'];
const TAB_LABELS = {
  'needs-requirements': 'Needs \u2192 Requirements',
  'requirements-architecture': 'Requirements \u2192 Architecture',
  'architecture-parameters': 'Architecture \u2192 Parameters',
  'flow-view': 'Flow Propagation',
};

let nextId = 1;
function uid(prefix) {
  return `${prefix}_${nextId++}_${Date.now().toString(36)}`;
}

function computeSpecified(nominal, margin) {
  // Try to parse numeric values and add them
  const nNum = parseFloat(nominal);
  const mStr = (margin || '').trim();
  // Handle "+X" or "-X" or plain number
  const mNum = parseFloat(mStr);
  if (Number.isFinite(nNum) && Number.isFinite(mNum)) {
    const sum = nNum + mNum;
    // Extract unit from nominal (e.g. "6 bar" -> "bar")
    const unitMatch = nominal.match(/[\d.]+\s*(.*)/);
    const unit = unitMatch ? unitMatch[1].trim() : '';
    return `${sum}${unit ? ' ' + unit : ''}`;
  }
  // If not numeric, concatenate
  if (nominal && margin) return `${nominal} ${margin}`;
  return nominal || '';
}

function toImportance(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function toRelationshipWeight(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function computeColumnScores(rows, columns, relationships, rowImportanceMap) {
  const scores = {};
  let total = 0;
  for (const col of columns) {
    let score = 0;
    for (const row of rows) {
      const rel = toRelationshipWeight(relationships[`${row.id}__${col.id}`]);
      if (!rel) continue;
      score += toImportance((rowImportanceMap || {})[row.id]) * rel;
    }
    scores[col.id] = score;
    total += score;
  }
  const priority = {};
  for (const col of columns) {
    priority[col.id] = total > 0 ? (scores[col.id] / total) * 100 : 0;
  }
  return { scores, priority };
}

function insertAt(list, index, item) {
  const i = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, i), item, ...list.slice(i)];
}

function moveItemBefore(list, dragId, targetId) {
  const from = list.findIndex((x) => x.id === dragId);
  const to = list.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0 || from === to) return list;
  const arr = [...list];
  const [item] = arr.splice(from, 1);
  const targetIndex = arr.findIndex((x) => x.id === targetId);
  arr.splice(targetIndex < 0 ? arr.length : targetIndex, 0, item);
  return arr;
}

const EMPTY_STATE = () => ({
  // Matrix 1: Needs -> Requirements
  m1Rows: [],           // needs
  m1Columns: [],        // requirements
  m1Relationships: {},
  m1MainLabel: 'Customer',
  m1NeedImportance: {},
  m1UncertaintyImportance: {},
  m1Nominal: {},
  m1Margin: {},
  m1Direction: {},
  m1Rationale: {},
  m1Uncertainties: [],  // additional uncertainty rows

  // Matrix 2: Requirements -> Arch Elements
  m2Columns: [],        // architectural elements
  m2Relationships: {},
  m2MainLabel: 'Customer',
  m2ArchImportance: {},
  m2UncertaintyImportance: {},
  m2Rationale: {},
  m2Uncertainties: [],

  // Matrix 3: Arch Elements -> Parameters
  m3Columns: [],        // parameters
  m3Relationships: {},
  m3MainLabel: 'Customer',
  m3ParamImportance: {},
  m3UncertaintyImportance: {},
  m3Rationale: {},
  m3Uncertainties: [],
});

const HOT_WATER_EXAMPLE = () => {
  const state = EMPTY_STATE();

  // Matrix 1 Needs
  state.m1Rows = [
    { id: 'n1', label: 'N1  Safe operation under pressure' },
    { id: 'n2', label: 'N2  Long service life' },
    { id: 'n3', label: 'N3  Low heat loss' },
    { id: 'n4', label: 'N4  Secure mounting' },
  ];
  state.m1NeedImportance = { n1: 10, n2: 8, n3: 8, n4: 6 };

  // Matrix 1 Requirements
  state.m1Columns = [
    { id: 'r1', label: 'R1 Test pressure' },
    { id: 'r2', label: 'R2 Relief set-point' },
    { id: 'r3', label: 'R3 Corrosion allowance' },
    { id: 'r4', label: 'R4 Standing heat loss' },
    { id: 'r5', label: 'R5 Support loaded weight' },
  ];

  state.m1Nominal = { r1: '6 bar', r2: '6 bar', r3: '0 mm', r4: '3 kWh/24h', r5: '200 kg' };
  state.m1Margin = { r1: '+4 bar', r2: '+1 bar', r3: '+3 mm', r4: '\u22121 kWh/24h', r5: '+100 kg' };
  state.m1Direction = { r1: 'up', r2: 'up', r3: 'up', r4: 'down', r5: 'up' };
  state.m1Relationships = {
    'n1__r1': true, 'n1__r2': true,
    'n2__r3': true,
    'n3__r4': true,
    'n4__r5': true,
  };
  state.m1Rationale = {
    n1: 'Safety factor',
    n2: 'Corrosion allowance',
    n3: 'Thermal regulation',
    n4: 'Load uncertainty',
  };

  // Matrix 2 Arch Elements
  state.m2Columns = [
    { id: 'ae1', label: 'AE1 Pressure vessel' },
    { id: 'ae2', label: 'AE2 Insulation system' },
    { id: 'ae3', label: 'AE3 Relief valve assembly' },
    { id: 'ae4', label: 'AE4 Cathodic protection' },
    { id: 'ae5', label: 'AE5 Mounting frame' },
  ];
  state.m2ArchImportance = { ae1: 9, ae2: 7, ae3: 8, ae4: 6, ae5: 5 };
  state.m2Relationships = {
    'r1__ae1': true, 'r1__ae3': true,
    'r2__ae3': true,
    'r3__ae1': true, 'r3__ae4': true,
    'r4__ae2': true,
    'r5__ae1': true, 'r5__ae5': true,
  };
  state.m2Rationale = {};
  state.m2Uncertainties = [
    { id: 'u2_1', label: '+ Weight of stored water', isUncertainty: true },
    { id: 'u2_2', label: '+ Heat loss at pipe connections', isUncertainty: true },
    { id: 'u2_3', label: '+ Valve manufacturing spread', isUncertainty: true },
  ];
  // Uncertainty relationships for matrix 2
  state.m2Relationships['u2_1__ae1'] = true;
  state.m2Relationships['u2_1__ae5'] = true;
  state.m2Relationships['u2_2__ae3'] = true;
  state.m2Relationships['u2_3__ae2'] = true;

  // Matrix 3 Parameters
  state.m3Columns = [
    { id: 'p1', label: 'P1 Wall thickness (mm)' },
    { id: 'p2', label: 'P2 Steel grade (MPa yield)' },
    { id: 'p3', label: 'P3 Insulation thickness (mm)' },
    { id: 'p4', label: 'P4 Valve cracking pressure (bar)' },
    { id: 'p5', label: 'P5 Anode mass (kg)' },
    { id: 'p6', label: 'P6 Bracket load rating (kg)' },
  ];
  state.m3ParamImportance = { p1: 9, p2: 8, p3: 7, p4: 8, p5: 5, p6: 6 };
  state.m3Relationships = {
    'ae1__p1': true, 'ae1__p2': true,
    'ae2__p3': true,
    'ae3__p4': true,
    'ae4__p5': true,
    'ae5__p6': true,
  };
  state.m3Rationale = {};
  state.m3Uncertainties = [
    { id: 'u3_1', label: '+ Steel strength varies between batches', isUncertainty: true },
    { id: 'u3_2', label: '+ Wall thickness varies in manufacturing', isUncertainty: true },
    { id: 'u3_3', label: '+ Insulation degrades over time', isUncertainty: true },
  ];
  state.m3Relationships['u3_1__p2'] = true;
  state.m3Relationships['u3_2__p1'] = true;
  state.m3Relationships['u3_3__p3'] = true;

  return state;
};

// ── Legend panel shown in place of the palette on the Flow View tab ──────────
const LEGEND_ITEMS = [
  { color: '#6366F1', label: 'Needs → Requirements',        dot: false },
  { color: '#14B8A6', label: 'Requirements → Architecture', dot: false },
  { color: '#F59E0B', label: 'Architecture → Parameters',   dot: false },
  { color: '#D97706', label: 'Uncertainty source flow',     dot: true  },
];

function SankeyLegend({ showFlowValues, onToggleFlowValues }) {
  return (
    <div className="sankey-legend-panel">
      <div className="sankey-legend-title">Legend</div>

      <div className="sankey-legend-section">Flow colours</div>
      {LEGEND_ITEMS.map(item => (
        <div key={item.label} className="sankey-legend-row">
          <svg width={28} height={10}>
            <line
              x1={2} y1={5} x2={26} y2={5}
              stroke={item.color} strokeWidth={item.dot ? 2 : 2.5}
              strokeDasharray={item.dot ? '4 3' : undefined}
            />
          </svg>
          <span>{item.label}</span>
        </div>
      ))}

      <div className="sankey-legend-section" style={{ marginTop: 16 }}>Node types</div>
      {[ 
        { bg: '#EEF2FF', stroke: '#6366F1', label: 'Need' },
        { bg: '#F0FDFA', stroke: '#14B8A6', label: 'Requirement' },
        { bg: '#FFFBEB', stroke: '#F59E0B', label: 'Arch. Element' },
        { bg: '#F0FDF4', stroke: '#22C55E', label: 'Parameter' },
        { bg: '#FEF3C7', stroke: '#D97706', label: 'Uncertainty source', italic: true },
      ].map(item => (
        <div key={item.label} className="sankey-legend-row">
          <svg width={28} height={16}>
            <rect x={2} y={2} width={24} height={12} rx={3}
              fill={item.bg} stroke={item.stroke} strokeWidth={1.5} />
          </svg>
          <span style={item.italic ? { fontStyle: 'italic' } : undefined}>
            {item.label}
          </span>
        </div>
      ))}

      <div className="sankey-legend-section" style={{ marginTop: 14 }}>View</div>
      <div className="sankey-legend-row" style={{ justifyContent: 'space-between' }}>
        <span>Flow Values</span>
        <button
          type="button"
          onClick={() => onToggleFlowValues && onToggleFlowValues(!showFlowValues)}
          style={{
            width: 34,
            height: 18,
            borderRadius: 999,
            border: '1px solid #94A3B8',
            background: showFlowValues ? '#14B8A6' : '#CBD5E1',
            position: 'relative',
            cursor: 'pointer',
            padding: 0,
          }}
          title={showFlowValues ? 'Hide flow values' : 'Show flow values'}
        >
          <span
            style={{
              position: 'absolute',
              top: 1,
              left: showFlowValues ? 17 : 1,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#FFFFFF',
              transition: 'left 0.15s',
            }}
          />
        </button>
      </div>

      <div className="sankey-legend-hint">
        Hover a node to trace its full upstream / downstream chain.
        Hover a flow to highlight that link.
      </div>
    </div>
  );
}

export default function CascadeAnalysis() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(TAB_ORDER[0]);
  const [data, setData] = useState(EMPTY_STATE);
  const [relationshipMode, setRelationshipMode] = useState('binary');
  const [showFlowValues, setShowFlowValues] = useState(true);

  // Compute specified values (nominal + margin)
  const specifiedValues = useMemo(() => {
    const out = {};
    for (const col of data.m1Columns) {
      out[col.id] = computeSpecified(
        (data.m1Nominal || {})[col.id] || '',
        (data.m1Margin || {})[col.id] || ''
      );
    }
    return out;
  }, [data.m1Columns, data.m1Nominal, data.m1Margin]);

  // Cascade: M1 columns (requirements) become M2 rows
  const m2Rows = useMemo(() => {
    return data.m1Columns.map(col => ({
      id: col.id,
      label: `${col.label}${specifiedValues[col.id] ? ' (' + specifiedValues[col.id] + ')' : ''}`,
    }));
  }, [data.m1Columns, specifiedValues]);

  // Cascade: M2 columns (arch elements) become M3 rows
  const m3Rows = useMemo(() => {
    return data.m2Columns.map(col => ({
      id: col.id,
      label: col.label,
    }));
  }, [data.m2Columns]);

  const m1AllRows = useMemo(() => [...data.m1Rows, ...data.m1Uncertainties], [data.m1Rows, data.m1Uncertainties]);
  const m2AllRows = useMemo(() => [...m2Rows, ...data.m2Uncertainties], [m2Rows, data.m2Uncertainties]);
  const m3AllRows = useMemo(() => [...m3Rows, ...data.m3Uncertainties], [m3Rows, data.m3Uncertainties]);

  const m1ImportanceMap = useMemo(
    () => ({ ...(data.m1NeedImportance || {}), ...(data.m1UncertaintyImportance || {}) }),
    [data.m1NeedImportance, data.m1UncertaintyImportance]
  );

  const m1ScoreData = useMemo(() => (
    computeColumnScores(m1AllRows, data.m1Columns, data.m1Relationships, m1ImportanceMap)
  ), [m1AllRows, data.m1Columns, data.m1Relationships, m1ImportanceMap]);

  const m2RowImportance = useMemo(() => {
    const out = {};
    data.m1Columns.forEach((col) => {
      out[col.id] = (m1ScoreData.priority || {})[col.id] || 0;
    });
    return out;
  }, [data.m1Columns, m1ScoreData.priority]);

  const m2ImportanceMap = useMemo(
    () => ({ ...m2RowImportance, ...(data.m2UncertaintyImportance || {}) }),
    [m2RowImportance, data.m2UncertaintyImportance]
  );

  const m2ScoreData = useMemo(() => (
    computeColumnScores(m2AllRows, data.m2Columns, data.m2Relationships, m2ImportanceMap)
  ), [m2AllRows, data.m2Columns, data.m2Relationships, m2ImportanceMap]);

  const m3RowImportance = useMemo(() => {
    const out = {};
    data.m2Columns.forEach((col) => {
      out[col.id] = toImportance((data.m2ArchImportance || {})[col.id]);
    });
    return out;
  }, [data.m2Columns, data.m2ArchImportance]);

  const m3ImportanceMap = useMemo(
    () => ({ ...m3RowImportance, ...(data.m3UncertaintyImportance || {}) }),
    [m3RowImportance, data.m3UncertaintyImportance]
  );

  const m3ScoreData = useMemo(() => (
    computeColumnScores(m3AllRows, data.m3Columns, data.m3Relationships, m3ImportanceMap)
  ), [m3AllRows, data.m3Columns, data.m3Relationships, m3ImportanceMap]);

  // Navigation — arrows only step through the three matrix tabs, not Flow View
  const MATRIX_TABS = TAB_ORDER.filter(t => t !== 'flow-view');
  const matrixIdx = MATRIX_TABS.indexOf(activeTab);
  const canGoForward  = matrixIdx >= 0 && matrixIdx < MATRIX_TABS.length - 1;
  const canGoBackward = matrixIdx > 0;
  const handleForward = useCallback(() => {
    if (canGoForward) setActiveTab(MATRIX_TABS[matrixIdx + 1]);
  }, [matrixIdx, canGoForward, MATRIX_TABS]);
  const handleBackward = useCallback(() => {
    if (canGoBackward) setActiveTab(MATRIX_TABS[matrixIdx - 1]);
  }, [matrixIdx, canGoBackward, MATRIX_TABS]);

  // --- Matrix 1 actions ---
  const addNeed = useCallback(() => {
    setData(prev => ({
      ...prev,
      m1Rows: [...prev.m1Rows, { id: uid('n'), label: `N${prev.m1Rows.length + 1}` }],
    }));
  }, []);

  const addRequirement = useCallback(() => {
    setData(prev => ({
      ...prev,
      m1Columns: [...prev.m1Columns, { id: uid('r'), label: `R${prev.m1Columns.length + 1}` }],
    }));
  }, []);

  const addM1Uncertainty = useCallback(() => {
    setData(prev => ({
      ...prev,
      m1Uncertainties: [...prev.m1Uncertainties, {
        id: uid('u1'), label: '+ New uncertainty', isUncertainty: true,
      }],
    }));
  }, []);

  // --- Matrix 2 actions ---
  const addArchElement = useCallback(() => {
    setData(prev => ({
      ...prev,
      m2Columns: [...prev.m2Columns, { id: uid('ae'), label: `AE${prev.m2Columns.length + 1}` }],
    }));
  }, []);

  const addM2Uncertainty = useCallback(() => {
    setData(prev => ({
      ...prev,
      m2Uncertainties: [...prev.m2Uncertainties, {
        id: uid('u2'), label: '+ New uncertainty', isUncertainty: true,
      }],
    }));
  }, []);

  // --- Matrix 3 actions ---
  const addParameter = useCallback(() => {
    setData(prev => ({
      ...prev,
      m3Columns: [...prev.m3Columns, { id: uid('p'), label: `P${prev.m3Columns.length + 1}` }],
    }));
  }, []);

  const addM3Uncertainty = useCallback(() => {
    setData(prev => ({
      ...prev,
      m3Uncertainties: [...prev.m3Uncertainties, {
        id: uid('u3'), label: '+ New uncertainty', isUncertainty: true,
      }],
    }));
  }, []);

  const insertNeedAt = useCallback((index) => {
    setData(prev => ({
      ...prev,
      m1Rows: insertAt(prev.m1Rows, index, { id: uid('n'), label: `N${prev.m1Rows.length + 1}` }),
    }));
  }, []);

  const insertRequirementAt = useCallback((index) => {
    setData(prev => ({
      ...prev,
      m1Columns: insertAt(prev.m1Columns, index, { id: uid('r'), label: `R${prev.m1Columns.length + 1}` }),
    }));
  }, []);

  const insertArchitectureAt = useCallback((index) => {
    setData(prev => ({
      ...prev,
      m2Columns: insertAt(prev.m2Columns, index, { id: uid('ae'), label: `AE${prev.m2Columns.length + 1}` }),
    }));
  }, []);

  const insertParameterAt = useCallback((index) => {
    setData(prev => ({
      ...prev,
      m3Columns: insertAt(prev.m3Columns, index, { id: uid('p'), label: `P${prev.m3Columns.length + 1}` }),
    }));
  }, []);

  const moveListItem = useCallback((listKey) => (dragId, targetId) => {
    setData(prev => ({
      ...prev,
      [listKey]: moveItemBefore(prev[listKey], dragId, targetId),
    }));
  }, []);

  // Generic handlers
  const setCellValue = useCallback((matrixKey) => (rowId, colId, value) => {
    setData(prev => {
      const relKey = `${rowId}__${colId}`;
      const rels = { ...prev[matrixKey] };
      const safe = toRelationshipWeight(value);
      if (safe <= 0) delete rels[relKey];
      else rels[relKey] = safe;
      return { ...prev, [matrixKey]: rels };
    });
  }, []);

  const toggleCell = useCallback((matrixKey) => (rowId, colId) => {
    setData(prev => {
      const relKey = `${rowId}__${colId}`;
      const rels = { ...prev[matrixKey] };
      const current = toRelationshipWeight(rels[relKey]);
      let next = 0;
      if (relationshipMode === 'binary') {
        next = current > 0 ? 0 : 1;
      } else if (relationshipMode === 'likert') {
        if (current < 0.05) next = 0.1;
        else if (current < 0.3) next = 0.5;
        else if (current < 0.7) next = 0.9;
        else next = 0;
      } else {
        next = current > 0 ? 0 : 0.5;
      }
      if (next <= 0) delete rels[relKey];
      else rels[relKey] = next;
      return { ...prev, [matrixKey]: rels };
    });
  }, [relationshipMode]);

  const updateRowLabel = useCallback((listKey) => (rowId, newLabel) => {
    setData(prev => ({
      ...prev,
      [listKey]: prev[listKey].map(r => r.id === rowId ? { ...r, label: newLabel } : r),
    }));
  }, []);

  const updateColumnLabel = useCallback((listKey) => (colId, newLabel) => {
    setData(prev => ({
      ...prev,
      [listKey]: prev[listKey].map(c => c.id === colId ? { ...c, label: newLabel } : c),
    }));
  }, []);

  const deleteRow = useCallback((listKey, relKey) => (rowId) => {
    setData(prev => {
      const newRels = { ...prev[relKey] };
      for (const k of Object.keys(newRels)) {
        if (k.startsWith(`${rowId}__`)) delete newRels[k];
      }
      return {
        ...prev,
        [listKey]: prev[listKey].filter(r => r.id !== rowId),
        [relKey]: newRels,
      };
    });
  }, []);

  const deleteColumn = useCallback((listKey, relKey) => (colId) => {
    setData(prev => {
      const newRels = { ...prev[relKey] };
      for (const k of Object.keys(newRels)) {
        if (k.endsWith(`__${colId}`)) delete newRels[k];
      }
      const newNom = { ...prev.m1Nominal };
      const newMar = { ...prev.m1Margin };
      const newDir = { ...prev.m1Direction };
      const newArchImp = { ...prev.m2ArchImportance };
      const newParamImp = { ...prev.m3ParamImportance };
      delete newNom[colId];
      delete newMar[colId];
      delete newDir[colId];
      delete newArchImp[colId];
      delete newParamImp[colId];
      return {
        ...prev,
        [listKey]: prev[listKey].filter(c => c.id !== colId),
        [relKey]: newRels,
        m1Nominal: newNom,
        m1Margin: newMar,
        m1Direction: newDir,
        m2ArchImportance: newArchImp,
        m3ParamImportance: newParamImp,
      };
    });
  }, []);

  const updateMapValue = useCallback((mapKey) => (id, value) => {
    setData(prev => ({
      ...prev,
      [mapKey]: { ...prev[mapKey], [id]: value },
    }));
  }, []);

  // Palette callbacks depend on active tab
  const handleAddRow = useCallback((type) => {
    if (activeTab === 'needs-requirements' && type === 'need') addNeed();
  }, [activeTab, addNeed]);

  const handleAddColumn = useCallback((type) => {
    if (activeTab === 'needs-requirements' && type === 'requirement') addRequirement();
    if (activeTab === 'requirements-architecture' && type === 'archElement') addArchElement();
    if (activeTab === 'architecture-parameters' && type === 'parameter') addParameter();
  }, [activeTab, addRequirement, addArchElement, addParameter]);

  const handleAddUncertainty = useCallback(() => {
    if (activeTab === 'needs-requirements') addM1Uncertainty();
    if (activeTab === 'requirements-architecture') addM2Uncertainty();
    if (activeTab === 'architecture-parameters') addM3Uncertainty();
  }, [activeTab, addM1Uncertainty, addM2Uncertainty, addM3Uncertainty]);

  // Export/Import
  const handleExport = useCallback(() => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mdc_cascade.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const handleImport = useCallback((raw) => {
    try {
      const parsed = JSON.parse(raw);
      setData(parsed);
      setActiveTab(TAB_ORDER[0]);
    } catch (e) {
      alert('Invalid JSON file: ' + e.message);
    }
  }, []);

  const handleClear = useCallback(() => {
    setData(EMPTY_STATE());
    setActiveTab(TAB_ORDER[0]);
  }, []);

  const handleLoadExample = useCallback(() => {
    setData(HOT_WATER_EXAMPLE());
    setActiveTab(TAB_ORDER[0]);
  }, []);

  return (
    <div className="app-container">
      <CascadeMenuBar
        onExport={handleExport}
        onImport={handleImport}
        onClear={handleClear}
        onLoadExample={handleLoadExample}
        onExitToHome={() => navigate('/')}
        activeTab={activeTab}
        onNavigateForward={handleForward}
        onNavigateBackward={handleBackward}
        canGoForward={canGoForward}
        canGoBackward={canGoBackward}
      />

      {/* Tabs */}
      <div className="workspace-tabs">
        {TAB_ORDER.map((tabId) => (
          <button
            key={tabId}
            type="button"
            className={`workspace-tab-btn ${activeTab === tabId ? 'active' : ''}`}
            onClick={() => setActiveTab(tabId)}
          >
            <span>{TAB_LABELS[tabId]}</span>
          </button>
        ))}
      </div>

      <div className="app-body">
        {activeTab === 'flow-view' ? (
          <SankeyLegend showFlowValues={showFlowValues} onToggleFlowValues={setShowFlowValues} />
        ) : (
          <CascadePalette
            activeTab={activeTab}
            onAddRow={handleAddRow}
            onAddColumn={handleAddColumn}
            onAddUncertainty={handleAddUncertainty}
            relationshipMode={relationshipMode}
            onChangeRelationshipMode={setRelationshipMode}
          />
        )}

        <div className="cascade-content">
          <div className="cascade-matrix-title">
            {TAB_LABELS[activeTab]}
          </div>

          {activeTab === 'needs-requirements' && (
            <CascadeMatrix
              matrixType="needs-requirements"
              rows={m1AllRows}
              columns={data.m1Columns}
              relationships={data.m1Relationships}
              nominalValues={data.m1Nominal}
              marginValues={data.m1Margin}
              specifiedValues={specifiedValues}
              directionValues={data.m1Direction}
              onUpdateDirection={updateMapValue('m1Direction')}
              rationale={data.m1Rationale}
              onAddColumn={addRequirement}
              onInsertRowAt={insertNeedAt}
              onInsertColumnAt={insertRequirementAt}
              onMoveRow={moveListItem('m1Rows')}
              onMoveColumn={moveListItem('m1Columns')}
              rowImportanceValues={m1ImportanceMap}
              onUpdateRowImportance={(rowId, v) => {
                setData(prev => {
                  if (prev.m1Uncertainties.some((u) => u.id === rowId)) {
                    return {
                      ...prev,
                      m1UncertaintyImportance: { ...prev.m1UncertaintyImportance, [rowId]: v },
                    };
                  }
                  return {
                    ...prev,
                    m1NeedImportance: { ...prev.m1NeedImportance, [rowId]: v },
                  };
                });
              }}
              scoreValues={m1ScoreData.scores}
              priorityValues={m1ScoreData.priority}
              relationshipMode={relationshipMode}
              onToggleCell={toggleCell('m1Relationships')}
              onSetCellValue={setCellValue('m1Relationships')}
              onUpdateRowLabel={(rowId, label) => {
                // Could be in m1Rows or m1Uncertainties
                setData(prev => ({
                  ...prev,
                  m1Rows: prev.m1Rows.map(r => r.id === rowId ? { ...r, label } : r),
                  m1Uncertainties: prev.m1Uncertainties.map(r => r.id === rowId ? { ...r, label } : r),
                }));
              }}
              onUpdateColumnLabel={updateColumnLabel('m1Columns')}
              onUpdateNominal={updateMapValue('m1Nominal')}
              onUpdateMargin={updateMapValue('m1Margin')}
              onUpdateRationale={updateMapValue('m1Rationale')}
              onDeleteRow={(rowId) => {
                setData(prev => {
                  const newRels = { ...prev.m1Relationships };
                  const newNeedImportance = { ...prev.m1NeedImportance };
                  const newUncImportance = { ...prev.m1UncertaintyImportance };
                  for (const k of Object.keys(newRels)) {
                    if (k.startsWith(`${rowId}__`)) delete newRels[k];
                  }
                  delete newNeedImportance[rowId];
                  delete newUncImportance[rowId];
                  return {
                    ...prev,
                    m1Rows: prev.m1Rows.filter(r => r.id !== rowId),
                    m1Uncertainties: prev.m1Uncertainties.filter(r => r.id !== rowId),
                    m1Relationships: newRels,
                    m1NeedImportance: newNeedImportance,
                    m1UncertaintyImportance: newUncImportance,
                  };
                });
              }}
              onDeleteColumn={deleteColumn('m1Columns', 'm1Relationships')}
            />
          )}

          {activeTab === 'requirements-architecture' && (
            <CascadeMatrix
              matrixType="requirements-architecture"
              rows={m2AllRows}
              columns={data.m2Columns}
              relationships={data.m2Relationships}
              rationale={data.m2Rationale}
              onAddColumn={addArchElement}
              onInsertRowAt={insertRequirementAt}
              onInsertColumnAt={insertArchitectureAt}
              onMoveRow={moveListItem('m1Columns')}
              onMoveColumn={moveListItem('m2Columns')}
              rowImportanceValues={m2ImportanceMap}
              rowImportanceReadOnly
              isRowImportanceReadOnly={(row, isUncertainty) => !isUncertainty}
              onUpdateRowImportance={updateMapValue('m2UncertaintyImportance')}
              columnImportanceValues={data.m2ArchImportance}
              onUpdateColumnImportance={updateMapValue('m2ArchImportance')}
              scoreValues={m2ScoreData.scores}
              priorityValues={m2ScoreData.priority}
              relationshipMode={relationshipMode}
              onToggleCell={toggleCell('m2Relationships')}
              onSetCellValue={setCellValue('m2Relationships')}
              onUpdateRowLabel={(rowId, label) => {
                // Only uncertainty rows are editable here (cascaded rows are read-only)
                setData(prev => ({
                  ...prev,
                  m2Uncertainties: prev.m2Uncertainties.map(r => r.id === rowId ? { ...r, label } : r),
                }));
              }}
              onUpdateColumnLabel={updateColumnLabel('m2Columns')}
              onUpdateRationale={updateMapValue('m2Rationale')}
              onDeleteRow={(rowId) => {
                // Only allow deleting uncertainty rows (not cascaded requirement rows)
                setData(prev => {
                  if (!prev.m2Uncertainties.find(r => r.id === rowId)) return prev;
                  const newRels = { ...prev.m2Relationships };
                  for (const k of Object.keys(newRels)) {
                    if (k.startsWith(`${rowId}__`)) delete newRels[k];
                  }
                  const newUncImportance = { ...prev.m2UncertaintyImportance };
                  delete newUncImportance[rowId];
                  return {
                    ...prev,
                    m2Uncertainties: prev.m2Uncertainties.filter(r => r.id !== rowId),
                    m2Relationships: newRels,
                    m2UncertaintyImportance: newUncImportance,
                  };
                });
              }}
              onDeleteColumn={deleteColumn('m2Columns', 'm2Relationships')}
            />
          )}

          {activeTab === 'architecture-parameters' && (
            <CascadeMatrix
              matrixType="architecture-parameters"
              rows={m3AllRows}
              columns={data.m3Columns}
              relationships={data.m3Relationships}
              rationale={data.m3Rationale}
              onAddColumn={addParameter}
              onInsertRowAt={insertArchitectureAt}
              onInsertColumnAt={insertParameterAt}
              onMoveRow={moveListItem('m2Columns')}
              onMoveColumn={moveListItem('m3Columns')}
              rowImportanceValues={m3ImportanceMap}
              rowImportanceReadOnly
              isRowImportanceReadOnly={(row, isUncertainty) => !isUncertainty}
              onUpdateRowImportance={updateMapValue('m3UncertaintyImportance')}
              columnImportanceValues={data.m3ParamImportance}
              onUpdateColumnImportance={updateMapValue('m3ParamImportance')}
              scoreValues={m3ScoreData.scores}
              priorityValues={m3ScoreData.priority}
              relationshipMode={relationshipMode}
              onToggleCell={toggleCell('m3Relationships')}
              onSetCellValue={setCellValue('m3Relationships')}
              onUpdateRowLabel={(rowId, label) => {
                setData(prev => ({
                  ...prev,
                  m3Uncertainties: prev.m3Uncertainties.map(r => r.id === rowId ? { ...r, label } : r),
                }));
              }}
              onUpdateColumnLabel={updateColumnLabel('m3Columns')}
              onUpdateRationale={updateMapValue('m3Rationale')}
              onDeleteRow={(rowId) => {
                if (!data.m3Uncertainties.find(r => r.id === rowId)) return;
                setData(prev => {
                  const newRels = { ...prev.m3Relationships };
                  for (const k of Object.keys(newRels)) {
                    if (k.startsWith(`${rowId}__`)) delete newRels[k];
                  }
                  const newUncImportance = { ...prev.m3UncertaintyImportance };
                  delete newUncImportance[rowId];
                  return {
                    ...prev,
                    m3Uncertainties: prev.m3Uncertainties.filter(r => r.id !== rowId),
                    m3Relationships: newRels,
                    m3UncertaintyImportance: newUncImportance,
                  };
                });
              }}
              onDeleteColumn={deleteColumn('m3Columns', 'm3Relationships')}
            />
          )}

          {activeTab === 'flow-view' && (
            <CascadeSankey data={data} showFlowValues={showFlowValues} />
          )}
        </div>
      </div>

      <div className="app-footer">
        <span className="app-footer-title">MARVIN &mdash; Margin Deployment Cascading</span>
        <span className="app-footer-copy">
          &copy; {new Date().getFullYear()} Arindam Brahma &nbsp;&middot;&nbsp; Based on QFD-inspired margin cascade method &nbsp;&middot;&nbsp;{' '}
          <a
            href="https://link.springer.com/article/10.1007/s00163-020-00335-8"
            target="_blank"
            rel="noreferrer"
          >
            Res. Eng. Design (2021)
          </a>
        </span>
      </div>
    </div>
  );
}
