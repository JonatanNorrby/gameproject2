# Broodmother artwork

This folder is reserved for Boss 2: The Broodmother.

Runtime currently supports a procedural fallback, so gameplay does not depend on final artwork being present.

Expected boss artwork entry point:

- `idle_1.png` — transparent-background top-down Broodmother sprite.

The boss mechanics (acid, burrow markers, Surge warning, tail telegraph, eggs, phase effects) are rendered separately from the boss sprite so future artwork does not need bespoke versions for each mechanic.

Egg artwork lives in `./eggs/`.
