# Pocket Colony

A fan-made ant colony sim. Native desktop game — Python + pygame, no browser,
no HTML. Every pixel is drawn by the game: the fonts are bitmap data, the
sprites are hand-authored pixel art, and the entire UI is rendered onto a
200x356 framebuffer that gets scaled up by a whole number.

## Running it

```sh
pip install -r requirements.txt
python3 main.py
```

## Controls

| | |
|---|---|
| Move | `WASD` / arrows, or drag the on-screen stick |
| Bite | `SPACE` / `J`, or the BITE button |
| Use / enter | `E` / `RETURN`, or the prompt button |
| Menu | `ESC` |
| Beta tester menu | `F3` |
| Fullscreen | `F11` |

## How it plays

You control one ant directly. Two zones:

- **Surface** — open ground. Forage leaves, seeds, sand and meat; milk aphids
  for honeydew; fight beetles, wasps, spiders, termites and grubs. Three bug
  nests spawn defenders and can be destroyed for a loot burst (they rebuild
  after a while). Your workers follow you and haul food back to the mound on
  their own; your soldiers follow and fight.
- **Colony** — walk down the entrance shaft into the nest and move room to
  room. Each chamber is a place you stand in, not a menu entry:

| Chamber | What it does |
|---|---|
| Royal Chamber | The queen lays eggs, eating leaf and meat |
| Nursery | Egg capacity, and where you hatch workers or soldiers |
| Storeroom | Raises the cap on every resource |
| Tunnel Network | Carry capacity, move speed, worker cap |
| Barracks | Soldier cap, soldier attack, and your own bite and health |
| Aphid Farm | Passive honeydew |

Walking into the colony deposits whatever you are carrying. Dying drops half
your load and drags you home — no run is ever lost outright.

Progress saves automatically to your user data directory
(`~/.local/share/pocket-colony/save.json` on Linux). Time away is paid out on
load, capped at 8 hours.

## Beta tester menu

`F3`, or from the pause menu. Five tabs:

- **DIAG** — FPS, frame-time graph, entity counts, camera and player position,
  live colony state, save size, and Python/pygame/SDL versions.
- **TOGGLE** — hitboxes, target lines, tile grid, FPS overlay, god mode,
  noclip, freeze spawns, and a sim-speed multiplier (stop / 1x / 2x / 5x).
- **CHEAT** — grant resources, fill the nursery, level or max chambers, spawn
  ants and enemies, teleport between zones, force a save, wipe and restart.
- **TEST** — runs 15 assertions over the save format, resource caps, the queen's
  costs, hatch gating, upgrade pricing, sprite and rotation-ring integrity,
  colony connectivity, spawn walkability and roster sync.
- **LOG** — a timestamped trail of what the menu did.

## Layout

```
main.py                 window, integer scaling, input, main loop
pocketcolony/
  pixel.py              framebuffer, 5x7 and 4x6 bitmap fonts, primitives
  art.py                sprite pixel data, palettes, outline + rotation baking
  save.py               colony state, tuning curves, persistence (no pygame)
  world.py              tile maps, entities, simulation, world rendering
  ui.py                 immediate-mode widgets, HUD, touch pad
  scenes.py             boot sequence, title, play, chamber panels, pause
  debug.py              beta tester menu and the self-test suite
```

`save.py` deliberately has no pygame import, which is what lets the self-tests
exercise the rules directly.

## Fan project

Inspired by mobile ant-colony sims. All code and art are original and written
from scratch — no third-party assets, no ripped sprites, no engine. Not
affiliated with, endorsed by, or containing content from any commercial game
or its publisher.
