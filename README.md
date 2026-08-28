# GAR Products

Free browser games by GAR Productions. Every game is a single self-contained
HTML file — no build step, no dependencies, no server. Open it and it runs.

## Games

| Game | Status | Description |
|------|--------|-------------|
| [Pocket Colony](games/pocket-colony/) | Playable | A fan-made ant colony simulator — forage, hatch, build, raid. |
| [Cosmicon](games/cosmicon/) | Later | *Void Collector* RPG prototype. Parked; the page is a placeholder. |

## Layout

```
games/
  index.html            hub page linking every game
  pocket-colony/
    index.html          the whole game (markup, CSS, JS, art)
  cosmicon/
    index.html          "later" placeholder
```

## Running locally

Open `games/index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/games/
```

Saves live in `localStorage`, per browser. Clearing site data wipes progress.

## Pocket Colony

A colony sim inspired by mobile ant games, written from scratch — original
code and canvas-drawn art, no third-party assets or libraries. Not affiliated
with, endorsed by, or containing content from any commercial game.

Three loops feed each other:

- **Field** — workers forage on a live canvas sim. Tap the ground to drop a
  pheromone trail and pull the swarm to a spot. Soldiers patrol the mound and
  fight off intruders that wander in.
- **Nest** — the queen eats leaves and lays eggs. Hatch them into workers or
  soldiers, and spend sand on chambers that raise your caps and rates.
- **Raid** — send soldiers at rival camps for loot. Losses are permanent, and
  a losing party is wiped out.

The economy runs on wall-clock time, so it keeps ticking with the tab in the
background, and credits progress for time away (capped at 8 hours).
