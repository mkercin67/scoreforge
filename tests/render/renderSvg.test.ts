import { describe, expect, it } from 'vitest';
import { createMeasure, createNote, createPart, createPitch, createScore } from '../../src/core/factory';
import { layoutScore } from '../../src/layout/layoutScore';
import { renderSvgToString } from '../../src/render/renderSvg';
import { buildSampleScore } from '../../src/ui/Demo';

describe('renderSvg', () => {
  it('renders SVG string containing data-id attributes and staff lines', () => {
    const score = createScore({ title: 'SVG Test' });
    const measure = createMeasure();
    const part = createPart('Flute');
    score.measures.push(measure);
    score.parts.push(part);

    const note = createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' });
    part.staves[0].measures[measure.id] = {
      voices: [{ id: 'v1', events: [note] }],
    };

    const layout = layoutScore(score);
    const svgStr = renderSvgToString(layout);

    expect(svgStr).toContain('<svg');
    expect(svgStr).toContain(`data-id="${note.id}"`);
    expect(svgStr).toContain('data-id="sys-0-staffline-0"');
    expect(svgStr).toContain('href="#glyph-');
    expect(svgStr).not.toContain('<text');
    expect(svgStr).toContain('</svg>');

    // A/B test query flag ?text fallback mode
    const svgTextStr = renderSvgToString(layout, { useTextFallback: true });
    expect(svgTextStr).toContain('class="scoreforge-glyph"');
    expect(svgTextStr).toContain('<text');
  });

  it('renders stems for chord and notes in wrapped systems', () => {
    const score = createScore();
    const m1 = createMeasure({ num: 4, den: 4 });
    const m2 = createMeasure({ num: 4, den: 4 });
    const part = createPart('Violin');
    score.measures = [m1, m2];
    score.parts = [part];

    const chord = createNote({
      pitches: [createPitch('F', 4, 1), createPitch('G', 4, 0)],
      baseType: 'quarter',
    });
    part.staves[0].measures[m1.id] = { voices: [{ id: 'v1', events: [chord] }] };
    part.staves[0].measures[m2.id] = { voices: [{ id: 'v1', events: [chord] }] };

    const layout = layoutScore(score, { width: 30 });
    const svgStr = renderSvgToString(layout);

    const stemMatches = svgStr.match(/<line data-id="[^"]*-stem"/g);
    expect(stemMatches).not.toBeNull();
    expect(stemMatches?.length).toBe(2);
  });

  it('renders ledger lines and stems correctly for extreme pitches', () => {
    const score = createScore();
    const m5 = createMeasure({ num: 4, den: 4 });
    const part = createPart('Violin');
    score.measures = [m5];
    score.parts = [part];

    const m5Notes = [
      createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' }),
      createNote({ pitches: [createPitch('A', 3, 0)], baseType: 'quarter' }),
      createNote({ pitches: [createPitch('A', 5, 0)], baseType: 'quarter' }),
      createNote({ pitches: [createPitch('C', 6, 0)], baseType: 'quarter' }),
    ];
    part.staves[0].measures[m5.id] = { voices: [{ id: 'v1', events: m5Notes }] };

    const layout = layoutScore(score);
    const svg = renderSvgToString(layout);
    expect(svg).toContain('ledger-0-5'); // C4 ledger
    expect(svg).toContain('ledger-0-6'); // A3 second ledger
    expect(svg).toContain('ledger-0--1'); // A5 ledger
    expect(svg).toContain('ledger-0--2'); // C6 second ledger
  });

  it('renders data-event-id attributes and invisible event hit rects', () => {
    const score = createScore();
    const m = createMeasure({ num: 4, den: 4 });
    const part = createPart('Flute');
    score.measures = [m];
    score.parts = [part];

    const note = createNote({ pitches: [createPitch('C', 4, 0)], baseType: 'quarter' });
    part.staves[0].measures[m.id] = { voices: [{ id: 'v1', events: [note] }] };

    const layout = layoutScore(score);
    const svgStr = renderSvgToString(layout);

    expect(svgStr).toContain(`data-event-id="${note.id}"`);
    expect(svgStr).toContain(`class="event-hit-area" data-event-id="${note.id}"`);
  });

  it('renderSvgToString snapshot of the demo score', () => {
    const score = buildSampleScore('G');
    const layout = layoutScore(score, { width: 82 });
    const svgStr = renderSvgToString(layout, { staffSpacePx: 10 });
    expect(svgStr).not.toContain('<text');

    // Normalize random UUIDs so snapshot is completely deterministic
    const normalized = svgStr.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      'STATIC-ID'
    );

    expect(normalized).toMatchSnapshot();
  });
});
