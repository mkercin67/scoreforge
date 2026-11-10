import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../src/core/factory';
import { enterNote, pitchFromLetter, ScoreCursor } from '../../src/core/input';
import { NoteEvent, Score } from '../../src/core/model';
import { History } from '../../src/core/commands';

interface EditorState {
  score: Score;
  history: History;
  cursor: ScoreCursor | null;
  isInputMode: boolean;
  selectedEventId: string | null;
  lastEnteredPitch: any;
  error: string | null;
}

function createInitialState(score: Score): EditorState {
  const sId = score.parts[0]?.staves[0]?.id;
  const mId = score.measures[0]?.id;
  const vId = score.parts[0]?.staves[0]?.measures[mId]?.voices[0]?.id;
  return {
    score,
    history: new History(score),
    cursor: sId && mId && vId ? { staffId: sId, voiceId: vId, measureId: mId, tick: 0 } : null,
    isInputMode: false,
    selectedEventId: null,
    lastEnteredPitch: null,
    error: null,
  };
}

function handleToggleInputMode(state: EditorState): EditorState {
  const nextInputMode = !state.isInputMode;
  let nextCursor = state.cursor;
  if (nextInputMode && !nextCursor) {
    const sId = state.score.parts[0]?.staves[0]?.id;
    const mId = state.score.measures[0]?.id;
    const vId = state.score.parts[0]?.staves[0]?.measures[mId]?.voices[0]?.id;
    if (sId && mId && vId) {
      nextCursor = { staffId: sId, voiceId: vId, measureId: mId, tick: 0 };
    }
  }
  return {
    ...state,
    isInputMode: nextInputMode,
    cursor: nextCursor,
  };
}

function handleKeyAction(state: EditorState, code: string): EditorState {
  if (code === 'KeyN') {
    return handleToggleInputMode(state);
  }

  if (code === 'KeyC') {
    if (!state.cursor) {
      return { ...state, error: 'error.noCursor' };
    }

    const clef = state.score.parts[0]?.staves[0]?.clef ?? { sign: 'G' as const, line: 2 };
    const pitch = pitchFromLetter('C', state.lastEnteredPitch, clef, 0);
    const cmd = enterNote(state.cursor, { baseType: 'quarter', dots: 0, pitch });
    const nextScore = state.history.do(cmd);

    return {
      ...state,
      score: nextScore,
      cursor: { ...state.cursor, tick: state.cursor.tick + 960 },
      lastEnteredPitch: pitch,
      error: null,
    };
  }

  return state;
}

describe('Mouse click toggle and input mode integration', () => {
  it('New-dialog flow -> click toggle button -> KeyC inserts C5, identical to KeyN flow', () => {
    // Flow 1: Mouse toggle (handleToggleInputMode called directly by button click)
    const score1 = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 8,
    });
    let stateMouse = createInitialState(score1);
    stateMouse = handleToggleInputMode(stateMouse);
    expect(stateMouse.isInputMode).toBe(true);
    expect(stateMouse.cursor).not.toBeNull();

    stateMouse = handleKeyAction(stateMouse, 'KeyC');
    const m1EventsMouse = stateMouse.score.parts[0].staves[0].measures[score1.measures[0].id].voices[0].events;
    expect(m1EventsMouse[0].kind).toBe('note');
    expect((m1EventsMouse[0] as NoteEvent).pitches[0]).toEqual({ step: 'C', octave: 5, alter: 0 });

    // Flow 2: Keyboard toggle (KeyN)
    const score2 = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 8,
    });
    let stateKeyboard = createInitialState(score2);
    stateKeyboard = handleKeyAction(stateKeyboard, 'KeyN');
    expect(stateKeyboard.isInputMode).toBe(true);

    stateKeyboard = handleKeyAction(stateKeyboard, 'KeyC');
    const m1EventsKeyboard = stateKeyboard.score.parts[0].staves[0].measures[score2.measures[0].id].voices[0].events;
    expect(m1EventsKeyboard[0].kind).toBe('note');
    expect((m1EventsKeyboard[0] as NoteEvent).pitches[0]).toEqual({ step: 'C', octave: 5, alter: 0 });

    // Both flows produce identical pitch, octave and structure
    expect((m1EventsMouse[0] as NoteEvent).pitches).toEqual((m1EventsKeyboard[0] as NoteEvent).pitches);
  });

  it('toggleInputMode initializes cursor when cursor is null', () => {
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 4,
    });
    let state = createInitialState(score);
    state.cursor = null;

    state = handleToggleInputMode(state);
    expect(state.cursor).not.toBeNull();
    expect(state.cursor!.measureId).toBe(score.measures[0].id);
    expect(state.cursor!.tick).toBe(0);
  });

  it('shows error.noCursor if cursor is null when note is entered', () => {
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 4,
    });
    let state = createInitialState(score);
    state.cursor = null;

    state = handleKeyAction(state, 'KeyC');
    expect(state.error).toBe('error.noCursor');
  });
});
