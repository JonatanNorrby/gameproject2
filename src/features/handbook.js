import { Game as PreviousGame, UI as PreviousUI } from './debugMobSpawner.js';
import {
  CAPTAINS,
  ENEMY_TYPES,
  RARITIES,
  UNIT_CLASSES,
  UPGRADES,
} from '../data/content.js';
import {
  WARDEN_BOSS,
  BROODMOTHER_BOSS,
  CIPHER_BOSS,
} from '../data/bosses.js';
import {
  PERMANENT_UPGRADES,
  isPermanentUpgradeOwned,
} from '../data/metaUpgrades.js';
import { FRAME_SPRITES } from '../data/sprites.js';
import {
  getCaptainUnlockDefinition,
  isCaptainUnlocked,
} from '../data/unlocks.js';

export const HANDBOOK_BOSS_STORAGE_KEY = 'nightfall-protocol.handbook-bosses.v1';

export const HANDBOOK_TABS = Object.freeze([
  Object.freeze({ id: 'overview', label: 'Overview' }),
  Object.freeze({ id: 'units', label: 'Units' }),
  Object.freeze({ id: 'captains', label: 'Captains' }),
  Object.freeze({ id: 'monsters', label: 'Monsters' }),
  Object.freeze({ id: 'bosses', label: 'Bosses' }),
  Object.freeze({ id: 'gold-upgrades', label: 'Gold Upgrades' }),
  Object.freeze({ id: 'run-upgrades', label: 'Run Upgrades' }),
]);

const HANDBOOK_BOSSES = Object.freeze([
  Object.freeze({
    config: WARDEN_BOSS,
    summary: 'Armored siege organism. Break its detached frontal plates, survive charges, and exploit openings in its defense.',
  }),
  Object.freeze({
    config: BROODMOTHER_BOSS,
    summary: 'Nest-forming alien matriarch that pressures the arena with eggs, acid pools, lunges, and increasingly aggressive phases.',
  }),
  Object.freeze({
    config: CIPHER_BOSS,
    summary: 'Final encounter built around symbol-sequence puzzles, arena hazards, and a Captain-only puzzle phase before the finishing battle.',
  }),
]);

const ACTIVE_RARITY_IDS = new Set(['uncommon', 'rare', 'epic']);
const ACTIVE_RARITIES = RARITIES.filter((rarity) => ACTIVE_RARITY_IDS.has(rarity.id));
const SECRET_CAPTAIN_ID = 'supreme_commander';

function normalizeBossDiscovery(candidate) {
  const knownIds = new Set(HANDBOOK_BOSSES.map(({ config }) => config.id));
  return [...new Set(candidate ?? [])].filter((id) => knownIds.has(id));
}

function loadBossDiscovery() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(HANDBOOK_BOSS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeBossDiscovery(Array.isArray(parsed) ? parsed : parsed?.bossIds);
  } catch (error) {
    console.warn('Could not load Handbook boss discovery.', error);
    return [];
  }
}

let discoveredBossIds = loadBossDiscovery();

function persistBossDiscovery() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      HANDBOOK_BOSS_STORAGE_KEY,
      JSON.stringify({ version: 1, bossIds: discoveredBossIds }),
    );
  } catch (error) {
    console.warn('Could not save Handbook boss discovery.', error);
  }
}

export function getDiscoveredBossIds() {
  return [...discoveredBossIds];
}

export function isBossDiscovered(bossId) {
  return discoveredBossIds.includes(bossId);
}

export function markBossDiscovered(bossId) {
  if (!HANDBOOK_BOSSES.some(({ config }) => config.id === bossId)) return false;
  if (isBossDiscovered(bossId)) return false;
  discoveredBossIds = normalizeBossDiscovery([...discoveredBossIds, bossId]);
  persistBossDiscovery();
  return true;
}

function resolveFrameSource(definition, animationName) {
  const frame = definition?.animations?.[animationName]?.frames?.[0];
  if (!definition || !frame) return null;
  if (/^(?:https?:)?\/\//.test(frame) || frame.startsWith('./') || frame.startsWith('../') || frame.startsWith('/')) {
    return frame;
  }
  const basePath = String(definition.basePath ?? '').replace(/\/$/, '');
  return basePath ? `${basePath}/${frame}` : frame;
}

export function getHandbookUnitEntries() {
  return Object.values(UNIT_CLASSES)
    .filter((unit) => unit?.id && unit?.label)
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((unit) => ({
      id: unit.id,
      label: unit.label,
      unit,
      image: resolveFrameSource(FRAME_SPRITES.units[unit.id], 'idle'),
    }));
}

export function getHandbookCaptainEntries() {
  return Object.values(CAPTAINS)
    .filter((captain) => captain?.id && captain?.name)
    .sort((left, right) => {
      if (left.id === SECRET_CAPTAIN_ID) return 1;
      if (right.id === SECRET_CAPTAIN_ID) return -1;
      return left.name.localeCompare(right.name);
    })
    .map((captain) => ({
      id: captain.id,
      captain,
      unlocked: isCaptainUnlocked(captain.id),
      unlock: getCaptainUnlockDefinition(captain.id),
      image: resolveFrameSource(FRAME_SPRITES.captains[captain.id], 'idle'),
    }));
}

export function getHandbookMonsterEntries() {
  return Object.entries(ENEMY_TYPES)
    .filter(([id, enemy]) => Boolean(id && enemy?.label))
    .sort(([, left], [, right]) => {
      const timeDifference = (Number(left.unlockAt) || 0) - (Number(right.unlockAt) || 0);
      return timeDifference || left.label.localeCompare(right.label);
    })
    .map(([id, enemy]) => ({
      id,
      enemy,
      image: resolveFrameSource(FRAME_SPRITES.enemies[id], 'running'),
    }));
}

export function getHandbookBossEntries() {
  return HANDBOOK_BOSSES.map(({ config, summary }) => ({
    id: config.id,
    config,
    summary,
    discovered: isBossDiscovered(config.id),
  }));
}

export function getHandbookPermanentUpgradeEntries() {
  return Object.values(PERMANENT_UPGRADES)
    .filter((upgrade) => upgrade?.id && upgrade?.name)
    .map((upgrade) => ({
      upgrade,
      owned: isPermanentUpgradeOwned(upgrade.id),
    }));
}

export function getHandbookRunUpgradeEntries() {
  return UPGRADES.filter((upgrade) => upgrade?.id && upgrade?.name);
}

function appendText(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function createMedia(source, alt, fallbackText) {
  const media = document.createElement('div');
  media.className = 'handbook-card__media';

  const fallback = document.createElement('div');
  fallback.className = 'handbook-card__fallback';
  fallback.textContent = fallbackText;

  if (!source) {
    media.append(fallback);
    return media;
  }

  const image = document.createElement('img');
  image.src = source;
  image.alt = alt;
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    image.remove();
    if (!fallback.isConnected) media.append(fallback);
  }, { once: true });
  media.append(image);
  return media;
}

function createStatRow(label, value) {
  const row = document.createElement('div');
  row.className = 'handbook-stat';
  appendText(row, 'span', label);
  appendText(row, 'strong', String(value));
  return row;
}

function formatWeaponKind(unit) {
  if (unit.support?.kind === 'drone') return 'Support Drone';
  const kind = unit.weapon?.kind ?? 'Unknown';
  if (kind === 'bullet') return 'Ballistic';
  if (kind === 'rocket') return 'Explosive';
  if (kind === 'melee') return 'Melee';
  if (kind === 'support') return 'Support';
  return kind;
}

function formatNumber(value, fallback = '—') {
  return Number.isFinite(Number(value)) ? String(Number(value)) : fallback;
}

function createEntityCard({ title, subtitle, image, fallback, accent, body, stats = [] }) {
  const card = document.createElement('article');
  card.className = 'handbook-card';
  if (accent) card.style.setProperty('--handbook-accent', accent);
  card.append(createMedia(image, title, fallback));

  const copy = document.createElement('div');
  copy.className = 'handbook-card__copy';
  appendText(copy, 'h3', title);
  if (subtitle) appendText(copy, 'span', subtitle, 'handbook-card__subtitle');
  if (body) appendText(copy, 'p', body);

  if (stats.length > 0) {
    const statGrid = document.createElement('div');
    statGrid.className = 'handbook-stat-grid';
    for (const [label, value] of stats) statGrid.append(createStatRow(label, value));
    copy.append(statGrid);
  }

  card.append(copy);
  return card;
}

function createSecretCard(label = 'CLASSIFIED') {
  const card = document.createElement('article');
  card.className = 'handbook-card handbook-card--secret';
  appendText(card, 'span', label, 'handbook-secret__label');
  appendText(card, 'strong', '?', 'handbook-secret__question');
  appendText(card, 'span', 'UNKNOWN', 'handbook-secret__unknown');
  return card;
}

function createPageHeader(title, description) {
  const header = document.createElement('header');
  header.className = 'handbook-page__header';
  appendText(header, 'p', 'FIELD MANUAL', 'eyebrow');
  appendText(header, 'h2', title);
  appendText(header, 'p', description, 'handbook-page__intro');
  return header;
}

function createCardGrid() {
  const grid = document.createElement('div');
  grid.className = 'handbook-card-grid';
  return grid;
}

export class Game extends PreviousGame {
  spawnWarden(...args) {
    const result = super.spawnWarden(...args);
    if (markBossDiscovered(WARDEN_BOSS.id)) this.ui?.refreshHandbook?.();
    return result;
  }

  spawnBroodmother(...args) {
    const result = super.spawnBroodmother(...args);
    if (markBossDiscovered(BROODMOTHER_BOSS.id)) this.ui?.refreshHandbook?.();
    return result;
  }

  spawnCipher(...args) {
    const result = super.spawnCipher(...args);
    if (markBossDiscovered(CIPHER_BOSS.id)) this.ui?.refreshHandbook?.();
    return result;
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.handbookActiveTab = HANDBOOK_TABS[0].id;
    this.handbookScreen = null;
    this.handbookContent = null;
    this.handbookTabList = null;
    this.installHandbook();
  }

  installHandbook() {
    if (document.querySelector('#handbook-screen')) return;
    const app = document.querySelector('#app');
    const nav = document.querySelector('#start-screen .main-menu__nav');
    if (!app || !nav) return;

    const openButton = document.createElement('button');
    openButton.id = 'handbook-open';
    openButton.type = 'button';
    openButton.className = 'captain-menu-button main-menu__action';
    openButton.textContent = 'Handbook';
    const upgradesButton = nav.querySelector('#meta-upgrade-open');
    if (upgradesButton) upgradesButton.after(openButton);
    else nav.append(openButton);

    const screen = document.createElement('section');
    screen.id = 'handbook-screen';
    screen.className = 'overlay handbook-screen';
    screen.setAttribute('aria-hidden', 'true');
    screen.innerHTML = `
      <div class="panel panel--handbook">
        <header class="handbook-header">
          <div>
            <p class="eyebrow">NIGHTFALL COMMAND NETWORK</p>
            <h1>Game Handbook</h1>
          </div>
          <button id="handbook-close" class="handbook-close" type="button" aria-label="Close Handbook">×</button>
        </header>
        <nav id="handbook-tabs" class="handbook-tabs" role="tablist" aria-label="Handbook sections"></nav>
        <div id="handbook-content" class="handbook-content" tabindex="0"></div>
        <footer class="handbook-footer">
          <span>Boss intel is revealed permanently after first contact.</span>
          <button id="handbook-back" class="primary-button" type="button">Back to Main Menu</button>
        </footer>
      </div>
    `;
    app.append(screen);

    this.handbookScreen = screen;
    this.handbookContent = screen.querySelector('#handbook-content');
    this.handbookTabList = screen.querySelector('#handbook-tabs');

    for (const tab of HANDBOOK_TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'handbook-tab';
      button.dataset.handbookTab = tab.id;
      button.setAttribute('role', 'tab');
      button.textContent = tab.label;
      button.addEventListener('click', () => this.setHandbookTab(tab.id));
      this.handbookTabList.append(button);
    }

    openButton.addEventListener('click', () => this.showHandbook());
    screen.querySelector('#handbook-close')?.addEventListener('click', () => this.hideHandbook());
    screen.querySelector('#handbook-back')?.addEventListener('click', () => this.hideHandbook());
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.handbookScreen?.classList.contains('overlay--visible')) {
        this.hideHandbook();
      }
    });
  }

  showHandbook() {
    if (!this.handbookScreen) return;
    this.renderHandbook();
    this.handbookScreen.classList.add('overlay--visible');
    this.handbookScreen.setAttribute('aria-hidden', 'false');
    this.handbookContent?.focus({ preventScroll: true });
  }

  hideHandbook() {
    if (!this.handbookScreen) return;
    this.handbookScreen.classList.remove('overlay--visible');
    this.handbookScreen.setAttribute('aria-hidden', 'true');
  }

  setHandbookTab(tabId) {
    if (!HANDBOOK_TABS.some((tab) => tab.id === tabId)) return;
    this.handbookActiveTab = tabId;
    this.renderHandbook();
  }

  refreshHandbook() {
    if (this.handbookScreen?.classList.contains('overlay--visible')) this.renderHandbook();
  }

  renderHandbook() {
    if (!this.handbookContent || !this.handbookTabList) return;
    for (const button of this.handbookTabList.querySelectorAll('[data-handbook-tab]')) {
      const active = button.dataset.handbookTab === this.handbookActiveTab;
      button.classList.toggle('handbook-tab--active', active);
      button.setAttribute('aria-selected', String(active));
    }

    this.handbookContent.replaceChildren();
    if (this.handbookActiveTab === 'units') this.renderHandbookUnits();
    else if (this.handbookActiveTab === 'captains') this.renderHandbookCaptains();
    else if (this.handbookActiveTab === 'monsters') this.renderHandbookMonsters();
    else if (this.handbookActiveTab === 'bosses') this.renderHandbookBosses();
    else if (this.handbookActiveTab === 'gold-upgrades') this.renderHandbookGoldUpgrades();
    else if (this.handbookActiveTab === 'run-upgrades') this.renderHandbookRunUpgrades();
    else this.renderHandbookOverview();

    this.handbookContent.scrollTop = 0;
  }

  renderHandbookOverview() {
    const content = this.handbookContent;
    content.append(createPageHeader(
      'Nightfall Protocol',
      'A squad-survival roguelite where one Captain leads an expanding formation against escalating alien pressure and three milestone bosses.',
    ));

    const steps = document.createElement('div');
    steps.className = 'handbook-overview-grid';
    const overviewItems = [
      ['1', 'Move the squad', 'Use WASD to move. Units attack automatically with their own weapon systems and targeting rules.'],
      ['2', 'Collect XP', 'Defeated enemies leave XP. Leveling presents upgrades for unit recruitment and class-specific stats.'],
      ['3', 'Build the formation', 'Recruit Rifleman-, Rocketeer-, and Shockblade-family units, then shape the squad with Squad Builder when available.'],
      ['4', 'Use Captains', 'The primary Captain leads the run. Permanent progression can add second and third Captains plus long-cooldown Captain Calls.'],
      ['5', 'Break the bosses', 'The Warden appears at level 15, The Broodmother at 30, and The Cipher at 50. Defeating the final boss unlocks the secret Commander.'],
      ['6', 'Progress permanently', 'Gold persists between runs and buys permanent upgrades. Prestige resets Gold/upgrades/unlocks in exchange for permanent attack-rate growth.'],
    ];
    for (const [number, title, body] of overviewItems) {
      const card = document.createElement('article');
      card.className = 'handbook-overview-card';
      appendText(card, 'strong', number, 'handbook-overview-card__number');
      const copy = document.createElement('div');
      appendText(copy, 'h3', title);
      appendText(copy, 'p', body);
      card.append(copy);
      steps.append(card);
    }
    content.append(steps);

    const controls = document.createElement('section');
    controls.className = 'handbook-callout';
    appendText(controls, 'h3', 'Core controls');
    appendText(controls, 'p', 'WASD: move squad • Q: primary Captain Call • E: second Captain Call • R: third Captain Call. The run ends when the primary Captain dies.');
    content.append(controls);
  }

  renderHandbookUnits() {
    const content = this.handbookContent;
    const entries = getHandbookUnitEntries();
    content.append(createPageHeader(
      'Available Units',
      `${entries.length} registered battlefield unit types. Idle artwork is shown where an asset is available.`,
    ));
    const grid = createCardGrid();

    for (const { unit, image } of entries) {
      const weapon = unit.weapon ?? {};
      const stats = [
        ['HP', formatNumber(unit.maxHp)],
        ['Role', formatWeaponKind(unit)],
      ];
      if (unit.support?.kind === 'drone') {
        stats.push(['Stun', `${formatNumber(unit.support.stunDuration)}s`]);
        stats.push(['Drone Range', formatNumber(unit.support.range)]);
      } else {
        stats.push(['Damage', formatNumber(weapon.damage)]);
        stats.push(['Range', formatNumber(weapon.range)]);
        stats.push(['Cooldown', Number.isFinite(Number(weapon.cooldown)) ? `${weapon.cooldown}s` : '—']);
      }
      grid.append(createEntityCard({
        title: unit.label,
        subtitle: `${unit.shortLabel ?? unit.id.toUpperCase()} • ${formatWeaponKind(unit)}`,
        image,
        fallback: unit.shortLabel ?? unit.label.slice(0, 3).toUpperCase(),
        accent: unit.outline ?? unit.fill,
        body: unit.support?.kind === 'drone'
          ? 'Support specialist whose drone seeks enemy groups and drops area stun grenades.'
          : `Uses a ${formatWeaponKind(unit).toLowerCase()} weapon and receives upgrades through its shared class family.`,
        stats,
      }));
    }
    content.append(grid);
  }

  renderHandbookCaptains() {
    const content = this.handbookContent;
    content.append(createPageHeader(
      'Captains',
      'Captains define the squad leader and provide class-specific passive effects. Locked Captains show their requirement, except for the classified final Commander.',
    ));
    const grid = createCardGrid();

    for (const entry of getHandbookCaptainEntries()) {
      const { captain, unlocked, unlock, image } = entry;
      if (captain.id === SECRET_CAPTAIN_ID && !unlocked) {
        grid.append(createSecretCard('CLASSIFIED CAPTAIN'));
        continue;
      }

      const bodyParts = [captain.description, captain.passiveText].filter(Boolean);
      if (!unlocked && unlock?.requirementText) bodyParts.push(`Unlock: ${unlock.requirementText}`);
      const card = createEntityCard({
        title: captain.name,
        subtitle: `${captain.role ?? 'Captain'} • ${unlocked ? 'UNLOCKED' : 'LOCKED'}`,
        image,
        fallback: captain.shortLabel ?? 'CAP',
        accent: captain.color,
        body: bodyParts.join(' '),
        stats: [
          ['Base HP', formatNumber(captain.maxHp)],
          ['Unit', UNIT_CLASSES[captain.unitType]?.label ?? captain.unitType],
        ],
      });
      card.classList.toggle('handbook-card--locked', !unlocked);
      grid.append(card);
    }
    content.append(grid);
  }

  renderHandbookMonsters() {
    const content = this.handbookContent;
    const entries = getHandbookMonsterEntries();
    content.append(createPageHeader(
      'Alien Bestiary',
      `${entries.length} registered normal enemy types. Running artwork is shown where the monster has a dedicated animation asset.`,
    ));
    const grid = createCardGrid();

    for (const { enemy, image } of entries) {
      const role = enemy.ranged
        ? 'Ranged attacker'
        : enemy.charge
          ? 'Heavy charger'
          : enemy.radius >= 20
            ? 'Heavy melee'
            : enemy.speed >= 110
              ? 'Fast melee'
              : 'Melee swarm';
      grid.append(createEntityCard({
        title: enemy.label,
        subtitle: role,
        image,
        fallback: enemy.label.slice(0, 3).toUpperCase(),
        accent: enemy.outline ?? enemy.fill,
        body: enemy.ranged
          ? 'Keeps distance and fires hostile projectiles at the squad.'
          : enemy.charge
            ? 'Approaches slowly, telegraphs a direction, then commits to a high-speed charge.'
            : 'Closes distance directly and damages squad members on contact.',
        stats: [
          ['Base HP', formatNumber(enemy.hp)],
          ['Speed', formatNumber(enemy.speed)],
          ['Damage', enemy.ranged ? formatNumber(enemy.ranged.damage) : formatNumber(enemy.damage)],
          ['XP', formatNumber(enemy.xp)],
        ],
      }));
    }
    content.append(grid);
  }

  renderHandbookBosses() {
    const content = this.handbookContent;
    const entries = getHandbookBossEntries();
    const discovered = entries.filter((entry) => entry.discovered).length;
    content.append(createPageHeader(
      'Boss Intel',
      `${discovered}/${entries.length} encounters discovered. A boss becomes permanently visible here the first time it is spawned.`,
    ));
    const grid = createCardGrid();

    for (const { config, summary, discovered: known } of entries) {
      if (!known) {
        grid.append(createSecretCard('UNDISCOVERED BOSS'));
        continue;
      }
      grid.append(createEntityCard({
        title: config.name,
        subtitle: `LEVEL ${config.spawnLevel} ENCOUNTER`,
        image: null,
        fallback: config.name.replace(/^The\s+/i, '').slice(0, 3).toUpperCase(),
        accent: config.colors?.core ?? config.colors?.shellEdge,
        body: summary,
        stats: [
          ['Level', config.spawnLevel],
          ['Base HP', config.maxHp],
          ['Speed', config.speed],
          ['Final Boss', config.id === CIPHER_BOSS.id ? 'Yes' : 'No'],
        ],
      }));
    }
    content.append(grid);
  }

  renderHandbookGoldUpgrades() {
    const content = this.handbookContent;
    const entries = getHandbookPermanentUpgradeEntries();
    const owned = entries.filter((entry) => entry.owned).length;
    content.append(createPageHeader(
      'Gold Upgrades',
      `Permanent progression bought between runs. ${owned}/${entries.length} upgrades currently owned. Prestige resets these purchases.`,
    ));
    const grid = createCardGrid();

    for (const { upgrade, owned: isOwned } of entries) {
      const requirementNames = (upgrade.requires ?? [])
        .map((id) => PERMANENT_UPGRADES[id]?.name ?? id);
      const description = requirementNames.length > 0
        ? `${upgrade.description} Requires: ${requirementNames.join(', ')}.`
        : upgrade.description;
      const card = createEntityCard({
        title: upgrade.name,
        subtitle: `${upgrade.cost} GOLD • ${isOwned ? 'OWNED' : 'AVAILABLE'}`,
        image: null,
        fallback: 'G',
        accent: upgrade.color,
        body: description,
        stats: [
          ['Cost', `${upgrade.cost} Gold`],
          ['Persistent', 'Until Prestige'],
        ],
      });
      if (isOwned) card.classList.add('handbook-card--owned');
      grid.append(card);
    }
    content.append(grid);
  }

  renderHandbookRunUpgrades() {
    const content = this.handbookContent;
    const upgrades = getHandbookRunUpgradeEntries();
    content.append(createPageHeader(
      'In-Run Unit Upgrades',
      `${upgrades.length} registered upgrade cards. Stat upgrades apply to entire class families; reinforcement cards add specific battlefield units.`,
    ));

    const grid = createCardGrid();
    for (const upgrade of upgrades) {
      const rarityDescriptions = ACTIVE_RARITIES
        .filter((rarity) => !upgrade.rarityIds || upgrade.rarityIds.includes(rarity.id))
        .map((rarity) => {
          try {
            return `${rarity.label}: ${upgrade.describe?.(rarity) ?? ''}`;
          } catch {
            return `${rarity.label}: available`;
          }
        });
      const typeLabel = upgrade.kind === 'reinforcement'
        ? 'Reinforcement'
        : 'Class Stat Upgrade';
      grid.append(createEntityCard({
        title: upgrade.name,
        subtitle: `${upgrade.tag ?? 'UNIT'} • ${typeLabel}`,
        image: null,
        fallback: upgrade.kind === 'reinforcement' ? '+' : '↑',
        accent: upgrade.kind === 'reinforcement' ? '#74c9ff' : '#7ef9d4',
        body: rarityDescriptions.join(' '),
        stats: [
          ['Stat', upgrade.stat ?? 'Unit Count'],
          ['Max Rank', Number.isFinite(Number(upgrade.maxRank)) ? upgrade.maxRank : '∞'],
        ],
      }));
    }
    content.append(grid);
  }
}
