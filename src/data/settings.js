const SETTINGS_STORAGE_KEY = 'nightfall-protocol-settings-v1';

export const CONTROL_ACTIONS = Object.freeze({
  moveUp: Object.freeze({ label: 'Move Up', defaultKey: 'w' }),
  moveLeft: Object.freeze({ label: 'Move Left', defaultKey: 'a' }),
  moveDown: Object.freeze({ label: 'Move Down', defaultKey: 's' }),
  moveRight: Object.freeze({ label: 'Move Right', defaultKey: 'd' }),
  primaryCall: Object.freeze({ label: 'Primary Captain Call', defaultKey: 'q' }),
  secondaryCall: Object.freeze({ label: 'Second Captain Call', defaultKey: 'e' }),
  tertiaryCall: Object.freeze({ label: 'Third Captain Call', defaultKey: 'r' }),
});

const RESERVED_BINDING_KEYS = new Set([
  'alt',
  'altgraph',
  'capslock',
  'control',
  'escape',
  'meta',
  'shift',
  'tab',
]);

function createDefaultBindings() {
  return Object.fromEntries(
    Object.entries(CONTROL_ACTIONS).map(([action, definition]) => [action, definition.defaultKey]),
  );
}

const DEFAULT_SETTINGS = Object.freeze({
  disableArtworkRotation: false,
  mouseSteering: false,
  keybindings: Object.freeze(createDefaultBindings()),
});

let cachedSettings = null;

function getStorage() {
  try {
    return globalThis.window?.localStorage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function normalizeKeyBinding(key) {
  if (key === ' ') return 'space';
  const normalized = String(key ?? '').toLowerCase();
  if (normalized === 'spacebar') return 'space';
  if (normalized === 'esc') return 'escape';
  return normalized;
}

function sanitizeBindings(candidate) {
  const next = createDefaultBindings();
  if (!candidate || typeof candidate !== 'object') return next;

  // Apply persisted bindings in action order using the same swap semantics as
  // live rebinding. This guarantees that every action stays unique even when
  // older/corrupt saved settings contain duplicate keys.
  for (const action of Object.keys(CONTROL_ACTIONS)) {
    const normalized = normalizeKeyBinding(candidate[action]);
    if (!normalized || RESERVED_BINDING_KEYS.has(normalized)) continue;

    const previousKey = next[action];
    const conflictingAction = Object.keys(CONTROL_ACTIONS).find((candidateAction) => (
      candidateAction !== action && next[candidateAction] === normalized
    ));
    if (conflictingAction) next[conflictingAction] = previousKey;
    next[action] = normalized;
  }
  return next;
}

function sanitizeSettings(candidate) {
  return {
    disableArtworkRotation: Boolean(candidate?.disableArtworkRotation),
    mouseSteering: Boolean(candidate?.mouseSteering),
    keybindings: sanitizeBindings(candidate?.keybindings),
  };
}

function loadSettings() {
  const storage = getStorage();
  if (!storage) return sanitizeSettings(DEFAULT_SETTINGS);

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : sanitizeSettings(DEFAULT_SETTINGS);
  } catch {
    return sanitizeSettings(DEFAULT_SETTINGS);
  }
}

function getMutableSettings() {
  cachedSettings ??= loadSettings();
  return cachedSettings;
}

function saveSettings() {
  const storage = getStorage();
  if (!storage || !cachedSettings) return;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(cachedSettings));
  } catch {
    // Settings remain active for the current session even if persistence fails.
  }
}

function emitSettingsChanged() {
  if (typeof globalThis.window?.dispatchEvent !== 'function') return;
  if (typeof globalThis.CustomEvent !== 'function') return;
  globalThis.window.dispatchEvent(new CustomEvent('nightfall-settings-changed', {
    detail: getGameSettings(),
  }));
}

export function getGameSettings() {
  const settings = getMutableSettings();
  return {
    disableArtworkRotation: settings.disableArtworkRotation,
    mouseSteering: settings.mouseSteering,
    keybindings: { ...settings.keybindings },
  };
}

export function getKeyBinding(action) {
  return getMutableSettings().keybindings[action]
    ?? CONTROL_ACTIONS[action]?.defaultKey
    ?? '';
}

export function matchesKeyBinding(action, key) {
  return normalizeKeyBinding(key) === getKeyBinding(action);
}

export function setDisableArtworkRotation(enabled) {
  getMutableSettings().disableArtworkRotation = Boolean(enabled);
  saveSettings();
  emitSettingsChanged();
  return getGameSettings();
}

export function setMouseSteering(enabled) {
  getMutableSettings().mouseSteering = Boolean(enabled);
  saveSettings();
  emitSettingsChanged();
  return getGameSettings();
}

export function setKeyBinding(action, key) {
  if (!CONTROL_ACTIONS[action]) return null;
  const normalized = normalizeKeyBinding(key);
  if (!normalized || RESERVED_BINDING_KEYS.has(normalized)) return null;

  const settings = getMutableSettings();
  const previousKey = settings.keybindings[action];
  const conflictingAction = Object.keys(CONTROL_ACTIONS).find((candidate) => (
    candidate !== action && settings.keybindings[candidate] === normalized
  ));

  if (conflictingAction) settings.keybindings[conflictingAction] = previousKey;
  settings.keybindings[action] = normalized;
  saveSettings();
  emitSettingsChanged();
  return getGameSettings();
}

export function resetKeyBindings() {
  getMutableSettings().keybindings = createDefaultBindings();
  saveSettings();
  emitSettingsChanged();
  return getGameSettings();
}

export function formatKeyBinding(key) {
  const normalized = normalizeKeyBinding(key);
  const labels = {
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    space: 'SPACE',
    enter: 'ENTER',
    backspace: 'BACKSPACE',
    delete: 'DELETE',
  };
  return labels[normalized] ?? (normalized.length === 1 ? normalized.toUpperCase() : normalized.toUpperCase());
}
