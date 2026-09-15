const STORAGE_KEY = 'nightfall-protocol.unlocks.v1';
const STATE_VERSION = 1;

export const UNLOCK_DEFINITIONS = Object.freeze({
  'captain:vale': Object.freeze({
    id: 'captain:vale',
    category: 'captain',
    targetId: 'vale',
    label: 'Captain Vale',
    defaultUnlocked: true,
    requirementText: 'Available from the start.',
    condition: null,
  }),
  'captain:mercer': Object.freeze({
    id: 'captain:mercer',
    category: 'captain',
    targetId: 'mercer',
    label: 'Captain Mercer',
    defaultUnlocked: false,
    requirementText: 'Have 5 Rocketeers alive in your squad at once.',
    condition: Object.freeze({
      type: 'living-unit-count',
      unitType: 'rocketeer',
      count: 5,
    }),
  }),
  'captain:thorne': Object.freeze({
    id: 'captain:thorne',
    category: 'captain',
    targetId: 'thorne',
    label: 'Captain Thorne',
    defaultUnlocked: false,
    requirementText: 'Have 5 Shockblades alive in your squad at once.',
    condition: Object.freeze({
      type: 'living-unit-count',
      unitType: 'shockblade',
      count: 5,
    }),
  }),
});

function getDefaultUnlockIds() {
  return Object.values(UNLOCK_DEFINITIONS)
    .filter((definition) => definition.defaultUnlocked)
    .map((definition) => definition.id);
}

function createDefaultState() {
  return {
    version: STATE_VERSION,
    unlockedIds: getDefaultUnlockIds(),
  };
}

function normalizeState(candidate) {
  const unlockedIds = new Set(getDefaultUnlockIds());
  for (const id of candidate?.unlockedIds ?? []) {
    if (UNLOCK_DEFINITIONS[id]) unlockedIds.add(id);
  }

  return {
    version: STATE_VERSION,
    unlockedIds: [...unlockedIds],
  };
}

function loadState() {
  if (typeof window === 'undefined' || !window.localStorage) return createDefaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn('Could not load unlock progress.', error);
    return createDefaultState();
  }
}

let unlockState = loadState();

function persistState() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(unlockState));
  } catch (error) {
    console.warn('Could not save unlock progress.', error);
  }
}

export function isUnlocked(unlockId) {
  const definition = UNLOCK_DEFINITIONS[unlockId];
  if (!definition) return false;
  return definition.defaultUnlocked || unlockState.unlockedIds.includes(unlockId);
}

export function isCaptainUnlocked(captainId) {
  return isUnlocked(`captain:${captainId}`);
}

export function getCaptainUnlockDefinition(captainId) {
  return UNLOCK_DEFINITIONS[`captain:${captainId}`] ?? null;
}

export function unlock(unlockId) {
  const definition = UNLOCK_DEFINITIONS[unlockId];
  if (!definition || isUnlocked(unlockId)) return null;

  unlockState = normalizeState({
    ...unlockState,
    unlockedIds: [...unlockState.unlockedIds, unlockId],
  });
  persistState();
  return definition;
}

function conditionMet(condition, { squad = [] } = {}) {
  if (!condition) return true;

  if (condition.type === 'living-unit-count') {
    const livingCount = squad.filter((unit) => (
      !unit.dead && unit.type === condition.unitType
    )).length;
    return livingCount >= condition.count;
  }

  return false;
}

export function evaluateUnlocks(context = {}) {
  const newlyUnlocked = [];

  for (const definition of Object.values(UNLOCK_DEFINITIONS)) {
    if (definition.defaultUnlocked || isUnlocked(definition.id)) continue;
    if (!conditionMet(definition.condition, context)) continue;

    const unlocked = unlock(definition.id);
    if (unlocked) newlyUnlocked.push(unlocked);
  }

  return newlyUnlocked;
}

export function getUnlockState() {
  return {
    version: unlockState.version,
    unlockedIds: [...unlockState.unlockedIds],
  };
}
