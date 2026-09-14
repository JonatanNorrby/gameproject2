function clampPositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function resolveFramePath(definition, frame) {
  if (!frame) return null;
  if (/^(?:https?:)?\/\//.test(frame) || frame.startsWith('./') || frame.startsWith('../') || frame.startsWith('/')) {
    return frame;
  }
  const basePath = String(definition.basePath ?? '').replace(/\/$/, '');
  return basePath ? `${basePath}/${frame}` : frame;
}

export class FrameAnimationRenderer {
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

  preloadAnimation(definition, animation) {
    for (const frame of animation?.frames ?? []) {
      this.getImage(resolveFramePath(definition, frame));
    }
  }

  findLoadedFrame(definition, animation) {
    return (animation?.frames ?? [])
      .map((frame) => this.getImage(resolveFramePath(definition, frame)))
      .find((candidate) => candidate?.loaded && !candidate.failed) ?? null;
  }

  draw(ctx, definition, animationName, time, x, y, options = {}) {
    if (!definition) return false;

    const shouldUseIdle = animationName === 'running'
      && Math.max(0, Number(time) || 0) === 0
      && definition.animations?.idle;
    const resolvedAnimationName = shouldUseIdle ? 'idle' : animationName;
    const animation = definition.animations?.[resolvedAnimationName]
      ?? definition.animations?.running;
    if (!animation?.frames?.length) return false;
    this.preloadAnimation(definition, animation);

    const frames = animation.frames;
    const fps = clampPositive(animation.fps, 1);
    const elapsed = Math.max(0, Number(time) || 0) + (Number(options.phase) || 0);
    const rawFrameIndex = Math.floor(elapsed * fps);
    const frameIndex = animation.loop === false
      ? Math.min(frames.length - 1, rawFrameIndex)
      : rawFrameIndex % frames.length;

    const preferredSrc = resolveFramePath(definition, frames[frameIndex]);
    let record = this.getImage(preferredSrc);

    // If the preferred frame is still loading, use another loaded frame from
    // the same animation rather than making the unit blink out.
    if (!record?.loaded || record.failed) {
      record = this.findLoadedFrame(definition, animation);
    }

    // New art can be added incrementally. If idle/shooting/dead is missing,
    // keep rendering the unit with the first available running frame.
    if ((!record?.loaded || record.failed) && resolvedAnimationName !== 'running') {
      const running = definition.animations?.running;
      this.preloadAnimation(definition, running);
      record = this.findLoadedFrame(definition, running);
    }
    if (!record?.loaded || record.failed) return false;

    const image = record.image;
    const naturalWidth = Math.max(1, image.naturalWidth);
    const naturalHeight = Math.max(1, image.naturalHeight);
    const scale = clampPositive(definition.scale, 1);
    const boxWidth = clampPositive(definition.drawWidth ?? definition.drawSize, naturalWidth * scale);
    const boxHeight = clampPositive(definition.drawHeight ?? definition.drawSize, naturalHeight * scale);

    let drawWidth = boxWidth;
    let drawHeight = boxHeight;
    if (definition.preserveAspect !== false) {
      const fitScale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
      drawWidth = naturalWidth * fitScale;
      drawHeight = naturalHeight * fitScale;
    }

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
      image,
      -anchorX * drawWidth,
      -anchorY * drawHeight,
      drawWidth,
      drawHeight,
    );
    ctx.restore();
    return true;
  }
}
