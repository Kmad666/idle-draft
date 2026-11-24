// City generator: plain data, no three.js. The same seed always gives the same city.
// One world unit is 2.5 metres. Blocks sit on a square grid of roads; one row of blocks is a river.

export const N = 16;            // blocks per side
export const BLOCK = 30;        // block width
export const ROAD = 6;          // road width
export const PITCH = BLOCK + ROAD;
export const HALF = N * PITCH / 2;
export const RIVER_ROW = 11;
export const KERB = 0.3;        // height of the pavement plates buildings stand on
export const FLOOR = 1.4;       // storey height, for the floor lines
export const METRES = 2.5;

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const range = (r, a, b) => a + r() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const roadLine = (k) => -HALF + k * PITCH;
export function blockRect(i, j) {
  const x0 = -HALF + i * PITCH + ROAD / 2, z0 = -HALF + j * PITCH + ROAD / 2;
  return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK };
}

const NAME_A = ['Thera', 'Delos', 'Ithaca', 'Ostia', 'Arcadia', 'Avalon', 'Lyonesse', 'Hesperia', 'Corinth', 'Tiryns', 'Knossos', 'Camelot', 'Elysia', 'Argos'];
const NAME_B = ['Reach', 'Heights', 'Harbour', 'Crossing', 'Gate', 'Basin', 'Landing', 'Polis'];
const RIVERS = ['Lethe', 'Alph', 'Meander', 'Eridanos', 'Ladon', 'Halys', 'Acheron', 'Alpheus'];

export const DISTRICTS = {
  civic: { name: 'Civic Core', code: 'CV' },
  core: { name: 'Civic Core', code: 'CC' },
  mid: { name: 'Midtown', code: 'MT' },
  res: { name: 'Terraces', code: 'TR' },
  works: { name: 'River Works', code: 'RW' },
  park: { name: 'Park', code: 'PK' },
};

/* ---------- lots ---------- */
function split(rect, min, r, out) {
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  if ((w < min * 2 && d < min * 2) || (w < min * 3 && d < min * 3 && r() < 0.15)) { out.push(rect); return; }
  let alongX = w > d * 1.15 ? true : d > w * 1.15 ? false : r() < 0.5;
  if (alongX && w < min * 2) alongX = false;
  if (!alongX && d < min * 2) alongX = true;
  if (alongX) { const s = rect.x0 + w * range(r, 0.35, 0.65); split({ ...rect, x1: s }, min, r, out); split({ ...rect, x0: s }, min, r, out); }
  else { const s = rect.z0 + d * range(r, 0.35, 0.65); split({ ...rect, z1: s }, min, r, out); split({ ...rect, z0: s }, min, r, out); }
}
const inset = (q, g) => ({ x0: q.x0 + g, z0: q.z0 + g, x1: q.x1 - g, z1: q.z1 - g });
const dims = (q) => ({ w: q.x1 - q.x0, d: q.z1 - q.z0, x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2 });

function bounds(parts) {
  const b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y1: 0 };
  for (const p of parts) {
    let hw, hd, top;
    if (p.s === 'box' || p.s === 'gable') { hw = p.w / 2; hd = p.d / 2; top = p.y + p.h; }
    else if (p.s === 'cyl') { hw = hd = p.r; top = p.y + p.h; }
    else if (p.s === 'dome') { hw = hd = p.r; top = p.y + p.r; }
    else { hw = hd = p.r; top = p.y + p.r; } // sph, ring
    b.x0 = Math.min(b.x0, p.x - hw); b.x1 = Math.max(b.x1, p.x + hw);
    b.z0 = Math.min(b.z0, p.z - hd); b.z1 = Math.max(b.z1, p.z + hd);
    b.y1 = Math.max(b.y1, top);
  }
  return b;
}

/* ---------- crowns (tower tops) ---------- */
function crown(r, parts, x, z, y, w, d, kind) {
  const m = Math.min(w, d);
  if (kind === 'spire') {
    const h = range(r, 8, 18);
    parts.push({ s: 'box', m: 'white', x, z, y, w: w * 0.5, d: d * 0.5, h: 1.6 });
    parts.push({ s: 'cyl', m: 'steel', x, z, y: y + 1.6, r: 0.28, r2: 0.12, h, seg: 10 });
    parts.push({ s: 'sph', m: 'beacon', x, z, y: y + 1.6 + h, r: 0.45 });
  } else if (kind === 'ring') {
    parts.push({ s: 'cyl', m: 'white', x, z, y, r: m * 0.32, h: 2.4, seg: 32 });
    parts.push({ s: 'ring', m: 'steel', x, z, y: y + 1.4, r: m * 0.48, t: 0.18 });
    parts.push({ s: 'sph', m: 'beacon', x, z, y: y + 2.9, r: 0.45 });
  } else if (kind === 'dome') {
    parts.push({ s: 'cyl', m: 'white', x, z, y, r: m * 0.42, h: 1, seg: 32 });
    parts.push({ s: 'dome', m: 'glass', x, z, y: y + 1, r: m * 0.4 });
  } else if (kind === 'band') {
    parts.push({ s: 'box', m: 'accent', x, z, y: y - 1.6, w: w + 0.3, d: d + 0.3, h: 0.5 });
    parts.push({ s: 'box', m: 'steel', x: x - w * 0.15, z, y, w: w * 0.35, d: d * 0.3, h: 1.4 });
  } else { // plant room boxes and a tank
    parts.push({ s: 'box', m: 'steel', x: x + w * 0.15, z: z - d * 0.12, y, w: w * 0.4, d: d * 0.35, h: 1.3 });
    if (m > 5) parts.push({ s: 'cyl', m: 'white', x: x - w * 0.22, z: z + d * 0.2, y, r: Math.min(1.3, m * 0.15), h: 1.9, seg: 20 });
  }
}

/* ---------- building generators ---------- */
function tower(r, lot, near, forced) {
  const q = inset(lot, 0.9), { w, d, x, z } = dims(q), parts = [];
  const pod = range(r, 3, 7);
  parts.push({ s: 'box', m: 'white', x, z, y: KERB, w, d, h: pod, fl: true });
  let H = pod + range(r, 16, 34) + Math.pow(r(), 1.4) * 85 * (0.35 + 0.65 * near);
  let style = pick(r, ['setback', 'setback', 'slab', 'cyl', 'setback']);
  if (forced) { H = range(r, 150, 172); style = 'setback'; }
  let bw = Math.max(4, w - range(r, 2, 4)), bd = Math.max(4, d - range(r, 2, 4)), y = KERB + pod;
  let type = 'Setback tower';
  if (style === 'cyl' && Math.min(bw, bd) >= 7) {
    type = 'Glass rotunda tower';
    const rad = Math.min(bw, bd) / 2, h = H - pod;
    parts.push({ s: 'cyl', m: 'glass', x, z, y, r: rad, h, seg: 40, fl: true });
    for (let k = 7; k < h - 2; k += range(r, 7, 11)) parts.push({ s: 'cyl', m: 'white', x, z, y: y + k, r: rad + 0.15, h: 0.6, seg: 40 });
    y += h;
    parts.push({ s: 'cyl', m: 'white', x, z, y, r: rad + 0.2, h: 0.8, seg: 40 }); y += 0.8;
    crown(r, parts, x, z, y, rad * 1.4, rad * 1.4, pick(r, ['dome', 'spire', 'ring']));
  } else if (style === 'slab') {
    type = 'Glass slab';
    const h = H - pod;
    parts.push({ s: 'box', m: 'glass', x, z, y, w: bw, d: bd, h, fl: true });
    y += h;
    parts.push({ s: 'box', m: 'white', x, z, y, w: bw + 0.4, d: bd + 0.4, h: 1.2 }); y += 1.2;
    crown(r, parts, x, z, y, bw, bd, pick(r, ['plant', 'band', 'spire']));
  } else {
    if (forced) type = 'Landmark tower';
    const tiers = forced ? 4 : 1 + Math.floor(r() * 3);
    let left = H - pod;
    for (let t = 0; t < tiers; t++) {
      const last = t === tiers - 1, h = last ? left : left * range(r, 0.45, 0.62);
      const m = (last && r() < 0.45) || (forced && t > 0) ? 'glass' : 'white';
      parts.push({ s: 'box', m, x, z, y, w: bw, d: bd, h, fl: true });
      y += h; left -= h;
      if (!last) { bw = Math.max(3.5, bw * range(r, 0.72, 0.86)); bd = Math.max(3.5, bd * range(r, 0.72, 0.86)); }
    }
    crown(r, parts, x, z, y, bw, bd, forced ? 'ring' : pick(r, ['plant', 'spire', 'ring', 'band', 'dome', 'plant']));
    if (forced) { // spire above the ring
      parts.push({ s: 'cyl', m: 'steel', x, z, y: y + 2.4, r: 0.35, r2: 0.1, h: 24, seg: 10 });
      parts.push({ s: 'sph', m: 'beacon', x, z, y: y + 26.6, r: 0.6 });
    }
  }
  return { type, parts };
}

function midrise(r, lot, near) {
  const q = inset(lot, 0.8), { w, d, x, z } = dims(q), parts = [];
  const H = range(r, 7, 18) + r() * 16 * near;
  const m = r() < 0.2 ? 'glass' : 'white';
  let type = m === 'glass' ? 'Glass office' : 'Mid-rise block';
  if (r() < 0.35 && H > 12) {
    const h1 = H * range(r, 0.55, 0.7);
    parts.push({ s: 'box', m, x, z, y: KERB, w, d, h: h1, fl: true });
    const w2 = w * range(r, 0.6, 0.8), d2 = d * range(r, 0.6, 0.8);
    parts.push({ s: 'box', m: 'white', x, z, y: KERB + h1, w: w2, d: d2, h: H - h1, fl: true });
    crown(r, parts, x, z, KERB + H, w2, d2, pick(r, ['plant', 'plant', 'band']));
    type = 'Stepped block';
  } else {
    parts.push({ s: 'box', m, x, z, y: KERB, w, d, h: H, fl: true });
    if (r() < 0.15) parts.push({ s: 'box', m: 'accent', x, z, y: KERB + H - 1.4, w: w + 0.3, d: d + 0.3, h: 0.45 });
    crown(r, parts, x, z, KERB + H, w, d, 'plant');
  }
  return { type, parts };
}

function house(r, lot) {
  const q = inset(lot, 0.7), { w, d, x, z } = dims(q), parts = [];
  if (w * d > 70 && r() < 0.35) {
    const H = range(r, 5, 9);
    parts.push({ s: 'box', m: 'white', x, z, y: KERB, w, d, h: H, fl: true });
    crown(r, parts, x, z, KERB + H, w, d, 'plant');
    return { type: 'Walk-up flats', parts };
  }
  const H = range(r, 2.6, 4);
  parts.push({ s: 'box', m: 'white', x, z, y: KERB, w, d, h: H, fl: true });
  const roof = r() < 0.05 ? 'accent' : r() < 0.3 ? 'steel' : 'white';
  parts.push({ s: 'gable', m: roof, x, z, y: KERB + H, w: w + 0.4, d: d + 0.4, h: Math.min(w, d) * range(r, 0.3, 0.45), axis: w > d ? 'x' : 'z' });
  return { type: 'Row house', parts };
}

function works(r, lot) {
  const q = inset(lot, 0.9), { w, d, x, z } = dims(q), parts = [];
  if (w * d > 120 && r() < 0.55) {
    const H = range(r, 4.5, 7.5), m = r() < 0.5 ? 'steel' : 'white';
    parts.push({ s: 'box', m, x, z, y: KERB, w, d, h: H });
    const along = w > d, n = Math.max(2, Math.round((along ? w : d) / 4));
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n - 0.5;
      parts.push({ s: 'gable', m: k % 2 ? 'white' : 'steel', x: along ? x + f * w : x, z: along ? z : z + f * d, y: KERB + H,
        w: along ? w / n : w, d: along ? d : d / n, h: 1.6, axis: along ? 'z' : 'x' });
    }
    if (r() < 0.5) {
      const ch = range(r, 16, 26), cx = x + (w / 2 - 1.2) * (r() < 0.5 ? 1 : -1);
      parts.push({ s: 'cyl', m: 'white', x: cx, z, y: KERB, r: 0.75, r2: 0.9, h: ch, seg: 16 });
      parts.push({ s: 'cyl', m: 'accent', x: cx, z, y: KERB + ch - 2, r: 0.82, h: 0.8, seg: 16 });
    }
    return { type: 'Works shed', parts };
  }
  const n = 1 + Math.floor(r() * 3), rad = clamp(Math.min(w, d) / (n > 1 ? 4.4 : 2.4), 1.4, 3.6);
  for (let k = 0; k < n; k++) {
    const tx = n === 1 ? x : x + (k - (n - 1) / 2) * (w > d ? rad * 2.2 : 0);
    const tz = n === 1 ? z : z + (k - (n - 1) / 2) * (w > d ? 0 : rad * 2.2);
    const h = range(r, 4, 9);
    parts.push({ s: 'cyl', m: 'steel', x: tx, z: tz, y: KERB, r: rad, h, seg: 28, fl: true });
    parts.push({ s: 'dome', m: 'white', x: tx, z: tz, y: KERB + h, r: rad });
  }
  return { type: 'Tank farm', parts };
}

function rotunda(r, block) {
  const { x, z } = dims(block), parts = [];
  parts.push({ s: 'cyl', m: 'white', x, z, y: KERB, r: 10.6, h: 0.8, seg: 48 });
  parts.push({ s: 'cyl', m: 'white', x, z, y: KERB + 0.8, r: 7.6, h: 6, seg: 48, fl: true });
  for (let k = 0; k < 20; k++) {
    const a = k / 20 * Math.PI * 2;
    parts.push({ s: 'cyl', m: 'white', x: x + Math.cos(a) * 9.4, z: z + Math.sin(a) * 9.4, y: KERB + 0.8, r: 0.32, h: 6, seg: 10 });
  }
  parts.push({ s: 'cyl', m: 'white', x, z, y: KERB + 6.8, r: 10, h: 0.9, seg: 48 });
  parts.push({ s: 'dome', m: 'glass', x, z, y: KERB + 7.7, r: 7.8 });
  parts.push({ s: 'cyl', m: 'white', x, z, y: KERB + 15.2, r: 1.2, h: 1.6, seg: 20 });
  parts.push({ s: 'sph', m: 'beacon', x, z, y: KERB + 17.2, r: 0.7 });
  return { type: 'Civic rotunda', parts };
}

/* ---------- the city ---------- */
export function generateCity(seed) {
  const r = rng(seed);
  const name = `${pick(r, NAME_A)} ${pick(r, NAME_B)}`, river = pick(r, RIVERS);
  const civic = { i: 7 + Math.floor(r() * 2), j: 5 + Math.floor(r() * 2) };
  const cb = blockRect(civic.i, civic.j), C = { x: (cb.x0 + cb.x1) / 2, z: (cb.z0 + cb.z1) / 2 };
  const blocks = [], buildings = [], trees = [], ponds = [];
  let nextId = 0;
  const add = (b, district, lot) => {
    const box = bounds(b.parts);
    buildings.push({ id: ++nextId, district, lot, box, h: box.y1, ...b });
  };
  const tree = (x, z, s = 1) => trees.push({ x, z, s: s * range(r, 0.8, 1.2) });

  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const b = { i, j, ...blockRect(i, j) };
    b.cx = (b.x0 + b.x1) / 2; b.cz = (b.z0 + b.z1) / 2;
    const dist = Math.hypot(b.cx - C.x, b.cz - C.z) / HALF + (r() - 0.5) * 0.1;
    b.d = dist;
    if (j === RIVER_ROW) b.kind = 'river';
    else if (i === civic.i && j === civic.j) b.kind = 'civic';
    else if (dist > 0.22 && r() < 0.08) b.kind = 'park';
    else if (dist < 0.27) b.kind = 'core';
    else if (dist < 0.55) b.kind = 'mid';
    else if (((j === RIVER_ROW + 1 || j === RIVER_ROW - 1) && dist > 0.45) || (j > RIVER_ROW && i >= N - 4)) b.kind = 'works';
    else b.kind = 'res';
    blocks.push(b);
  }

  for (const b of blocks) {
    const rect = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
    const near = clamp(1 - b.d / 0.27, 0, 1);
    if (b.kind === 'river') continue;
    if (b.kind === 'civic') {
      add(rotunda(r, rect), 'civic', rect);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 3; k++)
        tree(b.cx + sx * (12.5 - k * 2.6), b.cz + sz * 12.5, 0.9);
      continue;
    }
    if (b.kind === 'park') {
      const inner = inset(rect, 2);
      let pond = null;
      if (r() < 0.6) { pond = { x: b.cx + range(r, -6, 6), z: b.cz + range(r, -6, 6), r: range(r, 3.5, 6) }; ponds.push(pond); }
      for (let k = 0; k < 60; k++) {
        const x = range(r, inner.x0, inner.x1), z = range(r, inner.z0, inner.z1);
        if (Math.abs(x - b.cx) < 1.6 || Math.abs(z - b.cz) < 1.6) continue; // paths
        if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 1.5) continue;
        if (trees.some(t => Math.abs(t.x - x) < 2.2 && Math.abs(t.z - z) < 2.2)) continue;
        tree(x, z, 1.1);
      }
      continue;
    }
    const min = { core: 9, mid: 7.5, res: 11, works: 10 }[b.kind];
    const lots = []; split(rect, min, r, lots);
    for (const lot of lots) {
      if (b.kind === 'core') add(tower(r, lot, near), 'core', lot);
      else if (b.kind === 'mid') {
        const mn = clamp(1 - b.d / 0.55, 0, 1); // the odd tower spills out of the core into midtown
        add(r() < 0.18 * mn && lot.x1 - lot.x0 > 9 && lot.z1 - lot.z0 > 9 ? tower(r, lot, 0.15) : midrise(r, lot, mn), 'mid', lot);
      }
      else if (b.kind === 'works') add(works(r, lot), 'works', lot);
      else { // terraces: split into small house plots, with the odd garden tree
        const small = []; split(lot, 4.5, r, small);
        for (const s of small) {
          if (r() < 0.12) { const { x, z } = dims(s); tree(x, z, 0.9); continue; }
          add(house(r, s), 'res', s);
        }
      }
    }
  }

  // The landmark: the biggest core lot near the civic block becomes the tallest tower.
  let best = null, score = -1;
  for (const bd of buildings) {
    if (bd.district !== 'core') continue;
    const w = bd.lot.x1 - bd.lot.x0, d = bd.lot.z1 - bd.lot.z0;
    const sc = Math.min(w, d) * 3 + w * d * 0.05 - Math.hypot((bd.lot.x0 + bd.lot.x1) / 2 - C.x, (bd.lot.z0 + bd.lot.z1) / 2 - C.z) * 0.15;
    if (sc > score) { score = sc; best = bd; }
  }
  if (best) {
    const t = tower(r, best.lot, 1, true);
    Object.assign(best, t, { box: bounds(t.parts), landmark: true });
    best.h = best.box.y1;
  }

  // Names: district code and a running number, like a drawing register.
  const counts = {};
  for (const bd of buildings) { const c = DISTRICTS[bd.district].code; counts[c] = (counts[c] || 0) + 1; bd.ref = `${c}-${String(counts[c]).padStart(3, '0')}`; }

  // Labels for the districts.
  const labels = [];
  const centroid = (list) => list.length ? { x: list.reduce((a, b) => a + b.cx, 0) / list.length, z: list.reduce((a, b) => a + b.cz, 0) / list.length } : null;
  labels.push({ text: 'Civic Core', x: C.x, z: C.z - BLOCK * 0.62 });
  const mid = blocks.filter(b => b.kind === 'mid').sort((a, b) => (b.cx - a.cx) - (a.cz - b.cz) * 0.3)[0];
  if (mid) labels.push({ text: 'Midtown', x: mid.cx, z: mid.cz });
  const w = centroid(blocks.filter(b => b.kind === 'works'));
  if (w) labels.push({ text: `${river} Works`, x: w.x, z: w.z });
  labels.push({ text: `River ${river}`, x: -HALF + PITCH * 1.5, z: blockRect(0, RIVER_ROW).z0 + BLOCK / 2, river: true });
  const quads = { North: [], South: [], East: [], West: [] };
  for (const b of blocks.filter(b => b.kind === 'res')) {
    const dx = b.cx - C.x, dz = b.cz - C.z;
    quads[Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'East' : 'West') : (dz > 0 ? 'South' : 'North')].push(b);
  }
  for (const k in quads) if (quads[k].length > 2) {
    const c = quads[k].sort((a, b) => b.d - a.d)[Math.floor(quads[k].length / 2)];
    labels.push({ text: `${k} Terraces`, x: c.cx, z: c.cz });
  }

  const tallest = buildings.reduce((a, b) => (b.h > a.h ? b : a), buildings[0]);
  return { seed, name, river, C, civic, blocks, buildings, trees, ponds, labels, tallest };
}
