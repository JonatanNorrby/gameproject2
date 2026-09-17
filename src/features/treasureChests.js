import { Game as PreviousGame, UI } from './beefedUp.js';
import {
  getPermanentUpgradeRank,
  grantGold,
  isPermanentUpgradeActive,
} from '../data/metaUpgrades.js';
import { distanceSq, normalize } from '../utils/math.js';

export const TREASURE_CHEST_UPGRADE_ID = 'treasure_chests';
export const TREASURE_CHEST_DROP_CHANCE = 0.025;
export const TREASURE_CHEST_GOLD_REWARD = 5;
export const TREASURE_CHEST_XP_FRACTION = 0.25;

const TREASURE_CHEST_TUNING = Object.freeze([
  Object.freeze({ dropChance: 0, goldReward: 0, xpFraction: 0 }),
  Object.freeze({ dropChance: 0.025, goldReward: 5, xpFraction: 0.25 }),
  Object.freeze({ dropChance: 0.04, goldReward: 8, xpFraction: 0.33 }),
  Object.freeze({ dropChance: 0.06, goldReward: 12, xpFraction: 0.45 }),
]);

const CHEST_RADIUS = 16;
const CHEST_MAGNET_RADIUS = 105;
const CHEST_PICKUP_RADIUS = 24;
const CHEST_PULL_SPEED = 210;

function getTreasureChestTuning() {
  if (!isPermanentUpgradeActive(TREASURE_CHEST_UPGRADE_ID)) return TREASURE_CHEST_TUNING[0];
  const rank = Math.max(1, Math.min(3, getPermanentUpgradeRank(TREASURE_CHEST_UPGRADE_ID)));
  return TREASURE_CHEST_TUNING[rank];
}

export function getTreasureChestXpReward(player) {
  const xpToNext = Math.max(1, Number(player?.xpToNext) || 1);
  return Math.max(1, Math.round(xpToNext * getTreasureChestTuning().xpFraction));
}

function createTreasureChestCombatSystem(ParentCombatSystem) {
  return class TreasureChestCombatSystem extends ParentCombatSystem {
    killEnemy(enemy, options = {}) {
      const wasAlive = Boolean(enemy && !enemy.dead);
      super.killEnemy(enemy, options);
      if (!wasAlive || !enemy?.dead || options.allowDrop === false) return;
      const tuning = getTreasureChestTuning();
      if (tuning.dropChance <= 0 || Math.random() >= tuning.dropChance) return;
      this.game.spawnTreasureChest(enemy.x, enemy.y);
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const TreasureChestCombatSystem = createTreasureChestCombatSystem(
      this.combatSystem.constructor,
    );
    this.combatSystem = new TreasureChestCombatSystem(this);
    this.combatSystem.reset();
  }

  resetState() {
    this.treasureChests = [];
    super.resetState();
  }

  spawnTreasureChest(x, y) {
    if (!isPermanentUpgradeActive(TREASURE_CHEST_UPGRADE_ID)) return null;
    const chest = {
      id: `treasure-${this.entities.createId()}`,
      x,
      y,
      radius: CHEST_RADIUS,
      dead: false,
      pulseOffset: Math.random() * Math.PI * 2,
    };
    this.treasureChests.push(chest);
    return chest;
  }

  collectTreasureChest(chest) {
    if (!chest || chest.dead) return false;
    chest.dead = true;

    const tuning = getTreasureChestTuning();
    const xpReward = getTreasureChestXpReward(this.player);
    grantGold(tuning.goldReward);
    this.runGoldCollected = (this.runGoldCollected ?? 0) + tuning.goldReward;
    this.progression.addXp(xpReward);
    this.spawnExplosionEffect(chest.x, chest.y, 36, '#f7c94b');
    this.ui?.renderPermanentShop?.();
    return true;
  }

  updateTreasureChests(dt) {
    const player = this.player;
    if (!player) return;

    const magnetRadiusSq = CHEST_MAGNET_RADIUS * CHEST_MAGNET_RADIUS;
    for (const chest of this.treasureChests ?? []) {
      if (chest.dead) continue;
      const distSq = distanceSq(player.x, player.y, chest.x, chest.y);
      if (distSq <= magnetRadiusSq) {
        const direction = normalize(player.x - chest.x, player.y - chest.y);
        const distance = Math.sqrt(distSq);
        const pull = CHEST_PULL_SPEED + Math.max(0, CHEST_MAGNET_RADIUS - distance) * 2.5;
        chest.x += direction.x * pull * dt;
        chest.y += direction.y * pull * dt;
      }

      const pickupRadius = player.radius + chest.radius + CHEST_PICKUP_RADIUS;
      if (distanceSq(player.x, player.y, chest.x, chest.y) <= pickupRadius * pickupRadius) {
        this.collectTreasureChest(chest);
      }
    }

    this.treasureChests = (this.treasureChests ?? []).filter((chest) => !chest.dead);
  }

  update(dt) {
    super.update(dt);
    if (this.pauseReasons?.has('gameover')) return;
    this.updateTreasureChests(dt);
  }

  drawGroundDrops(ctx) {
    super.drawGroundDrops(ctx);

    for (const chest of this.treasureChests ?? []) {
      if (chest.dead) continue;
      const pulse = 1 + Math.sin(this.animationClock * 5 + chest.pulseOffset) * 0.06;
      ctx.save();
      ctx.translate(chest.x, chest.y);
      ctx.scale(pulse, pulse);

      ctx.shadowBlur = 22;
      ctx.shadowColor = '#f7c94b';
      ctx.fillStyle = '#7d4f18';
      ctx.strokeStyle = '#ffe58a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-17, -10, 34, 23, 5);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#c78b2b';
      ctx.fillRect(-17, -4, 34, 6);
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(-3, -4, 6, 10);
      ctx.fillStyle = '#fff4bd';
      ctx.beginPath();
      ctx.arc(0, 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export { UI };
