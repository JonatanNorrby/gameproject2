import { Game, UI as PreviousUI } from './classFamilyNames.js';
import {
  getHandbookBossEntries,
  getHandbookRunUpgradeEntries,
} from './handbook.js';
import {
  getUnitClassFamily,
  getUnitClassFamilyLabel,
} from '../data/unitFamilies.js';
import { CLASS_ICON_FILES } from '../data/upgradeIcons.js';

const CLASS_ICON_ROOT = './assets/icons/unit_class';

const HANDBOOK_UPGRADE_FAMILIES = Object.freeze([
  Object.freeze({ id: 'rifleman', accent: '#69cfff' }),
  Object.freeze({ id: 'rocketeer', accent: '#ff9b4a' }),
  Object.freeze({ id: 'shockblade', accent: '#b78cff' }),
]);

function createClassIconTile(familyId) {
  const tile = document.createElement('div');
  tile.className = 'handbook-class-icon';
  tile.dataset.classFamily = familyId;
  tile.title = getUnitClassFamilyLabel(familyId);

  const file = CLASS_ICON_FILES[familyId];
  if (file) {
    const image = document.createElement('img');
    image.className = 'handbook-class-icon__image';
    image.src = `${CLASS_ICON_ROOT}/${file}`;
    image.alt = '';
    image.loading = 'lazy';
    tile.append(image);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'handbook-class-icon__fallback';
    fallback.textContent = familyId.slice(0, 3).toUpperCase();
    tile.append(fallback);
  }

  return tile;
}

function installBossIdleImage(card, entry) {
  const media = card?.querySelector?.('.handbook-card__media');
  if (!media || !entry?.id) return;

  const fallback = media.querySelector('.handbook-card__fallback, .handbook-image-fallback');
  if (fallback) fallback.hidden = true;

  const image = document.createElement('img');
  image.className = 'handbook-card__image';
  image.src = `./assets/${entry.id}/idle_1.png`;
  image.alt = entry.config?.name ?? 'Boss';
  image.loading = 'lazy';
  image.addEventListener('load', () => fallback?.remove?.(), { once: true });
  image.addEventListener('error', () => {
    image.remove();
    if (fallback) fallback.hidden = false;
  }, { once: true });
  media.append(image);
}

function createUpgradeColumns(content, cards, upgrades) {
  content.querySelector('.handbook-card-grid')?.remove?.();

  const paired = cards.map((card, index) => ({
    card,
    upgrade: upgrades[index],
    originalIndex: index,
  }));

  const columns = document.createElement('div');
  columns.className = 'handbook-unit-columns handbook-run-upgrade-columns';

  for (const family of HANDBOOK_UPGRADE_FAMILIES) {
    const column = document.createElement('section');
    column.className = `handbook-unit-column handbook-unit-column--${family.id}`;
    column.style.setProperty('--handbook-family-accent', family.accent);

    const header = document.createElement('header');
    header.className = 'handbook-unit-column__header';
    header.append(createClassIconTile(family.id));

    const title = document.createElement('h3');
    title.textContent = getUnitClassFamilyLabel(family.id);
    header.append(title);
    column.append(header);

    const familyCards = document.createElement('div');
    familyCards.className = 'handbook-unit-column__cards';

    const familyEntries = paired
      .filter(({ upgrade }) => (
        upgrade && getUnitClassFamily(upgrade.unitType) === family.id
      ))
      .sort((left, right) => {
        const reinforcementOrder = Number(right.upgrade.kind === 'reinforcement')
          - Number(left.upgrade.kind === 'reinforcement');
        return reinforcementOrder || left.originalIndex - right.originalIndex;
      });

    for (const { card } of familyEntries) familyCards.append(card);

    column.append(familyCards);
    columns.append(column);
  }

  content.append(columns);
}

export class UI extends PreviousUI {
  renderHandbookBosses() {
    super.renderHandbookBosses();

    const discoveredEntries = getHandbookBossEntries()
      .filter((entry) => entry.discovered);
    const cards = [...this.handbookContent.querySelectorAll('.handbook-card--boss')];
    cards.forEach((card, index) => installBossIdleImage(card, discoveredEntries[index]));
  }

  renderHandbookGoldUpgrades() {
    super.renderHandbookGoldUpgrades();
    for (const statGrid of this.handbookContent.querySelectorAll(
      '.handbook-card--gold-upgrade .handbook-stat-grid',
    )) {
      statGrid.remove();
    }
  }

  renderHandbookRunUpgrades() {
    super.renderHandbookRunUpgrades();

    const upgrades = getHandbookRunUpgradeEntries();
    const cards = [...this.handbookContent.querySelectorAll('.handbook-card--run-upgrade')];
    for (const card of cards) card.querySelector('.handbook-card__subtitle')?.remove?.();

    createUpgradeColumns(this.handbookContent, cards, upgrades);
  }
}

export { Game };
