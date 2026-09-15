const STORAGE_KEY = 'nightfall-protocol.meta-upgrades.v1';
const STATE_VERSION = 1;

export const META_UPGRADE_BRANCHES = Object.freeze([
  Object.freeze({
    id: 'reserves',
    label: 'Reserve Doctrine',
    description: 'Change how new squad members enter a run.',
    color: '#74c9ff',
  }),
  Object.freeze({
    id: 'survival',
    label: 'Survival Protocols',
    description: 'Turn lethal moments into comeback windows.',
    color: '#7ef9d4',
  }),
  Object.freeze({
    id: 'momentum',
    label: 'Kill Momentum',
    description: 'Reward aggressive kill streaks with battlefield swings.',
    color: '#ffb35c',
  }),
]);

export const META_UPGRADES = Object.freeze({
  reserve_drop: Object.freeze({
    id: 'reserve_drop',
    branch: 'reserves',
    tier: 1,
    cost: 1,
    name: 'Reserve Drop',
    description: 'The first reinforcement upgrade each run recruits one additional unit.',
    requirements: Object.freeze([]),
  }),
  deep_reserves: Object.freeze({
    id: 'deep_reserves',
    branch: 'reserves',
    tier: 2,
    cost: 1,
    name: 'Deep Reserves',
    description: 'The first two reinforcement upgrades each run recruit one additional unit instead of only the first.',
    requirements: Object.freeze(['reserve_drop']),
  }),
  emergency_barrier: Object.freeze({
    id: 'emergency_barrier',
    branch: 'survival',
    tier: 1,
    cost: 1,
    name: 'Emergency Barrier',
    description: 'Once per run, the first non-Captain squad member that would die survives at 1 HP and gains brief invulnerability.',
    requirements: Object.freeze([]),
  }),
  rally_pulse: Object.freeze({
    id: 'rally_pulse',
    branch: 'survival',
    tier: 2,
    cost: 1,
    name: 'Rally Pulse',
    description: 'When Emergency Barrier triggers, the squad immediately enters Fury for 4 seconds.',
    requirements: Object.freeze(['emergency_barrier']),
  }),
  kill_reactor: Object.freeze({
    id: 'kill_reactor',
    branch: 'momentum',
    tier: 1,
    cost: 1,
    name: 'Kill Reactor',
    description: 'Every 25th kill triggers Fury for 3 seconds.',
    requirements: Object.freeze([]),
  }),
  vacuum_surge: Object.freeze({
    id: 'vacuum_surge',
    branch: 'momentum',
    tier: 2,
    cost: 1,
    name: 'Vacuum Surge',
    description: 'Every Kill Reactor trigger also pulls in all XP currently on the battlefield.',
    requirements: Object.freeze(['kill_reactor']),
  }),
});

function createDefaultState() {
  return {
    version: STATE_VERSION,
    totalPoints: 0,
    activeIds: [],
  };
}

function getSpentPoints(activeIds) {
  return activeIds.reduce((sum, id) => sum + (META_UPGRADES[id]?.cost ?? 0), 0);
}

function normalizeState(candidate) {
  const activeIds = new Set(
    (candidate?.activeIds ?? []).filter((id) => Boolean(META_UPGRADES[id])),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...activeIds]) {
      const requirements = META_UPGRADES[id]?.requirements ?? [];
      if (requirements.every((requirementId) => activeIds.has(requirementId))) continue;
      activeIds.delete(id);
      changed = true;
    }
  }

  const normalizedIds = [...activeIds];
  const requestedPoints = Math.max(0, Math.floor(Number(candidate?.totalPoints) || 0));
  const totalPoints = Math.max(requestedPoints, getSpentPoints(normalizedIds));

  return {
    version: STATE_VERSION,
    totalPoints,
    activeIds: normalizedIds,
  };
}

function loadState() {
  if (typeof window === 'undefined' || !window.localStorage) return createDefaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn('Could not load meta-upgrade progress.', error);
    return createDefaultState();
  }
}

let metaUpgradeState = loadState();

function persistState() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(metaUpgradeState));
  } catch (error) {
    console.warn('Could not save meta-upgrade progress.', error);
  }
}

export function resetMetaUpgradeProgress() {
  metaUpgradeState = createDefaultState();
  persistState();
  return getMetaUpgradeState();
}

export function getMetaUpgradeState() {
  const activeIds = [...metaUpgradeState.activeIds];
  const spentPoints = getSpentPoints(activeIds);
  return {
    version: metaUpgradeState.version,
    totalPoints: metaUpgradeState.totalPoints,
    spentPoints,
    availablePoints: Math.max(0, metaUpgradeState.totalPoints - spentPoints),
    activeIds,
  };
}

export function isMetaUpgradeActive(id) {
  return metaUpgradeState.activeIds.includes(id);
}

export function getMetaUpgradeDefinition(id) {
  return META_UPGRADES[id] ?? null;
}

export function canActivateMetaUpgrade(id) {
  const definition = META_UPGRADES[id];
  if (!definition || isMetaUpgradeActive(id)) return false;
  if (!definition.requirements.every((requirementId) => isMetaUpgradeActive(requirementId))) return false;
  return getMetaUpgradeState().availablePoints >= definition.cost;
}

export function activateMetaUpgrade(id) {
  if (!canActivateMetaUpgrade(id)) return false;
  metaUpgradeState = normalizeState({
    ...metaUpgradeState,
    activeIds: [...metaUpgradeState.activeIds, id],
  });
  persistState();
  return true;
}

function collectDependentIds(rootId) {
  const removed = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of metaUpgradeState.activeIds) {
      if (removed.has(id)) continue;
      const requirements = META_UPGRADES[id]?.requirements ?? [];
      if (!requirements.some((requirementId) => removed.has(requirementId))) continue;
      removed.add(id);
      changed = true;
    }
  }
  return removed;
}

export function refundMetaUpgrade(id) {
  if (!isMetaUpgradeActive(id)) return false;
  const removedIds = collectDependentIds(id);
  metaUpgradeState = normalizeState({
    ...metaUpgradeState,
    activeIds: metaUpgradeState.activeIds.filter((activeId) => !removedIds.has(activeId)),
  });
  persistState();
  return true;
}

export function grantMetaUpgradePoints(amount = 1) {
  const points = Math.max(0, Math.floor(Number(amount) || 0));
  if (points <= 0) return getMetaUpgradeState();
  metaUpgradeState = normalizeState({
    ...metaUpgradeState,
    totalPoints: metaUpgradeState.totalPoints + points,
  });
  persistState();
  return getMetaUpgradeState();
}
