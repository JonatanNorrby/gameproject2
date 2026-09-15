# Stormlancer artwork

This folder is reserved for the Stormlancer lightning-spear unit.

Use the standard Nightfall Protocol animation-frame convention with transparent-background artwork:

- `idle_1.png`
- `running_1.png`
- `running_2.png`
- `idle_shooting_1.png`
- `idle_shooting_2.png`
- `shooting_1.png`
- `shooting_2.png`
- `dead_1.png`

The source artwork should follow the normal top-down squad-unit orientation used by the other standard unit classes. The runtime provides procedural/unit-color fallback rendering until these files exist.

Lightning arcs are rendered separately by the game, so the unit artwork does not need baked-in lightning effects.
