import { getDirectionalPort } from './portPositions';
import { getNodeSize } from './nodeSize';

const MARGIN = 24;
const LANE = 14;
const OBSTACLE_PAD = 14;
const CROSS_PENALTY = 8;
const OVERLAP_PENALTY = 120;
const BEND_PENALTY = 3;
const LENGTH_PENALTY = 0.08;

function snap(v) {
  return Math.round(v / LANE) * LANE;
}

export function selectPorts(srcNode, tgtNode, preferredAxis = 'horizontal') {
  // Make calculation function nodes explicit:
  // horizontal mode: incoming terminate on left, outgoing from right.
  // vertical mode: incoming terminate on top, outgoing from bottom.
  if (tgtNode?.type === 'calcFunction') {
    if (preferredAxis === 'vertical') {
      const dyIn = tgtNode.y - srcNode.y;
      const srcDirIn = dyIn >= 0 ? 'bottom' : 'top';
      return { srcDir: srcDirIn, tgtDir: 'top' };
    }
    const dxIn = tgtNode.x - srcNode.x;
    const srcDirIn = Math.abs(dxIn) >= Math.abs(tgtNode.y - srcNode.y)
      ? (dxIn >= 0 ? 'right' : 'left')
      : ((tgtNode.y - srcNode.y) >= 0 ? 'bottom' : 'top');
    return { srcDir: srcDirIn, tgtDir: 'left' };
  }
  if (srcNode?.type === 'calcFunction') {
    if (preferredAxis === 'vertical') {
      const dyOut = tgtNode.y - srcNode.y;
      const tgtDirOut = dyOut >= 0 ? 'top' : 'bottom';
      return { srcDir: 'bottom', tgtDir: tgtDirOut };
    }
    const dxOut = tgtNode.x - srcNode.x;
    const tgtDirOut = Math.abs(dxOut) >= Math.abs(tgtNode.y - srcNode.y)
      ? (dxOut >= 0 ? 'left' : 'right')
      : ((tgtNode.y - srcNode.y) >= 0 ? 'top' : 'bottom');
    return { srcDir: 'right', tgtDir: tgtDirOut };
  }

  const dx = tgtNode.x - srcNode.x;
  const dy = tgtNode.y - srcNode.y;
  if (preferredAxis === 'vertical') {
    // Keep vertical flow stable unless nodes are overwhelmingly horizontal apart.
    if (Math.abs(dy) >= Math.abs(dx) * 0.55) {
      return dy >= 0
        ? { srcDir: 'bottom', tgtDir: 'top' }
        : { srcDir: 'top', tgtDir: 'bottom' };
    }
    return dx >= 0
      ? { srcDir: 'right', tgtDir: 'left' }
      : { srcDir: 'left', tgtDir: 'right' };
  }
  // Keep horizontal flow stable unless nodes are overwhelmingly vertical apart.
  if (Math.abs(dx) >= Math.abs(dy) * 0.55) {
    return dx >= 0
      ? { srcDir: 'right', tgtDir: 'left' }
      : { srcDir: 'left', tgtDir: 'right' };
  }
  return dy >= 0
    ? { srcDir: 'bottom', tgtDir: 'top' }
    : { srcDir: 'top', tgtDir: 'bottom' };
}

function nodeRect(node) {
  const { w: nodeW, h: nodeH } = getNodeSize(node);
  const w = nodeW / 2 + OBSTACLE_PAD;
  const h = nodeH / 2 + OBSTACLE_PAD;
  return { x1: node.x - w, y1: node.y - h, x2: node.x + w, y2: node.y + h };
}

function makeStub(p, dir) {
  if (dir === 'right') return { x: p.x + MARGIN, y: p.y };
  if (dir === 'left') return { x: p.x - MARGIN, y: p.y };
  if (dir === 'bottom') return { x: p.x, y: p.y + MARGIN };
  return { x: p.x, y: p.y - MARGIN };
}

function segments(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) out.push({ a: points[i - 1], b: points[i] });
  return out;
}

function segHitsRect(seg, r) {
  // Axis-aligned only.
  if (seg.a.x === seg.b.x) {
    const x = seg.a.x;
    const y1 = Math.min(seg.a.y, seg.b.y);
    const y2 = Math.max(seg.a.y, seg.b.y);
    return x >= r.x1 && x <= r.x2 && Math.max(y1, r.y1) <= Math.min(y2, r.y2);
  }
  if (seg.a.y === seg.b.y) {
    const y = seg.a.y;
    const x1 = Math.min(seg.a.x, seg.b.x);
    const x2 = Math.max(seg.a.x, seg.b.x);
    return y >= r.y1 && y <= r.y2 && Math.max(x1, r.x1) <= Math.min(x2, r.x2);
  }
  return false;
}

function collinearOverlap(a1, a2, b1, b2) {
  if (a1.x === a2.x && b1.x === b2.x && a1.x === b1.x) {
    const aMin = Math.min(a1.y, a2.y), aMax = Math.max(a1.y, a2.y);
    const bMin = Math.min(b1.y, b2.y), bMax = Math.max(b1.y, b2.y);
    return Math.max(aMin, bMin) <= Math.min(aMax, bMax);
  }
  if (a1.y === a2.y && b1.y === b2.y && a1.y === b1.y) {
    const aMin = Math.min(a1.x, a2.x), aMax = Math.max(a1.x, a2.x);
    const bMin = Math.min(b1.x, b2.x), bMax = Math.max(b1.x, b2.x);
    return Math.max(aMin, bMin) <= Math.min(aMax, bMax);
  }
  return false;
}

function orthCross(a1, a2, b1, b2) {
  const aVert = a1.x === a2.x;
  const bVert = b1.x === b2.x;
  if (aVert === bVert) return false;
  let vx, vy1, vy2, hy, hx1, hx2;
  if (aVert) {
    vx = a1.x; vy1 = Math.min(a1.y, a2.y); vy2 = Math.max(a1.y, a2.y);
    hy = b1.y; hx1 = Math.min(b1.x, b2.x); hx2 = Math.max(b1.x, b2.x);
  } else {
    vx = b1.x; vy1 = Math.min(b1.y, b2.y); vy2 = Math.max(b1.y, b2.y);
    hy = a1.y; hx1 = Math.min(a1.x, a2.x); hx2 = Math.max(a1.x, a2.x);
  }
  return vx >= hx1 && vx <= hx2 && hy >= vy1 && hy <= vy2;
}

function scoreAgainstRouted(path, routedSegs) {
  let score = 0;
  let length = 0;
  for (const s of segments(path)) {
    length += Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y);
    for (const r of routedSegs) {
      if (collinearOverlap(s.a, s.b, r.a, r.b)) score += OVERLAP_PENALTY;
      else if (orthCross(s.a, s.b, r.a, r.b)) score += CROSS_PENALTY;
    }
  }
  // Prefer fewer bends.
  score += Math.max(0, path.length - 2) * BEND_PENALTY;
  // Prefer shorter local routes; allows clean crossings (with jump markers) over huge detours.
  score += length * LENGTH_PENALTY;
  return score;
}

function pathIsClear(path, obstacles) {
  const segs = segments(path);
  for (const s of segs) {
    for (const r of obstacles) {
      if (segHitsRect(s, r)) return false;
    }
  }
  return true;
}

function candidateLanes(center, routeOffset, span = 0) {
  const lanes = [];
  const c = snap(center + routeOffset);
  const dynamic = Math.min(40, Math.max(10, Math.ceil(Math.abs(span) / LANE) + 8));
  for (let i = 0; i <= dynamic; i++) {
    if (i === 0) lanes.push(c);
    else {
      lanes.push(c - i * LANE);
      lanes.push(c + i * LANE);
    }
  }
  return lanes;
}

function simplify(points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const col = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!col) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function computeOrthogonalPath(srcNode, tgtNode, options = {}) {
  const routeOffset = options.routeOffset || 0;
  const allNodes = options.nodes || [];
  const routedPaths = options.routedPaths || [];
  const preferredAxis = options.preferredAxis === 'vertical' ? 'vertical' : 'horizontal';

  const dirs = options.portDirs || selectPorts(srcNode, tgtNode, preferredAxis);
  const { srcDir, tgtDir } = dirs;
  const calcFnPortOrientation = preferredAxis === 'vertical' ? 'vertical' : 'horizontal';
  const src = getDirectionalPort(srcNode, srcDir, tgtNode, options.srcSlot || 0, {
    calcFunctionPortOrientation: calcFnPortOrientation,
  });
  const tgt = getDirectionalPort(tgtNode, tgtDir, srcNode, options.tgtSlot || 0, {
    calcFunctionPortOrientation: calcFnPortOrientation,
  });
  const out = makeStub(src, srcDir);
  const inn = makeStub(tgt, tgtDir);

  const obstacles = allNodes
    .filter(n => n.id !== srcNode.id && n.id !== tgtNode.id)
    .map(nodeRect);
  const routedSegs = routedPaths.flatMap(p => segments(p));

  let bestPath = null;
  let bestScore = Infinity;

  const tryPath = (p) => {
    const pp = simplify(p);
    if (!pathIsClear(pp, obstacles)) return;
    const s = scoreAgainstRouted(pp, routedSegs);
    if (s < bestScore) {
      bestScore = s;
      bestPath = pp;
    }
  };

  const srcH = srcDir === 'left' || srcDir === 'right';
  const tgtH = tgtDir === 'left' || tgtDir === 'right';
  const srcV = !srcH;
  const tgtV = !tgtH;

  if (srcH && tgtH) {
    const lanes = candidateLanes((out.x + inn.x) / 2, routeOffset, out.x - inn.x);
    for (const laneX of lanes) {
      tryPath([src, out, { x: laneX, y: out.y }, { x: laneX, y: inn.y }, inn, tgt]);
    }
  } else if (srcV && tgtV) {
    const lanes = candidateLanes((out.y + inn.y) / 2, routeOffset, out.y - inn.y);
    for (const laneY of lanes) {
      tryPath([src, out, { x: out.x, y: laneY }, { x: inn.x, y: laneY }, inn, tgt]);
    }
  } else {
    // Mixed orientation: try both elbow orientations + nearby lanes.
    const tryHorizontalFirst = () => {
      tryPath([src, out, { x: out.x, y: inn.y }, inn, tgt]);
      for (const laneY of candidateLanes((out.y + inn.y) / 2, routeOffset, out.y - inn.y)) {
        tryPath([src, out, { x: out.x, y: laneY }, { x: inn.x, y: laneY }, inn, tgt]);
      }
      tryPath([src, out, { x: inn.x, y: out.y }, inn, tgt]);
      for (const laneX of candidateLanes((out.x + inn.x) / 2, routeOffset, out.x - inn.x)) {
        tryPath([src, out, { x: laneX, y: out.y }, { x: laneX, y: inn.y }, inn, tgt]);
      }
    };
    const tryVerticalFirst = () => {
      tryPath([src, out, { x: inn.x, y: out.y }, inn, tgt]);
      for (const laneX of candidateLanes((out.x + inn.x) / 2, routeOffset, out.x - inn.x)) {
        tryPath([src, out, { x: laneX, y: out.y }, { x: laneX, y: inn.y }, inn, tgt]);
      }
      tryPath([src, out, { x: out.x, y: inn.y }, inn, tgt]);
      for (const laneY of candidateLanes((out.y + inn.y) / 2, routeOffset, out.y - inn.y)) {
        tryPath([src, out, { x: out.x, y: laneY }, { x: inn.x, y: laneY }, inn, tgt]);
      }
    };
    if (preferredAxis === 'vertical') {
      tryVerticalFirst();
    } else {
      tryHorizontalFirst();
    }
  }

  // Last-resort fallback.
  if (!bestPath) {
    const xs = [out.x, inn.x, ...obstacles.map(r => r.x1), ...obstacles.map(r => r.x2)];
    const ys = [out.y, inn.y, ...obstacles.map(r => r.y1), ...obstacles.map(r => r.y2)];
    const minX = Math.min(...xs) - 3 * LANE;
    const maxX = Math.max(...xs) + 3 * LANE;
    const minY = Math.min(...ys) - 3 * LANE;
    const maxY = Math.max(...ys) + 3 * LANE;

    const boundaryCandidates = [
      [src, out, { x: out.x, y: minY }, { x: inn.x, y: minY }, inn, tgt],
      [src, out, { x: out.x, y: maxY }, { x: inn.x, y: maxY }, inn, tgt],
      [src, out, { x: minX, y: out.y }, { x: minX, y: inn.y }, inn, tgt],
      [src, out, { x: maxX, y: out.y }, { x: maxX, y: inn.y }, inn, tgt],
    ];
    for (const p of boundaryCandidates) tryPath(p);
  }
  if (!bestPath) {
    bestPath = simplify([src, out, { x: out.x, y: inn.y }, inn, tgt]);
  }

  return bestPath;
}

// Convert waypoints to an SVG path string with rounded corners.
export function pointsToSvgPath(points, cornerRadius = 5) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const ux1 = dx1 / len1;
    const uy1 = dy1 / len1;

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
    const ux2 = dx2 / len2;
    const uy2 = dy2 / len2;

    const r = Math.min(cornerRadius, len1 / 2, len2 / 2);
    const ax = curr.x - ux1 * r;
    const ay = curr.y - uy1 * r;
    const ex = curr.x + ux2 * r;
    const ey = curr.y + uy2 * r;

    d += ` L ${ax} ${ay} Q ${curr.x} ${curr.y} ${ex} ${ey}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function computeArrowhead(points, size = 7) {
  if (points.length < 2) return '';
  const end = points[points.length - 1];
  const prev = points[points.length - 2];

  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const p1 = {
    x: end.x - ux * size - uy * size * 0.38,
    y: end.y - uy * size + ux * size * 0.38,
  };
  const p2 = {
    x: end.x - ux * size + uy * size * 0.38,
    y: end.y - uy * size - ux * size * 0.38,
  };

  return `${end.x},${end.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`;
}
