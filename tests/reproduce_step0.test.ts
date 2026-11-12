import { describe, it } from 'vitest';
import { createNote, createPitch, createRest, createEmptyScore } from '../src/core/factory';
import { groupBeams } from '../src/layout/beams';
import { PPQ, durationTicks } from '../src/core/time';
import { enterNote, enterRest } from '../src/core/input';
import { validateScore } from '../src/core/validate';
import { layoutScore } from '../src/layout/layoutScore';
import { renderSvgToString } from '../src/render/renderSvg';
import { buildBeamDemoScore } from '../src/ui/beamDemoScore';

describe('STEP 0 CLOSING CHECKS', () => {
  it('0a: prints groups from groupBeams and start ticks for six 16ths', () => {
    const events = [
      createNote({ pitches: [createPitch('C', 4, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('D', 4, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('E', 4, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('F', 4, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('G', 4, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('A', 4, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('B', 4, 0)], baseType: 'quarter' }),
      createRest({ baseType: 'quarter' }),
    ];

    let t = 0;
    const ticks: number[] = [];
    for (const ev of events) {
      ticks.push(t);
      t += ev.duration;
    }

    const groups = groupBeams(events, { num: 4, den: 4 });

    console.log('--- 0a: SIX 16THS IN 4/4 ---');
    events.forEach((ev, i) => {
      console.log(`Note ${i} (${ev.id.slice(0, 8)}): baseType=${ev.baseType}, startTick=${ticks[i]}, dur=${ev.duration}`);
    });
    console.log('groupBeams groups:', JSON.stringify(groups, null, 2));
    for (const g of groups) {
      const gEvents = g.eventIds.map((id) => events.find((e) => e.id === id)!);
      const startTicks = g.eventIds.map((id) => ticks[events.findIndex((e) => e.id === id)]);
      console.log(`Group with ${g.eventIds.length} notes: startTicks=[${startTicks.join(', ')}]`);
    }
  });

  it('0b: enter rests with Digit0 and different durations in order', () => {
    console.log('--- 0b: REST ENTRY SEQUENCE IN 4/4 ---');
    let score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 2,
    });

    const staffId = score.parts[0].staves[0].id;
    const mId = score.measures[0].id;
    const vId = score.parts[0].staves[0].measures[mId].voices[0].id;

    // Sequence from human observation:
    // 3 sixteenths, a 16th rest, an eighth rest, a quarter rest...
    const entries: Array<{ kind: 'note' | 'rest'; baseType: '16th' | 'eighth' | 'quarter'; step: string }> = [
      { kind: 'note', baseType: '16th', step: 'C' },
      { kind: 'note', baseType: '16th', step: 'D' },
      { kind: 'note', baseType: '16th', step: 'E' },
      { kind: 'rest', baseType: '16th', step: 'C' },
      { kind: 'rest', baseType: 'eighth', step: 'C' },
      { kind: 'rest', baseType: 'quarter', step: 'C' },
    ];

    let curTick = 0;
    for (let stepIdx = 0; stepIdx < entries.length; stepIdx++) {
      const entry = entries[stepIdx];
      const cursor = { staffId, measureId: mId, voiceId: vId, tick: curTick };
      const cmd = entry.kind === 'note'
        ? enterNote(cursor, { pitch: createPitch(entry.step as any, 4, 0), baseType: entry.baseType })
        : enterRest(cursor, { baseType: entry.baseType });
      score = cmd.apply(score);
      const dur = durationTicks(entry.baseType);
      curTick += dur;

      const events = score.parts[0].staves[0].measures[mId].voices[0].events;
      let totalDur = 0;
      let tickTracker = 0;
      console.log(`After entry ${stepIdx + 1} (${entry.kind} ${entry.baseType}):`);
      events.forEach((ev, eIdx) => {
        console.log(`  [${eIdx}] ${ev.kind} ${ev.baseType} dots=${ev.dots} startTick=${tickTracker} dur=${ev.duration}`);
        totalDur += ev.duration;
        tickTracker += ev.duration;
      });
      console.log(`  Total duration = ${totalDur} / 3840 (valid: ${totalDur === 3840})`);
      const val = validateScore(score);
      console.log(`  validateScore issues: ${val.length}`);
    }
  });

  it('0b property test: random entries of notes and rests of all durations (500 runs) never overfill/underfill', () => {
    const baseTypes = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd'] as const;
    const pitches = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

    let seed = 42981;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    let score = createEmptyScore({
      clef: { sign: 'G', line: 2 },
      keySig: 0,
      timeSig: { num: 4, den: 4 },
      measures: 4,
    });
    const staffId = score.parts[0].staves[0].id;

    for (let run = 0; run < 500; run++) {
      const mIdx = Math.floor(rand() * score.measures.length);
      const mDef = score.measures[mIdx];
      const vId = score.parts[0].staves[0].measures[mDef.id].voices[0].id;
      const mEvents = score.parts[0].staves[0].measures[mDef.id].voices[0].events;

      // Pick a random event's start tick or random snap
      let curT = 0;
      const ticks = [0];
      for (const ev of mEvents) {
        curT += ev.duration;
        ticks.push(curT);
      }
      const tick = ticks[Math.floor(rand() * (ticks.length - 1))];
      const cursor = { staffId, measureId: mDef.id, voiceId: vId, tick };

      const bt = baseTypes[Math.floor(rand() * baseTypes.length)];
      const isRest = rand() < 0.35;
      const pStep = pitches[Math.floor(rand() * pitches.length)];

      const cmd = isRest
        ? enterRest(cursor, { baseType: bt })
        : enterNote(cursor, { pitch: createPitch(pStep, 4, 0), baseType: bt });

      score = cmd.apply(score);
      const errors = validateScore(score);
      if (errors.length > 0) {
        throw new Error(`validateScore failed on run ${run}: ${JSON.stringify(errors)}`);
      }
    }
  });

  it('0c: multi-system wrapping stem directions for M3d demo', () => {
    console.log('--- 0c: M3D DEMO WRAPPED SYSTEMS STEM DIRECTIONS ---');
    const score = buildBeamDemoScore('G');
    const testWidths = [45, 60, 80];

    for (const w of testWidths) {
      const layout = layoutScore(score, { width: w });
      console.log(`\nWidth ${w} -> ${layout.systems.length} systems:`);
      layout.systems.forEach((sys, sIdx) => {
        const beams = sys.items.filter((it) => it.kind === 'beam');
        const stems = sys.items.filter((it) => it.kind === 'line' && it.id.endsWith('-stem'));
        console.log(`  System ${sIdx} (y=${sys.y}): ${beams.length} beams, ${stems.length} stems`);
        beams.forEach((b) => {
          const stemIds = (b.eventIds ?? []).map((id) => `${id}-stem`);
          const groupStems = stems.filter((st) => stemIds.includes(st.id));
          const dirs = groupStems.map((st) => (st.y2! > st.y ? 'down' : 'up'));
          const allSame = dirs.every((d) => d === dirs[0]);
          if (!allSame) {
            console.error(`  MISMATCH in System ${sIdx} beam ${b.id}: dirs=${dirs.join(',')}`);
          }
        });
      });
    }
  });
});
