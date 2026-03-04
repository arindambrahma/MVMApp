# Margin Value Method (MVM) — Python Implementation

Python implementation of the **Margin Value Method** from:

> Brahma, A. & Wynn, D. C. (2020). *Margin value method for engineering design improvement.*
> Research in Engineering Design. https://doi.org/10.1007/s00163-020-00335-8

---

## Files

| File | Purpose |
|---|---|
| `mvm_core.py` | Core MVM engine — MANEngine, nodes, MVMResult |
| `mvm_plot.py` | Margin Value Plot and sensitivity visualisations |
| `conveyor_example.py` | Belt conveyor case study (replicates the paper) |

---

## Quick Start

```bash
pip install matplotlib numpy
python conveyor_example.py
```

---

## How to Use the MVM for Your Own Design

### 1. Create an engine

```python
from mvm_core import MANEngine, CalculationNode, DecisionNode

man = MANEngine()
```

### 2. Set input parameters

```python
man.set_params(mass=500, height=10, cylinder_ext_dia=0.12)
man.mark_input("mass", "height")          # parameters that might change
man.mark_performance("design_pressure")   # parameters you care about
```

### 3. Add calculation nodes (deterministic)

```python
man.add_calc(CalculationNode(
    name        = "required_pressure",
    func        = lambda m, d: (4 * m * 9.81) / (3.14159 * d**2),
    input_names = ["mass", "bore_dia"],
    output_name = "P_required",
))
```

### 4. Add decision nodes (catalogue / discrete choices)

```python
def select_pump(P_req):
    catalogue = [10, 20, 30, 50]          # bar
    return next(p for p in catalogue if p >= P_req)

man.add_decision(DecisionNode(
    name           = "pump_selection",
    func           = lambda P_req: select_pump(P_req),
    threshold_func = lambda P_req: P_req,   # the minimum acceptable value
    input_names    = ["P_required"],
    decided_name   = "P_pump",
    threshold_name = "P_pump_thresh",
))
```
`add_decision` automatically registers a `MarginNode` for the excess
`(P_pump - P_pump_thresh) / P_pump_thresh`.

### 5. Run the analysis

```python
result = man.analyse(
    perf_weights  = {"design_pressure": 1.0},
    input_weights = {"mass": 1.0, "height": 1.0},
)
print(result.summary_table())
```

### 6. Plot

```python
from mvm_plot import plot_margin_value
plot_margin_value(result, title="My Design", save_path="mvp.png")
```

---

## Method Overview

The MVM proceeds in three metric calculations on the **Margin Analysis Network (MAN)**:

| Metric | What it measures |
|---|---|
| **Metric 1 — Local Excess** | How much each decided value oversatisfies its threshold: `(decided - threshold) / threshold` |
| **Metric 2 — Impact** | Performance loss if each margin were eliminated (one at a time), propagated forward through the MAN |
| **Metric 3 — Absorption** | How much of each margin is consumed when each input parameter deteriorates to its maximum absorbable value |

For **Metric 3**, `Pmax_i` follows the manuscript stopping rule: vary one input until either any margin threshold reaches its decided value or any performance parameter changes.

These are visualised on a **Margin Value Plot** (bubble chart):

- **X-axis**: weighted impact on performance parameters → "cost" of excess
- **Y-axis**: weighted change absorption potential → "benefit" of excess
- **Bubble size**: local excess fraction

### Interpreting the four quadrants

| Quadrant | Meaning |
|---|---|
| Top-left | High value — provides change absorption with little cost |
| Top-right | Trade-off — significant absorption but at performance cost |
| Bottom-left | Low significance — can be ignored |
| Bottom-right | Reduce this — high cost, negligible benefit |

---

## Extending the MAN Engine

- **Lookup tables**: wrap pandas/numpy lookups inside a `func` lambda
- **Non-linear models**: any Python callable works (FEM surrogate, etc.)
- **Multi-output decisions**: model them as one decision + multiple calc nodes
- **Simultaneous redesign**: run `analyse()` after modifying `man._params`

---

## Limitations (as discussed in the paper)

- Margins are evaluated **one at a time** (incremental design context)
- Decisions are assumed to occur **sequentially**
- The method focuses on **excess margin** (not deliberate safety margins)
- Performance parameters must be **calculable** from the parameter network
