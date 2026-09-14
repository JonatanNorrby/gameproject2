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

function resolveFrameSize(definition, image) {
  const marginX = Math.max(0, Number(definition.marginX) || 0);
  const marginY = Math.max(0, Number(definition.marginY) || 0);
  const spacingX = Math.max(0, Number(definition.spacingX) || 0);
  const spacingY = Math.max(0, Number(definition.spacingY) || 0);
  const columns = Math.max(1, Math.floor(Number(definition.columns) || 1));
  const rows = Math.max(1, Math.floor(Number(definition.rows) || 1));

  const availableWidth = Math.max(0, image.naturalWidth - marginX * 2 - spacingX * (columns - 1));
  const availableHeight = Math.max(0, image.naturalHeight - marginY * 2 - spacingY * (rows - 1));

  return {
    frameWidth: clampPositive(definition.frameWidth, Math.floor(availableWidth / columns)),
    frameHeight: clampPositive(definition.frameHeight, Math.floor(availableHeight / rows)),
    columns,
    marginX,
    marginY,
    spacingX,
    spacingY,
  };
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

    const record = this.getImage(definition.src);
    if (!record || record.failed || !record.loaded) return false;

    const {
      frameWidth,
      frameHeight,
      columns,
      marginX,
      marginY,
      spacingX,
      spacingY,
    } = resolveFrameSize(definition, record.image);
    if (!frameWidth || !frameHeight) return false;

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

    const row = animation.row === undefined
      ? Math.floor(frame / columns)
      : Math.max(0, Math.floor(animation.row));
    const column = animation.row === undefined ? frame % columns : frame;

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
