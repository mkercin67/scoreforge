/**
 * Pure pitch manipulation and transposition functions for the ScoreForge core model.
 *
 * Implements semitone and octave transpositions following standard Western music rules:
 * ascending transposition prefers sharp spellings, descending prefers flat spellings.
 * Microtonal alterations (non-integer alter values) are safely preserved without mutation.
 */

import { Pitch } from './model';

const STEP_SEMITONES: Record<Pitch['step'], number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

interface Spelling {
  step: Pitch['step'];
  alter: number;
}

// Prefer sharp spellings when transposing upward
const ASCENDING_SPELLINGS: Spelling[] = [
  { step: 'C', alter: 0 },
  { step: 'C', alter: 1 },
  { step: 'D', alter: 0 },
  { step: 'D', alter: 1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'F', alter: 1 },
  { step: 'G', alter: 0 },
  { step: 'G', alter: 1 },
  { step: 'A', alter: 0 },
  { step: 'A', alter: 1 },
  { step: 'B', alter: 0 },
];

// Prefer flat spellings when transposing downward
const DESCENDING_SPELLINGS: Spelling[] = [
  { step: 'C', alter: 0 },
  { step: 'D', alter: -1 },
  { step: 'D', alter: 0 },
  { step: 'E', alter: -1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'G', alter: -1 },
  { step: 'G', alter: 0 },
  { step: 'A', alter: -1 },
  { step: 'A', alter: 0 },
  { step: 'B', alter: -1 },
  { step: 'B', alter: 0 },
];

/**
 * Transposes a pitch by one semitone in the specified direction.
 *
 * Ascending movement spells chromatic notes with sharps (e.g. C -> C# -> D);
 * descending movement spells with flats (e.g. D -> Db -> C).
 * Non-integer alterations (microtones) are returned unchanged.
 *
 * @param pitch - The source pitch.
 * @param direction - 'up' or 'down'.
 * @returns New transposed Pitch instance.
 */
export function transposeSemitone(pitch: Pitch, direction: 'up' | 'down'): Pitch {
  if (!Number.isInteger(pitch.alter)) {
    return { ...pitch };
  }

  const currentMidi = 12 * (pitch.octave + 1) + STEP_SEMITONES[pitch.step] + pitch.alter;
  const targetMidi = direction === 'up' ? currentMidi + 1 : currentMidi - 1;

  // Standard piano pitch range limit: MIDI 21 (A0) to MIDI 108 (C8)
  if (targetMidi < 21 || targetMidi > 108) {
    return { ...pitch };
  }

  const targetOctave = Math.floor(targetMidi / 12) - 1;
  const pitchClass = ((targetMidi % 12) + 12) % 12;

  const spelling =
    direction === 'up' ? ASCENDING_SPELLINGS[pitchClass] : DESCENDING_SPELLINGS[pitchClass];

  return {
    step: spelling.step,
    octave: targetOctave,
    alter: spelling.alter,
  };
}

/**
 * Transposes a pitch by a number of octaves.
 *
 * Preserves the diatonic step and alteration, altering only the octave integer.
 * Clamps to standard piano pitch range (MIDI 21 to 108).
 *
 * @param pitch - The source pitch.
 * @param octaves - Positive or negative number of octaves to transpose.
 * @returns New transposed Pitch instance.
 */
export function transposeOctave(pitch: Pitch, octaves: number): Pitch {
  const currentMidi = 12 * (pitch.octave + 1) + STEP_SEMITONES[pitch.step] + pitch.alter;
  const targetMidi = currentMidi + octaves * 12;

  // Standard piano pitch range limit: MIDI 21 (A0) to MIDI 108 (C8)
  if (targetMidi < 21 || targetMidi > 108) {
    return { ...pitch };
  }

  return {
    ...pitch,
    octave: pitch.octave + octaves,
  };
}
