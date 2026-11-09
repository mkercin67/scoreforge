/**
 * Command pattern and undo/redo history for ScoreForge.
 *
 * Implements immutable state transitions using immer. Direct score mutations
 * are forbidden by architecture design principle 4.
 */

import { produce } from 'immer';
import { Id, NoteEvent, Override, Pitch, RestEvent, Score, ScoreEvent } from './model';
import { newId } from './factory';

/** Interface for all operations that transform a Score. */
export interface Command {
  /** Descriptive name of the command. */
  name: string;
  /**
   * Applies the command to the given score, returning a new Score instance.
   *
   * @param score - Current score state.
   * @returns Updated score state.
   */
  apply(score: Score): Score;
}

/**
 * Manages an undo/redo stack of Score states.
 */
export class History {
  private past: Score[] = [];
  private current: Score;
  private future: Score[] = [];

  constructor(initialScore: Score) {
    this.current = initialScore;
  }

  /** Gets the current score state. */
  get score(): Score {
    return this.current;
  }

  /**
   * Executes a command, recording history and clearing the redo stack.
   *
   * @param command - Command to apply.
   * @returns The updated current score.
   */
  do(command: Command): Score {
    this.past.push(this.current);
    this.current = command.apply(this.current);
    this.future = [];
    return this.current;
  }

  /**
   * Undoes the last executed command.
   *
   * @returns The restored score, or undefined if undo is not possible.
   */
  undo(): Score | undefined {
    if (!this.canUndo()) {
      return undefined;
    }
    const previous = this.past.pop()!;
    this.future.push(this.current);
    this.current = previous;
    return this.current;
  }

  /**
   * Redoes the last undone command.
   *
   * @returns The restored score, or undefined if redo is not possible.
   */
  redo(): Score | undefined {
    if (!this.canRedo()) {
      return undefined;
    }
    const next = this.future.pop()!;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }

  /**
   * Checks whether an undo operation can be performed.
   *
   * @returns True if there are previous states in the stack.
   */
  canUndo(): boolean {
    return this.past.length > 0;
  }

  /**
   * Checks whether a redo operation can be performed.
   *
   * @returns True if there are future states in the stack.
   */
  canRedo(): boolean {
    return this.future.length > 0;
  }
}

/** Parameters for the insertNote command. */
export interface InsertNoteParams {
  partId: Id;
  staffId?: Id;
  measureId: Id;
  voiceIndex?: number;
  voiceId?: Id;
  index?: number;
  event: NoteEvent | RestEvent;
}

/**
 * Creates a command that inserts a note or rest event into a voice.
 *
 * @param params - Insertion coordinates and event to insert.
 * @returns An executable Command.
 */
export function insertNote(params: InsertNoteParams): Command {
  return {
    name: 'insertNote',
    apply(score: Score): Score {
      return produce(score, (draft) => {
        const part = draft.parts.find((p) => p.id === params.partId);
        if (!part) {
          throw new Error(`Part not found: ${params.partId}`);
        }

        const staff = params.staffId
          ? part.staves.find((s) => s.id === params.staffId)
          : part.staves[0];
        if (!staff) {
          throw new Error(`Staff not found: ${params.staffId ?? 'default'}`);
        }

        if (!staff.measures[params.measureId]) {
          staff.measures[params.measureId] = {
            voices: [{ id: newId(), events: [] }],
          };
        }

        const staffMeasure = staff.measures[params.measureId];
        let voice = params.voiceId
          ? staffMeasure.voices.find((v) => v.id === params.voiceId)
          : undefined;

        if (!voice && params.voiceIndex !== undefined) {
          voice = staffMeasure.voices[params.voiceIndex];
        }

        if (!voice) {
          if (staffMeasure.voices.length === 0) {
            voice = { id: newId(), events: [] };
            staffMeasure.voices.push(voice);
          } else {
            voice = staffMeasure.voices[0];
          }
        }

        const targetIndex =
          params.index !== undefined && params.index >= 0 && params.index <= voice.events.length
            ? params.index
            : voice.events.length;

        voice.events.splice(targetIndex, 0, params.event);
      });
    },
  };
}

/**
 * Creates a command that deletes a score event by its unique ID.
 *
 * @param eventId - Identifier of the event to delete.
 * @returns An executable Command.
 */
export function deleteEvent(eventId: Id): Command {
  return {
    name: 'deleteEvent',
    apply(score: Score): Score {
      return produce(score, (draft) => {
        let deleted = false;
        for (const part of draft.parts) {
          for (const staff of part.staves) {
            for (const measureId of Object.keys(staff.measures)) {
              const staffMeasure = staff.measures[measureId];
              for (const voice of staffMeasure.voices) {
                const idx = voice.events.findIndex((ev: ScoreEvent) => ev.id === eventId);
                if (idx !== -1) {
                  voice.events.splice(idx, 1);
                  deleted = true;
                  break;
                }
              }
              if (deleted) break;
            }
            if (deleted) break;
          }
          if (deleted) break;
        }

        if (draft.overrides[eventId]) {
          delete draft.overrides[eventId];
        }
      });
    },
  };
}

/**
 * Creates a command that changes the pitches of a note event.
 *
 * @param eventId - Target note event ID.
 * @param pitches - New array of pitches.
 * @returns An executable Command.
 */
export function changePitch(eventId: Id, pitches: Pitch[]): Command {
  return {
    name: 'changePitch',
    apply(score: Score): Score {
      return produce(score, (draft) => {
        let updated = false;
        for (const part of draft.parts) {
          for (const staff of part.staves) {
            for (const measureId of Object.keys(staff.measures)) {
              const staffMeasure = staff.measures[measureId];
              for (const voice of staffMeasure.voices) {
                const event = voice.events.find((ev: ScoreEvent) => ev.id === eventId);
                if (event && event.kind === 'note') {
                  event.pitches = pitches.map((p) => ({ ...p }));
                  updated = true;
                  break;
                }
              }
              if (updated) break;
            }
            if (updated) break;
          }
          if (updated) break;
        }
      });
    },
  };
}

/**
 * Creates a command that updates the time signature of a measure definition.
 *
 * @param measureId - Target global measure ID.
 * @param timeSig - New time signature.
 * @returns An executable Command.
 */
export function setTimeSig(
  measureId: Id,
  timeSig: { num: number; den: number }
): Command {
  return {
    name: 'setTimeSig',
    apply(score: Score): Score {
      return produce(score, (draft) => {
        const measure = draft.measures.find((m) => m.id === measureId);
        if (measure) {
          measure.timeSig = { ...timeSig };
        }
      });
    },
  };
}

/**
 * Creates a command that sets or removes a manual visual layout override.
 *
 * @param elementId - ID of the target element.
 * @param override - Override values, or undefined to clear the override.
 * @returns An executable Command.
 */
export function setOverride(elementId: Id, override?: Override): Command {
  return {
    name: 'setOverride',
    apply(score: Score): Score {
      return produce(score, (draft) => {
        if (override === undefined) {
          delete draft.overrides[elementId];
        } else {
          draft.overrides[elementId] = {
            ...draft.overrides[elementId],
            ...override,
          };
        }
      });
    },
  };
}
