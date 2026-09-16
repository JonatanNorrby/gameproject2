# Frame animation asset framework

Animated game art uses **one PNG file per frame**. Do not use sprite sheets for live unit or enemy animation.

Each standard unit, Captain, or enemy has its own folder directly under `assets/`:

```text
assets/
  rifleman/
  rocketeer/
  shockblade/
  drone_pilot/
  captain_vale/
  captain_mercer/
  captain_thorne/
  crawler/
  runner/
  brute/
  charger/
  spitter/
  burst_spitter/
```

Every standard animated character uses these exact file names:

```text
idle_1.png
running_1.png
running_2.png
idle_shooting_1.png
idle_shooting_2.png
shooting_1.png
shooting_2.png
dead_1.png
```

`idle_1.png` and `dead_1.png` are single-frame states. Running, idle shooting, and moving shooting each use exactly two frames.

## Art requirements

- PNG with transparent background.
- Keep the same canvas dimensions for every frame belonging to one entity.
- Keep the body center at the same pixel position in every frame so animations do not jitter.
- Keep scale consistent between all frames.
- Leave enough transparent padding for weapons/effects that extend beyond the body.
- The game preserves each image's aspect ratio when scaling it.
- Draw source art facing south/down (6 o'clock).
- Idle and idle-shooting are shown facing south/down.
- Running and moving-shooting rotate at runtime to match movement direction.

## Current unit folders

- `rifleman`
- `rocketeer`
- `shockblade`
- `drone_pilot`

## Current Captain folders

- `captain_vale`
- `captain_mercer`
- `captain_thorne`

## Current enemy folders

- `crawler`
- `runner`
- `brute`
- `charger`
- `spitter`
- `burst_spitter`

All current enemies and playable units are registered in `src/data/sprites.js`. Missing images automatically fall back to the game's procedural rendering, so folders can be populated one animation frame at a time.

## Runtime states

- Stationary: `idle_1.png`
- Moving: `running_1.png` / `running_2.png`
- Standing still and attacking: `idle_shooting_1.png` / `idle_shooting_2.png`
- Moving and attacking: `shooting_1.png` / `shooting_2.png`
- Dead: `dead_1.png`

Rifleman / Captain Vale can loop firing frames during their firing window. Rocketeer / Captain Mercer use one non-looping firing cycle per shot. Shockblade and Captain Thorne use non-looping melee attack cycles. Drone Pilot uses shooting frames when issuing a drone attack command.

The Drone Pilot's separate support drone uses `assets/drone_pilot/drone.png` and is drawn independently from the formation.

## Projectile visuals

Projectile asset support has been removed. Bullets, rockets, enemy shots, and other projectiles are rendered procedurally by the game. Do not create an `assets/projectiles/` folder.

## UI portraits

The game reuses each unit's `idle_1.png` for reinforcement cards. Captain selection uses the Captain folder's `idle_1.png`. If an idle portrait is missing, the UI falls back to that entity's `running_1.png` where available.

Missing live animation images fall back to an available frame or procedural rendering while art is being added. Corpse rendering requests `dead_1.png`; if unavailable, the game uses its procedural corpse fallback.

Animation definitions live in `src/data/sprites.js`, with the Drone Pilot's static support-drone art handled by its feature module. Rendering is handled by `src/rendering/FrameAnimationRenderer.js`.
