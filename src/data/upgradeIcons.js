import { getUnitClassFamily } from './unitFamilies.js';

const ICON_ROOT = './assets/icons';

export const GENERIC_UPGRADE_ICON_FILES = Object.freeze({
  damage: 'damage.png',
  fireRate: 'fire_rate.png',
  range: 'range.png',
  projectileSpeed: 'projectile_speed.png',
  pierce: 'pierce.png',
  blastRadius: 'blast_radius.png',
  reinforcement: 'reinforcement.png',
});

export const CLASS_ICON_FILES = Object.freeze({
  rifleman: 'rifleman.png',
  rocketeer: 'rocketeer.png',
  shockblade: 'shockblade.png',
  drone_pilot: 'drone_pilot.png',
});

export const UPGRADE_ICON_METADATA = Object.freeze({
  'rifleman-reinforcements': { generic: 'reinforcement', class: 'rifleman' },
  'rifleman-damage': { generic: 'damage', class: 'rifleman' },
  'rifleman-fire-rate': { generic: 'fireRate', class: 'rifleman' },
  'rifleman-range': { generic: 'range', class: 'rifleman' },
  'rifleman-projectile-speed': { generic: 'projectileSpeed', class: 'rifleman' },
  'rifleman-pierce': { generic: 'pierce', class: 'rifleman' },
  'sniper-reinforcements': { generic: 'reinforcement', class: 'rifleman' },
  'rocketeer-reinforcements': { generic: 'reinforcement', class: 'rocketeer' },
  'rocketeer-damage': { generic: 'damage', class: 'rocketeer' },
  'rocketeer-fire-rate': { generic: 'fireRate', class: 'rocketeer' },
  'rocketeer-range': { generic: 'range', class: 'rocketeer' },
  'rocketeer-projectile-speed': { generic: 'projectileSpeed', class: 'rocketeer' },
  'rocketeer-blast-radius': { generic: 'blastRadius', class: 'rocketeer' },
  'drone_pilot-reinforcements': { generic: 'reinforcement', class: 'rocketeer' },
  'shockblade-reinforcements': { generic: 'reinforcement', class: 'shockblade' },
  'shockblade-damage': { generic: 'damage', class: 'shockblade' },
  'shockblade-fire-rate': { generic: 'fireRate', class: 'shockblade' },
  'shockblade-range': { generic: 'range', class: 'shockblade' },
  'shockblade-blast-radius': { generic: 'blastRadius', class: 'shockblade' },
  'stormlancer-reinforcements': { generic: 'reinforcement', class: 'shockblade' },
});

const GENERIC_FALLBACKS = Object.freeze({
  damage: 'DMG',
  fireRate: 'RATE',
  range: 'RNG',
  projectileSpeed: 'SPD',
  pierce: 'PIERCE',
  blastRadius: 'AOE',
  reinforcement: '+1',
});

const CLASS_FALLBACKS = Object.freeze({
  rifleman: 'RIF',
  rocketeer: 'RKT',
  shockblade: 'SHK',
  drone_pilot: 'DRN',
});

function inferredGenericKey(upgrade) {
  if (upgrade?.kind === 'reinforcement') return 'reinforcement';
  return upgrade?.stat ?? 'damage';
}

export function getUpgradeIconSpec(upgrade) {
  const metadata = UPGRADE_ICON_METADATA[upgrade?.id] ?? {};
  const genericKey = metadata.generic ?? inferredGenericKey(upgrade);
  const classKey = metadata.class ?? getUnitClassFamily(upgrade?.unitType ?? 'rifleman');
  const genericFile = GENERIC_UPGRADE_ICON_FILES[genericKey] ?? `${genericKey}.png`;
  const classFile = CLASS_ICON_FILES[classKey] ?? `${classKey}.png`;

  return {
    genericKey,
    genericSrc: `${ICON_ROOT}/upgrade_generic/${genericFile}`,
    genericFallback: GENERIC_FALLBACKS[genericKey] ?? genericKey.slice(0, 4).toUpperCase(),
    classKey,
    classSrc: `${ICON_ROOT}/unit_class/${classFile}`,
    classFallback: CLASS_FALLBACKS[classKey] ?? classKey.slice(0, 3).toUpperCase(),
  };
}
