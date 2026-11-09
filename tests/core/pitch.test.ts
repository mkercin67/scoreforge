import { describe, expect, it } from 'vitest';
import { createPitch } from '../../src/core/factory';
import { transposeOctave, transposeSemitone } from '../../src/core/pitch';

describe('core pitch transposition', () => {
  it('transposes semitones upward using sharp spellings', () => {
    let p = createPitch('C', 4, 0);

    p = transposeSemitone(p, 'up');
    expect(p).toEqual({ step: 'C', octave: 4, alter: 1 }); // C#4

    p = transposeSemitone(p, 'up');
    expect(p).toEqual({ step: 'D', octave: 4, alter: 0 }); // D4

    p = transposeSemitone(p, 'up');
    expect(p).toEqual({ step: 'D', octave: 4, alter: 1 }); // D#4

    p = transposeSemitone(p, 'up');
    expect(p).toEqual({ step: 'E', octave: 4, alter: 0 }); // E4

    p = transposeSemitone(p, 'up');
    expect(p).toEqual({ step: 'F', octave: 4, alter: 0 }); // F4

    p = transposeSemitone(p, 'up');
    expect(p).toEqual({ step: 'F', octave: 4, alter: 1 }); // F#4
  });

  it('transposes past octave boundary upward (B4 -> C5)', () => {
    const b4 = createPitch('B', 4, 0);
    const c5 = transposeSemitone(b4, 'up');
    expect(c5).toEqual({ step: 'C', octave: 5, alter: 0 });
  });

  it('transposes semitones downward using flat spellings', () => {
    let p = createPitch('C', 4, 0);

    p = transposeSemitone(p, 'down');
    expect(p).toEqual({ step: 'B', octave: 3, alter: 0 }); // B3

    p = transposeSemitone(p, 'down');
    expect(p).toEqual({ step: 'B', octave: 3, alter: -1 }); // Bb3

    p = transposeSemitone(p, 'down');
    expect(p).toEqual({ step: 'A', octave: 3, alter: 0 }); // A3

    p = transposeSemitone(p, 'down');
    expect(p).toEqual({ step: 'A', octave: 3, alter: -1 }); // Ab3

    p = transposeSemitone(p, 'down');
    expect(p).toEqual({ step: 'G', octave: 3, alter: 0 }); // G3
  });

  it('transposes octave shifts without changing pitch spelling', () => {
    const fSharp = createPitch('F', 4, 1);
    const upOne = transposeOctave(fSharp, 1);
    expect(upOne).toEqual({ step: 'F', octave: 5, alter: 1 });

    const downTwo = transposeOctave(fSharp, -2);
    expect(downTwo).toEqual({ step: 'F', octave: 2, alter: 1 });
  });

  it('returns microtonal pitch (non-integer alter) unchanged without crashing', () => {
    const micro = createPitch('C', 4, 0.5);
    const up = transposeSemitone(micro, 'up');
    expect(up).toEqual({ step: 'C', octave: 4, alter: 0.5 });

    const down = transposeSemitone(micro, 'down');
    expect(down).toEqual({ step: 'C', octave: 4, alter: 0.5 });
  });
});
