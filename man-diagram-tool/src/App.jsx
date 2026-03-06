import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './App.css';
import { useGraphStore } from './state/useGraphStore';
import MenuBar from './components/MenuBar';
import Palette from './components/Palette';
import Canvas from './components/Canvas';
import PropertyPanel from './components/PropertyPanel';
import MarginValuePlot from './components/MarginValuePlot';
import SensitivityStudyModule from './components/SensitivityStudyModule';
import RedesignAnalysisModule from './components/RedesignAnalysisModule';
import ReportingModule from './components/ReportingModule';
import ExportModal from './components/ExportModal';
import PreAnalysisModal from './components/PreAnalysisModal';
import ImageExportDialog from './components/ImageExportDialog';
import { importJSON } from './utils/jsonSerializer';
import { runAnalysis, fetchHealth } from './utils/api';
import { validateGraph } from './utils/graphValidation';
import { buildPreviewParamValues } from './utils/preAnalysisPreview';
import { autoArrangeNodes } from './utils/autoLayout';
import { FRONTEND_VERSION } from './version';
import { sanitize } from './utils/helpers';

function App() {
  const {
    state,
    addNode, updateNode, moveNode, deleteNode,
    deleteEdge, updateEdge, addCluster, moveCluster, updateCluster, deleteCluster,
    select, setZoom, setPan,
    startConnecting, cancelConnecting, finishConnecting,
    toggleInterest, loadGraph, clear, setNodes,
  } = useGraphStore();

  const [showExport, setShowExport] = useState(false);
  const [showDiagramExport, setShowDiagramExport] = useState(false);
  const [diagramExportSrc, setDiagramExportSrc] = useState('');
  const [showPreAnalysis, setShowPreAnalysis] = useState(false);
  const [routePreference, setRoutePreference] = useState('horizontal');
  const [arrowJumpsEnabled, setArrowJumpsEnabled] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState(null);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisWeights, setAnalysisWeights] = useState({ perf: {}, input: {} });
  const [reportCharts, setReportCharts] = useState([]);
  const [backendVersion, setBackendVersion] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [workspaceTabs, setWorkspaceTabs] = useState(['model']);
  const [activeTab, setActiveTab] = useState('model');
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const analysisProgressTimerRef = useRef(null);
  const captureDiagramRef = useRef(null);

  useEffect(() => {
    fetchHealth().then(v => setBackendVersion(v));
  }, []);

  const selectedNode = state.nodes.find(n => n.id === state.selectedId) || null;
  const selectedCluster = state.clusters.find(c => c.id === selectedClusterId) || null;
  const previewParamValues = useMemo(
    () => buildPreviewParamValues(state.nodes, state.edges),
    [state.nodes, state.edges]
  );
  const graphValidation = useMemo(
    () => validateGraph(state.nodes, state.edges, previewParamValues),
    [state.nodes, state.edges, previewParamValues]
  );
  const edgeParamValues = useMemo(
    () => ({ ...previewParamValues, ...(analysisResult?.paramValues || {}) }),
    [previewParamValues, analysisResult]
  );
  const analysisWeightNames = useMemo(() => {
    const perfNames = state.nodes
      .filter(n => n.type === 'performance')
      .map(n => sanitize(n.label));
    const markedInputs = state.nodes.filter(n => n.type === 'input' && n.isOfInterest);
    const inputPool = markedInputs.length > 0
      ? markedInputs
      : state.nodes.filter(n => n.type === 'input');
    const inputNames = inputPool.map(n => sanitize(n.label));
    return { perfNames, inputNames };
  }, [state.nodes]);

  const effectiveWeights = useMemo(() => {
    const build = (names, source) => {
      const out = {};
      for (const name of names) {
        const v = Number((source || {})[name]);
        out[name] = Number.isFinite(v) && v >= 0 ? v : 1;
      }
      return out;
    };
    return {
      perfWeights: build(analysisWeightNames.perfNames, analysisWeights.perf),
      inputWeights: build(analysisWeightNames.inputNames, analysisWeights.input),
    };
  }, [analysisWeights, analysisWeightNames]);

  // Add node at the visible center of the canvas
  const handleAddNode = useCallback((type) => {
    const cx = (window.innerWidth / 2 - state.panOffset.x) / state.zoom;
    const cy = (window.innerHeight / 2 - state.panOffset.y) / state.zoom;
    addNode(type, cx, cy);
    setSelectedClusterId(null);
    setSelectedEdgeId(null);
  }, [addNode, state.panOffset, state.zoom]);

  // Import JSON
  const handleImport = useCallback((raw) => {
    try {
      const data = importJSON(raw);
      loadGraph(data);
      setFitViewRequest((v) => v + 1);
      setAnalysisResult(null);
      setAnalysisError(null);
      setReportCharts([]);
      setWorkspaceTabs(['model']);
      setActiveTab('model');
      setSelectedClusterId(null);
      setSelectedEdgeId(null);
    } catch (e) {
      alert('Invalid JSON file: ' + e.message);
    }
  }, [loadGraph]);

  // Load canonical example from examples/man_diagram_conrod.json
  const handleLoadExample = useCallback(async () => {
    try {
      const res = await fetch('/examples/man_diagram_conrod.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const data = importJSON(raw);
      loadGraph(data);
      setFitViewRequest((v) => v + 1);
      setAnalysisResult(null);
      setAnalysisError(null);
      setReportCharts([]);
      setWorkspaceTabs(['model']);
      setActiveTab('model');
      setSelectedClusterId(null);
      setSelectedEdgeId(null);
    } catch (e) {
      alert(`Failed to load example JSON: ${e.message}`);
    }
  }, [loadGraph]);

  // Clear graph + analysis
  const handleClear = useCallback(() => {
    clear();
    setAnalysisResult(null);
    setAnalysisError(null);
    setReportCharts([]);
    setWorkspaceTabs(['model']);
    setActiveTab('model');
    setSelectedClusterId(null);
    setSelectedEdgeId(null);
  }, [clear]);

  // Capture a chart from an analysis module and queue it for the report.
  // label = exportName, dataUrl = svg data URL, tables = [{caption, headers, rows}]
  const handleAddChartToReport = useCallback((label, dataUrl, tables = []) => {
    setReportCharts(prev => {
      const existing = prev.findIndex(c => c.label === label);
      if (existing >= 0) {
        // Update in-place so the position is preserved
        const next = [...prev];
        next[existing] = { ...next[existing], dataUrl, tables };
        return next;
      }
      return [...prev, { id: `chart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label, dataUrl, tables }];
    });
  }, []);

  const handleAutoArrange = useCallback(() => {
    const arranged = autoArrangeNodes(state.nodes, state.edges, routePreference);
    setNodes(arranged);
  }, [state.nodes, state.edges, routePreference, setNodes]);

  const handleOpenDiagramExport = useCallback(() => {
    const capture = captureDiagramRef.current;
    if (!capture) {
      window.alert('Diagram export is not available yet. Please try again.');
      return;
    }
    const src = capture();
    if (!src) {
      window.alert('Could not capture the current diagram.');
      return;
    }
    setDiagramExportSrc(src);
    setShowDiagramExport(true);
  }, []);

  const handleAddCluster = useCallback(() => {
    const cx = (window.innerWidth / 2 - state.panOffset.x) / state.zoom;
    const cy = (window.innerHeight / 2 - state.panOffset.y) / state.zoom;
    const idx = (state.clusters?.length || 0) + 1;
    addCluster({
      id: `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: cx - 180,
      y: cy - 120,
      w: 360,
      h: 240,
      label: `Subsystem ${idx}`,
      description: '',
      fill: '#E5E7EB',
      stroke: '#9CA3AF',
    });
    setSelectedClusterId(null);
  }, [state.panOffset, state.zoom, state.clusters, addCluster]);

  // Run analysis
  const handleRunAnalysis = useCallback(async () => {
    if (!graphValidation.isValid) {
      const msg = graphValidation.issues
        .slice(0, 4)
        .map(i => i.message)
        .join('; ');
      setAnalysisError(`Fix graph issues before analysis: ${msg}`);
      setAnalysisResult(null);
      return;
    }
    setAnalysisLoading(true);
    setAnalysisProgress(4);
    if (analysisProgressTimerRef.current) {
      clearInterval(analysisProgressTimerRef.current);
      analysisProgressTimerRef.current = null;
    }
    analysisProgressTimerRef.current = setInterval(() => {
      setAnalysisProgress((prev) => {
        const p = Number(prev);
        if (!Number.isFinite(p)) return 4;
        if (p >= 90) return 90;
        const next = p + Math.max(1, (90 - p) * 0.14);
        return Math.min(90, Math.round(next));
      });
    }, 220);
    setAnalysisError(null);
    try {
      const data = await runAnalysis(state.nodes, state.edges, effectiveWeights);
      setAnalysisProgress(96);
      setAnalysisResult(data);
      setWorkspaceTabs((prev) => {
        const next = [...prev];
        if (!next.includes('sensitivity')) next.push('sensitivity');
        if (!next.includes('redesign')) next.push('redesign');
        if (!next.includes('reporting')) next.push('reporting');
        return next;
      });
    } catch (e) {
      setAnalysisError(e.message);
      setAnalysisResult(null);
    } finally {
      if (analysisProgressTimerRef.current) {
        clearInterval(analysisProgressTimerRef.current);
        analysisProgressTimerRef.current = null;
      }
      setAnalysisProgress(100);
      setAnalysisLoading(false);
      setTimeout(() => setAnalysisProgress(null), 180);
    }
  }, [state.nodes, state.edges, graphValidation, effectiveWeights]);

  useEffect(() => {
    return () => {
      if (analysisProgressTimerRef.current) {
        clearInterval(analysisProgressTimerRef.current);
        analysisProgressTimerRef.current = null;
      }
    };
  }, []);

  const openWorkspaceTab = useCallback((tabId) => {
    if (tabId !== 'sensitivity' && tabId !== 'redesign' && tabId !== 'reporting') return;
    if (!analysisResult) {
      setAnalysisError('Run analysis first to open analysis modules.');
      return;
    }
    setWorkspaceTabs((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
    setActiveTab(tabId);
  }, [analysisResult]);

  const closeWorkspaceTab = useCallback((tabId) => {
    if (tabId === 'model') return;
    setWorkspaceTabs((prev) => {
      const next = prev.filter((id) => id !== tabId);
      if (activeTab === tabId) {
        setActiveTab(next[next.length - 1] || 'model');
      }
      return next.length ? next : ['model'];
    });
  }, [activeTab]);

  const tabLabel = useCallback((tabId) => {
    if (tabId === 'model') return 'Model';
    if (tabId === 'redesign') return 'Redesign';
    if (tabId === 'reporting') return 'Reporting';
    return 'Sensitivity';
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const isTypingContext = (el) => {
      if (!el) return false;
      const tag = String(el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return Boolean(el.isContentEditable);
    };

    const handler = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
        selectedEdgeId &&
        !isTypingContext(document.activeElement)) {
        e.preventDefault();
        deleteEdge(selectedEdgeId);
        setSelectedEdgeId(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
        state.selectedId &&
        !isTypingContext(document.activeElement)) {
        e.preventDefault();
        deleteNode(state.selectedId);
      }
      if (e.key === 'Escape') {
        cancelConnecting();
        select(null);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.selectedId, selectedEdgeId, deleteNode, deleteEdge, cancelConnecting, select]);

  return (
    <div className="app-container">
      <MenuBar
        onLoadExample={handleLoadExample}
        onPreAnalysis={() => setShowPreAnalysis(true)}
        onExport={() => setShowExport(true)}
        onExportDiagram={handleOpenDiagramExport}
        onImport={handleImport}
        onClear={handleClear}
        onRunAnalysis={handleRunAnalysis}
        onOpenModel={() => setActiveTab('model')}
        onOpenSensitivity={() => openWorkspaceTab('sensitivity')}
        onOpenReporting={() => openWorkspaceTab('reporting')}
        analysisReady={Boolean(analysisResult)}
        analysisLoading={analysisLoading}
        analysisProgress={analysisProgress}
        analysisBlocked={!graphValidation.isValid}
      />

      <div className="workspace-tabs">
        {workspaceTabs.map((tabId) => (
          <button
            key={tabId}
            type="button"
            className={`workspace-tab-btn ${activeTab === tabId ? 'active' : ''}`}
            onClick={() => setActiveTab(tabId)}
          >
            <span>{tabLabel(tabId)}</span>
            {tabId !== 'model' && (
              <span
                role="button"
                tabIndex={0}
                className="workspace-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeWorkspaceTab(tabId);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeWorkspaceTab(tabId);
                  }
                }}
              >
                x
              </span>
            )}
          </button>
        ))}
      </div>

          {activeTab === 'model' ? (
        <div className="app-body">
          <Palette
            onAddNode={handleAddNode}
            onAutoArrange={handleAutoArrange}
            onAddCluster={handleAddCluster}
            routePreference={routePreference}
            onChangeRoutePreference={setRoutePreference}
            arrowJumpsEnabled={arrowJumpsEnabled}
            onToggleArrowJumps={() => setArrowJumpsEnabled(v => !v)}
            frontendVersion={FRONTEND_VERSION}
            backendVersion={backendVersion}
          />

          <Canvas
            nodes={state.nodes}
            edges={state.edges}
            clusters={state.clusters}
            selectedId={state.selectedId}
            selectedClusterId={selectedClusterId}
            zoom={state.zoom}
            panOffset={state.panOffset}
            connecting={state.connecting}
            onMoveNode={moveNode}
            onSelect={select}
            onSelectCluster={setSelectedClusterId}
            onSetZoom={setZoom}
            onSetPan={setPan}
            onStartConnect={startConnecting}
            onFinishConnect={finishConnecting}
            onCancelConnect={cancelConnecting}
            onDeleteEdge={deleteEdge}
            onUpdateEdge={updateEdge}
            selectedEdgeId={selectedEdgeId}
            onSelectEdge={setSelectedEdgeId}
            onMoveCluster={moveCluster}
            onUpdateNode={updateNode}
            paramValues={edgeParamValues}
            invalidNodeIds={graphValidation.invalidNodeIds}
            routePreference={routePreference}
            arrowJumpsEnabled={arrowJumpsEnabled}
            fitViewRequest={fitViewRequest}
            onRegisterCapture={(fn) => { captureDiagramRef.current = fn; }}
          />

          <div className="right-panel">
            <PropertyPanel
              node={selectedNode}
              cluster={selectedCluster}
              nodes={state.nodes}
              edges={state.edges}
              clusters={state.clusters}
              previewParamValues={previewParamValues}
              onUpdateNode={updateNode}
              onUpdateCluster={updateCluster}
              onDeleteCluster={(id) => {
                deleteCluster(id);
                setSelectedClusterId(null);
              }}
              onDeleteNode={deleteNode}
            />
            <MarginValuePlot
              analysisResult={analysisResult}
              analysisError={analysisError}
              appliedWeights={effectiveWeights}
              nodes={state.nodes}
            />
          </div>
        </div>
      ) : activeTab === 'sensitivity' ? (
        <div className="analysis-workspace">
          <SensitivityStudyModule
            analysisResult={analysisResult}
            analysisError={analysisError}
            nodes={state.nodes}
            edges={state.edges}
            appliedWeights={effectiveWeights}
            onAddChartToReport={handleAddChartToReport}
          />
        </div>
      ) : activeTab === 'redesign' ? (
        <div className="analysis-workspace">
          <RedesignAnalysisModule
            analysisResult={analysisResult}
            analysisError={analysisError}
            nodes={state.nodes}
            edges={state.edges}
            appliedWeights={effectiveWeights}
            onAddChartToReport={handleAddChartToReport}
          />
        </div>
      ) : (
        <div className="analysis-workspace">
          <ReportingModule
            analysisResult={analysisResult}
            analysisError={analysisError}
            nodes={state.nodes}
            edges={state.edges}
            appliedWeights={effectiveWeights}
            reportCharts={reportCharts}
          />
        </div>
      )}

      {showExport && (
        <ExportModal
          nodes={state.nodes}
          edges={state.edges}
          clusters={state.clusters}
          onClose={() => setShowExport(false)}
        />
      )}

      <ImageExportDialog
        open={showDiagramExport}
        onClose={() => setShowDiagramExport(false)}
        imageSrc={diagramExportSrc}
        defaultTitle="Main Diagram"
        defaultName="main_diagram"
      />

      {showPreAnalysis && (
        <PreAnalysisModal
          nodes={state.nodes}
          onToggleInterest={toggleInterest}
          analysisWeights={analysisWeights}
          onChangeWeights={setAnalysisWeights}
          onClose={() => setShowPreAnalysis(false)}
        />
      )}
    </div>
  );
}

export default App;
