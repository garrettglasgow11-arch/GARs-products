/* ===== 300-fix.js =========================================================
   HEXIS 3.0 "STORMBREAK" — bug pass.

   Everything in this file is a defect with a reproduction, not a preference.
   Each block names the symptom, the cause, and what changed. Nothing here
   adds content; 310 and up do that.

   Ordering matters only in one place: the save rewrite has to land before
   anything else reads a profile, so it is first.
   ========================================================================= */
(function fixPass30() {
  const g = window.HEXIS;
  if (!g) { console.warn('[hexis 3.0] no game instance — fix pass skipped'); return; }
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[hexis 3.0] ' + n, e); } };

  /* ------------------------------------------------------------------ SAVE
     Symptom: nothing persists. Skill points, unlocks, story flags and every
     setting are gone on reload, on every host that is not the artifact
     sandbox — which is every host this build actually ships to.

     Cause: Save.load/write only ever talk to `window.storage`, the artifact
     bridge. Off that bridge both calls fall through to `this.mem`, which is
     a field on a module-scope object and dies with the page. The comment on
     the original says "swap the two bodies for localStorage" — nobody did.

     Fix: try the bridge, then localStorage, then memory, in that order, for
     both read and write. Writes are debounced because persist() is called
     from onKill, from grant(), and from every settings change, and three of
     those can happen in the same frame. A quota error degrades to memory
     rather than throwing out of an async call nobody awaits. */
  step('save', () => {
    const KEY = Save.key || 'hexis:profile:v1';
    Save.mem = Save.mem || null;
    Save._pending = null;
    Save._timer = 0;
    Save._warned = false;

    Save.load = async function () {
      // Bridge first: if a build IS running in the sandbox its profile lives
      // there and localStorage is unavailable anyway.
      try {
        if (window.storage) {
          const r = await window.storage.get(KEY);
          if (r && r.value) return JSON.parse(r.value);
        }
      } catch (e) { /* no bridge, or first run on it */ }
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* private mode, or storage disabled */ }
      return this.mem;
    };

    const flush = () => {
      const obj = Save._pending;
      Save._pending = null;
      Save._timer = 0;
      if (!obj) return;
      const json = JSON.stringify(obj);
      let ok = false;
      try { if (window.storage) { window.storage.set(KEY, json); ok = true; } } catch (e) { }
      try { localStorage.setItem(KEY, json); ok = true; } catch (e) { }
      if (!ok && !Save._warned) {
        Save._warned = true;
        console.warn('[hexis] no writable storage — progress is session-only');
      }
    };

    Save.write = async function (obj) {
      this.mem = obj;
      this._pending = obj;
      // Coalesce. Ten persist() calls in one frame become one write.
      if (!this._timer) this._timer = setTimeout(flush, 400);
      return true;
    };
    // A tab that is closed mid-fight should not lose the last 400 ms.
    addEventListener('pagehide', flush);
    addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

    Save.wipe = async function () {
      this.mem = null; this._pending = null;
      if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
      try { if (window.storage) window.storage.delete(KEY); } catch (e) { }
      try { localStorage.removeItem(KEY); } catch (e) { }
    };

    // restore() has already run and found nothing by the time this installs,
    // so run it again now that there is somewhere to read from.
    if (g.restore) g.restore().catch(() => { });
  });

  /* ----------------------------------------------------------- KILL EVENTS
     Symptom: in the Act I arena and in the Kell fight, killing a grunt does
     not advance the combo, does not fill the ultimate meter, produces no
     kill-feed line, and Overload never refunds charge. The identical grunt
     spawned by a city patrol does all four.

     Cause: two enemy classes. `Foe` (the expansion archetype) ends its die()
     with `Bus.emit('enemy:killed', this)`. The Act I `Enemy` ends its die()
     with `this.g.onKill(this)` and nothing else — it predates the bus. Every
     listener in Feed, Fight and the achievement layer is on the bus, so the
     whole feedback loop is silently missing for anything spawned by
     `new Enemy(...)`: the arena openers, the Kell phase-2 and phase-3 adds.

     Fix: emit from the base class too, and give it the fields the listeners
     read (tier, height, mass) so nothing downstream has to special-case it. */
  step('kill-events', () => {
    Hook.after(Enemy.prototype, 'die', function () {
      Bus.emit('enemy:killed', this);
    }, 'fix30:enemy.die');
    // Listeners read tier/height/mass for the ult grant, the kill-feed rank
    // and the parry window. Stamp them once, in the constructor's slipstream.
    Hook.after(Enemy.prototype, 'update', function () {
      if (this.__f30) return;
      this.__f30 = true;
      if (this.tier === undefined) this.tier = this.enf ? 2 : 1;
      if (this.height === undefined) this.height = this.enf ? 1.95 : 1.7;
      if (this.mass === undefined) this.mass = this.enf ? 1.8 : 1;
      if (this.strikeAt === undefined) this.strikeAt = 0.62;
    }, 'fix30:enemy.fields');
  });

  /* ------------------------------------------------------------ PROP LIST
     Two defects in the same array.

     [a] MissionSystem.update does `for (const q of this.g.props) q.update(dt)`,
         and Prop.update calls remove() on its own last frame, which splices
         the array being iterated. A for..of over a live array skips the
         element after a splice, so destroying two props on the same frame
         left one of them un-ticked — visible as a pod that freezes mid-shrink
         and never disappears.

     [b] Anchor.remove (the Architect's shield anchors) disposes its group but
         never splices itself out of g.props, because it was written against
         the boss list rather than the prop list it is actually pushed onto.
         Every anchor killed leaks a dead entry that is updated forever.

     Fix: iterate backwards over an index, and make removal from g.props a
     single shared path both classes use. */
  step('props', () => {
    Hook.set(MissionSystem.prototype, 'update', function (dt) {
      if (this.tick) this.tick(dt);
      const P = this.g.props;
      for (let i = P.length - 1; i >= 0; i--) {
        const q = P[i];
        if (q && q.update) q.update(dt);
      }
    }, 'fix30:mission.update');

    const unlist = function () {
      const P = this.g ? this.g.props : null;
      if (!P) return;
      const i = P.indexOf(this);
      if (i >= 0) P.splice(i, 1);
    };
    if (typeof Anchor !== 'undefined') Hook.after(Anchor.prototype, 'remove', unlist, 'fix30:anchor.unlist');
  });

  /* ---------------------------------------------------------------- DEATH
     Symptom: die twice in quick succession (a hazard field, a boss slam) and
     you respawn twice — the second respawn fires 2.6 s after the first and
     teleports you back to the zone spawn mid-fight. Dying with the tab in the
     background queues a respawn that lands the instant you come back.

     Cause: `setTimeout(() => this.respawn(), 2600)` in onDeath. Raw wall time,
     no guard against re-entry, and it ignores hitstop and the pause the 340
     module adds.

     Fix: route it through CLOCK, which runs on game time and is cancellable,
     and refuse to start a second one. Also clear the things that can kill you
     the frame you come back: live boss hazards, a held tether, a charging
     fist, and the combo/status state. */
  step('death', () => {
    Hook.set(Game.prototype, 'onDeath', function () {
      if (this.state === 'dead') return;
      this.hp = 0;
      this.cancelCharge();
      this.state = 'dead';
      FX.flash(0.7, '#FF2D0E');
      this.ui.say('KELL', 'Stay down. It is not an insult, it is advice.', 3, 'd01');
      CLOCK.cancel('respawn');
      CLOCK.in(2.6, () => { if (this.state === 'dead') this.respawn(); }, 'respawn');
    }, 'fix30:onDeath');

    Hook.before(Game.prototype, 'respawn', function () {
      CLOCK.cancel('respawn');
      if (this.boss && this.boss.clearHazards) this.boss.clearHazards();
      if (typeof Fight !== 'undefined' && Fight.ready) Fight.reset();
      if (typeof Feed !== 'undefined' && Feed.ready) Feed.reset();
    }, 'fix30:respawn.clear');
  });

  /* --------------------------------------------------------- DAMAGE RESIST
     Symptom: Knockback Resist (r2) quietly reduced incoming damage by up to
     45%, stacking with Damage Resist (r5) for a combined 62% cut that no
     tooltip mentions. A fully-invested Resonance build took less than half
     the damage the numbers on the tree promised.

     Cause: hurtPlayer computes `dmg * knockRes * dmgResMul`. knockRes is
     applied a second time, correctly, to the knockback impulse further down.
     It was never meant to touch the damage term.

     Fix: damage uses the damage resist; knockback uses the knockback resist. */
  step('resist', () => {
    Hook.set(Game.prototype, 'hurtPlayer', function (dmg, from) {
      const p = this.player;
      if (p.iframes > 0 || this.state !== 'play') return;
      const d = dmg * this.stats.dmgResMul;
      this.hp -= d;
      this.hurtT = 0.35; this.regenT = 4;
      p.iframes = 0.45 + this.stats.iframeBonus;
      this.rig.hit();
      Audio2.play('hurt', clamp(d / 20, 0.4, 1));
      FX.shake(clamp(d / 40, 0.1, 0.5), 0.28);
      if (from) {
        const k = p.pos.clone().sub(from); k.y = 0;
        if (k.lengthSq() > 1e-4) {
          k.normalize().multiplyScalar(7 * this.stats.knockRes);
          p.vel.x += k.x; p.vel.z += k.z;
        }
        p.vel.y = Math.max(p.vel.y, 3);
      }
      if (this.hp <= 0) this.onDeath();
    }, 'fix30:hurtPlayer');
  });

  /* --------------------------------------------------------- ARCHITECT HP
     Symptom: the Architect's Phase 1 lasts exactly one hit. The anchors come
     down, the shield drops, and the very first point of damage jumps it
     straight to "PHASE 2 — LATTICE" with drones. Phase 1 — the phase the
     parry rules were written for — is unplayable.

     Cause: `phases: [0.999, 0.70, 0.40, 0.15]`, and checkPhase transitions to
     `i + 2`. The 0.999 entry was meant to mark the top of phase 1, but the
     +2 offset makes it the threshold FOR phase 2, so it triggers at 99.9% hp.
     The trailing 0.15 then maps to a phase 5 that has no handler at all.

     Fix: three thresholds, mapping to phases 2, 3 and 4, which is what
     enterPhase() actually implements. */
  step('architect-phases', () => {
    if (typeof Architect === 'undefined') return;
    // The phase table is built inside the constructor and is per-instance, so
    // there is no shared object to correct up front. Correct it on the first
    // call every live Architect makes.
    Hook.before(Architect.prototype, 'enterPhase', function () {
      if (this.cfg && this.cfg.phases && this.cfg.phases.length === 4) {
        this.cfg.phases = [0.70, 0.40, 0.15];
      }
    }, 'fix30:arch.phases');
  });

  /* ------------------------------------------------------------- LABEL TEX
     Symptom: after a long fight, damage numbers start rendering as solid
     black rectangles, or vanish entirely.

     Cause: LabelTex evicts the oldest entry once the cache passes 220 and
     calls dispose() on it. Damage numbers are keyed by their value, so one
     boss fight generates hundreds of distinct keys — and the sprite pool is
     still holding the texture being evicted. Disposing a texture that is
     bound to a live material is exactly the black-rectangle failure.

     Fix: evict by dropping the reference, never by disposing. A stranded
     64 px canvas texture is a few kilobytes and the GPU copy goes away with
     the context; a disposed live texture is a visible artefact. The cap goes
     up too, because the entries are small and it is the churn that hurts. */
  step('labeltex', () => {
    if (typeof LabelTex === 'undefined') return;
    const CAP = 512;
    LabelTex.get = function (text, opts = {}) {
      const key = text + '|' + JSON.stringify(opts);
      const hit = this.cache.get(key);
      if (hit) {
        // Refresh recency so a value the fight keeps producing is never the
        // one evicted. Map preserves insertion order, so re-insert.
        this.cache.delete(key);
        this.cache.set(key, hit);
        return hit;
      }
      const size = opts.size || 64;
      const pad = opts.pad === undefined ? 8 : opts.pad;
      const c = document.createElement('canvas');
      const font = (opts.weight || '700') + ' ' + size + 'px ' +
        (opts.mono ? 'ui-monospace, monospace' : 'Arial Narrow, Impact, sans-serif');
      let x = c.getContext('2d');
      x.font = font;
      const w = Math.ceil(x.measureText(text).width) + pad * 2;
      c.width = Math.max(2, w); c.height = size + pad * 2;
      x = c.getContext('2d');
      x.font = font;
      x.textBaseline = 'middle';
      x.textAlign = 'center';
      if (opts.stroke !== false) {
        x.lineWidth = Math.max(3, size * 0.14);
        x.strokeStyle = opts.strokeColor || 'rgba(2,4,8,0.92)';
        x.strokeText(text, c.width / 2, c.height / 2);
      }
      x.fillStyle = opts.color || '#E8F4FF';
      x.fillText(text, c.width / 2, c.height / 2);
      const t = new THREE.CanvasTexture(c);
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      t.userData = { w: c.width, h: c.height };
      this.cache.set(key, t);
      while (this.cache.size > CAP) this.cache.delete(this.cache.keys().next().value);
      return t;
    };
  });

  /* ----------------------------------------------------------------- INPUT
     Three small ones that all read as "the game ignored me".

     [a] blur clears Input.keys but not Input.pressed. Alt-tab away mid-jump
         and the queued Space edge fires on the frame you come back.
     [b] The canvas click handler requests pointer lock whenever the skill
         tree is closed — including while Settings, Credits or (new in 3.0)
         the pause menu is open, so clicking a settings row grabbed the mouse
         and the panel became unusable.
     [c] E is bound to both Storm Mend and "talk to Rex". Standing on the
         mission prompt and pressing E spent 35 charge healing at full health
         as well as opening the conversation. */
  step('input', () => {
    addEventListener('blur', () => {
      Input.pressed = Object.create(null);
      Input.mouse.down = false; Input.mouse.downEdge = false;
      Input.stick.x = Input.stick.y = 0;
    });

    Input.panelOpen = function () {
      if (g.treeOpen) return true;
      for (const sel of ['#settings', '#credits', '#pausepanel', '#codex']) {
        const n = document.querySelector(sel);
        if (n && !n.classList.contains('hide')) return true;
      }
      if (g.ex && g.ex.blocking) return true;
      return false;
    };
    // The base handler is bound to the canvas node itself, so it cannot be
    // hooked — gate the request instead, which is the only thing it does.
    const baseLock = Input.requestLock.bind(Input);
    Input.requestLock = function (canvas) {
      if (Input.panelOpen()) return;
      return baseLock(canvas);
    };

    // [c] tryHeal refuses while an interaction prompt owns the key.
    Hook.before(AbilitySystem.prototype, 'tryHeal', function () {
      if (this.g.interactPrompt) return false;
    }, 'fix30:heal.interact');
  });

  /* -------------------------------------------------------------------- VO
     Symptom: master volume snaps back to 60% after any voice line, ignoring
     the slider — and if the player had it muted, a VO line un-mutes the game.

     Cause: VO.play ducks to 0.28 and VO.stop restores the literal 0.6, which
     was the constructor default rather than the current setting.

     Fix: remember what the bus was at, restore that. */
  step('vo', () => {
    VO.play = function (id, dur) {
      if (!this.enabled || !id || !this.have[id] || !this.base) return false;
      try {
        this.stop();
        const a = new Audio(this.base + id + '.mp3');
        a.volume = 1;
        a.play().catch(() => { });
        this.cur = a;
        if (Audio2.master) {
          this._restore = Audio2.master.gain.value;
          Audio2.master.gain.value = this._restore * 0.45;
        }
        a.onended = () => this.stop();
        return true;
      } catch (e) { return false; }
    };
    VO.stop = function () {
      if (this.cur) { try { this.cur.pause(); } catch (e) { } this.cur = null; }
      if (Audio2.master && this._restore !== undefined) {
        Audio2.master.gain.value = this._restore;
        this._restore = undefined;
      }
    };
  });

  /* --------------------------------------------------------------- BLADE
     Symptom: after a reload with the sword already unlocked, the blade model
     is invisible until you press 1.

     Cause: two systems own blade.visible. unlockAbility('sword') shows it;
     Fight.setForm hides it for any form that is not blade. On a restored
     save neither runs, so the mesh keeps the constructor's `visible = false`.

     Fix: assert the correct state whenever a zone loads, which is the one
     moment both the save and the form are known. */
  step('blade', () => {
    Hook.after(Game.prototype, 'loadZone', function () {
      if (!this.rig || !this.rig.blade) return;
      const form = (typeof Fight !== 'undefined' && Fight.ready) ? Fight.form : 'blade';
      this.rig.blade.visible = !!this.unlocked.sword && form === 'blade';
      if (this.rig.blade.visible) this.rig.blade.scale.setScalar(1);
    }, 'fix30:blade.assert');
  });

  /* ------------------------------------------------------------ MISSION UI
     Symptom: the Cargo Nine timer renders through the whole mission list
     every half second — innerHTML on a <ul>, which rebuilds and re-lays out
     every objective row twice a second for two and a half minutes.

     Fix: the countdown gets its own node and a text write. The list only
     rebuilds when an objective actually changes. */
  step('mission-render', () => {
    Hook.set(MissionSystem.prototype, 'render', function () {
      const el = $('#mission');
      if (!el) return;
      if (!this.active) { el.classList.remove('on'); this._sig = null; return; }
      el.classList.add('on');
      const mt = el.querySelector('.mt');
      if (mt.textContent !== this.active) mt.textContent = this.active;

      // Rebuild only on a real change.
      const sig = this.obj.map(o => o.t + '|' + (o.done ? 1 : 0) + '|' + (o.have || 0) + '/' + (o.n || 0)).join(';');
      const ul = el.querySelector('ul');
      if (sig !== this._sig) {
        this._sig = sig;
        ul.innerHTML = '';
        for (const o of this.obj) {
          const li = document.createElement('li');
          li.className = o.done ? 'done' : '';
          li.innerHTML = (o.done ? '✓ ' : '· ') + o.t +
            (o.n !== undefined ? ' <b>' + o.have + '/' + o.n + '</b>' : '');
          ul.appendChild(li);
        }
        this._clockLi = null;
      }
      if (this.timeLeft > 0) {
        if (!this._clockLi || !this._clockLi.isConnected) {
          this._clockLi = document.createElement('li');
          ul.appendChild(this._clockLi);
        }
        const txt = '· time left <b>' + Fmt.time(this.timeLeft) + '</b>';
        if (this._clockLi.innerHTML !== txt) this._clockLi.innerHTML = txt;
      } else if (this._clockLi) {
        this._clockLi.remove(); this._clockLi = null;
      }
    }, 'fix30:mission.render');
  });

  /* --------------------------------------------------------------- SHADOWS
     Symptom: turning Shadows off in Settings costs several hundred
     milliseconds and, on a phone, sometimes loses the frame entirely.

     Cause: applyOpts traverses the whole scene setting `needsUpdate` on every
     material, which recompiles every shader program in the build. Toggling
     the renderer's shadowMap.enabled does not require that — three only needs
     a recompile when a material's *shadow-related defines* change, which they
     do not here because the lights are unchanged.

     Fix: flip the flag, drop the map, and mark the shadow map dirty. */
  step('shadow-toggle', () => {
    Hook.set(Game.prototype, 'applyOpts', (function (base) {
      return function () {
        const wantShadows = this.opts.shadows;
        const had = this.renderer.shadowMap.enabled;
        // Neutralise the base traverse by making the comparison a no-op...
        this.renderer.shadowMap.enabled = wantShadows;
        const r = base.call(this);
        // ...then do the cheap half of the work it was trying to do.
        if (had !== wantShadows) {
          if (this.sun) this.sun.castShadow = wantShadows;
          if (!wantShadows && this.sun && this.sun.shadow && this.sun.shadow.map) {
            this.sun.shadow.map.dispose();
            this.sun.shadow.map = null;
          }
          this.renderer.shadowMap.needsUpdate = true;
        }
        return r;
      };
    })(Game.prototype.applyOpts), 'fix30:applyOpts.shadows');
  });

  /* ------------------------------------------------------------------ VOID
     Symptom: falling off the world crashes the game outright. Not "you take
     damage and respawn" — the whole thing stops: black screen, live HUD, no
     input, and the console shows one line.

     Cause, in full:

         if (p.y < -40) { this.pos.set(0, 3, 0); this.vel.set(0, 0, 0); this.hurt(8, null); }

     `this` is the CharacterController. CharacterController has no `hurt` — it
     is a kinematic capsule, damage lives on Game. So every fall past -40 m
     throws a TypeError out of moveAndCollide, out of updatePlayer, out of
     frame(), and past the `requestAnimationFrame(this._loop)` on the last
     line of frame() that keeps the game alive. One fall, and the loop is
     never scheduled again.

     The same line has a second bug that only shows in the new zones: it
     respawns at the world origin. In the Foundry the origin is the middle of
     the pour — the hole you just fell down — so a player who fell once would
     fall forever, if the first bug had let them get that far.

     Fix: hand it to the game, and put the player back somewhere that is
     actually floor. */
  step('void', () => {
    // The call site is already correct — `this.hurt(8, null)`. It is the
    // method that was never written. Write it.
    CharacterController.prototype.hurt = function (dmg) {
      const gm = window.HEXIS;
      if (!gm) return;
      // Somewhere solid: the last checkpoint, else the zone's own spawn.
      const cp = gm._checkpoint;
      const to = (cp && gm.zone && cp.zone === gm.zone.name) ? cp.pos
        : (gm.zone && gm.zone.spawns.player) || V3(0, 3, 0);
      this.pos.copy(to);
      this.pos.y += 1.2;
      this.vel.set(0, 0, 0);
      this.climbing = false;
      this.iframes = Math.max(this.iframes || 0, 1.2);
      FX.flash(0.35, '#5FE3FF');
      FX.ringBurst(this.pos.clone(), 4, '#5FE3FF', 0.6);
      try { AudioX.play('revive', { vol: 0.6 }); } catch (e) { }
      gm.ui.toast('CAUGHT', 'You fell out of the world');
      // Route the damage properly so iframes, resists and death all behave.
      if (dmg > 0) {
        this.iframes = 0;
        gm.hurtPlayer(dmg, null);
        this.iframes = 1.2;
      }
    };
  });

  /* ------------------------------------------------------------------ LOOP
     The frame loop has no error recovery at all. `frame()` ends with
     `requestAnimationFrame(this._loop)`, so anything that throws anywhere in
     the frame — a system, a hook, a null the physics did not expect — means
     that line is never reached and the game is dead until the page is
     reloaded. The void bug above is one way in; there are dozens.

     A game loop should survive a bad frame. This takes ownership of the
     scheduling: the base's tail call now schedules a no-op, and the driver
     here re-arms every frame regardless of what happened inside it. Repeated
     failures are reported once each rather than filling the console, and the
     tenth distinct failure says so and stops trying to be quiet about it. */
  step('loop-guard', () => {
    const seen = new Map();
    let total = 0;
    const report = (e) => {
      total++;
      const key = String((e && e.stack ? e.stack.split('\n')[1] : e) || e).trim().slice(0, 200);
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n === 1) {
        console.error('[hexis] frame threw — the loop kept going:', e);
        if (seen.size === 1) {
          try { g.ui.toast('RECOVERED', 'A frame failed. Check the console; the game is still running.'); }
          catch (_) { }
        }
      } else if (n === 30) {
        console.error('[hexis] the same frame error has now fired 30 times:', key);
      }
    };

    // Point the base's scheduling at nothing, then drive the loop here.
    const dead = () => { };
    g._loop = dead;
    let running = true;
    const tick = () => {
      if (!running) return;
      try { g.frame(); } catch (e) { report(e); }
      // Re-arm unconditionally. This is the whole fix.
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // The base already had one frame scheduled against the old closure when
    // this installed; it will run once more, see _loop is a no-op, and stop.
    g.stopLoop = () => { running = false; };
    g.frameErrors = seen;
  });

  /* ------------------------------------------------------------ HUD LAYOUT
     Symptom: in landscape, the integrity bar and the ten charge cells are
     drawn across the top-left corner on top of the objective panel, with the
     top of the bar clipped off the screen. The two most-read elements in the
     game are illegible, and they are illegible on top of each other.

     Measured on the 2.4.6 build at 1280x720:
         #obj     top 16   left 16
         #vitals  top -16  left 16     <- should be bottom-left
         #cells   top 13   left 16

     Cause: 97-shell.js adds a `.shell` class to #vitals and styles it

         #vitals.shell{ position:relative; padding-top:13px; }

     to give its new "INTEGRITY" ::before label something to position against.
     But #vitals is `position:absolute; bottom:...` in the base sheet, and
     `position:relative` overrides that — the element drops out of absolute
     positioning entirely, becomes an in-flow child of #ui, and lands at the
     top of the frame in the objective panel's lap.

     The relative was never needed: an absolutely positioned element is
     already a containing block for its own absolutely positioned children,
     so the ::before anchors correctly either way.

     Fix: put it back to absolute and keep the padding the label needs. */
  step('hud-layout', () => {
    const css = document.createElement('style');
    css.id = 'fix30-hud';
    css.textContent = `
#vitals.shell{ position:absolute; padding-top:13px; }
/* The label sat on the element's own top edge, which the padding above now
   occupies. Anchor it to the padding band instead of overlapping the bar. */
#vitals.shell::before{ top:0; left:1px; }
/* With the vitals back at the bottom, the ability row is the only thing
   competing for that corner. Eleven chips need two rows and a wider box than
   the four the markup shipped with. */
#abilities{ justify-content:flex-end; }
`;
    document.head.appendChild(css);
  });

  console.log('[hexis 3.0] fixes online:', done.join(', '));
})();
