import { describe, expect, it } from 'vitest';
import {
  createMeasure,
  createNote,
  createPart,
  createPitch,
  createRest,
  createScore,
} from '../../src/core/factory';
import { Score } from '../../src/core/model';
import { validateScore } from '../../src/core/validate';

describe('validateScore', () => {
  it('returns no problems for a balanced, valid score', () => {
    const score = createScore();
    const measure = createMeasure({ num: 4, den: 4 }); // 3840 ticks
    const part = createPart('Violin');
    score.measures.push(measure);
    score.parts.push(part);

    // 4 quarter notes = 4 * 960 = 3840 ticks
    const staffMeasure = {
      voices: [
        {
          id: 'v1',
          events: [
            createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' }),
            createNote({ pitches: [createPitch('D', 4, 0)], baseType: 'quarter' }),
            createNote({ pitches: [createPitch('E', 4, 0)], baseType: 'quarter' }),
            createRest({ baseType: 'quarter' }),
          ],
        },
      ],
    };

    part.staves[0].measures[measure.id] = staffMeasure;

    const problems = validateScore(score);
    expect(problems).toEqual([]);
  });

  it('catches a short (underfull) measure', () => {
    const score = createScore();
    const measure = createMeasure({ num: 4, den: 4 }); // Expected: 3840 ticks
    const part = createPart('Flute');
    score.measures.push(measure);
    score.parts.push(part);

    // Only 3 quarter notes = 2880 ticks (< 3840 ticks)
    part.staves[0].measures[measure.id] = {
      voices: [
        {
          id: 'v1',
          events: [
            createNote({ pitches: [createPitch('C', 5, 0)], baseType: 'quarter' }),
            createNote({ pitches: [createPitch('D', 5, 0)], baseType: 'quarter' }),
            createNote({ pitches: [createPitch('E', 5, 0)], baseType: 'quarter' }),
          ],
        },
      ],
    };

    const problems = validateScore(score);
    expect(problems.length).toBe(1);
    expect(problems[0].code).toBe('measure-underfull');
    expect(problems[0].severity).toBe('error');
    expect(problems[0].message).toContain('short: 2880 ticks (expected 3840)');
  });

  it('catches an overfull measure', () => {
    const score = createScore();
    const measure = createMeasure({ num: 3, den: 4 }); // Expected: 2880 ticks
    const part = createPart('Clarinet');
    score.measures.push(measure);
    score.parts.push(part);

    // 4 quarter notes = 3840 ticks (> 2880 ticks)
    part.staves[0].measures[measure.id] = {
      voices: [
        {
          id: 'v1',
          events: [
            createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' }),
            createNote({ pitches: [createPitch('D', 4, 0)], baseType: 'quarter' }),
            createNote({ pitches: [createPitch('E', 4, 0)], baseType: 'quarter' }),
            createNote({ pitches: [createPitch('F', 4, 0)], baseType: 'quarter' }),
          ],
        },
      ],
    };

    const problems = validateScore(score);
    expect(problems.length).toBe(1);
    expect(problems[0].code).toBe('measure-overfull');
    expect(problems[0].severity).toBe('error');
    expect(problems[0].message).toContain('overfull: 3840 ticks (expected 2880)');
  });

  it('flags notes with empty pitch list', () => {
    const score = createScore();
    const measure = createMeasure({ num: 1, den: 4 });
    const part = createPart('Piano');
    score.measures.push(measure);
    score.parts.push(part);

    part.staves[0].measures[measure.id] = {
      voices: [
        {
          id: 'v1',
          events: [
            createNote({ pitches: [], baseType: 'quarter' }),
          ],
        },
      ],
    };

    const problems = validateScore(score);
    expect(problems.some((p) => p.code === 'empty-note-pitches')).toBe(true);
  });

  it('flags incorrect schemaVersion', () => {
    const score = createScore();
    // Simulate invalid schemaVersion
    const invalid = { ...score, schemaVersion: 2 } as unknown as Score;
    const problems = validateScore(invalid);
    expect(problems.some((p) => p.code === 'invalid-schema-version')).toBe(true);
  });
});
