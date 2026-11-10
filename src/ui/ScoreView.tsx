/**
 * Interactive SVG score canvas container.
 *
 * Implements responsive re-layout via ResizeObserver, zoom scale support,
 * visual selection highlighting, high-performance cursor overlay, and X-based click selection.
 *
 * Performance guards:
 * - notranslate and translate="no" to prevent browser translation extension mutations.
 * - Read-first, write-later RAF-debounced cursor scrolling (no forced reflow on keydown).
 * - Combined staff line rendering and measure-based hit rects to minimize DOM footprint.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Score } from '../core/model';
import { ScoreCursor } from '../core/input';
import { computeCursorPosition } from '../layout/cursor';
import { layoutScore } from '../layout/layoutScore';
import { useI18n } from './i18n';
import { SystemView } from './SystemView';

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

  const cursorLineRef = useRef<SVGLineElement | null>(null);

  // Keep cursor visible: read-first, write-later, run at most once per note via RAF,
  // calling scrollIntoView ONLY if the cursor is actually outside the viewport.
  useEffect(() => {
    if (!isInputMode || !cursorPos) return;

    const rafId = requestAnimationFrame(() => {
      const cursorEl = cursorLineRef.current;
      const containerEl = containerRef.current;
      if (!cursorEl || !containerEl) return;

      // Read phase (measured after paint, zero forced layout in keydown frame)
      const containerRect = containerEl.getBoundingClientRect();
      const cursorRect = cursorEl.getBoundingClientRect();

      const isOutside =
        cursorRect.top < containerRect.top + 10 ||
        cursorRect.bottom > containerRect.bottom - 10 ||
        cursorRect.left < containerRect.left + 10 ||
        cursorRect.right > containerRect.right - 10;

      // Write phase: only execute scroll if actually outside
      if (isOutside) {
        cursorEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [isInputMode, cursorPos?.systemIndex, cursorPos?.x, cursorPos?.y1]);

  const syncCursorToEvent = (eventId: string) => {
    if (!onSelectMeasure) return;
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
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element | null;
    if (!target) return;

    // 1. Direct hit on an event glyph or stem
    const hitElement = target.closest('[data-event-id]');
    if (hitElement) {
      const eventId = hitElement.getAttribute('data-event-id');
      if (eventId) {
        onSelectEvent(eventId);
        syncCursorToEvent(eventId);
        return;
      }
    }

    // 2. Click on a measure hit area or system background (X-based hit testing)
    const measureEl = target.closest('[data-measure-id]');
    const sysEl = target.closest('[data-system-index]');
    if (sysEl && onSelectMeasure) {
      const sysIdx = parseInt(sysEl.getAttribute('data-system-index') ?? '0', 10);
      const sys = layout.systems[sysIdx];
      if (sys) {
        const rect = sysEl.getBoundingClientRect();
        const clickRelX = (e.clientX - rect.left) / staffSpacePx;

        const targetMeasureId =
          measureEl?.getAttribute('data-measure-id') ??
          (() => {
            for (const mDef of score.measures) {
              const barline = sys.items.find(
                (it) => it.id === `barline-${mDef.id}` || it.id === `barline-${mDef.id}-thin`
              );
              if (barline && barline.x >= clickRelX) return mDef.id;
            }
            return null;
          })();

        if (targetMeasureId) {
          // Check if any event in this measure is close to clickRelX (within 1.5 staff spaces)
          const staff = score.parts[0]?.staves[0];
          const sm = staff?.measures[targetMeasureId];
          const voice = sm?.voices[0];
          if (voice) {
            let closestEvId: string | null = null;
            let minDiff = 1.5; // Tolerance in staff spaces

            for (const ev of voice.events) {
              const evItems = sys.items.filter((it) => it.eventId === ev.id);
              for (const it of evItems) {
                const diff = Math.abs(it.x - clickRelX);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestEvId = ev.id;
                }
              }
            }

            if (closestEvId) {
              onSelectEvent(closestEvId);
              syncCursorToEvent(closestEvId);
              return;
            }
          }

          // Otherwise, empty measure clicked -> place cursor at tick 0
          onSelectMeasure(targetMeasureId, 0);
          onSelectEvent(null);
          return;
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
      className="notranslate"
      translate="no"
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
        @font-face {
          font-family: 'Bravura';
          src: url('/fonts/Bravura.woff2') format('woff2');
          font-weight: normal;
          font-style: normal;
          font-display: block;
        }
        .scoreforge-glyph {
          font-family: 'Bravura', serif !important;
          dominant-baseline: alphabetic !important;
          text-anchor: start !important;
          user-select: none;
        }
        /* Dynamic blue highlight for the selected event */
        ${
          selectedEventId
            ? `svg [data-event-id="${selectedEventId}"] {
                fill: #2563eb !important;
                stroke: #2563eb !important;
              }`
            : ''
        }
        .measure-hit-area {
          fill: transparent !important;
          stroke: none !important;
          cursor: pointer;
        }
        .measure-hit-area:hover {
          fill: rgba(37, 99, 235, 0.04) !important;
          stroke: none !important;
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
        className="notranslate"
        translate="no"
        style={{
          position: 'relative',
          backgroundColor: '#ffffff',
          padding: '2.5rem 3rem',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
          maxWidth: '100%',
        }}
      >
        <svg
          className="notranslate"
          viewBox={`0 0 ${totalWidthPx} ${totalHeightPx}`}
          width={`${totalWidthPx}px`}
          height={`${totalHeightPx}px`}
          style={{ color: '#000000', overflow: 'visible', userSelect: 'none', display: 'block' }}
        >
          {layout.systems.map((sys) => (
            <SystemView key={sys.index} system={sys} staffSpacePx={staffSpacePx} />
          ))}

          {/* Persistent cursor overlay inside the SVG: zero layout thrash */}
          {isInputMode && cursorPos && (
            <line
              ref={cursorLineRef}
              className="score-input-cursor notranslate"
              x1={cursorPos.x * staffSpacePx}
              y1={cursorPos.y1 * staffSpacePx}
              x2={cursorPos.x * staffSpacePx}
              y2={cursorPos.y2 * staffSpacePx}
              stroke="#2563eb"
              strokeWidth={2}
            />
          )}
        </svg>
      </div>
    </div>
  );
};
