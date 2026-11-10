import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../src/core/factory';
import { NoteEvent, Pitch, Score } from '../../src/core/model';
import { enterNote, pitchFromLetter, ScoreCursor } from '../../src/core/input';
import { History } from '../../src/core/commands';

function getLastNotePitchBeforeCursor(score: Score, cursor: ScoreCursor): Pitch | null {
  const staff = score.parts[0]?.staves.find((s) => s.id === cursor.staffId);
  if (!staff) return null;

  // Search backward from current measure
  const mIdx = score.measures.findIndex((m) => m.id === cursor.measureId);
  if (mIdx === -1) return null;

  for (let i = mIdx; i >= 0; i--) {
    const mDef = score.measures[i];
    const sm = staff.measures[mDef.id];
    const voice = sm?.voices.find((v) => v.id === cursor.voiceId) ?? sm?.voices[0];
    if (!voice) continue;

    let t = 0;
    const notesBefore: Pitch[] = [];
    for (const ev of voice.events) {
      if (i === mIdx && t >= cursor.tick) break;
      if (ev.kind === 'note' && (ev as NoteEvent).pitches.length > 0) {
        notesBefore.push((ev as NoteEvent).pitches[0]);
      }
      t += ev.duration;
    }

    if (notesBefore.length > 0) {
      return notesBefore[notesBefore.length - 1];
    }
  }

  return null;
}

describe('editorFlow note input sequence', () => {
  it('entering C D E F in sequence must produce C5 D5 E5 F5 (not F4)', () => {
    let score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 2,
    });
    const history = new History(score);

    const staffId = score.parts[0].staves[0].id;
    const mId = score.measures[0].id;
    const voiceId = score.parts[0].staves[0].measures[mId].voices[0].id;
    let cursor: ScoreCursor = { staffId, voiceId, measureId: mId, tick: 0 };

    const letters = ['C', 'D', 'E', 'F'];
    let lastEnteredPitch: Pitch | null = null;
    const enteredPitches: Pitch[] = [];

    for (const letter of letters) {
      // Rule: previous pitch is last entered note (or last note before cursor)
      const ref = lastEnteredPitch ?? getLastNotePitchBeforeCursor(score, cursor);
      const pitch = pitchFromLetter(letter, ref, { sign: 'G', line: 2 }, 0);
      enteredPitches.push(pitch);
      lastEnteredPitch = pitch;

      score = history.do(enterNote(cursor, { baseType: 'quarter', dots: 0, pitch }));
      cursor = { ...cursor, tick: cursor.tick + 960 };
    }

    expect(enteredPitches).toEqual([
      { step: 'C', octave: 5, alter: 0 },
      { step: 'D', octave: 5, alter: 0 },
      { step: 'E', octave: 5, alter: 0 },
      { step: 'F', octave: 5, alter: 0 },
    ]);
  });

  it('after undo, previous pitch is the last note before cursor in the voice', () => {
    let score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 2,
    });
    const history = new History(score);
    const staffId = score.parts[0].staves[0].id;
    const mId = score.measures[0].id;
    const voiceId = score.parts[0].staves[0].measures[mId].voices[0].id;
    let cursor: ScoreCursor = { staffId, voiceId, measureId: mId, tick: 0 };

    // Enter C5 and D5
    const pC = pitchFromLetter('C', null, { sign: 'G', line: 2 }, 0);
    score = history.do(enterNote(cursor, { baseType: 'quarter', dots: 0, pitch: pC }));
    cursor = { ...cursor, tick: 960 };

    const pD = pitchFromLetter('D', pC, { sign: 'G', line: 2 }, 0);
    score = history.do(enterNote(cursor, { baseType: 'quarter', dots: 0, pitch: pD }));
    cursor = { ...cursor, tick: 1920 };

    // Undo D5
    score = history.undo()!;
    cursor = { ...cursor, tick: 960 };

    // Pitch before cursor is C5
    const pitchBeforeCursor = getLastNotePitchBeforeCursor(score, cursor);
    expect(pitchBeforeCursor).toEqual({ step: 'C', octave: 5, alter: 0 });
  });
});
