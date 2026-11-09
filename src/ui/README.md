# UI (`src/ui`)

## Responsibility
Provides the React application, user interaction tools, canvas viewport, selection, keyboard handling, dialogs, and internationalization (`src/ui/i18n`).

## Import Rules
Imports: everything (`src/core`, `src/layout`, `src/render`, `src/playback`, `src/io`).
- All user-visible strings must be fetched through `t(key)` (default language: Turkish `tr`).
