/**
 * Pitch-to-staff mapping, ledger lines, and stem direction rules.
 *
 * Implements diatonic position calculations relative to the staff bottom line.
 */

import { Clef, Pitch, PitchStep } from '../core/model';
import { getKeySignatureAlter } from './keySignature';

const STEP_INDEX: Record<PitchStep, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

const DIATONIC_STEPS: PitchStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

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

/**
 * Converts a vertical position in staff spaces (ySpaces) to a diatonic Pitch.
 *
 * Diatonic staff positions:
 * stepPos = Math.round((4 - ySpaces) * 2)
 * Clamped to [-3, 11] (at most 3 diatonic steps beyond staff boundaries [0, 8]).
 *
 * @param clef - Active clef (determines bottom line reference).
 * @param ySpaces - Vertical offset in staff spaces from the top staff line (y=0).
 * @param keySig - Key signature alter count (-7..+7), defaults to 0.
 * @returns Pitch object with step, octave, and optional alter from keySig.
 */
export function yToStaffPosition(clef: Clef, ySpaces: number, keySig = 0): Pitch {
  // 1. Convert y coordinate in staff spaces to stepPos
  const rawStepPos = Math.round((4 - ySpaces) * 2);

  // 2. Clamp to at most 3 diatonic steps beyond staff boundaries on each side:
  // Bottom line = 0 -> min stepPos = -3
  // Top line = 8    -> max stepPos = 11
  const clampedStepPos = Math.max(-3, Math.min(11, rawStepPos));

  // 3. Determine bottom line diatonic reference
  let bottomLineDiatonic = 30; // Treble: E4 (4 * 7 + 2 = 30)
  if (clef.sign === 'G') {
    bottomLineDiatonic = 30;
  } else if (clef.sign === 'F') {
    bottomLineDiatonic = 18; // Bass: G2 (2 * 7 + 4 = 18)
  } else if (clef.sign === 'C') {
    bottomLineDiatonic = 24; // Alto: F3 (3 * 7 + 3 = 24)
  }

  const pitchDiatonic = bottomLineDiatonic + clampedStepPos;
  const octave = Math.floor(pitchDiatonic / 7);
  const stepIdx = ((pitchDiatonic % 7) + 7) % 7;
  const step = DIATONIC_STEPS[stepIdx];

  const alter = getKeySignatureAlter(step, keySig);
  return { step, alter, octave };
}
