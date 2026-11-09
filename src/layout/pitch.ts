/**
 * Pitch-to-staff mapping, ledger lines, and stem direction rules.
 *
 * Implements diatonic position calculations relative to the staff bottom line.
 */

import { Clef, Pitch, PitchStep } from '../core/model';

const STEP_INDEX: Record<PitchStep, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

/**
 * Calculates the diatonic step position of a pitch relative to the bottom line of the staff.
 *
 * Bottom line = step 0.
 * Middle line = step 4.
 * Top line = step 8.
 *
 * Treble clef bottom line is E4.
 * Bass clef bottom line is G2.
 *
 * @param pitch - The musical pitch to map.
 * @param clef - Active clef for the staff.
 * @returns Diatonic position number relative to bottom line.
 */
export function pitchToStaffPosition(pitch: Pitch, clef: Clef): number {
  const stepIdx = STEP_INDEX[pitch.step];
  if (stepIdx === undefined) {
    throw new Error(`Invalid pitch step: ${pitch.step}`);
  }

  const pitchDiatonic = pitch.octave * 7 + stepIdx;

  let bottomLineDiatonic = 30; // Treble default: E4 = 4 * 7 + 2 = 30

  if (clef.sign === 'G') {
    bottomLineDiatonic = 30; // E4
  } else if (clef.sign === 'F') {
    bottomLineDiatonic = 18; // G2 = 2 * 7 + 4 = 18
  } else if (clef.sign === 'C') {
    // Alto clef (line 3): C4 is on middle line (step 4), so bottom line is F3 (18+6 = 24)
    bottomLineDiatonic = 24;
  }

  return pitchDiatonic - bottomLineDiatonic;
}

/**
 * Converts a diatonic step position to a vertical coordinate in staff spaces.
 * Y axis grows downward; top staff line = 0, bottom staff line = 4.
 *
 * @param stepPos - Diatonic position relative to bottom line (step 0).
 * @returns Y coordinate in staff spaces.
 */
export function staffPositionToY(stepPos: number): number {
  return 4 - stepPos * 0.5;
}

/**
 * Computes the Y coordinates (in staff spaces) of any ledger lines required for a step position.
 *
 * @param stepPos - Diatonic step position relative to bottom line.
 * @returns Array of Y coordinates in staff spaces where ledger lines must be drawn.
 */
export function getLedgerLineYs(stepPos: number): number[] {
  const ys: number[] = [];

  // Below staff: steps <= -2
  if (stepPos <= -2) {
    const endStep = stepPos % 2 === 0 ? stepPos : stepPos + 1;
    for (let s = -2; s >= endStep; s -= 2) {
      ys.push(staffPositionToY(s));
    }
  }

  // Above staff: steps >= 10
  if (stepPos >= 10) {
    const endStep = stepPos % 2 === 0 ? stepPos : stepPos - 1;
    for (let s = 10; s <= endStep; s += 2) {
      ys.push(staffPositionToY(s));
    }
  }

  return ys;
}

/**
 * Determines whether a stem should point up or down based on diatonic step position.
 * Notes on or above the middle line (step 4) point DOWN.
 * Notes below the middle line point UP.
 *
 * @param stepPos - Diatonic step position (or mean position for a chord).
 * @returns 'up' or 'down'.
 */
export function getStemDirection(stepPos: number): 'up' | 'down' {
  return stepPos >= 4 ? 'down' : 'up';
}
