import { describe, expect, it } from 'vitest';
import { durationTicks, measureTicks, PPQ } from '../../src/core/time';

describe('time calculations', () => {
  it('defines PPQ as 960 ticks per quarter note', () => {
    expect(PPQ).toBe(960);
  });

  describe('durationTicks', () => {
    it('calculates standard base durations correctly', () => {
      expect(durationTicks('whole')).toBe(3840);
      expect(durationTicks('half')).toBe(1920);
      expect(durationTicks('quarter')).toBe(960);
      expect(durationTicks('eighth')).toBe(480);
      expect(durationTicks('16th')).toBe(240);
      expect(durationTicks('32nd')).toBe(120);
    });

    it('calculates single and double dotted durations', () => {
      // Dotted quarter: 960 + 480 = 1440
      expect(durationTicks('quarter', 1)).toBe(1440);
      // Double-dotted quarter: 960 + 480 + 240 = 1680
      expect(durationTicks('quarter', 2)).toBe(1680);
      // Dotted half: 1920 + 960 = 2880
      expect(durationTicks('half', 1)).toBe(2880);
      // Dotted eighth: 480 + 240 = 720
      expect(durationTicks('eighth', 1)).toBe(720);
    });

    it('calculates tuplet durations (triplets, quintuplets)', () => {
      // Eighth triplet: 3 notes in space of 2 normal eighths (480 * 2 / 3 = 320 ticks)
      const tripletEighth = durationTicks('eighth', 0, { actual: 3, normal: 2 });
      expect(tripletEighth).toBe(320);
      expect(tripletEighth * 3).toBe(PPQ); // 3 triplet eighths = 1 quarter note

      // Quarter triplet: 3 notes in space of 2 normal quarters (960 * 2 / 3 = 640 ticks)
      const tripletQuarter = durationTicks('quarter', 0, { actual: 3, normal: 2 });
      expect(tripletQuarter).toBe(640);
      expect(tripletQuarter * 3).toBe(1920); // 3 triplet quarters = 1 half note

      // Sixteenth quintuplet: 5 in the space of 4 (240 * 4 / 5 = 192 ticks)
      const quintuplet16th = durationTicks('16th', 0, { actual: 5, normal: 4 });
      expect(quintuplet16th).toBe(192);
      expect(quintuplet16th * 5).toBe(PPQ);
    });
  });

  describe('measureTicks', () => {
    it('calculates measure duration in ticks for common time signatures', () => {
      expect(measureTicks({ num: 4, den: 4 })).toBe(3840);
      expect(measureTicks({ num: 3, den: 4 })).toBe(2880);
      expect(measureTicks({ num: 2, den: 4 })).toBe(1920);
      expect(measureTicks({ num: 6, den: 8 })).toBe(2880);
      expect(measureTicks({ num: 7, den: 8 })).toBe(3360);
      expect(measureTicks({ num: 2, den: 2 })).toBe(3840);
    });

    it('throws on non-positive time signature', () => {
      expect(() => measureTicks({ num: 0, den: 4 })).toThrow();
      expect(() => measureTicks({ num: 4, den: 0 })).toThrow();
      expect(() => measureTicks({ num: -1, den: 4 })).toThrow();
    });
  });
});
