# HEXIS 3.0 — "Stormbreak"

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
    350-model.js      model and animation pass
    360-perf.js       allocation pass, body budget
  stormlink/          the multiplayer build — see its own README
```

Nothing in `games/cosmicon/` or `games/void-arena/` is touched by any of this.
