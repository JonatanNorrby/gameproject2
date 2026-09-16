const STORAGE_KEY = 'nightfall-protocol.permanent-gold.v1';
const LEGACY_STORAGE_KEY = 'nightfall-protocol.meta-upgrades.v1';
const STATE_VERSION = 1;
const LEGACY_POINT_GOLD_VALUE = 10;

export const PERMANENT_UPGRADES = Object.freeze({
  squad_doctrine: Object.freeze({
    id: 'squad_doctrine',
    name: 'Squad Doctrine',
    cost: 30,
    color: '#7ef9d4',
    description: 'Before each run, choose one doctrine that changes how the squad fights.',
  }),
  second_captain_slot: Object.freeze({
    id: 'second_captain_slot',
    name: 'Second Captain Slot',
    cost: 50,
    color: '#74c9ff',
    description: 'Select a second Captain before the run. They fight as a normal unit but still provide their Captain bonus.',
  }),
  captains_call: Object.freeze({
    id: 'captains_call',
    name: "Captains Call",
    cost: 60,
    color: '#ffb35c',
    description: 'Unlock a powerful long-cooldown active ability for every Captain.',
  }),
});

export const SQUAD_DOCTRINES = Object.freeze({
  combined_arms: Object.freeze({
    id: 'combined_arms',
    name: 'Combined Arms',
    color: '#7ef9d4',
    description: 'Class diversity increases squad damage and attack speed. Each additional living class adds +7%, up to +35%.',
  }),
  massed_infantry: Object.freeze({
    id: 'massed_infantry',
    name: 'Massed Infantry',
    color: '#74c9ff',
    description: 'Stacking the same class increases that class damage and attack speed by +6% per additional living unit, up to +40%.',
  }),
  shock_assault: Object.freeze({
    id: 'shock_assault',
    name: 'Shock Assault',
    color: '#ff7aa8',
    description: 'Melee and true close-range units gain +20% damage, +35% attack speed and +30% range.',
  }),
});

function createDefaultState() {
  return {
    version: STATE_VERSION,
    gold: 0,
    ownedIds: [],
    selectedDoctrineId: null,
  };
}

function normalizeState(candidate) {
  const ownedIds = [...new Set(candidate?.ownedIds ?? [])]
    .filter((id) => Boolean(PERMANENT_UPGRADES[id]));
  const doctrineOwned = ownedIds.includes('squad_doctrine');
  const requestedDoctrine = candidate?.selectedDoctrineId;
  const selectedDoctrineId = doctrineOwned && SQUAD_DOCTRINES[requestedDoctrine]
    ? requestedDoctrine
    : doctrineOwned
      ? 'combined_arms'
      : null;

  return {
    version: STATE_VERSION,
    gold: Math.max(0, Math.floor(Number(candidate?.gold) || 0)),
    ownedIds,
    selectedDoctrineId,
  };
}

function loadLegacyGold() {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return 0;
    const legacy = JSON.parse(raw);
    return Math.max(0, Math.floor(Number(legacy?.totalPoints) || 0)) * LEGACY_POINT_GOLD_VALUE;
  } catch (error) {
    console.warn('Could not migrate legacy permanent-upgrade progress.', error);
    return 0;
  }
}

function loadState() {
  if (typeof window === 'undefined' || !window.localStorage) return createDefaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));

    const migrated = createDefaultState();
    migrated.gold = loadLegacyGold();
    return normalizeState(migrated);
  } catch (error) {
    console.warn('Could not load permanent gold progression.', error);
    return createDefaultState();
  }
}

let progressionState = loadState();

function persistState() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progressionState));
  } catch (error) {
    console.warn('Could not save permanent gold progression.', error);
  }
}

export function getPermanentProgressionState() {
  return {
    version: progressionState.version,
    gold: progressionState.gold,
    ownedIds: [...progressionState.ownedIds],
    selectedDoctrineId: progressionState.selectedDoctrineId,
  };
}

export function isPermanentUpgradeOwned(id) {
  return progressionState.ownedIds.includes(id);
}

export function getPermanentUpgradeDefinition(id) {
  return PERMANENT_UPGRADES[id] ?? null;
}

export function grantGold(amount = 1) {
  const gold = Math.max(0, Math.floor(Number(amount) || 0));
  if (gold <= 0) return getPermanentProgressionState();
  progressionState = normalizeState({
    ...progressionState,
    gold: progressionState.gold + gold,
  });
  persistState();
  return getPermanentProgressionState();
}

export function canPurchasePermanentUpgrade(id) {
  const definition = PERMANENT_UPGRADES[id];
  return Boolean(
    definition
    && !isPermanentUpgradeOwned(id)
    && progressionState.gold >= definition.cost
  );
}

export function purchasePermanentUpgrade(id) {
  if (!canPurchasePermanentUpgrade(id)) return false;
  const definition = PERMANENT_UPGRADES[id];
  progressionState = normalizeState({
    ...progressionState,
    gold: progressionState.gold - definition.cost,
    ownedIds: [...progressionState.ownedIds, id],
    selectedDoctrineId: id === 'squad_doctrine'
      ? (progressionState.selectedDoctrineId ?? 'combined_arms')
      : progressionState.selectedDoctrineId,
  });
  persistState();
  return true;
}

export function setSelectedDoctrine(id) {
  if (!isPermanentUpgradeOwned('squad_doctrine') || !SQUAD_DOCTRINES[id]) return false;
  progressionState = normalizeState({
    ...progressionState,
    selectedDoctrineId: id,
  });
  persistState();
  return true;
}

export function getSelectedDoctrine() {
  return progressionState.selectedDoctrineId;
}

export function resetPermanentProgression() {
  progressionState = createDefaultState();
  persistState();
  return getPermanentProgressionState();
}

// Compatibility aliases keep older imports loadable while their old point/tree
// behavior is disabled. Boss configs now award zero legacy points.
export const resetMetaUpgradeProgress = resetPermanentProgression;
export function grantMetaUpgradePoints() {
  const state = getPermanentProgressionState();
  return { totalPoints: state.gold };
}
