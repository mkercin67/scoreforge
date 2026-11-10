/**
 * Interactive SVG score canvas container.
 *
 * Implements responsive re-layout via ResizeObserver, zoom scale support,
 * visual selection highlighting, and input cursor rendering.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Score } from '../core/model';
import { ScoreCursor } from '../core/input';
import { measureTicks } from '../core/time';
import { layoutScore } from '../layout/layoutScore';
import { LayoutResult, LayoutSystem } from '../layout/types';
import { renderSvgToString } from '../render/renderSvg';
import { useI18n } from './i18n';

export interface ScoreViewProps {
  score: Score;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  cursor?: ScoreCursor | null;
  isInputMode?: boolean;
}

function computeCursorPosition(
  layout: LayoutResult,
  score: Score,
  cursor: ScoreCursor | null
): { x: number; y1: number; y2: number } | null {
  if (!cursor) return null;

  // 1. Find system containing cursor.measureId
  let targetSystem: LayoutSystem | null = null;
  for (const sys of layout.systems) {
    if (sys.items.some((it) => it.id.startsWith(`barline-${cursor.measureId}`))) {
      targetSystem = sys;
      break;
    }
  }
  if (!targetSystem && layout.systems.length > 0) {
    targetSystem = layout.systems[0];
  }
  if (!targetSystem) return null;

  const staffY = targetSystem.staves[0]?.y ?? targetSystem.y;
  const y1 = staffY;
  const y2 = staffY + 4;

  // 2. Find measure start and end in system
  const barlineItem = targetSystem.items.find(
    (it) => it.id === `barline-${cursor.measureId}` || it.id === `barline-${cursor.measureId}-thin`
  );
  const barlineX = barlineItem ? barlineItem.x : targetSystem.width;

  let measureStartX = 0;
  const allBarlinesInSys = targetSystem.items
    .filter((it) => it.id.startsWith('barline-') && it.x < barlineX - 0.1)
    .sort((a, b) => b.x - a.x);

  if (allBarlinesInSys.length > 0) {
    measureStartX = allBarlinesInSys[0].x + (allBarlinesInSys[0].thickness ?? 0.16);
  } else {
    // First measure in this system -> starts after system header
    const headerItems = targetSystem.items.filter(
      (it) => it.id.startsWith('sys-') || it.id.startsWith('clef-') || it.id.startsWith('keysig-')
    );
    measureStartX = headerItems.reduce((max, it) => Math.max(max, it.x + (it.width ?? 1)), 0);
  }

  // 3. Find event at cursor tick
  const staff = score.parts[0]?.staves.find((s) => s.id === cursor.staffId);
  const sm = staff?.measures[cursor.measureId];
  const voice = sm?.voices.find((v) => v.id === cursor.voiceId) ?? sm?.voices[0];

  const mDef = score.measures.find((m) => m.id === cursor.measureId);
  const mLength = mDef ? measureTicks(mDef.timeSig) : 3840;

  if (cursor.tick === 0) {
    // If first measure in score has time signature, cursor goes after timeSig
    const timeSigItems = targetSystem.items.filter((it) => it.id.startsWith('timesig-'));
    if (timeSigItems.length > 0) {
      const tsEnd = timeSigItems.reduce((max, it) => Math.max(max, it.x + 1.2), 0);
      return { x: tsEnd + 0.4, y1, y2 };
    }
    return { x: measureStartX + 0.8, y1, y2 };
  }

  if (cursor.tick >= mLength) {
    return { x: barlineX - 0.5, y1, y2 };
  }

  if (voice) {
    let t = 0;
    for (const ev of voice.events) {
      if (t === cursor.tick) {
        const evItem = targetSystem.items.find((it) => it.eventId === ev.id && it.kind === 'glyph');
        if (evItem) {
          return { x: evItem.x - 0.3, y1, y2 };
        }
      }
      t += ev.duration;
    }

    const ratio = Math.max(0, Math.min(1, cursor.tick / mLength));
    const contentWidth = barlineX - measureStartX;
    return { x: measureStartX + contentWidth * ratio, y1, y2 };
  }

  return { x: measureStartX + 0.8, y1, y2 };
}

export const ScoreView: React.FC<ScoreViewProps> = ({
  score,
  selectedEventId,
  onSelectEvent,
  cursor = null,
  isInputMode = false,
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

  const layout = useMemo(() => {
    return layoutScore(score, { width: availableStaffSpaces });
  }, [score, availableStaffSpaces]);

  const cursorPosSpaces = useMemo(() => {
    if (!isInputMode || !cursor) return null;
    return computeCursorPosition(layout, score, cursor);
  }, [layout, score, cursor, isInputMode]);

  const svgHtml = useMemo(() => {
    const rawSvg = renderSvgToString(layout, { staffSpacePx });
    if (!cursorPosSpaces || !isInputMode) return rawSvg;

    const cx = cursorPosSpaces.x * staffSpacePx;
    const cy1 = cursorPosSpaces.y1 * staffSpacePx;
    const cy2 = cursorPosSpaces.y2 * staffSpacePx;

    const cursorLineSvg = `<line x1="${cx}" y1="${cy1}" x2="${cx}" y2="${cy2}" stroke="#2563eb" stroke-width="2" class="score-input-cursor" />`;
    return rawSvg.replace('</svg>', `${cursorLineSvg}</svg>`);
  }, [layout, staffSpacePx, cursorPosSpaces, isInputMode]);

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
