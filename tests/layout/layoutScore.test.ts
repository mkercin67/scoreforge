import { describe, expect, it, vi } from 'vitest';
import {
  createMeasure,
  createNote,
  createPart,
  createPitch,
  createRest,
  createScore,
} from '../../src/core/factory';
import { getItemWidth, layoutScore } from '../../src/layout/layoutScore';
import { buildSampleScore } from '../../src/ui/Demo';

describe('layoutScore', () => {
  it('guarantees layout determinism: same input gives deep-equal output', () => {
    const score = createScore({ title: 'Deterministic Score' });
    const measure = createMeasure({ num: 4, den: 4 }, 1);
    const part = createPart('Flute');
    score.measures.push(measure);
    score.parts.push(part);

    const note1 = createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'quarter' });
    const note2 = createNote({ pitches: [createPitch('A', 4, 0)], baseType: 'quarter' });
    const rest = createRest({ baseType: 'half' });

    part.staves[0].measures[measure.id] = {
      voices: [{ id: 'v1', events: [note1, note2, rest] }],
    };

    const layout1 = layoutScore(score, { width: 60 });
    const layout2 = layoutScore(score, { width: 60 });

    expect(layout1).toEqual(layout2);
  });

  it('ensures x positions strictly increase within a measure; no two events overlap horizontally', () => {
    const score = createScore();
    const measure = createMeasure({ num: 4, den: 4 });
    const part = createPart('Piano');
    score.measures.push(measure);
    score.parts.push(part);

    const notes = [
      createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' }),
      createNote({ pitches: [createPitch('D', 4, 0)], baseType: 'eighth' }),
      createNote({ pitches: [createPitch('E', 4, 0)], baseType: 'eighth' }),
      createNote({ pitches: [createPitch('F', 4, 0)], baseType: 'half' }),
    ];

    part.staves[0].measures[measure.id] = {
      voices: [{ id: 'v1', events: notes }],
    };

    const layout = layoutScore(score);
    const noteheadItems = layout.items.filter(
      (it) => it.kind === 'glyph' && it.glyph?.startsWith('notehead')
    );

    expect(noteheadItems.length).toBe(4);
    for (let i = 1; i < noteheadItems.length; i++) {
      const prevX = noteheadItems[i - 1].x;
      const curX = noteheadItems[i].x;
      expect(curX).toBeGreaterThan(prevX);
      // Spacing between events must be greater than notehead width (1.18 spaces)
      expect(curX - prevX).toBeGreaterThanOrEqual(1.18);
    }
  });

  it('applies override and moves an item by exactly (dx, dy)', () => {
    const score = createScore();
    const measure = createMeasure();
    const part = createPart();
    score.measures.push(measure);
    score.parts.push(part);

    const note = createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'whole' });
    part.staves[0].measures[measure.id] = {
      voices: [{ id: 'v1', events: [note] }],
    };

    const layoutBefore = layoutScore(score);
    const itemBefore = layoutBefore.items.find((it) => it.id === note.id)!;

    // Apply dx = 3.5, dy = -1.25 override
    score.overrides[note.id] = { dx: 3.5, dy: -1.25 };
    const layoutAfter = layoutScore(score);
    const itemAfter = layoutAfter.items.find((it) => it.id === note.id)!;

    expect(itemAfter.x).toBeCloseTo(itemBefore.x + 3.5, 5);
    expect(itemAfter.y).toBeCloseTo(itemBefore.y - 1.25, 5);
  });

  it('wraps measures into a second system when system width is exceeded', () => {
    const score = createScore();
    const part = createPart('Violin');
    score.parts.push(part);

    // Create 4 measures with 4 quarters each
    for (let i = 0; i < 4; i++) {
      const m = createMeasure({ num: 4, den: 4 });
      score.measures.push(m);
      part.staves[0].measures[m.id] = {
        voices: [
          {
            id: 'v1',
            events: [
              createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' }),
              createNote({ pitches: [createPitch('D', 4, 0)], baseType: 'quarter' }),
              createNote({ pitches: [createPitch('E', 4, 0)], baseType: 'quarter' }),
              createNote({ pitches: [createPitch('F', 4, 0)], baseType: 'quarter' }),
            ],
          },
        ],
      };
    }

    // Narrow width forces wrapping
    const layout = layoutScore(score, { width: 40 });
    expect(layout.systems.length).toBeGreaterThanOrEqual(2);
    expect(layout.systems[0].index).toBe(0);
    expect(layout.systems[1].index).toBe(1);
  });

  it('every non-whole note/chord has exactly one stem item', () => {
    const score = buildSampleScore('G');
    const layout = layoutScore(score, { width: 80 });

    // Collect all note events from score
    const noteEvents: NoteEvent[] = [];
    for (const part of score.parts) {
      for (const staff of part.staves) {
        for (const sm of Object.values(staff.measures)) {
          for (const v of sm.voices) {
            for (const ev of v.events) {
              if (ev.kind === 'note') {
                noteEvents.push(ev);
              }
            }
          }
        }
      }
    }

    expect(noteEvents.length).toBeGreaterThan(0);

    for (const noteEv of noteEvents) {
      const stemItems = layout.items.filter((it) => it.id === `${noteEv.id}-stem`);
      if (noteEv.baseType === 'whole') {
        expect(stemItems.length).toBe(0); // Whole notes have no stems
      } else {
        expect(stemItems.length).toBe(1); // Exactly one stem item
        expect(stemItems[0].kind).toBe('line');
      }
    }
  });

  it('last staff line right end x == final barline x in the last system', () => {
    const score = buildSampleScore('G');
    const layout = layoutScore(score, { width: 80 });
    const lastSys = layout.systems[layout.systems.length - 1];

    // Find the final double barline (thick barline right edge)
    const thickBarline = lastSys.items.find((it) => it.id.includes('barline') && it.id.includes('thick'));
    expect(thickBarline).toBeDefined();
    const finalBarlineRightEdge = thickBarline!.x + (thickBarline!.thickness ?? 0.5);

    // Find staff lines in last system
    const staffLines = lastSys.items.filter((it) => it.id.includes('staffline'));
    expect(staffLines.length).toBe(5);
    for (const line of staffLines) {
      expect(line.x2).toBeCloseTo(finalBarlineRightEdge, 1);
    }
  });

  it('last barline x == available width in a non-last system', () => {
    const score = buildSampleScore('G');
    const targetW = 82;
    const layout = layoutScore(score, { width: targetW });

    // In a multi-system layout, system 0 is non-last and must be justified
    expect(layout.systems.length).toBeGreaterThan(1);
    const nonLastSys = layout.systems[0];

    // Find the barlines in nonLastSys
    const barlines = nonLastSys.items.filter((it) => it.id.includes('barline') && !it.id.includes('start'));
    expect(barlines.length).toBeGreaterThan(0);
    const lastBarline = barlines[barlines.length - 1];

    // Right edge of last barline matches available width
    const lastBarlineRightEdge = lastBarline.x + (lastBarline.thickness ?? 0.16);
    expect(lastBarlineRightEdge).toBeCloseTo(targetW, 1);
  });

  describe('multi-width layout test suite for demo score (widths: 500, 700, 900, 1200, 1600)', () => {
    const testWidths = [500, 700, 900, 1200, 1600];

    testWidths.forEach((targetW) => {
      it(`satisfies all layout invariants at width ${targetW}`, () => {
        const score = buildSampleScore('G');
        const layout = layoutScore(score, { width: targetW });

        // (a) every item x (plus its glyph width) is <= width
        for (const item of layout.items) {
          const itemW = getItemWidth(item);
          expect(item.x + itemW).toBeLessThanOrEqual(targetW + 0.001);
        }

        // (b) every system ends exactly with a barline
        for (const sys of layout.systems) {
          const barlines = sys.items.filter((it) => it.id.includes('barline'));
          expect(barlines.length).toBeGreaterThan(0);
          const maxItemX = Math.max(...sys.items.map((it) => it.x));
          const maxBarlineX = Math.max(...barlines.map((it) => it.x));
          // The barline is at the very end of the system
          expect(maxBarlineX).toBeCloseTo(maxItemX, 1);
        }

        // (c) all measures of the score appear in exactly one system in order
        // Total measures in demo score is 5
        expect(score.measures.length).toBe(5);
        const seenMeasures = new Set<string>();
        let lastMeasureIdx = -1;

        for (const sys of layout.systems) {
          for (const mDef of score.measures) {
            const hasItemsForMeasure = sys.items.some((it) => it.id.includes(mDef.id));
            if (hasItemsForMeasure) {
              expect(seenMeasures.has(mDef.id)).toBe(false);
              seenMeasures.add(mDef.id);
              const curIdx = score.measures.findIndex((m) => m.id === mDef.id);
              expect(curIdx).toBeGreaterThan(lastMeasureIdx);
              lastMeasureIdx = curIdx;
            }
          }
        }
        expect(seenMeasures.size).toBe(5);

        // (d) total event count is unchanged
        const expectedEventCount = score.parts[0].staves[0].measures
          ? Object.values(score.parts[0].staves[0].measures).flatMap((m) =>
              m.voices.flatMap((v) => v.events)
            ).length
          : 0;

        // In layout, each event has its primary glyph with data-id equal to ev.id
        const layoutEventGlyphs = layout.items.filter(
          (it) =>
            it.kind === 'glyph' &&
            (it.glyph?.startsWith('notehead') || it.glyph?.startsWith('rest')) &&
            !it.id.includes('-pitch-')
        );
        expect(layoutEventGlyphs.length).toBe(expectedEventCount);
      });
    });

    it('(e) a width too small for even one measure does not crash or loop forever', () => {
      const score = buildSampleScore('G');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Width of 5 is smaller than a single measure
      const layout = layoutScore(score, { width: 5 });

      expect(layout.systems.length).toBe(5); // exactly 1 measure per system
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Container width (5) is too small')
      );

      warnSpy.mockRestore();
    });
  });
});
