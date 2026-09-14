import { CAPTAINS, UNIT_CLASSES } from '../data/content.js';
import { getHexFormationLayout } from '../utils/hexFormation.js';

const GAME_VERSION = 2;

export class UI {
  constructor() {
    this.hpText = document.querySelector('#hp-text');
    this.hpBar = document.querySelector('#hp-bar');
    this.timeText = document.querySelector('#time-text');
    this.killsText = document.querySelector('#kills-text');
    this.squadText = document.querySelector('#squad-text');
    this.levelText = document.querySelector('#level-text');
    this.versionText = document.querySelector('#version-text');
    this.xpText = document.querySelector('#xp-text');
    this.xpBar = document.querySelector('#xp-bar');
    this.startScreen = document.querySelector('#start-screen');
    this.levelupScreen = document.querySelector('#levelup-screen');
    this.gameoverScreen = document.querySelector('#gameover-screen');
    this.upgradeOptions = document.querySelector('#upgrade-options');
    this.resultTime = document.querySelector('#result-time');
    this.resultKills = document.querySelector('#result-kills');
    this.resultLevel = document.querySelector('#result-level');
    this.captainOptions = document.querySelector('#captain-options');
    this.selectedCaptainId = Object.keys(CAPTAINS)[0];

    this.debugToggle = document.querySelector('#debug-toggle');
    this.debugPanel = document.querySelector('#debug-panel');
    this.debugClose = document.querySelector('#debug-close');
    this.debugInfiniteHp = document.querySelector('#debug-infinite-hp');
    this.debugLevelUp = document.querySelector('#debug-level-up');

    this.squadBuilderToggle = document.querySelector('#squad-builder-toggle');
    this.squadBuilderScreen = document.querySelector('#squad-builder-screen');
    this.squadBuilderGrid = document.querySelector('#squad-builder-grid');
    this.squadBuilderSummary = document.querySelector('#squad-builder-summary');
    this.squadBuilderClose = document.querySelector('#squad-builder-close');
    this.squadBuilderDone = document.querySelector('#squad-builder-done');
    this.squadBuilderHandlers = null;
    this.squadBuilderSelection = null;
    this.squadBuilderDragging = false;
    this.squadBuilderHasCentered = false;

    this.versionText.textContent = `v${GAME_VERSION}`;
    this.renderCaptainOptions();
  }

  bindStart(handler) { document.querySelector('#start-button').addEventListener('click', handler); }
  bindRestart(handler) { document.querySelector('#restart-button').addEventListener('click', handler); }

  getSelectedCaptainId() { return this.selectedCaptainId; }

  renderCaptainOptions() {
    if (!this.captainOptions) return;
    this.captainOptions.replaceChildren();
    this.captainOptions.style.gridTemplateColumns = window.innerWidth <= 760 ? '1fr' : 'repeat(2, minmax(0, 1fr))';

    for (const captain of Object.values(CAPTAINS)) {
      const selected = captain.id === this.selectedCaptainId;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'upgrade-card';
      button.style.setProperty('--rarity-color', captain.color);
      button.setAttribute('aria-pressed', String(selected));
      button.innerHTML = `
        <span class="upgrade-card__meta">
          <span class="upgrade-card__tag">${captain.role}</span>
          <span class="upgrade-card__rarity">${selected ? 'Selected' : 'Captain'}</span>
        </span>
        <strong>${captain.name}</strong>
        <p>${captain.description}</p>
        <small>${captain.passiveText}</small>
      `;

      if (selected) {
        button.style.borderColor = captain.color;
        button.style.boxShadow = `0 0 0 2px ${captain.color}55, 0 16px 36px ${captain.color}18`;
      }

      button.addEventListener('click', () => {
        this.selectedCaptainId = captain.id;
        this.renderCaptainOptions();
      });
      this.captainOptions.append(button);
    }
  }

  bindDebug({ setInfiniteHp, levelUp }) {
    const setOpen = (open) => {
      this.debugPanel.classList.toggle('debug-panel--visible', open);
      this.debugPanel.setAttribute('aria-hidden', String(!open));
      this.debugToggle.setAttribute('aria-expanded', String(open));
    };

    this.debugToggle.addEventListener('click', () => {
      setOpen(!this.debugPanel.classList.contains('debug-panel--visible'));
    });
    this.debugClose.addEventListener('click', () => setOpen(false));
    this.debugInfiniteHp.addEventListener('change', (event) => setInfiniteHp(event.currentTarget.checked));
    this.debugLevelUp.addEventListener('click', levelUp);
  }

  bindSquadBuilder({ getSquad, reorder, onOpen, onClose }) {
    this.squadBuilderHandlers = { getSquad, reorder, onOpen, onClose };

    this.squadBuilderToggle.addEventListener('click', () => {
      onOpen();
      this.showSquadBuilder();
    });

    const close = () => {
      if (!this.squadBuilderScreen.classList.contains('overlay--visible')) return;
      this.hideSquadBuilder();
      onClose();
    };

    this.squadBuilderClose.addEventListener('click', close);
    this.squadBuilderDone.addEventListener('click', close);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    window.addEventListener('resize', () => {
      this.renderCaptainOptions();
      if (!this.squadBuilderScreen.classList.contains('overlay--visible')) return;
      this.squadBuilderHasCentered = false;
      this.renderSquadBuilder();
    });
  }

  update(game) {
    const player = game.player;
    const infiniteHp = Boolean(game.debug?.infiniteHp);
    const hpPercent = infiniteHp ? 100 : Math.max(0, player.hp / player.maxHp) * 100;
    const xpPercent = Math.max(0, player.xp / player.xpToNext) * 100;
    this.hpText.textContent = infiniteHp ? '∞ / ∞' : `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;
    this.hpBar.style.width = `${hpPercent}%`;
    this.xpBar.style.width = `${xpPercent}%`;
    this.xpText.textContent = `${player.xp} / ${player.xpToNext} XP`;
    this.levelText.textContent = `Level ${player.level}`;
    this.killsText.textContent = game.kills;
    this.squadText.textContent = player.squad.length;
    this.timeText.textContent = this.formatTime(game.elapsed);
    this.debugInfiniteHp.checked = infiniteHp;
  }

  showSquadBuilder() {
    this.squadBuilderSelection = null;
    this.squadBuilderHasCentered = false;
    this.renderSquadBuilder();
    this.squadBuilderScreen.classList.add('overlay--visible');
    this.squadBuilderScreen.setAttribute('aria-hidden', 'false');
  }

  hideSquadBuilder() {
    this.squadBuilderSelection = null;
    this.squadBuilderHasCentered = false;
    this.squadBuilderScreen.classList.remove('overlay--visible');
    this.squadBuilderScreen.setAttribute('aria-hidden', 'true');
  }

  getSquadBuilderHexRadius(count, mobile) {
    if (mobile) {
      if (count <= 7) return 54;
      if (count <= 19) return 48;
      if (count <= 37) return 42;
      if (count <= 61) return 36;
      return 30;
    }

    if (count <= 7) return 70;
    if (count <= 19) return 64;
    if (count <= 37) return 52;
    if (count <= 61) return 44;
    return 36;
  }

  renderSquadBuilder() {
    if (!this.squadBuilderHandlers) return;
    const squad = this.squadBuilderHandlers.getSquad();
    const previousScrollLeft = this.squadBuilderGrid.scrollLeft;
    const previousScrollTop = this.squadBuilderGrid.scrollTop;
    this.squadBuilderGrid.replaceChildren();

    const counts = squad.reduce((result, unit) => {
      result[unit.type] = (result[unit.type] || 0) + 1;
      return result;
    }, {});
    const breakdown = Object.entries(counts)
      .map(([type, count]) => `${count} ${UNIT_CLASSES[type]?.label ?? type}`)
      .join(' • ');
    const captainUnit = squad.find((unit) => Boolean(unit.captainId));
    const captain = captainUnit ? CAPTAINS[captainUnit.captainId] : null;
    const captainText = captain ? ` • ${captain.name}` : '';
    this.squadBuilderSummary.textContent = `${squad.length} unit${squad.length === 1 ? '' : 's'}${breakdown ? ` • ${breakdown}` : ''}${captainText}`;

    if (squad.length === 0) return;

    const mobile = window.innerWidth <= 760;
    const hexRadius = this.getSquadBuilderHexRadius(squad.length, mobile);
    const cardWidth = Math.sqrt(3) * hexRadius;
    const cardHeight = hexRadius * 2;
    const layout = getHexFormationLayout(squad.length, hexRadius);
    const maxAbsX = Math.max(...layout.map((position) => Math.abs(position.x)));
    const maxAbsY = Math.max(...layout.map((position) => Math.abs(position.y)));
    const dense = hexRadius <= 44;
    const veryDense = hexRadius <= 36;

    const board = document.createElement('div');
    board.className = 'squad-builder__board';
    board.style.width = `${Math.max(mobile ? 300 : 420, maxAbsX * 2 + cardWidth + 56)}px`;
    board.style.height = `${Math.max(230, maxAbsY * 2 + cardHeight + 56)}px`;

    squad.forEach((unit, index) => {
      const unitClass = UNIT_CLASSES[unit.type] ?? UNIT_CLASSES.rifleman;
      const unitCaptain = unit.captainId ? CAPTAINS[unit.captainId] : null;
      const slot = layout[index];
      const card = document.createElement('button');

      card.type = 'button';
      card.draggable = true;
      card.className = 'squad-unit-card';
      card.dataset.index = String(index);
      card.dataset.hexQ = String(slot.q);
      card.dataset.hexR = String(slot.r);
      card.style.setProperty('--unit-color', unitCaptain?.color ?? unitClass.fill);
      card.style.width = `${cardWidth}px`;
      card.style.height = `${cardHeight}px`;
      card.style.left = `calc(50% + ${slot.x}px)`;
      card.style.top = `calc(50% + ${slot.y}px)`;
      card.style.padding = dense ? '10px 7px' : '18px 12px';
      card.setAttribute('aria-label', `Slot ${index + 1}: ${unitCaptain?.name ?? unitClass.label}`);
      if (this.squadBuilderSelection === index) card.classList.add('squad-unit-card--selected');

      card.innerHTML = `
        <span class="squad-unit-card__slot">${index + 1}</span>
        <span class="squad-unit-card__icon">${unitCaptain?.shortLabel ?? unitClass.shortLabel}</span>
        <strong>${unitCaptain?.name ?? unitClass.label}</strong>
        <small>${unitCaptain ? unitCaptain.role : (unitClass.weapon.kind === 'rocket' ? 'AoE rockets' : 'Automatic rifle')}</small>
      `;

      const slotLabel = card.querySelector('.squad-unit-card__slot');
      const icon = card.querySelector('.squad-unit-card__icon');
      const label = card.querySelector('strong');
      const detail = card.querySelector('small');

      if (dense) {
        slotLabel.style.top = '16%';
        slotLabel.style.left = '17%';
        slotLabel.style.fontSize = veryDense ? '7px' : '8px';
        icon.style.width = veryDense ? '30px' : '34px';
        icon.style.height = veryDense ? '30px' : '34px';
        icon.style.fontSize = veryDense ? '8px' : '9px';
        label.style.fontSize = '10px';
        label.style.marginTop = '4px';
        detail.style.display = 'none';
      }

      if (veryDense) label.style.display = 'none';

      card.addEventListener('dragstart', (event) => {
        this.squadBuilderDragging = true;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
        card.classList.add('squad-unit-card--dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('squad-unit-card--dragging');
        setTimeout(() => { this.squadBuilderDragging = false; }, 0);
      });

      card.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      });

      card.addEventListener('drop', (event) => {
        event.preventDefault();
        const fromIndex = Number(event.dataTransfer.getData('text/plain'));
        this.squadBuilderHandlers.reorder(fromIndex, index);
        this.squadBuilderSelection = null;
        this.renderSquadBuilder();
      });

      card.addEventListener('click', () => {
        if (this.squadBuilderDragging) return;

        if (this.squadBuilderSelection === null) {
          this.squadBuilderSelection = index;
          this.renderSquadBuilder();
          return;
        }

        if (this.squadBuilderSelection === index) {
          this.squadBuilderSelection = null;
          this.renderSquadBuilder();
          return;
        }

        this.squadBuilderHandlers.reorder(this.squadBuilderSelection, index);
        this.squadBuilderSelection = null;
        this.renderSquadBuilder();
      });

      board.append(card);
    });

    this.squadBuilderGrid.append(board);

    requestAnimationFrame(() => {
      if (!this.squadBuilderHasCentered) {
        this.squadBuilderGrid.scrollLeft = Math.max(0, (this.squadBuilderGrid.scrollWidth - this.squadBuilderGrid.clientWidth) / 2);
        this.squadBuilderGrid.scrollTop = Math.max(0, (this.squadBuilderGrid.scrollHeight - this.squadBuilderGrid.clientHeight) / 2);
        this.squadBuilderHasCentered = true;
        return;
      }

      this.squadBuilderGrid.scrollLeft = previousScrollLeft;
      this.squadBuilderGrid.scrollTop = previousScrollTop;
    });
  }

  showLevelUp(choices, onChoose, ranks) {
    this.upgradeOptions.replaceChildren();
    for (const choice of choices) {
      const { upgrade, rarity } = choice;
      const currentRank = ranks.get(upgrade.id) || 0;
      const button = document.createElement('button');
      button.className = `upgrade-card upgrade-card--${rarity.id}`;
      button.style.setProperty('--rarity-color', rarity.color);
      button.innerHTML = `
        <span class="upgrade-card__meta">
          <span class="upgrade-card__tag">${upgrade.tag}</span>
          <span class="upgrade-card__rarity">${rarity.label}</span>
        </span>
        <strong>${upgrade.name}</strong>
        <p>${upgrade.describe(rarity)}</p>
        <small>Rank ${currentRank + 1} / ${upgrade.maxRank}</small>
      `;
      button.addEventListener('click', () => onChoose(choice), { once: true });
      this.upgradeOptions.append(button);
    }
    this.levelupScreen.classList.add('overlay--visible');
    this.levelupScreen.setAttribute('aria-hidden', 'false');
  }

  hideLevelUp() {
    this.levelupScreen.classList.remove('overlay--visible');
    this.levelupScreen.setAttribute('aria-hidden', 'true');
  }

  hideStart() { this.startScreen.classList.remove('overlay--visible'); }

  showGameOver(game) {
    this.resultTime.textContent = this.formatTime(game.elapsed);
    this.resultKills.textContent = game.kills;
    this.resultLevel.textContent = game.player.level;
    this.gameoverScreen.classList.add('overlay--visible');
    this.gameoverScreen.setAttribute('aria-hidden', 'false');
  }

  hideGameOver() {
    this.gameoverScreen.classList.remove('overlay--visible');
    this.gameoverScreen.setAttribute('aria-hidden', 'true');
  }

  formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60).toString().padStart(2, '0');
    const remainder = (total % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }
}
