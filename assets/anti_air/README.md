# Anti Air assets

Anti Air is a two-hex support squad class that only destroys incoming hostile projectiles.

Standard character animation files:

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

Asset rules:

- 256 x 256 transparent PNG source canvases are recommended, but the visible chassis should be wider than ordinary units.
- The runtime centers the unit artwork between two horizontal hexes; both spaces count as the unit's damage hitbox.
- Source art faces south/down like other squad classes.
- `idle_1.png` is reused as the reinforcement-card portrait.
- Shooting frames should show the interceptor launcher firing, not the interceptor already in flight.
- The optional projectile image belongs at `assets/projectiles/unit_class/anti_air.png`, with `assets/projectiles/generic/interceptor.png` as its fallback.
- Interceptor art is one static image and should face right/east so runtime rotation works correctly.
