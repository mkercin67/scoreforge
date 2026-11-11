/**
 * Comprehensive 8-measure Beam Demo Score covering all Milestone 3d Section D cases.
 */

import {
  createMeasure,
  createNote,
  createPart,
  createPitch,
  createRest,
  createScore,
} from '../core/factory';
import { PitchStep, Score } from '../core/model';

/**
 * Builds an 8-measure score exercising every Section D beaming requirement:
 * - M1 (4/4): 4 eighths (2 beat groups) + eighth+two sixteenths + quarter
 * - M2 (4/4): 8 sixteenths + dotted eighth+sixteenth (stub) + quarter
 * - M3 (4/4): ascending scale of 8 eighths
 * - M4 (4/4): descending scale of 8 eighths
 * - M5 (4/4): middle-line straddling 16ths + eighths + eighth chords
 * - M6 (6/8): 6 eighths (2 compound groups of 3)
 * - M7 (6/8): four eighths broken by an eighth rest in the middle
 * - M8 (4/4): single eighth after quarter (keeps flag) + beamed eighths + quarter
 *
 * @param clefSign - 'G' for Treble clef or 'F' for Bass clef.
 * @returns Complete 8-measure Score.
 */
export function buildBeamDemoScore(clefSign: 'G' | 'F' = 'G'): Score {
  const isBass = clefSign === 'F';
  const baseOct = isBass ? 2 : 4;

  const score = createScore({
    title: isBass ? 'M3d Beam Demo — Bass Clef' : 'M3d Beam Demo — Treble Clef',
    composer: 'ScoreForge M3d',
  });

  const p = (step: PitchStep, octOffset = 0, alter = 0) =>
    createPitch(step, baseOct + octOffset, alter);

  const m1 = createMeasure({ num: 4, den: 4 }, 0);
  const m2 = createMeasure({ num: 4, den: 4 }, 0);
  const m3 = createMeasure({ num: 4, den: 4 }, 0);
  const m4 = createMeasure({ num: 4, den: 4 }, 0);
  const m5 = createMeasure({ num: 4, den: 4 }, 0);
  const m6 = createMeasure({ num: 6, den: 8 }, 0);
  const m7 = createMeasure({ num: 6, den: 8 }, 0);
  const m8 = createMeasure({ num: 4, den: 4 }, 0);

  score.measures = [m1, m2, m3, m4, m5, m6, m7, m8];

  const part = createPart({
    name: isBass ? 'Bass Clef Part' : 'Treble Clef Part',
    clef: isBass ? { sign: 'F', line: 4 } : { sign: 'G', line: 2 },
  });
  score.parts = [part];

  // M1 (4/4): Case 1 (4 eighths -> 2 groups) + Case 3 (eighth + two sixteenths) + quarter
  const m1Events = [
    createNote({ pitches: [p('G', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('A', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('F', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('G', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('A', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('B', 0)], baseType: '16th' }),
    createNote({ pitches: [p('C', 1)], baseType: '16th' }),
    createNote({ pitches: [p('D', 1)], baseType: 'quarter' }),
  ];

  // M2 (4/4): Case 2 (8 sixteenths -> 2 groups of 4) + Case 4 (dotted eighth + sixteenth) + quarter
  const m2Events = [
    createNote({ pitches: [p('E', 0)], baseType: '16th' }),
    createNote({ pitches: [p('F', 0)], baseType: '16th' }),
    createNote({ pitches: [p('G', 0)], baseType: '16th' }),
    createNote({ pitches: [p('A', 0)], baseType: '16th' }),
    createNote({ pitches: [p('B', 0)], baseType: '16th' }),
    createNote({ pitches: [p('C', 1)], baseType: '16th' }),
    createNote({ pitches: [p('D', 1)], baseType: '16th' }),
    createNote({ pitches: [p('E', 1)], baseType: '16th' }),
    createNote({ pitches: [p('G', 0)], baseType: 'eighth', dots: 1 }),
    createNote({ pitches: [p('A', 0)], baseType: '16th' }),
    createNote({ pitches: [p('B', 0)], baseType: 'quarter' }),
  ];

  // M3 (4/4): Case 5 — ascending scale of 8 eighths
  const m3Events = [
    createNote({ pitches: [p('C', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('D', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('E', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('F', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('G', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('A', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('B', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('C', 1)], baseType: 'eighth' }),
  ];

  // M4 (4/4): Case 6 — descending scale of 8 eighths
  const m4Events = [
    createNote({ pitches: [p('C', 1)], baseType: 'eighth' }),
    createNote({ pitches: [p('B', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('A', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('G', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('F', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('E', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('D', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('C', 0)], baseType: 'eighth' }),
  ];

  // M5 (4/4): Case 7 (group straddling middle line) + Case 10 (eighth chords)
  const m5Events = [
    // Beat 0: straddling middle line B4 (treble) / D3 (bass)
    createNote({ pitches: [p('F', 0)], baseType: '16th' }),
    createNote({ pitches: [p('D', 1)], baseType: '16th' }),
    createNote({ pitches: [p('A', 0)], baseType: '16th' }),
    createNote({ pitches: [p('C', 1)], baseType: '16th' }),
    // Beat 1: straddling pair
    createNote({ pitches: [p('G', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('D', 1)], baseType: 'eighth' }),
    // Beat 2-3: eighth chords
    createNote({ pitches: [p('E', 0), p('G', 0), p('B', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('F', 0), p('A', 0), p('C', 1)], baseType: 'eighth' }),
    createNote({ pitches: [p('G', 0), p('B', 0), p('D', 1)], baseType: 'eighth' }),
    createNote({ pitches: [p('A', 0), p('C', 1), p('E', 1)], baseType: 'eighth' }),
  ];

  // M6 (6/8): Case 8 — 6 eighths in two groups of 3
  const m6Events = [
    createNote({ pitches: [p('G', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('A', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('B', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('C', 1)], baseType: 'eighth' }),
    createNote({ pitches: [p('D', 1)], baseType: 'eighth' }),
    createNote({ pitches: [p('E', 1)], baseType: 'eighth' }),
  ];

  // M7 (6/8): Case 9 — four eighths split into two groups by an eighth rest in the middle
  const m7Events = [
    createNote({ pitches: [p('G', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('A', 0)], baseType: 'eighth' }),
    createRest({ baseType: 'eighth' }),
    createNote({ pitches: [p('B', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('C', 1)], baseType: 'eighth' }),
    createRest({ baseType: 'eighth' }),
  ];

  // M8 (4/4): Case 11 (single eighth after quarter keeping its flag) + beamed eighths for Case 12 drag
  const m8Events = [
    createNote({ pitches: [p('C', 1)], baseType: 'quarter' }),
    createNote({ pitches: [p('B', 0)], baseType: 'eighth' }),
    createRest({ baseType: 'eighth' }),
    createNote({ pitches: [p('G', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('A', 0)], baseType: 'eighth' }),
    createNote({ pitches: [p('B', 0)], baseType: 'quarter' }),
  ];

  const st = part.staves[0];
  st.measures[m1.id] = { voices: [{ id: 'v1', events: m1Events }] };
  st.measures[m2.id] = { voices: [{ id: 'v1', events: m2Events }] };
  st.measures[m3.id] = { voices: [{ id: 'v1', events: m3Events }] };
  st.measures[m4.id] = { voices: [{ id: 'v1', events: m4Events }] };
  st.measures[m5.id] = { voices: [{ id: 'v1', events: m5Events }] };
  st.measures[m6.id] = { voices: [{ id: 'v1', events: m6Events }] };
  st.measures[m7.id] = { voices: [{ id: 'v1', events: m7Events }] };
  st.measures[m8.id] = { voices: [{ id: 'v1', events: m8Events }] };

  return score;
}
