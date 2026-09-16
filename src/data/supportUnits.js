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

const STAT_BUFF_BY_RARITY = Object.freeze({
  common: 5,
  uncommon: 10,
  rare: 15,
  epic: 20,
});
const REINFORCEMENT_BY_RARITY = Object.freeze({ rare: 1, epic: 2 });
const REINFORCEMENT_RARITIES = Object.freeze(Object.keys(REINFORCEMENT_BY_RARITY));

function applyPercent(game, unitType, stat, amount) {
  const modifiers = game.unitModifiers?.[unitType];
  if (!modifiers || !(stat in modifiers)) return;
  modifiers[stat] *= 1 + amount / 100;
}

function reinforcementUpgrade(unitType) {
  const unitClass = UNIT_CLASSES[unitType];
  return {
    id: `${unitType}-reinforcements`,
    name: `${unitClass.label} Reinforcement`,
    tag: unitClass.label,
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

function statUpgrade(unitType, id, name, stat, label) {
  const unitClass = UNIT_CLASSES[unitType];
  return {
    id: `${unitType}-${id}`,
    name,
    tag: unitClass.label,
    kind: 'stat',
    unitType,
    stat,
    maxRank: 8,
    describe(rarity) {
      const amount = STAT_BUFF_BY_RARITY[rarity.id] ?? 5;
      return `+${amount}% ${unitClass.label} ${label}.`;
    },
    apply(game, rarity) {
      applyPercent(game, unitType, stat, STAT_BUFF_BY_RARITY[rarity.id] ?? 5);
    },
  };
}

const supportUpgrades = [
  reinforcementUpgrade('drone_pilot'),
  statUpgrade('drone_pilot', 'fire-rate', 'Fast Drone Turnaround', 'fireRate', 'stun-grenade rate'),
  statUpgrade('drone_pilot', 'range', 'Long-Link Relay', 'range', 'drone operating range'),
  statUpgrade('drone_pilot', 'blast-radius', 'Wide Stun Payload', 'blastRadius', 'stun radius'),
];

for (const upgrade of supportUpgrades) {
  if (!UPGRADES.some((existing) => existing.id === upgrade.id)) UPGRADES.push(upgrade);
}
