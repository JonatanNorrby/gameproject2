const STORAGE_KEY = 'nightfall-protocol.permanent-gold.v1';
const LEGACY_STORAGE_KEY = 'nightfall-protocol.meta-upgrades.v1';
const STATE_VERSION = 3;
const LEGACY_POINT_GOLD_VALUE = 10;

export const BEEFED_UP_HP_BONUS = 50;
export const BEEFED_UP_HP_BY_RANK = Object.freeze([0, 50, 100, 150]);

function rankedUpgrade({ id, name, costs, color, description, rankDescriptions, maxRank = costs.length }) {
  return Object.freeze({
    id,
    name,
    cost: costs[0],
    costs: Object.freeze([...costs]),
    maxRank,
    color,
    description,
    rankDescriptions: Object.freeze([...rankDescriptions]),
  });
}

export const CAPTAIN_CALL_UPGRADE_IDS = Object.freeze({
  vale: 'vale_call',
  mercer: 'mercer_call',
  thorne: 'thorne_call',
});

export const PERMANENT_UPGRADES = Object.freeze({
  squad_doctrine: rankedUpgrade({
    id: 'squad_doctrine',
    name: 'Squad Doctrine',
    costs: [100, 225, 400],
    color: '#7ef9d4',
    description: 'Choose a combat doctrine before each run. Higher ranks strengthen every doctrine.',
    rankDescriptions: [
      'Unlock Squad Doctrines and their base combat bonuses.',
      'Strengthen all doctrine bonuses to an advanced tier.',
      'Maximize all doctrine bonuses for specialized late-run builds.',
    ],
  }),
  captain_slots: rankedUpgrade({
    id: 'captain_slots',
    name: 'Captain Slots',
    costs: [150, 400],
    maxRank: 2,
    color: '#74c9ff',
    description: 'Expand the command roster carried into each run.',
    rankDescriptions: [
      'Unlock a second Captain slot.',
      'Unlock a third Captain slot so three Captains can fight together.',
    ],
  }),
  beefed_up: rankedUpgrade({
    id: 'beefed_up',
    name: 'Beefed Up',
    costs: [100, 200, 350],
    color: '#ff8f70',
    description: 'Increase maximum HP for every player squad unit.',
    rankDescriptions: [
      'All player squad units gain +50 maximum HP.',
      'Increase the permanent bonus to +100 maximum HP.',
      'Increase the permanent bonus to +150 maximum HP.',
    ],
  }),
  treasure_chests: rankedUpgrade({
    id: 'treasure_chests',
    name: 'Treasure Chests',
    costs: [125, 250, 450],
    color: '#f7c94b',
    description: 'Eligible enemies can drop treasure chests containing a fixed 25 XP and 2 Gold. Higher ranks improve drop frequency.',
    rankDescriptions: [
      '2.5% chest chance • 2 Gold • 25 XP.',
      '4% chest chance • 2 Gold • 25 XP.',
      '6% chest chance • 2 Gold • 25 XP.',
    ],
  }),
  drone_pickup: rankedUpgrade({
    id: 'drone_pickup',
    name: 'Drone Pickup',
    costs: [100, 225, 400],
    color: '#79e7ff',
    description: 'Support drones collect XP gems beneath their flight path. Higher ranks widen the collection field.',
    rankDescriptions: [
      'Drones collect XP within 140 range.',
      'Increase Drone Pickup range to 210.',
      'Increase Drone Pickup range to 280.',
    ],
  }),
  vale_call: rankedUpgrade({
    id: 'vale_call',
    name: 'Vale — Full Volley',
    costs: [150, 300, 500],
    color: '#69cfff',
    description: "Unlock and strengthen Captain Vale's Full Volley Captain Call.",
    rankDescriptions: [
      'Unlock Full Volley • 60s cooldown • 5.2s duration.',
      '50s cooldown • 6.5s duration • faster volleys and longer range.',
      '40s cooldown • 8s duration • maximum volley speed and range.',
    ],
  }),
  mercer_call: rankedUpgrade({
    id: 'mercer_call',
    name: 'Mercer — Missile Barrage',
    costs: [150, 300, 500],
    color: '#ffb35c',
    description: "Unlock and strengthen Captain Mercer's Missile Barrage Captain Call.",
    rankDescriptions: [
      'Unlock Missile Barrage • 60s cooldown • 24 rockets.',
      '50s cooldown • 32 rockets • larger explosions and more range.',
      '40s cooldown • 40 rockets • maximum explosion size and range.',
    ],
  }),
  thorne_call: rankedUpgrade({
    id: 'thorne_call',
    name: 'Thorne — Frenzy',
    costs: [150, 300, 500],
    color: '#ff9adf',
    description: "Unlock and strengthen Captain Thorne's Frenzy Captain Call.",
    rankDescriptions: [
      'Unlock Frenzy • 60s cooldown • 6.5s duration.',
      '50s cooldown • 8s duration • stronger, faster pulses with more reach.',
      '40s cooldown • 10s duration • maximum damage, pulse rate and reach.',
    ],
  }),
});

export const SQUAD_DOCTRINES = Object.freeze({
  combined_arms: Object.freeze({
    id: 'combined_arms',
    name: 'Combined Arms',
    color: '#7ef9d4',
    description: 'Class diversity increases squad damage and attack speed. The exact bonus scales with Squad Doctrine rank.',
  }),
  // Keep the legacy id so existing saved selections continue to work.
  massed_infantry: Object.freeze({
    id: 'massed_infantry',
    name: 'Specialization',
    color: '#74c9ff',
    description: 'Duplicates of the same living class strengthen that class. The exact bonus scales with Squad Doctrine rank.',
  }),
  shock_assault: Object.freeze({
    id: 'shock_assault',
    name: 'Shock Assault',
    color: '#ff7aa8',
    description: 'Melee and true close-range units gain damage, attack speed and range. The exact bonus scales with Squad Doctrine rank.',
  }),
});

const LEGACY_SLOT_ALIASES = Object.freeze({
  second_captain_slot: 1,
  third_captain_slot: 2,
});

function createDefaultState() {
  return {
    version: STATE_VERSION,
    gold: 0,
    ranks: {},
    activeIds: [],
    selectedDoctrineId: null,
  };
}

function clampRank(id, value) {
  const definition = PERMANENT_UPGRADES[id];
  if (!definition) return 0;
  return Math.max(0, Math.min(definition.maxRank, Math.floor(Number(value) || 0)));
}

function migrateRanks(candidate) {
  const ranks = {};
  for (const id of Object.keys(PERMANENT_UPGRADES)) {
    const rank = clampRank(id, candidate?.ranks?.[id]);
    if (rank > 0) ranks[id] = rank;
  }

  const ownedIds = new Set(candidate?.ownedIds ?? []);
  for (const id of Object.keys(PERMANENT_UPGRADES)) {
    if (!ranks[id] && ownedIds.has(id)) ranks[id] = 1;
  }

  // Preserve progression bought before the ranked-shop remodel.
  if (ownedIds.has('second_captain_slot')) {
    ranks.captain_slots = Math.max(ranks.captain_slots ?? 0, 1);
  }
  if (ownedIds.has('third_captain_slot')) {
    ranks.captain_slots = Math.max(ranks.captain_slots ?? 0, 2);
  }
  if (ownedIds.has('captains_call')) {
    for (const id of Object.values(CAPTAIN_CALL_UPGRADE_IDS)) {
      ranks[id] = Math.max(ranks[id] ?? 0, 1);
    }
  }

  return ranks;
}

function migrateActiveIds(candidate, ranks) {
  const ownedVisibleIds = Object.keys(ranks).filter((id) => ranks[id] > 0);
  const requested = Array.isArray(candidate?.activeIds)
    ? new Set(candidate.activeIds)
    : new Set(ownedVisibleIds);
  const active = new Set();

  for (const id of ownedVisibleIds) {
    if (requested.has(id)) active.add(id);
  }

  if (requested.has('second_captain_slot') || requested.has('third_captain_slot')) {
    if ((ranks.captain_slots ?? 0) > 0) active.add('captain_slots');
  }
  if (requested.has('captains_call')) {
    for (const id of Object.values(CAPTAIN_CALL_UPGRADE_IDS)) {
      if ((ranks[id] ?? 0) > 0) active.add(id);
    }
  }

  // Saves from the pre-toggle era or from the old global Captain Call should
  // remain enabled after migration.
  if (!Array.isArray(candidate?.activeIds)) {
    for (const id of ownedVisibleIds) active.add(id);
  }

  return ownedVisibleIds.filter((id) => active.has(id));
}

function normalizeState(candidate) {
  const ranks = migrateRanks(candidate);
  const activeIds = migrateActiveIds(candidate, ranks);
  const doctrineOwned = (ranks.squad_doctrine ?? 0) > 0;
  const requestedDoctrine = candidate?.selectedDoctrineId;
  const selectedDoctrineId = doctrineOwned && SQUAD_DOCTRINES[requestedDoctrine]
    ? requestedDoctrine
    : doctrineOwned
      ? 'combined_arms'
      : null;

  return {
    version: STATE_VERSION,
    gold: Math.max(0, Math.floor(Number(candidate?.gold) || 0)),
    ranks,
    activeIds,
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

function getVisibleOwnedIds() {
  return Object.keys(PERMANENT_UPGRADES)
    .filter((id) => (progressionState.ranks[id] ?? 0) > 0);
}

export function getPermanentProgressionState() {
  return {
    version: progressionState.version,
    gold: progressionState.gold,
    ranks: { ...progressionState.ranks },
    ownedIds: getVisibleOwnedIds(),
    activeIds: [...progressionState.activeIds],
    selectedDoctrineId: progressionState.selectedDoctrineId,
  };
}

export function getPermanentUpgradeRank(id) {
  if (LEGACY_SLOT_ALIASES[id]) {
    return (progressionState.ranks.captain_slots ?? 0) >= LEGACY_SLOT_ALIASES[id] ? 1 : 0;
  }
  if (id === 'captains_call') {
    return Math.max(
      0,
      ...Object.values(CAPTAIN_CALL_UPGRADE_IDS).map((callId) => progressionState.ranks[callId] ?? 0),
    );
  }
  return progressionState.ranks[id] ?? 0;
}

export function getPermanentUpgradeNextCost(id) {
  const definition = PERMANENT_UPGRADES[id];
  if (!definition) return null;
  const rank = getPermanentUpgradeRank(id);
  return rank >= definition.maxRank ? null : definition.costs[rank];
}

export function getPermanentUpgradeRankDescription(id, rank = getPermanentUpgradeRank(id)) {
  const definition = PERMANENT_UPGRADES[id];
  if (!definition || rank <= 0) return '';
  return definition.rankDescriptions[Math.min(definition.maxRank, rank) - 1] ?? definition.description;
}

export function getBeefedUpHpBonus() {
  if (!isPermanentUpgradeActive('beefed_up')) return 0;
  const rank = getPermanentUpgradeRank('beefed_up');
  return BEEFED_UP_HP_BY_RANK[rank] ?? BEEFED_UP_HP_BY_RANK.at(-1);
}

export function isPermanentUpgradeOwned(id) {
  if (LEGACY_SLOT_ALIASES[id]) {
    return (progressionState.ranks.captain_slots ?? 0) >= LEGACY_SLOT_ALIASES[id];
  }
  if (id === 'captains_call') {
    return Object.values(CAPTAIN_CALL_UPGRADE_IDS)
      .some((callId) => (progressionState.ranks[callId] ?? 0) > 0);
  }
  return getPermanentUpgradeRank(id) > 0;
}

export function isPermanentUpgradeActive(id) {
  if (LEGACY_SLOT_ALIASES[id]) {
    return isPermanentUpgradeOwned(id) && progressionState.activeIds.includes('captain_slots');
  }
  if (id === 'captains_call') {
    return Object.values(CAPTAIN_CALL_UPGRADE_IDS)
      .some((callId) => isPermanentUpgradeActive(callId));
  }
  return isPermanentUpgradeOwned(id) && progressionState.activeIds.includes(id);
}

export function getPermanentUpgradeDefinition(id) {
  if (LEGACY_SLOT_ALIASES[id]) return PERMANENT_UPGRADES.captain_slots;
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
  if (!definition) return false;
  const currentRank = getPermanentUpgradeRank(id);
  const nextCost = getPermanentUpgradeNextCost(id);
  return Boolean(
    currentRank < definition.maxRank
    && Number.isFinite(nextCost)
    && progressionState.gold >= nextCost
  );
}

export function purchasePermanentUpgrade(id) {
  if (!canPurchasePermanentUpgrade(id)) return false;
  const definition = PERMANENT_UPGRADES[id];
  const currentRank = getPermanentUpgradeRank(id);
  const nextRank = currentRank + 1;
  const cost = definition.costs[currentRank];
  const wasOwned = currentRank > 0;
  progressionState = normalizeState({
    ...progressionState,
    gold: progressionState.gold - cost,
    ranks: {
      ...progressionState.ranks,
      [id]: nextRank,
    },
    activeIds: wasOwned
      ? progressionState.activeIds
      : [...progressionState.activeIds, id],
    selectedDoctrineId: id === 'squad_doctrine'
      ? (progressionState.selectedDoctrineId ?? 'combined_arms')
      : progressionState.selectedDoctrineId,
  });
  persistState();
  return true;
}

function setVisibleUpgradeActive(id, enabled) {
  if (!isPermanentUpgradeOwned(id) || !PERMANENT_UPGRADES[id]) return false;
  const shouldEnable = Boolean(enabled);
  const currentlyActive = isPermanentUpgradeActive(id);
  if (shouldEnable === currentlyActive) return true;

  const activeIds = shouldEnable
    ? [...progressionState.activeIds, id]
    : progressionState.activeIds.filter((activeId) => activeId !== id);
  progressionState = normalizeState({
    ...progressionState,
    activeIds,
  });
  persistState();
  return true;
}

export function setPermanentUpgradeActive(id, enabled) {
  if (LEGACY_SLOT_ALIASES[id]) return setVisibleUpgradeActive('captain_slots', enabled);
  if (id === 'captains_call') {
    const ownedCalls = Object.values(CAPTAIN_CALL_UPGRADE_IDS)
      .filter((callId) => isPermanentUpgradeOwned(callId));
    if (ownedCalls.length === 0) return false;
    let changed = true;
    for (const callId of ownedCalls) changed = setVisibleUpgradeActive(callId, enabled) && changed;
    return changed;
  }
  return setVisibleUpgradeActive(id, enabled);
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
