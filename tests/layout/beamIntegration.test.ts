import { describe, expect, it } from 'vitest';
import { createEmptyScore, createPitch } from '../../src/core/factory';
import {
  changePitch,
  convertToRest,
  History,
} from '../../src/core/commands';
import { enterNote } from '../../src/core/input';
import { layoutScore, measureLayoutCacheStats } from '../../src/layout/layoutScore';
import { buildBeamDemoScore } from '../../src/ui/beamDemoScore';

describe('Beam Integration (Section C)', () => {
  it('entering notes adds beam cleanly with zero leftover flags, convertToRest restores flag, undo/redo restores beam', () => {
    let score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 2,
    });
    const staff = score.parts[0].staves[0];
    const staffId = staff.id;
    const m0Id = score.measures[0].id;
    const v0Id = staff.measures[m0Id].voices[0].id;
    const history = new History(score);

    // 1. Enter first eighth at tick 0 -> 1 single eighth with flag, 0 beams
    score = history.do(
      enterNote(
        { staffId, measureId: m0Id, voiceId: v0Id, tick: 0 },
        { pitch: createPitch('G', 4, 0), baseType: 'eighth', dots: 0 }
      )
    );
    const lSingle = layoutScore(score, { width: 80 });
    expect(lSingle.items.filter((it) => it.kind === 'beam').length).toBe(0);
    expect(lSingle.items.filter((it) => it.id.endsWith('-flag')).length).toBe(1);

    // 2. Enter second eighth at tick 480 -> beamed pair, 0 flags, 1 beam
    score = history.do(
      enterNote(
        { staffId, measureId: m0Id, voiceId: v0Id, tick: 480 },
        { pitch: createPitch('A', 4, 0), baseType: 'eighth', dots: 0 }
      )
    );
    const lBeamed = layoutScore(score, { width: 80 });
    expect(lBeamed.items.filter((it) => it.kind === 'beam' && it.level === 1).length).toBe(1);
    expect(lBeamed.items.filter((it) => it.id.endsWith('-flag')).length).toBe(0);

    // 3. Change pitch of first note to C5 -> stem directions flip down, beam stays valid
    const firstEvId = score.parts[0].staves[0].measures[m0Id].voices[0].events[0].id;
    score = history.do(changePitch(firstEvId, [createPitch('C', 5, 0)]));
    const lFlipped = layoutScore(score, { width: 80 });
    const stem0 = lFlipped.items.find((it) => it.id === `${firstEvId}-stem`)!;
    expect(stem0.y2!).toBeGreaterThan(stem0.y); // pointing down
    expect(lFlipped.items.filter((it) => it.kind === 'beam').length).toBe(1);
    expect(lFlipped.items.filter((it) => it.id.endsWith('-flag')).length).toBe(0);

    // 4. Convert second note to rest -> beam removed, first note gets its flag back!
    const secondEvId = score.parts[0].staves[0].measures[m0Id].voices[0].events[1].id;
    score = history.do(convertToRest(secondEvId));
    const lBroken = layoutScore(score, { width: 80 });
    expect(lBroken.items.filter((it) => it.kind === 'beam').length).toBe(0);
    expect(lBroken.items.filter((it) => it.id === `${firstEvId}-flag`).length).toBe(1);

    // 5. Undo -> beam restored, flag removed!
    score = history.undo()!;
    const lUndo = layoutScore(score, { width: 80 });
    expect(lUndo.items.filter((it) => it.kind === 'beam').length).toBe(1);
    expect(lUndo.items.filter((it) => it.id.endsWith('-flag')).length).toBe(0);

    // 6. Redo -> beam gone again, flag restored!
    score = history.redo()!;
    const lRedo = layoutScore(score, { width: 80 });
    expect(lRedo.items.filter((it) => it.kind === 'beam').length).toBe(0);
    expect(lRedo.items.filter((it) => it.id === `${firstEvId}-flag`).length).toBe(1);
  });

  it('re-layouts only edited measure via WeakMap cache and wraps systems without stale beams', () => {
    const baseScore = buildBeamDemoScore('G');
    const history = new History(baseScore);

    // Initial wide layout -> primes cache for all 8 measures
    const wideLayout = layoutScore(baseScore, { width: 120 });
    expect(wideLayout.systems.length).toBeGreaterThanOrEqual(2);

    // Narrow layout wrapping across 3+ systems without stale beams: every beam sits inside its system bounds
    const narrowLayout = layoutScore(baseScore, { width: 55 });
    expect(narrowLayout.systems.length).toBeGreaterThanOrEqual(3);
    for (const sys of narrowLayout.systems) {
      const sysBeams = sys.items.filter((it) => it.kind === 'beam');
      const sysEventIds = new Set(sys.items.map((it) => it.eventId).filter(Boolean));
      for (const b of sysBeams) {
        for (const evId of b.eventIds ?? []) {
          expect(sysEventIds.has(evId)).toBe(true);
        }
      }
    }

    // Mutate single note in measure 0 via History command -> only measure 0 misses cache, measures 1..7 hit!
    measureLayoutCacheStats.reset();
    const targetEvId = baseScore.parts[0].staves[0].measures[baseScore.measures[0].id].voices[0].events[0].id;
    const edited = history.do(changePitch(targetEvId, [createPitch('E', 5, 0)]));
    layoutScore(edited, { width: 55 });

    expect(measureLayoutCacheStats.calls).toBe(8);
    expect(measureLayoutCacheStats.misses).toBe(1);
    expect(measureLayoutCacheStats.hits).toBe(7);
  });
});
