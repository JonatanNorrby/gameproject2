import { Game as PreviousGame, UI as PreviousUI } from './treasureChests.js';
import { ENEMY_TYPES } from '../data/content.js';

export const DEBUG_MOB_SPAWN_MIN_DISTANCE = 300;
export const DEBUG_MOB_SPAWN_MAX_DISTANCE = 430;

export function getDebugMobEntries() {
  return Object.entries(ENEMY_TYPES)
    .filter(([id, type]) => Boolean(id && type?.label))
    .sort(([, left], [, right]) => left.label.localeCompare(right.label));
}

export function createDebugMobState(game, enemyType, angle = Math.random() * Math.PI * 2) {
  const type = ENEMY_TYPES[enemyType];
  if (!game || !type) return null;

  const elapsed = Math.max(0, Number(game.elapsed) || 0);
  const difficulty = 1 + elapsed * 0.008;
  const damageScaling = Math.min(1.8, 1 + elapsed * 0.005);
  const distance = DEBUG_MOB_SPAWN_MIN_DISTANCE
    + Math.random() * (DEBUG_MOB_SPAWN_MAX_DISTANCE - DEBUG_MOB_SPAWN_MIN_DISTANCE);
  const playerX = Number(game.player?.x) || 0;
  const playerY = Number(game.player?.y) || 0;

  return {
    id: game.entities.createId(),
    type: enemyType,
    x: playerX + Math.cos(angle) * distance,
    y: playerY + Math.sin(angle) * distance,
    radius: type.radius,
    speed: type.speed * Math.min(1.42, 1 + elapsed * 0.0018),
    maxHp: type.hp * difficulty,
    hp: type.hp * difficulty,
    damage: type.damage * damageScaling,
    rangedDamage: type.ranged ? type.ranged.damage * damageScaling : 0,
    rangedCooldown: type.ranged
      ? type.ranged.cooldown * (0.5 + Math.random() * 0.5)
      : 0,
    xp: type.xp,
    hitFlash: 0,
    dead: false,
  };
}

export class Game extends PreviousGame {
  debugSpawnMob(enemyType, angle = null) {
    if (!ENEMY_TYPES[enemyType]) return null;
    const enemy = createDebugMobState(
      this,
      enemyType,
      Number.isFinite(angle) ? angle : Math.random() * Math.PI * 2,
    );
    if (!enemy) return null;
    this.entities.enemies.push(enemy);
    return enemy;
  }

  debugSpawnAllMobs() {
    const entries = getDebugMobEntries();
    const count = entries.length;
    if (count === 0) return [];

    return entries
      .map(([enemyType], index) => (
        this.debugSpawnMob(enemyType, (Math.PI * 2 * index) / count)
      ))
      .filter(Boolean);
  }
}

function createHeading(text) {
  const heading = document.createElement('div');
  heading.className = 'debug-drop-heading';
  heading.textContent = text;
  return heading;
}

function createButton(title, detail = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'debug-control debug-control--button';

  const strong = document.createElement('strong');
  strong.textContent = title;
  button.append(strong);

  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    button.append(small);
  }
  return button;
}

export class UI extends PreviousUI {
  bindDebug(config) {
    super.bindDebug(config);
    this.installMobDebugControls();
  }

  installMobDebugControls() {
    if (!this.debugPanel || this.debugPanel.querySelector('#debug-mob-controls')) return;

    const groundDropHeading = [...this.debugPanel.querySelectorAll('.debug-drop-heading')]
      .find((heading) => heading.textContent?.trim().toUpperCase() === 'GROUND DROPS')
      ?? this.debugPanel.querySelector('.debug-drop-heading');
    if (!groundDropHeading) return;

    const fragment = document.createDocumentFragment();
    const heading = createHeading('MOBS');
    heading.id = 'debug-mob-controls';
    fragment.append(heading);

    const allButton = createButton(
      'Spawn All Mobs',
      'Spawn one of every registered normal enemy around the squad',
    );
    allButton.id = 'debug-spawn-all-mobs';
    allButton.addEventListener('click', () => {
      if (!this.debugUnlocked) return;
      this.game?.debugSpawnAllMobs?.();
      this.setInGameDebugOpen?.(false);
    });
    fragment.append(allButton);

    for (const [enemyType, type] of getDebugMobEntries()) {
      const button = createButton(
        `Spawn ${type.label}`,
        'Spawn one mob near the squad, ignoring normal unlock/cap rules',
      );
      button.dataset.debugMob = enemyType;
      button.addEventListener('click', () => {
        if (!this.debugUnlocked) return;
        this.game?.debugSpawnMob?.(enemyType);
      });
      fragment.append(button);
    }

    groundDropHeading.before(fragment);
  }
}
