import { Game as PreviousGame, UI as PreviousUI } from './handbookPolish.js';
import {
  applyPrestige,
  getPrestigePreview,
  getPrestigeState,
  recordCompletedRun,
} from '../data/prestige.js';
import {
  isCaptainUnlocked,
  resetUnlockProgress,
} from '../data/unlocks.js';
import { resetPermanentProgression } from '../data/metaUpgrades.js';

const SECRET_CAPTAIN_ID = 'supreme_commander';
const PRESTIGE_POPUP_STYLE_ID = 'issue-102-prestige-popup';
const PRESTIGE_POPUP_STYLES = `
.prestige-screen {
  z-index: 126;
  background: rgba(1, 5, 8, 0.92);
  backdrop-filter: blur(8px);
}

.panel--prestige {
  width: min(760px, calc(100vw - 28px));
  max-height: min(820px, calc(100dvh - 28px));
  overflow-y: auto;
  padding: clamp(20px, 3vw, 32px);
  border: 1px solid rgba(247, 215, 116, 0.26);
  background:
    radial-gradient(circle at 50% 0%, rgba(247, 215, 116, 0.08), transparent 42%),
    linear-gradient(180deg, rgba(10, 20, 27, 0.99), rgba(4, 9, 13, 0.995));
  box-shadow:
    0 26px 90px rgba(0, 0, 0, 0.66),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.prestige-popup__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}

.prestige-popup__header h2 {
  margin: 3px 0 0;
  font-size: clamp(30px, 5vw, 48px);
  line-height: 1;
}

.prestige-popup__close {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: 1px solid rgba(247, 215, 116, 0.24);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.04);
  color: #f4f7fb;
  font: inherit;
  font-size: 27px;
  cursor: pointer;
}

.prestige-popup__content {
  display: grid;
  gap: 16px;
}

.prestige-popup__status {
  justify-self: start;
  padding: 7px 10px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 1000;
  letter-spacing: 0.1em;
}

.prestige-popup__status--locked {
  color: #ff758a;
  background: rgba(255, 82, 108, 0.08);
}

.prestige-popup__status--ready {
  color: #f7d774;
  background: rgba(247, 215, 116, 0.08);
  box-shadow: 0 0 20px rgba(247, 215, 116, 0.08);
}

.prestige-popup__lead {
  margin: 0;
  max-width: 670px;
  color: #c1d0d6;
  font-size: 14px;
  line-height: 1.6;
}

.prestige-popup__steps {
  display: grid;
  gap: 10px;
}

.prestige-popup__step {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid rgba(126, 249, 212, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.prestige-popup__step-number {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(247, 215, 116, 0.45);
  border-radius: 50%;
  color: #f7d774;
  font-weight: 1000;
}

.prestige-popup__step strong {
  display: block;
  margin-bottom: 3px;
  color: #eef4f7;
  font-size: 13px;
}

.prestige-popup__step p {
  margin: 0;
  color: #90a7b0;
  font-size: 12px;
  line-height: 1.45;
}

.prestige-popup__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.prestige-popup__metrics--locked {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.prestige-popup__metric {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(247, 215, 116, 0.14);
  border-radius: 10px;
  background: rgba(247, 215, 116, 0.035);
  text-align: center;
}

.prestige-popup__metric span,
.prestige-popup__metric strong {
  display: block;
}

.prestige-popup__metric span {
  min-height: 28px;
  color: #7f949d;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1.25;
  text-transform: uppercase;
}

.prestige-popup__metric strong {
  margin-top: 5px;
  color: #f7d774;
  font-size: 20px;
}

.prestige-popup__warning {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 7px 14px;
  padding: 14px;
  border: 1px solid rgba(255, 95, 121, 0.2);
  border-radius: 10px;
  background: rgba(255, 95, 121, 0.045);
  color: #aebfc6;
  font-size: 12px;
}

.prestige-popup__warning strong {
  color: #f1f5f7;
}

.prestige-popup__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 2px;
}

.prestige-popup__confirm {
  min-width: 220px;
  border-color: rgba(247, 215, 116, 0.55);
  background: linear-gradient(180deg, rgba(247, 215, 116, 0.2), rgba(247, 215, 116, 0.08));
  color: #fff3c4;
}

.prestige-popup__confirm:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

@media (max-width: 700px) {
  .prestige-popup__metrics,
  .prestige-popup__metrics--locked {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .prestige-popup__actions {
    flex-direction: column-reverse;
  }

  .prestige-popup__actions > button {
    width: 100%;
  }
}

@media (max-width: 460px) {
  .prestige-popup__metrics,
  .prestige-popup__metrics--locked {
    grid-template-columns: 1fr;
  }

  .prestige-popup__warning {
    grid-template-columns: 1fr;
  }
}

`;

function createMetric(label, value) {
  const metric = document.createElement('div');
  metric.className = 'prestige-popup__metric';

  const small = document.createElement('span');
  small.textContent = label;
  metric.append(small);

  const strong = document.createElement('strong');
  strong.textContent = value;
  metric.append(strong);

  return metric;
}

function createExplainerStep(number, title, body) {
  const step = document.createElement('div');
  step.className = 'prestige-popup__step';

  const badge = document.createElement('span');
  badge.className = 'prestige-popup__step-number';
  badge.textContent = number;
  step.append(badge);

  const copy = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = title;
  copy.append(heading);

  const paragraph = document.createElement('p');
  paragraph.textContent = body;
  copy.append(paragraph);

  step.append(copy);
  return step;
}

export class Game extends PreviousGame {
  defeatCipher(...args) {
    const boss = args[0];
    const wasDead = Boolean(boss?.dead);
    const result = super.defeatCipher(...args);

    if (!wasDead && boss?.dead) {
      recordCompletedRun();
      this.ui?.refreshPrestigePopup?.();
    }

    return result;
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.prestigeScreen = null;
    this.prestigePopupContent = null;
    this.installPrestigePopup();
  }

  installPrestigePopup() {
    if (!document.querySelector(`#${PRESTIGE_POPUP_STYLE_ID}`)) {
      const style = document.createElement('style');
      style.id = PRESTIGE_POPUP_STYLE_ID;
      style.textContent = PRESTIGE_POPUP_STYLES;
      document.head?.append(style);
    }

    if (document.querySelector('#prestige-screen')) {
      this.prestigeScreen = document.querySelector('#prestige-screen');
      this.prestigePopupContent = this.prestigeScreen?.querySelector('#prestige-popup-content') ?? null;
      return;
    }

    const app = document.querySelector('#app');
    if (!app) return;

    const screen = document.createElement('section');
    screen.id = 'prestige-screen';
    screen.className = 'overlay prestige-screen';
    screen.setAttribute('aria-hidden', 'true');
    screen.innerHTML = `
      <div class="panel panel--prestige">
        <header class="prestige-popup__header">
          <div>
            <p class="eyebrow">PERMANENT ASCENSION</p>
            <h2>Prestige</h2>
          </div>
          <button id="prestige-popup-close" class="prestige-popup__close" type="button" aria-label="Close Prestige">×</button>
        </header>
        <div id="prestige-popup-content" class="prestige-popup__content"></div>
      </div>
    `;
    app.append(screen);

    this.prestigeScreen = screen;
    this.prestigePopupContent = screen.querySelector('#prestige-popup-content');

    screen.querySelector('#prestige-popup-close')?.addEventListener('click', () => this.hidePrestigePopup());
    screen.addEventListener('click', (event) => {
      if (event.target === screen) this.hidePrestigePopup();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.prestigeScreen?.classList.contains('overlay--visible')) {
        this.hidePrestigePopup();
      }
    });
  }

  syncPrestigeCompletion() {
    const state = getPrestigeState();
    if (!state.runCompleted && isCaptainUnlocked(SECRET_CAPTAIN_ID)) {
      return recordCompletedRun();
    }
    return state;
  }

  handlePrestige() {
    this.showPrestigePopup();
  }

  showPrestigePopup() {
    if (!this.prestigeScreen) return;
    this.renderPrestigePopup();
    this.prestigeScreen.classList.add('overlay--visible');
    this.prestigeScreen.setAttribute('aria-hidden', 'false');
    this.prestigeScreen.querySelector('#prestige-popup-close')?.focus?.({ preventScroll: true });
  }

  hidePrestigePopup() {
    if (!this.prestigeScreen) return;
    this.prestigeScreen.classList.remove('overlay--visible');
    this.prestigeScreen.setAttribute('aria-hidden', 'true');
  }

  refreshPrestigePopup() {
    if (this.prestigeScreen?.classList.contains('overlay--visible')) {
      this.renderPrestigePopup();
    }
    this.renderPrestigeButton?.();
  }

  renderPrestigePopup() {
    if (!this.prestigePopupContent) return;

    const state = this.syncPrestigeCompletion();
    const preview = getPrestigePreview();
    this.prestigePopupContent.replaceChildren();

    if (!state.runCompleted) {
      const locked = document.createElement('div');
      locked.className = 'prestige-popup__status prestige-popup__status--locked';
      locked.textContent = 'COMPLETE A RUN TO UNLOCK PRESTIGE';
      this.prestigePopupContent.append(locked);

      const intro = document.createElement('p');
      intro.className = 'prestige-popup__lead';
      intro.textContent = 'Prestige becomes available after you defeat The Cipher and complete a full run.';
      this.prestigePopupContent.append(intro);

      const steps = document.createElement('div');
      steps.className = 'prestige-popup__steps';
      steps.append(
        createExplainerStep(
          '1',
          'Complete a run',
          'Defeat The Cipher to unlock Prestige for the current progression cycle.',
        ),
        createExplainerStep(
          '2',
          'Convert your level',
          'Your highest level this Prestige becomes the permanent attack-rate percentage gained.',
        ),
        createExplainerStep(
          '3',
          'Begin again stronger',
          'Captain unlocks, Gold and Gold Upgrades reset, while Prestige attack rate remains and stacks permanently.',
        ),
      );
      this.prestigePopupContent.append(steps);

      const metrics = document.createElement('div');
      metrics.className = 'prestige-popup__metrics prestige-popup__metrics--locked';
      metrics.append(
        createMetric('Current permanent bonus', `+${state.attackRateBonus}% ATK`),
        createMetric('Highest level this cycle', String(state.highestRunLevel)),
      );
      this.prestigePopupContent.append(metrics);

      const actions = document.createElement('div');
      actions.className = 'prestige-popup__actions';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'primary-button';
      close.textContent = 'Back to Main Menu';
      close.addEventListener('click', () => this.hidePrestigePopup());
      actions.append(close);
      this.prestigePopupContent.append(actions);
      return;
    }

    const ready = document.createElement('div');
    ready.className = 'prestige-popup__status prestige-popup__status--ready';
    ready.textContent = 'RUN COMPLETE • PRESTIGE READY';
    this.prestigePopupContent.append(ready);

    const intro = document.createElement('p');
    intro.className = 'prestige-popup__lead';
    intro.textContent = 'Convert this progression cycle into permanent attack rate, then restart progression from the beginning.';
    this.prestigePopupContent.append(intro);

    const metrics = document.createElement('div');
    metrics.className = 'prestige-popup__metrics';
    metrics.append(
      createMetric('Current bonus', `+${preview.current}%`),
      createMetric('Highest level', String(preview.highestRunLevel)),
      createMetric('Gain now', `+${preview.gain}%`),
      createMetric('After Prestige', `+${preview.total}%`),
    );
    this.prestigePopupContent.append(metrics);

    const warning = document.createElement('div');
    warning.className = 'prestige-popup__warning';
    warning.innerHTML = `
      <strong>Prestige resets:</strong>
      <span>Captain unlocks</span>
      <span>Gold</span>
      <span>Gold Upgrades</span>
      <strong>Kept permanently:</strong>
      <span>Prestige attack-rate bonus</span>
    `;
    this.prestigePopupContent.append(warning);

    const actions = document.createElement('div');
    actions.className = 'prestige-popup__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'captain-menu-button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.hidePrestigePopup());
    actions.append(cancel);

    const prestige = document.createElement('button');
    prestige.type = 'button';
    prestige.className = 'primary-button prestige-popup__confirm';
    prestige.textContent = preview.gain > 0
      ? `Prestige • Gain +${preview.gain}% ATK`
      : 'Prestige unavailable';
    prestige.disabled = preview.gain <= 0;
    prestige.addEventListener('click', () => this.performPrestige());
    actions.append(prestige);

    this.prestigePopupContent.append(actions);
  }

  performPrestige() {
    const state = this.syncPrestigeCompletion();
    const preview = getPrestigePreview();
    if (!state.runCompleted || preview.gain <= 0) {
      this.renderPrestigePopup();
      return;
    }

    applyPrestige();
    resetUnlockProgress();
    resetPermanentProgression();
    this.resetMenuProgressState();

    const newState = getPrestigeState();
    this.hidePrestigePopup();

    if (this.prestigeButton) {
      this.prestigeButton.textContent = `PRESTIGED • +${newState.attackRateBonus}% ATK`;
      window.setTimeout(() => this.renderPrestigeButton(), 1500);
    }
  }
}
