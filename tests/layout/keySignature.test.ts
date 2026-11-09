import { describe, expect, it } from 'vitest';
import { Clef } from '../../src/core/model';
import { getKeySignatureAccidentals } from '../../src/layout/keySignature';

describe('key signature accidental positions', () => {
  const trebleClef: Clef = { sign: 'G', line: 2 };
  const bassClef: Clef = { sign: 'F', line: 4 };

  describe('Treble Clef', () => {
    it('positions 1, 2, 3 sharps correctly', () => {
      // 1 sharp (F# at y = 0.0)
      const sharp1 = getKeySignatureAccidentals(1, trebleClef);
      expect(sharp1.length).toBe(1);
      expect(sharp1[0].y).toBe(0.0);
      expect(sharp1[0].glyph).toBe('accidentalSharp');

      // 2 sharps (F# at y = 0.0, C# at y = 1.5)
      const sharp2 = getKeySignatureAccidentals(2, trebleClef);
      expect(sharp2.length).toBe(2);
      expect(sharp2.map((s) => s.y)).toEqual([0.0, 1.5]);

      // 3 sharps (F# at y = 0.0, C# at y = 1.5, G# at y = -0.5)
      const sharp3 = getKeySignatureAccidentals(3, trebleClef);
      expect(sharp3.length).toBe(3);
      expect(sharp3.map((s) => s.y)).toEqual([0.0, 1.5, -0.5]);
    });

    it('positions 1, 2, 3 flats correctly', () => {
      // 1 flat (Bb at y = 2.0)
      const flat1 = getKeySignatureAccidentals(-1, trebleClef);
      expect(flat1.length).toBe(1);
      expect(flat1[0].y).toBe(2.0);
      expect(flat1[0].glyph).toBe('accidentalFlat');

      // 2 flats (Bb at y = 2.0, Eb at y = 0.5)
      const flat2 = getKeySignatureAccidentals(-2, trebleClef);
      expect(flat2.length).toBe(2);
      expect(flat2.map((f) => f.y)).toEqual([2.0, 0.5]);

      // 3 flats (Bb at y = 2.0, Eb at y = 0.5, Ab at y = 2.5)
      const flat3 = getKeySignatureAccidentals(-3, trebleClef);
      expect(flat3.length).toBe(3);
      expect(flat3.map((f) => f.y)).toEqual([2.0, 0.5, 2.5]);
    });
  });

  describe('Bass Clef', () => {
    it('positions 1, 2, 3 sharps correctly', () => {
      // 1 sharp (F# at y = 1.0)
      const sharp1 = getKeySignatureAccidentals(1, bassClef);
      expect(sharp1.length).toBe(1);
      expect(sharp1[0].y).toBe(1.0);

      // 2 sharps (F# at y = 1.0, C# at y = 2.5)
      const sharp2 = getKeySignatureAccidentals(2, bassClef);
      expect(sharp2.length).toBe(2);
      expect(sharp2.map((s) => s.y)).toEqual([1.0, 2.5]);

      // 3 sharps (F# at y = 1.0, C# at y = 2.5, G# at y = 0.5)
      const sharp3 = getKeySignatureAccidentals(3, bassClef);
      expect(sharp3.length).toBe(3);
      expect(sharp3.map((s) => s.y)).toEqual([1.0, 2.5, 0.5]);
    });

    it('positions 1, 2, 3 flats correctly', () => {
      // 1 flat (Bb at y = 3.0)
      const flat1 = getKeySignatureAccidentals(-1, bassClef);
      expect(flat1.length).toBe(1);
      expect(flat1[0].y).toBe(3.0);

      // 2 flats (Bb at y = 3.0, Eb at y = 1.5)
      const flat2 = getKeySignatureAccidentals(-2, bassClef);
      expect(flat2.length).toBe(2);
      expect(flat2.map((f) => f.y)).toEqual([3.0, 1.5]);

      // 3 flats (Bb at y = 3.0, Eb at y = 1.5, Ab at y = 3.5)
      const flat3 = getKeySignatureAccidentals(-3, bassClef);
      expect(flat3.length).toBe(3);
      expect(flat3.map((f) => f.y)).toEqual([3.0, 1.5, 3.5]);
    });
  });
});
