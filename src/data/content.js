export const GAME_BALANCE = {
  player: {
    radius: 16,
    soldierRadius: 10,
    formationSpacing: 28,
    startingSquad: ['rifleman'],
    speed: 235,
    maxHp: 100,
    armor: 0,
    magnetRadius: 92,
  },
  progression: {
    startingXpToNext: 8,
    growth: 1.34,
  },
};

export const UNIT_CLASSES = {
  rifleman: {
    id: 'rifleman',
    label: 'Rifleman',
    shortLabel: 'RIF',
    maxHp: 100,
    fill: '#7ef9d4',
    core: '#0c302a',
    outline: '#bffcf0',
    weapon: {
      kind: 'bullet',
      damage: 20,
      cooldown: 0.55,
      projectileSpeed: 620,
      projectileRadius: 5,
      projectileLife: 1.25,
      pierce: 1,
      range: 125,
      color: '#bffcf0',
    },
  },
  rocketeer: {
    id: 'rocketeer',
    label: 'Rocketeer',
    shortLabel: 'RKT',
    maxHp: 100,
    fill: '#ffb35c',
    core: '#4b2b13',
    outline: '#ffe0a8',
    weapon: {
      kind: 'rocket',
      damage: 38,
      cooldown: 1.65,
      projectileSpeed: 340,
      projectileRadius: 9,
      projectileLife: 2.1,
      pierce: 1,
      range: 150,
      aoeRadius: 86,
      color: '#ffb35c',
    },
  },
  shockblade: {
    id: 'shockblade',
    label: 'Shockblade',
    shortLabel: 'SHK',
    maxHp: 100,
    fill: '#6fc8ff',
    core: '#142d45',
    outline: '#c5ecff',
    weapon: {
      kind: 'melee',
      damage: 32,
      cooldown: 1.5,
      projectileSpeed: 0,
      projectileRadius: 0,
      projectileLife: 0,
      pierce: 1,
      range: 100,
      aoeRadius: 78,
      lungeDistance: 100,
      attackDuration: 0.34,
      hitTime: 0.17,
      arcRadians: Math.PI,
      color: '#7ad7ff',
    },
  },
};

export const CAPTAINS = {
  mercer: {
    id: 'mercer',
    name: 'Captain Mercer',
    role: 'Rocketeer',
    unitType: 'rocketeer',
    maxHp: 100,
    shortLabel: 'MER',
    color: '#ffd36a',
    description: 'Starts with a rocket launcher and empowers adjacent Rocketeers.',
    passiveText: 'Every third shot from adjacent Rocketeers becomes a long-range rocket with 3× blast radius.',
    effect: {
      type: 'rocketeer-special-rocket',
      everyShots: 3,
      rangeMultiplier: 1.75,
      aoeMultiplier: 3,
      color: '#fff08a',
    },
  },
  vale: {
    id: 'vale',
    name: 'Captain Vale',
    role: 'Rifle Commander',
    unitType: 'rifleman',
    maxHp: 100,
    shortLabel: 'VAL',
    color: '#7ef9d4',
    description: 'Starts with an assault rifle and coordinates nearby Riflemen.',
    passiveText: 'Adjacent Riflemen gain +30% fire rate.',
    effect: {
      type: 'rifle-fire-rate',
      fireRateMultiplier: 1.3,
    },
  },
};

export const ENEMY_TYPES = {
  crawler: {
    label: 'Crawler', radius: 13, speed: 78, hp: 30, damage: 8, xp: 1,
    fill: '#db5c83', outline: '#ff9db9', unlockAt: 0, weight: 9,
  },
  runner: {
    label: 'Runner', radius: 10, speed: 128, hp: 19, damage: 6, xp: 1,
    fill: '#e5b84e', outline: '#ffe197', unlockAt: 18, weight: 5,
  },
  brute: {
    label: 'Brute', radius: 23, speed: 48, hp: 110, damage: 18, xp: 4,
    fill: '#8f62d8', outline: '#c3a5ff', unlockAt: 34, weight: 2,
  },
  spitter: {
    label: 'Spitter', radius: 14, speed: 52, hp: 46, damage: 0, xp: 3,
    fill: '#6fcb62', outline: '#baff98', unlockAt: 65, weight: 0.35, maxActive: 3,
    ranged: {
      range: 340,
      preferredRange: 285,
      retreatRange: 205,
      cooldown: 3.5,
      projectileSpeed: 85,
      projectileRadius: 9,
      projectileLife: 5.4,
      damage: 14,
      color: '#a8ff72',
    },
  },
};

export const RARITIES = [
  { id: 'common', label: 'Common', weight: 64, color: '#b8c0cc' },
  { id: 'uncommon', label: 'Uncommon', weight: 25, color: '#70dc8b' },
  { id: 'rare', label: 'Rare', weight: 9, color: '#67a7ff' },
  { id: 'epic', label: 'Epic', weight: 2, color: '#c17cff' },
];

const STAT_BUFF_BY_RARITY = Object.freeze({
  common: 5,
  uncommon: 10,
  rare: 15,
  epic: 20,
});

function rarityValue(rarity, values) {
  return values[rarity.id] ?? values.common;
}

function applyUnitStat(game, unitType, stat, amount) {
  const modifiers = game.unitModifiers?.[unitType];
  if (!modifiers || !(stat in modifiers)) return;

  if (stat === 'pierce') {
    const basePierce = UNIT_CLASSES[unitType]?.weapon?.pierce ?? 1;
    const currentPierce = basePierce + modifiers.pierce;
    modifiers.pierce += currentPierce * (amount / 100);
    return;
  }

  modifiers[stat] *= 1 + amount / 100;
}

function unitStatUpgrade({
  unitType,
  id,
  name,
  stat,
  maxRank,
  values,
  label,
  mode = 'percent',
}) {
  return {
    id: `${unitType}-${id}`,
    name,
    tag: UNIT_CLASSES[unitType].label,
    kind: 'stat',
    unitType,
    stat,
    maxRank,
    describe(rarity) {
      const amount = rarityValue(rarity, STAT_BUFF_BY_RARITY);
      return `+${amount}% ${UNIT_CLASSES[unitType].label} ${label}.`;
    },
    apply(game, rarity) {
      applyUnitStat(game, unitType, stat, rarityValue(rarity, STAT_BUFF_BY_RARITY));
    },
  };
}

const REINFORCEMENT_COUNT_BY_RARITY = Object.freeze({
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
});

function recruitmentUpgrade({ id, name, unitType, maxRank }) {
  return {
    id,
    name,
    tag: UNIT_CLASSES[unitType].label,
    kind: 'reinforcement',
    stat: 'unitCount',
    maxRank,
    unitType,
    describe(rarity) {
      const amount = rarityValue(rarity, REINFORCEMENT_COUNT_BY_RARITY);
      return `Recruit ${amount} ${UNIT_CLASSES[unitType].label}${amount === 1 ? '' : 's'} into the squad.`;
    },
    apply(game, rarity) {
      game.addSquadUnits(unitType, rarityValue(rarity, REINFORCEMENT_COUNT_BY_RARITY));
    },
  };
}

export const UPGRADES = [
  recruitmentUpgrade({
    id: 'rifleman-reinforcements',
    name: 'Rifleman Reinforcement',
    unitType: 'rifleman',
    maxRank: 7,
  }),
  unitStatUpgrade({
    unitType: 'rifleman', id: 'damage', name: 'High-Velocity Rounds', stat: 'damage', maxRank: 8,
    values: { common: 20, uncommon: 28, rare: 40, epic: 60 }, label: 'damage',
  }),
  unitStatUpgrade({
    unitType: 'rifleman', id: 'fire-rate', name: 'Accelerated Cycling', stat: 'fireRate', maxRank: 8,
    values: { common: 15, uncommon: 21, rare: 30, epic: 45 }, label: 'fire rate',
  }),
  unitStatUpgrade({
    unitType: 'rifleman', id: 'range', name: 'Long-Range Optics', stat: 'range', maxRank: 5,
    values: { common: 10, uncommon: 14, rare: 20, epic: 30 }, label: 'weapon range',
  }),
  unitStatUpgrade({
    unitType: 'rifleman', id: 'projectile-speed', name: 'Rail Accelerator', stat: 'projectileSpeed', maxRank: 5,
    values: { common: 18, uncommon: 25, rare: 36, epic: 52 }, label: 'projectile speed',
  }),
  unitStatUpgrade({
    unitType: 'rifleman', id: 'pierce', name: 'Penetrator Core', stat: 'pierce', maxRank: 4,
    values: { common: 1, uncommon: 1, rare: 2, epic: 3 }, label: 'projectile pierce', mode: 'flat',
  }),

  recruitmentUpgrade({
    id: 'rocketeer-reinforcements',
    name: 'Rocketeer Reinforcement',
    unitType: 'rocketeer',
    maxRank: 5,
  }),
  unitStatUpgrade({
    unitType: 'rocketeer', id: 'damage', name: 'High-Yield Warheads', stat: 'damage', maxRank: 8,
    values: { common: 20, uncommon: 28, rare: 40, epic: 60 }, label: 'damage',
  }),
  unitStatUpgrade({
    unitType: 'rocketeer', id: 'fire-rate', name: 'Rapid Loader', stat: 'fireRate', maxRank: 8,
    values: { common: 15, uncommon: 21, rare: 30, epic: 45 }, label: 'fire rate',
  }),
  unitStatUpgrade({
    unitType: 'rocketeer', id: 'range', name: 'Targeting Uplink', stat: 'range', maxRank: 5,
    values: { common: 10, uncommon: 14, rare: 20, epic: 30 }, label: 'weapon range',
  }),
  unitStatUpgrade({
    unitType: 'rocketeer', id: 'projectile-speed', name: 'Boosted Propellant', stat: 'projectileSpeed', maxRank: 5,
    values: { common: 18, uncommon: 25, rare: 36, epic: 52 }, label: 'projectile speed',
  }),
  unitStatUpgrade({
    unitType: 'rocketeer', id: 'blast-radius', name: 'Expanded Payload', stat: 'blastRadius', maxRank: 5,
    values: { common: 15, uncommon: 22, rare: 32, epic: 48 }, label: 'blast radius',
  }),

  recruitmentUpgrade({
    id: 'shockblade-reinforcements',
    name: 'Shockblade Reinforcement',
    unitType: 'shockblade',
    maxRank: 5,
  }),
  unitStatUpgrade({
    unitType: 'shockblade', id: 'damage', name: 'Overcharged Blades', stat: 'damage', maxRank: 8,
    values: { common: 20, uncommon: 28, rare: 40, epic: 60 }, label: 'slash damage',
  }),
  unitStatUpgrade({
    unitType: 'shockblade', id: 'fire-rate', name: 'Jump-Pack Cycling', stat: 'fireRate', maxRank: 8,
    values: { common: 15, uncommon: 21, rare: 30, epic: 45 }, label: 'attack rate',
  }),
  unitStatUpgrade({
    unitType: 'shockblade', id: 'range', name: 'Threat Sensor', stat: 'range', maxRank: 5,
    values: { common: 10, uncommon: 14, rare: 20, epic: 30 }, label: 'trigger and lunge range',
  }),
  unitStatUpgrade({
    unitType: 'shockblade', id: 'blast-radius', name: 'Wide Arc Servos', stat: 'blastRadius', maxRank: 5,
    values: { common: 15, uncommon: 22, rare: 32, epic: 48 }, label: 'slash radius',
  }),
];
