import { Game as PreviousGame, UI as PreviousUI } from './upgradeSkip.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { GROUND_DROPS } from '../data/groundDrops.js';
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

class AnimatedPowerupCombatSystem extends CombatSystem {
  updateGems(dt) {
    const game = this.game;
    const player = game.player;

    for (const gem of game.entities.gems) {
      if (gem.dead || !gem.vacuumPull) continue;

      const pull = gem.vacuumPull;
      const progress = clamp01((game.elapsed - pull.startedAt) / pull.duration);
      const eased = easeOutCubic(progress);
      const dx = player.x - pull.startX;
      const dy = player.y - pull.startY;
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
        gem.x = player.x;
        gem.y = player.y;
      }
    }

    super.updateGems(dt);
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

  collectGroundDrop(type) {
    const definition = GROUND_DROPS[type];
    if (!definition) return;

    if (type === 'magnet') {
      this.startXpVacuum();
      this.spawnExplosionEffect(this.player.x, this.player.y, 34, definition.color);
      return;
    }

    if (type === 'nuke') {
      this.startNukeWave();
      return;
    }

    if (type === 'fury') {
      this.activateTimedDropEffect('fury', definition.duration);
      this.spawnExplosionEffect(this.player.x, this.player.y, 46, definition.color);
    }
  }

  startXpVacuum() {
    const startedAt = this.elapsed;
    this.xpVacuum = {
      startedAt,
      duration: MAGNET_DURATION,
    };

    for (const gem of this.entities.gems) {
      if (gem.dead) continue;
      gem.vacuumPull = {
        startX: gem.x,
        startY: gem.y,
        startedAt,
        duration: MAGNET_DURATION,
        phase: (gem.id * 1.618) % (Math.PI * 2),
      };
      gem.vacuumPrevX = gem.x;
      gem.vacuumPrevY = gem.y;
    }
  }

  startNukeWave() {
    const targets = this.entities.enemies.filter((enemy) => !enemy.dead);
    const centerX = this.player.x;
    const centerY = this.player.y;
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

    ctx.save();
    ctx.translate(this.player.x, this.player.y);
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
