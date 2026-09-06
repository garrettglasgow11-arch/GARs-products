# HEXIS — Stormbreak

A single-file browser game. Open `index.html` in any modern browser — no server,
no build step, no dependencies. Three.js r128 is inlined in the file.

## Playing it

**Desktop** — WASD to move, mouse to look, LMB sword, Shift dash, Q charged fist,
E mend, F guard, Space jump, Tab skill tree, Escape pause.
**Touch** — left stick to move, drag the right half to look, the buttons appear
as their abilities unlock. MENU top-right pauses.

Progress saves to the browser's local storage, so it survives a reload and is
private to the browser you play in.

## The Dev menu

Off by default. Three ways in:

| Route | Where |
|---|---|
| `` ` `` (backquote) | any keyboard |
| `?dev=1` on the URL | anywhere |
| five taps on the build stamp in the pause menu | phone |

It appears as a **DEV** tab in the pause menu and carries:

- **Scenes** — skip the scene playing now, skip every scene from here on, or
  jump straight to Central City with what the prologue grants
- **Travel** — any of the seven zones, immediately
- **Hexis** — invulnerable, endless charge, ghost (no collision), full repair,
  unlock everything, add nodes and levels
- **Spawn** — any archetype, anywhere; clear the floor; six of everything
- **Jobs** — start any job, open every zone, abandon the current one
- **Time** — freeze through 4x
- **Frame** — live draw-call, caster and merge counts, effect tier, render
  scale, and a switch for every optimisation so you can measure what each one
  is worth on your own device
- **Save** — write, wipe, or turn the menu back off

Keys while it is on: `` ` `` menu · `P` skip a scene · `G` invulnerable ·
`K` clear the floor · `[` `]` time.

## What 4.0 changed

`400-skin.js` folds every character into one skinned mesh per material.
`410-frame.js` puts the shadow map on a diet, ranges the crowd, and stops
drawing the world behind a full-screen menu. `420-dev.js` is the menu above.
`430-standalone.js` gives the save system a localStorage floor so a downloaded
copy actually keeps progress.

Measured in a Central City fight, six hostiles on screen:

```
draw submissions per frame     250  ->  60
character bodies               166  ->  30
shadow casters                 390  -> 114
depth-pass triangles        57,800  -> 37,600
```

Every optimisation has a switch on the Dev menu's Frame page. If a character
ever looks wrong, turn **Rig merge** off — the merge also reverts itself
automatically if any code asks for a plate it folded away.
