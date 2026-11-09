# Render (`src/render`)

## Responsibility
Renders a `LayoutResult` into SVG (`LayoutResult -> SVG`), using Bravura SMuFL font glyphs and metadata metrics. Attaches `data-id` to rendered items for UI hit-testing.

## Import Rules
Imports: `src/layout`, `src/core`.
- Must not import `src/playback` or `src/ui`.
