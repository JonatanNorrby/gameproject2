# Projectile image assets

Projectiles support one static transparent PNG per type/class. There is no projectile animation system.

Lookup priority:

1. `unit_class/` image for the firing unit class.
2. `generic/` image for the projectile kind.
3. Existing procedural bullet/rocket rendering if no PNG loads.

Use transparent PNGs. A 256 x 256 source canvas is recommended for consistency with the rest of the art pipeline. The projectile artwork should point to the right/east in the source image; the renderer rotates it to match projectile travel direction.

Captains currently inherit the projectile image of their underlying class, so Captain Vale uses the Rifleman projectile and Captain Mercer uses the Rocketeer projectile.

Register new projectile kinds/classes in `src/data/projectiles.js`.
