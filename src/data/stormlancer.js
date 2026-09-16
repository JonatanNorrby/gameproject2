import { UNIT_CLASSES, UPGRADES } from './content.js';
import { FRAME_SPRITES, createStandardFrameSet } from './sprites.js';

export const STORMLANCER_TYPE = 'stormlancer';

if (!UNIT_CLASSES[STORMLANCER_TYPE]) {
  UNIT_CLASSES[STORMLANCER_TYPE] = {
    id: STORMLANCER_TYPE,
    label: 'Stormlancer',
    shortLabel: 'STM',
    maxHp: 100,
    fill: '#76ddff',
    core: '#182c57',
    outline: '#d4f6ff',
    weapon: {
      kind: 'melee',
      damage: 52,
      cooldown: 1.45,
      projectileSpeed: 0,
      projectileRadius: 0,
      projectileLife: 0,
      pierce: 1,
      range: 112,
      aoeRadius: 120,
      lungeDistance: 62,
      attackDuration: 0.34,
      hitTime: 0.17,
      chainTargets: 4,
      chainDamageMultiplier: 0.82,
      color: '#72e9ff',
    },
  };
}

if (!FRAME_SPRITES.units[STORMLANCER_TYPE]) {
  FRAME_SPRITES.units[STORMLANCER_TYPE] = createStandardFrameSet('stormlancer', {
    drawSize: 46,
    shootingLoop: false,
  });
}

function addUpgrade(upgrade) {
  if (UPGRADES.some((candidate) => candidate.id === upgrade.id)) return;
  UPGRADES.push(upgrade);
}

// Recruitment stays Stormlancer-specific. Damage/rate/range/area progression is
// provided by the shared Shockblade-class stat upgrades in content.js.
addUpgrade({
  id: 'stormlancer-reinforcements',
  name: 'Stormlancer Reinforcement',
  tag: 'Shockblade Class',
  kind: 'reinforcement',
  stat: 'unitCount',
  maxRank: 5,
  unitType: STORMLANCER_TYPE,
  rarityIds: ['rare', 'epic'],
  describe(rarity) {
    const amount = rarity.id === 'epic' ? 2 : 1;
    return `Recruit ${amount} Stormlancer${amount === 1 ? '' : 's'} into the squad.`;
  },
  apply(game, rarity) {
    game.addSquadUnits(STORMLANCER_TYPE, rarity.id === 'epic' ? 2 : 1);
  },
});
