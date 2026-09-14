const PROJECTILE_ROOT = './assets/projectiles';

export const GENERIC_PROJECTILE_FILES = Object.freeze({
  bullet: 'bullet.png',
  rocket: 'rocket.png',
});

export const CLASS_PROJECTILE_FILES = Object.freeze({
  rifleman: 'rifleman.png',
  rocketeer: 'rocketeer.png',
});

export function getProjectileImageSpec(projectile) {
  const sources = [];
  const classFile = CLASS_PROJECTILE_FILES[projectile?.sourceType];
  const genericFile = GENERIC_PROJECTILE_FILES[projectile?.kind];

  if (classFile) sources.push(`${PROJECTILE_ROOT}/unit_class/${classFile}`);
  if (genericFile) sources.push(`${PROJECTILE_ROOT}/generic/${genericFile}`);

  return {
    sources,
    // Source art should point to the right/east. The renderer rotates it to velocity.
    forwardAngle: 0,
    visualScale: projectile?.kind === 'rocket' ? 4.6 : 3.8,
    minSize: projectile?.kind === 'rocket' ? 28 : 16,
  };
}
