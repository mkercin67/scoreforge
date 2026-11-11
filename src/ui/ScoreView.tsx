/**
 * High-performance, declarative ScoreView component.
 *
 * Core architectural guarantees:
 * - Uses SVG <use> vector symbols referencing in-document glyph <path> defs by default (zero font layout overhead).
 * - Zero forced layout on keydown/pointermove: cached container offsets, no getBoundingClientRect on move.
 * - Memoized SystemView rendering per-system.
 * - Hardware accelerated container scrolling (contain: layout paint).
 * - Live drag feedback for plain vertical pitch drag (snapped to 0.5 staff spaces, live ledger lines, faint ghost)
 *   and Alt+drag manual positioning (horizontal only on notes, dx+dy on rests).
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BaseDurationType, NoteEvent, Pitch, Score, ScoreEvent } from '../core/model';
import { layoutScore } from '../layout/layoutScore';
import {
  clampOverrideOffset,
  getSystemMeasureBounds,
  hitTestEvent,
  isDragPastThreshold,
  snapDragOffset,
  xToCursor,
} from '../layout/mouse';
import {
  getLedgerLineYs,
  pitchToStaffPosition,
  staffPositionToY,
  yToStaffPosition,
} from '../layout/pitch';
import { getGlyphPath, UNITS_PER_EM } from '../render/glyphPaths.generated';
import { SystemView } from './SystemView';
import { formatPitchName, useI18n } from './i18n';
import { ScoreCursor } from '../core/input';
import { computeCursorPosition } from '../layout/cursor';

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
  onChangePitch?: (eventId: string, pitches: Pitch[]) => void;
  onHoverPitch?: (pitch: Pitch | null) => void;
  onHoverInfo?: (info: { pitch: Pitch; measureNumber: number } | null) => void;
  onDragStatus?: (status: string | null) => void;
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
  onChangePitch,
  onHoverPitch,
  onHoverInfo,
  onDragStatus,
}) => {
  const { t, zoom, noteNameStyle, language } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragOverlayRef = useRef<SVGGElement>(null);
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
    isAltDrag: boolean;
    isNote: boolean;
    isRest: boolean;
    originalPitches: Pitch[];
    startStepPositions: number[];
    isDragging: boolean;
    dx: number;
    dy: number;
    stepDelta: number;
    targetPitches: Pitch[];
  } | null>(null);
  const dragRafIdRef = useRef<number | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const enteredOnPointerDownRef = useRef<boolean>(false);
  const altHeldRef = useRef<boolean>(false);
  const [isAltHeld, setIsAltHeld] = useState<boolean>(false);
  const [isDraggingState, setIsDraggingState] = useState<boolean>(false);

  // Ghost note state
  const [ghostNote, setGhostNote] = useState<GhostNoteData | null>(null);
  const lastHoverPitchRef = useRef<Pitch | null>(null);

  // Optional URL flag to toggle SMuFL <text> fallback for performance comparison (?text=1)
  const useTextFallback = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('text') || params.get('renderer') === 'text';
  }, []);

  // Synchronously measure container bounding rect ONLY when entered, resized or zoomed
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

  // ResizeObserver attached to the white card container (content-box width, no scrollbars)
  useEffect(() => {
    const el = cardRef.current;
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

  // Content width in staff spaces (no Math.max(50, ...) clamping, fits exact card width)
  const availableStaffSpaces = Math.max(25, Math.floor(containerWidthPx / staffSpacePx));

  // Compute layout ONLY when score, width or scale changes
  const layout = useMemo(() => {
    return layoutScore(score, { width: availableStaffSpaces });
  }, [score, availableStaffSpaces]);

  // Distinct glyph names used in this score for <defs>
  const usedGlyphs = useMemo(() => {
    const set = new Set<string>();
    // Always include noteheads for ghost note and interactive drag
    set.add('noteheadBlack');
    set.add('noteheadHalf');
    set.add('noteheadWhole');
    set.add('restWhole');
    set.add('restHalf');
    set.add('restQuarter');
    set.add('rest8th');
    set.add('rest16th');
    set.add('rest32nd');
    for (const item of layout.items) {
      if (item.kind === 'glyph' && item.glyph) {
        set.add(item.glyph);
      }
    }
    return Array.from(set);
  }, [layout.items]);

  // Cursor overlay positioning
  const cursorPos = useMemo(() => {
    if (!isInputMode || !cursor) return null;
    return computeCursorPosition(layout, score, cursor);
  }, [layout, score, cursor, isInputMode]);

  const cursorLineRef = useRef<SVGLineElement>(null);

  // Update cursor position
  useLayoutEffect(() => {
    if (!isInputMode || !cursorPos || !cursorLineRef.current) return;
    const x = cursorPos.x * staffSpacePx;
    const y1 = cursorPos.y1 * staffSpacePx;
    const y2 = cursorPos.y2 * staffSpacePx;
    cursorLineRef.current.setAttribute('x1', String(x));
    cursorLineRef.current.setAttribute('y1', String(y1));
    cursorLineRef.current.setAttribute('x2', String(x));
    cursorLineRef.current.setAttribute('y2', String(y2));
  }, [cursorPos, staffSpacePx, isInputMode]);

  // Keep cursor visible without getBoundingClientRect
  useEffect(() => {
    if (!isInputMode || !cursorPos || !containerRef.current) return;
    const container = containerRef.current;
    const cursorY1 = cursorPos.y1 * staffSpacePx;
    const cursorY2 = cursorPos.y2 * staffSpacePx;
    const scrollTop = container.scrollTop;
    const clientH = container.clientHeight;

    if (cursorY1 < scrollTop) {
      container.scrollTop = Math.max(0, cursorY1 - 20);
    } else if (cursorY2 > scrollTop + clientH) {
      container.scrollTop = cursorY2 - clientH + 20;
    }
  }, [cursorPos, staffSpacePx, isInputMode]);

  // Escape key cancels active drag; Alt key prevents Chrome menu focus and hides ghost note
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altHeldRef.current = true;
        setIsAltHeld(true);
        setGhostNote(null);
        if (isInputMode || dragStateRef.current?.isDragging) {
          e.preventDefault();
        }
      }
      if (e.key === 'Escape' && dragStateRef.current?.isDragging) {
        const eventId = dragStateRef.current.eventId;
        const groupEl = svgRef.current?.querySelector(`g[data-event-id="${eventId}"]`) as HTMLElement | null;
        if (groupEl) groupEl.style.opacity = '1';
        if (dragOverlayRef.current) dragOverlayRef.current.innerHTML = '';
        onDragStatus?.(null);
        setIsDraggingState(false);
        dragStateRef.current = null;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altHeldRef.current = false;
        setIsAltHeld(false);
        if (isInputMode || dragStateRef.current?.isDragging) {
          e.preventDefault();
        }
      }
    };
    const handleBlur = () => {
      altHeldRef.current = false;
      setIsAltHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [onDragStatus, isInputMode]);

  // Pure coordinate helper using cached SVG rect
  const getPointerSystemCoords = (clientX: number, clientY: number) => {
    if (containerRectRef.current.width === 0 && svgRef.current) {
      updateContainerRect();
    }
    const relX = (clientX - containerRectRef.current.left) / staffSpacePx;
    const relY = (clientY - containerRectRef.current.top) / staffSpacePx;

    let targetSys = layout.systems[0] ?? null;
    let minDist = Infinity;
    for (const sys of layout.systems) {
      const dist = Math.abs(relY - (sys.y + 2));
      if (dist < minDist) {
        minDist = dist;
        targetSys = sys;
      }
    }
    if (!targetSys) return null;
    return {
      relX,
      relY,
      targetSys,
      sysRelX: relX - targetSys.x,
      sysRelY: relY - targetSys.y,
    };
  };

  // Enters a pitch directly at pointer location in Note Input Mode
  const enterPitchAtPointer = (clientX: number, clientY: number) => {
    if (!onEnterPitchDirect) return;
    const coords = getPointerSystemCoords(clientX, clientY);
    if (!coords) return;
    const { targetSys, sysRelX, sysRelY } = coords;
    const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
    const clickedCursor = xToCursor(layout, targetSys.index, sysRelX, score);
    const mDef = score.measures.find((m) => m.id === clickedCursor?.measureId) ?? score.measures[0];
    const keySig = mDef?.keySig ?? 0;
    const clickedPitch = yToStaffPosition(clef, sysRelY, keySig);

    if (clickedCursor) {
      const sId = score.parts[0]?.staves[0]?.id;
      const staff = score.parts[0]?.staves[0];
      const sm = staff?.measures[clickedCursor.measureId];
      const vId = sm?.voices[0]?.id;
      if (sId && vId) {
        onEnterPitchDirect(clickedPitch, {
          staffId: sId,
          voiceId: vId,
          measureId: clickedCursor.measureId,
          tick: clickedCursor.tick,
        });
      }
    }
  };

  // Pointer event handlers
  const handlePointerEnter = () => {
    updateContainerRect();
  };

  const handlePointerLeave = () => {
    setGhostNote(null);
    lastHoverPitchRef.current = null;
    onHoverPitch?.(null);
    onHoverInfo?.(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only primary button starts drag
    enteredOnPointerDownRef.current = false;

    const coords = getPointerSystemCoords(e.clientX, e.clientY);
    const isAlt = e.altKey || altHeldRef.current;
    const hit = coords ? hitTestEvent(layout, coords.targetSys.index, coords.sysRelX, coords.sysRelY) : null;

    // In Note Input Mode:
    // - Without Alt: pointerdown enters note (replace semantics on existing note/rest or in empty measure)
    // - With Alt: selects event and starts manual-position drag
    if (isInputMode && !isAlt) {
      enterPitchAtPointer(e.clientX, e.clientY);
      enteredOnPointerDownRef.current = true;
      dragStateRef.current = null;
      hasDraggedRef.current = false;
      return;
    }

    if (hit) {
      const eventId = hit.eventId;
      let foundEvent: ScoreEvent | null = null;
      for (const p of score.parts) {
        for (const st of p.staves) {
          for (const mId of Object.keys(st.measures)) {
            const ev = st.measures[mId].voices[0]?.events.find((it) => it.id === eventId);
            if (ev) {
              foundEvent = ev;
              break;
            }
          }
          if (foundEvent) break;
        }
        if (foundEvent) break;
      }

      const isNote = foundEvent?.kind === 'note';
      const isRest = foundEvent?.kind === 'rest';

      if (isInputMode && isAlt) {
        onSelectEvent(eventId);
      }

      // Outside input mode, plain drag on rest = select only (do not start drag)
      if (!isInputMode && !isAlt && isRest) {
        onSelectEvent(eventId);
        dragStateRef.current = null;
        hasDraggedRef.current = false;
        return;
      }

      const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
      const originalPitches = isNote ? (foundEvent as NoteEvent).pitches : [];
      const startStepPositions = originalPitches.map((p) => pitchToStaffPosition(p, clef));

      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        eventId,
        isAltDrag: isAlt,
        isNote,
        isRest,
        originalPitches,
        startStepPositions,
        isDragging: false,
        dx: 0,
        dy: 0,
        stepDelta: 0,
        targetPitches: originalPitches,
      };
      hasDraggedRef.current = false;
    } else {
      dragStateRef.current = null;
      hasDraggedRef.current = false;
    }
  };

  const clearDragFeedback = () => {
    if (dragOverlayRef.current) {
      dragOverlayRef.current.innerHTML = '';
    }
  };

  const renderManualDragFeedback = (eventId: string, dx: number, dy: number) => {
    if (!dragOverlayRef.current || !svgRef.current) return;
    const groupEl = svgRef.current.querySelector(`g[data-event-id="${eventId}"]`);
    if (!groupEl) return;
    const tx = dx * staffSpacePx;
    const ty = dy * staffSpacePx;
    dragOverlayRef.current.innerHTML = `<g transform="translate(${tx}, ${ty})">${groupEl.innerHTML}</g>`;
  };

  const renderPitchDragFeedback = (
    eventId: string,
    stepDelta: number,
    startStepPositions: number[]
  ) => {
    if (!dragOverlayRef.current || !svgRef.current) return;
    const groupEl = svgRef.current.querySelector(`g[data-event-id="${eventId}"]`);
    if (!groupEl) return;

    const ty = -stepDelta * 0.5 * staffSpacePx;
    const targetSys = layout.systems.find((sys) => sys.items.some((it) => it.eventId === eventId)) ?? layout.systems[0];
    const noteItem = layout.items.find((it) => it.eventId === eventId && it.kind === 'glyph');

    let ledgerSvg = '';
    if (noteItem) {
      for (const sp of startStepPositions.map((s) => s + stepDelta)) {
        const lYs = getLedgerLineYs(sp);
        for (const ly of lYs) {
          const lyPx = (targetSys.y + ly) * staffSpacePx;
          const lx1 = (targetSys.x + noteItem.x - 0.4) * staffSpacePx;
          const lx2 = (targetSys.x + noteItem.x + 1.18 + 0.4) * staffSpacePx;
          ledgerSvg += `<line x1="${lx1}" y1="${lyPx}" x2="${lx2}" y2="${lyPx}" stroke="#2563eb" stroke-width="${0.16 * staffSpacePx}" stroke-linecap="butt" />`;
        }
      }
    }

    dragOverlayRef.current.innerHTML = `<g transform="translate(0, ${ty})">${groupEl.innerHTML}</g>${ledgerSvg}`;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 1. Process drag if pointerdown was on an event
    if (dragStateRef.current) {
      const deltaPxX = e.clientX - dragStateRef.current.startX;
      const deltaPxY = e.clientY - dragStateRef.current.startY;

      if (!dragStateRef.current.isDragging && isDragPastThreshold(deltaPxX, deltaPxY, 4)) {
        dragStateRef.current.isDragging = true;
        setIsDraggingState(true);
        setGhostNote(null);
        hasDraggedRef.current = true;
        onSelectEvent(dragStateRef.current.eventId);

        // Dim original element to opacity 0.3
        const groupEl = svgRef.current?.querySelector(
          `g[data-event-id="${dragStateRef.current.eventId}"]`
        ) as HTMLElement | null;
        if (groupEl) {
          groupEl.style.opacity = '0.3';
        }
      }

      if (dragStateRef.current.isDragging) {
        const { eventId, isAltDrag, isNote, isRest, startStepPositions } = dragStateRef.current;
        const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
        const mDef = score.measures.find((m) => m.id === cursor?.measureId) ?? score.measures[0];
        const keySig = mDef?.keySig ?? 0;

        if (!isAltDrag && isNote && startStepPositions.length > 0) {
          // Plain vertical drag of note/chord: CHANGES PITCH
          // Horizontal pointer movement is ignored!
          const deltaYSpaces = deltaPxY / staffSpacePx;
          const stepDelta = Math.round(-deltaYSpaces * 2);

          // Chord clamp bounds [-3, 11]
          const minSp = Math.min(...startStepPositions);
          const maxSp = Math.max(...startStepPositions);
          const clampedStepDelta = Math.max(-3 - minSp, Math.min(11 - maxSp, stepDelta));

          const targetPitches = startStepPositions.map((sp) =>
            yToStaffPosition(clef, staffPositionToY(sp + clampedStepDelta), keySig)
          );
          dragStateRef.current.stepDelta = clampedStepDelta;
          dragStateRef.current.targetPitches = targetPitches;

          // Status bar shows target pitch via formatPitchName
          const pitchName = targetPitches
            .map((p) => formatPitchName(p, noteNameStyle, language))
            .join(', ');
          onDragStatus?.(pitchName);

          // Update drag overlay via rAF
          if (!dragRafIdRef.current) {
            dragRafIdRef.current = requestAnimationFrame(() => {
              dragRafIdRef.current = null;
              if (!dragStateRef.current?.isDragging) return;
              renderPitchDragFeedback(dragStateRef.current.eventId, clampedStepDelta, startStepPositions);
            });
          }
          return;
        }

        if (isAltDrag) {
          // Alt + drag = manual position
          // Notes/chords: horizontal only (dx), rests: dx and dy
          const rawDeltaDx = deltaPxX / staffSpacePx;
          const rawDeltaDy = isRest ? deltaPxY / staffSpacePx : 0;
          const snappedDeltaDx = snapDragOffset(rawDeltaDx, Boolean(e.shiftKey));
          const snappedDeltaDy = isRest ? snapDragOffset(rawDeltaDy, Boolean(e.shiftKey)) : 0;

          const targetSys = layout.systems.find((s) => s.items.some((it) => it.eventId === eventId));
          const eventItems = targetSys ? targetSys.items.filter((it) => it.eventId === eventId) : [];
          const mBoundsList = targetSys ? getSystemMeasureBounds(targetSys) : [];
          let evMeasureId: string | undefined;
          for (const p of score.parts) {
            for (const st of p.staves) {
              for (const mId of Object.keys(st.measures)) {
                if (st.measures[mId].voices[0]?.events.some((ev) => ev.id === eventId)) {
                  evMeasureId = mId;
                  break;
                }
              }
              if (evMeasureId) break;
            }
            if (evMeasureId) break;
          }
          const mBounds = evMeasureId ? mBoundsList.find((b) => b.measureId === evMeasureId) : undefined;
          const existingApplied = layout.appliedOverrides?.[eventId] ?? { dx: 0, dy: 0 };

          const targetRawDx = existingApplied.dx + snappedDeltaDx;
          const targetRawDy = isRest ? existingApplied.dy + snappedDeltaDy : 0;

          let finalTotalDx = Math.max(-4, Math.min(4, targetRawDx));
          let finalTotalDy = isRest ? Math.max(-6, Math.min(6, targetRawDy)) : 0;
          let isAtLimit =
            targetRawDx <= -4 ||
            targetRawDx >= 4 ||
            (isRest && (targetRawDy <= -6 || targetRawDy >= 6));

          if (mBounds && eventItems.length > 0) {
            const clamped = clampOverrideOffset(
              eventItems,
              mBounds,
              targetRawDx,
              targetRawDy,
              isRest,
              existingApplied.dx
            );
            finalTotalDx = clamped.dx;
            finalTotalDy = clamped.dy;
            isAtLimit = clamped.isAtLimit;
          }

          dragStateRef.current.dx = finalTotalDx;
          dragStateRef.current.dy = finalTotalDy;

          const visDx = finalTotalDx - existingApplied.dx;
          const visDy = finalTotalDy - existingApplied.dy;

          const dxStr = `${finalTotalDx >= 0 ? '+' : ''}${finalTotalDx.toFixed(2)}`;
          const dyStr = `${finalTotalDy >= 0 ? '+' : ''}${finalTotalDy.toFixed(2)}`;
          const limitSuffix = isAtLimit ? ` · ${t('status.offsetLimit')}` : '';
          const statusStr =
            (isRest && finalTotalDy !== 0 ? `dx ${dxStr} · dy ${dyStr}` : `dx ${dxStr}`) +
            limitSuffix;
          onDragStatus?.(statusStr);

          if (!dragRafIdRef.current) {
            dragRafIdRef.current = requestAnimationFrame(() => {
              dragRafIdRef.current = null;
              if (!dragStateRef.current?.isDragging) return;
              renderManualDragFeedback(dragStateRef.current.eventId, visDx, visDy);
            });
          }
          return;
        }
      }
    }

    // 2. Ghost note tracking in Note Input Mode (hidden while Alt held or dragging)
    if (isInputMode) {
      if (e.altKey || altHeldRef.current || dragStateRef.current?.isDragging) {
        setGhostNote(null);
        return;
      }

      const coords = getPointerSystemCoords(e.clientX, e.clientY);
      if (!coords) return;
      const { targetSys, sysRelX: systemRelX, sysRelY: systemRelY } = coords;

      const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
      const mDef = score.measures.find((m) => m.id === cursor?.measureId) ?? score.measures[0];
      const keySig = mDef?.keySig ?? 0;

      const hoveredPitch = yToStaffPosition(clef, systemRelY, keySig);
      const targetCursor = xToCursor(layout, targetSys.index, systemRelX, score);
      const hoveredMeasureIdx = score.measures.findIndex((m) => m.id === targetCursor?.measureId);
      const hoveredMeasureNumber = hoveredMeasureIdx >= 0 ? hoveredMeasureIdx + 1 : 1;

      if (
        !lastHoverPitchRef.current ||
        lastHoverPitchRef.current.step !== hoveredPitch.step ||
        lastHoverPitchRef.current.octave !== hoveredPitch.octave ||
        lastHoverPitchRef.current.alter !== hoveredPitch.alter
      ) {
        lastHoverPitchRef.current = hoveredPitch;
        onHoverPitch?.(hoveredPitch);
        onHoverInfo?.({ pitch: hoveredPitch, measureNumber: hoveredMeasureNumber });
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

      // Ghost horizontal position: snap to cursor position if in same system, else targetCursor
      let ghostX = cursorPos && cursorPos.systemIndex === targetSys.index ? cursorPos.x : systemRelX;
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
      const { eventId, isAltDrag, isNote, dx, dy, stepDelta, targetPitches } = dragStateRef.current;
      const groupEl = svgRef.current?.querySelector(`g[data-event-id="${eventId}"]`) as HTMLElement | null;
      if (groupEl) groupEl.style.opacity = '1';
      clearDragFeedback();
      onDragStatus?.(null);

      if (!isAltDrag && isNote) {
        if (stepDelta !== 0 && targetPitches.length > 0) {
          onChangePitch?.(eventId, targetPitches);
        }
      } else if (isAltDrag) {
        const existingApplied = layout.appliedOverrides?.[eventId] ?? { dx: 0, dy: 0 };
        if (dx !== existingApplied.dx || dy !== existingApplied.dy) {
          onApplyOverride?.(eventId, dx, dy, false);
        }
      }
    }

    setIsDraggingState(false);
    dragStateRef.current = null;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (enteredOnPointerDownRef.current) {
      enteredOnPointerDownRef.current = false;
      return;
    }

    // If a drag operation took place, suppress click handler
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    const coords = getPointerSystemCoords(e.clientX, e.clientY);
    const isAlt = e.altKey || altHeldRef.current;
    const hit = coords ? hitTestEvent(layout, coords.targetSys.index, coords.sysRelX, coords.sysRelY) : null;

    // 1. In Note Input Mode:
    if (isInputMode) {
      if (hit && isAlt) {
        onSelectEvent(hit.eventId);
        return;
      }
      if (!isAlt) {
        enterPitchAtPointer(e.clientX, e.clientY);
      }
      return;
    }

    // 2. Normal selection mode:
    if (hit) {
      onSelectEvent(hit.eventId);
      return;
    }

    // Clicked empty measure space: select measure and place cursor
    if (coords && onSelectMeasure) {
      const found = xToCursor(layout, coords.targetSys.index, coords.sysRelX, score);
      if (found) {
        onSelectMeasure(found.measureId, found.tick);
        onSelectEvent(null);
      }
    }
  };

  const totalWidthPx = layout.width * staffSpacePx;
  const totalHeightPx = layout.height * staffSpacePx;

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
              }
              svg g[data-event-id="${selectedEventId}"] text {
                fill: #2563eb !important;
              }
              svg line[data-event-id="${selectedEventId}"] {
                stroke: #2563eb !important;
              }`
            : ''
        }
        /* Measure hover guide in note input mode */
        svg rect.measure-hit-area {
          fill: transparent !important;
          stroke: none !important;
        }
        ${
          isInputMode
            ? `svg rect.measure-hit-area:hover {
                fill: rgba(37, 99, 235, 0.04) !important;
                stroke: none !important;
              }`
            : ''
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
        ref={cardRef}
        className="notranslate"
        translate="no"
        style={{
          position: 'relative',
          backgroundColor: '#ffffff',
          padding: '2.5rem 3rem',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
          maxWidth: '100%',
          boxSizing: 'border-box',
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
          {isInputMode && ghostNote && !isAltHeld && !isDraggingState && (
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

          {/* Live drag feedback overlay (pitch drag or Alt+drag manual position) */}
          <g ref={dragOverlayRef} className="score-drag-overlay notranslate" pointerEvents="none" />
        </svg>
      </div>
    </div>
  );
};
