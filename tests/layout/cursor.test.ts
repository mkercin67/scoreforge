import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../src/core/factory';
import { enterNote, ScoreCursor } from '../../src/core/input';
import { layoutScore } from '../../src/layout/layoutScore';
import { computeCursorPosition } from '../../src/layout/cursor';

describe('cursor layout and visibility', () => {
  it('cursor x position in measure 1 after the header has >= 0.8 gap', () => {
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 4,
    });
    const layout = layoutScore(score, { width: 100 });

    const staffId = score.parts[0].staves[0].id;
    const m1Id = score.measures[0].id;
    const v1Id = score.parts[0].staves[0].measures[m1Id].voices[0].id;
    const cursor: ScoreCursor = { staffId, voiceId: v1Id, measureId: m1Id, tick: 0 };

    const pos = computeCursorPosition(layout, score, cursor);
    expect(pos).not.toBeNull();

    // Find the rightmost header item (clef, keysig, timesig)
    const headerItems = layout.systems[0].items.filter(
      (it) =>
        it.id.startsWith('sys-') ||
        it.id.startsWith('clef-') ||
        it.id.startsWith('keysig-') ||
        it.id.startsWith('timesig-')
    );
    const maxHeaderX = headerItems.reduce((max, it) => Math.max(max, it.x + (it.width ?? 1.2)), 0);

    expect(pos!.x).toBeGreaterThanOrEqual(maxHeaderX + 0.8);
    // Spans staff height: exactly 4 staff spaces
    expect(pos!.y2 - pos!.y1).toBe(4);
  });

  it('cursor x position in an empty measure (measure 2)', () => {
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 4,
    });
    const layout = layoutScore(score, { width: 100 });

    const staffId = score.parts[0].staves[0].id;
    const m2Id = score.measures[1].id;
    const v2Id = score.parts[0].staves[0].measures[m2Id].voices[0].id;
    const cursor: ScoreCursor = { staffId, voiceId: v2Id, measureId: m2Id, tick: 0 };

    const pos = computeCursorPosition(layout, score, cursor);
    expect(pos).not.toBeNull();

    // Barline between m1 and m2
    const m1Barline = layout.systems[0].items.find((it) => it.id === `barline-${score.measures[0].id}`);
    expect(m1Barline).toBeDefined();

    // Cursor in measure 2 must be after m1 barline
    expect(pos!.x).toBeGreaterThan(m1Barline!.x);
  });

  it('after the 4th note, cursor is visible at the start of measure 2 (not hidden in measure 1)', () => {
    let score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 4,
    });

    const staffId = score.parts[0].staves[0].id;
    const m1Id = score.measures[0].id;
    const m2Id = score.measures[1].id;
    const v1Id = score.parts[0].staves[0].measures[m1Id].voices[0].id;
    const v2Id = score.parts[0].staves[0].measures[m2Id].voices[0].id;

    // Enter 4 quarter notes in measure 1
    let t = 0;
    for (const step of ['C', 'D', 'E', 'F'] as const) {
      score = enterNote(
        { staffId, voiceId: v1Id, measureId: m1Id, tick: t },
        { baseType: 'quarter', dots: 0, pitch: { step, octave: 5, alter: 0 } }
      ).apply(score);
      t += 960;
    }

    const layout = layoutScore(score, { width: 100 });

    // Cursor is now at measure 2, tick 0
    const cursor: ScoreCursor = { staffId, voiceId: v2Id, measureId: m2Id, tick: 0 };
    const pos = computeCursorPosition(layout, score, cursor);
    expect(pos).not.toBeNull();

    // Measure 1 barline
    const m1Barline = layout.systems[0].items.find((it) => it.id === `barline-${m1Id}`);
    expect(m1Barline).toBeDefined();

    // Cursor MUST be past measure 1 barline into measure 2!
    expect(pos!.x).toBeGreaterThan(m1Barline!.x);
  });

  it('cursor in a measure with events aligns with event x', () => {
    let score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 2,
    });
    const staffId = score.parts[0].staves[0].id;
    const m1Id = score.measures[0].id;
    const v1Id = score.parts[0].staves[0].measures[m1Id].voices[0].id;

    score = enterNote(
      { staffId, voiceId: v1Id, measureId: m1Id, tick: 0 },
      { baseType: 'half', dots: 0, pitch: { step: 'C', octave: 5, alter: 0 } }
    ).apply(score);

    const layout = layoutScore(score, { width: 100 });
    const cursor: ScoreCursor = { staffId, voiceId: v1Id, measureId: m1Id, tick: 1920 };
    const pos = computeCursorPosition(layout, score, cursor);

    expect(pos).not.toBeNull();
    // Second half of measure 1 starts at tick 1920
    const noteGlyph = layout.systems[0].items.find((it) => it.glyph === 'noteheadHalf');
    expect(pos!.x).toBeGreaterThan(noteGlyph!.x);
  });

  it('multi-system score: cursor y coordinates MUST match the target system staff bounds across all systems', () => {
    // Create an 8-measure score and lay it out at narrow width (e.g. 45 staff spaces) to force >= 3 systems
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 8,
    });
    const layout = layoutScore(score, { width: 25 });
    expect(layout.systems.length).toBeGreaterThanOrEqual(3);

    const staffId = score.parts[0].staves[0].id;

    for (let sIdx = 0; sIdx < layout.systems.length; sIdx++) {
      const sys = layout.systems[sIdx];
      // Find all measures in this system by looking for barlines
      const measureBarlines = sys.items.filter((it) => it.id.startsWith('barline-') && !it.id.includes('thick'));
      expect(measureBarlines.length).toBeGreaterThan(0);

      for (const barline of measureBarlines) {
        const mId = barline.id.replace('barline-', '').replace('-thin', '');
        const sm = score.parts[0].staves[0].measures[mId];
        if (!sm) continue;
        const vId = sm.voices[0].id;

        // Test at tick 0 and tick 960
        for (const tick of [0, 960]) {
          const cursor: ScoreCursor = { staffId, voiceId: vId, measureId: mId, tick };
          const pos = computeCursorPosition(layout, score, cursor);
          expect(pos).not.toBeNull();

          // System index must match
          expect(pos!.systemIndex).toBe(sIdx);

          // y1 and y2 must lie inside this system's staff bounds (sys.y to sys.y + 4)
          expect(pos!.y1).toBe(sys.y);
          expect(pos!.y2).toBe(sys.y + 4);

          // x must be within [0, sys.width]
          expect(pos!.x).toBeGreaterThanOrEqual(0);
          expect(pos!.x).toBeLessThanOrEqual(sys.width);
        }
      }
    }
  });
});
