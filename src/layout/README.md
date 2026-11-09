# Layout (`src/layout`)

## Responsibility
Transforms a `Score` into a `LayoutResult` (`Score -> LayoutResult`), determining element positions in staff spaces (1 unit = distance between two staff lines). Handles spacing, accidental placement, stems, beams, ledger lines, and manual overrides.

## Import Rules
Imports: `src/core`.
- Must not import `src/render`, `src/playback`, `src/ui`, or React/DOM.
