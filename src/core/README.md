# Core (`src/core`)

## Responsibility
Contains the fundamental data model, factory helpers, time calculations, commands, and validation functions. It is completely UI-independent and must run in plain Node with no DOM or React dependencies.

## Import Rules
Imports: **nothing from this project**.
- Must not import React, DOM APIs, or Tone.js.
- Pure TypeScript and pure helpers only.
