import { Game, UI as PreviousUI } from './classFamilyNames.js';
import {
  getHandbookBossEntries,
  getHandbookRunUpgradeEntries,
} from './handbook.js';
import {
  PERMANENT_UPGRADES,
  getPermanentUpgradeNextCost,
  getPermanentUpgradeRank,
} from '../data/metaUpgrades.js';
import {
  getUnitClassFamily,
  getUnitClassFamilyLabel,
} from '../data/unitFamilies.js';
import { SUPPORT_UNIT_DEFINITIONS } from '../data/supportUnits.js';
import { CLASS_ICON_FILES } from '../data/upgradeIcons.js';

const CLASS_ICON_ROOT = './assets/icons/unit_class';
const DRONE_PILOT_TYPE = 'drone_pilot';

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

function updateDronePilotUnitCard(content) {
  const definition = SUPPORT_UNIT_DEFINITIONS[DRONE_PILOT_TYPE];
  if (!definition) return;

  const card = [...content.querySelectorAll('.handbook-card--unit')]
    .find((candidate) => candidate.querySelector('h3')?.textContent === definition.label);
  if (!card) return;

  const body = card.querySelector('.handbook-card__body');
  if (body) {
    body.textContent = 'Its drone seeks enemy groups and drops damaging explosive grenades using the same area-damage rules as Rocketeer rockets.';
  }

  const statRows = [...card.querySelectorAll('.handbook-stat')];
  const setStat = (row, label, value) => {
    if (!row) return;
    const labelNode = row.querySelector('span');
    const valueNode = row.querySelector('strong');
    if (labelNode) labelNode.textContent = label;
    if (valueNode) valueNode.textContent = String(value);
  };
  setStat(statRows[1], 'Damage', definition.weapon.damage);
  setStat(statRows[2], 'Blast Radius', definition.support.aoeRadius);
}

function installSquadBuilderHealthLegend(content) {
  const header = content.querySelector('.handbook-page__header');
  if (!header) return;

  const note = document.createElement('p');
  note.className = 'handbook-page__intro';
  note.textContent = 'Squad Builder health borders show each unit’s current HP: green above 60%, amber from 31–60%, and red at 30% or below.';
  header.append(note);
}

function updateRankedGoldUpgradeCards(content) {
  const upgrades = Object.values(PERMANENT_UPGRADES);
  const cards = [...content.querySelectorAll('.handbook-card--gold-upgrade')];
  const purchasedRanks = upgrades.reduce(
    (total, upgrade) => total + getPermanentUpgradeRank(upgrade.id),
    0,
  );
  const totalRanks = upgrades.reduce((total, upgrade) => total + upgrade.maxRank, 0);

  const intro = content.querySelector('.handbook-page__intro');
  if (intro) {
    intro.textContent = `Permanent Gold upgrades are bought rank by rank. Each later rank costs more and improves its effect. ${purchasedRanks}/${totalRanks} ranks are currently purchased.`;
  }

  cards.forEach((card, index) => {
    const upgrade = upgrades[index];
    if (!upgrade) return;
    const rank = getPermanentUpgradeRank(upgrade.id);
    const nextCost = getPermanentUpgradeNextCost(upgrade.id);
    const subtitle = card.querySelector('.handbook-card__subtitle');
    if (subtitle) {
      subtitle.textContent = nextCost === null
        ? `RANK ${rank}/${upgrade.maxRank} • MAX RANK`
        : `RANK ${rank}/${upgrade.maxRank} • NEXT ${nextCost} GOLD`;
    }

    const body = card.querySelector('.handbook-card__body');
    if (body) {
      const ranks = upgrade.rankDescriptions
        .map((description, rankIndex) => `Rank ${rankIndex + 1}: ${description}`)
        .join(' ');
      body.textContent = `${upgrade.description} ${ranks}`;
    }

    card.classList.toggle('handbook-card--owned', rank > 0);
    card.querySelector('.handbook-stat-grid')?.remove();
  });
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
  renderHandbookUnits() {
    super.renderHandbookUnits();
    updateDronePilotUnitCard(this.handbookContent);
    installSquadBuilderHealthLegend(this.handbookContent);
  }

  renderHandbookBosses() {
    super.renderHandbookBosses();

    const discoveredEntries = getHandbookBossEntries()
      .filter((entry) => entry.discovered);
    const cards = [...this.handbookContent.querySelectorAll('.handbook-card--boss')];
    cards.forEach((card, index) => installBossIdleImage(card, discoveredEntries[index]));
  }

  renderHandbookGoldUpgrades() {
    super.renderHandbookGoldUpgrades();
    updateRankedGoldUpgradeCards(this.handbookContent);
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
