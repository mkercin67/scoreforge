/**
 * Accidental state tracking within a measure according to standard engraving rules.
 *
 * An accidental carries through the rest of the measure for the same step and octave.
 */

import { Pitch } from '../core/model';
import { getKeySignatureAlter } from './keySignature';

/**
 * Manages active chromatic alterations for pitches within a single measure.
 */
export class MeasureAccidentalTracker {
  private keySig: number;
  private currentAlter: Map<string, number> = new Map();

  constructor(keySig: number = 0) {
    this.keySig = keySig;
  }

  /**
   * Determines whether an accidental glyph is required for a pitch and updates state.
   *
   * @param pitch - The pitch to evaluate.
   * @returns SMuFL accidental glyph name, or null if no accidental should be drawn.
   */
  processPitch(pitch: Pitch): string | null {
    const pitchKey = `${pitch.step}${pitch.octave}`;
    const activeAlter = this.currentAlter.has(pitchKey)
      ? this.currentAlter.get(pitchKey)!
      : getKeySignatureAlter(pitch.step, this.keySig);

    if (pitch.alter === activeAlter) {
      return null;
    }

    // Non-integer alterations (microtones) are not rendered as standard accidentals yet
    if (!Number.isInteger(pitch.alter) || pitch.alter < -2 || pitch.alter > 2) {
      console.warn(
        `[ScoreForge layout] Microtonal accidental not yet supported: alter=${pitch.alter}`
      );
      return null;
    }

    this.currentAlter.set(pitchKey, pitch.alter);

    switch (pitch.alter) {
      case 0:
        return 'accidentalNatural';
      case 1:
        return 'accidentalSharp';
      case -1:
        return 'accidentalFlat';
      case 2:
        return 'accidentalDoubleSharp';
      case -2:
        return 'accidentalDoubleFlat';
      default:
        return null;
    }
  }
}
