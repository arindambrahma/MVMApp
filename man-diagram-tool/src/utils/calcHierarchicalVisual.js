/**
 * Visual spec generator for calcHierarchical nodes.
 * Mirrors calcFunctionVisual.js but reads from node.ports instead of parsing Python code.
 */

export function getCalcHierarchicalVisualSpec(node, options = {}) {
  const inputs = node?.ports?.inputs || [];
  const outputs = node?.ports?.outputs || [];
  const rows = Math.max(inputs.length, outputs.length, 1);
  const width = 180;
  const height = Math.max(64, 24 + rows * 16);
  const topY = -(height / 2) + 22;
  const title = String(node?.label || node?.autoLabel || '').trim() || 'CH';

  const inputSlots = inputs.length > 0
    ? inputs.map((name, i) => ({ name, y: topY + i * 16 }))
    : [{ name: 'in', y: 0 }];

  const outputSlots = outputs.length > 0
    ? outputs.map((name, i) => ({ name, y: topY + i * 16 }))
    : [{ name: 'out', y: 0 }];

  return { title, inputs, outputs, width, height, inputSlots, outputSlots };
}
