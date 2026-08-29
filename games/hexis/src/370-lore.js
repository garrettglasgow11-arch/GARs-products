/* ===== 370-lore.js ========================================================
   HEXIS 3.1 — Part One.

   The comic and the 2.x game disagree about almost everything, and the comic
   is better. This file makes the game the comic.

   WHAT CHANGES, AND WHY

   The 2.x story is a revenge plot: Kell murders Hexis's parents, Hexis
   hunts him. Part One is a different, stronger story — Hexis is one of
   several beings scattered from a broken asteroid, raised on Earth by people
   who found him in a crater and never told him what he was. Kell is not a
   murderer, he is an enforcer sent to correct an error. Rex does not hand out
   street jobs, he steps out of a portal and tells you the truth.

   THE JACKET

   The single best thing in the source material, and it is already a game
   mechanic in everything but name:

     "It's not what gives you your powers. It does the opposite. It keeps your
      powers from being released at their full potential."

   So the jacket is a real, removable item with real numbers on both sides.
   Wearing it: capped charge, ordinary damage, and total stability. Taking it
   off: half again the damage, a bigger pool, faster regen — and a Rage meter
   that fills on every hit you take and every kill you land. Fill it and you
   are not in control any more.

   BLACKOUT

     "He grew taller. His skin turned completely black. Large claws formed on
      his hands, and blue flames erupted around his fists."

   A transformation with a real cost. You hit far harder, you cannot heal,
   you take more damage, and when it ends you are wide open for four seconds.
   Rex knocks you out of it in the comic; here, it ends on a timer and leaves
   you on your knees, which is the same beat with the player still holding
   the controller.

   THE CAST

   Kell rebuilt to the description — seven feet, deep purple, ancient armour,
   red eyes. Rex given his long shimmering coat. The Response Team — Flare,
   Phantom, Brick, Specter, Ace and Commander Pierce — built as real
   characters with their own palettes, and a job where they fight beside you
   badly, because that is the point of them.

   And the codex gets Part One in it, unlocked as you go, so the story is
   somewhere you can read it rather than something that scrolls past.
   ========================================================================= */

const LORE = {
  jacket: {
    name: 'The Regulator',
    from: 'Rex',
    desc: 'A dark blue jacket, almost black, that shimmers like the pattern on his coat. ' +
          'It does not give you anything. It holds you back — on purpose.',
    on: { energyMul: 1.0, damageMul: 1.0, regenMul: 1.0, rage: 0 },
    off: { energyMul: 1.5, damageMul: 1.6, regenMul: 1.35, rage: 1 }
  },
  blackout: {
    dur: 14,
    damageMul: 2.6,
    incomingMul: 1.45,
    speedMul: 1.15,
    exhaustion: 4.0
  },
  /* Codex entries, gated on flags the game already sets. */
  entries: [
    { id: 'asteroid', title: 'The Asteroid', gate: () => true, text:
      'It drifted for longer than anyone can measure, and it was not natural. Deep inside, ' +
      'in chambers built with impossible precision, several beings lay in stasis. Nobody ' +
      'knows who put them there. Then the cracks began — hairline at first, spreading like ' +
      'veins of lightning — and it came apart. The beings were flung in every direction. ' +
      'Some tumbled for years. Some were pulled into the currents between dimensions and ' +
      'arrived on versions of worlds that should not exist. One of them came here.' },
    { id: 'crater', title: 'Elder Street', gate: () => true, text:
      'They found him in a field, in a crater of scorched earth, skin frosted over while the ' +
      'ground around him was still cooling. A boy, maybe seven. They argued about calling ' +
      'the authorities. They decided not to. They gave him a name and told everyone he was ' +
      'an orphan, and they raised him like a normal kid. He grew up believing it.' },
    { id: 'park', title: 'The Park', gate: (g) => g.lv >= 2, text:
      'He was twelve. Three older boys had him on the ground. Then he was standing in the ' +
      'middle of a crater, the jungle gym twisted into scrap, half the trees uprooted, and ' +
      'his hands were glowing. His family told him he was special. They did not tell him ' +
      'the truth, because they did not know it either.' },
    { id: 'kell', title: 'Kell', gate: (g) => !!g.flags.spared || !!g.flags.job_blackout, text:
      'Seven feet of him, skin a purple so deep it seemed to absorb the light, armour older ' +
      'than any language on Earth. "Your kind were not meant to be here. You are anomalies. ' +
      'Threats to the natural order." He had been sent to correct an error. The fight lasted ' +
      'under three minutes, and it ended with Kell backing away, afraid, saying: you have no ' +
      'idea what you will become.' },
    { id: 'rex', title: 'Rex', gate: (g) => !!g.run || !!g.flags.job_blackout, text:
      'The portal opened where there had been nothing, edges crackling blue, and through it ' +
      'was a landscape that was definitely not Earth. He wore a long coat that shimmered ' +
      'with faint patterns and he already knew the name. He has been tracking the others — ' +
      'traces, signs, scattered across worlds. He will not pretend to have the answers he ' +
      'does not have, which is the reason to believe the ones he does.' },
    { id: 'jacket', title: 'The Regulator', gate: (g) => !!g.flags.has_jacket, text:
      '"Your powers are significant. But you have almost no control over them. Your emotions ' +
      'dictate your strength, and when you get angry, things get destroyed." It limits how ' +
      'much you can reach at once. It is not armour and it is not a weapon. It is a crutch, ' +
      'and Rex said so to his face: wear it while you learn, and put it down when you have.' },
    { id: 'blackout', title: 'Blackout', gate: (g) => !!g.flags.seen_blackout, text:
      'It happened in training, when he was pushed too far. He grew taller. His skin turned ' +
      'completely black. Claws came out of his hands and blue fire wrapped his fists. His ' +
      'mind was still in there — he could think, he could hear — but the rage was driving. ' +
      'Rex had to put him down to stop it. It is not a monster and it is not an enemy. It is ' +
      'a part of him, and the only way through is to accept that.' },
    { id: 'response', title: 'The Response Team', gate: (g) => !!g.flags.met_team, text:
      'Six people the government found because they could not find him. Flare, who was a ' +
      'waitress in Chicago. Phantom, who was a construction worker and never wanted to fight ' +
      'anyone. Brick, eighteen, who thinks having powers is genuinely cool and is not wrong. ' +
      'Specter, an army medic rebuilt by a procedure nobody will name. Ace, who has no file. ' +
      'And Commander Pierce, who has no powers and no illusions: "You are tools, and I decide ' +
      'how you are used."' },
    { id: 'syndicate', title: 'The Syndicate', gate: (g) => !!g.flags.job_cargo, text:
      'Well-organised, well-funded and highly mobile, hitting research facilities for weapons ' +
      'that could level a city. Their leader knew what Hexis was before Hexis did. "I know ' +
      'about you because I was there. When the asteroid broke. I saw it. I saw all of you."' },
    { id: 'others', title: 'The Others', gate: (g) => !!g.flags.act3_done, text:
      'There are more. Scattered across alternate Earths and planets past this solar system, ' +
      'each one unaware of the rest. Rex has been tracking them for years and has found ' +
      'traces, not people. The portals are not random — every one of them leads to the same ' +
      'place, and that place is probably where the asteroid came from.' }
  ]
};

(function lorePass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[lore] ' + n, e); } };

  /* ------------------------------------------------------------------- CSS */
  step('style', () => {
    const css = `
#ragewrap{
  position:absolute; left:max(14px,env(safe-area-inset-left)); bottom:calc(max(16px,env(safe-area-inset-bottom)) + 66px);
  width:min(300px,42vw); display:none;
}
#ragewrap.on{ display:block; }
#ragebar{
  height:6px; background:#160d14; border:1px solid #3a1c2a; clip-path:var(--clip); overflow:hidden;
}
#ragebar i{ display:block; height:100%; transform-origin:left; transform:scaleX(0);
  background:linear-gradient(90deg,#8A4BFF,#FF4D7A); box-shadow:0 0 12px #FF4D7A88; transition:transform .12s linear; }
#ragewrap.full #ragebar i{ animation:ragepulse .55s infinite; }
@keyframes ragepulse{ 50%{ opacity:.5 } }
#ragelbl{ font:400 8px/1.6 var(--mono); letter-spacing:.28em; text-transform:uppercase; color:#c98aa8; }

#jacketchip{
  position:absolute; left:max(14px,env(safe-area-inset-left)); bottom:calc(max(16px,env(safe-area-inset-bottom)) + 92px);
  font:400 9px/1 var(--mono); letter-spacing:.22em; text-transform:uppercase; color:var(--steel);
}
#jacketchip b{ color:var(--arc); font-weight:400; }
#jacketchip.off b{ color:var(--threat); }

html.blackout #dmgvig{ opacity:.55 !important; background:radial-gradient(circle at 50% 50%, transparent 30%, #1a0020cc 95%) !important; }
`;
    const n = document.createElement('style'); n.id = 'lore31-css'; n.textContent = css;
    document.head.appendChild(n);

    const ui = document.querySelector('#ui');
    if (!ui) return;
    const wrap = document.createElement('div');
    wrap.id = 'ragewrap';
    wrap.innerHTML = '<div id="ragelbl">Rage</div><div id="ragebar"><i></i></div>';
    ui.appendChild(wrap);
    const chip = document.createElement('div');
    chip.id = 'jacketchip';
    chip.innerHTML = 'Regulator <b>ON</b>';
    ui.appendChild(chip);
  });

  /* ==================================================================== JACKET
     A real item with numbers on both sides of the decision. */
  step('jacket', () => {
    g.jacketOn = true;
    g.rage = 0;
    g.blackout = false;
    g.blackoutT = 0;
    g.exhaustT = 0;

    Hook.after(Game.prototype, 'restore', function () {
      if (this.flags.jacketOff) this.jacketOn = false;
      if (this.flags.has_jacket === undefined) this.flags.has_jacket = !!this.flags.job_blackout;
    }, 'lore31:restore');

    /* The stat block is a getter that composes from ranks. Wrap it rather
       than rewrite it: the jacket is a multiplier on the result, which is
       exactly what the fiction says it is. */
    const baseStats = Object.getOwnPropertyDescriptor(Game.prototype, 'stats').get;
    Object.defineProperty(Game.prototype, 'stats', {
      configurable: true,
      get: function () {
        const s = baseStats.call(this);
        if (!this.jacketOn) {
          const o = LORE.jacket.off;
          s.maxEnergy *= o.energyMul;
          s.dmgMul *= o.damageMul;
          s.energyRegen *= o.regenMul;
        }
        if (this.blackout) {
          s.dmgMul *= LORE.blackout.damageMul;
          s.sprintSpeed *= LORE.blackout.speedMul;
          s.dmgResMul *= LORE.blackout.incomingMul;
        }
        if (this.exhaustT > 0) {
          s.dmgMul *= 0.5;
          s.dmgResMul *= 1.6;
        }
        return s;
      }
    });

    g.setJacket = function (on, silent) {
      if (!this.flags.has_jacket) {
        this.ui.toast('NOTHING TO TAKE OFF', 'Rex has not given you the Regulator yet');
        return false;
      }
      if (this.blackout) return false;
      this.jacketOn = !!on;
      this.flags.jacketOff = !on;
      this.rage = on ? 0 : this.rage;
      this.persist();
      const chip = document.querySelector('#jacketchip');
      if (chip) {
        chip.innerHTML = 'Regulator <b>' + (on ? 'ON' : 'OFF') + '</b>';
        chip.classList.toggle('off', !on);
      }
      const rw = document.querySelector('#ragewrap');
      if (rw) rw.classList.toggle('on', !on);
      if (this.rig && this.rig.mats) {
        // The jacket is the cloth. Off means the shell goes with it.
        for (const c of (this.rig.coat || [])) c.g.visible = false;
      }
      if (!silent) {
        if (on) {
          this.ui.toast('REGULATOR ON', 'Capped, stable, and you will not lose yourself.');
          FX.ringBurst(this.player.pos.clone(), 4, '#5FE3FF', 0.5);
        } else {
          this.ui.toast('REGULATOR OFF', '+60% damage, +50% charge — and rage now builds.');
          FX.flash(0.4, '#B48CFF');
          FX.ringBurst(this.player.pos.clone(), 7, '#B48CFF', 0.8, 0.4);
          try { AudioX.play('unlock_power', { vol: 0.9 }); } catch (e) { }
          this.ui.say('REX', 'You are supposed to wear it while you learn. Not forever. Your call.', 4);
        }
      }
      Bus.emit('jacket:changed', on);
      return true;
    };

    // J on the keyboard; a row in the pause menu for touch.
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyJ' || e.repeat) return;
      if (Input.panelOpen && Input.panelOpen()) return;
      if (g.state !== 'play') return;
      g.setJacket(!g.jacketOn);
    });

    // Rex hands it over the first time you finish a job for him.
    Bus.on('job:complete', (job) => {
      if (g.flags.has_jacket || job.giver !== 'REX') return;
      g.flags.has_jacket = true;
      g.persist();
      CLOCK.in(2.0, () => {
        g.ui.say('REX', 'Take this. It is not what gives you your powers — it does the opposite.', 4.6);
        CLOCK.in(4.8, () => {
          g.ui.toast('THE REGULATOR', (Input.touch ? 'Take it off from the pause menu' : 'Press J') +
            ' — off is stronger, and less safe');
          FX.ringBurst(g.player.pos.clone(), 6, '#2B6BFF', 0.8, 0.4);
        });
      });
    });
  });

  /* =================================================================== RAGE */
  step('rage', () => {
    const bar = () => document.querySelector('#ragebar i');
    let shown = 0;
    const render = () => {
      const b = bar();
      if (!b) return;
      const k = Math.round(clamp(g.rage / 100, 0, 1) * 64) / 64;
      if (k === shown) return;
      shown = k;
      b.style.transform = 'scaleX(' + k + ')';
      const w = document.querySelector('#ragewrap');
      if (w) w.classList.toggle('full', k >= 1);
    };

    const add = (v) => {
      if (g.jacketOn || g.blackout || g.state !== 'play') return;
      g.rage = clamp(g.rage + v, 0, 100);
      render();
      if (g.rage >= 100) g.enterBlackout();
    };
    Bus.on('player:hurt', (dmg) => add(dmg * 0.9));
    Bus.on('enemy:killed', () => add(6));
    Bus.on('parry:perfect', () => add(4));

    Hook.after(Game.prototype, 'frame', function () {
      if (this.jacketOn || this.blackout) return;
      const d = this._dtAvg || 0.016;
      // Rage bleeds off when nothing is happening, so walking around does not
      // eventually transform you.
      if (this.rage > 0 && (!this.director || this.director.heat < 0.3)) {
        this.rage = Math.max(0, this.rage - 5 * d);
        render();
      }
    }, 'lore31:ragebleed');
  });

  /* =============================================================== BLACKOUT */
  step('blackout', () => {
    let saved = null;

    g.enterBlackout = function () {
      if (this.blackout || this.jacketOn) return;
      this.blackout = true;
      this.blackoutT = LORE.blackout.dur;
      this.rage = 0;
      this.flags.seen_blackout = true;
      this.persist();
      document.documentElement.classList.add('blackout');

      const rig = this.rig;
      if (rig) {
        saved = {
          suit: rig.mats.suit.color.clone(),
          armor: rig.mats.armor.color.clone(),
          dark: rig.mats.dark.color.clone(),
          cloth: rig.mats.cloth.color.clone(),
          skin: rig.faceSkin ? rig.faceSkin.color.clone() : null
        };
        // "His skin turned completely black." All of it, including the face.
        rig.mats.suit.color.set('#05060a');
        rig.mats.armor.color.set('#0a0810');
        rig.mats.dark.color.set('#020204');
        rig.mats.cloth.color.set('#05060a');
        if (rig.faceSkin) rig.faceSkin.color.set('#08070c');
        // "He grew taller." BipedRig.update writes root.scale every frame for
        // its squash-and-stretch, so setting it here is overwritten on the
        // next tick. A multiplier the rig applies on top is the only version
        // that survives.
        rig.__sizeMul = 1.14;
        rig.setTrim('#5FA8FF', 4.2);
        if (rig.eyeIris) rig.eyeIris.color.set('#dff2ff');
        buildClaws(rig);
        setClaws(rig, true);
      }

      FX.flash(0.85, '#8A4BFF');
      FX.shake(0.9, 0.9);
      FX.stop(0.3);
      try { AudioX.play('roar', { vol: 1 }); Score.go('boss', true); Grade.glitch(0.9, 1.6); } catch (e) { }
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        FX.bolt(this.player.pos.clone().add(V3(0, 1.1, 0)),
          this.player.pos.clone().add(V3(Math.cos(a) * 8, rand(0, 4), Math.sin(a) * 8)), '#7fb8ff', 0.32, 1.4);
      }
      this.ui.toast('BLACKOUT', 'You are still in there. You are not driving.');
      this.ui.say('HEXIS', 'Not now. Not now—', 2.2);
      Bus.emit('blackout:start');
    };

    g.exitBlackout = function () {
      if (!this.blackout) return;
      this.blackout = false;
      this.blackoutT = 0;
      this.exhaustT = LORE.blackout.exhaustion;
      this.rage = 0;
      document.documentElement.classList.remove('blackout');
      const rig = this.rig;
      if (rig && saved) {
        rig.mats.suit.color.copy(saved.suit);
        rig.mats.armor.color.copy(saved.armor);
        rig.mats.dark.color.copy(saved.dark);
        rig.mats.cloth.color.copy(saved.cloth);
        if (saved.skin && rig.faceSkin) rig.faceSkin.color.copy(saved.skin);
        rig.__sizeMul = 1;
        rig.setTrim('#5FE3FF', 1.8);
        setClaws(rig, false);
      }
      FX.flash(0.5, '#bfefff');
      FX.ringBurst(this.player.pos.clone(), 8, '#5FE3FF', 0.9, 0.5);
      try { Score.go('combat', true); } catch (e) { }
      this.ui.toast('SPENT', 'Four seconds of nothing left. Do not be standing anywhere stupid.');
      Bus.emit('blackout:end');
    };

    /* Claws and the blue fire on the fists. Built once, hidden between uses —
       a transformation that allocates geometry every time it fires is a
       transformation that stutters every time it fires. */
    function buildClaws(rig) {
      if (rig.__claws) return;
      rig.__claws = [];
      const S = rig.S;
      const clawMat = new THREE.MeshStandardMaterial({ color: '#0b0b12', roughness: 0.35, metalness: 0.6 });
      const fireMat = new THREE.MeshBasicMaterial({
        color: '#5FA8FF', transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      });
      for (const arm of [rig.armL, rig.armR]) {
        if (!arm || !arm.hand) continue;
        const grp = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const c = taper(0.026 * S, 0.004 * S, 0.13 * S, 0.022 * S, clawMat,
            (-0.036 + i * 0.036) * S, -0.24 * S, 0.028 * S);
          c.rotation.x = -0.25;
          grp.add(c);
        }
        const fire = new THREE.Mesh(new THREE.SphereGeometry(0.15 * S, 8, 6), fireMat);
        fire.position.set(0, -0.13 * S, 0.01 * S);
        grp.add(fire);
        grp.visible = false;
        arm.hand.add(grp);
        rig.__claws.push({ grp, fire });
      }
    }
    function setClaws(rig, on) {
      if (!rig.__claws) return;
      for (const c of rig.__claws) c.grp.visible = on;
    }

    Hook.after(Game.prototype, 'frame', function () {
      const d = this._dtAvg || 0.016;
      if (this.exhaustT > 0) this.exhaustT = Math.max(0, this.exhaustT - d);
      if (!this.blackout) return;
      this.blackoutT -= d;
      // Blue fire, sold with the pooled FX rather than a particle system.
      if (this.rig && this.rig.__claws && Math.random() < d * 26) {
        const c = RND.pick(this.rig.__claws);
        const p = new THREE.Vector3();
        c.fire.getWorldPosition(p);
        FX.spark(p, 2, '#7fb8ff', 3.4, 4, 0.5);
        c.fire.scale.setScalar(0.85 + Math.random() * 0.5);
      }
      if (this.blackoutT <= 0) this.exitBlackout();
    }, 'lore31:blackoutTick');

    // No healing in Blackout. The fiction is that you are not making decisions.
    Hook.before(AbilitySystem.prototype, 'tryHeal', function () {
      if (this.g.blackout) {
        this.g.ui.toast('NO', 'Blackout does not do first aid');
        return false;
      }
    }, 'lore31:noHeal');

    // Dying drops you out of it rather than leaving a black corpse.
    Hook.before(Game.prototype, 'onDeath', function () {
      if (this.blackout) this.exitBlackout();
    }, 'lore31:deathExit');

    g.blackoutNow = () => g.enterBlackout();
  });

  /* The size multiplier the transformation needs, applied after the rig has
     written its own squash. One multiply per frame per rig, and it is the
     only place root.scale is touched by anything other than BipedRig. */
  step('sizemul', () => {
    Hook.after(BipedRig.prototype, 'update', function () {
      const k = this.__sizeMul;
      if (!k || k === 1) return;
      this.root.scale.multiplyScalar(k);
    }, 'lore31:sizeMul');
  });

  /* ====================================================== KELL, TO SPEC */
  step('kell', () => {
    if (typeof makeKell !== 'function') return;
    const base = makeKell;
    makeKell = function () {
      const rig = base();
      try {
        /* "Easily seven feet tall, his skin a deep purple colour that seemed
           to absorb light. His eyes glowed with a soft red luminescence. He
           wore a suit of armour that looked ancient, covered in symbols that
           no living human could translate." */
        rig.root.scale.setScalar(1.18);           // ~2.1 m against Hexis's 1.8
        if (rig.mats) {
          rig.mats.suit.color.set('#3b1f52');      // deep purple, light-absorbing
          rig.mats.suit.roughness = 0.86;
          rig.mats.armor.color.set('#2a2230');     // ancient, dulled metal
          rig.mats.armor.metalness = 0.72;
          rig.mats.armor.roughness = 0.52;
          rig.mats.dark.color.set('#120a1a');
          rig.mats.cloth.color.set('#1d1226');
        }
        rig.cfg.eye = '#FF3B30';
        rig.cfg.heavy = true;
        rig.cfg.jacket = false;
        if (rig.setTrim) rig.setTrim('#FF3B30', 1.6);
      } catch (e) { console.warn('[lore] kell', e); }
      return rig;
    };

    /* The symbols. Drawn once into a texture and put on the armour, which is
       the only way "covered in symbols no living human could translate" can
       be true without hand-placing a hundred decals. */
    Bus.on('boss:spawned', () => { });
    Hook.after(Game.prototype, 'startArena', function () {
      const b = this.boss;
      if (!b || !b.rig || !b.rig.mats || b.rig.__glyphed) return;
      b.rig.__glyphed = true;
      try {
        const tex = Tex.make('glyphs', (x, s) => {
          x.fillStyle = '#8c8c8c'; x.fillRect(0, 0, s, s);
          x.strokeStyle = 'rgba(20,10,30,0.85)';
          x.lineCap = 'round';
          const rnd = new RNG(90210);
          for (let i = 0; i < 90; i++) {
            const cx = rnd.range(0, s), cy = rnd.range(0, s), r = rnd.range(4, 16);
            x.lineWidth = rnd.range(1.5, 3);
            x.beginPath();
            // A made-up script: strokes on a hex lattice, never a closed loop.
            const n = rnd.int(2, 4);
            let px = cx, py = cy;
            x.moveTo(px, py);
            for (let k = 0; k < n; k++) {
              const a = Math.floor(rnd.range(0, 6)) * Math.PI / 3;
              px += Math.cos(a) * r; py += Math.sin(a) * r;
              x.lineTo(px, py);
            }
            x.stroke();
            if (rnd.chance(0.3)) { x.beginPath(); x.arc(cx, cy, r * 0.35, 0, Math.PI * 2); x.stroke(); }
          }
        });
        const m = b.rig.mats.armor;
        m.__dressed = false;
        Tex.dress(m, 'glyphs', 2.2, 1.1);
      } catch (e) { }
    }, 'lore31:kellGlyphs');
  });

  /* ======================================================= REX, TO SPEC */
  step('rex', () => {
    if (typeof makeMentor !== 'function') return;
    const base = makeMentor;
    makeMentor = function () {
      const rig = base();
      try {
        /* "Humanoid, with dark hair and a weathered face. He wore a long coat
           that seemed to shimmer with faint patterns." */
        if (rig.mats) {
          rig.mats.cloth.color.set('#151b2c');
          rig.mats.suit.color.set('#1b2130');
          rig.mats.armor.color.set('#2a3140');
          if (Tex && Tex.enabled) {
            rig.mats.cloth.__dressed = false;
            Tex.dress(rig.mats.cloth, 'leather', 2.0, 1.2);
            // The shimmer: a low-roughness coat that catches the rim light and
            // moves patterns across itself as you walk round him.
            rig.mats.cloth.roughness = 0.34;
            rig.mats.cloth.metalness = 0.28;
          }
        }
        rig.cfg.coat = true;
        rig.cfg.jacket = false;
        rig.cfg.hair = true;
        rig.cfg.eye = '#bfefff';
      } catch (e) { }
      return rig;
    };
  });

  /* ============================================== THE RESPONSE TEAM */
  const TEAM = [
    /* Six people, and until 3.2 they were six copies of one silhouette in
       six colours. `build` and `hair` are what actually tell them apart at
       twenty metres; the trim colour only helps once you are close enough to
       read it. `kind` still drives their combat archetype, but it is cleared
       off the rig before sculpting so the enemy gear pass does not put a riot
       helm on Monica. */
    { id: 'flare', name: 'Flare', real: 'Monica', trim: '#FF6A2A', suit: '#3a1a12', armor: '#5a2a16',
      line: 'Do not get in my way. Do not slow me down.', kind: 'enforcer',
      build: 'lean', hair: 'long', skin: '#c98d63', hairCol: '#241612' },
    { id: 'phantom', name: 'Phantom', real: 'David', trim: '#9fd8ff', suit: '#1a2430', armor: '#243444',
      line: 'I am not a fighter. I never wanted to be a fighter.', kind: 'grunt', ghost: true,
      build: 'runner', hair: 'crop', skin: '#dcb08c', hairCol: '#3a2a1e' },
    { id: 'brick', name: 'Brick', real: 'Marcus', trim: '#FFC64D', suit: '#2c2f38', armor: '#4a4433',
      line: 'The situation sucks. But I have got powers, and I get to use them?', kind: 'brute',
      build: 'titan', hair: 'crop', pauldron: true, skin: '#8d5a38', hairCol: '#15100c' },
    { id: 'specter', name: 'Specter', real: 'Elena', trim: '#7CFFB2', suit: '#1c2a24', armor: '#2a3c33',
      line: 'We are not here to be heroes. We are here because we are useful.', kind: 'enforcer',
      build: 'shade', hair: 'long', hood: true, skin: '#b8815c', hairCol: '#1c1410' },
    { id: 'ace', name: 'Ace', real: '—', trim: '#B48CFF', suit: '#191426', armor: '#241c36',
      line: 'I am here to do a job. Nothing more.', kind: 'stalker',
      build: 'lean', hair: 'crop', mask: true, skin: '#a9764f', hairCol: '#12100f' },
    { id: 'pierce', name: 'Cmdr Pierce', real: 'no powers', trim: '#7C8AA3', suit: '#23262c', armor: '#33383f',
      line: 'You are tools. And I am the one who decides how you are used.', kind: 'grunt',
      build: 'heavy', hair: 'crop', pauldron: true, skin: '#d3a274', hairCol: '#59544e' }
  ];

  step('team', () => {
    g.teamRigs = [];
    /* Allies, not enemies: they are built from the same archetype rigs so
       every animation applies, then coloured and put on the player's side. */
    g.spawnTeam = function (ids, at) {
      const out = [];
      for (const id of (ids || TEAM.map(t => t.id))) {
        const T = TEAM.find(t => t.id === id);
        if (!T) continue;
        try {
          const rig = makeArchetypeRig(T.kind);
          rig.cfg.face = true;
          rig.cfg.hair = true;
          rig.cfg.jacket = true;
          rig.cfg.eye = T.trim;
          // Silhouette first, colour second.
          rig.cfg.build = T.build;
          rig.cfg.hairStyle = T.hair;
          rig.cfg.pauldron = !!T.pauldron;
          rig.cfg.hood = !!T.hood;
          rig.cfg.mask = !!T.mask;
          rig.cfg.helmet = false;
          rig.cfg.kind = null;          // people, not troops: no enemy gear
          rig.__tier = 0;
          if (T.skin) rig.faceSkin = new THREE.MeshStandardMaterial({
            color: T.skin, roughness: 0.74, metalness: 0
          });
          if (T.hairCol) {
            rig.faceHair = new THREE.MeshStandardMaterial({
              color: T.hairCol, roughness: 0.80, metalness: 0
            });
            rig.faceHairLit = new THREE.MeshStandardMaterial({
              color: new THREE.Color(T.hairCol).multiplyScalar(1.45),
              roughness: 0.78, metalness: 0
            });
          }
          rig.mats.suit.color.set(T.suit);
          rig.mats.armor.color.set(T.armor);
          rig.mats.trim.color.set(T.trim);
          if (Sculpt.faceCfg) Sculpt.faceCfg(rig, { face: true, hair: true, eye: T.trim });
          if (T.ghost) {
            rig.root.traverse(o => {
              if (o.isMesh && o.material && !o.material.transparent) {
                o.material = o.material.clone();
                o.material.transparent = true;
                o.material.opacity = 0.55;
              }
            });
          }
          const p = (at || g.player.pos).clone().add(V3(rand(-6, 6), 0, rand(-6, 6)));
          rig.root.position.copy(p);
          g.scene.add(rig.root);
          const unit = { id: T.id, name: T.name, rig, t: rand(0, 6), pos: p, T };
          g.teamRigs.push(unit);
          out.push(unit);
        } catch (e) { console.warn('[lore] team ' + id, e); }
      }
      g.flags.met_team = true;
      g.persist();
      return out;
    };
    g.clearTeam = function () {
      for (const u of this.teamRigs) {
        this.scene.remove(u.rig.root);
        if (u.rig.dispose) u.rig.dispose();
      }
      this.teamRigs.length = 0;
    };
    Bus.on('zone:loaded', () => g.clearTeam());

    /* They fight. Badly, and only near you, which is exactly the point the
       comic makes about them before they learn to work together. */
    Hook.after(Game.prototype, 'frame', function () {
      if (!this.teamRigs.length || this.state !== 'play') return;
      const d = this._dtAvg || 0.016;
      for (const u of this.teamRigs) {
        u.t += d;
        // Find something to shout at.
        let target = null, bd = 26;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const dist = dist2D(e.pos, u.pos);
          if (dist < bd) { bd = dist; target = e; }
        }
        const goal = target ? target.pos : this.player.pos;
        const dir = dirTo(u.pos, goal, SCR.v3());
        const want = target ? (bd > 4 ? 1 : 0) : (dist2D(u.pos, this.player.pos) > 7 ? 1 : 0);
        u.pos.x += dir.x * 4.2 * want * d;
        u.pos.z += dir.z * 4.2 * want * d;
        u.rig.root.position.copy(u.pos);
        u.rig.root.rotation.y = yawTo(u.pos, goal);
        u.rig.update(d, { speed: want * 4.2, grounded: true, atk: -1, punch: -1 });
        // A hit every couple of seconds, for a fraction of what you do.
        u.cd = (u.cd || rand(0, 2)) - d;
        if (target && bd < 4.5 && u.cd <= 0) {
          u.cd = rand(1.6, 2.8);
          FX.bolt(u.pos.clone().add(V3(0, 1.2, 0)), target.pos.clone().add(V3(0, 1, 0)), u.T.trim, 0.16, 0.8);
          dealDamage(this, target, 9, { from: u.pos.clone(), knock: 2, source: u.name.toUpperCase(), noUlt: true, noCombo: true });
        }
      }
    }, 'lore31:teamTick');
  });

  /* ================================================= CODEX + SETTINGS */
  step('codex', () => {
    // The pause menu's codex gets a Part One section ahead of the hardware.
    Hook.after(Game.prototype, 'restore', function () {
      this.flags.lore = this.flags.lore || {};
    }, 'lore31:loreFlags');

    g.loreEntries = function () {
      return LORE.entries.filter(e => { try { return e.gate(this); } catch (x) { return false; } }, this);
    };

    // Jacket row in Settings, so touch has a way to take it off.
    if (typeof SETTINGS_SCHEMA !== 'undefined') {
      SETTINGS_SCHEMA.push({ head: 'The Regulator' });
      SETTINGS_SCHEMA.push({
        key: '__jacket', name: 'Regulator jacket', kind: 'seg',
        hint: 'Rex’s jacket caps how much of yourself you can reach. Off is +60% damage and ' +
              '+50% charge, and rage starts building. Also on J.',
        vals: [true, false], labels: ['Worn', 'Off']
      });
      // The schema renders from g.opts, so mirror the state into it.
      g.opts.__jacket = true;
      Hook.after(Game.prototype, 'applyOpts', function () {
        if (this.opts.__jacket !== undefined && this.opts.__jacket !== this.jacketOn) {
          this.setJacket(this.opts.__jacket);
        }
      }, 'lore31:jacketOpt');
      Bus.on('jacket:changed', (on) => { g.opts.__jacket = on; });
    }
  });

  /* ============================================== SYNDICATE NAMING
     The hostiles are the Syndicate now, which costs one table and makes the
     kill feed and the codex agree with the story. */
  step('syndicate', () => {
    if (typeof ENEMY_DEFS === 'undefined') return;
    const rename = {
      grunt: 'Syndicate Runner', enforcer: 'Syndicate Enforcer', swarmer: 'Syndicate Cutter',
      drone: 'Syndicate Sentry', sniper: 'Syndicate Lancer', warden: 'Syndicate Warden',
      brute: 'Syndicate Breaker', stalker: 'Syndicate Ghost', pylon: 'Syndicate Pylon',
      turret: 'Syndicate Emplacement'
    };
    for (const k in rename) if (ENEMY_DEFS[k]) ENEMY_DEFS[k].name = rename[k];
  });

  console.log('[hexis 3.1] lore online:', done.join(', '));
})();
