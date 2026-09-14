// Sprite-sheet definitions are intentionally separate from gameplay balance.
// Add the PNG to assets/spritesheets/ and replace the relevant null entry
// with frame metadata. Missing/unloaded sprites automatically fall back to
// the existing procedural shapes.
export const SPRITE_SHEETS = {
  units: {
    rifleman: null,
    rocketeer: null,
  },
  captains: {
    mercer: null,
    vale: null,
  },
  enemies: {
    crawler: null,
    runner: null,
    brute: null,
  },
};

export function getSquadSprite(unit) {
  if (!unit) return null;
  if (unit.captainId && SPRITE_SHEETS.captains[unit.captainId]) {
    return SPRITE_SHEETS.captains[unit.captainId];
  }
  return SPRITE_SHEETS.units[unit.type] ?? null;
}

export function getEnemySprite(enemyType) {
  return SPRITE_SHEETS.enemies[enemyType] ?? null;
}
