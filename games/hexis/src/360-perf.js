/* ===== 360-perf.js ========================================================
   HEXIS 3.0 — holding the frame with three times the content in it.

   2.4.2 through 2.4.6 took the frame apart in the right order: draw calls,
   triangles, DOM writes, then fill rate. What none of those passes touched is
   allocation, because until this build the combat loop was small enough that
   the garbage it made never crossed a collection threshold mid-fight.

   3.0 changes that. Nine hostiles, objective props, a boss with hazards and
   three afterimages, and a job runner ticking every frame — all of them go
   through the same three helpers, and all three allocate:

     get targets     builds a NEW array on every read. `Fight.update` reads it
                     once per live bolt (16), `resolveHit` once per swing,
                     `chainTo` once per chain jump, `updateStorm` once every
                     0.3 s, and the static aura once a second. In a real fight
                     that is 20-40 array allocations per frame, each one
                     copying the enemy list and walking every prop.
     Bus.emit        copies its listener array on every emit, to survive a
                     listener unsubscribing mid-emit. `damage:dealt` fires on
                     every hit of every chain — hundreds a second.
     Director        `enemies.filter(...)` every frame, twice.

   None of that shows on a draw-call counter or a GPU timer. It shows as a
   collection pause every few seconds, which reads as exactly the periodic
   hitch the earlier passes were chasing.

   Plus one thing that is not an optimisation but a budget: the survive and
   horde stages can ask for more bodies than a phone can animate, so the
   spawn cap is now tied to the same measurement the resolution scaler uses.
   ========================================================================= */

const Perf3 = {
  /* Rebuilt at most once per frame, in place. Everything that reads
     `game.targets` gets the same array, so a swing that kills something sees
     it die on the next frame rather than mutating the list underneath a loop
     that is still running — which is also the safer semantics. */
  targets: [],
  stamp: -1,
  /* Hard ceiling on simultaneous live hostiles, lowered on a device that is
     not holding frame. Bodies are the most expensive thing in the game: each
     one is a pose solve, a separation query, a blob shadow and a health pip. */
  cap: { desktop: 14, touch: 8 },
  capNow: 14,
  drops: 0
};

(function perf3Pass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[perf3] ' + n, e); } };

  /* ---------------------------------------------------------------- TARGETS
     Same contents, same order, one allocation per frame instead of thirty.
     The frame counter is the invalidation key: `Expansion.frame` already
     increments once per frame and is the only counter guaranteed to move
     even while the game is paused mid-cutscene. */
  step('targets', () => {
    Object.defineProperty(Game.prototype, 'targets', {
      configurable: true,
      get: function () {
        const f = this.ex ? this.ex.frame : (this._fc || 0);
        if (Perf3.stamp === f) return Perf3.targets;
        Perf3.stamp = f;
        const out = Perf3.targets;
        out.length = 0;
        const E = this.enemies;
        for (let i = 0; i < E.length; i++) out.push(E[i]);
        const P = this.props;
        for (let i = 0; i < P.length; i++) if (!P[i].dead) out.push(P[i]);
        const b = this.boss;
        if (b && !b.dead) {
          const mercy = (b.phase === 4 && typeof BossController !== 'undefined' &&
                         b instanceof BossController);
          if (!mercy) out.push(b);
        }
        return out;
      }
    });
    // Anything that spawns or dies mid-frame has to be visible immediately to
    // the next reader, or a bolt fired this frame can hit a corpse.
    const bust = () => { Perf3.stamp = -1; };
    Bus.on('enemy:spawned', bust);
    Bus.on('enemy:killed', bust);
    Bus.on('prop:destroyed', bust);
    Bus.on('boss:killed', bust);
    Bus.on('zone:loaded', bust);
  });

  /* -------------------------------------------------------------------- BUS
     The slice exists to survive `off()` from inside a listener. That is a
     real hazard and worth defending, but it does not need a copy every time:
     mark the array as being iterated, and have `off` copy-on-write instead.
     Emits are thousands of times more frequent than unsubscribes. */
  step('bus', () => {
    Bus.emit = function (evt, ...args) {
      const a = this.map.get(evt);
      if (!a || !a.length) return;
      const wasIterating = a.__it;
      a.__it = true;
      for (let i = 0; i < a.length; i++) {
        const l = a[i];
        if (!l) continue;
        try { l.fn.apply(l.ctx, args); }
        catch (e) { console.warn('[bus] ' + evt + ' listener threw', e); }
      }
      a.__it = wasIterating;
      if (!wasIterating && a.__dirty) {
        a.__dirty = false;
        for (let i = a.length - 1; i >= 0; i--) if (!a[i]) a.splice(i, 1);
      }
    };
    Bus.off = function (evt, fn) {
      const a = this.map.get(evt);
      if (!a) return;
      for (let i = a.length - 1; i >= 0; i--) {
        if (a[i] && a[i].fn === fn) {
          // Tombstone while a loop is walking the array; splice otherwise.
          if (a.__it) { a[i] = null; a.__dirty = true; } else a.splice(i, 1);
        }
      }
    };
  });

  /* --------------------------------------------------------------- DIRECTOR
     Two filters a frame become one reused array. `separate` is the hot one:
     it runs every frame and rebuilds the spatial hash from its result. */
  step('director', () => {
    if (typeof Director === 'undefined') return;
    const live = [];
    Hook.set(Director.prototype, 'separate', function (dt) {
      live.length = 0;
      const E = this.g.enemies;
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (!e.dead && !e.static) live.push(e);
      }
      if (live.length < 2) return;
      this.grid.rebuild(live, e => e.pos.x, e => e.pos.z);
      const out = this._sepOut || (this._sepOut = []);
      const k = dt * 60 * 0.016;
      for (let i = 0; i < live.length; i++) {
        const e = live[i];
        this.grid.query(e.pos.x, e.pos.z, 3, out);
        for (let j = 0; j < out.length; j++) {
          const o = out[j];
          if (o === e) continue;
          const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
          const d2 = dx * dx + dz * dz;
          const want = (e.radius + o.radius) * 1.05;
          if (d2 > want * want || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const push = (want - d) / want;
          const mine = o.mass / (e.mass + o.mass);
          e.vel.x += (dx / d) * push * 14 * mine * k;
          e.vel.z += (dz / d) * push * 14 * mine * k;
        }
      }
    }, 'perf3:separate');

    // `heat` walked the list a second time. Fold it into the same pass.
    Hook.set(Director.prototype, 'update', function (dt) {
      this.t += dt;
      for (const e of Array.from(this.held)) if (e.dead) this.release(e);
      for (let i = 0; i < this.slots.length; i++) if (this.slots[i] && this.slots[i].dead) this.slots[i] = null;
      this.separate(dt);
      let heat = 0;
      const E = this.g.enemies;
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (!e.dead && e.alert === 'combat') heat += e.tier || 1;
      }
      this.heat = damp(this.heat, heat, 2, dt);
    }, 'perf3:director.update');
  });

  /* ------------------------------------------------------------- BODY BUDGET
     A cap, not a cull: refusing to spawn is invisible, deleting a body that
     is already fighting you is not. The number tracks the same fps signal the
     resolution scaler reads, so a device that is coping keeps the full fight
     and a device that is not gets a smaller one instead of a slideshow. */
  step('cap', () => {
    Perf3.capNow = Input.touch ? Perf3.cap.touch : Perf3.cap.desktop;

    Hook.wrap(Game.prototype, 'spawnEnemy', function (base, kind, pos) {
      let live = 0;
      const E = this.enemies;
      for (let i = 0; i < E.length; i++) if (!E[i].dead) live++;
      if (live >= Perf3.capNow) {
        Perf3.drops++;
        // Hand back the nearest live body rather than null: every caller
        // stores the result and several of them count it, and a null in a
        // job's spawn list would make that job uncompletable.
        let best = null, bd = 1e9;
        for (let i = 0; i < E.length; i++) {
          const e = E[i];
          if (e.dead) continue;
          const d = e.pos.distanceToSquared(pos);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) return best;
      }
      return base.call(this, kind, pos);
    }, 'perf3:spawnCap');

    // Retune once a second against measured frame rate.
    let t = 0;
    Hook.after(Game.prototype, 'frame', function () {
      t += this._dtAvg || 0.016;
      if (t < 1) return;
      t = 0;
      const max = Input.touch ? Perf3.cap.touch : Perf3.cap.desktop;
      const fps = this._fps || 60;
      const want = fps < 34 ? Math.max(4, max - 4)
        : fps < 46 ? Math.max(5, max - 2)
        : max;
      if (want !== Perf3.capNow) Perf3.capNow = want;
    }, 'perf3:capTune');
  });

  /* ------------------------------------------------------------------- PIPS
     Every hostile carries a HealthPip: a sprite plus a 128x16 canvas that is
     repainted whenever its value moves by more than 0.4%. In a nine-body
     fight with chain lightning that is nine canvas repaints and nine texture
     uploads per frame — a texture upload being one of the few things that can
     stall the driver mid-frame.

     Two limits: repaint at most a handful per frame, round-robin, and do not
     paint one that is off screen at all. Neither is visible: a bar that
     updates at 20 Hz instead of 60 looks identical. */
  step('pips', () => {
    if (typeof HealthPip === 'undefined') return;
    const MAX_PAINTS = 3;
    Hook.set(HealthPip.prototype, 'update', function (e, dt, camPos) {
      const show = e.showBarT > 0 && !e.dead;
      this.s.visible = show;
      if (!show) return;
      const d = camPos ? camPos.distanceTo(e.pos) : 10;
      if (d > 60) { this.s.visible = false; return; }

      const hp = e.hp / e.maxHp;
      const sh = e.shieldMax ? e.shieldHp / e.shieldMax : 0;
      const stale = Math.abs(hp - this.last) > 0.004 || Math.abs(sh - this.lastShield) > 0.004;
      if (stale) {
        // Round-robin the repaints so a nine-body fight spreads its canvas
        // work across three frames instead of doing all of it on one.
        if (Perf3.painted === undefined || Perf3.painted < MAX_PAINTS || d < 14) {
          Perf3.painted = (Perf3.painted || 0) + 1;
          this.draw(hp, sh, e.def.color);
          this.last = hp; this.lastShield = sh;
        }
      }
      this.s.position.copy(e.pos);
      this.s.position.y += (e.def.height || 1.8) + 0.35;
      const k = clamp(d / 18, 0.7, 2.6);
      this.s.scale.set(1.1 * k, 0.14 * k, 1);
      this.s.material.opacity = clamp(e.showBarT, 0, 1) * clamp(1 - (d - 45) / 15, 0, 1);
    }, 'perf3:pip');

    Hook.before(Game.prototype, 'frame', function () {
      Perf3.painted = 0;
    }, 'perf3:pipReset');
  });

  /* --------------------------------------------------------------- HAZARDS
     Boss hazards are filtered into a new array every frame by BossBase.update
     (`this.hazards = this.hazards.filter(...)`). During the Architect's
     pillars move there are ten of them, so that is ten frames of a fresh
     array. Compact in place instead. */
  step('hazards', () => {
    if (typeof BossBase === 'undefined') return;
    Hook.wrap(BossBase.prototype, 'update', function (base, dt) {
      const r = base.call(this, dt);
      const H = this.hazards;
      if (H && H.length) {
        let w = 0;
        for (let i = 0; i < H.length; i++) if (!H[i].dead) H[w++] = H[i];
        H.length = w;
      }
      return r;
    }, 'perf3:hazards');
  });

  /* ------------------------------------------------------------------ REPORT
     Folded into the existing profiler rather than a new overlay: F3 already
     shows draw calls and frame time, so the two numbers this pass owns —
     bodies live against the cap, and spawns refused — go in the same place. */
  step('report', () => {
    let t = 0;
    Hook.after(Game.prototype, 'frame', function () {
      if (typeof Gui === 'undefined' || !Gui.profiler) return;
      t += this._dtAvg || 0.016;
      if (t < 1) return;
      t = 0;
      let live = 0;
      for (const e of this.enemies) if (!e.dead) live++;
      const box = document.querySelector('#gui-prof');
      if (!box) return;
      let row = box.querySelector('[data-k="bodies"]');
      if (!row) {
        const d = document.createElement('div');
        d.className = 'r';
        d.innerHTML = '<span>bodies</span><b data-k="bodies">—</b>';
        box.insertBefore(d, box.querySelector('.note'));
        row = d.querySelector('b');
      }
      row.textContent = live + ' / ' + Perf3.capNow + (Perf3.drops ? '  (' + Perf3.drops + ' held)' : '');
    }, 'perf3:report');
  });

  console.log('[hexis 3.0] perf online:', done.join(', ') +
    '  ·  body cap ' + Perf3.capNow);
})();
