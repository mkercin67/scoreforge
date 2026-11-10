/**
 * Interactive SVG score canvas container.
 *
 * Implements responsive re-layout via ResizeObserver, zoom scale support,
 * visual selection highlighting, high-performance cursor overlay, and click selection.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Score } from '../core/model';
import { ScoreCursor } from '../core/input';
import { computeCursorPosition } from '../layout/cursor';
import { layoutScore } from '../layout/layoutScore';
import { renderSvgToString } from '../render/renderSvg';
import { useI18n } from './i18n';

export interface ScoreViewProps {
  score: Score;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  cursor?: ScoreCursor | null;
  isInputMode?: boolean;
  onSelectMeasure?: (measureId: string, tick?: number) => void;
}

export const ScoreView: React.FC<ScoreViewProps> = ({
  score,
  selectedEventId,
  onSelectEvent,
  cursor = null,
  isInputMode = false,
  onSelectMeasure,
}) => {
  const { zoom } = useI18n();
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

  const staffSpacePx = 10 * zoom;
  // Convert container pixel width to staff spaces using renderer scale
  const availableStaffSpaces = Math.max(50, Math.floor((containerWidthPx - 64) / staffSpacePx));

  // Compute layout ONLY when score, width or scale changes
  const layout = useMemo(() => {
    const t0 = performance.now();
    const res = layoutScore(score, { width: availableStaffSpaces });
    const elapsed = performance.now() - t0;
    if (elapsed > 10) {
      console.log(`[PERF] layoutScore took ${elapsed.toFixed(2)} ms for ${score.measures.length} measures`);
    }
    return res;
  }, [score, availableStaffSpaces]);

  // Compute cursor position as an overlay (does NOT recompute layoutScore)
  const cursorPos = useMemo(() => {
    if (!cursor) return null;
    return computeCursorPosition(layout, score, cursor);
  }, [layout, score, cursor]);

  // SVG content is rendered once per layout change
  const rawSvgHtml = useMemo(() => {
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

        // Also place cursor at this event's measure
        if (onSelectMeasure) {
          for (let mIdx = 0; mIdx < score.measures.length; mIdx++) {
            const mDef = score.measures[mIdx];
            const staff = score.parts[0]?.staves[0];
            const sm = staff?.measures[mDef.id];
            const voice = sm?.voices[0];
            if (!voice) continue;

            let t = 0;
            let found = false;
            for (const ev of voice.events) {
              if (ev.id === eventId) {
                onSelectMeasure(mDef.id, t);
                found = true;
                break;
              }
              t += ev.duration;
            }
            if (found) break;
          }
        }
        return;
      }
    }

    // Check if clicked empty measure / system background
    if (onSelectMeasure) {
      const sysEl = target.closest('[data-system-index]');
      if (sysEl) {
        const sysIdx = parseInt(sysEl.getAttribute('data-system-index') ?? '0', 10);
        const sys = layout.systems[sysIdx];
        if (sys) {
          // Find measure closest to click X
          const rect = sysEl.getBoundingClientRect();
          const clickRelX = (e.clientX - rect.left) / staffSpacePx;

          // Find measure barline ending after clickRelX
          for (const mDef of score.measures) {
            const barline = sys.items.find(
              (it) => it.id === `barline-${mDef.id}` || it.id === `barline-${mDef.id}-thin`
            );
            if (barline && barline.x >= clickRelX) {
              onSelectMeasure(mDef.id, 0);
              return;
            }
          }
        }
      }
    }

    onSelectEvent(null);
  };

  const totalWidthPx = Math.ceil(layout.width * staffSpacePx);
  const totalHeightPx = Math.ceil(layout.height * staffSpacePx);

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
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .score-input-cursor {
          animation: cursor-blink 1s step-start infinite;
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          backgroundColor: '#ffffff',
          padding: '2.5rem 3rem',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
          maxWidth: '100%',
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: rawSvgHtml }} />

        {/* Lightweight SVG Overlay for input cursor: zero layout thrash */}
        {isInputMode && cursorPos && (
          <svg
            style={{
              position: 'absolute',
              top: '2.5rem',
              left: '3rem',
              width: `${totalWidthPx}px`,
              height: `${totalHeightPx}px`,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <line
              x1={cursorPos.x * staffSpacePx}
              y1={cursorPos.y1 * staffSpacePx}
              x2={cursorPos.x * staffSpacePx}
              y2={cursorPos.y2 * staffSpacePx}
              stroke="#2563eb"
              strokeWidth={2}
              className="score-input-cursor"
            />
          </svg>
        )}
      </div>
    </div>
  );
};
