/**
 * Pure cursor layout engine for ScoreForge editor.
 *
 * Computes exact staff-space coordinates (x, y1, y2) for the visual input cursor,
 * ensuring proper header clearance (>= 0.8 staff spaces) and precise alignment.
 */

import { Score } from '../core/model';
import { ScoreCursor } from '../core/input';
import { LayoutResult, LayoutSystem } from './types';

export interface CursorPosition {
  systemIndex: number;
  x: number;
  y1: number;
  y2: number;
}

/**
 * Computes the exact visual position of the score cursor in staff spaces.
 *
 * @param layout - The current score layout.
 * @param score - The score data model.
 * @param cursor - Active cursor coordinates.
 * @returns Cursor position (x, y1, y2) in staff spaces, or null if cursor is invalid.
 */
export function computeCursorPosition(
  layout: LayoutResult,
  score: Score,
  cursor: ScoreCursor | null
): CursorPosition | null {
  if (!cursor || layout.systems.length === 0) return null;

  // 1. Find the system containing cursor.measureId
  let targetSystem: LayoutSystem | null = null;
  let systemIndex = 0;

  for (let i = 0; i < layout.systems.length; i++) {
    const sys = layout.systems[i];
    if (sys.items.some((it) => it.id.startsWith(`barline-${cursor.measureId}`))) {
      targetSystem = sys;
      systemIndex = i;
      break;
    }
  }

  if (!targetSystem) {
    targetSystem = layout.systems[0];
    systemIndex = 0;
  }

  const staffY = targetSystem.staves[0]?.y ?? targetSystem.y;
  const y1 = staffY;
  const y2 = staffY + 4;

  const isFirstMeasureInScore = score.measures[0]?.id === cursor.measureId;

  // Find the barline ending this measure
  const endBarline = targetSystem.items.find(
    (it) => it.id === `barline-${cursor.measureId}` || it.id === `barline-${cursor.measureId}-thin`
  );
  const endBarlineX = endBarline ? endBarline.x : targetSystem.width;

  // Find measure start X within this system
  let measureStartX = 0;
  const earlierBarlines = targetSystem.items
    .filter((it) => it.id.startsWith('barline-') && it.x < endBarlineX - 0.1)
    .sort((a, b) => b.x - a.x);

  if (earlierBarlines.length > 0) {
    measureStartX = earlierBarlines[0].x + (earlierBarlines[0].thickness ?? 0.16);
  } else {
    // First measure in this system -> starts after system header items
    const headerItems = targetSystem.items.filter(
      (it) =>
        it.id.startsWith('sys-') ||
        it.id.startsWith('clef-') ||
        it.id.startsWith('keysig-') ||
        (isFirstMeasureInScore && it.id.startsWith('timesig-'))
    );
    measureStartX = headerItems.reduce((max, it) => Math.max(max, it.x + (it.width ?? 1.2)), 0);
  }

  // 2. Identify voice events in the active measure
  const staff = score.parts[0]?.staves.find((s) => s.id === cursor.staffId);
  const sm = staff?.measures[cursor.measureId];
  const voice = sm?.voices.find((v) => v.id === cursor.voiceId) ?? sm?.voices[0];

  if (!voice || voice.events.length === 0) {
    return { systemIndex, x: measureStartX + 0.8, y1, y2 };
  }

  // Check if measure only has a wholeMeasure rest (empty measure)
  const isOnlyWholeRest =
    voice.events.length === 1 &&
    voice.events[0].kind === 'rest' &&
    Boolean((voice.events[0] as any).wholeMeasure);

  if (cursor.tick === 0) {
    if (isFirstMeasureInScore) {
      // In measure 1, header includes clef, keySig, and timeSig
      const headerGlyphs = targetSystem.items.filter(
        (it) =>
          it.id.startsWith('sys-') ||
          it.id.startsWith('clef-') ||
          it.id.startsWith('keysig-') ||
          it.id.startsWith('timesig-')
      );
      const headerEnd = headerGlyphs.reduce((max, it) => Math.max(max, it.x + (it.width ?? 1.2)), 0);

      if (isOnlyWholeRest) {
        return { systemIndex, x: Math.max(headerEnd + 0.8, measureStartX + 0.8), y1, y2 };
      }

      // If measure 1 has notes/rests, find first event glyph
      const firstEvId = voice.events[0].id;
      const evGlyphs = targetSystem.items
        .filter((it) => it.eventId === firstEvId)
        .sort((a, b) => a.x - b.x);

      if (evGlyphs.length > 0) {
        const targetX = evGlyphs[0].x - 0.2;
        return { systemIndex, x: Math.max(targetX, headerEnd + 0.8), y1, y2 };
      }
      return { systemIndex, x: headerEnd + 0.8, y1, y2 };
    }

    // In measure 2 or later at tick 0
    if (isOnlyWholeRest) {
      return { systemIndex, x: measureStartX + 0.8, y1, y2 };
    }

    const firstEvId = voice.events[0].id;
    const evGlyphs = targetSystem.items
      .filter((it) => it.eventId === firstEvId)
      .sort((a, b) => a.x - b.x);

    if (evGlyphs.length > 0) {
      return { systemIndex, x: evGlyphs[0].x - 0.2, y1, y2 };
    }

    return { systemIndex, x: measureStartX + 0.8, y1, y2 };
  }

  // Non-zero tick: locate event starting at cursor.tick
  let t = 0;
  for (const ev of voice.events) {
    if (t === cursor.tick) {
      const evGlyphs = targetSystem.items
        .filter((it) => it.eventId === ev.id)
        .sort((a, b) => a.x - b.x);
      if (evGlyphs.length > 0) {
        return { systemIndex, x: evGlyphs[0].x - 0.2, y1, y2 };
      }
    }
    t += ev.duration;
  }

  // If tick is at or past measure end, place right before end barline
  if (t > 0 && cursor.tick >= t) {
    return { systemIndex, x: endBarlineX - 0.5, y1, y2 };
  }

  return { systemIndex, x: measureStartX + 0.8, y1, y2 };
}
