// Delivery drones: each depot launches quadcopters that climb, cruise above the rooftops,
// lower a package to a building's kerb, and fly home to reload.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KERB, METRES, roadLine, blockRect, blockOf, rng } from './city.js';

const SCALE = 1.4;            // drones are drawn a little large so they read at city scale
const SPEED = { climb: 9, cruise: 16, descend: 7 };
const MAX_PARCELS = 160;

function prep(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  return n;
}
const gloss = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, ...o });
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// Does the 2D segment a→b pass through the rectangle?
function segHitsRect(ax, az, bx, bz, x0, z0, x1, z1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

export class Deliveries {
  constructor(world, city) {
    this.world = world; this.city = city; this.cyber = city.cyber;
    const r = this.r = rng(city.seed ^ 0x51ed27);
    this.group = new THREE.Group(); world.cityGroup.add(this.group);
    this.delivered = 0; this.onDeliver = null; this.follow = null;

    // things a drone must fly over
    this.obstacles = city.buildings.map(b => ({ x0: b.box.x0, z0: b.box.z0, x1: b.box.x1, z1: b.box.z1, top: b.h }));
    if (city.cyber) {
      for (const b of city.beams) this.obstacles.push({ x0: Math.min(b.a[0], b.b[0]) - 1.5, x1: Math.max(b.a[0], b.b[0]) + 1.5, z0: Math.min(b.a[2], b.b[2]) - 1.5, z1: Math.max(b.a[2], b.b[2]) + 1.5, top: b.a[1] + b.h });
      for (const d of city.decks) this.obstacles.push(d.ax === 'x' ? { x0: d.line - 3, x1: d.line + 3, z0: d.s0, z1: d.s1, top: d.y + 1.5 } : { x0: d.s0, x1: d.s1, z0: d.line - 3, z1: d.line + 3, top: d.y + 1.5 });
      const p = city.rail.pts;
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; this.obstacles.push({ x0: Math.min(a[0], b[0]) - 3, x1: Math.max(a[0], b[0]) + 3, z0: Math.min(a[1], b[1]) - 3, z1: Math.max(a[1], b[1]) + 3, top: city.rail.y + 2 }); }
    }
    this.targets = city.buildings.filter(b => !b.depot);
    // how far each block's buildings (pods and all) stick out, so drop points stay clear of them
    this.ext = new Map();
    for (const b of city.buildings) {
      const k = blockOf((b.box.x0 + b.box.x1) / 2, (b.box.z0 + b.box.z1) / 2).join(','), e = this.ext.get(k);
      if (!e) this.ext.set(k, { ...b.box }); else { e.x0 = Math.min(e.x0, b.box.x0); e.z0 = Math.min(e.z0, b.box.z0); e.x1 = Math.max(e.x1, b.box.x1); e.z1 = Math.max(e.z1, b.box.z1); }
    }

    this.drones = [];
    let id = 0;
    city.depots.forEach(dep => dep.slots.forEach((slot, k) => {
      id++;
      this.drones.push({ id, name: `D-${String(id).padStart(2, '0')}`, depot: dep, slot, pos: new THREE.Vector3(...slot),
        yaw: r() * 6.28, goalYaw: 0, pitch: 0, state: 'wait', wait: 1 + r() * 4 + k * 0.7, carrying: true, legs: [], leg: 0, trips: 0 });
    }));

    this.buildMeshes();
    this.parcels = [];
  }

  buildMeshes() {
    const neon = this.cyber, n = this.drones.length;
    const mats = neon ? {
      frame: new THREE.MeshStandardMaterial({ color: 0x3a4560, metalness: 0.5, roughness: 0.3, emissive: 0x16324a, emissiveIntensity: 0.8 }),
      rotor: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.8, 2.2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      parcel: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 0.95, 0.25) }),
      light: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 1.9) }),
    } : {
      frame: gloss(0xf6f8fb),
      rotor: new THREE.MeshBasicMaterial({ color: 0x1c2c44, transparent: true, opacity: 0.16, depthWrite: false }),
      parcel: gloss(0xd4500f),
      light: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 1.1, 0.45) }),
    };
    this.mats = mats;
    const arm = (a) => { const g = new THREE.BoxGeometry(2.0, 0.09, 0.14); g.rotateY(a); g.translate(0, 0.1, 0); return prep(g); };
    const motors = [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    const frame = mergeGeometries([
      prep(new RoundedBoxGeometry(0.9, 0.3, 0.9, 2, 0.12)), arm(Math.PI / 4), arm(-Math.PI / 4),
      ...motors.map(([x, z]) => { const g = new THREE.CylinderGeometry(0.13, 0.13, 0.24, 10); g.translate(x, 0.16, z); return prep(g); }),
      ...[[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]].map(([x, z]) => { const g = new THREE.BoxGeometry(0.05, 0.36, 0.05); g.translate(x, -0.3, z); return prep(g); }),
    ]);
    const rotors = mergeGeometries(motors.map(([x, z]) => { const g = new THREE.CylinderGeometry(0.46, 0.46, 0.02, 20); g.translate(x, 0.29, z); return prep(g); }));
    const parcel = new RoundedBoxGeometry(0.62, 0.5, 0.62, 1, 0.05);
    const carried = parcel.clone(); carried.translate(0, -0.55, 0);
    const light = new THREE.SphereGeometry(0.12, 10, 8); light.translate(0, 0.05, -0.5);
    const inst = (geo, mat, count) => { const m = new THREE.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); return m; };
    this.frameMesh = inst(frame, mats.frame, n); this.frameMesh.castShadow = true;
    this.rotorMesh = inst(rotors, mats.rotor, n);
    this.carryMesh = inst(carried, mats.parcel, n); this.carryMesh.castShadow = true;
    this.lightMesh = inst(light, mats.light, n);
    const dropped = parcel.clone(); dropped.translate(0, 0.25, 0);
    this.parcelMesh = inst(dropped, mats.parcel, MAX_PARCELS); this.parcelMesh.castShadow = true; this.parcelMesh.count = 0;

    // route preview for the followed drone
    this.route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: neon ? 0x3df2ff : 0xd4500f, dashSize: 1.4, gapSize: 0.9, transparent: true, opacity: 0.9, depthTest: false }));
    this.route.renderOrder = 6; this.route.frustumCulled = false; this.route.visible = false;
    const ring = new THREE.RingGeometry(1.2, 1.6, 32); ring.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: neon ? new THREE.Color(0.4, 2.2, 2.8) : 0xd4500f, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    this.marker.renderOrder = 6; this.marker.visible = false;
    this.group.add(this.route, this.marker);
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
    this.tmpS = new THREE.Vector3(SCALE, SCALE, SCALE); this.tmpV = new THREE.Vector3(); this.zero = new THREE.Vector3(0, 0, 0); this.tmpS2 = new THREE.Vector3();
  }

  /* ---------- planning a trip ---------- */
  clearance(ax, az, bx, bz) {
    let top = 0;
    for (const o of this.obstacles) if (o.top > top && segHitsRect(ax, az, bx, bz, o.x0 - 1.4, o.z0 - 1.4, o.x1 + 1.4, o.z1 + 1.4)) top = o.top;
    return top + 6;
  }

  // Pick the flight path with the lowest safe height: straight, an L along the grid, or a dogleg
  // to either side. This lets drones go round a supertall tower instead of over it.
  planRoute(sx, sz, dx, dz) {
    const len = Math.hypot(dx - sx, dz - sz) || 1, nx = -(dz - sz) / len, nz = (dx - sx) / len, mx = (sx + dx) / 2, mz = (sz + dz) / 2;
    const cands = [[], [[dx, sz]], [[sx, dz]]];
    for (const o of [45, -45, 90, -90]) cands.push([[mx + nx * o, mz + nz * o]]);
    let best = null;
    for (const via of cands) {
      const pts = [[sx, sz], ...via, [dx, dz]];
      let y = 0, dist = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        y = Math.max(y, this.clearance(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
        dist += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
      }
      y = Math.max(26, y);
      const cost = y * 4 + dist; // climbing is dear, a detour is cheap
      if (!best || cost < best.cost) best = { via, y, cost };
    }
    return best;
  }

  dropPoint(b) {
    const cx = (b.box.x0 + b.box.x1) / 2, cz = (b.box.z0 + b.box.z1) / 2, [i, j] = blockOf(cx, cz), B = blockRect(i, j);
    const cl = (v, a, c) => Math.max(a + 2, Math.min(c - 2, v));
    const e = this.ext.get(i + "," + j) || B, out = 1.7; // hover just beyond anything bolted to the walls, in the near lane
    const sides = [
      { gap: b.box.x0 - B.x0, x: Math.max(roadLine(i) - 1.6, Math.min(B.x0, e.x0) - out), z: cl(cz, B.z0, B.z1), ax: 'x', line: roadLine(i) },
      { gap: B.x1 - b.box.x1, x: Math.min(roadLine(i + 1) + 1.6, Math.max(B.x1, e.x1) + out), z: cl(cz, B.z0, B.z1), ax: 'x', line: roadLine(i + 1) },
      { gap: b.box.z0 - B.z0, x: cl(cx, B.x0, B.x1), z: Math.max(roadLine(j) - 1.6, Math.min(B.z0, e.z0) - out), ax: 'z', line: roadLine(j) },
      { gap: B.z1 - b.box.z1, x: cl(cx, B.x0, B.x1), z: Math.min(roadLine(j + 1) + 1.6, Math.max(B.z1, e.z1) + out), ax: 'z', line: roadLine(j + 1) },
    ].sort((a, c) => a.gap - c.gap);
    const decked = (s) => this.cyber && this.city.decks.some(d => d.ax === s.ax && d.line === s.line && (s.ax === 'x' ? s.z : s.x) > d.s0 - 2 && (s.ax === 'x' ? s.z : s.x) < d.s1 + 2);
    const s = sides.find(q => !decked(q)) || sides[0];
    return [s.x, s.z];
  }

  plan(d) {
    const r = this.r, [sx, sy, sz] = d.slot;
    let tgt = null, best = Infinity;
    for (let k = 0; k < 5; k++) { // of five random addresses, take the nearest: most trips are local
      const b = this.targets[Math.floor(r() * this.targets.length)];
      const dist = Math.hypot((b.box.x0 + b.box.x1) / 2 - sx, (b.box.z0 + b.box.z1) / 2 - sz);
      if (dist > 25 && dist < best) { best = dist; tgt = b; }
    }
    if (!tgt) { d.wait = 1; return; }
    const [dx, dz] = this.dropPoint(tgt), lane = 2.5 * (d.id % 6);
    const go = this.planRoute(sx, sz, dx, dz), home = this.planRoute(dx, dz, sx, sz);
    const out = go.y + lane, back = home.y + lane + 1.5; // homeward drones fly a little higher, so they never meet head on
    d.target = tgt; d.drop = [dx, dz];
    const toGo = `Flying to ${tgt.ref}`, toBase = `Returning to ${d.depot.ref}`;
    d.legs = [
      { kind: 'climb', to: [sx, out, sz], say: 'Taking off' },
      ...go.via.map(([x, z]) => ({ kind: 'cruise', to: [x, out, z], say: toGo })),
      { kind: 'cruise', to: [dx, out, dz], say: toGo },
      { kind: 'descend', to: [dx, 1.6, dz], say: 'Lowering to the kerb' },
      { kind: 'drop', time: 1.4, say: 'Leaving the package' },
      { kind: 'climb', to: [dx, back, dz], say: toBase },
      ...home.via.map(([x, z]) => ({ kind: 'cruise', to: [x, back, z], say: toBase })),
      { kind: 'cruise', to: [sx, back, sz], say: toBase },
      { kind: 'descend', to: [sx, sy, sz], say: 'Landing' },
    ];
    d.dropLeg = d.legs.findIndex(L => L.kind === 'drop');
    d.leg = 0; d.state = 'fly'; d.legT = 0;
    this.aimAt(d);
  }

  aimAt(d) { // face along the next horizontal leg
    for (let k = d.leg; k < d.legs.length; k++) {
      const L = d.legs[k]; if (L.kind !== 'cruise') continue;
      const dx = L.to[0] - d.pos.x, dz = L.to[2] - d.pos.z;
      if (Math.hypot(dx, dz) > 0.5) d.goalYaw = Math.atan2(-dx, -dz);
      return;
    }
  }

  /* ---------- per frame ---------- */
  step(d, dt) {
    if (d.state === 'wait') {
      d.wait -= dt; d.pitch *= 0.9;
      if (d.wait <= 0) this.plan(d);
      return;
    }
    const L = d.legs[d.leg];
    if (L.kind === 'drop') {
      d.legT += dt;
      if (d.carrying && d.legT > L.time * 0.4) {
        d.carrying = false; d.trips++; this.delivered++;
        if (this.parcels.length >= MAX_PARCELS) this.parcels.shift();
        this.parcels.push({ x: d.pos.x, y: d.pos.y - 0.55 * SCALE - 0.25, z: d.pos.z, vy: 0, life: 30, yaw: d.yaw });
        this.onDeliver && this.onDeliver(d);
      }
      if (d.legT >= L.time) this.next(d);
      return;
    }
    const v = this.tmpV.set(L.to[0] - d.pos.x, L.to[1] - d.pos.y, L.to[2] - d.pos.z), dist = v.length();
    const sp = Math.min(SPEED[L.kind], dist * 1.6 + 0.6);
    if (dist <= sp * dt || dist < 0.02) { d.pos.set(...L.to); this.next(d); return; }
    d.pos.addScaledVector(v.multiplyScalar(1 / dist), sp * dt);
    const tilt = L.kind === 'cruise' ? -0.28 * Math.min(1, sp / SPEED.cruise) : 0;
    d.pitch += (tilt - d.pitch) * Math.min(1, dt * 4);
  }

  next(d) {
    d.leg++; d.legT = 0;
    if (d.leg >= d.legs.length) { d.state = 'wait'; d.wait = 2 + this.r() * 5; d.carrying = true; return; }
    this.aimAt(d);
  }

  update(dt, t, calm) {
    if (!calm) for (const d of this.drones) { this.step(d, dt); d.yaw += angleTo(d.yaw, d.goalYaw) * Math.min(1, dt * 3); }
    const E = this.tmpE, Q = this.tmpQ, M = this.tmpM;
    this.drones.forEach((d, i) => {
      const bob = d.state === 'wait' ? 0 : Math.sin(t * 3 + d.id) * 0.08;
      E.set(d.pitch, d.yaw, 0); Q.setFromEuler(E);
      M.compose(this.tmpV.set(d.pos.x, d.pos.y + 0.36 * SCALE + bob, d.pos.z), Q, this.tmpS);
      this.frameMesh.setMatrixAt(i, M); this.lightMesh.setMatrixAt(i, M);
      if (d.state === 'wait') M.compose(this.tmpV, Q, this.zero); // rotors stop while parked
      this.rotorMesh.setMatrixAt(i, M);
      M.compose(this.tmpV, Q, d.carrying ? this.tmpS : this.zero); this.carryMesh.setMatrixAt(i, M);
    });
    for (const m of [this.frameMesh, this.rotorMesh, this.carryMesh, this.lightMesh]) m.instanceMatrix.needsUpdate = true;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    if (this.cyber) this.mats.light.color.setRGB(2.4 * pulse + 0.4, 0.3, 1.9 * pulse + 0.3); else this.mats.light.color.setRGB(0.1, 0.6 + 0.6 * pulse, 0.3);

    // parcels fall, sit on the kerb for a while, then are collected
    this.parcels = this.parcels.filter(p => (p.life -= calm ? 0 : dt) > 0);
    this.parcels.forEach((p, i) => {
      if (p.y > 0.02) { p.vy -= 30 * dt; p.y = Math.max(0.02, p.y + p.vy * dt); }
      const s = Math.min(1, p.life) * SCALE;
      E.set(0, p.yaw, 0); Q.setFromEuler(E);
      M.compose(this.tmpV.set(p.x, p.y, p.z), Q, this.tmpS2.set(s, s, s)); this.parcelMesh.setMatrixAt(i, M);
    });
    this.parcelMesh.count = this.parcels.length; this.parcelMesh.instanceMatrix.needsUpdate = true;

    this.updateRoute();
  }

  /* ---------- following ---------- */
  updateRoute() {
    const d = this.follow;
    this.route.visible = this.marker.visible = !!(d && d.state === 'fly');
    if (!this.route.visible) return;
    const pts = [d.pos.clone()];
    for (let k = d.leg; k < d.legs.length; k++) if (d.legs[k].to) pts.push(new THREE.Vector3(...d.legs[k].to));
    this.route.geometry.dispose();
    this.route.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.route.computeLineDistances();
    const onWayOut = d.leg <= d.dropLeg;
    this.marker.visible = onWayOut;
    if (onWayOut) this.marker.position.set(d.drop[0], 0.08, d.drop[1]);
  }

  pickScreen(px, py) {
    let best = null, bd = 24 * 24;
    for (const d of this.drones) {
      const p = this.world.project(d.pos.x, d.pos.y + 0.5, d.pos.z);
      if (p.behind) continue;
      const q = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (q < bd) { bd = q; best = d; }
    }
    return best;
  }

  busiest() { // a drone that has just set off, so following it shows a whole trip
    const flying = this.drones.filter(d => d.state === 'fly' && d.leg <= 1);
    const pool = flying.length ? flying : this.drones;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  info(d) {
    let left = 0, p = d.pos.clone();
    if (d.state === 'fly') for (let k = d.leg; k < d.legs.length; k++) if (d.legs[k].to) { const q = new THREE.Vector3(...d.legs[k].to); left += p.distanceTo(q); p = q; }
    return {
      status: d.state === 'wait' ? `Loading a package at ${d.depot.ref}` : d.legs[d.leg].say,
      to: d.target && d.state === 'fly' && d.leg <= d.dropLeg ? d.target : null,
      left: Math.round(left * METRES), alt: Math.round(Math.max(0, d.pos.y - KERB) * METRES), trips: d.trips,
    };
  }
}
