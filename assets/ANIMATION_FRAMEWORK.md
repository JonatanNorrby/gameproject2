# Frame animation asset framework

Animated game art uses **one PNG file per frame**. Do not use sprite sheets.

Each unit, Captain, or enemy gets its own folder directly under `assets/`:

```text
assets/
  rifleman/
  rocketeer/
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
- Idle and idle-shooting are always shown facing south/down and do not rotate with the squad's previous movement vector.
- Running and moving-shooting rotate at runtime to match the squad's movement direction.
- If a future asset is authored facing a different direction, its sprite definition can override `forwardAngle` rather than requiring new movement-direction images.

Captain art is independent of the base unit class:

- Captain Vale uses `assets/captain_vale/`.
- Captain Mercer uses `assets/captain_mercer/`.
- Normal Riflemen use `assets/rifleman/`.
- Normal Rocketeers use `assets/rocketeer/`.

## Runtime states

- Stationary: displays `idle_1.png` facing south.
- Moving: alternates `running_1.png` / `running_2.png` and rotates toward the movement vector.
- Standing still and firing: loops `idle_shooting_1.png` / `idle_shooting_2.png` facing south for a short firing window after each shot.
- Moving and firing: loops `shooting_1.png` / `shooting_2.png` for the same firing window and follows movement direction.
- The firing window lasts longer than the instant projectile spawn so even a single shot visibly repeats the two firing frames and reads as an attack animation.
- Taking damage: keeps the current idle/running/shooting art and uses the game's red flash, shake, outline, and particles for feedback. No damage-specific PNGs are required.
- Unit death: the unit is removed from the live squad, `dead_1.png` is placed at the exact world position where it died, and that corpse remains for the rest of the run.
- Captain death ends the run. Other unit deaths do not.

## UI portraits

The game also reuses each character's `idle_1.png` as static artwork:

- Captain selection uses the selected Captain folder's `idle_1.png`.
- Unit reinforcement upgrades use that unit class folder's `idle_1.png`.
- If `idle_1.png` is not available yet, UI portraits temporarily fall back to the same character's `running_1.png`.

Missing `idle_shooting` frames fall back to normal shooting frames. Other missing live animation images fall back to an available idle/running frame while art is being added. Corpse rendering requests `dead_1.png` strictly; if it is unavailable, the game draws a simple procedural corpse marker instead of showing a living frame.

Animation definitions live in `src/data/sprites.js`. Rendering is handled by `src/rendering/FrameAnimationRenderer.js`.
