from pathlib import Path

upgrade_file = Path('src/features/upgradeActivation.js')
text = upgrade_file.read_text(encoding='utf-8')

old_help = "      help.textContent = 'Buy ranks in sequence. Each new rank costs more and strengthens the upgrade. Owned upgrades can still be activated or deactivated without refunding Gold.';"
new_help = "      help.textContent = 'Each upgrade has its own column. Ranks unlock downward in sequence — buy the next box to advance that upgrade. Owned upgrades can still be activated or deactivated without refunding Gold.';"
assert text.count(old_help) == 1, 'Expected current upgrade help text once'
text = text.replace(old_help, new_help)

start = text.index('  renderPermanentShop() {')
end = text.index('\n  renderRunConfiguration(...args) {', start)
new_method = '''  renderPermanentShop() {
    const state = getPermanentProgressionState();
    const upgrades = Object.values(PERMANENT_UPGRADES);
    const purchasedRanks = upgrades.reduce(
      (total, upgrade) => total + getPermanentUpgradeRank(upgrade.id),
      0,
    );
    const totalRanks = upgrades.reduce((total, upgrade) => total + upgrade.maxRank, 0);

    if (this.metaUpgradePoints) this.metaUpgradePoints.textContent = String(state.gold);
    if (this.metaUpgradePointsDetail) {
      this.metaUpgradePointsDetail.textContent = `${purchasedRanks} / ${totalRanks} ranks purchased • ${state.activeIds.length} active`;
    }
    if (this.metaUpgradeOpen) this.metaUpgradeOpen.textContent = `Gold Upgrades • ${state.gold} Gold`;
    if (!this.metaUpgradeBranches) return;

    this.metaUpgradeBranches.replaceChildren();

    for (const upgrade of upgrades) {
      const rank = getPermanentUpgradeRank(upgrade.id);
      const owned = rank > 0;
      const active = isPermanentUpgradeActive(upgrade.id);
      const maxed = rank >= upgrade.maxRank;
      const nextCost = getPermanentUpgradeNextCost(upgrade.id);
      const nextPurchasable = canPurchasePermanentUpgrade(upgrade.id);

      const section = document.createElement('section');
      section.className = `meta-upgrade-branch${active ? ' meta-upgrade-branch--active' : ''}`;
      section.style.setProperty('--branch-color', upgrade.color);
      section.dataset.upgradeId = upgrade.id;

      const header = document.createElement('div');
      header.className = 'meta-upgrade-branch__header';
      header.innerHTML = `
        <span class="meta-upgrade-branch__eyebrow">UPGRADE PATH</span>
        <strong>${upgrade.name}</strong>
        <p>${upgrade.description}</p>
        <span class="meta-upgrade-branch__progress">${rank} / ${upgrade.maxRank} RANKS</span>
      `;

      if (owned) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = `meta-upgrade-branch__toggle${active ? ' meta-upgrade-branch__toggle--active' : ''}`;
        toggle.textContent = active ? 'ACTIVE' : 'INACTIVE';
        toggle.addEventListener('click', () => {
          if (!setPermanentUpgradeActive(upgrade.id, !active)) return;
          this.renderPermanentShop();
          this.renderRunConfiguration();
          this.renderCaptainCallHud(this.game);
          this.game?.refreshDoctrineBonuses?.();
        });
        header.append(toggle);
      }

      const track = document.createElement('div');
      track.className = 'meta-upgrade-rank-track';

      for (let rankNumber = 1; rankNumber <= upgrade.maxRank; rankNumber += 1) {
        const rankOwned = rankNumber <= rank;
        const isNext = rankNumber === rank + 1;
        const futureRank = rankNumber > rank + 1;
        const cost = upgrade.costs[rankNumber - 1];
        const affordable = isNext && state.gold >= cost;
        const description = getPermanentUpgradeRankDescription(upgrade.id, rankNumber)
          || upgrade.rankDescriptions[rankNumber - 1]
          || upgrade.description;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = [
          'meta-upgrade-rank',
          rankOwned ? 'meta-upgrade-rank--owned' : '',
          isNext ? 'meta-upgrade-rank--next' : '',
          isNext && affordable ? 'meta-upgrade-rank--affordable' : '',
          futureRank ? 'meta-upgrade-rank--locked' : '',
          rankOwned && active ? 'meta-upgrade-rank--active' : '',
        ].filter(Boolean).join(' ');
        card.disabled = !isNext || !affordable || maxed;
        card.dataset.rank = String(rankNumber);

        const stateLabel = rankOwned
          ? 'OWNED'
          : isNext
            ? affordable ? 'AVAILABLE' : 'NEXT RANK'
            : 'LOCKED';
        const footerText = rankOwned
          ? `Purchased for ${cost} Gold`
          : isNext
            ? affordable
              ? `${cost} Gold • Click to purchase`
              : `${cost} Gold • Need ${Math.max(0, cost - state.gold)} more`
            : `${cost} Gold • Requires Rank ${rankNumber - 1}`;

        card.innerHTML = `
          <span class="meta-upgrade-rank__topline">
            <span>RANK ${rankNumber}</span>
            <span>${stateLabel}</span>
          </span>
          <strong>${description}</strong>
          <span class="meta-upgrade-rank__footer">${footerText}</span>
        `;

        if (isNext && affordable && nextPurchasable && nextCost === cost) {
          card.addEventListener('click', () => {
            if (!purchasePermanentUpgrade(upgrade.id)) return;
            this.renderPermanentShop();
            this.renderRunConfiguration();
            this.renderCaptainCallHud(this.game);
            this.game?.refreshDoctrineBonuses?.();
          });
        }

        track.append(card);
      }

      section.append(header, track);
      this.metaUpgradeBranches.append(section);
    }
  }
'''
text = text[:start] + new_method + text[end:]
upgrade_file.write_text(text, encoding='utf-8')

css = Path('styles/meta-upgrades.css')
css.write_text('''.panel--meta-upgrades {
  width: min(1480px, calc(100vw - 28px));
  max-height: min(960px, calc(100vh - 28px));
  overflow: auto;
  padding: 24px;
}

.meta-upgrade-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.meta-upgrade-header h2 {
  margin-bottom: 4px;
}

.meta-upgrade-close {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  background: rgba(255,255,255,.035);
  color: #dce4ef;
  font-size: 22px;
  cursor: pointer;
}

.meta-upgrade-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 18px 0 10px;
  padding: 14px 16px;
  border: 1px solid rgba(247,201,75,.24);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(247,201,75,.09), rgba(255,255,255,.025));
}

.meta-upgrade-summary__points {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.meta-upgrade-summary__points strong {
  color: #f7c94b;
  font-size: 30px;
  line-height: 1;
}

.meta-upgrade-summary__points span {
  color: #f7c94b;
}

.meta-upgrade-summary__points span,
.meta-upgrade-summary__detail {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.meta-upgrade-summary__detail {
  color: #9eabc0;
}

.meta-upgrade-help {
  max-width: 920px;
  margin: 0 auto 12px;
  color: #8391a6;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.meta-upgrade-branches {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(210px, 228px);
  align-items: start;
  gap: 16px;
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 4px 24px;
  scroll-snap-type: x proximity;
  scrollbar-color: rgba(247,201,75,.42) rgba(255,255,255,.04);
}

.meta-upgrade-branch {
  --branch-color: #7ef9d4;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-snap-align: start;
}

.meta-upgrade-branch__header {
  min-height: 178px;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--branch-color) 42%, rgba(255,255,255,.1));
  border-radius: 15px;
  background: linear-gradient(155deg, color-mix(in srgb, var(--branch-color) 10%, rgba(13,18,28,.98)), rgba(7,10,16,.98));
  box-shadow: 0 14px 28px rgba(0,0,0,.24);
}

.meta-upgrade-branch--active .meta-upgrade-branch__header {
  border-color: var(--branch-color);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--branch-color) 18%, transparent), 0 0 22px color-mix(in srgb, var(--branch-color) 12%, transparent), 0 14px 28px rgba(0,0,0,.24);
}

.meta-upgrade-branch__eyebrow {
  margin-bottom: 6px;
  color: var(--branch-color);
  font-size: 8px;
  font-weight: 1000;
  letter-spacing: .14em;
}

.meta-upgrade-branch__header > strong {
  color: #f2f6fb;
  font-size: 16px;
  line-height: 1.15;
}

.meta-upgrade-branch__header > p {
  margin: 7px 0 10px;
  color: #9eabbd;
  font-size: 10px;
  line-height: 1.4;
}

.meta-upgrade-branch__progress {
  margin-top: auto;
  color: color-mix(in srgb, var(--branch-color) 70%, #8e9aad);
  font-size: 8px;
  font-weight: 1000;
  letter-spacing: .08em;
}

.meta-upgrade-branch__toggle {
  width: 100%;
  min-height: 31px;
  margin-top: 9px;
  border: 1px solid rgba(255,95,121,.38);
  border-radius: 8px;
  background: rgba(255,95,121,.07);
  color: #ff7890;
  font-size: 8px;
  font-weight: 1000;
  letter-spacing: .09em;
  cursor: pointer;
}

.meta-upgrade-branch__toggle--active {
  border-color: rgba(112,220,139,.5);
  background: rgba(112,220,139,.08);
  color: #70dc8b;
}

.meta-upgrade-branch__toggle:hover {
  transform: translateY(-1px);
}

.meta-upgrade-rank-track {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.meta-upgrade-rank {
  position: relative;
  width: 100%;
  min-height: 126px;
  display: flex;
  flex-direction: column;
  padding: 13px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 13px;
  background: rgba(9,13,20,.96);
  color: #e8eef7;
  text-align: left;
  box-shadow: 0 10px 22px rgba(0,0,0,.22);
  transition: transform .14s ease, border-color .14s ease, box-shadow .14s ease, opacity .14s ease;
}

.meta-upgrade-rank:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -14px;
  width: 2px;
  height: 14px;
  translate: -50% 0;
  background: color-mix(in srgb, var(--branch-color) 40%, rgba(255,255,255,.08));
  pointer-events: none;
}

.meta-upgrade-rank--owned {
  border-color: color-mix(in srgb, var(--branch-color) 72%, rgba(255,255,255,.16));
  background: linear-gradient(150deg, color-mix(in srgb, var(--branch-color) 11%, rgba(13,18,28,.98)), rgba(7,10,16,.98));
}

.meta-upgrade-rank--active {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--branch-color) 15%, transparent), 0 0 17px color-mix(in srgb, var(--branch-color) 10%, transparent), 0 10px 22px rgba(0,0,0,.22);
}

.meta-upgrade-rank--next {
  border-style: dashed;
  border-color: rgba(247,201,75,.48);
}

.meta-upgrade-rank--affordable {
  border-style: solid;
  border-color: #f7c94b;
  cursor: pointer;
  box-shadow: 0 0 20px rgba(247,201,75,.13), 0 12px 24px rgba(0,0,0,.26);
}

.meta-upgrade-rank--affordable:hover:not(:disabled) {
  transform: translateY(-2px);
  background: linear-gradient(145deg, rgba(247,201,75,.10), rgba(9,13,20,.98));
  box-shadow: 0 0 27px rgba(247,201,75,.20), 0 14px 28px rgba(0,0,0,.30);
}

.meta-upgrade-rank--locked {
  opacity: .42;
  border-style: dotted;
}

.meta-upgrade-rank:disabled {
  cursor: default;
}

.meta-upgrade-rank__topline {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  color: #78869a;
  font-size: 8px;
  font-weight: 1000;
  letter-spacing: .075em;
}

.meta-upgrade-rank--owned .meta-upgrade-rank__topline {
  color: var(--branch-color);
}

.meta-upgrade-rank--affordable .meta-upgrade-rank__topline {
  color: #f7c94b;
}

.meta-upgrade-rank > strong {
  color: #dbe4ef;
  font-size: 10px;
  line-height: 1.45;
  font-weight: 800;
}

.meta-upgrade-rank--owned > strong {
  color: #eff5fb;
}

.meta-upgrade-rank__footer {
  margin-top: auto;
  padding-top: 10px;
  color: #718096;
  font-size: 8px;
  font-weight: 900;
  line-height: 1.35;
  letter-spacing: .035em;
  text-transform: uppercase;
}

.meta-upgrade-rank--affordable .meta-upgrade-rank__footer {
  color: #f0d77c;
}

.meta-upgrade-footer {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.meta-upgrade-debug {
  border-color: rgba(255,211,106,.45) !important;
  color: #ffd36a !important;
}

@media (max-width: 780px) {
  .panel--meta-upgrades {
    padding: 18px;
  }

  .meta-upgrade-branches {
    grid-auto-columns: minmax(188px, 78vw);
    gap: 12px;
  }

  .meta-upgrade-summary {
    align-items: flex-start;
    flex-direction: column;
  }
}
''', encoding='utf-8')

main = Path('src/main.js')
main_text = main.read_text(encoding='utf-8')
assert main_text.count('const GAME_VERSION = 130;') == 1, 'Expected GAME_VERSION 130 exactly once'
main.write_text(main_text.replace('const GAME_VERSION = 130;', 'const GAME_VERSION = 131;'), encoding='utf-8')

index = Path('index.html')
index_text = index.read_text(encoding='utf-8')
markers = {
    'BUILD v130': 'BUILD v131',
    'id="version-text">v130<': 'id="version-text">v131<',
    'SYSTEM ONLINE • v130': 'SYSTEM ONLINE • v131',
}
for old, new in markers.items():
    assert index_text.count(old) == 1, f'Expected version marker exactly once: {old}'
    index_text = index_text.replace(old, new)
index.write_text(index_text, encoding='utf-8')
