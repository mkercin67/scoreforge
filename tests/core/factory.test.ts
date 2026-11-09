import { describe, expect, it } from 'vitest';
import {
  createMeasure,
  createNote,
  createPart,
  createPitch,
  createRest,
  createScore,
  newId,
} from '../../src/core/factory';

describe('factory helpers', () => {
  it('generates unique non-empty IDs', () => {
    const id1 = newId();
    const id2 = newId();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('creates pitch objects with microtonal alteration support', () => {
    const p1 = createPitch('C', 4, 0);
    expect(p1).toEqual({ step: 'C', octave: 4, alter: 0 });

    const pMicro = createPitch('E', 4, 0.5); // quarter-tone sharp
    expect(pMicro).toEqual({ step: 'E', octave: 4, alter: 0.5 });
  });

  it('creates an empty Score with schemaVersion 1', () => {
    const score = createScore({ title: 'Sonata', composer: 'Beethoven' });
    expect(score.schemaVersion).toBe(1);
    expect(score.meta.title).toBe('Sonata');
    expect(score.meta.composer).toBe('Beethoven');
    expect(score.parts).toEqual([]);
    expect(score.measures).toEqual([]);
    expect(score.overrides).toEqual({});
  });

  it('creates a Part with a default staff', () => {
    const part = createPart('Flute');
    expect(part.name).toBe('Flute');
    expect(part.staves.length).toBe(1);
    expect(part.staves[0].clef).toEqual({ sign: 'G', line: 2 });
    expect(part.staves[0].measures).toEqual({});
  });

  it('creates a MeasureDef with default 4/4 and keySig 0', () => {
    const measure = createMeasure();
    expect(measure.timeSig).toEqual({ num: 4, den: 4 });
    expect(measure.keySig).toBe(0);
    expect(measure.tempo).toBeUndefined();

    const customMeasure = createMeasure({ num: 3, den: 4 }, -2, { bpm: 120, beatUnit: 4 });
    expect(customMeasure.timeSig).toEqual({ num: 3, den: 4 });
    expect(customMeasure.keySig).toBe(-2);
    expect(customMeasure.tempo).toEqual({ bpm: 120, beatUnit: 4 });
  });

  it('creates Note events with duration computed from rhythmic attributes', () => {
    const note = createNote({
      pitches: [createPitch('G', 4, 0)],
      baseType: 'eighth',
      dots: 1,
    });

    expect(note.kind).toBe('note');
    expect(note.duration).toBe(720); // 480 + 240
    expect(note.pitches).toEqual([{ step: 'G', octave: 4, alter: 0 }]);
    expect(note.articulations).toEqual([]);
  });

  it('creates Rest events with duration computed from rhythmic attributes', () => {
    const rest = createRest({ baseType: 'half', dots: 1 });
    expect(rest.kind).toBe('rest');
    expect(rest.duration).toBe(2880); // 1920 + 960
  });
});
