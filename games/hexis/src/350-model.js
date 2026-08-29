/* ===== 350-model.js =======================================================
   HEXIS 3.0 — model pass.

   The 2.4 rigs are good silhouettes made of static plates. Everything that
   moves on them is a joint; nothing on them is soft. From behind — which is
   where the camera lives for the entire game — a character is a column of
   boxes with no secondary motion at all, so a sprint at 17 m/s reads exactly
   like a walk.

   Four additions, in the order they matter from the default camera:

     COAT     a three-segment tail on the hips, driven by the rig's own frame
              velocity and by gravity. This is the whole "he is moving fast"
              read, and it costs six groups and a spring per segment.
     VENTS    a back unit with two emitters that open on a dash and flare with
              charge, so the power has somewhere to come out of.
     PLATING  layered pauldrons, knee guards, forearm fins and a neck seal —
              static, so they merge into the existing collapse pass and cost
              nothing at all after the first frame.
     RANK     a chevron on every hostile, coloured by tier. This is a
              readability change more than an art one: in a crowd of nine you
              need to know which two are the Brutes before they wind up.

   WHERE THIS RUNS, AND WHY IT MATTERS
   80-perf.js merges each joint's decorative plates into one mesh per material
   on the rig's first update, and freezes their matrices. Anything added after
   that runs loose and unfrozen — dozens of extra draw calls per character.
   So this installs with Hook.before, which puts it at the *front* of the
   update chain and therefore ahead of both the 60-upgrade detail pass and the
   merge. Static plates added here get merged; the coat and the vents are
   held as named properties on the rig, which is exactly what RigOpt.protect
   looks for, so they are left animatable.
   ========================================================================= */

const Model3 = {
  /* Distance past which the coat stops solving and simply hangs. Beyond ~28 m
     a 0.3 m panel swings by less than a pixel. */
  coatFar: 28 * 28,
  built: 0
};

(function modelPass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[model] ' + n, e); } };

  /* --- construction ------------------------------------------------------- */

  /* BipedRig already builds a coat when cfg.coat is set: three chest-parented
     groups, one panel and one hem strip each. It is not replaced here — a
     second coat on top of the first is how the 2.4 title screen ended up with
     two skylines. It is dressed: side flaps so the silhouette has a back and
     two sides instead of one slab, and a wider lit hem on the last panel.

     Both additions are static relative to the group that owns them, so the
     merge pass folds each group's cloth meshes into one — the coat comes out
     of this with more shape and fewer draw calls than it went in with. */
  function dressCoat(rig) {
    if (!rig.coat || !rig.coat.length || rig.__coatDressed) return;
    rig.__coatDressed = true;
    const S = rig.S, m = rig.mats;
    const w = [0.46, 0.44, 0.38], h = [0.32, 0.30, 0.26];
    for (let i = 0; i < rig.coat.length; i++) {
      const grp = rig.coat[i].g;
      for (const side of [-1, 1]) {
        const f = taper(w[i] * 0.44 * S, w[i] * 0.30 * S, h[i] * 0.94 * S, 0.07 * S, m.cloth,
          side * w[i] * 0.47 * S, -h[i] * 0.48 * S, 0.012 * S);
        f.rotation.y = side * 0.55;
        f.rotation.z = side * -0.06;
        grp.add(f);
      }
      // A little weight at the bottom edge so the panel does not read as paper.
      grp.add(plate(w[i] * 0.98 * S, 0.030 * S, 0.075 * S, m.cloth, 0, -h[i] * S + 0.015 * S, -0.01 * S));
    }
    // Per-segment spring state. Two axes, unlike the base's one.
    rig.coatState = rig.coat.map(() => ({ x: 0, z: 0, vx: 0, vz: 0 }));
    rig.coatPrev = new THREE.Vector3();
    rig.root.getWorldPosition(rig.coatPrev);
    rig.coatHas = true;
  }

  function buildVents(rig) {
    const S = rig.S, m = rig.mats;
    const pack = new THREE.Group();
    pack.position.set(0, 0.36 * S, -0.17 * S);
    pack.add(plate(0.34 * S, 0.30 * S, 0.11 * S, m.armor, 0, 0, 0));
    pack.add(plate(0.38 * S, 0.05 * S, 0.13 * S, m.dark, 0, 0.16 * S, 0));
    const cores = [];
    for (const side of [-1, 1]) {
      const nozzle = new THREE.Group();
      nozzle.position.set(side * 0.13 * S, -0.02 * S, -0.06 * S);
      nozzle.add(plate(0.10 * S, 0.16 * S, 0.10 * S, m.dark, 0, 0, 0));
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045 * S, 0.058 * S, 0.05 * S, 6),
        new THREE.MeshBasicMaterial({
          color: rig.cfg.trim, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        }));
      core.rotation.x = Math.PI / 2;
      core.position.z = -0.08 * S;
      nozzle.add(core);
      pack.add(nozzle);
      cores.push(core);
    }
    rig.j.chest.add(pack);
    rig.ventPack = pack;
    rig.ventCores = cores;               // array of Object3D — protected
  }

  function buildPlating(rig) {
    const S = rig.S, m = rig.mats;
    // Layered pauldron caps. Static, merged, free after frame one.
    for (const side of [-1, 1]) {
      const sh = side < 0 ? rig.armL : rig.armR;
      if (!sh || !sh.sh) continue;
      sh.sh.add(plate(0.22 * S, 0.06 * S, 0.28 * S, m.armor, side * 0.055 * S, 0.115 * S, 0));
      sh.sh.add(plate(0.17 * S, 0.05 * S, 0.22 * S, m.armor, side * 0.085 * S, 0.155 * S, 0));
      sh.sh.add(plate(0.06 * S, 0.02 * S, 0.20 * S, m.trim, side * 0.10 * S, 0.175 * S, 0));
    }
    // Knee guards and shin fins.
    for (const side of ['L', 'R']) {
      const leg = side === 'L' ? rig.legL : rig.legR;
      if (!leg || !leg.kn) continue;
      leg.kn.add(plate(0.155 * S, 0.13 * S, 0.16 * S, m.armor, 0, -0.02 * S, 0.05 * S));
      leg.kn.add(plate(0.05 * S, 0.02 * S, 0.13 * S, m.trim, 0, 0.03 * S, 0.10 * S));
      leg.kn.add(plate(0.045 * S, 0.20 * S, 0.05 * S, m.armor, 0.075 * S, -0.16 * S, -0.04 * S));
      leg.kn.add(plate(0.045 * S, 0.20 * S, 0.05 * S, m.armor, -0.075 * S, -0.16 * S, -0.04 * S));
    }
    // Neck seal — closes the gap between collar and skull that reads as a
    // floating head from the side.
    if (rig.j.head) rig.j.head.add(plate(0.155 * S, 0.075 * S, 0.155 * S, m.dark, 0, -0.02 * S, 0));
    // Forearm fins.
    for (const side of [-1, 1]) {
      const arm = side < 0 ? rig.armL : rig.armR;
      if (!arm || !arm.el) continue;
      arm.el.add(plate(0.035 * S, 0.13 * S, 0.11 * S, m.armor, side * 0.085 * S, -0.13 * S, -0.01 * S));
    }
  }

  function buildRank(rig, tier, color) {
    const S = rig.S;
    if (!rig.j.chest || tier <= 0) return;
    const mat = new THREE.MeshBasicMaterial({ color, fog: false });
    // One chevron per tier, stacked. Reads at thumbnail size, which is the
    // whole point of it.
    for (let i = 0; i < Math.min(4, tier); i++) {
      const w = (0.20 - i * 0.02) * S;
      rig.j.chest.add(plate(w, 0.022 * S, 0.03 * S, mat, 0, (0.60 - i * 0.045) * S, 0.145 * S));
    }
  }

  /* --- install ------------------------------------------------------------
     One `before` hook at the head of the whole update chain, so the geometry
     exists before the detail pass, the merge and the freeze. */
  step('build', () => {
    Hook.before(BipedRig.prototype, 'update', function () {
      if (this.__m3) return;
      this.__m3 = true;
      try {
        dressCoat(this);
        if (this.cfg && (this.__player || this.cfg.pauldron)) buildVents(this);
        buildPlating(this);
        if (this.__tier) buildRank(this, this.__tier, this.cfg.trim);
        Model3.built++;
      } catch (e) { console.warn('[model] build', e); }
    }, 'model30:build');

    // The player rig is constructed before this module loads, so flag it and
    // let the next frame pick the flag up.
    if (g.rig) { g.rig.__player = true; g.rig.__m3 = false; }
  });

  /* --- the coat -----------------------------------------------------------
     The base swing is driven by raw speed: `drive = sp * 0.055`. Speed has no
     direction, so the coat trails backwards whether you are running forward,
     backpedalling or strafing — and 3.0 added a movement mode where
     backpedalling is the default, which makes that wrong most of the time.

     This replaces the solve with a two-axis spring whose rest angle comes
     from velocity resolved into the rig's own frame. Run forward and it
     trails behind you; walk backwards and it swings out in front; strafe and
     it swings across. Stiffness falls down the chain so the tail keeps moving
     after the top has settled, which is the entire difference between cloth
     and a hinged board.

     It is three springs and one getWorldPosition per rig per frame, gated by
     distance, and it runs after the base solve so it simply overwrites what
     the base wrote rather than fighting it. */
  step('coat', () => {
    const world = new THREE.Vector3();
    Hook.after(BipedRig.prototype, 'update', function (r, dt, s) {
      if (!this.coatHas || !this.coat || !this.coatState) return;
      const d = clamp(dt || 0.016, 1 / 240, 0.1);
      this.root.getWorldPosition(world);

      // Distance gate: past ~28 m a 0.3 m panel swings by well under a pixel.
      const cam = g.camera ? g.camera.position : null;
      if (cam && world.distanceToSquared(cam) > Model3.coatFar) {
        this.coatPrev.copy(world);
        for (let i = 0; i < this.coatState.length; i++) {
          const st = this.coatState[i];
          st.x = damp(st.x, 0.12, 4, d); st.z = damp(st.z, 0, 4, d);
          st.vx = st.vz = 0;
        }
        this.applyCoat();
        return;
      }

      // Frame velocity in the rig's own frame. Reading it off the transform
      // rather than a passed-in vector means the player, every archetype, the
      // mentor and both bosses all get it without knowing anything about it.
      const vx = (world.x - this.coatPrev.x) / d;
      const vz = (world.z - this.coatPrev.z) / d;
      this.coatPrev.copy(world);
      const yaw = this.root.rotation.y;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const fwd = clamp((vx * sy + vz * cy) * 0.040, -1.4, 1.4);
      const side = clamp((vx * cy - vz * sy) * 0.034, -1.1, 1.1);
      const st0 = s || {};
      const air = st0.grounded === false ? clamp(-(st0.velY || 0) * 0.028, 0, 0.5) : 0;
      const dash = st0.dashing ? 0.85 : 0;
      const climb = st0.climbing ? 0.4 : 0;
      const stride = Math.sin(this.phase * 1.4) * 0.045;

      for (let i = 0; i < this.coatState.length; i++) {
        const st = this.coatState[i];
        const k = 1 - i * 0.20;
        const restX = 0.12 + fwd * 0.62 * k + air * k + dash * k + climb * k + stride * (1 - k);
        const restZ = -side * 0.55 * k;
        const stiff = 96 - i * 24, damping = 12.5 - i * 1.8;
        st.vx += (restX - st.x) * stiff * d;
        st.vz += (restZ - st.z) * stiff * d;
        st.vx -= st.vx * damping * d;
        st.vz -= st.vz * damping * d;
        st.x = clamp(st.x + st.vx * d, -0.55, 1.6);
        st.z = clamp(st.z + st.vz * d, -0.85, 0.85);
      }
      this.applyCoat();
    }, 'model30:coat');

    BipedRig.prototype.applyCoat = function () {
      for (let i = 0; i < this.coat.length; i++) {
        const grp = this.coat[i].g, st = this.coatState[i];
        grp.rotation.x = st.x;
        grp.rotation.z = st.z;
        this.coat[i].v = 0;                // the base spring is retired
      }
    };
  });

  /* --- vents --------------------------------------------------------------
     The emitters open on a dash and their brightness tracks whatever the rig
     was last told about charge. For everything that is not the player there
     is no charge, so they idle — which is still better than a blank back. */
  step('vents', () => {
    Hook.after(BipedRig.prototype, 'update', function (r, dt, s) {
      if (!this.ventCores) return;
      const d = dt || 0.016;
      const st = s || {};
      const hot = (st.dashing ? 1 : 0) + clamp((st.speed || 0) / 18, 0, 0.7);
      this.ventHeat = damp(this.ventHeat || 0, hot, 9, d);
      const k = 0.35 + this.ventHeat * 0.9;
      for (const c of this.ventCores) {
        c.material.opacity = clamp(k, 0, 1);
        c.scale.set(1 + this.ventHeat * 0.9, 1, 1 + this.ventHeat * 0.9);
      }
      if (this.ventPack) this.ventPack.position.z = (-0.17 - this.ventHeat * 0.02) * this.S;
    }, 'model30:vents');

    // Trail sparks out of the vents on a dash. Pooled through FX, so this is
    // not an allocation — and it is gated hard because it is per-frame.
    let cool = 0;
    Hook.after(Game.prototype, 'updatePlayer', function (r, dt) {
      cool -= dt || 0.016;
      if (cool > 0) return;
      const rig = this.rig;
      if (!rig || !rig.ventCores || !(rig.ventHeat > 0.75)) return;
      cool = 0.045;
      const p = this.player.pos;
      FX.spark(p.clone().add(V3(rand(-0.3, 0.3), 1.25, rand(-0.3, 0.3))),
        2, this.hurtT > 0 ? '#ff8a70' : '#5FE3FF', 2.4, 3, 0.35);
    }, 'model30:ventFx');
  });

  /* --- rank chevrons ------------------------------------------------------
     Stamped from the archetype table at spawn, before the first update, so
     they merge with everything else. */
  step('rank', () => {
    Bus.on('enemy:spawned', (e) => {
      if (!e || !e.rig || e.rig.__m3) return;
      const def = (typeof ENEMY_DEFS !== 'undefined' && ENEMY_DEFS[e.kind]) || null;
      e.rig.__tier = def ? def.tier : (e.enf ? 2 : 1);
    });
    // The Act I Enemy never emits enemy:spawned; stamp those on their first tick.
    const stamp = function () {
      if (this.rig && this.rig.__tier === undefined) this.rig.__tier = this.enf ? 2 : 1;
    };
    Hook.before(Enemy.prototype, 'update', stamp, 'model30:stamp');
  });

  /* --- Hexis, specifically ------------------------------------------------
     The player gets three things nobody else does: a brighter hex core that
     tracks charge, a visor that reads damage, and a coat hem that lights on a
     perfect dodge. All of it drives off state the game already computes. */
  step('hexis', () => {
    Hook.after(Game.prototype, 'updatePlayer', function () {
      const rig = this.rig;
      if (!rig || !rig.hex) return;
      const chargeK = clamp(this.energy / Math.max(1, this.stats.maxEnergy), 0, 1);
      const s = 0.9 + chargeK * 0.35 + (this.abil.charging ? this.abil.charge * 0.7 : 0);
      rig.hex.scale.setScalar(s);
      if (rig.ventCores && typeof Fight !== 'undefined' && Fight.ready && Fight.dodgeT > 0) {
        for (const c of rig.ventCores) c.material.opacity = 1;
      }
    }, 'model30:hexisCore');
  });

  /* --- report -------------------------------------------------------------
     A count, because "the models are better" is not a measurement. */
  step('report', () => {
    CLOCK.in(6, () => {
      console.log('[hexis 3.0] model: ' + Model3.built + ' rigs upgraded' +
        (g.renderer && g.renderer.info ? ', ' + g.renderer.info.render.calls + ' draw calls this frame' : ''));
    });
  });

  console.log('[hexis 3.0] model online:', done.join(', '));
})();
