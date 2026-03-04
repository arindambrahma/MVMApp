# MAN Diagramming Tool — Implementation Plan

## Overview
Build a locally-runnable webapp for constructing Margin Analysis Networks (MANs), matching the visual language from Table 5.2 of Brahma & Wynn (2020).

## Tech Stack
- **Vite + React** — fast dev server with HMR, minimal config
- **No external diagramming library** — custom canvas built on existing MANDiagram.jsx code
- **SVG-based rendering** for shapes and edges
- All in one project folder: `man-diagram-tool/`

## Layout
```
┌─────────────────────────────────────────────────────────┐
│                       Toolbar                           │
│  [Export JSON] [Import JSON] [Export Python] [Clear]    │
├──────────┬───────────────────────────┬──────────────────┤
│          │                           │                  │
│ Element  │       Canvas              │   Property       │
│ Palette  │     (diagram area)        │   Panel          │
│          │                           │                  │
│ ◇ Input  │   Pan/zoom/grid           │  Name: [____]    │
│ ① Calc   │   Nodes + 90° edges       │  Value: [____]   │
│ ◇ Decision│                          │  Unit: [____]    │
│ ⬡ Margin │                           │  Equation: [__]  │
│ ◎ Perf   │                           │  [Delete Node]   │
│          │                           │                  │
├──────────┴───────────────────────────┴──────────────────┤
│  Zoom: 100% | 5 nodes | 4 edges | hint text            │
└─────────────────────────────────────────────────────────┘
```

## Node Types (matching paper's Table 5.2)

| Type | Shape | Visual | Fields |
|------|-------|--------|--------|
| Input Parameter | Small diamond | White fill, thin border | Name, Value, Unit |
| Calculation Step | Circle | Light blue fill | Name, Equation/Description |
| Decision Step | Large diamond | Light blue fill | Name, Description, Catalogue info |
| Margin Node | Hexagon | White fill | Name (auto-labelled E1, E2, …) |
| Performance Parameter | Open circle (donut) | Red/pink ring | Name, Unit |

**Input Parameter of Interest**: NOT a separate node type. Instead, any input parameter can be toggled as "of interest" via a **pre-analysis settings panel** (accessible from toolbar). This marks it orange (vs white for normal inputs) and flags it for deterioration analysis in MVM.

## Edge Routing (90-degree arrows)
- All edges use **orthogonal routing**: only horizontal and vertical segments
- Algorithm: from source port → horizontal segment → vertical segment → horizontal segment → target port
- Arrowhead at target end
- Two edge types:
  - **Solid black** — intermediary parameter (decided value) flow
  - **Solid red** — target threshold flow
- Edge labels for parameter names (optional, shown on hover or always)

## File Structure
```
man-diagram-tool/
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx              — React entry point
    ├── App.jsx               — Main layout (palette | canvas | panel)
    ├── App.css               — Global styles
    ├── constants.js          — Node types, colors, shape definitions
    ├── components/
    │   ├── Palette.jsx       — Left sidebar: draggable element list
    │   ├── Canvas.jsx        — Center: SVG canvas with pan/zoom/grid
    │   ├── NodeShape.jsx     — Individual node rendering (diamond/circle/hex/donut)
    │   ├── OrthogonalEdge.jsx — 90° edge routing with arrowheads
    │   ├── PropertyPanel.jsx — Right sidebar: edit selected node/edge
    │   └── Toolbar.jsx       — Top bar: export, import, settings
    └── utils/
        ├── edgeRouter.js     — Orthogonal path computation
        └── exporters.js      — JSON export, Python code generation
```

## Implementation Steps

### Step 1: Scaffold project
- `npm create vite@latest man-diagram-tool -- --template react`
- Set up package.json, index.html
- Verify dev server runs

### Step 2: Constants and data model
- Define NODE_TYPES, NODE_META (shapes, colors, default fields)
- Define data structures for nodes and edges

### Step 3: App layout + Palette (left sidebar)
- Three-column layout: palette | canvas | property panel
- Palette shows the 5 node types with matching icons
- Click to add a node to the canvas center

### Step 4: Canvas with pan/zoom
- SVG-based canvas with grid dots background
- Mouse drag to pan, scroll to zoom
- Node rendering with drag-to-reposition

### Step 5: Node shapes (matching paper exactly)
- Small diamond for input params
- Circle for calc steps
- Large diamond for decision steps
- Hexagon for margin nodes
- Donut/ring for performance params
- Labels inside or below shapes

### Step 6: Orthogonal edges (90-degree arrows)
- Connection mode: click source port → click target
- Route: source center → horizontal → vertical → target center
- Solid arrowhead at target
- Red color for threshold edges, black for decided-value edges
- Delete button on hover (× at midpoint)

### Step 7: Property panel (right sidebar)
- Shows fields based on selected node type
- Input param: Name, Value, Unit
- Calc node: Name, Equation, Description
- Decision node: Name, Description
- Margin node: Name (auto E1, E2, …)
- Performance param: Name, Unit

### Step 8: Toolbar + Export/Import
- Export to JSON (full diagram state)
- Import from JSON
- Export to Python (generates mvm_core.py setup code)
- Clear canvas

### Step 9: Input-of-interest marking
- Toolbar button or menu: "Pre-analysis Settings"
- Opens panel showing all input parameter nodes
- Checkbox to mark each as "of interest" (for deterioration)
- Marked inputs show orange fill (matching paper's orange diamond symbol)

### Step 10: Polish
- Keyboard shortcuts (Delete to remove, Escape to deselect)
- Status bar with node/edge counts
- Snap-to-grid for node positioning
- Undo/redo (stretch goal)
