import { UNIT_CLASSES } from './content.js';

const DEFAULT_UNIT_MODIFIER = Object.freeze({
  damage: 1,
  fireRate: 1,
  range: 1,
  projectileSpeed: 1,
  pierce: 0,
  blastRadius: 1,
});

export function createUnitModifierState() {
  return Object.fromEntries(
    Object.keys(UNIT_CLASSES).map((unitType) => [unitType, { ...DEFAULT_UNIT_MODIFIER }]),
  );
}

export function getUnitModifiers(modifierState, unitType) {
  return modifierState?.[unitType] ?? DEFAULT_UNIT_MODIFIER;
}

export function applyUnitModifier(modifierState, unitType, stat, amount, mode = 'percent') {
  const modifiers = modifierState?.[unitType];
  if (!modifiers || !(stat in modifiers)) return;

  if (mode === 'flat') {
    modifiers[stat] += amount;
    return;
  }

  modifiers[stat] *= 1 + amount / 100;
}

export function getEffectiveUnitStats(unitType, modifierState) {
  const unitClass = UNIT_CLASSES[unitType];
  if (!unitClass) return null;

  const weapon = unitClass.weapon;
  const support = unitClass.support ?? null;
  const modifiers = getUnitModifiers(modifierState, unitType);
  const baseCooldown = support?.cooldown ?? weapon.cooldown;
  const baseRange = support?.range ?? weapon.range;
  const baseProjectileSpeed = support?.projectileSpeed ?? weapon.projectileSpeed ?? 0;
  const baseBlastRadius = support?.aoeRadius ?? weapon.aoeRadius ?? 0;

  return {
    unitType,
    label: unitClass.label,
    kind: support?.kind ?? weapon.kind,
    supportKind: support?.kind ?? null,
    damage: weapon.damage * modifiers.damage,
    fireRate: (1 / baseCooldown) * modifiers.fireRate,
    cooldown: baseCooldown / modifiers.fireRate,
    range: baseRange * modifiers.range,
    projectileSpeed: baseProjectileSpeed * modifiers.projectileSpeed,
    pierce: (weapon.pierce ?? 0) + modifiers.pierce,
    blastRadius: baseBlastRadius * modifiers.blastRadius,
    stunDuration: support?.stunDuration ?? 0,
    droneHp: support?.droneHp ?? 0,
    lungeDistance: weapon.kind === 'melee'
      ? Math.max(0, weapon.range * modifiers.range - 30)
      : (weapon.lungeDistance ?? 0) * modifiers.range,
    attackDuration: weapon.attackDuration ?? 0,
    arcRadians: weapon.arcRadians ?? 0,
  };
}
