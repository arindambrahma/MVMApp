"""
Margin-aware Change Propagation Method (Option A).

Analytical implementation based on Clarkson's CPM with a margin gate extension.
The margin gate g = P(delta_A > m) is a per-node exceedance probability that
multiplies into Clarkson's Or-combination formula. When all margins are zero,
the method recovers Clarkson's original results exactly.

Option A framing: Clarkson's elicited likelihood P(A->B) is preserved without
modification. The gate is an additional sensitivity factor — a what-if lens on
how risk changes as design margins vary.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Optional

from .models import DSM, GraphNode, ChangePropagationLeaf, ChangePropagationTree


# ---------------------------------------------------------------------------
# MarginConfig — computes P(delta_A > m) for a given distribution
# ---------------------------------------------------------------------------

def _norm_cdf(x: float) -> float:
    """Standard normal CDF using math.erfc (no scipy/numpy dependency)."""
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


@dataclass
class MarginConfig:
    """
    Holds distribution parameters for change magnitude delta_A in [0,1]
    and computes the exceedance probability P(delta_A > m).

    Supported distributions (all on [0,1]):
      - 'uniform':    params a, b (default 0, 1)
      - 'normal':     truncated Normal with params mu, sigma
      - 'beta':       Beta(alpha, beta)
      - 'triangular': params a (min), b (max), c (peak)
    """
    dist_type: str = 'uniform'
    mu: float = 0.0
    sigma: float = 1.0
    alpha: float = 1.0
    beta: float = 1.0
    a: float = 0.0
    b: float = 1.0
    c: float = 0.5

    @classmethod
    def from_dict(cls, cfg: dict) -> MarginConfig:
        dist_type = str(cfg.get('type', 'uniform')).strip().lower()
        return cls(
            dist_type=dist_type,
            mu=float(cfg.get('mu', 0.3)),
            sigma=float(cfg.get('sigma', 0.15)),
            alpha=float(cfg.get('alpha', 1.0)),
            beta=float(cfg.get('beta', 1.0)),
            a=float(cfg.get('a', 0.0)),
            b=float(cfg.get('b', 1.0)),
            c=float(cfg.get('c', 0.5)),
        )

    def exceedance(self, m: float) -> float:
        """Compute P(delta_A > m) for a single margin threshold m in [0,1]."""
        m = max(0.0, min(1.0, m))
        if self.dist_type == 'uniform':
            return self._uniform_survival(m)
        elif self.dist_type == 'normal':
            return self._truncnorm_survival(m)
        elif self.dist_type == 'beta':
            return self._beta_survival(m)
        elif self.dist_type == 'triangular':
            return self._triangular_survival(m)
        else:
            raise ValueError(f"Unknown distribution type: {self.dist_type}")

    def _uniform_survival(self, m: float) -> float:
        if self.b <= self.a:
            return 0.0
        return max(0.0, (self.b - m) / (self.b - self.a))

    def _truncnorm_survival(self, m: float) -> float:
        mu, sigma = self.mu, self.sigma
        if sigma <= 0:
            return 1.0 if m < mu else 0.0
        lo = _norm_cdf((0.0 - mu) / sigma)
        hi = _norm_cdf((1.0 - mu) / sigma)
        Z = hi - lo
        if Z < 1e-12:
            return 1.0 if m < mu else 0.0
        return max(0.0, min(1.0, (hi - _norm_cdf((m - mu) / sigma)) / Z))

    def _beta_survival(self, m: float) -> float:
        # Use numerical integration for Beta CDF (no scipy dependency)
        # Fall back to a simple numerical quadrature
        return 1.0 - self._beta_cdf(m, self.alpha, self.beta)

    @staticmethod
    def _beta_cdf(x: float, a: float, b: float, n_steps: int = 200) -> float:
        """Numerical Beta CDF via Simpson's rule on [0, x]."""
        if x <= 0:
            return 0.0
        if x >= 1:
            return 1.0
        # Beta PDF: x^(a-1) * (1-x)^(b-1) / B(a,b)
        log_beta = math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)
        h = x / n_steps
        total = 0.0
        for i in range(n_steps + 1):
            t = i * h
            if t <= 0 or t >= 1:
                if t == 0 and a < 1:
                    continue
                if t == 1 and b < 1:
                    continue
            try:
                log_val = (a - 1) * math.log(max(t, 1e-300)) + (b - 1) * math.log(max(1 - t, 1e-300)) - log_beta
                val = math.exp(log_val)
            except (ValueError, OverflowError):
                val = 0.0
            weight = 1 if (i == 0 or i == n_steps) else (4 if i % 2 == 1 else 2)
            total += weight * val
        return max(0.0, min(1.0, total * h / 3.0))

    def _triangular_survival(self, m: float) -> float:
        a, b, c = self.a, self.b, self.c
        if m <= a:
            return 1.0
        elif m <= c:
            return 1.0 - (m - a) ** 2 / ((b - a) * (c - a)) if (b - a) * (c - a) > 0 else 0.0
        elif m < b:
            return (b - m) ** 2 / ((b - a) * (b - c)) if (b - a) * (b - c) > 0 else 0.0
        else:
            return 0.0


# ---------------------------------------------------------------------------
# MarginDSM — extends DSM with per-node margins and exceedance vector
# ---------------------------------------------------------------------------

class MarginDSM(DSM):
    """
    Extends Clarkson's DSM with per-node margin thresholds and a change
    magnitude distribution. Precomputes the exceedance vector at construction.
    """

    def __init__(
        self,
        matrix: list[list[float]],
        columns: list[str],
        instigator: str = 'column',
        margins: Optional[list[float]] = None,
        config: Optional[MarginConfig | dict | list] = None,
    ):
        super().__init__(matrix, columns, instigator)
        n = len(columns)

        # Parse margins
        if margins is None:
            self.margins = [0.0] * n
        else:
            if len(margins) != n:
                raise ValueError(f"margins must have length {n}, got {len(margins)}")
            self.margins = [max(0.0, min(1.0, float(m))) for m in margins]

        # Parse config(s) — single config for all nodes, or per-node list
        default_cfg = MarginConfig()
        if config is None:
            self.configs: list[MarginConfig] = [default_cfg] * n
        elif isinstance(config, MarginConfig):
            self.configs = [config] * n
        elif isinstance(config, dict):
            cfg = MarginConfig.from_dict(config)
            self.configs = [cfg] * n
        elif isinstance(config, list):
            self.configs = []
            for item in config:
                if item is None:
                    self.configs.append(default_cfg)
                elif isinstance(item, MarginConfig):
                    self.configs.append(item)
                elif isinstance(item, dict):
                    self.configs.append(MarginConfig.from_dict(item))
                else:
                    self.configs.append(default_cfg)
            while len(self.configs) < n:
                self.configs.append(default_cfg)
        else:
            raise ValueError("config must be a MarginConfig, dict, or list")

        # Precompute exceedance vector
        self.exceedance: list[float] = [
            self.configs[i].exceedance(self.margins[i]) for i in range(n)
        ]


# ---------------------------------------------------------------------------
# MarginChangePropagationLeaf — Clarkson's leaf + one gate multiplication
# ---------------------------------------------------------------------------

class MarginChangePropagationLeaf(ChangePropagationLeaf):
    """
    Clarkson's ChangePropagationLeaf with one addition: a margin gate
    g(i) = P(delta_A > m_i) applied at each intermediate node.

    The gate is applied ONCE per node (not per edge) because the margin
    is a property of the node, not the connection.

    At the start and target nodes, gate = 1.0 (no gating at endpoints).
    """

    def __init__(
        self,
        node: GraphNode,
        impact_node: GraphNode,
        parent: Optional[ChangePropagationLeaf] = None,
        exceedance: Optional[list[float]] = None,
        start_index: int = -1,
        target_index: int = -1,
    ):
        super().__init__(node, impact_node, parent)
        self.exceedance = exceedance
        self.start_index = start_index
        self.target_index = target_index

    def gate(self) -> float:
        """
        Margin gate for THIS node.
        = 1.0 at start and target (no gating at endpoints)
        = P(delta_A > m) at all intermediate nodes
        """
        idx = self.node.index
        if (self.exceedance is None
                or idx == self.start_index
                or idx == self.target_index):
            return 1.0
        return self.exceedance[idx]

    def get_probability(self, stack=0):
        # Clarkson base cases (unchanged)
        if len(self.next) == 0 and stack == 0:
            return 0
        if len(self.next) == 0:
            return 1

        # Gate for THIS node — applied once, outside the edge loop
        g = self.gate()

        # Clarkson Or-combination with gate injected
        prod_term = 1.0
        for next_index in self.next:
            p_edge = self.node.neighbours[next_index]
            p_child = self.next[next_index].get_probability(stack=stack + 1)
            # ONLY CHANGE vs CLARKSON: multiply by g
            prod_term *= (1 - g * p_edge * p_child)

        return 1 - prod_term

    def get_risk(self):
        # Clarkson base cases (unchanged)
        if len(self.next) == 0:
            if self.parent is None:
                return 0
            if self.node.index not in self.parent.impact_node.neighbours:
                raise ValueError(
                    f'Missing impact for edge {self.parent.impact_node.index} -> {self.node.index}.'
                )
            return self.parent.impact_node.neighbours[self.node.index]

        # Gate for THIS node — applied once
        g = self.gate()

        # Clarkson risk combination with gate injected
        prod_term = 1.0
        for next_index in self.next:
            l_edge = self.node.neighbours[next_index]
            r_child = self.next[next_index].get_risk()
            # ONLY CHANGE vs CLARKSON: multiply by g
            prod_term *= (1 - g * l_edge * r_child)

        return 1 - prod_term


# ---------------------------------------------------------------------------
# MarginChangePropagationTree — Clarkson's BFS tree using margin-aware leaves
# ---------------------------------------------------------------------------

class MarginChangePropagationTree(ChangePropagationTree):
    """
    Clarkson's ChangePropagationTree adapted for margin-aware leaves.
    BFS structure, cycle detection, and propagate_back are all unchanged.
    The only difference: leaves are MarginChangePropagationLeaf, carrying
    the exceedance vector.
    """

    def __init__(
        self,
        start_index: int,
        target_index: int,
        dsm_impact: DSM,
        dsm_likelihood: DSM,
    ):
        super().__init__(start_index, target_index, dsm_impact, dsm_likelihood)

        # Pull exceedance from MarginDSM if available; else all 1s (no gating)
        if isinstance(dsm_likelihood, MarginDSM):
            self.exceedance = dsm_likelihood.exceedance
        else:
            self.exceedance = [1.0] * len(dsm_likelihood.columns)

    def propagate(self, search_depth: int = 4) -> 'MarginChangePropagationTree':
        network = self.dsm_likelihood.node_network
        net_impact = self.dsm_impact.node_network

        self.start_leaf = MarginChangePropagationLeaf(
            network[self.start_index],
            net_impact[self.start_index],
            parent=None,
            exceedance=self.exceedance,
            start_index=self.start_index,
            target_index=self.target_index,
        )

        queue = [self.start_leaf]

        while queue:
            current = queue.pop(0)

            if current.node.index == self.target_index:
                self.propagate_back(current)
                continue

            for neighbour in current.node.neighbours:
                # Cycle detection — unchanged from Clarkson
                back = current
                visited = False
                while back.parent:
                    if neighbour == back.parent.node.index:
                        visited = True
                        break
                    back = back.parent
                if visited:
                    continue

                leaf = MarginChangePropagationLeaf(
                    network[neighbour],
                    net_impact[neighbour],
                    parent=current,
                    exceedance=self.exceedance,
                    start_index=self.start_index,
                    target_index=self.target_index,
                )

                if leaf.level <= search_depth:
                    queue.append(leaf)

        return self


# ---------------------------------------------------------------------------
# Public API — drop-in replacement for the old Monte Carlo function
# ---------------------------------------------------------------------------

def calculate_risk_matrix_margin(
    dsm_impact: DSM,
    dsm_likelihood: DSM,
    search_depth: int = 4,
) -> list[list[float]]:
    """
    Compute the full n x n combined risk matrix using the margin-aware CPM.
    Accepts either plain DSM or MarginDSM objects.
    When passed plain DSMs, output is identical to Clarkson's original.
    """
    n = len(dsm_likelihood.columns)
    R = [[0.0] * n for _ in range(n)]

    for j in range(n):
        for i in range(n):
            if i == j:
                continue
            cpt = MarginChangePropagationTree(j, i, dsm_impact, dsm_likelihood)
            cpt.propagate(search_depth)
            R[i][j] = cpt.get_risk()

    return R


def calculate_likelihood_matrix_margin(
    dsm_likelihood: DSM,
    search_depth: int = 4,
) -> list[list[float]]:
    """Compute the full n x n combined likelihood matrix."""
    n = len(dsm_likelihood.columns)
    P = [[0.0] * n for _ in range(n)]

    for j in range(n):
        for i in range(n):
            if i == j:
                continue
            cpt = MarginChangePropagationTree(j, i, dsm_likelihood, dsm_likelihood)
            cpt.propagate(search_depth)
            P[i][j] = cpt.get_probability()

    return P


def run_margin_aware_cpm(
    *,
    likelihood_matrix: list[list[float]],
    impact_matrix: list[list[float]],
    margins: list[float],
    search_depth: int = 4,
    instigator: str = 'column',
    distribution: Optional[dict | list[dict]] = None,
    # Legacy parameters (ignored — kept for API compatibility)
    n_samples: int = 400,
    delta0: float = 1.0,
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Analytical margin-aware CPM (Option A).

    Replaces the old Monte Carlo implementation with a deterministic
    analytical method based on Clarkson's BFS tree with a margin gate.

    The margin gate g = P(delta_A > m) is computed from a user-specified
    distribution of change magnitudes and applied as an additional
    multiplicative factor in Clarkson's Or-combination.

    Parameters
    ----------
    likelihood_matrix : n x n likelihood DSM
    impact_matrix : n x n impact DSM
    margins : per-node margin thresholds in [0, 1]
    search_depth : max propagation depth (Clarkson recommends 3-4)
    instigator : 'column' or 'row'
    distribution : distribution config dict (applied to all nodes) or
                   list of dicts (one per node). Keys: type, mu, sigma,
                   alpha, beta, a, b, c. Default: truncated Normal(0.3, 0.15).

    Returns
    -------
    dict with keys: combinedRisk, combinedLikelihood, incoming, outgoing,
    effectiveLikelihood, exceedance, margins, depth, distribution.
    """
    n = len(likelihood_matrix)
    if n < 1:
        raise ValueError("Need at least 1 element.")
    if len(margins) != n:
        raise ValueError(f"margins must have length {n}")

    elements = [str(i) for i in range(n)]

    # Default distribution: truncated Normal(0.3, 0.15)
    if distribution is None:
        distribution = {'type': 'normal', 'mu': 0.3, 'sigma': 0.15}

    # Build margin-aware DSMs
    config = distribution  # MarginDSM handles dict or list[dict]
    dsm_likelihood = MarginDSM(likelihood_matrix, elements, instigator, margins, config)
    dsm_impact = MarginDSM(impact_matrix, elements, instigator, margins, config)

    # Compute risk and likelihood matrices
    risk_matrix = calculate_risk_matrix_margin(dsm_impact, dsm_likelihood, search_depth)
    prob_matrix = calculate_likelihood_matrix_margin(dsm_likelihood, search_depth)

    # Compute the effective likelihood matrix: element-wise L * g
    # This shows how the original likelihood is modified by the margin gate
    effective_likelihood = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            # g at the receiving node i, times the original likelihood L[i][j]
            g_i = dsm_likelihood.exceedance[i]
            effective_likelihood[i][j] = round(g_i * likelihood_matrix[i][j], 6)

    # Aggregate incoming/outgoing
    incoming = [0.0] * n
    outgoing = [0.0] * n
    for i in range(n):
        out_vals = [risk_matrix[j][i] for j in range(n) if i != j]
        in_vals = [risk_matrix[i][j] for j in range(n) if i != j]
        outgoing[i] = round(sum(out_vals) / n, 6)
        incoming[i] = round(sum(in_vals) / n, 6)

    # Round matrices
    def _round_matrix(m):
        return [[round(v, 6) for v in row] for row in m]

    return {
        'combinedRisk': _round_matrix(risk_matrix),
        'combinedLikelihood': _round_matrix(prob_matrix),
        'incoming': incoming,
        'outgoing': outgoing,
        'effectiveLikelihood': _round_matrix(effective_likelihood),
        'exceedance': [round(g, 6) for g in dsm_likelihood.exceedance],
        'margins': [round(m, 6) for m in margins],
        'depth': search_depth,
        'distribution': distribution,
    }
