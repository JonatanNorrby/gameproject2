// Every animated entity uses separate PNG files instead of sprite sheets.
// The canonical file names are documented in assets/ANIMATION_FRAMEWORK.md.
function twoFrame(prefix, fps, loop = true) {
  return {
    frames: [`${prefix}_1.png`, `${prefix}_2.png`],
    fps,
    loop,
  };
}

function singleFrame(file) {
  return {
    frames: [file],
    fps: 1,
    loop: false,
  };
}

function resolveFramePath(definition, frame) {
  if (!definition || !frame) return null;
  if (/^(?:https?:)?\/\//.test(frame) || frame.startsWith('./') || frame.startsWith('../') || frame.startsWith('/')) {
    return frame;
  }
  const basePath = String(definition.basePath ?? '').replace(/\/$/, '');
  return basePath ? `${basePath}/${frame}` : frame;
}

export function createStandardFrameSet(folder, options = {}) {
  const shootingFps = options.shootingFps ?? 12;
  const shootingLoop = options.shootingLoop ?? true;
  const idleShootingLoop = options.idleShootingLoop ?? shootingLoop;
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
    forwardAngle: Number.isFinite(options.forwardAngle) ? options.forwardAngle : Math.PI / 2,
    animations: {
      idle: singleFrame('idle_1.png'),
      running: twoFrame('running', options.runningFps ?? 8, true),
      idle_shooting: twoFrame('idle_shooting', options.idleShootingFps ?? shootingFps, idleShootingLoop),
      shooting: twoFrame('shooting', shootingFps, shootingLoop),
      dead: singleFrame('dead_1.png'),
    },
  };
}

// Normal enemies deliberately use one attack frame. The renderer's standard
// shooting fallback then skips the absent idle_shooting animation and resolves
// directly to running_1 when shooting_1.png has not been supplied yet.
export function createEnemyFrameSet(folder, options = {}) {
  const standard = createStandardFrameSet(folder, options);
  return {
    ...standard,
    animations: {
      idle: standard.animations.idle,
      running: standard.animations.running,
      shooting: singleFrame('shooting_1.png'),
      dead: standard.animations.dead,
    },
  };
}

export const FRAME_SPRITES = {
  units: {
    rifleman: createStandardFrameSet('rifleman', { drawSize: 42 }),
    rocketeer: createStandardFrameSet('rocketeer', { drawSize: 44, shootingLoop: false }),
    shockblade: createStandardFrameSet('shockblade', { drawSize: 44, shootingLoop: false }),
    drone_pilot: createStandardFrameSet('drone_pilot', { drawSize: 42, shootingLoop: false }),
  },
  captains: {
    mercer: createStandardFrameSet('captain_mercer', { drawSize: 44, shootingLoop: false }),
    vale: createStandardFrameSet('captain_vale', { drawSize: 42 }),
    thorne: createStandardFrameSet('captain_thorne', {
      drawSize: 54,
      shootingFps: 5,
      shootingLoop: false,
    }),
  },
  enemies: {
    crawler: createEnemyFrameSet('crawler', { drawSize: 51 }),
    runner: createEnemyFrameSet('runner', { drawSize: 30 }),
    // #40: make the slow tank visually imposing without changing its gameplay hitbox.
    brute: createEnemyFrameSet('brute', { drawSize: 96, runningFps: 4 }),
    charger: createEnemyFrameSet('charger', { drawSize: 72 }),
    spitter: createEnemyFrameSet('spitter', { drawSize: 38 }),
    burst_spitter: createEnemyFrameSet('burst_spitter', { drawSize: 36 }),
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

export function getSpritePortraitSources({ unitType, captainId } = {}) {
  const definition = captainId
    ? FRAME_SPRITES.captains[captainId]
    : FRAME_SPRITES.units[unitType];
  if (!definition) return [];

  const frames = [
    definition.animations?.idle?.frames?.[0],
    definition.animations?.running?.frames?.[0],
  ];

  return [...new Set(frames.filter(Boolean).map((frame) => resolveFramePath(definition, frame)))];
}
