// Anno-style camera: left-drag on empty ground pans, wheel zooms (and tilts),
// middle-drag rotates, WASD / arrows pan, Q / E rotate, screen edges pan.
import * as THREE from 'three';

export class AnnoCamera {
  constructor(camera, dom, settings) {
    this.cam = camera; this.dom = dom; this.settings = settings;
    this.target = new THREE.Vector3(14, 0, -2);
    this.yaw = -0.35; this.dist = 92; this.goalDist = 92; this.goalYaw = this.yaw;
    this.keys = new Set(); this.mouse = null; this.panning = null; this.rotating = null;
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ray = new THREE.Raycaster();
    this.bounds = { minX: -30, maxX: 80, minZ: -40, maxZ: 35 };

    dom.addEventListener('wheel', e => {
      e.preventDefault();
      this.goalDist = THREE.MathUtils.clamp(this.goalDist * Math.pow(1.0015, e.deltaY), 14, 130);
    }, { passive: false });
    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input,textarea')) return;
      this.keys.add(e.key.toLowerCase());
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.mouse = null; });
    dom.addEventListener('pointermove', e => { this.mouse = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerleave', () => { this.mouse = null; });
    dom.addEventListener('pointerdown', e => {
      if (e.button === 1) { e.preventDefault(); this.rotating = { x: e.clientX, yaw: this.goalYaw }; dom.setPointerCapture(e.pointerId); }
    });
    addEventListener('pointermove', e => {
      if (this.rotating) this.goalYaw = this.rotating.yaw - (e.clientX - this.rotating.x) * 0.006;
      if (this.panning) this.dragPan(e);
    });
    addEventListener('pointerup', e => { if (e.button === 1) this.rotating = null; });
    this.apply();
  }

  pitch() { // zoomed in = low angle, zoomed out = high
    const t = (this.dist - 14) / (130 - 14);
    return THREE.MathUtils.lerp(0.42, 1.12, Math.sqrt(Math.max(0, t)));
  }

  ground(x, y) {
    const r = this.dom.getBoundingClientRect();
    const v = new THREE.Vector2((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, p) ? p : null;
  }

  startPan(e) { const p = this.ground(e.clientX, e.clientY); if (p) this.panning = { p }; }
  dragPan(e) {
    const p = this.ground(e.clientX, e.clientY);
    if (!p) return;
    this.target.add(this.panning.p.clone().sub(p).setY(0));
    this.clamp(); this.apply();
  }
  endPan() { this.panning = null; }

  clamp() {
    const b = this.bounds;
    this.target.x = THREE.MathUtils.clamp(this.target.x, b.minX, b.maxX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, b.minZ, b.maxZ);
  }

  update(dt) {
    const k = this.keys, sp = this.dist * 0.9 * dt;
    let fx = 0, fz = 0;
    if (k.has('w') || k.has('arrowup')) fz -= 1;
    if (k.has('s') || k.has('arrowdown')) fz += 1;
    if (k.has('a') || k.has('arrowleft')) fx -= 1;
    if (k.has('d') || k.has('arrowright')) fx += 1;
    if (k.has('q')) this.goalYaw += 1.6 * dt;
    if (k.has('e')) this.goalYaw -= 1.6 * dt;
    if (this.settings.edgeScroll && this.mouse && !this.panning && !this.rotating && document.hasFocus()) {
      const r = this.dom.getBoundingClientRect(), m = 14;
      if (this.mouse[0] - r.left < m) fx -= 1; if (r.right - this.mouse[0] < m) fx += 1;
      if (this.mouse[1] - r.top < m) fz -= 1; if (r.bottom - this.mouse[1] < m) fz += 1;
    }
    if (fx || fz) {
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      this.target.x += (fx * c + fz * s) * sp;
      this.target.z += (-fx * s + fz * c) * sp;
      this.clamp();
    }
    const a = Math.min(1, dt * 10);
    this.dist += (this.goalDist - this.dist) * a;
    this.yaw += (this.goalYaw - this.yaw) * a;
    this.apply();
  }

  apply() {
    const p = this.pitch(), h = Math.cos(p) * this.dist;
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * h, this.target.y + Math.sin(p) * this.dist, this.target.z + Math.cos(this.yaw) * h);
    this.cam.lookAt(this.target);
  }

  focus(x, z) { this.target.set(x, 0, z); this.clamp(); }
}
