# Projectile image assets

Projectile-using classes support one static transparent PNG per type/class. There is no projectile animation system.

Lookup priority:

1. `unit_class/` image for the firing unit class.
2. `generic/` image for the projectile kind.
3. Existing procedural bullet/rocket rendering if no PNG loads.

Use transparent PNGs. A 256 x 256 source canvas is recommended for consistency with the rest of the art pipeline. Projectile artwork should point to the right/east in the source image; the renderer rotates it to match projectile travel direction.

Current projectile classes:

- Rifleman -> bullet projectile.
- Rocketeer -> rocket projectile.
- Captain Vale inherits Rifleman.
- Captain Mercer inherits Rocketeer.
- Shockblade is a melee class and intentionally has **no projectile asset**. Its jump and slash are handled by melee combat logic and animation/effect rendering.
- Captain Thorne is a Shockblade-class melee Captain and intentionally has **no projectile asset**. His two-handed 360-degree sword sweep is handled by melee combat logic and procedural slash effects.

Register new projectile kinds/classes in `src/data/projectiles.js`. Melee-only classes and Captains do not need an entry there.
