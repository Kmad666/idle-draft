// Wiring: city generation, camera, input, panels, labels and settings.
import { World } from './world.js';
import { AnnoCamera } from './camera.js';
import { generateCity, HALF, METRES, FLOOR, districtName } from './city.js';

const KEY = 'idle-draft-city-v1';
const $ = (q) => document.querySelector(q);
const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const m = (u) => Math.round(u * METRES);

/* ---------- settings ---------- */
let prefs = { settings: { theme: 'draft', edgeScroll: false, calm: false, labels: true }, seed: null };
try { const raw = localStorage.getItem(KEY); if (raw) { const p = JSON.parse(raw); prefs = { ...prefs, ...p, settings: { ...prefs.settings, ...p.settings } }; } } catch { /* storage off */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage off */ } };
const S = prefs.settings;
if (S.dark !== undefined) { if (S.dark) S.theme = 'night'; delete S.dark; } // older saves
const STYLES = { draft: { label: 'Draft', mode: 'light', drawing: 'Cityscape, general arrangement' },
  night: { label: 'Night', mode: 'dark', drawing: 'Cityscape, night sheet' },
  neon: { label: 'Neon', mode: 'neon', drawing: 'Neon sprawl, vertical city' } };
const ORDER = ['draft', 'night', 'neon'];
if (!STYLES[S.theme]) S.theme = 'draft';
document.documentElement.dataset.mode = STYLES[S.theme].mode;

const urlSeed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
const randomSeed = () => Math.floor(Math.random() * 999999) + 1;
let seed = Number.isFinite(urlSeed) ? urlSeed : prefs.seed || randomSeed();

/* ---------- view ---------- */
const world = new World($('#view'), S);
const lim = HALF + 20;
const cam = new AnnoCamera(world.camera, world.renderer.domElement, S, { min: 16, max: 900, dist: 560, yaw: -0.62, bounds: { minX: -lim, maxX: lim, minZ: -lim, maxZ: lim } });
let city = null, sel = null, hov = null;
window.idleDraft = { world, cam, get city() { return city; } }; // handy in the console

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 2600);
}

function build(newSeed, fly = true) {
  seed = newSeed; prefs.seed = seed; save();
  const u = new URL(location.href); u.searchParams.set('seed', seed); history.replaceState(null, '', u);
  city = generateCity(seed, { cyber: S.theme === 'neon' });
  world.build(city);
  sel = hov = null; renderPanel();
  $('#cityName').textContent = city.name;
  $('#cityStats').textContent = `${city.buildings.length.toLocaleString('en-US')} buildings`;
  $('#tbCity').textContent = city.name; $('#tbSeed').textContent = seed; $('#tbDrawing').textContent = STYLES[S.theme].drawing;
  $('#btnStyle').textContent = `Style: ${STYLES[S.theme].label}`;
  $('#tbCount').textContent = city.buildings.length.toLocaleString('en-US'); $('#tbTall').textContent = `${m(city.tallest.h)} m`;
  makeTags();
  if (fly) cam.focus(city.C.x * 0.5, city.C.z * 0.5 + 40, 560);
}

/* ---------- district labels and the dimension tag ---------- */
let tagEls = [];
function makeTags() {
  const box = $('#tags'); box.innerHTML = '';
  tagEls = city.labels.map(l => {
    const el = document.createElement('div'); el.className = 'tag isl' + (l.river ? ' river' : ''); el.textContent = l.text;
    box.appendChild(el); return { el, l };
  });
  const d = document.createElement('div'); d.className = 'tag dim'; d.hidden = true; box.appendChild(d);
  tagEls.dim = d;
}
function placeTags() {
  const showLabels = S.labels && cam.dist > 70;
  for (const { el, l } of tagEls) {
    if (!showLabels) { el.style.display = 'none'; continue; }
    const p = world.project(l.x, 2, l.z);
    el.style.display = p.behind ? 'none' : '';
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  }
  const d = tagEls.dim;
  if (d) {
    if (sel == null || !world.dimAt) { d.hidden = true; return; }
    const b = city.buildings[sel], p = world.project(world.dimAt.x, world.dimAt.y, world.dimAt.z);
    d.hidden = p.behind; d.textContent = `${m(b.h)} m`;
    d.style.transform = `translate(${p.x + 8}px, ${p.y}px) translate(0, -50%)`;
  }
}

/* ---------- spec panel ---------- */
function renderPanel() {
  const el = $('#panel');
  if (sel == null) { el.hidden = true; return; }
  const b = city.buildings[sel], w = b.box.x1 - b.box.x0, d = b.box.z1 - b.box.z0;
  const dist = districtName(b.district, city.cyber);
  const floors = Math.max(1, Math.round((b.h - 0.3) / FLOOR));
  el.hidden = false;
  el.innerHTML = `<div class="eyebrow"><i class="dot" style="background:var(--accent)"></i>Sheet NW-02 · ${esc(b.ref)}</div>
    <h2>${esc(b.type)}</h2>
    <p class="desc">${b.landmark ? `The tallest tower in ${esc(city.name)}, marked by the ring and spire at the top.` : `${esc(dist)}, ${esc(city.name)}.`}</p>
    <dl class="spec">
      <dt>Height</dt><dd>${m(b.h)} m</dd>
      <dt>Storeys</dt><dd>${floors}</dd>
      <dt>Footprint</dt><dd>${m(w)} × ${m(d)} m</dd>
      <dt>District</dt><dd>${esc(dist)}</dd>
      <dt>Grid ref</dt><dd>${Math.round((b.box.x0 + b.box.x1) / 2 * METRES)}, ${Math.round((b.box.z0 + b.box.z1) / 2 * METRES)}</dd>
    </dl>
    <div class="actions"><button class="btn" data-a="focus">Zoom to it</button><button class="btn" data-a="close">Close</button></div>`;
  el.onclick = (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'focus') cam.focus((b.box.x0 + b.box.x1) / 2, (b.box.z0 + b.box.z1) / 2, Math.max(40, b.h * 1.3));
    if (a.dataset.a === 'close') { sel = null; world.select(null); renderPanel(); }
  };
}

/* ---------- pointer input (Anno style) ---------- */
const dom = world.renderer.domElement;
let down = null;
dom.addEventListener('contextmenu', e => e.preventDefault());
dom.addEventListener('pointerdown', e => {
  if (e.button === 0) { down = { x: e.clientX, y: e.clientY, panning: false }; dom.setPointerCapture(e.pointerId); }
  if (e.button === 2) { sel = null; world.select(null); renderPanel(); }
});
dom.addEventListener('pointermove', e => {
  if (down && !down.panning && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down.panning = true; cam.startPan(e); }
  if (down && down.panning) { dom.style.cursor = 'grabbing'; return; }
  if (!city) return;
  const h = world.pick(e.clientX, e.clientY);
  if (h !== hov) { hov = h; world.hover(h); }
  dom.style.cursor = hov != null ? 'pointer' : 'grab';
});
dom.addEventListener('pointerleave', () => { hov = null; world.hover(null); });
dom.addEventListener('pointerup', e => {
  if (e.button !== 0 || !down) return;
  const wasPan = down.panning; down = null; cam.endPan();
  if (wasPan) return;
  sel = world.pick(e.clientX, e.clientY);
  world.select(sel); world.hover(null); renderPanel();
});
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else { sel = null; world.select(null); renderPanel(); } }
});

/* ---------- HUD and modals ---------- */
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; $('#modalClose').focus(); }
function closeModal() { $('#modal').hidden = true; }
$('#modalClose').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function setStyle(theme) {
  const wasNeon = S.theme === 'neon';
  S.theme = theme; save();
  document.documentElement.dataset.mode = STYLES[theme].mode;
  world.setTheme(theme);
  if (wasNeon !== (theme === 'neon')) build(seed, false); // the neon city is a denser, taller version of the same seed
  else { $('#tbDrawing').textContent = STYLES[theme].drawing; $('#btnStyle').textContent = `Style: ${STYLES[theme].label}`; }
}
$('#btnStyle').onclick = () => { setStyle(ORDER[(ORDER.indexOf(S.theme) + 1) % ORDER.length]); toast(`${STYLES[S.theme].label} style.`); };
$('#btnNew').onclick = () => { build(randomSeed()); toast(`Drew ${city.name}.`); };
$('#btnOverview').onclick = () => cam.focus(city.C.x * 0.5, city.C.z * 0.5 + 40, 560);
$('#btnControls').onclick = () => modal(`<h2>Controls</h2><p class="muted">Modelled on Anno 1800, so one hand on the mouse does everything.</p><table>
  <tr><td>Left-click</td><td>Select a building and see its spec sheet</td></tr>
  <tr><td>Left-drag</td><td>Pan the map</td></tr>
  <tr><td>Mouse wheel</td><td>Zoom. The camera tilts lower as you zoom in</td></tr>
  <tr><td>Middle-drag</td><td>Rotate the view</td></tr>
  <tr><td>Right-click or <kbd>Esc</kbd></td><td>Deselect</td></tr>
  <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows</td><td>Pan</td></tr>
  <tr><td><kbd>Q</kbd> <kbd>E</kbd></td><td>Rotate</td></tr>
  <tr><td>Screen edges</td><td>Pan, if turned on in Settings</td></tr>
  <tr><td>Style button</td><td>Switch between Draft, Night and Neon</td></tr></table>`);
$('#btnSettings').onclick = () => {
  modal(`<h2>Settings</h2>
    <div class="sub">Style</div>
    ${ORDER.map(k => `<label class="opt"><input type="radio" name="style" data-style="${k}" ${S.theme === k ? 'checked' : ''}>${STYLES[k].label}: ${{ draft: 'white drafting sheet', night: 'the drafting sheet at night, floor lines lit like windows', neon: 'a taller, denser cyberpunk city with signs, skybridges, flying traffic and rain' }[k]}</label>`).join('')}
    <div class="sub" style="margin-top:16px">View</div>
    ${[['labels', 'Show district names'], ['calm', 'Calm mode: stop the traffic and drones'], ['edgeScroll', 'Pan when the mouse touches the screen edge']]
      .map(([k, l]) => `<label class="opt"><input type="checkbox" data-s="${k}" ${S[k] ? 'checked' : ''}>${l}</label>`).join('')}
    <div class="sub" style="margin-top:16px">Seed</div>
    <p class="muted" style="font-size:14px">Every city comes from a number. The same number always draws the same city, and the link in your address bar includes it, so you can share it.</p>
    <div class="actions"><input id="seedIn" class="field" inputmode="numeric" value="${seed}"><button class="btn primary" data-x="seed">Draw this seed</button></div>`);
  $('#modalBody').onchange = (e) => {
    if (e.target.dataset.style) { setStyle(e.target.dataset.style); return; }
    const k = e.target.dataset.s; if (!k) return;
    S[k] = e.target.checked; save();
  };
  $('#modalBody').onclick = (e) => {
    if (!e.target.closest('[data-x="seed"]')) return;
    const v = parseInt($('#seedIn').value, 10);
    if (!Number.isFinite(v) || v < 1) { toast('A seed is a whole number above 0.'); return; }
    closeModal(); build(v); toast(`Drew ${city.name}.`);
  };
};

/* ---------- compass and scale bar ---------- */
function updateMeta() {
  $('#needle').setAttribute('transform', `rotate(${cam.yaw * 180 / Math.PI})`);
  // how many pixels one metre covers at the point the camera looks at
  const t = cam.target, a = world.project(t.x, 0, t.z), r = world.camera.matrixWorld;
  const right = { x: r.elements[0], z: r.elements[2] }, L = 20;
  const b = world.project(t.x + right.x * L, 0, t.z + right.z * L);
  const pxPerM = Math.hypot(b.x - a.x, b.y - a.y) / (L * METRES);
  const nice = [10, 20, 50, 100, 200, 500, 1000];
  const len = nice.find(n => n * pxPerM >= 70) || 1000;
  $('#scalebar .bar').style.width = `${Math.round(len * pxPerM)}px`;
  $('#scaleTxt').textContent = len >= 1000 ? `${len / 1000} km` : `${len} m`;
}

/* ---------- start ---------- */
build(seed, false);
cam.focus(city.C.x * 0.5, city.C.z * 0.5 + 40, 560); cam.dist = 560; cam.update(0); updateMeta();
$('#boot').remove();

let prev = performance.now(), metaT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  cam.update(dt);
  world.frame(dt, now / 1000, cam, S.calm);
  placeTags();
  if ((metaT += dt) > 0.15) { metaT = 0; updateMeta(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
