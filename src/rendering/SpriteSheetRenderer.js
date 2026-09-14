function clampPositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function buildFrameSequence(animation) {
  if (Array.isArray(animation.frames) && animation.frames.length > 0) {
    return animation.frames.map((frame) => Math.max(0, Math.floor(frame)));
  }

  const start = Math.max(0, Math.floor(animation.startFrame ?? 0));
  const count = Math.max(1, Math.floor(animation.frameCount ?? 1));
  return Array.from({ length: count }, (_, index) => start + index);
}

export class SpriteSheetRenderer {
  constructor() {
    this.images = new Map();
  }

  getImage(src) {
    if (!src) return null;
    const existing = this.images.get(src);
    if (existing) return existing;

    const image = new Image();
    const record = { image, loaded: false, failed: false };
    image.addEventListener('load', () => { record.loaded = true; }, { once: true });
    image.addEventListener('error', () => { record.failed = true; }, { once: true });
    image.src = src;
    this.images.set(src, record);
    return record;
  }

  draw(ctx, definition, animationName, time, x, y, options = {}) {
    if (!definition?.src) return false;

    const frameWidth = clampPositive(definition.frameWidth, 0);
    const frameHeight = clampPositive(definition.frameHeight, 0);
    if (!frameWidth || !frameHeight) return false;

    const record = this.getImage(definition.src);
    if (!record || record.failed || !record.loaded) return false;

    const animation = definition.animations?.[animationName]
      ?? definition.animations?.idle
      ?? { startFrame: 0, frameCount: 1, fps: 1 };
    const frames = buildFrameSequence(animation);
    const fps = clampPositive(animation.fps, 1);
    const elapsed = Math.max(0, Number(time) || 0) + (Number(options.phase) || 0);
    const rawFrameIndex = Math.floor(elapsed * fps);
    const sequenceIndex = animation.loop === false
      ? Math.min(frames.length - 1, rawFrameIndex)
      : rawFrameIndex % frames.length;
    const frame = frames[sequenceIndex];

    const columns = Math.max(
      1,
      Math.floor(definition.columns ?? (record.image.naturalWidth / frameWidth)),
    );
    const row = animation.row === undefined
      ? Math.floor(frame / columns)
      : Math.max(0, Math.floor(animation.row));
    const column = animation.row === undefined ? frame % columns : frame;

    const marginX = Math.max(0, Number(definition.marginX) || 0);
    const marginY = Math.max(0, Number(definition.marginY) || 0);
    const spacingX = Math.max(0, Number(definition.spacingX) || 0);
    const spacingY = Math.max(0, Number(definition.spacingY) || 0);
    const sourceX = marginX + column * (frameWidth + spacingX);
    const sourceY = marginY + row * (frameHeight + spacingY);
    if (
      sourceX < 0
      || sourceY < 0
      || sourceX + frameWidth > record.image.naturalWidth
      || sourceY + frameHeight > record.image.naturalHeight
    ) return false;

    const scale = clampPositive(definition.scale, 1);
    const drawWidth = clampPositive(definition.drawWidth, frameWidth * scale);
    const drawHeight = clampPositive(definition.drawHeight, frameHeight * scale);
    const anchorX = Number.isFinite(definition.anchorX) ? definition.anchorX : 0.5;
    const anchorY = Number.isFinite(definition.anchorY) ? definition.anchorY : 0.5;
    const offsetX = Number(definition.offsetX) || 0;
    const offsetY = Number(definition.offsetY) || 0;

    ctx.save();
    ctx.globalAlpha *= Number.isFinite(options.alpha) ? options.alpha : 1;
    ctx.imageSmoothingEnabled = definition.smoothing !== false;
    ctx.translate(x + offsetX, y + offsetY);
    if (options.flipX) ctx.scale(-1, 1);
    if (options.rotation) ctx.rotate(options.rotation);
    ctx.drawImage(
      record.image,
      sourceX,
      sourceY,
      frameWidth,
      frameHeight,
      -anchorX * drawWidth,
      -anchorY * drawHeight,
      drawWidth,
      drawHeight,
    );
    ctx.restore();
    return true;
  }
}
