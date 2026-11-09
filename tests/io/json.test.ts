import { describe, expect, it } from 'vitest';
import { setOverride } from '../../src/core/commands';
import {
  createMeasure,
  createNote,
  createPart,
  createPitch,
  createRest,
  createScore,
} from '../../src/core/factory';
import { deserializeScore, serializeScore } from '../../src/io/json';

describe('JSON serialization and deserialization', () => {
  it('performs lossless round-trip equality on complete score', () => {
    const score = createScore({ title: 'Microtonal Etude', composer: 'Contemporary Composer' });
    const measure = createMeasure({ num: 4, den: 4 }, 0, { bpm: 90, beatUnit: 4 });
    const part = createPart('Chamber Ensemble');
    score.measures.push(measure);
    score.parts.push(part);

    const note1 = createNote({
      pitches: [createPitch('C', 4, 0)],
      baseType: 'half',
      dynamic: 'p',
    });

    const note2 = createNote({
      pitches: [createPitch('D', 4, 1)], // sharp
      baseType: 'quarter',
      dots: 1,
    });

    const rest = createRest({ baseType: 'eighth' });

    part.staves[0].measures[measure.id] = {
      voices: [
        {
          id: 'voice-1',
          events: [note1, note2, rest],
        },
      ],
    };

    score.overrides[note1.id] = { dx: 1.5, dy: -2.0, scale: 1.1 };

    const serialized = serializeScore(score);
    const deserialized = deserializeScore(serialized);

    expect(deserialized).toEqual(score);
    expect(deserialized.schemaVersion).toBe(1);
    expect(deserialized.overrides[note1.id]).toEqual({ dx: 1.5, dy: -2.0, scale: 1.1 });
  });

  it('setOverride sets and updates dx/dy, and the override survives a JSON round-trip', () => {
    const score = createScore();
    const elemId = 'note-element-123';

    // 1. Set initial override
    let current = setOverride(elemId, { dx: 1.25, dy: -3.5 }).apply(score);
    expect(current.overrides[elemId]).toEqual({ dx: 1.25, dy: -3.5 });

    // 2. Update dx/dy
    current = setOverride(elemId, { dx: 2.0, dy: -4.0, scale: 1.2 }).apply(current);
    expect(current.overrides[elemId]).toEqual({ dx: 2.0, dy: -4.0, scale: 1.2 });

    // 3. Round-trip through JSON
    const json = serializeScore(current);
    const roundTrip = deserializeScore(json);

    expect(roundTrip.overrides[elemId]).toEqual({ dx: 2.0, dy: -4.0, scale: 1.2 });
    expect(roundTrip.overrides[elemId].dx).toBe(2.0);
    expect(roundTrip.overrides[elemId].dy).toBe(-4.0);
  });

  it('preserves microtonal pitch (alter: 0.5) across round-trip', () => {
    const score = createScore({ title: 'Microtonal Test' });
    const measure = createMeasure();
    const part = createPart('Microtonal Instrument');
    score.measures.push(measure);
    score.parts.push(part);

    // Quarter-tone sharp: alter = 0.5; three-quarter tone flat: alter = -1.5
    const microPitch1 = createPitch('E', 4, 0.5);
    const microPitch2 = createPitch('B', 4, -1.5);
    const note = createNote({
      pitches: [microPitch1, microPitch2],
      baseType: 'whole',
    });

    part.staves[0].measures[measure.id] = {
      voices: [{ id: 'v1', events: [note] }],
    };

    const json = serializeScore(score);
    const parsed = deserializeScore(json);

    const parsedNote = parsed.parts[0].staves[0].measures[measure.id].voices[0].events[0];
    if (parsedNote.kind === 'note') {
      expect(parsedNote.pitches[0].alter).toBe(0.5);
      expect(parsedNote.pitches[1].alter).toBe(-1.5);
    } else {
      expect.fail('Expected note event');
    }
  });

  it('preserves dotted and tuplet durations across round-trip', () => {
    const score = createScore();
    const measure = createMeasure();
    const part = createPart();
    score.measures.push(measure);
    score.parts.push(part);

    const dottedNote = createNote({
      pitches: [createPitch('G', 4, 0)],
      baseType: 'quarter',
      dots: 1, // 1440 ticks
    });

    const tupletNote = createNote({
      pitches: [createPitch('A', 4, 0)],
      baseType: 'eighth',
      dots: 0,
      tuplet: { actual: 3, normal: 2 }, // 320 ticks
    });

    part.staves[0].measures[measure.id] = {
      voices: [{ id: 'v1', events: [dottedNote, tupletNote] }],
    };

    const json = serializeScore(score);
    const roundTrip = deserializeScore(json);

    const events = roundTrip.parts[0].staves[0].measures[measure.id].voices[0].events;
    expect(events[0].duration).toBe(1440);
    expect(events[0].dots).toBe(1);
    expect(events[1].duration).toBe(320);
    expect(events[1].tuplet).toEqual({ actual: 3, normal: 2 });
  });

  it('throws an error when schemaVersion is missing or unsupported', () => {
    const invalidVersion = JSON.stringify({
      schemaVersion: 99,
      id: 'abc',
      meta: {},
      parts: [],
      measures: [],
      overrides: {},
    });
    expect(() => deserializeScore(invalidVersion)).toThrow(/schemaVersion/);

    const missingVersion = JSON.stringify({
      id: 'abc',
      meta: {},
    });
    expect(() => deserializeScore(missingVersion)).toThrow(/schemaVersion/);
  });

  it('throws on non-object JSON', () => {
    expect(() => deserializeScore('"a string"')).toThrow();
    expect(() => deserializeScore('null')).toThrow();
  });
});
