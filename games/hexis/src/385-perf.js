/* ===== 385-perf.js ========================================================
   HEXIS 3.7 — the frame, measured.

   Instrumenting a real fight — ten live bodies, 395 draw calls, 145k
   triangles — put the cost somewhere I did not expect:

       JS per frame          8.0 ms median
       ...of which every
       skeletal update       0.4 ms
       renderer.render()     EIGHT calls per game frame

   The JS is not the problem. All of the AI, physics, animation and every
   hook this project has bolted on comes to eight milliseconds, and the
   character rigs — the thing four versions of model work went into — are
   half a millisecond of that. The frame is spent submitting the scene eight
   times:

       1  the scene, into rtScene            (and the shadow map, inside it)
       2  bright-pass threshold              -> rtA
       3  blur rtA horizontally              -> rtB
       4  blur back                          -> rtA
       5  bright-pass again, half size       -> rtC
       6  blur rtC horizontally              -> rtD
       7  blur back                          -> rtC
       8  composite scene + both blooms      -> screen

   THE GAME ALREADY KNOWS HOW TO DO THIS CHEAPLY. 2.4.2 ships a one-octave
   path that skips 5, 6 and 7, and a shadow throttle that only rebuilds the
   map once the player has actually moved. Both of them are gated on `_q` —
   the RENDER SCALE — so neither engages until the automatic scaler has
   already started shrinking the framebuffer.

   That is the wrong order. A tight bloom halo and a 20 Hz shadow map are
   things nobody can point to. A soft image is the first thing everybody
   sees. So the effects should go first and the resolution last, and until
   now it was the other way round.

   This file does not add a cheaper renderer. It gives the existing one a
   dial that is not `_q`, and turns it before the scaler gets involved.
   ========================================================================= */
(function framePass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[frame] ' + n, e); } };

  /* --------------------------------------------------------------- BLOOM
     2.4.2 wraps the post INSTANCE, not the prototype — so a prototype patch
     is shadowed and silently does nothing, which is exactly what the first
     cut of this file did. Wrap the instance, on top of theirs. */
  step('bloom-tier', () => {
    const post = g.post;
    if (!post || !post.render) return;
    const prev = post.render.bind(post);
    g.__bloom = 2;                       // 2 octaves, 1 octave, 0 = none

    post.render = function (dt, p) {
      const lv = g.__bloom;
      if (lv >= 2) return prev(dt, p);   // their path, full or lite by _q
      if (!this.enabled) { this.r.setRenderTarget(null); this.r.render(this.scene, this.camera); return; }

      this.r.setRenderTarget(this.rtScene);
      this.r.clear();
      this.r.render(this.scene, this.camera);

      const u = this.mComp.uniforms;
      if (lv >= 1) {
        this.mBright.uniforms.tDiffuse.value = this.rtScene.texture;
        this.blit(this.mBright, this.rtA);
        this.blur(this.rtA, this.rtB, this.rtA, this.s1);
        u.tBloomA.value = this.rtA.texture;
        u.tBloomB.value = this.rtA.texture;    // reuse; no second octave
      } else {
        // No bloom at all: hand the composite the scene for both taps so its
        // shader needs no variant and nothing recompiles.
        u.tBloomA.value = this.rtScene.texture;
        u.tBloomB.value = this.rtScene.texture;
      }
      u.tScene.value = this.rtScene.texture;
      u.uTime.value += dt;
      u.uRadial.value = damp(u.uRadial.value, p.radial || 0, 9, dt);
      u.uDamage.value = damp(u.uDamage.value, p.damage || 0, 7, dt);
      this.blit(this.mComp, null);
    };
  });

  /* -------------------------------------------------------------- SHADOWS
     2.4.2's throttle is good — it rebuilds only after the player has moved
     1.5 units, capped at 20 Hz — but it installs behind
     `if (!r.shadowMap.enabled) return`. Boot with shadows off, turn them on
     in the options, and the throttle was never installed: autoUpdate stays
     true and the map rebuilds every single frame for the rest of the run. */
  step('shadow-guard', () => {
    const r = g.renderer;
    if (!r || !r.shadowMap) return;
    const arm = () => {
      if (!r.shadowMap.enabled || r.shadowMap.autoUpdate === false) return;
      r.shadowMap.autoUpdate = false;
      r.shadowMap.needsUpdate = true;
      let lastX = 1e9, lastZ = 1e9, t = 0;
      Hook.after(Game.prototype, 'frame', function (_res, dt) {
        if (!this.player || !r.shadowMap.enabled) return;
        t += dt || 0.016;
        const p = this.player.pos;
        const rate = g.__shadowRate || 0.05;
        if (Math.abs(p.x - lastX) + Math.abs(p.z - lastZ) > 1.5 && t > rate) {
          lastX = p.x; lastZ = p.z; t = 0; r.shadowMap.needsUpdate = true;
        }
      }, 'frame37:shadowLate');
    };
    arm();
    Hook.after(Game.prototype, 'applyOpts', arm, 'frame37:shadowArm');
    // A new world has to land on the next frame or the player sees the old
    // zone's shadows printed over the new one.
    Bus.on('zone:loaded', () => { r.shadowMap.needsUpdate = true; });
  });

  /* ---------------------------------------------------------- THE LADDER
     One number in, three settings out, and none of them is resolution.

       3  two bloom octaves, shadows up to 20 Hz     (8 passes)
       2  one octave                                 (5 passes)
       1  one octave, shadows up to 7 Hz             (5 passes, fewer maps)
       0  no bloom, shadows off                      (2 passes)

     The base scaler still owns `_q` and still runs. It just no longer has to
     be the first thing to move. */
  step('ladder', () => {
    g.__tier = 3;
    g.setFrameTier = function (t) {
      t = Math.max(0, Math.min(3, t | 0));
      if (t === this.__tier) return;
      this.__tier = t;
      g.__bloom = t >= 3 ? 2 : t >= 1 ? 1 : 0;
      g.__shadowRate = t >= 2 ? 0.05 : 0.14;
      if (this.renderer && this.renderer.shadowMap) {
        const want = t >= 1 && !(this.opts && this.opts.shadows === false);
        this.renderer.shadowMap.enabled = !!want;
        this.renderer.shadowMap.needsUpdate = true;
      }
      Bus.emit('frame:tier', t);
    };

    // A phone starts a rung down rather than discovering it during a fight.
    const start = () => {
      if (!g.opts) return;
      if (g.opts.quality === 'low') g.setFrameTier(0);
      else if (g.opts.quality === 'high') g.setFrameTier(3);
      else if (typeof Input !== 'undefined' && Input.touch) g.setFrameTier(1);
    };
    Hook.after(Game.prototype, 'applyOpts', start, 'frame37:tierStart');
    start();
  });

  /* ------------------------------------------------------------- ADAPTIVE
     Walk the ladder from what the frame actually costs. Slow down, slower
     up: a setting that oscillates is worse than either setting it swings
     between. Only on 'auto', because a player who picked a quality meant it. */
  step('adaptive', () => {
    let acc = 0, n = 0, hold = 0;
    Hook.after(Game.prototype, 'frame', function (_r, dt) {
      if (!this.opts || this.opts.quality !== 'auto') return;
      if (this.state !== 'play') return;
      acc += dt || 0.016; n++;
      if (acc < 1.5) return;                        // decide every 1.5 s
      const avg = acc / n; acc = 0; n = 0;
      if (hold > 0) { hold--; return; }
      if (avg > 0.024 && this.__tier > 0) {         // under ~42 fps
        this.setFrameTier(this.__tier - 1); hold = 3;
      } else if (avg < 0.0135 && this.__tier < 3) { // over ~74 fps
        this.setFrameTier(this.__tier + 1); hold = 6;
      }
    }, 'frame37:adaptive');
  });

  step('report', () => {
    g.frameReport = function () {
      const i = this.renderer.info;
      let casters = 0, meshes = 0;
      this.scene.traverse(o => { if (o.isMesh) { meshes++; if (o.castShadow && o.visible) casters++; } });
      return {
        tier: this.__tier, bloom: this.__bloom, shadowRate: this.__shadowRate,
        shadows: this.renderer.shadowMap.enabled,
        shadowAuto: this.renderer.shadowMap.autoUpdate,
        casters, meshes, calls: i.render.calls, tris: i.render.triangles,
        programs: i.programs.length, q: this._q
      };
    };
  });

  console.log('[hexis 3.7] frame online: ' + done.join(', ') +
    '  ·  tier ' + g.__tier + ', bloom ' + g.__bloom + ' octaves');
})();
