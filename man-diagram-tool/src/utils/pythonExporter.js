// Generate Python code that mirrors the webapp runtime model:
// - Decision node: decided/catalog value only
// - Margin node: gets decided from decision edge + threshold from non-decision edge
import { parseCalculationFunction } from './calcFunctionParser';

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function inferEdgeType(edge, nodeById) {
  if (edge.edgeType) return edge.edgeType;
  if (edge.isTarget === true) return 'threshold';
  const target = nodeById[edge.to];
  const source = nodeById[edge.from];
  if (target?.type === 'margin') {
    return source?.type === 'decision' ? 'decided' : 'threshold';
  }
  return 'plain';
}

export function exportPython(nodes, edges) {
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const inputNodes = nodes.filter(n => n.type === 'input');
  const calcNodes = nodes.filter(n => n.type === 'calc' || n.type === 'calcFunction');
  const decisionNodes = nodes.filter(n => n.type === 'decision');
  const marginNodes = nodes.filter(n => n.type === 'margin');
  const perfNodes = nodes.filter(n => n.type === 'performance');

  const normEdges = edges.map(e => ({ ...e, edgeType: inferEdgeType(e, nodeById) }));

  const lines = [];
  lines.push('# Auto-generated MAN setup from MAN Diagram Tool');
  lines.push('# Paste into your project alongside mvm_core.py');
  lines.push('');
  lines.push('from mvm_core import MANEngine, CalculationNode, MarginNode');
  lines.push('');
  lines.push('man = MANEngine()');
  lines.push('');

  lines.push('# Input parameters');
  for (const n of inputNodes) {
    const name = sanitize(n.label);
    const val = n.value || '0';
    const comment = [n.description, n.unit ? `[${n.unit}]` : ''].filter(Boolean).join(' ');
    lines.push(`man.set_param("${name}", ${val})  # ${comment}`);
  }
  lines.push('');

  const inputNames = inputNodes.map(n => `"${sanitize(n.label)}"`).join(', ');
  if (inputNames) lines.push(`man.mark_input(${inputNames})`);

  const perfNames = perfNodes.map(n => `"${sanitize(n.label)}"`).join(', ');
  if (perfNames) lines.push(`man.mark_performance(${perfNames})`);
  lines.push('');

  lines.push('# Calculation nodes');
  for (const n of calcNodes) {
    const inEdges = normEdges.filter(e => e.to === n.id);
    const inNames = inEdges.map(e => {
      const src = nodeById[e.from];
      return src ? sanitize(src.label) : '?';
    });
    const outName = sanitize(n.label);
    const parsedFn = n.type === 'calcFunction'
      ? parseCalculationFunction(n.functionCode || '')
      : null;
    const params = (parsedFn?.valid ? parsedFn.params : inNames).join(', ');
    const expr = parsedFn?.valid
      ? parsedFn.returnExpr
      : (n.equation || '# TODO: fill in formula');
    lines.push('man.add_calc(CalculationNode(');
    lines.push(`    name="${n.label}",`);
    lines.push(`    func=lambda ${params}: ${expr},`);
    lines.push(`    input_names=[${inNames.map(p => `"${p}"`).join(', ')}],`);
    lines.push(`    output_name="${outName}",`);
    lines.push(`    description="${n.description || ''}",`);
    lines.push('))');
    lines.push('');
  }

  lines.push('# Decision nodes (as constant decided values)');
  for (const n of decisionNodes) {
    const decidedName = `${sanitize(n.label)}_D`;
    const decidedValue = String(n.decidedValue || '0');
    lines.push('man.add_calc(CalculationNode(');
    lines.push(`    name="${n.label}",`);
    lines.push(`    func=lambda _v=${decidedValue}: _v,`);
    lines.push('    input_names=[],');
    lines.push(`    output_name="${decidedName}",`);
    lines.push(`    description="${n.description || ''}",`);
    lines.push('))');
    lines.push('');
  }

  lines.push('# Margin nodes (decided from decision edge, threshold from calc edge)');
  for (const n of marginNodes) {
    const inEdges = normEdges.filter(e => e.to === n.id);

    let decidedName = null;
    let thresholdName = null;

    for (const e of inEdges) {
      const src = nodeById[e.from];
      if (!src) continue;
      const srcOut = src.type === 'decision' ? `${sanitize(src.label)}_D` : sanitize(src.label);
      if (e.edgeType === 'decided') decidedName = srcOut;
      if (e.edgeType === 'threshold') thresholdName = srcOut;
    }

    if (!decidedName || !thresholdName) {
      for (const e of inEdges) {
        const src = nodeById[e.from];
        if (!src) continue;
        const srcOut = src.type === 'decision' ? `${sanitize(src.label)}_D` : sanitize(src.label);
        if (src.type === 'decision' && !decidedName) decidedName = srcOut;
        if (src.type !== 'decision' && !thresholdName) thresholdName = srcOut;
      }
    }

    lines.push('man.add_margin(MarginNode(');
    lines.push(`    name="${sanitize(n.label)}",`);
    lines.push(`    decided_name="${decidedName || 'TODO_DECIDED'}",`);
    lines.push(`    threshold_name="${thresholdName || 'TODO_THRESHOLD'}",`);
    lines.push(`    description="${n.description || ''}",`);
    lines.push('))');
    lines.push('');
  }

  lines.push('# Run analysis');
  lines.push('result = man.analyse()');
  lines.push('print(result.summary_table())');
  lines.push('');
  lines.push('from mvm_plot import plot_margin_value');
  lines.push('plot_margin_value(result, save_path="margin_value_plot.png")');

  return lines.join('\n');
}
