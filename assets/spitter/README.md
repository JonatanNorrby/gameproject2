# Spitter animation assets

Spitter is the scarce ranged enemy that stays away from the squad and fires slow, dodgeable acid shots.

Use the standard transparent frame workflow from `assets/ANIMATION_FRAMEWORK.md`.

Recommended files:

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

Current runtime notes:

- Living Spitters currently use the `running` animation while moving or holding range.
- Firing timing is handled by gameplay code; the acid projectile is drawn procedurally and should not be baked into the character frames.
- Keep the silhouette readable and visually distinct from Crawler, Runner, and Brute enemies.
- Source art should face south/down and use a transparent background.
