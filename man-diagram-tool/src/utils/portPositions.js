import { NODE_META } from '../constants/nodeTypes';
import { getCalcFunctionVisualSpec } from './calcFunctionVisual';
import { getCalcHierarchicalVisualSpec } from './calcHierarchicalVisual';

// Returns the 4 cardinal port positions for a node (absolute coordinates).
// Each node's (x, y) is its center.
export function getPortPositions(node) {
  const meta = NODE_META[node.type];
  const cx = node.x;
  const cy = node.y;

  switch (meta.shape) {
    case 'smallDiamond': {
      const S = 18;
      return {
        top:    { x: cx, y: cy - S },
        right:  { x: cx + S, y: cy },
        bottom: { x: cx, y: cy + S },
        left:   { x: cx - S, y: cy },
      };
    }
    case 'circle': {
      const R = 22;
      return {
        top:    { x: cx, y: cy - R },
        right:  { x: cx + R, y: cy },
        bottom: { x: cx, y: cy + R },
        left:   { x: cx - R, y: cy },
      };
    }
    case 'largeDiamond': {
      const HW = 55, HH = 35;
      return {
        top:    { x: cx, y: cy - HH },
        right:  { x: cx + HW, y: cy },
        bottom: { x: cx, y: cy + HH },
        left:   { x: cx - HW, y: cy },
      };
    }
    case 'hexagon': {
      const W = 24, H = 20;
      return {
        top:    { x: cx, y: cy - H },
        right:  { x: cx + W, y: cy },
        bottom: { x: cx, y: cy + H },
        left:   { x: cx - W, y: cy },
      };
    }
    case 'donut': {
      const R = 15;
      return {
        top:    { x: cx, y: cy - R },
        right:  { x: cx + R, y: cy },
        bottom: { x: cx, y: cy + R },
        left:   { x: cx - R, y: cy },
      };
    }
    case 'functionBox': {
      const spec = node.type === 'calcHierarchical'
        ? getCalcHierarchicalVisualSpec(node)
        : getCalcFunctionVisualSpec(node);
      const hw = spec.width / 2;
      const hh = spec.height / 2;
      return {
        top: { x: cx, y: cy - hh },
        right: { x: cx + hw, y: cy },
        bottom: { x: cx, y: cy + hh },
        left: { x: cx - hw, y: cy },
      };
    }
    case 'portArrow': {
      const hw = (meta.size?.w ?? 80) / 2;
      const hh = (meta.size?.h ?? 28) / 2;
      return {
        top: { x: cx, y: cy - hh },
        right: { x: cx + hw, y: cy },
        bottom: { x: cx, y: cy + hh },
        left: { x: cx - hw, y: cy },
      };
    }
    case 'probeRect': {
      const hw = (meta.size?.w ?? 120) / 2;
      const hh = (meta.size?.h ?? 58) / 2;
      return {
        top: { x: cx, y: cy - hh },
        right: { x: cx + hw, y: cy },
        bottom: { x: cx, y: cy + hh },
        left: { x: cx - hw, y: cy },
      };
    }
    default: {
      return {
        top:    { x: cx, y: cy - 20 },
        right:  { x: cx + 20, y: cy },
        bottom: { x: cx, y: cy + 20 },
        left:   { x: cx - 20, y: cy },
      };
    }
  }
}

function pickBest(candidates, node, towardNode) {
  if (!candidates || candidates.length === 0) return { x: node.x, y: node.y };
  if (!towardNode) return candidates[0];
  const vx = towardNode.x - node.x;
  const vy = towardNode.y - node.y;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const p of candidates) {
    const px = p.x - node.x;
    const py = p.y - node.y;
    const plen = Math.hypot(px, py) || 1;
    const score = (px / plen) * ux + (py / plen) * uy;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function orderByDirection(candidates, node, towardNode) {
  if (!towardNode) return [...candidates];
  const vx = towardNode.x - node.x;
  const vy = towardNode.y - node.y;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  return [...candidates].sort((a, b) => {
    const ax = a.x - node.x;
    const ay = a.y - node.y;
    const al = Math.hypot(ax, ay) || 1;
    const as = (ax / al) * ux + (ay / al) * uy;

    const bx = b.x - node.x;
    const by = b.y - node.y;
    const bl = Math.hypot(bx, by) || 1;
    const bs = (bx / bl) * ux + (by / bl) * uy;
    return bs - as;
  });
}

function clockPoints(node, radius) {
  const pts = {};
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    pts[a] = { x: node.x + radius * Math.cos(rad), y: node.y + radius * Math.sin(rad) };
  }
  return pts;
}

export function getDirectionalPort(node, dir, towardNode = null, slotIndex = 0, options = {}) {
  const meta = NODE_META[node.type] || {};
  const shape = meta.shape;
  const base = getPortPositions(node);
  const d = dir || 'right';

  // Hierarchical calculation node — same layout logic as calcFunction but reads from node.ports
  if (node.type === 'calcHierarchical' && shape === 'functionBox') {
    const spec = getCalcHierarchicalVisualSpec(node);
    const hw = spec.width / 2;
    const hh = spec.height / 2;
    const STEM = 12;
    const leftSlots = spec.inputSlots.map((s) => ({ x: node.x - hw - STEM, y: node.y + s.y }));
    const rightSlots = spec.outputSlots.map((s) => ({ x: node.x + hw + STEM, y: node.y + s.y }));
    const byDir = {
      left: leftSlots,
      right: rightSlots,
      top: [{ x: node.x, y: node.y - hh }],
      bottom: [{ x: node.x, y: node.y + hh }],
    };
    const fallback = rightSlots;
    const list = byDir[d] || fallback;
    return list[Math.min(slotIndex, list.length - 1)] || list[0];
  }

  // Calculation function node uses explicit left input slots and a right output slot.
  if (node.type === 'calcFunction' && shape === 'functionBox') {
    const spec = getCalcFunctionVisualSpec(node);
    const hw = spec.width / 2;
    const hh = spec.height / 2;
    const STEM = 12;
    const isVertical = options?.calcFunctionPortOrientation === 'vertical';
    const spread = (count) => {
      const n = Math.max(1, count);
      if (n === 1) return [0];
      const min = -hw + 22;
      const max = hw - 22;
      const step = (max - min) / (n - 1);
      return Array.from({ length: n }, (_, i) => min + i * step);
    };
    const inX = spread(spec.inputSlots.length);
    const outX = spread(spec.outputSlots.length);
    const leftSlots = spec.inputSlots.map((s) => ({ x: node.x - hw - STEM, y: node.y + s.y }));
    const rightSlots = spec.outputSlots.map((s) => ({ x: node.x + hw + STEM, y: node.y + s.y }));
    const topSlots = inX.map((x) => ({ x: node.x + x, y: node.y - hh - STEM }));
    const bottomSlots = outX.map((x) => ({ x: node.x + x, y: node.y + hh + STEM }));
    const byDir = isVertical
      ? {
        top: topSlots,
        bottom: bottomSlots,
        left: [{ x: node.x - hw, y: node.y }],
        right: [{ x: node.x + hw, y: node.y }],
      }
      : {
        left: leftSlots,
        right: rightSlots,
        top: [{ x: node.x, y: node.y - hh }],
        bottom: [{ x: node.x, y: node.y + hh }],
      };
    const fallback = isVertical ? bottomSlots : rightSlots;
    const list = byDir[d] || fallback;
    return list[Math.min(slotIndex, list.length - 1)] || list[0];
  }

  // Input & Decision: expose a few side slots to avoid stacked/overlapping branches.
  if (shape === 'smallDiamond') {
    const S = 18;
    const C = 6;
    const candidates = {
      right: [
        { x: node.x + S - C, y: node.y - C },
        { x: node.x + S, y: node.y },
        { x: node.x + S - C, y: node.y + C },
      ],
      left: [
        { x: node.x - S + C, y: node.y - C },
        { x: node.x - S, y: node.y },
        { x: node.x - S + C, y: node.y + C },
      ],
      top: [
        { x: node.x - C, y: node.y - S + C },
        { x: node.x, y: node.y - S },
        { x: node.x + C, y: node.y - S + C },
      ],
      bottom: [
        { x: node.x - C, y: node.y + S - C },
        { x: node.x, y: node.y + S },
        { x: node.x + C, y: node.y + S - C },
      ],
    };
    const ordered = orderByDirection(candidates[d] || [base[d] || base.right], node, towardNode);
    return ordered[Math.min(slotIndex, ordered.length - 1)] || ordered[0];
  }
  if (shape === 'largeDiamond') {
    const HW = 55;
    const HH = 35;
    const C = 12;
    const candidates = {
      right: [
        { x: node.x + HW - C, y: node.y - C },
        { x: node.x + HW, y: node.y },
        { x: node.x + HW - C, y: node.y + C },
      ],
      left: [
        { x: node.x - HW + C, y: node.y - C },
        { x: node.x - HW, y: node.y },
        { x: node.x - HW + C, y: node.y + C },
      ],
      top: [
        { x: node.x - C, y: node.y - HH + C },
        { x: node.x, y: node.y - HH },
        { x: node.x + C, y: node.y - HH + C },
      ],
      bottom: [
        { x: node.x - C, y: node.y + HH - C },
        { x: node.x, y: node.y + HH },
        { x: node.x + C, y: node.y + HH - C },
      ],
    };
    const ordered = orderByDirection(candidates[d] || [base[d] || base.right], node, towardNode);
    return ordered[Math.min(slotIndex, ordered.length - 1)] || ordered[0];
  }

  // Margin: choose among hexagon vertices only.
  if (shape === 'hexagon') {
    const W = 24, H = 20, IN = 10;
    const v = {
      rt: { x: node.x + W - IN, y: node.y - H },
      rm: { x: node.x + W, y: node.y },
      rb: { x: node.x + W - IN, y: node.y + H },
      lb: { x: node.x - W + IN, y: node.y + H },
      lm: { x: node.x - W, y: node.y },
      lt: { x: node.x - W + IN, y: node.y - H },
    };
    const byDir = {
      right: [v.rt, v.rm, v.rb],
      left: [v.lt, v.lm, v.lb],
      top: [v.lt, v.rt],
      bottom: [v.lb, v.rb],
    };
    const ordered = orderByDirection(byDir[d] || [v.rm], node, towardNode);
    return ordered[Math.min(slotIndex, ordered.length - 1)] || ordered[0];
  }

  // Calc & Performance: multiples of 30 degrees (clock-like)
  if (shape === 'circle' || shape === 'donut') {
    const R = shape === 'circle' ? 22 : 15;
    const cp = clockPoints(node, R);
    const byDir = {
      right: [cp[300], cp[330], cp[0], cp[30], cp[60]],
      left: [cp[120], cp[150], cp[180], cp[210], cp[240]],
      top: [cp[240], cp[270], cp[300]],
      bottom: [cp[60], cp[90], cp[120]],
    };
    const ordered = orderByDirection(byDir[d] || [cp[0]], node, towardNode);
    return ordered[Math.min(slotIndex, ordered.length - 1)] || ordered[0];
  }

  return base[d] || base.right;
}
