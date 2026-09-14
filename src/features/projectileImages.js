import { Game as PreviousGame, UI } from './upgradeIconCards.js';
import { getProjectileImageSpec } from '../data/projectiles.js';

export { UI };

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.projectileImageCache = new Map();
  }

  getProjectileImageState(src) {
    if (this.projectileImageCache.has(src)) return this.projectileImageCache.get(src);

    const state = { image: new Image(), status: 'loading' };
    state.image.addEventListener('load', () => { state.status = 'loaded'; }, { once: true });
    state.image.addEventListener('error', () => { state.status = 'failed'; }, { once: true });
    state.image.src = src;
    this.projectileImageCache.set(src, state);
    return state;
  }

  drawProjectileImage(ctx, projectile) {
    const spec = getProjectileImageSpec(projectile);
    let image = null;

    for (const src of spec.sources) {
      const state = this.getProjectileImageState(src);
      if (state.status === 'loaded') {
        image = state.image;
        break;
      }
    }

    if (!image) return false;

    const baseSize = Math.max(spec.minSize, projectile.radius * spec.visualScale);
    const rawAspect = image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1;
    const aspect = Math.max(0.4, Math.min(2.5, rawAspect || 1));
    const width = aspect >= 1 ? baseSize * aspect : baseSize;
    const height = aspect >= 1 ? baseSize : baseSize / aspect;
    const angle = Math.atan2(projectile.vy, projectile.vx) - spec.forwardAngle;

    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(angle);
    ctx.shadowBlur = projectile.kind === 'rocket' ? 14 : 8;
    ctx.shadowColor = projectile.color ?? '#ffffff';
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
    return true;
  }

  drawProceduralProjectile(ctx, projectile) {
    ctx.save();
    ctx.fillStyle = projectile.color ?? '#bffcf0';
    ctx.shadowBlur = projectile.kind === 'rocket' ? 18 : 12;
    ctx.shadowColor = projectile.color ?? '#7ef9d4';

    if (projectile.kind === 'rocket') {
      const length = Math.hypot(projectile.vx, projectile.vy) || 1;
      const tailX = projectile.x - (projectile.vx / length) * 15;
      const tailY = projectile.y - (projectile.vy / length) * 15;
      ctx.strokeStyle = '#ffe19d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(projectile.x, projectile.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawProjectiles(ctx) {
    for (const projectile of this.entities.projectiles) {
      if (this.drawProjectileImage(ctx, projectile)) continue;
      this.drawProceduralProjectile(ctx, projectile);
    }
  }
}
