/* ===== 355-silhouette.js ==================================================
   HEXIS 3.2 — one body per archetype, not one body in ten colours.

   THE PROBLEM, MEASURED BY LOOKING AT IT

   Lined the whole cast up on a stage and photographed it. A Grunt, an
   Enforcer, a Warden, a Brute, a Lancer and a Stalker were the same
   silhouette at six different hues. In a fight that means you cannot tell
   what is about to hit you until it is already winding up, which makes the
   telegraph — the thing this game's whole combat design rests on — useless
   at any range beyond about eight metres.

   THE FIX, IN TWO HALVES

   Half one is in 350-model.js: every dimension the body is built from is a
   multiplier now, and each archetype gets a build profile. A Brute is not a
   Grunt with a bigger scale — it is 34% taller, 58% broader at the shoulder,
   with 42% thicker arms, an 18% longer reach, a head 30% SMALLER against its
   own body, almost no neck, a lower hip and a forward hunch. Shrink one to
   the other's height and they are still obviously different animals.

   Half two is this file: the signature gear. One silhouette-defining object
   each, big enough to read as a shape rather than as detail.

     Grunt     nothing. It is the ruler everything else is measured against.
     Enforcer  riot helm and a chest rig
     Swarmer   twin arm blades, forward pitch
     Lancer    a rifle longer than its own torso, and a spotting scope
     Warden    a tower shield, taller than its head
     Brute     slab pauldrons, a jaw cage, and knuckle plates
     Stalker   hood, half-cape, and a wrist blade
     Kell      crowned helm, cape, and the cannon arm
     Rex       the long shimmering coat and a collar

   All of it goes on before 80-perf merges, so a helmet is not a draw call.
   ========================================================================= */

(function silhouettePass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[silo] ' + n, e); } };

  /* Which build each thing uses. This is the table that does most of the
     work; the gear below is the flourish on top of it. */
  const BUILD_OF = {
    grunt: 'soldier', enforcer: 'heavy', swarmer: 'runner', sniper: 'lean',
    warden: 'tank', brute: 'titan', stalker: 'shade'
  };
  const HAIR_OF = { grunt: 'crop', enforcer: 'crop', swarmer: 'crop', sniper: 'swept', stalker: 'long' };

  step('builds', () => {
    /* Stamped inside the factory rather than on the spawn event.

       The first version listened for `enemy:spawned`, which is emitted by the
       Foe constructor — so anything that builds an archetype rig WITHOUT
       constructing a Foe got no build at all and came out as the default
       body. That is every rig in the model viewer, the boss minions, and any
       future cutscene extra. Tag it where the rig is made and there is one
       path instead of several. */
    if (typeof makeArchetypeRig === 'function') {
      const base = makeArchetypeRig;
      makeArchetypeRig = function (kind) {
        const rig = base(kind);
        if (rig && rig.cfg) {
          const def = (typeof ENEMY_DEFS !== 'undefined' && ENEMY_DEFS[kind]) || null;
          rig.cfg.kind = kind;
          rig.cfg.build = BUILD_OF[kind] || 'soldier';
          rig.cfg.hairStyle = HAIR_OF[kind] || 'crop';
          rig.cfg.heavy = !!def && (def.tier >= 4 || kind === 'warden');
          rig.__tier = def ? def.tier : 1;
          if (kind === 'stalker') { rig.cfg.hood = true; rig.cfg.jacket = false; rig.cfg.coat = true; }
          if (kind === 'brute' || kind === 'warden') { rig.cfg.jacket = false; rig.cfg.coat = true; }
        }
        return rig;
      };
    }
    // The Act I Enemy predates the archetype table.
    Hook.before(Enemy.prototype, 'update', function () {
      // Not every Enemy carries a full BipedRig — the crowd and the Act I
      // simple foes hand over a bare group with no cfg at all.
      if (this.rig && this.rig.cfg && !this.rig.cfg.build) {
        this.rig.cfg.build = this.enf ? 'heavy' : 'soldier';
        this.rig.cfg.kind = this.enf ? 'enforcer' : 'grunt';
      }
    }, 'silo32:baseBuild');

    if (g.rig) { g.rig.cfg.build = 'hero'; g.rig.cfg.kind = 'hexis'; g.rig.cfg.hairStyle = 'swept'; }

    // Kell and Rex are rebound in 370-lore; tag them through the same door.
    if (typeof makeKell === 'function') {
      const base = makeKell;
      makeKell = function () {
        const r = base();
        r.cfg.build = 'kell'; r.cfg.kind = 'kell';
        return r;
      };
    }
    if (typeof makeMentor === 'function') {
      const base = makeMentor;
      makeMentor = function () {
        const r = base();
        r.cfg.build = 'mentor'; r.cfg.kind = 'rex'; r.cfg.hairStyle = 'swept';
        return r;
      };
    }
    if (typeof makeCivilian === 'function') {
      const base = makeCivilian;
      makeCivilian = function (o) {
        const r = base(o);
        r.cfg.build = 'civ'; r.cfg.kind = 'civ';
        r.cfg.hairStyle = RND.pick(['crop', 'swept', 'long']);
        return r;
      };
    }
  });

  /* ---------------------------------------------------------------- GEAR */
  step('gear', () => {
    Sculpt.gear.push((rig, P) => {
      const { S, B, m, j, cfg, lathe, ball, soft, chip, taper } = P;
      const kind = cfg.kind;
      if (!kind) return;

      /* Head gear was authored against the old skull: centre at 0.20*S, head
         scale 1.30. 350's v5 pass moved the skull down and shrank it out of
         bobblehead territory, so rather than re-tune seventeen hard-coded
         heights, everything head-mounted goes into one group that carries the
         old frame and is scaled and dropped onto the new skull. Anything
         authored later can use `hg` and the same numbers. */
      const SK = rig.__skull;
      const HSC = SK ? SK.p[3][0] / (0.108 * S * 1.30) : 1;
      const hg = new THREE.Group();
      hg.scale.setScalar(HSC);
      hg.position.y = (SK ? SK.y : 0.20 * S) - 0.20 * S * HSC;
      if (j.head) j.head.add(hg);
      const head = { add: (o) => hg.add(o) };

      /* ---------------------------------------------------------- ENFORCER
         A riot helm with a face grille and a chest rig. Reads as "police
         line" from across the street, which is what it is. */
      if (kind === 'enforcer') {
        const hr = 0.135 * S;
        head.add(lathe([
          [0.0001, 0.335 * S], [hr * 0.56, 0.318 * S], [hr * 0.92, 0.262 * S],
          [hr, 0.190 * S], [hr * 0.94, 0.128 * S], [hr * 0.74, 0.096 * S]
        ], m.armor, { squash: 0.98 }));
        // Brow ridge and a stubby crest, so the helm has a front.
        head.add(chip(hr * 1.5, 0.030 * S, 0.055 * S, m.armor, 0, 0.246 * S, hr * 0.72, 0.35));
        head.add(taper(0.032 * S, 0.012 * S, 0.13 * S, 0.07 * S, m.armor, 0, 0.322 * S, -0.01 * S));
        for (let i = 0; i < 4; i++)
          head.add(chip(0.11 * S, 0.008 * S, 0.016 * S, m.dark, 0, (0.150 + i * 0.020) * S, hr * 0.80, 0.2));
        // Chest rig: two pouches and a strap.
        j.chest.add(chip(0.30 * S, 0.030 * S, 0.03 * S, m.dark, 0, 0.30 * S, 0.20 * S, 0.3));
        for (const side of [-1, 1])
          j.chest.add(soft(0.085 * S, 0.10 * S, 0.055 * S, m.dark, side * 0.13 * S, 0.26 * S, 0.19 * S, 0.4));
      }

      /* ------------------------------------------------------------ SWARMER
         Twin arm blades and a beak visor. Small, fast, and it should look
         like it wants to be closer than you do. */
      if (kind === 'swarmer') {
        for (const arm of [rig.armL, rig.armR]) {
          if (!arm || !arm.el) continue;
          const bl = taper(0.030 * S, 0.006 * S, 0.34 * S, 0.055 * S, m.trim,
            0, -0.34 * S, -0.05 * S);
          bl.rotation.x = 0.22;
          arm.el.add(bl);
        }
        head.add(taper(0.075 * S, 0.020 * S, 0.10 * S, 0.06 * S, m.armor, 0, 0.196 * S, 0.13 * S));
      }

      /* ------------------------------------------------------------- LANCER
         A rifle longer than its own torso. This is the whole design: you
         should be able to see the barrel before you can see the man. */
      if (kind === 'sniper') {
        const arm = rig.armR;
        if (arm && arm.hand) {
          const gun = new THREE.Group();
          gun.rotation.x = Math.PI / 2;
          gun.position.set(0, -0.10 * S, 0.02 * S);
          // Receiver, barrel, coil stack, muzzle, stock.
          gun.add(soft(0.055 * S, 0.075 * S, 0.34 * S, m.armor, 0, 0, 0.10 * S, 0.35));
          gun.add(lathe([
            [0.020 * S, 0.0], [0.024 * S, 0.30 * S], [0.019 * S, 0.86 * S]
          ], m.dark, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, 0.16 * S], seg: 8 }));
          for (let i = 0; i < 4; i++) {
            const c = new THREE.Mesh(new THREE.TorusGeometry(0.036 * S, 0.010 * S, 4, 10), m.trim);
            c.position.set(0, 0, (0.34 + i * 0.13) * S);
            gun.add(c);
          }
          gun.add(taper(0.048 * S, 0.022 * S, 0.10 * S, 0.048 * S, m.trim, 0, 0, 0.98 * S));
          gun.add(soft(0.045 * S, 0.090 * S, 0.16 * S, m.dark, 0, -0.02 * S, -0.14 * S, 0.4));
          // Scope.
          gun.add(lathe([
            [0.022 * S, 0.0], [0.026 * S, 0.16 * S], [0.020 * S, 0.20 * S]
          ], m.dark, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0.055 * S, 0.08 * S], seg: 8 }));
          arm.hand.add(gun);
          rig.gun = gun;
        }
        // Tall spotting visor and a shoulder antenna.
        head.add(chip(0.12 * S, 0.10 * S, 0.045 * S, m.dark, 0, 0.212 * S, 0.108 * S, 0.4));
        head.add(chip(0.14 * S, 0.020 * S, 0.030 * S, m.trim, 0, 0.238 * S, 0.118 * S, 0.3));
        if (rig.armL && rig.armL.sh)
          rig.armL.sh.add(taper(0.016 * S, 0.005 * S, 0.34 * S, 0.016 * S, m.armor, -0.04 * S, 0.22 * S, -0.04 * S));
      }

      /* ------------------------------------------------------------- WARDEN
         A tower shield taller than its own head, and a full helm with no
         face at all. The design contract is "you cannot hit this from the
         front", and the silhouette has to say so before the plate does. */
      if (kind === 'warden') {
        const arm = rig.armL;
        if (arm && arm.hand) {
          const sh = new THREE.Group();
          sh.position.set(-0.14 * S, -0.02 * S, 0.16 * S);
          sh.rotation.y = 0.12;
          const face = soft(0.10 * S, 1.30 * S, 0.86 * S, m.armor, 0, 0.30 * S, 0, 0.18);
          sh.add(face);
          sh.add(soft(0.05 * S, 1.34 * S, 0.10 * S, m.trim, 0.055 * S, 0.30 * S, 0, 0.2));
          for (let i = 0; i < 3; i++)
            sh.add(chip(0.06 * S, 0.030 * S, 0.78 * S, m.dark, 0.055 * S, (-0.10 + i * 0.40) * S, 0, 0.2));
          const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.10 * S, 0.13 * S, 0.07 * S, 8), m.armor);
          boss.rotation.z = Math.PI / 2;
          boss.position.set(0.075 * S, 0.30 * S, 0);
          sh.add(boss);
          arm.hand.add(sh);
          rig.shield = sh;
          rig.shieldGlow = face;
        }
        const hr = 0.140 * S;
        head.add(lathe([
          [0.0001, 0.340 * S], [hr * 0.6, 0.322 * S], [hr, 0.250 * S],
          [hr * 1.02, 0.170 * S], [hr * 0.90, 0.100 * S]
        ], m.armor, { squash: 1.0 }));
        head.add(chip(hr * 1.36, 0.030 * S, 0.040 * S, m.trim, 0, 0.212 * S, hr * 0.80, 0.3));
        // Neck skirt, so there is no gap between helm and pauldron.
        j.chest.add(lathe([
          [0.15 * S, 0.60 * S], [0.21 * S, 0.52 * S], [0.20 * S, 0.46 * S]
        ], m.armor, { squash: 0.9 }));
      }

      /* -------------------------------------------------------------- BRUTE
         Slab pauldrons wider than its own hips, a jaw cage, knuckle plates,
         and a back ridge. Nothing subtle: this is the one you run from. */
      if (kind === 'brute') {
        for (const side of [-1, 1]) {
          const arm = side < 0 ? rig.armL : rig.armR;
          if (!arm || !arm.sh) continue;
          /* Slabs, not wings. The first cut revolved a 0.34 S radius plate
             around the shoulder, which came out as a flat horizontal fan a
             third of a metre wide — it read as a bird, not as armour. A
             pauldron is a curved cap that hangs DOWN over the deltoid. */
          const pd = lathe([
            [0.085 * S, 0.13 * S], [0.20 * S, 0.075 * S], [0.235 * S, -0.02 * S], [0.215 * S, -0.14 * S]
          ], m.armor, { squash: 0.88 });
          pd.position.set(side * 0.035 * S, 0.02 * S, 0);
          arm.sh.add(pd);
          // Three overlapping lames down the outside, angled with the arm.
          for (let i = 0; i < 3; i++) {
            const lame = lathe([
              [0.16 * S, 0.0], [0.225 * S - i * 0.012 * S, -0.03 * S], [0.20 * S - i * 0.012 * S, -0.06 * S]
            ], m.armor, { squash: 0.88, pos: [side * 0.035 * S, (-0.09 - i * 0.075) * S, 0] });
            arm.sh.add(lame);
          }
          arm.sh.add(chip(0.05 * S, 0.02 * S, 0.16 * S, m.trim, side * 0.16 * S, 0.055 * S, 0, 0.3));
          if (arm.hand) {
            arm.hand.add(chip(0.20 * S, 0.055 * S, 0.10 * S, m.armor, 0, -0.115 * S, 0.045 * S, 0.3));
            for (let i = 0; i < 3; i++)
              arm.hand.add(taper(0.030 * S, 0.008 * S, 0.075 * S, 0.030 * S, m.trim,
                (-0.055 + i * 0.055) * S, -0.155 * S, 0.055 * S));
          }
        }
        // Jaw cage: four bars across the mouth. Reads at forty metres.
        for (let i = 0; i < 4; i++)
          head.add(chip(0.012 * S, 0.10 * S, 0.012 * S, m.armor,
            (-0.048 + i * 0.032) * S, 0.150 * S, 0.115 * S, 0.2));
        head.add(chip(0.14 * S, 0.020 * S, 0.030 * S, m.armor, 0, 0.108 * S, 0.108 * S, 0.3));
        // Back ridge.
        for (let i = 0; i < 4; i++)
          j.chest.add(taper(0.06 * S, 0.018 * S, 0.11 * S, 0.05 * S, m.armor,
            0, (0.22 + i * 0.11) * S, -0.24 * S));
      }

      /* ------------------------------------------------------------ STALKER
         A hood that hides the face and a half-cape off one shoulder. It
         should read as a shape you are not sure about. */
      if (kind === 'stalker') {
        const cape = taper(0.34 * S, 0.20 * S, 0.86 * S, 0.06 * S, m.cloth,
          -0.14 * S, 0.10 * S, -0.16 * S);
        cape.rotation.z = 0.12;
        cape.rotation.x = -0.06;
        cape.material = Sculpt.twoSided(cape.material);
        j.chest.add(cape);
        if (rig.armL && rig.armL.sh) {
          const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.05 * S, 0.014 * S, 4, 10), m.trim);
          clasp.rotation.y = Math.PI / 2;
          clasp.position.set(-0.04 * S, 0.06 * S, 0);
          rig.armL.sh.add(clasp);
        }
        const arm = rig.armR;
        if (arm && arm.el) {
          const bl = taper(0.026 * S, 0.006 * S, 0.40 * S, 0.045 * S, m.trim, 0, -0.36 * S, -0.06 * S);
          bl.rotation.x = 0.14;
          arm.el.add(bl);
          rig.blade2 = bl;
        }
        // Under the hood, two lit eyes and nothing else.
        head.add(chip(0.14 * S, 0.028 * S, 0.02 * S, m.trim, 0, 0.208 * S, 0.104 * S, 0.3));
      }

      /* --------------------------------------------------------------- KELL
         "A suit of armour that looked ancient, covered in symbols that no
         living human could translate." Seven feet, a crowned helm, a cape,
         and the arm he was given. */
      if (kind === 'kell') {
        const hr = 0.150 * S;
        head.add(lathe([
          [0.0001, 0.352 * S], [hr * 0.52, 0.330 * S], [hr * 0.94, 0.268 * S],
          [hr, 0.196 * S], [hr * 0.92, 0.124 * S], [hr * 0.70, 0.090 * S]
        ], m.armor, { squash: 0.98 }));
        // Crown: five horns, tallest at the centre. The one shape that says
        // this is not a soldier.
        for (let i = 0; i < 5; i++) {
          const t = (i - 2) / 2;
          const hgt = (0.30 - Math.abs(t) * 0.10) * S;
          const horn = taper(0.045 * S, 0.010 * S, hgt, 0.045 * S, m.armor,
            t * 0.10 * S, (0.34 + hgt * 0.4) * S, -0.02 * S);
          horn.rotation.z = -t * 0.42;
          horn.rotation.x = -0.18;
          head.add(horn);
        }
        head.add(chip(0.20 * S, 0.036 * S, 0.040 * S, m.trim, 0, 0.212 * S, hr * 0.80, 0.3));
        // Cape from both shoulders.
        const cape = taper(0.62 * S, 0.44 * S, 1.05 * S, 0.07 * S, m.cloth,
          0, 0.06 * S, -0.26 * S);
        cape.material = Sculpt.twoSided(cape.material);
        j.chest.add(cape);
        // The cannon arm.
        const arm = rig.armR;
        if (arm && arm.el) {
          const barrel = lathe([
            [0.10 * S, 0.0], [0.13 * S, -0.16 * S], [0.14 * S, -0.34 * S], [0.11 * S, -0.42 * S]
          ], m.armor, { squash: 1.0 });
          arm.el.add(barrel);
          for (let i = 0; i < 3; i++) {
            const r = new THREE.Mesh(new THREE.TorusGeometry((0.12 - i * 0.006) * S, 0.016 * S, 4, 12), m.trim);
            r.rotation.x = Math.PI / 2;
            r.position.y = (-0.14 - i * 0.10) * S;
            arm.el.add(r);
          }
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.075 * S, 10, 8),
            new THREE.MeshBasicMaterial({ color: '#FF3B30', transparent: true, opacity: 0.85,
              blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
          core.position.y = -0.40 * S;
          arm.el.add(core);
          rig.cannonCore = core;
        }
      }

      /* ---------------------------------------------------------------- REX
         The long coat is already on him; this adds the collar that stands up
         and the belt of pouches, so he reads as someone who travels. */
      if (kind === 'rex') {
        const col = lathe([
          [0.13 * S, 0.60 * S], [0.19 * S, 0.72 * S], [0.20 * S, 0.80 * S]
        ], m.cloth, { squash: 0.9, phiStart: 0.55, phiLength: Math.PI * 2 - 1.1 });
        col.material = Sculpt.twoSided(col.material);
        j.chest.add(col);
        for (const side of [-1, 1])
          j.hips.add(soft(0.075 * S, 0.09 * S, 0.05 * S, m.dark, side * 0.15 * S, 0.02 * S, 0.10 * S, 0.4));
        j.hips.add(chip(0.34 * S, 0.030 * S, 0.03 * S, m.armor, 0, 0.06 * S, 0.15 * S, 0.3));
      }
    });
  });

  /* ------------------------------------------------------------- ANIMATION
     A silhouette that never moves differently is only half a silhouette. Each
     build gets an idle bias — a Brute breathes heavier and swings wider, a
     Lancer stands very still, a Swarmer never quite stops. */
  step('idle', () => {
    Hook.after(BipedRig.prototype, 'update', function (r, dt, s) {
      const B = this.__build;
      if (!B || !this.j.chest) return;
      const d = dt || 0.016;
      this.__idle = (this.__idle || Math.random() * 40) + d;
      const heavy = B.size > 1.15 ? 1 : 0;
      const twitchy = B.size < 0.9 ? 1 : 0;
      // Heavy things breathe from the chest and sway; light things jitter.
      const breath = Math.sin(this.__idle * (heavy ? 1.1 : twitchy ? 4.2 : 2.0));
      this.j.chest.rotation.x += breath * (heavy ? 0.030 : twitchy ? 0.014 : 0.010);
      this.j.chest.rotation.z += Math.sin(this.__idle * 0.7) * (heavy ? 0.022 : 0.006);
      if (twitchy) this.j.chest.rotation.y += Math.sin(this.__idle * 6.1) * 0.02;
    }, 'silo32:idle');
  });

  console.log('[hexis 3.2] silhouettes online:', done.join(', '));
})();
