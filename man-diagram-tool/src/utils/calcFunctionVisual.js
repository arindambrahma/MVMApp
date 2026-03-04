import { parseCalculationFunction } from './calcFunctionParser';
import { sanitize } from './helpers';

export function getCalcFunctionVisualSpec(node, options = {}) {
  const orientation = options.orientation || node?._cfOrientation || 'horizontal';
  const parsed = parseCalculationFunction(node?.functionCode || '');
  const inputs = parsed.valid ? parsed.params : [];
  const outputs = parsed.valid ? parsed.outputs : ['out'];
  const rows = Math.max(inputs.length, outputs.length, 1);
  const maxPorts = Math.max(inputs.length, outputs.length, 1);
  const width = orientation === 'vertical'
    ? Math.max(176, 44 + maxPorts * 24)
    : 180;
  const height = orientation === 'vertical'
    ? 94
    : Math.max(64, 24 + rows * 16);
  const topY = -(height / 2) + 22;
  const title = parsed.valid
    ? parsed.name
    : String(node.autoLabel || '').trim() || 'CF';

  const inputSlots = inputs.length > 0
    ? inputs.map((name, i) => ({ name, y: topY + i * 16 }))
    : [{ name: 'in', y: 0 }];

  const outputSlots = outputs.length > 0
    ? outputs.map((name, i) => ({ name, y: topY + i * 16 }))
    : [{ name: sanitize(node?.label || '') || 'out', y: 0 }];

  return { parsed, title, inputs, outputs, width, height, inputSlots, outputSlots };
}
