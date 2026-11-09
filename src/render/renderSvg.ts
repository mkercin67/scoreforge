/**
 * SVG Renderer for ScoreForge layout structures.
 *
 * Renders LayoutResult into SVG elements using the Bravura SMuFL font.
 * Attaches data-id attributes to every visual element for hit-testing.
 */

import { LayoutItem, LayoutResult, LayoutSystem } from '../layout/types';
import { getGlyphChar } from './smufl';

export interface RenderSvgOptions {
  /** Number of screen pixels per staff space. Defaults to 10. */
  staffSpacePx?: number;
  /** Foreground fill/stroke color. Defaults to 'currentColor'. */
  color?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Generates an SVG element from a LayoutResult.
 *
 * @param layout - The layout to render.
 * @param options - Rendering scale and styling options.
 * @returns An SVGElement (SVGSVGElement).
 */
export function renderSvg(
  layout: LayoutResult,
  options: RenderSvgOptions = {}
): SVGSVGElement {
  const staffSpacePx = options.staffSpacePx ?? 10;
  const color = options.color ?? 'currentColor';

  const totalWidthPx = Math.ceil(layout.width * staffSpacePx);
  const totalHeightPx = Math.ceil(layout.height * staffSpacePx);

  if (typeof document === 'undefined') {
    throw new Error('renderSvg requires a DOM environment (document is undefined).');
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${totalWidthPx} ${totalHeightPx}`);
  svg.setAttribute('width', `${totalWidthPx}px`);
  svg.setAttribute('height', `${totalHeightPx}px`);
  svg.setAttribute('style', `color: ${color}; overflow: visible; user-select: none;`);

  // Embedded @font-face style so the SVG is self-contained
  const styleEl = document.createElementNS(SVG_NS, 'style');
  styleEl.textContent = `
    @font-face {
      font-family: 'Bravura';
      src: url('/fonts/Bravura.woff2') format('woff2');
      font-weight: normal;
      font-style: normal;
    }
    .scoreforge-glyph {
      font-family: 'Bravura';
      dominant-baseline: alphabetic;
      text-anchor: start;
    }
  `;
  svg.appendChild(styleEl);

  const fontSize = staffSpacePx * 4;

  for (const sys of layout.systems) {
    const sysGroup = document.createElementNS(SVG_NS, 'g');
    sysGroup.setAttribute('data-system-index', sys.index.toString());

    for (const item of sys.items) {
      if (item.hidden) continue;

      const element = renderItemToSvgElement(item, sys, staffSpacePx, fontSize);
      if (element) {
        sysGroup.appendChild(element);
      }
    }

    svg.appendChild(sysGroup);
  }

  return svg;
}

/**
 * Converts a LayoutItem to an SVGElement.
 */
function renderItemToSvgElement(
  item: LayoutItem,
  sys: LayoutSystem,
  staffSpacePx: number,
  fontSize: number
): SVGElement | null {
  const pxX = item.x * staffSpacePx;
  const pxY = (sys.y + item.y) * staffSpacePx;

  if (item.kind === 'line') {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('data-id', item.id);
    line.setAttribute('x1', pxX.toString());
    line.setAttribute('y1', pxY.toString());
    const pxX2 = (item.x2 ?? item.x) * staffSpacePx;
    const pxY2 = (sys.y + (item.y2 ?? item.y)) * staffSpacePx;
    line.setAttribute('x2', pxX2.toString());
    line.setAttribute('y2', pxY2.toString());
    line.setAttribute('stroke', 'currentColor');
    const strokeWidth = (item.thickness ?? 0.13) * staffSpacePx;
    line.setAttribute('stroke-width', strokeWidth.toString());
    line.setAttribute('stroke-linecap', 'butt');
    return line;
  }

  if (item.kind === 'glyph' && item.glyph) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('data-id', item.id);
    text.setAttribute('x', pxX.toString());
    text.setAttribute('y', pxY.toString());
    text.setAttribute('class', 'scoreforge-glyph');
    text.setAttribute('font-size', `${fontSize}px`);
    text.setAttribute('fill', 'currentColor');
    text.textContent = getGlyphChar(item.glyph);
    return text;
  }

  if (item.kind === 'text' && item.text) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('data-id', item.id);
    text.setAttribute('x', pxX.toString());
    text.setAttribute('y', pxY.toString());
    text.setAttribute('fill', 'currentColor');
    text.textContent = item.text;
    return text;
  }

  return null;
}

/**
 * Serializes a LayoutResult into an SVG markup string.
 * Works in both browser and plain Node environments without DOM.
 *
 * @param layout - Layout data to render.
 * @param options - Scaling and color options.
 * @returns SVG XML string.
 */
export function renderSvgToString(
  layout: LayoutResult,
  options: RenderSvgOptions = {}
): string {
  const staffSpacePx = options.staffSpacePx ?? 10;
  const color = options.color ?? 'currentColor';

  const totalWidthPx = Math.ceil(layout.width * staffSpacePx);
  const totalHeightPx = Math.ceil(layout.height * staffSpacePx);
  const fontSize = staffSpacePx * 4;

  let elementsXml = '';

  for (const sys of layout.systems) {
    elementsXml += `  <g data-system-index="${sys.index}">\n`;
    for (const item of sys.items) {
      if (item.hidden) continue;

      const pxX = item.x * staffSpacePx;
      const pxY = (sys.y + item.y) * staffSpacePx;

      if (item.kind === 'line') {
        const pxX2 = (item.x2 ?? item.x) * staffSpacePx;
        const pxY2 = (sys.y + (item.y2 ?? item.y)) * staffSpacePx;
        const strokeWidth = (item.thickness ?? 0.13) * staffSpacePx;
        elementsXml += `    <line data-id="${item.id}" x1="${pxX}" y1="${pxY}" x2="${pxX2}" y2="${pxY2}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="butt" />\n`;
      } else if (item.kind === 'glyph' && item.glyph) {
        const char = getGlyphChar(item.glyph);
        elementsXml += `    <text data-id="${item.id}" x="${pxX}" y="${pxY}" class="scoreforge-glyph" font-size="${fontSize}px" fill="currentColor">${char}</text>\n`;
      } else if (item.kind === 'text' && item.text) {
        elementsXml += `    <text data-id="${item.id}" x="${pxX}" y="${pxY}" fill="currentColor">${item.text}</text>\n`;
      }
    }
    elementsXml += `  </g>\n`;
  }

  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${totalWidthPx} ${totalHeightPx}" width="${totalWidthPx}px" height="${totalHeightPx}px" style="color: ${color}; overflow: visible; user-select: none;">
  <style>
    @font-face {
      font-family: 'Bravura';
      src: url('/fonts/Bravura.woff2') format('woff2');
      font-weight: normal;
      font-style: normal;
    }
    .scoreforge-glyph {
      font-family: 'Bravura';
      dominant-baseline: alphabetic;
      text-anchor: start;
    }
  </style>
${elementsXml}</svg>`;
}
