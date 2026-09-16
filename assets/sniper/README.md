# Sniper animation assets

Nightfall Protocol loads the Sniper through the standard separate-frame animation system.

Expected transparent PNG files:

- `idle_1.png`
- `running_1.png`
- `running_2.png`
- `idle_shooting_1.png`
- `idle_shooting_2.png`
- `shooting_1.png`
- `shooting_2.png`
- `dead_1.png`

The runtime has procedural fallback rendering when a frame is missing, so gameplay does not depend on the artwork being present.
