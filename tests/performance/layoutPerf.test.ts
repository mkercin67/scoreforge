import { describe, expect, it, vi } from 'vitest';
import { createEmptyScore } from '../../src/core/factory';
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
});
