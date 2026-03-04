"""
Margin Value Method (MVM) - Python Implementation
Based on: Brahma & Wynn (2020), "Margin value method for engineering design improvement"
Research in Engineering Design, DOI: 10.1007/s00163-020-00335-8
"""

from __future__ import annotations
import math
import warnings
from typing import Any, Callable, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import json


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Parameter:
    """A numeric parameter in the design / MAN."""
    name: str
    value: float
    unit: str = ""
    description: str = ""


@dataclass
class CalculationNode:
    """A deterministic transformation: inputs → one output."""
    name: str
    func: Callable[..., float]
    input_names: List[str]         # ordered list of parameter names fed in
    output_name: str               # parameter name produced
    description: str = ""


@dataclass
class DecisionNode:
    """A designer decision that yields one decided value and one target threshold."""
    name: str
    func: Callable[..., float]     # takes current inputs, returns decided value
    threshold_func: Callable[..., float]  # returns target threshold
    input_names: List[str]
    decided_name: str              # parameter name for decided value
    threshold_name: str            # parameter name for target threshold
    description: str = ""


@dataclass
class MarginNode:
    """Records excess = (decided - threshold) / threshold."""
    name: str
    decided_name: str
    threshold_name: str
    description: str = ""


@dataclass
class MVMResult:
    """Full output from a run of margin_value_analysis()."""
    excess: Dict[str, float]
    impact_matrix: Dict[str, Dict[str, float]]   # [margin][perf_param]
    deterioration: Dict[str, float]              # [input_param]
    absorption_matrix: Dict[str, Dict[str, float]]  # [margin][input_param]
    weighted_impact: Dict[str, float]            # [margin]
    weighted_absorption: Dict[str, float]        # [margin]
    utilisation_matrix: Dict[str, Dict[str, float]]  # [margin][input_param]

    def summary_table(self) -> str:
        lines = [
            "=" * 70,
            "MARGIN VALUE METHOD — ANALYSIS RESULTS",
            "=" * 70,
            "",
            "Metric 1 — Local Excess (decided/threshold - 1):",
        ]
        for m, v in self.excess.items():
            lines.append(f"  {m:20s}: {v*100:+7.3f}%")

        lines += ["", "Metric 2 — Weighted Impact on Performance:"]
        for m, v in self.weighted_impact.items():
            lines.append(f"  {m:20s}: {v*100:+7.3f}%")

        lines += ["", "Metric 3 — Weighted Change-Absorption Potential:"]
        for m, v in self.weighted_absorption.items():
            lines.append(f"  {m:20s}: {v*100:+7.3f}%")

        lines += ["", "=" * 70]
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Network engine
# ---------------------------------------------------------------------------

class MANEngine:
    """
    Margin Analysis Network (MAN) engine.

    Parameters are stored in a flat dict.  Nodes are executed in the order
    they are registered; the caller is responsible for correct ordering.
    """

    def __init__(self):
        self._params: Dict[str, float] = {}
        self._calc_nodes: List[CalculationNode] = []
        self._decision_nodes: List[DecisionNode] = []
        self._margin_nodes: List[MarginNode] = []
        self._input_param_names: List[str] = []
        self._perf_param_names: List[str] = []
        self._exec_order: List[Any] = []   # mixed list of node objects in run order

    # ------------------------------------------------------------------
    # Registration helpers
    # ------------------------------------------------------------------

    def set_param(self, name: str, value: float) -> None:
        self._params[name] = value

    def set_params(self, **kwargs: float) -> None:
        self._params.update(kwargs)

    def mark_input(self, *names: str) -> None:
        for n in names:
            if n not in self._input_param_names:
                self._input_param_names.append(n)

    def mark_performance(self, *names: str) -> None:
        for n in names:
            if n not in self._perf_param_names:
                self._perf_param_names.append(n)

    def add_calc(self, node: CalculationNode) -> None:
        self._calc_nodes.append(node)
        self._exec_order.append(node)

    def add_decision(self, node: DecisionNode) -> None:
        self._decision_nodes.append(node)
        self._exec_order.append(node)
        # auto-register margin node
        mnode = MarginNode(
            name=f"E_{node.name}",
            decided_name=node.decided_name,
            threshold_name=node.threshold_name,
            description=f"Excess at {node.name}",
        )
        self._margin_nodes.append(mnode)

    def add_margin(self, node: MarginNode) -> None:
        """Register a standalone margin node (if not added via add_decision)."""
        self._margin_nodes.append(node)

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    def _run(self, params: Dict[str, float]) -> Dict[str, float]:
        """Execute the MAN from *params* (a complete copy) and return result dict."""
        p = dict(params)
        for node in self._exec_order:
            if isinstance(node, CalculationNode):
                inputs = [p[n] for n in node.input_names]
                try:
                    p[node.output_name] = node.func(*inputs)
                except ZeroDivisionError as e:
                    raise ValueError(
                        f"Division by zero in node '{node.name}' "
                        f"(output '{node.output_name}')"
                    ) from e
                except Exception as e:
                    raise ValueError(
                        f"Failed to evaluate node '{node.name}' "
                        f"(output '{node.output_name}'): {e}"
                    ) from e
            elif isinstance(node, DecisionNode):
                inputs = [p[n] for n in node.input_names]
                try:
                    p[node.decided_name] = node.func(*inputs)
                    p[node.threshold_name] = node.threshold_func(*inputs)
                except ZeroDivisionError as e:
                    raise ValueError(
                        f"Division by zero in decision node '{node.name}'"
                    ) from e
                except Exception as e:
                    raise ValueError(
                        f"Failed to evaluate decision node '{node.name}': {e}"
                    ) from e
        return p

    def _baseline(self) -> Dict[str, float]:
        return self._run(dict(self._params))

    def _run_with_fixed_decisions(
        self, params: Dict[str, float], base: Dict[str, float]
    ) -> Dict[str, float]:
        """Execute MAN keeping all decided values fixed at *base*,
        only recompute calculation nodes and thresholds."""
        # Build a set of all decided_names so we can freeze them
        decided_names = {mn.decided_name for mn in self._margin_nodes}

        p = dict(params)
        for node in self._exec_order:
            if isinstance(node, CalculationNode):
                # If this calc node produces a decided value, keep it fixed
                if node.output_name in decided_names:
                    p[node.output_name] = base[node.output_name]
                else:
                    inputs = [p[n] for n in node.input_names]
                    try:
                        p[node.output_name] = node.func(*inputs)
                    except ZeroDivisionError as e:
                        raise ValueError(
                            f"Division by zero in node '{node.name}' "
                            f"(output '{node.output_name}')"
                        ) from e
                    except Exception as e:
                        raise ValueError(
                            f"Failed to evaluate node '{node.name}' "
                            f"(output '{node.output_name}'): {e}"
                        ) from e
            elif isinstance(node, DecisionNode):
                inputs = [p[n] for n in node.input_names]
                try:
                    p[node.decided_name] = base[node.decided_name]
                    p[node.threshold_name] = node.threshold_func(*inputs)
                except ZeroDivisionError as e:
                    raise ValueError(
                        f"Division by zero in decision node '{node.name}'"
                    ) from e
                except Exception as e:
                    raise ValueError(
                        f"Failed to evaluate decision node '{node.name}': {e}"
                    ) from e
        return p

    # ------------------------------------------------------------------
    # MVM analysis
    # ------------------------------------------------------------------

    def analyse(
        self,
        perf_weights: Optional[Dict[str, float]] = None,
        input_weights: Optional[Dict[str, float]] = None,
        deterioration_step: float = 0.001,
        max_iterations: int = 100_000,
        stop_on_performance_change: bool = True,
    ) -> MVMResult:
        """
        Run the full MVM analysis and return an MVMResult.

        Parameters
        ----------
        perf_weights   : {param_name: weight} for performance parameters
        input_weights  : {param_name: weight} for input parameters
        deterioration_step : fractional step size for scanning Pmax
        max_iterations : safety limit for while loops
        stop_on_performance_change : if True, Pmax search also stops when any
                        performance parameter deviates from baseline.
        """
        if perf_weights is None:
            perf_weights = {n: 1.0 for n in self._perf_param_names}
        if input_weights is None:
            input_weights = {n: 1.0 for n in self._input_param_names}

        base = self._baseline()

        # ── Metric 1: Local excess ──────────────────────────────────
        excess = {}
        for mn in self._margin_nodes:
            decided = base[mn.decided_name]
            threshold = base[mn.threshold_name]
            if abs(threshold) < 1e-12:
                excess[mn.name] = 0.0
            else:
                excess[mn.name] = (decided - threshold) / threshold

        # ── Metric 2: Impact ────────────────────────────────────────
        impact_matrix: Dict[str, Dict[str, float]] = {}
        for mn in self._margin_nodes:
            impact_matrix[mn.name] = {}
            # Create a modified params dict where this margin's decided value
            # is replaced by its threshold (zeroing this margin alone).
            mod_params = dict(self._params)

            # We need to inject a "frozen decided" so the decision node returns
            # the threshold value instead of the catalogue value.  We do this by
            # temporarily wrapping the decision node.
            p_mod = self._run_with_margin_zeroed(mn, mod_params, base)

            for pp in self._perf_param_names:
                pp_base = base[pp]
                pp_mod = p_mod[pp]
                if abs(pp_mod) < 1e-12:
                    impact_matrix[mn.name][pp] = 0.0
                else:
                    impact_matrix[mn.name][pp] = (pp_base - pp_mod) / pp_mod

        # ── Metric 3: Deterioration & Absorption ───────────────────
        deterioration: Dict[str, float] = {}
        absorption_matrix: Dict[str, Dict[str, float]] = {}

        for ip in self._input_param_names:
            pmax, direction = self._find_pmax(
                ip, base, deterioration_step, max_iterations, stop_on_performance_change
            )
            p0 = base[ip]
            if abs(p0) < 1e-12:
                deterioration[ip] = 0.0
            else:
                deterioration[ip] = (pmax - p0) / abs(p0)

            # Recalculate thresholds at Pmax (decisions stay fixed)
            pmax_params = dict(self._params)
            pmax_params[ip] = pmax
            pmax_run = self._run_with_fixed_decisions(pmax_params, base)

            for mn in self._margin_nodes:
                if mn.name not in absorption_matrix:
                    absorption_matrix[mn.name] = {}
                threshold_new = pmax_run[mn.threshold_name]
                threshold_base = base[mn.threshold_name]
                det = deterioration[ip]
                if abs(det) < 1e-12 or abs(threshold_base) < 1e-12:
                    absorption_matrix[mn.name][ip] = 0.0
                else:
                    absorption_matrix[mn.name][ip] = (
                        (threshold_new - threshold_base) / threshold_base / det
                    )

        # ── Weighted summaries ──────────────────────────────────────
        total_pw = sum(perf_weights.get(p, 0) for p in self._perf_param_names)
        total_iw = sum(input_weights.get(p, 0) for p in self._input_param_names)

        weighted_impact: Dict[str, float] = {}
        for mn in self._margin_nodes:
            s = sum(
                impact_matrix[mn.name].get(pp, 0) * perf_weights.get(pp, 0)
                for pp in self._perf_param_names
            )
            weighted_impact[mn.name] = s / total_pw if total_pw > 0 else 0.0

        weighted_absorption: Dict[str, float] = {}
        for mn in self._margin_nodes:
            s = sum(
                absorption_matrix[mn.name].get(ip, 0) * input_weights.get(ip, 0)
                for ip in self._input_param_names
            )
            weighted_absorption[mn.name] = s / total_iw if total_iw > 0 else 0.0

        # ── Utilisation ─────────────────────────────────────────────
        utilisation_matrix: Dict[str, Dict[str, float]] = {}
        for mn in self._margin_nodes:
            utilisation_matrix[mn.name] = {}
            decided = base[mn.decided_name]
            threshold = base[mn.threshold_name]
            denom = decided - threshold
            for ip in self._input_param_names:
                pmax_params = dict(self._params)
                pmax_params[ip] = self._params[ip] * (1 + deterioration.get(ip, 0))
                pmax_run = self._run_with_fixed_decisions(pmax_params, base)
                threshold_new = pmax_run[mn.threshold_name]
                if abs(denom) < 1e-12:
                    utilisation_matrix[mn.name][ip] = 1.0
                else:
                    utilisation_matrix[mn.name][ip] = 1 - (
                        (decided - threshold_new) / denom
                    )

        return MVMResult(
            excess=excess,
            impact_matrix=impact_matrix,
            deterioration=deterioration,
            absorption_matrix=absorption_matrix,
            weighted_impact=weighted_impact,
            weighted_absorption=weighted_absorption,
            utilisation_matrix=utilisation_matrix,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _run_with_margin_zeroed(
        self,
        mn: MarginNode,
        orig_params: Dict[str, float],
        base: Dict[str, float],
    ) -> Dict[str, float]:
        """
        Run the MAN while forcing margin node *mn*'s decided value to equal
        its threshold (i.e. zeroing the excess of that single margin).
        All downstream decisions remain at their original decided values.
        """
        p = dict(orig_params)
        for node in self._exec_order:
            if isinstance(node, CalculationNode):
                inputs = [p[n] for n in node.input_names]
                try:
                    result = node.func(*inputs)
                except ZeroDivisionError as e:
                    raise ValueError(
                        f"Division by zero in node '{node.name}' "
                        f"(output '{node.output_name}')"
                    ) from e
                except Exception as e:
                    raise ValueError(
                        f"Failed to evaluate node '{node.name}' "
                        f"(output '{node.output_name}'): {e}"
                    ) from e
                # If this calc node produces the decided value we are zeroing,
                # replace it with the current threshold value instead.
                if node.output_name == mn.decided_name:
                    p[node.output_name] = p.get(mn.threshold_name, result)
                else:
                    p[node.output_name] = result
            elif isinstance(node, DecisionNode):
                inputs = [p[n] for n in node.input_names]
                try:
                    threshold = node.threshold_func(*inputs)
                except ZeroDivisionError as e:
                    raise ValueError(
                        f"Division by zero in decision node '{node.name}'"
                    ) from e
                except Exception as e:
                    raise ValueError(
                        f"Failed to evaluate decision node '{node.name}': {e}"
                    ) from e
                p[node.threshold_name] = threshold
                if node.decided_name == mn.decided_name:
                    p[node.decided_name] = threshold
                else:
                    p[node.decided_name] = base[node.decided_name]
        return p

    def _find_pmax(
        self,
        input_name: str,
        base: Dict[str, float],
        step_frac: float,
        max_iter: int,
        stop_on_performance_change: bool = True,
    ) -> Tuple[float, int]:
        """
        Gradually change *input_name* until any target threshold reaches its
        decided value (with decisions fixed at baseline).
        Optionally also stop when a performance parameter changes.
        Returns (pmax_value, direction) where direction is +1 or -1.
        """
        p0 = base[input_name]
        step = abs(p0) * step_frac if abs(p0) > 1e-10 else step_frac

        # Pre-compute baseline margin gaps: decided - threshold
        base_gaps = {}
        for mn2 in self._margin_nodes:
            base_gaps[mn2.name] = (
                base[mn2.decided_name] - base[mn2.threshold_name]
            )

        probe_steps = 50  # steps before checking if direction causes deterioration

        for direction in (+1, -1):
            current = p0
            for i in range(max_iter):
                current += direction * step
                test_params = dict(self._params)
                test_params[input_name] = current
                try:
                    run = self._run_with_fixed_decisions(test_params, base)
                except Exception:
                    # Invalid formula region (division by zero/domain errors)
                    # is treated as the boundary of feasible deterioration.
                    return current - direction * step, direction

                # Check whether any margin is violated (threshold >= decided)
                violated = False
                for mn2 in self._margin_nodes:
                    decided2 = base[mn2.decided_name]
                    threshold2 = run.get(
                        mn2.threshold_name, base[mn2.threshold_name]
                    )
                    if decided2 < threshold2 - 1e-9:
                        violated = True
                        break

                if violated:
                    return current - direction * step, direction

                if stop_on_performance_change:
                    perf_reduced = False
                    for pp in self._perf_param_names:
                        base_pp = base.get(pp, 0.0)
                        run_pp = run.get(pp, base_pp)
                        # Use a practical tolerance so tiny continuous drift or
                        # floating-point jitter does not force immediate Pmax=base.
                        rel_tol = max(1e-6, step_frac * 1.5)
                        abs_tol = 1e-9
                        tol = max(abs_tol, rel_tol * max(1.0, abs(base_pp), abs(run_pp)))
                        # Optional performance stop is directional:
                        # stop only when performance decreases beyond tolerance.
                        if (base_pp - run_pp) > tol:
                            perf_reduced = True
                            break
                    if perf_reduced:
                        return current - direction * step, direction

                # Early exit: if after probe_steps no margin is shrinking,
                # this is the wrong direction — try the other one.
                if i == probe_steps:
                    any_shrinking = False
                    for mn2 in self._margin_nodes:
                        decided2 = base[mn2.decided_name]
                        threshold2 = run.get(
                            mn2.threshold_name, base[mn2.threshold_name]
                        )
                        curr_gap = decided2 - threshold2
                        if curr_gap < base_gaps[mn2.name] - 1e-9:
                            any_shrinking = True
                            break
                    if not any_shrinking:
                        break  # wrong direction

        # If nothing violated, return original value (deterioration = 0)
        warnings.warn(
            f"Could not find Pmax for '{input_name}' within {max_iter} iterations."
        )
        return p0, 1
