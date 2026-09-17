import { Game as PreviousGame, UI as PreviousUI } from './captainSlotCompatibility.js';
import {
  CONTROL_ACTIONS,
  formatKeyBinding,
  getGameSettings,
  getKeyBinding,
  matchesKeyBinding,
  resetKeyBindings,
  setDisableArtworkRotation,
  setKeyBinding,
} from '../data/settings.js';

const CAPTAIN_CALL_ACTIONS = Object.freeze([
  Object.freeze({ slot: 'primary', action: 'primaryCall' }),
  Object.freeze({ slot: 'secondary', action: 'secondaryCall' }),
  Object.freeze({ slot: 'tertiary', action: 'tertiaryCall' }),
]);

const ISSUE_54_STYLE_ID = 'issue-54-presentation';
const ISSUE_54_STYLES = `
  .boot-screen::after,
  .boot-screen__track,
  .boot-screen__version {
    display: none !important;
  }

  #version-text,
  #start-screen .main-menu__identity .eyebrow,
  #start-screen .main-menu__captain-kicker,
  #start-screen .main-menu__brief {
    display: none !important;
  }

  #start-screen .main-menu__body {
    grid-template-columns: minmax(230px, 300px) minmax(360px, 1fr);
  }

  #start-screen .main-menu__footer {
    justify-content: flex-start;
  }

  #start-screen .main-menu__build::before {
    width: 9px;
    height: 9px;
    background: #63cfff;
    box-shadow:
      0 0 7px rgba(99, 207, 255, .98),
      0 0 20px rgba(99, 207, 255, .66),
      0 0 38px rgba(99, 207, 255, .3);
  }

  #start-screen .main-menu__debug-launch {
    position: fixed;
    left: max(24px, env(safe-area-inset-left));
    bottom: max(58px, calc(env(safe-area-inset-bottom) + 44px));
    z-index: 95;
    width: auto;
    min-height: 0;
    margin: 0;
    border: 0;
    border-radius: 4px;
    padding: 4px 7px;
    background: rgba(4, 12, 17, .22);
    color: #36505b;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .16em;
    text-transform: uppercase;
    opacity: .42;
    box-shadow: none;
    clip-path: none;
    cursor: pointer;
    transition: color 120ms ease, opacity 120ms ease, background 120ms ease;
  }

  #start-screen .main-menu__debug-launch::before {
    content: none;
    display: none;
  }

  #start-screen .main-menu__debug-launch:hover,
  #start-screen .main-menu__debug-launch[aria-expanded="true"] {
    transform: none;
    border-color: transparent;
    background: rgba(18, 43, 52, .42);
    color: #7197a5;
    opacity: .82;
  }

  @media (max-width: 700px) {
    #start-screen .main-menu__build,
    #start-screen .main-menu__footer {
      display: flex;
    }
  }
`;

function isEditableTarget(target) {
  const tag = target?.tagName?.toLowerCase?.();
  return tag === 'input' || tag === 'select' || tag === 'textarea' || target?.isContentEditable;
}

function syncOpModeButton(button, enabled) {
  if (!button) return;
  button.disabled = false;
  button.setAttribute('aria-pressed', String(enabled));
  button.dataset.opModeActive = String(enabled);

  const title = button.querySelector('strong');
  if (title) title.textContent = enabled ? 'Disable OP Mode' : 'Enable OP Mode';

  const detail = button.querySelector('small');
  if (detail) {
    detail.textContent = enabled
      ? '+5000% attack rate active'
      : '+5000% attack rate';
  }
}

// #70: the monster hit-flash layer owns drawEnemies() so it can recolor normal
// mob sprites. That override intentionally does not call super.drawEnemies(),
// because doing so would draw every normal enemy twice. Boss bodies and
// Broodmother eggs used to be appended by older drawEnemies() layers, though,
// so restore only those inherited encounter renderers here at the final layer.
export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);

    // #53: replace the legacy hard-coded Q/E/R listeners installed by earlier
    // feature layers with one settings-aware Captain Call handler.
    if (this.captainCallKeyHandler) {
      window.removeEventListener('keydown', this.captainCallKeyHandler);
    }
    if (this.thirdCaptainCallKeyHandler) {
      window.removeEventListener('keydown', this.thirdCaptainCallKeyHandler);
    }

    this.settingsCaptainCallKeyHandler = (event) => {
      if (event.repeat || isEditableTarget(event.target)) return;
      for (const { slot, action } of CAPTAIN_CALL_ACTIONS) {
        if (!matchesKeyBinding(action, event.key)) continue;
        this.activateCaptainCall(slot);
        break;
      }
    };
    window.addEventListener('keydown', this.settingsCaptainCallKeyHandler);
  }

  // #161: boss arrival sequences intentionally clean normal combat clutter, but
  // ground powerups and already-active timed buffs are player rewards and must
  // survive the transition. Freeze Fury's remaining duration and prevent ground
  // pickups from being consumed while any boss intro is active.
  isBossIntroActive() {
    return Boolean(
      this.wardenIntro?.active
      || this.broodIntro?.active
      || this.cipherIntro?.active
    );
  }

  update(dt) {
    const elapsedBefore = Number(this.elapsed) || 0;
    const furyUntilBefore = Number(this.dropEffects?.furyUntil) || 0;
    const furyRemainingBefore = Math.max(0, furyUntilBefore - elapsedBefore);
    const introWasActive = this.isBossIntroActive();

    super.update(dt);

    const introIsActive = this.isBossIntroActive();
    if ((introWasActive || introIsActive) && furyRemainingBefore > 0 && this.dropEffects) {
      this.dropEffects.furyUntil = Math.max(
        Number(this.dropEffects.furyUntil) || 0,
        (Number(this.elapsed) || 0) + furyRemainingBefore,
      );
    }
  }

  updateGroundDrops() {
    if (this.isBossIntroActive()) return;
    super.updateGroundDrops();
  }

  // #51: OP mode used to be one-way. Keep the original debug flag as the single
  // source of truth, but expose an explicit setter so the debug UI can turn the
  // attack-speed multiplier both on and off during the same session.
  debugSetOpMode(enabled) {
    if (!this.debug) this.debug = {};
    this.debug.opMode = Boolean(enabled);
    this.combatSystem?.fireCooldowns?.clear?.();
    return this.debug.opMode;
  }

  // #53: unit artwork can be locked upright without altering facing, movement,
  // targeting or attack logic. Supreme Commander's existing no-rotation rule is
  // still inherited when this setting is disabled.
  getUnitSpriteRotation(sprite, animationName) {
    if (getGameSettings().disableArtworkRotation) return 0;
    return super.getUnitSpriteRotation(sprite, animationName);
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    this.drawBossEncounterEntities(ctx);
  }

  drawBossEncounterEntities(ctx) {
    // Broodmother eggs are encounter entities rather than ENEMY_TYPES mobs and
    // were also skipped when the normal-enemy renderer was replaced.
    this.drawBroodEggs?.(ctx);

    const warden = this.getActiveWarden?.();
    if (warden) this.drawWarden?.(ctx, warden);

    const broodmother = this.getActiveBroodmother?.();
    if (broodmother) this.drawBroodmother?.(ctx, broodmother);

    const cipher = this.getActiveCipher?.();
    if (cipher) this.drawCipher?.(ctx, cipher);
  }

  // #50: keep the Supreme Commander's soft animated glow, but remove the
  // distinct circular platform/ring underneath the unit.
  drawSupremeCommanderGlow(ctx) {
    const commander = this.getSupremeCommanderUnit?.();
    if (!commander) return;

    const pulse = 0.5 + 0.5 * Math.sin(this.animationClock * 2.8);
    const radius = 48 + pulse * 10;
    const gradient = ctx.createRadialGradient(
      this.player.x,
      this.player.y,
      8,
      this.player.x,
      this.player.y,
      radius,
    );
    gradient.addColorStop(0, `rgba(247, 215, 116, ${0.22 + pulse * 0.08})`);
    gradient.addColorStop(0.45, `rgba(126, 249, 212, ${0.12 + pulse * 0.06})`);
    gradient.addColorStop(1, 'rgba(126, 249, 212, 0)');

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);

    this.installIssue54PresentationStyles();
    this.applyIssue54Presentation();

    this.installSettingsStyles();
    this.versionText?.style && (this.versionText.style.display = 'none');
    const bootVersion = document.querySelector('#boot-version');
    if (bootVersion) bootVersion.style.display = 'none';
    this.installSettingsMenu();
    this.settingsScreen = document.querySelector('#settings-screen');
    this.settingsOpen = document.querySelector('#settings-open');
    this.settingsClose = document.querySelector('#settings-close');
    this.settingsBack = document.querySelector('#settings-back');
    this.settingsDisableRotation = document.querySelector('#settings-disable-rotation');
    this.settingsResetControls = document.querySelector('#settings-reset-controls');
    this.settingsVersion = document.querySelector('#settings-version');
    this.settingsCaptureAction = null;

    this.bindSettingsMenu();
    this.renderSettingsMenu();
  }

  installIssue54PresentationStyles() {
    if (document.querySelector(`#${ISSUE_54_STYLE_ID}`)) return;
    const style = document.createElement('style');
    style.id = ISSUE_54_STYLE_ID;
    style.textContent = ISSUE_54_STYLES;
    document.head?.append(style);
  }

  applyIssue54Presentation() {
    const bootEyebrow = document.querySelector('.boot-screen__eyebrow');
    if (bootEyebrow) {
      bootEyebrow.textContent = 'initialazing nightfall protocol command systems';
    }

    document.querySelector('.boot-screen__track')?.remove?.();
    document.querySelector('#boot-version')?.remove?.();
    document.querySelector('#start-screen .main-menu__identity .eyebrow')?.remove?.();
    document.querySelector('#start-screen .main-menu__captain-kicker')?.remove?.();
    document.querySelector('#start-screen .main-menu__brief')?.remove?.();

    const build = document.querySelector('#start-screen .main-menu__build');
    if (build) build.textContent = 'SYSTEM ONLINE';

    const footer = document.querySelector('#start-screen .main-menu__footer');
    if (footer) {
      const entries = [...footer.querySelectorAll('span')];
      if (entries[0]) entries[0].remove();
      const commandSystems = entries[1] ?? footer.querySelector('span');
      if (commandSystems) commandSystems.textContent = '// Nightfall command systems';
    }

    this.applyIssue54CaptainPrompt();
  }

  applyIssue54CaptainPrompt() {
    const summary = this.selectedCaptainSummary ?? document.querySelector('#selected-captain-summary');
    const card = summary?.querySelector('.selected-captain-card--empty');
    if (!card) return;

    card.querySelector('.selected-captain-card__label')?.remove?.();
    const title = card.querySelector('.selected-captain-card__info strong');
    if (title) title.textContent = 'Select Captain';
    const detail = card.querySelector('.selected-captain-card__role');
    if (detail) detail.textContent = 'Click here to choose Captain';
  }

  requireCaptainSelection(...args) {
    const result = super.requireCaptainSelection(...args);
    const startButton = document.querySelector('#start-button');
    if (startButton) startButton.textContent = 'Select Captain';
    this.applyIssue54CaptainPrompt();
    return result;
  }

  renderSelectedCaptainSummary(...args) {
    const result = super.renderSelectedCaptainSummary(...args);
    this.applyIssue54CaptainPrompt();
    return result;
  }

  installMainMenuDebug(...args) {
    const result = super.installMainMenuDebug(...args);
    const toggle = this.mainDebugToggle ?? document.querySelector('#main-debug-toggle');
    if (toggle) toggle.className = 'main-menu__debug-launch';

    const panel = this.mainDebugPanel ?? document.querySelector('#main-debug-panel');
    if (panel) {
      panel.style.top = 'auto';
      panel.style.bottom = '74px';
      panel.style.left = 'max(14px, env(safe-area-inset-left))';
    }
    return result;
  }

  installSettingsStyles() {
    if (document.querySelector('link[data-settings-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './styles/settings.css';
    link.dataset.settingsStyles = 'true';
    document.head?.append(link);
  }

  installInGameDebugControls() {
    super.installInGameDebugControls();

    const opButton = this.debugPanel?.querySelector('#debug-make-op');
    if (!opButton || opButton.dataset.opToggleBound === 'true') return;
    opButton.dataset.opToggleBound = 'true';

    // runtimeSafety installed the original one-way click listener first. A
    // capture listener runs before it and stops that legacy handler, letting the
    // same button act as a reversible toggle without duplicating debug controls.
    opButton.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      if (!this.debugUnlocked) return;

      const nextEnabled = !Boolean(this.game?.debug?.opMode);
      this.game?.debugSetOpMode?.(nextEnabled);
      syncOpModeButton(opButton, Boolean(this.game?.debug?.opMode));
    }, { capture: true });

    syncOpModeButton(opButton, Boolean(this.game?.debug?.opMode));
  }

  installSettingsMenu() {
    let openButton = document.querySelector('#settings-open');
    if (!openButton) {
      const nav = document.querySelector('#start-screen .main-menu__nav');
      if (nav) {
        openButton = document.createElement('button');
        openButton.id = 'settings-open';
        openButton.type = 'button';
        openButton.className = 'captain-menu-button main-menu__action';
        openButton.textContent = 'Settings';
        nav.append(openButton);
      }
    }

    if (document.querySelector('#settings-screen')) return;
    const app = document.querySelector('#app') ?? document.body;
    const screen = document.createElement('section');
    screen.id = 'settings-screen';
    screen.className = 'overlay';
    screen.setAttribute('aria-hidden', 'true');
    screen.innerHTML = `
      <div class="panel panel--settings">
        <div class="settings-header">
          <div>
            <p class="eyebrow">SYSTEM</p>
            <h2>Settings</h2>
          </div>
          <button id="settings-close" class="settings-close" type="button" aria-label="Close Settings">×</button>
        </div>

        <section class="settings-section">
          <div class="settings-section__heading">
            <h3>Visuals</h3>
            <p>Gameplay presentation preferences</p>
          </div>
          <label class="settings-toggle">
            <span>
              <strong>Disable artwork rotation</strong>
              <small>Keep unit artwork upright instead of rotating with movement and attacks.</small>
            </span>
            <input id="settings-disable-rotation" type="checkbox" />
          </label>
        </section>

        <section class="settings-section">
          <div class="settings-section__heading">
            <h3>Controls</h3>
            <p>Click a control, then press the new key.</p>
          </div>
          <div class="settings-bindings">
            ${Object.entries(CONTROL_ACTIONS).map(([action, definition]) => `
              <button class="settings-binding" type="button" data-settings-action="${action}" aria-pressed="false">
                <span>${definition.label}</span>
                <strong data-binding-value>${formatKeyBinding(definition.defaultKey)}</strong>
              </button>
            `).join('')}
          </div>
          <button id="settings-reset-controls" class="captain-menu-button settings-reset-controls" type="button">Reset Controls</button>
        </section>

        <footer class="settings-footer">
          <span id="settings-version" class="settings-version">Version</span>
          <button id="settings-back" class="primary-button" type="button">Back to Main Menu</button>
        </footer>
      </div>
    `;
    app.append(screen);
  }

  setGameVersion(version) {
    if (this.settingsVersion) this.settingsVersion.textContent = `Version v${version}`;
  }

  bindSettingsMenu() {
    this.settingsOpen?.addEventListener('click', () => this.showSettings());
    this.settingsClose?.addEventListener('click', () => this.hideSettings());
    this.settingsBack?.addEventListener('click', () => this.hideSettings());

    this.settingsDisableRotation?.addEventListener('change', (event) => {
      setDisableArtworkRotation(event.currentTarget.checked);
      this.renderSettingsMenu();
    });

    for (const button of this.settingsScreen?.querySelectorAll('[data-settings-action]') ?? []) {
      button.addEventListener('click', () => {
        const action = button.dataset.settingsAction;
        if (!CONTROL_ACTIONS[action]) return;
        this.settingsCaptureAction = action;
        this.renderSettingsMenu();
        button.focus();
      });
    }

    this.settingsResetControls?.addEventListener('click', () => {
      this.settingsCaptureAction = null;
      resetKeyBindings();
      this.renderSettingsMenu();
    });

    window.addEventListener('keydown', (event) => this.handleSettingsKeydown(event), true);
  }

  handleSettingsKeydown(event) {
    if (this.settingsCaptureAction) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.key === 'Escape') {
        this.settingsCaptureAction = null;
        this.renderSettingsMenu();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Shift') return;

      if (setKeyBinding(this.settingsCaptureAction, event.key)) {
        this.settingsCaptureAction = null;
        this.renderSettingsMenu();
      }
      return;
    }

    if (
      event.key === 'Escape'
      && this.settingsScreen?.classList.contains('overlay--visible')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.hideSettings();
    }
  }

  showSettings() {
    if (!this.settingsScreen) return;
    this.settingsCaptureAction = null;
    this.renderSettingsMenu();
    this.settingsScreen.classList.add('overlay--visible');
    this.settingsScreen.setAttribute('aria-hidden', 'false');
  }

  hideSettings() {
    if (!this.settingsScreen) return;
    this.settingsCaptureAction = null;
    this.settingsScreen.classList.remove('overlay--visible');
    this.settingsScreen.setAttribute('aria-hidden', 'true');
    this.renderSettingsMenu();
  }

  renderSettingsMenu() {
    const settings = getGameSettings();
    if (this.settingsDisableRotation) {
      this.settingsDisableRotation.checked = settings.disableArtworkRotation;
    }

    for (const button of this.settingsScreen?.querySelectorAll('[data-settings-action]') ?? []) {
      const action = button.dataset.settingsAction;
      const value = button.querySelector('[data-binding-value]');
      if (!value) continue;
      const capturing = this.settingsCaptureAction === action;
      value.textContent = capturing ? 'PRESS KEY…' : formatKeyBinding(getKeyBinding(action));
      button.classList.toggle('settings-binding--listening', capturing);
      button.setAttribute('aria-pressed', String(capturing));
    }

    this.syncControlHints();
  }

  syncControlHints() {
    const hints = [...document.querySelectorAll('.main-menu__keys .main-menu__key')];
    if (hints[0]) {
      hints[0].textContent = [
        getKeyBinding('moveUp'),
        getKeyBinding('moveLeft'),
        getKeyBinding('moveDown'),
        getKeyBinding('moveRight'),
      ].map(formatKeyBinding).join('');
    }
    if (hints[1]) hints[1].textContent = formatKeyBinding(getKeyBinding('primaryCall'));
    if (hints[2]) hints[2].textContent = formatKeyBinding(getKeyBinding('secondaryCall'));
    if (hints[3]) hints[3].textContent = formatKeyBinding(getKeyBinding('tertiaryCall'));
  }

  renderCaptainCallHud(game) {
    super.renderCaptainCallHud(game);
    const bindings = [
      [this.captainCallPrimary, 'primaryCall'],
      [this.captainCallSecondary, 'secondaryCall'],
      [this.captainCallTertiary, 'tertiaryCall'],
    ];

    for (const [button, action] of bindings) {
      if (!button?.textContent) continue;
      const key = formatKeyBinding(getKeyBinding(action));
      button.textContent = button.textContent.replace(/^[^•]+•/, `${key} •`);
    }
  }

  update(game) {
    super.update(game);
    const opButton = this.debugPanel?.querySelector('#debug-make-op');
    syncOpModeButton(opButton, Boolean(game?.debug?.opMode));
  }
}
