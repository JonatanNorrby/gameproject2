# Captain Thorne animation assets

Captain Thorne uses the standard one-frame-per-file character animation contract.

Expected files:

```text
idle_1.png
running_1.png
running_2.png
idle_shooting_1.png
idle_shooting_2.png
shooting_1.png
shooting_2.png
dead_1.png
```

Art direction:

- Bulky, heavily armored melee Captain.
- Carries one oversized two-handed power / laser sword.
- Source art faces south/down (6 o'clock), matching the standard animation framework.
- `shooting_1.png` should read as a heavy wind-up.
- `shooting_2.png` should read as the full-body 360-degree sword sweep.
- Thorne does not use a jump pack or projectile asset.
- Leave generous transparent padding around the sword because the attack silhouette is much wider than normal units.
- The runtime renders the 360-degree slash effect procedurally; the PNG only needs the character/sword pose.

Captain selection uses `idle_1.png` as Thorne's portrait and falls back to `running_1.png` while art is incomplete.

Recommended source size: 256 x 256 transparent PNG, consistent across all frames.
