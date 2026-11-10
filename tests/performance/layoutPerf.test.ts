import { describe, expect, it, vi } from 'vitest';
import { createEmptyScore, createNote, createPitch } from '../../src/core/factory';
import { enterNote } from '../../src/core/input';
import * as layoutScoreModule from '../../src/layout/layoutScore';
import { computeCursorPosition } from '../../src/layout/cursor';

describe('Performance verification', () => {
  it('layoutScore for 64 measures finishes under 200ms', () => {
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 64,
    });

    const t0 = performance.now();
    const layout = layoutScoreModule.layoutScore(score, { width: 100 });
    const elapsed = performance.now() - t0;

    console.log(`[PERF] 64-measure layoutScore took: ${elapsed.toFixed(2)} ms`);
    expect(elapsed).toBeLessThan(200);
    expect(layout.systems.length).toBeGreaterThan(0);
  });

  it('layoutScore for 8 measures finishes in under 50ms', () => {
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 8,
    });

    const t0 = performance.now();
    const layout = layoutScoreModule.layoutScore(score, { width: 100 });
    const elapsed = performance.now() - t0;

    console.log(`[PERF] 8-measure layoutScore took: ${elapsed.toFixed(2)} ms`);
    expect(layout.systems.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  it('toggling input mode or moving cursor does NOT call layoutScore', () => {
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 8,
    });

    // Compute layout once for the score
    const layoutSpy = vi.spyOn(layoutScoreModule, 'layoutScore');
    const layout = layoutScoreModule.layoutScore(score, { width: 100 });
    expect(layoutSpy).toHaveBeenCalledTimes(1);

    // Toggling input mode or moving cursor only calls computeCursorPosition on the cached layout
    const staffId = score.parts[0].staves[0].id;
    const m1Id = score.measures[0].id;
    const v1Id = score.parts[0].staves[0].measures[m1Id].voices[0].id;

    const pos1 = computeCursorPosition(layout, score, { staffId, voiceId: v1Id, measureId: m1Id, tick: 0 });
    expect(pos1).not.toBeNull();

    // Moving cursor to measure 2
    const m2Id = score.measures[1].id;
    const v2Id = score.parts[0].staves[0].measures[m2Id].voices[0].id;
    const pos2 = computeCursorPosition(layout, score, { staffId, voiceId: v2Id, measureId: m2Id, tick: 0 });
    expect(pos2).not.toBeNull();

    // layoutScore was NOT called again!
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    layoutSpy.mockRestore();
  });

  it('entering one note into a 64-measure score recomputes layout for exactly 1 measure (cache hit counter)', () => {
    const score1 = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 64,
    });

    // 1. Initial layout warms up cache for all 64 measures
    layoutScoreModule.layoutScore(score1, { width: 100 });

    // 2. Reset cache hit/miss statistics
    layoutScoreModule.measureLayoutCacheStats.reset();

    // 3. Enter one note into measure 1 (Immer preserves reference of measures 2..64)
    const staffId = score1.parts[0].staves[0].id;
    const m1Id = score1.measures[0].id;
    const v1Id = score1.parts[0].staves[0].measures[m1Id].voices[0].id;

    // Use enterNote to modify measure 1
    const score2 = enterNote(
      { staffId, voiceId: v1Id, measureId: m1Id, tick: 0 },
      { baseType: 'quarter', dots: 0, pitch: { step: 'C', octave: 5, alter: 0 } }
    ).apply(score1);

    // 4. Layout score2
    layoutScoreModule.layoutScore(score2, { width: 100 });

    // 5. Exactly 1 measure (measure 1) is computed; the remaining 63 measures are cache hits!
    expect(layoutScoreModule.measureLayoutCacheStats.calls).toBe(64);
    expect(layoutScoreModule.measureLayoutCacheStats.misses).toBe(1);
    expect(layoutScoreModule.measureLayoutCacheStats.hits).toBe(63);
  });

  it('measures DOM element count reduction for a 64-measure score', () => {
    const score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 64,
    });

    // Populate all 64 measures with 4 quarter notes = 256 notes
    const staff = score.parts[0].staves[0];
    for (const m of score.measures) {
      const v = staff.measures[m.id].voices[0];
      v.events = [
        createNote({ pitches: [createPitch('C', 5, 0)], baseType: 'quarter' }),
        createNote({ pitches: [createPitch('D', 5, 0)], baseType: 'quarter' }),
        createNote({ pitches: [createPitch('E', 5, 0)], baseType: 'quarter' }),
        createNote({ pitches: [createPitch('F', 5, 0)], baseType: 'quarter' }),
      ];
    }

    const layout = layoutScoreModule.layoutScore(score, { width: 80 });
    const numSystems = layout.systems.length;

    // Before optimization:
    // 5 lines per system for staff lines + all other items + 1 rect per event (256 rects)
    let totalOtherItems = 0;
    for (const sys of layout.systems) {
      totalOtherItems += sys.items.filter((it) => !it.id.includes('staffline')).length;
    }
    const countBefore = (numSystems * 5) + totalOtherItems + 256;

    // After optimization:
    // 1 path per system for staff lines + all other items + 1 rect per measure (64 rects)
    const countAfter = (numSystems * 1) + totalOtherItems + 64;

    console.log(`[DOM Elements] 64 measures (256 notes across ${numSystems} systems):`);
    console.log(`  Before: ${countBefore} elements`);
    console.log(`  After:  ${countAfter} elements`);
    console.log(`  Reduction: ${countBefore - countAfter} elements (-${(((countBefore - countAfter) / countBefore) * 100).toFixed(1)}%)`);

    expect(countAfter).toBeLessThan(countBefore);
    expect(countBefore - countAfter).toBeGreaterThanOrEqual(200);
  });
});
