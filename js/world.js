// 3D view of the city: white void, glossy white buildings with ink outlines and floor lines,
// a hatched river, and traffic moving on the roads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, HALF, PITCH, ROAD, BLOCK, RIVER_ROW, KERB, FLOOR, roadLine, blockRect, rng } from './city.js';

const THEMES = {
  light: { void: 0xeef2f6, grid: 0xc8d1dc, grid2: 0xdde3ea, ink: 0x1c2c44, inkOp: 0.3, floor: 0x1c2c44, floorOp: 0.065, accent: 0xd4500f,
    road: 0xe4e9f0, kerb: 0xfbfcfe, park: 0xd7eee0, sun: 1.45, hemi: 0.55, exposure: 1.05, beacon: 0.6, env: 1 },
  dark: { void: 0x0e1a2b, grid: 0x2a4060, grid2: 0x1a2b43, ink: 0x0a1424, inkOp: 0.55, floor: 0xffc27a, floorOp: 0.75, accent: 0xff8d42,
    road: 0x22344c, kerb: 0x9fb0c4, park: 0x5d8a74, sun: 0.35, hemi: 0.3, exposure: 0.95, beacon: 2.2, env: 0.22 },
};

const gloss = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, ...o });

// Keep only position and normal, non-indexed, so every piece can be merged into one mesh.
function prep(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}

function prism(len, across, h) { // gable roof, ridge along x
  const a = across / 2, l = len / 2;
  const P = [
    [-l, 0, -a], [l, 0, -a], [l, h, 0], [-l, 0, -a], [l, h, 0], [-l, h, 0],   // north slope
    [-l, 0, a], [-l, h, 0], [l, h, 0], [-l, 0, a], [l, h, 0], [l, 0, a],      // south slope
    [-l, 0, -a], [-l, h, 0], [-l, 0, a], [l, 0, -a], [l, 0, a], [l, h, 0],    // gable ends
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.computeVertexNormals();
  return g;
}

export class World {
  constructor(el, settings) {
    this.el = el; this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 2400);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x9aa8ba, 0.55);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sun.castShadow = true; const ms = Math.min(4096, this.renderer.capabilities.maxTextureSize); this.sun.shadow.mapSize.set(ms, ms);
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.mats = {
      white: gloss(0xf6f8fb), glass: gloss(0xbcd8f2, { roughness: 0.06, metalness: 0.15 }),
      steel: gloss(0xd5dce6, { metalness: 0.3, roughness: 0.3 }), accent: gloss(0xd4500f),
      beacon: new THREE.MeshStandardMaterial({ color: 0xd4500f, emissive: 0xff6a1f, emissiveIntensity: 0.6, roughness: 0.3 }),
      tree: gloss(0xb3dfc5), trunk: gloss(0xb9c3cf), road: gloss(0xe4e9f0, { clearcoat: 0.3, roughness: 0.6 }),
      kerb: gloss(0xfbfcfe), park: gloss(0xd7eee0), water: gloss(0x9cc6ee, { transparent: true, opacity: 0.75, roughness: 0.03 }),
      car: gloss(0xffffff),
    };
    this.edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.3 });
    this.floorMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.1 });
    this.markMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 });
    this.selMat = new THREE.LineBasicMaterial({ color: 0xd4500f, transparent: true, opacity: 0.95, depthTest: false });
    this.hovMat = new THREE.LineBasicMaterial({ color: 0xd4500f, transparent: true, opacity: 0.45, depthTest: false });

    this.cityGroup = new THREE.Group(); this.scene.add(this.cityGroup);
    const unit = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selBox = new THREE.LineSegments(unit, this.selMat); this.selBox.renderOrder = 5;
    this.hovBox = new THREE.LineSegments(unit, this.hovMat); this.hovBox.renderOrder = 5;
    this.dim = new THREE.LineSegments(new THREE.BufferGeometry(), this.selMat); this.dim.renderOrder = 5;
    this.scene.add(this.selBox, this.hovBox, this.dim);
    this.ray = new THREE.Raycaster(); this.tmpV = new THREE.Vector3(); this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.one = new THREE.Vector3(1, 1, 1);
    this.selId = null;

    this.setTheme(settings.dark);
    this.resize(); new ResizeObserver(() => this.resize()).observe(el);
  }

  setTheme(dark) {
    const t = THEMES[dark ? 'dark' : 'light']; this.t = t;
    this.scene.background = new THREE.Color(t.void);
    this.scene.fog = new THREE.Fog(t.void, 300, 900);
    this.edgeMat.color.set(t.ink); this.edgeMat.opacity = t.inkOp;
    this.markMat.color.set(dark ? 0x9fb3cc : t.ink); this.markMat.opacity = dark ? 0.35 : 0.3;
    this.floorMat.color.set(t.floor); this.floorMat.opacity = t.floorOp;
    this.selMat.color.set(t.accent); this.hovMat.color.set(t.accent);
    this.mats.road.color.set(t.road); this.mats.kerb.color.set(t.kerb); this.mats.park.color.set(t.park);
    this.mats.beacon.emissiveIntensity = t.beacon;
    for (const k in this.mats) this.mats[k].envMapIntensity = t.env;
    this.sun.intensity = t.sun; this.hemi.intensity = t.hemi;
    this.renderer.toneMappingExposure = t.exposure;
    if (this.grid) this.scene.remove(this.grid);
    this.grid = new THREE.GridHelper(2400, 400, t.grid, t.grid2); this.grid.position.y = -11.98;
    this.grid.material.transparent = true; this.grid.material.opacity = 0.8;
    this.scene.add(this.grid);
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }

  /* ---------- building the scene ---------- */
  build(city) {
    this.city = city;
    for (const o of [...this.cityGroup.children]) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
    this.cityGroup.clear();
    this.spinners = [];
    const geos = {}, edges = [], floors = [], marks = [];
    const put = (m, g) => (geos[m] || (geos[m] = [])).push(prep(g));
    const seg = (arr, a, b) => arr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const boxEdges = (arr, x0, y0, z0, x1, y1, z1) => {
      const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(arr, c[a], c[b]);
    };
    const circle = (arr, x, y, z, r, n = 24) => {
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, b = (k + 1) / n * Math.PI * 2;
        seg(arr, [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(b) * r, y, z + Math.sin(b) * r]);
      }
    };
    const loop = (arr, x0, z0, x1, z1, y) => { seg(arr, [x0, y, z0], [x1, y, z0]); seg(arr, [x1, y, z0], [x1, y, z1]); seg(arr, [x1, y, z1], [x0, y, z1]); seg(arr, [x0, y, z1], [x0, y, z0]); };

    /* ground: one road-coloured slab, pavement plates per block, river, bridges */
    const E = HALF + ROAD / 2 + 10, slabH = 4;
    const shape = new THREE.Shape(), rr = 6;
    shape.moveTo(-E + rr, -E); shape.lineTo(E - rr, -E); shape.quadraticCurveTo(E, -E, E, -E + rr); shape.lineTo(E, E - rr);
    shape.quadraticCurveTo(E, E, E - rr, E); shape.lineTo(-E + rr, E); shape.quadraticCurveTo(-E, E, -E, E - rr); shape.lineTo(-E, -E + rr); shape.quadraticCurveTo(-E, -E, -E + rr, -E);
    const slab = new THREE.ExtrudeGeometry(shape, { depth: slabH, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 8 });
    slab.rotateX(-Math.PI / 2); slab.translate(0, -slabH - 0.5, 0);
    const slabMesh = new THREE.Mesh(slab, this.mats.road); slabMesh.receiveShadow = true; this.cityGroup.add(slabMesh);
    loop(edges, -E, -E, E, E, 0.01);

    const rz0 = blockRect(0, RIVER_ROW).z0 - 1, rz1 = rz0 + BLOCK + 2;
    this.river = { z0: rz0, z1: rz1 };
    const kerbGeos = [], parkGeos = [];
    for (const b of city.blocks) {
      if (b.kind === 'river') continue;
      const g = new THREE.BoxGeometry(BLOCK, KERB, BLOCK); g.translate(b.cx, KERB / 2, b.cz);
      (b.kind === 'park' ? parkGeos : kerbGeos).push(prep(g));
      boxEdges(edges, b.x0, 0, b.z0, b.x1, KERB, b.z1);
      if (b.kind === 'park') { // paths as a thin cross
        seg(marks, [b.cx, KERB + 0.02, b.z0 + 1], [b.cx, KERB + 0.02, b.z1 - 1]);
        seg(marks, [b.x0 + 1, KERB + 0.02, b.cz], [b.x1 - 1, KERB + 0.02, b.cz]);
      }
      if (b.kind === 'civic') { circle(marks, b.cx, KERB + 0.02, b.cz, 13.2, 48); loop(marks, b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, KERB + 0.02); }
    }
    for (const p of city.ponds) {
      const g = new THREE.CylinderGeometry(p.r, p.r, 0.1, 40); g.translate(p.x, KERB + 0.06, p.z);
      put('water', g); circle(edges, p.x, KERB + 0.12, p.z, p.r, 40);
    }
    put('kerb', kerbGeos.length ? mergeGeometries(kerbGeos) : new THREE.BufferGeometry());
    if (parkGeos.length) put('park', mergeGeometries(parkGeos));

    // river: water band with 45° hatching, the drafting sign for water
    const W = E - 0.5;
    const wg = new THREE.BoxGeometry(W * 2, 0.2, rz1 - rz0); wg.translate(0, 0.02, (rz0 + rz1) / 2); put('water', wg);
    seg(edges, [-W, 0.13, rz0], [W, 0.13, rz0]); seg(edges, [-W, 0.13, rz1], [W, 0.13, rz1]);
    for (let c = -W - (rz1 - rz0); c < W; c += 3.2) {
      let x0 = c, z0 = rz0, x1 = c + (rz1 - rz0), z1 = rz1;
      if (x0 < -W) { z0 += -W - x0; x0 = -W; }
      if (x1 > W) { z1 -= x1 - W; x1 = W; }
      if (x1 > x0) seg(marks, [x0, 0.14, z0], [x1, 0.14, z1]);
    }
    // bridges carry the north-south roads over the river
    for (let k = 0; k <= N; k++) {
      const x = roadLine(k), g = new THREE.BoxGeometry(ROAD + 1.2, 0.6, rz1 - rz0 + 2);
      g.translate(x, 0.3, (rz0 + rz1) / 2); put('kerb', g);
      boxEdges(edges, x - ROAD / 2 - 0.6, 0, rz0 - 1, x + ROAD / 2 + 0.6, 0.6, rz1 + 1);
      for (const s of [-1, 1]) {
        const rx = x + s * (ROAD / 2 + 0.35);
        seg(edges, [rx, 1.5, rz0 - 1], [rx, 1.5, rz1 + 1]);
        for (let z = rz0 - 1; z <= rz1 + 1.01; z += 2) seg(marks, [rx, 0.6, z], [rx, 1.5, z]);
      }
    }
    // dashed centre lines
    for (let k = 0; k <= N; k++) {
      const c = roadLine(k);
      for (let s = -HALF; s < HALF; s += 4) {
        const inX = ((s + HALF) % PITCH);
        if (inX < ROAD / 2 + 1 || inX > PITCH - ROAD / 2 - 1) continue; // keep junctions clear
        const zOnBridge = s + 1 > rz0 - 1 && s < rz1 + 1;
        seg(marks, [c, zOnBridge ? 0.62 : 0.02, s], [c, zOnBridge ? 0.62 : 0.02, s + 2]);
        seg(marks, [s, 0.02, c], [s + 2, 0.02, c]);
      }
    }

    /* buildings */
    for (const bd of city.buildings) {
      for (const p of bd.parts) {
        if (p.s === 'box') {
          const big = p.w > 2.5 && p.d > 2.5 && p.h > 1.2;
          const g = big ? new RoundedBoxGeometry(p.w, p.h, p.d, 2, 0.14) : new THREE.BoxGeometry(p.w, p.h, p.d);
          g.translate(p.x, p.y + p.h / 2, p.z); put(p.m, g);
          const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
          boxEdges(edges, x0, p.y, z0, x1, p.y + p.h, z1);
          if (p.fl) for (let y = p.y + FLOOR; y < p.y + p.h - 0.5; y += FLOOR) loop(floors, x0 - 0.03, z0 - 0.03, x1 + 0.03, z1 + 0.03, y);
        } else if (p.s === 'cyl') {
          const g = new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.h, p.seg || 24); g.translate(p.x, p.y + p.h / 2, p.z); put(p.m, g);
          if (p.r > 0.5) { const n = Math.min(40, p.seg || 24); circle(edges, p.x, p.y, p.z, p.r, n); circle(edges, p.x, p.y + p.h, p.z, p.r2 ?? p.r, n); }
          if (p.fl) for (let y = p.y + FLOOR; y < p.y + p.h - 0.5; y += FLOOR) circle(floors, p.x, y, p.z, p.r + 0.03, Math.min(40, p.seg || 24));
        } else if (p.s === 'dome') {
          const g = new THREE.SphereGeometry(p.r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.translate(p.x, p.y, p.z); put(p.m, g);
          circle(edges, p.x, p.y, p.z, p.r, 32);
        } else if (p.s === 'sph') {
          const g = new THREE.SphereGeometry(p.r, 16, 10); g.translate(p.x, p.y, p.z); put(p.m, g);
        } else if (p.s === 'gable') {
          const along = p.axis === 'x', len = along ? p.w : p.d, across = along ? p.d : p.w;
          const g = prism(len, across, p.h); if (!along) g.rotateY(Math.PI / 2); g.translate(p.x, p.y, p.z); put(p.m, g);
          const l = len / 2, a = across / 2, T = (u, v, y) => along ? [p.x + u, p.y + y, p.z + v] : [p.x + v, p.y + y, p.z + u];
          seg(edges, T(-l, 0, p.h), T(l, 0, p.h));
          for (const u of [-l, l]) { seg(edges, T(u, -a, 0), T(u, 0, p.h)); seg(edges, T(u, a, 0), T(u, 0, p.h)); }
          seg(edges, T(-l, -a, 0), T(l, -a, 0)); seg(edges, T(-l, a, 0), T(l, a, 0));
        } else if (p.s === 'ring') {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r, p.t, 10, 64), this.mats[p.m]);
          ring.position.set(p.x, p.y, p.z); ring.rotation.x = Math.PI / 2; ring.castShadow = true;
          ring.userData.speed = 0.3 + (bd.id % 5) * 0.08;
          this.cityGroup.add(ring); this.spinners.push(ring);
        }
      }
    }
    for (const m in geos) {
      const mesh = new THREE.Mesh(mergeGeometries(geos[m]), this.mats[m]);
      mesh.castShadow = !['kerb', 'park', 'water'].includes(m); mesh.receiveShadow = true;
      this.cityGroup.add(mesh);
    }
    const lines = (arr, mat) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(g, mat); l.frustumCulled = false; this.cityGroup.add(l);
    };
    lines(edges, this.edgeMat); lines(floors, this.floorMat); lines(marks, this.markMat);

    /* trees */
    const T = city.trees.length;
    const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10), this.mats.tree, T);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 6), this.mats.trunk, T);
    city.trees.forEach((t, i) => {
      this.tmpM.makeScale(t.s * 1.3, t.s * 1.3, t.s * 1.3).setPosition(t.x, KERB + t.s * 2.6, t.z); crowns.setMatrixAt(i, this.tmpM);
      this.tmpM.makeScale(t.s, t.s * 1.6, t.s).setPosition(t.x, KERB + t.s * 0.8, t.z); trunks.setMatrixAt(i, this.tmpM);
    });
    crowns.castShadow = trunks.castShadow = true; crowns.receiveShadow = true;
    this.cityGroup.add(crowns, trunks);

    /* traffic: cars keep to the right, each lane at its own steady speed */
    const r = rng(city.seed ^ 0x9e3779b9);
    this.cars = [];
    for (let k = 0; k <= N; k++) for (const ax of ['x', 'z']) for (const dir of [1, -1]) {
      const n = 6 + Math.floor(r() * 7), speed = 7 + r() * 6, off = r() * 2 * HALF;
      for (let c = 0; c < n; c++) this.cars.push({ ax, line: roadLine(k), dir, speed, s: ((c / n) * 2 * HALF + off + r() * 6) % (2 * HALF) - HALF });
    }
    const carGeo = new RoundedBoxGeometry(1.6, 0.7, 0.85, 2, 0.25); carGeo.translate(0, 0.35, 0);
    this.carMesh = new THREE.InstancedMesh(carGeo, this.mats.car, this.cars.length);
    this.carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.carMesh.castShadow = true; this.carMesh.frustumCulled = false;
    const palette = [0xffffff, 0xffffff, 0xffffff, 0xf2f5f9, 0xd4500f, 0x8fb8e6, 0xc9d2dd];
    const col = new THREE.Color();
    this.cars.forEach((c, i) => this.carMesh.setColorAt(i, col.set(palette[Math.floor(r() * palette.length)])));
    this.cityGroup.add(this.carMesh);

    /* survey drones circling the tall towers */
    const tall = [...city.buildings].sort((a, b) => b.h - a.h).slice(0, 10);
    this.drones = tall.flatMap((b, i) => [0, 1].map(k => ({ x: (b.box.x0 + b.box.x1) / 2, z: (b.box.z0 + b.box.z1) / 2,
      y: b.h * (0.55 + k * 0.3), rad: Math.max(b.box.x1 - b.box.x0, b.box.z1 - b.box.z0) * 0.8 + 4, a: r() * 6.28, w: (0.25 + r() * 0.2) * (k ? -1 : 1) })));
    this.droneMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 12, 8), this.mats.beacon, this.drones.length);
    this.droneMesh.frustumCulled = false;
    this.cityGroup.add(this.droneMesh);

    this.boxes = city.buildings.map(b => new THREE.Box3(new THREE.Vector3(b.box.x0, 0, b.box.z0), new THREE.Vector3(b.box.x1, b.box.y1, b.box.z1)));
    this.select(null); this.hover(null);
  }

  /* ---------- selection ---------- */
  fitBox(obj, i) {
    if (i == null) { obj.visible = false; return; }
    const b = this.boxes[i], pad = 0.4;
    obj.visible = true;
    obj.scale.set(b.max.x - b.min.x + pad, b.max.y - b.min.y + pad, b.max.z - b.min.z + pad);
    obj.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  }
  hover(i) { this.fitBox(this.hovBox, i !== this.selId ? i : null); }
  select(i) {
    this.selId = i; this.fitBox(this.selBox, i);
    if (i == null) { this.dim.visible = false; this.dimAt = null; return; }
    // vertical dimension line beside the building, with ticks at both ends
    const b = this.boxes[i], x = b.max.x + 2.2, z = b.max.z + 2.2, top = b.max.y, a = [];
    const s = (p, q) => a.push(...p, ...q);
    s([x, KERB, z], [x, top, z]);
    for (const y of [KERB, top]) { s([x - 1, y, z], [x + 1, y, z]); s([x - 0.6, y - 0.6, z], [x + 0.6, y + 0.6, z]); s([b.max.x + 0.3, y, z], [x, y, z]); }
    this.dim.geometry.dispose(); this.dim.geometry = new THREE.BufferGeometry();
    this.dim.geometry.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    this.dim.visible = true; this.dimAt = { x, y: (KERB + top) / 2, z };
  }

  pick(cx, cy) {
    const r = this.el.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1), this.camera);
    let best = null, bd = Infinity;
    for (let i = 0; i < this.boxes.length; i++) {
      const hit = this.ray.ray.intersectBox(this.boxes[i], this.tmpV);
      if (hit) { const d = hit.distanceToSquared(this.ray.ray.origin); if (d < bd) { bd = d; best = i; } }
    }
    return best;
  }

  /* ---------- per frame ---------- */
  frame(dt, t, cam, calm) {
    // the sun and its shadow box follow the camera so shadows stay sharp at any zoom
    const tg = cam.target, ext = THREE.MathUtils.clamp(cam.dist * 0.9, 50, 330);
    this.sun.position.set(tg.x + 120, 220, tg.z + 90); this.sun.target.position.copy(tg);
    const sc = this.sun.shadow.camera;
    if (sc.right !== ext) { Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 10, far: 800 }); sc.updateProjectionMatrix(); }
    this.scene.fog.near = cam.dist * 1.5; this.scene.fog.far = cam.dist * 4.5 + 200;

    if (this.carMesh) {
      this.carMesh.visible = !calm;
      if (!calm) {
        const { z0, z1 } = this.river;
        this.cars.forEach((c, i) => {
          c.s += c.dir * c.speed * dt;
          if (c.s > HALF) c.s -= 2 * HALF; else if (c.s < -HALF) c.s += 2 * HALF;
          const lane = c.line + c.dir * 1.45 * (c.ax === 'x' ? -1 : 1);
          let x, z, y = 0.02, rot;
          if (c.ax === 'x') { x = lane; z = c.s; rot = Math.PI / 2; if (z > z0 - 1 && z < z1 + 1) y = 0.6; }
          else { x = c.s; z = lane; rot = 0; }
          this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
          this.tmpM.compose(this.tmpV.set(x, y, z), this.tmpQ, this.one);
          this.carMesh.setMatrixAt(i, this.tmpM);
        });
        this.carMesh.instanceMatrix.needsUpdate = true;
      }
      this.droneMesh.visible = !calm;
      if (!calm) {
        this.drones.forEach((d, i) => {
          d.a += d.w * dt;
          this.tmpM.makeTranslation(d.x + Math.cos(d.a) * d.rad, d.y + Math.sin(t * 0.7 + i) * 1.2, d.z + Math.sin(d.a) * d.rad);
          this.droneMesh.setMatrixAt(i, this.tmpM);
        });
        this.droneMesh.instanceMatrix.needsUpdate = true;
      }
      for (const s of this.spinners) if (!calm) s.rotation.z += dt * s.userData.speed;
      this.mats.beacon.emissiveIntensity = this.t.beacon * (0.55 + 0.45 * Math.max(0, Math.sin(t * 2.2)));
    }
    this.renderer.render(this.scene, this.camera);
  }

  project(x, y, z) {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    const r = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * r.clientWidth, y: (-v.y * 0.5 + 0.5) * r.clientHeight, behind: v.z > 1 };
  }
}
