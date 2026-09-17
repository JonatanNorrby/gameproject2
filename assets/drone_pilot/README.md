# Drone Pilot assets

Drone Pilot is a low-HP support squad class.

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

Additional required support artwork:

```text
drone.png
```

Asset rules:

- 256 x 256 transparent PNG source canvases are recommended.
- Pilot source art faces south/down like other squad classes.
- `idle_1.png` is reused as the reinforcement-card portrait.
- `drone.png` is a single static transparent image, not an animation.
- The drone is drawn independently on the battlefield and is not part of the Squad Builder.
- The drone has its own HP and can be shot by ranged enemies.
- Explosive-grenade blast effects are procedural and should not be baked into the drone image.
