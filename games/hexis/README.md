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

The merge keeps its index buffers. `RigOpt.mergeGeos` de-indexes everything it
touches and the first cut of `400-skin.js` copied that, which is free for a
static merge and is not free once the result is skinned: same 9,902 triangles
on Hexis either way, 16,079 vertices submitted indexed against 23,806
expanded. Triangles are what the rasteriser counts; vertices are what the
vertex shader runs, and skinning is a vertex-shader cost.

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

### The one number that isn't here

Draw calls, vertices and triangles are hardware-independent and all three are
measured above. GPU time is not: these were taken in a headless container with
no GPU, where `renderer.render()` is software rasterisation and swings between
3 ms and 18 ms across identical runs of the same build. So the trade the rig
merge actually makes — 170 fewer draw calls against per-vertex skinning —
cannot be settled here.

It can be settled on your phone in about thirty seconds. Dev menu → Frame →
turn the readout on, note the fps and draw count mid-fight, flip **Rig merge**,
look again. The switch is remembered across reloads for exactly this reason.
On mobile hardware the trade is not usually close: draw calls are the classic
bottleneck and one-bone rigid skinning is what every character in every game
already does. But it is hardware, and hardware is where it gets decided.

### What is left, and why it is staying

115 of the 143 is still character rigs. I attributed every leftover plate
rather than guessing, and the answer is that the merge is close to its floor.

```
Hexis      6 merged + 37 left:  23 protected, 7 alone in their material,
                                6 transparent, 1 unclassified
grunt      5 merged +  5 left:   3 protected, 2 alone
enforcer   5 merged + 11 left:   7 protected, 2 alone, 2 transparent
```

The protected ones are named on the rig, and the names are the reason:

```
rig.coat[n].g   6   panels that swing behind the body on velocity
rig.blade       5   grows and pulses
rig.eyes/lids/
    brows       6   the face — lids blink, brows move
rig.ventPack    4
rig.hex/skull/
    visor       3   toggled visible
```

Those are the parts that animate. Merging them is not a protection walk that
is too cautious, it is the walk being right. Loosening it to reclaim the vent
pack would risk the face and the coat for four draws a body.

The genuinely reclaimable ones are the ~11 that are alone in their material —
they could be folded into a single vertex-coloured mesh, worth about 10 draws
across a whole fight, and only if you can prove none of those materials is one
`setTrim` mutates. That is a 7% gain for a real chance of breaking the hit
flash, so it is not done.

The other floor is `5 merged` per body: that is the count of distinct
materials a character has more than one mesh of. Going below it needs a
texture atlas, which is an art-pipeline change, not a rendering one.
