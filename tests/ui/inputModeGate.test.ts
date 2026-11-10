import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../src/core/factory';
import { Score } from '../../src/core/model';
import { History } from '../../src/core/commands';
import { enterNote, pitchFromLetter, ScoreCursor } from '../../src/core/input';
import { mapKeyEvent } from '../../src/ui/keymap';

interface EditorState {
  score: Score;
  history: History;
  cursor: ScoreCursor | null;
  inputMode: boolean;
  statusHint: string | null;
}

function createTestEditor(): EditorState {
  const score = createEmptyScore({
    clef: { sign: 'G', line: 2 },
    keySig: 0,
    timeSig: { num: 4, den: 4 },
    measures: 8,
  });
  const staffId = score.parts[0].staves[0].id;
  const m1Id = score.measures[0].id;
  const v1Id = score.parts[0].staves[0].measures[m1Id].voices[0].id;
  return {
    score,
    history: new History(score),
    cursor: { staffId, voiceId: v1Id, measureId: m1Id, tick: 0 },
    inputMode: false,
    statusHint: null,
  };
}

function handleEditorKey(state: EditorState, code: string): EditorState {
  const action = mapKeyEvent({ code }, state.inputMode);

  if (action === 'toggle-note-input') {
    return { ...state, inputMode: !state.inputMode, statusHint: null };
  }

  if (action === 'exit-note-input') {
    return { ...state, inputMode: false, statusHint: null };
  }

  if (action === 'show-input-off-hint') {
    return { ...state, statusHint: 'status.inputOff' };
  }

  if (action && typeof action === 'object' && action.type === 'enter-pitch') {
    const clef = { sign: 'G' as const, line: 2 };
    const pitch = pitchFromLetter(action.letter, null, clef, 0);
    const nextScore = state.history.do(enterNote(state.cursor!, { baseType: 'quarter', dots: 0, pitch }));
    return {
      ...state,
      score: nextScore,
      cursor: { ...state.cursor!, tick: state.cursor!.tick + 960 },
      statusHint: null,
    };
  }

  return state;
}

describe('Input mode gating note entry', () => {
  it('fresh score -> KeyC (inputMode false) -> unchanged; KeyN -> KeyC -> note entered; KeyN again -> KeyC -> unchanged; button toggle twice -> unchanged; Esc -> unchanged', () => {
    let state = createTestEditor();
    const initialScoreJson = JSON.stringify(state.score);

    // 1. Fresh score with inputMode false -> KeyC must leave score unchanged
    state = handleEditorKey(state, 'KeyC');
    expect(JSON.stringify(state.score)).toBe(initialScoreJson);

    // 2. KeyN -> inputMode true -> KeyC -> note entered
    state = handleEditorKey(state, 'KeyN');
    expect(state.inputMode).toBe(true);
    state = handleEditorKey(state, 'KeyC');
    const scoreWithNoteJson = JSON.stringify(state.score);
    expect(scoreWithNoteJson).not.toBe(initialScoreJson);

    // 3. KeyN again -> inputMode false -> KeyC -> unchanged
    state = handleEditorKey(state, 'KeyN');
    expect(state.inputMode).toBe(false);
    state = handleEditorKey(state, 'KeyC');
    expect(JSON.stringify(state.score)).toBe(scoreWithNoteJson);

    // 4. Button toggle twice (off -> on -> off) -> KeyC -> unchanged
    state = { ...state, inputMode: !state.inputMode }; // on
    state = { ...state, inputMode: !state.inputMode }; // off
    expect(state.inputMode).toBe(false);
    state = handleEditorKey(state, 'KeyC');
    expect(JSON.stringify(state.score)).toBe(scoreWithNoteJson);

    // 5. Esc -> inputMode remains false -> KeyC -> unchanged
    state = handleEditorKey(state, 'Escape');
    expect(state.inputMode).toBe(false);
    state = handleEditorKey(state, 'KeyC');
    expect(JSON.stringify(state.score)).toBe(scoreWithNoteJson);
  });
});
