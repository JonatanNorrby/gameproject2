import { UNIT_CLASSES, UPGRADES } from './content.js';

export const SUPPORT_UNIT_IDS = Object.freeze({
  dronePilot: 'drone_pilot',
});

export const SUPPORT_UNIT_DEFINITIONS = Object.freeze({
  drone_pilot: Object.freeze({
    id: 'drone_pilot',
    label: 'Drone Pilot',
    shortLabel: 'DRN',
    maxHp: 60,
    fill: '#75d8ff',
    core: '#163044',
    outline: '#c6f2ff',
    weapon: Object.freeze({
      kind: 'support',
      damage: 0,
      cooldown: 4.6,
      projectileSpeed: 0,
      projectileRadius: 0,
      projectileLife: 0,
      pierce: 0,
      range: 0,
      aoeRadius: 0,
      color: '#79e7ff',
    }),
    support: Object.freeze({
      kind: 'drone',
      range: 620,
      cooldown: 4.6,
      aoeRadius: 82,
      stunDuration: 1,
      recentStunLockout: 3,
      droneHp: 34,
      droneRadius: 10,
      droneSpeed: 185,
      dropDistance: 54,
      respawnDelay: 7.5,
      color: '#79e7ff',
    }),
  }),
});

for (const [id, definition] of Object.entries(SUPPORT_UNIT_DEFINITIONS)) {
  if (!UNIT_CLASSES[id]) UNIT_CLASSES[id] = definition;
}

const REINFORCEMENT_BY_RARITY = Object.freeze({ rare: 1, epic: 2 });
const REINFORCEMENT_RARITIES = Object.freeze(Object.keys(REINFORCEMENT_BY_RARITY));

function reinforcementUpgrade(unitType) {
  const unitClass = UNIT_CLASSES[unitType];
  return {
    id: `${unitType}-reinforcements`,
    name: `${unitClass.label} Reinforcement`,
    tag: 'Rocketeer Class',
    kind: 'reinforcement',
    stat: 'unitCount',
    maxRank: 5,
    unitType,
    rarityIds: REINFORCEMENT_RARITIES,
    describe(rarity) {
      const amount = REINFORCEMENT_BY_RARITY[rarity.id] ?? 0;
      return `Recruit ${amount} ${unitClass.label}${amount === 1 ? '' : 's'} into the squad.`;
    },
    apply(game, rarity) {
      const amount = REINFORCEMENT_BY_RARITY[rarity.id] ?? 0;
      if (amount > 0) game.addSquadUnits(unitType, amount);
    },
  };
}

// Drone Pilots keep their own recruitment card and battlefield behavior, but
// all stat progression now comes from the shared Rocketeer-class upgrades.
const supportUpgrades = [
  reinforcementUpgrade('drone_pilot'),
];

for (const upgrade of supportUpgrades) {
  if (!UPGRADES.some((existing) => existing.id === upgrade.id)) UPGRADES.push(upgrade);
}
