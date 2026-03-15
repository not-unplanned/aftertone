## 1. UI Structure

- [x] 1.1 Add a new visualization card to `index.html` with a canvas element and heading.
- [x] 1.2 Add CSS to size the canvas to the card bounds and keep the card consistent with existing layout.

## 2. Rendering Engine

- [x] 2.1 Create a visualization module that owns the canvas, handles resize, and runs a `requestAnimationFrame` loop.
- [x] 2.2 Implement the noise/static background with mappings for noise volume, noise color, and noise pan controls.
- [x] 2.3 Implement two tonal circles with radius from unmixed amplitude meters and color from brightness controls, positioned left/right.

## 3. Wiring & Validation

- [x] 3.1 Wire the visualization module into `js/app.js` so it reads live control values and meter levels.
- [x] 3.2 Ensure the visualization behaves safely when audio is stopped or paused (no errors, graceful visuals).
- [x] 3.3 Verify all requirements in the voices visualization spec and adjust mappings as needed.
