import { Game as PreviousGame, UI as PreviousUI } from './wardenPlates.js';

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

function normalizeAngle(angle) {
  let value = Number(angle) || 0;
  while (value > Math.PI) value -= TWO_PI;
  while (value < -Math.PI) value += TWO_PI;
  return value;
}

function getWestSourceCardinalRotation(facingAngle) {
  const cardinalFacing = Math.round((Number(facingAngle) || 0) / HALF_PI) * HALF_PI;
  return normalizeAngle(cardinalFacing - Math.PI);
}

export class Game extends PreviousGame {
  updateWarden(dt) {
    const bossBeforeUpdate = this.getActiveWarden?.();
    const wasCharging = bossBeforeUpdate?.state === 'charging';

    super.updateWarden(dt);

    const boss = this.getActiveWarden?.();
    if (!boss) return;

    // The Warden no longer has a post-Charge crash/stun or exposed-core punish
    // window. Whether the Charge connects or misses, it immediately resumes its
    // normal approach state once the movement finishes.
    boss.coreExposedUntil = 0;
    if (wasCharging && (boss.state === 'crashed' || boss.state === 'recovery')) {
      boss.state = 'approach';
      boss.stateTime = 0;
      boss.coreExposedUntil = 0;
    }
  }

  getUnitSpriteRotation(sprite, animationName) {
    if (sprite?.directionMode === 'west-cardinal') {
      // Anti-Air artwork is authored facing west. Quantize the squad's facing to
      // the four cardinals: west is unchanged, east becomes a horizontal mirror
      // in FrameAnimationRenderer, and north/south rotate ±90°.
      return getWestSourceCardinalRotation(this.player?.facingAngle ?? Math.PI);
    }

    return super.getUnitSpriteRotation(sprite, animationName);
  }
}

export class UI extends PreviousUI {}
