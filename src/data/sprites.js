// Every animated entity uses separate PNG files instead of sprite sheets.
// The canonical file names are documented in assets/ANIMATION_FRAMEWORK.md.
function twoFrame(prefix, fps, loop = true) {
  return {
    frames: [`${prefix}_1.png`, `${prefix}_2.png`],
    fps,
    loop,
  };
}

export function createStandardFrameSet(folder, options = {}) {
  return {
    basePath: `./assets/${folder}`,
    drawSize: options.drawSize ?? 42,
    drawWidth: options.drawWidth,
    drawHeight: options.drawHeight,
    anchorX: options.anchorX ?? 0.5,
    anchorY: options.anchorY ?? 0.5,
    offsetX: options.offsetX ?? 0,
    offsetY: options.offsetY ?? 0,
    smoothing: options.smoothing ?? true,
    preserveAspect: options.preserveAspect ?? true,
    flipWithDirection: options.flipWithDirection ?? false,
    animations: {
      running: twoFrame('running', options.runningFps ?? 8, true),
      shooting: twoFrame('shooting', options.shootingFps ?? 12, false),
      damage_light: twoFrame('damage_light', options.damageFps ?? 10, false),
      damage_medium: twoFrame('damage_medium', options.damageFps ?? 10, false),
      damage_heavy: twoFrame('damage_heavy', options.damageFps ?? 10, false),
      dead: twoFrame('dead', options.deadFps ?? 6, false),
    },
  };
}

export const FRAME_SPRITES = {
  units: {
    rifleman: createStandardFrameSet('rifleman', { drawSize: 42 }),
    rocketeer: createStandardFrameSet('rocketeer', { drawSize: 44 }),
  },
  captains: {
    mercer: null,
    vale: null,
  },
  enemies: {
    crawler: createStandardFrameSet('crawler', { drawSize: 34 }),
    runner: createStandardFrameSet('runner', { drawSize: 30 }),
    brute: createStandardFrameSet('brute', { drawSize: 56 }),
  },
};

export function getSquadSprite(unit) {
  if (!unit) return null;
  const captainOverride = unit.captainId ? FRAME_SPRITES.captains[unit.captainId] : null;
  return captainOverride ?? FRAME_SPRITES.units[unit.type] ?? null;
}

export function getEnemySprite(enemyType) {
  return FRAME_SPRITES.enemies[enemyType] ?? null;
}
