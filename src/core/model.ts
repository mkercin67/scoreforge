/**
 * Core data model for ScoreForge.
 *
 * All types represent plain serializable data structures with no functions,
 * classes, or hidden internal state. Coordinates in overrides are expressed
 * in staff spaces, and time is measured in integer ticks.
 */

/** Unique identifier type (UUID string). */
export type Id = string;

/** Root score container. */
export interface Score {
  schemaVersion: 1;
  id: Id;
  meta: {
    title: string;
    composer: string;
  };
  parts: Part[];
  measures: MeasureDef[];
  overrides: Record<Id, Override>;
}

/** Global measure definition shared by all staves across parts. */
export interface MeasureDef {
  id: Id;
  timeSig: {
    num: number;
    den: number;
  };
  keySig: number; // -7..7 on circle of fifths (0 = C major / A minor)
  tempo?: {
    bpm: number;
    beatUnit: number;
  };
}

/** Supported clef sign symbols. */
export type ClefSign = 'G' | 'F' | 'C';

/** Clef specification. */
export interface Clef {
  sign: ClefSign;
  line: number; // e.g. 2 for G clef (treble), 4 for F clef (bass)
}

/** A single instrument or musical part consisting of one or more staves. */
export interface Part {
  id: Id;
  name: string;
  staves: Staff[];
  instrument: string;
}

/** A single staff belonging to a part. */
export interface Staff {
  id: Id;
  clef: Clef;
  measures: Record<Id, StaffMeasure>; // Keyed by MeasureDef.id
}

/** Staff contents within a specific measure, containing one or more voices. */
export interface StaffMeasure {
  voices: Voice[];
}

/** A voice channel within a measure holding a sequential list of score events. */
export interface Voice {
  id: Id;
  events: ScoreEvent[];
}

/** Discriminated union of score events. */
export type ScoreEvent = NoteEvent | RestEvent;

/** Supported fundamental duration types. */
export type BaseDurationType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd';

/** Base attributes shared by notes and rests. */
export interface BaseEvent {
  id: Id;
  duration: number; // Duration in ticks, scaled by dots and tuplets
  baseType: BaseDurationType;
  dots: number;
  tuplet?: {
    actual: number; // Number of notes played in the time of 'normal'
    normal: number; // Number of notes normally occupying this duration
  };
}

/** Note event (single pitch or multi-pitch chord). */
export interface NoteEvent extends BaseEvent {
  kind: 'note';
  pitches: Pitch[];
  tiedToNext?: boolean;
  articulations: string[]; // e.g. 'staccato', 'accent', 'tenuto'
  dynamic?: string; // e.g. 'p', 'mf', 'f'
}

/** Rest event. */
export interface RestEvent extends BaseEvent {
  kind: 'rest';
}

/** Musical pitch step letter. */
export type PitchStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** Musical pitch with scientific octave and continuous microtonal alteration. */
export interface Pitch {
  step: PitchStep;
  octave: number; // Scientific pitch notation: C4 = middle C
  alter: number; // Semitone offset: 0 = natural, 1 = sharp, -1 = flat, 0.5 = quarter tone sharp
}

/** Manual visual layout overrides in staff spaces. */
export interface Override {
  dx?: number;
  dy?: number;
  scale?: number;
  hidden?: boolean;
}
