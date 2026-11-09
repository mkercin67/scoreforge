# Playback (`src/playback`)

## Responsibility
Schedules score events for audio playback (`Score -> scheduled events`) and drives audio output with Tone.js. Microtonal alterations are mapped to pitch detune cents.

## Import Rules
Imports: `src/core`.
- May import Tone.js.
- Must not import `src/layout`, `src/render`, or `src/ui`.
