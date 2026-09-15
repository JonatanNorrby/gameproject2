# Gameproject 2 — Nightfall Protocol

A browser-based roguelite survival game inspired by the broad arena-survival formula popularized by games like *Vampire Survivors*.

## Current prototype

- WASD / arrow-key movement
- Touch drag movement
- Automatic combat with ranged and melee squad classes
- Rifleman: rapid ranged bullet fire
- Rocketeer: slower explosive rockets with AoE damage
- Shockblade: jump-pack melee unit that lunges at nearby enemies and cuts a forward half-moon arc while invulnerable
- Multiple enemy archetypes that unlock over time
- Spitter: scarce ranged enemy that keeps its distance and fires very slow, dodgeable acid shots
- XP pickups and level-ups
- Randomized, infinitely repeatable upgrade choices with rarity-based stat bonuses
- Reinforcement upgrades that can introduce new squad classes
- Freeform connected squad formation editing
- Ground powerups with animated Magnet, Nuke, and Fury effects
- Per-unit health, Captain-only run failure, and persistent corpses
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
  features/  Layered gameplay/UI extensions that preserve earlier systems
  utils/     Shared low-level helpers
styles/      Site/game styling
assets/      Character frames, upgrade/class icons, and optional projectile images
```

Unit classes are defined in `src/data/content.js`. When adding a class, also review:

- `src/data/sprites.js` for animation-folder registration.
- `src/data/upgradeIcons.js` for the class badge and upgrade-card mappings.
- `src/data/unitModifiers.js` / Squad Builder stat presentation when the class uses non-standard combat stats.
- `assets/ANIMATION_FRAMEWORK.md`.
- `assets/icons/README.md` and `assets/icons/unit_class/README.md`.
- `assets/projectiles/README.md` if the class fires a projectile, or document explicitly that it does not.

The current classes are `rifleman`, `rocketeer`, and `shockblade`.

New enemies, upgrades, and balance values should normally be added to `src/data/content.js`. Existing gameplay behavior should be extended in the relevant system or feature layer instead of creating versioned or one-off scripts.

Ranged enemies should define their ranged behavior in the enemy data, use a low enough spawn weight and/or `maxActive` cap to remain manageable, and use slow, readable projectiles when the player is expected to dodge them.

## Run locally

Because the game uses ES modules, serve the repository through a local HTTP server instead of opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deployment

The repository includes a GitHub Pages workflow in `.github/workflows/pages.yml`.
