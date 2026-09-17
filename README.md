# Gameproject 2 — Nightfall Protocol

A browser-based roguelite survival game inspired by the broad arena-survival formula popularized by games like *Vampire Survivors*.

## Current prototype

- WASD / arrow-key movement
- Touch drag movement
- Automatic combat with ranged, melee, and support squad classes
- Rifleman: automatic bullet fire with pierce upgrades
- Rocketeer: slower explosive rockets with AoE damage
- Shockblade: jump-pack melee unit that lunges at nearby enemies and cuts a forward half-moon arc while invulnerable
- Drone Pilot: low-HP support unit that operates a separate battlefield drone; the drone uses Rocketeer-style targeting and drops orange explosive grenades beneath itself
- Captain Vale: Coordinated Fire commander; Vale and adjacent Riflemen build Focus on sustained same-target fire, and Vale fires three-round bursts
- Captain Mercer: Chain Reaction commander; Mercer and adjacent Rocketeers mark enemies for heavy-warhead cascades, while Mercer's own rockets scatter light burst rounds
- Captain Thorne: heavily armored Shockblade-class melee Captain with a slow 360-degree greatsword sweep, lifesteal, and every-fifth-attack 360-degree Shockblade support
- Multiple enemy archetypes that unlock over time, with fragile Runners and ranged Spitter pressure becoming more prominent as a run develops
- Spitter and Burst Spitter: capped ranged enemies that keep their distance and pressure the squad with dodgeable projectiles
- Boss 2 — The Broodmother: 25,200 HP with stronger Acid, Tail Sweep, and Lunge attacks
- XP pickups and level-ups
- Randomized, infinitely repeatable upgrade choices with rarity-based stat bonuses
- Reinforcement upgrades that can introduce new squad classes
- Freeform connected squad formation editing
- Ground powerups with animated Magnet, Nuke, and Fury effects
- Shared Squad Health pool that grows by 10% for every additional squad member; combat damage no longer injures or kills individual squad units
- Enemy damage feedback uses a lightweight red halo behind damaged sprites without per-hit Canvas blur/filter effects
- Endless difficulty scaling
- Death / return-to-menu loop
- Responsive canvas UI

## Architecture

```text
src/
  core/      Game lifecycle, input, UI, entity storage
  systems/   Larger gameplay domains (combat, spawning, progression)
  data/      Data-driven content, balance definitions, and specialized unit data
  features/  Layered gameplay/UI extensions that preserve earlier systems
  utils/     Shared low-level helpers
styles/      Site/game styling
assets/      Character frames, upgrade/class icons, and optional projectile images
```

Core unit classes are defined in `src/data/content.js`. Specialized support-class definitions and upgrades live in `src/data/supportUnits.js`. When adding a class, review all of the following:

- `src/data/sprites.js` for animation-folder registration.
- `src/data/upgradeIcons.js` for the class badge and upgrade-card mappings.
- `src/data/unitModifiers.js` / Squad Builder stat presentation when the class uses non-standard combat stats.
- `assets/ANIMATION_FRAMEWORK.md`.
- `assets/icons/README.md` and `assets/icons/unit_class/README.md`.
- A purposeful README inside the class's own `assets/<class>/` folder so Git tracks the asset contract before PNGs exist.

The current classes are `rifleman`, `rocketeer`, `shockblade`, `stormlancer`, and `drone_pilot`.

Drone Pilot owns one battlefield drone per living pilot. Drones are not squad units, do not occupy formation hexes, have independent HP, and can be targeted by ranged enemies.

Captains normally build on a unit class. Captain-specific combat behavior lives in feature layers while still reusing that class's stat-upgrade modifiers.

New enemies, upgrades, and balance values should normally be added to the relevant data module. Existing gameplay behavior should be extended in the relevant system or feature layer instead of replacing unrelated systems.

Ranged enemies should define their ranged behavior in enemy data, use a low enough spawn weight and/or `maxActive` cap to remain manageable, and use slow, readable projectiles when the player is expected to dodge them.

## Run locally

Because the game uses ES modules, serve the repository through a local HTTP server instead of opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deployment

The repository includes a GitHub Pages workflow in `.github/workflows/pages.yml`.
