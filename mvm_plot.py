"""
mvm_plot.py — Visualisation utilities for the MVM.
Requires: matplotlib
"""
from __future__ import annotations
from typing import Optional
import math


def plot_margin_value(
    result,
    title: str = "Margin Value Plot",
    save_path: Optional[str] = None,
    show: bool = False,
):
    """
    Generate the Margin Value Plot (bubble chart).

    X-axis: weighted impact on performance (%)
    Y-axis: weighted change absorption potential (%)
    Bubble size: local excess (%)
    """
    import matplotlib
    if not show:
        matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    import numpy as np

    margin_names = list(result.excess.keys())
    x = [result.weighted_impact.get(m, 0) * 100 for m in margin_names]
    y = [result.weighted_absorption.get(m, 0) * 100 for m in margin_names]
    sizes_raw = [abs(result.excess.get(m, 0)) * 100 for m in margin_names]
    max_s = max(sizes_raw) if sizes_raw else 1
    sizes = [max(50, (s / max_s) * 2000) for s in sizes_raw]

    # Short display labels
    labels = [m.replace("E_", "E") for m in margin_names]

    fig, ax = plt.subplots(figsize=(10, 8))

    # Background quadrant shading
    x_mid = (max(x) + min(x)) / 2 if x else 0
    y_mid = (max(y) + min(y)) / 2 if y else 0

    ax.axvline(x_mid, color="gray", lw=0.8, ls="--", alpha=0.5)
    ax.axhline(y_mid, color="gray", lw=0.8, ls="--", alpha=0.5)

    # Quadrant labels
    quad_kw = dict(alpha=0.08, transform=ax.transAxes, va="center", ha="center",
                   fontsize=9, style="italic", color="#333333")
    ax.text(0.25, 0.75, "High absorption\nLow impact\n(High value)", **quad_kw)
    ax.text(0.75, 0.75, "High absorption\nHigh impact\n(Trade-off study)", **quad_kw)
    ax.text(0.25, 0.25, "Low absorption\nLow impact\n(Negligible)", **quad_kw)
    ax.text(0.75, 0.25, "Low absorption\nHigh impact\n(Reduce margin)", **quad_kw)

    scatter = ax.scatter(x, y, s=sizes, alpha=0.65, c=sizes_raw,
                         cmap="RdYlGn_r", edgecolors="k", linewidths=0.7, zorder=5)

    for i, label in enumerate(labels):
        ax.annotate(label, (x[i], y[i]), textcoords="offset points",
                    xytext=(8, 4), fontsize=9, fontweight="bold", zorder=6)

    cbar = plt.colorbar(scatter, ax=ax, pad=0.02, shrink=0.8)
    cbar.set_label("Local Excess (%)", fontsize=10)

    ax.set_xlabel("Undesirable impact on performance parameters  (Impact$_m$ %)",
                  fontsize=11)
    ax.set_ylabel("Change absorption potential  (Absorption$_m$ %)", fontsize=11)
    ax.set_title(title, fontsize=13, fontweight="bold", pad=14)
    ax.grid(True, alpha=0.3, zorder=0)

    # Legend for bubble size
    for frac, label in [(0.25, "25% excess"), (0.75, "75% excess")]:
        ax.scatter([], [], s=frac * 2000, c="gray", alpha=0.5, label=label,
                   edgecolors="k", linewidths=0.5)
    ax.legend(title="Bubble size = local excess", loc="lower right", fontsize=8,
              title_fontsize=8, framealpha=0.7)

    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches="tight")
    if show:
        plt.show()
    plt.close()


def plot_sensitivity(
    result_original,
    result_redesign,
    margin_name: str,
    title: str = "Sensitivity Study",
    save_path: Optional[str] = None,
    show: bool = False,
):
    """
    Plot how a single margin moves on the MVP when a redesign changes its value.
    Overlays original and redesigned positions.
    """
    import matplotlib
    if not show:
        matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 6))

    for result, label, color, marker in [
        (result_original, "Original", "#E05252", "o"),
        (result_redesign, "Redesign", "#3A8ADB", "D"),
    ]:
        for m in result.excess.keys():
            xi = result.weighted_impact.get(m, 0) * 100
            yi = result.weighted_absorption.get(m, 0) * 100
            sz = max(40, abs(result.excess.get(m, 0)) * 100 * 20)
            alpha = 0.9 if m == margin_name else 0.3
            lw = 2.0 if m == margin_name else 0.5
            ax.scatter(xi, yi, s=sz, c=color, alpha=alpha,
                       edgecolors="k", linewidths=lw, marker=marker,
                       label=f"{label}" if m == margin_name else "_")
            if m == margin_name:
                ax.annotate(f"{label}\n{m}", (xi, yi),
                            textcoords="offset points", xytext=(8, 4), fontsize=9)

    # Draw arrow between the two positions
    m = margin_name
    x1 = result_original.weighted_impact.get(m, 0) * 100
    y1 = result_original.weighted_absorption.get(m, 0) * 100
    x2 = result_redesign.weighted_impact.get(m, 0) * 100
    y2 = result_redesign.weighted_absorption.get(m, 0) * 100
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="->", color="purple", lw=1.5))

    ax.set_xlabel("Undesirable impact on performance (%)", fontsize=11)
    ax.set_ylabel("Change absorption potential (%)", fontsize=11)
    ax.set_title(title, fontsize=13, fontweight="bold")
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches="tight")
    if show:
        plt.show()
    plt.close()
