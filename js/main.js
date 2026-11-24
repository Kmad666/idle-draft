// Wiring: input, game loop, saving, away progress.
import { World } from './world.js';
import { AnnoCamera } from './camera.js';
import * as S from './sim.js';
import * as UI from './ui.js';
import { BUILDINGS, ISLANDS, AWAY_CAP } from './data.js';

const KEY = 'idle-draft-save-v1';
const $ = (q) => document.querySelector(q);

/* ---------- save / load ---------- */
function serialize(s) {
  return JSON.stringify({
    v: 1, bits: s.bits, lifetime: s.lifetime, time: s.time, islands: s.islands, relayLanes: s.relayLanes, pulse: s.pulse,
    tutorial: s.tutorial, tutorialHidden: s.tutorialHidden, tutorialMin: s.tutorialMin, settings: s.settings, savedAt: Date.now(),
    buildings: s.buildings.map(b => ({ id: b.id, type: b.type, island: b.island, cx: b.cx, cz: b.cz, tier: b.tier || 0, spent: b.spent || 0,
      buf: b.buf, out: b.out, met: b.met, readyT: b.readyT, coreMet: b.coreMet })),
    links: s.links.map(l => ({ id: l.id, from: l.from, to: l.to, good: l.good })),
  });
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return S.restore({ ...S.newState(), ...JSON.parse(raw) });
  } catch (e) { console.warn('Save could not be read', e); }
  return S.newState();
}
function save() { try { s.savedAt = Date.now(); localStorage.setItem(KEY, serialize(s)); } catch (e) { /* storage unavailable */ } }
const encode = (str) => btoa(unescape(encodeURIComponent(str)));
const decode = (str) => decodeURIComponent(escape(atob(str.trim())));

let s = load();
window.idleDraft = s; // handy for debugging in the console
document.documentElement.dataset.mode = s.settings.dark ? 'dark' : 'light';

/* ---------- away progress ---------- */
let away = null;
const gone = (Date.now() - (s.savedAt || Date.now())) / 1000;
if (s.buildings.length > 1 && gone > 60) {
  const secs = Math.min(gone, AWAY_CAP);
  away = { ...S.fastForward(s, secs), capped: gone > AWAY_CAP };
}

/* ---------- view ---------- */
const world = new World($('#view'), s);
const cam = new AnnoCamera(world.camera, world.renderer.domElement, s.settings);
const tags = new UI.Tags(world, s, (k) => { const err = S.unlockIsland(s, k); if (err) UI.toast(err); else { UI.toast(`${ISLANDS[k].name} is open.`); cam.focus(ISLANDS[k].cx - 10, ISLANDS[k].cz); save(); } });
$('#boot').remove();

let sel = null, hover = null, mode = null; // mode: {kind:'place',type} | {kind:'move',id} | {kind:'link',id}
const setMode = (m) => {
  mode = m; world.setGhost(m && m.kind === 'place' ? m.type : m && m.kind === 'move' ? S.byId(s, m.id).type : null, null, true);
  const bar = $('#modeBar');
  if (!m) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = m.kind === 'place' ? `Building <b>${BUILDINGS[m.type].name}</b>: left-click a square, <b>F</b> for the suggested spot, right-click to stop.`
    : m.kind === 'move' ? 'Moving: left-click an empty square. Right-click cancels.'
    : `Linking from <b>${S.label(S.byId(s, m.id))}</b>: left-click the other building. Right-click cancels.`;
};

function placeAt(cell) {
  if (!cell) return;
  const r = S.place(s, mode.type, cell.island, cell.cx, cell.cz);
  if (r.err) UI.toast(r.err); else { if (s.bits < S.costOf(s, mode.type)) setMode(null); }
}

UI.renderDock(s, mode, pick);
function pick(type) {
  if (!S.isUnlocked(s, type)) { UI.toast('Unlock Thera first.'); return; }
  if (mode && mode.type === type) { setMode(null); return; }
  setMode({ kind: 'place', type });
  const c = S.suggestCell(s, type); if (c) world.setGhost(type, c, true);
}

/* ---------- pointer input (Anno style) ---------- */
const dom = world.renderer.domElement;
let down = null;
dom.addEventListener('contextmenu', e => e.preventDefault());
dom.addEventListener('pointerdown', e => {
  if (e.button === 0) { down = { x: e.clientX, y: e.clientY, panning: false }; dom.setPointerCapture(e.pointerId); }
  if (e.button === 2) { if (mode) setMode(null); else sel = null; }
});
dom.addEventListener('pointermove', e => {
  if (down && !down.panning && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down.panning = true; cam.startPan(e); }
  if (down && down.panning) return;
  hover = world.pickBuilding(e.clientX, e.clientY);
  if (mode && mode.kind !== 'link') {
    const c = world.pickCell(e.clientX, e.clientY);
    const type = mode.kind === 'place' ? mode.type : S.byId(s, mode.id).type;
    const ok = c && S.cellFree(s, c.island, c.cx, c.cz) && !S.canPlace(s, type, c.island);
    world.setGhost(type, c, ok);
  }
  dom.style.cursor = mode ? 'crosshair' : hover ? 'pointer' : 'grab';
});
dom.addEventListener('pointerup', e => {
  if (e.button !== 0 || !down) return;
  const wasPan = down.panning; down = null; cam.endPan();
  if (wasPan) return;
  if (mode && mode.kind === 'place') return placeAt(world.pickCell(e.clientX, e.clientY));
  if (mode && mode.kind === 'move') {
    const c = world.pickCell(e.clientX, e.clientY), b = S.byId(s, mode.id);
    if (c) { const err = S.move(s, b, c.island, c.cx, c.cz); if (err) UI.toast(err); else setMode(null); }
    return;
  }
  const id = world.pickBuilding(e.clientX, e.clientY);
  if (mode && mode.kind === 'link') {
    if (!id) return;
    const a = S.byId(s, mode.id), b = S.byId(s, id);
    const err1 = S.canLink(s, a, b), err2 = S.canLink(s, b, a);
    if (!err1) S.addLink(s, a, b); else if (!err2) S.addLink(s, b, a); else { UI.toast(err1); return; }
    UI.toast('Linked.'); setMode(null); return;
  }
  sel = id;
});
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (e.key === 'Escape') { if (!$('#modal').hidden) UI.closeModal(); else if (mode) setMode(null); else sel = null; }
  if (e.key.toLowerCase() === 'f' && mode && mode.kind === 'place') placeAt(S.suggestCell(s, mode.type));
});

/* ---------- panel actions ---------- */
function act(a, b, linkId) {
  if (a === 'pulse') doPulse();
  if (a === 'lane') { const err = S.buyLane(s, S.laneCost(s)); UI.toast(err || 'Relay lane added.'); }
  if (a === 'upgrade') { const err = S.upgrade(s, b); UI.toast(err || `Upgraded to ${S.tierOf(b).name}.`); }
  if (a === 'move') setMode({ kind: 'move', id: b.id });
  if (a === 'link') setMode({ kind: 'link', id: b.id });
  if (a === 'unlink') S.removeLink(s, +linkId);
  if (a === 'demolish') { S.demolish(s, b); sel = null; }
  save();
}
function doPulse() {
  const wait = S.pulse(s);
  UI.toast(wait ? `Pulse is recharging: ${wait}s.` : 'Pulse! Everything runs twice as fast for 10 seconds.');
}

/* ---------- HUD buttons and modals ---------- */
$('#btnPulse').onclick = doPulse;
$('#btnGuide').onclick = () => UI.modal(UI.glossaryHtml());
$('#btnControls').onclick = () => UI.modal(UI.controlsHtml());
$('#modalClose').onclick = UI.closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') UI.closeModal(); });
$('#btnSettings').onclick = () => {
  UI.modal(UI.settingsHtml(s));
  $('#saveText').value = encode(serialize(s));
  let armed = false;
  $('#modalBody').onchange = (e) => {
    const k = e.target.dataset.s; if (!k) return;
    s.settings[k] = e.target.checked;
    if (k === 'dark') { document.documentElement.dataset.mode = s.settings.dark ? 'dark' : 'light'; world.setTheme(s.settings.dark); }
    save();
  };
  $('#modalBody').onclick = async (e) => {
    const x = e.target.closest('[data-x]'); if (!x) return;
    const msg = $('#saveMsg');
    if (x.dataset.x === 'copy') { try { await navigator.clipboard.writeText($('#saveText').value); msg.textContent = 'Copied.'; } catch { $('#saveText').select(); msg.textContent = 'Select the text and copy it with Ctrl+C.'; } }
    if (x.dataset.x === 'load') {
      try { const data = JSON.parse(decode($('#saveText').value)); localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() })); location.reload(); }
      catch { msg.textContent = 'That save code could not be read.'; }
    }
    if (x.dataset.x === 'reset') {
      if (!armed) { armed = true; x.textContent = 'Click again to erase everything'; x.classList.add('primary'); return; }
      localStorage.removeItem(KEY); stopSaving = true; location.reload();
    }
  };
};
if (away && away.earned > 0) {
  UI.modal(UI.awayHtml(away));
  $('#modalBody').onclick = (e) => { if (e.target.closest('[data-x="ok"]')) UI.closeModal(); };
}

/* ---------- loops ---------- */
let last = performance.now(), stopSaving = false;
setInterval(() => { // simulation keeps going in background tabs; catches up if the browser throttled us
  const now = performance.now(); let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, AWAY_CAP);
  if (dt > 5) S.fastForward(s, dt); else S.step(s, dt);
}, 200);
setInterval(() => { if (!stopSaving) save(); }, 15000);
addEventListener('visibilitychange', () => { if (document.hidden && !stopSaving) save(); });
addEventListener('beforeunload', () => { if (!stopSaving) save(); });

setInterval(() => {
  UI.renderHud(s); UI.renderDock(s, mode, pick); UI.renderPanel(s, sel, act);
  UI.renderTutorial(s, save); tags.rebuild();
  if (sel && !S.byId(s, sel)) sel = null;
}, 250);
UI.renderHud(s); UI.renderTutorial(s, save);

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  cam.update(dt);
  world.frame(dt, now / 1000, sel, hover, s.settings.calm);
  tags.place(now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
