const STORAGE_KEY = 'nightfall-protocol.permanent-gold.v1';
const LEGACY_STORAGE_KEY = 'nightfall-protocol.meta-upgrades.v1';
const STATE_VERSION = 2;
const LEGACY_POINT_GOLD_VALUE = 10;

export const BEEFED_UP_HP_BONUS = 50;

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
  third_captain_slot: Object.freeze({
    id: 'third_captain_slot',
    name: 'Third Captain',
    cost: 50,
    color: '#c17cff',
    requires: Object.freeze(['second_captain_slot']),
    description: 'Deploy a third Captain so Vale, Mercer and Thorne can fight together. Requires Second Captain Slot.',
  }),
  beefed_up: Object.freeze({
    id: 'beefed_up',
    name: 'Beefed Up',
    cost: 50,
    color: '#ff8f70',
    description: `All player squad units gain +${BEEFED_UP_HP_BONUS} maximum HP.`,
  }),
  treasure_chests: Object.freeze({
    id: 'treasure_chests',
    name: 'Treasure Chests',
    cost: 50,
    color: '#f7c94b',
    description: 'Defeated enemies gain a small chance to drop a treasure chest containing Gold and XP.',
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
  // Keep the legacy id so existing saved selections continue to work.
  massed_infantry: Object.freeze({
    id: 'massed_infantry',
    name: 'Specialization',
    color: '#74c9ff',
    description: 'The opposite of Combined Arms: every duplicate of the same living class makes that class stronger, granting +6% damage and attack speed per additional unit, up to +40%.',
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
    activeIds: [],
    selectedDoctrineId: null,
  };
}

function normalizeState(candidate) {
  const ownedIds = [...new Set(candidate?.ownedIds ?? [])]
    .filter((id) => Boolean(PERMANENT_UPGRADES[id]));

  // Saves created before #61 did not have a separate active list. Treat every
  // previously purchased upgrade as active so existing progression behaves
  // exactly as it did before the toggle system was introduced.
  const requestedActiveIds = Array.isArray(candidate?.activeIds)
    ? candidate.activeIds
    : ownedIds;
  const requestedActiveSet = new Set(
    requestedActiveIds.filter((id) => ownedIds.includes(id)),
  );
  const activeSet = new Set(ownedIds.filter((id) => requestedActiveSet.has(id)));

  // Active dependencies must form a valid chain. Turning a prerequisite off
  // therefore deactivates dependent upgrades without removing their ownership.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...activeSet]) {
      const requirements = PERMANENT_UPGRADES[id]?.requires ?? [];
      if (requirements.every((requiredId) => activeSet.has(requiredId))) continue;
      activeSet.delete(id);
      changed = true;
    }
  }

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
    activeIds: ownedIds.filter((id) => activeSet.has(id)),
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
    activeIds: [...progressionState.activeIds],
    selectedDoctrineId: progressionState.selectedDoctrineId,
  };
}

export function isPermanentUpgradeOwned(id) {
  return progressionState.ownedIds.includes(id);
}

export function isPermanentUpgradeActive(id) {
  return isPermanentUpgradeOwned(id) && progressionState.activeIds.includes(id);
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
  const requirementsMet = (definition?.requires ?? [])
    .every((requiredId) => isPermanentUpgradeOwned(requiredId));
  return Boolean(
    definition
    && requirementsMet
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
    activeIds: [...progressionState.activeIds, id],
    selectedDoctrineId: id === 'squad_doctrine'
      ? (progressionState.selectedDoctrineId ?? 'combined_arms')
      : progressionState.selectedDoctrineId,
  });
  persistState();
  return true;
}

export function setPermanentUpgradeActive(id, enabled) {
  if (!isPermanentUpgradeOwned(id)) return false;

  const shouldEnable = Boolean(enabled);
  const currentlyActive = isPermanentUpgradeActive(id);
  if (shouldEnable === currentlyActive) return true;

  if (shouldEnable) {
    const requirementsMet = (PERMANENT_UPGRADES[id]?.requires ?? [])
      .every((requiredId) => isPermanentUpgradeActive(requiredId));
    if (!requirementsMet) return false;
  }

  const activeIds = shouldEnable
    ? [...progressionState.activeIds, id]
    : progressionState.activeIds.filter((activeId) => activeId !== id);
  const nextState = normalizeState({
    ...progressionState,
    activeIds,
  });

  if (shouldEnable && !nextState.activeIds.includes(id)) return false;
  progressionState = nextState;
  persistState();
  return true;
}

export function togglePermanentUpgrade(id) {
  return setPermanentUpgradeActive(id, !isPermanentUpgradeActive(id));
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
