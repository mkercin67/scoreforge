/**
 * Score serialization and deserialization in native JSON format.
 *
 * Implements schema version verification as required by architecture design principle 3.
 */

import { Score } from '../core/model';

/**
 * Serializes a Score instance to a JSON string.
 *
 * @param score - Score data to serialize.
 * @param space - Optional indentation spaces for formatting.
 * @returns Serialized JSON string.
 */
export function serializeScore(score: Score, space?: number): string {
  return JSON.stringify(score, null, space);
}

/**
 * Deserializes a JSON string into a Score instance and validates its schema version.
 *
 * @param json - Serialized score JSON string.
 * @returns Deserialized Score object.
 * @throws Error if the JSON is malformed or schemaVersion is missing/unsupported.
 */
export function deserializeScore(json: string): Score {
  const parsed = JSON.parse(json) as unknown;

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid score JSON: root element must be an object');
  }

  const candidate = parsed as Partial<Score>;

  if (candidate.schemaVersion !== 1) {
    throw new Error(
      `Unsupported or missing schemaVersion: ${candidate.schemaVersion}. Expected version 1.`
    );
  }

  return parsed as Score;
}
