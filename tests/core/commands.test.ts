import { describe, expect, it } from 'vitest';
import {
  changePitch,
  deleteEvent,
  History,
  insertNote,
  setOverride,
  setTimeSig,
} from '../../src/core/commands';
import {
  createMeasure,
  createNote,
  createPart,
  createPitch,
  createRest,
  createScore,
} from '../../src/core/factory';

describe('commands and History', () => {
  it('manages undo/redo sequences with History', () => {
    const score = createScore({ title: 'Test Score' });
    const measure = createMeasure();
    const part = createPart('Violin');
    score.measures.push(measure);
    score.parts.push(part);

    const history = new History(score);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // Command 1: Insert first note
    const note1 = createNote({
      pitches: [createPitch('C', 4, 0)],
      baseType: 'quarter',
    });
    history.do(
      insertNote({
        partId: part.id,
        measureId: measure.id,
        event: note1,
      })
    );

    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    const scoreAfterNote1 = history.score;
    const events1 = scoreAfterNote1.parts[0].staves[0].measures[measure.id].voices[0].events;
    expect(events1.length).toBe(1);
    expect(events1[0].id).toBe(note1.id);

    // Command 2: Insert second note
    const note2 = createNote({
      pitches: [createPitch('D', 4, 0)],
      baseType: 'quarter',
    });
    history.do(
      insertNote({
        partId: part.id,
        measureId: measure.id,
        event: note2,
      })
    );

    const scoreAfterNote2 = history.score;
    const events2 = scoreAfterNote2.parts[0].staves[0].measures[measure.id].voices[0].events;
    expect(events2.length).toBe(2);

    // Undo Command 2
    const undone2 = history.undo();
    expect(undone2).toBeDefined();
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);
    expect(history.score.parts[0].staves[0].measures[measure.id].voices[0].events.length).toBe(1);

    // Redo Command 2
    const redone2 = history.redo();
    expect(redone2).toBeDefined();
    expect(history.canRedo()).toBe(false);
    expect(history.score.parts[0].staves[0].measures[measure.id].voices[0].events.length).toBe(2);

    // Undo both commands
    history.undo();
    history.undo();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
    expect(
      history.score.parts[0].staves[0].measures[measure.id]?.voices[0]?.events.length ?? 0
    ).toBe(0);

    // Branching history: new command clears redo
    history.do(
      insertNote({
        partId: part.id,
        measureId: measure.id,
        event: note2,
      })
    );
    expect(history.canRedo()).toBe(false);
  });

  it('supports insertNote at specific index', () => {
    const score = createScore();
    const measure = createMeasure();
    const part = createPart('Cello');
    score.measures.push(measure);
    score.parts.push(part);

    const noteA = createNote({ pitches: [createPitch('A', 3, 0)] });
    const noteB = createNote({ pitches: [createPitch('B', 3, 0)] });
    const noteBetween = createNote({ pitches: [createPitch('C', 4, 0)] });

    let current = insertNote({ partId: part.id, measureId: measure.id, event: noteA }).apply(score);
    current = insertNote({ partId: part.id, measureId: measure.id, event: noteB }).apply(current);
    // Insert at index 1 (between noteA and noteB)
    current = insertNote({
      partId: part.id,
      measureId: measure.id,
      event: noteBetween,
      index: 1,
    }).apply(current);

    const events = current.parts[0].staves[0].measures[measure.id].voices[0].events;
    expect(events.map((e) => e.id)).toEqual([noteA.id, noteBetween.id, noteB.id]);
  });

  it('supports deleteEvent and cleans associated overrides', () => {
    const score = createScore();
    const measure = createMeasure();
    const part = createPart('Flute');
    score.measures.push(measure);
    score.parts.push(part);

    const note = createNote({ pitches: [createPitch('G', 5, 0)] });
    const rest = createRest({ baseType: 'quarter' });

    let current = insertNote({ partId: part.id, measureId: measure.id, event: note }).apply(score);
    current = insertNote({ partId: part.id, measureId: measure.id, event: rest }).apply(current);
    current = setOverride(note.id, { dx: 1.5, dy: -0.5 }).apply(current);

    expect(current.overrides[note.id]).toBeDefined();

    current = deleteEvent(note.id).apply(current);

    const events = current.parts[0].staves[0].measures[measure.id].voices[0].events;
    expect(events.length).toBe(1);
    expect(events[0].id).toBe(rest.id);
    expect(current.overrides[note.id]).toBeUndefined();
  });

  it('supports changePitch for single note and chords', () => {
    const score = createScore();
    const measure = createMeasure();
    const part = createPart('Piano');
    score.measures.push(measure);
    score.parts.push(part);

    const note = createNote({ pitches: [createPitch('C', 4, 0)] });
    let current = insertNote({ partId: part.id, measureId: measure.id, event: note }).apply(score);

    // Change to microtonal chord: C4 + E4 quarter-tone sharp (alter: 0.5)
    const newPitches = [createPitch('C', 4, 0), createPitch('E', 4, 0.5)];
    current = changePitch(note.id, newPitches).apply(current);

    const updatedNote = current.parts[0].staves[0].measures[measure.id].voices[0].events[0];
    if (updatedNote.kind === 'note') {
      expect(updatedNote.pitches).toEqual(newPitches);
    } else {
      expect.fail('Expected note event');
    }
  });

  it('supports setTimeSig', () => {
    const score = createScore();
    const measure = createMeasure({ num: 4, den: 4 });
    score.measures.push(measure);

    const current = setTimeSig(measure.id, { num: 3, den: 4 }).apply(score);
    expect(current.measures[0].timeSig).toEqual({ num: 3, den: 4 });
  });

  it('supports setOverride to update and remove overrides', () => {
    const score = createScore();
    const elemId = 'elem-1';

    let current = setOverride(elemId, { dx: 2, dy: 1 }).apply(score);
    expect(current.overrides[elemId]).toEqual({ dx: 2, dy: 1 });

    current = setOverride(elemId, { scale: 0.8 }).apply(current);
    expect(current.overrides[elemId]).toEqual({ dx: 2, dy: 1, scale: 0.8 });

    current = setOverride(elemId, undefined).apply(current);
    expect(current.overrides[elemId]).toBeUndefined();
  });

  it('undo/redo over at least 3 different commands in sequence', () => {
    const score = createScore({ title: 'Undo/Redo 3 Commands' });
    const measure = createMeasure({ num: 4, den: 4 });
    const part = createPart('Flute');
    score.measures.push(measure);
    score.parts.push(part);

    const history = new History(score);
    const note = createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' });

    // 1. insertNote
    history.do(insertNote({ partId: part.id, measureId: measure.id, event: note }));
    expect(history.score.parts[0].staves[0].measures[measure.id].voices[0].events.length).toBe(1);

    // 2. changePitch
    history.do(changePitch(note.id, [createPitch('G', 4, 1)]));
    const noteAfterPitch = history.score.parts[0].staves[0].measures[measure.id].voices[0].events[0];
    if (noteAfterPitch.kind === 'note') {
      expect(noteAfterPitch.pitches[0].step).toBe('G');
    }

    // 3. setOverride
    history.do(setOverride(note.id, { dx: 2.5, dy: -1 }));
    expect(history.score.overrides[note.id]).toEqual({ dx: 2.5, dy: -1 });

    // 4. setTimeSig (4th different command)
    history.do(setTimeSig(measure.id, { num: 3, den: 4 }));
    expect(history.score.measures[0].timeSig).toEqual({ num: 3, den: 4 });

    // Step-by-step undo
    history.undo(); // undo setTimeSig
    expect(history.score.measures[0].timeSig).toEqual({ num: 4, den: 4 });
    expect(history.score.overrides[note.id]).toEqual({ dx: 2.5, dy: -1 });

    history.undo(); // undo setOverride
    expect(history.score.overrides[note.id]).toBeUndefined();

    history.undo(); // undo changePitch
    const noteBack = history.score.parts[0].staves[0].measures[measure.id].voices[0].events[0];
    if (noteBack.kind === 'note') {
      expect(noteBack.pitches[0].step).toBe('C');
    }

    history.undo(); // undo insertNote
    expect(history.score.parts[0].staves[0].measures[measure.id]).toBeUndefined();
    expect(history.canUndo()).toBe(false);

    // Step-by-step redo
    history.redo(); // redo insertNote
    expect(history.score.parts[0].staves[0].measures[measure.id].voices[0].events.length).toBe(1);

    history.redo(); // redo changePitch
    const noteRedone = history.score.parts[0].staves[0].measures[measure.id].voices[0].events[0];
    if (noteRedone.kind === 'note') {
      expect(noteRedone.pitches[0].step).toBe('G');
    }

    history.redo(); // redo setOverride
    expect(history.score.overrides[note.id]).toEqual({ dx: 2.5, dy: -1 });

    history.redo(); // redo setTimeSig
    expect(history.score.measures[0].timeSig).toEqual({ num: 3, den: 4 });
    expect(history.canRedo()).toBe(false);
  });
});
