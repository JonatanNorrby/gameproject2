import { Game as FormationGame, UI as FormationUI } from './squadFormation.js';
import { CAPTAINS } from '../data/content.js';
import { getSpritePortraitSources } from '../data/sprites.js';
import {
  evaluateUnlocks,
  getCaptainUnlockDefinition,
  isCaptainUnlocked,
} from '../data/unlocks.js';

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

export class Game extends FormationGame {
  addSquadUnits(type, amount = 1) {
    super.addSquadUnits(type, amount);

    const newlyUnlocked = evaluateUnlocks({
      squad: this.player?.squad ?? [],
    });
    if (newlyUnlocked.length > 0) {
      this.ui?.handleUnlocksChanged?.(newlyUnlocked);
    }
  }
}

export class UI extends FormationUI {
  constructor() {
    super();

    // The base UI historically selected the first Captain automatically.
    // Runs now require an explicit player choice instead.
    this.selectedCaptainId = null;
    this.captainSelectionRequired = false;
    this.unlockNoticeTimer = null;

    this.captainSelectionScreen = document.querySelector('#captain-select-screen');
    this.captainMenuOpen = document.querySelector('#captain-menu-open');
    this.captainMenuBack = document.querySelector('#captain-menu-back');
    this.captainMenuClose = document.querySelector('#captain-menu-close');
    this.selectedCaptainSummary = document.querySelector('#selected-captain-summary');

    this.bindCaptainSelectionMenu();
    this.renderCaptainOptions();
    this.renderSelectedCaptainSummary();
  }

  getSelectedCaptainId() {
    return this.selectedCaptainId && isCaptainUnlocked(this.selectedCaptainId)
      ? this.selectedCaptainId
      : null;
  }

  bindCaptainSelectionMenu() {
    const open = () => this.showCaptainSelection();
    const close = () => this.hideCaptainSelection();

    this.captainMenuOpen?.addEventListener('click', open);
    this.captainMenuBack?.addEventListener('click', close);
    this.captainMenuClose?.addEventListener('click', close);

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!this.captainSelectionScreen?.classList.contains('overlay--visible')) return;
      close();
    });
  }

  showCaptainSelection() {
    if (!this.captainSelectionScreen) return;
    this.renderCaptainOptions();
    this.captainSelectionScreen.classList.add('overlay--visible');
    this.captainSelectionScreen.setAttribute('aria-hidden', 'false');
  }

  hideCaptainSelection() {
    if (!this.captainSelectionScreen) return;
    this.captainSelectionScreen.classList.remove('overlay--visible');
    this.captainSelectionScreen.setAttribute('aria-hidden', 'true');
    this.renderSelectedCaptainSummary();
  }

  requireCaptainSelection() {
    this.captainSelectionRequired = true;
    this.renderSelectedCaptainSummary();

    const startButton = document.querySelector('#start-button');
    if (startButton) startButton.textContent = 'Please select a Captain';
    this.captainMenuOpen?.focus();
  }

  handleUnlocksChanged(unlocks) {
    this.renderCaptainOptions();
    this.showUnlockNotification(unlocks);
  }

  showUnlockNotification(unlocks) {
    if (!unlocks?.length) return;

    let notice = document.querySelector('#unlock-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'unlock-notice';
      Object.assign(notice.style, {
        position: 'fixed',
        left: '50%',
        top: '22px',
        transform: 'translateX(-50%)',
        zIndex: '5000',
        minWidth: '260px',
        maxWidth: 'min(520px, calc(100vw - 32px))',
        padding: '14px 18px',
        border: '1px solid rgba(247,201,75,.7)',
        borderRadius: '12px',
        background: 'rgba(10,14,22,.96)',
        color: '#f7c94b',
        boxShadow: '0 0 30px rgba(247,201,75,.28), 0 14px 40px rgba(0,0,0,.45)',
        fontFamily: 'Inter, sans-serif',
        fontWeight: '900',
        letterSpacing: '.04em',
        textAlign: 'center',
        pointerEvents: 'none',
      });
      document.body.append(notice);
    }

    const names = unlocks.map((unlock) => unlock.label).join(' & ');
    notice.textContent = `UNLOCKED — ${names}`;
    notice.style.display = 'block';

    if (this.unlockNoticeTimer) window.clearTimeout(this.unlockNoticeTimer);
    this.unlockNoticeTimer = window.setTimeout(() => {
      notice.style.display = 'none';
    }, 4200);
  }

  renderSelectedCaptainSummary() {
    const summary = this.selectedCaptainSummary ?? document.querySelector('#selected-captain-summary');
    if (!summary) return;

    const selectedId = this.getSelectedCaptainId();
    if (!selectedId && this.selectedCaptainId) this.selectedCaptainId = null;
    const captain = selectedId ? CAPTAINS[selectedId] : null;
    summary.replaceChildren();

    if (!captain) {
      const card = document.createElement('div');
      card.className = 'selected-captain-card selected-captain-card--empty';
      card.style.setProperty('--captain-color', this.captainSelectionRequired ? '#ff8f8f' : '#8fa7c5');
      card.style.cursor = 'pointer';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Select Captain');
      card.title = 'Select Captain';
      card.innerHTML = `
        <div class="selected-captain-card__portrait" aria-hidden="true">
          <span style="font-size:44px;font-weight:1000;color:var(--captain-color);opacity:.8;">?</span>
        </div>
        <div class="selected-captain-card__info">
          <span class="selected-captain-card__label">CAPTAIN REQUIRED</span>
          <strong>Please select a Captain</strong>
          <span class="selected-captain-card__role">Click here to choose who will lead the squad</span>
        </div>
      `;

      const openCaptainSelection = () => this.showCaptainSelection();
      card.addEventListener('click', openCaptainSelection);
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openCaptainSelection();
      });

      summary.append(card);

      if (this.captainMenuOpen) this.captainMenuOpen.textContent = 'Select Captain';
      return;
    }

    const card = document.createElement('div');
    card.className = 'selected-captain-card';
    card.style.setProperty('--captain-color', captain.color);
    card.innerHTML = `
      <div class="selected-captain-card__portrait">
        <img alt="" aria-hidden="true" />
      </div>
      <div class="selected-captain-card__info">
        <span class="selected-captain-card__label">CURRENT CAPTAIN</span>
        <strong>${captain.name}</strong>
        <span class="selected-captain-card__role">${captain.role}</span>
      </div>
    `;

    applyImageSources(
      card.querySelector('img'),
      getSpritePortraitSources({ captainId: captain.id }),
    );

    summary.append(card);
    if (this.captainMenuOpen) this.captainMenuOpen.textContent = 'Change Captain';
  }

  renderCaptainOptions() {
    const options = this.captainOptions ?? document.querySelector('#captain-options');
    if (!options) {
      this.renderSelectedCaptainSummary();
      return;
    }

    this.captainOptions = options;
    if (this.selectedCaptainId && !isCaptainUnlocked(this.selectedCaptainId)) {
      this.selectedCaptainId = null;
    }

    options.replaceChildren();
    options.style.gridTemplateColumns = window.innerWidth <= 760
      ? '1fr'
      : 'repeat(2, minmax(0, 1fr))';

    for (const captain of Object.values(CAPTAINS)) {
      const unlocked = isCaptainUnlocked(captain.id);
      const unlockDefinition = getCaptainUnlockDefinition(captain.id);
      const selected = unlocked && captain.id === this.selectedCaptainId;
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = !unlocked;
      button.className = 'upgrade-card captain-select-card';
      button.style.setProperty('--rarity-color', captain.color);
      button.style.opacity = selected ? '1' : unlocked ? '0.72' : '0.38';
      button.style.filter = selected
        ? 'none'
        : unlocked
          ? 'saturate(.72) brightness(.84)'
          : 'grayscale(.85) saturate(.25) brightness(.52)';
      button.style.cursor = unlocked ? 'pointer' : 'not-allowed';
      button.style.border = selected
        ? `3px solid ${captain.color}`
        : unlocked
          ? `1px solid ${captain.color}55`
          : '1px solid rgba(255,255,255,.12)';
      button.style.background = selected
        ? `linear-gradient(160deg, ${captain.color}2e, rgba(255,255,255,.055))`
        : unlocked
          ? `linear-gradient(160deg, ${captain.color}0d, rgba(255,255,255,.018))`
          : 'linear-gradient(160deg, rgba(255,255,255,.025), rgba(0,0,0,.18))';
      button.style.boxShadow = selected
        ? `0 0 0 3px ${captain.color}38, 0 0 34px ${captain.color}50, 0 18px 40px rgba(0,0,0,.34)`
        : 'none';
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute(
        'aria-label',
        unlocked
          ? `${captain.name}${selected ? ', selected' : ', select captain'}`
          : `${captain.name}, locked. ${unlockDefinition?.requirementText ?? ''}`,
      );
      button.innerHTML = `
        ${selected ? `<span class="captain-select-card__selected">✓ SELECTED</span>` : ''}
        <span class="upgrade-card__meta">
          <span class="upgrade-card__tag">${captain.role}</span>
          <span class="upgrade-card__rarity">${selected ? 'ACTIVE' : unlocked ? 'SELECT' : 'LOCKED'}</span>
        </span>
        <strong>${captain.name}</strong>
        <p>${unlocked ? captain.description : 'Complete the requirement below to unlock this Captain.'}</p>
        <small>${unlocked ? captain.passiveText : `Unlock: ${unlockDefinition?.requirementText ?? 'Requirement unavailable.'}`}</small>
      `;
      this.addPortrait(button, getSpritePortraitSources({ captainId: captain.id }));

      if (unlocked) {
        button.addEventListener('click', () => {
          this.selectedCaptainId = captain.id;
          this.captainSelectionRequired = false;
          this.renderCaptainOptions();
          // #163: selecting an unlocked Captain confirms the choice immediately
          // and returns the player to the main menu.
          this.hideCaptainSelection();
        });
      }

      options.append(button);
    }

    const selectedCaptainId = this.getSelectedCaptainId();
    const selectedCaptain = selectedCaptainId ? CAPTAINS[selectedCaptainId] : null;
    const startButton = document.querySelector('#start-button');
    if (startButton) {
      startButton.textContent = selectedCaptain
        ? `Begin Run — ${selectedCaptain.name}`
        : 'Begin Run';
    }

    this.renderSelectedCaptainSummary();
  }
}
