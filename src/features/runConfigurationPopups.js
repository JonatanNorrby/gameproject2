import { Game, UI as PreviousUI } from './captainAbilityHud.js';
import { CAPTAINS } from '../data/content.js';
import { SQUAD_DOCTRINES } from '../data/metaUpgrades.js';
import { getSpritePortraitSources } from '../data/sprites.js';

const RUN_CONFIG_STYLE_HREF = './styles/run-config-popups.css';

function ensureRunConfigurationStyles() {
  if (document.querySelector(`link[href="${RUN_CONFIG_STYLE_HREF}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = RUN_CONFIG_STYLE_HREF;
  document.head.append(link);
}

const RUN_CONFIG_KINDS = Object.freeze({
  doctrine: Object.freeze({
    label: 'Squad Doctrine',
    title: 'Select Squad Doctrine',
    eyebrow: 'TACTICAL DOCTRINE',
    description: 'Choose the doctrine that will shape how the squad fights during the next run.',
  }),
  secondary: Object.freeze({
    label: 'Second Captain',
    title: 'Select Second Captain',
    eyebrow: 'CAPTAIN SLOT 2',
    description: 'Choose the second Captain. They fight as a normal squad unit and provide their Captain bonus.',
  }),
  tertiary: Object.freeze({
    label: 'Third Captain',
    title: 'Select Third Captain',
    eyebrow: 'CAPTAIN SLOT 3',
    description: 'Choose the third Captain. They fight as a normal squad unit and provide their Captain bonus.',
  }),
});

function applyImageSources(image, sources) {
  if (!image || !sources?.length) return;
  let sourceIndex = 0;
  image.addEventListener('error', () => {
    sourceIndex += 1;
    if (sourceIndex < sources.length) {
      image.src = sources[sourceIndex];
      return;
    }
    image.remove();
  });
  image.src = sources[sourceIndex];
}

export { Game };

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    ensureRunConfigurationStyles();
    this.runConfigPopupReady = true;
    this.activeRunConfigKind = null;
    this.installRunConfigurationPopup();
    this.installRunConfigurationLaunchers();
    this.syncRunConfigurationLaunchers();
  }

  renderRunConfiguration(...args) {
    super.renderRunConfiguration(...args);
    if (!this.runConfigPopupReady) return;
    this.installRunConfigurationLaunchers();
    this.syncRunConfigurationLaunchers();
    if (this.runConfigSelectionScreen?.classList.contains('overlay--visible')) {
      this.renderRunConfigurationPopupOptions();
    }
  }

  installRunConfigurationPopup() {
    let screen = document.querySelector('#run-config-selection-screen');
    if (!screen) {
      screen = document.createElement('section');
      screen.id = 'run-config-selection-screen';
      screen.className = 'overlay run-config-popup';
      screen.setAttribute('aria-hidden', 'true');
      screen.innerHTML = `
        <div class="panel panel--run-config" role="dialog" aria-modal="true" aria-labelledby="run-config-popup-title">
          <div class="run-config-popup__header">
            <div>
              <p id="run-config-popup-eyebrow" class="eyebrow">RUN CONFIGURATION</p>
              <h2 id="run-config-popup-title">Run Configuration</h2>
            </div>
            <button id="run-config-popup-close" class="run-config-popup__close" type="button" aria-label="Close selection">×</button>
          </div>
          <p id="run-config-popup-description" class="run-config-popup__description"></p>
          <div id="run-config-popup-options" class="run-config-popup__grid"></div>
          <button id="run-config-popup-back" class="primary-button run-config-popup__back" type="button">Back</button>
        </div>
      `;
      (document.querySelector('#app') ?? document.body).append(screen);
    }

    this.runConfigSelectionScreen = screen;
    this.runConfigPopupEyebrow = screen.querySelector('#run-config-popup-eyebrow');
    this.runConfigPopupTitle = screen.querySelector('#run-config-popup-title');
    this.runConfigPopupDescription = screen.querySelector('#run-config-popup-description');
    this.runConfigPopupOptions = screen.querySelector('#run-config-popup-options');
    this.runConfigPopupClose = screen.querySelector('#run-config-popup-close');
    this.runConfigPopupBack = screen.querySelector('#run-config-popup-back');

    if (!screen.dataset.boundRunConfigPopup) {
      screen.dataset.boundRunConfigPopup = 'true';
      const close = () => this.closeRunConfigurationPopup();
      this.runConfigPopupClose?.addEventListener('click', close);
      this.runConfigPopupBack?.addEventListener('click', close);
      screen.addEventListener('click', (event) => {
        if (event.target === screen) close();
      });
      window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!screen.classList.contains('overlay--visible')) return;
        close();
      });
    }
  }

  getRunConfigurationElements(kind) {
    if (kind === 'doctrine') {
      return {
        config: this.doctrineConfig,
        select: this.doctrineSelect,
        help: this.doctrineHelp,
      };
    }
    if (kind === 'secondary') {
      return {
        config: this.secondCaptainConfig,
        select: this.secondCaptainSelect,
        help: this.secondCaptainHelp,
      };
    }
    if (kind === 'tertiary') {
      return {
        config: this.thirdCaptainConfig,
        select: this.thirdCaptainSelect,
        help: this.thirdCaptainHelp,
      };
    }
    return { config: null, select: null, help: null };
  }

  installRunConfigurationLaunchers() {
    for (const kind of Object.keys(RUN_CONFIG_KINDS)) {
      const { config, select, help } = this.getRunConfigurationElements(kind);
      if (!config || !select) continue;

      select.classList.add('run-config-native-select');
      help?.classList.add('run-config-inline-help');

      let launcher = config.querySelector(`[data-run-config-launcher="${kind}"]`);
      if (!launcher) {
        launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.className = 'run-config-launcher';
        launcher.dataset.runConfigLauncher = kind;
        launcher.setAttribute('aria-haspopup', 'dialog');
        launcher.innerHTML = `
          <span class="run-config-launcher__copy">
            <span class="run-config-launcher__action">OPEN SELECTION</span>
            <strong class="run-config-launcher__value">Not selected</strong>
          </span>
          <span class="run-config-launcher__chevron" aria-hidden="true">›</span>
        `;
        select.after(launcher);
        launcher.addEventListener('click', (event) => {
          event.preventDefault();
          this.openRunConfigurationPopup(kind);
        });
      }
    }
  }

  getLauncherValueLabel(kind, select) {
    const value = select?.value || '';
    if (kind === 'doctrine') return SQUAD_DOCTRINES[value]?.name ?? 'Choose doctrine';
    return CAPTAINS[value]?.name ?? 'Choose Captain';
  }

  syncRunConfigurationLaunchers() {
    for (const kind of Object.keys(RUN_CONFIG_KINDS)) {
      const definition = RUN_CONFIG_KINDS[kind];
      const { config, select } = this.getRunConfigurationElements(kind);
      const launcher = config?.querySelector(`[data-run-config-launcher="${kind}"]`);
      if (!launcher || !select) continue;

      const validOptions = [...select.options].filter((option) => option.value && !option.disabled);
      const valueLabel = this.getLauncherValueLabel(kind, select);
      const valueNode = launcher.querySelector('.run-config-launcher__value');
      if (valueNode) valueNode.textContent = valueLabel;

      launcher.disabled = Boolean(select.disabled || validOptions.length === 0);
      launcher.setAttribute(
        'aria-label',
        `${definition.label}: ${valueLabel}. Open selection.`,
      );
    }
  }

  openRunConfigurationPopup(kind) {
    const definition = RUN_CONFIG_KINDS[kind];
    const { select } = this.getRunConfigurationElements(kind);
    if (!definition || !select || select.disabled) return;

    this.installRunConfigurationPopup();
    this.activeRunConfigKind = kind;
    if (this.runConfigPopupEyebrow) this.runConfigPopupEyebrow.textContent = definition.eyebrow;
    if (this.runConfigPopupTitle) this.runConfigPopupTitle.textContent = definition.title;
    if (this.runConfigPopupDescription) {
      this.runConfigPopupDescription.textContent = definition.description;
    }
    this.renderRunConfigurationPopupOptions();

    this.runConfigSelectionScreen.classList.add('overlay--visible');
    this.runConfigSelectionScreen.setAttribute('aria-hidden', 'false');
    this.runConfigPopupClose?.focus();
  }

  closeRunConfigurationPopup() {
    if (!this.runConfigSelectionScreen) return;
    this.runConfigSelectionScreen.classList.remove('overlay--visible');
    this.runConfigSelectionScreen.setAttribute('aria-hidden', 'true');
    const kind = this.activeRunConfigKind;
    this.activeRunConfigKind = null;
    const { config } = this.getRunConfigurationElements(kind);
    config?.querySelector(`[data-run-config-launcher="${kind}"]`)?.focus();
  }

  renderRunConfigurationPopupOptions() {
    const kind = this.activeRunConfigKind;
    const { select } = this.getRunConfigurationElements(kind);
    const container = this.runConfigPopupOptions;
    if (!kind || !select || !container) return;

    container.replaceChildren();
    if (kind === 'doctrine') {
      for (const doctrine of Object.values(SQUAD_DOCTRINES)) {
        container.append(this.createDoctrineOption(doctrine, doctrine.id === select.value));
      }
      return;
    }

    const availableOptions = [...select.options]
      .filter((option) => option.value && !option.disabled);
    if (availableOptions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'run-config-popup__empty';
      empty.textContent = select.options[0]?.textContent || 'No valid choices are currently available.';
      container.append(empty);
      return;
    }

    for (const option of availableOptions) {
      const captain = CAPTAINS[option.value];
      if (!captain) continue;
      container.append(this.createCaptainOption(kind, captain, captain.id === select.value));
    }
  }

  createDoctrineOption(doctrine, selected) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `run-config-option run-config-option--doctrine${selected ? ' run-config-option--selected' : ''}`;
    button.style.setProperty('--run-config-color', doctrine.color ?? '#7ef9d4');
    button.setAttribute('aria-pressed', String(selected));
    button.innerHTML = `
      <span class="run-config-option__status">${selected ? 'SELECTED' : 'SELECT'}</span>
      <strong>${doctrine.name}</strong>
      <p>${doctrine.description}</p>
    `;
    button.addEventListener('click', () => this.selectRunConfigurationValue('doctrine', doctrine.id));
    return button;
  }

  createCaptainOption(kind, captain, selected) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `run-config-option run-config-option--captain${selected ? ' run-config-option--selected' : ''}`;
    button.style.setProperty('--run-config-color', captain.color ?? '#7ef9d4');
    button.setAttribute('aria-pressed', String(selected));

    const portrait = document.createElement('span');
    portrait.className = 'run-config-option__portrait';
    const image = document.createElement('img');
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    applyImageSources(image, getSpritePortraitSources({ captainId: captain.id }));
    portrait.append(image);

    const copy = document.createElement('span');
    copy.className = 'run-config-option__captain-copy';
    copy.innerHTML = `
      <span class="run-config-option__status">${selected ? 'SELECTED' : 'SELECT'}</span>
      <span class="run-config-option__role">${captain.role}</span>
      <strong>${captain.name}</strong>
      <p>${captain.description}</p>
      <small>${captain.passiveText}</small>
    `;

    button.append(portrait, copy);
    button.addEventListener('click', () => this.selectRunConfigurationValue(kind, captain.id));
    return button;
  }

  selectRunConfigurationValue(kind, value) {
    const { select } = this.getRunConfigurationElements(kind);
    if (!select || ![...select.options].some((option) => option.value === value && !option.disabled)) {
      return;
    }

    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    this.renderRunConfiguration();
    this.closeRunConfigurationPopup();
  }
}
