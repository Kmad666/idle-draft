// DOM interface: HUD, build dock, spec panel, tutorial, tags, modals.
import { GOODS, BUILDINGS, BUILD_ORDER, TIERS, ISLANDS, GLOSSARY, IN_CAP, OUT_CAP, POD_CAP } from './data.js';
import * as S from './sim.js';

const $ = (q) => document.querySelector(q);
const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  const u = ['K', 'M', 'B', 'T']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 100 ? 1 : 0) + u[i];
};
const dot = (g) => `<i class="dot" style="background:${GOODS[g].color}"></i>`;
const gname = (g) => GOODS[g].name;

export function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 2600);
}

export function modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; $('#modalClose').focus(); }
export function closeModal() { $('#modal').hidden = true; }

/* ---------- tutorial ---------- */
const count = (s, t) => S.countOf(s, t);
export const TUTORIAL = [
  { t: 'Welcome to Idle Draft', p: 'You run a small economy on floating islands. Your people live in <b>houses</b>. Each house needs goods, and pays you <b>Bits</b> (money) for every need you meet. Use Bits to build more.', goal: null },
  { t: 'Build a house', p: 'Pick <b>House</b> in the build bar at the bottom, then left-click an empty square on the island. Right-click stops building.', goal: 'Build 1 house', done: s => count(s, 'pod') >= 1 },
  { t: 'Give them water', p: 'Houses of Drones need <b>Water</b>. Build a <b>Pump</b>. New buildings connect themselves to whoever needs their goods: that line is a <b>link</b>, and the glowing balls on it are the goods travelling.', goal: 'Build a Pump', done: s => count(s, 'pump') >= 1 },
  { t: 'Make Alloy', p: 'Drones also need <b>Alloy</b>. That takes a 2-step <b>chain</b>: an <b>Ore drill</b> digs Ore, and a <b>Smelter</b> turns 2 Ore into 1 Alloy.', goal: 'Build an Ore drill and a Smelter', done: s => count(s, 'drill') >= 1 && count(s, 'smelter') >= 1 },
  { t: 'Fill a house', p: 'Left-click your house. The bars show how much of each need is met. When both reach 100%, the house pays full price.', goal: 'Get 1 house to 100%', done: s => S.podsFull(s) >= 1 },
  { t: 'Grow to five', p: 'One Pump and one Smelter can each feed about 5 houses. If a bar drops, a building can\'t keep up: build another of it. Packets piling up at the end of a link is a <b>jam</b>.', goal: 'Have 5 houses at 100%', done: s => S.podsFull(s) >= 5 },
  { t: 'Open a new island', p: 'Delos has only Water and Ore. <b>Thera</b>, the island to the east, has Silica and Carbon. Click the unlock card on Thera. Goods between islands travel by <b>relay</b>, which can carry 30 a minute until you buy more lanes.', goal: 'Unlock Thera', done: s => s.islands.thera },
  { t: 'Make Glass', p: 'Build a <b>Silica quarry</b> on Thera and a <b>Kiln</b>. Glass is a <b>bonus need</b> for Drones: it isn\'t required, but it raises their pay by 25%.', goal: 'Build a Silica quarry and a Kiln', done: s => count(s, 'quarry') >= 1 && count(s, 'kiln') >= 1 },
  { t: 'Move up a class', p: 'A house kept at 100% for one minute can <b>upgrade</b> to <b>Techs</b>. Techs pay 4 times more per person, but want fancier goods. Select a ready house and press Upgrade.', goal: 'Upgrade a house to Techs', done: s => s.buildings.some(b => b.type === 'pod' && b.tier >= 1) },
  { t: 'Supply the Techs', p: 'Techs need <b>Circuits</b> (Fab: Alloy + Glass) and <b>Coolant</b> (Mixer: Pure water from a Purifier, plus Carbon from a Carbon rig). That is a 3-step chain across both islands.', goal: 'Build a Purifier, Carbon rig, Mixer and Fab', done: s => ['purifier', 'rig', 'mixer', 'fab'].every(t => count(s, t) >= 1) },
  { t: 'A happy Tech house', p: 'Balance it until one Tech house is fully supplied. Watch for blinking orange warnings: they show exactly what is short.', goal: 'Get 1 Tech house to 100%', done: s => s.buildings.some(b => b.type === 'pod' && b.tier >= 1 && b.coreMet > 0.97) },
  { t: 'You know the loop', p: 'That is the whole game: houses want goods, chains make them, full houses pay more and climb a class. Leave it running. When you come back, you\'ll get a report of what it earned. More islands and classes come in the next version.', goal: null, last: true },
];

export function renderTutorial(s, onNext) {
  const el = $('#tutorial'), i = Math.min(s.tutorial, TUTORIAL.length - 1), st = TUTORIAL[i];
  if (s.tutorialHidden) { el.hidden = true; return; }
  el.hidden = false;
  const done = st.done ? st.done(s) : true;
  const key = i + ':' + done + ':' + !!s.tutorialMin;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.classList.toggle('min', !!s.tutorialMin);
  el.innerHTML = `<div class="row"><span class="step">Guide ${i + 1} of ${TUTORIAL.length}</span>
    <button class="btn sm" data-t="min">${s.tutorialMin ? 'Show' : 'Hide'}</button></div>
    <h3>${st.t}</h3><p>${st.p}</p>
    ${st.goal ? `<div class="goal ${done ? 'done' : ''}">${done ? 'Done: ' : 'Goal: '}${st.goal}</div>` : ''}
    <div class="row tip">${st.last ? '<button class="btn" data-t="close">Close guide</button>' : (done ? '<button class="btn primary" data-t="next">Next</button>' : '<span class="muted" style="font-size:13px">Finish the goal to continue.</span>')}</div>`;
  el.onclick = (e) => {
    const t = e.target.closest('[data-t]'); if (!t) return;
    if (t.dataset.t === 'next') { s.tutorial++; onNext(); }
    if (t.dataset.t === 'min') s.tutorialMin = !s.tutorialMin;
    if (t.dataset.t === 'close') s.tutorialHidden = true;
    el.dataset.key = ''; renderTutorial(s, onNext);
  };
}

/* ---------- HUD and dock ---------- */
export function renderHud(s) {
  $('#bits').textContent = fmt(s.bits);
  $('#rate').textContent = `+${fmt(s.incomeRate || 0)} / s`;
  const pb = $('#btnPulse'), left = s.pulse.ready - s.time;
  if (s.time < s.pulse.until) { pb.textContent = `Pulse ${Math.ceil(s.pulse.until - s.time)}s`; pb.classList.add('on'); }
  else { pb.classList.remove('on'); pb.textContent = left > 0 ? `Pulse in ${Math.ceil(left)}s` : 'Pulse'; }
}

export function renderDock(s, mode, onPick) {
  const el = $('#dock');
  const key = BUILD_ORDER.map(t => S.costOf(s, t) + (S.isUnlocked(s, t) ? 'u' : 'l') + (s.bits >= S.costOf(s, t) ? 'y' : 'n')).join() + (mode && mode.type);
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = BUILD_ORDER.map(t => {
    const d = BUILDINGS[t], c = S.costOf(s, t), un = S.isUnlocked(s, t);
    const col = t === 'pod' ? '#9cc7e8' : GOODS[d.out].color;
    return `<button class="tool ${un ? '' : 'locked'} ${s.bits < c ? 'poor' : ''} ${mode && mode.type === t ? 'on' : ''}" data-b="${t}">
      <span class="ic" style="background:${col}"></span>${esc(d.name)}<small>${un ? fmt(c) : 'Locked'}</small></button>`;
  }).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-b]'); if (b) onPick(b.dataset.b); };
  const tip = $('#tooltip');
  el.onpointerover = (e) => {
    const b = e.target.closest('[data-b]'); if (!b) { tip.hidden = true; return; }
    const d = BUILDINGS[b.dataset.b];
    const inputs = d.in ? Object.entries(d.in).map(([g, n]) => `${n} ${gname(g)}`).join(' + ') : null;
    tip.innerHTML = `<b>${esc(d.name)}</b><br>${esc(d.desc)}${d.out ? `<br>${inputs ? inputs + ' → ' : ''}${gname(d.out)}, ${d.rate} a minute` : ''}${S.isUnlocked(s, b.dataset.b) ? '' : '<br>Unlock Thera to build this.'}`;
    const r = b.getBoundingClientRect(); tip.hidden = false;
    tip.style.left = Math.max(8, Math.min(innerWidth - 290, r.left)) + 'px'; tip.style.top = (r.top - tip.offsetHeight - 10) + 'px';
  };
  el.onpointerleave = () => { tip.hidden = true; };
}

/* ---------- spec panel ---------- */
const bar = (name, g, v, label) => `<div class="bar"><span class="nm">${dot(g)}${esc(name)}</span><span class="track"><span class="fill" style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;--c:${GOODS[g].color}"></span></span><output>${label}</output></div>`;

export function renderPanel(s, id, act) {
  const el = $('#panel'), b = id && S.byId(s, id);
  if (!b) { el.hidden = true; el.dataset.id = ''; return; }
  el.hidden = false;
  const isl = ISLANDS[b.island].name;
  let h = '';
  const linksIn = s.links.filter(l => l.to === b.id), linksOut = s.links.filter(l => l.from === b.id);
  const linkList = (ls, dir) => ls.length ? `<ul class="links">${ls.map(l => {
    const o = S.byId(s, dir === 'in' ? l.from : l.to);
    return `<li>${dot(l.good)}<span>${dir === 'in' ? 'From' : 'To'} ${esc(o ? S.label(o) : '?')}${o && o.island !== b.island ? ' (relay)' : ''}</span><small>${l.flow.toFixed(1)}/min</small><button class="btn sm" data-a="unlink" data-l="${l.id}" aria-label="Remove link">Remove</button></li>`;
  }).join('')}</ul>` : '<p class="muted" style="font-size:13.5px">None.</p>';

  if (b.type === 'core') {
    const cd = s.pulse.ready - s.time;
    h = `<div class="eyebrow">${dot('bits')}Heart of ${isl}</div><h2>Core</h2>
      <p class="desc">All the Bits your houses earn end up here. Press Pulse to double the speed of everything for 10 seconds.</p>
      <dl class="spec"><dt>Income</dt><dd>${fmt(s.incomeRate || 0)} Bits / s</dd><dt>Earned ever</dt><dd>${fmt(s.lifetime)} Bits</dd>
      <dt>Relay lanes</dt><dd>${s.relayLanes} (${s.relayLanes * 30} goods / min)</dd><dt>Relay in use</dt><dd>${s.islands.thera ? Math.round((s.relayUse || 0) * 100) + '%' : 'No relay yet'}</dd></dl>
      <div class="actions"><button class="btn primary" data-a="pulse" ${cd > 0 ? 'disabled' : ''}>${cd > 0 ? `Pulse in ${Math.ceil(cd)}s` : 'Pulse'}</button>
      ${s.islands.thera ? `<button class="btn" data-a="lane">Add relay lane (${fmt(S.laneCost(s))})</button>` : ''}</div>`;
  } else if (b.type === 'pod') {
    const t = S.tierOf(b), nt = TIERS[(b.tier || 0) + 1], up = S.canUpgrade(s, b);
    const ready = b.readyT >= 60;
    h = `<div class="eyebrow"><i class="dot" style="background:#9cc7e8"></i>House on ${isl} · ${t.residents} residents</div><h2>${t.name} house</h2>
      <p class="desc">${esc(t.blurb)}</p>
      <div class="sub">Core needs</div><div class="bars">${Object.keys(t.core).map(g => bar(gname(g), g, b.met[g] || 0, Math.round((b.met[g] || 0) * 100) + '%')).join('')}</div>
      ${Object.keys(t.comfort).length ? `<div class="sub">Bonus need (+${Math.round(t.bonus * 100)}% pay)</div><div class="bars">${Object.keys(t.comfort).map(g => bar(gname(g), g, b.met[g] || 0, Math.round((b.met[g] || 0) * 100) + '%')).join('')}</div>` : ''}
      <dl class="spec"><dt>Pays</dt><dd>${b.income.toFixed(1)} Bits / s</dd><dt>Full pay</dt><dd>${t.residents * t.rate} Bits / s, more with bonus</dd>
      ${nt ? `<dt>Upgrade</dt><dd>${ready ? 'Ready' : `${Math.round(Math.min(60, b.readyT))} / 60 s at 100%`}</dd>` : ''}</dl>
      ${missing(s, b)}
      <div class="actions">${nt ? `<button class="btn ${up ? '' : 'primary'}" data-a="upgrade" ${up ? 'disabled' : ''} title="${esc(up || '')}">Upgrade to ${nt.name} (${fmt(t.upCost)})</button>` : ''}
        <button class="btn" data-a="move">Move</button><button class="btn" data-a="link">Link</button><button class="btn" data-a="demolish">Demolish</button></div>
      ${nt && up ? `<p class="muted" style="font-size:13px;margin-top:8px">${esc(up)}</p>` : ''}
      <div class="sub">Supplied by</div>${linkList(linksIn, 'in')}`;
  } else {
    const d = BUILDINGS[b.type];
    const status = b.starved ? ['warn', 'Short on input. The building that feeds it is too slow or not linked.']
      : linksOut.length === 0 ? ['warn', 'Not linked to anything, so its goods have nowhere to go. Build something that uses ' + gname(d.out) + ', or press Link.']
      : linksOut.every(l => l.jam) ? ['warn', 'Everything it feeds is full. That is fine, or link it to more users.']
      : ['ok', 'Running.'];
    h = `<div class="eyebrow">${dot(d.out)}${d.kind === 'source' ? 'Raw building' : 'Refiner'} on ${isl}</div><h2>${esc(d.name)}</h2>
      <p class="desc">${esc(d.desc)}</p>
      <dl class="spec"><dt>Makes</dt><dd>${gname(d.out)}, ${d.rate} / min</dd>${d.in ? `<dt>Uses</dt><dd>${Object.entries(d.in).map(([g, n]) => n + ' ' + gname(g)).join(' + ')} each</dd>` : ''}
      <dt>Working</dt><dd>${Math.round(b.util * 100)}%</dd></dl>
      <div class="bars">${d.in ? Object.keys(d.in).map(g => bar('In: ' + gname(g), g, (b.buf[g] || 0) / IN_CAP, Math.floor(b.buf[g] || 0) + '/' + IN_CAP)).join('') : ''}
      ${bar('Out: ' + gname(d.out), d.out, b.out / OUT_CAP, Math.floor(b.out) + '/' + OUT_CAP)}</div>
      <p class="status ${status[0]}">${esc(status[1])}</p>
      ${d.in ? `<div class="sub">Supplied by</div>${linkList(linksIn, 'in')}` : ''}
      <div class="sub">Sends to</div>${linkList(linksOut, 'out')}
      <div class="actions"><button class="btn" data-a="move">Move</button><button class="btn" data-a="link">Link</button><button class="btn" data-a="demolish">Demolish (+${fmt((b.spent || 0) / 2)})</button></div>`;
  }
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
  // pointerdown, not click: the panel refreshes 4 times a second and a click needs the same element for press and release.
  el.onpointerdown = (e) => { if (e.button !== 0) return; const a = e.target.closest('[data-a]'); if (a && !a.disabled) { e.preventDefault(); act(a.dataset.a, b, a.dataset.l); } };
}

function missing(s, b) {
  const t = S.tierOf(b), out = [];
  for (const g of Object.keys(t.core)) {
    if (!s.links.some(l => l.to === b.id && l.good === g)) {
      const maker = Object.entries(BUILDINGS).find(([, d]) => d.out === g);
      out.push(`No ${gname(g)} link. ${maker ? `Build a ${maker[1].name}${S.isUnlocked(s, maker[0]) ? '' : ' (unlock Thera first)'}.` : ''}`);
    }
  }
  return out.length ? `<p class="status warn">${out.map(esc).join('<br>')}</p>` : '';
}

/* ---------- world tags ---------- */
export class Tags {
  constructor(world, s, onUnlock) { this.w = world; this.s = s; this.el = $('#tags'); this.items = []; this.key = ''; this.onUnlock = onUnlock; }
  rebuild() {
    const s = this.s, items = [];
    for (const k in ISLANDS) {
      const I = ISLANDS[k];
      if (s.islands[k]) items.push({ cls: 'isl', html: I.name, pos: [I.cx, 0.5, I.cz + I.rows * 2 + 2.5] });
      else {
        const full = S.podsFull(s), ok = full >= I.needPods;
        items.push({ id: 'lock-' + k, cls: 'lock', pos: [I.cx, 2, I.cz], html: `<b>${I.name}</b><span>Has ${I.raws.map(gname).join(' and ')}. Locked.</span>
          <span class="muted">${ok ? 'Ready to open.' : `Needs ${I.needPods} houses at 100% (now ${full}).`}</span>
          <button class="btn ${ok && s.bits >= I.unlockCost ? 'primary' : ''}" data-u="${k}" ${ok && s.bits >= I.unlockCost ? '' : 'disabled'}>Unlock for ${fmt(I.unlockCost)} Bits</button>` });
      }
    }
    for (const b of s.buildings) {
      if (b.type === 'core') continue;
      const [x, z] = S.worldPos(b), y = b.type === 'pod' ? (b.tier ? 3.6 : 2.6) : 3.6;
      if (b.type === 'pod' && b.readyT >= 60 && (b.tier || 0) < TIERS.length - 1 && s.islands.thera) items.push({ cls: 'up', html: 'Upgrade ready', pos: [x, y, z] });
      else if (b.starved) items.push({ cls: 'warn', html: b.type === 'pod' ? 'Needs goods' : 'Short on input', pos: [x, y, z], blink: true });
      else if (b.type !== 'pod' && !s.links.some(l => l.from === b.id)) items.push({ cls: 'warn', html: 'Not linked', pos: [x, y, z], blink: true });
    }
    // Reuse existing tag nodes so buttons inside them are not replaced while you click.
    this.nodes = this.nodes || new Map();
    const keep = new Map();
    this.items = items.map(i => {
      const k = i.id || (i.cls + '@' + i.pos.join());
      let n = this.nodes.get(k);
      if (!n) { n = document.createElement('div'); this.el.appendChild(n); }
      n.className = 'tag ' + i.cls;
      if (n.dataset.html !== i.html) {
        n.dataset.html = i.html; n.innerHTML = i.html;
        n.querySelectorAll('[data-u]').forEach(btn => btn.addEventListener('click', () => this.onUnlock(btn.dataset.u)));
      }
      keep.set(k, n);
      return { ...i, node: n };
    });
    for (const [k, n] of this.nodes) if (!keep.has(k)) n.remove();
    this.nodes = keep;
  }
  place(t) {
    for (const i of this.items) {
      const p = this.w.project(...i.pos), n = i.node;
      if (p.behind) { n.style.display = 'none'; continue; }
      n.style.display = '';
      n.style.transform = `translate(${p.x - n.offsetWidth / 2}px, ${p.y - n.offsetHeight}px)`;
      if (i.blink) n.style.opacity = (Math.sin(t * 5) > -0.3) ? 1 : 0.35;
    }
  }
}

/* ---------- modals ---------- */
export const glossaryHtml = () => `<h2>Glossary</h2><table>${GLOSSARY.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
export const controlsHtml = () => `<h2>Controls</h2><p class="muted">Modelled on Anno 1800, so one hand on the mouse runs everything.</p><table>
  <tr><td>Left-click</td><td>Select a building, or place one while building</td></tr>
  <tr><td>Left-drag empty ground</td><td>Pan the map</td></tr>
  <tr><td>Mouse wheel</td><td>Zoom. The camera tilts lower as you zoom in</td></tr>
  <tr><td>Middle-drag</td><td>Rotate the view</td></tr>
  <tr><td>Right-click</td><td>Cancel building, moving or linking, or deselect</td></tr>
  <tr><td>Screen edges</td><td>Pan (can be turned off in Settings)</td></tr>
  <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows</td><td>Pan</td></tr>
  <tr><td><kbd>Q</kbd> <kbd>E</kbd></td><td>Rotate</td></tr>
  <tr><td><kbd>F</kbd></td><td>While building: place at the suggested spot</td></tr>
  <tr><td><kbd>Esc</kbd></td><td>Cancel or deselect</td></tr></table>`;
export const settingsHtml = (s) => `<h2>Settings</h2>
  ${[['dark', 'Dark mode'], ['edgeScroll', 'Pan when the mouse touches the screen edge'], ['autoUpgrade', 'Upgrade houses automatically when ready and affordable'], ['calm', 'Calm mode: fewer moving effects']]
    .map(([k, l]) => `<label class="opt"><input type="checkbox" data-s="${k}" ${s.settings[k] ? 'checked' : ''}>${l}</label>`).join('')}
  <div class="sub" style="margin-top:16px">Save</div>
  <p class="muted" style="font-size:14px">The game saves to this browser every 15 seconds. Copy the code below to back it up or move it to another browser.</p>
  <textarea id="saveText" spellcheck="false"></textarea>
  <div class="actions"><button class="btn" data-x="copy">Copy save</button><button class="btn" data-x="load">Load pasted save</button><button class="btn" data-x="reset">Start over</button></div>
  <p id="saveMsg" class="muted" style="font-size:13.5px;margin-top:8px"></p>`;
export const awayHtml = (r) => {
  const h = Math.floor(r.seconds / 3600), m = Math.floor(r.seconds % 3600 / 60);
  return `<h2>While you were away</h2><p class="muted">${h ? h + ' h ' : ''}${m} min${r.capped ? ' (counted up to 24 hours)' : ''}</p>
  <div class="big">+${fmt(r.earned)} Bits</div>
  ${r.upgraded ? '<p>Some houses upgraded while you were gone.</p>' : ''}
  ${r.jams ? `<p>${r.jams} link${r.jams > 1 ? 's are' : ' is'} jammed. Look for packets piling up.</p>` : '<p>No jams. Everything flowed.</p>'}
  <div class="actions"><button class="btn primary" data-x="ok">Back to it</button></div>`;
};
