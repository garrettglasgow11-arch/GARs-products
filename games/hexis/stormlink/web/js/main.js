/* main.js — boot, input sampling, and the frame loop.
 *
 * The loop runs on two clocks, and getting the relationship between them right
 * is most of what makes a predicted client feel solid.
 *
 *   render    every animation frame, as fast as the display allows
 *   sim       a fixed 30 Hz accumulator — the server's tick rate exactly
 *
 * Input is sampled every rendered frame (so a press on a 144 Hz display is
 * never missed) but consumed in fixed steps: one input packet per simulation
 * step, predicted with the same dt the server will use when it applies it.
 *
 * That last part is the whole trick. The obvious design — predict with the
 * render dt and send at some capped rate — produces a small divergence on
 * *every single frame*, because the client integrated 1/144 s at a time and
 * the server integrated 1/30 s at a time over the same interval. Damped
 * acceleration is not linear, so those do not agree, and the reconciliation
 * step then fights the prediction forever. Stepping both at 1/30 makes the
 * two exactly equal, and the correction goes to zero on a clean connection.
 *
 * The cost of a fixed step is that positions only advance 30 times a second,
 * which on a fast display would be visibly steppy. So the renderer draws the
 * local player interpolated between the previous and current predicted step
 * by however much of the next step has accumulated — smooth at any refresh
 * rate, still exact at every step boundary.
 */

import { Net, BTN } from './net.js';
import { Predictor } from './predict.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';


const state = {
  net: new Net(),
  pred: null,
  ren: null,
  hud: null,
  names: new Map(),
  keys: Object.create(null),
  edge: Object.create(null),
  touch: matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window,
  stick: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  buttons: 0,
  last: 0,
  acc: 0,
  prevDraw: null,
  running: false
};

boot();

async function boot() {
  if (!window.THREE) {
    fail('three.js did not load. Drop three.min.js into web/vendor/ and reload.');
    return;
  }
  const canvas = document.querySelector('#gl');
  state.ren = new Renderer(canvas);
  state.hud = new Hud(document.querySelector('#hud'));

  const form = document.querySelector('#gate');
  const input = document.querySelector('#pname');
  input.value = localStorage.getItem('stormlink.name') || 'Hexis';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (input.value || 'Hexis').slice(0, 18);
    localStorage.setItem('stormlink.name', name);
    document.querySelector('#gatebtn').disabled = true;
    try { await join(name); } catch (err) {
      document.querySelector('#gatebtn').disabled = false;
      fail(String(err.message || err));
    }
  });
}

function fail(msg) {
  const n = document.querySelector('#gateerr');
  if (n) { n.textContent = msg; n.classList.add('on'); }
}

async function join(name) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws?name=${encodeURIComponent(name)}`;
  const w = await state.net.connect(url);

  state.names.set(w.id, w.name);
  // Everyone who was already here. Without this the first snapshot draws
  // avatars the client has no name for, which is what "P1002" used to be.
  for (const [id, n] of Object.entries(w.roster || {})) state.names.set(Number(id), n);
  state.pred = new Predictor(w.constants, w.boxes, w.arenaR);
  state.ren.buildArena(w.arenaR, w.boxes);
  document.querySelector('#gatewrap').classList.add('gone');
  document.querySelector('#hud').classList.add('on');
  state.hud.set('name', w.name + '  ·  ' + w.room);

  state.net.onEvent = (e) => {
    if (e.t === 'roster') {
      if (e.join) state.names.set(e.id, e.name); else state.names.delete(e.id);
      return;
    }
    state.hud.event(e);
  };
  state.net.onClose = () => {
    state.running = false;
    document.querySelector('#gatewrap').classList.remove('gone');
    document.querySelector('#gatebtn').disabled = false;
    fail('Disconnected. The server may have restarted.');
  };

  bindInput();
  setInterval(() => state.net.ping(), 1000);
  state.net.ping();

  state.running = true;
  state.last = performance.now();
  requestAnimationFrame(frame);
}

/* --- input ---------------------------------------------------------------- */
function bindInput() {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Enter') { toggleChat(); return; }
    if (chatOpen()) return;
    state.keys[e.code] = true;
    state.edge[e.code] = true;
    if (['Space', 'Tab', 'ShiftLeft'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { state.keys[e.code] = false; });
  addEventListener('blur', () => { state.keys = Object.create(null); state.edge = Object.create(null); });

  const canvas = document.querySelector('#gl');
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
  });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas && !state.rmb) return;
    state.look.x += e.movementX || 0;
    state.look.y += e.movementY || 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { state.keys.M1 = true; state.edge.M1 = true; }
    if (e.button === 2) { state.rmb = true; state.keys.M2 = true; state.edge.M2 = true; }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) state.keys.M1 = false;
    if (e.button === 2) { state.rmb = false; state.keys.M2 = false; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => {
    state.ren.cam.dist = Math.max(3, Math.min(16, state.ren.cam.dist * (e.deltaY < 0 ? 0.9 : 1.11)));
  }, { passive: true });

  if (state.touch) bindTouch();

  const chat = document.querySelector('#chatin');
  chat.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.code === 'Escape') { toggleChat(false); }
    if (e.code === 'Enter') {
      const t = chat.value.trim();
      if (t) state.net.ws.send(JSON.stringify({ t: 'chat', text: t }));
      chat.value = '';
      toggleChat(false);
    }
  });
}

function chatOpen() { return document.querySelector('#chatwrap').classList.contains('on'); }
function toggleChat(force) {
  const w = document.querySelector('#chatwrap');
  const on = force === undefined ? !w.classList.contains('on') : force;
  w.classList.toggle('on', on);
  if (on) { document.exitPointerLock && document.exitPointerLock(); document.querySelector('#chatin').focus(); }
  else document.querySelector('#chatin').blur();
}

function bindTouch() {
  document.querySelector('#touch').classList.add('on');
  const pad = document.querySelector('#stick'), nub = document.querySelector('#nub');
  let sid = null, cx = 0, cy = 0;
  const R = 54;
  pad.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; sid = t.identifier;
    const r = pad.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });
  pad.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== sid) continue;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) { dx *= R / d; dy *= R / d; }
      nub.style.transform = `translate(${dx}px,${dy}px)`;
      state.stick.x = dx / R; state.stick.y = -dy / R;
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === sid) {
      sid = null; state.stick.x = state.stick.y = 0; nub.style.transform = '';
    }
  };
  pad.addEventListener('touchend', end);
  pad.addEventListener('touchcancel', end);

  let lid = null, lx = 0, ly = 0;
  addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (lid !== null || t.clientX < innerWidth * 0.4) continue;
      if (t.target.closest('#tbtns,#stick,#chatwrap')) continue;
      lid = t.identifier; lx = t.clientX; ly = t.clientY;
    }
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lid) {
      state.look.x += (t.clientX - lx) * 1.8;
      state.look.y += (t.clientY - ly) * 1.8;
      lx = t.clientX; ly = t.clientY;
    }
  }, { passive: true });
  const lend = (e) => { for (const t of e.changedTouches) if (t.identifier === lid) lid = null; };
  addEventListener('touchend', lend); addEventListener('touchcancel', lend);

  document.querySelectorAll('#tbtns [data-k]').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); state.keys[k] = true; state.edge[k] = true; }, { passive: false });
    const up = (e) => { e.preventDefault(); state.keys[k] = false; };
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
  });
}

function sampleButtons() {
  const k = state.keys, e = state.edge;
  let b = 0;
  if (e.Space || e.T_JUMP) b |= BTN.JUMP;
  if (k.ShiftLeft || k.ShiftRight || k.T_DASH) b |= BTN.DASH;
  if (e.M1 || e.T_ATK) b |= BTN.ATTACK;
  if (e.KeyQ || e.T_HEAVY) b |= BTN.HEAVY;
  if (k.KeyF || k.M2 || k.T_GUARD) b |= BTN.GUARD;
  if (e.KeyE || e.T_BOLT) b |= BTN.BOLT;
  if (e.KeyR) b |= BTN.ULT;
  if (e.Space || e.M1 || e.T_ATK) b |= BTN.RESPAWN;
  return b;
}

/* --- the frame ------------------------------------------------------------ */
function frame(now) {
  if (!state.running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - state.last) / 1000);
  state.last = now;

  const net = state.net, pred = state.pred, ren = state.ren;

  // Camera from accumulated look delta.
  const sens = 0.0022;
  ren.cam.yaw -= state.look.x * sens;
  ren.cam.pitch = Math.max(-0.35, Math.min(1.15, ren.cam.pitch + state.look.y * sens));
  state.look.x = state.look.y = 0;

  // Movement intent, camera relative. The server rotates it by the yaw it is
  // given, so the client only has to say "forward" and "right".
  let mx = 0, my = 0;
  if (state.keys.KeyW) my += 1;
  if (state.keys.KeyS) my -= 1;
  if (state.keys.KeyA) mx -= 1;
  if (state.keys.KeyD) mx += 1;
  if (state.touch) { mx += state.stick.x; my += state.stick.y; }
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }

  const yaw = ren.cam.yaw + Math.PI;

  // Edges are latched, not read: a key pressed and released between two
  // simulation steps still produces exactly one press on the wire.
  state.buttons |= sampleButtons();
  state.edge = Object.create(null);

  // Fixed-step simulation. Capped so a tab that was backgrounded for a minute
  // does not try to replay eighteen hundred steps in one frame.
  const step = net.welcome ? net.welcome.constants.tickDT : 1 / 30;
  state.acc = Math.min(state.acc + dt, step * 6);
  let steps = 0;
  while (state.acc >= step && pred) {
    state.acc -= step;
    steps++;
    state.prevDraw = pred.render();
    pred.apply(state.buttons, mx, my, yaw, step);
    const sent = net.sendInput(state.buttons, mx, my, yaw, ren.cam.pitch, step * 1000);
    if (sent) pred.push(sent, state.buttons, mx, my, yaw);
    state.buttons = 0;
  }

  // Reconcile against the newest snapshot, once per snapshot.
  if (net.snapshot && pred && net.snapshot.tick !== state._lastRec) {
    state._lastRec = net.snapshot.tick;
    const me0 = net.snapshot.players.find(p => p.id === net.id);
    pred.reconcile(me0, net.snapshot.ack);
    if (steps === 0) state.prevDraw = pred.render();
  }

  // Draw between the last two simulation steps, so a 144 Hz display gets 144
  // distinct positions out of a 30 Hz simulation.
  const cur = pred ? pred.render() : { x: 0, y: 0, z: 0 };
  const a = state.prevDraw || cur;
  const k = pred ? Math.min(1, state.acc / step) : 1;
  const draw = { x: a.x + (cur.x - a.x) * k, y: a.y + (cur.y - a.y) * k, z: a.z + (cur.z - a.z) * k };

  ren.update(net, { ...draw, yaw }, dt, now);
  ren.updateCamera(draw, dt, net.welcome ? net.welcome.boxes : []);
  ren.draw();

  const snap = net.snapshot;
  const me = snap ? snap.players.find(p => p.id === net.id) : null;
  state.hud.update(net, me, dt);
  state.hud.scoreboard(snap, state.names, net.id);
  if ((state._gf = (state._gf || 0) + 1) % 4 === 0) state.hud.graph(net, pred);
}

addEventListener('resize', () => {
  if (state.ren) state.ren.resize(innerWidth, innerHeight);
});
if (state.ren) state.ren.resize(innerWidth, innerHeight);
