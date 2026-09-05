/* ===== 380-menu.js ========================================================
   HEXIS 3.7 — the main menu.

   `.screen` is `position:absolute; inset:0` — every full-screen panel in the
   game is laid out by that one rule. Line 143 of the 2.4.6 source then says

       #title{ position:relative; overflow:hidden }

   and an id beats a class, so the title alone lost its absolute positioning.
   `inset:0` does nothing to a relative box, so #title stopped being sized by
   the viewport and started being sized by its own content: 516 pixels tall on
   a 720 pixel screen. The bottom 28% of the main menu was the game world
   showing through underneath it — a pale blue slab under the menu, on every
   display taller than the text.

   It has been there since 2.4.6 and it is the first thing anyone sees.
   ========================================================================= */
(function menuPass() {
  const g = window.HEXIS;
  if (!g) return;
  const done = [];
  const step = (n, fn) => { try { fn(); done.push(n); } catch (e) { console.error('[menu] ' + n, e); } };

  step('style', () => {
    const css = `
/* Put the title back on the same footing as every other screen. It still
   needs to be a containing block for its own absolutely-placed art, and an
   absolute box is one of those too. */
#title.screen{ position:absolute; inset:0; overflow:hidden; }

/* Gameplay HUD does not belong on the menu.

   The mode attribute already gates the touch buttons and the pause chip;
   these are the pieces 3.1 and 3.6 added afterwards and never registered.
   The Regulator chip was sitting in the bottom-left corner of the title
   screen, over the world that was showing through. */
html[data-mode="title"] #jacketchip,
html[data-mode="title"] #ragewrap,
html[data-mode="title"] #vitals,
html[data-mode="title"] #abilities,
html[data-mode="title"] #obj,
html[data-mode="title"] #bars,
html[data-mode="title"] #gui-comp,
html[data-mode="title"] #fps{ display:none !important; }

/* --- the compass tape ---------------------------------------------------
   #gui-comp fades its ends with a mask-image and leaves overflow:visible.
   A mask is not a clip: mask-repeat defaults to repeat, so the fade
   gradient TILES past the element's own box, and a tick label positioned
   beyond the tape still gets painted with a non-zero mask alpha.

   The tape is 300px wide and its "SW" tick sits at x=797 — 221 pixels past
   its own right edge, directly on top of the MENU button. It is invisible
   today only because the compass sits at opacity 0 until a mission turns it
   on, which is a stay of execution rather than a defence.

   overflow:hidden clips the ticks to the tape, which is what the mask was
   trying to express, and no-repeat stops the gradient tiling outward. The
   mask already fades to nothing by 84%, so a hard edge at 100% never shows. */
#gui-comp{
  overflow:hidden;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  -webkit-mask-size:100% 100%; mask-size:100% 100%;
}

/* The build stamp sat on the join between the panel and the world, so it was
   half-legible against whichever happened to be behind it. Now that the
   panel reaches the floor it only needs to clear the safe area. */
#title.shell .build{
  bottom:max(10px,env(safe-area-inset-bottom,0px));
  left:max(14px,env(safe-area-inset-left,0px));
  opacity:.5;
}
`;
    const n = document.createElement('style');
    n.id = 'menu37-css';
    n.textContent = css;
    document.head.appendChild(n);
  });

  /* The title renders a live canvas behind it — skyline, rain, drifting
     embers, three lightning bolts. None of that needs to run while the player
     is in a fight, and on a phone it is a measurable slice of the frame. */
  step('idle-art', () => {
    const t = document.querySelector('#title');
    if (!t) return;
    const set = () => {
      const on = document.documentElement.getAttribute('data-mode') === 'title';
      t.classList.toggle('artoff', !on);
    };
    const css = document.createElement('style');
    css.id = 'menu37-art';
    css.textContent =
      '#title.artoff .rain, #title.artoff .drift, #title.artoff .tbolt,' +
      '#title.artoff::before{ animation:none !important; opacity:0 !important; }';
    document.head.appendChild(css);
    new MutationObserver(set).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-mode'] });
    set();
  });

  console.log('[hexis 3.7] menu online: ' + done.join(', '));
})();
