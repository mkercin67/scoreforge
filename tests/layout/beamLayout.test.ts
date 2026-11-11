import { describe, expect, it } from 'vitest';
import {
  createMeasure,
  createNote,
  createPart,
  createPitch,
  createRest,
  createScore,
} from '../../src/core/factory';
import { Clef, ScoreEvent } from '../../src/core/model';
import { layoutScore, measureLayoutCacheStats } from '../../src/layout/layoutScore';
import { pitchToStaffPosition, staffPositionToY } from '../../src/layout/pitch';
import {
  computeBeamGroupGeometry,
  getBeamGroupStemDirection,
  BeamStemInput,
} from '../../src/layout/beamLayout';
import { renderSvgToString } from '../../src/render/renderSvg';
import { hitTestEvent } from '../../src/layout/mouse';

function makeBeamScore(
  events: ScoreEvent[],
  timeSig = { num: 4, den: 4 },
  clef: Clef = { sign: 'G', line: 2 },
  keySig = 0
) {
  const score = createScore({ title: 'Beam Test' });
  const m1 = createMeasure(timeSig, keySig);
  const part = createPart({ name: 'Test', clef });
  score.measures = [m1];
  score.parts = [part];
  part.staves[0].measures[m1.id] = { voices: [{ id: 'v1', events }] };
  return { score, measureId: m1.id };
}

function getLineYAtX(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (Math.abs(x2 - x1) < 1e-12) return y1;
  return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
}

describe('beamLayout geometry and layoutScore integration (Section B)', () => {
  it('determines uniform group stem direction by farthest pitch from middle line (treble B4, bass D3, tie-break down)', () => {
    const treble: Clef = { sign: 'G', line: 2 };
    const bass: Clef = { sign: 'F', line: 4 };

    // Single middle line B4 -> down
    expect(getBeamGroupStemDirection([[pitchToStaffPosition(createPitch('B', 4, 0), treble)]])).toBe('down');
    // Below middle: E4 (-4), G4 (-2) -> up
    expect(
      getBeamGroupStemDirection([
        [pitchToStaffPosition(createPitch('E', 4, 0), treble)],
        [pitchToStaffPosition(createPitch('G', 4, 0), treble)],
      ])
    ).toBe('up');
    // Straddling: E4 (-4), C5 (+1) -> farthest is E4 -> up
    expect(
      getBeamGroupStemDirection([
        [pitchToStaffPosition(createPitch('E', 4, 0), treble)],
        [pitchToStaffPosition(createPitch('C', 5, 0), treble)],
      ])
    ).toBe('up');
    // Tie-break: G4 (-2) + D5 (+2) -> down
    expect(
      getBeamGroupStemDirection([
        [pitchToStaffPosition(createPitch('G', 4, 0), treble)],
        [pitchToStaffPosition(createPitch('D', 5, 0), treble)],
      ])
    ).toBe('down');
    // Bass: D3 (step 4) -> down; G2 (step 0) + E3 (step 5) -> farthest G2 -> up
    expect(
      getBeamGroupStemDirection([[pitchToStaffPosition(createPitch('D', 3, 0), bass)]])
    ).toBe('down');
    expect(
      getBeamGroupStemDirection([
        [pitchToStaffPosition(createPitch('G', 2, 0), bass)],
        [pitchToStaffPosition(createPitch('E', 3, 0), bass)],
      ])
    ).toBe('up');
  });

  it('all stems in a beamed group end on the primary beam line (tolerance 1e-6) and have length >= 2.5', () => {
    const pitches: Array<[ 'C'|'D'|'E'|'F'|'G'|'A'|'B', number ]> = [
      ['E', 4],
      ['C', 5],
      ['F', 4],
      ['D', 5],
    ];
    const notes = pitches.map(([step, oct]) =>
      createNote({ pitches: [createPitch(step, oct, 0)], baseType: '16th' })
    );
    const { score } = makeBeamScore(notes);
    const layout = layoutScore(score, { width: 80 });

    const beams = layout.items.filter((it) => it.kind === 'beam');
    const primaryBeam = beams.find((b) => b.level === 1);
    expect(primaryBeam).toBeDefined();
    expect(primaryBeam!.points?.length).toBe(4);

    // Outer edge of primary beam spans between xFirst..xLast (first two points or top/bottom depending on dir)
    // Verify stems end on beam outer line within 1e-6 and stem length >= 2.5
    const stems = notes.map((n) => layout.items.find((it) => it.id === `${n.id}-stem`)!);
    for (const st of stems) {
      expect(st).toBeDefined();
      expect(Math.abs((st.y2 ?? 0) - st.y)).toBeGreaterThanOrEqual(2.5 - 1e-6);
    }

    // Check collinearity along primary beam line
    const p0 = primaryBeam!.points![0];
    const p1 = primaryBeam!.points![1];
    for (const st of stems) {
      const expectedBeamY = getLineYAtX(p0.x, p0.y, p1.x, p1.y, st.x);
      expect(Math.abs((st.y2 ?? 0) - expectedBeamY)).toBeLessThan(1e-6);
    }

    // No flags on beamed notes!
    const flags = layout.items.filter((it) => it.id.endsWith('-flag'));
    expect(flags.length).toBe(0);
  });

  it('enforces flat slope (0) for equal pitches and clamps slope to [-1.0, +1.0] across ascending and descending scales', () => {
    // Equal pitches
    const flatNotes = [
      createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'eighth' }),
      createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'eighth' }),
    ];
    const flatLayout = layoutScore(makeBeamScore(flatNotes).score, { width: 80 });
    const flatBeam = flatLayout.items.find((it) => it.kind === 'beam' && it.level === 1)!;
    expect(Math.abs(flatBeam.points![1].y - flatBeam.points![0].y)).toBeLessThan(1e-6);

    // Extreme ascending (C4 to E5) -> negative deltaY clamped to -1.0
    const ascNotes = [
      createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'eighth' }),
      createNote({ pitches: [createPitch('E', 5, 0)], baseType: 'eighth' }),
    ];
    const ascLayout = layoutScore(makeBeamScore(ascNotes).score, { width: 80 });
    const ascBeam = ascLayout.items.find((it) => it.kind === 'beam' && it.level === 1)!;
    const ascStems = ascNotes.map((n) => ascLayout.items.find((it) => it.id === `${n.id}-stem`)!);
    const ascDeltaY = (ascStems[1].y2 ?? 0) - (ascStems[0].y2 ?? 0);
    expect(ascDeltaY).toBeCloseTo(-1.0, 5);
    expect(Math.abs(ascBeam.points![1].y - ascBeam.points![0].y)).toBeLessThanOrEqual(1.0 + 0.05);

    // Extreme descending (E5 down to C4) -> positive deltaY clamped to +1.0
    const descNotes = [
      createNote({ pitches: [createPitch('E', 5, 0)], baseType: 'eighth' }),
      createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'eighth' }),
    ];
    const descLayout = layoutScore(makeBeamScore(descNotes).score, { width: 80 });
    const descStems = descNotes.map((n) => descLayout.items.find((it) => it.id === `${n.id}-stem`)!);
    const descDeltaY = (descStems[1].y2 ?? 0) - (descStems[0].y2 ?? 0);
    expect(descDeltaY).toBeCloseTo(1.0, 5);
  });

  it('handles V-shaped and straddling-middle-line groups with min stem length >= 2.5', () => {
    // V-shape with middle peak pushing up into beam: E4 - C5 - E4
    // Farthest from B4 is E4 (-4 vs +1), so stems point UP; C5 in the middle requires beam shifted higher!
    const vNotes = [
      createNote({ pitches: [createPitch('E', 4, 0)], baseType: 'eighth' }),
      createNote({ pitches: [createPitch('C', 5, 0)], baseType: 'eighth' }),
      createNote({ pitches: [createPitch('E', 4, 0)], baseType: 'eighth' }),
    ];
    const { score: vScore } = makeBeamScore(vNotes, { num: 3, den: 8 });
    const vLayout = layoutScore(vScore, { width: 80 });
    const vStems = vNotes.map((n) => vLayout.items.find((it) => it.id === `${n.id}-stem`)!);
    for (const s of vStems) {
      expect(s.y2!).toBeLessThan(s.y); // all UP
      expect(s.y - s.y2!).toBeGreaterThanOrEqual(2.5 - 1e-6);
    }

    // Straddling middle line: G4, B4, D5, F4 (4/4 16ths -> 1 group)
    const straddle = [
      createNote({ pitches: [createPitch('G', 4, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('B', 4, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('D', 5, 0)], baseType: '16th' }),
      createNote({ pitches: [createPitch('F', 4, 0)], baseType: '16th' }),
    ];
    const sLayout = layoutScore(makeBeamScore(straddle).score, { width: 80 });
    const sStems = straddle.map((n) => sLayout.items.find((it) => it.id === `${n.id}-stem`)!);
    const dirFirst = (sStems[0].y2 ?? 0) > sStems[0].y;
    for (const s of sStems) {
      expect((s.y2 ?? 0) > s.y).toBe(dirFirst);
      expect(Math.abs((s.y2 ?? 0) - s.y)).toBeGreaterThanOrEqual(2.5 - 1e-6);
    }
  });

  it('draws level 2 secondary beams for eighth+two sixteenths and 1.25-space stubs pointing toward subgroup neighbour for dotted-eighth+16th', () => {
    // Case A: eighth + two 16ths -> 1 level-1 beam, 1 level-2 span across last 2 notes
    const e1 = createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'eighth' });
    const s1 = createNote({ pitches: [createPitch('A', 4, 0)], baseType: '16th' });
    const s2 = createNote({ pitches: [createPitch('B', 4, 0)], baseType: '16th' });
    const l1 = layoutScore(makeBeamScore([e1, s1, s2]).score, { width: 80 });
    const l1Beams = l1.items.filter((it) => it.kind === 'beam');
    expect(l1Beams.filter((b) => b.level === 1).length).toBe(1);
    expect(l1Beams.filter((b) => b.level === 2).length).toBe(1);
    const secBeam = l1Beams.find((b) => b.level === 2)!;
    const stemS1 = l1.items.find((it) => it.id === `${s1.id}-stem`)!;
    const stemS2 = l1.items.find((it) => it.id === `${s2.id}-stem`)!;
    expect(secBeam.points![0].x).toBeLessThanOrEqual(stemS1.x);
    expect(secBeam.points![1].x).toBeGreaterThanOrEqual(stemS2.x);

    // Case B: dotted eighth + 16th -> level 2 stub of length 1.25 pointing LEFT from second note
    const d8 = createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'eighth', dots: 1 });
    const sLast = createNote({ pitches: [createPitch('A', 4, 0)], baseType: '16th' });
    const l2 = layoutScore(makeBeamScore([d8, sLast]).score, { width: 80 });
    const stubRightGroup = l2.items.filter((it) => it.kind === 'beam' && it.level === 2);
    expect(stubRightGroup.length).toBe(1);
    const stubPts = stubRightGroup[0].points!;
    const widthLeft = Math.abs(stubPts[1].x - stubPts[0].x);
    expect(widthLeft).toBeCloseTo(1.25, 5);
    const stemLast = l2.items.find((it) => it.id === `${sLast.id}-stem`)!;
    // Points left from stemLast.x
    expect(stubPts[1].x).toBeCloseTo(stemLast.x + 0.06, 3);
    expect(stubPts[0].x).toBeLessThan(stemLast.x);

    // Case C: 16th + dotted eighth -> level 2 stub of length 1.25 pointing RIGHT from first note
    const sFirst = createNote({ pitches: [createPitch('G', 4, 0)], baseType: '16th' });
    const d8Last = createNote({ pitches: [createPitch('A', 4, 0)], baseType: 'eighth', dots: 1 });
    const l3 = layoutScore(makeBeamScore([sFirst, d8Last]).score, { width: 80 });
    const stubLeftGroup = l3.items.filter((it) => it.kind === 'beam' && it.level === 2);
    expect(stubLeftGroup.length).toBe(1);
    const stubPtsR = stubLeftGroup[0].points!;
    expect(Math.abs(stubPtsR[1].x - stubPtsR[0].x)).toBeCloseTo(1.25, 5);
    const stemFirst = l3.items.find((it) => it.id === `${sFirst.id}-stem`)!;
    expect(stubPtsR[0].x).toBeCloseTo(stemFirst.x - 0.06, 3);
    expect(stubPtsR[1].x).toBeGreaterThan(stemFirst.x);

    // Case D: 32nd notes emit levels 1, 2, and 3 on notehead side separated by beamThickness + beamSpacing = 0.75
    const n32a = createNote({ pitches: [createPitch('E', 4, 0)], baseType: '32nd' });
    const n32b = createNote({ pitches: [createPitch('E', 4, 0)], baseType: '32nd' });
    const l32 = layoutScore(makeBeamScore([n32a, n32b]).score, { width: 80 });
    const b1 = l32.items.find((it) => it.kind === 'beam' && it.level === 1)!;
    const b2 = l32.items.find((it) => it.kind === 'beam' && it.level === 2)!;
    const b3 = l32.items.find((it) => it.kind === 'beam' && it.level === 3)!;
    expect(b1 && b2 && b3).toBeTruthy();
    // Stems point UP (E4), so notehead side is +Y: each level shifts down by +0.75
    expect(b2.points![0].y - b1.points![0].y).toBeCloseTo(0.75, 5);
    expect(b3.points![0].y - b2.points![0].y).toBeCloseTo(0.75, 5);
  });

  it('draws chord eighths with one stem per chord and zero flags', () => {
    const c1 = createNote({
      pitches: [createPitch('E', 4, 0), createPitch('G', 4, 0), createPitch('B', 4, 0)],
      baseType: 'eighth',
    });
    const c2 = createNote({
      pitches: [createPitch('F', 4, 0), createPitch('A', 4, 0), createPitch('C', 5, 0)],
      baseType: 'eighth',
    });
    const layout = layoutScore(makeBeamScore([c1, c2]).score, { width: 80 });
    expect(layout.items.filter((it) => it.id.endsWith('-stem')).length).toBe(2);
    expect(layout.items.filter((it) => it.id.endsWith('-flag')).length).toBe(0);
    expect(layout.items.filter((it) => it.kind === 'beam' && it.level === 1).length).toBe(1);
  });

  it('moves beam endpoints cleanly when override dx is applied to a beamed note', () => {
    const n1 = createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'eighth' });
    const n2 = createNote({ pitches: [createPitch('B', 4, 0)], baseType: 'eighth' });
    const { score } = makeBeamScore([n1, n2]);

    const beforeLayout = layoutScore(score, { width: 80 });
    const beforeBeam = beforeLayout.items.find((it) => it.kind === 'beam' && it.level === 1)!;
    const beforeStem2 = beforeLayout.items.find((it) => it.id === `${n2.id}-stem`)!;

    score.overrides[n2.id] = { dx: 2.0 };
    const afterLayout = layoutScore(score, { width: 80 });
    const afterBeam = afterLayout.items.find((it) => it.kind === 'beam' && it.level === 1)!;
    const afterStem2 = afterLayout.items.find((it) => it.id === `${n2.id}-stem`)!;

    expect(afterStem2.x - beforeStem2.x).toBeCloseTo(2.0, 5);
    expect(afterBeam.points![1].x - beforeBeam.points![1].x).toBeCloseTo(2.0, 5);
    const p0 = afterBeam.points![0];
    const p1 = afterBeam.points![1];
    expect(Math.abs((afterStem2.y2 ?? 0) - getLineYAtX(p0.x, p0.y, p1.x, p1.y, afterStem2.x))).toBeLessThan(1e-6);
  });

  it('renders beams in SVG as <path> with data-beam-group and data-event-ids, zero <text> and unbeamed single keeps flag', () => {
    const q = createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'quarter' });
    const r = createRest({ baseType: 'eighth' });
    const single8 = createNote({ pitches: [createPitch('A', 4, 0)], baseType: 'eighth' });
    const b1 = createNote({ pitches: [createPitch('C', 5, 0)], baseType: 'eighth' });
    const b2 = createNote({ pitches: [createPitch('D', 5, 0)], baseType: 'eighth' });
    const { score } = makeBeamScore([q, r, single8, b1, b2]);

    const layout = layoutScore(score, { width: 80 });
    const svg = renderSvgToString(layout);
    expect(svg).not.toContain('<text');
    expect(svg).toContain('data-beam-group="');
    expect(svg).toContain(`data-event-ids="${b1.id},${b2.id}"`);
    expect(svg).toContain(`data-id="${single8.id}-flag"`);
    expect(svg).not.toContain(`data-id="${b1.id}-flag"`);

    // B6 hit test: clicking beam segment directly above/below a beamed note selects that note
    const b1Stem = layout.items.find((it) => it.id === `${b1.id}-stem`)!;
    const pBeam = layout.items.find((it) => it.kind === 'beam' && it.eventIds?.includes(b1.id))!;
    const hitY = (pBeam.points![0].y + pBeam.points![3].y) / 2;
    expect(hitTestEvent(layout, 0, b1Stem.x, hitY)).toEqual({ eventId: b1.id, kind: 'note' });
  });

  it('layout is deterministic and measure cache hits for unchanged measures on single-measure edit', () => {
    const score = createScore({ title: 'Cache Score' });
    const part = createPart('Flute');
    score.parts = [part];

    const measures = Array.from({ length: 8 }, () => createMeasure({ num: 4, den: 4 }));
    score.measures = measures;
    for (const m of measures) {
      part.staves[0].measures[m.id] = {
        voices: [
          {
            id: 'v1',
            events: [
              createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'eighth' }),
              createNote({ pitches: [createPitch('A', 4, 0)], baseType: 'eighth' }),
              createNote({ pitches: [createPitch('B', 4, 0)], baseType: 'eighth' }),
              createNote({ pitches: [createPitch('C', 5, 0)], baseType: 'eighth' }),
              createNote({ pitches: [createPitch('D', 5, 0)], baseType: 'half' }),
            ],
          },
        ],
      };
    }

    const l1 = layoutScore(score, { width: 82 });
    const l2 = layoutScore(score, { width: 82 });
    expect(l1.items).toEqual(l2.items);

    measureLayoutCacheStats.reset();
    // Mutate only measure 0 by replacing its StaffMeasure object reference
    part.staves[0].measures[measures[0].id] = {
      voices: [
        {
          id: 'v1',
          events: [
            createNote({ pitches: [createPitch('E', 4, 0)], baseType: 'eighth' }),
            createNote({ pitches: [createPitch('F', 4, 0)], baseType: 'eighth' }),
            createNote({ pitches: [createPitch('G', 4, 0)], baseType: 'half' }),
            createNote({ pitches: [createPitch('A', 4, 0)], baseType: 'quarter' }),
          ],
        },
      ],
    };

    layoutScore(score, { width: 82 });
    expect(measureLayoutCacheStats.calls).toBe(8);
    expect(measureLayoutCacheStats.misses).toBe(1);
    expect(measureLayoutCacheStats.hits).toBe(7);
  });

  it('pure computeBeamGroupGeometry uses midpoint subgroup rules for interior 16th stubs', () => {
    // 6/8 beat: dotted-8th (0..720), 16th (720..960), 8th (960..1440)
    // Interior 16th (index 1) has startTick=720 (not aligned on 480 eighth boundary) -> stub points LEFT
    const stems: BeamStemInput[] = [
      {
        eventId: 'ev0',
        baseType: 'eighth',
        stepPositions: [2],
        noteX: 10,
        stemX: 11.18,
        stemStartY: staffPositionToY(2) - 0.168,
        beamSideNoteY: staffPositionToY(2),
        naturalStemEndY: staffPositionToY(2) - 3.5,
        startTick: 0,
      },
      {
        eventId: 'ev1',
        baseType: '16th',
        stepPositions: [2],
        noteX: 15,
        stemX: 16.18,
        stemStartY: staffPositionToY(2) - 0.168,
        beamSideNoteY: staffPositionToY(2),
        naturalStemEndY: staffPositionToY(2) - 3.5,
        startTick: 720,
      },
      {
        eventId: 'ev2',
        baseType: 'eighth',
        stepPositions: [2],
        noteX: 20,
        stemX: 21.18,
        stemStartY: staffPositionToY(2) - 0.168,
        beamSideNoteY: staffPositionToY(2),
        naturalStemEndY: staffPositionToY(2) - 3.5,
        startTick: 960,
      },
    ];
    const geom = computeBeamGroupGeometry('bg-test', stems, 'up', 0.5, 0.25);
    const stub = geom.beamItems.find((b) => b.level === 2)!;
    expect(stub).toBeDefined();
    expect(Math.abs(stub.points![1].x - stub.points![0].x)).toBeCloseTo(1.25, 5);
    // Extends left from stem[1].x (16.18)
    expect(stub.points![1].x).toBeCloseTo(16.18 + 0.06, 3);
    expect(stub.points![0].x).toBeLessThan(16.18);
  });
});
