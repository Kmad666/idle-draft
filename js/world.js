// 3D view of the city: white void, glossy white buildings with ink outlines and floor lines,
// a hatched river, and traffic moving on the roads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Deliveries } from './drones.js';
import { N, HALF, PITCH, ROAD, BLOCK, RIVER_ROW, KERB, FLOOR, roadLine, blockRect, rng, NEON_COLOURS } from './city.js';

const THEMES = {
  light: { void: 0xeef2f6, grid: 0xc8d1dc, grid2: 0xdde3ea, ink: 0x1c2c44, inkOp: 0.3, floor: 0x1c2c44, floorOp: 0.065, accent: 0xd4500f,
    road: 0xe4e9f0, kerb: 0xfbfcfe, park: 0xd7eee0, sun: 1.45, hemi: 0.55, exposure: 1.05, beacon: 0.6, env: 1 },
  dark: { void: 0x0e1a2b, grid: 0x2a4060, grid2: 0x1a2b43, ink: 0x0a1424, inkOp: 0.55, floor: 0xffc27a, floorOp: 0.75, accent: 0xff8d42,
    road: 0x22344c, kerb: 0x9fb0c4, park: 0x5d8a74, sun: 0.35, hemi: 0.3, exposure: 0.95, beacon: 2.2, env: 0.22 },
  neon: { void: 0x07050f, fog: 0x1b0c2e, grid: 0x6a2a8a, grid2: 0x241036, ink: 0x35d8ff, inkOp: 0.16, accent: 0xff3dbb,
    sun: 0.4, hemi: 0.4, exposure: 1.0, env: 0.15 },
};
const CHUNK = 4 * PITCH; // tile size for culling: 4×4 blocks, 16 tiles
const NEON = [[1, 0.17, 0.84], [0.17, 0.95, 1], [1, 0.69, 0.17], [0.49, 1, 0.35]]; // magenta, cyan, amber, lime

// Lit windows drawn in the shader from world position, so no textures or extra geometry are needed.
function windowMat(color, o) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough, metalness: o.metal });
  m.userData.u = { uTime: { value: 0 }, uDensity: { value: o.density }, uCool: { value: o.cool }, uGlow: { value: 0.95 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNorm;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; varying vec3 vWNorm; uniform float uTime, uDensity, uCool, uGlow;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 n = normalize(vWNorm);
        if (abs(n.y) < 0.5) {
          bool sx = abs(n.x) > abs(n.z);
          float u = sx ? vWPos.z : vWPos.x;
          float side = sx ? floor(vWPos.x * 0.25) * 7.0 + sign(n.x) * 3.0 : floor(vWPos.z * 0.25) * 13.0 + sign(n.z) * 5.0;
          vec2 g = vec2(u / 1.1, (vWPos.y - 0.3) / 1.4);
          vec2 c = floor(g), f = fract(g);
          float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.28, f.y) * step(f.y, 0.8);
          float h = h21(c + side * 1.37);
          float lit = step(uDensity, h);
          lit = abs(lit - step(0.996, h21(c * 0.7 + floor(uTime * 0.4 + h * 37.0))));
          vec3 warm = vec3(1.0, 0.66, 0.34), cool = vec3(0.45, 0.85, 1.0);
          vec3 col = h > 0.975 ? vec3(1.0, 0.2, 0.75) : mix(warm, cool, uCool > 0.5 ? step(0.25, fract(h * 9.1)) : step(0.8, fract(h * 9.1)));
          totalEmissiveRadiance += col * win * lit * uGlow * (0.45 + 0.55 * h21(c * 1.73 + side));
        }
      }`);
  };
  return m;
}

// Scrolling glyph textures for the holographic signs (made-up symbols, no real lettering).
function glyphTexture(rgb, tall, seed) {
  const r = rng(seed), W = tall ? 64 : 256, H = tall ? 256 : 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), col = `rgb(${rgb.map(v => Math.round(v * 255)).join(',')})`;
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(2, 2, W - 4, H - 4);
  g.fillStyle = col;
  const glyph = (x, y, s) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (r() < 0.45) g.fillRect(x + i * s / 4, y + j * s / 4, s / 4 - 1, s / 4 - 1); };
  if (tall) for (let y = 10; y < H - 30; y += 30) glyph(16, y, 32);
  else {
    for (let x = 12; x < W - 40; x += 34) glyph(x, 14, 28);
    g.fillRect(12, 56, W * (0.3 + r() * 0.5), 10);
    for (let x = 12; x < W - 22; x += 20) if (r() < 0.7) glyph(x, 80, 16);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

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
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); // the shadow box shrinks as you zoom in, so this stays sharp up close
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.draftMats = this.mats = {
      white: gloss(0xf6f8fb), glass: gloss(0xbcd8f2, { roughness: 0.06, metalness: 0.15 }),
      steel: gloss(0xd5dce6, { metalness: 0.3, roughness: 0.3 }), accent: gloss(0xd4500f),
      beacon: new THREE.MeshStandardMaterial({ color: 0xd4500f, emissive: 0xff6a1f, emissiveIntensity: 0.6, roughness: 0.3 }),
      tree: gloss(0xb3dfc5), trunk: gloss(0xb9c3cf), road: gloss(0xe4e9f0, { clearcoat: 0.3, roughness: 0.6 }),
      kerb: gloss(0xfbfcfe), park: gloss(0xd7eee0), water: gloss(0x9cc6ee, { transparent: true, opacity: 0.75, roughness: 0.03 }),
      car: gloss(0xffffff),
    };
    this.neonMats = {
      white: windowMat(0x262c3d, { rough: 0.55, metal: 0.3, density: 0.74, cool: 0 }),
      glass: windowMat(0x15233d, { rough: 0.14, metal: 0.7, density: 0.6, cool: 1 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x2a3142, metalness: 0.65, roughness: 0.35 }),
      accent: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.35, 1.9) }),
      beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.35) }),
      tree: new THREE.MeshStandardMaterial({ color: 0x14453c, emissive: 0x0b3b33, emissiveIntensity: 0.6, roughness: 0.5 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x232a38 }),
      road: new THREE.MeshPhysicalMaterial({ color: 0x07090f, roughness: 0.16, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05 }),
      kerb: new THREE.MeshStandardMaterial({ color: 0x141927, roughness: 0.6, metalness: 0.2 }),
      park: new THREE.MeshStandardMaterial({ color: 0x0c201d, roughness: 0.8 }),
      water: new THREE.MeshPhysicalMaterial({ color: 0x06142a, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.92 }),
      car: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      deck: new THREE.MeshStandardMaterial({ color: 0x1b2131, metalness: 0.5, roughness: 0.4 }),
      train: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.7, 2.2) }),
    };
    // One material per sign kind; each sign carries its colour in its vertices, so a tile needs 3 draw calls, not 12.
    this.signMats = {
      solid: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.7, 1.7), vertexColors: true, side: THREE.DoubleSide }),
      strip: new THREE.MeshBasicMaterial({ map: glyphTexture([1, 1, 1], true, 99), vertexColors: true, color: new THREE.Color(1.2, 1.2, 1.2), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      board: new THREE.MeshBasicMaterial({ map: glyphTexture([1, 1, 1], false, 102), vertexColors: true, color: new THREE.Color(1.2, 1.2, 1.2), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    this.glowMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.4, 2.2, 2.8), transparent: true, opacity: 0.9 });
    this.glowMat2 = new THREE.LineBasicMaterial({ color: new THREE.Color(2.6, 0.4, 2.0), transparent: true, opacity: 0.9 });
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

    this.setTheme(settings.theme);
    this.resize(); new ResizeObserver(() => this.resize()).observe(el);
  }

  setTheme(theme) {
    const neon = theme === 'neon', dark = theme === 'night';
    this.neon = neon;
    const t = THEMES[neon ? 'neon' : dark ? 'dark' : 'light']; this.t = t;
    this.scene.background = new THREE.Color(t.void);
    this.scene.fog = neon ? new THREE.FogExp2(t.fog, 0.002) : new THREE.Fog(t.void, 300, 900);
    this.edgeMat.color.set(t.ink); this.edgeMat.opacity = t.inkOp;
    this.markMat.color.set(neon ? 0xffb02b : dark ? 0x9fb3cc : t.ink); this.markMat.opacity = neon ? 0.35 : dark ? 0.35 : 0.3;
    this.floorMat.visible = !neon;
    if (!neon) {
      this.floorMat.color.set(t.floor); this.floorMat.opacity = t.floorOp;
      const D = this.draftMats;
      D.road.color.set(t.road); D.kerb.color.set(t.kerb); D.park.color.set(t.park);
      D.beacon.emissiveIntensity = t.beacon;
    }
    this.selMat.color.set(t.accent); this.hovMat.color.set(t.accent);
    for (const set of [this.draftMats, this.neonMats]) for (const k in set) set[k].envMapIntensity = t.env;
    this.sun.intensity = t.sun; this.hemi.intensity = t.hemi;
    this.hemi.color.set(neon ? 0x8a6cff : 0xffffff); this.hemi.groundColor.set(neon ? 0x1a0f2a : 0x9aa8ba);
    this.sun.color.set(neon ? 0x7fa8ff : 0xffffff);
    if (neon && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.4, 0.9);
      this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
      this.resize();
    }
    this.renderer.toneMappingExposure = t.exposure;
    if (this.grid) this.scene.remove(this.grid);
    this.grid = new THREE.GridHelper(2400, 400, t.grid, t.grid2); this.grid.position.y = -11.98;
    this.grid.material.transparent = true; this.grid.material.opacity = 0.8;
    this.scene.add(this.grid);
  }

  setPixelRatio(pr) { this.renderer.setPixelRatio(pr); this.resize(); }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  }

  /* ---------- building the scene ---------- */
  build(city) {
    this.city = city;
    for (const o of [...this.cityGroup.children]) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
    this.cityGroup.clear();
    this.spinners = []; this.cyber = null;
    const M = city.cyber ? this.neonMats : this.draftMats; this.mats = M;
    // The city is cut into tiles of 4×4 blocks. Each tile is its own set of meshes, so the renderer
    // can skip tiles that are off screen or past the fog, and the shadow pass only draws nearby ones.
    const chunks = new Map();
    let geos, edges, floors, marks;
    const at = (x, z) => {
      const key = x === null ? 'all' : Math.floor((x + HALF) / CHUNK) + ',' + Math.floor((z + HALF) / CHUNK);
      let c = chunks.get(key);
      if (!c) chunks.set(key, c = { geos: {}, edges: [], floors: [], marks: [] });
      ({ geos, edges, floors, marks } = c);
    };
    at(null, null);
    this.at = at; this.chunkOf = (x, z) => Math.floor((x + HALF) / CHUNK) + ',' + Math.floor((z + HALF) / CHUNK);
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
    for (const b of city.blocks) {
      if (b.kind === 'river') continue;
      at(b.cx, b.cz);
      const g = new THREE.BoxGeometry(BLOCK, KERB, BLOCK); g.translate(b.cx, KERB / 2, b.cz);
      put(b.kind === 'park' ? 'park' : 'kerb', g);
      boxEdges(edges, b.x0, 0, b.z0, b.x1, KERB, b.z1);
      if (b.kind === 'park') { // paths as a thin cross
        seg(marks, [b.cx, KERB + 0.02, b.z0 + 1], [b.cx, KERB + 0.02, b.z1 - 1]);
        seg(marks, [b.x0 + 1, KERB + 0.02, b.cz], [b.x1 - 1, KERB + 0.02, b.cz]);
      }
      if (b.kind === 'civic') { circle(marks, b.cx, KERB + 0.02, b.cz, 13.2, 48); loop(marks, b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, KERB + 0.02); }
    }
    for (const p of city.ponds) {
      at(p.x, p.z);
      const g = new THREE.CylinderGeometry(p.r, p.r, 0.1, 40); g.translate(p.x, KERB + 0.06, p.z);
      put('water', g); circle(edges, p.x, KERB + 0.12, p.z, p.r, 40);
    }
    at(null, null);

    // river: water band with 45° hatching, the drafting sign for water
    const W = E - 0.5;
    const wg = new THREE.BoxGeometry(W * 2, 0.2, rz1 - rz0); wg.translate(0, 0.02, (rz0 + rz1) / 2); put('water', wg);
    seg(edges, [-W, 0.13, rz0], [W, 0.13, rz0]); seg(edges, [-W, 0.13, rz1], [W, 0.13, rz1]);
    for (let c = -W - (rz1 - rz0); c < W; c += 3.2) {
      let x0 = c, z0 = rz0, x1 = c + (rz1 - rz0), z1 = rz1;
      if (x0 < -W) { z0 += -W - x0; x0 = -W; }
      if (x1 > W) { z1 -= x1 - W; x1 = W; }
      if (x1 > x0) { at((x0 + x1) / 2, (z0 + z1) / 2); seg(marks, [x0, 0.14, z0], [x1, 0.14, z1]); }
    }
    // bridges carry the north-south roads over the river
    for (let k = 0; k <= N; k++) {
      const x = roadLine(k), g = new THREE.BoxGeometry(ROAD + 1.2, 0.6, rz1 - rz0 + 2);
      at(x, (rz0 + rz1) / 2);
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
        at(c, s); seg(marks, [c, zOnBridge ? 0.62 : 0.02, s], [c, zOnBridge ? 0.62 : 0.02, s + 2]);
        at(s, c); seg(marks, [s, 0.02, c], [s + 2, 0.02, c]);
      }
    }

    /* buildings */
    for (const bd of city.buildings) {
      at((bd.box.x0 + bd.box.x1) / 2, (bd.box.z0 + bd.box.z1) / 2);
      for (const p of bd.parts) {
        if (p.s === 'box') {
          const big = p.w > 2.5 && p.d > 2.5 && p.h > 1.2;
          const g = big ? new RoundedBoxGeometry(p.w, p.h, p.d, 1, 0.14) : new THREE.BoxGeometry(p.w, p.h, p.d);
          g.translate(p.x, p.y + p.h / 2, p.z); put(p.m, g);
          const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
          boxEdges(edges, x0, p.y, z0, x1, p.y + p.h, z1);
          if (p.fl && !city.cyber) for (let y = p.y + FLOOR; y < p.y + p.h - 0.5; y += FLOOR) loop(floors, x0 - 0.03, z0 - 0.03, x1 + 0.03, z1 + 0.03, y);
        } else if (p.s === 'cyl') {
          const g = new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.h, p.seg || 24); g.translate(p.x, p.y + p.h / 2, p.z); put(p.m, g);
          if (p.r > 0.5) { const n = Math.min(40, p.seg || 24); circle(edges, p.x, p.y, p.z, p.r, n); circle(edges, p.x, p.y + p.h, p.z, p.r2 ?? p.r, n); }
          if (p.fl && !city.cyber) for (let y = p.y + FLOOR; y < p.y + p.h - 0.5; y += FLOOR) circle(floors, p.x, y, p.z, p.r + 0.03, Math.min(40, p.seg || 24));
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
    const lines = (arr, mat) => {
      if (!arr.length) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      this.cityGroup.add(new THREE.LineSegments(g, mat));
    };
    for (const c of chunks.values()) {
      for (const m in c.geos) {
        const mesh = new THREE.Mesh(mergeGeometries(c.geos[m]), this.mats[m]);
        mesh.castShadow = !['kerb', 'park', 'water'].includes(m); mesh.receiveShadow = true;
        this.cityGroup.add(mesh);
      }
      lines(c.edges, this.edgeMat); lines(c.floors, this.floorMat); lines(c.marks, this.markMat);
    }
    this.chunkCount = chunks.size;

    /* trees */
    const crownGeo = new THREE.SphereGeometry(1, 12, 8), trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 6);
    const byChunk = new Map();
    for (const t of city.trees) { const k = this.chunkOf(t.x, t.z); (byChunk.get(k) || byChunk.set(k, []).get(k)).push(t); }
    for (const list of byChunk.values()) {
      const crowns = new THREE.InstancedMesh(crownGeo, this.mats.tree, list.length), trunks = new THREE.InstancedMesh(trunkGeo, this.mats.trunk, list.length);
      list.forEach((t, i) => {
        this.tmpM.makeScale(t.s * 1.3, t.s * 1.3, t.s * 1.3).setPosition(t.x, KERB + t.s * 2.6, t.z); crowns.setMatrixAt(i, this.tmpM);
        this.tmpM.makeScale(t.s, t.s * 1.6, t.s).setPosition(t.x, KERB + t.s * 0.8, t.z); trunks.setMatrixAt(i, this.tmpM);
      });
      crowns.computeBoundingSphere(); trunks.computeBoundingSphere();
      crowns.castShadow = trunks.castShadow = true; crowns.receiveShadow = true;
      this.cityGroup.add(crowns, trunks);
    }

    /* traffic: cars keep to the right, each lane at its own steady speed */
    const r = rng(city.seed ^ 0x9e3779b9);
    this.cars = [];
    for (let k = 0; k <= N; k++) for (const ax of ['x', 'z']) for (const dir of [1, -1]) {
      const n = 6 + Math.floor(r() * 7), speed = 7 + r() * 6, off = r() * 2 * HALF;
      for (let c = 0; c < n; c++) this.cars.push({ ax, line: roadLine(k), dir, speed, s: ((c / n) * 2 * HALF + off + r() * 6) % (2 * HALF) - HALF });
    }
    const carGeo = new RoundedBoxGeometry(1.6, 0.7, 0.85, 1, 0.25); carGeo.translate(0, 0.35, 0);
    this.carMesh = new THREE.InstancedMesh(carGeo, this.mats.car, this.cars.length);
    this.carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.carMesh.castShadow = true; this.carMesh.frustumCulled = false;
    const palette = [0xffffff, 0xffffff, 0xffffff, 0xf2f5f9, 0xd4500f, 0x8fb8e6, 0xc9d2dd];
    const col = new THREE.Color();
    this.cars.forEach((c, i) => this.carMesh.setColorAt(i, city.cyber
      ? (r() < 0.5 ? col.setRGB(2.2, 2.0, 1.7) : col.setRGB(2.6, 0.15, 0.2))
      : col.set(palette[Math.floor(r() * palette.length)])));
    this.cityGroup.add(this.carMesh);

    this.deliveries = new Deliveries(this, city);

    if (city.cyber) this.buildCyber(city, M, r, seg);

    this.boxes = city.buildings.map(b => new THREE.Box3(new THREE.Vector3(b.box.x0, 0, b.box.z0), new THREE.Vector3(b.box.x1, b.box.y1, b.box.z1)));
    this.select(null); this.hover(null);
  }

  /* ---------- the neon layer ---------- */
  buildCyber(city, M, r, seg) {
    const cy = this.cyber = {};
    const glows = new Map(); // glowing lines, per tile like everything else
    const G = (x, z) => { const k = this.chunkOf(x, z); let g = glows.get(k); if (!g) glows.set(k, g = { glow: [], glow2: [] }); return g; };
    const add = (mesh) => { this.cityGroup.add(mesh); return mesh; };
    const lineMesh = (arr, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return add(new THREE.LineSegments(g, mat)); };

    // signs: each colour and kind merged into one mesh
    const groups = {};
    for (const sg of city.signs) {
      const key = (sg.holo ? sg.kind : 'solid') + ':' + this.chunkOf(sg.x, sg.z);
      const g = new THREE.PlaneGeometry(sg.w, sg.h); g.rotateY(sg.rot); g.translate(sg.x, sg.y, sg.z);
      const [cr, cg, cb] = NEON[sg.c], n = g.attributes.position.count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [cr, cg, cb]), 3));
      (groups[key] || (groups[key] = [])).push(g);
    }
    for (const key in groups) {
      add(new THREE.Mesh(mergeGeometries(groups[key]), this.signMats[key.split(':')[0]]));
    }

    // skybridges and pipes, with a glowing strip under each bridge
    const beamGeos = {};
    for (const b of city.beams) {
      const dx = b.b[0] - b.a[0], dz = b.b[2] - b.a[2], len = Math.hypot(dx, dz);
      const g = new THREE.BoxGeometry(len, b.h, b.w); g.rotateY(-Math.atan2(dz, dx));
      g.translate((b.a[0] + b.b[0]) / 2, b.a[1] + b.h / 2, (b.a[2] + b.b[2]) / 2);
      const bk = b.m + '|' + this.chunkOf((b.a[0] + b.b[0]) / 2, (b.a[2] + b.b[2]) / 2);
      (beamGeos[bk] || (beamGeos[bk] = [])).push(prep(g));
      const { glow, glow2 } = G((b.a[0] + b.b[0]) / 2, (b.a[2] + b.b[2]) / 2);
      if (b.glow) {
        const nx = -dz / len * b.w / 2, nz = dx / len * b.w / 2;
        for (const sgn of [-1, 1]) seg(r() < 0.7 ? glow : glow2, [b.a[0] + nx * sgn, b.a[1] - 0.05, b.a[2] + nz * sgn], [b.b[0] + nx * sgn, b.a[1] - 0.05, b.b[2] + nz * sgn]);
      }
    }
    for (const k in beamGeos) { const mesh = add(new THREE.Mesh(mergeGeometries(beamGeos[k]), M[k.split('|')[0]])); mesh.castShadow = true; }

    // walkway decks over the streets
    const deckGeos = {};
    for (const d of city.decks) {
      const len = d.s1 - d.s0, mid = (d.s0 + d.s1) / 2;
      const dk = d.ax === 'x' ? this.chunkOf(d.line, mid) : this.chunkOf(mid, d.line), { glow, glow2 } = d.ax === 'x' ? G(d.line, mid) : G(mid, d.line);
      const g = d.ax === 'x' ? new THREE.BoxGeometry(d.w, 0.7, len) : new THREE.BoxGeometry(len, 0.7, d.w);
      g.translate(d.ax === 'x' ? d.line : mid, d.y, d.ax === 'x' ? mid : d.line); (deckGeos[dk] || (deckGeos[dk] = [])).push(prep(g));
      for (const sgn of [-1, 1]) {
        const o = d.line + sgn * d.w / 2, y = d.y + 0.4;
        if (d.ax === 'x') seg(glow, [o, y, d.s0], [o, y, d.s1]); else seg(glow, [d.s0, y, o], [d.s1, y, o]);
        const ry = d.y + 1.3; // railing
        if (d.ax === 'x') seg(glow2, [o, ry, d.s0], [o, ry, d.s1]); else seg(glow2, [d.s0, ry, o], [d.s1, ry, o]);
      }
    }
    for (const k in deckGeos) { const mesh = add(new THREE.Mesh(mergeGeometries(deckGeos[k]), M.deck)); mesh.castShadow = true; mesh.receiveShadow = true; }

    // elevated rail loop: deck, pillars, glowing edges, and two trains
    const rail = city.rail, pts = rail.pts, railGeos = [];
    cy.railLen = 0; cy.railSegs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      const g = new THREE.BoxGeometry(Math.abs(dx) + 3, 1, Math.abs(dz) + 3); g.translate((a[0] + b[0]) / 2, rail.y - 0.5, (a[1] + b[1]) / 2); railGeos.push(prep(g));
      for (let s = 0; s < len; s += PITCH) {
        const x = a[0] + dx / len * s, z = a[1] + dz / len * s;
        const pg = new THREE.CylinderGeometry(0.9, 1.2, rail.y - 1, 12); pg.translate(x, (rail.y - 1) / 2, z); railGeos.push(prep(pg));
      }
      const nx = -dz / len * 1.5, nz = dx / len * 1.5;
      for (const sgn of [-1, 1]) seg(G((a[0] + b[0]) / 2, (a[1] + b[1]) / 2).glow, [a[0] + nx * sgn, rail.y + 0.02, a[1] + nz * sgn], [b[0] + nx * sgn, rail.y + 0.02, b[1] + nz * sgn]);
      cy.railSegs.push({ a, dx: dx / len, dz: dz / len, len, at: cy.railLen }); cy.railLen += len;
    }
    const railMesh = add(new THREE.Mesh(mergeGeometries(railGeos), M.deck)); railMesh.castShadow = true;
    const carsPer = 6;
    cy.trains = [{ s: 0, v: 22 }, { s: cy.railLen / 2, v: 22 }];
    cy.trainMesh = add(new THREE.InstancedMesh(new RoundedBoxGeometry(5.2, 1.7, 2.2, 2, 0.4), M.train, cy.trains.length * carsPer));
    cy.trainMesh.frustumCulled = false; cy.carsPer = carsPer;

    for (const g of glows.values()) { if (g.glow.length) lineMesh(g.glow, this.glowMat); if (g.glow2.length) lineMesh(g.glow2, this.glowMat2); }

    // flying traffic: lanes above the streets at two heights
    cy.fly = [];
    for (let k = 1; k < N; k++) for (const ax of ['x', 'z']) for (const lvl of [46, 64]) for (const dir of [1, -1]) {
      if (r() < 0.35) continue;
      const n = 3 + Math.floor(r() * 4), speed = 16 + r() * 12, off = r() * 2 * HALF;
      for (let c = 0; c < n; c++) cy.fly.push({ ax, line: roadLine(k) + dir * 1.8 * (ax === 'x' ? -1 : 1), y: lvl + (dir > 0 ? 0 : 3), dir, speed, s: ((c / n) * 2 * HALF + off) % (2 * HALF) - HALF });
    }
    cy.flyMesh = add(new THREE.InstancedMesh(new RoundedBoxGeometry(2.4, 0.6, 1.1, 2, 0.25), M.car, cy.fly.length));
    const col = new THREE.Color(), flyCols = [[0.4, 2.2, 2.8], [2.6, 0.4, 2.0], [2.6, 1.6, 0.4], [2.2, 2.2, 2.4]];
    cy.fly.forEach((f, i) => cy.flyMesh.setColorAt(i, col.setRGB(...flyCols[Math.floor(r() * flyCols.length)])));
    cy.flyMesh.frustumCulled = false; cy.flyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // searchlights sweeping the clouds
    cy.lights = city.lights.map(l => {
      const g = new THREE.ConeGeometry(16, 220, 28, 1, true); g.rotateX(Math.PI); g.translate(0, 110, 0);
      const beam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.65, 1), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.rotation.x = 0.5;
      const pivot = new THREE.Group(); pivot.position.set(l.x, l.y, l.z); pivot.add(beam); add(pivot);
      return { pivot, l };
    });

    // rain falling around the camera
    const R = 5000, rp = new Float32Array(R * 6);
    cy.rainY = new Float32Array(R); cy.rainSpeed = new Float32Array(R);
    for (let i = 0; i < R; i++) {
      const x = (r() - 0.5) * 300, z = (r() - 0.5) * 300, y = r() * 200;
      rp.set([x, y, z, x + 0.25, y + 2.2, z + 0.15], i * 6); cy.rainY[i] = y; cy.rainSpeed[i] = 70 + r() * 40;
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    cy.rain = add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.28, depthWrite: false })));
    cy.rain.frustumCulled = false;
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
    let far;
    if (this.scene.fog.isFogExp2) { this.scene.fog.density = 0.42 / (cam.dist + 90); far = 5.2 * (cam.dist + 90); }
    else { this.scene.fog.near = cam.dist * 1.5; this.scene.fog.far = cam.dist * 4.5 + 200; far = this.scene.fog.far + 20; }
    // nothing past the fog can be seen, so stop drawing there
    far = Math.min(2400, far);
    if (Math.abs(this.camera.far - far) > far * 0.04) { this.camera.far = far; this.camera.updateProjectionMatrix(); }

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
      this.deliveries.update(dt, t, calm);
      for (const s of this.spinners) if (!calm) s.rotation.z += dt * s.userData.speed;
      if (this.mats.beacon.emissive) this.mats.beacon.emissiveIntensity = this.t.beacon * (0.55 + 0.45 * Math.max(0, Math.sin(t * 2.2)));
      else this.mats.beacon.color.setRGB(3 * (0.3 + 0.7 * Math.max(0, Math.sin(t * 2.2))), 0.25, 0.35);
    }
    if (this.cyber) this.frameCyber(dt, t, cam, calm);
    if (this.neon && this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  frameCyber(dt, t, cam, calm) {
    const cy = this.cyber, M = this.mats;
    M.white.userData.u.uTime.value = t; M.glass.userData.u.uTime.value = t;
    // signs scroll, and now and then one flickers
    const S = this.signMats;
    if (!calm) { S.strip.map.offset.y = (S.strip.map.offset.y + dt * 0.05) % 1; S.board.map.offset.x = (S.board.map.offset.x + dt * 0.04) % 1; }
    S.strip.color.setScalar(Math.sin(t * 23) > 0.97 ? 0.45 : 1.2);
    S.board.color.setScalar(Math.sin(t * 19 + 2) > 0.97 ? 0.45 : 1.2);
    S.solid.color.setScalar(Math.sin(t * 17 + 4) > 0.985 ? 0.5 : 1.7);
    cy.flyMesh.visible = cy.trainMesh.visible = cy.rain.visible = !calm;
    for (const s of cy.lights) s.pivot.rotation.y = s.l.phase + t * s.l.speed;
    if (calm) return;
    cy.fly.forEach((c, i) => {
      c.s += c.dir * c.speed * dt;
      if (c.s > HALF) c.s -= 2 * HALF; else if (c.s < -HALF) c.s += 2 * HALF;
      const x = c.ax === 'x' ? c.line : c.s, z = c.ax === 'x' ? c.s : c.line;
      this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.ax === 'x' ? Math.PI / 2 : 0);
      this.tmpM.compose(this.tmpV.set(x, c.y + Math.sin(t + i) * 0.3, z), this.tmpQ, this.one); cy.flyMesh.setMatrixAt(i, this.tmpM);
    });
    cy.flyMesh.instanceMatrix.needsUpdate = true;
    let n = 0;
    for (const tr of cy.trains) {
      tr.s = (tr.s + tr.v * dt) % cy.railLen;
      for (let c = 0; c < cy.carsPer; c++) {
        let s = (tr.s - c * 5.6 + cy.railLen) % cy.railLen;
        const sg = cy.railSegs.find(q => s >= q.at && s < q.at + q.len) || cy.railSegs[0]; s -= sg.at;
        this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -Math.atan2(sg.dz, sg.dx));
        this.tmpM.compose(this.tmpV.set(sg.a[0] + sg.dx * s, this.city.rail.y + 0.95, sg.a[1] + sg.dz * s), this.tmpQ, this.one);
        cy.trainMesh.setMatrixAt(n++, this.tmpM);
      }
    }
    cy.trainMesh.instanceMatrix.needsUpdate = true;
    // rain: each streak falls and wraps; the whole box follows the camera
    const pos = cy.rain.geometry.attributes.position.array;
    for (let i = 0; i < cy.rainY.length; i++) {
      let y = cy.rainY[i] - cy.rainSpeed[i] * dt; if (y < 0) y += 200; cy.rainY[i] = y;
      pos[i * 6 + 1] = y; pos[i * 6 + 4] = y + 2.2;
    }
    cy.rain.geometry.attributes.position.needsUpdate = true;
    cy.rain.position.set(cam.target.x, 0, cam.target.z);
  }

  project(x, y, z) {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    const r = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * r.clientWidth, y: (-v.y * 0.5 + 0.5) * r.clientHeight, behind: v.z > 1 };
  }
}
