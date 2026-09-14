import { Game, UI as FormationUI } from './squadFormation.js';
import { CAPTAINS } from '../data/content.js';
import { getSpritePortraitSources } from '../data/sprites.js';

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

export class UI extends FormationUI {
  constructor() {
    super();
    this.captainSelectionScreen = document.querySelector('#captain-select-screen');
    this.captainMenuOpen = document.querySelector('#captain-menu-open');
    this.captainMenuBack = document.querySelector('#captain-menu-back');
    this.captainMenuClose = document.querySelector('#captain-menu-close');
    this.selectedCaptainSummary = document.querySelector('#selected-captain-summary');

    this.bindCaptainSelectionMenu();
    this.renderSelectedCaptainSummary();
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

  renderSelectedCaptainSummary() {
    const summary = this.selectedCaptainSummary ?? document.querySelector('#selected-captain-summary');
    const captain = CAPTAINS[this.selectedCaptainId] ?? Object.values(CAPTAINS)[0];
    if (!summary || !captain) return;

    summary.replaceChildren();

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
  }

  renderCaptainOptions() {
    const options = this.captainOptions ?? document.querySelector('#captain-options');
    if (!options) {
      this.renderSelectedCaptainSummary();
      return;
    }

    this.captainOptions = options;
    options.replaceChildren();
    options.style.gridTemplateColumns = window.innerWidth <= 760
      ? '1fr'
      : 'repeat(2, minmax(0, 1fr))';

    for (const captain of Object.values(CAPTAINS)) {
      const selected = captain.id === this.selectedCaptainId;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'upgrade-card captain-select-card';
      button.style.setProperty('--rarity-color', captain.color);
      button.style.opacity = selected ? '1' : '0.72';
      button.style.filter = selected ? 'none' : 'saturate(.72) brightness(.84)';
      button.style.border = selected
        ? `3px solid ${captain.color}`
        : `1px solid ${captain.color}55`;
      button.style.background = selected
        ? `linear-gradient(160deg, ${captain.color}2e, rgba(255,255,255,.055))`
        : `linear-gradient(160deg, ${captain.color}0d, rgba(255,255,255,.018))`;
      button.style.boxShadow = selected
        ? `0 0 0 3px ${captain.color}38, 0 0 34px ${captain.color}50, 0 18px 40px rgba(0,0,0,.34)`
        : 'none';
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute(
        'aria-label',
        `${captain.name}${selected ? ', selected' : ', select captain'}`,
      );
      button.innerHTML = `
        ${selected ? `<span class="captain-select-card__selected">✓ SELECTED</span>` : ''}
        <span class="upgrade-card__meta">
          <span class="upgrade-card__tag">${captain.role}</span>
          <span class="upgrade-card__rarity">${selected ? 'ACTIVE' : 'SELECT'}</span>
        </span>
        <strong>${captain.name}</strong>
        <p>${captain.description}</p>
        <small>${captain.passiveText}</small>
      `;
      this.addPortrait(button, getSpritePortraitSources({ captainId: captain.id }));

      button.addEventListener('click', () => {
        this.selectedCaptainId = captain.id;
        this.renderCaptainOptions();
        this.renderSelectedCaptainSummary();
      });

      options.append(button);
    }

    const selectedCaptain = CAPTAINS[this.selectedCaptainId] ?? Object.values(CAPTAINS)[0];
    const startButton = document.querySelector('#start-button');
    if (startButton && selectedCaptain) {
      startButton.textContent = `Begin Run — ${selectedCaptain.name}`;
    }

    this.renderSelectedCaptainSummary();
  }
}
