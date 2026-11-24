// Economy simulation. Pure data, no rendering. Runs in fixed steps so it can
// fast-forward for time spent away.
import { BUILDINGS, TIERS, ISLANDS, CELL, IN_CAP, OUT_CAP, POD_CAP, LINK_CAP, RELAY_LANE,
  COST_GROWTH, START_BITS, PULSE } from './data.js';

let nextId = 1;
const uid = () => nextId++;

export function newState() {
  const s = {
    v: 1, bits: START_BITS, lifetime: 0, time: 0,
    buildings: [], links: [],
    islands: { delos: true, thera: false },
    relayLanes: 1,
    pulse: { until: -1, ready: 0 },
    tutorial: 0,
    settings: { dark: false, edgeScroll: true, autoUpgrade: false, calm: false },
    savedAt: Date.now(),
    version: 0, // bumps when buildings/links change (for the renderer)
  };
  const d = ISLANDS.delos;
  s.buildings.push({ id: uid(), type: 'core', island: 'delos', cx: Math.floor(d.cols / 2), cz: Math.floor(d.rows / 2) });
  return s;
}

export function restore(s) {
  nextId = 1 + Math.max(0, ...s.buildings.map(b => b.id), ...s.links.map(l => l.id));
  s.version = (s.version || 0) + 1;
  for (const b of s.buildings) initRuntime(b);
  for (const l of s.links) { l.flow = 0; l.sent = 0; }
  return s;
}

function initRuntime(b) {
  b.buf = b.buf || {};
  b.out = b.out || 0;
  b.util = 0; b.income = 0; b.met = b.met || {}; b.coreMet = b.coreMet || 0; b.readyT = b.readyT || 0;
  b.starved = false;
}

export const worldPos = (b) => {
  const isl = ISLANDS[b.island];
  return [isl.cx + (b.cx - (isl.cols - 1) / 2) * CELL, isl.cz + (b.cz - (isl.rows - 1) / 2) * CELL];
};

export const countOf = (s, type) => s.buildings.filter(b => b.type === type).length;
export const costOf = (s, type) => Math.round(BUILDINGS[type].cost * Math.pow(COST_GROWTH, countOf(s, type)));

export function tierOf(b) { return TIERS[b.tier || 0]; }

export function needsOf(b) {
  if (b.type === 'pod') { const t = tierOf(b); return Object.keys({ ...t.core, ...t.comfort }); }
  const def = BUILDINGS[b.type];
  return def && def.in ? Object.keys(def.in) : [];
}
export function outOf(b) { const d = BUILDINGS[b.type]; return d && d.out ? d.out : null; }

export function cellFree(s, island, cx, cz) {
  const isl = ISLANDS[island];
  if (cx < 0 || cz < 0 || cx >= isl.cols || cz >= isl.rows) return false;
  return !s.buildings.some(b => b.island === island && b.cx === cx && b.cz === cz);
}

export function canPlace(s, type, island) {
  const def = BUILDINGS[type];
  if (!s.islands[island]) return 'That island is still locked.';
  if (def.island && def.island !== island) return `${def.name} can only go on ${ISLANDS[def.island].name}.`;
  if (def.needs && !s.islands[def.needs]) return `Unlock ${ISLANDS[def.needs].name} first.`;
  return null;
}

export function isUnlocked(s, type) {
  const def = BUILDINGS[type];
  return !def.needs || s.islands[def.needs];
}

const dist2 = (a, b) => { const p = worldPos(a), q = worldPos(b); return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; };
const reachable = (s, a, b) => a.island === b.island || (s.islands[a.island] && s.islands[b.island]);

// Suggest a free cell: next to the building it most likely connects to.
export function suggestCell(s, type) {
  const def = BUILDINGS[type];
  const islands = def.island ? [def.island] : Object.keys(s.islands).filter(k => s.islands[k]);
  const fake = { type, tier: 0 };
  const partners = s.buildings.filter(b => b.type !== 'core' && (
    (outOf(fake) && needsOf(b).includes(outOf(fake))) || (outOf(b) && needsOf(fake).includes(outOf(b)))));
  let best = null, bestScore = Infinity;
  for (const isl of islands) {
    const I = ISLANDS[isl];
    for (let cx = 0; cx < I.cols; cx++) for (let cz = 0; cz < I.rows; cz++) {
      if (!cellFree(s, isl, cx, cz)) continue;
      const c = { island: isl, cx, cz };
      let score = partners.length
        ? Math.min(...partners.map(p => dist2(c, p) + (p.island === isl ? 0 : 5000)))
        : dist2(c, s.buildings[0]) * (type === 'pod' ? 1 : 0.5) + (type === 'pod' ? 0 : 200);
      if (score < bestScore) { bestScore = score; best = c; }
    }
  }
  return best;
}

export function place(s, type, island, cx, cz) {
  const err = canPlace(s, type, island);
  if (err) return { err };
  if (!cellFree(s, island, cx, cz)) return { err: 'That spot is taken.' };
  const cost = costOf(s, type);
  if (s.bits < cost) return { err: 'Not enough Bits.' };
  s.bits -= cost;
  const b = { id: uid(), type, island, cx, cz, tier: 0, spent: cost };
  initRuntime(b);
  s.buildings.push(b);
  autoLink(s, b);
  s.version++;
  return { b };
}

export function move(s, b, island, cx, cz) {
  if (b.type === 'core') return 'The Core stays put.';
  const def = BUILDINGS[b.type];
  if (!s.islands[island]) return 'That island is locked.';
  if (def.island && def.island !== island) return `${def.name} can only go on ${ISLANDS[def.island].name}.`;
  if (!cellFree(s, island, cx, cz)) return 'That spot is taken.';
  b.island = island; b.cx = cx; b.cz = cz; s.version++;
  return null;
}

export function demolish(s, b) {
  if (b.type === 'core') return;
  s.bits += Math.round((b.spent || 0) * 0.5);
  s.buildings = s.buildings.filter(x => x !== b);
  s.links = s.links.filter(l => l.from !== b.id && l.to !== b.id);
  s.version++;
}

export const byId = (s, id) => s.buildings.find(b => b.id === id);

export function canLink(s, a, b) {
  if (!a || !b || a === b) return 'Pick two different buildings.';
  const g = outOf(a);
  if (!g) return `${label(a)} does not make anything to send.`;
  if (!needsOf(b).includes(g)) return `${label(b)} does not use ${g}.`;
  if (!reachable(s, a, b)) return 'Those islands are not connected yet.';
  if (s.links.some(l => l.from === a.id && l.to === b.id)) return 'Already linked.';
  return null;
}

export function addLink(s, a, b) {
  const err = canLink(s, a, b);
  if (err) return err;
  s.links.push({ id: uid(), from: a.id, to: b.id, good: outOf(a), flow: 0, sent: 0 });
  s.version++;
  return null;
}
export function removeLink(s, id) { s.links = s.links.filter(l => l.id !== id); s.version++; }

export const label = (b) => b.type === 'core' ? 'Core' : b.type === 'pod' ? `${tierOf(b).name} house` : BUILDINGS[b.type].name;

// Hybrid auto-linking: new buildings wire themselves to the obvious partners.
export function autoLink(s, b) {
  const g = outOf(b);
  if (g) {
    const users = s.buildings.filter(x => x !== b && needsOf(x).includes(g) && reachable(s, b, x))
      .sort((x, y) => dist2(b, x) - dist2(b, y));
    const unsupplied = users.filter(x => !s.links.some(l => l.to === x.id && l.good === g));
    const targets = unsupplied.length ? unsupplied.slice(0, 6) : users.slice(0, 2);
    for (const t of targets) addLink(s, b, t);
  }
  linkMissingInputs(s, b);
  if (b.type === 'pod') linkBitsToCore(s, b);
}

export function linkMissingInputs(s, b) {
  for (const g of needsOf(b)) {
    if (s.links.some(l => l.to === b.id && l.good === g)) continue;
    const src = s.buildings.filter(x => outOf(x) === g && reachable(s, x, b))
      .sort((x, y) => (dist2(b, x) + (x.island === b.island ? 0 : 5000)) - (dist2(b, y) + (y.island === b.island ? 0 : 5000)))[0];
    if (src) addLink(s, src, b);
  }
}

function linkBitsToCore() { /* Bits travel to the Core visually only; no link needed. */ }

export function unlockIsland(s, key) {
  const I = ISLANDS[key];
  if (s.islands[key]) return null;
  if (podsFull(s) < (I.needPods || 0)) return `Needs ${I.needPods} fully supplied houses first.`;
  if (s.bits < I.unlockCost) return 'Not enough Bits.';
  s.bits -= I.unlockCost; s.islands[key] = true; s.version++;
  for (const b of s.buildings) linkMissingInputs(s, b);
  return null;
}

export function buyLane(s, cost) {
  if (s.bits < cost) return 'Not enough Bits.';
  s.bits -= cost; s.relayLanes++; return null;
}
export const laneCost = (s) => Math.round(2000 * Math.pow(1.6, s.relayLanes - 1));

export const podsFull = (s) => s.buildings.filter(b => b.type === 'pod' && b.coreMet > 0.97).length;

export function canUpgrade(s, b) {
  if (b.type !== 'pod') return 'Only houses upgrade.';
  if ((b.tier || 0) >= TIERS.length - 1) return 'Already the top class in this version.';
  if (!s.islands.thera) return 'Techs need goods from Thera. Unlock Thera first.';
  if (b.readyT < 60) return 'Keep every core need at 100% for a minute first.';
  if (s.bits < tierOf(b).upCost) return 'Not enough Bits.';
  return null;
}
export function upgrade(s, b) {
  const err = canUpgrade(s, b);
  if (err) return err;
  s.bits -= tierOf(b).upCost; b.spent = (b.spent || 0) + tierOf(b).upCost;
  b.tier = (b.tier || 0) + 1; b.readyT = 0; b.met = {}; b.coreMet = 0;
  const want = needsOf(b);
  s.links = s.links.filter(l => l.to !== b.id || want.includes(l.good));
  for (const g in b.buf) if (!want.includes(g)) delete b.buf[g];
  linkMissingInputs(s, b); s.version++;
  return null;
}

export function pulse(s) {
  if (s.time < s.pulse.ready) return Math.ceil(s.pulse.ready - s.time);
  s.pulse.until = s.time + PULSE.dur; s.pulse.ready = s.time + PULSE.dur + PULSE.cooldown;
  return 0;
}

// One simulation step of dt seconds.
export function step(s, dt) {
  if (s.time < s.pulse.until) dt *= PULSE.mult;
  const B = s.buildings, idx = new Map(B.map(b => [b.id, b]));

  // 1. production
  for (const b of B) {
    const def = BUILDINGS[b.type];
    if (!def || def.kind === 'house') continue;
    const full = def.rate * dt / 60;
    let amt = Math.min(full, OUT_CAP - b.out);
    let starved = false;
    if (def.in) for (const g in def.in) {
      const can = (b.buf[g] || 0) / def.in[g];
      if (can < amt) { amt = can; if (can < full * 0.5) starved = true; }
    }
    amt = Math.max(0, amt);
    if (def.in) for (const g in def.in) b.buf[g] = (b.buf[g] || 0) - amt * def.in[g];
    b.out += amt;
    b.util += ((full ? amt / full : 0) - b.util) * Math.min(1, dt / 5);
    b.starved = starved && b.util < 0.6;
  }

  // 2. transfer along links
  let relay = s.relayLanes * RELAY_LANE * dt / 60;
  const linkCap = LINK_CAP * dt / 60;
  const outgoing = new Map();
  for (const l of s.links) { l.sent = 0; (outgoing.get(l.from) || outgoing.set(l.from, []).get(l.from)).push(l); }
  const entries = [...outgoing], off = entries.length ? (s.tick = (s.tick || 0) + 1) % entries.length : 0;
  for (let e = 0; e < entries.length; e++) {
    const [fromId, ls] = entries[(e + off) % entries.length];
    const a = idx.get(fromId); if (!a) continue;
    for (let round = 0; round < 3 && a.out > 1e-6; round++) {
      const open = ls.filter(l => {
        const t = idx.get(l.to); if (!t) return false;
        const cap = t.type === 'pod' ? POD_CAP : IN_CAP;
        return (t.buf[l.good] || 0) < cap - 1e-6 && l.sent < linkCap - 1e-6 && (t.island === a.island || relay > 1e-6);
      });
      if (!open.length) break;
      const share = a.out / open.length;
      for (const l of open) {
        const t = idx.get(l.to), cap = t.type === 'pod' ? POD_CAP : IN_CAP;
        let give = Math.min(share, linkCap - l.sent, cap - (t.buf[l.good] || 0));
        if (t.island !== a.island) { give = Math.min(give, relay); relay -= give; }
        if (give <= 0) continue;
        t.buf[l.good] = (t.buf[l.good] || 0) + give; a.out -= give; l.sent += give;
      }
    }
  }
  for (const l of s.links) {
    l.flow += (l.sent / dt * 60 - l.flow) * Math.min(1, dt / 3);
    const a = idx.get(l.from), t = idx.get(l.to);
    l.jam = !!(a && t && a.out > OUT_CAP * 0.6 && l.sent < 1e-6);
  }
  s.relayUse = 1 - relay / Math.max(1e-6, s.relayLanes * RELAY_LANE * dt / 60);

  // 3. houses consume and pay
  let income = 0;
  for (const b of B) {
    if (b.type !== 'pod') continue;
    const t = tierOf(b);
    let coreSum = 0, coreN = 0, comSum = 0, comN = 0;
    for (const [group, set] of [['core', t.core], ['comfort', t.comfort]]) for (const g in set) {
      const want = set[g] * dt / 60, got = Math.min(b.buf[g] || 0, want);
      b.buf[g] = (b.buf[g] || 0) - got;
      const r = want ? got / want : 0;
      b.met[g] = (b.met[g] ?? 0) + (r - (b.met[g] ?? 0)) * Math.min(1, dt / 8);
      if (group === 'core') { coreSum += r; coreN++; } else { comSum += r; comN++; }
    }
    const core = coreN ? coreSum / coreN : 0, com = comN ? comSum / comN : 0;
    const pay = t.residents * t.rate * core * (1 + t.bonus * com);
    income += pay * dt;
    b.income += (pay - b.income) * Math.min(1, dt / 5);
    const coreEma = Object.keys(t.core).reduce((m, g) => m + (b.met[g] || 0), 0) / Object.keys(t.core).length;
    b.coreMet = coreEma;
    b.readyT = coreEma > 0.97 ? b.readyT + dt : 0;
    b.starved = coreEma < 0.5;
    if (s.settings.autoUpgrade && !canUpgrade(s, b)) upgrade(s, b);
  }
  s.bits += income; s.lifetime += income; s.time += dt;
  s.incomeRate = (s.incomeRate || 0) + (income / dt - (s.incomeRate || 0)) * Math.min(1, dt / 3);
}

// Fast-forward for time away. Returns a short report.
export function fastForward(s, seconds) {
  const before = { bits: s.bits, tiers: s.buildings.filter(b => b.type === 'pod').map(b => b.tier || 0).join() };
  let left = seconds;
  while (left > 0) { const dt = Math.min(left, seconds > 1200 ? 5 : 1); step(s, dt); left -= dt; }
  const jam = s.links.filter(l => l.jam).length;
  return { seconds, earned: s.bits - before.bits, jams: jam,
    upgraded: before.tiers !== s.buildings.filter(b => b.type === 'pod').map(b => b.tier || 0).join() };
}
