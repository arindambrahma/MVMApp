"""
Verification test for the margin-aware CPM implementation.

Reproduces the exact results from the MATLAB demo (demo_3x3_margin.m)
and the LaTeX paper's numerical examples.

System: A -> B -> C (linear chain)
  L(A->B) = 0.8, I(A->B) = 0.7
  L(B->C) = 0.6, I(B->C) = 0.5
  Margin on B = 0.30, distribution = truncated Normal(0.30, 0.15)

Expected results from MATLAB/paper:
  - Baseline R(C,A) = 0.2400 (no margins)
  - Gate g_B = P(delta_A > 0.30) = 0.5116
  - R(C,A) with margin = 0.1228
  - Reduction = 48.8%
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from cpm_lib import (
    DSM,
    ChangePropagationTree,
    calculate_risk_matrix,
)
from cpm_lib.margin_aware import (
    MarginConfig,
    MarginDSM,
    MarginChangePropagationTree,
    calculate_risk_matrix_margin,
    run_margin_aware_cpm,
)


def test_baseline_clarkson():
    """Test 1: Vanilla Clarkson with no margins recovers original results."""
    print("TEST 1: Baseline Clarkson (no margins)")
    print("-" * 50)

    cols = ['A', 'B', 'C']
    L = [[0, 0, 0],
         [0.8, 0, 0],
         [0, 0.6, 0]]
    I = [[0, 0, 0],
         [0.7, 0, 0],
         [0, 0.5, 0]]

    dsm_L = DSM(L, cols, 'column')
    dsm_I = DSM(I, cols, 'column')
    R = calculate_risk_matrix(dsm_I, dsm_L, search_depth=4)

    r_ba = R[1][0]  # R(B,A)
    r_ca = R[2][0]  # R(C,A)
    r_cb = R[2][1]  # R(C,B)

    print(f"  R(B,A) = {r_ba:.4f}  (expected 0.5600)")
    print(f"  R(C,A) = {r_ca:.4f}  (expected 0.2400)")
    print(f"  R(C,B) = {r_cb:.4f}  (expected 0.3000)")

    assert abs(r_ba - 0.5600) < 1e-4, f"R(B,A) = {r_ba}, expected 0.5600"
    assert abs(r_ca - 0.2400) < 1e-4, f"R(C,A) = {r_ca}, expected 0.2400"
    assert abs(r_cb - 0.3000) < 1e-4, f"R(C,B) = {r_cb}, expected 0.3000"
    print("  PASSED\n")


def test_margin_gate_computation():
    """Test 2: Exceedance probability matches paper eq. 10."""
    print("TEST 2: Margin gate computation")
    print("-" * 50)

    cfg = MarginConfig(dist_type='normal', mu=0.30, sigma=0.15)

    # At m = 0.30 = mu: should be ~0.512 (paper eq. 10)
    g_030 = cfg.exceedance(0.30)
    print(f"  P(dA > 0.30) = {g_030:.4f}  (expected ~0.5116)")
    assert abs(g_030 - 0.5116) < 0.002, f"Gate at m=0.30: {g_030}, expected ~0.5116"

    # At m = 0: should be 1.0
    g_0 = cfg.exceedance(0.0)
    print(f"  P(dA > 0.00) = {g_0:.4f}  (expected 1.0000)")
    assert abs(g_0 - 1.0) < 1e-4, f"Gate at m=0: {g_0}, expected 1.0"

    # At m = 1: should be ~0.0
    g_1 = cfg.exceedance(1.0)
    print(f"  P(dA > 1.00) = {g_1:.6f}  (expected ~0.0000)")
    assert g_1 < 0.001, f"Gate at m=1: {g_1}, expected ~0.0"

    # At m = 0.15 (mu - sigma): should be ~0.86
    g_015 = cfg.exceedance(0.15)
    print(f"  P(dA > 0.15) = {g_015:.4f}  (expected ~0.8609)")
    assert abs(g_015 - 0.8609) < 0.005, f"Gate at m=0.15: {g_015}, expected ~0.8609"

    # At m = 0.45 (mu + sigma): should be ~0.16
    g_045 = cfg.exceedance(0.45)
    print(f"  P(dA > 0.45) = {g_045:.4f}  (expected ~0.1623)")
    assert abs(g_045 - 0.1623) < 0.005, f"Gate at m=0.45: {g_045}, expected ~0.1623"

    print("  PASSED\n")


def test_margin_recovery():
    """Test 3: Margin CPM with m=0 everywhere recovers Clarkson exactly."""
    print("TEST 3: Margin CPM with zero margins recovers Clarkson")
    print("-" * 50)

    cols = ['A', 'B', 'C']
    L = [[0, 0, 0],
         [0.8, 0, 0],
         [0, 0.6, 0]]
    I = [[0, 0, 0],
         [0.7, 0, 0],
         [0, 0.5, 0]]

    margins = [0.0, 0.0, 0.0]
    cfg = {'type': 'normal', 'mu': 0.30, 'sigma': 0.15}

    dsm_L = MarginDSM(L, cols, 'column', margins, cfg)
    dsm_I = MarginDSM(I, cols, 'column', margins, cfg)
    R = calculate_risk_matrix_margin(dsm_I, dsm_L, search_depth=4)

    r_ca = R[2][0]
    print(f"  R(C,A) with zero margins = {r_ca:.4f}  (expected 0.2400)")
    assert abs(r_ca - 0.2400) < 1e-4, f"R(C,A) = {r_ca}, expected 0.2400"

    # All exceedance values should be 1.0
    for i, g in enumerate(dsm_L.exceedance):
        print(f"  g[{cols[i]}] = {g:.4f}  (expected 1.0000)")
        assert abs(g - 1.0) < 1e-4, f"g[{i}] = {g}, expected 1.0"

    print("  PASSED\n")


def test_margin_extended_result():
    """Test 4: Margin on B = 0.30 gives R(C,A) = 0.1228 (paper eq. 11)."""
    print("TEST 4: Margin-extended result (paper eq. 11)")
    print("-" * 50)

    cols = ['A', 'B', 'C']
    L = [[0, 0, 0],
         [0.8, 0, 0],
         [0, 0.6, 0]]
    I = [[0, 0, 0],
         [0.7, 0, 0],
         [0, 0.5, 0]]

    margins = [0.0, 0.30, 0.0]
    cfg = {'type': 'normal', 'mu': 0.30, 'sigma': 0.15}

    dsm_L = MarginDSM(L, cols, 'column', margins, cfg)
    dsm_I = MarginDSM(I, cols, 'column', margins, cfg)
    R = calculate_risk_matrix_margin(dsm_I, dsm_L, search_depth=4)

    r_ba = R[1][0]  # R(B,A) — direct edge, should be unchanged
    r_ca = R[2][0]  # R(C,A) — goes through B, should be reduced

    print(f"  R(B,A) = {r_ba:.4f}  (expected 0.5600 — direct edge unchanged)")
    print(f"  R(C,A) = {r_ca:.4f}  (expected 0.1228)")

    assert abs(r_ba - 0.5600) < 1e-4, f"R(B,A) = {r_ba}, expected 0.5600"
    assert abs(r_ca - 0.1228) < 0.002, f"R(C,A) = {r_ca}, expected 0.1228"

    reduction = (1 - r_ca / 0.2400) * 100
    print(f"  Reduction vs baseline = {reduction:.1f}%  (expected ~48.8%)")
    assert abs(reduction - 48.8) < 1.0, f"Reduction = {reduction}%, expected ~48.8%"

    print("  PASSED\n")


def test_sensitivity_table():
    """Test 5: Sensitivity table matches paper Table 1."""
    print("TEST 5: Sensitivity table (paper Table 1)")
    print("-" * 50)

    cols = ['A', 'B', 'C']
    L = [[0, 0, 0],
         [0.8, 0, 0],
         [0, 0.6, 0]]
    I = [[0, 0, 0],
         [0.7, 0, 0],
         [0, 0.5, 0]]

    cfg = {'type': 'normal', 'mu': 0.30, 'sigma': 0.15}
    mc = MarginConfig.from_dict(cfg)

    # Selected points from the paper's Table 1
    expected = [
        (0.00, 1.0000, 0.2400),
        (0.15, 0.8609, 0.2066),
        (0.30, 0.5116, 0.1228),
        (0.45, 0.1623, 0.0390),
        (0.70, 0.0039, 0.0009),
        (1.00, 0.0000, 0.0000),
    ]

    print(f"  {'m_B':>6s}  {'P(dA>m)':>10s}  {'R(C,A)':>10s}  {'exp_g':>10s}  {'exp_R':>10s}")
    all_ok = True
    for m_b, exp_g, exp_r in expected:
        g = mc.exceedance(m_b)
        margins = [0.0, m_b, 0.0]
        dsm_L = MarginDSM(L, cols, 'column', margins, cfg)
        dsm_I = MarginDSM(I, cols, 'column', margins, cfg)
        R = calculate_risk_matrix_margin(dsm_I, dsm_L, search_depth=4)
        r_ca = R[2][0]

        g_ok = abs(g - exp_g) < 0.005
        r_ok = abs(r_ca - exp_r) < 0.002
        status = "ok" if (g_ok and r_ok) else "FAIL"
        if not (g_ok and r_ok):
            all_ok = False

        print(f"  {m_b:6.2f}  {g:10.4f}  {r_ca:10.4f}  {exp_g:10.4f}  {exp_r:10.4f}  {status}")

    assert all_ok, "Some sensitivity table values did not match"
    print("  PASSED\n")


def test_depth_preservation():
    """Test 6: Depth parameter works correctly — depth 1 misses 2-step path."""
    print("TEST 6: Depth preservation")
    print("-" * 50)

    cols = ['A', 'B', 'C']
    L = [[0, 0, 0],
         [0.8, 0, 0],
         [0, 0.6, 0]]
    I = [[0, 0, 0],
         [0.7, 0, 0],
         [0, 0.5, 0]]

    margins = [0.0, 0.30, 0.0]
    cfg = {'type': 'normal', 'mu': 0.30, 'sigma': 0.15}

    dsm_L = MarginDSM(L, cols, 'column', margins, cfg)
    dsm_I = MarginDSM(I, cols, 'column', margins, cfg)

    R1 = calculate_risk_matrix_margin(dsm_I, dsm_L, search_depth=1)
    R2 = calculate_risk_matrix_margin(dsm_I, dsm_L, search_depth=2)
    R4 = calculate_risk_matrix_margin(dsm_I, dsm_L, search_depth=4)

    print(f"  depth=1: R(C,A) = {R1[2][0]:.4f}  (expected 0.0000)")
    print(f"  depth=2: R(C,A) = {R2[2][0]:.4f}  (expected 0.1228)")
    print(f"  depth=4: R(C,A) = {R4[2][0]:.4f}  (expected 0.1228)")

    assert abs(R1[2][0] - 0.0) < 1e-6, "Depth 1 should not find 2-step path"
    assert abs(R2[2][0] - R4[2][0]) < 1e-6, "Result should stabilise at depth 2"
    print("  PASSED\n")


def test_run_margin_aware_cpm_api():
    """Test 7: The public API function returns correct results."""
    print("TEST 7: run_margin_aware_cpm API")
    print("-" * 50)

    L = [[0, 0, 0],
         [0.8, 0, 0],
         [0, 0.6, 0]]
    I = [[0, 0, 0],
         [0.7, 0, 0],
         [0, 0.5, 0]]

    result = run_margin_aware_cpm(
        likelihood_matrix=L,
        impact_matrix=I,
        margins=[0.0, 0.30, 0.0],
        search_depth=4,
        instigator='column',
        distribution={'type': 'normal', 'mu': 0.3, 'sigma': 0.15},
    )

    r_ca = result['combinedRisk'][2][0]
    print(f"  R(C,A) = {r_ca:.4f}  (expected ~0.1228)")
    assert abs(r_ca - 0.1228) < 0.002

    # Check exceedance vector is present
    assert 'exceedance' in result
    g_b = result['exceedance'][1]
    print(f"  g_B    = {g_b:.4f}  (expected ~0.5116)")
    assert abs(g_b - 0.5116) < 0.002

    print("  PASSED\n")


def test_uniform_distribution():
    """Test 8: Uniform distribution — P(dA > m) = 1 - m."""
    print("TEST 8: Uniform distribution")
    print("-" * 50)

    cfg = MarginConfig(dist_type='uniform', a=0.0, b=1.0)
    for m in [0.0, 0.25, 0.5, 0.75, 1.0]:
        g = cfg.exceedance(m)
        expected = 1.0 - m
        print(f"  P(dA > {m:.2f}) = {g:.4f}  (expected {expected:.4f})")
        assert abs(g - expected) < 1e-4

    print("  PASSED\n")


if __name__ == '__main__':
    print("=" * 60)
    print("  MARGIN-AWARE CPM — VERIFICATION TESTS")
    print("  Comparing against MATLAB demo & LaTeX paper values")
    print("=" * 60)
    print()

    test_baseline_clarkson()
    test_margin_gate_computation()
    test_margin_recovery()
    test_margin_extended_result()
    test_sensitivity_table()
    test_depth_preservation()
    test_run_margin_aware_cpm_api()
    test_uniform_distribution()

    print("=" * 60)
    print("  ALL TESTS PASSED")
    print("=" * 60)
