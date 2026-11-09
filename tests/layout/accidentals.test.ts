import { describe, expect, it, vi } from 'vitest';
import { MeasureAccidentalTracker } from '../../src/layout/accidentals';

describe('MeasureAccidentalTracker', () => {
  it('manages accidental logic across one measure (repeat, cancel with natural, key-signature-covered)', () => {
    // Key signature G major (1 sharp: F#)
    const tracker = new MeasureAccidentalTracker(1);

    // 1. F#4 is covered by key signature -> no accidental needed
    expect(tracker.processPitch({ step: 'F', octave: 4, alter: 1 })).toBeNull();

    // 2. Repeat of F#4 in same measure -> no accidental needed
    expect(tracker.processPitch({ step: 'F', octave: 4, alter: 1 })).toBeNull();

    // 3. F4 natural cancels the sharp with a natural sign
    expect(tracker.processPitch({ step: 'F', octave: 4, alter: 0 })).toBe('accidentalNatural');

    // 4. Repeated F4 natural in same measure -> already natural, no accidental
    expect(tracker.processPitch({ step: 'F', octave: 4, alter: 0 })).toBeNull();

    // 5. Subsequent F#4 restores the sharp
    expect(tracker.processPitch({ step: 'F', octave: 4, alter: 1 })).toBe('accidentalSharp');

    // 6. C major pitch in same measure: C#4 requires sharp
    expect(tracker.processPitch({ step: 'C', octave: 4, alter: 1 })).toBe('accidentalSharp');

    // 7. Repeated C#4 requires no accidental
    expect(tracker.processPitch({ step: 'C', octave: 4, alter: 1 })).toBeNull();
  });

  it('handles microtonal pitch by logging a dev warning and returning null', () => {
    const tracker = new MeasureAccidentalTracker(0);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const glyph = tracker.processPitch({ step: 'E', octave: 4, alter: 0.5 });
    expect(glyph).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Microtonal accidental not yet supported')
    );

    warnSpy.mockRestore();
  });
});
