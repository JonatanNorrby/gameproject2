import { Game as PreviousGame, UI } from './beefedUp.js';
import {
  getPermanentUpgradeRank,
  grantGold,
  isPermanentUpgradeActive,
} from '../data/metaUpgrades.js';
import { distanceSq } from '../utils/math.js';

export const TREASURE_CHEST_UPGRADE_ID = 'treasure_chests';
export const TREASURE_CHEST_DROP_CHANCE = 0.025;
export const TREASURE_CHEST_GOLD_REWARD = 2;
export const TREASURE_CHEST_XP_REWARD = 25;
export const TREASURE_CHEST_UNLOCK_DURATION = 0;
export const BOSS_CHEST_UNLOCK_DURATION = 2.5;

const TREASURE_CHEST_TUNING = Object.freeze([
  Object.freeze({ dropChance: 0, goldReward: 0 }),
  Object.freeze({ dropChance: 0.025, goldReward: TREASURE_CHEST_GOLD_REWARD }),
  Object.freeze({ dropChance: 0.04, goldReward: TREASURE_CHEST_GOLD_REWARD }),
  Object.freeze({ dropChance: 0.06, goldReward: TREASURE_CHEST_GOLD_REWARD }),
]);

// Boss Caches keep their separate boss-specific reward path.
const BOSS_CHEST_TUNING = Object.freeze({ goldReward: 12, xpFraction: 1.5 });
const CHEST_RADIUS = 16;
const BOSS_CHEST_RADIUS = 21;
const CHEST_UNLOCK_PADDING = 6;

function getTreasureChestTuning() {
  if (!isPermanentUpgradeActive(TREASURE_CHEST_UPGRADE_ID)) return TREASURE_CHEST_TUNING[0];
  const rank = Math.max(1, Math.min(3, getPermanentUpgradeRank(TREASURE_CHEST_UPGRADE_ID)));
  return TREASURE_CHEST_TUNING[rank];
}

function getChestUnlockDuration(chest) {
  return chest?.bossReward ? BOSS_CHEST_UNLOCK_DURATION : TREASURE_CHEST_UNLOCK_DURATION;
}

function getChestRewardTuning(chest) {
  return chest?.bossReward ? BOSS_CHEST_TUNING : getTreasureChestTuning();
}

export function getTreasureChestXpReward(player, chest = null) {
  if (!chest?.bossReward) return TREASURE_CHEST_XP_REWARD;
  const xpToNext = Math.max(1, Number(player?.xpToNext) || 1);
  return Math.max(1, Math.round(xpToNext * BOSS_CHEST_TUNING.xpFraction));
}

function createTreasureChestCombatSystem(ParentCombatSystem) {
  return class TreasureChestCombatSystem extends ParentCombatSystem {
    killEnemy(enemy, options = {}) {
      const wasAlive = Boolean(enemy && !enemy.dead);
      super.killEnemy(enemy, options);
      if (!wasAlive || !enemy?.dead || options.allowDrop === false) return;
      if (enemy.type === 'crawler' || enemy.type === 'runner') return;
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

  spawnTreasureChest(x, y, options = {}) {
    const bossReward = Boolean(options.bossReward);
    if (!bossReward && !isPermanentUpgradeActive(TREASURE_CHEST_UPGRADE_ID)) return null;

    const chest = {
      id: `treasure-${this.entities.createId()}`,
      x,
      y,
      radius: bossReward ? BOSS_CHEST_RADIUS : CHEST_RADIUS,
      dead: false,
      pulseOffset: Math.random() * Math.PI * 2,
      unlockProgress: 0,
      bossReward,
      bossId: bossReward ? (options.bossId ?? null) : null,
    };
    this.treasureChests.push(chest);
    return chest;
  }

  spawnBossTreasureChest(x, y, bossId) {
    return this.spawnTreasureChest(x, y, {
      bossReward: true,
      bossId,
    });
  }

  collectGroundDrop(type) {
    if (type === 'magnet') {
      // Gold pickups keep their normal reward path. Moving every live pickup
      // onto the squad lets updateGoldDrops() award run Gold, persist it and
      // refresh the shop exactly as if each pickup had been collected normally.
      for (const drop of this.goldDrops ?? []) {
        if (drop.dead) continue;
        drop.x = this.player.x;
        drop.y = this.player.y;
      }
    }

    super.collectGroundDrop(type);
  }

  defeatWarden(boss) {
    const wasAlive = Boolean(boss && !boss.dead);
    const rewardPosition = boss ? { x: boss.x, y: boss.y } : null;
    super.defeatWarden(boss);
    if (wasAlive && boss?.dead && rewardPosition) {
      this.spawnBossTreasureChest(rewardPosition.x, rewardPosition.y, 'warden');
    }
  }

  defeatBroodmother(boss) {
    const wasAlive = Boolean(boss && !boss.dead);
    const rewardPosition = boss ? { x: boss.x, y: boss.y } : null;
    super.defeatBroodmother(boss);
    if (wasAlive && boss?.dead && rewardPosition) {
      this.spawnBossTreasureChest(rewardPosition.x, rewardPosition.y, 'broodmother');
    }
  }

  defeatCipher(boss) {
    const wasAlive = Boolean(boss && !boss.dead);
    const rewardPosition = boss ? { x: boss.x, y: boss.y } : null;
    super.defeatCipher(boss);
    if (wasAlive && boss?.dead && rewardPosition) {
      this.spawnBossTreasureChest(rewardPosition.x, rewardPosition.y, 'cipher');
    }
  }

  collectTreasureChest(chest) {
    if (!chest || chest.dead) return false;
    chest.dead = true;

    const tuning = getChestRewardTuning(chest);
    const xpReward = getTreasureChestXpReward(this.player, chest);
    grantGold(tuning.goldReward);
    this.runGoldCollected = (this.runGoldCollected ?? 0) + tuning.goldReward;
    this.progression.addXp(xpReward);
    this.spawnExplosionEffect(
      chest.x,
      chest.y,
      chest.bossReward ? 54 : 36,
      chest.bossReward ? '#fff1a8' : '#f7c94b',
    );
    this.ui?.renderPermanentShop?.();
    return true;
  }

  updateTreasureChests(dt) {
    const player = this.player;
    if (!player) return;

    for (const chest of this.treasureChests ?? []) {
      if (chest.dead) continue;
      const unlockRadius = player.radius + chest.radius + CHEST_UNLOCK_PADDING;
      const standingOnChest = distanceSq(player.x, player.y, chest.x, chest.y)
        <= unlockRadius * unlockRadius;

      if (!standingOnChest) continue;

      const unlockDuration = getChestUnlockDuration(chest);
      if (unlockDuration <= 0) {
        this.collectTreasureChest(chest);
        continue;
      }

      chest.unlockProgress = Math.min(
        unlockDuration,
        (chest.unlockProgress ?? 0) + dt,
      );
      if (chest.unlockProgress >= unlockDuration) {
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
      const bossReward = Boolean(chest.bossReward);
      const halfWidth = bossReward ? 22 : 17;
      const halfHeight = bossReward ? 13 : 10;
      const unlockDuration = getChestUnlockDuration(chest);
      const progress = unlockDuration <= 0
        ? 0
        : Math.max(0, Math.min(1, (chest.unlockProgress ?? 0) / unlockDuration));

      ctx.save();
      ctx.translate(chest.x, chest.y);
      ctx.scale(pulse, pulse);

      ctx.shadowBlur = bossReward ? 30 : 22;
      ctx.shadowColor = bossReward ? '#fff1a8' : '#f7c94b';
      ctx.fillStyle = bossReward ? '#95651d' : '#7d4f18';
      ctx.strokeStyle = bossReward ? '#fff4bd' : '#ffe58a';
      ctx.lineWidth = bossReward ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2 + 3, 5);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = bossReward ? '#e7b84b' : '#c78b2b';
      ctx.fillRect(-halfWidth, -4, halfWidth * 2, 6);
      ctx.fillStyle = '#fff4bd';
      ctx.fillRect(-3, -4, 6, bossReward ? 13 : 10);
      ctx.beginPath();
      ctx.arc(0, 1, bossReward ? 2.8 : 2.2, 0, Math.PI * 2);
      ctx.fill();

      if (bossReward) {
        ctx.fillStyle = '#fff4bd';
        ctx.font = '1000 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('BOSS CACHE', 0, -halfHeight - 7);
      }

      if (progress > 0) {
        const ringRadius = chest.radius + 12;
        const remaining = Math.max(
          0,
          unlockDuration - (chest.unlockProgress ?? 0),
        );
        ctx.strokeStyle = bossReward ? '#fff4bd' : '#7ef9d4';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          ringRadius,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * progress,
        );
        ctx.stroke();

        ctx.fillStyle = '#f8fbff';
        ctx.font = '900 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${remaining.toFixed(1)}s`, 0, ringRadius + 6);
      }

      ctx.restore();
    }
  }
}

export { UI };