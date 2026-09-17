import { Game, UI as PreviousUI } from './broodmotherVisualPolish.js';
import { UNIT_CLASS_FAMILY_NAMES } from '../data/unitFamilies.js';

const LEGACY_CLASS_NAMES = Object.freeze({
  rifleman: 'Rifleman',
  rocketeer: 'Rocketeer',
  shockblade: 'Shockblade',
});

const SPECIAL_REPLACEMENTS = Object.freeze([
  Object.freeze([
    'Recruit Rifleman-, Rocketeer-, and Shockblade-family units',
    'Recruit Trooper, Specialist, and Vanguard class units',
  ]),
]);

const CLASS_TERM_REPLACEMENTS = Object.freeze(
  Object.entries(LEGACY_CLASS_NAMES).flatMap(([familyId, legacyName]) => {
    const currentName = UNIT_CLASS_FAMILY_NAMES[familyId] ?? legacyName;
    return [
      [`${legacyName} Class`, `${currentName} Class`],
      [`${legacyName}-class`, `${currentName}-class`],
      [`${legacyName} class`, `${currentName} class`],
    ];
  }),
);

export function replaceClassFamilyTerminology(value) {
  let next = String(value ?? '');
  for (const [legacyText, currentText] of SPECIAL_REPLACEMENTS) {
    next = next.split(legacyText).join(currentText);
  }
  for (const [legacyText, currentText] of CLASS_TERM_REPLACEMENTS) {
    next = next.split(legacyText).join(currentText);
  }
  return next;
}

function updateTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const next = replaceClassFamilyTerminology(node.nodeValue);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function updateClassFamilyText(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    updateTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    updateTextNode(node);
    node = walker.nextNode();
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.installClassFamilyNames();
  }

  installClassFamilyNames() {
    const root = document.querySelector('#app') ?? document.body;
    if (!root) return;

    updateClassFamilyText(root);
    if (typeof MutationObserver === 'undefined') return;

    this.classFamilyNameObserver?.disconnect?.();
    this.classFamilyNameObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') updateTextNode(mutation.target);
        for (const node of mutation.addedNodes ?? []) updateClassFamilyText(node);
      }
    });
    this.classFamilyNameObserver.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

export { Game };
