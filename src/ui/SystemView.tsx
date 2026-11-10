/**
 * Memoized React component rendering a single layout system into SVG elements.
 *
 * Prevents full-SVG DOM rebuilds on keystrokes: unchanged systems are memoized
 * and skip DOM mutations entirely.
 */

import React, { useMemo } from 'react';
import { LayoutSystem } from '../layout/types';
import { getGlyphChar } from '../render/smufl';

export interface SystemViewProps {
  system: LayoutSystem;
  staffSpacePx: number;
}

interface EventBoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const SystemView: React.FC<SystemViewProps> = React.memo(
  ({ system, staffSpacePx }) => {
    const fontSize = staffSpacePx * 4;

    // Compute hit areas for events in this system
    const hitAreas = useMemo(() => {
      const boxes = new Map<string, EventBoundingBox>();
      for (const item of system.items) {
        if (item.hidden || !item.eventId) continue;
        let b = boxes.get(item.eventId);
        if (!b) {
          b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
          boxes.set(item.eventId, b);
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

      const margin = 0.5;
      const rects: Array<{ eventId: string; x: number; y: number; width: number; height: number }> = [];
      for (const [eventId, box] of boxes.entries()) {
        const hitX = (box.minX - margin) * staffSpacePx;
        const hitY = (system.y + box.minY - margin) * staffSpacePx;
        const hitW = (box.maxX - box.minX + 2 * margin) * staffSpacePx;
        const hitH = (box.maxY - box.minY + 2 * margin) * staffSpacePx;
        rects.push({
          eventId,
          x: hitX,
          y: hitY,
          width: Math.max(1, hitW),
          height: Math.max(1, hitH),
        });
      }
      return rects;
    }, [system.items, system.y, staffSpacePx]);

    return (
      <g data-system-index={system.index}>
        {system.items.map((item) => {
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
                className="scoreforge-glyph"
                fontSize={`${fontSize}px`}
                fill="currentColor"
              >
                {getGlyphChar(item.glyph)}
              </text>
            );
          }

          return null;
        })}

        {/* Event hit rects */}
        {hitAreas.map((area) => (
          <rect
            key={`hit-${area.eventId}`}
            className="event-hit-area"
            data-event-id={area.eventId}
            x={area.x}
            y={area.y}
            width={area.width}
            height={area.height}
            fill="transparent"
            pointerEvents="all"
            style={{ cursor: 'pointer' }}
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
    // Fast comparison: if all items have identical references
    for (let i = 0; i < prev.system.items.length; i++) {
      if (prev.system.items[i] !== next.system.items[i]) return false;
    }
    return true;
  }
);
