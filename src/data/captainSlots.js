export function isAdditionalCaptainUnit(unit) {
  return Boolean(unit?.secondaryCaptain || unit?.tertiaryCaptain);
}

export function isPrimaryCaptainSlotUnit(unit, captainId = null) {
  if (!unit || unit.dead || !unit.captainId || isAdditionalCaptainUnit(unit)) return false;
  return captainId == null || unit.captainId === captainId;
}

export function getCaptainSlot(unit) {
  if (!unit?.captainId) return null;
  if (unit.tertiaryCaptain) return 'tertiary';
  if (unit.secondaryCaptain) return 'secondary';
  return 'primary';
}
