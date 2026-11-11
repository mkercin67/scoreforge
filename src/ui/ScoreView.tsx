/**
 * Interactive SVG score viewport component.
 *
 * Implements explicit three-mode interaction:
 * - 'select': click selects events or places cursor in empty measure; vertical note drag changes pitch;
 *             rest drag is select-only; no ghost note.
 * - 'input':  hover shows ghost note (hidden outside staff area); <=4px click enters ghost pitch;
 *             >4px movement executes no command and never hides/removes existing notes.
 * - 'position': horizontal note/chord drag (dx only, inside own measure) and 2D rest drag
 *             (dx inside measure, dy inside [-1, 5] glyph band), 0.25 snap (Shift = no snap).
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BaseDurationType, NoteEvent, Pitch, Score, ScoreEvent } from '../core/model';
import { layoutScore } from '../layout/layoutScore';
import { LayoutResult } from '../layout/types';
import {
  getLedgerLineYs,
  pitchToStaffPosition,
  staffPositionToY,
  yToStaffPosition,
} from '../layout/pitch';
import {
  clampOverrideOffset,
  getSystemMeasureBounds,
  hitTestEvent,
  isDragPastThreshold,
  snapDragOffset,
  xToCursor,
} from '../layout/mouse';
import { getGlyphPath, UNITS_PER_EM } from '../render/glyphPaths.generated';
import { SystemView } from './SystemView';
import { formatPitchName, useI18n } from './i18n';
import { ScoreCursor } from '../core/input';
import { computeCursorPosition } from '../layout/cursor';
import { EditorMode } from './keymap';

export interface ScoreViewProps {
  score: Score;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  cursor?: ScoreCursor | null;
  mode?: EditorMode;
  activeDuration?: BaseDurationType;
  onSelectMeasure?: (measureId: string, tick?: number) => void;
  onEnterPitchDirect?: (pitch: Pitch, customCursor?: ScoreCursor) => void;
  onApplyOverride?: (eventId: string, dx: number, dy: number, accumulate?: boolean) => void;
  onChangePitch?: (eventId: string, pitches: Pitch[]) => void;
  onHoverPitch?: (pitch: Pitch | null) => void;
  onHoverInfo?: (info: { pitch: Pitch; measureNumber: number } | null) => void;
  onDragStatus?: (status: string | null) => void;
  onLayoutChange?: (layout: LayoutResult) => void;
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

function findEventLocation(
  score: Score,
  eventId: string
): { event: ScoreEvent; measureId: string } | null {
  for (const p of score.parts) {
    for (const st of p.staves) {
      for (const mId of Object.keys(st.measures)) {
        const ev = st.measures[mId].voices[0]?.events.find((it) => it.id === eventId);
        if (ev) {
          return { event: ev, measureId: mId };
        }
      }
    }
  }
  return null;
}

export const ScoreView: React.FC<ScoreViewProps> = ({
  score,
  selectedEventId,
  onSelectEvent,
  cursor = null,
  mode = 'select',
  activeDuration = 'quarter',
  onSelectMeasure,
  onEnterPitchDirect,
  onApplyOverride,
  onChangePitch,
  onHoverPitch,
  onHoverInfo,
  onDragStatus,
  onLayoutChange,
}) => {
  const { t, zoom, noteNameStyle, language } = useI18n();
  const isInputMode = mode === 'input';

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragOverlayRef = useRef<SVGGElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState<number>(1000);

  // Cached SVG bounding rect (updated on mount, enter, scroll, resize, zoom — never inside pointermove/keydown)
  const containerRectRef = useRef<{ left: number; top: number; width: number; height: number }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  // Active drag state for 'select' (pitch) and 'position' (dx/dy)
  const dragStateRef = useRef<{
    dragMode: 'select' | 'position';
    startX: number;
    startY: number;
    eventId: string;
    isNote: boolean;
    isRest: boolean;
    measureId: string;
    originalPitches: Pitch[];
    startStepPositions: number[];
    isDragging: boolean;
    dx: number;
    dy: number;
    stepDelta: number;
    targetPitches: Pitch[];
  } | null>(null);

  // Pointer press state for 'input' click vs >4px move
  const inputPressRef = useRef<{
    startX: number;
    startY: number;
    movedPastThreshold: boolean;
  } | null>(null);

  const captureRef = useRef<{ el: HTMLElement; pointerId: number } | null>(null);
  const dragRafIdRef = useRef<number | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const suppressNextClickRef = useRef<boolean>(false);
  const [isDraggingState, setIsDraggingState] = useState<boolean>(false);

  // Ghost note state (Input mode only)
  const [ghostNote, setGhostNote] = useState<GhostNoteData | null>(null);
  const lastHoverPitchRef = useRef<Pitch | null>(null);

  const useTextFallback = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('text') || params.get('renderer') === 'text';
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
  const availableStaffSpaces = Math.max(25, Math.floor(containerWidthPx / staffSpacePx));

  const layout = useMemo(() => {
    return layoutScore(score, { width: availableStaffSpaces });
  }, [score, availableStaffSpaces]);

  useEffect(() => {
    onLayoutChange?.(layout);
  }, [layout, onLayoutChange]);

  // Refresh cached rect when layout size or zoom changes
  useLayoutEffect(() => {
    updateContainerRect();
  }, [layout.width, layout.height, staffSpacePx, updateContainerRect]);

  const usedGlyphs = useMemo(() => {
    const set = new Set<string>();
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

  const cursorPos = useMemo(() => {
    if (!isInputMode || !cursor) return null;
    return computeCursorPosition(layout, score, cursor);
  }, [layout, score, cursor, isInputMode]);

  const cursorLineRef = useRef<SVGLineElement>(null);

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

  const releaseCapture = useCallback(() => {
    if (captureRef.current) {
      const { el, pointerId } = captureRef.current;
      try {
        if (typeof el.releasePointerCapture === 'function') {
          el.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore if capture already released
      }
      captureRef.current = null;
    }
  }, []);

  const clearDragFeedback = useCallback(() => {
    if (dragOverlayRef.current) {
      dragOverlayRef.current.innerHTML = '';
    }
  }, []);

  const cancelActiveInteractions = useCallback(() => {
    if (dragRafIdRef.current) {
      cancelAnimationFrame(dragRafIdRef.current);
      dragRafIdRef.current = null;
    }
    if (dragStateRef.current) {
      const eventId = dragStateRef.current.eventId;
      const groupEl = svgRef.current?.querySelector(`g[data-event-id="${eventId}"]`) as HTMLElement | null;
      if (groupEl) groupEl.style.opacity = '1';
    }
    clearDragFeedback();
    onDragStatus?.(null);
    dragStateRef.current = null;
    inputPressRef.current = null;
    setIsDraggingState(false);
    releaseCapture();
  }, [clearDragFeedback, onDragStatus, releaseCapture]);

  // Clear ghost note & active drags whenever mode changes
  useEffect(() => {
    if (mode !== 'input') {
      setGhostNote(null);
      lastHoverPitchRef.current = null;
      onHoverPitch?.(null);
      onHoverInfo?.(null);
    }
    cancelActiveInteractions();
  }, [mode, onHoverPitch, onHoverInfo, cancelActiveInteractions]);

  // Cancel active drag on Escape or window blur (no command emitted)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && dragStateRef.current?.isDragging) {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelActiveInteractions();
      }
    };
    const handleBlur = () => {
      cancelActiveInteractions();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
    };
  }, [cancelActiveInteractions]);

  const getPointerSystemCoords = (clientX: number, clientY: number) => {
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

  const isInsideStaffArea = (
    coords: { relX: number; targetSys: { x: number; width: number }; sysRelY: number }
  ) => {
    return (
      coords.relX >= coords.targetSys.x &&
      coords.relX <= coords.targetSys.x + coords.targetSys.width &&
      coords.sysRelY >= -2.5 &&
      coords.sysRelY <= 6.5
    );
  };

  const enterPitchAtPointer = (clientX: number, clientY: number) => {
    if (!onEnterPitchDirect) return;
    const coords = getPointerSystemCoords(clientX, clientY);
    if (!coords || !isInsideStaffArea(coords)) return;

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
    const targetSys =
      layout.systems.find((sys) => sys.items.some((it) => it.eventId === eventId)) ?? layout.systems[0];
    const noteItem = layout.items.find((it) => it.eventId === eventId && it.kind === 'glyph');

    let ledgerSvg = '';
    if (noteItem && targetSys) {
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

  const handlePointerEnter = () => {
    updateContainerRect();
  };

  const handlePointerLeave = () => {
    setGhostNote(null);
    lastHoverPitchRef.current = null;
    onHoverPitch?.(null);
    onHoverInfo?.(null);
  };

  const trySetCapture = (target: HTMLElement, pointerId: number) => {
    try {
      if (typeof target.setPointerCapture === 'function') {
        target.setPointerCapture(pointerId);
        captureRef.current = { el: target, pointerId };
      }
    } catch {
      // Ignore synthetic events without active pointerId
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    suppressNextClickRef.current = false;
    hasDraggedRef.current = false;

    if (containerRectRef.current.width === 0) {
      updateContainerRect();
    }

    // Input mode: never modify score on pointerdown, never hide existing notes
    if (mode === 'input') {
      inputPressRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        movedPastThreshold: false,
      };
      trySetCapture(e.currentTarget, e.pointerId);
      dragStateRef.current = null;
      return;
    }

    const coords = getPointerSystemCoords(e.clientX, e.clientY);
    const hit = coords ? hitTestEvent(layout, coords.targetSys.index, coords.sysRelX, coords.sysRelY) : null;

    if (!hit) {
      dragStateRef.current = null;
      return;
    }

    const loc = findEventLocation(score, hit.eventId);
    if (!loc) {
      dragStateRef.current = null;
      return;
    }

    const isNote = loc.event.kind === 'note';
    const isRest = loc.event.kind === 'rest';

    // Select mode: drag on rest = select only (no drag)
    if (mode === 'select' && isRest) {
      onSelectEvent(hit.eventId);
      dragStateRef.current = null;
      return;
    }

    const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
    const originalPitches = isNote ? (loc.event as NoteEvent).pitches : [];
    const startStepPositions = originalPitches.map((p) => pitchToStaffPosition(p, clef));

    dragStateRef.current = {
      dragMode: mode,
      startX: e.clientX,
      startY: e.clientY,
      eventId: hit.eventId,
      isNote,
      isRest,
      measureId: loc.measureId,
      originalPitches,
      startStepPositions,
      isDragging: false,
      dx: 0,
      dy: 0,
      stepDelta: 0,
      targetPitches: originalPitches,
    };
    trySetCapture(e.currentTarget, e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 1. Input mode press & hover tracking
    if (mode === 'input') {
      if (inputPressRef.current && !inputPressRef.current.movedPastThreshold) {
        const dxPx = e.clientX - inputPressRef.current.startX;
        const dyPx = e.clientY - inputPressRef.current.startY;
        if (isDragPastThreshold(dxPx, dyPx, 4)) {
          inputPressRef.current.movedPastThreshold = true;
        }
      }

      const coords = getPointerSystemCoords(e.clientX, e.clientY);
      if (!coords || !isInsideStaffArea(coords)) {
        setGhostNote(null);
        lastHoverPitchRef.current = null;
        onHoverPitch?.(null);
        onHoverInfo?.(null);
        return;
      }

      const { targetSys, sysRelX: systemRelX, sysRelY: systemRelY } = coords;
      const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
      const targetCursor = xToCursor(layout, targetSys.index, systemRelX, score);
      const mDef = score.measures.find((m) => m.id === targetCursor?.measureId) ?? score.measures[0];
      const keySig = mDef?.keySig ?? 0;

      const hoveredPitch = yToStaffPosition(clef, systemRelY, keySig);
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
      return;
    }

    // 2. Active drag in 'select' or 'position' mode
    if (!dragStateRef.current) return;

    const deltaPxX = e.clientX - dragStateRef.current.startX;
    const deltaPxY = e.clientY - dragStateRef.current.startY;

    if (!dragStateRef.current.isDragging && isDragPastThreshold(deltaPxX, deltaPxY, 4)) {
      dragStateRef.current.isDragging = true;
      setIsDraggingState(true);
      hasDraggedRef.current = true;
      onSelectEvent(dragStateRef.current.eventId);

      const groupEl = svgRef.current?.querySelector(
        `g[data-event-id="${dragStateRef.current.eventId}"]`
      ) as HTMLElement | null;
      if (groupEl) {
        groupEl.style.opacity = '0.3';
      }
    }

    if (!dragStateRef.current.isDragging) return;

    const { dragMode, eventId, isNote, isRest, measureId, startStepPositions } = dragStateRef.current;

    if (dragMode === 'select' && isNote && startStepPositions.length > 0) {
      // Vertical pitch change in 0.5-space steps; horizontal movement ignored
      const clef = score.parts[0]?.staves[0]?.clef ?? { sign: 'G', line: 2 };
      const mDef = score.measures.find((m) => m.id === measureId) ?? score.measures[0];
      const keySig = mDef?.keySig ?? 0;

      const deltaYSpaces = deltaPxY / staffSpacePx;
      const stepDelta = Math.round(-deltaYSpaces * 2);

      const minSp = Math.min(...startStepPositions);
      const maxSp = Math.max(...startStepPositions);
      const clampedStepDelta = Math.max(-3 - minSp, Math.min(11 - maxSp, stepDelta));

      const targetPitches = startStepPositions.map((sp) =>
        yToStaffPosition(clef, staffPositionToY(sp + clampedStepDelta), keySig)
      );
      dragStateRef.current.stepDelta = clampedStepDelta;
      dragStateRef.current.targetPitches = targetPitches;

      const pitchName = targetPitches
        .map((p) => formatPitchName(p, noteNameStyle, language))
        .join(', ');
      onDragStatus?.(pitchName);

      if (!dragRafIdRef.current) {
        dragRafIdRef.current = requestAnimationFrame(() => {
          dragRafIdRef.current = null;
          if (!dragStateRef.current?.isDragging) return;
          renderPitchDragFeedback(dragStateRef.current.eventId, clampedStepDelta, startStepPositions);
        });
      }
      return;
    }

    if (dragMode === 'position') {
      // Position mode: dx only on notes/chords, dx + dy on rests; snap 0.25 unless Shift held
      const rawDeltaDx = deltaPxX / staffSpacePx;
      const rawDeltaDy = isRest ? deltaPxY / staffSpacePx : 0;
      const snappedDeltaDx = snapDragOffset(rawDeltaDx, Boolean(e.shiftKey));
      const snappedDeltaDy = isRest ? snapDragOffset(rawDeltaDy, Boolean(e.shiftKey)) : 0;

      const targetSys = layout.systems.find((s) => s.items.some((it) => it.eventId === eventId));
      const eventItems = targetSys ? targetSys.items.filter((it) => it.eventId === eventId) : [];
      const mBounds = targetSys
        ? getSystemMeasureBounds(targetSys).find((b) => b.measureId === measureId)
        : undefined;
      const existingApplied = layout.appliedOverrides?.[eventId] ?? { dx: 0, dy: 0 };

      const targetRawDx = existingApplied.dx + snappedDeltaDx;
      const targetRawDy = isRest ? existingApplied.dy + snappedDeltaDy : 0;

      let finalTotalDx = targetRawDx;
      let finalTotalDy = targetRawDy;
      let isAtLimit = false;

      if (mBounds && eventItems.length > 0) {
        const clamped = clampOverrideOffset(
          eventItems,
          mBounds,
          targetRawDx,
          targetRawDy,
          isRest,
          existingApplied.dx,
          existingApplied.dy
        );
        finalTotalDx = clamped.dx;
        finalTotalDy = clamped.dy;
        isAtLimit = clamped.isAtLimit;
      }

      dragStateRef.current.dx = finalTotalDx;
      dragStateRef.current.dy = finalTotalDy;

      const visDx = finalTotalDx - existingApplied.dx;
      const visDy = finalTotalDy - existingApplied.dy;

      const limitSuffix = isAtLimit ? ` · ${t('status.offsetLimit')}` : '';
      const statusStr = `dx ${finalTotalDx.toFixed(2)} · dy ${finalTotalDy.toFixed(2)}${limitSuffix}`;
      onDragStatus?.(statusStr);

      if (!dragRafIdRef.current) {
        dragRafIdRef.current = requestAnimationFrame(() => {
          dragRafIdRef.current = null;
          if (!dragStateRef.current?.isDragging) return;
          renderManualDragFeedback(dragStateRef.current.eventId, visDx, visDy);
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    releaseCapture();

    if (mode === 'input') {
      const press = inputPressRef.current;
      inputPressRef.current = null;
      suppressNextClickRef.current = true;
      if (press && !press.movedPastThreshold && !isDragPastThreshold(e.clientX - press.startX, e.clientY - press.startY, 4)) {
        enterPitchAtPointer(e.clientX, e.clientY);
      }
      return;
    }

    if (dragRafIdRef.current) {
      cancelAnimationFrame(dragRafIdRef.current);
      dragRafIdRef.current = null;
    }

    if (dragStateRef.current?.isDragging) {
      const { dragMode, eventId, isNote, dx, dy, stepDelta, targetPitches } = dragStateRef.current;
      const groupEl = svgRef.current?.querySelector(`g[data-event-id="${eventId}"]`) as HTMLElement | null;
      if (groupEl) groupEl.style.opacity = '1';
      clearDragFeedback();
      onDragStatus?.(null);

      if (dragMode === 'select' && isNote) {
        if (stepDelta !== 0 && targetPitches.length > 0) {
          onChangePitch?.(eventId, targetPitches);
        }
      } else if (dragMode === 'position') {
        const existingApplied = layout.appliedOverrides?.[eventId] ?? { dx: 0, dy: 0 };
        if (dx !== existingApplied.dx || dy !== existingApplied.dy) {
          onApplyOverride?.(eventId, dx, dy, false);
        }
      }
    }

    setIsDraggingState(false);
    dragStateRef.current = null;
  };

  const handlePointerCancel = () => {
    cancelActiveInteractions();
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode === 'input') {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      // Fallback for synthetic DOM click without pointerdown/up
      enterPitchAtPointer(e.clientX, e.clientY);
      return;
    }

    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    if (containerRectRef.current.width === 0) {
      updateContainerRect();
    }
    const coords = getPointerSystemCoords(e.clientX, e.clientY);
    const hit = coords ? hitTestEvent(layout, coords.targetSys.index, coords.sysRelX, coords.sysRelY) : null;

    if (hit) {
      onSelectEvent(hit.eventId);
      return;
    }

    if (mode === 'select' && coords && onSelectMeasure) {
      const found = xToCursor(layout, coords.targetSys.index, coords.sysRelX, score);
      if (found) {
        onSelectMeasure(found.measureId, found.tick);
      }
    }
    onSelectEvent(null);
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
      onPointerCancel={handlePointerCancel}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onScroll={updateContainerRect}
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

          {/* Persistent cursor overlay inside the SVG */}
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

          {/* Semi-transparent ghost note overlay (Input mode only, hidden outside staff or while dragging) */}
          {isInputMode && ghostNote && !isDraggingState && (
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

          {/* Live drag feedback overlay */}
          <g ref={dragOverlayRef} className="score-drag-overlay notranslate" pointerEvents="none" />
        </svg>
      </div>
    </div>
  );
};
