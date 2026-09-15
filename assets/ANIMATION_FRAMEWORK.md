# Frame animation asset framework

Animated game art uses **one PNG file per frame**. Do not use sprite sheets.

Each standard unit, Captain, or enemy gets its own folder directly under `assets/`:

```text
assets/
  rifleman/
  rocketeer/
  shockblade/
  drone_pilot/
  anti_air/
  captain_vale/
  captain_mercer/
  captain_thorne/
  crawler/
  runner/
  brute/
  spitter/
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

Captain art is independent of the base unit class. Unit folders currently include `rifleman`, `rocketeer`, `shockblade`, `drone_pilot`, and `anti_air`. Captain folders are `captain_vale`, `captain_mercer`, and `captain_thorne`.

Enemy art follows the same one-frame-per-file structure. The current enemy folders are `crawler`, `runner`, `brute`, and `spitter`.

## Runtime states

- Stationary: displays `idle_1.png` facing south.
- Moving: alternates `running_1.png` / `running_2.png`.
- Standing still and attacking: uses `idle_shooting_1.png` / `idle_shooting_2.png`.
- Moving and attacking: uses `shooting_1.png` / `shooting_2.png`.
- Rifleman / Captain Vale can loop firing frames during their firing window.
- Rocketeer / Captain Mercer use one non-looping firing cycle per shot.
- Shockblade uses one non-looping attack cycle for its jump-slash.
- Captain Thorne uses one slow non-looping cycle for his two-handed 360-degree sweep.
- Drone Pilot uses its shooting frames when issuing a stun-drone attack command; the separate drone itself uses one static `drone.png` and is not a standard character animation.
- Anti Air uses its shooting frames when launching an interceptor. Because the unit spans two horizontal formation hexes, keep the chassis centered on a wide transparent canvas.
- Taking damage keeps the current animation art and flashes that specific artwork red with partial opacity. No damage-specific PNGs are required.
- Unit death removes the unit from the live squad and leaves `dead_1.png` at its world position.

### Shockblade art notes

Shockblade is a melee class with laser swords and a jump pack. `shooting_1.png` is the jump/wind-up and `shooting_2.png` is the slash. The runtime renders the energy arc procedurally.

### Drone Pilot art notes

- Standard pilot character frames live in `assets/drone_pilot/`.
- `idle_1.png` is also used for reinforcement portraits.
- Add one extra static transparent file named `drone.png` for the battlefield support drone.
- The drone is drawn independently of formation positions and has its own HP.
- Stun grenade/explosion visuals are procedural; do not bake them into `drone.png`.

### Anti Air art notes

- Standard frames live in `assets/anti_air/`.
- The runtime centers the artwork between two horizontal formation hexes.
- Draw the vehicle/platform wide enough to visually occupy both spaces while keeping transparent padding.
- The interceptor itself belongs in the projectile asset system, not in the unit animation frames.

### Captain Thorne art notes

Thorne is a large armored melee Captain carrying one oversized two-handed sword. Leave extra transparent padding around the weapon; the full energy arc is procedural.

### Spitter art notes

Spitter is the scarce ranged enemy. Its slow acid projectile is rendered separately, so do not bake the projectile into the character art.

## UI portraits

The game reuses each unit's `idle_1.png` for reinforcement cards. Captain selection uses the Captain folder's `idle_1.png`. If an idle portrait is missing, the UI falls back to the same character's `running_1.png`.

Missing live animation images fall back to an available idle/running frame while art is being added. Corpse rendering requests `dead_1.png` strictly; if unavailable, the game draws a procedural corpse marker.

Animation definitions live in `src/data/sprites.js` plus feature-specific static support art. Rendering is handled by `src/rendering/FrameAnimationRenderer.js`.
