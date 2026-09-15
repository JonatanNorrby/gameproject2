import { Game as PreviousGame, UI as PreviousUI } from './squadBuilderVisuals.js';
import { distanceSq } from '../utils/math.js';

const NUKE_DURATION = 1.65;
const MAX_NUKE_XP_BUNDLES = 12;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function loadSquadBuilderVisualFixes() {
  const href = new URL('../../styles/squad-builder-v43.css', import.meta.url).href;
  if (document.querySelector(`link[data-squad-builder-v43="${href}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.squadBuilderV43 = href;
  document.head.append(link);
}

loadSquadBuilderVisualFixes();

export class UI extends PreviousUI {}

export class Game extends PreviousGame {
  startNukeWave(centerX = this.player.x, centerY = this.player.y) {
    const targets = this.entities.enemies
      .filter((enemy) => !enemy.dead)
      .map((enemy) => ({
        enemy,
        triggerRadius: Math.sqrt(distanceSq(centerX, centerY, enemy.x, enemy.y)) + enemy.radius,
      }))
      .sort((a, b) => a.triggerRadius - b.triggerRadius);

    const farthest = targets.at(-1)?.triggerRadius ?? 0;
    this.nukeWave = {
      centerX,
      centerY,
      elapsed: 0,
      duration: NUKE_DURATION,
      maxRadius: Math.max(260, farthest + 180),
      targets,
      cursor: 0,
      totalXp: 0,
      killed: 0,
      xpPositions: [],
    };
  }

  killEnemyForNuke(wave, enemy) {
    if (!enemy || enemy.dead) return;

    enemy.dead = true;
    this.kills += 1;
    wave.killed += 1;
    wave.totalXp += Math.max(0, Number(enemy.xp) || 0);

    const sample = { x: enemy.x, y: enemy.y };
    if (wave.xpPositions.length < MAX_NUKE_XP_BUNDLES) {
      wave.xpPositions.push(sample);
    } else {
      // Keep the XP bundles spread across the wave instead of piling them at the pickup point.
      wave.xpPositions[(wave.killed - 1) % MAX_NUKE_XP_BUNDLES] = sample;
    }
  }

  spawnBundledNukeXp(wave) {
    if (!(wave.totalXp > 0) || wave.xpPositions.length === 0) return;

    const bundleCount = Math.min(MAX_NUKE_XP_BUNDLES, wave.xpPositions.length);
    const integerXp = Number.isInteger(wave.totalXp);
    const baseValue = integerXp ? Math.floor(wave.totalXp / bundleCount) : wave.totalXp / bundleCount;
    let remainder = integerXp ? wave.totalXp - baseValue * bundleCount : 0;

    for (let index = 0; index < bundleCount; index += 1) {
      const position = wave.xpPositions[index];
      const value = integerXp
        ? baseValue + (remainder-- > 0 ? 1 : 0)
        : baseValue;
      if (!(value > 0)) continue;

      this.entities.gems.push({
        id: this.entities.createId(),
        x: position.x,
        y: position.y,
        value,
        radius: 6 + Math.min(4, value),
        dead: false,
      });
    }
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

    // Targets are sorted once when the NUKE starts. Each target is therefore
    // visited only once instead of rescanning the entire enemy array every frame.
    while (wave.cursor < wave.targets.length && wave.targets[wave.cursor].triggerRadius <= radius) {
      const target = wave.targets[wave.cursor];
      wave.cursor += 1;
      this.killEnemyForNuke(wave, target.enemy);
    }

    if (progress < 1) return;

    // Numerical edge cases at the very edge of the wave should still be killed.
    while (wave.cursor < wave.targets.length) {
      const target = wave.targets[wave.cursor];
      wave.cursor += 1;
      this.killEnemyForNuke(wave, target.enemy);
    }

    // Preserve the full XP reward without creating one gem + death particles +
    // explosion particles for every enemy. This is the main performance win.
    this.spawnBundledNukeXp(wave);
    this.nukeWave = null;
  }
}
