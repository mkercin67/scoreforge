/**
 * SVG Renderer for ScoreForge layout structures.
 *
 * Performance optimized:
 * 1. By default, renders SMuFL musical glyphs as vector SVG <path> elements inside <defs>
 *    and references them via <use>, eliminating browser font layout, PUA codepoint styling
 *    and forced reflow issues.
 * 2. Supports ?text / useTextFallback: true for A/B testing with traditional <text> rendering.
 * 3. Attaches data-id and data-event-id attributes to every visual element for hit-testing.
 */

import { LayoutItem, LayoutResult, LayoutSystem } from '../layout/types';
import { getGlyphChar } from './smufl';
import { getGlyphPath, UNITS_PER_EM } from './glyphPaths.generated';

export interface RenderSvgOptions {
  /** Number of screen pixels per staff space. Defaults to 10. */
  staffSpacePx?: number;
  /** Foreground fill/stroke color. Defaults to 'currentColor'. */
  color?: string;
  /** When true, renders glyphs as <text> using Bravura font instead of SVG paths. Defaults to false. */
  useTextFallback?: boolean;
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
  const useTextFallback = options.useTextFallback ?? false;

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

  if (useTextFallback) {
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
      .event-hit-area {
        fill: transparent;
        stroke: none;
      }
    `;
    svg.appendChild(styleEl);
  } else {
    // Collect used glyphs and build <defs>
    const usedGlyphs = new Set<string>();
    for (const sys of layout.systems) {
      for (const it of sys.items) {
        if (!it.hidden && it.kind === 'glyph' && it.glyph) {
          usedGlyphs.add(it.glyph);
        }
      }
    }

    const defs = document.createElementNS(SVG_NS, 'defs');
    for (const glyphName of Array.from(usedGlyphs).sort()) {
      const pathD = getGlyphPath(glyphName);
      if (pathD) {
        const pathEl = document.createElementNS(SVG_NS, 'path');
        pathEl.setAttribute('id', `glyph-${glyphName}`);
        pathEl.setAttribute('d', pathD);
        defs.appendChild(pathEl);
      }
    }
    svg.appendChild(defs);
  }

  const fontSize = staffSpacePx * 4;
  const scale = staffSpacePx / (UNITS_PER_EM / 4);

  for (const sys of layout.systems) {
    const sysGroup = document.createElementNS(SVG_NS, 'g');
    sysGroup.setAttribute('data-system-index', sys.index.toString());

    // Map bounding boxes for event hit areas
    const eventBoxes = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();

    for (const item of sys.items) {
      if (item.hidden) continue;

      if (item.eventId) {
        let b = eventBoxes.get(item.eventId);
        if (!b) {
          b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
          eventBoxes.set(item.eventId, b);
        }
        const itemX = item.x;
        const itemY = item.y;
        if (item.kind === 'line') {
          const itemX2 = item.x2 ?? itemX;
          const itemY2 = item.y2 ?? itemY;
          b.minX = Math.min(b.minX, itemX, itemX2);
          b.maxX = Math.max(b.maxX, itemX, itemX2);
          b.minY = Math.min(b.minY, itemY, itemY2);
          b.maxY = Math.max(b.maxY, itemY, itemY2);
        } else {
          b.minX = Math.min(b.minX, itemX);
          b.maxX = Math.max(b.maxX, itemX + 1.2);
          b.minY = Math.min(b.minY, itemY - 1.0);
          b.maxY = Math.max(b.maxY, itemY + 0.5);
        }
      }

      const element = renderItemToSvgElement(item, sys, staffSpacePx, fontSize, scale, useTextFallback);
      if (element) {
        sysGroup.appendChild(element);
      }
    }

    // Render hit areas with ~0.5 staff space margin for easy clicking
    const margin = 0.5;
    for (const [eventId, box] of eventBoxes.entries()) {
      const hitX = (box.minX - margin) * staffSpacePx;
      const hitY = (sys.y + box.minY - margin) * staffSpacePx;
      const hitW = (box.maxX - box.minX + 2 * margin) * staffSpacePx;
      const hitH = (box.maxY - box.minY + 2 * margin) * staffSpacePx;

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'event-hit-area');
      rect.setAttribute('data-event-id', eventId);
      rect.setAttribute('x', hitX.toString());
      rect.setAttribute('y', hitY.toString());
      rect.setAttribute('width', Math.max(1, hitW).toString());
      rect.setAttribute('height', Math.max(1, hitH).toString());
      rect.setAttribute('fill', 'transparent');
      rect.setAttribute('pointer-events', 'all');
      rect.setAttribute('style', 'cursor: pointer;');
      sysGroup.appendChild(rect);
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
  fontSize: number,
  scale: number,
  useTextFallback: boolean
): SVGElement | null {
  const pxX = item.x * staffSpacePx;
  const pxY = (sys.y + item.y) * staffSpacePx;

  if (item.kind === 'line') {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('data-id', item.id);
    if (item.eventId) {
      line.setAttribute('data-event-id', item.eventId);
    }
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
    if (useTextFallback) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('data-id', item.id);
      if (item.eventId) {
        text.setAttribute('data-event-id', item.eventId);
      }
      text.setAttribute('x', pxX.toString());
      text.setAttribute('y', pxY.toString());
      text.setAttribute('class', 'scoreforge-glyph');
      text.setAttribute('font-size', `${fontSize}px`);
      text.setAttribute('fill', 'currentColor');
      text.textContent = getGlyphChar(item.glyph);
      return text;
    }

    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('data-id', item.id);
    if (item.eventId) {
      use.setAttribute('data-event-id', item.eventId);
    }
    use.setAttribute('href', `#glyph-${item.glyph}`);
    use.setAttribute('transform', `translate(${pxX}, ${pxY}) scale(${scale})`);
    use.setAttribute('fill', 'currentColor');
    return use;
  }

  if (item.kind === 'text' && item.text) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('data-id', item.id);
    if (item.eventId) {
      text.setAttribute('data-event-id', item.eventId);
    }
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
 * @param options - Scaling, fallback and color options.
 * @returns SVG XML string.
 */
export function renderSvgToString(
  layout: LayoutResult,
  options: RenderSvgOptions = {}
): string {
  const staffSpacePx = options.staffSpacePx ?? 10;
  const color = options.color ?? 'currentColor';
  const useTextFallback = options.useTextFallback ?? false;

  const totalWidthPx = Math.ceil(layout.width * staffSpacePx);
  const totalHeightPx = Math.ceil(layout.height * staffSpacePx);
  const fontSize = staffSpacePx * 4;
  const scale = staffSpacePx / (UNITS_PER_EM / 4);

  let defsXml = '';
  if (!useTextFallback) {
    const usedGlyphs = new Set<string>();
    for (const sys of layout.systems) {
      for (const it of sys.items) {
        if (!it.hidden && it.kind === 'glyph' && it.glyph) {
          usedGlyphs.add(it.glyph);
        }
      }
    }
    defsXml = '  <defs>\n';
    for (const glyphName of Array.from(usedGlyphs).sort()) {
      const pathD = getGlyphPath(glyphName);
      if (pathD) {
        defsXml += `    <path id="glyph-${glyphName}" d="${pathD}" />\n`;
      }
    }
    defsXml += '  </defs>\n';
  }

  let elementsXml = '';

  for (const sys of layout.systems) {
    elementsXml += `  <g data-system-index="${sys.index}">\n`;
    const eventBoxes = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();

    for (const item of sys.items) {
      if (item.hidden) continue;

      if (item.eventId) {
        let b = eventBoxes.get(item.eventId);
        if (!b) {
          b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
          eventBoxes.set(item.eventId, b);
        }
        const itemX = item.x;
        const itemY = item.y;
        if (item.kind === 'line') {
          const itemX2 = item.x2 ?? itemX;
          const itemY2 = item.y2 ?? itemY;
          b.minX = Math.min(b.minX, itemX, itemX2);
          b.maxX = Math.max(b.maxX, itemX, itemX2);
          b.minY = Math.min(b.minY, itemY, itemY2);
          b.maxY = Math.max(b.maxY, itemY, itemY2);
        } else {
          b.minX = Math.min(b.minX, itemX);
          b.maxX = Math.max(b.maxX, itemX + 1.2);
          b.minY = Math.min(b.minY, itemY - 1.0);
          b.maxY = Math.max(b.maxY, itemY + 0.5);
        }
      }

      const pxX = item.x * staffSpacePx;
      const pxY = (sys.y + item.y) * staffSpacePx;
      const eventAttr = item.eventId ? ` data-event-id="${item.eventId}"` : '';

      if (item.kind === 'line') {
        const pxX2 = (item.x2 ?? item.x) * staffSpacePx;
        const pxY2 = (sys.y + (item.y2 ?? item.y)) * staffSpacePx;
        const strokeWidth = (item.thickness ?? 0.13) * staffSpacePx;
        elementsXml += `    <line data-id="${item.id}"${eventAttr} x1="${pxX}" y1="${pxY}" x2="${pxX2}" y2="${pxY2}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="butt" />\n`;
      } else if (item.kind === 'glyph' && item.glyph) {
        if (useTextFallback) {
          const char = getGlyphChar(item.glyph);
          elementsXml += `    <text data-id="${item.id}"${eventAttr} x="${pxX}" y="${pxY}" class="scoreforge-glyph" font-size="${fontSize}px" fill="currentColor">${char}</text>\n`;
        } else {
          elementsXml += `    <use data-id="${item.id}"${eventAttr} href="#glyph-${item.glyph}" transform="translate(${pxX}, ${pxY}) scale(${scale})" fill="currentColor" />\n`;
        }
      } else if (item.kind === 'text' && item.text) {
        elementsXml += `    <text data-id="${item.id}"${eventAttr} x="${pxX}" y="${pxY}" fill="currentColor">${item.text}</text>\n`;
      }
    }

    const margin = 0.5;
    for (const [eventId, box] of eventBoxes.entries()) {
      const hitX = (box.minX - margin) * staffSpacePx;
      const hitY = (sys.y + box.minY - margin) * staffSpacePx;
      const hitW = (box.maxX - box.minX + 2 * margin) * staffSpacePx;
      const hitH = (box.maxY - box.minY + 2 * margin) * staffSpacePx;
      elementsXml += `    <rect class="event-hit-area" data-event-id="${eventId}" x="${hitX}" y="${hitY}" width="${Math.max(1, hitW)}" height="${Math.max(1, hitH)}" fill="transparent" pointer-events="all" style="cursor: pointer;" />\n`;
    }

    elementsXml += `  </g>\n`;
  }

  const textStyleBlock = useTextFallback
    ? `  <style>
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
  </style>\n`
    : '';

  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${totalWidthPx} ${totalHeightPx}" width="${totalWidthPx}px" height="${totalHeightPx}px" style="color: ${color}; overflow: visible; user-select: none;">
${textStyleBlock}${defsXml}${elementsXml}</svg>`;
}
