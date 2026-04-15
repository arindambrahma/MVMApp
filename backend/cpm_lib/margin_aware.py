from __future__ import annotations

from typing import Any

import numpy as np


def _orient_matrix(matrix: list[list[float]], instigator: str) -> np.ndarray:
    arr = np.asarray(matrix, dtype=float)
    if arr.ndim != 2 or arr.shape[0] != arr.shape[1]:
        raise ValueError("Matrices must be square (n x n).")
    if instigator == "row":
        oriented = arr.copy()
    elif instigator == "column":
        # Column->row convention means matrix[row][col] is col -> row.
        oriented = arr.T.copy()
    else:
        raise ValueError('instigator must be "row" or "column".')
    np.fill_diagonal(oriented, 0.0)
    return oriented


def _to_float_vector(values: list[float], size: int, *, name: str) -> np.ndarray:
    if len(values) != size:
        raise ValueError(f"{name} must have length {size}.")
    out = np.asarray(values, dtype=float)
    if np.any(~np.isfinite(out)):
        raise ValueError(f"{name} contains non-finite values.")
    return out


def _round_matrix(matrix: np.ndarray, digits: int = 6) -> list[list[float]]:
    return np.round(matrix.astype(float), digits).tolist()


def _round_vector(values: np.ndarray, digits: int = 6) -> list[float]:
    return np.round(values.astype(float), digits).tolist()


def run_margin_aware_cpm(
    *,
    likelihood_matrix: list[list[float]],
    impact_matrix: list[list[float]],
    margins: list[float],
    search_depth: int = 4,
    instigator: str = "column",
    n_samples: int = 400,
    delta0: float = 1.0,
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Monte-Carlo MA-CPM implementation from the provided phase-2 formulation.

    Model mapping:
    - X_ij ~ Bernoulli(L_ij)
    - transmitted_ij = X_ij * (out_i * I_ij)
    - in_j = sum_i transmitted_ij
    - out_j = max(0, in_j - M_j)
    """
    if search_depth < 1:
        raise ValueError("search_depth must be >= 1.")
    if n_samples < 1:
        raise ValueError("n_samples must be >= 1.")
    if not np.isfinite(delta0) or delta0 <= 0:
        raise ValueError("delta0 must be a positive finite number.")

    likelihood = _orient_matrix(likelihood_matrix, instigator)
    impact = _orient_matrix(impact_matrix, instigator)
    n = likelihood.shape[0]

    # Keep likelihood bounded and enforce non-negative impact/margins.
    likelihood = np.clip(likelihood, 0.0, 1.0)
    impact = np.clip(impact, 0.0, 1.0)
    margins_vec = _to_float_vector(margins, n, name="margins")
    if np.any(margins_vec < 0):
        raise ValueError("margins must be >= 0.")

    rng = np.random.default_rng(seed)

    combined_risk = np.zeros((n, n), dtype=float)
    combined_likelihood = np.zeros((n, n), dtype=float)

    edge_exposure = np.zeros((n, n), dtype=float)
    edge_activation_hits = np.zeros((n, n), dtype=float)
    edge_margin_hits = np.zeros((n, n), dtype=float)
    edge_transmit_sum = np.zeros((n, n), dtype=float)

    for source in range(n):
        source_max_out_sum = np.zeros(n, dtype=float)
        source_activation_hits = np.zeros(n, dtype=float)

        for _ in range(n_samples):
            out_prev = np.zeros(n, dtype=float)
            out_prev[source] = float(delta0)
            max_out = np.zeros(n, dtype=float)
            activated = np.zeros(n, dtype=bool)

            for _step in range(search_depth):
                active_mask = out_prev > 0
                if not np.any(active_mask):
                    break

                sampled_edges = (rng.random((n, n)) < likelihood).astype(float)
                np.fill_diagonal(sampled_edges, 0.0)

                transmitted = (out_prev[:, None] * impact) * sampled_edges
                np.fill_diagonal(transmitted, 0.0)

                edge_exposure += active_mask[:, None].astype(float)
                edge_activation_hits += (transmitted > 0).astype(float)
                edge_margin_hits += (transmitted > margins_vec[None, :]).astype(float)
                edge_transmit_sum += transmitted

                incoming = transmitted.sum(axis=0)
                out_next = np.maximum(0.0, incoming - margins_vec)

                activated |= out_next > 0
                max_out = np.maximum(max_out, out_next)
                out_prev = out_next

            source_max_out_sum += max_out
            source_activation_hits += activated.astype(float)

        combined_risk[source, :] = source_max_out_sum / float(n_samples)
        combined_likelihood[source, :] = source_activation_hits / float(n_samples)
        combined_risk[source, source] = 0.0
        combined_likelihood[source, source] = 0.0

    outgoing = np.zeros(n, dtype=float)
    incoming = np.zeros(n, dtype=float)
    for i in range(n):
        out_vals = np.delete(combined_risk[i, :], i)
        in_vals = np.delete(combined_risk[:, i], i)
        outgoing[i] = float(np.mean(out_vals)) if out_vals.size else 0.0
        incoming[i] = float(np.mean(in_vals)) if in_vals.size else 0.0

    with np.errstate(divide="ignore", invalid="ignore"):
        effective_likelihood = np.where(
            edge_exposure > 0,
            edge_margin_hits / edge_exposure,
            0.0,
        )
        edge_activation = np.where(
            edge_exposure > 0,
            edge_activation_hits / edge_exposure,
            0.0,
        )
        expected_transmission = np.where(
            edge_exposure > 0,
            edge_transmit_sum / edge_exposure,
            0.0,
        )

    np.fill_diagonal(effective_likelihood, 0.0)
    np.fill_diagonal(edge_activation, 0.0)
    np.fill_diagonal(expected_transmission, 0.0)

    return {
        "combinedRisk": _round_matrix(combined_risk),
        "combinedLikelihood": _round_matrix(combined_likelihood),
        "incoming": _round_vector(incoming),
        "outgoing": _round_vector(outgoing),
        "effectiveLikelihood": _round_matrix(effective_likelihood),
        "edgeActivation": _round_matrix(edge_activation),
        "expectedTransmission": _round_matrix(expected_transmission),
    }
