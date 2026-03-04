import { getNodeSize } from './nodeSize';

function key(x, y) {
  return `${x},${y}`;
}

function parsePoint(k) {
  const [x, y] = k.split(',').map(Number);
  return { x, y };
}

function parseCell(k) {
  const [i, j] = k.split(',').map(Number);
  return { i, j };
}

function manhattan(a, b) {
  return Math.abs(a.i - b.i) + Math.abs(a.j - b.j);
}

function aStarGrid(start, goal, blocked) {
  const startK = key(start.i, start.j);
  const goalK = key(goal.i, goal.j);
  const open = new Set([startK]);
  const came = new Map();
  const g = new Map([[startK, 0]]);
  const f = new Map([[startK, manhattan(start, goal)]]);
  const neigh = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let guard = 0;

  while (open.size && guard < 120000) {
    guard++;
    let cur = null;
    let best = Number.POSITIVE_INFINITY;
    for (const k of open) {
      const sc = f.get(k) ?? Number.POSITIVE_INFINITY;
      if (sc < best) {
        best = sc;
        cur = k;
      }
    }
    if (!cur) break;
    if (cur === goalK) {
      const path = [cur];
      let c = cur;
      while (came.has(c)) {
        c = came.get(c);
        path.push(c);
      }
      path.reverse();
      return path.map(parseCell);
    }

    open.delete(cur);
    const cpt = parseCell(cur);
    for (const [di, dj] of neigh) {
      const nxt = { i: cpt.i + di, j: cpt.j + dj };
      const nk = key(nxt.i, nxt.j);
      if (blocked.has(nk) && nk !== goalK) continue;
      const tg = (g.get(cur) ?? Number.POSITIVE_INFINITY) + 1;
      if (tg < (g.get(nk) ?? Number.POSITIVE_INFINITY)) {
        came.set(nk, cur);
        g.set(nk, tg);
        f.set(nk, tg + manhattan(nxt, goal));
        open.add(nk);
      }
    }
  }
  return null;
}

function nodeRect(node, pad = 26) {
  const { w: nodeW, h: nodeH } = getNodeSize(node);
  const w = nodeW / 2 + pad;
  const h = nodeH / 2 + pad;
  return { x1: node.x - w, y1: node.y - h, x2: node.x + w, y2: node.y + h };
}

function simplify(points) {
  if (!points || points.length < 3) return points || [];
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

function toClosedRoundedPath(points, radius = 10) {
  if (!points || points.length < 3) return '';
  const pts = simplify(points);
  if (pts.length < 3) return '';

  let d = '';
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const ux1 = dx1 / len1;
    const uy1 = dy1 / len1;

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const ux2 = dx2 / len2;
    const uy2 = dy2 / len2;

    const r = Math.min(radius, len1 / 2, len2 / 2);
    const a = { x: curr.x - ux1 * r, y: curr.y - uy1 * r };
    const b = { x: curr.x + ux2 * r, y: curr.y + uy2 * r };

    if (i === 0) d += `M ${a.x} ${a.y}`;
    else d += ` L ${a.x} ${a.y}`;
    d += ` Q ${curr.x} ${curr.y} ${b.x} ${b.y}`;
  }
  d += ' Z';
  return d;
}

export function buildSubsystemContour(members, options = {}) {
  if (!members || members.length === 0) return null;
  if (members.length === 1) {
    const r = nodeRect(members[0], 30);
    const points = [
      { x: r.x1, y: r.y1 },
      { x: r.x2, y: r.y1 },
      { x: r.x2, y: r.y2 },
      { x: r.x1, y: r.y2 },
    ];
    return { paths: [toClosedRoundedPath(points, 12)] };
  }

  const cell = options.cellSize || 20;
  const pad = options.pad || 26;
  const occupied = new Set();

  for (const m of members) {
    const r = nodeRect(m, pad);
    const i1 = Math.floor(r.x1 / cell);
    const i2 = Math.ceil(r.x2 / cell);
    const j1 = Math.floor(r.y1 / cell);
    const j2 = Math.ceil(r.y2 / cell);
    for (let i = i1; i < i2; i++) {
      for (let j = j1; j < j2; j++) {
        occupied.add(key(i, j));
      }
    }
  }

  // Ensure one connected subsystem contour by bridging disconnected groups
  // with orthogonal cell corridors.
  const compId = new Map();
  const components = [];
  const neigh = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  for (const c of occupied) {
    if (compId.has(c)) continue;
    const idx = components.length;
    const queue = [c];
    compId.set(c, idx);
    const cells = [];
    while (queue.length) {
      const cur = queue.shift();
      cells.push(cur);
      const { i, j } = parseCell(cur);
      for (const [di, dj] of neigh) {
        const nk = key(i + di, j + dj);
        if (!occupied.has(nk) || compId.has(nk)) continue;
        compId.set(nk, idx);
        queue.push(nk);
      }
    }
    components.push(cells);
  }

  if (components.length > 1) {
    const allNodes = options.allNodes || [];
    const memberIds = new Set(members.map(m => m.id));
    const blocked = new Set();
    // Block cells around nodes that are NOT in this subsystem.
    for (const n of allNodes) {
      if (memberIds.has(n.id)) continue;
      const r = nodeRect(n, pad + 10);
      const i1 = Math.floor(r.x1 / cell);
      const i2 = Math.ceil(r.x2 / cell);
      const j1 = Math.floor(r.y1 / cell);
      const j2 = Math.ceil(r.y2 / cell);
      for (let i = i1; i < i2; i++) {
        for (let j = j1; j < j2; j++) blocked.add(key(i, j));
      }
    }

    const centerOf = (cells) => {
      let si = 0; let sj = 0;
      for (const c of cells) {
        const { i, j } = parseCell(c);
        si += i; sj += j;
      }
      return { i: Math.round(si / cells.length), j: Math.round(sj / cells.length) };
    };

    const centers = components.map(centerOf);
    let base = centers[0];
    for (let t = 1; t < centers.length; t++) {
      const c = centers[t];
      // Prefer obstacle-avoiding orthogonal path.
      const path = aStarGrid(base, c, blocked);
      if (path && path.length) {
        for (const p of path) occupied.add(key(p.i, p.j));
      } else {
        // Fallback to simple L corridor.
        const stepI = c.i >= base.i ? 1 : -1;
        const stepJ = c.j >= base.j ? 1 : -1;
        for (let i = base.i; i !== c.i; i += stepI) occupied.add(key(i, base.j));
        occupied.add(key(c.i, base.j));
        for (let j = base.j; j !== c.j; j += stepJ) occupied.add(key(c.i, j));
        occupied.add(key(c.i, c.j));
      }
      base = c;
    }
  }

  const edges = [];
  for (const k of occupied) {
    const [i, j] = k.split(',').map(Number);
    const top = key(i, j - 1);
    const right = key(i + 1, j);
    const bottom = key(i, j + 1);
    const left = key(i - 1, j);

    const x = i * cell;
    const y = j * cell;

    if (!occupied.has(top)) {
      edges.push({ a: key(x, y), b: key(x + cell, y) });
    }
    if (!occupied.has(right)) {
      edges.push({ a: key(x + cell, y), b: key(x + cell, y + cell) });
    }
    if (!occupied.has(bottom)) {
      edges.push({ a: key(x + cell, y + cell), b: key(x, y + cell) });
    }
    if (!occupied.has(left)) {
      edges.push({ a: key(x, y + cell), b: key(x, y) });
    }
  }

  if (edges.length === 0) return null;

  const nextMap = new Map();
  for (const e of edges) {
    if (!nextMap.has(e.a)) nextMap.set(e.a, []);
    nextMap.get(e.a).push(e.b);
  }

  // Trace loops from occupied boundary.
  const visited = new Set();
  const loops = [];
  for (const e of edges) {
    const ek = `${e.a}->${e.b}`;
    if (visited.has(ek)) continue;

    const loop = [parsePoint(e.a)];
    let curA = e.a;
    let curB = e.b;
    visited.add(ek);
    loop.push(parsePoint(curB));

    let guard = 0;
    while (curB !== loop[0].x + ',' + loop[0].y && guard < 20000) {
      guard++;
      const nexts = nextMap.get(curB) || [];
      if (nexts.length === 0) break;
      let next = nexts[0];
      if (nexts.length > 1) {
        next = nexts.find(n => n !== curA) || nexts[0];
      }
      const nk = `${curB}->${next}`;
      if (visited.has(nk)) break;
      visited.add(nk);
      curA = curB;
      curB = next;
      loop.push(parsePoint(curB));
    }

    if (loop.length > 3) loops.push(loop);
  }

  if (loops.length === 0) return null;

  const area = (pts) => {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  };

  const sorted = loops.sort((a, b) => area(b) - area(a));
  const main = toClosedRoundedPath(simplify(sorted[0]), 10);
  if (!main) return null;
  return { paths: [main] };
}
