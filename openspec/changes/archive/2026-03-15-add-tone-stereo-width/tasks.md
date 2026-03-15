## 1. Audio Placement

- [x] 1.1 Add placement sampling constants (overlap range, outlier probability, max step) and per-note pan sampling for voice A/B.
- [x] 1.2 Insert per-note `StereoPannerNode` instances into the tonal signal chain and apply per-note pan values with a short ramp.

## 2. Visualization Alignment

- [x] 2.1 Expose the per-note tonal voice pan values to the visualization state in `js/app.js`.
- [x] 2.2 Map visualization circle X positions from the pan values, keeping them within bounds and stable for the note duration.

## 3. Validation

- [x] 3.1 Verify overlap-first placement with occasional outliers, and confirm visuals follow per-note placement.
