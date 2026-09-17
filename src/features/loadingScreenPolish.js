import { Game, UI as PreviousUI } from './prestigePopup.js';

const ISSUE_88_STYLE_ID = 'issue-88-loading-screen';
const ISSUE_88_STYLES = `
  .boot-screen__track {
    display: block !important;
  }
`;

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.applyIssue88LoadingScreen();
  }

  applyIssue88LoadingScreen() {
    const content = document.querySelector('#boot-screen .boot-screen__content');
    if (!content) return;

    content.querySelector('.boot-screen__eyebrow')?.remove?.();

    if (!document.querySelector(`#${ISSUE_88_STYLE_ID}`)) {
      const style = document.createElement('style');
      style.id = ISSUE_88_STYLE_ID;
      style.textContent = ISSUE_88_STYLES;
      document.head?.append(style);
    }

    let track = content.querySelector('.boot-screen__track');
    if (!track) {
      track = document.createElement('div');
      track.className = 'boot-screen__track';
      track.setAttribute('aria-hidden', 'true');

      const bar = document.createElement('div');
      bar.className = 'boot-screen__bar';
      track.append(bar);

      const status = content.querySelector('#boot-status');
      if (status?.after) status.after(track);
      else content.append(track);
    }
  }
}

export { Game };
