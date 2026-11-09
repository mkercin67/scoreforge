# ScoreForge — Agent Rules

Read this file and ARCHITECTURE.md at the start of every session.

## Process

1. Work on **one milestone at a time**, in the order given in ARCHITECTURE.md.
   Never start the next milestone without explicit approval from the human.
2. Before writing code for a milestone, write a short plan (files to create, functions, tests) and
   wait for approval only if the plan deviates from ARCHITECTURE.md. Otherwise proceed.
3. After finishing a milestone: run `npm run typecheck`, `npm test`, and `npm run build`.
   All must pass. Then commit with message `M<n>: <summary>` and report.
4. Final report format: what was built, how to run it, test results, known limitations,
   questions for the human. Keep it under 30 lines.

## Code rules

- TypeScript `strict: true`. No `any` (use `unknown` and narrow). No `// @ts-ignore`.
- Respect the folder import rules. `src/core` must not import React, DOM APIs, or Tone.js.
- The score model is plain data. Never mutate it; use commands and immer.
- Time is integer ticks (PPQ = 960). No floating-point time in the model.
- Pitch `alter` is a number of semitones.
- Small files and small functions. One responsibility per module. Prefer pure functions.
- Every exported function has a short doc comment. Comments explain *why*, not *what*.
- Add tests for every pure function. Use Vitest. Tests mirror the `src/` structure.
- Do not add dependencies beyond: react, react-dom, vite, vitest, typescript, immer, tone,
  and their type packages. Ask before adding anything else.
- Do not rewrite working files wholesale to make a small change. Make minimal edits.

## Language rules

- Code, comments, commit messages, file names and docs: English.
- Everything the end user sees: Turkish by default, through `t(key)`; add the English string too.
- Never hard-code user-visible text in components. Add keys to `tr.json` and `en.json` together.
- Use correct Turkish music terminology as listed in ARCHITECTURE.md.
- The final report to the human may be written in Turkish.

## Music notation rules (verify your work against these)

- Stem direction: notes on or above the middle staff line (B4 in treble clef) get stems down;
  notes below get stems up.
- Ledger lines are drawn for notes outside the five lines, extending slightly past the notehead.
- Accidentals appear to the left of the notehead; an accidental applies for the rest of the
  measure on the same pitch and octave unless the key signature already contains it.
- Duration of a measure in ticks = `num * (4 / den) * PPQ`. Validate voices against it.
- Treble clef: bottom line is E4. Bass clef: bottom line is G2.

## Things you must not do

- Do not copy code, icons, fonts, or text from Finale, Dorico, Sibelius, or MuseScore.
- Do not claim something works without running the tests.
- Do not silently skip a requirement. If something is hard, say so in the report.
- Do not delete tests to make the build pass.

## When stuck

If a task fails twice, stop, describe the problem clearly (error, what you tried, hypotheses),
and ask the human instead of guessing a third time.
