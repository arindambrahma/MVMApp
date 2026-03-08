import { useReducer, useCallback } from 'react';
import { createNode } from '../constants/defaultData';
import { getNodeSize } from '../utils/nodeSize';

const initialState = {
  nodes: [],
  edges: [],
  clusters: [],
  selectedId: null,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  nextCalcNumber: 1,
  nextCalcFunctionNumber: 1,
  nextCalcHierarchicalNumber: 1,
  nextMarginNumber: 1,
  nextDecisionNumber: 1,
  nextPerformanceNumber: 1,
  nextInputNumber: 1,
  nextProbeNumber: 1,
  connecting: null, // { fromId, fromPort }
};

function parseMaxSuffix(nodes, type, prefixes) {
  let max = 0;
  for (const n of nodes) {
    if (n.type !== type) continue;
    const candidates = [String(n.autoLabel || ''), String(n.label || '')];
    for (const s of candidates) {
      for (const p of prefixes) {
        const m = s.match(new RegExp(`^${p}(\\d+)$`, 'i'));
        if (m) {
          const val = Number(m[1]);
          if (Number.isFinite(val)) max = Math.max(max, val);
        }
      }
    }
  }
  return max;
}

function findLowestAvailableSuffix(nodes, type, prefixes) {
  const used = new Set();
  for (const n of nodes || []) {
    if (n.type !== type) continue;
    const candidates = [
      String(n.autoLabel || ''),
      String(n.label || ''),
    ];
    if ((type === 'calc' || type === 'calcFunction') && Number.isFinite(Number(n.stepNumber))) {
      candidates.push(`F${Number(n.stepNumber)}`);
    }
  for (const s of candidates) {
    for (const p of prefixes) {
      const m = s.match(new RegExp(`^${p}(\\d+)$`, 'i'));
      if (m) {
        const num = Number(m[1]);
        if (Number.isFinite(num) && num > 0) used.add(num);
      }
    }
  }
  }
  let k = 1;
  while (used.has(k)) k++;
  return k;
}

function nodeHalfSize(node) {
  const { w, h } = getNodeSize(node);
  // keep a little buffer so nodes don't visually touch
  return { hw: w / 2 + 10, hh: h / 2 + 10 };
}

function repelOverlaps(nodes, movingId, targetX, targetY) {
  const movingNode = nodes.find(n => n.id === movingId);
  if (!movingNode) return { x: targetX, y: targetY };

  let x = targetX;
  let y = targetY;

  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    const mSize = nodeHalfSize({ ...movingNode, x, y });

    for (const n of nodes) {
      if (n.id === movingId) continue;
      const oSize = nodeHalfSize(n);
      const dx = x - n.x;
      const dy = y - n.y;
      const ox = (mSize.hw + oSize.hw) - Math.abs(dx);
      const oy = (mSize.hh + oSize.hh) - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        // Push minimally along the shallower penetration axis.
        if (ox < oy) {
          const dir = dx >= 0 ? 1 : -1;
          x += dir * (ox + 2);
        } else {
          const dir = dy >= 0 ? 1 : -1;
          y += dir * (oy + 2);
        }
        changed = true;
      }
    }

    if (!changed) break;
  }

  return { x, y };
}

function fitClustersToMembers(clusters, nodes) {
  const PAD_X = 40;
  const PAD_Y = 34;
  const MIN_W = 240;
  const MIN_H = 150;

  return (clusters || []).map((c) => {
    const members = (nodes || []).filter(n => n.clusterId === c.id);
    if (members.length === 0) return c;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of members) {
      const s = nodeHalfSize(n);
      minX = Math.min(minX, n.x - s.hw);
      minY = Math.min(minY, n.y - s.hh);
      maxX = Math.max(maxX, n.x + s.hw);
      maxY = Math.max(maxY, n.y + s.hh);
    }

    const x = minX - PAD_X;
    const y = minY - PAD_Y;
    const w = Math.max(MIN_W, (maxX - minX) + PAD_X * 2);
    const h = Math.max(MIN_H, (maxY - minY) + PAD_Y * 2);
    return { ...c, x, y, w, h };
  });
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_NODE': {
      const { nodeType, x, y } = action;
      let overrides = {};
      let newState = { ...state };
      const nextCalc = findLowestAvailableSuffix(state.nodes, 'calc', ['F', 'Step\\s*']);
      const nextCalcFunction = findLowestAvailableSuffix(state.nodes, 'calcFunction', ['CF']);
      const nextCalcHierarchical = findLowestAvailableSuffix(state.nodes, 'calcHierarchical', ['CH']);
      const nextMargin = findLowestAvailableSuffix(state.nodes, 'margin', ['E']);
      const nextDecision = findLowestAvailableSuffix(state.nodes, 'decision', ['D']);
      const nextPerf = findLowestAvailableSuffix(state.nodes, 'performance', ['P']);
      const nextInput = findLowestAvailableSuffix(state.nodes, 'input', ['I']);
      const nextProbe = findLowestAvailableSuffix(state.nodes, 'probe', ['PR']);
      const nextHierarchicalInput = findLowestAvailableSuffix(state.nodes, 'hierarchicalInput', ['IP']);
      const nextHierarchicalOutput = findLowestAvailableSuffix(state.nodes, 'hierarchicalOutput', ['OP']);

      if (nodeType === 'calc') {
        overrides.stepNumber = nextCalc;
        overrides.autoLabel = `F${nextCalc}`;
        overrides.label = `F${nextCalc}`;
        newState.nextCalcNumber = nextCalc + 1;
      } else if (nodeType === 'calcFunction') {
        overrides.stepNumber = nextCalcFunction;
        overrides.autoLabel = `CF${nextCalcFunction}`;
        overrides.label = `CF${nextCalcFunction}`;
        overrides.functionCode = 'def calc(x):\n    return x';
        newState.nextCalcFunctionNumber = nextCalcFunction + 1;
      } else if (nodeType === 'calcHierarchical') {
        overrides.autoLabel = `CH${nextCalcHierarchical}`;
        overrides.label = `CH${nextCalcHierarchical}`;
        overrides.ports = { inputs: ['in'], outputs: ['out'] };
        overrides.subGraph = { nodes: [], edges: [] };
        newState.nextCalcHierarchicalNumber = nextCalcHierarchical + 1;
    } else if (nodeType === 'input') {
        overrides.autoLabel = `I${nextInput}`;
        overrides.label = `I${nextInput}`;
        newState.nextInputNumber = nextInput + 1;
      } else if (nodeType === 'margin') {
        overrides.autoLabel = `E${nextMargin}`;
        overrides.label = `E${nextMargin}`;
        newState.nextMarginNumber = nextMargin + 1;
      } else if (nodeType === 'decision') {
        overrides.autoLabel = `D${nextDecision}`;
        overrides.label = `D${nextDecision}`;
        newState.nextDecisionNumber = nextDecision + 1;
      } else if (nodeType === 'performance') {
        overrides.autoLabel = `P${nextPerf}`;
        overrides.label = `P${nextPerf}`;
        newState.nextPerformanceNumber = nextPerf + 1;
      } else if (nodeType === 'probe') {
        overrides.autoLabel = `PR${nextProbe}`;
        overrides.label = `PR${nextProbe}`;
        newState.nextProbeNumber = nextProbe + 1;
      } else if (nodeType === 'hierarchicalInput') {
        overrides.autoLabel = `IP${nextHierarchicalInput}`;
        overrides.label = `IP${nextHierarchicalInput}`;
        overrides.portName = `IP${nextHierarchicalInput}`;
      } else if (nodeType === 'hierarchicalOutput') {
        overrides.autoLabel = `OP${nextHierarchicalOutput}`;
        overrides.label = `OP${nextHierarchicalOutput}`;
        overrides.portName = `OP${nextHierarchicalOutput}`;
      }

      const node = createNode(nodeType, x, y, overrides);
      return {
        ...newState,
        nodes: [...state.nodes, node],
        selectedId: node.id,
      };
    }

    case 'UPDATE_NODE':
      {
        const incoming = { ...action.node };
        const label = String(incoming.label || '').trim();

        // Keep auto labels aligned when user edits canonical names.
        if (incoming.type === 'calc') {
          const m = label.match(/^F(\d+)$/i);
          if (m) {
            incoming.autoLabel = `F${Number(m[1])}`;
            incoming.stepNumber = Number(m[1]);
          }
        } else if (incoming.type === 'calcFunction') {
          const m = label.match(/^CF(\d+)$/i);
          if (m) {
            incoming.autoLabel = `CF${Number(m[1])}`;
            incoming.stepNumber = Number(m[1]);
          }
        } else if (incoming.type === 'input') {
          const m = label.match(/^I(\d+)$/i);
          if (m) incoming.autoLabel = `I${Number(m[1])}`;
        } else if (incoming.type === 'decision') {
          const m = label.match(/^D(\d+)$/i);
          if (m) incoming.autoLabel = `D${Number(m[1])}`;
        } else if (incoming.type === 'margin') {
          const m = label.match(/^E(\d+)$/i);
          if (m) incoming.autoLabel = `E${Number(m[1])}`;
        } else if (incoming.type === 'performance') {
          const m = label.match(/^P(\d+)$/i);
          if (m) incoming.autoLabel = `P${Number(m[1])}`;
        } else if (incoming.type === 'probe') {
          const m = label.match(/^PR(\d+)$/i);
          if (m) incoming.autoLabel = `PR${Number(m[1])}`;
        } else if (incoming.type === 'calcHierarchical') {
          const m = label.match(/^CH(\d+)$/i);
          if (m) incoming.autoLabel = `CH${Number(m[1])}`;
        }

        const updatedNodes = state.nodes.map(n => n.id === incoming.id ? incoming : n);
        return {
          ...state,
          nodes: updatedNodes,
          clusters: fitClustersToMembers(state.clusters, updatedNodes),
        };
      }

    case 'MOVE_NODE':
      {
        const pos = repelOverlaps(state.nodes, action.id, action.x, action.y);
        const movedNodes = state.nodes.map(n =>
          n.id === action.id ? { ...n, x: pos.x, y: pos.y } : n
        );
        const clearedEdges = state.edges.map(e =>
          (e.from === action.id || e.to === action.id) && e.waypoints
            ? { ...e, waypoints: null }
            : e
        );
        return {
          ...state,
          nodes: movedNodes,
          edges: clearedEdges,
          clusters: fitClustersToMembers(state.clusters, movedNodes),
        };
      }

    case 'DELETE_NODE':
      {
      const removedEdgeIds = new Set(
        state.edges
          .filter(e => e.from === action.id || e.to === action.id)
          .map(e => e.id)
      );
      const remainingNodes = state.nodes
        .filter(n => n.id !== action.id)
        .map((n) => {
          if (n.type !== 'probe') return n;
          if (!n.probeEdgeId || !removedEdgeIds.has(n.probeEdgeId)) return n;
          return { ...n, probeEdgeId: null, probeEdgeT: 0.5 };
        });
      return {
        ...state,
        nodes: remainingNodes,
        edges: state.edges.filter(e => e.from !== action.id && e.to !== action.id),
        clusters: fitClustersToMembers(state.clusters, remainingNodes),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      };
      }

    case 'ADD_EDGE': {
      const sourceNode = state.nodes.find(n => n.id === action.from);
      const targetNode = state.nodes.find(n => n.id === action.to);
      if (sourceNode?.type === 'probe' || targetNode?.type === 'probe') return state;
      const dup = state.edges.find(
        e =>
          e.from === action.from &&
          e.to === action.to &&
          (e.fromPort || null) === (action.fromPort || null) &&
          (e.toPort || null) === (action.toPort || null) &&
          e.edgeType === action.edgeType
      );
      if (dup || action.from === action.to) return state;
      return {
        ...state,
        edges: [...state.edges, {
          id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          from: action.from,
          to: action.to,
          fromPort: action.fromPort || null,
          toPort: action.toPort || null,
          edgeType: action.edgeType,
        }],
      };
    }

    case 'DELETE_EDGE':
      return {
        ...state,
        edges: state.edges.filter(e => e.id !== action.id),
        nodes: state.nodes.map((n) => {
          if (n.type !== 'probe') return n;
          if (n.probeEdgeId !== action.id) return n;
          return { ...n, probeEdgeId: null, probeEdgeT: 0.5 };
        }),
      };

    case 'UPDATE_EDGE':
      return {
        ...state,
        edges: state.edges.map((e) => (
          e.id === action.id ? { ...e, ...(action.patch || {}) } : e
        )),
      };

    case 'ADD_CLUSTER':
      return {
        ...state,
        clusters: [...state.clusters, action.cluster],
      };

    case 'MOVE_CLUSTER':
      {
        const current = state.clusters.find(c => c.id === action.id);
        if (!current) return state;
        const dx = action.x - current.x;
        const dy = action.y - current.y;
        const clusterNodeIds = new Set(
          state.nodes.filter(n => n.clusterId === current.id).map(n => n.id)
        );
        const movedNodes = state.nodes.map((n) =>
          n.clusterId === current.id
            ? { ...n, x: n.x + dx, y: n.y + dy }
            : n
        );
        const movedClusters = state.clusters.map(c =>
          c.id === action.id ? { ...c, x: action.x, y: action.y } : c
        );
        const clearedEdges = state.edges.map(e =>
          (clusterNodeIds.has(e.from) || clusterNodeIds.has(e.to)) && e.waypoints
            ? { ...e, waypoints: null }
            : e
        );
        return {
          ...state,
          nodes: movedNodes,
          edges: clearedEdges,
          clusters: fitClustersToMembers(movedClusters, movedNodes),
        };
      }

    case 'UPDATE_CLUSTER':
      return {
        ...state,
        clusters: state.clusters.map(c => c.id === action.cluster.id ? { ...c, ...action.cluster } : c),
      };

    case 'DELETE_CLUSTER':
      return {
        ...state,
        clusters: state.clusters.filter(c => c.id !== action.id),
        nodes: state.nodes.map(n =>
          n.clusterId === action.id ? { ...n, clusterId: null } : n
        ),
      };

    case 'SELECT':
      return { ...state, selectedId: action.id };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(3, Math.max(0.2, action.zoom)) };

    case 'SET_PAN':
      return { ...state, panOffset: action.offset };

    case 'START_CONNECTING':
      return { ...state, connecting: { fromId: action.fromId, fromPort: action.fromPort || null } };

    case 'CANCEL_CONNECTING':
      return { ...state, connecting: null };

    case 'FINISH_CONNECTING': {
      if (!state.connecting || state.connecting.fromId === action.toId) {
        return { ...state, connecting: null };
      }
      // When drawing an arrow INTO a margin node, auto-assign the edge type
      // based on what the SOURCE node is:
      //   decision node  → 'decided'   (renders black)
      //   anything else  → 'threshold' (renders red)
      const targetNode = state.nodes.find(n => n.id === action.toId);
      const sourceNode = state.nodes.find(n => n.id === state.connecting.fromId);
      if (sourceNode?.type === 'probe' || targetNode?.type === 'probe') {
        return { ...state, connecting: null };
      }
      let edgeType = 'plain';
      if (targetNode?.type === 'margin') {
        edgeType = sourceNode?.type === 'decision' ? 'decided' : 'threshold';
      }
      const dup = state.edges.find(
        e =>
          e.from === state.connecting.fromId &&
          e.to === action.toId &&
          (e.fromPort || null) === (state.connecting.fromPort || null) &&
          (e.toPort || null) === (action.toPort || null)
      );
      if (dup) return { ...state, connecting: null };
      return {
        ...state,
        connecting: null,
        edges: [...state.edges, {
          id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          from: state.connecting.fromId,
          to: action.toId,
          fromPort: state.connecting.fromPort || null,
          toPort: action.toPort || null,
          edgeType,
        }],
      };
    }

    case 'TOGGLE_INTEREST':
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.id ? { ...n, isOfInterest: !n.isOfInterest } : n
        ),
      };

    case 'UPDATE_SUBGRAPH':
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.nodeId
            ? { ...n, subGraph: action.subGraph, ports: action.ports || n.ports }
            : n
        ),
      };

    case 'LOAD_GRAPH':
      {
        const nextCalc = parseMaxSuffix(action.nodes, 'calc', ['F', 'Step\\s*']) + 1;
        const nextCalcFunction = parseMaxSuffix(action.nodes, 'calcFunction', ['CF']) + 1;
        const nextCalcHierarchical = parseMaxSuffix(action.nodes, 'calcHierarchical', ['CH']) + 1;
        const nextMargin = parseMaxSuffix(action.nodes, 'margin', ['E']) + 1;
        const nextDecision = parseMaxSuffix(action.nodes, 'decision', ['D']) + 1;
        const nextPerformance = parseMaxSuffix(action.nodes, 'performance', ['P']) + 1;
        const nextInput = parseMaxSuffix(action.nodes, 'input', ['I']) + 1;
        const nextProbe = parseMaxSuffix(action.nodes, 'probe', ['PR']) + 1;
        return {
          ...initialState,
          nodes: action.nodes,
          edges: action.edges,
          clusters: fitClustersToMembers(action.clusters || [], action.nodes || []),
          nextCalcNumber: Math.max(1, nextCalc),
          nextCalcFunctionNumber: Math.max(1, nextCalcFunction),
          nextCalcHierarchicalNumber: Math.max(1, nextCalcHierarchical),
          nextMarginNumber: Math.max(1, nextMargin),
          nextDecisionNumber: Math.max(1, nextDecision),
          nextPerformanceNumber: Math.max(1, nextPerformance),
          nextInputNumber: Math.max(1, nextInput),
          nextProbeNumber: Math.max(1, nextProbe),
        };
      }

    case 'SET_NODES':
      return {
        ...state,
        nodes: action.nodes,
        clusters: fitClustersToMembers(state.clusters, action.nodes),
      };

    case 'CLEAR':
      return { ...initialState };

    default:
      return state;
  }
}

export function useGraphStore() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addNode = useCallback((type, x, y) =>
    dispatch({ type: 'ADD_NODE', nodeType: type, x, y }), []);
  const updateNode = useCallback((node) =>
    dispatch({ type: 'UPDATE_NODE', node }), []);
  const moveNode = useCallback((id, x, y) =>
    dispatch({ type: 'MOVE_NODE', id, x, y }), []);
  const deleteNode = useCallback((id) =>
    dispatch({ type: 'DELETE_NODE', id }), []);
  const addEdge = useCallback((from, to, edgeType, fromPort = null, toPort = null) =>
    dispatch({ type: 'ADD_EDGE', from, to, edgeType, fromPort, toPort }), []);
  const deleteEdge = useCallback((id) =>
    dispatch({ type: 'DELETE_EDGE', id }), []);
  const updateEdge = useCallback((id, patch) =>
    dispatch({ type: 'UPDATE_EDGE', id, patch }), []);
  const addCluster = useCallback((cluster) =>
    dispatch({ type: 'ADD_CLUSTER', cluster }), []);
  const moveCluster = useCallback((id, x, y) =>
    dispatch({ type: 'MOVE_CLUSTER', id, x, y }), []);
  const updateCluster = useCallback((cluster) =>
    dispatch({ type: 'UPDATE_CLUSTER', cluster }), []);
  const deleteCluster = useCallback((id) =>
    dispatch({ type: 'DELETE_CLUSTER', id }), []);
  const select = useCallback((id) =>
    dispatch({ type: 'SELECT', id }), []);
  const setZoom = useCallback((zoom) =>
    dispatch({ type: 'SET_ZOOM', zoom }), []);
  const setPan = useCallback((offset) =>
    dispatch({ type: 'SET_PAN', offset }), []);
  const startConnecting = useCallback((fromId, fromPort = null) =>
    dispatch({ type: 'START_CONNECTING', fromId, fromPort }), []);
  const cancelConnecting = useCallback(() =>
    dispatch({ type: 'CANCEL_CONNECTING' }), []);
  const finishConnecting = useCallback((toId, toPort = null) =>
    dispatch({ type: 'FINISH_CONNECTING', toId, toPort }), []);
  const toggleInterest = useCallback((id) =>
    dispatch({ type: 'TOGGLE_INTEREST', id }), []);
  const loadGraph = useCallback((data) =>
    dispatch({ type: 'LOAD_GRAPH', ...data }), []);
  const clear = useCallback(() =>
    dispatch({ type: 'CLEAR' }), []);
  const setNodes = useCallback((nodes) =>
    dispatch({ type: 'SET_NODES', nodes }), []);
  const updateSubGraph = useCallback((nodeId, subGraph, ports) =>
    dispatch({ type: 'UPDATE_SUBGRAPH', nodeId, subGraph, ports }), []);

  return {
    state,
    addNode, updateNode, moveNode, deleteNode,
    addEdge, deleteEdge,
    updateEdge,
    addCluster, moveCluster, updateCluster, deleteCluster,
    select, setZoom, setPan,
    startConnecting, cancelConnecting, finishConnecting,
    toggleInterest, loadGraph, clear, setNodes,
    updateSubGraph,
  };
}
