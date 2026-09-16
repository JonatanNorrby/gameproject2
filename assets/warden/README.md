# The Warden artwork

This folder is reserved for Boss 1: The Warden.

The runtime has a procedural fallback, so the encounter remains fully playable before final artwork is added.

Expected boss artwork entry point:

- `idle_1.png` — transparent-background top-down Warden body sprite, facing south/down (6 o'clock).

Keep combat-state visuals separate from the body artwork. Do **not** bake the detached red armor plates, exposed-core glow, enrage aura, Charge/Slam/Barrage telegraphs, or other encounter effects into the sprite. Those are rendered independently by the game so the Warden body art can be replaced without changing its mechanics.
