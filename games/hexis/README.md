# HEXIS 3.3 — "Stormbreak"

Two builds of the same game, in one folder.

| | | |
|---|---|---|
| **`hexis.html`** | single file, offline, single-player | open it in a browser |
| **`stormlink/`** | Go server + ES-module client, up to 8 players | `go run ./cmd/stormlink` |

Both are generated at runtime: no model files, no textures, no audio samples.
The only third-party code in either build is three.js.

---

## Running them

### The single-file build

```
open games/hexis/hexis.html
```

Double-click it. It pulls three.js from a CDN; if you want it to work with no
network, drop `three.min.js` next to it and point the `<script src>` at it.

Useful query flags: `?safe` (skip the post-processing stack — the first thing
to try if the screen is black), `?dev` (debug console + profiler on boot),
`?god`, `?nofx`, `?seed=1234`. `F3` toggles the frame counter at any time.

**Editing it.** The playable file is generated. The 3.0 sources are in `src/`:

```
node build.mjs           # splice src/*.js back into hexis.html
node build.mjs --check    # parse only, write nothing
```

Everything above the `>>> HEXIS 3.0 >>>` marker in `hexis.html` is the 2.4.6
build, unmodified. Everything below it is generated from `src/` and is
overwritten on every build.

### The multiplayer build

```
cd games/hexis/stormlink
go run ./cmd/stormlink            # then open http://localhost:8080
```

No dependencies — not "few", none. `go.mod` has no `require` block; the
WebSocket implementation is in `internal/ws`. See `stormlink/README.md`.

---

## What 3.0 changes

### The headline: about half the game was unreachable

The 2.4.6 build contains a complete Act II and Act III that nothing in the file
can get to. Not "unfinished" — finished, tested-looking, and orphaned:

| Content | State in 2.4.6 |
|---|---|
| Four zones — Undercity, Foundry, Spire, Lattice | Built, with spawn graphs, acoustics and weather. `loadZone` is only ever called with the three Act I builders. |
| Six abilities — Tempest, Thunderclap, Blink, Arc Tether, Ion Lance, Storm Call | Implemented, gated on flags (`unlocked.storm`, …) that **nothing ever sets**. Every one answers "locked" for the entire game. |
| The Architect — a four-phase boss with anchors, five telegraphed moves, drone escorts, teleports, afterimages | `new Architect(...)` appears nowhere in the file. |
| Rex's seven-topic conversation, with story gates | `Dialogue` is constructed and never started. Rex stayed a two-button mission board. |
| Ten enemy archetypes | Only `grunt` and `enforcer` are ever spawned. |
| A `[JOB]` mission framework, listed in the expansion's own contents page | Does not exist. Two hand-written missions instead. |

3.0 is mostly the wiring that connects it, plus the framework the contents page
promised. New in `src/`:

- **`320-jobs.js`** — the mission framework. Objectives are data with a kind
  (`reach`, `destroy`, `kill`, `hold`, `survive`, `scan`, `boss`), so a job is a
  literal, not a function. Nine jobs, one repeatable, all with rewards, clocks,
  reinforcements and marker chains.
- **`330-acts.js`** — Rex's conversation, a job board, a transit system, zone
  exits, the Architect encounter, and an ending.
- **`310-kit.js`** — a real unlock path for the six locked abilities, level
  fallbacks so you finish with a full kit even if you never take a job, and a
  touch control surface for all of it (the phone build had five buttons for a
  kit that needs eleven inputs).
- **`340-qol.js`** — pause menu, job log, codex, record, checkpoints,
  auto-sprint, hold-or-toggle guard, always-on enemy bars, clean-HUD
  screenshot mode, and a trainer in the Lattice.
- **`350-model.js`** — layered plating, back vents that flare on a dash, rank
  chevrons on hostiles, and a coat that responds to the *direction* you are
  moving rather than only your speed.
- **`360-perf.js`** — allocation pass, plus a body budget tied to measured
  frame rate.

### Bugs fixed

Each of these was reproduced before it was fixed. `src/300-fix.js` carries the
full write-up; the short version:

| | Symptom |
|---|---|
| **Nothing ever saved** | `Save` only talked to the artifact storage bridge and fell through to a module-scope variable everywhere else. Skill points, unlocks, flags and settings were lost on every reload on every normal host. Now bridge → localStorage → memory, debounced, flushed on `pagehide`. |
| **One exception killed the game** | `frame()` ends with `requestAnimationFrame(this._loop)`. Anything that threw anywhere in the frame meant that line was never reached: black screen, live HUD, reload to recover. The loop now re-arms unconditionally and reports each distinct failure once. |
| **Falling off the world crashed it** | `this.hurt(8, null)` on `CharacterController`, which has no `hurt`. Guaranteed TypeError, straight through the loop bug above. The same line also respawned you at the world origin — which in the Foundry is the hole you just fell down. |
| **The HUD drew on top of itself** | `#vitals.shell{position:relative}` overrode the base sheet's `position:absolute`, dropping the integrity bar and charge cells out of absolute positioning and into the objective panel's lap, with the top of the bar clipped off-screen. |
| **The final boss skipped its first phase** | `phases: [0.999, …]` with a `+2` phase offset meant the first point of damage jumped the Architect to phase 2. Phase 1 lasted one hit. |
| **The final boss could not be damaged in its last phase** | `get targets` admitted a boss only at `phase >= 1 && phase <= 3`. The Architect's phase 4 is a real fight. It was unwinnable. |
| **Act I kills fed nothing** | The base `Enemy.die()` never emitted `enemy:killed`, so arena and Kell-fight kills gave no combo, no ultimate charge, no kill feed and no Overload refund. The identical grunt spawned by a city patrol did all four. |
| **Knockback resist secretly cut damage** | `hurtPlayer` applied `knockRes` to the damage term *and* to the impulse. A full Resonance build took 62% less damage than the tree advertised. |
| **Damage numbers turned into black boxes** | `LabelTex` evicted textures with `dispose()` while live sprites still referenced them. |
| **Leaving a zone with a boss alive** | `loadZone` iterated `boss.blasts`, a field only Kell has — after disposing the old zone. Black screen with a working HUD. |
| **Double respawns** | `setTimeout` on wall time, no re-entry guard. Die twice quickly and the second respawn teleports you mid-fight. |
| **Voice-over reset your volume** | Ducking restored a hardcoded `0.6` rather than your setting. Muted players got un-muted by a line of dialogue. |
| **Talking to Rex also healed you** | `E` was bound to Storm Mend and to "interact". |
| **Shadows off cost 300 ms** | Toggling traversed the scene setting `needsUpdate` on every material — a full shader recompile of the entire build, fired at the moment the device was already struggling. |
| **Also** | prop list mutated during iteration; anchors leaked into `props` forever; the mission panel rebuilt its `<ul>` twice a second for two minutes; travelling during a cutscene left the cutscene driving the camera and its callback firing against a disposed zone; the netgraph canvas rule caught every canvas on the page. |

### Performance

The 2.4.x passes fixed draw calls (901 → 155), triangles (159k → 70k) and DOM
writes. What none of them touched was allocation, because the combat loop was
small enough not to matter. With three times the content in it, it matters:

- **`get targets` built a new array on every read** — once per live bolt (16),
  once per swing, once per chain jump, once per storm strike. Twenty to forty
  array allocations a frame, each copying the enemy list and walking every
  prop. Now rebuilt once per frame in place.
- **`Bus.emit` copied its listener array on every emit**, to survive an
  unsubscribe mid-emit. `damage:dealt` fires on every hit of every chain. Now
  copy-on-write in `off()` instead.
- **`Director` filtered the enemy list twice a frame.** Once, in place.
- **Health pips** repainted a canvas and uploaded a texture per enemy per
  frame. Now round-robined, three a frame, and never off-screen.
- **A body budget** — a hard cap on live hostiles that tracks measured frame
  rate, so the new horde stages cannot ask a phone for more than it can
  animate. Refusing a spawn is invisible; deleting a body mid-fight is not.

Measured in a headless Chromium (SwiftShader, so the absolute numbers are
software-rendering numbers — the ratios are what matter): the Lattice draws in
94 calls / 6.2k triangles, the dressed city in 163 calls / 79k triangles, with
every archetype and the Architect on the field and no errors.

---

## 3.1 — models, surfaces, and Part One

### The models

Every character was a stack of `plate()` calls, and `plate()` is a rounded
box. A forearm was a box. A thigh was a box. A head was a box with a smaller
box for a face. At three metres — where the third-person camera actually sits
— you were looking at the seams, and at the gap that opens at every elbow the
moment the joint bends past forty degrees.

`src/350-model.js` replaces them. **Revolve, don't stack:**

- Almost everything on a body is a surface of revolution with a squashed
  cross-section — upper arm, forearm, calf, neck, torso, skull. `LatheGeometry`
  spins a profile, which gives smooth tapered limbs with no seams, correct
  smooth-shaded normals, and real UVs for the textures to land on.
- **A ball at every joint.** A sphere at the shoulder, elbow and knee keeps
  the joint solid at any bend angle. That is the actual fix for the gap, and
  it is what a real character rig does with skinning.
- **Stylised proportions**, in the Fortnite/Overwatch register: head at 1:6.2
  of height rather than a realistic 1:7.5, broad shoulders tapering to a
  narrow waist, limbs that thin from 0.115 to 0.075 down the forearm, and
  deliberately oversized hands and feet.
- **A real face**: revolved skull, chin, cheekbones, nose, ears, eyes set
  *into* the skull rather than stuck on it, brows, a mouth line, a fitted
  hair cap and a fringe that hangs. Plus a blink.
- Open-front jacket with lapels and a stand collar, sleeve cuffs, knee pads
  that wrap, flared boots with a sole and a toe cap, a chunky mitt hand with
  a thumb, and a back unit whose vents flare on a dash.

About 2,400 triangles a character against roughly 600 before, and *fewer*
meshes — 53 against 89 — because the merge below now actually works.

### The textures

Up to 2.4.6 there was not one image in this game. `src/345-texture.js` adds
nine, drawn into canvases at load and shared — under 3 MB of VRAM against the
16 MB one 2048px PBR set would cost. Fabric, denim, leather, brushed panel,
skin, concrete, rust, hazard stripes, and a lit window sheet.

Two delivery paths, because the two kinds of geometry have different needs:

- **Characters** have real UVs, so the maps go on as `map` / `normalMap` /
  `roughnessMap`.
- **Statics** are one merged mesh per material with no useful UVs, so they are
  sampled **triplanar** in the existing shader off `vWPos`. Dominant axis
  only — one texture fetch, not three. Blending is the textbook version and it
  is two extra dependent reads on every covered pixel, for a seam nobody can
  find on a noise texture.

Both drop out entirely below a 0.66 quality scale, which is the next thing to
give up after the scaler has finished trading pixels.

### Part One

`src/370-lore.js` makes the game agree with the comic.

**The Regulator.** The best thing in the source material, and it was already a
mechanic in everything but name — *"It's not what gives you your powers. It
does the opposite."* So it is a real, removable item with numbers on both
sides. Worn: capped charge, ordinary damage, total stability. Off (`J`, or a
row in Settings): **+60% damage, +50% charge, +35% regen** — and a Rage meter
that fills on every hit you take and every kill you land.

**Blackout.** Fill the meter and you are not driving any more. *"He grew
taller. His skin turned completely black. Large claws formed on his hands, and
blue flames erupted around his fists."* All of that, plus 2.6× damage, 45%
more damage taken, no healing, and four seconds on your knees when it ends.

**The cast, to spec.** Kell rebuilt at seven feet in deep light-absorbing
purple with red eyes and ancient armour covered in a generated script that
tiles without repeating. Rex given his long shimmering coat. The **Response
Team** — Flare, Phantom, Brick, Specter, Ace and Commander Pierce — built as
real characters with their own palettes, who fight beside you badly, because
that is the point of them before they learn to work together. The hostiles are
the Syndicate now.

**The book.** Ten codex entries from Part One, unlocked against the story
flags the jobs already set, in a new tab in the pause menu.

### More bugs

| | Symptom |
|---|---|
| **The character merge never merged anything** | `RigOpt.collapse` — the headline of the 2.4.2 pass, credited with taking a character from 89 draw submissions to a handful — reported `merged: 0` on the shipping build. `protect()` walks the rig for named references, finds `rig.j`, descends into it, and marks `j.hips` **with its entire subtree**. Every part of a character is under hips, so the protected set was the whole rig and nothing could ever merge. Only `shadows()` was doing anything. Fixed, and a grunt went from 130 meshes to 53. |
| **Merging dropped UVs** | `mergeGeos` copied position and normal only. Harmless when nothing had a texture; with 3.1 it would have silently undone the entire surface pass on every merged part. |
| **The new sculptor had the same bug** | Written from the same walk, so the strip removed nothing and the new geometry was added *on top of* the old — the character wore both models at once. The white slab where the face should be was the original box mask, in front of the new head the whole time. |
| **Textures blew bright albedo out to white** | three multiplies `map` by `color`, so a greyscale map darkens the material; compensating by 1.9 clips anything bright. Skin at `#e8b988` is 0.91 in red. Every face rendered as a blank white panel. Textures are now normalised to a known mean and the compensation is clamped per channel. |

---

## 3.2 — the models, properly

3.1 rebuilt the characters out of revolved surfaces instead of boxes. 3.2 is
the pass that made them *read*. Almost all of it came from looking at renders
and finding that the thing on screen was not the thing in the code.

### The bug that was making everyone look like cardboard

An open-front jacket is a partial lathe, and a partial lathe needs
`side = DoubleSide` or you can see through it from the inside. Every version
up to this one wrote that flag onto the material the mesh was handed — which
is the rig's *shared* `m.cloth`. One jacket turned every cloth surface on the
character two-sided, and then every lit interior in the rig — the neck hole,
the sleeves, the inside of the torso — rendered through the front of the
character as a blown-out white panel.

That is what the big white slabs on everybody's chest were. `Sculpt.twoSided()`
now returns a cached two-sided *clone*, keyed off the original material, so the
flag lands on the one surface that asked for it and the merge still sees two
materials instead of twenty.

### Layering rails

The other systemic problem was clearance. Shells were being offset by
multipliers — `chR * 1.08` for a jacket over a chest — which lands as four
millimetres on the flanks and eleven at the front, and the two surfaces cross
somewhere in between. The whole torso rendered as diagonal z-fighting hatch,
and so did every arm.

Two rules now hold across the sculptor:

* **One squash per family.** A chest at 0.72 and a jacket at 0.74 are not
  parallel surfaces, they are intersecting ones.
* **Absolute clearances, never multipliers.** A garment clears the body by
  `CLOTH`, a plate clears the garment by `PLATE`, trim clears the plate by
  `TRIM`. If a part cannot afford its clearance it belongs in the profile
  underneath, not as another shell on top.

Applying the second rule collapsed the upper arm from four coaxial surfaces —
a shoulder ball, a limb cylinder, a bicep lathe and a sleeve, all inside a 4mm
band, all shredding each other — down to one lathe whose profile *contains*
the deltoid cap and the bicep. Same for the forearm, the thigh and the shin.

### Faces

Features are now placed against the skull's actual half-width at their own
height, read back out of the profile the head was lathed from. Before, every
feature sat at the head's equator radius regardless of height, so the eyes,
brows and mouth floated on one flat plane in front of a round head.

* The head scale came down from 1.30 to 1.12 — the skull alone used to be a
  fifth of standing height before the hair went on. It lands near 1/6.4 now.
* Cheeks, jaw and brow are *mass*, set deep enough into the skull that only a
  swell of each one clears the surface. At 0.6 of the local half-width they
  read as separate pebbles glued to the face.
* The iris was buried: the eye white's front cap sat 0.02 of an eye-radius
  proud of it, so every character in the game had blank eyes.
* Faces get a finer sphere than knees do (16 segments against 10). They merge
  into one buffer per material anyway.

### Hair

`taper()` is built root-down — it already hangs at zero rotation. Every version
before this pitched the fringe by ~2.9 radians "so it would hang", which
flipped each strand *up* out of the crown. The character shipped four rounds
running with a mohawk of horns and a bald forehead.

The cap also started below the temple line, so it swallowed the eyes and the
brow masses poked back out through it as pale hexagons. There is a real
hairline now, a separate partial lathe carrying the back and sides down past
it, and strands wider than their pitch so the fringe is one mass with cut
edges rather than a row of blades.

### The Response Team

Six people who, until now, were six copies of one silhouette in six colours.
Each one gets a build, a hair style, a skin tone and hair colour: Brick is a
titan, Phantom a runner, Flare and Ace lean, Specter a hooded shade, Pierce
heavy. Their combat archetype still drives how they fight, but `kind` is
cleared off the rig before sculpting so the enemy gear pass stops putting a
riot helm on Monica.

### Silhouettes (`355-silhouette.js`)

Build assignment moved into `makeArchetypeRig` itself — it used to ride on the
`enemy:spawned` event, which only fires from the `Foe` constructor, so half the
spawn paths never got one. Per-archetype gear: the Enforcer's riot helm and
grille, the Swarmer's arm blades, the Lancer's rifle, the Warden's tower
shield, the Brute's hanging pauldron cap and lames, the Stalker's half-cape,
Kell's crown and cannon arm. Plus a per-build idle bias, so a heavy breathes
from the chest and a light one jitters.

### Also

* Torsos and limbs get more sides. The torso is the largest revolved surface
  on screen and the one the key light lands flat on; at the shared segment
  count it read as a folded plank.
* Head-mounted gear authored against the old skull is rebased through one
  scaled group rather than seventeen retuned constants.
* Pauldrons ran to 1.95x the arm radius, which put their outer edge nearly
  twice the torso's own half-width out on each side. They are caps that sit on
  the shoulder now, not wings off it.

---

## 3.3 — smooth

The brief was "clean, not sloppy, smooth like Fortnite". Three things were
making the characters look folded rather than sculpted, and all three were
mechanical rather than a matter of taste.

### Profiles were chains of straight lines

A lathe profile written as seven `[radius, height]` pairs revolves into a
surface with a **crease at every one of those pairs**, because the segments
between them are straight. On a chest that is six hard rings stacked up the
torso, and the eye reads it as panelling.

`smoothProfile()` now runs every profile through a centripetal Catmull-Rom
spline before it is revolved, so each corner becomes a curve and
`computeVertexNormals` has something continuous to average. Centripetal, not
uniform: a uniform spline overshoots at a sharp corner, which on a shoulder
puts the bulge outside the silhouette the profile asked for and at an apex
swings the radius negative and pinches.

Segment counts went up with it — 16 sides on a body shell, 20 on a face, 8
rings on a joint ball. Ten was chosen for a camera across a street; this
game's camera sits two metres behind the player's shoulder, and at that range
you can count sides.

### Every full lathe had an unwelded seam

A 360° lathe duplicates its first column of vertices at the end so the UVs can
run 0..1. `computeVertexNormals` treats the two columns as different vertices,
each averaging only the faces on its own side, and the disagreement draws a
hard crease down the surface. On a head that crease lands **straight down the
middle of the face**. One pass averaging the normals across both columns
removes it everywhere.

### Every open rim was a cut edge

A lathe is an open tube: where the profile stops, the surface stops, and you
see a raw polygon ring edge-on — a hard bright line that reads as torn card.
`rollEnds()` curls the profile inward at each end into a rolled hem, which is
what a real garment or a real plate does anyway. Sleeves, cuffs, pauldrons,
belts, gauntlets, kneepads and the collar all roll now.

### Fewer parts

Smoothing exposed how much of the model was clutter, so the count came down:

* **The upper arm** was a suit form, a sleeve stopping mid-bicep and a
  pauldron cap, each with its own open rim — three nested tongues hanging off
  the shoulder. The sleeve now covers the whole upper arm and the pauldron
  rolls under into it.
* **The hand** was fifteen pieces on something eight centimetres across. It is
  a palm, four bevelled stubs and a thumb.
* **The boot** was a cuff, a foot, a sole, four tread bars, a toe cap, a
  tongue and two lace bars. It is a shaft, a foot, a sole and one trim line.
* **The collarbone bars, the pocket tabs and the three forearm dots** are
  gone. At two metres they read as dirt on the lens.
* **The jacket front** was two lapel plates and a separate collar ring, each
  stopping with a cut end — and the two lapel tops sat under the chin as a
  pair of dark boxes. It is a strip up each side of the opening plus a collar
  that overlaps their tops.

### The face was placed against the wrong surface

Every feature was positioned at the head's **centre-line** depth regardless of
how far off-centre it sat. A head is a surface of revolution: at the eye's x
offset the skull has already fallen away, so an eye at centre-line depth
bulges out as a white golf ball, while the nose and mouth — which really are
on the centre — end up buried inside and vanish. Both were happening at once,
which is why the face read as an egg with two eyes stuck on it.

`szAt(y, x)` solves the cross-section properly. With that fixed, the eye got a
socket, an iris and a pupil, and the mouth and nose came back.

### `taper()` builds its box centred

Which is why hair never worked. A strand anchored at the hairline put **half
of itself above the hairline**, and rotating it just swung both halves — hence
four versions of horns, then a ring of planks standing off the crown. Strands
hang from a root group now, and the fringe itself is one shell following the
skull with three broad locks cut into its lower edge, rather than seven
separate slabs you could count.

### Cost

Roughly four times the triangles on a character, and about 10% *fewer* draw
calls, because there are fewer parts to merge. `Sculpt.lowSpec` puts phones
and anyone on the low quality setting back on the old budget — smoothing off,
9 sides — since the smoothing is the expensive half.

---

## Testing

There is no test harness in the repo — the game is the test — but everything
above was verified by driving the real build in a headless browser: booting,
skipping to the fight, unlocking the full kit, travelling to all seven zones,
running four jobs to completion including hold and survive objectives, spawning
all ten archetypes, taking the Architect from shielded through phase 3, and
round-tripping a save through `localStorage`. Zero console errors.

To repeat it you need a local three.js (the CDN is the only external
dependency) and Playwright; the scripts are not committed because they are
throwaway.

---

## Layout

```
games/hexis/
  hexis.html          the playable single-file build (generated)
  build.mjs           splices src/ into hexis.html
  src/
    300-fix.js        bug pass
    310-kit.js        ability unlocks, touch controls
    320-jobs.js       mission framework + 9 jobs
    330-acts.js       Acts II/III, board, travel, the Architect, the ending
    340-qol.js        pause, log, codex, checkpoints, options
    345-texture.js    procedural textures — nine maps, no downloaded bytes
    350-model.js      the character sculptor: revolved limbs, real faces
    355-silhouette.js per-archetype builds, gear and idle bias
    360-perf.js       allocation pass, body budget, the rig-merge fix
    370-lore.js       Part One: the Regulator, Blackout, the cast, the codex
  stormlink/          the multiplayer build — see its own README
```

Nothing in `games/cosmicon/` or `games/void-arena/` is touched by any of this.
