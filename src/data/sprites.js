// Sprite-sheet definitions are intentionally separate from gameplay balance.
// Add PNGs to assets/spritesheets/ and describe their frame layout here.
// Missing/unloaded sprites automatically fall back to the existing procedural shapes.
export const SPRITE_SHEETS = {
  units: {
    rifleman: {
      src: './assets/spritesheets/rifleman.png',
      columns: 2,
      rows: 6,
      drawWidth: 38,
      drawHeight: 38,
      anchorX: 0.5,
      anchorY: 0.5,
      smoothing: true,
      animations: {
        // Supplied sheet layout: 2 frames per row.
        // 0 running, 1 shooting, 2 light damage, 3 medium damage,
        // 4 heavy damage, 5 dead.
        idle: { row: 0, frames: [0], fps: 1 },
        move: { row: 0, frames: [0, 1], fps: 8 },
        shoot: { row: 1, frames: [0, 1], fps: 10, loop: false },
        damageLight: { row: 2, frames: [0, 1], fps: 8, loop: false },
        damageMedium: { row: 3, frames: [0, 1], fps: 8, loop: false },
        damageHeavy: { row: 4, frames: [0, 1], fps: 8, loop: false },
        dead: { row: 5, frames: [0, 1], fps: 6, loop: false },
      },
    },
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
