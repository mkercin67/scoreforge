import { describe, expect, it } from 'vitest';
import { createNote, createPitch, createRest } from '../../src/core/factory';
import { MeasureDef, ScoreEvent } from '../../src/core/model';
import { PPQ, durationTicks } from '../../src/core/time';
import { groupBeams, getBeatTicksForTimeSig } from '../../src/layout/beams';

function n8(pitchStep: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' = 'G', octave = 4) {
  return createNote({ pitches: [createPitch(pitchStep, octave, 0)], baseType: 'eighth' });
}

function n16(pitchStep: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' = 'G', octave = 4) {
  return createNote({ pitches: [createPitch(pitchStep, octave, 0)], baseType: '16th' });
}

function n32(pitchStep: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' = 'G', octave = 4) {
  return createNote({ pitches: [createPitch(pitchStep, octave, 0)], baseType: '32nd' });
}

function n4(pitchStep: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B' = 'G', octave = 4) {
  return createNote({ pitches: [createPitch(pitchStep, octave, 0)], baseType: 'quarter' });
}

describe('groupBeams (Section A)', () => {
  it('4/4: 8 eighths -> 4 groups of 2', () => {
    const events = Array.from({ length: 8 }, () => n8('G', 4));
    const groups = groupBeams(events, { num: 4, den: 4 });
    expect(groups).toEqual([
      { eventIds: [events[0].id, events[1].id] },
      { eventIds: [events[2].id, events[3].id] },
      { eventIds: [events[4].id, events[5].id] },
      { eventIds: [events[6].id, events[7].id] },
    ]);
  });

  it('4/4: 4 sixteenths + 2 eighths -> 2 groups matching quarter beats', () => {
    const events = [n16(), n16(), n16(), n16(), n8(), n8(), n4(), n4()];
    const groups = groupBeams(events, { num: 4, den: 4 });
    expect(groups).toEqual([
      { eventIds: [events[0].id, events[1].id, events[2].id, events[3].id] },
      { eventIds: [events[4].id, events[5].id] },
    ]);
  });

  it('4/4: eighth + quarter + eighth -> no beam groups (singles keep flags)', () => {
    const events = [n8('E', 4), n4('G', 4), n8('A', 4), n4('B', 4), n4('C', 5)];
    const groups = groupBeams(events, { num: 4, den: 4 });
    expect(groups).toEqual([]);
  });

  it('4/4: single eighth after a quarter keeps its flag (not grouped across beat boundary)', () => {
    const q = n4('C', 4);
    const e1 = n8('D', 4);
    const e2 = n8('E', 4);
    const q2 = n4('F', 4);
    // Beat 0: q (0..960), Beat 1: e1 (960..1440), e2 (1440..1920) -> grouped;
    // Wait: q (0..960), eighth rest (960..1440), single e1 (1440..1920) -> NOT grouped
    const r8 = createRest({ baseType: 'eighth' });
    const events = [q, r8, e1, e2, q2];
    const groups = groupBeams(events, { num: 4, den: 4 });
    // Beat 1: r8 (960..1440), e1 (1440..1920); Beat 2: e2 (1920..2400) -> NO group!
    expect(groups).toEqual([]);
  });

  it('4/4: eighth rest in the middle of four eighths breaks into two groups', () => {
    const e0 = n8('E', 4);
    const e1 = n8('F', 4);
    const r = createRest({ baseType: 'eighth' });
    const e2 = n8('G', 4);
    const e3 = n8('A', 4);
    const e4 = n8('B', 4);
    // Beat 0: [e0, e1] (grouped); Beat 1: [r, e2] (broken by rest, e2 stays ungrouped); Beat 2: [e3, e4] (grouped)
    const groupsA = groupBeams([e0, e1, r, e2, e3, e4], { num: 4, den: 4 });
    expect(groupsA).toEqual([
      { eventIds: [e0.id, e1.id] },
      { eventIds: [e3.id, e4.id] },
    ]);

    // In 2/2 (half-note beat = 1920 ticks), 16ths inside beat 0 broken by rest -> 2 groups of 2
    const s0 = n16('C', 4);
    const s1 = n16('D', 4);
    const restMid = createRest({ baseType: 'eighth' });
    const s2 = n16('E', 4);
    const s3 = n16('F', 4);
    const groupsCut = groupBeams([s0, s1, restMid, s2, s3], { num: 2, den: 2 });
    expect(groupsCut).toEqual([
      { eventIds: [s0.id, s1.id] },
      { eventIds: [s2.id, s3.id] },
    ]);
  });

  it('6/8: 6 eighths -> 2 groups of 3', () => {
    const events = Array.from({ length: 6 }, () => n8('A', 4));
    const groups = groupBeams(events, { num: 6, den: 8 });
    expect(groups).toEqual([
      { eventIds: [events[0].id, events[1].id, events[2].id] },
      { eventIds: [events[3].id, events[4].id, events[5].id] },
    ]);
  });

  it('9/8 and 12/8: compound beats of 3 eighths', () => {
    const events9 = Array.from({ length: 9 }, () => n8('F', 4));
    expect(groupBeams(events9, { num: 9, den: 8 }).map((g) => g.eventIds.length)).toEqual([3, 3, 3]);

    const events12 = Array.from({ length: 12 }, () => n8('F', 4));
    expect(groupBeams(events12, { num: 12, den: 8 }).map((g) => g.eventIds.length)).toEqual([3, 3, 3, 3]);
  });

  it('3/4: 6 eighths -> 3 groups of 2 quarter-note beats', () => {
    const events = Array.from({ length: 6 }, () => n8('B', 4));
    const groups = groupBeams(events, { num: 3, den: 4 });
    expect(groups).toEqual([
      { eventIds: [events[0].id, events[1].id] },
      { eventIds: [events[2].id, events[3].id] },
      { eventIds: [events[4].id, events[5].id] },
    ]);
  });

  it('3/8: whole measure beamed as one group of 3', () => {
    const events = [n8('C', 5), n8('B', 4), n8('A', 4)];
    const groups = groupBeams(events, { num: 3, den: 8 });
    expect(groups).toEqual([{ eventIds: [events[0].id, events[1].id, events[2].id] }]);
  });

  it('2/2: half-note beat grouping (4 eighths per beat)', () => {
    const events = Array.from({ length: 8 }, () => n8('D', 4));
    const groups = groupBeams(events, { num: 2, den: 2 });
    expect(groups).toEqual([
      { eventIds: [events[0].id, events[1].id, events[2].id, events[3].id] },
      { eventIds: [events[4].id, events[5].id, events[6].id, events[7].id] },
    ]);
  });

  it('fallback denominator beat unit for irregular meters (e.g. 5/8, 4/16)', () => {
    expect(getBeatTicksForTimeSig({ num: 5, den: 8 })).toBe(PPQ / 2);
    // In 5/8 fallback (beat = 480 = 1 eighth), two 16ths in one eighth beat beam together
    const s0 = n16('G', 4);
    const s1 = n16('A', 4);
    const e2 = n8('B', 4);
    const groups = groupBeams([s0, s1, e2], { num: 5, den: 8 });
    expect(groups).toEqual([{ eventIds: [s0.id, s1.id] }]);
  });

  it('dotted eighth + sixteenth pair is beamed together', () => {
    const d8 = createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'eighth', dots: 1 });
    const s16 = n16('A', 4);
    const groups = groupBeams([d8, s16], { num: 4, den: 4 });
    expect(groups).toEqual([{ eventIds: [d8.id, s16.id] }]);
  });

  it('events are matched by START TICK so an eighth crossing a beat boundary does not beam across beats', () => {
    // Beat 0: 16th (0..240), dotted-8th (240..960), Beat 1: 8th (960..1440) -> beat 0 ends at 960, next starts at 960
    // Beat 0: 16th (0..240), 16th (240..480), quarter-ish? Try: 16th(0..240) + 16th(240..480) + 16th(480..720) + dotted-8th(720..1440) + 16th(1440..1680)
    // Event at startTick 720 starts in beat 0 (0..960), ends at 1440 (in beat 1). Event after starts at 1440 (beat 1). Must break!
    const s1 = n16('C', 4);
    const s2 = n16('D', 4);
    const s3 = n16('E', 4);
    const d8Cross = createNote({ pitches: [createPitch('F', 4, 0)], baseType: 'eighth', dots: 1 }); // 720..1440
    const sAfter = n16('G', 4); // 1440..1680 (beat 1)
    const sAfter2 = n16('A', 4); // 1680..1920 (beat 1)

    const groups = groupBeams([s1, s2, s3, d8Cross, sAfter, sAfter2], { num: 4, den: 4 });
    expect(groups).toEqual([
      { eventIds: [s1.id, s2.id, s3.id, d8Cross.id] },
      { eventIds: [sAfter.id, sAfter2.id] },
    ]);
  });

  it('tuplets: same tuplet events beam together; mixed tuplet/non-tuplet breaks group', () => {
    const t1 = createNote({
      pitches: [createPitch('G', 4, 0)],
      baseType: 'eighth',
      tuplet: { actual: 3, normal: 2 },
    });
    const t2 = createNote({
      pitches: [createPitch('A', 4, 0)],
      baseType: 'eighth',
      tuplet: { actual: 3, normal: 2 },
    });
    const t3 = createNote({
      pitches: [createPitch('B', 4, 0)],
      baseType: 'eighth',
      tuplet: { actual: 3, normal: 2 },
    });
    expect(groupBeams([t1, t2, t3], { num: 4, den: 4 })).toEqual([
      { eventIds: [t1.id, t2.id, t3.id] },
    ]);

    // Mix tuplet 16th and non-tuplet 16th within same beat -> break between tuplet and non-tuplet
    const ts1 = createNote({
      pitches: [createPitch('G', 4, 0)],
      baseType: '16th',
      tuplet: { actual: 3, normal: 2 },
    });
    const ts2 = createNote({
      pitches: [createPitch('A', 4, 0)],
      baseType: '16th',
      tuplet: { actual: 3, normal: 2 },
    });
    const reg1 = n16('B', 4);
    const reg2 = n16('C', 5);
    expect(groupBeams([ts1, ts2, reg1, reg2], { num: 4, den: 4 })).toEqual([
      { eventIds: [ts1.id, ts2.id] },
      { eventIds: [reg1.id, reg2.id] },
    ]);
  });

  it('chords with beamable durations group together identically to single notes', () => {
    const c1 = createNote({
      pitches: [createPitch('E', 4, 0), createPitch('G', 4, 0)],
      baseType: 'eighth',
    });
    const c2 = createNote({
      pitches: [createPitch('F', 4, 0), createPitch('A', 4, 0)],
      baseType: 'eighth',
    });
    const groups = groupBeams([c1, c2], { num: 4, den: 4 });
    expect(groups).toEqual([{ eventIds: [c1.id, c2.id] }]);
  });

  it('32nd notes beam cleanly in subgroups and beat boundaries', () => {
    const notes32 = Array.from({ length: 8 }, () => n32('C', 5));
    const groups = groupBeams(notes32, { num: 4, den: 4 });
    expect(groups).toEqual([{ eventIds: notes32.map((x) => x.id) }]);
  });

  it('property test: beamable notes only, no beat crossing, disjoint groups, chronological IDs across meters', () => {
    const timeSigs: Array<MeasureDef['timeSig']> = [
      { num: 4, den: 4 },
      { num: 3, den: 4 },
      { num: 2, den: 4 },
      { num: 6, den: 8 },
      { num: 9, den: 8 },
      { num: 3, den: 8 },
      { num: 2, den: 2 },
    ];
    const baseTypes = ['quarter', 'eighth', '16th', '32nd'] as const;

    // Deterministic LCG PRNG
    let seed = 133742;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let trial = 0; trial < 120; trial++) {
      const ts = timeSigs[trial % timeSigs.length];
      const maxTicks = Math.round((ts.num * 4 * PPQ) / ts.den);
      const events: ScoreEvent[] = [];
      let tick = 0;

      while (tick < maxTicks) {
        const bt = baseTypes[Math.floor(nextRand() * baseTypes.length)];
        const isRest = nextRand() < 0.22;
        const dur = durationTicks(bt, 0);
        if (tick + dur > maxTicks) {
          events.push(createNote({ pitches: [createPitch('G', 4, 0)], baseType: '16th' }));
          tick += durationTicks('16th', 0);
          continue;
        }
        events.push(
          isRest
            ? createRest({ baseType: bt })
            : createNote({ pitches: [createPitch('G', 4, 0)], baseType: bt })
        );
        tick += dur;
      }

      const groups = groupBeams(events, ts);
      const beatTicks = getBeatTicksForTimeSig(ts);

      // Compute startTick + index map
      const metaById = new Map<string, { idx: number; startTick: number; beat: number; ev: ScoreEvent }>();
      let curTick = 0;
      events.forEach((ev, idx) => {
        metaById.set(ev.id, {
          idx,
          startTick: curTick,
          beat: Math.floor(curTick / beatTicks),
          ev,
        });
        curTick += ev.duration;
      });

      const seenIds = new Set<string>();
      const flatOrder: number[] = [];

      for (const g of groups) {
        expect(g.eventIds.length).toBeGreaterThanOrEqual(2);
        const beats = new Set<number>();
        for (const id of g.eventIds) {
          expect(seenIds.has(id)).toBe(false);
          seenIds.add(id);
          const m = metaById.get(id)!;
          expect(m).toBeDefined();
          expect(m.ev.kind).toBe('note');
          expect(['eighth', '16th', '32nd']).toContain(m.ev.baseType);
          beats.add(m.beat);
          flatOrder.push(m.idx);
        }
        // Must not cross a beat boundary
        expect(beats.size).toBe(1);
      }

      // Concatenated group ids keep strict chronological time order
      for (let i = 1; i < flatOrder.length; i++) {
        expect(flatOrder[i]).toBeGreaterThan(flatOrder[i - 1]);
      }
    }
  });
});
