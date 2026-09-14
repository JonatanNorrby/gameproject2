# Shockblade animation assets

Shockblade is the melee jump-pack class.

Use the standard 256 x 256 transparent animation-frame workflow and keep the character centered consistently between frames.

Expected files:

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

Art direction:

- Industrial sci-fi infantry with a jump pack.
- Dual laser swords should remain clearly readable at gameplay scale.
- Source orientation is south/down (6 o'clock), matching the other squad classes.
- `shooting_1.png` should read as the forward jump / attack wind-up.
- `shooting_2.png` should read as the laser-sword sweep.
- The attack animation is non-looping per slash.
- The runtime handles the forward lunge, invulnerability window, and half-moon slash effect; do not bake world movement into the frame positioning.
- Reinforcement cards use `idle_1.png` as the full portrait, falling back to `running_1.png`.
- The class badge lives at `assets/icons/unit_class/shockblade.png`.
- Shockblade is melee and intentionally has no projectile image.
