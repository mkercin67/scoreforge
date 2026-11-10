import { describe, it, expect } from 'vitest';
import { yToStaffPosition } from '../../src/layout/pitch';
import { xToCursor, snapDragOffset, applyAxisLock } from '../../src/layout/mouse';
import { layoutScore } from '../../src/layout/layoutScore';
import { createEmptyScore, createNote, createPitch } from '../../src/core/factory';
import { History, setOverride, clearOverride } from '../../src/core/commands';

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

    it('clamps to 3 ledger steps beyond staff boundaries (-6..14)', () => {
      // Far below: y = 20 spaces -> should clamp to stepPos = -6 (y = 7.0)
      const clampedLow = yToStaffPosition({ sign: 'G', line: 2 }, 20.0);
      // stepPos -6 from E4 is F3 (3 ledger lines below staff)
      expect(clampedLow).toEqual({ step: 'F', alter: 0, octave: 3 });

      // Far above: y = -10 spaces -> should clamp to stepPos = 14 (y = -3.0)
      const clampedHigh = yToStaffPosition({ sign: 'G', line: 2 }, -10.0);
      // stepPos 14 from E4 is E6
      expect(clampedHigh).toEqual({ step: 'E', alter: 0, octave: 6 });
    });
  });

  describe('drag math', () => {
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

      // 4. Undo restores accumulated override
      const sUndone = history.undo();
      expect(sUndone?.overrides[eventId]).toEqual({ dx: 1.5, dy: -0.25 });
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
      const baseSysWidth = baseLayout.systems[0].width;

      expect(baseItem0).toBeDefined();
      expect(baseStem0).toBeDefined();
      expect(baseItem1).toBeDefined();

      // Apply override to ev0: dx = 2.0, dy = -1.5
      const modifiedScore = setOverride(ev0.id, { dx: 2.0, dy: -1.5 }).apply(score);
      const modLayout = layoutScore(modifiedScore, { width: 100 });

      const modItem0 = modLayout.systems[0].items.find((it) => it.eventId === ev0.id && it.kind === 'glyph');
      const modStem0 = modLayout.systems[0].items.find((it) => it.id === `${ev0.id}-stem`);
      const modItem1 = modLayout.systems[0].items.find((it) => it.eventId === ev1.id && it.kind === 'glyph');

      // ev0 glyph shifted by dx, dy
      expect(modItem0!.x).toBeCloseTo(baseItem0!.x + 2.0);
      expect(modItem0!.y).toBeCloseTo(baseItem0!.y - 1.5);

      // ev0 stem shifted by dx, dy
      expect(modStem0!.x).toBeCloseTo(baseStem0!.x + 2.0);
      expect(modStem0!.y).toBeCloseTo(baseStem0!.y - 1.5);

      // Neighbor ev1 unchanged
      expect(modItem1!.x).toBeCloseTo(baseItem1!.x);
      expect(modItem1!.y).toBeCloseTo(baseItem1!.y);

      // System width unchanged
      expect(modLayout.systems[0].width).toBeCloseTo(baseSysWidth);
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
  });
});
