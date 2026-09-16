import { CAPTAINS } from './content.js';
import { FRAME_SPRITES, createStandardFrameSet } from './sprites.js';

export const SUPREME_COMMANDER_ID = 'supreme_commander';

export const SUPREME_COMMANDER = Object.freeze({
  id: SUPREME_COMMANDER_ID,
  name: 'Supreme Commander',
  role: 'Apex Commander',
  unitType: 'rifleman',
  maxHp: 100,
  shortLabel: 'SUP',
  color: '#f7d774',
  description: 'A final-run commander who absorbs every recruited unit into one battlefield body while retaining their combat systems and upgrades.',
  passiveText: 'Absorbed units fight through the Supreme Commander. All Captain passives ignore adjacency, and all attacks gain +100% base attack speed.',
  effect: Object.freeze({
    type: 'supreme-command',
    attackSpeedMultiplier: 2,
  }),
});

if (!CAPTAINS[SUPREME_COMMANDER_ID]) {
  CAPTAINS[SUPREME_COMMANDER_ID] = SUPREME_COMMANDER;
}

// The artwork is intentionally rendered at roughly twice the normal Captain
// size. Collision continues to use the normal soldier hitbox from GAME_BALANCE.
if (!FRAME_SPRITES.captains[SUPREME_COMMANDER_ID]) {
  FRAME_SPRITES.captains[SUPREME_COMMANDER_ID] = createStandardFrameSet('supreme_commander', {
    drawSize: 88,
    shootingFps: 8,
    shootingLoop: false,
  });
}
