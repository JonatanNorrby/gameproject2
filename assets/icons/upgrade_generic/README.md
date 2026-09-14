# Generic upgrade icons

Drop transparent 256 x 256 PNGs here. Filenames are stable and are referenced by `src/data/upgradeIcons.js`.

Current generic stat-upgrade files expected by the game:

- `damage.png`
- `fire_rate.png`
- `range.png`
- `projectile_speed.png`
- `pierce.png`
- `blast_radius.png`

These icons describe the stat effect only and are shared across classes.

Shockblade reuses `damage.png`, `fire_rate.png`, `range.png`, and `blast_radius.png`; no melee-only generic icon is required.

Reinforcement cards do not use a generic icon. They use the full unit portrait plus the class badge from `../unit_class/`.
