import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { UI } from './core/UI.js';

const canvas = document.querySelector('#game-canvas');
const touchStick = document.querySelector('#touch-stick');
const ui = new UI();
const input = new Input(canvas, touchStick);
const game = new Game(canvas, input, ui);

ui.bindStart(() => game.start());
ui.bindRestart(() => game.restart());

window.game = game;
