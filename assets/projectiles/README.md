# Projectile image assets

Projectile-using classes support one static transparent PNG per type/class. There is no projectile animation system.

Lookup priority:

1. `unit_class/` image for the firing unit class.
2. `generic/` image for the projectile kind.
3. Procedural rendering if no PNG loads.

Use transparent PNGs. A 256 x 256 source canvas is recommended. Projectile artwork should point right/east in the source image; the renderer rotates it to match travel direction.

Current projectile classes:

- Rifleman -> bullet projectile.
- Rocketeer -> rocket projectile.
- Captain Vale inherits Rifleman projectiles.
- Captain Mercer inherits Rocketeer projectiles; his post-explosion burst rounds are light procedural bullets.
- Anti Air -> accelerating homing `interceptor` projectile used only against hostile incoming projectiles.
- Shockblade and Captain Thorne are melee and use no projectile asset.
- Drone Pilot does not fire a weapon projectile. Its separate drone and stun effect are handled by the support-unit system.

Register new projectile kinds/classes in `src/data/projectiles.js`.
