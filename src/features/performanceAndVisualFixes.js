import { Game as PreviousGame, UI as PreviousUI } from './squadBuilderVisuals.js';

function loadSquadBuilderVisualFixes() {
  const href = new URL('../../styles/squad-builder-v43.css', import.meta.url).href;
  if (document.querySelector(`link[data-squad-builder-v43="${href}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.squadBuilderV43 = href;
  document.head.append(link);
}

loadSquadBuilderVisualFixes();

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    document.querySelector('[data-debug-drop="nuke"]')?.remove();
  }
}

export class Game extends PreviousGame {
  startNukeWave() {
    this.nukeWave = null;
  }
}
