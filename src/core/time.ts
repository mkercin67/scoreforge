/**
 * Time and rhythmic calculations for ScoreForge.
 *
 * All temporal measurements in the core model use integer ticks to prevent
 * floating-point drift and rounding errors.
 */

import { BaseDurationType } from './model';

/** Pulses (ticks) per quarter note. Standard resolution: 960 ticks. */
export const PPQ = 960;

/** Mapping from base duration types to base ticks (relative to PPQ). */
const BASE_TICKS_MAP: Record<BaseDurationType, number> = {
  whole: PPQ * 4, // 3840 ticks
  half: PPQ * 2, // 1920 ticks
  quarter: PPQ, // 960 ticks
  eighth: PPQ / 2, // 480 ticks
  '16th': PPQ / 4, // 240 ticks
  '32nd': PPQ / 8, // 120 ticks
};

/**
 * Calculates the duration of an event in integer ticks.
 *
 * @param baseType - The fundamental note value (e.g. 'quarter', 'eighth').
 * @param dots - Number of augmentation dots (defaults to 0).
 * @param tuplet - Optional ratio of actual notes in the space of normal notes.
 * @returns Total duration in integer ticks.
 */
export function durationTicks(
  baseType: BaseDurationType,
  dots: number = 0,
  tuplet?: { actual: number; normal: number }
): number {
  const base = BASE_TICKS_MAP[baseType];
  if (base === undefined) {
    throw new Error(`Unknown base duration type: ${baseType}`);
  }

  let totalTicks = base;
  let dotAdd = base;

  for (let i = 0; i < dots; i++) {
    dotAdd = Math.floor(dotAdd / 2);
    totalTicks += dotAdd;
  }

  if (tuplet && tuplet.actual > 0) {
    totalTicks = Math.round((totalTicks * tuplet.normal) / tuplet.actual);
  }

  return totalTicks;
}

/**
 * Calculates the total duration of a measure in integer ticks based on its time signature.
 * Formula: num * (4 / den) * PPQ.
 *
 * @param timeSig - The time signature numerator and denominator.
 * @returns Measure length in integer ticks.
 */
export function measureTicks(timeSig: { num: number; den: number }): number {
  if (timeSig.den <= 0 || timeSig.num <= 0) {
    throw new Error(`Invalid time signature: ${timeSig.num}/${timeSig.den}`);
  }
  return Math.round((timeSig.num * 4 * PPQ) / timeSig.den);
}
