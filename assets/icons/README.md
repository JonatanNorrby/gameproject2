# Upgrade and class icon assets

Stat upgrade cards use two layered icon types:

- `upgrade_generic/` contains one reusable icon for what a stat upgrade does.
- `unit_class/` contains one badge icon for the class the upgrade belongs to.

Reinforcement cards use the full unit portrait from the normal sprite assets plus the same `unit_class/` badge. They do not use a generic reinforcement icon.

Use transparent PNGs on a 256 x 256 source canvas. Keep the important artwork centered with generous padding because the UI scales these files down significantly.

The UI has text fallbacks, so missing PNGs do not break upgrade cards.

Expected generic stat-upgrade files:

- `upgrade_generic/damage.png`
- `upgrade_generic/fire_rate.png`
- `upgrade_generic/range.png`
- `upgrade_generic/projectile_speed.png`
- `upgrade_generic/pierce.png`
- `upgrade_generic/blast_radius.png`

Expected class badge files:

- `unit_class/rifleman.png`
- `unit_class/rocketeer.png`
- `unit_class/shockblade.png`
- `unit_class/drone_pilot.png`

Drone Pilot currently uses fire-rate, range, and blast-radius icons for stun-grenade cadence, drone operating range, and stun radius.

When adding a new upgrade or class, register its icon key/path in `src/data/upgradeIcons.js`.
