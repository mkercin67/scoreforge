/**
 * Score serialization and deserialization in native ScoreForge format (.sfscore).
 *
 * Implements envelope packaging, migrations registry, schema version verification,
 * and comprehensive validation checks on load to guarantee score consistency.
 */

import { Score } from '../core/model';
import { validateScore } from '../core/validate';

/** Envelope format for native .sfscore files. */
export interface ScoreForgeEnvelope {
  app: 'scoreforge';
  savedAt: string; // ISO 8601 string
  score: Score;
}

/** Migration function signature for schema version upgrades. */
export type ScoreMigration = (data: unknown) => Score;

/** Registry of schema migrations keyed by source schemaVersion (empty currently for v1). */
export const migrations: Record<number, ScoreMigration> = {};

/**
 * Serializes a Score instance to a JSON string.
 *
 * @param score - Score data to serialize.
 * @param space - Optional indentation spaces for formatting.
 * @param envelope - When true (default), packages inside `{ app: 'scoreforge', savedAt, score }`.
 * @returns Serialized JSON string.
 */
export function serializeScore(score: Score, space?: number, envelope: boolean = true): string {
  if (envelope) {
    const env: ScoreForgeEnvelope = {
      app: 'scoreforge',
      savedAt: new Date().toISOString(),
      score,
    };
    return JSON.stringify(env, null, space);
  }
  return JSON.stringify(score, null, space);
}

/**
 * Deserializes a JSON string into a Score instance.
 * Accepts both native ScoreForge envelopes ({ app: 'scoreforge', savedAt, score })
 * and raw Score JSON objects.
 *
 * Performs schemaVersion verification, runs migrations if necessary,
 * and executes validateScore to reject corrupted/invalid files with descriptive errors.
 *
 * @param json - Serialized score JSON string.
 * @returns Validated Score object.
 * @throws Error if the JSON is malformed, schemaVersion is unsupported, or validation fails.
 */
export function deserializeScore(json: string): Score {
  if (!json || typeof json !== 'string' || json.trim().length === 0) {
    throw new Error('Invalid score JSON: input string is empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`Malformed JSON file: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid score JSON: root element must be an object');
  }

  let candidate: unknown = parsed;
  const asRecord = parsed as Record<string, unknown>;

  // Detect and unwrap envelope
  if (asRecord.app === 'scoreforge' && asRecord.score && typeof asRecord.score === 'object') {
    candidate = asRecord.score;
  }

  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('Invalid score data: score payload must be an object');
  }

  const scoreObj = candidate as Record<string, unknown>;
  const version = scoreObj.schemaVersion;

  if (typeof version !== 'number') {
    throw new Error('Unsupported or missing schemaVersion: missing schemaVersion property');
  }

  // Run migrations if a registered migration exists for this version
  let migratedScore: Score;
  if (migrations[version]) {
    migratedScore = migrations[version](scoreObj);
  } else if (version === 1) {
    migratedScore = scoreObj as unknown as Score;
  } else {
    throw new Error(
      `Unsupported schemaVersion: ${version}. Expected version 1 or a registered migration.`
    );
  }

  // Validate loaded score structure and durations
  const problems = validateScore(migratedScore);
  if (problems.length > 0) {
    const details = problems.map((p) => `[${p.code}] ${p.message}`).join('; ');
    throw new Error(`Validation failed on score load: ${details}`);
  }

  return migratedScore;
}
