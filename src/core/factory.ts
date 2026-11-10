/**
 * Factory functions for initializing ScoreForge model objects.
 */

import {
  BaseDurationType,
  Clef,
  Id,
  MeasureDef,
  NoteEvent,
  Part,
  Pitch,
  PitchStep,
  RestEvent,
  Score,
  Staff,
} from './model';
import { durationTicks, measureTicks } from './time';

/**
 * Generates a unique RFC4122 v4 UUID string.
 *
 * @returns A unique identifier.
 */
export function newId(): Id {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const val = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return val.toString(16);
  });
}

/**
 * Creates a new musical pitch.
 *
 * @param step - Step letter ('C' through 'B').
 * @param octave - Scientific octave number (4 for middle C).
 * @param alter - Semitone alteration (0 for natural, positive for sharp, negative for flat).
 * @returns A valid Pitch object.
 */
export function createPitch(step: PitchStep, octave: number, alter: number = 0): Pitch {
  return { step, octave, alter };
}

/** Options for creating a new score. */
export interface CreateScoreOptions {
  title?: string;
  composer?: string;
}

/**
 * Creates an empty Score.
 *
 * @param options - Optional metadata (title and composer).
 * @returns A new Score instance with schemaVersion 1.
 */
export function createScore(options?: CreateScoreOptions): Score {
  return {
    schemaVersion: 1,
    id: newId(),
    meta: {
      title: options?.title ?? 'Untitled Score',
      composer: options?.composer ?? 'Anonymous',
    },
    parts: [],
    measures: [],
    overrides: {},
  };
}

/** Options for creating a musical part. */
export interface CreatePartOptions {
  name?: string;
  instrument?: string;
  clef?: Clef;
  staves?: Staff[];
}

/**
 * Creates a musical part with at least one default staff.
 *
 * @param nameOrOptions - Part name string or options object.
 * @returns A new Part instance.
 */
export function createPart(nameOrOptions?: string | CreatePartOptions): Part {
  const options =
    typeof nameOrOptions === 'string' ? { name: nameOrOptions } : (nameOrOptions ?? {});

  const defaultClef: Clef = options.clef ?? { sign: 'G', line: 2 };
  const staves =
    options.staves ?? [
      {
        id: newId(),
        clef: defaultClef,
        measures: {},
      },
    ];

  return {
    id: newId(),
    name: options.name ?? 'Part 1',
    staves,
    instrument: options.instrument ?? 'default',
  };
}

/**
 * Creates a global measure definition.
 *
 * @param timeSig - Time signature (defaults to 4/4).
 * @param keySig - Key signature (-7 to 7 fifths, defaults to 0).
 * @param tempo - Optional tempo marking (bpm and beatUnit).
 * @returns A new MeasureDef instance.
 */
export function createMeasure(
  timeSig: { num: number; den: number } = { num: 4, den: 4 },
  keySig: number = 0,
  tempo?: { bpm: number; beatUnit: number }
): MeasureDef {
  return {
    id: newId(),
    timeSig: { ...timeSig },
    keySig,
    tempo: tempo ? { ...tempo } : undefined,
  };
}

/** Options for creating a note event. */
export interface CreateNoteOptions {
  pitches: Pitch[];
  baseType?: BaseDurationType;
  dots?: number;
  tuplet?: { actual: number; normal: number };
  articulations?: string[];
  dynamic?: string;
  tiedToNext?: boolean;
}

/**
 * Creates a note event with automatic duration calculation in integer ticks.
 *
 * @param options - Note attributes including pitches and rhythmic value.
 * @returns A NoteEvent instance.
 */
export function createNote(options: CreateNoteOptions): NoteEvent {
  const baseType = options.baseType ?? 'quarter';
  const dots = options.dots ?? 0;
  const duration = durationTicks(baseType, dots, options.tuplet);

  return {
    kind: 'note',
    id: newId(),
    baseType,
    dots,
    tuplet: options.tuplet ? { ...options.tuplet } : undefined,
    duration,
    pitches: options.pitches.map((p) => ({ ...p })),
    articulations: options.articulations ? [...options.articulations] : [],
    dynamic: options.dynamic,
    tiedToNext: options.tiedToNext,
  };
}

/** Options for creating a rest event. */
export interface CreateRestOptions {
  baseType?: BaseDurationType;
  dots?: number;
  tuplet?: { actual: number; normal: number };
  duration?: number;
  wholeMeasure?: boolean;
}

/**
 * Creates a rest event with automatic duration calculation in integer ticks.
 *
 * @param options - Rest rhythmic values.
 * @returns A RestEvent instance.
 */
export function createRest(options?: CreateRestOptions): RestEvent {
  const wholeMeasure = options?.wholeMeasure ?? false;
  const baseType = wholeMeasure ? 'whole' : options?.baseType ?? 'quarter';
  const dots = wholeMeasure ? 0 : options?.dots ?? 0;
  const duration =
    options?.duration !== undefined
      ? options.duration
      : durationTicks(baseType, dots, options?.tuplet);

  return {
    kind: 'rest',
    id: newId(),
    baseType,
    dots,
    tuplet: options?.tuplet ? { ...options.tuplet } : undefined,
    duration,
    wholeMeasure: wholeMeasure ? true : undefined,
  };
}

export interface CreateEmptyScoreOptions {
  title?: string;
  composer?: string;
  clef?: Clef;
  keySig?: number;
  timeSig?: { num: number; den: number };
  measures?: number;
}

/**
 * Creates a complete empty score with wholeMeasure rests in each measure.
 *
 * @param options - Clef, key signature, time signature, and measure count.
 * @returns A fully initialized Score ready for editing.
 */
export function createEmptyScore(options: CreateEmptyScoreOptions = {}): Score {
  const clef = options.clef ?? { sign: 'G', line: 2 };
  const keySig = options.keySig ?? 0;
  const timeSig = options.timeSig ?? { num: 4, den: 4 };
  const numMeasures = options.measures ?? 8;

  const score = createScore({
    title: options.title ?? 'Untitled Score',
    composer: options.composer ?? '',
  });

  const part = createPart({
    name: clef.sign === 'F' ? 'Bass' : 'Treble',
    clef,
  });
  score.parts = [part];

  const mDuration = measureTicks(timeSig);

  for (let i = 0; i < numMeasures; i++) {
    const mDef = createMeasure(timeSig, keySig);
    score.measures.push(mDef);

    const wholeRest = createRest({
      baseType: 'whole',
      duration: mDuration,
      wholeMeasure: true,
    });

    part.staves[0].measures[mDef.id] = {
      voices: [{ id: newId(), events: [wholeRest] }],
    };
  }

  return score;
}
