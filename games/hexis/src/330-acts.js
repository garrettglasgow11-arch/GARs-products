/* ===== 330-acts.js ========================================================
   HEXIS 3.0 — Acts II and III, connected to the rest of the game.

   What the 2.4 build actually contained, and what none of it was wired to:

     · four finished zones — Undercity, Foundry, Spire, Lattice — with spawns,
       patrol graphs, acoustics and weather already declared. `loadZone` was
       only ever called with the three Act I builders, so none of them could
       be entered by any means, including the debug console.
     · a seven-topic Rex conversation with story gates that set `zone_undercity`,
       `zone_spire` and `met_architect`. `Dialogue` is constructed by
       LifeSystem and then never started by anything: Rex remained the Act I
       two-button mission board.
     · the Architect: a four-phase boss with anchors, five telegraphed moves,
       drone escorts, teleports and afterimages. `new Architect(...)` appears
       nowhere in the file.

   So the ending existed and could not be reached. This is the connective
   tissue: a board you talk to Rex through, a transit system that can load the
   zones, the Act III encounter, and an ending.

   Two real defects had to be fixed to make any of it survivable, and both are
   in the base rather than in the new content — see [BOSS-FIX] below.
   ========================================================================= */

const TRAVEL = {
  city: { name: 'Central City', sub: 'The beacon, and Rex', gate: () => true, zone: 'city' },
  undercity: {
    name: 'The Undercity', sub: 'Transit tunnels, flooded and occupied',
    gate: (g) => !!g.flags.zone_undercity, zone: 'undercity'
  },
  foundry: {
    name: 'The Foundry', sub: 'Where the arm was made',
    gate: (g) => !!g.flags.zone_foundry, zone: 'foundry'
  },
  spire: {
    name: 'The Spire', sub: 'Four hundred metres up',
    gate: (g) => !!g.flags.zone_spire, zone: 'spire'
  },
  lattice: {
    name: 'The Lattice', sub: 'Training. Nothing here reports back',
    gate: (g) => !!g.flags.job_blackout, zone: 'lattice'
  }
};

(function actsPass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[acts] ' + n, e); } };

  /* ------------------------------------------------------------- [BOSS-FIX]
     Two base defects that only surface once a BossBase subclass is on the
     field, which until now none ever was.

     [1] `get targets` admits the boss only while `phase >= 1 && phase <= 3`.
         That was written for Kell, whose phase 4 is the scripted mercy beat
         and is deliberately unhittable. The Architect's phase 4 is a real
         fight — three afterimages and the true body — so under the base rule
         the final phase of the final boss cannot be damaged by anything: not
         a swing, not a bolt, not the ultimate. The fight is unwinnable.

     [2] `loadZone` tears the old boss down by iterating `this.boss.blasts`,
         a field only BossController has. Leaving the Spire with an Architect
         alive throws inside loadZone, which aborts the load *after* the old
         zone has been disposed — a black screen with a live HUD.

     Both are replaced rather than patched around, because a third boss would
     hit them again. */
  step('boss-fix', () => {
    // [1] is fixed where the getter is rebuilt for other reasons — see
    // 360-perf.js, which replaces `targets` with a frame-cached version and
    // carries the corrected rule: a boss is a target unless it is the Act I
    // scripted mercy phase. Both the fix and the cache have to live in one
    // getter, and the cache is the more invasive of the two.

    Hook.set(Game.prototype, 'loadZone', (function (base) {
      return function (builder, fogColor, fogDensity) {
        const b = this.boss;
        if (b) {
          // Hand the teardown to whoever knows the shape of this boss.
          try {
            if (b.remove) b.remove();
            else {
              if (b.blasts) for (const x of b.blasts) {
                this.scene.remove(x.mesh);
                x.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
              }
              if (b.rig) { this.scene.remove(b.rig.root); if (b.rig.dispose) b.rig.dispose(); }
            }
          } catch (e) { console.warn('[acts] boss teardown', e); }
          this.boss = null;
        }
        return base.call(this, builder, fogColor, fogDensity);
      };
    })(Game.prototype.loadZone), 'acts30:loadZone.boss');
  });

  /* --------------------------------------------------------- CUTSCENE ABORT
     Travelling out of a zone while a cutscene is playing left the cutscene
     running over the new one: its shots keep driving the camera to marks that
     no longer exist, and its completion callback fires against the old zone.
     The Act I arena is the reproduction — `startArena` opens an eleven-second
     scene whose callback is `startBoss`, so travelling during it lands you in
     the new zone and then throws inside `startBoss` because `this.boss` was
     disposed by the zone change.

     Two halves. A cutscene can now be abandoned without running its callback,
     and startBoss refuses to configure a boss that is not there. */
  step('cutscene-abort', () => {
    CutsceneManager.prototype.abort = function () {
      if (!this.shots) return false;
      this.onDone = null;          // finish() already guards on this
      this.skip();
      return true;
    };
    Hook.before(Game.prototype, 'startBoss', function () {
      if (!this.boss || this.boss.dead) {
        console.warn('[acts] startBoss with no boss — the zone changed under it');
        return false;
      }
    }, 'acts30:startBoss.guard');
  });

  /* ------------------------------------------------------------------- CSS */
  step('style', () => {
    const css = `
#board{
  position:absolute; inset:0; z-index:46; display:none;
  background:radial-gradient(120% 90% at 70% 20%,rgba(43,107,255,.10),transparent 60%),rgba(4,6,11,.9);
  backdrop-filter:blur(4px);
}
#board.on{ display:grid; place-content:center; }
#board .bx{
  width:min(760px,92vw); max-height:82vh; display:flex; flex-direction:column;
  background:linear-gradient(160deg,rgba(11,18,32,.96),rgba(5,7,12,.96));
  border:1px solid rgba(95,227,255,.28); clip-path:var(--clip);
}
#board header{
  display:flex; align-items:baseline; justify-content:space-between; gap:16px;
  padding:16px 20px 10px; border-bottom:1px solid rgba(95,227,255,.16);
}
#board header h2{ font-family:var(--disp); font-size:24px; letter-spacing:.1em; text-transform:uppercase; margin:0; }
#board header .lbl{ font:400 9px/1 var(--mono); letter-spacing:.28em; text-transform:uppercase; color:var(--steel); }
#board .tabs{ display:flex; gap:0; padding:0 20px; border-bottom:1px solid rgba(95,227,255,.12); }
#board .tabs button{
  all:unset; cursor:pointer; padding:10px 16px;
  font:400 10px/1 var(--mono); letter-spacing:.22em; text-transform:uppercase; color:var(--steel);
  border-bottom:2px solid transparent;
}
#board .tabs button.on{ color:var(--arc); border-bottom-color:var(--arc); }
#board .list{ overflow-y:auto; -webkit-overflow-scrolling:touch; padding:8px 20px 16px; touch-action:pan-y; }
#board .job{
  display:grid; grid-template-columns:1fr auto; gap:6px 16px; align-items:center;
  padding:13px 0; border-bottom:1px solid rgba(95,227,255,.10); cursor:pointer;
}
#board .job:hover .jn{ color:var(--arc); }
#board .jn{ font-family:var(--disp); font-size:17px; letter-spacing:.05em; text-transform:uppercase; color:var(--bone); transition:color .15s; }
#board .jb{ grid-column:1; font:400 11.5px/1.5 system-ui,sans-serif; color:var(--steel); }
#board .jt{ grid-row:1/3; font:400 9px/1.5 var(--mono); letter-spacing:.16em; text-transform:uppercase; color:var(--gold); text-align:right; white-space:nowrap; }
#board .job.locked{ opacity:.38; cursor:default; }
#board .job.locked .jt{ color:var(--steel); }
#board .job.done .jt{ color:var(--venom,#7CFFB2); }
#board footer{ padding:12px 20px 16px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid rgba(95,227,255,.14); }
#board .empty{ padding:26px 0; font:400 12px/1.6 system-ui,sans-serif; color:var(--steel); }

/* interaction prompt on a world object */
#ipro{
  position:absolute; left:50%; bottom:23%; transform:translateX(-50%);
  z-index:18; pointer-events:none; text-align:center; opacity:0; transition:opacity .18s ease;
  font:400 10px/1.5 var(--mono); letter-spacing:.2em; text-transform:uppercase; color:var(--steel);
}
#ipro.on{ opacity:1; }
#ipro b{
  display:inline-block; margin-bottom:5px; padding:5px 11px;
  font-size:13px; letter-spacing:.14em; color:var(--arc);
  border:1px solid rgba(95,227,255,.4); clip-path:var(--clip);
  background:rgba(5,7,12,.6);
}
`;
    const n = document.createElement('style'); n.id = 'acts30-css'; n.textContent = css;
    document.head.appendChild(n);
  });

  /* ----------------------------------------------------------------- BOARD
     One panel, two tabs. Jobs come from the runner's availability rule so
     there is a single source of truth about what can be taken; travel comes
     from TRAVEL and the same story flags Rex's conversation sets. */
  const board = document.createElement('div');
  board.id = 'board';
  board.innerHTML =
    '<div class="bx">' +
    '<header><h2>The Board</h2><span class="lbl">Rex only posts what he can pay for</span></header>' +
    '<div class="tabs"><button data-t="jobs" class="on">Jobs</button><button data-t="travel">Transit</button></div>' +
    '<div class="list"></div>' +
    '<footer><button class="btn ghost" id="board-close">Back</button></footer>' +
    '</div>';

  function boardOpen(tab) {
    (document.querySelector('#ui') || document.body).appendChild(board);
    board.classList.add('on');
    g.boardOpen = true;
    if (g.ex) g.ex.paused = true;
    if (document.exitPointerLock) document.exitPointerLock();
    paintBoard(tab || 'jobs');
    try { AudioX.play('ui_open', { vol: 0.6 }); } catch (e) { }
  }
  function boardClose() {
    board.classList.remove('on');
    g.boardOpen = false;
    if (g.ex) g.ex.paused = false;
    Input.requestLock(g.canvas);
    try { AudioX.play('ui_back', { vol: 0.5 }); } catch (e) { }
  }
  g.openBoard = boardOpen;
  g.closeBoard = boardClose;

  function paintBoard(tab) {
    board.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const list = board.querySelector('.list');
    list.innerHTML = '';
    if (tab === 'jobs') paintJobs(list); else paintTravel(list);
  }

  function paintJobs(list) {
    const avail = g.jobs.available();
    // Show the locked ones too, greyed, so the player can see what the story
    // is pointing at rather than wondering whether the board is empty.
    const all = Object.keys(JOBS).map(k => JOBS[k]).sort((a, b) => (a.tier || 0) - (b.tier || 0));
    let shown = 0;
    for (const j of all) {
      const open = avail.indexOf(j) >= 0;
      const doneAlready = !!g.flags['job_' + j.id] && !j.repeatable;
      if (!open && !doneAlready && j.tier > 4 && !j.gate(g)) {
        // Deep-story jobs stay hidden until their chapter is in play.
        if (!g.flags.job_cargo) continue;
      }
      shown++;
      const row = document.createElement('div');
      row.className = 'job' + (doneAlready ? ' done' : (open ? '' : ' locked'));
      row.innerHTML =
        '<div class="jn">' + j.name + '</div>' +
        '<div class="jb">' + (j.blurb || '') + '</div>' +
        '<div class="jt">' + (doneAlready ? 'Done' : open ? (j.reward && j.reward.power ? 'Power' : (j.reward && j.reward.sp ? j.reward.sp + ' SP' : 'Take')) : 'Locked') + '</div>';
      if (open) onTap(row, () => {
        boardClose();
        // Travel first if the job lives somewhere else.
        if (j.zone && (!g.zone || g.zone.name !== j.zone)) {
          travelTo(j.zone, () => g.jobs.start(j.id));
        } else g.jobs.start(j.id);
      });
      list.appendChild(row);
    }
    if (!shown) list.innerHTML = '<div class="empty">Nothing posted. Talk to Rex.</div>';
  }

  function paintTravel(list) {
    let shown = 0;
    for (const k in TRAVEL) {
      const t = TRAVEL[k];
      const open = t.gate(g);
      const here = g.zone && g.zone.name === t.zone;
      shown++;
      const row = document.createElement('div');
      row.className = 'job' + (open ? (here ? ' done' : '') : ' locked');
      row.innerHTML =
        '<div class="jn">' + t.name + '</div>' +
        '<div class="jb">' + t.sub + '</div>' +
        '<div class="jt">' + (here ? 'You are here' : open ? 'Travel' : 'Locked') + '</div>';
      if (open && !here) onTap(row, () => { boardClose(); travelTo(t.zone); });
      list.appendChild(row);
    }
    if (!shown) list.innerHTML = '<div class="empty">Nowhere to go yet.</div>';
  }

  step('board', () => {
    board.querySelectorAll('.tabs button').forEach(b => onTap(b, () => paintBoard(b.dataset.t)));
    onTap(board.querySelector('#board-close'), boardClose);
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && g.boardOpen) { e.preventDefault(); boardClose(); } });
    Bus.on('dialogue:missions', () => boardOpen('jobs'));
  });

  /* ---------------------------------------------------------------- TRAVEL
     A fade, a chapter card, then the zone. The card names the place from the
     ZONES table so a new zone needs no new code here. */
  const BUILDERS = {
    city: () => buildCity, arena: () => buildArena, house: () => buildHouse,
    undercity: () => buildUndercity, foundry: () => buildFoundry,
    spire: () => buildSpire, lattice: () => buildLattice
  };

  function travelTo(name, then) {
    const meta = ZONES[name];
    const make = BUILDERS[name];
    if (!meta || !make) { console.warn('[acts] no zone', name); return; }
    if (g.jobs && g.jobs.running && g.jobs.job.zone !== name) g.jobs.abandon('travelled');
    // Any scene still playing belongs to the zone being left. Drop it before
    // the fade, because finish() calls ui.fade(0) on its way out and would
    // otherwise wipe the fade this transition just started.
    if (g.cut && g.cut.abort) g.cut.abort();
    CLOCK.cancel('travel');
    g.state = 'cutscene';
    g.ui.fade(1, 0.5);
    CLOCK.in(0.6, () => {
      const fog = meta.fog || ['#080c16', 0.008];
      g.loadZone(make(), fog[0], fog[1]);
      g.hp = Math.max(g.hp, 60);
      g.energy = g.stats.maxEnergy;
      g.ui.showBoss(false);
      g.player.iframes = 1.5;
      g.camOrbit.yaw = Math.PI;
      g.ui.card(meta.name, name === 'spire' ? 'Act III' : name === 'city' ? 'Act II' : '');
      g.ui.fade(0, 0.9);
      g.state = 'play';
      Bus.emit('travel', name);
      if (then) CLOCK.in(1.2, then);
    }, 'travel');
  }
  g.travel = travelTo;

  /* ------------------------------------------------------------------- REX
     Replaces the base's two-button prompt with the conversation that was
     already written, plus the board. Everything else about the city story
     tick — patrol spawns, first meeting, the beacon waypoint — is untouched.

     The prompt element is new: the base reused the QTE prompt for this, which
     meant a mission offer and a dodge cue competed for the same node. */
  const ipro = document.createElement('div');
  ipro.id = 'ipro';
  ipro.innerHTML = '<b>E</b><span></span>';

  step('rex', () => {
    (document.querySelector('#ui') || document.body).appendChild(ipro);
    const proKey = ipro.querySelector('b'), proTxt = ipro.querySelector('span');
    if (Input.touch) proKey.textContent = 'TAP';

    let shownFor = null;
    g.setInteract = function (key, label, fn) {
      this.interactPrompt = fn || null;
      const sig = fn ? key + '|' + label : null;
      if (sig === shownFor) return;
      shownFor = sig;
      ipro.classList.toggle('on', !!fn);
      if (fn) { proKey.textContent = Input.touch ? 'TAP' : key; proTxt.textContent = label; }
    };

    Hook.set(Game.prototype, 'updateStory', (function (base) {
      return function (dt) {
        // House and arena keep the Act I script exactly as it was.
        if (!this.zone || this.zone.name !== 'city') { this.setInteract(); return base.call(this, dt); }

        const p = this.player;
        this.cityT = (this.cityT || 0) + dt;
        const rex = this.zone.spawns.rex;
        const near = p.pos.distanceTo(rex) < 7.5;

        if (near && !this.run.metRex) {
          this.run.metRex = true;
          this.ui.say('REX', 'You are the one who put Kell on the floor. Good. I have work.', 4, 'r01');
          this.grant(5, 'Found Rex');
        }

        if (near && !(this.jobs && this.jobs.running) && this.state === 'play') {
          this.setInteract('E', 'Talk to Rex', () => {
            if (this.ex && this.ex.life && this.ex.life.dialogue) {
              this.ex.life.dialogue.start('REX', REX_TOPICS);
            } else this.openBoard('jobs');
          });
        } else if (near && this.jobs && this.jobs.running) {
          this.setInteract('E', 'Abandon ' + this.jobs.job.name, () => {
            const j = this.jobs.job;
            this.jobs.abandon('stood down');
            this.ui.toast('STOOD DOWN', j.name + ' — it will still be on the board');
          });
        } else {
          this.setInteract();
        }

        if (this.interactPrompt && (Input.hit('KeyE') ||
            (Input.touch && Input.hit('__interact')))) {
          const fn = this.interactPrompt;
          this.setInteract();
          fn();
        }

        // Ambient patrols, unchanged in intent, but they stop while a job is
        // running so a job's own spawn budget is the only pressure.
        if (!(this.jobs && this.jobs.running) && this.enemies.length < 4 && this.cityT > 6) {
          this.cityT = 0;
          let best = null, bd = 1e9;
          for (const q of (this.zone.spawns.patrol || [])) {
            const d = q.distanceTo(p.pos);
            if (d > 24 && d < 95 && d < bd) { bd = d; best = q; }
          }
          if (best) this.spawnEnemy(Math.random() < 0.35 ? 'enforcer' : 'grunt',
            best.clone().add(V3(rand(-3.5, 3.5), 0.4, rand(-3.5, 3.5))));
        }
      };
    })(Game.prototype.updateStory), 'acts30:updateStory');

    // Touch needs a way to press E without a keyboard. The existing HEAL
    // button doubles as interact whenever a prompt is up, which is the one
    // moment healing is never what you meant.
    if (Input.touch) {
      Hook.after(Game.prototype, 'frame', function () {
        if (this.interactPrompt && Input.hit('KeyE')) { }
      }, 'acts30:touchInteract');
      const healBtn = document.querySelector('#tbtns [data-k="heal"]');
      if (healBtn) healBtn.addEventListener('touchstart', () => {
        if (g.interactPrompt) { const fn = g.interactPrompt; g.setInteract(); fn(); }
      }, { passive: true });
    }
  });

  /* -------------------------------------------------------------- ZONE EXITS
     Every zone that has an `exit` spawn gets a physical way out, so the world
     connects even for a player who never opens the board. */
  step('exits', () => {
    const EXITS = {
      undercity: { to: 'foundry', label: 'Continue to the Foundry', gate: (g) => !!g.flags.zone_foundry },
      foundry: { to: 'city', label: 'Back to Central City', gate: () => true },
      spire: { to: 'city', label: 'Back to Central City', gate: () => true },
      lattice: { to: 'city', label: 'Leave the Lattice', gate: () => true }
    };
    Hook.after(Game.prototype, 'updateStory', function () {
      if (!this.zone || this.state !== 'play') return;
      const e = EXITS[this.zone.name];
      if (!e) return;
      const at = this.zone.spawns.exit || this.zone.spawns.player;
      if (!at) return;
      if (this.player.pos.distanceTo(at) < 7 && e.gate(this) && !(this.jobs && this.jobs.running)) {
        this.setInteract('E', e.label, () => travelTo(e.to));
      }
    }, 'acts30:exits');
  });

  /* ------------------------------------------------------------------ ACT III
     The Architect. Built when the Ascent job reaches its boss stage, torn
     down by loadZone's corrected teardown when the player leaves. */
  step('act3', () => {
    Bus.on('act3:boss', () => {
      if (g.boss && !g.boss.dead) return;
      const at = (g.zone && g.zone.spawns.boss) || V3(0, 1.6, 6);
      const boss = new Architect(g, at);
      g.boss = boss;
      boss.spawnAnchors(3);
      g.ui.showBoss(true, 'SHIELDED — KILL THE ANCHORS  3/3');
      g.ui.setBossHp(1);
      g.ui.objective('Kill the Architect.');
      try { Score.go('boss', true); } catch (e) { }
      g.ui.say('ARCHITECT', 'You came up. I did not have to move at all.', 4, 'a01');
      Bus.emit('boss:spawned', boss);
    });

    Bus.on('boss:killed', (b) => {
      if (typeof Architect === 'undefined' || !(b instanceof Architect)) return;
      g.ui.showBoss(false);
      g.flags.act3_done = true;
      g.persist();
      // The job's boss stage has no completion rule of its own — it waits
      // here, which keeps the fight's ending in one place.
      CLOCK.in(2.2, () => {
        if (g.jobs && g.jobs.running && g.jobs.job.id === 'ascent') g.jobs.advance();
        ending();
      });
    });

    // The anchors are props, so their destruction is on the prop bus. The
    // boss's own onAnchorDown does the state change; this only keeps the
    // objective line honest for a player reading the panel rather than the bar.
    Bus.on('prop:destroyed', () => {
      const b = g.boss;
      if (!b || !b.anchors) return;
      const left = b.anchors.filter(a => !a.dead).length;
      if (left > 0) g.ui.objective('Anchors left: ' + left);
      else g.ui.objective('Kill the Architect.');
    });
  });

  /* ------------------------------------------------------------------ ENDING
     Short, and it lands on the thing the whole game has been about rather
     than on a boss corpse. Then the city reopens, because a game with a
     repeatable job wants somewhere to spend it. */
  function ending() {
    const P = g.player.pos.clone(), PH = P.clone().add(V3(0, 1.3, 0));
    g.state = 'cutscene';
    g.cut.play([
      {
        dur: 3.4, from: P.clone().add(V3(3.2, 2.0, 4.0)), to: P.clone().add(V3(2.4, 1.7, 3.0)),
        look: PH, fov: 38, hand: 0.012,
        say: ['', 'It came apart the way a plan does — all at once, and quietly.']
      },
      {
        dur: 3.6, from: P.clone().add(V3(-1.8, 1.7, 2.2)), to: P.clone().add(V3(-1.3, 1.6, 1.8)),
        look: PH, fov: 34,
        say: ['HEXIS', 'It never said their names either.']
      },
      {
        dur: 4.2, cut: false, from: P.clone().add(V3(6, 10, 16)), to: P.clone().add(V3(18, 34, 52)),
        look: PH, fov: 54, ease: 'out',
        say: ['', 'Four hundred metres down, the lights were coming back on one street at a time.']
      }
    ], () => {
      g.ui.fade(1, 1.4);
      CLOCK.in(1.6, () => {
        g.grant(10, 'The Architect');
        travelTo('city');
        CLOCK.in(1.4, () => {
          g.ui.card('Hexis', 'The Storm Trilogy — Act III complete');
          g.ui.objective('The city is yours. Rex still has work.');
          g.ui.say('REX', 'You are still standing. That is more than I had you down for.', 4.4);
          try { Score.go('explore', true); } catch (e) { }
        });
      });
    });
  }
  g.ending = ending;

  /* ------------------------------------------------------------------ VANE
     The mentor turns up for the Field Test and for nothing else, which is
     what a mentor who says "I will find you when it matters" should do. */
  step('vane', () => {
    Bus.on('job:started', (job) => {
      if (job.giver !== 'VANE') return;
      if (g.vane) return;
      try {
        const rig = makeMentor();
        const at = g.player.pos.clone().addScaledVector(fwdOf(g.player.yaw, SCR.v3()), 6);
        rig.root.position.copy(at);
        rig.root.rotation.y = g.player.yaw + Math.PI;
        g.scene.add(rig.root);
        g.vane = { rig, t: 0 };
        FX.ringBurst(at, 3.4, '#5FE3FF', 0.6);
      } catch (e) { }
    });
    Bus.on('job:complete', () => clearVane());
    Bus.on('job:failed', () => clearVane());
    Bus.on('zone:loaded', () => clearVane());
    function clearVane() {
      if (!g.vane) return;
      g.scene.remove(g.vane.rig.root);
      if (g.vane.rig.dispose) g.vane.rig.dispose();
      g.vane = null;
    }
    Hook.after(Game.prototype, 'frame', function (r, dt) {
      if (!this.vane) return;
      const d = this._dtAvg || 0.016;
      this.vane.t += d;
      this.vane.rig.update(d, { speed: 0, grounded: true, atk: -1, punch: -1 });
      this.vane.rig.root.rotation.y = yawTo(this.vane.rig.root.position, this.player.pos);
    }, 'acts30:vane');
  });

  /* -------------------------------------------------------------- CONTINUITY
     Two story flags that were only reachable through conversation topics the
     player may never pick. If the work is done, the door is open. */
  step('flags', () => {
    const sync = () => {
      if (g.flags.job_cargo && !g.flags.zone_undercity) g.flags.zone_undercity = true;
      if (g.flags.job_tunnelrun && !g.flags.zone_foundry) g.flags.zone_foundry = true;
      if (g.flags.met_architect && !g.flags.zone_spire) g.flags.zone_spire = true;
      if (g.flags.job_fieldtest && !g.flags.zone_spire) g.flags.zone_spire = true;
    };
    Bus.on('job:complete', () => { sync(); g.persist(); });
    Bus.on('flag:set', sync);
    Hook.after(Game.prototype, 'restore', function () { sync(); }, 'acts30:flagSync');
    sync();
  });

  /* ------------------------------------------------------------------ DEBUG
     `HEXIS.go('foundry')` and `HEXIS.job('pourline')`. */
  step('console', () => {
    g.go = (z) => travelTo(z);
    g.job = (id) => g.jobs.start(id);
  });

  console.log('[hexis 3.0] acts online:', done.join(', '));
})();
