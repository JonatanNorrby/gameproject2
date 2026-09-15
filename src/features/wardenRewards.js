import { Game as PreviousGame, UI as PreviousUI } from './wardenBoss.js';
import { WARDEN_BOSS } from '../data/bosses.js';
import { grantMetaUpgradePoints } from '../data/metaUpgrades.js';

const WARDEN_EXTRA_COOLDOWN_RATE = 0.75;
const WARDEN_BARRAGE_COOLDOWN = 3;
const ARMOR_RING_COLOR = '#ff334f';
const ARMOR_RING_INNER_COLOR = '#ff91a0';

export class Game extends PreviousGame {
  spawnWarden() {
    super.spawnWarden();
    const boss = this.getActiveWarden?.();
    if (!boss) return;

    boss.maxArmorHp = Math.max(0, Number(WARDEN_BOSS.armor.shellHp) || 0);
    boss.armorHp = boss.maxArmorHp;
  }

  updateWarden(dt) {
    super.updateWarden(dt);

    const boss = this.getActiveWarden?.();
    if (
      !boss
      || boss.enraged
      || boss.state !== 'approach'
      || boss.attackCooldown <= 0
    ) return;

    // Phase one is barrage-heavy. Speed up the downtime between Barrages while
    // preserving the full telegraph duration so the attack remains readable.
    boss.attackCooldown = Math.max(
      0,
      boss.attackCooldown - dt * WARDEN_EXTRA_COOLDOWN_RATE,
    );
  }

  beginWardenCharge(boss) {
    // Charge is an enrage-only attack. Any pre-enrage Charge selection is
    // converted into Spine Barrage instead.
    if (!boss?.enraged) {
      this.beginWardenBarrage(boss);
      return;
    }

    super.beginWardenCharge(boss);
  }

  beginWardenBarrage(boss) {
    super.beginWardenBarrage(boss);
    if (!boss?.enraged) boss.attackCooldown = WARDEN_BARRAGE_COOLDOWN;
  }

  applyWardenDamage(amount, hitX, hitY, options = {}) {
    const boss = this.getActiveWarden?.();
    if (!boss || !Number.isFinite(amount) || amount <= 0) return null;

    const coreExposed = boss.coreExposedUntil > this.elapsed;
    let armorDamage = 0;
    let bodyDamage = 0;
    let bodyMultiplier = 1;

    if (coreExposed) {
      // A missed enrage Charge still creates a short punish window, but there
      // is no directional bonus: the exposed core is a timed state only.
      bodyMultiplier = WARDEN_BOSS.armor.exposedCoreDamageMultiplier;
      bodyDamage = amount * bodyMultiplier;
    } else if ((boss.armorHp ?? 0) > 0) {
      // The shared 360-degree armor shell absorbs damage uniformly from every
      // direction. There are no individual plates or break locations.
      armorDamage = Math.min(boss.armorHp, amount);
      boss.armorHp = Math.max(0, boss.armorHp - armorDamage);

      const overflow = Math.max(0, amount - armorDamage);
      if (overflow > 0) bodyDamage = overflow;
    } else {
      bodyDamage = amount;
    }

    if (bodyDamage > 0) {
      boss.hp = Math.max(0, boss.hp - bodyDamage);
    }

    boss.hitFlash = 0.11;
    this.spawnHitParticles(hitX, hitY);

    if (boss.hp <= 0) this.defeatWarden(boss);
    return {
      bodyDamage,
      armorDamage,
      bodyMultiplier,
      coreExposed,
      plate: null,
    };
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

    const armorHp = Math.max(0, boss.armorHp ?? 0);
    const maxArmorHp = Math.max(1, boss.maxArmorHp ?? WARDEN_BOSS.armor.shellHp ?? 1);
    if (armorHp <= 0) return;

    const healthRatio = Math.max(0, Math.min(1, armorHp / maxArmorHp));
    const pulse = 0.74 + (Math.sin(this.animationClock * 7.5) + 1) * 0.12;
    const ringRadius = boss.radius + 30;
    const segmentCount = 10;
    const gap = 0.11;

    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.rotate(this.animationClock * 0.08);
    ctx.lineCap = 'round';

    // Detached 360-degree armored shell. It is intentionally rendered outside
    // the creature artwork so future Warden sprites need no armor graphics.
    for (let index = 0; index < segmentCount; index += 1) {
      const start = (Math.PI * 2 * index) / segmentCount + gap;
      const end = (Math.PI * 2 * (index + 1)) / segmentCount - gap;

      ctx.globalAlpha = Math.max(0.42, pulse * (0.58 + healthRatio * 0.42));
      ctx.strokeStyle = ARMOR_RING_COLOR;
      ctx.shadowColor = ARMOR_RING_COLOR;
      ctx.shadowBlur = 24;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, start, end);
      ctx.stroke();

      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = ARMOR_RING_INNER_COLOR;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, start, end);
      ctx.stroke();
    }

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

  update(game) {
    super.update(game);
    const boss = game.getActiveWarden?.();
    if (!boss || !this.wardenArmor) return;

    const armorHp = Math.max(0, boss.armorHp ?? 0);
    const maxArmorHp = Math.max(0, boss.maxArmorHp ?? WARDEN_BOSS.armor.shellHp ?? 0);
    this.wardenArmor.textContent = `ARMOR ${Math.ceil(armorHp)} / ${maxArmorHp}`;
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
