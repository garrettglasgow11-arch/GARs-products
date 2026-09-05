/* ===== 390-scale.js =======================================================
   HEXIS 3.8 — the scaler reacted in frames, not seconds.

   A CDP profile of a real fight came back 99% `(program)` — time outside JS,
   in the rasteriser. The game is FILL BOUND. Which means the one lever that
   matters most is how many pixels it shades, and the game has an automatic
   resolution scaler for exactly that.

   It does not work, for three compounding reasons, all of them the same
   mistake: it is calibrated in FRAMES.

       if (this._fc > 90) {                       // wait 90 frames to start
         if (this._fps < 46) this._slow++;
         else if (this._slow > 40 && ...)         // 40 slow frames to act
           this._q -= 0.12;                       // one step of three
       }

   At 60 fps that reads as "start after 1.5 seconds, react after 0.7". At
   5 fps it reads as "start after 18 seconds, react after 8, and take 24 to
   reach the floor". The worse the framerate — the more the player needs
   help — the longer the game waits before giving any. That is backwards,
   and it is why `_q` was still sitting at 1.0 through every ten-second
   measurement on a machine managing two frames a second.

   `_fps` itself compounds it: a 0.93/0.07 exponential average needs dozens
   of samples to move, and at 5 fps dozens of samples is ten seconds.

   And the floor is 0.72. 2.4.2 raised it there on the reasoning that with
   the draw calls fixed nothing should need to go lower — true of the desktop
   it was measured on, not true of a phone.

   So: decide on a clock, react in proportion to the miss, and let the floor
   go lower when the miss is severe.
   ========================================================================= */
(function scalePass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[scale] ' + n, e); } };

  // 60 fps target. Drop when frames are being missed; climb only when the
  // interval is sitting on vsync AND the work inside the frame leaves room.
  const SLOW = 1 / 44;        // interval worse than this: frames are missed
  const OK = 1 / 50;          // interval at least this good before climbing
  const HEADROOM = 0.006;     // 6 ms of a 16.7 ms budget spent: room to climb
  /* SLOW and OK are deliberately not the same number. Between 20 and 22.7 ms
     nothing happens at all, because a machine sitting exactly on one
     threshold will otherwise climb and drop and climb forever, and a
     resolution that visibly breathes is worse than one that is simply a
     notch low. */

  step('floor', () => {
    /* How low the resolution may go. 0.55 of native on a phone is soft, and
       soft at 40 fps beats sharp at 12. Desktop rarely reaches it. */
    g.__qFloor = (typeof Input !== 'undefined' && Input.touch) ? 0.52 : 0.62;
  });

  /* ------------------------------------------------------- MEASUREMENT
     Two numbers, and they answer different questions.

       INTERVAL  wall time between frames. Says whether frames are being
                 MISSED. Under vsync it bottoms out at ~16.7 ms and cannot
                 go lower however much headroom there is.
       WORK      time inside frame() itself. Says how much of the budget is
                 being SPENT, which is the only way to see headroom.

     Scaling down off the interval is right: >22 ms means vsync is being
     missed and the player can see it. Scaling UP off the interval is not
     possible — 1/72 s is below the vsync floor, so the condition can never
     be true, and the first cut of this file duly degraded the game and then
     sat there for thirty seconds at a viewport small enough to run at
     hundreds of frames a second. A scaler that only ever goes down is a
     worse bug than the lag it was written to fix.

     Requiring the interval to sit AT vsync before climbing is also wrong,
     and measurement caught that too: at a viewport small enough to be
     trivial this machine ran a 20 ms interval with 2.4 ms of work — masses
     of headroom, but 50 fps, because the rasteriser simply cannot do 60.
     Plenty of real displays are 50 Hz and plenty of browsers throttle. So
     WORK decides whether to climb, and the interval only VETOES it while
     frames are actually being missed.

     (Work under-reports on a real GPU, where render() returns before the
     driver has finished — which is exactly what the veto is for: at the big
     viewport, work read 3.9 ms while the interval read 138 ms.) */
  step('measure', () => {
    let t0 = 0, last = performance.now();
    let iAcc = 0, wAcc = 0, n = 0;
    g.__frameWork = 0; g.__frameInterval = 0.016;
    Hook.before(Game.prototype, 'frame', function () { t0 = performance.now(); }, 'scale38:t0');
    Hook.after(Game.prototype, 'frame', function () {
      const now = performance.now();
      wAcc += now - t0;
      iAcc += Math.min(500, now - last);
      last = now; n++;
      if (n >= 30) {                       // a fresh reading roughly twice a second
        g.__frameWork = wAcc / n / 1000;
        g.__frameInterval = iAcc / n / 1000;
        wAcc = 0; iAcc = 0; n = 0;
      }
    }, 'scale38:measure');
  });

  step('time-based', () => {
    let acc = 0, hold = 0, last = performance.now();
    Hook.after(Game.prototype, 'frame', function () {
      const now = performance.now();
      acc += (now - last) / 1000; last = now;
      if (this._lockQ) return;              // the player picked a fixed quality
      // Neuter the frame-counting scaler rather than racing it.
      this._slow = 0; this._fast = 0;
      if (acc < 1.0) return;                // a decision every second, always
      acc = 0;
      if (hold > 0) { hold--; return; }

      const iv = g.__frameInterval, work = g.__frameWork;
      if (iv > SLOW) {
        /* Remember the level that just failed. Without this the scaler walks
           back up to exactly the setting it could not sustain, fails again,
           and the player watches the image pulse — which is what the first
           working version of this did, bouncing 0.64 / 0.69 / 0.72 / 0.64 on
           a machine that sat on the boundary. */
        if (this.__climbedAt && (now - this.__climbedAt) < 12000) {
          this.__qCeil = Math.max(0.5, this._q - 0.05);
          this.__ceilUntil = now + 30000;
        }
        /* Step in proportion to the miss. Missing by 20% is one nudge;
           missing by 4x is not a nudge, and stepping 0.12 at a time from 1.0
           would take the rest of the fight to get anywhere useful. */
        const over = iv / (1 / 60);
        const drop = over > 3 ? 0.22 : over > 1.8 ? 0.14 : 0.08;
        const want = Math.max(this.__qFloor, +(this._q - drop).toFixed(3));
        if (want < this._q) {
          this.__wantQ = want; this._q = want; this.applyQuality();
          hold = 1;                          // one quiet second to settle
        }
      } else if (work < HEADROOM && iv < OK && this._q < 1) {
        const ceil = (this.__ceilUntil && now < this.__ceilUntil)
          ? (this.__qCeil || 1) : 1;
        const want = Math.min(ceil, +(this._q + 0.05).toFixed(3));
        if (want > this._q) {
          this.__wantQ = want; this._q = want; this.applyQuality();
          this.__climbedAt = now;
          hold = 5;                          // climb back slowly
        }
      }
    }, 'scale38:tick');
  });

  step('floor-restore', () => {
    /* 2.4.2 clamps `_q` back up to 0.72 in its own applyQuality hook. Hooks
       installed later run later, so this one puts back the value that was
       actually asked for — and re-applies the pixel ratio, because
       applyQuality computed its ratio from the number before the clamp. */
    Hook.after(Game.prototype, 'applyQuality', function () {
      if (this._lockQ || this.__wantQ === undefined) return;
      if (Math.abs(this._q - this.__wantQ) < 0.001) return;
      this._q = this.__wantQ;
      const base = Math.min(devicePixelRatio, Input.touch ? 1.5 : 2);
      this.renderer.setPixelRatio(Math.max(0.5, base * this._q));
    }, 'scale38:restore');
  });

  /* ------------------------------------------------------------ CUTSCENES
     3.7's effect ladder returns early unless state === 'play'. Cutscenes are
     not 'play', so the tier froze at whatever it was when the cut began —
     which on a fresh boot is tier 3, every effect on, eight passes. The
     opening cutscene is the first thing a new player sees and it was the
     heaviest thing in the game.

     A cutscene is also the one place effects can be turned down without
     anyone losing a fight over it: the camera is on rails and nothing is
     being aimed at. */
  step('cutscene', () => {
    let saved = null;
    const enter = () => {
      if (saved !== null || typeof g.setFrameTier !== 'function') return;
      saved = g.__tier;
      g.setFrameTier(Math.min(g.__tier, 2));       // one octave of bloom, at most
    };
    const leave = () => {
      if (saved === null) return;
      const t = saved; saved = null;
      if (typeof g.setFrameTier === 'function') g.setFrameTier(t);
    };
    let was = null;
    Hook.after(Game.prototype, 'frame', function () {
      const s = this.state;
      if (s === was) return;
      was = s;
      if (s === 'cutscene') enter(); else leave();
    }, 'scale38:cutTier');
  });

  step('report', () => {
    const prev = g.frameReport;
    g.frameReport = function () {
      const r = prev ? prev.call(this) : {};
      r.q = this._q; r.wantQ = this.__wantQ; r.qFloor = this.__qFloor;
      r.lockQ = !!this._lockQ; r.state = this.state;
      return r;
    };
  });

  console.log('[hexis 3.8] scale online: ' + done.join(', ') +
    '  ·  floor ' + g.__qFloor);
})();
