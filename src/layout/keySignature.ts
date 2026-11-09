/**
 * Key signature layout calculation for treble and bass clefs.
 *
 * Provides standard engraving positions (in staff spaces) for sharps and flats.
 */

import { Clef, PitchStep } from '../core/model';

export interface KeySigAccidental {
  glyph: 'accidentalSharp' | 'accidentalFlat';
  y: number; // Y coordinate in staff spaces
  step: PitchStep;
}

const SHARP_STEPS: PitchStep[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_STEPS: PitchStep[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const TREBLE_SHARP_YS = [0.0, 1.5, -0.5, 1.0, 2.5, 0.5, 2.0];
const TREBLE_FLAT_YS = [2.0, 0.5, 2.5, 1.0, 3.0, 1.5, 3.5];

const BASS_SHARP_YS = [1.0, 2.5, 0.5, 2.0, 3.5, 1.5, 3.0];
const BASS_FLAT_YS = [3.0, 1.5, 3.5, 2.0, 4.0, 2.5, 1.0];

/**
 * Returns the list of accidentals and their vertical positions in staff spaces for a key signature.
 *
 * @param keySig - Key signature number (-7 to 7 on circle of fifths).
 * @param clef - Active staff clef.
 * @returns Array of accidental items to display in the key signature.
 */
export function getKeySignatureAccidentals(keySig: number, clef: Clef): KeySigAccidental[] {
  const result: KeySigAccidental[] = [];

  if (keySig === 0) return result;

  const isBass = clef.sign === 'F';

  if (keySig > 0) {
    const count = Math.min(keySig, 7);
    const ys = isBass ? BASS_SHARP_YS : TREBLE_SHARP_YS;
    for (let i = 0; i < count; i++) {
      result.push({
        glyph: 'accidentalSharp',
        y: ys[i],
        step: SHARP_STEPS[i],
      });
    }
  } else {
    const count = Math.min(Math.abs(keySig), 7);
    const ys = isBass ? BASS_FLAT_YS : TREBLE_FLAT_YS;
    for (let i = 0; i < count; i++) {
      result.push({
        glyph: 'accidentalFlat',
        y: ys[i],
        step: FLAT_STEPS[i],
      });
    }
  }

  return result;
}

/**
 * Returns the default alter for a pitch step according to the key signature.
 *
 * @param step - Pitch step letter.
 * @param keySig - Circle of fifths value.
 * @returns Semitone alteration (-1, 0, or 1).
 */
export function getKeySignatureAlter(step: PitchStep, keySig: number): number {
  if (keySig > 0) {
    const sharps = SHARP_STEPS.slice(0, Math.min(keySig, 7));
    return sharps.includes(step) ? 1 : 0;
  }
  if (keySig < 0) {
    const flats = FLAT_STEPS.slice(0, Math.min(Math.abs(keySig), 7));
    return flats.includes(step) ? -1 : 0;
  }
  return 0;
}
