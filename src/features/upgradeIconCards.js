import { Game, UI as PreviousUI } from './squadConnectivity.js';
import { getUpgradeIconSpec } from '../data/upgradeIcons.js';

export { Game };

function createIconImage(src, className, fallback) {
  const image = document.createElement('img');
  image.className = className;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.addEventListener('load', () => fallback?.classList.add('upgrade-icon-fallback--hidden'));
  image.addEventListener('error', () => image.remove());
  image.src = src;
  return image;
}

export class UI extends PreviousUI {
  showLevelUp(choices, onChoose, ranks, onSkip) {
    super.showLevelUp(choices, onChoose, ranks, onSkip);

    const cards = [...this.upgradeOptions.children];
    cards.forEach((card, index) => {
      const choice = choices[index];
      if (!choice?.upgrade) return;

      const portrait = card.querySelector('.upgrade-card__portrait');
      const icon = getUpgradeIconSpec(choice.upgrade);
      const stage = document.createElement('div');
      stage.className = 'upgrade-icon-stage';
      stage.dataset.genericIcon = icon.genericKey;
      stage.dataset.classIcon = icon.classKey;

      const classBadge = document.createElement('div');
      classBadge.className = 'upgrade-icon-class';
      classBadge.title = `${choice.upgrade.tag} class`;
      const classFallback = document.createElement('span');
      classFallback.className = 'upgrade-icon-fallback upgrade-icon-fallback--class';
      classFallback.textContent = icon.classFallback;
      classBadge.append(classFallback, createIconImage(icon.classSrc, 'upgrade-icon-class__image', classFallback));

      if (choice.upgrade.kind === 'reinforcement') {
        stage.classList.add('upgrade-icon-stage--reinforcement');
        stage.dataset.genericIcon = 'unit-portrait';
        if (portrait) {
          portrait.style.width = '100%';
          portrait.style.height = '118px';
          portrait.style.margin = '0';
          portrait.style.objectFit = 'contain';
          portrait.style.objectPosition = 'center';
          portrait.style.pointerEvents = 'none';
          stage.append(portrait);
        }
      } else {
        portrait?.remove();
        const genericShell = document.createElement('div');
        genericShell.className = 'upgrade-icon-generic';
        const genericFallback = document.createElement('span');
        genericFallback.className = 'upgrade-icon-fallback';
        genericFallback.textContent = icon.genericFallback;
        genericShell.append(genericFallback, createIconImage(icon.genericSrc, 'upgrade-icon-generic__image', genericFallback));
        stage.append(genericShell);
      }

      stage.append(classBadge);
      const meta = card.querySelector('.upgrade-card__meta');
      if (meta) meta.after(stage);
      else card.prepend(stage);
    });
  }
}
