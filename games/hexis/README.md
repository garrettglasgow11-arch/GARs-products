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

## What 4.0 and 4.1 changed

Everything here was found by tallying `renderer.renderBufferDirect` over
twenty frames of a real Central City fight, not by guessing.

| file | what it does |
|---|---|
| `400-skin.js` | folds every character into one skinned mesh per material |
| `410-frame.js` | shadow-map diet, crowd range, stops drawing behind a full-screen menu |
| `420-dev.js` | the menu above |
| `430-standalone.js` | localStorage floor under the save system |
| `440-fx.js` | 226 pooled debris meshes become 4 instanced draws |
| `450-menu.js` | the rotate banner has never laid out — a CSS rule styled a wrapper the markup never had, and a nowrap button crushed the text column anyway |
| `460-cast.js` | the prologue cast was never retired unless you watched the prologue to the end |

Measured by running the same script against both builds back to back — six
hostiles in Central City plus a debris storm:

```
                              before   after
draw submissions per frame       315     143
character bodies                 166      93
prologue cast still standing     150       0
debris (chunks/decals/puffs)     119       4   (119 instances, 4 draws)
shadow casters                   390       2   (422 demoted over a session)
```

The two remaining casters are the zone's own merged geometry and whichever
character bodies are on screen — every character still casts, it just casts
from one skinned mesh instead of six ranked plates.

The cast one is the big one and it only bites if you skip: `enterShowdown()`
is the only place that ever removed the four civilians from the house, so
taking any other route out — SKIP TO THE FIGHT, a Dev-menu warp, quitting to
title and starting again — left four 61-mesh rigs standing inside Central
City's geometry for the rest of the session.

Every optimisation has a switch on the Dev menu's Frame page. If a character
ever looks wrong, turn **Rig merge** off — the merge also reverts itself
automatically if any code asks for a plate it folded away.

### What is left

Of the 143, about 115 is still character rigs — the merged bodies plus the
plates the merge refuses to touch: transparent materials, and anything the
animation code holds by name. The protection walk errs generous on purpose;
over-protecting costs draws, under-protecting stops a limb animating.

Hexis himself is the worst of them, 37 leftovers against 6 merged, because a
player character has far more named parts than a grunt does. That is the next
thing worth doing, and it needs a careful look at which of those names are
actually written to at runtime rather than a looser protection walk.
