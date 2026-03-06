"""
Flask backend for MAN Diagram Tool.
Wraps mvm_core.py to run MVM analysis from the GUI.
"""
import ast
import math
import numpy as np
import re
import sys
import os
import io
import base64
import traceback
from collections import defaultdict, deque

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

def _get_runtime_root():
    """Resolve the runtime root for source and frozen (PyInstaller) builds."""
    if getattr(sys, 'frozen', False):
        return getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


RUNTIME_ROOT = _get_runtime_root()
FRONTEND_DIST_DIR = os.path.join(RUNTIME_ROOT, 'man-diagram-tool', 'dist')
EXAMPLES_DIR = os.path.join(RUNTIME_ROOT, 'examples')

# Add project root so we can import mvm_core and mvm_plot
if RUNTIME_ROOT not in sys.path:
    sys.path.insert(0, RUNTIME_ROOT)
from mvm_core import MANEngine, CalculationNode, DecisionNode
from mvm_plot import plot_margin_value

app = Flask(__name__, static_folder=FRONTEND_DIST_DIR, static_url_path='')
CORS(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def sanitize(label):
    """Convert a node label to a valid Python variable name."""
    if not label:
        return 'unnamed'
    s = re.sub(r'[^a-zA-Z0-9_]', '_', label)
    s = re.sub(r'^[0-9]+', '', s)
    s = re.sub(r'_+', '_', s)
    s = s.strip('_')
    return s or 'unnamed'


# Whitelist of safe AST node types for formula evaluation
SAFE_AST_NODES = {
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Name, ast.Load,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.FloorDiv,
    ast.USub, ast.UAdd, ast.Not, ast.Call, ast.Attribute,
    ast.Compare, ast.BoolOp,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
    ast.And, ast.Or,
    ast.Dict,
    ast.Subscript, ast.Slice, ast.Index,
    ast.ListComp, ast.comprehension, ast.IfExp,
}

SAFE_MATH_NAMES = {
    'sqrt', 'abs', 'pow', 'log', 'log10', 'exp',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'ceil', 'floor', 'round', 'min', 'max',
    'pi', 'e', 'Math', 'np', 'math', 'ValueError', 'float', 'int',
}

# Extended whitelist for multi-statement function bodies
SAFE_BODY_AST_NODES = SAFE_AST_NODES | {
    ast.Assign, ast.AugAssign, ast.Return,
    ast.Tuple, ast.List, ast.Store, ast.Del,
    ast.If, ast.Raise,
}


def validate_ast(node, allowed_names):
    """Recursively check that every AST node is safe."""
    if type(node) not in SAFE_AST_NODES:
        raise ValueError(f"Disallowed expression: {ast.dump(node)}")
    if isinstance(node, ast.Name):
        if node.id not in allowed_names and node.id not in SAFE_MATH_NAMES:
            raise ValueError(f"Unknown variable: {node.id}")
    for child in ast.iter_child_nodes(node):
        validate_ast(child, allowed_names)


def build_lambda(formula_str, input_var_names):
    """
    Convert a formula string into a callable lambda.
    E.g. "P_A / eta_i / DF" with inputs ["P_A", "eta_i", "DF"]
         -> lambda P_A, eta_i, DF: P_A / eta_i / DF

    Supports: variable names, numeric constants, +, -, *, /, **, math functions.
    """
    if not formula_str or not formula_str.strip():
        raise ValueError("Empty formula")

    clean = formula_str.strip()
    # Replace ^ with ** for exponentiation
    clean = clean.replace('^', '**')
    # Replace common unicode math symbols
    clean = clean.replace('\u00D7', '*').replace('\u00B7', '*').replace('\u2212', '-')

    # Map short math names to math module
    for fn in ['sqrt', 'abs', 'pow', 'log', 'log10', 'exp',
               'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
               'ceil', 'floor']:
        # Replace standalone function calls (not prefixed by math.)
        clean = re.sub(rf'\b(?<!math\.){fn}\b(?=\s*\()', f'math.{fn}', clean)

    # Replace pi/e constants
    clean = re.sub(r'\bpi\b', 'math.pi', clean)
    clean = re.sub(r'\be\b(?!\w)', 'math.e', clean)
    # Replace Math.xxx with math.xxx
    clean = clean.replace('Math.', 'math.')

    # Parse and validate AST
    try:
        tree = ast.parse(clean, mode='eval')
    except SyntaxError as e:
        raise ValueError(f"Syntax error in formula: {e}")

    all_allowed = set(input_var_names) | SAFE_MATH_NAMES | {'math'}
    validate_ast(tree, all_allowed)

    # Build lambda
    args = ', '.join(input_var_names)
    code = compile(tree, '<formula>', 'eval')
    # Create the function with math in scope
    fn = eval(f"lambda {args}: None")  # placeholder
    # Actually build it properly
    namespace = {'math': math}
    func_code = f"lambda {args}: {clean}"
    fn = eval(func_code, namespace)
    return fn


SAFE_EVAL_GLOBALS = {
    '__builtins__': {},
    'math': math,
    'np': np,
    'sqrt': math.sqrt,
    'abs': abs,
    'pow': pow,
    'log': math.log,
    'log10': math.log10,
    'exp': math.exp,
    'sin': math.sin,
    'cos': math.cos,
    'tan': math.tan,
    'asin': math.asin,
    'acos': math.acos,
    'atan': math.atan,
    'atan2': math.atan2,
    'ceil': math.ceil,
    'floor': math.floor,
    'round': round,
    'min': min,
    'max': max,
    'pi': math.pi,
    'e': math.e,
    'ValueError': ValueError,
    'float': float,
    'int': int,
}

ALLOWED_ROOT_POLICIES = {'min', 'max', 'first'}


def normalize_root_policy(policy):
    p = str(policy or 'min').strip().lower()
    return p if p in ALLOWED_ROOT_POLICIES else 'min'


def _real_scalar(v):
    if isinstance(v, (int, float, np.integer, np.floating)):
        f = float(v)
        return f if np.isfinite(f) else None
    if isinstance(v, (complex, np.complexfloating)):
        if abs(v.imag) <= 1e-9 and np.isfinite(v.real):
            return float(v.real)
        return None
    return None


def choose_root_like_value(value, root_policy='min'):
    """
    Convert scalar/array-like value to a single float.
    For arrays, prefer positive real candidates and choose by policy.
    """
    scalar = _real_scalar(value)
    if scalar is not None:
        return scalar

    try:
        arr = np.asarray(value).reshape(-1)
    except Exception as e:
        raise ValueError(f"Cannot interpret value as numeric scalar/array: {e}")

    real_vals = []
    for item in arr:
        rv = _real_scalar(item)
        if rv is not None:
            real_vals.append(rv)
    if not real_vals:
        raise ValueError("No finite real values found in array output.")

    pos_vals = [x for x in real_vals if x > 0]
    candidates = pos_vals if pos_vals else real_vals
    policy = normalize_root_policy(root_policy)
    if policy == 'max':
        return max(candidates)
    if policy == 'first':
        return candidates[0]
    return min(candidates)


def infer_outputs_from_expr(expr):
    if isinstance(expr, ast.Dict):
        keys = []
        for key in expr.keys:
            if isinstance(key, ast.Constant):
                keys.append(str(key.value))
            elif isinstance(key, ast.Name):
                keys.append(key.id)
        return [sanitize(k) or 'out' for k in keys] or ['out']
    if isinstance(expr, (ast.Tuple, ast.List)):
        names = []
        for elt in expr.elts:
            if isinstance(elt, ast.Name):
                names.append(elt.id)
            else:
                names.append(f'out{len(names) + 1}')
        return names
    if isinstance(expr, ast.Name):
        return [expr.id]
    return ['out']


def validate_calc_function(function_code, input_values, root_selection_policy='min'):
    params, return_expr = parse_function_definition(function_code)
    missing = [p for p in params if p not in input_values]
    if missing:
        raise ValueError(f"Missing values for inputs: {', '.join(missing)}")

    call_args = []
    for p in params:
        try:
            call_args.append(float(input_values[p]))
        except (TypeError, ValueError):
            raise ValueError(f"Invalid numeric value for {p}")

    # Exec the full function and call it
    fn_namespace = dict(SAFE_EVAL_GLOBALS)
    exec(compile(ast.parse(function_code, mode='exec'), '<calc_function>', 'exec'), fn_namespace)
    fn_name = [s for s in ast.parse(function_code, mode='exec').body
               if isinstance(s, ast.FunctionDef)][0].name
    result = fn_namespace[fn_name](*call_args)

    output_names = infer_outputs_from_expr(return_expr)
    outputs = {}
    if isinstance(result, dict):
        for name in output_names:
            if name in result:
                outputs[name] = choose_root_like_value(result[name], root_selection_policy)
    elif isinstance(result, (list, tuple, np.ndarray)):
        for idx, name in enumerate(output_names):
            if idx < len(result):
                outputs[name] = choose_root_like_value(result[idx], root_selection_policy)
    else:
        outputs[output_names[0]] = choose_root_like_value(result, root_selection_policy)
    return outputs


def _collect_assign_names(target, names):
    """Recursively collect variable names from an assignment target."""
    if isinstance(target, ast.Name):
        names.add(target.id)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for elt in target.elts:
            _collect_assign_names(elt, names)


def validate_body_expr(node, allowed_names):
    """Validate an expression node inside a multi-line function body."""
    if type(node) not in SAFE_BODY_AST_NODES:
        raise ValueError(f"Disallowed expression type '{type(node).__name__}' in function body")
    if isinstance(node, ast.Name):
        if isinstance(node.ctx, ast.Load) and node.id not in allowed_names and node.id not in SAFE_MATH_NAMES:
            raise ValueError(f"Unknown variable: '{node.id}'")
    if isinstance(node, ast.ListComp):
        # Validate generators first so loop variables are introduced before
        # validating the element expression.
        for gen in node.generators:
            validate_body_expr(gen, allowed_names)
        validate_body_expr(node.elt, allowed_names)
        return
    if isinstance(node, ast.comprehension):
        _collect_assign_names(node.target, allowed_names)
        validate_body_expr(node.iter, allowed_names)
        for if_clause in node.ifs:
            validate_body_expr(if_clause, allowed_names)
        return
    for child in ast.iter_child_nodes(node):
        validate_body_expr(child, allowed_names)


def validate_function_body_stmts(body, param_names):
    """
    Validate a multi-statement function body.
    Allowed: assignments, guarded if-statements, raise, return statements.
    Returns the return expression AST node from the last return statement.
    """
    allowed_names = set(param_names) | SAFE_MATH_NAMES | {'math', 'np'}
    return_expr = None
    for stmt in body:
        if isinstance(stmt, ast.Assign):
            validate_body_expr(stmt.value, allowed_names)
            for target in stmt.targets:
                _collect_assign_names(target, allowed_names)
        elif isinstance(stmt, ast.AugAssign):
            validate_body_expr(stmt.value, allowed_names)
            _collect_assign_names(stmt.target, allowed_names)
        elif isinstance(stmt, ast.If):
            validate_body_expr(stmt.test, allowed_names)
            if not stmt.body:
                raise ValueError("If statement must have a body.")
            for inner in stmt.body:
                if isinstance(inner, ast.Assign):
                    validate_body_expr(inner.value, allowed_names)
                    for target in inner.targets:
                        _collect_assign_names(target, allowed_names)
                elif isinstance(inner, ast.AugAssign):
                    validate_body_expr(inner.value, allowed_names)
                    _collect_assign_names(inner.target, allowed_names)
                elif isinstance(inner, ast.Raise):
                    if inner.exc is not None:
                        validate_body_expr(inner.exc, allowed_names)
                elif isinstance(inner, ast.Return):
                    if inner.value is not None:
                        validate_body_expr(inner.value, allowed_names)
                    return_expr = inner.value
                else:
                    raise ValueError(
                        f"Disallowed statement '{type(inner).__name__}' inside if. "
                        "Only assignments, raise, and return are allowed."
                    )
            if stmt.orelse:
                for inner in stmt.orelse:
                    if isinstance(inner, ast.Assign):
                        validate_body_expr(inner.value, allowed_names)
                        for target in inner.targets:
                            _collect_assign_names(target, allowed_names)
                    elif isinstance(inner, ast.AugAssign):
                        validate_body_expr(inner.value, allowed_names)
                        _collect_assign_names(inner.target, allowed_names)
                    elif isinstance(inner, ast.Raise):
                        if inner.exc is not None:
                            validate_body_expr(inner.exc, allowed_names)
                    elif isinstance(inner, ast.Return):
                        if inner.value is not None:
                            validate_body_expr(inner.value, allowed_names)
                        return_expr = inner.value
                    else:
                        raise ValueError(
                            f"Disallowed statement '{type(inner).__name__}' inside else. "
                            "Only assignments, raise, and return are allowed."
                        )
        elif isinstance(stmt, ast.Raise):
            if stmt.exc is not None:
                validate_body_expr(stmt.exc, allowed_names)
        elif isinstance(stmt, ast.Return):
            if stmt.value is not None:
                validate_body_expr(stmt.value, allowed_names)
            return_expr = stmt.value
        else:
            raise ValueError(
                f"Disallowed statement '{type(stmt).__name__}'. "
                "Only assignments and return are allowed in calculation functions."
            )
    if return_expr is None:
        raise ValueError("Function must include a return statement.")
    return return_expr


def parse_function_definition(function_code):
    """
    Parse a Python function definition for a calculation function node.
    Supports multi-line bodies with intermediate assignments.
    """
    if not function_code or not str(function_code).strip():
        raise ValueError("Empty function code")

    try:
        module = ast.parse(function_code, mode='exec')
    except SyntaxError as e:
        raise ValueError(f"Syntax error in function: {e}")

    non_empty = [s for s in module.body if not isinstance(s, ast.Pass)]
    if len(non_empty) != 1 or not isinstance(non_empty[0], ast.FunctionDef):
        raise ValueError("Provide exactly one function definition (def ...).")

    fn_def = non_empty[0]
    if fn_def.decorator_list:
        raise ValueError("Decorators are not allowed in calculation functions.")

    args = fn_def.args
    if args.vararg or args.kwarg or args.kwonlyargs or args.posonlyargs or args.defaults:
        raise ValueError("Only simple positional arguments are supported in calculation functions.")

    param_names = [a.arg for a in args.args]
    for p in param_names:
        if not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', p):
            raise ValueError(f"Invalid parameter name: {p}")

    body = list(fn_def.body)
    # Skip optional docstring
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
        body = body[1:]

    if not body:
        raise ValueError("Function body is empty.")

    return_expr = validate_function_body_stmts(body, param_names)
    return param_names, return_expr


def build_calc_function(function_code, input_aliases, available_runtime_inputs, root_selection_policy='min'):
    """
    Build a safe callable from a pasted Python function definition.
    Returns (callable, runtime_input_names_in_order).
    """
    param_names, return_expr = parse_function_definition(function_code)

    runtime_input_names = []
    for p in param_names:
        runtime_name = input_aliases.get(p, p)
        if runtime_name not in available_runtime_inputs:
            raise ValueError(
                f"Function input '{p}' is not connected. "
                f"Available inputs: {', '.join(sorted(available_runtime_inputs)) or '(none)'}"
            )
        runtime_input_names.append(runtime_name)

    # Exec the full function definition in a safe namespace
    fn_namespace = dict(SAFE_EVAL_GLOBALS)
    exec(compile(ast.parse(function_code, mode='exec'), '<calc_function>', 'exec'), fn_namespace)
    fn_name = [s for s in ast.parse(function_code, mode='exec').body
               if isinstance(s, ast.FunctionDef)][0].name
    compiled_fn = fn_namespace[fn_name]

    def fn(*args):
        return compiled_fn(*args)

    return fn, runtime_input_names


def apply_input_aliases(formula_str, alias_to_runtime):
    """
    Rewrite formula variable names from node-label aliases to runtime parameter names.
    Example: if incoming edge is from margin label "E1" but runtime value is "D1_D",
    formula "E1 * 2" becomes "D1_D * 2".
    """
    if not formula_str:
        return formula_str
    out = formula_str
    # Replace longer aliases first to avoid partial replacements.
    for alias in sorted(alias_to_runtime.keys(), key=len, reverse=True):
        runtime = alias_to_runtime[alias]
        if not alias or not runtime or alias == runtime:
            continue
        out = re.sub(rf'\b{re.escape(alias)}\b', runtime, out)
    return out


def topo_sort(nodes, edges):
    """
    Topological sort of nodes based on edges.
    Returns list of node objects in execution order.
    Input and performance nodes come first/last respectively.
    """
    node_map = {n['id']: n for n in nodes}
    # Build adjacency: edge.from -> edge.to
    in_degree = defaultdict(int)
    children = defaultdict(list)
    node_ids = set(n['id'] for n in nodes)

    for nid in node_ids:
        in_degree[nid] = 0

    for e in edges:
        if e['from'] in node_ids and e['to'] in node_ids:
            in_degree[e['to']] += 1
            children[e['from']].append(e['to'])

    # Kahn's algorithm
    queue = deque([nid for nid in node_ids if in_degree[nid] == 0])
    ordered = []
    while queue:
        nid = queue.popleft()
        ordered.append(node_map[nid])
        for child_id in children[nid]:
            in_degree[child_id] -= 1
            if in_degree[child_id] == 0:
                queue.append(child_id)

    if len(ordered) != len(nodes):
        raise ValueError("Cycle detected in the MAN — cannot sort topologically")

    return ordered


def normalize_edge_type(edge, node_by_id):
    """
    Normalize edge typing across old/new graph schemas.

    New schema:
      edgeType in {"plain", "decided", "threshold"}
    Legacy schema:
      isTarget boolean (true means threshold edge)
    """
    et = edge.get('edgeType')
    if et in {'plain', 'decided', 'threshold'}:
        return et

    if edge.get('isTarget') is True:
        return 'threshold'

    tgt = node_by_id.get(edge.get('to'))
    src = node_by_id.get(edge.get('from'))
    if tgt and tgt.get('type') == 'margin':
        return 'decided' if src and src.get('type') == 'decision' else 'threshold'

    return 'plain'


def generate_plot_base64(result):
    """Generate margin value plot as base64-encoded PNG."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    margin_names = list(result.excess.keys())
    if not margin_names:
        return None

    x = [result.weighted_impact.get(m, 0) * 100 for m in margin_names]
    y = [result.weighted_absorption.get(m, 0) * 100 for m in margin_names]
    sizes_raw = [abs(result.excess.get(m, 0)) * 100 for m in margin_names]
    max_s = max(sizes_raw) if sizes_raw else 1
    sizes = [max(50, (s / max_s) * 2000) for s in sizes_raw]
    labels = [m.replace("E_", "E") for m in margin_names]

    fig, ax = plt.subplots(figsize=(6, 5))

    x_mid = (max(x) + min(x)) / 2 if x else 0
    y_mid = (max(y) + min(y)) / 2 if y else 0

    ax.axvline(x_mid, color="gray", lw=0.8, ls="--", alpha=0.5)
    ax.axhline(y_mid, color="gray", lw=0.8, ls="--", alpha=0.5)

    quad_kw = dict(alpha=0.08, transform=ax.transAxes, va="center", ha="center",
                   fontsize=8, style="italic", color="#333333")
    ax.text(0.25, 0.75, "High absorption\nLow impact\n(High value)", **quad_kw)
    ax.text(0.75, 0.75, "High absorption\nHigh impact\n(Trade-off)", **quad_kw)
    ax.text(0.25, 0.25, "Low absorption\nLow impact\n(Negligible)", **quad_kw)
    ax.text(0.75, 0.25, "Low absorption\nHigh impact\n(Reduce margin)", **quad_kw)

    scatter = ax.scatter(x, y, s=sizes, alpha=0.65, c=sizes_raw,
                         cmap="RdYlGn_r", edgecolors="k", linewidths=0.7, zorder=5)

    for i, label in enumerate(labels):
        ax.annotate(label, (x[i], y[i]), textcoords="offset points",
                    xytext=(8, 4), fontsize=9, fontweight="bold", zorder=6)

    cbar = plt.colorbar(scatter, ax=ax, pad=0.02, shrink=0.8)
    cbar.set_label("Local Excess (%)", fontsize=9)

    ax.set_xlabel("Impact on Performance (%)", fontsize=10)
    ax.set_ylabel("Change Absorption Potential (%)", fontsize=10)
    ax.set_title("Margin Value Plot", fontsize=12, fontweight="bold", pad=10)
    ax.grid(True, alpha=0.3, zorder=0)

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
    plt.close()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

@app.route('/api/analyse', methods=['POST'])
def analyse():
    try:
        data = request.json
        gui_nodes = data['nodes']
        gui_edges = data['edges']
        raw_perf_weights = data.get('perfWeights') or data.get('perf_weights') or {}
        raw_input_weights = data.get('inputWeights') or data.get('input_weights') or {}

        # Build lookup: node_id -> node data
        node_by_id = {n['id']: n for n in gui_nodes}
        # Normalize edge typing so backend behavior is stable for both old/new graphs
        norm_edges = []
        for e in gui_edges:
            ne = dict(e)
            ne['edgeType'] = normalize_edge_type(e, node_by_id)
            norm_edges.append(ne)

        # Topological sort
        sorted_nodes = topo_sort(gui_nodes, norm_edges)

        engine = MANEngine()

        # Build lookup: node_id -> sanitized output param name
        node_output_name = {}
        edges_by_source = defaultdict(list)
        for e in norm_edges:
            edges_by_source[e['from']].append(e)
        edge_runtime_name = {}
        all_input_param_names = []

        # Track all parameter values for edge tooltips
        param_values = {}

        for node in sorted_nodes:
            nid = node['id']
            var_name = sanitize(node['label'])
            node_output_name[nid] = var_name
            for e in edges_by_source.get(nid, []):
                runtime_name = e.get('fromPort') or var_name
                runtime_name = sanitize(runtime_name)
                edge_runtime_name[e['id']] = runtime_name

            if node['type'] == 'input':
                val = float(node.get('value', 0) or 0)
                engine.set_param(var_name, val)
                param_values[var_name] = val
                all_input_param_names.append(var_name)
                if node.get('isOfInterest'):
                    engine.mark_input(var_name)

            elif node['type'] == 'performance':
                # Ensure every marked performance parameter exists in baseline.
                # Preferred order:
                # 1) explicit equation over incoming vars
                # 2) passthrough from single upstream value
                # 3) explicit constant value
                # For multi-input performance nodes, equation is required.
                in_edges = [e for e in norm_edges if e['to'] == nid]
                input_names = []
                input_aliases = {}
                for e in in_edges:
                    src_name = edge_runtime_name.get(e['id']) or node_output_name.get(e['from'])
                    if src_name:
                        input_names.append(src_name)
                        src_node = node_by_id.get(e['from'])
                        if src_node:
                            input_aliases[sanitize(src_node.get('label', ''))] = src_name

                formula = (node.get('equation') or '').strip()
                if formula:
                    formula = apply_input_aliases(formula, input_aliases)
                    fn = build_lambda(formula, input_names)
                    engine.add_calc(CalculationNode(
                        name=var_name,
                        func=fn,
                        input_names=input_names,
                        output_name=var_name,
                        description=node.get('description', ''),
                    ))
                elif len(input_names) == 1:
                    passthrough = lambda x: x
                    engine.add_calc(CalculationNode(
                        name=var_name,
                        func=passthrough,
                        input_names=input_names,
                        output_name=var_name,
                        description=node.get('description', ''),
                    ))
                elif str(node.get('value', '')).strip() != '':
                    val = float(node.get('value', 0) or 0)
                    engine.set_param(var_name, val)
                    param_values[var_name] = val
                else:
                    if len(input_names) > 1:
                        raise ValueError(
                            f"Performance node '{node['label']}' has multiple inputs "
                            f"({', '.join(input_names)}) but no equation. "
                            f"Add a formula (e.g. 'a + b') or keep only one input."
                        )
                    # Keep analysis robust for placeholders with no inputs.
                    engine.set_param(var_name, 0.0)
                    param_values[var_name] = 0.0

                engine.mark_performance(var_name)

            elif node['type'] in {'calc', 'calcFunction'}:
                in_edges = [e for e in norm_edges if e['to'] == nid]
                input_names = []
                input_aliases = {}
                for e in in_edges:
                    src_name = edge_runtime_name.get(e['id']) or node_output_name.get(e['from'])
                    if src_name:
                        input_names.append(src_name)
                        # For calcFunction nodes, map explicit input-port name
                        # (edge.toPort) to runtime input first.
                        to_port = sanitize(e.get('toPort') or '')
                        if node['type'] == 'calcFunction' and to_port:
                            input_aliases[to_port] = src_name
                        src_node = node_by_id.get(e['from'])
                        if src_node:
                            input_aliases[sanitize(src_node.get('label', ''))] = src_name

                if node['type'] == 'calcFunction':
                    function_code = node.get('functionCode', '')
                    if not str(function_code or '').strip():
                        raise ValueError(
                            f"Calculation Function node '{node['label']}' has no function code")
                    root_policy = normalize_root_policy(node.get('rootSelectionPolicy', 'min'))
                    fn, ordered_input_names = build_calc_function(
                        function_code=function_code,
                        input_aliases=input_aliases,
                        available_runtime_inputs=set(input_names),
                        root_selection_policy=root_policy,
                    )
                    input_names = ordered_input_names
                    # Main calc-function node returns the full bundle (dict/tuple/scalar).
                    # Add extractor calc nodes for each declared output so downstream
                    # edges using fromPort names resolve to concrete scalar params.
                    _, return_expr = parse_function_definition(function_code)
                    raw_out_names = infer_outputs_from_expr(return_expr)
                    out_names = [sanitize(o) for o in raw_out_names if sanitize(o)]
                    if not out_names:
                        out_names = [var_name]

                    engine.add_calc(CalculationNode(
                        name=var_name,
                        func=fn,
                        input_names=input_names,
                        output_name=var_name,
                        description=node.get('description', ''),
                    ))

                    def make_extractor(idx, out_key, policy):
                        def _extract(bundle):
                            if isinstance(bundle, dict):
                                if out_key in bundle:
                                    return choose_root_like_value(bundle[out_key], policy)
                                for k, v in bundle.items():
                                    if sanitize(str(k)) == out_key:
                                        return choose_root_like_value(v, policy)
                                raise ValueError(
                                    f"Calculation function output '{out_key}' not found in returned dict keys."
                                )
                            if isinstance(bundle, (list, tuple, np.ndarray)):
                                if idx < len(bundle):
                                    return choose_root_like_value(bundle[idx], policy)
                                raise ValueError(
                                    f"Calculation function output index {idx} for '{out_key}' is out of range."
                                )
                            if idx == 0:
                                return choose_root_like_value(bundle, policy)
                            raise ValueError(
                                f"Calculation function did not return multiple outputs; cannot map '{out_key}'."
                            )
                        return _extract

                    for idx, out_key in enumerate(out_names):
                        if out_key == var_name:
                            continue
                        engine.add_calc(CalculationNode(
                            name=f"{var_name}__{out_key}",
                            func=make_extractor(idx, out_key, root_policy),
                            input_names=[var_name],
                            output_name=out_key,
                            description=f"Extract {out_key} from {var_name}",
                        ))
                    continue
                else:
                    formula = node.get('equation', '')
                    if not formula:
                        raise ValueError(
                            f"Calc node '{node['label']}' has no formula")
                    formula = apply_input_aliases(formula, input_aliases)
                    fn = build_lambda(formula, input_names)

                engine.add_calc(CalculationNode(
                    name=var_name,
                    func=fn,
                    input_names=input_names,
                    output_name=var_name,
                    description=node.get('description', ''),
                ))

            elif node['type'] == 'decision':
                # A decision node provides the decided/catalogue value only.
                # The threshold is not stored here; it is supplied by the
                # upstream calc node into the margin node via a red edge.
                decided_name = f"{var_name}_D"
                in_edges = [e for e in norm_edges if e['to'] == nid]
                input_names = []
                input_aliases = {}
                for e in in_edges:
                    src_name = edge_runtime_name.get(e['id']) or node_output_name.get(e['from'])
                    if src_name:
                        input_names.append(src_name)
                        src_node = node_by_id.get(e['from'])
                        if src_node:
                            input_aliases[sanitize(src_node.get('label', ''))] = src_name

                # Preferred: explicit decidedValue from catalogue selection.
                if str(node.get('decidedValue', '')).strip() != '':
                    decided_val = float(node.get('decidedValue', 0) or 0)
                    const_fn = lambda _v=decided_val: _v
                    engine.add_calc(CalculationNode(
                        name=decided_name,
                        func=const_fn,
                        input_names=[],
                        output_name=decided_name,
                        description=node.get('description', ''),
                    ))
                else:
                    # Backward compatibility: legacy decision-as-formula graphs.
                    formula = (node.get('equation') or '').strip()
                    if not formula:
                        raise ValueError(
                            f"Decision node '{node['label']}' needs a decided value "
                            f"(or legacy equation)."
                        )
                    formula = apply_input_aliases(formula, input_aliases)
                    fn = build_lambda(formula, input_names)
                    engine.add_calc(CalculationNode(
                        name=decided_name,
                        func=fn,
                        input_names=input_names,
                        output_name=decided_name,
                        description=node.get('description', ''),
                    ))
                node_output_name[nid] = decided_name
                for e in edges_by_source.get(nid, []):
                    if not e.get('fromPort'):
                        edge_runtime_name[e['id']] = sanitize(decided_name)

            elif node['type'] == 'margin':
                # The margin node receives exactly two edges:
                #   edgeType == 'threshold' → red arrow from upstream calc node
                #   edgeType == 'decided'   → black arrow from decision node
                in_edges = [e for e in norm_edges if e['to'] == nid]
                decided_name = None
                threshold_name = None

                for e in in_edges:
                    src_name = edge_runtime_name.get(e['id']) or node_output_name.get(e['from'])
                    if not src_name:
                        continue
                    if e.get('edgeType') == 'decided':
                        decided_name = src_name
                    elif e.get('edgeType') == 'threshold':
                        threshold_name = src_name

                # Fallback for mixed/legacy files: infer by source node type.
                if not decided_name or not threshold_name:
                    for e in in_edges:
                        src_name = edge_runtime_name.get(e['id']) or node_output_name.get(e['from'])
                        if not src_name:
                            continue
                        src_node = node_by_id.get(e['from'], {})
                        if src_node.get('type') == 'decision':
                            decided_name = decided_name or src_name
                        else:
                            threshold_name = threshold_name or src_name

                if not decided_name or not threshold_name:
                    raise ValueError(
                        f"Margin node '{node['label']}' needs one black (decided) "
                        f"edge from a decision node and one red (threshold) edge "
                        f"from a calc node. "
                        f"Got decided={decided_name}, threshold={threshold_name}."
                    )

                from mvm_core import MarginNode
                engine.add_margin(MarginNode(
                    name=var_name,
                    decided_name=decided_name,
                    threshold_name=threshold_name,
                    description=node.get('description', ''),
                ))

                # Downstream nodes receive the decided value in normal operation.
                # mvm_core swaps it to threshold internally during Metric 2.
                node_output_name[nid] = decided_name
                for e in edges_by_source.get(nid, []):
                    if not e.get('fromPort'):
                        edge_runtime_name[e['id']] = sanitize(decided_name)

        # If user did not explicitly mark any inputs of interest, include all
        # input nodes so Metric 3 (absorption) is still meaningful.
        if not engine._input_param_names and all_input_param_names:
            engine.mark_input(*all_input_param_names)

        # Optional weighted summaries from UI.
        perf_weights = {}
        if isinstance(raw_perf_weights, dict):
            for k, v in raw_perf_weights.items():
                kk = sanitize(k)
                try:
                    vv = float(v)
                except (TypeError, ValueError):
                    continue
                if vv >= 0:
                    perf_weights[kk] = vv

        input_weights = {}
        if isinstance(raw_input_weights, dict):
            for k, v in raw_input_weights.items():
                kk = sanitize(k)
                try:
                    vv = float(v)
                except (TypeError, ValueError):
                    continue
                if vv >= 0:
                    input_weights[kk] = vv

        # Run analysis.
        # Note: Metric 3 Pmax_i stopping behavior is implemented in mvm_core:
        # by default stop when any threshold reaches decided (or model exits
        # feasible region). Performance-change stopping is optional.
        result = engine.analyse(
            perf_weights=perf_weights or None,
            input_weights=input_weights or None,
            stop_on_performance_change=True,
        )

        # Collect all param values from baseline run
        baseline = engine._baseline()
        param_values.update(baseline)

        # Expose decided and threshold values for each margin node so the
        # frontend can show both on edges leaving a margin node.
        for mn in engine._margin_nodes:
            mk = sanitize(mn.name)
            param_values[mk + '_decided']   = float(baseline.get(mn.decided_name, 0.0))
            param_values[mk + '_threshold'] = float(baseline.get(mn.threshold_name, 0.0))

        # Generate plot
        plot_b64 = generate_plot_base64(result)

        # Build result summary
        result_data = {
            'excess': result.excess,
            'impact_matrix': result.impact_matrix,
            'deterioration': result.deterioration,
            'absorption_matrix': result.absorption_matrix,
            'weighted_impact': result.weighted_impact,
            'weighted_absorption': result.weighted_absorption,
            'utilisation_matrix': result.utilisation_matrix,
            'summary': result.summary_table(),
        }

        return jsonify({
            'success': True,
            'result': result_data,
            'plot': plot_b64,
            'paramValues': {k: float(v) for k, v in param_values.items()
                            if isinstance(v, (int, float))},
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
        }), 400


@app.route('/api/health', methods=['GET'])
def health():
    # Expose the server workspace root path so clients can confirm
    # they are talking to the correct repository/folder.
    return jsonify({
        'status': 'ok',
        'backendVersion': '2026-03-03',
        'workspacePath': RUNTIME_ROOT,
        'supportsInputAliases': True,
        'supportsCalcFunctions': True,
    })


@app.route('/api/validate-function', methods=['POST'])
def validate_function():
    data = request.json or {}
    if not isinstance(data, dict):
        return jsonify({'success': False, 'error': 'Invalid payload'}), 400
    function_code = data.get('functionCode', '')
    inputs = data.get('inputs') or {}
    root_policy = normalize_root_policy(data.get('rootSelectionPolicy', 'min'))
    if not function_code or not str(function_code).strip():
        return jsonify({'success': False, 'error': 'Function code is required'}), 400
    try:
        outputs = validate_calc_function(function_code, inputs, root_policy)
        if not outputs:
            raise ValueError("Function returned no outputs")
        return jsonify({'success': True, 'outputs': outputs})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/examples/<path:filename>', methods=['GET'])
def serve_example(filename):
    if not os.path.exists(os.path.join(EXAMPLES_DIR, filename)):
        return jsonify({'success': False, 'error': 'Example not found'}), 404
    return send_from_directory(EXAMPLES_DIR, filename)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    # Keep API paths reserved for backend handlers.
    if path.startswith('api/'):
        return jsonify({'success': False, 'error': 'Unknown API route'}), 404

    if path and app.static_folder:
        asset_path = os.path.join(app.static_folder, path)
        if os.path.exists(asset_path):
            return send_from_directory(app.static_folder, path)

    index_path = os.path.join(app.static_folder or '', 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(app.static_folder, 'index.html')

    return jsonify({
        'success': False,
        'error': 'Frontend build not found. Run `npm run build` in man-diagram-tool.',
    }), 503


if __name__ == '__main__':
    app.run(port=5001, debug=True)
