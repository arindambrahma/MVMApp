import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
const NODE_TYPES = {
  INPUT: "input",
  CALC: "calc",
  DECISION: "decision",
  MARGIN: "margin",
  PERFORMANCE: "performance",
};

const NODE_META = {
  input:       { label: "Input Parameter",    color: "#F59E0B", bg: "#FEF3C7", border: "#D97706", shape: "diamond" },
  calc:        { label: "Calculation Step",   color: "#3B82F6", bg: "#EFF6FF", border: "#2563EB", shape: "circle"  },
  decision:    { label: "Decision Step",      color: "#8B5CF6", bg: "#F5F3FF", border: "#7C3AED", shape: "diamond" },
  margin:      { label: "Margin Node",        color: "#EF4444", bg: "#FEF2F2", border: "#DC2626", shape: "hexagon" },
  performance: { label: "Performance Param",  color: "#10B981", bg: "#ECFDF5", border: "#059669", shape: "circle"  },
};

const EMPTY_NODE = (type, x, y) => ({
  id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  type,
  x, y,
  label: NODE_META[type].label,
  description: "",
  unit: "",
  value: "",
  equation: "",
});

// ─── Geometry helpers ─────────────────────────────────────────────────────────
const NODE_W = 130, NODE_H = 50;

function nodeCenter(n) {
  return { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 };
}

function edgePoints(from, to) {
  const f = nodeCenter(from), t = nodeCenter(to);
  return { x1: f.x, y1: f.y, x2: t.x, y2: t.y };
}

// ─── Shape renderers ─────────────────────────────────────────────────────────
function NodeShape({ node, selected, onMouseDown, onClick }) {
  const meta = NODE_META[node.type];
  const cx = NODE_W / 2, cy = NODE_H / 2;
  const sel = selected ? "0 0 0 2px #fff, 0 0 0 4px " + meta.color : "none";

  const common = {
    position: "absolute",
    left: node.x, top: node.y,
    width: NODE_W, height: NODE_H,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "grab",
    userSelect: "none",
    filter: selected ? `drop-shadow(0 0 6px ${meta.color})` : "none",
    transition: "filter 0.15s",
  };

  const textStyle = {
    fontSize: 11, fontWeight: 600, color: meta.color,
    textAlign: "center", lineHeight: 1.2,
    maxWidth: NODE_W - 16, overflow: "hidden",
    pointerEvents: "none",
  };

  if (meta.shape === "diamond") {
    const pts = `${cx},4 ${NODE_W - 4},${cy} ${cx},${NODE_H - 4} 4,${cy}`;
    return (
      <div style={common} onMouseDown={onMouseDown} onClick={onClick}>
        <svg width={NODE_W} height={NODE_H} style={{ position: "absolute" }}>
          <polygon points={pts} fill={meta.bg} stroke={meta.border} strokeWidth={selected ? 2.5 : 1.5} />
        </svg>
        <span style={textStyle}>{node.label}</span>
      </div>
    );
  }

  if (meta.shape === "hexagon") {
    const r = NODE_H / 2 - 3;
    const dx = r * Math.cos(Math.PI / 6);
    const pts = [
      [cx - 2 * dx, cy], [cx - dx, cy - r], [cx + dx, cy - r],
      [cx + 2 * dx, cy], [cx + dx, cy + r], [cx - dx, cy + r],
    ].map(([x, y]) => `${x},${y}`).join(" ");
    return (
      <div style={common} onMouseDown={onMouseDown} onClick={onClick}>
        <svg width={NODE_W} height={NODE_H} style={{ position: "absolute" }}>
          <polygon points={pts} fill={meta.bg} stroke={meta.border} strokeWidth={selected ? 2.5 : 1.5} />
        </svg>
        <span style={textStyle}>{node.label}</span>
      </div>
    );
  }

  // circle / default
  return (
    <div style={common} onMouseDown={onMouseDown} onClick={onClick}>
      <svg width={NODE_W} height={NODE_H} style={{ position: "absolute" }}>
        <ellipse cx={cx} cy={cy} rx={NODE_W / 2 - 4} ry={NODE_H / 2 - 4}
          fill={meta.bg} stroke={meta.border} strokeWidth={selected ? 2.5 : 1.5} />
      </svg>
      <span style={textStyle}>{node.label}</span>
    </div>
  );
}

// ─── Edge with arrowhead ─────────────────────────────────────────────────────
function Edge({ from, to, isTarget, color = "#6B7280", onDelete }) {
  const { x1, y1, x2, y2 } = edgePoints(from, to);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

  const arrowSize = 10;
  const ax1 = x2 - ux * arrowSize - uy * arrowSize / 2;
  const ay1 = y2 - uy * arrowSize + ux * arrowSize / 2;
  const ax2 = x2 - ux * arrowSize + uy * arrowSize / 2;
  const ay2 = y2 - uy * arrowSize - ux * arrowSize / 2;

  const c = isTarget ? "#EF4444" : color;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={isTarget ? 2 : 1.5}
        strokeDasharray={isTarget ? "5,3" : "none"} opacity={0.8} />
      <polygon points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={c} opacity={0.8} />
      <circle cx={mx} cy={my} r={7} fill="white" stroke={c} strokeWidth={1}
        style={{ cursor: "pointer" }}
        onClick={() => onDelete && onDelete()} />
      <text x={mx} y={my} textAnchor="middle" dominantBaseline="central"
        fontSize={10} fill={c} style={{ pointerEvents: "none" }}>✕</text>
    </g>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, background: "#fff",
      border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 16px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)", zIndex: 100, minWidth: 200 }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#374151" }}>
        NODE LEGEND
      </div>
      {Object.entries(NODE_META).map(([type, meta]) => (
        <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{ width: 16, height: 16, borderRadius: meta.shape === "circle" ? "50%" : 2,
            background: meta.bg, border: `2px solid ${meta.border}`,
            clipPath: meta.shape === "hexagon" ? "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"
              : meta.shape === "diamond" ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" : "none",
          }} />
          <span style={{ fontSize: 11, color: "#6B7280" }}>{meta.label}</span>
        </div>
      ))}
      <div style={{ marginTop: 8, borderTop: "1px solid #E5E7EB", paddingTop: 8, fontSize: 11, color: "#9CA3AF" }}>
        <div>— Normal flow</div>
        <div style={{ color: "#EF4444" }}>— · Target threshold</div>
      </div>
    </div>
  );
}

// ─── Property Panel ──────────────────────────────────────────────────────────
function PropertyPanel({ node, onChange, onDelete }) {
  if (!node) return (
    <div style={{ width: 260, padding: "20px 16px", background: "#F9FAFB",
      borderLeft: "1px solid #E5E7EB", display: "flex", alignItems: "center",
      justifyContent: "center", color: "#9CA3AF", fontSize: 13 }}>
      Select a node to edit
    </div>
  );

  const meta = NODE_META[node.type];
  const field = (label, key, placeholder, type = "text") => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      {key === "description" ? (
        <textarea rows={3} value={node[key] || ""} placeholder={placeholder}
          onChange={e => onChange({ ...node, [key]: e.target.value })}
          style={{ padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 6,
            fontSize: 12, resize: "vertical", fontFamily: "inherit" }} />
      ) : (
        <input type={type} value={node[key] || ""} placeholder={placeholder}
          onChange={e => onChange({ ...node, [key]: e.target.value })}
          style={{ padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12 }} />
      )}
    </label>
  );

  return (
    <div style={{ width: 260, padding: "16px", background: "#F9FAFB",
      borderLeft: "1px solid #E5E7EB", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 12, height: 12, borderRadius: 3, background: meta.color }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{meta.label}</span>
      </div>
      {field("Label / Name", "label", "e.g. P_required")}
      {field("Description", "description", "What this node represents…")}
      {(node.type === "input" || node.type === "margin") &&
        field("Value", "value", "e.g. 27.25")}
      {node.type !== "input" && node.type !== "performance" &&
        field("Equation / Formula", "equation", "e.g. P_A / eta_i / DF")}
      {(node.type === "input" || node.type === "performance") &&
        field("Unit", "unit", "e.g. kW, Nm, $")}
      <button onClick={() => onDelete(node.id)}
        style={{ marginTop: 8, width: "100%", padding: "8px", background: "#FEF2F2",
          border: "1px solid #FCA5A5", borderRadius: 6, color: "#DC2626",
          cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
        Delete Node
      </button>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────
function Toolbar({ onAdd, onExport, onImport, onClear }) {
  const fileRef = useRef();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
      background: "#111827", borderBottom: "1px solid #374151", flexWrap: "wrap" }}>
      <span style={{ color: "#F9FAFB", fontWeight: 800, fontSize: 15, marginRight: 8,
        fontFamily: "'Georgia', serif", letterSpacing: -0.5 }}>
        MAN Diagram Tool
      </span>
      {Object.entries(NODE_META).map(([type, meta]) => (
        <button key={type} onClick={() => onAdd(type)}
          style={{ padding: "5px 12px", background: meta.bg, border: `1.5px solid ${meta.border}`,
            borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, color: meta.color,
            whiteSpace: "nowrap" }}>
          + {meta.label}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button onClick={onExport}
        style={{ padding: "5px 14px", background: "#1D4ED8", border: "none", borderRadius: 6,
          color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
        Export JSON
      </button>
      <button onClick={() => fileRef.current.click()}
        style={{ padding: "5px 14px", background: "#374151", border: "none", borderRadius: 6,
          color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
        Import JSON
      </button>
      <button onClick={onClear}
        style={{ padding: "5px 14px", background: "#7F1D1D", border: "none", borderRadius: 6,
          color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
        Clear
      </button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
        onChange={e => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => onImport(ev.target.result);
          reader.readAsText(file);
          e.target.value = "";
        }} />
    </div>
  );
}

// ─── Export Panel ─────────────────────────────────────────────────────────────
function ExportPanel({ nodes, edges, onClose }) {
  const [tab, setTab] = useState("json");

  const json = JSON.stringify({ nodes, edges }, null, 2);

  const pythonCode = `# Auto-generated MAN setup from diagram
# Paste into your mvm_core.py project

from mvm_core import MANEngine, CalculationNode, DecisionNode

man = MANEngine()

# ── Parameters ──────────────────────────────────────────────
${nodes.filter(n => n.type === "input").map(n =>
  `man.set_params(${n.label.replace(/[^a-zA-Z0-9_]/g, "_")}=${n.value || 0})  # ${n.description || n.label} [${n.unit || ""}]`
).join("\n")}

man.mark_input(${nodes.filter(n => n.type === "input").map(n => `"${n.label.replace(/[^a-zA-Z0-9_]/g, "_")}"`).join(", ")})
man.mark_performance(${nodes.filter(n => n.type === "performance").map(n => `"${n.label.replace(/[^a-zA-Z0-9_]/g, "_")}"`).join(", ")})

# ── Calculation nodes ────────────────────────────────────────
${nodes.filter(n => n.type === "calc").map(n => {
  const inEdges = edges.filter(e => e.to === n.id).map(e => {
    const src = nodes.find(nd => nd.id === e.from);
    return src ? src.label.replace(/[^a-zA-Z0-9_]/g, "_") : "?";
  });
  const outEdges = edges.filter(e => e.from === n.id).map(e => {
    const tgt = nodes.find(nd => nd.id === e.to);
    return tgt ? tgt.label.replace(/[^a-zA-Z0-9_]/g, "_") : "?";
  });
  const outName = outEdges[0] || n.label.replace(/[^a-zA-Z0-9_]/g, "_") + "_out";
  const params = inEdges.join(", ");
  return `man.add_calc(CalculationNode(
    name="${n.label}",
    func=lambda ${params}: ${n.equation || "# TODO: fill in formula"},
    input_names=[${inEdges.map(p => `"${p}"`).join(", ")}],
    output_name="${outName}",
    description="${n.description || ""}",
))`;
}).join("\n\n")}

# ── Decision nodes ───────────────────────────────────────────
${nodes.filter(n => n.type === "decision").map(n => {
  const inEdges = edges.filter(e => e.to === n.id).map(e => {
    const src = nodes.find(nd => nd.id === e.from);
    return src ? src.label.replace(/[^a-zA-Z0-9_]/g, "_") : "?";
  });
  const params = inEdges.join(", ");
  const dName = n.label.replace(/[^a-zA-Z0-9_]/g, "_");
  return `man.add_decision(DecisionNode(
    name="${n.label}",
    func=lambda ${params}: select_${dName}(${params}),  # TODO: define select_${dName}()
    threshold_func=lambda ${params}: ${params.split(",")[0].trim()},
    input_names=[${inEdges.map(p => `"${p}"`).join(", ")}],
    decided_name="${dName}_decided",
    threshold_name="${dName}_threshold",
    description="${n.description || ""}",
))`;
}).join("\n\n")}

# ── Run analysis ─────────────────────────────────────────────
result = man.analyse()
print(result.summary_table())

from mvm_plot import plot_margin_value
plot_margin_value(result, save_path="margin_value_plot.png")
`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "80%", maxWidth: 800,
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 20px",
          borderBottom: "1px solid #E5E7EB" }}>
          <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>Export Network</span>
          <button onClick={onClose} style={{ background: "none", border: "none",
            fontSize: 20, cursor: "pointer", color: "#6B7280" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 0, padding: "12px 20px 0" }}>
          {[["json", "JSON Data"], ["python", "Python MVM Code"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: "6px 16px", borderRadius: "6px 6px 0 0",
                border: "1px solid #E5E7EB", borderBottom: tab === id ? "none" : "1px solid #E5E7EB",
                background: tab === id ? "#fff" : "#F9FAFB",
                fontWeight: tab === id ? 700 : 400, cursor: "pointer", fontSize: 12,
                color: tab === id ? "#111827" : "#6B7280", marginRight: 4 }}>
              {lbl}
            </button>
          ))}
        </div>
        <pre style={{ flex: 1, overflowY: "auto", margin: 0, padding: "16px 20px",
          background: "#F8FAFC", fontSize: 11.5, lineHeight: 1.7,
          borderTop: "1px solid #E5E7EB", fontFamily: "monospace" }}>
          {tab === "json" ? json : pythonCode}
        </pre>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 8 }}>
          <button onClick={() => navigator.clipboard.writeText(tab === "json" ? json : pythonCode)}
            style={{ padding: "8px 20px", background: "#1D4ED8", color: "#fff",
              border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
            Copy to Clipboard
          </button>
          <button onClick={() => {
            const blob = new Blob([tab === "json" ? json : pythonCode],
              { type: tab === "json" ? "application/json" : "text/plain" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = tab === "json" ? "man_diagram.json" : "man_setup.py";
            a.click();
          }}
            style={{ padding: "8px 20px", background: "#059669", color: "#fff",
              border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
            Download File
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function MANDiagram() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [dragging, setDragging] = useState(null);   // { id, ox, oy }
  const [connecting, setConnecting] = useState(null); // { fromId, isTarget }
  const [showExport, setShowExport] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef();
  const svgRef = useRef();

  const selected = nodes.find(n => n.id === selectedId) || null;

  // Load conveyor example on first load
  useEffect(() => {
    const example = buildConveyorExample();
    setNodes(example.nodes);
    setEdges(example.edges);
  }, []);

  // ── Node management ────────────────────────────────────────────────────────
  const addNode = useCallback((type) => {
    const cx = window.innerWidth / 2 - canvasOffset.x - NODE_W / 2;
    const cy = window.innerHeight / 2 - canvasOffset.y - NODE_H / 2;
    const n = EMPTY_NODE(type, cx / zoom, cy / zoom);
    setNodes(prev => [...prev, n]);
    setSelectedId(n.id);
  }, [canvasOffset, zoom]);

  const updateNode = useCallback((updated) => {
    setNodes(prev => prev.map(n => n.id === updated.id ? updated : n));
  }, []);

  const deleteNode = useCallback((id) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    setSelectedId(null);
  }, []);

  // ── Dragging ───────────────────────────────────────────────────────────────
  const onNodeMouseDown = useCallback((e, id) => {
    e.stopPropagation();
    if (connecting) return;
    const node = nodes.find(n => n.id === id);
    setDragging({ id, ox: e.clientX / zoom - node.x, oy: e.clientY / zoom - node.y });
    setSelectedId(id);
  }, [nodes, connecting, zoom]);

  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    const nx = e.clientX / zoom - dragging.ox;
    const ny = e.clientY / zoom - dragging.oy;
    setNodes(prev => prev.map(n => n.id === dragging.id ? { ...n, x: nx, y: ny } : n));
  }, [dragging, zoom]);

  const onMouseUp = useCallback(() => setDragging(null), []);

  // ── Connecting ─────────────────────────────────────────────────────────────
  const startConnect = useCallback((e, id, isTarget) => {
    e.stopPropagation();
    e.preventDefault();
    setConnecting({ fromId: id, isTarget });
  }, []);

  const finishConnect = useCallback((toId) => {
    if (!connecting || connecting.fromId === toId) {
      setConnecting(null);
      return;
    }
    const dup = edges.find(e => e.from === connecting.fromId && e.to === toId);
    if (!dup) {
      setEdges(prev => [...prev, {
        id: `edge_${Date.now()}`,
        from: connecting.fromId, to: toId,
        isTarget: connecting.isTarget,
      }]);
    }
    setConnecting(null);
  }, [connecting, edges]);

  const deleteEdge = useCallback((id) => {
    setEdges(prev => prev.filter(e => e.id !== id));
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") &&
          selectedId && document.activeElement.tagName !== "INPUT" &&
          document.activeElement.tagName !== "TEXTAREA") {
        deleteNode(selectedId);
      }
      if (e.key === "Escape") {
        setConnecting(null);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, deleteNode]);

  // ── Export / Import ────────────────────────────────────────────────────────
  const importJSON = useCallback((raw) => {
    try {
      const data = JSON.parse(raw);
      if (data.nodes && data.edges) {
        setNodes(data.nodes);
        setEdges(data.edges);
        setSelectedId(null);
      }
    } catch {
      alert("Invalid JSON file.");
    }
  }, []);

  // ── Canvas pan ─────────────────────────────────────────────────────────────
  const [panning, setPanning] = useState(null);

  const onCanvasMouseDown = useCallback((e) => {
    if (e.target === canvasRef.current || e.target === svgRef.current) {
      setPanning({ sx: e.clientX - canvasOffset.x, sy: e.clientY - canvasOffset.y });
      setSelectedId(null);
      if (connecting) setConnecting(null);
    }
  }, [canvasOffset, connecting]);

  const onCanvasMouseMove = useCallback((e) => {
    if (panning) {
      setCanvasOffset({ x: e.clientX - panning.sx, y: e.clientY - panning.sy });
    }
    if (dragging) onMouseMove(e);
  }, [panning, dragging, onMouseMove]);

  const onCanvasMouseUp = useCallback((e) => {
    setPanning(null);
    onMouseUp();
  }, [onMouseUp]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex",
      flexDirection: "column", overflow: "hidden", fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      background: "#0F172A" }}>

      <Toolbar
        onAdd={addNode}
        onExport={() => setShowExport(true)}
        onImport={importJSON}
        onClear={() => { setNodes([]); setEdges([]); setSelectedId(null); }}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Canvas */}
        <div
          ref={canvasRef}
          style={{ flex: 1, position: "relative", overflow: "hidden",
            background: "#0F172A", cursor: panning ? "grabbing" : connecting ? "crosshair" : "default" }}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onWheel={onWheel}
        >
          {/* Grid dots */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <defs>
              <pattern id="grid" width={30 * zoom} height={30 * zoom} patternUnits="userSpaceOnUse"
                x={canvasOffset.x % (30 * zoom)} y={canvasOffset.y % (30 * zoom)}>
                <circle cx={1} cy={1} r={1} fill="#1E293B" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Zoom/pan container */}
          <div style={{
            position: "absolute",
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: 4000, height: 3000,
          }}>
            {/* Edges SVG */}
            <svg
              ref={svgRef}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
            >
              {edges.map(edge => {
                const fn = nodes.find(n => n.id === edge.from);
                const tn = nodes.find(n => n.id === edge.to);
                if (!fn || !tn) return null;
                return (
                  <Edge key={edge.id} from={fn} to={tn}
                    isTarget={edge.isTarget}
                    onDelete={() => deleteEdge(edge.id)} />
                );
              })}
            </svg>

            {/* Nodes */}
            {nodes.map(node => (
              <div key={node.id} style={{ position: "absolute", left: node.x, top: node.y }}>
                <NodeShape
                  node={node}
                  selected={selectedId === node.id}
                  onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                  onClick={() => connecting ? finishConnect(node.id) : setSelectedId(node.id)}
                />
                {/* Connect buttons */}
                <div style={{ position: "absolute", top: -14, left: NODE_W / 2 - 7,
                  display: "flex", gap: 2 }}>
                  <button title="Connect (normal flow)" onClick={e => { e.stopPropagation(); startConnect(e, node.id, false); }}
                    style={{ width: 14, height: 14, borderRadius: "50%", background: "#3B82F6",
                      border: "none", cursor: "crosshair", fontSize: 8, color: "white",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
                  <button title="Connect (target threshold)" onClick={e => { e.stopPropagation(); startConnect(e, node.id, true); }}
                    style={{ width: 14, height: 14, borderRadius: "50%", background: "#EF4444",
                      border: "none", cursor: "crosshair", fontSize: 8, color: "white",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>⊣</button>
                </div>
              </div>
            ))}
          </div>

          {/* HUD */}
          <div style={{ position: "absolute", bottom: 12, left: 12, color: "#475569",
            fontSize: 11, background: "rgba(15,23,42,0.8)", padding: "4px 10px", borderRadius: 6 }}>
            Zoom: {(zoom * 100).toFixed(0)}%  |  {nodes.length} nodes  |  {edges.length} edges
            {connecting && <span style={{ color: "#F59E0B", marginLeft: 8 }}>
              🔗 Click target node to connect  (ESC to cancel)</span>}
          </div>
          <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
            color: "#475569", fontSize: 11, background: "rgba(15,23,42,0.8)", padding: "4px 10px", borderRadius: 6 }}>
            Scroll to zoom  •  Drag canvas to pan  •  Blue/Red buttons on node top to connect  •  Del to remove selected
          </div>
        </div>

        {/* Property panel */}
        <PropertyPanel node={selected} onChange={updateNode} onDelete={deleteNode} />
      </div>

      {showExport && (
        <ExportPanel nodes={nodes} edges={edges} onClose={() => setShowExport(false)} />
      )}

      <Legend />
    </div>
  );
}

// ─── Pre-built conveyor example layout ────────────────────────────────────────
function buildConveyorExample() {
  const mk = (id, type, x, y, label, extra = {}) => ({
    id, type, x, y, label, description: extra.desc || "", unit: extra.unit || "",
    value: extra.value || "", equation: extra.equation || "",
  });

  const nodes = [
    // Inputs
    mk("C",     "input",  40,  80,  "C (Capacity)", { unit: "T/h", value: "1200", desc: "Required conveyor capacity" }),
    mk("V",     "input",  40, 160,  "V (Belt speed)", { unit: "m/s", value: "2.5" }),
    mk("rho",   "input",  40, 240,  "ρ (Bulk density)", { unit: "T/m³", value: "0.8" }),
    mk("BCT",   "input",  40, 320,  "B_CT (Carcass wt)", { unit: "kg/m²", value: "6.4" }),
    mk("mu",    "input",  40, 400,  "μ (Friction)", { value: "0.275" }),

    // Calc chain
    mk("resist",   "calc",  260, 120, "1. Calculate\nResistances",    { equation: "R = f·L·g·(...)" }),
    mk("power",    "calc",  500, 120, "2. Calculate\nBelt Power",     { equation: "P_A = P_DP + (R_wd+R_bd)·V/1000" }),
    mk("tension",  "calc",  260, 260, "3. Calculate\nBelt Tension",   { equation: "T1, T2, T_T" }),

    mk("motor_pm2",  "calc",  500, 200, "P_M2\n(Min motor power)", { equation: "P_M1/DF", unit: "kW" }),
    mk("motor_d",    "decision", 700, 180, "4. Select Motor",  { desc: "Next catalogue value ≥ P_M2" }),
    mk("E1",         "margin",  900, 180, "E1 Motor excess",  { desc: "E1 = (P_M - P_M2)/P_M2" }),

    mk("gbox_pgb",   "calc",  500, 310, "P_GB (Gearbox req.)", { equation: "P_M2 × 1.5", unit: "kW" }),
    mk("gbox_d",     "decision", 700, 300, "5. Select Gearbox", { desc: "Next catalogue value ≥ P_GB" }),
    mk("E3",         "margin",  900, 300, "E3 Gearbox excess" }),

    mk("brake_tbr",  "calc",  500, 390, "T_BR (Brake req.)", { equation: "974·SF·g·P_M2/N_1", unit: "Nm" }),
    mk("brake_d",    "decision", 700, 380, "6. Select Brake",  { desc: "Next catalogue size ≥ T_BR" }),
    mk("E2",         "margin",  900, 380, "E2 Brake excess",  { desc: "E2 = (T_BS - T_BR)/T_BR" }),

    mk("pulley_req", "calc",  260, 400, "Pulley req. dia.", { equation: "f(B_CT)" }),
    mk("pulley_d",   "decision", 450, 450, "7. Select Pulleys", { desc: "Standard sizes from IS1891" }),
    mk("E4",         "margin",  650, 480, "E4 Drive pulley" }),
    mk("E5",         "margin",  650, 550, "E5 Tail pulley"  }),
    mk("E6",         "margin",  650, 620, "E6 Snub pulley"  }),

    mk("shaft_calc", "calc",  500, 520, "8. Calculate\nShaft diameters", { equation: "bending + torsion" }),
    mk("drv_d",      "decision", 700, 520, "D5 Drive shaft dia" }),
    mk("tail_d",     "decision", 700, 590, "D6 Tail shaft dia"  }),
    mk("snub_d",     "decision", 700, 660, "D7 Snub shaft dia"  }),
    mk("E8",         "margin",  900, 520, "E8 Drive shaft excess" }),
    mk("E9",         "margin",  900, 590, "E9 Tail shaft excess"  }),
    mk("E7",         "margin",  900, 660, "E7 Snub shaft excess"  }),

    // Performance parameters
    mk("TCS", "performance", 1100, 200, "TCS (Total Cost)",   { unit: "$", desc: "Cost of shafts, pulleys, motor, gearbox, brake" }),
    mk("TWS", "performance", 1100, 300, "TWS (Total Weight)", { unit: "kg" }),
    mk("IS",  "performance", 1100, 400, "IS (Moment of\nInertia)", { unit: "kg·m²" }),
    mk("etam","performance", 1100, 500, "η_m (Motor\nEfficiency)", { unit: "%" }),
  ];

  const edge = (from, to, isTarget = false) => ({
    id: `e_${from}_${to}`, from, to, isTarget,
  });

  const edges = [
    edge("C", "resist"), edge("V", "resist"), edge("rho", "resist"),
    edge("BCT", "pulley_req"),
    edge("mu", "tension"),
    edge("resist", "power"), edge("resist", "tension"),
    edge("power", "motor_pm2"),
    edge("motor_pm2", "motor_d"), edge("motor_pm2", "E1", true),
    edge("motor_d", "E1"),
    edge("E1", "TCS"), edge("E1", "TWS"), edge("E1", "IS"), edge("E1", "etam"),
    edge("motor_pm2", "gbox_pgb"),
    edge("gbox_pgb", "gbox_d"), edge("gbox_pgb", "E3", true),
    edge("gbox_d", "E3"),
    edge("E3", "TCS"), edge("E3", "TWS"),
    edge("motor_pm2", "brake_tbr"),
    edge("brake_tbr", "brake_d"), edge("brake_tbr", "E2", true),
    edge("brake_d", "E2"),
    edge("E2", "TCS"), edge("E2", "TWS"),
    edge("pulley_req", "pulley_d"), edge("pulley_req", "E4", true), edge("pulley_req", "E5", true), edge("pulley_req", "E6", true),
    edge("pulley_d", "E4"), edge("pulley_d", "E5"), edge("pulley_d", "E6"),
    edge("E4", "TCS"), edge("E4", "TWS"),
    edge("E5", "TCS"), edge("E5", "TWS"),
    edge("E6", "TCS"), edge("E6", "TWS"),
    edge("tension", "shaft_calc"), edge("pulley_d", "shaft_calc"),
    edge("shaft_calc", "drv_d"), edge("shaft_calc", "tail_d"), edge("shaft_calc", "snub_d"),
    edge("shaft_calc", "E8", true), edge("shaft_calc", "E9", true), edge("shaft_calc", "E7", true),
    edge("drv_d", "E8"), edge("tail_d", "E9"), edge("snub_d", "E7"),
    edge("E8", "TCS"), edge("E8", "TWS"),
    edge("E9", "TCS"), edge("E9", "TWS"),
    edge("E7", "TCS"), edge("E7", "TWS"),
  ];

  return { nodes, edges };
}
