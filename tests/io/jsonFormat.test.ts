import { describe, expect, it } from 'vitest';
import { createMeasure, createNote, createPart, createPitch, createScore } from '../../src/core/factory';
import { deserializeScore, migrations, serializeScore, ScoreForgeEnvelope } from '../../src/io/json';

describe('Milestone 5 File Format (src/io/json)', () => {
  it('serializes to native .sfscore envelope with app="scoreforge", savedAt ISO string, and score', () => {
    const score = createScore({ title: 'Envelope Test', composer: 'Test Composer' });
    const json = serializeScore(score, 2, true);
    const parsed = JSON.parse(json) as ScoreForgeEnvelope;

    expect(parsed.app).toBe('scoreforge');
    expect(typeof parsed.savedAt).toBe('string');
    expect(new Date(parsed.savedAt).toISOString()).toBe(parsed.savedAt);
    expect(parsed.score.meta.title).toBe('Envelope Test');
    expect(parsed.score.schemaVersion).toBe(1);
  });

  it('deserializeScore accepts both the envelope AND the old bare JSON format', () => {
    const score = createScore({ title: 'Bare Test' });
    score.measures.push(createMeasure());
    score.parts.push(createPart('Violin'));

    // 1. Bare JSON
    const bareJson = serializeScore(score, undefined, false);
    const fromBare = deserializeScore(bareJson);
    expect(fromBare.id).toBe(score.id);
    expect(fromBare.meta.title).toBe('Bare Test');

    // 2. Enveloped JSON
    const envelopeJson = serializeScore(score, undefined, true);
    const fromEnvelope = deserializeScore(envelopeJson);
    expect(fromEnvelope.id).toBe(score.id);
    expect(fromEnvelope.meta.title).toBe('Bare Test');
  });

  it('validates score on load: refuses overfull measures with a list of validation problems and never crashes', () => {
    const score = createScore({ title: 'Overfull Test' });
    const m = createMeasure({ num: 4, den: 4 });
    const part = createPart('Flute');
    score.measures.push(m);
    score.parts.push(part);

    // Overfull voice: two whole notes in 4/4 (7680 ticks > 3840 ticks)
    part.staves[0].measures[m.id] = {
      voices: [
        {
          id: 'v1',
          events: [
            createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'whole' }),
            createNote({ pitches: [createPitch('D', 4, 0)], baseType: 'whole' }),
          ],
        },
      ],
    };

    const json = serializeScore(score, undefined, true);
    expect(() => deserializeScore(json)).toThrow(/Validation failed|duration/i);
  });

  it('refuses unsupported or missing schemaVersion', () => {
    const bad1 = JSON.stringify({
      app: 'scoreforge',
      savedAt: new Date().toISOString(),
      score: { id: 'x', schemaVersion: 99, meta: { title: 'T' } },
    });
    expect(() => deserializeScore(bad1)).toThrow(/schemaVersion/i);

    const bad2 = JSON.stringify({ id: 'x', meta: { title: 'T' } });
    expect(() => deserializeScore(bad2)).toThrow(/schemaVersion/i);
  });

  it('handles bad JSON and truncated files safely without crashing', () => {
    expect(() => deserializeScore('{"app": "scoreforge", "score": {')).toThrow();
    expect(() => deserializeScore('not a json string')).toThrow();
    expect(() => deserializeScore('')).toThrow();
  });

  it('ignores unknown extra fields without corruption', () => {
    const score = createScore({ title: 'Extra Fields Test' });
    const raw = JSON.parse(serializeScore(score, undefined, true));
    raw.unknownRootField = 12345;
    raw.score.unknownScoreField = 'extra-data';

    const loaded = deserializeScore(JSON.stringify(raw));
    expect(loaded.id).toBe(score.id);
    expect(loaded.meta.title).toBe('Extra Fields Test');
  });

  it('preserves microtonal pitch (alter: 0.5) and overrides across envelope serialization', () => {
    const score = createScore({ title: 'Microtonal Test' });
    const m = createMeasure({ num: 4, den: 4 });
    const part = createPart('Cello');
    score.measures.push(m);
    score.parts.push(part);

    const note = createNote({
      pitches: [createPitch('F', 4, 0.5)],
      baseType: 'whole',
    });
    part.staves[0].measures[m.id] = { voices: [{ id: 'v1', events: [note] }] };
    score.overrides[note.id] = { dx: 2.25, dy: -1.5, scale: 1.2 };

    const json = serializeScore(score, undefined, true);
    const loaded = deserializeScore(json);

    const loadedNote = loaded.parts[0].staves[0].measures[m.id].voices[0].events[0];
    if (loadedNote.kind === 'note') {
      expect(loadedNote.pitches[0].alter).toBe(0.5);
    }
    expect(loaded.overrides[note.id]).toEqual({ dx: 2.25, dy: -1.5, scale: 1.2 });
  });

  it('exports migrations table keyed by schemaVersion', () => {
    expect(migrations).toBeDefined();
    expect(typeof migrations).toBe('object');
  });
});
