export class UI {
  constructor() {
    this.hpText = document.querySelector('#hp-text');
    this.hpBar = document.querySelector('#hp-bar');
    this.timeText = document.querySelector('#time-text');
    this.killsText = document.querySelector('#kills-text');
    this.squadText = document.querySelector('#squad-text');
    this.levelText = document.querySelector('#level-text');
    this.xpText = document.querySelector('#xp-text');
    this.xpBar = document.querySelector('#xp-bar');
    this.startScreen = document.querySelector('#start-screen');
    this.levelupScreen = document.querySelector('#levelup-screen');
    this.gameoverScreen = document.querySelector('#gameover-screen');
    this.upgradeOptions = document.querySelector('#upgrade-options');
    this.resultTime = document.querySelector('#result-time');
    this.resultKills = document.querySelector('#result-kills');
    this.resultLevel = document.querySelector('#result-level');
  }

  bindStart(handler) { document.querySelector('#start-button').addEventListener('click', handler); }
  bindRestart(handler) { document.querySelector('#restart-button').addEventListener('click', handler); }

  update(game) {
    const player = game.player;
    const hpPercent = Math.max(0, player.hp / player.maxHp) * 100;
    const xpPercent = Math.max(0, player.xp / player.xpToNext) * 100;
    this.hpText.textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;
    this.hpBar.style.width = `${hpPercent}%`;
    this.xpBar.style.width = `${xpPercent}%`;
    this.xpText.textContent = `${player.xp} / ${player.xpToNext} XP`;
    this.levelText.textContent = `Level ${player.level}`;
    this.killsText.textContent = game.kills;
    this.squadText.textContent = player.soldiers;
    this.timeText.textContent = this.formatTime(game.elapsed);
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
