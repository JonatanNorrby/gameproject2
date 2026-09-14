# Frame animation asset framework

Animated game art uses **one PNG file per frame**. Do not use sprite sheets.

Each unit or enemy gets its own folder directly under `assets/`:

```text
assets/
  rifleman/
  rocketeer/
  crawler/
  runner/
  brute/
```

Every standard unit needs exactly **5 PNG files** with these exact file names:

```text
running_1.png
running_2.png
shooting_1.png
shooting_2.png
dead_1.png
```

## Art requirements

- PNG with transparent background.
- Keep the same canvas dimensions for every frame belonging to one unit.
- Keep the character's feet/body center at the same pixel position in every frame so animations do not jitter.
- Keep scale consistent between all frames.
- Leave enough transparent padding for weapons/effects that extend beyond the body.
- The game preserves each image's aspect ratio when scaling it.
- **Draw unit source art facing up/north (12 o'clock).** The game rotates squad sprites at runtime to match the squad's movement direction.
- If a future asset is authored facing a different direction, its sprite definition can override `forwardAngle` rather than requiring new movement-direction images.

There is no separate idle asset requirement. When a unit is standing still, the renderer holds `running_1.png`. The sprite keeps the squad's last movement-facing direction while stationary.

## Runtime states

- Moving: alternates `running_1.png` / `running_2.png` and rotates toward the movement vector.
- Firing: plays `shooting_1.png` then `shooting_2.png` while keeping the current squad-facing direction.
- Taking damage: keeps the current running/shooting art and uses the game's red flash, shake, outline, and particles for feedback. No damage-specific PNGs are required.
- Run ended: displays `dead_1.png` using the last facing direction.

Animation definitions live in `src/data/sprites.js`. Rendering is handled by `src/rendering/FrameAnimationRenderer.js`. Missing images automatically fall back to the existing procedural game shapes.
