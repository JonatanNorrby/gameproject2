import { Game as PreviousGame, UI as PreviousUI } from './upgradeSkip.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { GAME_BALANCE } from '../data/content.js';
import { GROUND_DROPS, GROUND_DROP_CONFIG } from '../data/groundDrops.js';
import { distanceSq } from '../utils/math.js';

const REMOVED_POWERUPS = new Set(['mothership', 'transformer']);
const MAGNET_DURATION = 1.35;
const NUKE_DURATION = 1.65;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function getLivingSoldiers(game) {
  return (game.getSoldierPositions?.() ?? []).filter((soldier) => soldier?.unit && !soldier.unit.dead);
}

function getNearestSoldier(soldiers, x, y) {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const soldier of soldiers) {
    const dist = distanceSq(x, y, soldier.x, soldier.y);
    if (dist >= nearestDistance) continue;
    nearestDistance = dist;
    nearest = soldier;
  }

  return nearest;
}

class AnimatedPowerupCombatSystem extends CombatSystem {
  updateGems(dt) {
    const game = this.game;
    const player = game.player;
    const soldiers = getLivingSoldiers(game);

    for (const gem of game.entities.gems) {
      if (gem.dead) continue;

      let collector = getNearestSoldier(soldiers, gem.x, gem.y);
      if (!collector) {
        collector = { x: player.x, y: player.y, unit: null };
      }

      if (gem.vacuumPull) {
        const pull = gem.vacuumPull;
        let vacuumTarget = soldiers.find((soldier) => soldier.unit.id === pull.targetUnitId) ?? null;
        if (!vacuumTarget) {
          vacuumTarget = getNearestSoldier(soldiers, gem.x, gem.y) ?? collector;
          pull.targetUnitId = vacuumTarget.unit?.id ?? null;
        }

        const progress = clamp01((game.elapsed - pull.startedAt) / pull.duration);
        const eased = easeOutCubic(progress);
        const dx = vacuumTarget.x - pull.startX;
        const dy = vacuumTarget.y - pull.startY;
        const distance = Math.hypot(dx, dy) || 1;
        const perpendicularX = -dy / distance;
        const perpendicularY = dx / distance;
        const spiral = Math.sin(progress * Math.PI * 5 + pull.phase)
          * Math.min(82, distance * 0.16)
          * (1 - progress);

        gem.vacuumPrevX = gem.x;
        gem.vacuumPrevY = gem.y;
        gem.x = pull.startX + dx * eased + perpendicularX * spiral;
        gem.y = pull.startY + dy * eased + perpendicularY * spiral;

        if (progress >= 0.97) {
          gem.x = vacuumTarget.x;
          gem.y = vacuumTarget.y;
        }
      } else {
        const distSq = distanceSq(collector.x, collector.y, gem.x, gem.y);
        const magnetSq = player.magnetRadius * player.magnetRadius;
        if (distSq <= magnetSq) {
          const dx = collector.x - gem.x;
          const dy = collector.y - gem.y;
          const distance = Math.hypot(dx, dy) || 1;
          const pull = 190 + Math.max(0, player.magnetRadius - distance) * 6;
          gem.x += (dx / distance) * pull * dt;
          gem.y += (dy / distance) * pull * dt;
        }
      }

      collector = getNearestSoldier(soldiers, gem.x, gem.y) ?? collector;
      const collectorRadius = collector.unit ? GAME_BALANCE.player.soldierRadius : player.radius;
      const collectRadius = collectorRadius + gem.radius + 4;
      if (distanceSq(collector.x, collector.y, gem.x, gem.y) <= collectRadius * collectRadius) {
        gem.dead = true;
        game.progression.addXp(gem.value);
      }
    }
  }
}

export class UI extends PreviousUI {
  constructor() {
    super();

    for (const type of REMOVED_POWERUPS) {
      document.querySelector(`[data-debug-drop=\"${type}\"]`)?.remove();
    }

    const magnetHelp = document.querySelector('[data-debug-drop=\"magnet\"] small');
    if (magnetHelp) magnetHelp.textContent = 'Animate all existing XP into the squad';
    const nukeHelp = document.querySelector('[data-debug-drop=\"nuke\"] small');
    if (nukeHelp) nukeHelp.textContent = 'Expanding blast kills all existing enemies';
  }
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.combatSystem = new AnimatedPowerupCombatSystem(this);
    this.combatSystem.reset();
  }

  resetState() {
    super.resetState();
    this.dropEffects = { furyUntil: 0 };
    this.xpVacuum = null;
    this.nukeWave = null;
  }

  isDropEffectActive(type) {
    if (REMOVED_POWERUPS.has(type)) return false;
    return super.isDropEffectActive(type);
  }

  getTransformerStatMultiplier() {
    return 1;
  }

  activateTimedDropEffect(type, duration) {
    if (type !== 'fury') return;
    super.activateTimedDropEffect(type, duration);
  }

  updateGroundDrops() {
    const soldiers = getLivingSoldiers(this);

    for (const drop of this.entities.groundDrops) {
      if (drop.dead) continue;

      let collector = null;
      for (const soldier of soldiers) {
        const collectRadius = GROUND_DROP_CONFIG.pickupRadius
          + GAME_BALANCE.player.soldierRadius
          + (drop.radius ?? 0);
        if (distanceSq(soldier.x, soldier.y, drop.x, drop.y) <= collectRadius * collectRadius) {
          collector = soldier;
          break;
        }
      }

      if (!collector && soldiers.length === 0) {
        const collectRadius = GROUND_DROP_CONFIG.pickupRadius + this.player.radius + (drop.radius ?? 0);
        if (distanceSq(this.player.x, this.player.y, drop.x, drop.y) <= collectRadius * collectRadius) {
          collector = { x: this.player.x, y: this.player.y, unit: null };
        }
      }

      if (!collector) continue;
      drop.dead = true;
      this.collectGroundDrop(drop.type, collector.x, collector.y);
    }
  }

  collectGroundDrop(type, pickupX = this.player.x, pickupY = this.player.y) {
    const definition = GROUND_DROPS[type];
    if (!definition) return;

    if (type === 'magnet') {
      this.startXpVacuum();
      this.spawnExplosionEffect(pickupX, pickupY, 34, definition.color);
      return;
    }

    if (type === 'nuke') {
      this.startNukeWave(pickupX, pickupY);
      return;
    }

    if (type === 'fury') {
      this.activateTimedDropEffect('fury', definition.duration);
      this.spawnExplosionEffect(pickupX, pickupY, 46, definition.color);
    }
  }

  startXpVacuum() {
    const startedAt = this.elapsed;
    const soldiers = getLivingSoldiers(this);
    this.xpVacuum = {
      startedAt,
      duration: MAGNET_DURATION,
    };

    for (const gem of this.entities.gems) {
      if (gem.dead) continue;
      const target = getNearestSoldier(soldiers, gem.x, gem.y);
      gem.vacuumPull = {
        startX: gem.x,
        startY: gem.y,
        startedAt,
        duration: MAGNET_DURATION,
        targetUnitId: target?.unit?.id ?? null,
        phase: (gem.id * 1.618) % (Math.PI * 2),
      };
      gem.vacuumPrevX = gem.x;
      gem.vacuumPrevY = gem.y;
    }
  }

  startNukeWave(centerX = this.player.x, centerY = this.player.y) {
    const targets = this.entities.enemies.filter((enemy) => !enemy.dead);
    const farthest = targets.reduce((best, enemy) => (
      Math.max(best, Math.sqrt(distanceSq(centerX, centerY, enemy.x, enemy.y)) + enemy.radius)
    ), 0);

    this.nukeWave = {
      centerX,
      centerY,
      elapsed: 0,
      duration: NUKE_DURATION,
      maxRadius: Math.max(260, farthest + 180),
      targetIds: new Set(targets.map((enemy) => enemy.id)),
    };
  }

  update(dt) {
    super.update(dt);
    this.updateAnimatedPowerups(dt);
  }

  updateAnimatedPowerups(dt) {
    if (this.xpVacuum && this.elapsed - this.xpVacuum.startedAt > this.xpVacuum.duration + 0.12) {
      this.xpVacuum = null;
    }

    const wave = this.nukeWave;
    if (!wave) return;

    wave.elapsed += dt;
    const progress = clamp01(wave.elapsed / wave.duration);
    const radius = wave.maxRadius * (1 - Math.pow(1 - progress, 2));

    for (const enemy of this.entities.enemies) {
      if (enemy.dead || !wave.targetIds.has(enemy.id)) continue;
      const hitRadius = radius + enemy.radius;
      if (distanceSq(wave.centerX, wave.centerY, enemy.x, enemy.y) > hitRadius * hitRadius) continue;

      this.combatSystem.killEnemy(enemy, { allowDrop: false });
      this.spawnExplosionEffect(enemy.x, enemy.y, Math.max(22, enemy.radius * 1.7), '#ff8a63');
    }

    if (progress < 1) return;

    for (const enemy of this.entities.enemies) {
      if (!enemy.dead && wave.targetIds.has(enemy.id)) {
        this.combatSystem.killEnemy(enemy, { allowDrop: false });
      }
    }
    this.nukeWave = null;
  }

  drawGems(ctx) {
    for (const gem of this.entities.gems) {
      if (gem.dead) continue;

      if (gem.vacuumPull) {
        const dx = gem.x - (gem.vacuumPrevX ?? gem.x);
        const dy = gem.y - (gem.vacuumPrevY ?? gem.y);
        ctx.save();
        ctx.strokeStyle = 'rgba(112,232,255,.72)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#70e8ff';
        ctx.beginPath();
        ctx.moveTo(gem.x - dx * 5, gem.y - dy * 5);
        ctx.lineTo(gem.x, gem.y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(gem.x, gem.y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = gem.vacuumPull ? 18 : 0;
      ctx.shadowColor = '#70e8ff';
      ctx.fillStyle = gem.vacuumPull ? '#b6f5ff' : '#9f8cff';
      ctx.fillRect(-gem.radius, -gem.radius, gem.radius * 2, gem.radius * 2);
      ctx.restore();
    }
  }

  drawEffects(ctx) {
    super.drawEffects(ctx);
    this.drawMagnetAnimation(ctx);
    this.drawNukeAnimation(ctx);
  }

  drawMagnetAnimation(ctx) {
    if (!this.xpVacuum) return;
    const progress = clamp01((this.elapsed - this.xpVacuum.startedAt) / this.xpVacuum.duration);
    const alpha = 1 - progress;
    const soldiers = getLivingSoldiers(this);
    const centers = soldiers.length > 0 ? soldiers : [{ x: this.player.x, y: this.player.y }];

    for (const center of centers) {
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.strokeStyle = `rgba(112,232,255,${0.62 * alpha})`;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#70e8ff';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i += 1) {
        const phase = (progress + i / 3) % 1;
        const radius = 120 * (1 - phase) + 18;
        ctx.globalAlpha = Math.max(0, 1 - phase) * alpha;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawNukeAnimation(ctx) {
    const wave = this.nukeWave;
    if (!wave) return;

    const progress = clamp01(wave.elapsed / wave.duration);
    const radius = wave.maxRadius * (1 - Math.pow(1 - progress, 2));
    const alpha = Math.max(0.12, 1 - progress * 0.72);

    ctx.save();
    ctx.translate(wave.centerX, wave.centerY);
    const glow = ctx.createRadialGradient(0, 0, Math.max(0, radius * 0.72), 0, 0, Math.max(1, radius));
    glow.addColorStop(0, 'rgba(255,122,98,0)');
    glow.addColorStop(0.72, `rgba(255,122,98,${0.05 * alpha})`);
    glow.addColorStop(1, `rgba(255,226,165,${0.18 * alpha})`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 34;
    ctx.shadowColor = '#ff7a62';
    ctx.strokeStyle = `rgba(255,232,176,${0.95 * alpha})`;
    ctx.lineWidth = 7 - progress * 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (radius > 24) {
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(255,122,98,${0.55 * alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx) {
    const furyActive = this.isDropEffectActive('fury');
    if (furyActive) this.drawFuryAura(ctx, false);
    super.drawPlayer(ctx);
    if (furyActive) this.drawFuryAura(ctx, true);
  }

  drawFuryAura(ctx, foreground) {
    const soldiers = this.getSoldierPositions();
    const t = this.animationClock;
    const remaining = this.getDropEffectRemaining('fury');
    const fade = Math.min(1, remaining / 0.5);

    for (const soldier of soldiers) {
      const phase = t * 7 + soldier.unit.id * 0.83;
      const pulse = (Math.sin(phase) + 1) * 0.5;
      ctx.save();
      ctx.translate(soldier.x, soldier.y);

      if (!foreground) {
        ctx.globalAlpha = (0.38 + pulse * 0.18) * fade;
        ctx.strokeStyle = '#ff9d3a';
        ctx.shadowBlur = 20 + pulse * 8;
        ctx.shadowColor = '#ff6a2e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 16 + pulse * 4, phase * 0.18, phase * 0.18 + Math.PI * 1.45);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 21 + pulse * 3, -phase * 0.14, -phase * 0.14 + Math.PI * 0.85);
        ctx.stroke();
      } else {
        ctx.globalAlpha = (0.55 + pulse * 0.25) * fade;
        ctx.strokeStyle = '#ffd05b';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff8b35';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i += 1) {
          const angle = phase * 0.22 + i * (Math.PI * 2 / 3);
          const inner = 22 + pulse * 2;
          const outer = inner + 8 + pulse * 5;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }
}
