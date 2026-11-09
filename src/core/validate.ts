/**
 * Validation rules and integrity checks for ScoreForge scores.
 *
 * Implements validation according to music notation rules and model constraints,
 * such as verifying voice durations against measure time signatures.
 */

import { Id, Score } from './model';
import { measureTicks } from './time';

/** Severity level of a validation problem. */
export type ProblemSeverity = 'error' | 'warning';

/** Validation problem descriptor. */
export interface ValidationProblem {
  code: string;
  message: string;
  severity: ProblemSeverity;
  partId?: Id;
  staffId?: Id;
  measureId?: Id;
  voiceId?: Id;
  eventId?: Id;
}

/**
 * Validates a Score against structural, rhythmic, and model integrity rules.
 *
 * @param score - The score to validate.
 * @returns An array of detected validation problems. An empty array means valid.
 */
export function validateScore(score: Score): ValidationProblem[] {
  const problems: ValidationProblem[] = [];

  // Schema version check
  if (score.schemaVersion !== 1) {
    problems.push({
      code: 'invalid-schema-version',
      message: `Unsupported schema version: ${score.schemaVersion} (expected 1)`,
      severity: 'error',
    });
  }

  // Measure map for quick lookup
  const measureMap = new Map<Id, { num: number; den: number }>();

  // Validate measure definitions
  for (const mDef of score.measures) {
    if (mDef.timeSig.num <= 0 || mDef.timeSig.den <= 0) {
      problems.push({
        code: 'invalid-time-sig',
        message: `Measure ${mDef.id} has invalid time signature ${mDef.timeSig.num}/${mDef.timeSig.den}`,
        severity: 'error',
        measureId: mDef.id,
      });
    } else {
      measureMap.set(mDef.id, mDef.timeSig);
    }
  }

  // Validate parts, staves, measures, and voices
  for (const part of score.parts) {
    for (const staff of part.staves) {
      for (const [measureId, staffMeasure] of Object.entries(staff.measures)) {
        const timeSig = measureMap.get(measureId);
        if (!timeSig) {
          problems.push({
            code: 'orphaned-measure',
            message: `Staff measure references non-existent measure definition: ${measureId}`,
            severity: 'error',
            partId: part.id,
            staffId: staff.id,
            measureId,
          });
          continue;
        }

        const expectedTicks = measureTicks(timeSig);

        for (const voice of staffMeasure.voices) {
          let voiceTicks = 0;

          for (const ev of voice.events) {
            voiceTicks += ev.duration;

            // Note event pitch validation
            if (ev.kind === 'note') {
              if (!ev.pitches || ev.pitches.length === 0) {
                problems.push({
                  code: 'empty-note-pitches',
                  message: `Note ${ev.id} in voice ${voice.id} has no pitches`,
                  severity: 'error',
                  partId: part.id,
                  staffId: staff.id,
                  measureId,
                  voiceId: voice.id,
                  eventId: ev.id,
                });
              } else {
                for (const p of ev.pitches) {
                  if (typeof p.alter !== 'number' || !Number.isFinite(p.alter)) {
                    problems.push({
                      code: 'invalid-pitch-alter',
                      message: `Note ${ev.id} has invalid pitch alteration: ${p.alter}`,
                      severity: 'error',
                      partId: part.id,
                      staffId: staff.id,
                      measureId,
                      voiceId: voice.id,
                      eventId: ev.id,
                    });
                  }
                }
              }
            }
          }

          // Voice duration check against measure duration
          if (voiceTicks < expectedTicks) {
            problems.push({
              code: 'measure-underfull',
              message: `Voice ${voice.id} in measure ${measureId} is short: ${voiceTicks} ticks (expected ${expectedTicks})`,
              severity: 'error',
              partId: part.id,
              staffId: staff.id,
              measureId,
              voiceId: voice.id,
            });
          } else if (voiceTicks > expectedTicks) {
            problems.push({
              code: 'measure-overfull',
              message: `Voice ${voice.id} in measure ${measureId} is overfull: ${voiceTicks} ticks (expected ${expectedTicks})`,
              severity: 'error',
              partId: part.id,
              staffId: staff.id,
              measureId,
              voiceId: voice.id,
            });
          }
        }
      }
    }
  }

  return problems;
}
