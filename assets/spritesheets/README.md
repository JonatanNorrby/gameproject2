# Sprite sheets

Put the game's single-image sprite sheets in this folder.

Recommended naming:

- `rifleman.png`
- `rocketeer.png`
- `captain-mercer.png`
- `captain-vale.png`
- `crawler.png`
- `runner.png`
- `brute.png`

PNG with transparency is recommended. A sprite sheet may be a horizontal strip or a grid with one animation per row.

Sprite metadata lives in `src/data/sprites.js`. Until a sprite is configured there, the game keeps drawing the current procedural shape as a fallback.

Example configuration:

```js
rifleman: {
  src: './assets/spritesheets/rifleman.png',
  frameWidth: 64,
  frameHeight: 64,
  drawWidth: 42,
  drawHeight: 42,
  anchorX: 0.5,
  anchorY: 0.55,
  smoothing: true,
  animations: {
    idle: { row: 0, startFrame: 0, frameCount: 4, fps: 6 },
    move: { row: 1, startFrame: 0, frameCount: 6, fps: 10 },
  },
},
```

Animation fields:

- `row`: optional row in a grid. When present, frame numbers refer to columns in that row.
- `startFrame` + `frameCount`: contiguous frames.
- `frames`: optional explicit frame sequence such as `[0, 1, 2, 1]` instead of `startFrame`/`frameCount`.
- `fps`: playback speed.
- `loop: false`: play once and hold the last frame. Looping is the default.

Sheet layout fields also support `columns`, `marginX`, `marginY`, `spacingX`, and `spacingY` if a sheet contains gutters or padding.

When supplying a new sprite sheet, include its intended frame size and which rows/frames belong to each animation if that is not obvious from the image. The renderer can then replace the corresponding in-game shape without changing combat logic.
