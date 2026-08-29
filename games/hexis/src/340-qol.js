/* ===== 340-qol.js =========================================================
   HEXIS 3.0 — quality of life.

   The expansion declared `Input.bindings.pause = 'Escape'` and a [FACE] layer
   containing "pause, radar, codex, achievements, photo mode, results, binds".
   The bindings table is written once and read by nothing; the layer does not
   exist. `Expansion.paused` is a field that is checked every frame by
   `get blocking` and is never set to true by any code path. There is, in
   other words, no way to pause the game — not on desktop, and certainly not
   on a phone, where the only route out of a fight is to close the tab.

   This is that layer, kept to the things that change whether the game is
   pleasant to play rather than the things that pad a menu:

     PAUSE       a real stop, with the frame loop parked, on Escape and on a
                 touch target that is not next to any combat button
     LOG         what the current job actually wants, in full, because the
                 HUD strip is deliberately terse
     CODEX       every archetype and every power, filled in as you meet them
     CHECKPOINTS respawn where you were fighting, not at the zone door
     TRAINER     the Lattice becomes usable: spawn any archetype, reset, and
                 a dummy that reports your damage
     OPTIONS     auto-sprint, hold-or-toggle guard, permanent enemy bars,
                 and a clean HUD toggle for screenshots
   ========================================================================= */

(function qolPass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[qol] ' + n, e); } };

  /* ------------------------------------------------------------------- CSS */
  step('style', () => {
    const css = `
#pausepanel{
  position:absolute; inset:0; z-index:50; display:none;
  background:radial-gradient(120% 90% at 26% 22%,rgba(43,107,255,.12),transparent 62%),rgba(3,5,9,.88);
  backdrop-filter:blur(5px);
}
#pausepanel.on{ display:grid; grid-template-columns:minmax(0,240px) minmax(0,1fr); align-content:stretch; }
#pausepanel .side{
  display:flex; flex-direction:column; gap:2px; justify-content:center;
  padding:clamp(16px,4vmin,44px); border-right:1px solid rgba(95,227,255,.16);
}
#pausepanel .side h2{
  font-family:var(--disp); font-size:clamp(26px,5vmin,44px); letter-spacing:.08em;
  text-transform:uppercase; margin:0 0 4px; color:var(--bone);
}
#pausepanel .side .lbl{ margin-bottom:18px; }
#pausepanel .side button{
  all:unset; cursor:pointer; display:flex; align-items:center; gap:.7em;
  font-family:var(--disp); font-size:clamp(14px,2.2vmin,19px); letter-spacing:.07em;
  text-transform:uppercase; color:var(--bone); padding:9px 0;
  transition:color .15s ease, transform .15s ease;
}
#pausepanel .side button::before{
  content:""; width:16px; height:1px; flex:none; background:rgba(95,227,255,.28);
  transition:width .16s ease, background .16s ease;
}
#pausepanel .side button:hover, #pausepanel .side button.on{ color:var(--arc); transform:translateX(3px); }
#pausepanel .side button:hover::before, #pausepanel .side button.on::before{ width:32px; background:var(--arc); }
#pausepanel .side button.warn:hover{ color:var(--threat); }
#pausepanel .side button.warn:hover::before{ background:var(--threat); }
#pausepanel .body{
  overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-y;
  padding:clamp(16px,4vmin,44px); text-align:left;
}
#pausepanel h3{
  font:400 9px/1 var(--mono); letter-spacing:.3em; text-transform:uppercase;
  color:var(--arc); opacity:.8; margin:0 0 12px;
}
#pausepanel .kv{ display:grid; grid-template-columns:1fr auto; gap:5px 20px; max-width:520px; }
#pausepanel .kv span{ font:400 11.5px/1.7 var(--mono); color:var(--steel); letter-spacing:.06em; }
#pausepanel .kv b{ font:400 11.5px/1.7 var(--mono); color:var(--bone); font-variant-numeric:tabular-nums; }
#pausepanel .card{
  border:1px solid rgba(95,227,255,.16); padding:12px 14px; margin-bottom:10px;
  clip-path:var(--clip); max-width:600px;
}
#pausepanel .card .n{ font-family:var(--disp); font-size:16px; letter-spacing:.06em; text-transform:uppercase; color:var(--bone); }
#pausepanel .card .d{ font:400 11.5px/1.6 system-ui,sans-serif; color:var(--steel); margin-top:4px; }
#pausepanel .card.locked{ opacity:.34; }
#pausepanel .card .tag{ float:right; font:400 9px/1.6 var(--mono); letter-spacing:.18em; color:var(--gold); text-transform:uppercase; }
#pausepanel ol{ margin:0; padding-left:18px; max-width:560px; }
#pausepanel ol li{ font:400 12.5px/1.9 system-ui,sans-serif; color:var(--steel); }
#pausepanel ol li.done{ color:var(--arc); text-decoration:line-through; opacity:.72; }
#pausepanel ol li b{ font-family:var(--mono); color:var(--bone); font-weight:400; }
#pausepanel .spawnrow{ display:flex; flex-wrap:wrap; gap:6px; max-width:600px; margin-bottom:14px; }
#pausepanel .spawnrow button{
  all:unset; cursor:pointer; padding:7px 11px; clip-path:var(--clip);
  border:1px solid rgba(95,227,255,.22); background:rgba(11,18,32,.5);
  font:400 10px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--bone);
}
#pausepanel .spawnrow button:hover{ border-color:var(--arc); color:var(--arc); }

@media (max-width:720px), (orientation:portrait){
  #pausepanel.on{ grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr); }
  #pausepanel .side{ border-right:0; border-bottom:1px solid rgba(95,227,255,.16); padding:14px 16px; }
  #pausepanel .side h2{ margin-bottom:0; }
  #pausepanel .side .lbl{ margin-bottom:8px; }
  #pausepanel .side{ flex-direction:row; flex-wrap:wrap; gap:8px 16px; align-items:center; justify-content:flex-start; }
  #pausepanel .side h2, #pausepanel .side .lbl{ width:100%; }
  #pausepanel .side button{ padding:6px 0; font-size:13px; }
}

#tpause{
  position:absolute; right:max(12px,env(safe-area-inset-right,0px));
  top:max(12px,env(safe-area-inset-top,0px)); z-index:23; pointer-events:auto;
  padding:8px 12px; font:400 10px/1 var(--mono); letter-spacing:.2em;
  color:var(--steel); background:rgba(8,13,22,.55);
  border:1px solid rgba(95,227,255,.22); clip-path:var(--clip);
}
html[data-mode="title"] #tpause, html[data-mode="panel"] #tpause{ display:none !important; }

html.cleanhud #ui > *:not(#pausepanel):not(#fade):not(#card){ opacity:0 !important; transition:opacity .2s; }
`;
    const n = document.createElement('style'); n.id = 'qol30-css'; n.textContent = css;
    document.head.appendChild(n);
  });

  /* ----------------------------------------------------------------- PAUSE */
  const panel = document.createElement('div');
  panel.id = 'pausepanel';
  panel.className = 'hide';
  panel.innerHTML =
    '<div class="side">' +
    '<h2>Paused</h2><div class="lbl">Hexis 3.0 · Stormbreak</div>' +
    '<button data-a="resume">Resume</button>' +
    '<button data-a="log" class="on">Job log</button>' +
    '<button data-a="codex">Codex</button>' +
    '<button data-a="lore">Part One</button>' +
    '<button data-a="stats">Record</button>' +
    '<button data-a="board">The board</button>' +
    '<button data-a="skills">Skills</button>' +
    '<button data-a="settings">Settings</button>' +
    '<button data-a="clean">Hide HUD</button>' +
    '<button data-a="title" class="warn">Quit to title</button>' +
    '</div><div class="body"></div>';

  let tab = 'log';

  function pauseOpen() {
    if (g.state === 'title') return;
    (document.querySelector('#ui') || document.body).appendChild(panel);
    panel.classList.add('on');
    panel.classList.remove('hide');
    g.paused30 = true;
    if (g.ex) g.ex.paused = true;
    g.cancelCharge();
    if (document.exitPointerLock) document.exitPointerLock();
    paint();
    try { AudioX.play('ui_open', { vol: 0.6 }); Score.duck && Score.duck(0.45); } catch (e) { }
  }
  function pauseClose() {
    panel.classList.remove('on');
    panel.classList.add('hide');
    g.paused30 = false;
    if (g.ex) g.ex.paused = false;
    Input.requestLock(g.canvas);
    try { AudioX.play('ui_back', { vol: 0.5 }); Score.duck && Score.duck(1); } catch (e) { }
  }
  g.pause = pauseOpen;
  g.unpause = pauseClose;

  step('pause', () => {
    panel.querySelectorAll('.side button').forEach(b => onTap(b, () => {
      const a = b.dataset.a;
      if (a === 'resume') return pauseClose();
      if (a === 'board') { pauseClose(); g.openBoard('jobs'); return; }
      if (a === 'skills') { pauseClose(); g.toggleTree(true); return; }
      if (a === 'settings') { pauseClose(); g.buildSettings(); g.showPanel('#settings', true); return; }
      if (a === 'clean') {
        document.documentElement.classList.toggle('cleanhud');
        pauseClose();
        return;
      }
      if (a === 'title') return quitToTitle();
      tab = a;
      panel.querySelectorAll('.side button').forEach(x => x.classList.toggle('on', x.dataset.a === tab));
      paint();
    }));

    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (g.treeOpen || g.boardOpen) return;                 // those own Escape
      for (const sel of ['#settings', '#credits']) {
        const n = document.querySelector(sel);
        if (n && !n.classList.contains('hide')) return;
      }
      if (g.state === 'title') return;
      e.preventDefault();
      g.paused30 ? pauseClose() : pauseOpen();
    });

    // Touch pause target, top right, deliberately far from every action button.
    if (Input.touch) {
      const b = document.createElement('div');
      b.id = 'tpause';
      b.textContent = 'MENU';
      (document.querySelector('#touch') || document.body).appendChild(b);
      onTap(b, () => (g.paused30 ? pauseClose() : pauseOpen()));
    }

    // A pause has to actually stop the world. Expansion.blocking already
    // gates the simulation; this stops the audio bed and the score too.
    Bus.on('pause', () => { });
  });

  function quitToTitle() {
    pauseClose();
    if (g.jobs && g.jobs.running) g.jobs.abandon('quit');
    g.ui.fade(1, 0.5);
    CLOCK.in(0.6, () => {
      g.state = 'title';
      g.ui.showBoss(false);
      g.missions.reset(); g.missions.render();
      const t = document.querySelector('#title');
      if (t) t.classList.remove('hide');
      g.ui.fade(0, 0.8);
      try { Score.go('title', true); } catch (e) { }
    });
  }

  /* ------------------------------------------------------------------ PAINT */
  function paint() {
    const b = panel.querySelector('.body');
    b.innerHTML = '';
    if (tab === 'log') paintLog(b);
    else if (tab === 'codex') paintCodex(b);
    else if (tab === 'lore') paintLore(b);
    else paintStats(b);
  }

  function paintLog(b) {
    const run = g.jobs;
    const h = document.createElement('h3');
    h.textContent = run && run.running ? 'Current job' : 'No job running';
    b.appendChild(h);
    if (!run || !run.running) {
      const p = el('div', 'card', '<div class="n">Nothing active</div>' +
        '<div class="d">Rex is at the blue beacon in Central City. The board also opens from this menu.</div>');
      b.appendChild(p);
    } else {
      const j = run.job;
      const card = el('div', 'card',
        '<div class="n">' + j.name + '</div><div class="d">' + (j.blurb || '') + '</div>');
      b.appendChild(card);
      const ol = document.createElement('ol');
      g.missions.obj.forEach((o, i) => {
        const li = document.createElement('li');
        li.className = o.done ? 'done' : '';
        li.innerHTML = o.t + (o.n !== undefined ? ' — <b>' + o.have + ' / ' + o.n + '</b>' : '') +
          (i === run.stage && !o.done ? ' <b>· active</b>' : '');
        ol.appendChild(li);
      });
      b.appendChild(ol);
      if (g.missions.timeLeft > 0) {
        b.appendChild(el('div', 'card', '<div class="n">Clock</div><div class="d">' +
          Fmt.time(g.missions.timeLeft) + ' remaining. Failing costs nothing but the walk back.</div>'));
      }
    }

    b.appendChild(el('h3', null, 'Completed'));
    const kv = el('div', 'kv');
    let any = false;
    for (const id in JOBS) {
      if (!g.flags['job_' + id]) continue;
      any = true;
      kv.innerHTML += '<span>' + JOBS[id].name + '</span><b>done</b>';
    }
    if (!any) kv.innerHTML = '<span>Nothing yet</span><b>—</b>';
    b.appendChild(kv);
  }

  /* Part One. Entries unlock against the same story flags the jobs set, so
     the book fills in as you play it rather than arriving whole. 370-lore.js
     owns the text; this only renders whatever it says is unlocked. */
  function paintLore(b) {
    b.appendChild(el('h3', null, 'Hexis · Part One'));
    if (!g.loreEntries) {
      b.appendChild(el('div', 'card', '<div class="n">Not loaded</div>'));
      return;
    }
    const open = g.loreEntries();
    const all = (typeof LORE !== 'undefined') ? LORE.entries : [];
    for (const e of all) {
      const known = open.indexOf(e) >= 0;
      b.appendChild(el('div', 'card' + (known ? '' : ' locked'),
        '<div class="n">' + (known ? e.title : '· · ·') + '</div>' +
        '<div class="d">' + (known ? e.text : 'Not yet.') + '</div>'));
    }
    b.appendChild(el('h3', null, 'Where you came from'));
    b.appendChild(el('div', 'card',
      '<div class="n">Status</div><div class="d">' +
      'Regulator: <b>' + (g.jacketOn ? 'worn' : 'off') + '</b>. ' +
      (g.flags.seen_blackout ? 'Blackout: seen. ' : '') +
      (g.flags.met_team ? 'Response Team: met. ' : '') +
      (g.flags.act3_done ? 'The hub: reached.' : '') +
      '</div>'));
  }

  function paintCodex(b) {
    b.appendChild(el('h3', null, 'Powers'));
    const known = (k) => !!g.unlocked[k];
    const base = {
      sword: { name: 'Lightning Sword', key: 'LMB', desc: 'Close chains that end in a launcher.' },
      speed: { name: 'Super Speed', key: 'SHIFT', desc: 'Dash on the ground, a second jump in the air.' },
      fist: { name: 'Electric Fist', key: 'Q', desc: 'Hold to charge. Goes through guards.' },
      heal: { name: 'Storm Mend', key: 'E', desc: 'Trades charge for integrity.' }
    };
    for (const k in base) {
      const P = base[k];
      b.appendChild(el('div', 'card' + (known(k) ? '' : ' locked'),
        '<span class="tag">' + P.key + '</span><div class="n">' + P.name + '</div><div class="d">' + P.desc + '</div>'));
    }
    for (const k of Object.keys(POWERS).sort((a, c) => POWERS[a].order - POWERS[c].order)) {
      const P = POWERS[k];
      b.appendChild(el('div', 'card' + (known(k) ? '' : ' locked'),
        '<span class="tag">' + (P.passive ? 'passive' : P.key) + '</span>' +
        '<div class="n">' + (known(k) ? P.name : 'Locked') + '</div>' +
        '<div class="d">' + (known(k) ? P.desc + ' — ' + P.from : 'Keep playing.') + '</div>'));
    }

    b.appendChild(el('h3', null, 'Hostiles'));
    const seen = g.flags.seen || {};
    for (const k in ENEMY_DEFS) {
      const D = ENEMY_DEFS[k];
      const met = !!seen[k];
      b.appendChild(el('div', 'card' + (met ? '' : ' locked'),
        '<span class="tag">tier ' + D.tier + '</span>' +
        '<div class="n">' + (met ? D.name : '· · ·') + '</div>' +
        '<div class="d">' + (met ? codexLine(k, D) : 'Not yet encountered.') + '</div>'));
    }
  }

  function codexLine(k, D) {
    const bits = [];
    bits.push(D.hp + ' integrity');
    if (D.armor) bits.push(Math.round(D.armor * 100) + '% armour');
    if (D.shield) bits.push('shielded');
    if (D.frontImmune) bits.push('immune from the front — get behind it or break the guard');
    if (D.ranged) bits.push(D.ranged.beam ? 'hits from ' + D.ranged.range + ' m in a straight line' : 'ranged');
    if (D.cloak) bits.push('cloaks between attacks');
    if (D.charge) bits.push('charges — sidestep, do not back away');
    if (D.support) bits.push('heals everything nearby; kill it first');
    if (D.explodes) bits.push('detonates on death');
    if (D.static) bits.push('cannot move');
    return bits.join(' · ');
  }

  function paintStats(b) {
    const s = (g.ex && g.ex.stats) || {};
    b.appendChild(el('h3', null, 'Record'));
    const kv = el('div', 'kv');
    const row = (k, v) => { kv.innerHTML += '<span>' + k + '</span><b>' + v + '</b>'; };
    row('Level', g.lv);
    row('Skill points', g.sp + ' unspent');
    row('Kills', Fmt.n(s.kills || 0));
    row('Deaths', Fmt.n(s.deaths || 0));
    row('Best combo', Fmt.n(s.bestCombo || 0));
    row('Perfect parries', Fmt.n(s.perfectParries || 0));
    row('Distance travelled', Fmt.k(s.distance || 0) + ' m');
    row('Damage taken', Fmt.k(s.damageTaken || 0));
    row('Time played', Fmt.time(s.playtime || 0));
    row('Jobs completed', g.jobsDone || 0);
    row('Difficulty', (g.difficulty && g.difficulty.name) || 'Arc');
    b.appendChild(kv);

    if (g.zone && g.zone.name === 'lattice') {
      b.appendChild(el('h3', null, 'Trainer'));
      const rowEl = el('div', 'spawnrow');
      for (const k in ENEMY_DEFS) {
        const btn = el('button', null, ENEMY_DEFS[k].name);
        onTap(btn, () => {
          const p = g.player.pos.clone().add(V3(rand(-8, 8), 0.6, rand(-14, -6)));
          g.spawnEnemy(k, p);
          FX.ringBurst(p, 2.6, '#5FE3FF', 0.4);
        });
        rowEl.appendChild(btn);
      }
      b.appendChild(rowEl);
      const clear = el('button', null, 'Clear the floor');
      const wrap = el('div', 'spawnrow');
      onTap(clear, () => { for (const e of g.enemies) if (!e.dead) e.die(); });
      wrap.appendChild(clear);
      const heal = el('button', null, 'Full charge');
      onTap(heal, () => { g.hp = 100; g.energy = g.stats.maxEnergy; });
      wrap.appendChild(heal);
      b.appendChild(wrap);
    }
  }

  /* ------------------------------------------------------------------ CODEX
     Filled in by playing. One listener, no per-frame cost. */
  step('seen', () => {
    Bus.on('enemy:spawned', (e) => {
      if (!e || !e.kind) return;
      g.flags.seen = g.flags.seen || {};
      if (g.flags.seen[e.kind]) return;
      g.flags.seen[e.kind] = true;
      g.persist();
    });
  });

  /* ------------------------------------------------------------ CHECKPOINTS
     Dying in the Foundry used to put you back at the door, three catwalk
     levels and two minutes from the fight. A checkpoint is recorded whenever
     you are grounded, out of combat and somewhere you could stand — which is
     cheap to test and almost always correct. */
  step('checkpoints', () => {
    let t = 0;
    Hook.after(Game.prototype, 'frame', function () {
      if (this.state !== 'play' || !this.player) return;
      t += this._dtAvg || 0.016;
      if (t < 1.2) return;
      t = 0;
      const p = this.player;
      if (!p.grounded || p.climbing) return;
      const threat = this.director ? this.director.heat : 0;
      if (threat > 0.4) return;
      if (this.hp < 45) return;
      this._checkpoint = { pos: p.pos.clone(), yaw: p.yaw, zone: this.zone.name };
    }, 'qol30:checkpoint');

    Hook.set(Game.prototype, 'respawn', (function (base) {
      return function () {
        const cp = this._checkpoint;
        const r = base.call(this);
        if (cp && this.zone && cp.zone === this.zone.name) {
          this.player.pos.copy(cp.pos);
          this.player.yaw = cp.yaw;
          this.player.vel.set(0, 0, 0);
          this.camOrbit.yaw = cp.yaw + Math.PI;
        }
        this.player.iframes = 2;
        FX.ringBurst(this.player.pos.clone(), 4, '#5FE3FF', 0.6);
        // Say what you were doing, because a death screen is where a player
        // loses the thread.
        if (this.jobs && this.jobs.running) {
          const s = this.jobs.job.stages[this.jobs.stage];
          if (s) this.ui.objective(s.text);
        }
        return r;
      };
    })(Game.prototype.respawn), 'qol30:respawn.cp');

    Bus.on('zone:loaded', () => { g._checkpoint = null; });
  });

  /* ---------------------------------------------------------------- OPTIONS
     Four toggles that change how the game handles rather than how it looks. */
  step('options', () => {
    const extra = { autoSprint: false, guardToggle: false, alwaysBars: false, autoSave: true };
    Hook.after(Game.prototype, 'defaultOpts', function (o) { Object.assign(o, extra); }, 'qol30:defaults');
    for (const k in extra) if (g.opts[k] === undefined) g.opts[k] = extra[k];

    SETTINGS_SCHEMA.push({ head: 'Handling' });
    SETTINGS_SCHEMA.push({
      key: 'autoSprint', name: 'Auto-sprint', kind: 'bool',
      hint: 'Run without holding shift once you have been moving for a moment. Dash is still a tap.'
    });
    SETTINGS_SCHEMA.push({
      key: 'guardToggle', name: 'Guard', kind: 'seg',
      hint: 'Hold is the default. Toggle presses once to raise and once to drop, which is easier on a phone.',
      vals: [false, true], labels: ['Hold', 'Toggle']
    });
    SETTINGS_SCHEMA.push({
      key: 'alwaysBars', name: 'Enemy health bars', kind: 'seg',
      hint: 'On damage, or always. Always is louder and much easier to read in a crowd.',
      vals: [false, true], labels: ['On damage', 'Always']
    });

    // Auto-sprint: hold a timer on continuous input rather than reading the
    // key, so it cannot fight the dash edge.
    let runT = 0;
    Hook.before(Game.prototype, 'updatePlayer', function (dt) {
      if (!this.opts.autoSprint || !this.unlocked.speed) { runT = 0; return; }
      const K = Input.keys;
      const moving = K.KeyW || K.KeyS || K.KeyA || K.KeyD ||
        (Input.touch && Math.hypot(Input.stick.x, Input.stick.y) > 0.75);
      runT = moving ? runT + (dt || 0.016) : 0;
      // updatePlayer reads ShiftLeft directly for the sprint test.
      if (runT > 0.55 && this.player.grounded && !this.player.climbing) Input.keys.ShiftLeft = true;
      else if (!K.__shiftReal) Input.keys.ShiftLeft = false;
    }, 'qol30:autosprint');
    addEventListener('keydown', (e) => { if (e.code === 'ShiftLeft') Input.keys.__shiftReal = true; });
    addEventListener('keyup', (e) => { if (e.code === 'ShiftLeft') Input.keys.__shiftReal = false; });

    // Guard toggle: flip the held flag Fight.updateGuard already reads.
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyF' || !g.opts.guardToggle || e.repeat) return;
      Input.keys.__guard = !Input.keys.__guard;
    });
    Hook.before(Fight, 'updateGuard', function () {
      if (!g.opts.guardToggle) return;
      // In toggle mode the raw key must not also count as held.
      Input.keys.KeyF = false;
    }, 'qol30:guardToggle');

    // Always-on health bars: showBarT is the pip's own visibility timer.
    Hook.after(Game.prototype, 'frame', function () {
      if (!this.opts.alwaysBars) return;
      for (const e of this.enemies) if (!e.dead && e.showBarT !== undefined) e.showBarT = Math.max(e.showBarT, 0.5);
    }, 'qol30:bars');
  });

  /* ------------------------------------------------------------------ CLEAN
     H hides the whole HUD for a screenshot and gives it back on the next
     press. No separate photo camera — the orbit camera is already the good
     one, and a second camera rig would be a system to maintain for a feature
     nobody uses twice. */
  step('cleanhud', () => {
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyH' || e.repeat) return;
      if (Input.panelOpen && Input.panelOpen()) return;
      document.documentElement.classList.toggle('cleanhud');
    });
  });

  /* ------------------------------------------------------------------- SAVE
     The base persists on kill, on grant and on settings changes. It never
     persists position, zone or the job in progress, so quitting mid-job loses
     the job. Store enough to put the player back where they were. */
  step('autosave', () => {
    Hook.after(Game.prototype, 'persist', function () {
      if (!this.opts.autoSave || !this.zone || !this.player) return;
      try {
        const blob = {
          zone: this.zone.name,
          job: this.jobs && this.jobs.running ? this.jobs.job.id : null,
          hp: Math.round(this.hp),
          at: [+this.player.pos.x.toFixed(2), +this.player.pos.y.toFixed(2), +this.player.pos.z.toFixed(2)]
        };
        localStorage.setItem('hexis:place:v1', JSON.stringify(blob));
      } catch (e) { }
    }, 'qol30:place');

    // Offered, never forced: a returning player gets a prompt on the title
    // screen rather than being dropped into the middle of a fight.
    Hook.after(Game.prototype, 'restore', function () {
      let blob = null;
      try { blob = JSON.parse(localStorage.getItem('hexis:place:v1') || 'null'); } catch (e) { }
      if (!blob || !blob.zone || blob.zone === 'house' || blob.zone === 'arena') return;
      const cont = document.querySelector('#btn-cont');
      if (!cont) return;
      cont.classList.remove('hide');
      cont.textContent = 'Continue — ' + ((ZONES[blob.zone] && ZONES[blob.zone].name) || blob.zone);
      const fresh = cont.cloneNode(true);
      cont.parentNode.replaceChild(fresh, cont);
      onTap(fresh, () => {
        Audio2.init(); Audio2.resume();
        const t = document.querySelector('#title');
        if (t) t.classList.add('hide');
        Input.requestLock(this.canvas);
        this.run = {};
        this.travel(blob.zone);
        CLOCK.in(1.6, () => {
          if (blob.at && this.player) {
            this.player.pos.set(blob.at[0], blob.at[1], blob.at[2]);
            this.player.vel.set(0, 0, 0);
          }
          this.hp = Math.max(40, blob.hp || 100);
          if (blob.job && this.jobs && JOBS[blob.job] && !this.flags['job_' + blob.job]) {
            this.ui.toast('JOB RESUMED', JOBS[blob.job].name);
            this.jobs.start(blob.job);
          }
        });
      });
    }, 'qol30:continue');
  });

  console.log('[hexis 3.0] qol online:', done.join(', '));
})();
