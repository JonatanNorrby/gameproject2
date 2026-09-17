import { Game, UI as PreviousUI } from './bossVisibilityFix.js';
import { CAPTAINS } from '../data/content.js';
import { isPermanentUpgradeOwned } from '../data/metaUpgrades.js';
import { formatKeyBinding, getKeyBinding } from '../data/settings.js';

const ICON_ROOT = './assets/captain_ability_icons';
const SLOT_DEFINITIONS = Object.freeze([
  Object.freeze({
    slot: 'primary',
    action: 'primaryCall',
    buttonProperty: 'captainCallPrimary',
    fallbackCaptainId: 'vale',
  }),
  Object.freeze({
    slot: 'secondary',
    action: 'secondaryCall',
    buttonProperty: 'captainCallSecondary',
    fallbackCaptainId: 'mercer',
  }),
  Object.freeze({
    slot: 'tertiary',
    action: 'tertiaryCall',
    buttonProperty: 'captainCallTertiary',
    fallbackCaptainId: 'thorne',
  }),
]);

const ICON_FILES = Object.freeze({
  vale: 'icon_vale.svg',
  mercer: 'icon_mercer.svg',
  thorne: 'icon_thorne.svg',
});

function getCaptainIconId(soldier, fallbackCaptainId) {
  const captainId = soldier?.unit?.captainId;
  return ICON_FILES[captainId] ? captainId : fallbackCaptainId;
}

function ensureButtonStructure(button) {
  if (!button || button.querySelector('.captain-ability-button__icon')) return;

  const iconShell = document.createElement('span');
  iconShell.className = 'captain-ability-button__icon-shell';

  const icon = document.createElement('img');
  icon.className = 'captain-ability-button__icon';
  icon.alt = '';
  icon.draggable = false;

  const fallback = document.createElement('span');
  fallback.className = 'captain-ability-button__fallback';
  fallback.setAttribute('aria-hidden', 'true');

  icon.addEventListener('load', () => {
    icon.hidden = false;
    fallback.hidden = true;
  });
  icon.addEventListener('error', () => {
    icon.hidden = true;
    fallback.hidden = false;
  });

  iconShell.append(icon, fallback);

  const key = document.createElement('span');
  key.className = 'captain-ability-button__key';
  key.setAttribute('aria-hidden', 'true');

  const cooldown = document.createElement('span');
  cooldown.className = 'captain-ability-button__cooldown';
  cooldown.setAttribute('aria-hidden', 'true');

  button.replaceChildren(iconShell, key, cooldown);
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.installCaptainAbilityHudPresentation();
  }

  installCaptainAbilityHudPresentation() {
    const hud = this.captainCallHud ?? document.querySelector('#captain-call-hud');
    const hudBottom = document.querySelector('.hud__bottom');
    const xpCard = hudBottom?.querySelector('.hud-card--wide');
    if (!hud || !hudBottom || !xpCard) return;

    let center = document.querySelector('#bottom-hud-center');
    if (!center) {
      center = document.createElement('div');
      center.id = 'bottom-hud-center';
      center.className = 'bottom-hud-center';
      xpCard.before(center);
      center.append(xpCard);
    }

    hud.removeAttribute('style');
    hud.className = 'captain-ability-hud';
    hud.hidden = true;
    center.prepend(hud);

    for (const definition of SLOT_DEFINITIONS) {
      const button = this[definition.buttonProperty]
        ?? hud.querySelector(`#captain-call-${definition.slot}`);
      if (!button) continue;
      this[definition.buttonProperty] = button;
      button.removeAttribute('style');
      button.className = 'captain-ability-button';
      button.dataset.captainAbilitySlot = definition.slot;
      ensureButtonStructure(button);
    }
  }

  renderCaptainCallHud(game) {
    const hud = this.captainCallHud ?? document.querySelector('#captain-call-hud');
    if (!hud) return;

    const owned = isPermanentUpgradeOwned('captains_call');
    const visible = Boolean(owned && game?.running);
    hud.hidden = !visible;
    if (!visible) return;

    for (const definition of SLOT_DEFINITIONS) {
      const button = this[definition.buttonProperty]
        ?? hud.querySelector(`#captain-call-${definition.slot}`);
      if (!button) continue;
      ensureButtonStructure(button);

      const soldier = game.getCaptainSoldierBySlot?.(definition.slot) ?? null;
      const optionalSlot = definition.slot !== 'primary';
      button.hidden = optionalSlot && !soldier;

      if (!soldier) {
        button.disabled = true;
        button.classList.remove('captain-ability-button--ready');
        button.setAttribute('aria-label', 'Captain Call unavailable');
        button.title = 'Captain Call unavailable';
        continue;
      }

      const iconCaptainId = getCaptainIconId(soldier, definition.fallbackCaptainId);
      const captain = CAPTAINS[soldier.unit.captainId] ?? CAPTAINS[iconCaptainId];
      const icon = button.querySelector('.captain-ability-button__icon');
      const fallback = button.querySelector('.captain-ability-button__fallback');
      const key = button.querySelector('.captain-ability-button__key');
      const cooldown = button.querySelector('.captain-ability-button__cooldown');
      const iconSource = `${ICON_ROOT}/${ICON_FILES[iconCaptainId]}`;

      if (icon && icon.dataset.source !== iconSource) {
        icon.dataset.source = iconSource;
        icon.hidden = false;
        icon.src = iconSource;
      }
      if (fallback) {
        fallback.textContent = captain?.shortLabel ?? iconCaptainId.slice(0, 3).toUpperCase();
      }

      const keyText = formatKeyBinding(getKeyBinding(definition.action));
      if (key) key.textContent = keyText;

      const remaining = game.getCaptainCallCooldownRemaining?.(definition.slot) ?? Infinity;
      const ready = remaining <= 0.05 && !game.paused;
      button.disabled = !ready;
      button.classList.toggle('captain-ability-button--ready', ready);

      if (cooldown) {
        cooldown.textContent = ready
          ? ''
          : Number.isFinite(remaining)
            ? (remaining >= 10 ? String(Math.ceil(remaining)) : remaining.toFixed(1))
            : '—';
      }

      const captainName = captain?.name ?? 'Captain';
      const status = ready
        ? 'ready'
        : Number.isFinite(remaining)
          ? `${remaining.toFixed(1)} seconds remaining`
          : 'unavailable';
      const description = `${keyText}: ${captainName} Captain Call, ${status}`;
      button.setAttribute('aria-label', description);
      button.title = description;
    }
  }
}

export { Game };
