import React, { useEffect, useState, useCallback } from 'react';
import { useGraphStore } from '../state/useGraphStore';
import Canvas from './Canvas';
import PropertyPanel from './PropertyPanel';
import { PaletteIcon, WorkspaceIcon } from './Palette';
import { autoArrangeNodes } from '../utils/autoLayout';

const SUB_PALETTE_TYPES = [
  { type: 'hierarchicalInput',  label: 'Input Port' },
  { type: 'hierarchicalOutput', label: 'Output Port' },
  { type: 'calc',               label: 'Calculation' },
  { type: 'calcFunction',       label: 'Calc Function' },
];

function btnStyle(bg, color, border) {
  return {
    padding: '6px 14px',
    background: bg,
    color,
    border: `1px solid ${border || bg}`,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

export default function HierarchicalSubCanvas({ parentNode, onClose, onSave }) {
  const {
    state,
    addNode, updateNode, moveNode, deleteNode,
    deleteEdge, updateEdge,
    select, setZoom, setPan,
    startConnecting, cancelConnecting, finishConnecting,
    loadGraph, setNodes,
    addCluster, moveCluster, updateCluster, deleteCluster,
  } = useGraphStore();

  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [routePreference, setRoutePreference] = useState('horizontal');
  const [arrowJumpsEnabled, setArrowJumpsEnabled] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState(null);

  // Seed the isolated store from the parent node's subGraph on mount
  useEffect(() => {
    const sg = parentNode?.subGraph;
    if (sg && (sg.nodes?.length || sg.edges?.length)) {
      loadGraph({
        nodes: sg.nodes || [],
        edges: sg.edges || [],
        clusters: sg.clusters || [],
      });
      setFitViewRequest(1);
    }
  }, []); // intentionally runs once on mount

  // Keyboard shortcuts (Delete / Escape) scoped to this view
  useEffect(() => {
    const isTyping = (el) => {
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
    };
    const handler = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping(document.activeElement)) {
        if (selectedEdgeId) {
          deleteEdge(selectedEdgeId);
          setSelectedEdgeId(null);
        } else if (state.selectedId) {
          deleteNode(state.selectedId);
        }
        return;
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

  // Add a boundary or internal node at a sensible default position
  const handleAddNode = useCallback((type) => {
    const existingOfType = state.nodes.filter(n => n.type === type);
    const count = existingOfType.length;
    let x, y;
    if (type === 'hierarchicalInput') {
      x = 80;
      y = 120 + count * 70;
    } else if (type === 'hierarchicalOutput') {
      x = 620;
      y = 120 + count * 70;
    } else {
      x = 280 + (count % 3) * 90;
      y = 150 + Math.floor(count / 3) * 90;
    }
    addNode(type, x, y);
  }, [state.nodes, addNode]);

  // Add a cluster (Subsystem Box) centred on the visible area
  const handleAddCluster = useCallback(() => {
    const cx = (400 - state.panOffset.x) / state.zoom;
    const cy = (300 - state.panOffset.y) / state.zoom;
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

  // Auto-arrange nodes
  const handleAutoArrange = useCallback(() => {
    const arranged = autoArrangeNodes(state.nodes, state.edges, routePreference);
    setNodes(arranged);
  }, [state.nodes, state.edges, routePreference, setNodes]);

  // When updating a boundary node, keep portName in sync with label
  const handleUpdateNode = useCallback((node) => {
    if (node.type === 'hierarchicalInput' || node.type === 'hierarchicalOutput') {
      updateNode({ ...node, portName: node.label });
    } else {
      updateNode(node);
    }
  }, [updateNode]);

  // Derive ports from boundary nodes and call onSave
  const handleSave = useCallback(() => {
    const inputPorts = state.nodes
      .filter(n => n.type === 'hierarchicalInput')
      .map(n => n.label || n.portName || 'in');
    const outputPorts = state.nodes
      .filter(n => n.type === 'hierarchicalOutput')
      .map(n => n.label || n.portName || 'out');
    const ports = {
      inputs: inputPorts.length > 0 ? inputPorts : ['in'],
      outputs: outputPorts.length > 0 ? outputPorts : ['out'],
    };
    const subGraph = {
      nodes: state.nodes,
      edges: state.edges,
      clusters: state.clusters || [],
    };
    onSave(subGraph, ports);
  }, [state.nodes, state.edges, state.clusters, onSave]);

  const selectedNode = state.nodes.find(n => n.id === state.selectedId) || null;
  const selectedCluster = (state.clusters || []).find(c => c.id === selectedClusterId) || null;

  // Workspace tool buttons config (re-computed so labels update with state)
  const workspaceTools = [
    {
      key: 'autoArrange',
      label: 'Auto Arrange',
      iconType: 'autoArrange',
      iconRoutePreference: routePreference,
      onClick: handleAutoArrange,
    },
    {
      key: 'route',
      label: `Change to ${routePreference === 'vertical' ? 'Horizontal' : 'Vertical'}`,
      iconType: 'route',
      iconRoutePreference: routePreference === 'horizontal' ? 'vertical' : 'horizontal',
      onClick: () => setRoutePreference(p => p === 'horizontal' ? 'vertical' : 'horizontal'),
    },
    {
      key: 'jumps',
      label: `Arrow Jumps: ${arrowJumpsEnabled ? 'On' : 'Off'}`,
      iconType: 'jumps',
      iconRoutePreference: routePreference,
      onClick: () => setArrowJumpsEnabled(v => !v),
    },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      overflow: 'hidden',
      background: '#F8FAFC',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        background: '#EFF6FF',
        borderBottom: '2px solid #1D4ED8',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF' }}>
          ⊕ Sub-network: {parentNode.label || parentNode.autoLabel || 'Hierarchical Node'}
        </div>

        <div style={{ flex: 1 }} />

        <button style={btnStyle('#1D4ED8', '#fff')} onClick={handleSave}>
          Save &amp; Close
        </button>
        <button style={btnStyle('#F1F5F9', '#64748B', '#CBD5E1')} onClick={onClose}>
          Discard
        </button>
      </div>

      {/* Body: sub-palette | canvas | property panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sub-palette */}
        <div style={{
          width: 160,
          background: '#F1F5F9',
          borderRight: '1px solid #E2E8F0',
          padding: '10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          {/* Elements section */}
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748B',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 4,
            paddingBottom: 6,
            borderBottom: '1px solid #E2E8F0',
          }}>
            Elements
          </div>

          {SUB_PALETTE_TYPES.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => handleAddNode(type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#EFF6FF';
                e.currentTarget.style.borderColor = '#93C5FD';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <PaletteIcon type={type} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{label}</span>
            </button>
          ))}

          {/* Subsystem Box */}
          <button
            onClick={handleAddCluster}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
              textAlign: 'left',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#EFF6FF';
              e.currentTarget.style.borderColor = '#93C5FD';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.borderColor = '#E2E8F0';
            }}
          >
            <PaletteIcon type="cluster" />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Subsystem Box</span>
          </button>

          {/* Workspace section */}
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748B',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginTop: 10,
            marginBottom: 4,
            paddingTop: 8,
            paddingBottom: 6,
            borderTop: '1px solid #E2E8F0',
            borderBottom: '1px solid #E2E8F0',
          }}>
            Workspace
          </div>

          {workspaceTools.map(tool => (
            <button
              key={tool.key}
              onClick={tool.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 2,
                padding: '6px 8px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                color: '#334155',
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#EFF6FF';
                e.currentTarget.style.borderColor = '#93C5FD';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <WorkspaceIcon type={tool.iconType} routePreference={tool.iconRoutePreference} />
              {tool.label}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>
          <Canvas
            nodes={state.nodes}
            edges={state.edges}
            clusters={state.clusters || []}
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
            onUpdateNode={handleUpdateNode}
            paramValues={{}}
            invalidNodeIds={new Set()}
            routePreference={routePreference}
            arrowJumpsEnabled={arrowJumpsEnabled}
            fitViewRequest={fitViewRequest}
            onRegisterCapture={null}
            onOpenSubCanvas={null}
          />
        </div>

        {/* Property panel */}
        <div style={{
          width: 240,
          borderLeft: '1px solid #E2E8F0',
          overflowY: 'auto',
          flexShrink: 0,
          background: '#fff',
        }}>
          <PropertyPanel
            node={selectedNode}
            cluster={selectedCluster}
            nodes={state.nodes}
            edges={state.edges}
            clusters={state.clusters || []}
            previewParamValues={{}}
            onUpdateNode={handleUpdateNode}
            onUpdateCluster={updateCluster}
            onDeleteCluster={deleteCluster}
            onDeleteNode={deleteNode}
            onOpenSubCanvas={null}
          />
        </div>

      </div>
    </div>
  );
}
