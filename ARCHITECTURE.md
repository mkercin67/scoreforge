# ScoreForge — Architecture

Goal: a web-based music notation editor (later packaged for desktop with Tauri) that matches what
academics value in Finale: full manual control over every element, contemporary notation support,
microtonal pitch, scripting, and publication-quality engraving. Free and open source.

## Design principles (do not violate)

1. **Manual control first.** Every visual element can be overridden by the user. Automatic layout
   is a default, never a lock.
2. **Core is UI-independent.** `src/core` must run in plain Node with no DOM, no React.
3. **The score is plain serializable data.** No classes with hidden state, no functions inside the
   model. `JSON.stringify(score)` must round-trip.
4. **Every user change is a Command.** Undo/redo works because of this. No direct mutation.
5. **Microtonal-ready from day one.** Pitch alteration is a number (semitones), not an enum.
6. **Scriptable.** Anything the UI can do must be possible through a public API (later: `src/api`).
7. **Localization from day one.** The code, comments, file names and docs are in English, but
   every string the user sees comes from a translation file. Default UI language is **Turkish
   (`tr`)**; English (`en`) is the second language. Hard-coded user-visible strings are a bug.
8. **Units:** layout coordinates are in *staff spaces* (1 unit = distance between two staff lines).
   Conversion to pixels happens only in the renderer.

## Tech stack

- TypeScript (strict), Vite, React (UI only), Vitest, immer (immutable updates)
- Rendering: our own SVG renderer using the **Bravura** SMuFL font (SIL OFL license) and its
  `bravura_metadata.json` for glyph metrics/anchors
- Playback: Tone.js
- Desktop packaging later: Tauri (not in Phase 1)
- Single package (no monorepo). Boundaries are enforced by folders and the import rules below.

## Folder layout and import rules

```
src/
  core/      data model, commands, pure helpers          imports: nothing from this project
  layout/    Score -> LayoutResult (positions in staff spaces)   imports: core
  render/    LayoutResult -> SVG                          imports: layout, core
  playback/  Score -> scheduled events, Tone.js player   imports: core
  io/        JSON load/save, MusicXML                     imports: core
  ui/        React app, tools, keyboard handling          imports: everything above
  ui/i18n/   t(key) function, locales/tr.json, locales/en.json (own tiny implementation,
             no extra dependency; language is stored in settings, default 'tr')
tests/       mirrors src/ structure
```

Violating an import rule is a bug.

## Data model (src/core/model.ts)

Time is measured in integer **ticks**. `PPQ = 960` (ticks per quarter note). Never use floats for time.

```ts
type Id = string; // uuid

interface Score {
  schemaVersion: 1;
  id: Id;
  meta: { title: string; composer: string };
  parts: Part[];
  measures: MeasureDef[];            // global measure info shared by all staves
  overrides: Record<Id, Override>;   // manual layout overrides, keyed by element id
}

interface MeasureDef {
  id: Id;
  timeSig: { num: number; den: number };
  keySig: number;                    // -7..7 circle of fifths (custom keys later)
  tempo?: { bpm: number; beatUnit: number };
  // Non-standard measures (aleatoric, free time) later: `kind: 'metered' | 'unmetered'`
}

interface Part { id: Id; name: string; staves: Staff[]; instrument: string }
interface Staff { id: Id; clef: Clef; measures: Record<Id, StaffMeasure> } // key = MeasureDef.id

interface StaffMeasure { voices: Voice[] }
interface Voice { id: Id; events: ScoreEvent[] }

type ScoreEvent = NoteEvent | RestEvent;

interface BaseEvent {
  id: Id;
  duration: number;                  // ticks, includes dots and tuplet scaling
  baseType: 'whole'|'half'|'quarter'|'eighth'|'16th'|'32nd';
  dots: number;
  tuplet?: { actual: number; normal: number };
}
interface NoteEvent extends BaseEvent {
  kind: 'note';
  pitches: Pitch[];                  // chord = more than one pitch
  tiedToNext?: boolean;
  articulations: string[];           // e.g. 'staccato', 'accent'
  dynamic?: string;                  // e.g. 'mf'
}
interface RestEvent extends BaseEvent { kind: 'rest' }

interface Pitch {
  step: 'C'|'D'|'E'|'F'|'G'|'A'|'B';
  octave: number;                    // scientific: middle C = C4
  alter: number;                     // semitones; 0, 1, -1, 0.5 (quarter tone), etc.
}

interface Override {
  dx?: number; dy?: number;          // staff spaces, added on top of automatic position
  scale?: number;
  hidden?: boolean;
}
```

## Commands (src/core/commands.ts)

```ts
interface Command { name: string; apply(score: Score): Score } // use immer; return new Score
class History { do(cmd); undo(); redo(); }
```

Every edit (insert note, change pitch, delete, move element, change time signature) is a Command.

## Layout (src/layout)

`layoutScore(score, options) -> LayoutResult` is a pure function.

LayoutResult contains systems, staves, and a flat list of positioned items:
`{ id, kind: 'glyph'|'line'|'text', x, y, glyph?, ... }` with coordinates in staff spaces.

Phase 1 layout is intentionally simple:
- one system per row, wrap measures when width is exceeded
- horizontal spacing: minimum width per event, widened proportionally to duration
- stems, flags, beams (simple), ledger lines, accidentals, clef, key and time signatures
- after automatic placement, apply `score.overrides`

Do not try to build Finale-level automatic engraving in Phase 1. Correct and simple beats clever.

## Rendering (src/render)

`renderSvg(layout, options) -> string | SVGElement`. Every rendered item carries `data-id` equal to
the element id so the UI can do hit-testing and selection.

## Playback (src/playback)

`buildSchedule(score) -> ScheduledNote[]` is pure and unit-tested
(`{ timeSeconds, durationSeconds, midi, detuneCents, partId, elementId }`).
Tone.js lives only in `player.ts`. Microtonal alter becomes `detuneCents`.

## Files

Native format: JSON with `schemaVersion`. MusicXML export/import in Milestone 6.

## Localization (src/ui/i18n)

- `t('toolbar.play')` returns the string for the current language; missing key falls back to `en`,
  then to the key itself (and logs a warning in dev).
- Keys are grouped: `toolbar.*`, `palette.*`, `dialog.*`, `error.*`, `notation.*`, `shortcut.*`.
- Notation terms must use correct Turkish music terminology, e.g. treble clef = "Sol anahtarı",
  bass clef = "Fa anahtarı", measure = "Ölçü", sharp = "Diyez", flat = "Bemol", natural = "Bekar",
  whole/half/quarter/eighth/16th note = "Birlik/İkilik/Dörtlük/Sekizlik/Onaltılık nota",
  rest = "Es" (pause), tie = "Bağ", slur = "Legato bağı", tempo = "Tempo", key signature = "Armör",
  time signature = "Ölçü sayısı", dynamics keep Italian symbols (p, mf, f).
- Core and layout never contain user-visible text. Only `ui` talks to `t()`.
- Keyboard shortcuts are based on physical key codes (`event.code`), so they work on Turkish
  Q and English layouts alike.

## Phase 1 milestones (strictly in order; stop and report after each)

1. **M1 Model + commands + tests.** Model types, factory helpers, History, JSON round-trip, 
   commands: insertNote, deleteEvent, changePitch, setTimeSig. Full Vitest coverage.
2. **M2 Layout + SVG render of one staff.** Bravura loaded, clef/key/time, notes, rests, stems,
   ledger lines, accidentals, barlines. A static demo page rendering a sample score.
3. **M3 Interaction + i18n.** Add the i18n module (tr/en). Click to select, click on staff to insert note, keyboard input (A–G,
   1–5 durations, arrows, Delete, Ctrl+Z / Ctrl+Y), drag selected element to set `dx/dy` override.
4. **M4 Playback.** Play/pause/stop, tempo, current-note highlight.
5. **M5 Save/load.** JSON download/upload, autosave to IndexedDB.
6. **M6 MusicXML export and import** (single part first, then multi-part).

Phase 2 (not now): multi-staff systems, parts extraction, tuplets, grace notes, SMuFL custom
symbols, proportional spacing, scripting API, .musx import, Tauri desktop packaging.
