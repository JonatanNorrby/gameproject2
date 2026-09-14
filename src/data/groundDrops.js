export const GROUND_DROP_CONFIG = {
  spawnChanceOnKill: 0.03,
  pickupRadius: 28,
  debugSpawnDistance: 76,
};

export const GROUND_DROPS = {
  magnet: {
    id: 'magnet',
    label: 'Magnet',
    symbol: 'M',
    color: '#70e8ff',
    description: 'Collect every XP gem currently on the battlefield.',
    kind: 'instant',
  },
  nuke: {
    id: 'nuke',
    label: 'Nuke',
    symbol: 'N',
    color: '#ff7a62',
    description: 'Destroy every enemy currently spawned.',
    kind: 'instant',
  },
  fury: {
    id: 'fury',
    label: 'Fury',
    symbol: 'F',
    color: '#ffcf5b',
    description: '+300% attack speed for all units.',
    kind: 'timed',
    duration: 10,
  },
  mothership: {
    id: 'mothership',
    label: 'Mothership',
    symbol: 'S',
    color: '#9f8cff',
    description: 'Board the squad, become untargetable, and freeze all enemies.',
    kind: 'timed',
    duration: 10,
  },
  transformer: {
    id: 'transformer',
    label: 'Transformer',
    symbol: 'T',
    color: '#7ef9d4',
    description: 'Merge the squad into one mega unit with +100% to all combat stats.',
    kind: 'timed',
    duration: 10,
  },
};

export const GROUND_DROP_IDS = Object.keys(GROUND_DROPS);
