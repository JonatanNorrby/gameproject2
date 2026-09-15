import { Game as PreviousGame, UI as PreviousUI } from './wardenBoss.js';
import { WARDEN_BOSS } from '../data/bosses.js';
import { grantMetaUpgradePoints } from '../data/metaUpgrades.js';

export class Game extends PreviousGame {
  defeatWarden(boss) {
    const wasAlive = Boolean(boss && !boss.dead);
    const rewardGemStart = this.entities.gems.length;

    super.defeatWarden(boss);

    if (!wasAlive || !boss?.dead) return;

    // The Warden's boss reward is permanent progression, not run XP.
    // Remove any reward gems created by the base boss defeat flow.
    if (this.entities.gems.length > rewardGemStart) {
      this.entities.gems.splice(rewardGemStart);
    }

    const amount = Math.max(
      0,
      Math.floor(Number(WARDEN_BOSS.permanentUpgradePoints) || 0),
    );
    if (amount <= 0) return;

    const state = grantMetaUpgradePoints(amount);
    this.ui.renderMetaUpgradeTree?.();
    this.ui.showPermanentUpgradePointReward?.(amount, state.totalPoints);
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);

    this.bossRewardToast = document.createElement('div');
    this.bossRewardToast.setAttribute('aria-live', 'assertive');
    Object.assign(this.bossRewardToast.style, {
      position: 'fixed',
      left: '50%',
      top: '150px',
      transform: 'translate(-50%, -10px)',
      zIndex: '18',
      minWidth: 'min(430px, calc(100vw - 32px))',
      padding: '14px 18px',
      border: '1px solid rgba(126,249,212,.62)',
      borderRadius: '13px',
      background: 'linear-gradient(160deg, rgba(12,30,31,.96), rgba(8,12,20,.96))',
      boxShadow: '0 18px 44px rgba(0,0,0,.42), 0 0 26px rgba(126,249,212,.18)',
      color: '#eafff8',
      fontWeight: '900',
      letterSpacing: '.06em',
      textAlign: 'center',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 180ms ease, transform 180ms ease',
    });
    document.body.append(this.bossRewardToast);
    this.bossRewardTimer = null;
  }

  showPermanentUpgradePointReward(amount, totalPoints) {
    if (!this.bossRewardToast) return;

    const plural = amount === 1 ? '' : 'S';
    this.bossRewardToast.innerHTML = `
      <div style="font-size:10px;color:#7ef9d4;letter-spacing:.16em;margin-bottom:5px;">WARDEN DEFEATED</div>
      <div style="font-size:18px;">+${amount} PERMANENT UPGRADE POINT${plural}</div>
      <div style="margin-top:5px;font-size:10px;color:#8ea0ae;font-weight:800;letter-spacing:.08em;">${totalPoints} TOTAL EARNED • SPEND FROM THE MAIN MENU</div>
    `;

    window.clearTimeout(this.bossRewardTimer);
    this.bossRewardToast.style.opacity = '1';
    this.bossRewardToast.style.transform = 'translate(-50%, 0)';

    this.bossRewardTimer = window.setTimeout(() => {
      this.bossRewardToast.style.opacity = '0';
      this.bossRewardToast.style.transform = 'translate(-50%, -10px)';
    }, 4200);
  }
}
