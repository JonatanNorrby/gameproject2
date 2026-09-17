import { Game as PreviousGame, UI as PreviousUI } from './prestigePopup.js';
import { HANDBOOK_BOSS_STORAGE_KEY } from './handbook.js';
import { recordHighestRunLevel } from '../data/prestige.js';
import { GROUND_DROPS } from '../data/groundDrops.js';

const ISSUE_88_STYLE_ID = 'issue-88-loading-screen';
const ISSUE_88_STYLES = `
  .boot-screen__track {
    display: block !important;
  }
`;

const ISSUE_107_STYLE_ID = 'issue-107-end-run';
const ISSUE_107_STYLES = `
  .end-run-button {
    align-self: flex-end;
    min-width: 86px;
    min-height: 42px;
    border: 1px solid rgba(255, 95, 121, .72);
    border-radius: 11px;
    padding: 8px 12px;
    background: linear-gradient(180deg, rgba(139, 28, 47, .96), rgba(80, 13, 27, .96));
    color: #ffe7ec;
    font-size: 10px;
    font-weight: 1000;
    letter-spacing: .11em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 8px 24px rgba(0, 0, 0, .3), 0 0 18px rgba(255, 95, 121, .12);
    transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease, transform 120ms ease;
  }

  .end-run-button:hover {
    border-color: #ff7188;
    background: linear-gradient(180deg, rgba(168, 34, 57, .98), rgba(99, 16, 32, .98));
    box-shadow: 0 8px 24px rgba(0, 0, 0, .34), 0 0 22px rgba(255, 95, 121, .24);
    transform: translateY(-1px);
  }

  .end-run-button:active {
    transform: translateY(1px);
  }

  .end-run-button[hidden] {
    display: none !important;
  }

  @media (max-width: 620px) {
    .end-run-button {
      min-width: 70px;
      min-height: 38px;
      padding: 7px 9px;
      font-size: 9px;
      letter-spacing: .08em;
    }
  }

  @media (max-width: 430px) {
    .end-run-button {
      min-width: 62px;
      padding-inline: 7px;
      letter-spacing: .05em;
    }
  }
`;

const HEALTH_DROP_TYPE = 'health';
const HEALTH_DROP_CHANCE = 0.33;
const HEALTH_DROP_HEAL_FRACTION = 0.1;
const HEALTH_DROP_ENEMY_TYPES = new Set(['brute', 'charger']);

// #120: this pickup is deliberately not added to GROUND_DROP_IDS, so normal
// enemies cannot roll it through the generic 0.5% ground-drop table.
if (!GROUND_DROPS[HEALTH_DROP_TYPE]) {
  GROUND_DROPS[HEALTH_DROP_TYPE] = Object.freeze({
    id: HEALTH_DROP_TYPE,
    label: 'HP',
    symbol: '+',
    color: '#70dc8b',
    description: 'Restore 10% max HP to every living squad unit.',
    kind: 'instant',
  });
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.installIssue120HealthDropHook();
  }

  installIssue120HealthDropHook() {
    const combatSystem = this.combatSystem;
    if (!combatSystem || combatSystem.issue120HealthDropHookInstalled) return;

    const previousKillEnemy = combatSystem.killEnemy.bind(combatSystem);
    combatSystem.killEnemy = (enemy, options = {}) => {
      const wasDead = Boolean(enemy?.dead);
      const allowDrop = options?.allowDrop !== false;
      const enemyType = enemy?.type;
      const dropX = enemy?.x;
      const dropY = enemy?.y;
      const result = previousKillEnemy(enemy, options);

      if (
        !wasDead
        && enemy?.dead
        && allowDrop
        && HEALTH_DROP_ENEMY_TYPES.has(enemyType)
        && Math.random() < HEALTH_DROP_CHANCE
      ) {
        this.spawnGroundDrop(HEALTH_DROP_TYPE, dropX, dropY);
      }

      return result;
    };
    combatSystem.issue120HealthDropHookInstalled = true;
  }

  collectGroundDrop(type) {
    if (type !== HEALTH_DROP_TYPE) return super.collectGroundDrop(type);

    for (const unit of this.player?.squad ?? []) {
      if (unit.dead) continue;
      const maxHp = Number(unit.maxHp) || 0;
      unit.hp = Math.min(maxHp, (Number(unit.hp) || 0) + maxHp * HEALTH_DROP_HEAL_FRACTION);
    }
    this.syncCaptainHealth?.();

    const definition = GROUND_DROPS[HEALTH_DROP_TYPE];
    this.spawnExplosionEffect(this.player.x, this.player.y, 42, definition.color);
  }

  start(...args) {
    this.manualRunEnd = false;
    return super.start(...args);
  }

  endRun() {
    if (!this.running || this.pauseReasons?.has('gameover')) return false;

    // Permanent Gold and unlocks are persisted at the moment they are earned.
    // Record the current run level once more here so every permanent progression
    // system is committed before the manual run-end results screen is shown.
    recordHighestRunLevel(this.player?.level ?? 1);
    this.manualRunEnd = true;

    this.ui?.hideLevelUp?.();
    this.ui?.hideSquadBuilder?.();
    this.pauseReasons?.delete?.('levelup');
    this.pauseReasons?.delete?.('squad-builder');
    this.pause('gameover');
    this.ui?.showGameOver?.(this);
    this.ui?.renderPermanentShop?.();
    this.ui?.refreshPrestigePopup?.();
    return true;
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.applyIssue88LoadingScreen();
    this.installIssue107EndRunControl();
  }

  applyIssue88LoadingScreen() {
    const content = document.querySelector('#boot-screen .boot-screen__content');
    if (!content) return;

    content.querySelector('.boot-screen__eyebrow')?.remove?.();

    if (!document.querySelector(`#${ISSUE_88_STYLE_ID}`)) {
      const style = document.createElement('style');
      style.id = ISSUE_88_STYLE_ID;
      style.textContent = ISSUE_88_STYLES;
      document.head?.append(style);
    }

    let track = content.querySelector('.boot-screen__track');
    if (!track) {
      track = document.createElement('div');
      track.className = 'boot-screen__track';
      track.setAttribute('aria-hidden', 'true');

      const bar = document.createElement('div');
      bar.className = 'boot-screen__bar';
      track.append(bar);

      const status = content.querySelector('#boot-status');
      if (status?.after) status.after(track);
      else content.append(track);
    }
  }

  installIssue107EndRunControl() {
    if (!document.querySelector(`#${ISSUE_107_STYLE_ID}`)) {
      const style = document.createElement('style');
      style.id = ISSUE_107_STYLE_ID;
      style.textContent = ISSUE_107_STYLES;
      document.head?.append(style);
    }

    const hudBottom = document.querySelector('.hud__bottom');
    if (!hudBottom) return;

    let button = document.querySelector('#end-run-button');
    if (!button) {
      button = document.createElement('button');
      button.id = 'end-run-button';
      button.className = 'end-run-button';
      button.type = 'button';
      button.textContent = 'End Run';
      button.title = 'End the current run and keep permanent progress earned so far';
      button.setAttribute('aria-label', 'End run and keep permanent progress earned so far');
      hudBottom.prepend(button);
    }

    button.hidden = true;
    button.setAttribute('aria-hidden', 'true');
    button.addEventListener('click', () => {
      const game = this.game;
      if (!game?.running || game.pauseReasons?.has('gameover')) return;

      const confirmed = window.confirm(
        'End this run now? Gold, unlocks and other permanent progress earned so far will be kept.',
      );
      if (!confirmed) return;
      game.endRun?.();
    });

    this.endRunButton = button;
  }

  installFullResetDebugControl(...args) {
    const result = super.installFullResetDebugControl(...args);
    const detail = document.querySelector('#debug-reset-all-progress small');
    if (detail) {
      detail.textContent = 'Erase Captains, Gold, upgrades, Prestige and Handbook discoveries';
    }
    return result;
  }

  resetEverythingFromDebug(...args) {
    const result = super.resetEverythingFromDebug(...args);

    // #111: Handbook boss sightings are their own persistent progression state,
    // separate from Captain unlocks, Gold upgrades and Prestige. Clear that key
    // as part of Reset ALL, then reload so the Handbook cannot retain stale
    // discoveries from its in-memory cache after the reset.
    try {
      window.localStorage?.removeItem(HANDBOOK_BOSS_STORAGE_KEY);
    } catch (error) {
      console.warn('Could not reset Handbook progress.', error);
    }
    window.location.reload();
    return result;
  }

  showGameOver(game, ...args) {
    const heading = this.gameoverScreen?.querySelector('h2');
    if (heading) heading.textContent = game?.manualRunEnd ? 'Run Ended' : 'Signal Lost';
    return super.showGameOver(game, ...args);
  }

  update(game) {
    super.update(game);
    if (!this.endRunButton) return;

    const visible = Boolean(game?.running && !game.pauseReasons?.has('gameover'));
    this.endRunButton.hidden = !visible;
    this.endRunButton.setAttribute('aria-hidden', String(!visible));
  }
}
