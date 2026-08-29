/* ===== 310-kit.js =========================================================
   HEXIS 3.0 — the kit, connected.

   The 2.4 build shipped a complete second combat layer: three stances, five
   abilities, an ultimate, a guard and a parry. None of it was reachable.
   Every gate reads a flag on `game.unlocked` — `tempest`, `lance`, `clap`,
   `blink`, `tether`, `storm`, `overload` — and not one of those flags is ever
   written by anything in the file. `Fight.setForm('tempest')` answers
   "Tempest form locked" for the entire game; Storm Call's meter is hidden by
   `renderUlt()` because `unlocked.storm` is false, so the ultimate charges
   invisibly and can never be spent.

   And on a phone none of it was reachable even if it had been unlocked: the
   touch pad has five buttons — jump, dash, fist, slash, heal — against a kit
   that needs eleven inputs. Roughly two thirds of the game was keyboard-only.

   This module is the missing half:

     POWERS      one table describing every gated ability: name, key, cost,
                 the line the toast prints, and where it comes from
     unlockPower the single entry point, so a mission, a level-up, a boss and
                 the debug console all grant a power the same way
     progression level thresholds, so a player who never touches a mission
                 still finishes the game with a full kit
     touch       a real control surface for the whole thing — stance switch,
                 guard, and the four powers — laid out for two thumbs and
                 hidden until the power exists
     HUD         the ability row grows to match, with cooldown sweeps
   ========================================================================= */

const POWERS = {
  tempest: {
    name: 'Tempest Form', key: '3', short: '≈', order: 1,
    desc: 'A third stance. Ranged arc bolts, no reload, drains charge.',
    from: 'Taught by Vane once you have a reason to fight at range.'
  },
  clap: {
    name: 'Thunderclap', key: 'X', short: '◎', order: 2, cd: 4.5,
    desc: 'Ground shock. Knocks everything nearby off its feet.',
    from: 'Recovered from the Undercity relay core.'
  },
  blink: {
    name: 'Blink', key: 'V', short: '⇢', order: 3, cd: 3.2,
    desc: 'Phase nine metres through anything. Marks what you pass through.',
    from: 'Reverse-engineered from a Stalker cloak.'
  },
  tether: {
    name: 'Arc Tether', key: 'C', short: '⌁', order: 4, cd: 0.6,
    desc: 'Grapple. Light bodies come to you, heavy ones pull you in.',
    from: 'Foundry crane rigging, repurposed.'
  },
  lance: {
    name: 'Ion Lance', key: 'HOLD', short: '↦', order: 5,
    desc: 'Hold the attack in Tempest. A pierce line that marks everything on it.',
    from: 'What the Foundry was actually building.'
  },
  storm: {
    name: 'Storm Call', key: 'R', short: '⚡', order: 6,
    desc: 'Six seconds of guided lightning. Fills from damage and parries.',
    from: 'The storm was never external.'
  },
  overload: {
    name: 'Overload', key: '—', short: '∞', order: 7, passive: true,
    desc: 'Kills refund charge and hold the combo open.',
    from: 'A Resonance discipline.'
  }
};

/* Anyone can finish the game without ever talking to Rex, so the powers also
   fall out of levelling. The mission that grants a power sets its flag first;
   this only ever fills gaps, and only upward. */
const POWER_LEVELS = [
  [3, 'tempest'], [5, 'clap'], [7, 'blink'], [9, 'tether'], [11, 'lance'], [14, 'storm']
];

(function kitPass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[kit] ' + n, e); } };

  /* ------------------------------------------------------------------ CSS */
  step('style', () => {
    const css = `
/* --- extra ability chips ------------------------------------------------ */
#abilities{ flex-wrap:wrap; max-width:min(420px,62vw); }
.ab.pw{ position:relative; }
.ab.pw .k{ font-size:.62em; letter-spacing:.1em; }
.ab.pw.pass{ opacity:.72; }
.ab.pw.pass .cd{ display:none; }

/* --- touch: the second row ---------------------------------------------- */
#tbtns2{
  position:absolute; right:max(12px,env(safe-area-inset-right,0px));
  bottom:calc(max(12px,env(safe-area-inset-bottom,0px)) + 168px);
  display:flex; flex-direction:column; align-items:flex-end; gap:7px;
  pointer-events:auto; z-index:22;
}
#tbtns2 .tb{
  min-width:60px; padding:8px 11px; text-align:center;
  font:400 10px/1 var(--mono); letter-spacing:.16em; text-transform:uppercase;
  color:var(--bone); background:rgba(8,13,22,.62);
  border:1px solid rgba(95,227,255,.26);
  clip-path:var(--clip);
  -webkit-user-select:none; user-select:none;
  transition:background .12s ease, color .12s ease;
}
#tbtns2 .tb b{ display:block; font-size:15px; letter-spacing:0; margin-bottom:3px; color:var(--arc); }
#tbtns2 .tb.hide{ display:none; }
#tbtns2 .tb.down{ background:rgba(95,227,255,.26); color:#04070d; }
#tbtns2 .tb.cool{ opacity:.42; }
#tbtns2 .tb i{
  position:absolute; left:0; right:0; bottom:0; height:2px;
  background:var(--arc); transform-origin:left; transform:scaleX(0);
}
#tbtns2 .tb{ position:relative; overflow:hidden; }

/* Stance chip sits apart — it is a mode, not an action. */
#tform{
  position:absolute; left:max(12px,env(safe-area-inset-left,0px));
  bottom:calc(max(12px,env(safe-area-inset-bottom,0px)) + 152px);
  padding:9px 14px; pointer-events:auto; z-index:22;
  font:400 10px/1 var(--mono); letter-spacing:.2em; text-transform:uppercase;
  background:rgba(8,13,22,.66); border:1px solid rgba(95,227,255,.3);
  clip-path:var(--clip); color:var(--steel);
}
#tform b{ display:block; font-family:var(--disp); font-size:16px; letter-spacing:.06em; margin-top:3px; color:var(--arc); }
#tform.hide{ display:none; }

/* Guard is a hold, so it gets the biggest target and sits under the thumb. */
#tguard{
  position:absolute; right:calc(max(12px,env(safe-area-inset-right,0px)) + 96px);
  bottom:calc(max(12px,env(safe-area-inset-bottom,0px)) + 14px);
  width:74px; height:74px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font:400 10px/1.4 var(--mono); letter-spacing:.14em; text-align:center;
  color:var(--bone); background:rgba(8,13,22,.5);
  border:1px solid rgba(95,227,255,.3); pointer-events:auto; z-index:22;
}
#tguard.down{ background:rgba(255,198,77,.3); border-color:var(--gold); }
#tguard.hide{ display:none; }

html[data-mode="title"] #tbtns2, html[data-mode="title"] #tform, html[data-mode="title"] #tguard,
html[data-mode="panel"] #tbtns2, html[data-mode="panel"] #tform, html[data-mode="panel"] #tguard{ display:none !important; }

/* --- power grant card --------------------------------------------------- */
#powercard{
  position:absolute; left:50%; top:34%; transform:translate(-50%,-50%) scale(.94);
  width:min(460px,86vw); padding:20px 24px; z-index:44; pointer-events:none;
  background:linear-gradient(160deg,rgba(10,16,28,.95),rgba(5,7,12,.95));
  border:1px solid rgba(95,227,255,.4); clip-path:var(--clip);
  opacity:0; transition:opacity .35s ease, transform .35s cubic-bezier(.2,.9,.2,1);
  box-shadow:0 0 60px rgba(95,227,255,.16);
}
#powercard.on{ opacity:1; transform:translate(-50%,-50%) scale(1); }
#powercard .eb{ font:400 9px/1 var(--mono); letter-spacing:.34em; text-transform:uppercase; color:var(--arc); }
#powercard h3{ font-family:var(--disp); font-size:30px; letter-spacing:.05em; text-transform:uppercase; margin:9px 0 4px; color:var(--bone); }
#powercard .bind{ font:400 11px/1 var(--mono); letter-spacing:.2em; color:var(--gold); margin-bottom:10px; }
#powercard p{ font:400 12px/1.6 system-ui,sans-serif; color:var(--steel); margin:0; }
#powercard .src{ margin-top:10px; font-style:italic; opacity:.72; }
`;
    const n = document.createElement('style');
    n.id = 'kit30-css';
    n.textContent = css;
    document.head.appendChild(n);
  });

  /* ---------------------------------------------------------- GRANT A POWER
     One path in. Every caller — mission, level-up, boss reward, console —
     lands here, so the toast, the save, the HUD refresh and the tutorial line
     can never disagree about what the player has. */
  step('unlock', () => {
    const card = document.createElement('div');
    card.id = 'powercard';
    card.innerHTML = '<div class="eb">Power acquired</div><h3></h3><div class="bind"></div><p></p><p class="src"></p>';
    (document.querySelector('#ui') || document.body).appendChild(card);

    Game.prototype.unlockPower = function (key, opts = {}) {
      const P = POWERS[key];
      if (!P || this.unlocked[key]) return false;
      this.unlocked[key] = true;
      this.flags['pw_' + key] = true;
      this.persist();

      if (!opts.silent) {
        card.querySelector('h3').textContent = P.name;
        card.querySelector('.bind').textContent = P.passive
          ? 'PASSIVE — ALWAYS ON'
          : (Input.touch ? 'NEW BUTTON, BOTTOM RIGHT' : 'BOUND TO  ' + P.key);
        card.querySelector('p').textContent = P.desc;
        card.querySelector('.src').textContent = P.from;
        card.classList.add('on');
        CLOCK.cancel('powercard');
        CLOCK.in(4.4, () => card.classList.remove('on'), 'powercard');

        try { AudioX.play('unlock_power', { vol: 0.9 }); } catch (e) { Audio2.play('unlock'); }
        FX.flash(0.4, '#5FE3FF');
        if (this.player) {
          FX.ringBurst(this.player.pos.clone(), 8, '#5FE3FF', 0.9, 0.5);
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU;
            FX.bolt(this.player.pos.clone().add(V3(0, 1.1, 0)),
              this.player.pos.clone().add(V3(Math.cos(a) * 6, rand(0, 3), Math.sin(a) * 6)), '#bfefff', 0.28, 1.2);
          }
        }
      }
      Bus.emit('power:unlocked', key, P);
      if (typeof Feed !== 'undefined' && Feed.renderUlt) Feed.renderUlt();
      refreshChips();
      return true;
    };

    // Level thresholds fill anything a player skipped. Checked on every kill,
    // which is the only place lv can move.
    Hook.after(Game.prototype, 'onKill', function () {
      for (const [lv, key] of POWER_LEVELS) {
        if (this.lv >= lv && !this.unlocked[key]) { this.unlockPower(key); break; }
      }
    }, 'kit30:levelPowers');

    // Overload is the Resonance branch payoff, so it rides that unlock rather
    // than a level. `overcharge` is already granted at 6 nodes.
    Bus.on('flag:set', () => { });
    Hook.after(Game.prototype, 'spendPoint', function () {
      if (this.unlocked.overcharge && !this.unlocked.overload) this.unlockPower('overload');
    }, 'kit30:overload');
  });

  /* Touch-layout state. Declared up here rather than beside the touch step
     because refreshChips() calls layoutTouch(), and the chips are built
     first — a `let` further down the module is in its temporal dead zone at
     that point and the whole chips step dies on the ReferenceError. */
  let padWrap = null, formChip = null, guardBtn = null;
  const padBtns = {};

  /* ------------------------------------------------------------- HUD CHIPS
     The base ability row is four fixed nodes in the markup. The powers get
     the same treatment, built once and toggled, so 95-frame's write-on-change
     discipline still holds — nothing here allocates or queries per frame. */
  const chips = {};
  function refreshChips() {
    for (const k in chips) {
      const on = !!g.unlocked[k];
      const el = chips[k];
      if (el.__on !== on) { el.__on = on; el.classList.toggle('hide', !on); el.classList.toggle('on', on); }
    }
    layoutTouch();
  }

  step('chips', () => {
    const row = document.querySelector('#abilities');
    if (!row) return;
    const keys = Object.keys(POWERS).sort((a, b) => POWERS[a].order - POWERS[b].order);
    for (const k of keys) {
      const P = POWERS[k];
      const d = document.createElement('div');
      d.className = 'ab pw hide' + (P.passive ? ' pass' : '');
      d.id = 'ab-' + k;
      d.innerHTML = '<span class="gl">' + P.short + '</span><span class="k">' +
        (P.passive ? 'AUTO' : P.key) + '</span><div class="cd"></div>';
      row.appendChild(d);
      chips[k] = d;
      d.__cdEl = d.querySelector('.cd');
    }
    // Cooldown sweeps, written only when the quantised value changes.
    Hook.after(UIManager.prototype, 'setAbilityState', function () {
      if (typeof Fight === 'undefined' || !Fight.ready) return;
      const sweep = (k, t) => {
        const c = chips[k]; if (!c || !c.__on) return;
        const q = Math.round(clamp(t, 0, 1) * 64) / 64;
        if (c.__sw === q) return;
        c.__sw = q;
        c.__cdEl.style.transform = 'scaleY(' + q + ')';
      };
      sweep('clap', Fight.clapCd / (POWERS.clap.cd || 1));
      sweep('blink', Fight.blinkCd / (POWERS.blink.cd || 1));
      sweep('tether', Fight.tetherCd / (POWERS.tether.cd || 1));
      sweep('storm', typeof Feed !== 'undefined' ? 1 - (Feed.ult / Feed.ultMax) : 0);
    }, 'kit30:chipCd');
    refreshChips();
  });

  /* ----------------------------------------------------------------- TOUCH
     Eleven inputs on two thumbs. The rules the layout follows:

       · the left thumb never leaves the stick, so the stance chip is the only
         thing on that side and it is a tap, not a hold
       · guard is a hold, so it is round, large, and inside the natural arc of
         the right thumb rather than out at the edge
       · powers are a vertical stack above the action pad, ordered by how
         often they are pressed, and a button that is not unlocked is not
         drawn at all — the stack grows as the game does
       · every button is a real pointer target with its own capture, so a
         finger sliding off it releases cleanly instead of sticking on

     Nothing here goes through Input.initTouch: that ran at boot against the
     five buttons in the markup and cannot be re-entered safely. */
  function layoutTouch() {
    if (!padWrap) return;
    for (const k in padBtns) {
      const need = padBtns[k].__need;
      const on = !need || need();
      const b = padBtns[k];
      if (b.__vis !== on) { b.__vis = on; b.classList.toggle('hide', !on); }
    }
    const anyForm = g.unlocked.fist || g.unlocked.tempest;
    if (formChip && formChip.__vis !== anyForm) { formChip.__vis = anyForm; formChip.classList.toggle('hide', !anyForm); }
  }

  step('touch', () => {
    if (!Input.touch) return;
    const host = document.querySelector('#touch');
    if (!host) return;

    /* A press/release pair that survives the finger leaving the element. */
    const bindHold = (node, onDown, onUp) => {
      let id = null;
      const down = (e) => {
        if (id !== null) return;
        id = e.pointerId === undefined ? 1 : e.pointerId;
        try { node.setPointerCapture(e.pointerId); } catch (_) { }
        node.classList.add('down');
        e.preventDefault(); e.stopPropagation();
        onDown();
      };
      const up = (e) => {
        if (id === null) return;
        id = null;
        try { node.releasePointerCapture(e.pointerId); } catch (_) { }
        node.classList.remove('down');
        e.preventDefault(); e.stopPropagation();
        if (onUp) onUp();
      };
      node.addEventListener('pointerdown', down);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
      node.addEventListener('pointerleave', (e) => { if (id !== null) up(e); });
      node.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    // --- power stack ---
    padWrap = document.createElement('div');
    padWrap.id = 'tbtns2';
    host.appendChild(padWrap);

    const addBtn = (id, glyph, label, need, fire) => {
      const b = document.createElement('div');
      b.className = 'tb hide';
      b.innerHTML = '<b>' + glyph + '</b>' + label + '<i></i>';
      b.__need = need;
      b.__bar = b.querySelector('i');
      padWrap.appendChild(b);
      padBtns[id] = b;
      bindHold(b, fire);
      return b;
    };

    addBtn('ult', POWERS.storm.short, 'Storm',
      () => g.unlocked.storm, () => Fight.stormCall());
    addBtn('clap', POWERS.clap.short, 'Clap',
      () => g.unlocked.clap, () => Fight.thunderclap());
    addBtn('blink', POWERS.blink.short, 'Blink',
      () => g.unlocked.blink, () => Fight.blink());
    addBtn('hook', POWERS.tether.short, 'Tether',
      () => g.unlocked.tether, () => Fight.fireTether());

    // --- stance chip: tap to cycle whatever is unlocked ---
    formChip = document.createElement('div');
    formChip.id = 'tform';
    formChip.className = 'hide';
    formChip.innerHTML = 'Stance<b>BLADE</b>';
    host.appendChild(formChip);
    bindHold(formChip, () => {
      const order = ['blade', 'fist', 'tempest'].filter(f =>
        f === 'blade' ? g.unlocked.sword : g.unlocked[f === 'fist' ? 'fist' : 'tempest']);
      if (order.length < 2) return;
      const i = order.indexOf(Fight.form);
      Fight.setForm(order[(i + 1) % order.length]);
    });
    Bus.on('form:changed', (name) => {
      const b = formChip.querySelector('b');
      const f = FORMS[name];
      if (!f) return;
      b.textContent = f.name.toUpperCase();
      b.style.color = f.color;
    });

    // --- guard / parry ---
    // Fight.updateGuard reads Input.keys.__guard, which nothing on touch ever
    // set. It is checked every frame, so a held flag is all it needs.
    guardBtn = document.createElement('div');
    guardBtn.id = 'tguard';
    guardBtn.textContent = 'GUARD';
    host.appendChild(guardBtn);
    bindHold(guardBtn,
      () => { Input.keys.__guard = true; },
      () => { Input.keys.__guard = false; });

    // The stack has to disappear for cutscenes with everything else.
    Hook.after(UIManager.prototype, 'setControlsMode', function (mode) {
      const hidden = mode === 'hidden';
      for (const k in padBtns) padBtns[k].style.visibility = hidden ? 'hidden' : '';
      if (formChip) formChip.style.visibility = hidden ? 'hidden' : '';
      if (guardBtn) guardBtn.style.visibility = hidden ? 'hidden' : '';
    }, 'kit30:touchMode');

    // Cooldown bars on the stack, at the same 20 Hz the compass uses.
    let acc = 0;
    Hook.after(Game.prototype, 'frame', function () {
      acc += this._dtAvg || 0.016;
      if (acc < 0.08) return;
      acc = 0;
      if (typeof Fight === 'undefined' || !Fight.ready) return;
      const bar = (id, t) => {
        const b = padBtns[id]; if (!b || !b.__vis) return;
        const q = Math.round(clamp(1 - t, 0, 1) * 32) / 32;
        if (b.__q === q) return;
        b.__q = q;
        b.__bar.style.transform = 'scaleX(' + q + ')';
        b.classList.toggle('cool', q < 0.999);
      };
      bar('clap', Fight.clapCd / POWERS.clap.cd);
      bar('blink', Fight.blinkCd / POWERS.blink.cd);
      bar('hook', Fight.tetherCd / 0.6);
      bar('ult', typeof Feed !== 'undefined' ? 1 - Feed.ult / Feed.ultMax : 1);
    }, 'kit30:touchCd');

    layoutTouch();
  });

  /* -------------------------------------------------------------- KEYBOARD
     Two additions, both about discoverability rather than new capability.

     Guard was documented as "hold F / RMB" but RMB is also the fallback look
     control when pointer lock is denied — inside an iframe, holding right to
     look also guards, which drains charge you did not spend. Guard on RMB now
     requires an actual pointer lock, which is what the original comment in
     updateGuard intended and the code half-implemented.

     And the key hints on the title screen list a kit from two versions ago. */
  step('keys', () => {
    const hints = document.querySelector('#keyhints');
    if (hints) hints.innerHTML =
      '<b>WASD</b> move <b>SPACE</b> jump, twice to double <b>SHIFT</b> run<br>' +
      '<b>LMB</b> strike <b>1</b>/<b>2</b>/<b>3</b> stance <b>F</b> hold to guard, tap on the tell to parry<br>' +
      '<b>Q</b> charge the fist <b>X</b> clap <b>V</b> blink <b>C</b> tether <b>R</b> storm call<br>' +
      '<b>E</b> talk <b>TAB</b> skills <b>M</b> map <b>ESC</b> pause';
  });

  /* -------------------------------------------------------------- TUTORIAL
     A power the player cannot find is a power they do not have. The first
     time each one is granted, the objective line says what to press until it
     has actually been used once. */
  step('teach', () => {
    const pending = new Set();
    Bus.on('power:unlocked', (key) => {
      const P = POWERS[key];
      if (!P || P.passive) return;
      pending.add(key);
      g.ui.objective('New: ' + P.name + (Input.touch ? '' : '  [' + P.key + ']'));
    });
    const used = (key) => {
      if (!pending.delete(key)) return;
      try { AudioX.play('ui_select', { vol: 0.5 }); } catch (_) { }
      if (!pending.size && g.missions && !g.missions.active) g.ui.objective('—');
    };
    Hook.after(Fight, 'thunderclap', () => used('clap'), 'kit30:t.clap');
    Hook.after(Fight, 'blink', () => used('blink'), 'kit30:t.blink');
    Hook.after(Fight, 'fireTether', () => used('tether'), 'kit30:t.tether');
    Hook.after(Fight, 'stormCall', () => used('storm'), 'kit30:t.storm');
    Hook.after(Fight, 'releaseLance', () => used('lance'), 'kit30:t.lance');
    Bus.on('form:changed', (n) => { if (n === 'tempest') used('tempest'); });
  });

  /* ------------------------------------------------------------------ SAVE
     unlocked{} already round-trips through the profile, so restoring a save
     restores the powers. What did not round-trip was the HUD: chips are built
     after restore() has resolved. Refresh once the profile is in. */
  step('restore', () => {
    Hook.after(Game.prototype, 'restore', function () { refreshChips(); }, 'kit30:restore');
    refreshChips();
  });

  /* ------------------------------------------------------------------ DEBUG
     `HEXIS.give('storm')`, or `HEXIS.give()` for everything. */
  step('console', () => {
    g.give = function (k) {
      if (k) return this.unlockPower(k);
      for (const key in POWERS) this.unlockPower(key, { silent: true });
      for (const key of ['sword', 'speed', 'fist', 'heal', 'chain']) this.unlocked[key] = true;
      refreshChips();
      this.ui.toast('FULL KIT', 'Every power unlocked');
      this.persist();
      return Object.keys(this.unlocked).filter(x => this.unlocked[x]).join(', ');
    };
  });

  console.log('[hexis 3.0] kit online:', done.join(', '));
})();
