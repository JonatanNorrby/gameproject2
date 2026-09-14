# Frame animation asset framework

Animated game art uses **one PNG file per frame**. Do not use sprite sheets.

Each unit, Captain, or enemy gets its own folder directly under `assets/`:

```text
assets/
  rifleman/
  rocketeer/
  shockblade/
  captain_vale/
  captain_mercer/
  crawler/
  runner/
  brute/
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
- Keep the same canvas dimensions for every frame belonging to one unit.
- Keep the character's feet/body center at the same pixel position in every frame so animations do not jitter.
- Keep scale consistent between all frames.
- Leave enough transparent padding for weapons/effects that extend beyond the body.
- The game preserves each image's aspect ratio when scaling it.
- **Draw source art facing south/down (6 o'clock).**
- Idle and normal idle-shooting are shown facing south/down.
- Running and normal moving-shooting rotate at runtime to match the squad's movement direction.
- If a future asset is authored facing a different direction, its sprite definition can override `forwardAngle`.

Captain art is independent of the base unit class:

- Captain Vale uses `assets/captain_vale/`.
- Captain Mercer uses `assets/captain_mercer/`.
- Normal Riflemen use `assets/rifleman/`.
- Normal Rocketeers use `assets/rocketeer/`.
- Shockblades use `assets/shockblade/`.

## Runtime states

- Stationary: displays `idle_1.png` facing south.
- Moving: alternates `running_1.png` / `running_2.png`.
- Standing still and attacking: uses `idle_shooting_1.png` / `idle_shooting_2.png` for ordinary ranged units.
- Moving and attacking: uses `shooting_1.png` / `shooting_2.png`.
- Rifleman / Captain Vale can loop the two firing frames during their firing window.
- Rocketeer / Captain Mercer use one non-looping two-frame firing cycle per shot.
- Shockblade uses one non-looping `shooting_1.png` / `shooting_2.png` cycle for its jump-slash attack. The runtime physically lunges the unit forward and then returns it to its formation slot.
- Taking damage keeps the current animation art and uses the game's red flash, shake, outline, and particles for feedback. No damage-specific PNGs are required.
- Unit death removes the unit from the live squad and places `dead_1.png` at its exact world position for the rest of the run.
- Captain death ends the run. Other unit deaths do not.

### Shockblade art notes

Shockblade is a melee class with laser swords and a jump pack.

- `idle_1.png`: ready stance with both laser swords visible.
- `running_1.png` / `running_2.png`: movement / jump-pack-ready locomotion.
- `shooting_1.png`: jump or wind-up frame.
- `shooting_2.png`: forward laser-sword sweep frame.
- `idle_shooting_*` may mirror the same attack poses for asset consistency, although the current melee runtime uses the moving `shooting` pair during the lunge.
- `dead_1.png`: defeated Shockblade.
- The game renders the half-moon energy slash procedurally, so the character frame does not need to contain the entire slash arc.

## UI portraits

The game reuses each character's `idle_1.png` as static artwork:

- Captain selection uses the selected Captain folder's `idle_1.png`.
- Unit reinforcement upgrades use that unit class folder's `idle_1.png`.
- Shockblade reinforcement therefore reads from `assets/shockblade/idle_1.png`.
- If `idle_1.png` is not available yet, UI portraits temporarily fall back to the same character's `running_1.png`.

Missing `idle_shooting` frames fall back to normal shooting frames. Other missing live animation images fall back to an available idle/running frame while art is being added. Corpse rendering requests `dead_1.png` strictly; if it is unavailable, the game draws a simple procedural corpse marker instead of showing a living frame.

Animation definitions live in `src/data/sprites.js`. Rendering is handled by `src/rendering/FrameAnimationRenderer.js`.
