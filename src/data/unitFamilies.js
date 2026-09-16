// Unit class families group mechanically distinct unit types under one upgrade/
// Captain/doctrine class identity without changing their actual unit type.
// Keeping unit.type intact preserves weapons, sprites, recruitment and saved runtime state.
export const UNIT_CLASS_FAMILIES = Object.freeze({
  rifleman: Object.freeze(['rifleman', 'sniper']),
  rocketeer: Object.freeze(['rocketeer', 'drone_pilot']),
  shockblade: Object.freeze(['shockblade', 'stormlancer']),
});

const FAMILY_BY_TYPE = Object.freeze(
  Object.fromEntries(
    Object.entries(UNIT_CLASS_FAMILIES)
      .flatMap(([familyId, members]) => members.map((unitType) => [unitType, familyId])),
  ),
);

export function getUnitClassFamily(unitType) {
  return FAMILY_BY_TYPE[unitType] ?? unitType;
}

export function getUnitClassMembers(unitTypeOrFamily) {
  const familyId = getUnitClassFamily(unitTypeOrFamily);
  return UNIT_CLASS_FAMILIES[familyId] ?? Object.freeze([unitTypeOrFamily]);
}

export function isUnitInClassFamily(unitType, unitTypeOrFamily) {
  if (!unitType || !unitTypeOrFamily) return false;
  return getUnitClassFamily(unitType) === getUnitClassFamily(unitTypeOrFamily);
}
