/**
 * Pure selection navigation helpers for traversing musical events on a staff.
 */

import { Score, ScoreEvent } from './model';

/**
 * Returns an ordered array of all events on the given staff across all score measures.
 *
 * Traversal follows score.measures order, then voices, then events.
 *
 * @param score - The score container.
 * @param staffId - Identifier of the staff to inspect.
 * @returns Flat array of all ScoreEvent elements in chronological sequence.
 */
export function getStaffEventsInOrder(score: Score, staffId: string): ScoreEvent[] {
  let targetStaff = null;
  for (const part of score.parts) {
    for (const staff of part.staves) {
      if (staff.id === staffId) {
        targetStaff = staff;
        break;
      }
    }
    if (targetStaff) break;
  }

  if (!targetStaff) {
    // If staffId not found directly, pick first available staff
    targetStaff = score.parts[0]?.staves[0] ?? null;
  }

  if (!targetStaff) return [];

  const events: ScoreEvent[] = [];
  for (const mDef of score.measures) {
    const sm = targetStaff.measures[mDef.id];
    if (!sm) continue;
    for (const voice of sm.voices) {
      for (const ev of voice.events) {
        events.push(ev);
      }
    }
  }

  return events;
}

/**
 * Checks whether an event with the given ID exists anywhere within the score.
 *
 * @param score - The score container.
 * @param eventId - Identifier of the event to check.
 * @returns True if the event exists in any voice of any staff.
 */
export function eventExists(score: Score, eventId: string): boolean {
  for (const part of score.parts) {
    for (const staff of part.staves) {
      for (const sm of Object.values(staff.measures)) {
        for (const voice of sm.voices) {
          if (voice.events.some((ev) => ev.id === eventId)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Calculates the next or previous event ID on a staff relative to a current selection.
 *
 * @param score - The score container.
 * @param staffId - Identifier of the active staff.
 * @param currentId - ID of currently selected event, or null if none selected.
 * @param direction - 'prev' or 'next'.
 * @returns ID of the adjacent event, or null if staff contains no events.
 */
export function nextEventId(
  score: Score,
  staffId: string,
  currentId: string | null,
  direction: 'prev' | 'next'
): string | null {
  const events = getStaffEventsInOrder(score, staffId);
  if (events.length === 0) return null;

  if (currentId === null) {
    return direction === 'next' ? events[0].id : events[events.length - 1].id;
  }

  const idx = events.findIndex((e) => e.id === currentId);
  if (idx === -1) {
    return events[0].id;
  }

  if (direction === 'next') {
    return idx + 1 < events.length ? events[idx + 1].id : events[idx].id;
  } else {
    return idx > 0 ? events[idx - 1].id : events[0].id;
  }
}
