import { Game as PreviousGame, UI as PreviousUI } from './wardenPlates.js';

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
}

export class UI extends PreviousUI {}
