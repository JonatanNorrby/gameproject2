const STORAGE_KEY = 'nightfall-protocol.prestige.v1';
const STATE_VERSION = 1;

function createDefaultState() {
  return {
    version: STATE_VERSION,
    attackRateBonus: 0,
    highestRunLevel: 0,
  };
}

function normalizeState(candidate) {
  return {
    version: STATE_VERSION,
    attackRateBonus: Math.max(0, Math.floor(Number(candidate?.attackRateBonus) || 0)),
    highestRunLevel: Math.max(0, Math.floor(Number(candidate?.highestRunLevel) || 0)),
  };
}

function loadState() {
  if (typeof window === 'undefined' || !window.localStorage) return createDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createDefaultState();
  } catch (error) {
    console.warn('Could not load prestige progression.', error);
    return createDefaultState();
  }
}

let prestigeState = loadState();

function persistState() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prestigeState));
  } catch (error) {
    console.warn('Could not save prestige progression.', error);
  }
}

export function getPrestigeState() {
  return { ...prestigeState };
}

export function getPrestigeAttackRateMultiplier() {
  return 1 + prestigeState.attackRateBonus / 100;
}

export function recordHighestRunLevel(level) {
  const normalized = Math.max(0, Math.floor(Number(level) || 0));
  if (normalized <= prestigeState.highestRunLevel) return getPrestigeState();
  prestigeState = normalizeState({
    ...prestigeState,
    highestRunLevel: normalized,
  });
  persistState();
  return getPrestigeState();
}

export function getPrestigePreview() {
  const current = prestigeState.attackRateBonus;
  const gain = prestigeState.highestRunLevel;
  return {
    current,
    gain,
    total: current + gain,
    highestRunLevel: prestigeState.highestRunLevel,
  };
}

export function applyPrestige() {
  const preview = getPrestigePreview();
  prestigeState = normalizeState({
    attackRateBonus: preview.total,
    highestRunLevel: 0,
  });
  persistState();
  return {
    ...getPrestigeState(),
    gainedAttackRate: preview.gain,
  };
}

export function resetPrestigeProgress() {
  prestigeState = createDefaultState();
  persistState();
  return getPrestigeState();
}
