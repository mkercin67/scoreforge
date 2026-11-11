/**
 * Musical beam grouping logic per measure voice.
 *
 * Pure functions operating strictly on core event data and integer ticks (PPQ = 960).
 */

import { BaseDurationType, MeasureDef, ScoreEvent } from '../core/model';
import { PPQ } from '../core/time';

export type TimeSig = MeasureDef['timeSig'];

/** Contiguous group of beamable note events within one beat/tuplet unit. */
export interface BeamGroup {
  eventIds: string[];
}

/** Checks whether a base duration type requires a flag / can be beamed. */
export function isBeamableBaseType(baseType: BaseDurationType): boolean {
  return baseType === 'eighth' || baseType === '16th' || baseType === '32nd';
}

/** Returns the maximum beam level required for a note duration (1=8th, 2=16th, 3=32nd). */
export function getBeamLevelCount(baseType: BaseDurationType): number {
  if (baseType === '32nd') return 3;
  if (baseType === '16th') return 2;
  if (baseType === 'eighth') return 1;
  return 0;
}

/**
 * Returns the beat subdivision length in integer ticks used for beam grouping boundaries.
 *
 * Rules:
 * - x/4 (2/4, 3/4, 4/4, etc.): quarter-note beat (PPQ = 960 ticks).
 * - Compound x/8 (6/8, 9/8, 12/8, etc.): dotted-quarter beat (3 eighths = 1440 ticks).
 * - 3/8: whole measure dotted-quarter (1440 ticks).
 * - x/2 (2/2, etc.): half-note beat (2 * PPQ = 1920 ticks).
 * - Fallback: denominator unit length in ticks.
 */
export function getBeatTicksForTimeSig(timeSig: TimeSig): number {
  const { num, den } = timeSig;
  if (den <= 0 || num <= 0) {
    return PPQ;
  }
  if (den === 4) {
    return PPQ;
  }
  if (den === 2) {
    return PPQ * 2;
  }
  if (den === 8) {
    if (num === 3 || (num >= 6 && num % 3 === 0)) {
      return (PPQ / 2) * 3; // dotted quarter = 1440 ticks
    }
    return PPQ / 2;
  }
  return Math.max(1, Math.round((4 * PPQ) / den));
}

function getTupletKey(ev: ScoreEvent): string | null {
  if (!ev.tuplet) return null;
  return `${ev.tuplet.actual}:${ev.tuplet.normal}`;
}

/**
 * Computes beam groups for a single voice within a single measure.
 *
 * Rules:
 * 1. Only note events (single or chord) with baseType 'eighth' | '16th' | '32nd' qualify.
 *    Rests and quarter/longer notes break the current group.
 * 2. Never crosses a beat boundary (matched strictly by event START TICK).
 * 3. Events of matching tuplet ratio group together; mixing tuplet and non-tuplet breaks.
 * 4. A group requires at least 2 events; isolated beamable notes keep their flags.
 */
export function groupBeams(voiceEvents: ScoreEvent[], timeSig: TimeSig): BeamGroup[] {
  const beatTicks = getBeatTicksForTimeSig(timeSig);
  const groups: BeamGroup[] = [];

  let currentIds: string[] = [];
  let currentBeat = -1;
  let currentTupletKey: string | null = null;

  const flushGroup = () => {
    if (currentIds.length >= 2) {
      groups.push({ eventIds: currentIds });
    }
    currentIds = [];
    currentBeat = -1;
    currentTupletKey = null;
  };

  let runningTick = 0;

  for (let i = 0; i < voiceEvents.length; i++) {
    const ev = voiceEvents[i];
    const startTick = runningTick;
    runningTick += ev.duration;

    if (ev.kind !== 'note' || !isBeamableBaseType(ev.baseType)) {
      flushGroup();
      continue;
    }

    const eventBeat = Math.floor(startTick / beatTicks);
    const tupletKey = getTupletKey(ev);

    if (currentIds.length > 0 && (eventBeat !== currentBeat || tupletKey !== currentTupletKey)) {
      flushGroup();
    }

    if (currentIds.length === 0) {
      currentBeat = eventBeat;
      currentTupletKey = tupletKey;
    }
    currentIds.push(ev.id);
  }

  flushGroup();
  return groups;
}
