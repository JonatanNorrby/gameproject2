import { clamp, normalize } from '../utils/math.js';

export class Input {
  constructor(element, stickElement) {
    this.keys = new Set();
    this.touchAxis = { x: 0, y: 0 };
    this.touchId = null;
    this.touchOrigin = { x: 0, y: 0 };
    this.stickElement = stickElement;
    this.stickKnob = stickElement?.querySelector('.touch-stick__knob');

    window.addEventListener('keydown', (event) => this.keys.add(event.key.toLowerCase()));
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    element.addEventListener('pointermove', (event) => this.onPointerMove(event));
    element.addEventListener('pointerup', (event) => this.onPointerUp(event));
    element.addEventListener('pointercancel', (event) => this.onPointerUp(event));
  }

  getAxis() {
    let x = 0;
    let y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;

    if (x || y) return normalize(x, y);
    return { ...this.touchAxis };
  }

  onPointerDown(event) {
    if (event.pointerType === 'mouse' || this.touchId !== null) return;
    this.touchId = event.pointerId;
    this.touchOrigin = { x: event.clientX, y: event.clientY };
    this.positionStick(event.clientX, event.clientY);
    this.stickElement?.classList.add('touch-stick--active');
  }

  onPointerMove(event) {
    if (event.pointerId !== this.touchId) return;
    const maxDistance = 42;
    const dx = event.clientX - this.touchOrigin.x;
    const dy = event.clientY - this.touchOrigin.y;
    const length = Math.hypot(dx, dy);
    const scale = length > maxDistance ? maxDistance / length : 1;
    const px = dx * scale;
    const py = dy * scale;
    this.touchAxis = { x: clamp(px / maxDistance, -1, 1), y: clamp(py / maxDistance, -1, 1) };
    if (this.stickKnob) this.stickKnob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
  }

  onPointerUp(event) {
    if (event.pointerId !== this.touchId) return;
    this.touchId = null;
    this.touchAxis = { x: 0, y: 0 };
    this.stickElement?.classList.remove('touch-stick--active');
    if (this.stickKnob) this.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  positionStick(x, y) {
    if (!this.stickElement) return;
    this.stickElement.style.left = `${x}px`;
    this.stickElement.style.top = `${y}px`;
  }
}
