# Pocket Colony

A fan-made ant colony sim. Native game — Python + pygame, no browser, no HTML.
Every pixel is drawn by the game: the fonts are bitmap data, the sprites are
hand-authored pixel art, the sound effects are synthesised at load, and the
entire UI is rendered onto a 224×400 framebuffer scaled up by a whole number.

## Running it

### Standalone binary — nothing to install

Grab the build for your platform from the repository's Releases, unpack it,
and run it. Python and pygame are inside the file; there is nothing else to
set up.

| | |
|---|---|
| Windows | `PocketColony.exe` — double-click |
| macOS | `PocketColony.app` — double-click (right-click → Open the first time, since it is unsigned) |
| Linux | `chmod +x PocketColony` then `./PocketColony` |

### From source

```sh
pip install -r requirements.txt
python3 main.py
```

### Building your own binary

```sh
packaging/build.sh          # Linux and macOS
packaging\build.bat         # Windows
```

Both wrap `pyinstaller PocketColony.spec`, which produces a single ~14 MB
executable (a `.app` bundle on macOS). A binary only runs on the OS and CPU it
was built on, so `.github/workflows/build-pocket-colony.yml` builds all three
on their own runners — push a tag like `pc-v0.3.0`, or start it by hand from
the Actions tab. The Linux runner is pinned to Ubuntu 22.04 so its output also
works on older distributions, and it smoke-tests the binary before uploading.

The app icon is generated from the game's own sprites by
`tools/make_icon.py`, which writes `packaging/icon.png`, `icon.ico` and the
`icon.iconset` folder macOS turns into an `.icns`.

### Android

```sh
pip install buildozer
buildozer -v android debug        # APK lands in bin/
```

`buildozer.spec` is set up for portrait, fullscreen, arm64 + armv7. Touch is
handled through SDL finger events, so the stick and the buttons work at the
same time — you can steer and bite with two thumbs.

## Controls

| | |
|---|---|
| Move | `WASD` / arrows, or drag the on-screen stick |
| Bite | `SPACE` / `J`, or the BITE button |
| Use / enter | `E` / `RETURN`, or tap the prompt |
| Menu | `ESC`, or the gear icon |
| Beta tester menu | `F3` |
| Fullscreen | `F11` |

The stick can be moved to either side of the screen, resized, and its deadzone
tuned, in Settings → Controls.

## How it plays

You control one ant directly. Two zones:

- **Surface** — open ground. Forage leaves, seeds, sand and meat; milk aphids
  for honeydew; fight beetles, wasps, spiders, termites and grubs. Three bug
  nests spawn defenders and can be destroyed for a loot burst (they rebuild
  after a couple of minutes). Your workers follow you and haul food back to the
  mound on their own; your soldiers follow and fight.
- **Colony** — walk down the entrance shaft into the nest and move room to
  room. Each chamber is a place you stand in, not a menu entry:

| Chamber | What it does |
|---|---|
| Royal Chamber | The queen lays eggs, eating leaf and meat |
| Nursery | Egg capacity, and where you hatch workers or soldiers |
| Storeroom | Raises the cap on every resource |
| Tunnel Network | Bag size, move speed, worker cap |
| Barracks | Soldier cap, soldier attack, and your own bite and health |
| Aphid Farm | Passive honeydew |

Walking into the colony banks whatever you are carrying. Dying drops half your
load and drags you home — no run is ever lost outright.

Progress saves automatically to your user data directory. Time away is paid out
on load, capped at 8 hours.

## Menu

The gear icon (or `ESC`) opens:

- **How to play** — a six-page illustrated guide.
- **Bestiary** — every creature with its stats, drawn from the live tables.
- **Fan art** — a gallery of submitted pieces.
- **Display** — pixel scale, fullscreen, FPS counter, scanline overlay.
- **Controls** — stick side, size, deadzone, touch button policy, key list.
- **Audio** — effects on/off, volume, a test button, device status.
- **Gameplay** — screen shake, damage numbers, hints, autosave.
- **Terms of Use** and **Privacy Policy** — the full text, in game.
- **Credits**, **Beta tester menu**, and **Save and data**.

## Beta tester menu

`F3`, or from the menu. Five tabs:

- **DIAG** — FPS, frame-time graph, entity counts, camera and player position,
  live colony state, save size, and Python/pygame/SDL versions.
- **TOGGLE** — hitboxes, target lines, tile grid, FPS overlay, god mode,
  noclip, freeze spawns, and a sim-speed multiplier (stop / 1× / 2× / 5×).
- **CHEAT** — grant resources, fill the nursery, level or max chambers, spawn
  ants and enemies, teleport between zones, force a save, wipe and restart.
- **TEST** — 22 assertions over the save format, settings persistence, resource
  caps, the queen's costs, hatch gating, upgrade pricing, sprite and
  rotation-ring integrity, colony connectivity, spawn walkability, roster sync,
  sound recipes, text that must fit the panel width, that every menu entry has
  a screen behind it, that the fan art renders, and that the touch controls
  land on screen.
- **LOG** — a timestamped trail of what the menu did.

## Privacy

The game makes no network connections of any kind. No accounts, no analytics,
no telemetry, no ads. Two files are written to your own device — `save.json`
and `settings.json` — and nothing else is stored anywhere. The full policy is
readable in game under Menu → Privacy Policy.

## Layout

```
main.py                 window, integer scaling, keyboard/mouse/touch, main loop
PocketColony.spec       PyInstaller build for Windows, macOS and Linux
buildozer.spec          Android packaging
packaging/              build scripts and the app icon
tools/make_icon.py      regenerates the icon from the game's sprites
pocketcolony/
  pixel.py              framebuffer, 5x7 and 4x6 bitmap fonts, primitives
  art.py                sprite pixel data, palettes, outline + rotation baking
  save.py               colony state, tuning curves, persistence (no pygame)
  settings.py           player preferences, persisted separately
  sfx.py                procedurally synthesised sound effects
  content.py            guide, terms, privacy policy, credits, word wrapping
  fanart.py             the fan art gallery pieces
  world.py              tile maps, entities, simulation, world rendering
  ui.py                 immediate-mode widget kit, HUD, touch pad
  menus.py              settings and information screens
  scenes.py             boot sequence, title, play, chamber panels
  debug.py              beta tester menu and the self-test suite
```

`save.py`, `settings.py` and `content.py` deliberately have no pygame import,
which is what lets the self-tests exercise the rules and the text directly.

## Art notes

Sprites are authored as strings of palette indices and validated at bake time —
a ragged row or an unknown colour raises rather than rendering wrong. Creatures
and items get a 1px dark rim generated automatically, which is what lets them
read against grass and soil alike; legs are drawn attached to the body, because
anything with a gap under 3px closes up once the rim is added.

Terrain is built from small pre-generated noise tilesets rather than per-pixel
work, with dithered region boundaries so meadows and bare earth blend instead of
snapping to a grid. Colony floors are tinted per chamber.

## Fan project

Inspired by mobile ant-colony sims. All code and art are original and written
from scratch — no third-party assets, no ripped sprites, no engine. Not
affiliated with, endorsed by, or containing content from any commercial game
or its publisher.
