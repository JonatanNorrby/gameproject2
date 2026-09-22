import { getGameSettings, getKeyBinding, normalizeKeyBinding } from '../data/settings.js';
import { clamp, normalize } from '../utils/math.js';

export class Input {
  constructor(element, stickElement) {
    this.keys = new Set();
    this.element = element;
    this.touchAxis = { x: 0, y: 0 };
    this.mousePosition = { x: 0, y: 0 };
    this.mouseInside = false;
    this.touchId = null;
    this.touchOrigin = { x: 0, y: 0 };
    this.stickElement = stickElement;
    this.stickKnob = stickElement?.querySelector('.touch-stick__knob');

    window.addEventListener('keydown', (event) => this.keys.add(normalizeKeyBinding(event.key)));
    window.addEventListener('keyup', (event) => this.keys.delete(normalizeKeyBinding(event.key)));
    window.addEventListener('blur', () => this.keys.clear());

    element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    element.addEventListener('pointerenter', (event) => this.onPointerEnter(event));
    element.addEventListener('pointerleave', (event) => this.onPointerLeave(event));
    element.addEventListener('pointermove', (event) => this.onPointerMove(event));
    element.addEventListener('pointerup', (event) => this.onPointerUp(event));
    element.addEventListener('pointercancel', (event) => this.onPointerUp(event));
  }

  getAxis() {
    let x = 0;
    let y = 0;
    if (this.keys.has(getKeyBinding('moveLeft'))) x -= 1;
    if (this.keys.has(getKeyBinding('moveRight'))) x += 1;
    if (this.keys.has(getKeyBinding('moveUp'))) y -= 1;
    if (this.keys.has(getKeyBinding('moveDown'))) y += 1;

    if (x || y) return normalize(x, y);
    if (Math.abs(this.touchAxis.x) > 0.01 || Math.abs(this.touchAxis.y) > 0.01) {
      return { ...this.touchAxis };
    }
    return this.getMouseSteeringAxis();
  }

  getMouseSteeringAxis() {
    if (!getGameSettings().mouseSteering || !this.mouseInside || !this.element) {
      return { x: 0, y: 0 };
    }

    const rect = this.element.getBoundingClientRect();
    const dx = this.mousePosition.x - (rect.left + rect.width / 2);
    const dy = this.mousePosition.y - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const deadZone = 32;
    if (distance <= deadZone) return { x: 0, y: 0 };
    return normalize(dx, dy);
  }

  onPointerEnter(event) {
    if (event.pointerType !== 'mouse') return;
    this.mouseInside = true;
    this.mousePosition = { x: event.clientX, y: event.clientY };
  }

  onPointerLeave(event) {
    if (event.pointerType !== 'mouse') return;
    this.mouseInside = false;
  }

  onPointerDown(event) {
    if (event.pointerType === 'mouse' || this.touchId !== null) return;
    this.touchId = event.pointerId;
    this.touchOrigin = { x: event.clientX, y: event.clientY };
    this.positionStick(event.clientX, event.clientY);
    this.stickElement?.classList.add('touch-stick--active');
  }

  onPointerMove(event) {
    if (event.pointerType === 'mouse') {
      this.mouseInside = true;
      this.mousePosition = { x: event.clientX, y: event.clientY };
      return;
    }
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
