# I/O (`src/io`)

## Responsibility
Handles score serialization and deserialization, including native JSON format with `schemaVersion` verification and MusicXML import/export.

## Import Rules
Imports: `src/core`.
- Must not import `src/layout`, `src/render`, `src/playback`, or `src/ui`.
