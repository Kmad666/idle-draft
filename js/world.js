// 3D view: white void, glossy islands and buildings, links with moving packets.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GOODS, BUILDINGS, ISLANDS, CELL, OUT_CAP } from './data.js';
import { worldPos, outOf, needsOf } from './sim.js';

const THEMES = {
  light: { void: 0xeef2f6, grid: 0xc8d1dc, grid2: 0xdde3ea, ink: 0x1c2c44, accent: 0xd4500f, island: 0xfbfcfe, cellLine: 0xd3dbe5 },
  dark:  { void: 0x0e1a2b, grid: 0x2a4060, grid2: 0x1a2b43, ink: 0x9fb3cc, accent: 0xff8d42, island: 0xdfe7f1, cellLine: 0xb8c6d6 },
};

const gloss = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, ...o });
const rbox = (w, h, d, r = 0.25) => new RoundedBoxGeometry(w, h, d, 3, r);

export class World {
  constructor(el, state) {
    this.el = el; this.s = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 600);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa8ba, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(30, 60, 25); sun.target.position.set(22, 0, -4);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 50, bottom: -50, near: 1, far: 160 });
    sun.shadow.bias = -0.0004; sun.shadow.radius = 4;
    this.scene.add(sun, sun.target); this.sun = sun;

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.1 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -9; this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.mats = {
      white: gloss(0xf6f8fb), steel: gloss(0xc9d2dd, { metalness: 0.35, roughness: 0.3 }),
      dome: gloss(0xbfe0ff, { transparent: true, opacity: 0.55, roughness: 0.04 }),
      domeTech: gloss(0xc9f3ea, { transparent: true, opacity: 0.55, roughness: 0.04 }),
      good: {}, tube: {}, ghostOk: null, ghostBad: null,
    };
    for (const k in GOODS) {
      this.mats.good[k] = gloss(GOODS[k].color);
      this.mats.tube[k] = new THREE.MeshStandardMaterial({ color: GOODS[k].color, transparent: true, opacity: 0.5, roughness: 0.4 });
    }
    this.edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.28 });
    this.cellMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 });
    this.selMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    this.hovMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35 });

    this.islandGroup = new THREE.Group(); this.scene.add(this.islandGroup);
    this.bGroup = new THREE.Group(); this.scene.add(this.bGroup);
    this.lGroup = new THREE.Group(); this.scene.add(this.lGroup);
    this.meshes = new Map(); this.linkViz = new Map(); this.version = -1; this.islandKey = '';

    const pg = new THREE.SphereGeometry(0.22, 12, 8);
    this.packets = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ roughness: 0.25, emissive: 0xffffff, emissiveIntensity: 0.25 }), 900);
    this.packets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.packets.count = 0;
    this.packets.frustumCulled = false; this.scene.add(this.packets);
    this.tmpM = new THREE.Matrix4(); this.tmpC = new THREE.Color(); this.tmpV = new THREE.Vector3();
    this.bitsFlights = [];

    const ring = new THREE.RingGeometry(2.1, 2.45, 48); ring.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(ring, this.selMat); this.selRing.position.y = 0.04; this.selRing.visible = false;
    this.hovRing = new THREE.Mesh(ring, this.hovMat); this.hovRing.position.y = 0.035; this.hovRing.visible = false;
    this.scene.add(this.selRing, this.hovRing);
    this.ghost = null; this.ghostType = null;
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.setTheme(state.settings.dark);
    this.resize(); new ResizeObserver(() => this.resize()).observe(el);
  }

  setTheme(dark) {
    const t = THEMES[dark ? 'dark' : 'light']; this.t = t;
    this.scene.background = new THREE.Color(t.void);
    this.scene.fog = new THREE.Fog(t.void, 110, 260);
    this.edgeMat.color.set(t.ink); this.cellMat.color.set(t.cellLine);
    this.selMat.color.set(t.accent); this.hovMat.color.set(t.accent);
    if (this.grid) this.scene.remove(this.grid);
    this.grid = new THREE.GridHelper(600, 150, t.grid, t.grid2); this.grid.position.y = -8.98;
    this.grid.material.transparent = true; this.grid.material.opacity = 0.8;
    this.scene.add(this.grid);
    this.islandKey = ''; // rebuild islands with new colour
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }

  /* ---------- islands ---------- */
  buildIslands() {
    const key = JSON.stringify(this.s.islands);
    if (key === this.islandKey) return;
    this.islandKey = key;
    this.islandGroup.clear();
    for (const k in ISLANDS) {
      const I = ISLANDS[k], open = this.s.islands[k];
      const w = I.cols * CELL + 2, d = I.rows * CELL + 2, r = 2.2;
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -d / 2); sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
      sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); sh.lineTo(-w / 2 + r, d / 2);
      sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 4, curveSegments: 10 });
      geo.rotateX(-Math.PI / 2);
      const mat = gloss(this.t.island, open ? {} : { transparent: true, opacity: 0.35 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(I.cx, -2.55, I.cz); m.receiveShadow = true; m.castShadow = open;
      this.islandGroup.add(m);
      if (open) { // cell grid on top
        const pts = [], x0 = I.cx - I.cols * CELL / 2, z0 = I.cz - I.rows * CELL / 2;
        for (let c = 0; c <= I.cols; c++) pts.push(x0 + c * CELL, 0.02, z0, x0 + c * CELL, 0.02, z0 + I.rows * CELL);
        for (let r2 = 0; r2 <= I.rows; r2++) pts.push(x0, 0.02, z0 + r2 * CELL, x0 + I.cols * CELL, 0.02, z0 + r2 * CELL);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.islandGroup.add(new THREE.LineSegments(g, this.cellMat));
      }
    }
  }

  /* ---------- buildings ---------- */
  edged(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 35), this.edgeMat)); return mesh; }
  soft(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

  makeMesh(type, tier = 0) {
    const g = new THREE.Group(), M = this.mats, def = BUILDINGS[type];
    const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    if (type === 'core') {
      add(this.soft(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.6, 48), M.white)), 0, 0.3, 0);
      const ring = add(this.soft(new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 12, 64), M.steel)), 0, 1.9, 0);
      ring.rotation.x = Math.PI / 2; g.userData.spin = ring;
      const orb = add(this.soft(new THREE.Mesh(new THREE.SphereGeometry(1.35, 48, 32), gloss(GOODS.bits.color, { emissive: GOODS.bits.color, emissiveIntensity: 0.18 }))), 0, 2.2, 0);
      g.userData.orb = orb;
    } else if (type === 'pod') {
      add(this.soft(new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 0.55, 40), M.white)), 0, 0.28, 0);
      if (tier === 0) {
        add(this.soft(new THREE.Mesh(new THREE.SphereGeometry(1.35, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.dome)), 0, 0.55, 0);
        add(this.soft(new THREE.Mesh(rbox(0.7, 0.7, 0.7, 0.2), M.good.water)), -0.35, 0.95, 0.2);
        add(this.soft(new THREE.Mesh(rbox(0.55, 0.55, 0.55, 0.18), M.good.alloy)), 0.45, 0.85, -0.25);
      } else {
        add(this.soft(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1.3, 40), M.white)), 0, 1.2, 0);
        add(this.soft(new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.1, 10, 48), M.good.coolant)), 0, 1.6, 0).rotation.x = Math.PI / 2;
        add(this.soft(new THREE.Mesh(new THREE.SphereGeometry(1.15, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.domeTech)), 0, 1.85, 0);
        add(this.soft(new THREE.Mesh(rbox(0.5, 0.5, 0.5, 0.15), M.good.circuit)), 0, 2.2, 0);
      }
    } else if (def.kind === 'source') {
      add(this.edged(new THREE.Mesh(rbox(2.8, 0.5, 2.8, 0.2), M.white)), 0, 0.25, 0);
      add(this.soft(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 2.2, 32), M.white)), 0, 1.6, 0);
      add(this.soft(new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.35, 32), M.good[def.out])), 0, 2.85, 0);
      const ring = add(this.soft(new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.09, 10, 40), M.steel)), 0, 1.4, 0);
      ring.rotation.x = Math.PI / 2; g.userData.spin = ring;
    } else {
      add(this.edged(new THREE.Mesh(rbox(3, 1.3, 2.6, 0.3), M.white)), 0, 0.65, 0);
      add(this.edged(new THREE.Mesh(rbox(1.5, 1.0, 1.5, 0.25), M.good[def.out])), 0.45, 1.8, 0);
      add(this.soft(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.4, 16), M.steel)), -0.85, 1.9, -0.6);
      Object.keys(def.in).forEach((k, i, a) => add(this.soft(new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 10), M.good[k])), -1.0 + i * 0.6, 0.9, 1.32 - (a.length > 1 ? 0 : 0)));
    }
    return g;
  }

  syncBuildings() {
    const seen = new Set();
    for (const b of this.s.buildings) {
      seen.add(b.id);
      let m = this.meshes.get(b.id);
      const key = b.type + ':' + (b.tier || 0);
      if (m && m.userData.key !== key) { this.bGroup.remove(m); m = null; }
      if (!m) { m = this.makeMesh(b.type, b.tier || 0); m.userData.key = key; m.userData.id = b.id; this.bGroup.add(m); this.meshes.set(b.id, m); }
      const [x, z] = worldPos(b); m.position.set(x, 0, z);
    }
    for (const [id, m] of this.meshes) if (!seen.has(id)) { this.bGroup.remove(m); this.meshes.delete(id); }
  }

  /* ---------- links ---------- */
  syncLinks() {
    this.lGroup.clear();
    const old = this.linkViz; this.linkViz = new Map();
    const byId = new Map(this.s.buildings.map(b => [b.id, b]));
    for (const l of this.s.links) {
      const a = byId.get(l.from), b = byId.get(l.to); if (!a || !b) continue;
      const [ax, az] = worldPos(a), [bx, bz] = worldPos(b);
      let curve;
      if (a.island === b.island) {
        const y = 0.28, off = ((l.id % 5) - 2) * 0.18, mx = (ax + bx) / 2 + off;
        const pts = [new THREE.Vector3(ax, y, az), new THREE.Vector3(mx, y, az), new THREE.Vector3(mx, y, bz), new THREE.Vector3(bx, y, bz)];
        curve = new THREE.CurvePath();
        for (let i = 0; i < 3; i++) if (pts[i].distanceTo(pts[i + 1]) > 0.01) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
        if (!curve.curves.length) continue;
      } else {
        const mid = new THREE.Vector3((ax + bx) / 2, 9 + (l.id % 4) * 0.6, (az + bz) / 2);
        curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, 1.2, az), mid, new THREE.Vector3(bx, 1.2, bz));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, a.island === b.island ? 48 : 64, a.island === b.island ? 0.08 : 0.12, 6, false), this.mats.tube[l.good]);
      tube.userData.linkId = l.id;
      this.lGroup.add(tube);
      const prev = old.get(l.id);
      this.linkViz.set(l.id, { curve, len: curve.getLength(), ts: prev ? prev.ts : [], acc: prev ? prev.acc : Math.random(), tube });
    }
  }

  sync() {
    this.buildIslands();
    if (this.s.version !== this.version) { this.version = this.s.version; this.syncBuildings(); this.syncLinks(); }
  }

  /* ---------- per-frame ---------- */
  frame(dt, t, sel, hover, calm) {
    this.sync();
    const s = this.s, byId = new Map(s.buildings.map(b => [b.id, b]));
    const C = this.tmpC; let n = 0;
    const put = (p, col, scale = 1) => {
      if (n >= 900) return;
      this.tmpM.makeScale(scale, scale, scale).setPosition(p);
      this.packets.setMatrixAt(n, this.tmpM); this.packets.setColorAt(n, C.set(col)); n++;
    };
    const speed = (s.time < s.pulse.until ? 2 : 1) * 5;
    for (const l of s.links) {
      const v = this.linkViz.get(l.id); if (!v) continue;
      const col = GOODS[l.good].color;
      v.acc += (l.flow / 60) * dt * 1.5 * (s.time < s.pulse.until ? 2 : 1);
      while (v.acc >= 1 && v.ts.length < 40) { v.acc -= 1; v.ts.push(0); }
      if (v.acc > 1) v.acc = 1;
      const step = speed * dt / v.len;
      v.ts = v.ts.map(x => x + step).filter(x => x < 1);
      for (const x of v.ts) { const p = v.curve.getPointAt(x); p.y += 0.12; put(p, col); }
      if (l.jam) { // packets queuing at the far end
        const a = byId.get(l.from), q = Math.min(6, Math.ceil(a.out / OUT_CAP * 6));
        for (let i = 0; i < q; i++) { const p = v.curve.getPointAt(Math.max(0, 0.93 - i * 0.045)); p.y += 0.12; put(p, col, 1.1); }
      }
      v.tube.material.opacity = l.jam ? 0.85 : 0.5;
    }
    // Bits floating from houses to the Core
    const core = s.buildings.find(b => b.type === 'core');
    if (core && !calm) {
      const [cx, cz] = worldPos(core);
      for (const b of s.buildings) {
        if (b.type !== 'pod' || b.income < 0.5) continue;
        b._bitAcc = (b._bitAcc || 0) + dt * Math.min(2.5, b.income / 12);
        if (b._bitAcc >= 1) { b._bitAcc = 0; const [x, z] = worldPos(b); this.bitsFlights.push({ a: [x, z], t: 0, d: Math.hypot(x - cx, z - cz) + 1 }); }
      }
      this.bitsFlights = this.bitsFlights.filter(f => (f.t += dt * 8 / f.d) < 1).slice(-200);
      for (const f of this.bitsFlights) {
        const p = this.tmpV.set(f.a[0] + (cx - f.a[0]) * f.t, 2.4 + Math.sin(f.t * Math.PI) * 4, f.a[1] + (cz - f.a[1]) * f.t);
        put(p, GOODS.bits.color, 0.8);
      }
    }
    this.packets.count = n;
    this.packets.instanceMatrix.needsUpdate = true;
    if (this.packets.instanceColor) this.packets.instanceColor.needsUpdate = true;

    // animation
    for (const b of s.buildings) {
      const m = this.meshes.get(b.id); if (!m) continue;
      if (m.userData.spin && !calm) m.userData.spin.rotation.z += dt * (0.4 + (b.util || 0) * 2);
      if (m.userData.orb) { const k = 1 + Math.sin(t * (s.time < s.pulse.until ? 9 : 2)) * 0.04; m.userData.orb.scale.setScalar(k); }
    }
    const place = (ring, id) => { const b = id && byId.get(id); ring.visible = !!b; if (b) { const [x, z] = worldPos(b); ring.position.x = x; ring.position.z = z; } };
    place(this.selRing, sel); place(this.hovRing, hover !== sel ? hover : null);
    this.renderer.render(this.scene, this.camera);
  }

  /* ---------- picking ---------- */
  ndc(x, y) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1); }
  pickBuilding(x, y) {
    this.ray.setFromCamera(this.ndc(x, y), this.camera);
    const hit = this.ray.intersectObjects(this.bGroup.children, true).find(h => h.object.isMesh);
    let o = hit && hit.object; while (o && o.userData.id === undefined) o = o.parent;
    return o ? o.userData.id : null;
  }
  pickCell(x, y) {
    this.ray.setFromCamera(this.ndc(x, y), this.camera);
    const p = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    for (const k in ISLANDS) {
      const I = ISLANDS[k];
      const cx = Math.floor((p.x - (I.cx - I.cols * CELL / 2)) / CELL), cz = Math.floor((p.z - (I.cz - I.rows * CELL / 2)) / CELL);
      if (cx >= 0 && cz >= 0 && cx < I.cols && cz < I.rows) return { island: k, cx, cz };
    }
    return null;
  }

  setGhost(type, cell, ok) {
    if (this.ghostType !== type) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = null; this.ghostType = type;
      if (type) {
        this.ghost = this.makeMesh(type);
        this.ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; o.castShadow = false; } });
        this.scene.add(this.ghost);
      }
    }
    if (!this.ghost) return;
    this.ghost.visible = !!cell;
    if (cell) {
      const [x, z] = worldPos(cell); this.ghost.position.set(x, 0, z);
      this.ghost.traverse(o => { if (o.isMesh) o.material.emissive && o.material.emissive.set(ok ? 0x000000 : 0xaa1e1e); });
    }
  }

  project(x, y, z) {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    const r = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * r.clientWidth, y: (-v.y * 0.5 + 0.5) * r.clientHeight, behind: v.z > 1 };
  }
}
