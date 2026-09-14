import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { UI } from './core/UI.js';

const canvas = document.querySelector('#game-canvas');
const touchStick = document.querySelector('#touch-stick');
const ui = new UI();
const input = new Input(canvas, touchStick);
const game = new Game(canvas, input, ui);

game.debug = {
  infiniteHp: false,
};

ui.bindStart(() => game.start());
ui.bindRestart(() => game.restart());
ui.bindDebug({
  setInfiniteHp(enabled) {
    game.debug.infiniteHp = enabled;
    if (enabled) game.player.hp = game.player.maxHp;
  },
  levelUp() {
    game.progression.debugLevelUp();
  },
});

window.game = game;
