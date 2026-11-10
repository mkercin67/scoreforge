/**
 * Interactive SVG score canvas container.
 *
 * Implements responsive re-layout via ResizeObserver, zoom scale support,
 * visual selection highlighting, high-performance cursor overlay, and X-based click selection.
 *
 * Milestone 3c features:
 * - Ghost note overlay on hover in note input mode (snapped diatonic pitch, ledger lines, active duration glyph).
 * - Click note entry (same replace semantics and doesNotFit rejection as keyboard).
 * - Clicking existing note in input mode selects it without replacement (unless Alt is held).
 * - Manual positioning via drag: 4px threshold, 0.25 space snap (Alt = no snap, Shift = axis lock),
 *   transform overlay via rAF (zero React re-render per move), accumulates override on pointerup.
 * - Escape cancels drag. Right-click is prevented.
 * - Zero forced layout on keydown/pointermove: cached container offsets, no getBoundingClientRect on move.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BaseDurationType, Pitch, Score } from '../core/model';
import { computeCursorPosition } from '../layout/cursor';
import { layoutScore } from '../layout/layoutScore';
import { yToStaffPosition, pitchToStaffPosition, staffPositionToY, getLedgerLineYs } from '../layout/pitch';
import { xToCursor, snapDragOffset, applyAxisLock } from '../layout/mouse';
import { ScoreCursor } from '../core/input';
import { useI18n } from './i18n';
import { SystemView } from './SystemView';
import { getGlyphPath, UNITS_PER_EM } from '../render/glyphPaths.generated';

export interface ScoreViewProps {
  score: Score;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  cursor?: ScoreCursor | null;
  isInputMode?: boolean;
  activeDuration?: BaseDurationType;
  onSelectMeasure?: (measureId: string, tick?: number) => void;
  onEnterPitchDirect?: (pitch: Pitch, customCursor?: ScoreCursor) => void;
  onApplyOverride?: (eventId: string, dx: number, dy: number, accumulate?: boolean) => void;
  onHoverPitch?: (pitch: Pitch | null) => void;
}

interface GhostNoteData {
  pitch: Pitch;
  sysIndex: number;
  sysY: number;
  x: number;
  y: number;
  glyph: string;
  ledgerYs: number[];
}

export const ScoreView: React.FC<ScoreViewProps> = ({
  score,
  selectedEventId,
  onSelectEvent,
  cursor = null,
  isInputMode = false,
  activeDuration = 'quarter',
  onSelectMeasure,
  onEnterPitchDirect,
  onApplyOverride,
  onHoverPitch,
}) => {
  const { zoom } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState<number>(1000);

  // Cached container bounding rect to prevent getBoundingClientRect on pointermove
  const containerRectRef = useRef<{ left: number; top: number; width: number; height: number }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  // Drag tracking refs
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    eventId: string;
    isDragging: boolean;
    dx: number;
    dy: number;
  } | null>(null);
  const dragRafIdRef = useRef<number | null>(null);
  const hasDraggedRef = useRef<boolean>(false);

  // Ghost note state
  const [ghostNote, setGhostNote] = useState<GhostNoteData | null>(null);
  const lastHoverPitchRef = useRef<Pitch | null>(null);

  // A/B test query flag: ?text restores old <text> rendering
  const useTextFallback = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('text');
  }, []);

  const updateContainerRect = useCallback(() => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    containerRectRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) {
          setContainerWidthPx(w);
          updateContainerRect();
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [updateContainerRect]);

  const staffSpacePx = 10 * zoom;
  const scale = staffSpacePx / (UNITS_PER_EM / 4);

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

  // Distinct glyph names used in this score for <defs> (always includes noteheads for ghost note)
  const usedGlyphs = useMemo(() => {
    if (useTextFallback) return [];
    const set = new Set<string>(['noteheadBlack', 'noteheadHalf', 'noteheadWhole']);
    for (const sys of layout.systems) {
      for (const it of sys.items) {
        if (!it.hidden && it.kind === 'glyph' && it.glyph) {
          set.add(it.glyph);
        }
      }
    }
    return Array.from(set).sort();
  }, [layout, useTextFallback]);

  // Compute cursor position as an overlay (does NOT recompute layoutScore)
  const cursorPos = useMemo(() => {
    if (!cursor) return null;
    return computeCursorPosition(layout, score, cursor);
  }, [layout, score, cursor]);

  const cursorLineRef = useRef<SVGLineElement | null>(null);

  // Keep cursor visible: ZERO getBoundingClientRect, ZERO forced layout.
  useEffect(() => {
    if (!isInputMode || !cursorPos) return;

    const rafId = requestAnimationFrame(() => {
      const containerEl = containerRef.current;
      if (!containerEl) return;

      const topOffset = 72;
      const cursorTop = topOffset + cursorPos.y1 * staffSpacePx;
      const cursorBottom = topOffset + cursorPos.y2 * staffSpacePx;

      const scrollTop = containerEl.scrollTop;
      const clientHeight = containerEl.clientHeight;

      const margin = 20;
      const isAbove = cursorTop < scrollTop + margin;
      const isBelow = cursorBottom > scrollTop + clientHeight - margin;

      if (isAbove) {
        containerEl.scrollTop = Math.max(0, cursorTop - margin * 2);
      } else if (isBelow) {
        containerEl.scrollTop = cursorBottom - clientHeight + margin * 2;
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [isInputMode, cursorPos?.systemIndex, cursorPos?.x, cursorPos?.y1, staffSpacePx]);

  // Cancel drag on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragStateRef.current?.isDragging) {
        if (dragRafIdRef.current) {
          cancelAnimationFrame(dragRafIdRef.current);
          dragRafIdRef.current = null;
        }
        const groupEl = svgRef.current?.querySelector(
          `g[data-event-id="${dragStateRef.current.eventId}"]`
        );
        if (groupEl) {
          groupEl.removeAttribute('transform');
        }
        dragStateRef.current = null;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  // Locate event by ID in score
  const findEvent = useCallback(
    (eventId: string) => {
      const staff = score.parts[0]?.staves[0];
      if (!staff) return null;
      for (const mDef of score.measures) {
        const sm = staff.measures[mDef.id];
        if (!sm) continue;
        for (const voice of sm.voices) {
          const ev = voice.events.find((e) => e.id === eventId);
          if (ev) return ev;
        }
      }
      return null;
    },
    [score]
  );

  // Pointer event handlers
  const handlePointerEnter = () => {
    updateContainerRect();
  };

  const handlePointerLeave = () => {
    setGhostNote(null);
    lastHoverPitchRef.current = null;
    onHoverPitch?.(null);

    if (dragStateRef.current?.isDragging) {
      const groupEl = svgRef.current?.querySelector(
        `g[data-event-id="${dragStateRef.current.eventId}"]`
      );
      if (groupEl) groupEl.removeAttribute('transform');
      dragStateRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only primary button starts drag

    const target = e.target as Element | null;
    const hitElement = target?.closest('[data-event-id]');
    const eventId = hitElement?.getAttribute('data-event-id');

    if (eventId) {
      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        eventId,
        isDragging: false,
        dx: 0,
        dy: 0,
      };
      hasDraggedRef.current = false;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 1. Process drag if pointerdown was on an event
    if (dragStateRef.current) {
      const deltaPxX = e.clientX - dragStateRef.current.startX;
      const deltaPxY = e.clientY - dragStateRef.current.startY;
      const dist = Math.hypot(deltaPxX, deltaPxY);

      if (!dragStateRef.current.isDragging && dist >= 4) {
        dragStateRef.current.isDragging = true;
        hasDraggedRef.current = true;
        onSelectEvent(dragStateRef.current.eventId);
      }

      if (dragStateRef.current.isDragging) {
        const rawDx = deltaPxX / staffSpacePx;
        const rawDy = deltaPxY / staffSpacePx;
        const locked = applyAxisLock(rawDx, rawDy, e.shiftKey);
        const snappedDx = snapDragOffset(locked.dx, e.altKey);
        const snappedDy = snapDragOffset(locked.dy, e.altKey);
        dragStateRef.current.dx = snappedDx;
        dragStateRef.current.dy = snappedDy;

        // Visual feedback directly on SVG group via rAF (ZERO React state)
        if (!dragRafIdRef.current) {
          dragRafIdRef.current = requestAnimationFrame(() => {
            dragRafIdRef.current = null;
            if (!dragStateRef.current?.isDragging) return;
            const groupEl = svgRef.current?.querySelector(
              `g[data-event-id="${dragStateRef.current.eventId}"]`
            );
            if (groupEl) {
              const tx = dragStateRef.current.dx * staffSpacePx;
              const ty = dragStateRef.current.dy * staffSpacePx;
              groupEl.setAttribute('transform', `translate(${tx}, ${ty})`);
            }
          });
        }
        return;
      }
    }

    // 2. Ghost note tracking in Note Input Mode (uses cached rect, NO getBoundingClientRect)
    if (isInputMode) {
      const relX = (e.clientX - containerRectRef.current.left) / staffSpacePx;
      const relY = (e.clientY - containerRectRef.current.top) / staffSpacePx;

      // Identify target system
      let targetSys = layout.systems[0];
      for (const sys of layout.systems) {
        if (relY >= sys.y - 4 && relY <= sys.y + 10) {
          targetSys = sys;
          break;
        }
      }

      if (!targetSys) return;

      const systemRelX = relX - targetSys.x;
      const systemRelY = relY - targetSys.y;

      const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
      const mDef = score.measures.find((m) => m.id === cursor?.measureId) ?? score.measures[0];
      const keySig = mDef?.keySig ?? 0;

      const hoveredPitch = yToStaffPosition(clef, systemRelY, keySig);
      if (
        !lastHoverPitchRef.current ||
        lastHoverPitchRef.current.step !== hoveredPitch.step ||
        lastHoverPitchRef.current.octave !== hoveredPitch.octave ||
        lastHoverPitchRef.current.alter !== hoveredPitch.alter
      ) {
        lastHoverPitchRef.current = hoveredPitch;
        onHoverPitch?.(hoveredPitch);
      }

      const stepPos = pitchToStaffPosition(hoveredPitch, clef);
      const snappedY = staffPositionToY(stepPos);
      const ledgerYs = getLedgerLineYs(stepPos);

      const glyph =
        activeDuration === 'whole'
          ? 'noteheadWhole'
          : activeDuration === 'half'
          ? 'noteheadHalf'
          : 'noteheadBlack';

      // Ghost horizontal position: snap to cursor position if in same system, else xToCursor
      let ghostX = cursorPos && cursorPos.systemIndex === targetSys.index ? cursorPos.x : systemRelX;
      const targetCursor = xToCursor(layout, targetSys.index, systemRelX, score);
      if (targetCursor) {
        const sId = score.parts[0]?.staves[0]?.id;
        const staff = score.parts[0]?.staves[0];
        const sm = staff?.measures[targetCursor.measureId];
        const vId = sm?.voices[0]?.id;
        if (sId && vId) {
          const computed = computeCursorPosition(layout, score, {
            staffId: sId,
            voiceId: vId,
            measureId: targetCursor.measureId,
            tick: targetCursor.tick,
          });
          if (computed && computed.systemIndex === targetSys.index) {
            ghostX = computed.x;
          }
        }
      }

      setGhostNote({
        pitch: hoveredPitch,
        sysIndex: targetSys.index,
        sysY: targetSys.y,
        x: ghostX,
        y: snappedY,
        glyph,
        ledgerYs,
      });
    }
  };

  const handlePointerUp = () => {
    if (dragRafIdRef.current) {
      cancelAnimationFrame(dragRafIdRef.current);
      dragRafIdRef.current = null;
    }

    if (dragStateRef.current?.isDragging) {
      const { eventId, dx, dy } = dragStateRef.current;
      const groupEl = svgRef.current?.querySelector(`g[data-event-id="${eventId}"]`);
      if (groupEl) {
        groupEl.removeAttribute('transform');
      }

      if (dx !== 0 || dy !== 0) {
        onApplyOverride?.(eventId, dx, dy, true);
      }
    }

    dragStateRef.current = null;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If a drag operation took place, suppress click handler
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    const target = e.target as Element | null;
    if (!target) return;

    const hitElement = target.closest('[data-event-id]');
    const clickedEventId = hitElement?.getAttribute('data-event-id');

    // 1. In Note Input Mode:
    if (isInputMode) {
      // If clicking an existing note WITHOUT Alt held: select it (no replacement)
      if (clickedEventId && !e.altKey) {
        const ev = findEvent(clickedEventId);
        if (ev && ev.kind === 'note') {
          onSelectEvent(clickedEventId);
          syncCursorToEvent(clickedEventId);
          return;
        }
      }

      // If Alt is held OR clicked on empty space / rest: enter note at target position
      if (onEnterPitchDirect) {
        if (containerRectRef.current.width === 0) {
          updateContainerRect();
        }
        const relX = (e.clientX - containerRectRef.current.left) / staffSpacePx;
        const relY = (e.clientY - containerRectRef.current.top) / staffSpacePx;

        let targetSys = layout.systems[0];
        for (const sys of layout.systems) {
          if (relY >= sys.y - 4 && relY <= sys.y + 10) {
            targetSys = sys;
            break;
          }
        }

        if (targetSys) {
          const systemRelX = relX - targetSys.x;
          const systemRelY = relY - targetSys.y;
          const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
          const mDef = score.measures.find((m) => m.id === cursor?.measureId) ?? score.measures[0];
          const keySig = mDef?.keySig ?? 0;
          const clickedPitch = yToStaffPosition(clef, systemRelY, keySig);

          const targetCursor = xToCursor(layout, targetSys.index, systemRelX, score);
          if (targetCursor) {
            const sId = score.parts[0]?.staves[0]?.id;
            const staff = score.parts[0]?.staves[0];
            const sm = staff?.measures[targetCursor.measureId];
            const vId = sm?.voices[0]?.id;
            if (sId && vId) {
              onEnterPitchDirect(clickedPitch, {
                staffId: sId,
                voiceId: vId,
                measureId: targetCursor.measureId,
                tick: targetCursor.tick,
              });
              return;
            }
          }
        }
      }
      return;
    }

    // 2. Normal Selection Mode:
    if (clickedEventId) {
      onSelectEvent(clickedEventId);
      syncCursorToEvent(clickedEventId);
      return;
    }

    // Click on measure hit area or system background
    const measureEl = target.closest('[data-measure-id]');
    const sysEl = target.closest('[data-system-index]');
    if (sysEl && onSelectMeasure) {
      const sysIdx = parseInt(sysEl.getAttribute('data-system-index') ?? '0', 10);
      const sys = layout.systems[sysIdx];
      if (sys) {
        const clickRelX = (e.clientX - containerRectRef.current.left) / staffSpacePx;
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(e) => e.preventDefault()}
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
        userSelect: 'none',
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
            ? `svg g[data-event-id="${selectedEventId}"] {
                fill: #2563eb !important;
                stroke: #2563eb !important;
              }`
            : ''
        }
        .score-event-group {
          cursor: grab;
        }
        .score-event-group:active {
          cursor: grabbing;
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
          contain: 'layout paint',
          willChange: 'auto',
        }}
      >
        <svg
          ref={svgRef}
          className="notranslate"
          viewBox={`0 0 ${totalWidthPx} ${totalHeightPx}`}
          width={`${totalWidthPx}px`}
          height={`${totalHeightPx}px`}
          style={{ color: '#000000', overflow: 'visible', userSelect: 'none', display: 'block' }}
        >
          {/* Vector path definitions for used SMuFL glyphs */}
          {!useTextFallback && (
            <defs>
              {usedGlyphs.map((glyphName) => {
                const pathD = getGlyphPath(glyphName);
                if (!pathD) return null;
                return <path key={glyphName} id={`glyph-${glyphName}`} d={pathD} />;
              })}
            </defs>
          )}

          {layout.systems.map((sys) => (
            <SystemView
              key={sys.index}
              system={sys}
              staffSpacePx={staffSpacePx}
              useTextFallback={useTextFallback}
            />
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

          {/* Semi-transparent ghost note overlay in note input mode */}
          {isInputMode && ghostNote && (
            <g className="score-ghost-note notranslate" pointerEvents="none">
              {ghostNote.ledgerYs.map((ly) => (
                <line
                  key={`ghost-ledger-${ly}`}
                  x1={(ghostNote.x - 0.4) * staffSpacePx}
                  y1={(ghostNote.sysY + ly) * staffSpacePx}
                  x2={(ghostNote.x + 1.6) * staffSpacePx}
                  y2={(ghostNote.sysY + ly) * staffSpacePx}
                  stroke="#2563eb"
                  strokeWidth={1.6 * zoom}
                  opacity={0.45}
                  strokeLinecap="butt"
                />
              ))}
              <use
                href={`#glyph-${ghostNote.glyph}`}
                transform={`translate(${ghostNote.x * staffSpacePx}, ${(ghostNote.sysY + ghostNote.y) * staffSpacePx}) scale(${scale})`}
                fill="#2563eb"
                opacity={0.45}
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
