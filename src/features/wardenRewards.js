import { Game as PreviousGame, UI as PreviousUI } from './wardenBoss.js';
import { WARDEN_BOSS } from '../data/bosses.js';
import { grantMetaUpgradePoints } from '../data/metaUpgrades.js';

const WARDEN_EXTRA_COOLDOWN_RATE = 0.75;
const WARDEN_BARRAGE_INTERVAL = 6;
const FRONT_ARMOR_COLOR = '#ff334f';

export class Game extends PreviousGame {
  updateWarden(dt) {
    super.updateWarden(dt);

    const boss = this.getActiveWarden?.();
    if (!boss || boss.state !== 'approach' || boss.attackCooldown <= 0) return;

    // Increase attack pressure without shortening the actual Charge telegraph.
    boss.attackCooldown = Math.max(
      0,
      boss.attackCooldown - dt * WARDEN_EXTRA_COOLDOWN_RATE,
    );
  }

  beginWardenBarrage(boss) {
    // The base fight asks for a barrage every third attack. Convert every other
    // barrage slot into another Charge, resulting in roughly five Charges per
    // six ranged attack-cycle selections while preserving Spine Barrage.
    if ((boss?.attackCycle ?? 0) % WARDEN_BARRAGE_INTERVAL !== 0) {
      super.beginWardenCharge(boss);
      return;
    }

    super.beginWardenBarrage(boss);
  }

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

  drawWarden(ctx, boss) {
    super.drawWarden(ctx, boss);

    const frontLeft = boss.plates?.find((plate) => plate.id === 'front_left');
    const frontRight = boss.plates?.find((plate) => plate.id === 'front_right');
    if ((!frontLeft || frontLeft.broken) && (!frontRight || frontRight.broken)) return;

    const pulse = 0.72 + (Math.sin(this.animationClock * 7.5) + 1) * 0.14;
    const frontX = boss.radius + 34;

    const drawArmorLine = (plate, points) => {
      if (!plate || plate.broken) return;
      const healthRatio = Math.max(0, Math.min(1, plate.hp / Math.max(1, plate.maxHp)));

      ctx.save();
      ctx.globalAlpha = Math.max(0.38, pulse * (0.55 + healthRatio * 0.45));
      ctx.strokeStyle = FRONT_ARMOR_COLOR;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = FRONT_ARMOR_COLOR;
      ctx.shadowBlur = 24;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index][0], points[index][1]);
      }
      ctx.stroke();

      ctx.globalAlpha = 0.95;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ff8292';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index][0], points[index][1]);
      }
      ctx.stroke();
      ctx.restore();
    };

    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.rotate(boss.facingAngle);

    // Detached front-armor brackets. These are deliberately independent of the
    // creature artwork so future Warden sprites do not need the armor baked in.
    drawArmorLine(frontLeft, [
      [frontX - 4, -52],
      [frontX + 8, -34],
      [frontX + 8, -10],
    ]);
    drawArmorLine(frontRight, [
      [frontX + 8, 10],
      [frontX + 8, 34],
      [frontX - 4, 52],
    ]);

    ctx.restore();
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
