# GAR Products

Games by GAR Productions. Browser games are single self-contained HTML files —
no build step, no dependencies, no server. Desktop games are native Python.

## Games

| Game | Status | Description |
|------|--------|-------------|
| [Pocket Colony](games/pocket-colony/) | Desktop | A fan-made ant colony sim. Native pixel-art game — Python + pygame. |
| [Cosmicon](games/cosmicon/) | Later | *Void Collector* RPG prototype. Parked; the page is a placeholder. |

## Layout

```
games/
  index.html            hub page linking every game
  pocket-colony/        native desktop game (Python + pygame)
    main.py             entry point
    pocketcolony/       renderer, art, state, world, ui, scenes, debug
  cosmicon/
    index.html          "later" placeholder
```

## Running

Browser games: open `games/index.html`, or serve the folder with
`python3 -m http.server 8000`.

Pocket Colony:

```sh
cd games/pocket-colony
pip install -r requirements.txt
python3 main.py
```

## Pocket Colony

A native pixel-art ant colony sim, written from scratch — original code and
hand-authored sprite data, bitmap fonts, procedurally synthesised sound, no
third-party assets or engine. Runs on desktop and packages for Android.

You control one ant directly. Forage and fight on the surface, then walk down
the shaft into the nest and move room to room to manage it — the chambers are
places you stand in, not menu entries. Workers follow you and haul food home;
soldiers follow and fight.

In-game menu carries a six-page guide, a bestiary, a fan art gallery, display /
controls / audio / gameplay settings, and the full Terms of Use and Privacy
Policy. The game makes no network connections and stores nothing beyond two
files on your own device.

Ships with a beta tester menu (`F3`): live diagnostics and a frame-time graph,
debug toggles including god mode and noclip, cheats, a 22-case self-test suite,
and an action log.

See [games/pocket-colony/README.md](games/pocket-colony/README.md) for the full
rundown.
