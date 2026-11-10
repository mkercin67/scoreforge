/**
 * Memoized React component rendering a single layout system into SVG elements.
 *
 * Performance optimizations:
 * 1. Combines 5 staff lines into a single <path> element (saving 4 elements per system).
 * 2. Replaces individual event hit rects with ONE transparent rect per measure (saving ~75% rect elements).
 * 3. Skips DOM reconciliation for unchanged systems via React.memo.
 */

import React, { useMemo } from 'react';
import { LayoutItem, LayoutSystem } from '../layout/types';
import { getGlyphChar } from '../render/smufl';

export interface SystemViewProps {
  system: LayoutSystem;
  staffSpacePx: number;
}

export const SystemView: React.FC<SystemViewProps> = React.memo(
  ({ system, staffSpacePx }) => {
    const fontSize = staffSpacePx * 4;

    // Separate staff lines from other lines so they can be merged into 1 path
    const { staffLines, otherItems } = useMemo(() => {
      const staffLines: LayoutItem[] = [];
      const otherItems: LayoutItem[] = [];
      for (const item of system.items) {
        if (item.kind === 'line' && item.id.includes('staffline')) {
          staffLines.push(item);
        } else {
          otherItems.push(item);
        }
      }
      return { staffLines, otherItems };
    }, [system.items]);

    // Combine 5 staff lines into 1 SVG <path>
    const staffLinesPath = useMemo(() => {
      if (staffLines.length === 0) return null;
      const minX = Math.min(...staffLines.map((l) => l.x)) * staffSpacePx;
      const maxX = Math.max(...staffLines.map((l) => l.x2 ?? l.x)) * staffSpacePx;
      const thickness = (staffLines[0]?.thickness ?? 0.13) * staffSpacePx;
      const d = staffLines
        .map((l) => `M ${minX} ${(system.y + l.y) * staffSpacePx} H ${maxX}`)
        .join(' ');
      return { d, thickness };
    }, [staffLines, system.y, staffSpacePx]);

    // Compute ONE transparent hit-test rect per measure instead of 1 per event
    const measureBoxes = useMemo(() => {
      const barlines: Array<{ id: string; x: number }> = [];
      for (const item of system.items) {
        if (item.kind === 'line' && item.id.startsWith('barline-') && !item.id.includes('staffline')) {
          barlines.push({ id: item.id, x: item.x });
        }
      }
      barlines.sort((a, b) => a.x - b.x);

      const boxes: Array<{ measureId: string; x: number; width: number }> = [];
      let startX = 0;
      for (const bl of barlines) {
        const mId = bl.id.replace('barline-', '').replace('-thin', '');
        const width = Math.max(1, bl.x - startX);
        boxes.push({ measureId: mId, x: startX, width });
        startX = bl.x;
      }
      return boxes;
    }, [system.items]);

    return (
      <g data-system-index={system.index} className="notranslate">
        {/* Merged staff lines: 1 path replaces 5 lines */}
        {staffLinesPath && (
          <path
            data-id={`sys-${system.index}-stafflines`}
            d={staffLinesPath.d}
            stroke="currentColor"
            strokeWidth={staffLinesPath.thickness}
            strokeLinecap="butt"
          />
        )}

        {/* Regular lines and glyphs */}
        {otherItems.map((item) => {
          if (item.hidden) return null;
          const pxX = item.x * staffSpacePx;
          const pxY = (system.y + item.y) * staffSpacePx;

          if (item.kind === 'line') {
            const pxX2 = (item.x2 ?? item.x) * staffSpacePx;
            const pxY2 = (system.y + (item.y2 ?? item.y)) * staffSpacePx;
            const strokeWidth = (item.thickness ?? 0.13) * staffSpacePx;
            return (
              <line
                key={item.id}
                data-id={item.id}
                data-event-id={item.eventId}
                x1={pxX}
                y1={pxY}
                x2={pxX2}
                y2={pxY2}
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
              />
            );
          }

          if (item.kind === 'glyph' && item.glyph) {
            return (
              <text
                key={item.id}
                data-id={item.id}
                data-event-id={item.eventId}
                x={pxX}
                y={pxY}
                className="scoreforge-glyph notranslate"
                style={{
                  fontFamily: 'Bravura, serif',
                  dominantBaseline: 'alphabetic',
                  textAnchor: 'start',
                }}
                dominantBaseline="alphabetic"
                textAnchor="start"
                fontSize={`${fontSize}px`}
                fill="currentColor"
              >
                {getGlyphChar(item.glyph)}
              </text>
            );
          }

          return null;
        })}

        {/* ONE transparent hit rect per measure (lightweight X-based hit testing) */}
        {measureBoxes.map((m) => (
          <rect
            key={`measure-hit-${m.measureId}`}
            data-measure-id={m.measureId}
            className="measure-hit-area notranslate"
            x={m.x * staffSpacePx}
            y={(system.y - 1) * staffSpacePx}
            width={m.width * staffSpacePx}
            height={6 * staffSpacePx}
            fill="transparent"
            stroke="none"
            strokeWidth={0}
            pointerEvents="all"
            style={{ cursor: 'pointer', fill: 'transparent', stroke: 'none' }}
          />
        ))}
      </g>
    );
  },
  (prev, next) => {
    if (prev.staffSpacePx !== next.staffSpacePx) return false;
    if (prev.system === next.system) return true;
    if (prev.system.y !== next.system.y || prev.system.width !== next.system.width) return false;
    if (prev.system.items.length !== next.system.items.length) return false;
    for (let i = 0; i < prev.system.items.length; i++) {
      if (prev.system.items[i] !== next.system.items[i]) return false;
    }
    return true;
  }
);
