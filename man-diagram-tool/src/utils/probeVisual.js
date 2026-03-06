function estimateWidth(text, px = 11) {
  const s = String(text || '');
  return Math.ceil(s.length * px * 0.62);
}

export function formatProbeValue(v) {
  if (!Number.isFinite(v)) return 'n/a';
  const abs = Math.abs(v);
  if (abs >= 1e4 || (abs > 0 && abs < 1e-3)) return v.toExponential(3);
  const fixed = v.toFixed(6);
  return fixed.replace(/\.?0+$/, '');
}

export function getProbeBoxSize({ label, valueText, source }) {
  const labelW = estimateWidth(label, 10);
  const valueW = estimateWidth(valueText, 14);
  const sourceW = source ? estimateWidth(source, 9) : 0;
  const contentW = Math.max(labelW, valueW, sourceW);
  const w = Math.max(120, Math.min(320, contentW + 26));
  const h = source ? 62 : 52;
  return { w, h };
}
