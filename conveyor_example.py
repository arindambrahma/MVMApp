"""
Belt Conveyor Example — MVM Python Implementation
Reproduces the case study from Brahma & Wynn (2020).

Run:
    python conveyor_example.py
"""

import math
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mvm_core import MANEngine, CalculationNode, DecisionNode
from mvm_plot import plot_margin_value


# ============================================================
# Catalogue lookup tables (replicate MATLAB stepwise selection)
# ============================================================

def select_motor(P_M2: float) -> float:
    """Select next available motor power [kW] from catalogue."""
    catalogue = [18, 25, 30, 40, 50, 60, 70, 150]
    for v in catalogue:
        if P_M2 <= v:
            return v
    return 150.0


def select_brake(T_BR: float) -> float:
    """Select next available brake torque [Nm] from catalogue."""
    catalogue = [126, 250, 746, 1356, 2712, 5426]
    for v in catalogue:
        if T_BR <= v:
            return v
    return 5426.0


def select_gearbox(P_GB: float) -> float:
    """Select next available gearbox power [kW] from catalogue."""
    catalogue = [20, 40, 45, 55, 75, 100, 150, 200]
    for v in catalogue:
        if P_GB <= v:
            return v
    return 200.0


PULLEY_STEPS = [0.500, 0.630, 0.800, 1.000, 1.250, 1.400, 1.600, 1.800, 2.000]
PULLEY_TAIL  = [0.400, 0.500, 0.630, 0.800, 1.000, 1.250, 1.250, 1.400, 1.600]
PULLEY_SNUB  = [0.315, 0.400, 0.500, 0.630, 0.800, 1.000, 1.000, 1.250, 1.250]

def _pulley_select(D_DR: float):
    """Return (D_D, D_T, D_S) decided pulley diameters [m]."""
    for i, limit in enumerate(PULLEY_STEPS):
        if D_DR <= limit:
            return PULLEY_STEPS[i], PULLEY_TAIL[i], PULLEY_SNUB[i]
    return PULLEY_STEPS[-1], PULLEY_TAIL[-1], PULLEY_SNUB[-1]

def select_drive_pulley(D_DR: float) -> float:
    return _pulley_select(D_DR)[0]

def select_tail_pulley(D_DR: float) -> float:
    return _pulley_select(D_DR)[1]

def select_snub_pulley(D_DR: float) -> float:
    return _pulley_select(D_DR)[2]


def _round_up_shaft(d: float, step: float = 0.005) -> float:
    return math.ceil(d / step) * step


# ============================================================
# Build the MAN
# ============================================================

def build_conveyor_man() -> MANEngine:
    g = 9.81
    man = MANEngine()

    # ── Input parameters ────────────────────────────────────
    man.set_params(
        C=1200, V=2.5, rho=0.8, mu=0.275, B_CT=6.4,
        # Fixed inputs
        eta_i=0.93, beta=0.07, delta=6.0,
        phi_D=210.0, phi_S=30.0, phi_T=6.0,
        zeta=1.35,
        A_1=0.0112, A_2=0.0168, b_1=0.934,
        B_W=1400.0, C_H=32.0, DF=0.88,
        E=2_150_000.0, f=0.03, H=2.5, K_b=1.5, K_t=1.0,
        L=24.0, L_a=0.4, L_H=141.0, L_SK=4.6,
        m_2=0.6, m_3=0.65, m_B=14.0, m_c=49.0, m_r=14.6,
        N_1=1500.0, N_t=0.0,
        P_1=80000.0, P_2=50000.0,
        P_b=1000.0, P_t=500.0,
        R_b=240.0, R_bd=250.0, R_i=0.0, R_p=0.0,
        R_w=315.0, R_wd=230.0, SF=1.5, V_0=1.25,
    )

    man.mark_input("C", "V", "rho", "mu", "B_CT")
    man.mark_performance("TCS", "TWS", "IS", "eta_m")

    # ── Task 1 — Calculate Resistances ──────────────────────
    man.add_calc(CalculationNode("M_G", lambda C, V: (C * 1000) / (3600 * V),
                                  ["C", "V"], "M_G"))
    man.add_calc(CalculationNode("Q", lambda C, rho: C / (rho * 3600),
                                  ["C", "rho"], "Q"))
    man.add_calc(CalculationNode("R_ska",
        lambda m_2, Q, rho, L_a, V, V_0, b_1:
            (m_2 * Q**2 * 1000 * rho * g * L_a) / (((V + V_0) / 2)**2 * b_1**2),
        ["m_2", "Q", "rho", "L_a", "V", "V_0", "b_1"], "R_ska"))
    man.add_calc(CalculationNode("R_sk",
        lambda m_2, Q, rho, L_SK, V, b_1:
            2 * (m_2 * Q**2 * 1000 * rho * g * L_SK) / (V**2 * b_1**2),
        ["m_2", "Q", "rho", "L_SK", "V", "b_1"], "R_sk"))
    man.add_calc(CalculationNode("R_a",
        lambda Q, rho, V, V_0: Q * 1000 * rho * (V - V_0),
        ["Q", "rho", "V", "V_0"], "R_a"))
    man.add_calc(CalculationNode("R_bc1", lambda A_1, P_1, m_3: A_1 * P_1 * m_3,
                                  ["A_1", "P_1", "m_3"], "R_bc1"))
    man.add_calc(CalculationNode("R_bc2", lambda A_2, P_2, m_3: A_2 * P_2 * m_3,
                                  ["A_2", "P_2", "m_3"], "R_bc2"))
    man.add_calc(CalculationNode("R_bc", lambda R_bc1, R_bc2: R_bc1 + R_bc2,
                                  ["R_bc1", "R_bc2"], "R_bc"))
    man.add_calc(CalculationNode("R_sp",
        lambda R_i, R_sk, R_bc, R_p: R_i + R_sk + R_bc + R_p,
        ["R_i", "R_sk", "R_bc", "R_p"], "R_sp"))
    man.add_calc(CalculationNode("R_S",
        lambda R_a, R_ska, R_w, R_b: R_a + R_ska + R_w + R_b,
        ["R_a", "R_ska", "R_w", "R_b"], "R_S"))
    man.add_calc(CalculationNode("R",
        lambda f, L, m_c, m_r, m_B, M_G, delta:
            f * L * g * (m_c + m_r + (2 * m_B + M_G) * math.cos(math.radians(delta))),
        ["f", "L", "m_c", "m_r", "m_B", "M_G", "delta"], "R"))
    man.add_calc(CalculationNode("R_SL",
        lambda M_G, H: M_G * H * g, ["M_G", "H"], "R_SL"))
    man.add_calc(CalculationNode("T_E",
        lambda R, R_S, R_sp, R_SL: R + R_S + R_sp + R_SL,
        ["R", "R_S", "R_sp", "R_SL"], "T_E"))

    # ── Task 2 — Calculate Power ─────────────────────────────
    man.add_calc(CalculationNode("P_DP",
        lambda T_E, N_t, beta, V: (T_E * V) * (1 + N_t * beta) / 1000,
        ["T_E", "N_t", "beta", "V"], "P_DP"))
    man.add_calc(CalculationNode("P_A",
        lambda P_DP, R_wd, R_bd, V: P_DP + (R_wd + R_bd) * V / 1000,
        ["P_DP", "R_wd", "R_bd", "V"], "P_A"))

    # ── Task 3 — Belt Tension ────────────────────────────────
    def belt_tension(T_E, mu, zeta, H, m_r, m_B, f, L, phi_D, M_G):
        phi_rad = math.radians(phi_D)
        T_1 = T_E * (zeta / (math.exp(mu * phi_rad) - 1) + 1)
        T_2a = T_1 / math.exp(mu * phi_rad)
        T_emax = T_E * zeta
        T2min = T_emax * (1 / (math.exp(mu * phi_rad) - 1))
        Tminc = (1 * (m_B + M_G) * g) / (8 * 0.02)
        Tminr = (3 * m_B * g) / (8 * 0.02)
        Tmin = max(Tminc, Tminr)
        T_2 = max(T_2a, Tmin, T2min)
        T_T = T_2 + f * L * g * (m_B + m_r) - (H * g * m_B)
        return T_1, T_2, T_T

    man.add_calc(CalculationNode("T_1",
        lambda T_E, mu, zeta, H, m_r, m_B, f, L, phi_D, M_G:
            belt_tension(T_E, mu, zeta, H, m_r, m_B, f, L, phi_D, M_G)[0],
        ["T_E", "mu", "zeta", "H", "m_r", "m_B", "f", "L", "phi_D", "M_G"], "T_1"))
    man.add_calc(CalculationNode("T_2",
        lambda T_E, mu, zeta, H, m_r, m_B, f, L, phi_D, M_G:
            belt_tension(T_E, mu, zeta, H, m_r, m_B, f, L, phi_D, M_G)[1],
        ["T_E", "mu", "zeta", "H", "m_r", "m_B", "f", "L", "phi_D", "M_G"], "T_2"))
    man.add_calc(CalculationNode("T_T",
        lambda T_E, mu, zeta, H, m_r, m_B, f, L, phi_D, M_G:
            belt_tension(T_E, mu, zeta, H, m_r, m_B, f, L, phi_D, M_G)[2],
        ["T_E", "mu", "zeta", "H", "m_r", "m_B", "f", "L", "phi_D", "M_G"], "T_T"))

    # ── Task 4 — Select Motor ────────────────────────────────
    man.add_calc(CalculationNode("P_M2",
        lambda P_A, eta_i, DF: (P_A / eta_i) / DF,
        ["P_A", "eta_i", "DF"], "P_M2"))
    man.add_decision(DecisionNode(
        name="motor",
        func=lambda P_M2: select_motor(P_M2),
        threshold_func=lambda P_M2: P_M2,
        input_names=["P_M2"],
        decided_name="P_M", threshold_name="P_M2_thresh",
        description="Select motor from catalogue",
    ))

    # ── Task 7 — Select Pulleys (moved before Task 5: N_D needs D_D) ─
    man.add_calc(CalculationNode("D_DR",
        lambda B_CT: (47.455 * B_CT + 271.29) / 1000, ["B_CT"], "D_DR"))
    man.add_calc(CalculationNode("D_TR",
        lambda B_CT: (36.364 * B_CT + 225.27) / 1000, ["B_CT"], "D_TR"))
    man.add_calc(CalculationNode("D_SR",
        lambda B_CT: (34.545 * B_CT + 142.91) / 1000, ["B_CT"], "D_SR"))
    # Pulley weights from required diameters — for shaft force calculations
    man.add_calc(CalculationNode("W_PD",
        lambda D_DR: 2520.54 * 1.4 * math.pi * D_DR**2 / 4, ["D_DR"], "W_PD"))
    man.add_calc(CalculationNode("W_PT",
        lambda D_TR: 1637.02 * 1.4 * math.pi * D_TR**2 / 4, ["D_TR"], "W_PT"))
    man.add_calc(CalculationNode("W_PS",
        lambda D_SR: 2520.54 * 1.4 * math.pi * D_SR**2 / 4, ["D_SR"], "W_PS"))

    man.add_decision(DecisionNode(
        name="drive_pulley",
        func=lambda D_DR: select_drive_pulley(D_DR),
        threshold_func=lambda D_DR: D_DR,
        input_names=["D_DR"],
        decided_name="D_D", threshold_name="D_DR_thresh",
        description="Select drive pulley diameter",
    ))
    man.add_decision(DecisionNode(
        name="tail_pulley",
        func=lambda D_DR: select_tail_pulley(D_DR),
        threshold_func=lambda D_DR: D_TR_from(D_DR),
        input_names=["D_DR"],
        decided_name="D_T", threshold_name="D_TR_thresh",
        description="Select tail pulley diameter",
    ))
    man.add_decision(DecisionNode(
        name="snub_pulley",
        func=lambda D_DR: select_snub_pulley(D_DR),
        threshold_func=lambda D_DR: D_SR_from(D_DR),
        input_names=["D_DR"],
        decided_name="D_S", threshold_name="D_SR_thresh",
        description="Select snub pulley diameter",
    ))

    # ── Task 5 — Select Gearbox ──────────────────────────────
    man.add_calc(CalculationNode("N_D",
        lambda V, D_D: (V * 60) / (math.pi * D_D),
        ["V", "D_D"], "N_D"))
    man.add_calc(CalculationNode("P_GB",
        lambda P_M2: P_M2 * 1.5, ["P_M2"], "P_GB"))
    man.add_decision(DecisionNode(
        name="gearbox",
        func=lambda P_GB: select_gearbox(P_GB),
        threshold_func=lambda P_GB: P_GB,
        input_names=["P_GB"],
        decided_name="G_M", threshold_name="P_GB_thresh",
        description="Select gearbox from catalogue",
    ))

    # ── Task 6 — Select Brake ────────────────────────────────
    man.add_calc(CalculationNode("T_BR",
        lambda SF, P_M2, N_1: (974 * SF * g * P_M2) / N_1,
        ["SF", "P_M2", "N_1"], "T_BR"))
    man.add_decision(DecisionNode(
        name="brake",
        func=lambda T_BR: select_brake(T_BR),
        threshold_func=lambda T_BR: T_BR,
        input_names=["T_BR"],
        decided_name="T_BS", threshold_name="T_BR_thresh",
        description="Select brake from catalogue",
    ))

    # ── Task 8 — Shaft diameters ─────────────────────────────
    def drive_shaft_min(C_H, phi_D, W_PD, T_2, T_1, P_A, N_D, K_t, P_t, E, L_H, K_b):
        F_YD = W_PD - (T_2 / g) * math.sin(math.radians(phi_D - 180))
        F_XD = (T_1 / g) + (T_2 / g) * math.cos(math.radians(phi_D - 180))
        W_D = math.sqrt(F_XD**2 + F_YD**2)
        M_TD = (1.34 * P_A * 4500 * 100) / (2 * math.pi * N_D)
        M_BD = (W_D / 2) * C_H
        d_aD = (16 * math.sqrt((K_b * M_BD)**2 + (K_t * M_TD)**2) / (math.pi * P_t))**(1/3)
        I_D = (W_D * C_H * L_H) / (4 * E * 0.001)
        d_bD = ((I_D * 64) / math.pi)**(1/4)
        return max(d_aD, d_bD) / 100

    def tail_shaft_min(C_H, phi_T, W_PT, T_T, K_b, E, L_H, P_b):
        F_YT = W_PT - 2 * (T_T / g) * math.sin(math.radians(phi_T))
        F_XT = 2 * (T_T / g) * math.cos(math.radians(phi_T))
        W_T = math.sqrt(F_XT**2 + F_YT**2)
        M_BT = (W_T / 2) * C_H
        d_aT = ((32 * M_BT * K_b) / (math.pi * P_b))**(1/3)
        I_T = (W_T * C_H * L_H) / (4 * E * 0.001)
        d_bT = ((I_T * 64) / math.pi)**(1/4)
        return max(d_aT, d_bT) / 100

    def snub_shaft_min(C_H, phi_S, W_PS, T_2, K_b, E, L_H, P_b):
        F_YS = W_PS + (T_2 / g) * math.sin(math.radians(phi_S))
        F_XS = (T_2 / g) - (T_2 / g) * math.cos(math.radians(phi_S))
        W_S = math.sqrt(F_XS**2 + F_YS**2)
        M_BS = (W_S / 2) * C_H
        d_aS = ((32 * M_BS * K_b) / (math.pi * P_b))**(1/3)
        I_S = (W_S * C_H * L_H) / (4 * E * 0.001)
        d_bS = ((I_S * 64) / math.pi)**(1/4)
        return max(d_aS, d_bS) / 100

    man.add_calc(CalculationNode("d_D_min",
        lambda C_H, phi_D, W_PD, T_2, T_1, P_A, N_D, K_t, P_t, E, L_H, K_b:
            drive_shaft_min(C_H, phi_D, W_PD, T_2, T_1, P_A, N_D, K_t, P_t, E, L_H, K_b),
        ["C_H", "phi_D", "W_PD", "T_2", "T_1", "P_A", "N_D", "K_t", "P_t", "E", "L_H", "K_b"],
        "d_D_min"))
    man.add_calc(CalculationNode("d_T_min",
        lambda C_H, phi_T, W_PT, T_T, K_b, E, L_H, P_b:
            tail_shaft_min(C_H, phi_T, W_PT, T_T, K_b, E, L_H, P_b),
        ["C_H", "phi_T", "W_PT", "T_T", "K_b", "E", "L_H", "P_b"], "d_T_min"))
    man.add_calc(CalculationNode("d_S_min",
        lambda C_H, phi_S, W_PS, T_2, K_b, E, L_H, P_b:
            snub_shaft_min(C_H, phi_S, W_PS, T_2, K_b, E, L_H, P_b),
        ["C_H", "phi_S", "W_PS", "T_2", "K_b", "E", "L_H", "P_b"], "d_S_min"))

    man.add_decision(DecisionNode(
        name="drive_shaft",
        func=lambda d_D_min: _round_up_shaft(d_D_min),
        threshold_func=lambda d_D_min: d_D_min,
        input_names=["d_D_min"],
        decided_name="d_DS", threshold_name="d_D_thresh",
        description="Round up drive shaft diameter",
    ))
    man.add_decision(DecisionNode(
        name="tail_shaft",
        func=lambda d_T_min: _round_up_shaft(d_T_min) + 0.005,
        threshold_func=lambda d_T_min: d_T_min,
        input_names=["d_T_min"],
        decided_name="d_TS", threshold_name="d_T_thresh",
        description="Round up tail shaft diameter",
    ))
    man.add_decision(DecisionNode(
        name="snub_shaft",
        func=lambda d_S_min: _round_up_shaft(d_S_min),
        threshold_func=lambda d_S_min: d_S_min,
        input_names=["d_S_min"],
        decided_name="d_SS", threshold_name="d_S_thresh",
        description="Round up snub shaft diameter",
    ))

    # ── Performance parameters ───────────────────────────────
    def perf_eta_m(P_M):
        return 4.9313 * math.log(P_M) + 75.682

    def perf_IS(P_M, G_M):
        I_m = 0.0002 * P_M**2 + 0.016 * P_M - 0.0458
        I_g = 0.00002 * G_M**1.6939
        return I_m + I_g

    def perf_TWS(P_M, T_BS, G_M, D_D, D_T, D_S, d_SS, d_DS, d_TS):
        W_m = 7.9682 * P_M + 2.6607
        W_RS = 0.1285 * T_BS + 90.473
        W_GB = 88.617 * math.exp(0.02 * G_M)
        W_TS = 7700 * math.pi * 2.05 * d_TS**2 / 4
        W_DP = 7700 * math.pi * 2.05 * d_DS**2 / 4
        W_SP = 7700 * math.pi * 2.05 * d_SS**2 / 4
        W_PS = 2520.54 * 1.4 * math.pi * D_S**2 / 4
        W_PT = 1637.02 * 1.4 * math.pi * D_T**2 / 4
        W_PD = 2520.54 * 1.4 * math.pi * D_D**2 / 4
        return W_m + W_RS + W_GB + W_TS + W_DP + W_SP + W_PD + W_PT + W_PS

    def perf_TCS(P_M, T_BS, G_M, D_D, D_T, D_S, d_SS, d_DS, d_TS):
        C_m = 50 * P_M + 150
        C_BR = 2 * T_BS + 800
        C_GB = 40 * G_M + 200
        C_TS = 12397 * d_TS**2 + 150
        C_SP = 12397 * d_SS**2 + 150
        C_DP = 12397 * d_DS**2 + 150
        C_PS = (12397 * D_S**2 / 2) + 150
        C_PD = (12397 * D_D**2 / 2) + 150
        C_PT = (12397 * D_T**2 / 2) + 150
        return C_m + C_BR + C_GB + C_TS + C_SP + C_DP + C_PS + C_PD + C_PT

    man.add_calc(CalculationNode("eta_m",
        lambda P_M: perf_eta_m(P_M), ["P_M"], "eta_m"))
    man.add_calc(CalculationNode("IS",
        lambda P_M, G_M: perf_IS(P_M, G_M), ["P_M", "G_M"], "IS"))
    man.add_calc(CalculationNode("TWS",
        lambda P_M, T_BS, G_M, D_D, D_T, D_S, d_SS, d_DS, d_TS:
            perf_TWS(P_M, T_BS, G_M, D_D, D_T, D_S, d_SS, d_DS, d_TS),
        ["P_M", "T_BS", "G_M", "D_D", "D_T", "D_S", "d_SS", "d_DS", "d_TS"], "TWS"))
    man.add_calc(CalculationNode("TCS",
        lambda P_M, T_BS, G_M, D_D, D_T, D_S, d_SS, d_DS, d_TS:
            perf_TCS(P_M, T_BS, G_M, D_D, D_T, D_S, d_SS, d_DS, d_TS),
        ["P_M", "T_BS", "G_M", "D_D", "D_T", "D_S", "d_SS", "d_DS", "d_TS"], "TCS"))

    return man


# helper functions used inside lambdas above
def D_TR_from(D_DR): return (36.364 * _B_CT_from_D_DR(D_DR) + 225.27) / 1000
def D_SR_from(D_DR): return (34.545 * _B_CT_from_D_DR(D_DR) + 142.91) / 1000
def _B_CT_from_D_DR(D_DR): return (D_DR * 1000 - 271.29) / 47.455


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    print("Building belt conveyor MAN ...")
    man = build_conveyor_man()

    print("Running baseline ...")
    base = man._baseline()
    print(f"  P_M2 (required motor power): {base.get('P_M2', 'N/A'):.2f} kW")
    print(f"  P_M  (selected motor power): {base.get('P_M', 'N/A'):.2f} kW")
    print(f"  T_BR (required brake torque): {base.get('T_BR', 'N/A'):.2f} Nm")
    print(f"  T_BS (selected brake torque): {base.get('T_BS', 'N/A'):.2f} Nm")
    print(f"  TCS  (total cost):  ${base.get('TCS', 'N/A'):.0f}")
    print(f"  TWS  (total weight): {base.get('TWS', 'N/A'):.1f} kg")
    print()

    print("Running MVM analysis (this may take 30-60 s for deterioration loops) ...")
    result = man.analyse(
        perf_weights={"TCS": 1, "TWS": 1, "IS": 1, "eta_m": 1},
        input_weights={"C": 1, "V": 1, "rho": 1, "mu": 1, "B_CT": 1},
        deterioration_step=0.002,
    )

    print(result.summary_table())

    print("\nGenerating Margin Value Plot ...")
    save_dir = os.path.dirname(os.path.abspath(__file__))
    save_file = os.path.join(save_dir, "conveyor_mvp.png")
    try:
        plot_margin_value(result, title="Belt Conveyor — Margin Value Plot",
                          save_path=save_file)
        print(f"Plot saved to {save_file}")
    except Exception as e:
        print(f"Plot error: {e}")
