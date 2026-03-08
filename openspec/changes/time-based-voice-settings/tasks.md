## 1. Configuration

- [ ] 1.1 Locate existing voice default settings schema and parameter bounds to extend
- [ ] 1.2 Add schedule structure (dayparts, transition window, enabled flag) with default afternoon/evening profiles

## 2. Core Logic

- [ ] 2.1 Implement a pure selector to compute effective defaults from base defaults, schedule, and local time
- [ ] 2.2 Implement linear interpolation during transition windows with clamping to parameter bounds
- [ ] 2.3 Ensure fallback to base defaults when the schedule is missing or disabled

## 3. Integration

- [ ] 3.1 Wire the selector into the voice defaults pipeline so rendering uses effective defaults
- [ ] 3.2 Add a time source abstraction to enable deterministic tests

## 4. Tests

- [ ] 4.1 Add unit tests for local time daypart selection
- [ ] 4.2 Add unit tests for afternoon-to-evening interpolation and clamping
- [ ] 4.3 Add unit test for schedule absence fallback
