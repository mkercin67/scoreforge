/**
 * Formatting utilities for pitch names in musical notations.
 *
 * Supports solfège (Do Re Mi) and letter (C D E) nomenclature, standard
 * accidental symbols (♯ ♭ 𝄪 𝄫), scientific octave numbering, and non-integer
 * microtonal alter values.
 */

import { Pitch } from '../../core/model';

export type NoteNameStyle = 'solfege' | 'letter';
export type Language = 'tr' | 'en';

const SOLFEGE_STEPS: Record<Pitch['step'], string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
};

const ACCIDENTAL_SYMBOLS: Record<number, string> = {
  [-2]: '𝄫',
  [-1]: '♭',
  [0]: '',
  [1]: '♯',
  [2]: '𝄪',
};

/**
 * Formats a pitch object into a readable pitch string.
 *
 * @param pitch - The pitch object containing step, octave, and alter semitones.
 * @param style - 'solfege' (Do, Re, Mi) or 'letter' (C, D, E). Defaults to 'solfege'.
 * @param _lang - Optional language context ('tr' | 'en').
 * @returns Formatted pitch string (e.g. "Do4", "Sol4", "Fa♯4", "Si♭3", "Do4 (+0.5)").
 */
export function formatPitchName(
  pitch: Pitch,
  style: NoteNameStyle = 'solfege',
  _lang: Language = 'tr'
): string {
  const stepName = style === 'solfege' ? SOLFEGE_STEPS[pitch.step] : pitch.step;

  if (Number.isInteger(pitch.alter) && pitch.alter in ACCIDENTAL_SYMBOLS) {
    const acc = ACCIDENTAL_SYMBOLS[pitch.alter];
    return `${stepName}${acc}${pitch.octave}`;
  }

  // Non-integer or out-of-range alteration (e.g. microtonal alter 0.5)
  const sign = pitch.alter > 0 ? `+${pitch.alter}` : `${pitch.alter}`;
  return `${stepName}${pitch.octave} (${sign})`;
}
