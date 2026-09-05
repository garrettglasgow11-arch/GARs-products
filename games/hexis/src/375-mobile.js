/* ===== 375-mobile.js ======================================================
   HEXIS 3.6 — the phone pass.

   The game has had touch controls since 3.0 and a rotate prompt since 2.4.
   What it had never had was anyone looking at it on a phone-shaped screen.
   Booted at 851x393 — an ordinary Android handset held sideways — the HUD
   comes back with eleven overlapping boxes:

     · SKILLS sits on top of MENU in the top right, and the frame counter
       sits on top of both;
     · the guard ring sits inside the touch button pad, so GUARD reads
       through HEAL and DASH;
     · the desktop ability row, with its LMB / SHIFT / Q / E key hints, is
       drawn underneath the touch buttons that do the same four things;
     · and "INTEGRITY" is printed twice, once by the vitals panel's ::before
       and once by the label row under the bar. That one is not a phone bug
       at all — it has been on screen at every size since 2.4.6.

   Everything here is scoped to `html.touchui` except the duplicate label,
   which is simply wrong everywhere.
   ========================================================================= */
(function mobilePass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[mob] ' + n, e); } };

  step('flag', () => {
    const set = () => {
      const t = typeof Input !== 'undefined' && Input.touch;
      document.documentElement.classList.toggle('touchui', !!t);
      // Short landscape is its own layout problem: a 16:9 handset gives about
      // 390 logical pixels of height, and the HUD was authored for 720.
      document.documentElement.classList.toggle('shortui', innerHeight <= 460);
    };
    set();
    addEventListener('resize', set);
    addEventListener('orientationchange', () => setTimeout(set, 240));
  });

  step('style', () => {
    const css = `
/* --- the duplicate label ------------------------------------------------
   #vitals.shell::before already prints INTEGRITY above the bar. The label
   row under it prints it again. Keep the styled one, drop the repeat — the
   CHARGE readout beside it stays. */
#vitals.shell #vlabels .lbl:first-child{ display:none; }
#vitals.shell #vlabels{ justify-content:flex-end; }

/* --- touch: one control surface, not two -------------------------------
   #abilities is the desktop row: four chips with keyboard hints in them.
   On a phone the same four actions are already big touch buttons directly
   on top of it, so all it contributed was LMB and SHIFT printed through
   SLASH and DASH. The touch buttons carry their own cooldown state. */
html.touchui #abilities{ display:none !important; }

/* The frame counter had three homes and collided with something in each:
   the two buttons top right, the charge cells bottom left, and the compass
   tape along the top centre. A phone player is not tuning a build — it goes,
   and F3 / the options panel still bring it back on a desktop. */
html.touchui #fps{ display:none !important; }

/* The Regulator chip sat on the movement stick's ring, which is both a
   readability problem and a place your thumb is about to be. */
html.touchui #jacketchip{
  bottom:auto; top:calc(max(10px,env(safe-area-inset-top,0px)) + 46px);
  left:max(10px,env(safe-area-inset-left,0px)); right:auto;
  transform:scale(.86); transform-origin:left top;
}

/* SKILLS under MENU rather than through it, both right-aligned. */
html.touchui #tmenu{
  right:max(12px,env(safe-area-inset-right,0px));
  top:calc(max(12px,env(safe-area-inset-top,0px)) + 40px);
  padding:7px 12px; font-size:.72em; border-width:1px; border-radius:3px;
}

/* The guard ring was inside the button pad. Bottom centre is clear of both
   the stick and the pad, and either thumb can reach it. */
html.touchui #tguard{
  left:50%; right:auto; transform:translateX(-50%);
  bottom:calc(max(12px,env(safe-area-inset-bottom,0px)) + 6px);
}

/* --- short landscape ----------------------------------------------------
   Everything a notch smaller so the top-left stack and the bottom bar stop
   meeting in the middle of a 390px-tall screen. */
html.shortui.touchui #vitals{
  transform:scale(.84); transform-origin:left bottom;
  bottom:calc(max(12px,env(safe-area-inset-bottom,0px)) + 6px);
}
html.shortui.touchui #obj{ transform:scale(.86); transform-origin:left top; }
html.shortui.touchui #tbtns{ transform:scale(.88); transform-origin:right bottom; }
html.shortui.touchui #tguard{ width:64px; height:64px; font-size:9px; }
html.shortui.touchui #tbtns2{ transform:scale(.9); transform-origin:right bottom; }
`;
    const n = document.createElement('style');
    n.id = 'mob36-css';
    n.textContent = css;
    document.head.appendChild(n);
  });

  console.log('[hexis 3.6] mobile online: ' + done.join(', ') +
    (document.documentElement.classList.contains('touchui') ? '  ·  touch layout' : ''));
})();
