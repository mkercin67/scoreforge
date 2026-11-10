import { describe, expect, it } from 'vitest';
import {
  advanceCursor,
  appendMeasure,
  enterNote,
  enterRest,
  moveCursor,
  pitchFromLetter,
  planEnter,
  restsForSpan,
  snapCursor,
} from '../../src/core/input';
import { createEmptyScore, createNote, createRest } from '../../src/core/factory';
import { durationTicks, measureTicks, PPQ } from '../../src/core/time';
import { validateScore } from '../../src/core/validate';
import { BaseDurationType, PitchStep } from '../../src/core/model';

describe('src/core/input', () => {
  describe('restsForSpan', () => {
    it('returns wholeMeasure for empty 4/4 measure', () => {
      expect(restsForSpan(0, 3840, 3840)).toEqual(['wholeMeasure']);
    });

    it('matches 4/4 prompt examples', () => {
      // offset 960 span 2880 -> quarter, half
      expect(restsForSpan(960, 2880, 3840)).toEqual(['quarter', 'half']);
      // offset 1440 span 2400 -> eighth, half
      expect(restsForSpan(1440, 2400, 3840)).toEqual(['eighth', 'half']);
      // offset 3360 span 480 -> eighth
      expect(restsForSpan(3360, 480, 3840)).toEqual(['eighth']);
      // offset 0 span 3840 -> wholeMeasure
      expect(restsForSpan(0, 3840, 3840)).toEqual(['wholeMeasure']);
    });

    it('handles 3/4 measures correctly', () => {
      const mLen = measureTicks({ num: 3, den: 4 }); // 2880
      // Empty 3/4 measure
      expect(restsForSpan(0, mLen, mLen)).toEqual(['wholeMeasure']);
      // After a quarter note (960 ticks at offset 960), 960 % 1920 !== 0, so greedy picks quarter, then quarter
      expect(restsForSpan(960, 1920, mLen)).toEqual(['quarter', 'quarter']);
      // After two quarter notes (1920 ticks), remaining 960 ticks (quarter rest)
      expect(restsForSpan(1920, 960, mLen)).toEqual(['quarter']);
    });

    it('handles 6/8 measures correctly', () => {
      const mLen = measureTicks({ num: 6, den: 8 }); // 2880
      expect(restsForSpan(0, mLen, mLen)).toEqual(['wholeMeasure']);
      // After an eighth (480), remaining 2400 ticks -> [half, eighth] (at offset 480: 480 % 1920 != 0, so quarter (960) -> offset 1440...)
      const rests = restsForSpan(480, 2400, mLen);
      const total = rests.reduce((sum, r) => sum + (r === 'wholeMeasure' ? mLen : durationTicks(r, 0)), 0);
      expect(total).toBe(2400);
    });

    it('handles 2/4 measures correctly', () => {
      const mLen = measureTicks({ num: 2, den: 4 }); // 1920
      expect(restsForSpan(0, mLen, mLen)).toEqual(['wholeMeasure']);
      // After eighth (480), remaining 1440 -> [eighth, quarter, quarter] or [eighth, half]
      const rests = restsForSpan(480, 1440, mLen);
      const total = rests.reduce((sum, r) => sum + (r === 'wholeMeasure' ? mLen : durationTicks(r, 0)), 0);
      expect(total).toBe(1440);
    });
  });

  describe('planEnter and enterNote / enterRest', () => {
    it('quarter into empty 4/4 measure -> quarter + quarter rest + half rest', () => {
      const score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 0,
        timeSig: { num: 4, den: 4 },
        measures: 1,
      });
      const staffId = score.parts[0].staves[0].id;
      const mId = score.measures[0].id;
      const vId = score.parts[0].staves[0].measures[mId].voices[0].id;

      const plan = planEnter(
        score,
        { staffId, voiceId: vId, measureId: mId, tick: 0 },
        { kind: 'note', baseType: 'quarter', dots: 0, pitch: { step: 'C', octave: 4, alter: 0 } }
      );

      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.newEvent.duration).toBe(PPQ);
        // Remainder fills 2880 ticks at offset 960 -> quarter (960) + half (1920)
        expect(plan.remainderRests).toHaveLength(2);
        expect(plan.remainderRests[0].baseType).toBe('quarter');
        expect(plan.remainderRests[1].baseType).toBe('half');
      }

      // Apply via enterNote
      const updated = enterNote(
        { staffId, voiceId: vId, measureId: mId, tick: 0 },
        { baseType: 'quarter', pitch: { step: 'C', octave: 4, alter: 0 } }
      ).apply(score);

      const events = updated.parts[0].staves[0].measures[mId].voices[0].events;
      expect(events).toHaveLength(3);
      expect(events[0].kind).toBe('note');
      expect(events[0].duration).toBe(PPQ);
      expect(events[1].kind).toBe('rest');
      expect(events[1].duration).toBe(PPQ);
      expect(events[2].kind).toBe('rest');
      expect(events[2].duration).toBe(PPQ * 2);
      expect(validateScore(updated)).toHaveLength(0);
    });

    it('note longer than remaining space -> rejected, score unchanged', () => {
      const score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 0,
        timeSig: { num: 4, den: 4 },
        measures: 1,
      });
      const staffId = score.parts[0].staves[0].id;
      const mId = score.measures[0].id;
      const vId = score.parts[0].staves[0].measures[mId].voices[0].id;

      // Half note at tick 2880 (only 960 ticks remain)
      const plan = planEnter(
        score,
        { staffId, voiceId: vId, measureId: mId, tick: 2880 },
        { kind: 'note', baseType: 'half', dots: 0, pitch: { step: 'E', octave: 4, alter: 0 } }
      );

      expect(plan.ok).toBe(false);
      if (!plan.ok) {
        expect(plan.reason).toBe('doesNotFit');
      }

      const unchanged = enterNote(
        { staffId, voiceId: vId, measureId: mId, tick: 2880 },
        { baseType: 'half', pitch: { step: 'E', octave: 4, alter: 0 } }
      ).apply(score);

      expect(unchanged).toBe(score);
    });

    it('entering over a dotted quarter with a quarter -> quarter + eighth rest', () => {
      // Setup score with dotted quarter (1440) + eighth (480) + half (1920) = 3840
      const score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 0,
        timeSig: { num: 4, den: 4 },
        measures: 1,
      });
      const staffId = score.parts[0].staves[0].id;
      const mId = score.measures[0].id;
      const vId = score.parts[0].staves[0].measures[mId].voices[0].id;

      // Replace with [dotted quarter, eighth, half]
      score.parts[0].staves[0].measures[mId].voices[0].events = [
        createNote({ baseType: 'quarter', dots: 1, pitches: [{ step: 'C', octave: 4, alter: 0 }] }),
        createNote({ baseType: 'eighth', dots: 0, pitches: [{ step: 'D', octave: 4, alter: 0 }] }),
        createRest({ baseType: 'half', dots: 0 }),
      ];

      // Enter a quarter note (960) at tick 0
      const updated = enterNote(
        { staffId, voiceId: vId, measureId: mId, tick: 0 },
        { baseType: 'quarter', pitch: { step: 'E', octave: 4, alter: 0 } }
      ).apply(score);

      const events = updated.parts[0].staves[0].measures[mId].voices[0].events;
      // Dotted quarter was 1440 ticks. Quarter takes 960, remainder is 480 (eighth rest).
      // Next events (eighth and half) were untouched because they start at 1440 and 1920 >= 960.
      expect(events[0].kind).toBe('note');
      expect(events[0].duration).toBe(960);
      expect(events[1].kind).toBe('rest');
      expect(events[1].duration).toBe(480);
      expect(events[2].kind).toBe('note');
      expect(events[2].duration).toBe(480);
      expect(events[3].kind).toBe('rest');
      expect(events[3].duration).toBe(1920);
      expect(validateScore(updated)).toHaveLength(0);
    });

    it('entering a long note over several shorter ones removes them', () => {
      const score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 0,
        timeSig: { num: 4, den: 4 },
        measures: 1,
      });
      const staffId = score.parts[0].staves[0].id;
      const mId = score.measures[0].id;
      const vId = score.parts[0].staves[0].measures[mId].voices[0].id;

      // Four quarter notes
      score.parts[0].staves[0].measures[mId].voices[0].events = [
        createNote({ baseType: 'quarter', dots: 0, pitches: [{ step: 'C', octave: 4, alter: 0 }] }),
        createNote({ baseType: 'quarter', dots: 0, pitches: [{ step: 'D', octave: 4, alter: 0 }] }),
        createNote({ baseType: 'quarter', dots: 0, pitches: [{ step: 'E', octave: 4, alter: 0 }] }),
        createNote({ baseType: 'quarter', dots: 0, pitches: [{ step: 'F', octave: 4, alter: 0 }] }),
      ];

      // Enter a whole note covering the whole measure
      const updated = enterNote(
        { staffId, voiceId: vId, measureId: mId, tick: 0 },
        { baseType: 'whole', pitch: { step: 'G', octave: 4, alter: 0 } }
      ).apply(score);

      const events = updated.parts[0].staves[0].measures[mId].voices[0].events;
      expect(events).toHaveLength(1);
      expect(events[0].duration).toBe(3840);
      expect(validateScore(updated)).toHaveLength(0);
    });

    it('property test: after 200 random valid entries validateScore returns no problems', () => {
      let score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 1, // G major
        timeSig: { num: 4, den: 4 },
        measures: 4,
      });

      const staffId = score.parts[0].staves[0].id;
      const mLength = 3840;
      const availableDurations: { baseType: BaseDurationType; dots: number }[] = [
        { baseType: 'whole', dots: 0 },
        { baseType: 'half', dots: 0 },
        { baseType: 'half', dots: 1 },
        { baseType: 'quarter', dots: 0 },
        { baseType: 'quarter', dots: 1 },
        { baseType: 'eighth', dots: 0 },
        { baseType: '16th', dots: 0 },
      ];
      const steps: PitchStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

      for (let i = 0; i < 200; i++) {
        const mIdx = Math.floor(Math.random() * score.measures.length);
        const mDef = score.measures[mIdx];
        const voice = score.parts[0].staves[0].measures[mDef.id].voices[0];

        // Pick random existing event start as cursor tick
        const eventTicks: number[] = [0];
        let runningTick = 0;
        for (const ev of voice.events) {
          eventTicks.push(runningTick);
          runningTick += ev.duration;
        }
        const cursorTick = eventTicks[Math.floor(Math.random() * (eventTicks.length - 1))];

        const durChoice = availableDurations[Math.floor(Math.random() * availableDurations.length)];
        const dur = durationTicks(durChoice.baseType, durChoice.dots);

        if (cursorTick + dur <= mLength) {
          const isNote = Math.random() > 0.3;
          const step = steps[Math.floor(Math.random() * steps.length)];
          const pitch = pitchFromLetter(step, null, { sign: 'G', line: 2 }, mDef.keySig);

          const cmd = isNote
            ? enterNote(
                { staffId, voiceId: voice.id, measureId: mDef.id, tick: cursorTick },
                { baseType: durChoice.baseType, dots: durChoice.dots, pitch }
              )
            : enterRest(
                { staffId, voiceId: voice.id, measureId: mDef.id, tick: cursorTick },
                { baseType: durChoice.baseType, dots: durChoice.dots }
              );

          score = cmd.apply(score);
          const problems = validateScore(score);
          expect(problems).toHaveLength(0);
        }
      }
    });
  });

  describe('advanceCursor and appendMeasure', () => {
    it('advanceCursor advances within measure and into next measure', () => {
      const score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 0,
        timeSig: { num: 4, den: 4 },
        measures: 2,
      });
      const staffId = score.parts[0].staves[0].id;
      const m1 = score.measures[0].id;
      const m2 = score.measures[1].id;
      const v1 = score.parts[0].staves[0].measures[m1].voices[0].id;

      const c0 = { staffId, voiceId: v1, measureId: m1, tick: 0 };
      const c1 = advanceCursor(score, c0, PPQ);
      expect(c1.tick).toBe(PPQ);
      expect(c1.measureId).toBe(m1);

      // Advance past measure end (3840 ticks) -> moves to tick 0 of measure 2
      const cEnd = { staffId, voiceId: v1, measureId: m1, tick: 2880 };
      const cNext = advanceCursor(score, cEnd, PPQ);
      expect(cNext.measureId).toBe(m2);
      expect(cNext.tick).toBe(0);

      // Advance at last measure end stays at mLength
      const cLast = { staffId, voiceId: v1, measureId: m2, tick: 2880 };
      const cOver = advanceCursor(score, cLast, PPQ);
      expect(cOver.measureId).toBe(m2);
      expect(cOver.tick).toBe(3840);
    });

    it('appendMeasure copies timeSig and keySig of last measure with wholeMeasure rest', () => {
      let score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 2, // D major
        timeSig: { num: 3, den: 4 },
        measures: 1,
      });

      const cmd = appendMeasure();
      score = cmd.apply(score);

      expect(score.measures).toHaveLength(2);
      const m2 = score.measures[1];
      expect(m2.timeSig).toEqual({ num: 3, den: 4 });
      expect(m2.keySig).toBe(2);

      const staff = score.parts[0].staves[0];
      const sm2 = staff.measures[m2.id];
      expect(sm2.voices[0].events).toHaveLength(1);
      const rest = sm2.voices[0].events[0];
      expect(rest.kind).toBe('rest');
      expect((rest as any).wholeMeasure).toBe(true);
      expect(rest.duration).toBe(measureTicks({ num: 3, den: 4 }));
      expect(validateScore(score)).toHaveLength(0);
    });
  });

  describe('moveCursor and snapCursor', () => {
    it('moves cursor between event starts across measures', () => {
      const score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 0,
        timeSig: { num: 4, den: 4 },
        measures: 2,
      });
      const staffId = score.parts[0].staves[0].id;
      const m1 = score.measures[0].id;
      const m2 = score.measures[1].id;
      const v1 = score.parts[0].staves[0].measures[m1].voices[0].id;

      // Put 2 half rests in measure 1, 1 whole rest in measure 2
      score.parts[0].staves[0].measures[m1].voices[0].events = [
        createRest({ baseType: 'half' }),
        createRest({ baseType: 'half' }),
      ];

      const c0 = { staffId, voiceId: v1, measureId: m1, tick: 0 };
      const cNext1 = moveCursor(score, c0, 'next');
      expect(cNext1.measureId).toBe(m1);
      expect(cNext1.tick).toBe(1920);

      const cNext2 = moveCursor(score, cNext1, 'next');
      expect(cNext2.measureId).toBe(m2);
      expect(cNext2.tick).toBe(0);

      const cPrev = moveCursor(score, cNext2, 'prev');
      expect(cPrev.measureId).toBe(m1);
      expect(cPrev.tick).toBe(1920);
    });

    it('snapCursor snaps to previous event start', () => {
      const score = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 0,
        timeSig: { num: 4, den: 4 },
        measures: 1,
      });
      const staffId = score.parts[0].staves[0].id;
      const m1 = score.measures[0].id;
      const v1 = score.parts[0].staves[0].measures[m1].voices[0].id;

      score.parts[0].staves[0].measures[m1].voices[0].events = [
        createRest({ baseType: 'quarter' }), // 0..960
        createRest({ baseType: 'quarter' }), // 960..1920
        createRest({ baseType: 'half' }),    // 1920..3840
      ];

      // Tick 500 should snap to 0
      const snapped0 = snapCursor(score, { staffId, voiceId: v1, measureId: m1, tick: 500 });
      expect(snapped0.tick).toBe(0);

      // Tick 1200 should snap to 960
      const snapped1 = snapCursor(score, { staffId, voiceId: v1, measureId: m1, tick: 1200 });
      expect(snapped1.tick).toBe(960);
    });
  });

  describe('pitchFromLetter', () => {
    it('nearest octave: B4 then C -> C5; C5 then B -> B4', () => {
      const treble = { sign: 'G' as const, line: 2 };
      const p1 = pitchFromLetter('C', { step: 'B', octave: 4, alter: 0 }, treble, 0);
      expect(p1).toEqual({ step: 'C', octave: 5, alter: 0 });

      const p2 = pitchFromLetter('B', { step: 'C', octave: 5, alter: 0 }, treble, 0);
      expect(p2).toEqual({ step: 'B', octave: 4, alter: 0 });
    });

    it('treble start from null -> B4 reference', () => {
      const treble = { sign: 'G' as const, line: 2 };
      // From B4, C is 1 step away -> C5
      const c = pitchFromLetter('C', null, treble, 0);
      expect(c).toEqual({ step: 'C', octave: 5, alter: 0 });
      // From B4, G is 2 steps below -> G4
      const g = pitchFromLetter('G', null, treble, 0);
      expect(g).toEqual({ step: 'G', octave: 4, alter: 0 });
    });

    it('bass start from null -> D3 reference', () => {
      const bass = { sign: 'F' as const, line: 4 };
      // From D3, C is 1 step below -> C3
      const c = pitchFromLetter('C', null, bass, 0);
      expect(c).toEqual({ step: 'C', octave: 3, alter: 0 });
      // From D3, F is 2 steps above -> F3
      const f = pitchFromLetter('F', null, bass, 0);
      expect(f).toEqual({ step: 'F', octave: 3, alter: 0 });
    });

    it('key signature alter: G major F -> F#; F major B -> Bb', () => {
      const treble = { sign: 'G' as const, line: 2 };
      // G major (keySig = 1, F#)
      const f = pitchFromLetter('F', { step: 'D', octave: 4, alter: 0 }, treble, 1);
      expect(f).toEqual({ step: 'F', octave: 4, alter: 1 });

      // F major (keySig = -1, Bb)
      const b = pitchFromLetter('B', { step: 'G', octave: 4, alter: 0 }, treble, -1);
      expect(b).toEqual({ step: 'B', octave: 4, alter: -1 });
    });
  });
});
