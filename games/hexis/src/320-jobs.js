/* ===== 320-jobs.js ========================================================
   HEXIS 3.0 — [JOB], the layer the expansion's own contents page promised
   and never shipped.

   The 2.4 file lists fifteen systems in its load order. Four of them do not
   exist anywhere in the build: [JOB], [GROW], [FACE] and [WORDS]. What
   shipped instead is `MissionSystem` from Act I — two hand-written jobs, each
   a bespoke `tick` closure, both of them "go to a marker and break the thing
   that is there".

   This is the framework. Objectives are data with a kind; the runner owns
   the state, the marker chain, the failure conditions and the reward, so a
   new job is a literal and not a function.

   Objective kinds:
     reach     stand inside a radius
     destroy   break n objective props, spawned by the stage
     kill      clear n hostiles, optionally of a named archetype
     hold      stay inside a ring for t seconds, contested — leaving pauses it
     survive   stay alive for t seconds while the director feeds a wave
     escort    keep a walker alive to its destination
     scan      three separate short holds, in any order

   Every stage can carry: its own spawns, its own dialogue line, an optional
   bonus that pays extra, and a fail rule. The job itself can carry a clock.

   HUD reuses `game.missions` — the same panel, waypoint and compass the base
   already draws — so nothing new appears on screen that the player has to
   learn to read.
   ========================================================================= */

/* --- objective props -------------------------------------------------------
   Same contract as an enemy: pos, radius, hp, dead, hurt(), stun(), update(),
   remove(). That is deliberate — it means every ability, the aim assist, the
   chain lightning and the damage pipeline all work on them for free, which is
   the whole reason the Act I Prop was written that way. */
class JobProp {
  constructor(game, spec, pos) {
    this.g = game; this.id = ENT_ID++;
    this.spec = spec;
    this.pos = pos.clone();
    this.dead = false; this.deadT = 0;
    this.hitFlash = 0; this.t = rand(0, 6);
    this.maxHp = spec.hp || 140; this.hp = this.maxHp;
    this.radius = spec.radius || 1.3;
    this.height = spec.height || 3;
    this.mass = 9; this.tier = 2;
    this.armor = spec.armor || 0;
    this.color = spec.color || PAL.gold;

    const grp = new THREE.Group();
    const shellM = new THREE.MeshStandardMaterial({ color: spec.shell || '#1c222c', roughness: 0.78, metalness: 0.35 });
    const glowM = new THREE.MeshBasicMaterial({ color: this.color, fog: false });

    if (spec.shape === 'console') {
      const body = new THREE.Mesh(roundedBox(1.8, 1.2, 1.1, 0.14, 2), shellM);
      body.position.y = 0.6;
      const face = new THREE.Mesh(roundedBox(1.5, 0.9, 0.08, 0.05, 2), glowM);
      face.position.set(0, 1.05, 0.5); face.rotation.x = -0.5;
      this.core = face;
      grp.add(body, face);
    } else if (spec.shape === 'pod') {
      const body = new THREE.Mesh(roundedBox(2.6, 2.2, 2.6, 0.24, 2), shellM);
      body.position.y = 1.1;
      this.core = new THREE.Mesh(roundedBox(2.7, 0.16, 2.7, 0.05, 2), glowM);
      this.core.position.y = 1.55;
      grp.add(body, this.core);
    } else {
      // mast: the readable default. Tall, thin, lit at the top.
      const mast = new THREE.Mesh(roundedBox(0.7, 3.2, 0.7, 0.16, 2), shellM);
      mast.position.y = 1.6;
      this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), glowM);
      this.core.position.y = 3.3;
      grp.add(mast, this.core);
    }

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 4, 18),
      new THREE.MeshBasicMaterial({
        color: this.color, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
    this.ring.position.y = this.core.position.y;
    this.ring.rotation.x = Math.PI / 2;
    grp.add(this.ring);

    grp.position.copy(this.pos);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    game.scene.add(grp);
    this.grp = grp;
    // A health pip so a 900 hp objective does not read as invincible.
    this.showBarT = 99;
    if (typeof HealthPip !== 'undefined') {
      this.pip = new HealthPip(game.scene);
      this.def = { color: this.color, height: this.height };
    }
    game.props.push(this);
  }
  stun() { }
  breakGuard() { }
  hurt(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hitFlash = 0.16;
    this.showBarT = 4;
    FX.spark(this.pos.clone().add(V3(0, this.height * 0.55, 0)), 12, this.color, 7, 11, 0.7);
    if (this.hp <= 0) this.destroy();
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    const at = this.pos.clone().add(V3(0, this.height * 0.45, 0));
    FX.spark(at, 70, this.color, 11, 14);
    FX.orb(at, 4.2, this.color, 0.45);
    FX.ringBurst(this.pos.clone(), 5, this.color, 0.5);
    FX.shake(0.35, 0.3);
    try {
      AudioX.play('relay_die', { pos: this.pos, vol: 0.9 });
      Debris.burst(at, 14, { speed: 9, color: '#1b2230' });
      Debris.scorch(this.pos, 3);
    } catch (e) { Audio2.play('boom', 0.75); }
    Bus.emit('prop:destroyed', this);
  }
  update(dt) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.dead) {
      this.deadT += dt;
      const k = Math.max(0, 1 - this.deadT / 0.5);
      this.grp.scale.setScalar(Math.max(0.001, k));
      if (this.deadT > 0.55) this.remove();
      return;
    }
    const pulse = 0.85 + Math.sin(this.t * 3.4) * 0.15;
    this.core.scale.setScalar(this.hitFlash > 0 ? 1.4 : pulse);
    this.ring.rotation.z += dt * 1.6;
    this.ring.material.opacity = this.hitFlash > 0 ? 1 : 0.55 + Math.sin(this.t * 2.1) * 0.25;
    if (Math.random() < dt * 1.6) {
      const top = this.pos.clone().add(V3(0, this.height, 0));
      FX.bolt(top, top.clone().add(V3(rand(-1.4, 1.4), rand(-0.8, 1.4), rand(-1.4, 1.4))), this.color, 0.1, 1);
    }
    if (this.pip) this.pip.update(this, dt, this.g.camera.position);
  }
  remove() {
    if (this.pip) { this.pip.dispose(this.g.scene); this.pip = null; }
    this.g.scene.remove(this.grp);
    this.grp.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    const i = this.g.props.indexOf(this);
    if (i >= 0) this.g.props.splice(i, 1);
  }
}

/* --- capture ring -----------------------------------------------------------
   The visual for `hold` and `scan`. One ring, one fill, both additive and
   both depth-written off, so it reads through geometry the way a HUD element
   should while still living in the world. */
class HoldRing {
  constructor(scene, pos, radius, color) {
    this.scene = scene;
    this.pos = pos.clone();
    this.r = radius;
    const g1 = new THREE.RingGeometry(radius - 0.22, radius, 48);
    g1.rotateX(-Math.PI / 2);
    this.edge = new THREE.Mesh(g1, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, side: THREE.DoubleSide
    }));
    const g2 = new THREE.CircleGeometry(radius, 48);
    g2.rotateX(-Math.PI / 2);
    this.fill = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, side: THREE.DoubleSide
    }));
    this.edge.position.copy(pos); this.edge.position.y += 0.06;
    this.fill.position.copy(pos); this.fill.position.y += 0.05;
    this.fill.scale.setScalar(0.001);
    scene.add(this.edge, this.fill);
    this.t = 0;
  }
  update(dt, progress, inside) {
    this.t += dt;
    const k = clamp(progress, 0, 1);
    this.fill.scale.setScalar(Math.max(0.001, k));
    this.edge.material.opacity = inside ? 0.55 + Math.sin(this.t * 6) * 0.25 : 0.35;
    this.edge.rotation.y += dt * (inside ? 1.4 : 0.3);
  }
  dispose() {
    this.scene.remove(this.edge, this.fill);
    this.edge.geometry.dispose(); this.edge.material.dispose();
    this.fill.geometry.dispose(); this.fill.material.dispose();
  }
}

/* --- the runner ------------------------------------------------------------
   Owns one job at a time. The base MissionSystem's fields are the display
   contract, so this writes `active`, `obj`, `waypoint` and `timeLeft` on it
   and calls its render(). Nothing new on screen.                            */
class JobRunner {
  constructor(game) {
    this.g = game;
    this.job = null;
    this.stage = -1;
    this.rings = [];
    this.spawned = [];
    this.props = [];
    this.state = null;
    this.failT = 0;
  }

  get M() { return this.g.missions; }
  get running() { return !!this.job; }

  /* --- lifecycle ---------------------------------------------------------- */
  start(id) {
    const job = JOBS[id];
    if (!job) { console.warn('[job] unknown', id); return false; }
    if (this.job) this.abandon('Another job is already running.');
    this.job = job;
    this.stage = -1;
    this.startT = CLOCK.time;
    this.bonusEarned = 0;
    const M = this.M;
    M.reset();
    M.active = job.name;
    M.obj = job.stages.map(s => ({
      t: s.text, done: false,
      n: s.count !== undefined ? s.count : undefined,
      have: s.count !== undefined ? 0 : undefined
    }));
    M.timeLeft = job.limit || 0;
    M.render();
    Bus.emit('job:started', job);
    Score.go('combat', false);

    if (job.brief && job.brief.length) this.playBrief(job, () => this.next());
    else this.next();
    return true;
  }

  playBrief(job, then) {
    const g = this.g;
    const anchor = (g.zone && g.zone.spawns.rex) ? g.zone.spawns.rex.clone()
      : g.player.pos.clone();
    g.state = 'cutscene';
    const steps = job.brief.map((line, i) => ({
      dur: Math.max(2.2, String(line[1]).length * 0.031),
      from: anchor.clone().add(V3(2.6 - i * 1.6, 1.9, 3.4 - i * 0.6)),
      to: anchor.clone().add(V3(1.9 - i * 1.2, 1.75, 2.6 - i * 0.4)),
      look: anchor.clone().add(V3(0, 1.5, 0)),
      fov: 38 - i * 2, hand: 0.012, say: [line[0], line[1]], vo: line[2]
    }));
    g.cut.play(steps, () => {
      g.state = 'play';
      g.ui.toast(job.name.toUpperCase(), job.blurb || 'Job accepted');
      try { AudioX.play('unlock_power', { vol: 0.7 }); } catch (e) { Audio2.play('unlock', 0.7); }
      then();
    });
  }

  next() {
    this.clearStage();
    this.stage++;
    const job = this.job;
    if (!job) return;
    if (this.stage >= job.stages.length) return this.complete();
    const s = job.stages[this.stage];
    // A negative stage means something rewound past the first objective — the
    // zone handler does exactly that when you travel into a job's own zone
    // while its brief is still playing. Snap forward rather than reading
    // stages[-1], which used to throw inside a bus listener and take the rest
    // of the zone:loaded chain with it.
    if (!s) { this.stage = 0; return this.next(); }
    this.state = { t: 0, count: 0, hold: 0, holds: null };

    // Stage spawns. Positions resolve against the live zone every time, so a
    // job can be replayed in a different zone without editing the table.
    if (s.props) {
      for (const p of this.resolveList(s.props.at)) {
        this.props.push(new JobProp(this.g, s.props, p));
      }
    }
    if (s.spawn) {
      const list = typeof s.spawn === 'function' ? s.spawn(this.g) : s.spawn;
      const at = this.resolveList(s.spawnAt || s.at);
      list.forEach((kind, i) => {
        const base = at.length ? at[i % at.length] : this.g.player.pos.clone();
        const e = this.g.spawnEnemy(kind, base.clone().add(V3(rand(-6, 6), 0.6, rand(-6, 6))));
        this.spawned.push(e);
      });
    }
    if (s.kind === 'hold' || s.kind === 'scan') {
      const pts = this.resolveList(s.at);
      this.state.holds = pts.map(p => ({ pos: p.clone(), t: 0, done: false }));
      for (const h of this.state.holds) {
        this.rings.push(new HoldRing(this.g.scene, h.pos, s.radius || 7, s.color || PAL.arc));
      }
    }
    if (s.say) this.g.ui.say(s.say[0], s.say[1], s.say[2] || 3.4, s.say[3]);
    if (s.onEnter) s.onEnter(this.g, this);

    this.M.obj[this.stage].have = 0;
    this.M.render();
    this.updateWaypoint();
    Bus.emit('job:stage', this.job, this.stage);
  }

  resolveList(at) {
    if (!at) return [];
    const v = typeof at === 'function' ? at(this.g) : at;
    if (!v) return [];
    return Array.isArray(v) ? v.filter(Boolean).map(p => p.clone ? p.clone() : V3(p.x, p.y, p.z)) : [v.clone()];
  }

  clearStage() {
    for (const r of this.rings) r.dispose();
    this.rings.length = 0;
  }

  clearAll() {
    this.clearStage();
    for (const p of this.props.slice()) if (p.remove) p.remove();
    this.props.length = 0;
    this.spawned.length = 0;
  }

  /* --- per-frame ---------------------------------------------------------- */
  update(dt) {
    if (!this.job || this.g.state !== 'play') return;
    const job = this.job, s = job.stages[this.stage];
    if (!s) return;
    const st = this.state;
    st.t += dt;
    const p = this.g.player.pos;
    const row = this.M.obj[this.stage];

    // Job clock.
    if (job.limit) {
      this.M.timeLeft = Math.max(0, job.limit - (CLOCK.time - this.startT));
      if (this.M.timeLeft <= 0) return this.fail(job.timeoutLine || 'Out of time.');
      if ((this._rt = (this._rt || 0) + dt) > 0.25) { this._rt = 0; this.M.render(); }
    }
    // Stage clock, for anything with its own window.
    if (s.limit && st.t > s.limit) return this.fail(s.failLine || 'Too slow.');

    switch (s.kind) {
      case 'reach': {
        const at = this.resolveList(s.at)[0];
        if (at && dist2D(p, at) < (s.radius || 12) && Math.abs(p.y - at.y) < 14) this.advance();
        break;
      }
      case 'destroy': {
        const left = this.props.filter(x => !x.dead).length;
        const got = this.props.length - left;
        if (row.n !== undefined && row.have !== got) { row.have = got; this.M.render(); }
        if (left === 0 && this.props.length) this.advance();
        break;
      }
      case 'kill': {
        const live = this.spawned.filter(e => e && !e.dead).length;
        const got = this.spawned.length - live;
        if (row.n !== undefined && row.have !== got) { row.have = got; this.M.render(); }
        // Reinforcements keep the pressure honest on long clears.
        if (s.reinforce && live < (s.reinforce.min || 2) && st.t > (this._rf || 0)) {
          this._rf = st.t + (s.reinforce.every || 9);
          const at = this.resolveList(s.spawnAt || s.at);
          const base = at.length ? RND.pick(at) : p.clone().add(V3(rand(-26, 26), 0, rand(-26, 26)));
          this.spawned.push(this.g.spawnEnemy(RND.pick(s.reinforce.kinds || ['grunt']), base.clone()));
        }
        if (live === 0 && this.spawned.length) this.advance();
        break;
      }
      case 'hold':
      case 'scan': {
        let allDone = true, anyInside = false;
        for (let i = 0; i < st.holds.length; i++) {
          const h = st.holds[i];
          const ring = this.rings[i];
          if (h.done) { if (ring) ring.update(dt, 1, false); continue; }
          allDone = false;
          const inside = dist2D(p, h.pos) < (s.radius || 7) && Math.abs(p.y - h.pos.y) < 6;
          // Contested: a live hostile in the ring stalls the count.
          let contested = false;
          if (s.contested) {
            for (const e of this.g.enemies) {
              if (!e.dead && dist2D(e.pos, h.pos) < (s.radius || 7)) { contested = true; break; }
            }
          }
          if (inside) anyInside = true;
          if (inside && !contested) h.t += dt;
          else if (s.decay !== false) h.t = Math.max(0, h.t - dt * 0.6);
          if (h.t >= (s.secs || 8)) {
            h.done = true;
            FX.ringBurst(h.pos.clone(), (s.radius || 7) * 1.1, s.color || PAL.arc, 0.6);
            try { AudioX.play('level_up', { vol: 0.55 }); } catch (e) { Audio2.play('unlock', 0.6); }
            const got = st.holds.filter(x => x.done).length;
            if (row.n !== undefined) { row.have = got; }
            this.M.render();
            this.updateWaypoint();
          }
          if (ring) ring.update(dt, h.t / (s.secs || 8), inside && !contested);
        }
        if (s.contested && anyInside && Math.random() < dt * 0.35 &&
            this.g.enemies.filter(e => !e.dead).length < 6) {
          const near = st.holds.find(h => !h.done);
          if (near) this.spawned.push(this.g.spawnEnemy(RND.pick(s.kinds || ['grunt', 'enforcer']),
            near.pos.clone().add(V3(rand(-18, 18), 0.6, rand(-18, 18)))));
        }
        if (allDone) this.advance();
        break;
      }
      case 'survive': {
        const left = Math.max(0, (s.secs || 45) - st.t);
        if (row.n === undefined) { row.n = Math.round(s.secs || 45); }
        const shown = Math.round(left);
        if (row.have !== (row.n - shown)) { row.have = row.n - shown; this.M.render(); }
        this._wave = (this._wave || 0) - dt;
        if (this._wave <= 0) {
          this._wave = s.every || 7;
          const live = this.g.enemies.filter(e => !e.dead).length;
          if (live < (s.cap || 7)) {
            const kinds = this.g.director
              ? this.g.director.compose(s.budget || 3, s.kinds)
              : ['grunt'];
            for (const k of kinds) {
              const a = Math.random() * TAU, r = rand(22, 34);
              this.spawned.push(this.g.spawnEnemy(k,
                p.clone().add(V3(Math.cos(a) * r, 0.6, Math.sin(a) * r))));
            }
          }
        }
        if (left <= 0) this.advance();
        break;
      }
      case 'boss': {
        // Handed off to a boss controller; it reports back on the bus.
        break;
      }
      default: this.advance();
    }

    if (s.tick) s.tick(this.g, this, dt);
    if (s.fail && s.fail(this.g, this)) this.fail(s.failLine || 'Failed.');
    this.updateWaypoint();
  }

  updateWaypoint() {
    const s = this.job && this.job.stages[this.stage];
    if (!s) { this.M.waypoint = null; return; }
    let wp = null;
    if (s.kind === 'destroy') {
      const live = this.props.filter(x => !x.dead);
      if (live.length) {
        // Nearest live objective, so the marker leads rather than nags.
        let bd = 1e9;
        for (const q of live) {
          const d = q.pos.distanceToSquared(this.g.player.pos);
          if (d < bd) { bd = d; wp = q.pos.clone().add(V3(0, q.height * 0.8, 0)); }
        }
      }
    } else if (s.kind === 'hold' || s.kind === 'scan') {
      const h = this.state.holds && this.state.holds.find(x => !x.done);
      if (h) wp = h.pos.clone().add(V3(0, 2.4, 0));
    } else if (s.kind === 'kill') {
      const live = this.spawned.filter(e => e && !e.dead);
      if (live.length) {
        let bd = 1e9;
        for (const e of live) {
          const d = e.pos.distanceToSquared(this.g.player.pos);
          if (d < bd) { bd = d; wp = e.pos.clone().add(V3(0, 2.2, 0)); }
        }
      }
    } else if (s.at) {
      const at = this.resolveList(s.at)[0];
      if (at) wp = at.clone().add(V3(0, 2.6, 0));
    }
    this.M.waypoint = wp;
  }

  advance() {
    const row = this.M.obj[this.stage];
    if (row) { row.done = true; if (row.n !== undefined) row.have = row.n; }
    this.M.render();
    const s = this.job.stages[this.stage];
    if (s && s.onDone) s.onDone(this.g, this);
    try { AudioX.play('pickup', { vol: 0.8 }); } catch (e) { Audio2.play('ui'); }
    this.next();
  }

  complete() {
    const job = this.job;
    const secs = CLOCK.time - this.startT;
    this.clearAll();
    this.job = null; this.stage = -1;
    const g = this.g;
    g.flags['job_' + job.id] = true;
    g.jobsDone = (g.jobsDone || 0) + 1;

    const R = job.reward || {};
    if (R.sp) g.grant(R.sp, job.name + ' complete');
    if (R.power) CLOCK.in(1.4, () => g.unlockPower(R.power));
    if (R.flag) { g.flags[R.flag] = true; Bus.emit('flag:set', R.flag); }
    if (R.xp) { g.xp += R.xp; g.ui.stats(g.lv, g.xp, g.sp); }

    g.ui.toast('JOB COMPLETE', job.name + '   ·   ' + Fmt.time(secs));
    try { AudioX.play('mission_done', { vol: 0.9 }); } catch (e) { }
    if (job.outro) g.ui.say(job.outro[0], job.outro[1], 4, job.outro[2]);
    try { Score.sting('win'); } catch (e) { }
    this.M.reset(); this.M.render();
    g.ui.objective(job.after || '—');
    g.persist();
    Bus.emit('job:complete', job, secs);
  }

  fail(why) {
    const job = this.job;
    if (!job) return;
    this.clearAll();
    this.job = null; this.stage = -1;
    this.M.reset(); this.M.render();
    this.g.ui.say(job.giver || 'REX', why, 4);
    this.g.ui.toast('JOB FAILED', 'Come back to the beacon to try again');
    try { AudioX.play('mission_fail', { vol: 0.9 }); } catch (e) { }
    try { Score.sting('lose'); } catch (e) { }
    this.g.ui.objective('—');
    Bus.emit('job:failed', job, why);
  }

  abandon(why) {
    if (!this.job) return;
    this.clearAll();
    const job = this.job;
    this.job = null; this.stage = -1;
    this.M.reset(); this.M.render();
    Bus.emit('job:abandoned', job, why);
  }

  /* Which jobs the player can take right now, in offer order. */
  available() {
    const g = this.g;
    const out = [];
    for (const id in JOBS) {
      const j = JOBS[id];
      if (g.flags['job_' + id] && !j.repeatable) continue;
      if (j.gate && !j.gate(g)) continue;
      if (j.zone && (!g.zone || g.zone.name !== j.zone)) continue;
      out.push(j);
    }
    out.sort((a, b) => (a.tier || 0) - (b.tier || 0));
    return out;
  }
}

/* --- the jobs --------------------------------------------------------------
   Nine, plus a repeatable. They are ordered so each one teaches the piece of
   the kit the next one assumes, which is the only structural rule here.    */
const JOBS = {

  /* 1 — the Act I job, rebuilt on the framework. Teaches the wall kick. */
  blackout: {
    id: 'blackout', name: 'Blackout', tier: 1, giver: 'REX', zone: 'city',
    blurb: 'Three relays, up the side of the Spire.',
    gate: () => true,
    brief: [
      ['REX', 'Kell was not improvising. Somebody was feeding him targets.', 'r02'],
      ['REX', 'Three relays up the Spire. Take them off the grid.', 'r03'],
      ['REX', "Don't bother climbing it. Jump at the wall — you'll kick off it instead.", 'r03b']
    ],
    reward: { sp: 6, xp: 120, flag: 'topic_arm' },
    after: 'Central City is open. Rex is at the blue beacon.',
    outro: ['REX', 'Clean. Come back to the beacon when you want the next one.', 'r06'],
    stages: [
      {
        text: 'Reach the Spire', kind: 'reach', radius: 26,
        at: (g) => (g.zone.spawns.relays || [])[0],
        say: ['REX', 'You are on it. Kill all three and the district goes dark.', 3.6]
      },
      {
        text: 'Burn the relays', kind: 'destroy', count: 3,
        props: { hp: 140, shape: 'mast', color: '#FFC64D', at: (g) => g.zone.spawns.relays },
        spawn: ['grunt', 'grunt', 'enforcer'],
        spawnAt: (g) => g.zone.spawns.relays
      }
    ]
  },

  /* 2 — the other Act I job, now with a real convoy clock. */
  cargo: {
    id: 'cargo', name: 'Cargo Nine', tier: 2, giver: 'REX', zone: 'city',
    blurb: 'Four pods. Two and a half minutes.',
    gate: (g) => !!g.flags.job_blackout,
    limit: 150, timeoutLine: 'The convoy moved. Rex will not be pleased.',
    brief: [
      ['REX', 'A shipment came in for whoever built that arm.', 'r04'],
      ['REX', 'Four pods at the depot. Two minutes before it rolls.', 'r05']
    ],
    reward: { sp: 6, xp: 160, power: 'tempest' },
    after: 'Central City is open. Rex is at the blue beacon.',
    outro: ['REX', 'That is the second one you have walked away from. Do not get used to it.'],
    stages: [
      {
        text: 'Destroy the shipment', kind: 'destroy', count: 4,
        props: { hp: 110, shape: 'pod', color: '#ff8a4d', radius: 1.5, height: 2.4, at: (g) => g.zone.spawns.pods },
        spawn: ['enforcer', 'grunt', 'grunt'],
        spawnAt: (g) => g.zone.spawns.pods,
        tick: (g, run, dt) => {
          if (Math.random() < dt * 0.25 && g.enemies.filter(e => !e.dead).length < 5) {
            const q = RND.pick(g.zone.spawns.pods);
            run.spawned.push(g.spawnEnemy('grunt', q.clone().add(V3(rand(-10, 10), 0.5, rand(-10, 10)))));
          }
        }
      }
    ]
  },

  /* 3 — the first job that requires holding ground rather than breaking it. */
  brownout: {
    id: 'brownout', name: 'Brownout', tier: 3, giver: 'REX', zone: 'city',
    blurb: 'Hold three junctions while the grid reroutes.',
    gate: (g) => !!g.flags.job_cargo,
    brief: [
      ['REX', 'Taking the relays down worked. Too well — the whole district is dark and people live here.'],
      ['REX', 'Three junctions. Stand on each one until it comes back up. They will come to you.']
    ],
    reward: { sp: 5, xp: 180, power: 'clap' },
    after: 'Rex has another one.',
    outro: ['REX', 'Lights are back. You just did something that helps, for once.'],
    stages: [
      {
        text: 'Bring the junctions back', kind: 'hold', count: 3, secs: 12, radius: 8,
        contested: true, color: '#7CFFB2',
        kinds: ['grunt', 'enforcer', 'swarmer'],
        at: (g) => (g.zone.spawns.patrol || []).slice(0, 3),
        say: ['REX', 'Stand in the ring. If something else is standing in it, the count stops.', 4]
      }
    ]
  },

  /* 4 — introduces the Lancer as a line-of-sight problem, in the zone that
         was built to teach exactly that and was never reachable. */
  tunnelrun: {
    id: 'tunnelrun', name: 'Tunnel Run', tier: 4, giver: 'REX', zone: 'undercity',
    blurb: 'The transit line under the city. Something is using it.',
    gate: (g) => !!g.flags.zone_undercity,
    brief: [
      ['REX', 'The tunnels run from the beacon to the Foundry. They are not empty any more.'],
      ['REX', 'Watch the sight lines. There are Lancers down there and they hit from further than you can see.']
    ],
    reward: { sp: 7, xp: 240, power: 'blink', flag: 'zone_foundry' },
    after: 'The Foundry is open.',
    outro: ['REX', 'You are through. The Foundry is on the other side of that shaft.'],
    stages: [
      {
        text: 'Reach the station hall', kind: 'reach', radius: 22,
        at: (g) => g.zone.spawns.hall,
        say: ['HEXIS', 'Long tunnel. Bad angles.', 3]
      },
      {
        text: 'Clear the hall', kind: 'kill', count: 6,
        spawn: ['grunt', 'grunt', 'enforcer', 'sniper', 'swarmer', 'swarmer'],
        spawnAt: (g) => g.zone.spawns.grunts,
        reinforce: { min: 2, every: 12, kinds: ['grunt', 'swarmer'] },
        say: ['HEXIS', 'The one on the mezzanine is the one that matters.', 3.4]
      },
      {
        text: 'Cut the pumps', kind: 'destroy', count: 3,
        props: { hp: 200, shape: 'console', color: '#5FE3FF', at: (g) => g.zone.spawns.relays },
        spawn: ['warden', 'sniper'],
        spawnAt: (g) => g.zone.spawns.relays
      },
      {
        text: 'Climb out at the east shaft', kind: 'reach', radius: 14,
        at: (g) => g.zone.spawns.exit
      }
    ]
  },

  /* 5 — verticality is mandatory and the tether is the reward for proving it. */
  pourline: {
    id: 'pourline', name: 'The Pour Line', tier: 5, giver: 'REX', zone: 'foundry',
    blurb: 'Where the arm was made.',
    gate: (g) => !!g.flags.zone_foundry,
    brief: [
      ['REX', 'That is the place. Six years dark and the meter still spins.'],
      ['REX', 'Half that floor is a hole. Do not fight anything standing still.']
    ],
    reward: { sp: 8, xp: 320, power: 'tether', flag: 'met_architect' },
    after: 'Talk to Rex about what you saw.',
    outro: ['HEXIS', 'It was not Kell it was built for. It was built to see if it could be worn.'],
    stages: [
      {
        text: 'Get to the crucible line', kind: 'reach', radius: 18,
        at: () => V3(0, 1, -52),
        say: ['HEXIS', 'It is still warm.', 2.6]
      },
      {
        text: 'Burn the crucible feeds', kind: 'destroy', count: 3,
        props: { hp: 260, shape: 'mast', color: '#FF8A4D', at: (g) => g.zone.spawns.relays },
        spawn: ['warden', 'brute', 'drone', 'drone'],
        spawnAt: (g) => g.zone.spawns.patrol
      },
      {
        text: 'Survive the shutdown', kind: 'survive', secs: 55, every: 8, budget: 5, cap: 8,
        kinds: ['grunt', 'swarmer', 'drone', 'enforcer', 'stalker'],
        say: ['HEXIS', 'Everything in here just woke up.', 3]
      },
      {
        text: 'Read the fabrication log', kind: 'scan', count: 1, secs: 6, radius: 6,
        color: '#B48CFF',
        at: (g) => [g.zone.spawns.boss],
        onDone: (g) => {
          g.flags.met_architect = true;
          Bus.emit('flag:set', 'met_architect');
          Grade.glitch(0.6, 1.4);
          g.ui.say('ARCHITECT', 'You are reading the wrong file. Kell was the draft.', 4);
        }
      }
    ]
  },

  /* 6 — a short, hard job that exists to teach the parry against three
         attackers at once, and pays the Ion Lance for it. */
  fieldtest: {
    id: 'fieldtest', name: 'Field Test', tier: 6, giver: 'VANE', zone: 'lattice',
    blurb: 'Vane wants to see the whole kit at once.',
    gate: (g) => !!g.flags.met_architect,
    brief: [
      ['VANE', 'Before you go up that Spire, show me you can do this on purpose.'],
      ['VANE', 'Three at once. Parry, do not dodge. I want to see the timing, not the escape.']
    ],
    reward: { sp: 6, xp: 300, power: 'lance' },
    after: 'The Spire is open.',
    outro: ['VANE', 'That is the shape of it. Go and be difficult to model.'],
    stages: [
      {
        text: 'Break three guards', kind: 'kill', count: 3,
        spawn: ['warden', 'warden', 'enforcer'],
        spawnAt: (g) => g.zone.spawns.grunts,
        say: ['VANE', 'Front plates. Hit them with the fist or get behind them.', 4]
      },
      {
        text: 'Hold the ring', kind: 'hold', count: 1, secs: 20, radius: 12,
        contested: true, color: '#FFC64D',
        kinds: ['stalker', 'swarmer', 'grunt'],
        at: () => [V3(0, 1, 0)]
      }
    ]
  },

  /* 7 — the finale hand-off. The boss stage is driven by 330-acts. */
  ascent: {
    id: 'ascent', name: 'Ascent', tier: 7, giver: 'REX', zone: 'spire',
    blurb: 'Four hundred metres up, and it is waiting.',
    gate: (g) => !!g.flags.zone_spire,
    brief: [
      ['REX', 'It has been watching the whole time. Now it wants a look up close.'],
      ['REX', 'Whatever it says up there, it is buying time. Do not give it any.']
    ],
    reward: { sp: 12, xp: 900, power: 'storm', flag: 'act3_done' },
    after: 'It is over. For now.',
    stages: [
      {
        text: 'Cross the deck', kind: 'reach', radius: 20,
        at: (g) => g.zone.spawns.arena,
        say: ['HEXIS', 'No cover up here worth the name.', 3]
      },
      {
        text: 'Kill the Architect', kind: 'boss',
        onEnter: (g) => Bus.emit('act3:boss')
      }
    ]
  },

  /* 8 — repeatable. The reason to keep playing after the credits. */
  sweep: {
    id: 'sweep', name: 'Grid Sweep', tier: 9, giver: 'REX', repeatable: true,
    blurb: 'Whatever came through the breach today.',
    gate: (g) => !!g.flags.job_blackout,
    reward: { sp: 1, xp: 150 },
    after: '—',
    brief: [['REX', 'Nothing clever. Something came through and it is on my street.']],
    stages: [
      {
        text: 'Clear the incursion', kind: 'survive', secs: 90, every: 6, budget: 6, cap: 9,
        kinds: ['grunt', 'swarmer', 'enforcer', 'drone', 'sniper', 'stalker', 'warden', 'brute']
      }
    ]
  },

  /* 9 — the training room, reachable at last. Not a job you fail. */
  drill: {
    id: 'drill', name: 'The Lattice', tier: 0, giver: 'VANE', repeatable: true,
    blurb: 'Practise. Nothing here is scored.',
    gate: () => true,
    reward: {},
    after: '—',
    stages: [
      {
        text: 'Take as long as you like', kind: 'hold', count: 1, secs: 3, radius: 10,
        decay: false, color: '#5FE3FF',
        at: () => [V3(0, 1, 0)],
        say: ['VANE', 'Spawn what you want from the pause menu. Nothing here reports back.', 4]
      }
    ]
  }
};

/* --- wiring ---------------------------------------------------------------- */
(function jobsPass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[jobs] ' + n, e); } };

  step('runner', () => {
    g.jobs = new JobRunner(g);
    // Ride the mission tick the base loop already calls, so the runner cannot
    // drift out of sync with hitstop, slow motion or the pause.
    Hook.after(MissionSystem.prototype, 'update', function (r, dt) {
      if (this.g.jobs) this.g.jobs.update(dt);
    }, 'jobs30:tick');
    // JobProps report their own destruction; the Act I MissionSystem.onProp
    // path must not also fire for them or a legacy mission would count them.
    Hook.before(MissionSystem.prototype, 'onProp', function (prop) {
      if (prop instanceof JobProp) return false;
    }, 'jobs30:onProp');
  });

  /* Zone changes end whatever was running. A job whose props live in the
     Undercity cannot be completed from the Foundry, and leaving one half-done
     and invisible is worse than losing it. */
  step('zone', () => {
    Bus.on('zone:loaded', () => {
      if (g.jobs && g.jobs.running) {
        const j = g.jobs.job;
        // Travelling *into* a job's own zone is how several of them start.
        if (j.zone && g.zone && g.zone.name === j.zone) {
          // Re-enter the current stage so its props and spawns land in the
          // zone that is actually loaded. Stage -1 means the brief is still
          // playing and next() has not run yet, so there is nothing to redo.
          if (g.jobs.stage >= 0) {
            g.jobs.clearStage();
            g.jobs.stage--;
            g.jobs.next();
          }
        } else {
          g.jobs.abandon('left the area');
          g.ui.toast('JOB ABANDONED', j.name + ' — take it again from the beacon');
        }
      }
    });
  });

  /* The old two-mission entry points keep working: anything that still calls
     startBlackout/startCargo runs the framework version instead. */
  step('legacy', () => {
    Hook.set(MissionSystem.prototype, 'startBlackout', function () { g.jobs.start('blackout'); }, 'jobs30:legacy.b');
    Hook.set(MissionSystem.prototype, 'startCargo', function () { g.jobs.start('cargo'); }, 'jobs30:legacy.c');
    Hook.set(MissionSystem.prototype, 'offer', function () {
      const a = g.jobs.available();
      return a.length ? a[0].id : null;
    }, 'jobs30:offer');
  });

  console.log('[hexis 3.0] jobs online:', done.join(', ') + '  ·  ' + Object.keys(JOBS).length + ' jobs');
})();
