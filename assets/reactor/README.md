# The Reactor artwork

This folder is reserved for Boss 4: The Reactor.

The encounter is built so its mechanics do not depend on bespoke boss animation artwork. The runtime has a procedural fallback until final art is added.

Expected boss artwork entry point:

- `idle_1.png` — transparent-background top-down Reactor sprite.

Do **not** bake the four core connections, Blue shield, Reactor Pulse, Ground Overload markers, Core Beam, Reactor Vent, environmental instability, health bars, critical effects, or death explosions into the boss sprite. Those are rendered independently by the game.

Optional core artwork can be added under `./cores/`; procedural core visuals remain the fallback.