import { describe, it, expect } from 'vitest';
import { yToStaffPosition, pitchToStaffPosition, staffPositionToY, getLedgerLineYs } from '../../src/layout/pitch';
import {
  xToCursor,
  snapDragOffset,
  applyAxisLock,
  isDragPastThreshold,
  clampOverrideOffset,
  getSystemMeasureBounds,
  computeEventHitBoxes,
  hitTestEvent,
} from '../../src/layout/mouse';
import { layoutScore } from '../../src/layout/layoutScore';
import { createEmptyScore, createNote, createPitch, createRest } from '../../src/core/factory';
import { History, setOverride, clearOverride, changePitch } from '../../src/core/commands';
import { NoteEvent } from '../../src/core/model';

describe('Milestone 3c: Mouse Input & Manual Positioning', () => {
  describe('yToStaffPosition', () => {
    it('converts treble clef staff positions correctly', () => {
      // Treble bottom line (y = 4) is E4 (stepPos = 0)
      const e4 = yToStaffPosition({ sign: 'G', line: 2 }, 4.0);
      expect(e4).toEqual({ step: 'E', alter: 0, octave: 4 });

      // Middle line (y = 2) is B4 (stepPos = 4)
      const b4 = yToStaffPosition({ sign: 'G', line: 2 }, 2.0);
      expect(b4).toEqual({ step: 'B', alter: 0, octave: 4 });

      // Top line (y = 0) is F5 (stepPos = 8)
      const f5 = yToStaffPosition({ sign: 'G', line: 2 }, 0.0);
      expect(f5).toEqual({ step: 'F', alter: 0, octave: 5 });

      // Space below bottom line (y = 4.5) is D4 (stepPos = -1)
      const d4 = yToStaffPosition({ sign: 'G', line: 2 }, 4.5);
      expect(d4).toEqual({ step: 'D', alter: 0, octave: 4 });

      // First ledger line below staff (y = 5.0) is C4 (stepPos = -2)
      const c4 = yToStaffPosition({ sign: 'G', line: 2 }, 5.0);
      expect(c4).toEqual({ step: 'C', alter: 0, octave: 4 });

      // First ledger line above staff (y = -1.0) is A5 (stepPos = 10)
      const a5 = yToStaffPosition({ sign: 'G', line: 2 }, -1.0);
      expect(a5).toEqual({ step: 'A', alter: 0, octave: 5 });
    });

    it('respects key signature alterations in yToStaffPosition', () => {
      // In G major (keySig = 1, F#), F5 (y = 0) should have alter = 1
      const fSharp5 = yToStaffPosition({ sign: 'G', line: 2 }, 0.0, 1);
      expect(fSharp5).toEqual({ step: 'F', alter: 1, octave: 5 });

      // In F major (keySig = -1, Bb), B4 (y = 2) should have alter = -1
      const bFlat4 = yToStaffPosition({ sign: 'G', line: 2 }, 2.0, -1);
      expect(bFlat4).toEqual({ step: 'B', alter: -1, octave: 4 });
    });

    it('converts bass clef staff positions correctly', () => {
      // Bass bottom line (y = 4) is G2 (stepPos = 0)
      const g2 = yToStaffPosition({ sign: 'F', line: 4 }, 4.0);
      expect(g2).toEqual({ step: 'G', alter: 0, octave: 2 });

      // Middle line (y = 2) is D3 (stepPos = 4)
      const d3 = yToStaffPosition({ sign: 'F', line: 4 }, 2.0);
      expect(d3).toEqual({ step: 'D', alter: 0, octave: 3 });

      // Top line (y = 0) is A3 (stepPos = 8)
      const a3 = yToStaffPosition({ sign: 'F', line: 4 }, 0.0);
      expect(a3).toEqual({ step: 'A', alter: 0, octave: 3 });

      // Middle C (y = -1.0, 1 ledger line above bass staff) is C4
      const c4 = yToStaffPosition({ sign: 'F', line: 4 }, -1.0);
      expect(c4).toEqual({ step: 'C', alter: 0, octave: 4 });
    });

    it('clamps to at most 3 diatonic steps beyond staff boundaries (-3..11)', () => {
      // Far below: y = 20 spaces -> should clamp to stepPos = -3 (B3 in treble clef)
      const clampedLow = yToStaffPosition({ sign: 'G', line: 2 }, 20.0);
      expect(clampedLow).toEqual({ step: 'B', alter: 0, octave: 3 });

      // Far above: y = -10 spaces -> should clamp to stepPos = 11 (B5 in treble clef)
      const clampedHigh = yToStaffPosition({ sign: 'G', line: 2 }, -10.0);
      expect(clampedHigh).toEqual({ step: 'B', alter: 0, octave: 5 });

      // Bass clef clamping: bottom line is G2 (step 0), top line is A3 (step 8)
      // Clamped low: step -3 -> D2
      const bassClampedLow = yToStaffPosition({ sign: 'F', line: 4 }, 25.0);
      expect(bassClampedLow).toEqual({ step: 'D', alter: 0, octave: 2 });

      // Clamped high: step 11 -> D4
      const bassClampedHigh = yToStaffPosition({ sign: 'F', line: 4 }, -15.0);
      expect(bassClampedHigh).toEqual({ step: 'D', alter: 0, octave: 4 });
    });
  });

  describe('drag math', () => {
    it('enforces 4px drag initiation threshold', () => {
      expect(isDragPastThreshold(0, 0, 4)).toBe(false);
      expect(isDragPastThreshold(3, 2, 4)).toBe(false); // sqrt(9+4) = 3.6 < 4
      expect(isDragPastThreshold(4, 0, 4)).toBe(true);
      expect(isDragPastThreshold(0, 4, 4)).toBe(true);
      expect(isDragPastThreshold(3, 3, 4)).toBe(true); // sqrt(18) = 4.24 >= 4
    });

    it('snaps to 0.25 staff spaces by default', () => {
      expect(snapDragOffset(0.12, false)).toBe(0);
      expect(snapDragOffset(0.13, false)).toBe(0.25);
      expect(snapDragOffset(0.38, false)).toBe(0.5);
      expect(snapDragOffset(-0.6, false)).toBe(-0.5);
      expect(snapDragOffset(-0.65, false)).toBe(-0.75);
    });

    it('bypasses snapping when altKey is true', () => {
      expect(snapDragOffset(0.123, true)).toBe(0.123);
      expect(snapDragOffset(-0.62, true)).toBe(-0.62);
    });

    it('locks to dominant axis when shiftKey is true', () => {
      // Horizontal dominant
      expect(applyAxisLock(2.0, 0.5, true)).toEqual({ dx: 2.0, dy: 0 });
      // Vertical dominant
      expect(applyAxisLock(0.5, 2.0, true)).toEqual({ dx: 0, dy: 2.0 });
      // Equal magnitude defaults to horizontal
      expect(applyAxisLock(1.5, 1.5, true)).toEqual({ dx: 1.5, dy: 0 });
      // Shift not held
      expect(applyAxisLock(1.2, 0.8, false)).toEqual({ dx: 1.2, dy: 0.8 });
    });
  });

  describe('setOverride and clearOverride commands', () => {
    it('accumulates drag overrides and clearOverride resets it', () => {
      const score = createEmptyScore({ measures: 4 });
      const eventId = score.parts[0].staves[0].measures[score.measures[0].id].voices[0].events[0].id;
      const history = new History(score);

      // 1. Initial override (+1.0, -0.5)
      const s1 = history.do(setOverride(eventId, { dx: 1.0, dy: -0.5 }));
      expect(s1.overrides[eventId]).toEqual({ dx: 1.0, dy: -0.5 });

      // 2. Second drag: accumulates with existing override (+0.5, +0.25) -> (+1.5, -0.25)
      const s2 = history.do(setOverride(eventId, { dx: 0.5, dy: 0.25 }, true));
      expect(s2.overrides[eventId]).toEqual({ dx: 1.5, dy: -0.25 });

      // 3. Clear override
      const s3 = history.do(clearOverride(eventId));
      expect(s3.overrides[eventId]).toBeUndefined();
    });

    it('undo of one drag is exactly ONE step', () => {
      const score = createEmptyScore({ measures: 4 });
      const eventId = score.parts[0].staves[0].measures[score.measures[0].id].voices[0].events[0].id;
      const history = new History(score);

      // Initial state has no override
      expect(history.score.overrides[eventId]).toBeUndefined();

      // Drag applied as single command
      history.do(setOverride(eventId, { dx: 1.0, dy: -1.0 }, true));
      expect(history.score.overrides[eventId]).toEqual({ dx: 1.0, dy: -1.0 });

      // Undo exactly ONCE restores state without override
      const undone = history.undo();
      expect(undone).not.toBeNull();
      expect(history.score.overrides[eventId]).toBeUndefined();

      // Redo restores override
      const redone = history.redo();
      expect(redone).not.toBeNull();
      expect(history.score.overrides[eventId]).toEqual({ dx: 1.0, dy: -1.0 });
    });

    it('nudge after undo never leaks values from a previous drag override (Bug 1)', () => {
      const score = createEmptyScore({ measures: 4 });
      const eventId = score.parts[0].staves[0].measures[score.measures[0].id].voices[0].events[0].id;
      const history = new History(score);

      // 1. Drag applied
      history.do(setOverride(eventId, { dx: 1.0, dy: -1.0 }));
      expect(history.score.overrides[eventId]).toEqual({ dx: 1.0, dy: -1.0 });

      // 2. Undo restores initial state (no override)
      history.undo();
      expect(history.score.overrides[eventId]).toBeUndefined();

      // 3. Nudge applied: dx = 0.25 (horizontal nudge)
      history.do(setOverride(eventId, { dx: 0.25 }, true));
      expect(history.score.overrides[eventId]?.dx).toBe(0.25);
      expect(history.score.overrides[eventId]?.dy).toBeUndefined();
    });
  });

  describe('layout with override', () => {
    it('applies override (dx, dy) to all event items without altering neighbors or measure width', () => {
      const score = createEmptyScore({ measures: 2 });
      const voice = score.parts[0].staves[0].measures[score.measures[0].id].voices[0];
      const ev0 = createNote({ pitches: [createPitch('C', 4)], baseType: 'quarter' });
      const ev1 = createNote({ pitches: [createPitch('D', 4)], baseType: 'quarter' });
      voice.events = [ev0, ev1];

      const baseLayout = layoutScore(score, { width: 100 });
      const baseItem0 = baseLayout.systems[0].items.find((it) => it.eventId === ev0.id && it.kind === 'glyph');
      const baseStem0 = baseLayout.systems[0].items.find((it) => it.id === `${ev0.id}-stem`);
      const baseItem1 = baseLayout.systems[0].items.find((it) => it.eventId === ev1.id && it.kind === 'glyph');
      const baseBarlineM1 = baseLayout.systems[0].items.find((it) => it.id === `barline-${score.measures[0].id}`);
      const baseSysWidth = baseLayout.systems[0].width;

      expect(baseItem0).toBeDefined();
      expect(baseStem0).toBeDefined();
      expect(baseItem1).toBeDefined();
      expect(baseBarlineM1).toBeDefined();

      // Apply override to ev0: dx = 2.0, dy = -1.5
      const modifiedScore = setOverride(ev0.id, { dx: 2.0, dy: -1.5 }).apply(score);
      const modLayout = layoutScore(modifiedScore, { width: 100 });

      const modItem0 = modLayout.systems[0].items.find((it) => it.eventId === ev0.id && it.kind === 'glyph');
      const modStem0 = modLayout.systems[0].items.find((it) => it.id === `${ev0.id}-stem`);
      const modItem1 = modLayout.systems[0].items.find((it) => it.eventId === ev1.id && it.kind === 'glyph');
      const modBarlineM1 = modLayout.systems[0].items.find((it) => it.id === `barline-${score.measures[0].id}`);

      // ev0 glyph shifted by dx, dy is ignored for notes
      expect(modItem0!.x).toBeCloseTo(baseItem0!.x + 2.0);
      expect(modItem0!.y).toBeCloseTo(baseItem0!.y);

      // ev0 stem shifted by dx, dy is ignored for notes
      expect(modStem0!.x).toBeCloseTo(baseStem0!.x + 2.0);
      expect(modStem0!.y).toBeCloseTo(baseStem0!.y);

      // Neighbor ev1 unchanged
      expect(modItem1!.x).toBeCloseTo(baseItem1!.x);
      expect(modItem1!.y).toBeCloseTo(baseItem1!.y);

      // Measure boundary (barline x) unchanged
      expect(modBarlineM1!.x).toBeCloseTo(baseBarlineM1!.x);

      // System width unchanged
      expect(modLayout.systems[0].width).toBeCloseTo(baseSysWidth);
    });

    it('layout ignores dy for notes and chords but applies dy for rests', () => {
      const score = createEmptyScore({ measures: 2 });
      const voice = score.parts[0].staves[0].measures[score.measures[0].id].voices[0];
      const evNote = createNote({ pitches: [createPitch('C', 4)], baseType: 'quarter' });
      const evRest = createRest({ baseType: 'quarter' });
      voice.events = [evNote, evRest];

      const baseLayout = layoutScore(score, { width: 100 });
      const baseNoteItem = baseLayout.systems[0].items.find((it) => it.eventId === evNote.id && it.kind === 'glyph');
      const baseRestItem = baseLayout.systems[0].items.find((it) => it.eventId === evRest.id && it.kind === 'glyph');

      let modScore = setOverride(evNote.id, { dx: 1.0, dy: -2.0 }).apply(score);
      modScore = setOverride(evRest.id, { dx: 0.5, dy: -1.5 }).apply(modScore);

      const modLayout = layoutScore(modScore, { width: 100 });
      const modNoteItem = modLayout.systems[0].items.find((it) => it.eventId === evNote.id && it.kind === 'glyph');
      const modRestItem = modLayout.systems[0].items.find((it) => it.eventId === evRest.id && it.kind === 'glyph');

      // Note: dx is applied (+1.0), dy is IGNORED (y unchanged!)
      expect(modNoteItem!.x).toBeCloseTo(baseNoteItem!.x + 1.0);
      expect(modNoteItem!.y).toBeCloseTo(baseNoteItem!.y);

      // Rest: dx is applied (+0.5), dy IS applied (-1.5)
      expect(modRestItem!.x).toBeCloseTo(baseRestItem!.x + 0.5);
      expect(modRestItem!.y).toBeCloseTo(baseRestItem!.y - 1.5);
    });
  });

  describe('xToCursor', () => {
    it('locates measure and tick corresponding to x coordinate in system', () => {
      const score = createEmptyScore({ measures: 4 });
      const voice = score.parts[0].staves[0].measures[score.measures[0].id].voices[0];
      const ev0 = createNote({ pitches: [createPitch('C', 4)], baseType: 'quarter' });
      const ev1 = createNote({ pitches: [createPitch('D', 4)], baseType: 'quarter' });
      voice.events = [ev0, ev1];

      const layout = layoutScore(score, { width: 100 });

      // Event 0 item
      const item0 = layout.systems[0].items.find((it) => it.eventId === ev0.id && it.kind === 'glyph');
      expect(item0).toBeDefined();

      const cursorAtEv0 = xToCursor(layout, 0, item0!.x);
      expect(cursorAtEv0).not.toBeNull();
      expect(cursorAtEv0?.measureId).toBe(score.measures[0].id);
      expect(cursorAtEv0?.tick).toBe(0);

      // Between ev0 and ev1 -> should return start tick of next event (ev1, tick = 960)
      const item1 = layout.systems[0].items.find((it) => it.eventId === ev1.id && it.kind === 'glyph');
      expect(item1).toBeDefined();
      const cursorAtEv1 = xToCursor(layout, 0, item1!.x);
      expect(cursorAtEv1?.measureId).toBe(score.measures[0].id);
      expect(cursorAtEv1?.tick).toBe(960);

      // Empty measure 2 (measure index 1) -> tick should be 0
      const m1Barline = layout.systems[0].items.find((it) => it.id === `barline-${score.measures[0].id}`);
      if (m1Barline) {
        const cursorInM2 = xToCursor(layout, 0, m1Barline.x + 2);
        expect(cursorInM2?.measureId).toBe(score.measures[1].id);
        expect(cursorInM2?.tick).toBe(0);
      }
    });

    it('returns tick 0 across the entire measure when measure contains only rests (Bug 4)', () => {
      const score = createEmptyScore({ measures: 4 });
      // Non-wholeMeasure rests in measure 2 (e.g. after convert-to-rest)
      const m2Voice = score.parts[0].staves[0].measures[score.measures[1].id].voices[0];
      m2Voice.events = [createRest({ baseType: 'half' }), createRest({ baseType: 'half' })];

      const layout = layoutScore(score, { width: 100 });
      const b0 = layout.systems[0].items.find((it) => it.id === `barline-${score.measures[0].id}`)!;
      const b1 = layout.systems[0].items.find((it) => it.id === `barline-${score.measures[1].id}`)!;

      // Click near start of M2 (right after barline 0) -> tick 0
      const cStart = xToCursor(layout, 0, b0.x + 0.5);
      expect(cStart?.measureId).toBe(score.measures[1].id);
      expect(cStart?.tick).toBe(0);

      // Click at middle of M2 -> tick 0
      const cMid = xToCursor(layout, 0, (b0.x + b1.x) / 2);
      expect(cMid?.measureId).toBe(score.measures[1].id);
      expect(cMid?.tick).toBe(0);

      // Click at right edge of M2 -> tick 0 (never falls through to 1920)
      const cEnd = xToCursor(layout, 0, b1.x - 0.2);
      expect(cEnd?.measureId).toBe(score.measures[1].id);
      expect(cEnd?.tick).toBe(0);
    });

    it('returns rest start tick when clicking to the right of a rest that ends a mixed measure', () => {
      const score = createEmptyScore({ measures: 4 });
      const m0Id = score.measures[0].id;
      // Quarter note (ticks 0..960) then quarter rest (ticks 960..1920)
      score.parts[0].staves[0].measures[m0Id] = {
        voices: [
          {
            id: 'v1',
            events: [
              createNote({ pitches: [createPitch('C', 4)], baseType: 'quarter' }),
              createRest({ baseType: 'quarter' }),
            ],
          },
        ],
      };

      const layout = layoutScore(score, { width: 100 });
      const b0 = layout.systems[0].items.find((it) => it.id === `barline-${score.measures[0].id}`)!;

      // Click at the far right of measure 1 (beyond the rest glyph)
      const cFarRight = xToCursor(layout, 0, b0.x - 0.2, score);
      expect(cFarRight?.measureId).toBe(score.measures[0].id);
      expect(cFarRight?.tick).toBe(960);
    });
  });

  describe('Section A: New Interaction Model (Vertical pitch drag & Alt+drag)', () => {
    it('shifts single note pitch in 0.5 staff-space steps with clamping and key signature', () => {
      const clef = { sign: 'G' as const, line: 2 };
      // C5 has stepPos = 5 (y = 1.5)
      const c5 = { step: 'C' as const, alter: 0, octave: 5 };
      expect(pitchToStaffPosition(c5, clef)).toBe(5);

      // Drag up by 1 staff space -> deltaStep = +2 -> stepPos = 7 (E5)
      const targetUp1 = yToStaffPosition(clef, staffPositionToY(5 + 2), 0);
      expect(targetUp1).toEqual({ step: 'E', alter: 0, octave: 5 });

      // Drag up by 0.5 staff space -> deltaStep = +1 -> stepPos = 6 (D5)
      const targetUp05 = yToStaffPosition(clef, staffPositionToY(5 + 1), 0);
      expect(targetUp05).toEqual({ step: 'D', alter: 0, octave: 5 });

      // In F major (keySig = -1), B4 dragged to B4 has alter = -1 (Bb4)
      const targetBb = yToStaffPosition(clef, staffPositionToY(4), -1);
      expect(targetBb).toEqual({ step: 'B', alter: -1, octave: 4 });

      // Clamping: dragging C5 far down is clamped to stepPos = -3 (B3)
      const targetClampedLow = yToStaffPosition(clef, staffPositionToY(-10), 0);
      expect(targetClampedLow).toEqual({ step: 'B', alter: 0, octave: 3 });

      // Clamping: dragging C5 far up is clamped to stepPos = 11 (B5)
      const targetClampedHigh = yToStaffPosition(clef, staffPositionToY(20), 0);
      expect(targetClampedHigh).toEqual({ step: 'B', alter: 0, octave: 5 });
    });

    it('shifts chord pitches by the exact same diatonic step count', () => {
      const clef = { sign: 'G' as const, line: 2 };
      // C major chord: C4 (step -2), E4 (step 0), G4 (step 2)
      const chord = [
        { step: 'C' as const, alter: 0, octave: 4 },
        { step: 'E' as const, alter: 0, octave: 4 },
        { step: 'G' as const, alter: 0, octave: 4 },
      ];
      const initialSteps = chord.map((p) => pitchToStaffPosition(p, clef));
      expect(initialSteps).toEqual([-2, 0, 2]);

      // Shift upward by 2 diatonic steps:
      // C4 -> E4 (step 0), E4 -> G4 (step 2), G4 -> B4 (step 4)
      const shiftedChord = initialSteps.map((sp) => yToStaffPosition(clef, staffPositionToY(sp + 2), 0));
      expect(shiftedChord).toEqual([
        { step: 'E', alter: 0, octave: 4 },
        { step: 'G', alter: 0, octave: 4 },
        { step: 'B', alter: 0, octave: 4 },
      ]);
    });

    it('computes ledger lines correctly for pitches dragged in and out of staff and never floats', () => {
      // Step 4 (B4, middle line) -> inside staff -> 0 ledger lines
      expect(getLedgerLineYs(4)).toEqual([]);

      // Step 8 (F5, top line) -> inside staff -> 0 ledger lines
      expect(getLedgerLineYs(8)).toEqual([]);

      // Step 9 (G5, space above top line) -> inside staff margin -> 0 ledger lines
      expect(getLedgerLineYs(9)).toEqual([]);

      // Step 10 (A5, 1st ledger line above staff) -> ledger line at y = -1.0
      expect(getLedgerLineYs(10)).toEqual([-1.0]);

      // Step 11 (B5, space above 1st ledger line) -> ledger line at y = -1.0
      expect(getLedgerLineYs(11)).toEqual([-1.0]);

      // Step -2 (C4, 1st ledger line below staff) -> ledger line at y = 5.0
      expect(getLedgerLineYs(-2)).toEqual([5.0]);

      // Step -3 (B3, space below 1st ledger line) -> ledger line at y = 5.0
      expect(getLedgerLineYs(-3)).toEqual([5.0]);
    });

    it('applies changePitch command and undoes in exactly ONE step', () => {
      const score = createEmptyScore({ measures: 4 });
      const m0 = score.measures[0].id;
      const ev = createNote({ pitches: [{ step: 'C', alter: 0, octave: 4 }], baseType: 'quarter' });
      score.parts[0].staves[0].measures[m0] = { voices: [{ id: 'v1', events: [ev] }] };

      const history = new History(score);
      expect((history.score.parts[0].staves[0].measures[m0].voices[0].events[0] as NoteEvent).pitches[0].step).toBe('C');

      // Drag drops note onto E4:
      const s1 = history.do(changePitch(ev.id, [{ step: 'E', alter: 0, octave: 4 }]));
      expect((s1.parts[0].staves[0].measures[m0].voices[0].events[0] as NoteEvent).pitches[0].step).toBe('E');

      // Undo restores C4 in exactly one step
      const undone = history.undo();
      expect(undone).not.toBeNull();
      expect((history.score.parts[0].staves[0].measures[m0].voices[0].events[0] as NoteEvent).pitches[0].step).toBe('C');
    });
  });

  describe('M3c3 clampOverrideOffset & limit indicator', () => {
    it('clamps note dx to [-4, +4] and measure bounds while ignoring dy, and reports isAtLimit', () => {
      const score = createEmptyScore({ measures: 1 });
      const m0 = score.measures[0].id;
      const n1 = createNote({
        pitches: [createPitch('C', 5, 1)],
        baseType: 'eighth',
        dots: 1,
      });
      score.parts[0].staves[0].measures[m0] = { voices: [{ id: 'v1', events: [n1] }] };

      const layout = layoutScore(score, { width: 80 });
      const sys = layout.systems[0];
      const bounds = getSystemMeasureBounds(sys)[0];
      const items = sys.items.filter(
        (it) => it.eventId === n1.id || it.id === n1.id || it.id.startsWith(`${n1.id}-`)
      );

      // Drag far left -> hits header left bound and sets isAtLimit = true
      const leftRes = clampOverrideOffset(items, bounds, -10, -5, false, 0);
      expect(leftRes.dy).toBe(0);
      expect(leftRes.dx).toBeGreaterThan(-10);
      expect(leftRes.dx).toBeGreaterThanOrEqual(-4);
      expect(leftRes.isAtLimit).toBe(true);

      // Drag far right -> clamped to +4 or right barline bound and sets isAtLimit = true
      const rightRes = clampOverrideOffset(items, bounds, 20, 5, false, 0);
      expect(rightRes.dy).toBe(0);
      expect(rightRes.dx).toBeLessThanOrEqual(4);
      expect(rightRes.isAtLimit).toBe(true);
    });

    it('clamps rest dy to [-6, +6] and dx to [-4, +4] / measure bounds and sets isAtLimit', () => {
      const score = createEmptyScore({ measures: 1 });
      const m0 = score.measures[0].id;
      const r1 = createRest({ baseType: 'quarter' });
      score.parts[0].staves[0].measures[m0] = { voices: [{ id: 'v1', events: [r1] }] };

      const layout = layoutScore(score, { width: 80 });
      const sys = layout.systems[0];
      const bounds = getSystemMeasureBounds(sys)[0];
      const items = sys.items.filter(
        (it) => it.eventId === r1.id || it.id === r1.id || it.id.startsWith(`${r1.id}-`)
      );

      const clampedUp = clampOverrideOffset(items, bounds, 0.5, -12, true, 0);
      expect(clampedUp.dy).toBe(-6);
      expect(clampedUp.dx).toBe(0.5);
      expect(clampedUp.isAtLimit).toBe(true);

      const clampedDown = clampOverrideOffset(items, bounds, 0, 12, true, 0);
      expect(clampedDown.dy).toBe(6);
      expect(clampedDown.isAtLimit).toBe(true);
    });
  });

  describe('M3c3 hitTestEvent union hit boxes & overlap resolution', () => {
    it('hits stem middle, flag tip, accidental, dot, ledger line, and rest center/corners', () => {
      const score = createEmptyScore({ measures: 2 });
      const m0 = score.measures[0].id;
      const m1 = score.measures[1].id;

      // 1) Eighth note with stem down, sharp accidental, augmentation dot, and ledger line above staff (A5)
      const nHigh = createNote({
        pitches: [createPitch('A', 5, 1)],
        baseType: 'eighth',
        dots: 1,
      });
      // 2) Stem-up note (E4)
      const nLow = createNote({
        pitches: [createPitch('E', 4, 0)],
        baseType: 'eighth',
      });
      // 3) Quarter rest in measure 1
      const rQuarter = createRest({ baseType: 'quarter' });

      score.parts[0].staves[0].measures[m0] = { voices: [{ id: 'v1', events: [nHigh, nLow] }] };
      score.parts[0].staves[0].measures[m1] = { voices: [{ id: 'v1', events: [rQuarter] }] };

      const layout = layoutScore(score, { width: 100 });
      const sys = layout.systems[0];

      // Stem middle on nHigh (stem-down) & nLow (stem-up)
      const highStem = sys.items.find((it) => it.id === `${nHigh.id}-stem` && it.kind === 'line')!;
      expect(highStem).toBeDefined();
      const stemMidY = (highStem.y + (highStem.y2 ?? highStem.y)) / 2;
      expect(hitTestEvent(layout, 0, highStem.x, stemMidY)).toEqual({ eventId: nHigh.id, kind: 'note' });

      const lowStem = sys.items.find((it) => it.id === `${nLow.id}-stem` && it.kind === 'line')!;
      expect(lowStem).toBeDefined();
      expect(
        hitTestEvent(layout, 0, lowStem.x, (lowStem.y + (lowStem.y2 ?? lowStem.y)) / 2)
      ).toEqual({ eventId: nLow.id, kind: 'note' });

      // Flag tip on nLow (up flag)
      const lowFlag = sys.items.find((it) => it.id === `${nLow.id}-flag`)!;
      expect(lowFlag).toBeDefined();
      expect(hitTestEvent(layout, 0, lowFlag.x + 0.5, lowFlag.y + 0.5)).toEqual({ eventId: nLow.id, kind: 'note' });

      // Accidental on nHigh
      const highAcc = sys.items.find(
        (it) => it.glyph?.startsWith('accidental') && it.eventId === nHigh.id
      )!;
      expect(highAcc).toBeDefined();
      expect(hitTestEvent(layout, 0, highAcc.x + 0.2, highAcc.y)).toEqual({ eventId: nHigh.id, kind: 'note' });

      // Augmentation dot on nHigh
      const highDot = sys.items.find(
        (it) => it.glyph === 'augmentationDot' && it.eventId === nHigh.id
      )!;
      expect(highDot).toBeDefined();
      expect(hitTestEvent(layout, 0, highDot.x + 0.1, highDot.y)).toEqual({ eventId: nHigh.id, kind: 'note' });

      // Ledger line edge on nHigh
      const highLedger = sys.items.find(
        (it) => it.id.startsWith(`${nHigh.id}-ledger`) && it.kind === 'line'
      )!;
      expect(highLedger).toBeDefined();
      expect(hitTestEvent(layout, 0, highLedger.x2 ?? highLedger.x, highLedger.y)).toEqual({
        eventId: nHigh.id,
        kind: 'note',
      });

      // Rest center & corners
      const restGlyph = sys.items.find((it) => it.id === rQuarter.id)!;
      expect(hitTestEvent(layout, 0, restGlyph.x + 0.5, restGlyph.y)).toEqual({
        eventId: rQuarter.id,
        kind: 'rest',
      });
      // Corner of >= 1.6 x 2.4 centered hit box (+0.4 pad -> +/-1.2 in X, +/-1.6 in Y from center)
      expect(hitTestEvent(layout, 0, restGlyph.x + 0.5 + 1.0, restGlyph.y - 1.4)).toEqual({
        eventId: rQuarter.id,
        kind: 'rest',
      });

      // Empty measure space far right of rest must return null (not neighbor event)
      expect(hitTestEvent(layout, 0, sys.width - 2.0, 2.0)).toBeNull();
    });

    it('resolves overlapping hit areas in favor of the nearest event center', () => {
      const score = createEmptyScore({ measures: 1 });
      const m0 = score.measures[0].id;
      const n1 = createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' });
      const n2 = createNote({ pitches: [createPitch('D', 4, 0)], baseType: 'quarter' });
      score.parts[0].staves[0].measures[m0] = { voices: [{ id: 'v1', events: [n1, n2] }] };

      // Force n2 close to n1 so their padded hit boxes overlap
      score.overrides[n2.id] = { dx: -3.5, dy: 0 };

      const layout = layoutScore(score, { width: 80 });
      const hitBoxes = computeEventHitBoxes(layout.systems[0]);
      const hb1 = hitBoxes.find((b) => b.eventId === n1.id)!;
      const hb2 = hitBoxes.find((b) => b.eventId === n2.id)!;

      // Test slightly closer to hb2 center than hb1 center inside overlap
      const overlapX = (hb1.centerX + hb2.centerX) / 2 + 0.05;
      const hit = hitTestEvent(layout, 0, overlapX, hb2.centerY);
      expect(hit?.eventId).toBe(n2.id);
    });
  });
});
