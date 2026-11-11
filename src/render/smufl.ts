/**
 * SMuFL (Standard Music Font Layout) glyph metadata and codepoint resolver for Bravura.
 *
 * Resolves glyph names to SMuFL codepoints and anchors strictly from official metadata.
 * No codepoints are hard-coded.
 */

import glyphNamesData from '../../public/fonts/glyphnames.json';
import bravuraMetadata from '../../public/fonts/bravura_metadata.json';

interface GlyphEntry {
  codepoint: string;
  description?: string;
}

interface Anchors {
  [anchorName: string]: [number, number];
}

interface BBox {
  bBoxNE: [number, number];
  bBoxSW: [number, number];
}

const glyphs = glyphNamesData as unknown as Record<string, GlyphEntry>;
const advanceWidths = bravuraMetadata.glyphAdvanceWidths as unknown as Record<string, number>;
const anchors = (bravuraMetadata.glyphsWithAnchors ?? {}) as unknown as Record<string, Anchors>;
const bBoxes = (bravuraMetadata.glyphBBoxes ?? {}) as unknown as Record<string, BBox>;
const engravingDefaults = (bravuraMetadata.engravingDefaults ?? {}) as unknown as Record<
  string,
  number
>;

/**
 * Returns the SMuFL canonical codepoint string (e.g. 'U+E050') for a glyph name.
 *
 * @param name - SMuFL glyph name (e.g. 'gClef', 'noteheadBlack').
 * @returns Codepoint string.
 */
export function getGlyphCodepoint(name: string): string {
  const entry = glyphs[name];
  if (!entry || !entry.codepoint) {
    throw new Error(`Unknown SMuFL glyph name: ${name}`);
  }
  return entry.codepoint;
}

/**
 * Returns the actual unicode character string corresponding to the SMuFL glyph.
 *
 * @param name - SMuFL glyph name.
 * @returns Character string ready for rendering.
 */
export function getGlyphChar(name: string): string {
  const codepoint = getGlyphCodepoint(name);
  const hex = codepoint.replace(/^U\+/, '');
  const code = parseInt(hex, 16);
  return String.fromCodePoint(code);
}

/**
 * Returns the anchor position in staff spaces for a glyph if defined in Bravura metadata.
 * Note: SMuFL anchor coordinates have Y positive upwards; callers should adjust for downward Y.
 *
 * @param name - SMuFL glyph name.
 * @param anchor - Anchor name (e.g. 'stemUpSE', 'stemDownNW').
 * @returns [x, y] in staff spaces, or undefined if not defined.
 */
export function getGlyphAnchor(name: string, anchor: string): [number, number] | undefined {
  const glyphAnchors = anchors[name];
  if (!glyphAnchors) return undefined;
  return glyphAnchors[anchor];
}

/**
 * Returns the horizontal advance width in staff spaces for a glyph.
 *
 * @param name - SMuFL glyph name.
 * @returns Advance width in staff spaces (defaults to 1.0 if not specified).
 */
export function getGlyphAdvanceWidth(name: string): number {
  return advanceWidths[name] ?? 1.0;
}

/**
 * Returns the bounding box in staff spaces for a glyph.
 *
 * @param name - SMuFL glyph name.
 * @returns BBox object or undefined.
 */
export function getGlyphBBox(name: string): BBox | undefined {
  return bBoxes[name];
}

/**
 * Returns an engraving default measurement from Bravura metadata in staff spaces.
 *
 * @param key - Default setting name (e.g. 'staffLineThickness', 'stemThickness').
 * @param fallback - Optional fallback value if the key is absent from metadata.
 * @returns Value in staff spaces or fallback default.
 */
export function getEngravingDefault(key: string, fallback: number = 0.16): number {
  return engravingDefaults[key] ?? fallback;
}
