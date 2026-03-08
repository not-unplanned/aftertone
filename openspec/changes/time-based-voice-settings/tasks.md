## 1. Configuration

- [x] 1.1 Locate existing voice default settings schema and parameter bounds to extend
- [x] 1.2 Add schedule structure (dayparts, transition window, enabled flag) with default afternoon/evening profiles

## 2. Core Logic

- [x] 2.1 Implement a pure selector to compute effective defaults from base defaults, schedule, and local time
- [x] 2.2 Implement linear interpolation during transition windows with clamping to parameter bounds
- [x] 2.3 Ensure fallback to base defaults when the schedule is missing or disabled

## 3. Integration

- [x] 3.1 Wire the selector into the voice defaults pipeline so rendering uses effective defaults
- [x] 3.2 Add a time source abstraction to enable deterministic tests

## 4. Tests

- [x] 4.1 Add unit tests for local time daypart selection
- [x] 4.2 Add unit tests for afternoon-to-evening interpolation and clamping
- [x] 4.3 Add unit test for schedule absence fallback
