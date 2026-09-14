# Gameproject 2 — Nightfall Protocol

A browser-based roguelite survival game inspired by the broad arena-survival formula popularized by games like *Vampire Survivors*.

## Current prototype

- WASD / arrow-key movement
- Touch drag movement
- Automatic target acquisition and firing
- Multiple enemy archetypes that unlock over time
- XP pickups and level-ups
- Randomized upgrade choices with ranks
- Health, armor, damage, attack speed, movement, pickup radius, projectile speed, and pierce upgrades
- Endless difficulty scaling
- Death / restart loop
- Responsive canvas UI

## Architecture

The project is intentionally modular without turning every feature into a new script:

```text
src/
  core/      Game lifecycle, input, UI, entity storage
  systems/   Larger gameplay domains (combat, spawning, progression)
  data/      Data-driven content and balance definitions
  utils/     Shared low-level helpers
styles/      Site/game styling
```

New enemies, upgrades, and balance values should normally be added to `src/data/content.js`. Existing gameplay behavior should be extended in the relevant system instead of creating versioned or one-off scripts.

## Run locally

Because the game uses ES modules, serve the repository through a local HTTP server instead of opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deployment

The repository includes a GitHub Pages workflow in `.github/workflows/pages.yml`.
