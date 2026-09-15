# The Cipher artwork

This folder is reserved for Boss 3: The Cipher.

The encounter intentionally keeps all puzzle mechanics outside the boss artwork. The runtime has a procedural fallback, so the fight works before final art is added.

Expected boss artwork entry point:

- `idle_1.png` — transparent-background top-down Cipher sprite.

Do **not** bake the shield, symbols, glyph zones, sweeping beam, projectile wall, warning circles, puzzle progress, or shield-break effects into the sprite. Those mechanics are rendered independently by the game so future artwork can stay generic and reusable.
