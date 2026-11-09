import React, { useMemo } from 'react';
import {
  createMeasure,
  createNote,
  createPart,
  createPitch,
  createRest,
  createScore,
} from '../core/factory';
import { Score } from '../core/model';
import { layoutScore } from '../layout/layoutScore';
import { renderSvgToString } from '../render/renderSvg';

/**
 * Builds a comprehensive test score exercising all Milestone 2 layout requirements.
 *
 * @param clefSign - 'G' for Treble or 'F' for Bass.
 * @returns Score instance.
 */
function buildSampleScore(clefSign: 'G' | 'F'): Score {
  const isBass = clefSign === 'F';
  const score = createScore({
    title: isBass ? 'Demo Score — Bass Clef' : 'Demo Score — Treble Clef',
    composer: 'ScoreForge Demo',
  });

  // Measure 1: Rising scale (G major = 1 sharp)
  const m1 = createMeasure({ num: 4, den: 4 }, 1);
  // Measure 2: Dotted rhythms
  const m2 = createMeasure({ num: 4, den: 4 }, 1);
  // Measure 3: Rests of multiple lengths
  const m3 = createMeasure({ num: 4, den: 4 }, 1);
  // Measure 4: Chord with second & accidentals (including natural sign)
  const m4 = createMeasure({ num: 4, den: 4 }, 1);
  // Measure 5: Ledger lines above and below
  const m5 = createMeasure({ num: 4, den: 4 }, 1);

  score.measures = [m1, m2, m3, m4, m5];

  const part = createPart({
    name: isBass ? 'Bass Clef Part' : 'Treble Clef Part',
    clef: isBass ? { sign: 'F', line: 4 } : { sign: 'G', line: 2 },
  });
  score.parts = [part];

  // Base octave offset for bass clef vs treble clef
  const oct = isBass ? 2 : 4;

  // Measure 1: Rising scale
  const m1Events = [
    createNote({ pitches: [createPitch('G', oct, 0)], baseType: 'quarter' }),
    createNote({ pitches: [createPitch('A', oct, 0)], baseType: 'quarter' }),
    createNote({ pitches: [createPitch('B', oct, 0)], baseType: 'quarter' }),
    createNote({ pitches: [createPitch('C', oct + 1, 0)], baseType: 'quarter' }),
  ];

  // Measure 2: Dotted rhythms
  const m2Events = [
    createNote({ pitches: [createPitch('D', oct + 1, 0)], baseType: 'quarter', dots: 1 }),
    createNote({ pitches: [createPitch('C', oct + 1, 0)], baseType: 'eighth' }),
    createNote({ pitches: [createPitch('B', oct, 0)], baseType: 'quarter', dots: 1 }),
    createNote({ pitches: [createPitch('A', oct, 0)], baseType: 'eighth' }),
  ];

  // Measure 3: Rests of multiple lengths
  const m3Events = [
    createRest({ baseType: 'half' }), // 1920
    createRest({ baseType: 'quarter' }), // 960
    createRest({ baseType: 'eighth' }), // 480
    createRest({ baseType: '16th' }), // 240
    createRest({ baseType: '16th' }), // 240
  ];

  // Measure 4: Chord with a second, followed by accidental cancelling with natural
  const m4Events = [
    // Chord with second: F# + G
    createNote({
      pitches: [createPitch('F', oct, 1), createPitch('G', oct, 0)],
      baseType: 'quarter',
    }),
    // Accidental cancelling to F natural (G major has F# in armör, so natural is rendered!)
    createNote({
      pitches: [createPitch('F', oct, 0)],
      baseType: 'quarter',
    }),
    // Followed by F sharp in same measure (sharp is rendered!)
    createNote({
      pitches: [createPitch('F', oct, 1)],
      baseType: 'quarter',
    }),
    // Quarter note
    createNote({
      pitches: [createPitch('G', oct, 0)],
      baseType: 'quarter',
    }),
  ];

  // Measure 5: Ledger lines above and below
  const m5Events = isBass
    ? [
        createNote({ pitches: [createPitch('E', 2, 0)], baseType: 'quarter' }), // 1 ledger below
        createNote({ pitches: [createPitch('C', 2, 0)], baseType: 'quarter' }), // 2 ledger below
        createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' }), // 1 ledger above (Middle C)
        createNote({ pitches: [createPitch('E', 4, 0)], baseType: 'quarter' }), // 2 ledger above
      ]
    : [
        createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' }), // 1 ledger below (Middle C)
        createNote({ pitches: [createPitch('A', 3, 0)], baseType: 'quarter' }), // 2 ledger below
        createNote({ pitches: [createPitch('A', 5, 0)], baseType: 'quarter' }), // 1 ledger above
        createNote({ pitches: [createPitch('C', 6, 0)], baseType: 'quarter' }), // 2 ledger above
      ];

  const staffObj = part.staves[0];
  staffObj.measures[m1.id] = { voices: [{ id: 'v1', events: m1Events }] };
  staffObj.measures[m2.id] = { voices: [{ id: 'v1', events: m2Events }] };
  staffObj.measures[m3.id] = { voices: [{ id: 'v1', events: m3Events }] };
  staffObj.measures[m4.id] = { voices: [{ id: 'v1', events: m4Events }] };
  staffObj.measures[m5.id] = { voices: [{ id: 'v1', events: m5Events }] };

  return score;
}

export const Demo: React.FC = () => {
  const trebleScore = useMemo(() => buildSampleScore('G'), []);
  const bassScore = useMemo(() => buildSampleScore('F'), []);

  // System width set to 88 staff spaces to wrap 5 measures neatly into 2 systems
  const trebleLayout = useMemo(() => layoutScore(trebleScore, { width: 88 }), [trebleScore]);
  const bassLayout = useMemo(() => layoutScore(bassScore, { width: 88 }), [bassScore]);

  const trebleSvg = useMemo(
    () => renderSvgToString(trebleLayout, { staffSpacePx: 12, color: '#111827' }),
    [trebleLayout]
  );
  const bassSvg = useMemo(
    () => renderSvgToString(bassLayout, { staffSpacePx: 12, color: '#111827' }),
    [bassLayout]
  );

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '24px', backgroundColor: '#f9fafb' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', margin: '0 0 8px 0', color: '#111827' }}>
          ScoreForge — Milestone 2 Engraving Demo
        </h1>
        <p style={{ color: '#4b5563', margin: 0 }}>
          SVG layout and rendering with Bravura SMuFL font. Displays clefs, G major armör,
          rising scale, dotted rhythms, rests, chord with second, ledger lines, accidental
          natural cancellation, and 2-system wrapping.
        </p>
      </header>

      <section
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '32px',
        }}
      >
        <h2 style={{ fontSize: '20px', margin: '0 0 16px 0', color: '#1f2937' }}>
          1. Treble Clef (Sol Anahtarı) — 2 Systems Wrapped
        </h2>
        <div
          id="treble-demo-container"
          dangerouslySetInnerHTML={{ __html: trebleSvg }}
          style={{ overflowX: 'auto' }}
        />
      </section>

      <section
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <h2 style={{ fontSize: '20px', margin: '0 0 16px 0', color: '#1f2937' }}>
          2. Bass Clef (Fa Anahtarı) — 2 Systems Wrapped
        </h2>
        <div
          id="bass-demo-container"
          dangerouslySetInnerHTML={{ __html: bassSvg }}
          style={{ overflowX: 'auto' }}
        />
      </section>
    </div>
  );
};

export default Demo;
