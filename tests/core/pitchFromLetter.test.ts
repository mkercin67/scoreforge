import { describe, expect, it } from 'vitest';
import { pitchFromLetter } from '../../src/core/input';
import { Clef, Pitch, PitchStep } from '../../src/core/model';

const treble: Clef = { sign: 'G', line: 2 };
const bass: Clef = { sign: 'F', line: 4 };

const STEP_DIATONIC: Record<PitchStep, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

function diatonicDistance(p1: Pitch, p2: Pitch): number {
  const d1 = p1.octave * 7 + STEP_DIATONIC[p1.step];
  const d2 = p2.octave * 7 + STEP_DIATONIC[p2.step];
  return d2 - d1;
}

describe('pitchFromLetter octave rules', () => {
  it('Treble from null: C D E F G A B C must produce C5 D5 E5 F5 G5 A5 B5 C6', () => {
    const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
    let lastPitch: Pitch | null = null;
    const pitches: Pitch[] = [];

    for (const l of letters) {
      const p = pitchFromLetter(l, lastPitch, treble, 0);
      pitches.push(p);
      lastPitch = p;
    }

    expect(pitches).toEqual([
      { step: 'C', octave: 5, alter: 0 },
      { step: 'D', octave: 5, alter: 0 },
      { step: 'E', octave: 5, alter: 0 },
      { step: 'F', octave: 5, alter: 0 },
      { step: 'G', octave: 5, alter: 0 },
      { step: 'A', octave: 5, alter: 0 },
      { step: 'B', octave: 5, alter: 0 },
      { step: 'C', octave: 6, alter: 0 },
    ]);
  });

  it('verifies explicit test cases from requirements', () => {
    // B4 then C -> C5
    expect(pitchFromLetter('C', { step: 'B', octave: 4, alter: 0 }, treble, 0)).toEqual({
      step: 'C',
      octave: 5,
      alter: 0,
    });
    // C5 then B -> B4
    expect(pitchFromLetter('B', { step: 'C', octave: 5, alter: 0 }, treble, 0)).toEqual({
      step: 'B',
      octave: 4,
      alter: 0,
    });
    // E5 then F -> F5
    expect(pitchFromLetter('F', { step: 'E', octave: 5, alter: 0 }, treble, 0)).toEqual({
      step: 'F',
      octave: 5,
      alter: 0,
    });
    // F5 then E -> E5
    expect(pitchFromLetter('E', { step: 'F', octave: 5, alter: 0 }, treble, 0)).toEqual({
      step: 'E',
      octave: 5,
      alter: 0,
    });
    // C5 then G -> G4 (distance -3)
    expect(pitchFromLetter('G', { step: 'C', octave: 5, alter: 0 }, treble, 0)).toEqual({
      step: 'G',
      octave: 4,
      alter: 0,
    });
    // C5 then F -> F5 (+3)
    expect(pitchFromLetter('F', { step: 'C', octave: 5, alter: 0 }, treble, 0)).toEqual({
      step: 'F',
      octave: 5,
      alter: 0,
    });
    // G4 then C -> C5 (+3: G4=32, C5=35)
    expect(pitchFromLetter('C', { step: 'G', octave: 4, alter: 0 }, treble, 0)).toEqual({
      step: 'C',
      octave: 5,
      alter: 0,
    });
  });

  it('Bass clef from null (ref D3): C -> C3, then D E F G A B C -> D3 E3 F3 G3 A3 B3 C4', () => {
    const c3 = pitchFromLetter('C', null, bass, 0);
    expect(c3).toEqual({ step: 'C', octave: 3, alter: 0 });

    const letters = ['D', 'E', 'F', 'G', 'A', 'B', 'C'];
    let lastPitch: Pitch | null = c3;
    const pitches: Pitch[] = [];

    for (const l of letters) {
      const p = pitchFromLetter(l, lastPitch, bass, 0);
      pitches.push(p);
      lastPitch = p;
    }

    expect(pitches).toEqual([
      { step: 'D', octave: 3, alter: 0 },
      { step: 'E', octave: 3, alter: 0 },
      { step: 'F', octave: 3, alter: 0 },
      { step: 'G', octave: 3, alter: 0 },
      { step: 'A', octave: 3, alter: 0 },
      { step: 'B', octave: 3, alter: 0 },
      { step: 'C', octave: 4, alter: 0 },
    ]);
  });

  it('property test: distance is never > 3 diatonic steps for all letter pairs and octaves 2..6', () => {
    const steps: PitchStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

    for (let oct = 2; oct <= 6; oct++) {
      for (const s1 of steps) {
        const prev: Pitch = { step: s1, octave: oct, alter: 0 };
        for (const s2 of steps) {
          const next = pitchFromLetter(s2, prev, treble, 0);
          const dist = Math.abs(diatonicDistance(prev, next));
          expect(dist).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});
