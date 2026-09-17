import { Game as PreviousGame, UI } from './cipherVisualPolish.js';
import { BROODMOTHER_BOSS } from '../data/bosses.js';

const EGG_VISUAL_SCALE = 1.5;
const ACID_COOLDOWN_SCALE = 1.4;
const BURROW_MARKER_COLOR = '#ff405d';
const BURROW_MARKER_GLOW = '#ff6a7f';

export class Game extends PreviousGame {
  spawnBroodEggClutch(boss) {
    super.spawnBroodEggClutch(boss);

    for (const egg of this.broodEggs ?? []) {
      if (egg.dead || egg.issue97Scaled) continue;
      egg.issue97Scaled = true;
      egg.radius *= EGG_VISUAL_SCALE;
    }
  }

  hatchBroodEgg(egg) {
    if (!egg || egg.dead) return;

    const x = egg.x;
    const y = egg.y;
    const elite = egg.elite;
    const separation = Math.max(10, (egg.radius ?? 20) * 0.45);
    const angle = Math.random() * Math.PI * 2;

    super.hatchBroodEgg(egg);

    this.spawnBroodEnemyAt(
      x + Math.cos(angle) * separation,
      y + Math.sin(angle) * separation,
      elite,
    );
  }

  launchBroodAcidBarrage(boss) {
    super.launchBroodAcidBarrage(boss);
    if (boss && Number.isFinite(boss.attackCooldown)) {
      boss.attackCooldown *= ACID_COOLDOWN_SCALE;
    }
  }

  drawBroodEggs(ctx) {
    const renderer = this.animationRenderer;
    const originalDraw = renderer?.draw;

    if (typeof originalDraw !== 'function') {
      super.drawBroodEggs(ctx);
      return;
    }

    renderer.draw = function issue97ScaledEggDraw(drawCtx, definition, ...args) {
      const isBroodEgg = definition?.basePath === './assets/broodmother/eggs';
      const scaledDefinition = isBroodEgg
        ? {
            ...definition,
            drawWidth: definition.drawWidth * EGG_VISUAL_SCALE,
            drawHeight: definition.drawHeight * EGG_VISUAL_SCALE,
          }
        : definition;
      return originalDraw.call(this, drawCtx, scaledDefinition, ...args);
    };

    try {
      super.drawBroodEggs(ctx);
    } finally {
      renderer.draw = originalDraw;
    }
  }

  drawEffects(ctx) {
    const boss = this.getActiveBroodmother?.();
    const burrowState = boss?.state?.startsWith('burrow') ? boss.state : null;

    if (boss && burrowState) boss.state = 'issue97_burrow_visual_suppressed';
    try {
      super.drawEffects(ctx);
    } finally {
      if (boss && burrowState) boss.state = burrowState;
    }

    if (!boss || burrowState !== 'burrow_hidden') return;

    const pulse = (Math.sin(this.animationClock * 9) + 1) * 0.5;
    const radius = boss.radius * (1.12 + pulse * 0.08);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,64,93,${0.09 + pulse * 0.06})`;
    ctx.strokeStyle = BURROW_MARKER_COLOR;
    ctx.shadowColor = BURROW_MARKER_GLOW;
    ctx.shadowBlur = 26 + pulse * 18;
    ctx.lineWidth = 6;
    ctx.setLineDash([15, 8]);
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.5 + pulse * 0.35;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export { UI };
