const ATTACK_FRAMES = Object.freeze([
  'shooting_1.png',
  'shooting_2.png',
  'shooting_3.png',
]);

export const BOSS_ATTACK_ANIMATION = Object.freeze({
  frames: ATTACK_FRAMES,
  fps: 8,
  loop: false,
});

export const BOSS_ATTACK_ANIMATION_DURATION = 0.45;

const BOSS_ASSET_PATHS = Object.freeze({
  warden: './assets/warden',
  broodmother: './assets/broodmother',
  cipher: './assets/cipher',
});

const attackDefinitions = new WeakMap();

function getAttackDefinition(definition) {
  if (!definition || typeof definition !== 'object') return definition;
  const cached = attackDefinitions.get(definition);
  if (cached) return cached;

  const idleFallback = definition.animations?.idle ?? definition.animations?.running;
  const animations = {
    ...(definition.animations ?? {}),
    shooting: BOSS_ATTACK_ANIMATION,
  };
  // FrameAnimationRenderer falls back from "shooting" to "running". Point that
  // fallback at idle for bosses so missing shooting art never makes a boss
  // disappear while artists are still adding the three attack frames.
  if (!animations.running && idleFallback) animations.running = idleFallback;

  const augmented = Object.freeze({
    ...definition,
    animations: Object.freeze(animations),
  });
  attackDefinitions.set(definition, augmented);
  return augmented;
}

function wrapBossDraw(game, boss, assetPath, draw) {
  if (!boss || !game.animationRenderer?.draw) return draw();
  const startedAt = Number(boss.attackAnimationStartedAt);
  const until = Number(boss.attackAnimationUntil);
  if (!Number.isFinite(startedAt) || !Number.isFinite(until) || game.elapsed >= until) {
    return draw();
  }

  const renderer = game.animationRenderer;
  const originalDraw = renderer.draw;
  const attackTime = Math.max(0, game.elapsed - startedAt);

  renderer.draw = function drawBossAttack(
    ctx,
    definition,
    animationName,
    time,
    x,
    y,
    options = {},
  ) {
    if (definition?.basePath !== assetPath) {
      return originalDraw.call(this, ctx, definition, animationName, time, x, y, options);
    }

    return originalDraw.call(
      this,
      ctx,
      getAttackDefinition(definition),
      'shooting',
      attackTime,
      x,
      y,
      options,
    );
  };

  try {
    return draw();
  } finally {
    renderer.draw = originalDraw;
  }
}

export function withBossAttackAnimations(ParentGame) {
  return class BossAttackAnimationGame extends ParentGame {
    triggerBossAttackAnimation(boss) {
      if (!boss || boss.dead) return;
      boss.attackAnimationStartedAt = this.elapsed;
      boss.attackAnimationUntil = this.elapsed + BOSS_ATTACK_ANIMATION_DURATION;
    }

    drawWarden(ctx, boss) {
      return wrapBossDraw(
        this,
        boss,
        BOSS_ASSET_PATHS.warden,
        () => super.drawWarden(ctx, boss),
      );
    }

    drawBroodmother(ctx, boss) {
      return wrapBossDraw(
        this,
        boss,
        BOSS_ASSET_PATHS.broodmother,
        () => super.drawBroodmother(ctx, boss),
      );
    }

    drawCipher(ctx, boss) {
      return wrapBossDraw(
        this,
        boss,
        BOSS_ASSET_PATHS.cipher,
        () => super.drawCipher(ctx, boss),
      );
    }

    // Warden: animate when the attack actually resolves, not during its warning.
    updateWarden(dt) {
      const boss = this.getActiveWarden?.();
      const previousState = boss?.state;
      const result = super.updateWarden(dt);
      if (boss && previousState === 'charge_windup' && boss.state === 'charging') {
        this.triggerBossAttackAnimation(boss);
      }
      return result;
    }

    resolveWardenSlam(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.resolveWardenSlam(boss, ...args);
    }

    resolveWardenBarrage(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.resolveWardenBarrage(boss, ...args);
    }

    beginWardenSummon(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.beginWardenSummon(boss, ...args);
    }

    // Broodmother: acid/tail/lunge animate at release. Egg/surge/burrow are
    // encounter abilities too, so they use the same body animation contract.
    launchBroodAcidBarrage(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.launchBroodAcidBarrage(boss, ...args);
    }

    resolveBroodTailSweep(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.resolveBroodTailSweep(boss, ...args);
    }

    updateBroodmother(dt) {
      const boss = this.getActiveBroodmother?.();
      const previousState = boss?.state;
      const result = super.updateBroodmother(dt);
      if (boss && previousState === 'lunge_windup' && boss.state === 'lunging') {
        this.triggerBossAttackAnimation(boss);
      }
      return result;
    }

    spawnBroodEggClutch(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.spawnBroodEggClutch(boss, ...args);
    }

    triggerBroodSurge(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.triggerBroodSurge(boss, ...args);
    }

    beginBroodBurrow(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.beginBroodBurrow(boss, ...args);
    }

    // Cipher attacks already expose exact effect-emission entry points.
    startCipherSweepingBeam(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.startCipherSweepingBeam(boss, ...args);
    }

    startCipherTargetedBarrage(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.startCipherTargetedBarrage(boss, ...args);
    }

    startCipherProjectileWall(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.startCipherProjectileWall(boss, ...args);
    }

    triggerCipherShockwave(boss, ...args) {
      this.triggerBossAttackAnimation(boss);
      return super.triggerCipherShockwave(boss, ...args);
    }
  };
}
