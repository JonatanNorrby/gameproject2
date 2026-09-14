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

Every standard animation has exactly **2 frames** with these exact file names:

```text
running_1.png
running_2.png
shooting_1.png
shooting_2.png
damage_light_1.png
damage_light_2.png
damage_medium_1.png
damage_medium_2.png
damage_heavy_1.png
damage_heavy_2.png
dead_1.png
dead_2.png
```

## Art requirements

- PNG with transparent background.
- Keep the same canvas dimensions for every frame belonging to one unit.
- Keep the character's feet/body center at the same pixel position in every frame so animations do not jitter.
- Keep scale consistent between all frames.
- Leave enough transparent padding for weapons/effects that extend beyond the body.
- The game preserves each image's aspect ratio when scaling it.

There is no separate idle asset requirement. When a unit is standing still, the renderer holds `running_1.png` on its first frame.

## Runtime states

- Moving: alternates `running_1.png` / `running_2.png`.
- Firing: plays `shooting_1.png` then `shooting_2.png`.
- Taking damage above 66% squad HP: plays the light-damage pair.
- Taking damage from 33% to 66% squad HP: plays the medium-damage pair.
- Taking damage below 33% squad HP: plays the heavy-damage pair.
- Run ended: plays `dead_1.png` then `dead_2.png` and holds the second frame.

Animation definitions live in `src/data/sprites.js`. Rendering is handled by `src/rendering/FrameAnimationRenderer.js`. Missing images automatically fall back to the existing procedural game shapes.
