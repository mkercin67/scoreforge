/**
 * Core musical input engine: note and rest replacement, greedy gap filling,
 * measure appending, cursor arithmetic, and octave-nearest pitch calculation.
 */

import { produce } from 'immer';
import {
  BaseDurationType,
  Clef,
  Id,
  NoteEvent,
  Pitch,
  PitchStep,
  RestEvent,
  Score,
  ScoreEvent,
} from './model';
import { createMeasure, createNote, createRest, newId } from './factory';
import { durationTicks, measureTicks, PPQ } from './time';
import { getKeySignatureAlter } from '../layout/keySignature';
import { Command } from './commands';

export type RestSpanType = BaseDurationType | 'wholeMeasure';

const STANDARD_DURATIONS: { baseType: BaseDurationType; ticks: number }[] = [
  { baseType: 'whole', ticks: PPQ * 4 },
  { baseType: 'half', ticks: PPQ * 2 },
  { baseType: 'quarter', ticks: PPQ },
  { baseType: 'eighth', ticks: PPQ / 2 },
  { baseType: '16th', ticks: PPQ / 4 },
  { baseType: '32nd', ticks: PPQ / 8 },
];

/**
 * Returns non-dotted rest base types to fill a rhythmic gap greedily.
 *
 * @param offsetTicks - Start offset of the gap from measure start.
 * @param spanTicks - Total duration to fill in integer ticks.
 * @param measureTicks - Total duration of the measure in ticks.
 * @returns Array of rest types ('wholeMeasure', 'half', 'quarter', etc.).
 */
export function restsForSpan(
  offsetTicks: number,
  spanTicks: number,
  measureTicks: number
): RestSpanType[] {
  if (spanTicks <= 0) return [];

  // Special rule: empty measure gets a single wholeMeasure rest
  if (offsetTicks === 0 && spanTicks === measureTicks) {
    return ['wholeMeasure'];
  }

  const result: RestSpanType[] = [];
  let currentOffset = offsetTicks;
  let remaining = spanTicks;

  while (remaining > 0) {
    let chosen: { baseType: BaseDurationType; ticks: number } | null = null;
    for (const d of STANDARD_DURATIONS) {
      if (d.ticks <= remaining && currentOffset % d.ticks === 0) {
        chosen = d;
        break;
      }
    }

    if (!chosen) {
      // Fallback for sub-32nd alignment
      chosen = STANDARD_DURATIONS[STANDARD_DURATIONS.length - 1];
    }

    result.push(chosen.baseType);
    currentOffset += chosen.ticks;
    remaining -= chosen.ticks;
  }

  return result;
}

export interface ScoreCursor {
  staffId: Id;
  voiceId: Id;
  measureId: Id;
  tick: number;
}

export interface InputNoteSpec {
  kind: 'note' | 'rest';
  baseType: BaseDurationType;
  dots?: number;
  pitch?: Pitch;
  eventId?: Id;
}

export type PlanResult =
  | {
      ok: true;
      newEvent: ScoreEvent;
      remainderRests: RestEvent[];
      removedIds: string[];
      mLength: number;
    }
  | {
      ok: false;
      reason: 'doesNotFit' | 'tuplet';
    };

/**
 * Plans the replacement of musical events at a cursor position.
 *
 * Validates measure boundary fit and tuplet restrictions, calculates replaced
 * events, and computes greedy rest filling for any truncated remainder.
 */
export function planEnter(
  score: Score,
  cursor: ScoreCursor,
  spec: InputNoteSpec
): PlanResult {
  const mDef = score.measures.find((m) => m.id === cursor.measureId);
  if (!mDef) {
    return { ok: false, reason: 'doesNotFit' };
  }

  const mLength = measureTicks(mDef.timeSig);
  const dots = spec.dots ?? 0;
  const newDuration = durationTicks(spec.baseType, dots);

  if (cursor.tick + newDuration > mLength) {
    return { ok: false, reason: 'doesNotFit' };
  }

  const part = score.parts.find((p) =>
    p.staves.some((s) => s.id === cursor.staffId)
  );
  const staff = part?.staves.find((s) => s.id === cursor.staffId);
  const sm = staff?.measures[cursor.measureId];
  const voice = sm?.voices.find((v) => v.id === cursor.voiceId) ?? sm?.voices[0];

  if (!voice) {
    return { ok: false, reason: 'doesNotFit' };
  }

  // Check for tuplet collision
  let t = 0;
  for (const ev of voice.events) {
    const evStart = t;
    const evEnd = t + ev.duration;
    t = evEnd;

    // Overlaps with [cursor.tick, cursor.tick + newDuration)
    if (evEnd > cursor.tick && evStart < cursor.tick + newDuration) {
      if (ev.tuplet) {
        return { ok: false, reason: 'tuplet' };
      }
    }
  }

  const spanStart = cursor.tick;
  const spanEnd = cursor.tick + newDuration;

  // Identify all events that start inside [spanStart, spanEnd)
  const removedIds: string[] = [];
  let lastRemovedEnd = spanEnd;

  t = 0;
  for (const ev of voice.events) {
    const evStart = t;
    const evEnd = t + ev.duration;
    t = evEnd;

    if (evStart >= spanStart && evStart < spanEnd) {
      removedIds.push(ev.id);
      lastRemovedEnd = Math.max(lastRemovedEnd, evEnd);
    }
  }

  // Remainder rests for truncated remainder
  const remainderSpan = lastRemovedEnd - spanEnd;
  const remainderTypes = restsForSpan(spanEnd, remainderSpan, mLength);
  const remainderRests: RestEvent[] = remainderTypes.map((rt) => {
    if (rt === 'wholeMeasure') {
      return createRest({ baseType: 'whole', duration: mLength, wholeMeasure: true });
    }
    return createRest({ baseType: rt, duration: durationTicks(rt, 0) });
  });

  const newEvent: ScoreEvent =
    spec.kind === 'note'
      ? createNote({
          id: spec.eventId,
          baseType: spec.baseType,
          dots,
          pitches: spec.pitch ? [{ ...spec.pitch }] : [],
        })
      : createRest({
          id: spec.eventId,
          baseType: spec.baseType,
          dots,
        });

  return {
    ok: true,
    newEvent,
    remainderRests,
    removedIds,
    mLength,
  };
}

/**
 * Creates a command to enter a note or rest at the cursor position in replace mode.
 */
export function enterEventCommand(cursor: ScoreCursor, spec: InputNoteSpec): Command {
  return {
    name: spec.kind === 'note' ? 'enterNote' : 'enterRest',
    apply(score: Score): Score {
      const plan = planEnter(score, cursor, spec);
      if (!plan.ok) {
        return score;
      }

      return produce(score, (draft) => {
        for (const part of draft.parts) {
          const staff = part.staves.find((s) => s.id === cursor.staffId);
          if (!staff) continue;
          const sm = staff.measures[cursor.measureId];
          if (!sm) continue;
          const voice = sm.voices.find((v) => v.id === cursor.voiceId) ?? sm.voices[0];
          if (!voice) continue;

          // Find where spanStart begins in voice.events
          let currentTick = 0;
          let insertIndex = voice.events.length;
          for (let i = 0; i < voice.events.length; i++) {
            if (currentTick >= cursor.tick) {
              insertIndex = i;
              break;
            }
            currentTick += voice.events[i].duration;
          }

          // Filter out removed events
          const keptEvents = voice.events.filter((ev) => !plan.removedIds.includes(ev.id));

          // Insert new event followed by remainder rests
          const insertionPoint = Math.min(insertIndex, keptEvents.length);
          keptEvents.splice(insertionPoint, 0, plan.newEvent, ...plan.remainderRests);
          voice.events = keptEvents;

          // Clean overrides for removed events
          for (const remId of plan.removedIds) {
            delete draft.overrides[remId];
          }
          return;
        }
      });
    },
  };
}

export function enterNote(
  cursor: ScoreCursor,
  spec: Omit<InputNoteSpec, 'kind'>,
  eventId?: Id
): Command {
  return enterEventCommand(cursor, { ...spec, kind: 'note', eventId: eventId ?? spec.eventId });
}

export function enterRest(
  cursor: ScoreCursor,
  spec: Omit<InputNoteSpec, 'kind' | 'pitch'>,
  eventId?: Id
): Command {
  return enterEventCommand(cursor, { ...spec, kind: 'rest', eventId: eventId ?? spec.eventId });
}

/**
 * Finds the pitch of the last note preceding the cursor in the staff voice.
 */
export function getLastNotePitchBeforeCursor(score: Score, cursor: ScoreCursor | null): Pitch | null {
  if (!cursor) return null;
  const staff = score.parts[0]?.staves.find((s) => s.id === cursor.staffId);
  if (!staff) return null;

  const mIdx = score.measures.findIndex((m) => m.id === cursor.measureId);
  if (mIdx === -1) return null;

  for (let i = mIdx; i >= 0; i--) {
    const mDef = score.measures[i];
    const sm = staff.measures[mDef.id];
    const voice = sm?.voices.find((v) => v.id === cursor.voiceId) ?? sm?.voices[0];
    if (!voice) continue;

    let t = 0;
    const notesBefore: Pitch[] = [];
    for (const ev of voice.events) {
      if (i === mIdx && t >= cursor.tick) break;
      if (ev.kind === 'note') {
        const noteEv = ev as NoteEvent;
        if (noteEv.pitches.length > 0) {
          notesBefore.push(noteEv.pitches[0]);
        }
      }
      t += ev.duration;
    }

    if (notesBefore.length > 0) {
      return notesBefore[notesBefore.length - 1];
    }
  }

  return null;
}

/**
 * Creates a command that appends a new measure copying the timeSig and keySig of the last measure.
 */
export function appendMeasure(): Command {
  return {
    name: 'appendMeasure',
    apply(score: Score): Score {
      return produce(score, (draft) => {
        const lastMDef = draft.measures[draft.measures.length - 1];
        const timeSig = lastMDef ? { ...lastMDef.timeSig } : { num: 4, den: 4 };
        const keySig = lastMDef ? lastMDef.keySig : 0;

        const newMDef = createMeasure(timeSig, keySig);
        draft.measures.push(newMDef);

        const mDuration = measureTicks(timeSig);

        for (const part of draft.parts) {
          for (const staff of part.staves) {
            staff.measures[newMDef.id] = {
              voices: [
                {
                  id: newId(),
                  events: [
                    createRest({
                      baseType: 'whole',
                      duration: mDuration,
                      wholeMeasure: true,
                    }),
                  ],
                },
              ],
            };
          }
        }
      });
    },
  };
}

/**
 * Advances the score cursor forward by ticks, wrapping across measure boundaries.
 */
export function advanceCursor(
  score: Score,
  cursor: ScoreCursor,
  ticks: number
): ScoreCursor {
  const mIdx = score.measures.findIndex((m) => m.id === cursor.measureId);
  if (mIdx === -1) return { ...cursor };

  const mLength = measureTicks(score.measures[mIdx].timeSig);
  const nextTick = cursor.tick + ticks;

  if (nextTick < mLength) {
    return { ...cursor, tick: nextTick };
  }

  // Measure finished, advance to next measure if available
  if (mIdx + 1 < score.measures.length) {
    const nextMDef = score.measures[mIdx + 1];
    const part = score.parts.find((p) => p.staves.some((s) => s.id === cursor.staffId));
    const staff = part?.staves.find((s) => s.id === cursor.staffId);
    const nextVoiceId =
      staff?.measures[nextMDef.id]?.voices[0]?.id ?? cursor.voiceId;

    return {
      staffId: cursor.staffId,
      voiceId: nextVoiceId,
      measureId: nextMDef.id,
      tick: 0,
    };
  }

  // At the end of the last measure
  return { ...cursor, tick: mLength };
}

/**
 * Moves cursor to the previous or next event start position across measures.
 */
export function moveCursor(
  score: Score,
  cursor: ScoreCursor,
  direction: 'prev' | 'next'
): ScoreCursor {
  const part = score.parts.find((p) => p.staves.some((s) => s.id === cursor.staffId));
  const staff = part?.staves.find((s) => s.id === cursor.staffId);
  if (!staff) return { ...cursor };

  // Flat list of event coordinates across all measures
  interface EventLocation {
    measureId: Id;
    voiceId: Id;
    tick: number;
    id: Id;
  }
  const locations: EventLocation[] = [];

  for (const mDef of score.measures) {
    const sm = staff.measures[mDef.id];
    if (!sm) continue;
    for (const voice of sm.voices) {
      let t = 0;
      for (const ev of voice.events) {
        locations.push({
          measureId: mDef.id,
          voiceId: voice.id,
          tick: t,
          id: ev.id,
        });
        t += ev.duration;
      }
    }
  }

  if (locations.length === 0) return { ...cursor };

  // Locate closest matching index
  let currIdx = locations.findIndex(
    (loc) => loc.measureId === cursor.measureId && loc.tick === cursor.tick
  );
  if (currIdx === -1) {
    currIdx = locations.findIndex((loc) => loc.measureId === cursor.measureId);
  }
  if (currIdx === -1) currIdx = 0;

  if (direction === 'next') {
    const nextIdx = Math.min(currIdx + 1, locations.length - 1);
    const loc = locations[nextIdx];
    return {
      staffId: cursor.staffId,
      measureId: loc.measureId,
      voiceId: loc.voiceId,
      tick: loc.tick,
    };
  } else {
    const prevIdx = Math.max(0, currIdx - 1);
    const loc = locations[prevIdx];
    return {
      staffId: cursor.staffId,
      measureId: loc.measureId,
      voiceId: loc.voiceId,
      tick: loc.tick,
    };
  }
}

/**
 * Snaps a cursor tick to the nearest preceding event start in the measure.
 */
export function snapCursor(score: Score, cursor: ScoreCursor): ScoreCursor {
  const part = score.parts.find((p) => p.staves.some((s) => s.id === cursor.staffId));
  const staff = part?.staves.find((s) => s.id === cursor.staffId);
  const sm = staff?.measures[cursor.measureId];
  const voice = sm?.voices.find((v) => v.id === cursor.voiceId) ?? sm?.voices[0];

  if (!voice || voice.events.length === 0) {
    return { ...cursor, tick: 0 };
  }

  let bestTick = 0;
  let t = 0;
  for (const ev of voice.events) {
    if (t <= cursor.tick) {
      bestTick = t;
    } else {
      break;
    }
    t += ev.duration;
  }

  return { ...cursor, tick: bestTick };
}

const STEP_DIATONIC: Record<PitchStep, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

/**
 * Calculates octave-nearest pitch from a keyboard letter name according to Western music rules.
 *
 * Chooses the octave with the minimum diatonic distance (-3..+3 steps) from the reference pitch.
 * In treble clef, null starts at B4; in bass clef, null starts at D3.
 * Accidental is automatically looked up from the current key signature.
 */
export function pitchFromLetter(
  letter: string,
  previousPitch: Pitch | null,
  clef: Clef,
  keySig: number
): Pitch {
  const step = letter.toUpperCase() as PitchStep;
  const ref =
    previousPitch ??
    (clef.sign === 'F'
      ? { step: 'D', octave: 3, alter: 0 }
      : { step: 'B', octave: 4, alter: 0 });

  const refDiatonic = ref.octave * 7 + STEP_DIATONIC[ref.step];

  let bestOctave = ref.octave;
  let minAbsDiff = Infinity;

  for (const oct of [ref.octave - 1, ref.octave, ref.octave + 1]) {
    const candidateDiatonic = oct * 7 + STEP_DIATONIC[step];
    const diff = candidateDiatonic - refDiatonic;

    if (diff >= -3 && diff <= 3) {
      bestOctave = oct;
      break;
    }
    if (Math.abs(diff) < minAbsDiff) {
      minAbsDiff = Math.abs(diff);
      bestOctave = oct;
    }
  }

  const alter = getKeySignatureAlter(step, keySig);
  return {
    step,
    octave: bestOctave,
    alter,
  };
}
