import { UNIT_CLASSES } from '../data/content.js';

const GAME_VERSION = '0.2.0';

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

    this.versionText.textContent = `v${GAME_VERSION}`;
  }

  bindStart(handler) { document.querySelector('#start-button').addEventListener('click', handler); }
  bindRestart(handler) { document.querySelector('#restart-button').addEventListener('click', handler); }

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
    this.renderSquadBuilder();
    this.squadBuilderScreen.classList.add('overlay--visible');
    this.squadBuilderScreen.setAttribute('aria-hidden', 'false');
  }

  hideSquadBuilder() {
    this.squadBuilderSelection = null;
    this.squadBuilderScreen.classList.remove('overlay--visible');
    this.squadBuilderScreen.setAttribute('aria-hidden', 'true');
  }

  renderSquadBuilder() {
    if (!this.squadBuilderHandlers) return;
    const squad = this.squadBuilderHandlers.getSquad();
    this.squadBuilderGrid.replaceChildren();

    const counts = squad.reduce((result, unit) => {
      result[unit.type] = (result[unit.type] || 0) + 1;
      return result;
    }, {});
    const breakdown = Object.entries(counts)
      .map(([type, count]) => `${count} ${UNIT_CLASSES[type]?.label ?? type}`)
      .join(' • ');
    this.squadBuilderSummary.textContent = `${squad.length} unit${squad.length === 1 ? '' : 's'}${breakdown ? ` • ${breakdown}` : ''}`;

    if (squad.length === 0) return;

    const columns = Math.ceil(Math.sqrt(squad.length));
    const rows = Math.ceil(squad.length / columns);

    for (let row = 0; row < rows; row += 1) {
      const firstIndex = row * columns;
      const rowCount = Math.min(columns, squad.length - firstIndex);
      const rowElement = document.createElement('div');
      rowElement.className = 'squad-builder__row';

      for (let column = 0; column < rowCount; column += 1) {
        const index = firstIndex + column;
        const unit = squad[index];
        const unitClass = UNIT_CLASSES[unit.type] ?? UNIT_CLASSES.rifleman;
        const card = document.createElement('button');

        card.type = 'button';
        card.draggable = true;
        card.className = 'squad-unit-card';
        card.dataset.index = String(index);
        card.style.setProperty('--unit-color', unitClass.fill);
        if (this.squadBuilderSelection === index) card.classList.add('squad-unit-card--selected');

        card.innerHTML = `
          <span class="squad-unit-card__slot">${index + 1}</span>
          <span class="squad-unit-card__icon">${unitClass.shortLabel}</span>
          <strong>${unitClass.label}</strong>
          <small>${unitClass.weapon.kind === 'rocket' ? 'AoE rockets' : 'Automatic rifle'}</small>
        `;

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

        rowElement.append(card);
      }

      this.squadBuilderGrid.append(rowElement);
    }
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
