import { describe, expect, it } from 'vitest';
import { createMeasure, createNote, createPart, createPitch, createRest, createScore } from '../../src/core/factory';
import { eventExists, nextEventId } from '../../src/core/selection';

describe('core selection navigation', () => {
  it('navigates next and previous events across measures on a staff', () => {
    const score = createScore();
    const m1 = createMeasure({ num: 4, den: 4 });
    const m2 = createMeasure({ num: 4, den: 4 });
    const part = createPart('Flute');
    score.measures = [m1, m2];
    score.parts = [part];

    const n1 = createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' });
    const n2 = createNote({ pitches: [createPitch('D', 4, 0)], baseType: 'quarter' });
    const r3 = createRest({ baseType: 'half' });

    part.staves[0].measures[m1.id] = { voices: [{ id: 'v1', events: [n1, n2] }] };
    part.staves[0].measures[m2.id] = { voices: [{ id: 'v2', events: [r3] }] };

    const staffId = part.staves[0].id;

    // From null selection, next picks first event
    expect(nextEventId(score, staffId, null, 'next')).toBe(n1.id);
    // From null selection, prev picks last event
    expect(nextEventId(score, staffId, null, 'prev')).toBe(r3.id);

    // Forward stepping across measure boundary
    expect(nextEventId(score, staffId, n1.id, 'next')).toBe(n2.id);
    expect(nextEventId(score, staffId, n2.id, 'next')).toBe(r3.id);
    // At end, stays at end
    expect(nextEventId(score, staffId, r3.id, 'next')).toBe(r3.id);

    // Backward stepping across measure boundary
    expect(nextEventId(score, staffId, r3.id, 'prev')).toBe(n2.id);
    expect(nextEventId(score, staffId, n2.id, 'prev')).toBe(n1.id);
    // At start, stays at start
    expect(nextEventId(score, staffId, n1.id, 'prev')).toBe(n1.id);
  });

  it('returns null when staff has no events', () => {
    const score = createScore();
    const m1 = createMeasure();
    const part = createPart('Piano');
    score.measures = [m1];
    score.parts = [part];

    expect(nextEventId(score, part.staves[0].id, null, 'next')).toBeNull();
  });

  it('eventExists verifies whether an event is in the score or cleared', () => {
    const score = createScore();
    const m = createMeasure();
    const part = createPart('Flute');
    score.measures = [m];
    score.parts = [part];

    const note = createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' });
    part.staves[0].measures[m.id] = { voices: [{ id: 'v1', events: [note] }] };

    expect(eventExists(score, note.id)).toBe(true);
    expect(eventExists(score, 'non-existent-id')).toBe(false);

    // Empty voice
    part.staves[0].measures[m.id].voices[0].events = [];
    expect(eventExists(score, note.id)).toBe(false);
  });
});
