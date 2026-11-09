/**
 * Interactive SVG score canvas container.
 *
 * Implements responsive re-layout via ResizeObserver and instant visual selection
 * highlighting via pure CSS without triggering layout recalculations.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Score } from '../core/model';
import { layoutScore } from '../layout/layoutScore';
import { renderSvgToString } from '../render/renderSvg';

export interface ScoreViewProps {
  score: Score;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
}

export const ScoreView: React.FC<ScoreViewProps> = ({
  score,
  selectedEventId,
  onSelectEvent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState<number>(1000);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) {
          setContainerWidthPx(w);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const staffSpacePx = 10;
  // Convert pixel width to staff spaces (with minimum width safeguard)
  const availableStaffSpaces = Math.max(50, Math.floor((containerWidthPx - 64) / staffSpacePx));

  const layout = useMemo(() => {
    return layoutScore(score, { width: availableStaffSpaces });
  }, [score, availableStaffSpaces]);

  const svgHtml = useMemo(() => {
    return renderSvgToString(layout, { staffSpacePx });
  }, [layout, staffSpacePx]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element | null;
    if (!target) return;

    const hitElement = target.closest('[data-event-id]');
    if (hitElement) {
      const eventId = hitElement.getAttribute('data-event-id');
      if (eventId) {
        onSelectEvent(eventId);
        return;
      }
    }

    // Clicked empty background
    onSelectEvent(null);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        minHeight: 0,
      }}
    >
      <style>{`
        /* Dynamic blue highlight for the selected event */
        ${
          selectedEventId
            ? `svg [data-event-id="${selectedEventId}"]:not(.event-hit-area) {
                fill: #2563eb !important;
                stroke: #2563eb !important;
              }`
            : ''
        }
        .event-hit-area {
          fill: transparent;
          cursor: pointer;
        }
        .event-hit-area:hover {
          fill: rgba(37, 99, 235, 0.08);
        }
      `}</style>

      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '2.5rem 3rem',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
          maxWidth: '100%',
        }}
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    </div>
  );
};
