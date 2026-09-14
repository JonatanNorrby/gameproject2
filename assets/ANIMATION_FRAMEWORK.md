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
shooting_1.png
shooting_2.png
dead_1.png
```

`idle_1.png` and `dead_1.png` are single-frame states. Running and shooting each use exactly two frames.

## Art requirements

- PNG with transparent background.
- Keep the same canvas dimensions for every frame belonging to one unit.
- Keep the character's feet/body center at the same pixel position in every frame so animations do not jitter.
- Keep scale consistent between all frames.
- Leave enough transparent padding for weapons/effects that extend beyond the body.
- The game preserves each image's aspect ratio when scaling it.
- **Draw source art facing south/down (6 o'clock).** The game rotates squad sprites at runtime to match the squad's movement direction.
- If a future asset is authored facing a different direction, its sprite definition can override `forwardAngle` rather than requiring new movement-direction images.

Captain art is independent of the base unit class:

- Captain Vale uses `assets/captain_vale/`.
- Captain Mercer uses `assets/captain_mercer/`.
- Normal Riflemen use `assets/rifleman/`.
- Normal Rocketeers use `assets/rocketeer/`.

## Runtime states

- Stationary: displays `idle_1.png` while keeping the squad's last movement-facing direction.
- Moving: alternates `running_1.png` / `running_2.png` and rotates toward the movement vector.
- Firing: plays `shooting_1.png` then `shooting_2.png` while keeping the current squad-facing direction.
- Taking damage: keeps the current idle/running/shooting art and uses the game's red flash, shake, outline, and particles for feedback. No damage-specific PNGs are required.
- Run ended: displays `dead_1.png` using the last facing direction.

Missing animation images fall back to an available running frame while art is being added. If no usable image exists for that character yet, the game falls back to its existing procedural shape.

Animation definitions live in `src/data/sprites.js`. Rendering is handled by `src/rendering/FrameAnimationRenderer.js`.
