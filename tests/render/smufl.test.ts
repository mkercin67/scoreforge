import { describe, expect, it } from 'vitest';
import {
  getEngravingDefault,
  getGlyphAdvanceWidth,
  getGlyphAnchor,
  getGlyphChar,
  getGlyphCodepoint,
} from '../../src/render/smufl';

describe('SMuFL resolver and metadata', () => {
  it('resolves glyph names to SMuFL codepoints without hardcoded values', () => {
    expect(getGlyphCodepoint('gClef')).toBe('U+E050');
    expect(getGlyphCodepoint('fClef')).toBe('U+E062');
    expect(getGlyphCodepoint('noteheadBlack')).toBe('U+E0A4');
    expect(getGlyphCodepoint('accidentalSharp')).toBe('U+E262');
    expect(getGlyphCodepoint('accidentalNatural')).toBe('U+E261');
    expect(getGlyphCodepoint('accidentalFlat')).toBe('U+E260');
  });

  it('converts glyph name to character string', () => {
    const char = getGlyphChar('noteheadBlack');
    expect(char).toBe('\uE0A4');
  });

  it('retrieves stem attachment anchors from metadata', () => {
    const stemUp = getGlyphAnchor('noteheadBlack', 'stemUpSE');
    expect(stemUp).toBeDefined();
    expect(stemUp![0]).toBeCloseTo(1.18, 2);

    const stemDown = getGlyphAnchor('noteheadBlack', 'stemDownNW');
    expect(stemDown).toBeDefined();
    expect(stemDown![0]).toBeCloseTo(0.0, 2);
  });

  it('retrieves advance widths and engraving defaults from Bravura metadata', () => {
    const width = getGlyphAdvanceWidth('noteheadBlack');
    expect(width).toBeCloseTo(1.18, 2);

    const lineThickness = getEngravingDefault('staffLineThickness');
    expect(lineThickness).toBeGreaterThan(0);
  });
});
