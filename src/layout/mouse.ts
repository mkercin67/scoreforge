/**
 * Mouse interaction, cursor positioning, and manual drag helpers for ScoreForge.
 *
 * All calculations use pure functions operating on layout data and staff spaces.
 */

import { LayoutItem, LayoutResult, LayoutSystem } from './types';
import { Score } from '../core/model';
import { getGlyphAdvanceWidth, getGlyphBBox } from '../render/smufl';

/**
 * Computes measure horizontal boundaries [minX, maxX] inside a system.
 */
export interface SystemMeasureBounds {
  measureId: string;
  barlineX: number;
  leftBound: number;
  rightBound: number;
}

export function getSystemMeasureBounds(system: LayoutSystem): SystemMeasureBounds[] {
  const barlines: Array<{ measureId: string; x: number }> = [];
  const seenMeasures = new Set<string>();

  for (const item of system.items) {
    if (item.kind === 'line' && item.id.startsWith('barline-') && !item.id.includes('staffline')) {
      const measureId = item.id.replace('barline-', '').replace('-thin', '').replace('-thick', '');
      if (!seenMeasures.has(measureId)) {
        seenMeasures.add(measureId);
        barlines.push({ measureId, x: item.x });
      } else {
        // For final double barlines (-thin and -thick), use the thin (leftmost) barline for the right bound
        const existing = barlines.find((b) => b.measureId === measureId);
        if (existing && item.x < existing.x) {
          existing.x = item.x;
        }
      }
    }
  }
  barlines.sort((a, b) => a.x - b.x);
  if (barlines.length === 0) return [];

  const headerItems = system.items.filter(
    (it) =>
      !it.id.includes('staffline') &&
      (it.id.includes('-start-barline') ||
        it.id.includes('-clef-') ||
        it.id.startsWith('clef-') ||
        it.id.includes('-keysig-') ||
        it.id.startsWith('keysig-') ||
        it.id.startsWith('timesig-'))
  );

  const headerEndX = headerItems.reduce((max, it) => {
    const w =
      it.width ??
      (it.glyph
        ? getGlyphAdvanceWidth(it.glyph)
        : it.kind === 'line'
        ? 0.2
        : 1.1);
    return Math.max(max, it.x + w);
  }, 0.4);

  const bounds: SystemMeasureBounds[] = [];
  for (let i = 0; i < barlines.length; i++) {
    const bl = barlines[i];
    const leftBound = i === 0 ? headerEndX + 0.8 : barlines[i - 1].x + 0.5;
    const rightBound = bl.x - 0.5;
    bounds.push({
      measureId: bl.measureId,
      barlineX: bl.x,
      leftBound,
      rightBound,
    });
  }
  return bounds;
}

/** Bounding box helper for an individual layout item in staff spaces. */
export function getItemRect(item: LayoutItem): { x1: number; x2: number; y1: number; y2: number } {
  if (item.kind === 'beam' && item.points && item.points.length > 0) {
    const xs = item.points.map((p) => p.x);
    const ys = item.points.map((p) => p.y);
    return {
      x1: Math.min(...xs),
      x2: Math.max(...xs),
      y1: Math.min(...ys),
      y2: Math.max(...ys),
    };
  }
  if (item.kind === 'line') {
    const x1 = Math.min(item.x, item.x2 ?? item.x);
    const x2 = Math.max(item.x, item.x2 ?? item.x);
    const y1 = Math.min(item.y, item.y2 ?? item.y);
    const y2 = Math.max(item.y, item.y2 ?? item.y);
    return { x1, x2, y1, y2 };
  }

  const g = item.glyph ?? '';
  if (g.startsWith('rest')) {
    const bbox = getGlyphBBox(g);
    const adv = getGlyphAdvanceWidth(g);
    return {
      x1: item.x + (bbox ? bbox.bBoxSW[0] : 0),
      x2: item.x + (bbox ? bbox.bBoxNE[0] : (item.width ?? adv)),
      y1: item.y - (bbox ? bbox.bBoxNE[1] : 1.2),
      y2: item.y - (bbox ? bbox.bBoxSW[1] : -1.2),
    };
  }
  if (g.startsWith('notehead')) {
    return {
      x1: item.x,
      x2: item.x + (item.width ?? getGlyphAdvanceWidth(g)),
      y1: item.y - 0.5,
      y2: item.y + 0.5,
    };
  }
  if (g.startsWith('accidental')) {
    return {
      x1: item.x,
      x2: item.x + 1.0,
      y1: item.y - 1.5,
      y2: item.y + 1.5,
    };
  }
  if (g === 'augmentationDot') {
    return {
      x1: item.x,
      x2: item.x + 0.4,
      y1: item.y - 0.25,
      y2: item.y + 0.25,
    };
  }
  if (g.startsWith('flag')) {
    const isUp = g.includes('Up');
    return {
      x1: item.x,
      x2: item.x + 1.0,
      y1: isUp ? item.y : item.y - 2.0,
      y2: isUp ? item.y + 2.0 : item.y,
    };
  }
  return {
    x1: item.x,
    x2: item.x + (item.width ?? 1.18),
    y1: item.y - 1.0,
    y2: item.y + 1.0,
  };
}

export interface EventHitArea {
  eventId: string;
  kind: 'note' | 'rest';
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

/**
 * Computes union hit areas for all events in a system from layout data.
 * Notes/chords: union of all items (head, stem, flag, dots, accidental, ledgers) + 0.4 padding.
 * Rests: at least 1.6 x 2.4 centered on glyph (+ 0.4 padding).
 */
export function computeEventHitBoxes(system: LayoutSystem): EventHitArea[] {
  const byEvent = new Map<string, LayoutItem[]>();
  const beamsByEvent = new Map<string, LayoutItem[]>();
  for (const item of system.items) {
    if (item.hidden) continue;
    if (item.kind === 'beam' && item.eventIds && item.eventIds.length > 0) {
      for (const evId of item.eventIds) {
        let bl = beamsByEvent.get(evId);
        if (!bl) {
          bl = [];
          beamsByEvent.set(evId, bl);
        }
        bl.push(item);
      }
      continue;
    }
    if (!item.eventId) continue;
    let list = byEvent.get(item.eventId);
    if (!list) {
      list = [];
      byEvent.set(item.eventId, list);
    }
    list.push(item);
  }

  const areas: EventHitArea[] = [];
  for (const [eventId, items] of byEvent.entries()) {
    const isRest = items.some((it) => it.glyph?.startsWith('rest'));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const item of items) {
      const r = getItemRect(item);
      if (r.x1 < minX) minX = r.x1;
      if (r.x2 > maxX) maxX = r.x2;
      if (r.y1 < minY) minY = r.y1;
      if (r.y2 > maxY) maxY = r.y2;
    }

    // Include local beam segment Y/X bounds directly above/below the beamed event
    const eventBeams = beamsByEvent.get(eventId);
    if (eventBeams && Number.isFinite(minX) && Number.isFinite(maxX)) {
      const sliceX1 = minX;
      const sliceX2 = maxX;
      for (const b of eventBeams) {
        if (!b.points || b.points.length < 4) continue;
        const p0 = b.points[0];
        const p1 = b.points[1];
        const p2 = b.points[2];
        const p3 = b.points[3];
        const bMinX = Math.min(p0.x, p1.x);
        const bMaxX = Math.max(p0.x, p1.x);
        const ovX1 = Math.max(sliceX1, bMinX);
        const ovX2 = Math.min(sliceX2, bMaxX);
        if (ovX2 >= ovX1) {
          const dxSpan = p1.x - p0.x;
          const interp = (x: number, yA: number, yB: number) =>
            Math.abs(dxSpan) < 1e-12 ? yA : yA + ((yB - yA) * (x - p0.x)) / dxSpan;
          minY = Math.min(minY, interp(ovX1, p0.y, p1.y), interp(ovX2, p0.y, p1.y), interp(ovX1, p3.y, p2.y), interp(ovX2, p3.y, p2.y));
          maxY = Math.max(maxY, interp(ovX1, p0.y, p1.y), interp(ovX2, p0.y, p1.y), interp(ovX1, p3.y, p2.y), interp(ovX2, p3.y, p2.y));
        }
      }
    }

    if (isRest) {
      const restItem = items.find((it) => it.glyph?.startsWith('rest'));
      if (restItem) {
        const cx = restItem.x + 0.5;
        const cy = restItem.y;
        minX = Math.min(minX, cx - 0.8);
        maxX = Math.max(maxX, cx + 0.8);
        minY = Math.min(minY, cy - 1.2);
        maxY = Math.max(maxY, cy + 1.2);
      }
    }

    const paddedMinX = minX - 0.4;
    const paddedMaxX = maxX + 0.4;
    const paddedMinY = minY - 0.4;
    const paddedMaxY = maxY + 0.4;

    areas.push({
      eventId,
      kind: isRest ? 'rest' : 'note',
      minX: paddedMinX,
      maxX: paddedMaxX,
      minY: paddedMinY,
      maxY: paddedMaxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    });
  }
  return areas;
}

/**
 * Finds the event hit at pointer coordinates (x, y) in staff spaces relative to system.
 * Overlaps resolve to the event with the closest center. Returns null on empty measure space.
 */
export function hitTestEvent(
  layout: LayoutResult,
  systemIndex: number,
  x: number,
  y: number
): { eventId: string; kind: 'note' | 'rest' } | null {
  const system = layout.systems[systemIndex];
  if (!system) return null;

  const areas = computeEventHitBoxes(system);
  let best: EventHitArea | null = null;
  let bestDistSq = Infinity;

  for (const area of areas) {
    if (x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY) {
      const distSq = (x - area.centerX) ** 2 + (y - area.centerY) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = area;
      }
    }
  }

  return best ? { eventId: best.eventId, kind: best.kind } : null;
}

/**
 * Clamps a manual override offset for an event so:
 * - Noteheads (with accidental and dots) or rests stay inside their own measure bounds
 *   (left = leftBarline + 0.5 or headerEnd + 0.8; right = rightBarline - 0.5 - glyphWidth; NO +-4 limit).
 * - Notes/chords ignore vertical offsets (dy = 0).
 * - Rest glyphs stay vertically inside y = [-1.0, 5.0] in staff spaces (top line = 0, bottom line = 4)
 *   computed from the rest's default y and SMuFL glyph bounding box metrics (NO +-6 limit).
 */
export function clampOverrideOffset(
  items: LayoutItem[],
  measureBounds: SystemMeasureBounds,
  rawDx: number,
  rawDy: number,
  isRest: boolean,
  existingAppliedDx = 0,
  existingAppliedDy = 0
): { dx: number; dy: number; isAtLimit: boolean } {
  const horizItems = items.filter((it) => {
    if (it.hidden) return false;
    const g = it.glyph ?? '';
    return (
      g.startsWith('notehead') ||
      g.startsWith('accidental') ||
      g === 'augmentationDot' ||
      g.startsWith('rest')
    );
  });
  const targetHorizItems = horizItems.length > 0 ? horizItems : items.filter((it) => !it.hidden);

  let evMinX = Infinity;
  let evMaxX = -Infinity;

  for (const it of targetHorizItems) {
    const r = getItemRect(it);
    const unshiftedX1 = r.x1 - existingAppliedDx;
    const unshiftedX2 = r.x2 - existingAppliedDx;
    if (unshiftedX1 < evMinX) evMinX = unshiftedX1;
    if (unshiftedX2 > evMaxX) evMaxX = unshiftedX2;
  }

  if (!isFinite(evMinX) || !isFinite(evMaxX)) {
    return { dx: 0, dy: 0, isAtLimit: false };
  }

  const minAllowedDx = measureBounds.leftBound - evMinX;
  const maxAllowedDx = measureBounds.rightBound - evMaxX;

  let clampedDx = rawDx;
  let atLimitX = false;

  if (minAllowedDx <= maxAllowedDx) {
    if (rawDx <= minAllowedDx) {
      clampedDx = minAllowedDx;
      atLimitX = true;
    } else if (rawDx >= maxAllowedDx) {
      clampedDx = maxAllowedDx;
      atLimitX = true;
    }
  } else {
    clampedDx = 0;
    atLimitX = true;
  }

  let clampedDy = 0;
  let atLimitY = false;

  if (isRest) {
    const restItem = items.find((it) => !it.hidden && it.glyph?.startsWith('rest'));
    if (restItem && restItem.glyph) {
      const defaultY = restItem.y - existingAppliedDy;
      const bbox = getGlyphBBox(restItem.glyph);
      const neY = bbox ? bbox.bBoxNE[1] : 1.0;
      const swY = bbox ? bbox.bBoxSW[1] : -1.0;
      // Top of glyph (defaultY + dy - neY) >= -1.0; Bottom (defaultY + dy - swY) <= 5.0
      const minAllowedDy = -1.0 - defaultY + neY;
      const maxAllowedDy = 5.0 - defaultY + swY;

      if (minAllowedDy <= maxAllowedDy) {
        if (rawDy <= minAllowedDy) {
          clampedDy = minAllowedDy;
          atLimitY = true;
        } else if (rawDy >= maxAllowedDy) {
          clampedDy = maxAllowedDy;
          atLimitY = true;
        } else {
          clampedDy = rawDy;
        }
      } else {
        clampedDy = 0;
        atLimitY = true;
      }
    }
  }

  return {
    dx: clampedDx === 0 ? 0 : clampedDx,
    dy: clampedDy === 0 ? 0 : clampedDy,
    isAtLimit: atLimitX || atLimitY,
  };
}

/**
 * Clamps an event's desired override (dx, dy) against its measure & rest band limits
 * using an already-computed LayoutResult.
 */
export function clampEventOverrideInLayout(
  layout: LayoutResult,
  score: Score,
  eventId: string,
  rawDx: number,
  rawDy: number
): { dx: number; dy: number; isAtLimit: boolean; isRest: boolean } {
  let isRest = false;
  let evMeasureId: string | undefined;
  for (const p of score.parts) {
    for (const st of p.staves) {
      for (const mId of Object.keys(st.measures)) {
        const found = st.measures[mId].voices[0]?.events.find((ev) => ev.id === eventId);
        if (found) {
          evMeasureId = mId;
          isRest = found.kind === 'rest';
          break;
        }
      }
      if (evMeasureId) break;
    }
    if (evMeasureId) break;
  }

  const targetSys = layout.systems.find((s) => s.items.some((it) => it.eventId === eventId));
  if (!targetSys || !evMeasureId) {
    return { dx: rawDx, dy: isRest ? rawDy : 0, isAtLimit: false, isRest };
  }

  const eventItems = targetSys.items.filter((it) => it.eventId === eventId);
  const mBounds = getSystemMeasureBounds(targetSys).find((b) => b.measureId === evMeasureId);
  if (!mBounds || eventItems.length === 0) {
    return { dx: rawDx, dy: isRest ? rawDy : 0, isAtLimit: false, isRest };
  }

  const existingApplied = layout.appliedOverrides?.[eventId] ?? { dx: 0, dy: 0 };
  const clamped = clampOverrideOffset(
    eventItems,
    mBounds,
    rawDx,
    rawDy,
    isRest,
    existingApplied.dx,
    existingApplied.dy
  );
  return { ...clamped, isRest };
}

/**
 * Checks if a pointer movement exceeds the drag initiation threshold (default 4px).
 *
 * @param dxPx - Horizontal displacement in pixels.
 * @param dyPx - Vertical displacement in pixels.
 * @param thresholdPx - Distance threshold in pixels (defaults to 4).
 * @returns True if Euclidean distance >= thresholdPx.
 */
export function isDragPastThreshold(dxPx: number, dyPx: number, thresholdPx = 4): boolean {
  return Math.hypot(dxPx, dyPx) >= thresholdPx;
}

/**
 * Snaps a drag offset in staff spaces to 0.25 space increments.
 *
 * @param offsetSpaces - Raw offset in staff spaces.
 * @param noSnap - When true (e.g. Alt held), snapping is bypassed.
 * @returns Snapped offset in staff spaces.
 */
export function snapDragOffset(offsetSpaces: number, noSnap: boolean): number {
  if (noSnap) return offsetSpaces;
  const snapped = Math.round(offsetSpaces * 4) / 4;
  return snapped === 0 ? 0 : snapped;
}

/**
 * Constrains a 2D drag offset to the dominant axis if axis-lock is enabled.
 *
 * @param dx - Horizontal offset in staff spaces.
 * @param dy - Vertical offset in staff spaces.
 * @param lockAxis - When true (e.g. Shift held), locks movement to dominant axis.
 * @returns Constrained { dx, dy } offset.
 */
export function applyAxisLock(
  dx: number,
  dy: number,
  lockAxis: boolean
): { dx: number; dy: number } {
  if (!lockAxis) return { dx, dy };
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { dx, dy: 0 };
  }
  return { dx: 0, dy };
}

/**
 * Maps a pointer horizontal coordinate (x in staff spaces) in a system to the
 * corresponding cursor position (measureId, tick).
 *
 * Rules:
 * 1. Returns the start tick of the event under the pointer.
 * 2. If the pointer is between events, returns the start tick of the NEXT event to the right.
 * 3. If beyond the last event in the measure, returns the end-of-measure tick.
 *
 * @param layout - Rendered layout result.
 * @param systemIndex - Index of the target system.
 * @param x - Pointer X coordinate in staff spaces relative to the system left.
 * @param score - Optional score model (falls back to layout.score).
 * @returns Cursor position { measureId, tick }, or null if system not found.
 */
export function xToCursor(
  layout: LayoutResult,
  systemIndex: number,
  x: number,
  score?: Score
): { measureId: string; tick: number } | null {
  const system = layout.systems[systemIndex];
  if (!system) return null;

  const effectiveScore = score ?? layout.score;

  // 1. Find all barlines in this system to delimit measure boundaries
  const barlines: Array<{ measureId: string; x: number }> = [];
  for (const item of system.items) {
    if (item.kind === 'line' && item.id.startsWith('barline-') && !item.id.includes('staffline')) {
      const measureId = item.id.replace('barline-', '').replace('-thin', '');
      barlines.push({ measureId, x: item.x });
    }
  }
  barlines.sort((a, b) => a.x - b.x);

  if (barlines.length === 0) return null;

  // Find system header end (clef, keySig, timeSig)
  const headerItems = system.items.filter(
    (it) =>
      it.id.startsWith('sys-') ||
      it.id.startsWith('clef-') ||
      it.id.startsWith('keysig-') ||
      it.id.startsWith('timesig-')
  );
  const headerEndX = headerItems.reduce((max, it) => Math.max(max, it.x + (it.width ?? 1.2)), 0);

  // Build measure boundaries
  interface MeasureBounds {
    measureId: string;
    startX: number;
    endX: number;
  }
  const measureBounds: MeasureBounds[] = [];
  let curStart = headerEndX;

  for (let i = 0; i < barlines.length; i++) {
    const bl = barlines[i];
    measureBounds.push({
      measureId: bl.measureId,
      startX: curStart,
      endX: bl.x,
    });
    curStart = bl.x;
  }

  // Find which measure contains x
  let targetMeasure = measureBounds[0];
  if (x < measureBounds[0].startX) {
    targetMeasure = measureBounds[0];
  } else if (x >= measureBounds[measureBounds.length - 1].endX) {
    targetMeasure = measureBounds[measureBounds.length - 1];
  } else {
    for (const mb of measureBounds) {
      if (x >= mb.startX && x < mb.endX) {
        targetMeasure = mb;
        break;
      }
    }
  }

  if (!effectiveScore) {
    return { measureId: targetMeasure.measureId, tick: 0 };
  }

  // 2. Identify events and ticks in the target measure
  const staff = effectiveScore.parts[0]?.staves[0];
  const sm = staff?.measures[targetMeasure.measureId];
  const voice = sm?.voices[0];
  const mDef = effectiveScore.measures.find((m) => m.id === targetMeasure.measureId);
  const measureTicks = mDef
    ? (mDef.timeSig.num * 480 * 4) / mDef.timeSig.den
    : 480 * 4;

  if (!voice || voice.events.length === 0) {
    return { measureId: targetMeasure.measureId, tick: 0 };
  }

  // If all events in the measure are rests, clicking anywhere in the measure targets tick 0
  if (voice.events.every((ev) => ev.kind === 'rest')) {
    return { measureId: targetMeasure.measureId, tick: 0 };
  }

  let curTick = 0;
  for (let i = 0; i < voice.events.length; i++) {
    const ev = voice.events[i];
    const evStartTick = curTick;
    curTick += ev.duration;

    const isLastEvent = i === voice.events.length - 1;

    // Find visual elements belonging to this event in the system
    const evItems = system.items.filter((it) => it.eventId === ev.id && !it.hidden);
    if (evItems.length === 0) continue;

    const maxX = Math.max(...evItems.map((it) => it.x2 ?? it.x + (it.width ?? 1.2)));

    // If pointer is inside or before this event, this is the matched event
    if (x <= maxX) {
      return { measureId: targetMeasure.measureId, tick: evStartTick };
    }

    // If this is the last event and it's a rest, its space extends to the end of the measure
    if (isLastEvent && ev.kind === 'rest' && x <= targetMeasure.endX) {
      return { measureId: targetMeasure.measureId, tick: evStartTick };
    }
  }

  // Beyond all events: end-of-measure tick
  return { measureId: targetMeasure.measureId, tick: measureTicks };
}
