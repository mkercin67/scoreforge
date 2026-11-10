/**
 * State management hook for ScoreForge editor.
 *
 * Encapsulates the Score data model, Command history stack, selection state,
 * and event metadata resolution.
 */

import { useCallback, useMemo, useState } from 'react';
import { Command, History } from '../core/commands';
import { NoteEvent, Pitch, Score, ScoreEvent } from '../core/model';
import { eventExists, nextEventId } from '../core/selection';
import { buildSampleScore } from './Demo';

export interface SelectedEventInfo {
  eventId: string;
  measureNumber: number;
  event: ScoreEvent;
  isNote: boolean;
  isChord: boolean;
  isRest: boolean;
  pitches: Pitch[];
  baseType: ScoreEvent['baseType'];
  dots: number;
}

export function useEditor(initialScore?: Score) {
  const [history] = useState<History>(() => new History(initialScore ?? buildSampleScore('G')));
  const [score, setScore] = useState<Score>(() => history.score);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const executeCommand = useCallback(
    (cmd: Command) => {
      const nextScore = history.do(cmd);
      setScore(nextScore);
    },
    [history]
  );

  const undo = useCallback(() => {
    const prevScore = history.undo();
    if (prevScore) {
      setScore(prevScore);
      setSelectedEventId((curr) => (curr && eventExists(prevScore, curr) ? curr : null));
    }
  }, [history]);

  const redo = useCallback(() => {
    const nextScore = history.redo();
    if (nextScore) {
      setScore(nextScore);
      setSelectedEventId((curr) => (curr && eventExists(nextScore, curr) ? curr : null));
    }
  }, [history]);

  const selectEvent = useCallback((id: string | null) => {
    setSelectedEventId(id);
  }, []);

  const selectNext = useCallback(
    (direction: 'prev' | 'next') => {
      const staffId = score.parts[0]?.staves[0]?.id;
      if (!staffId) return;
      const nextId = nextEventId(score, staffId, selectedEventId, direction);
      if (nextId) {
        setSelectedEventId(nextId);
      }
    },
    [score, selectedEventId]
  );

  // Locate the selected event and its measure index across the score
  const selectedEventInfo = useMemo<SelectedEventInfo | null>(() => {
    if (!selectedEventId) return null;

    const staff = score.parts[0]?.staves[0];
    if (!staff) return null;

    for (let mIdx = 0; mIdx < score.measures.length; mIdx++) {
      const mDef = score.measures[mIdx];
      const sm = staff.measures[mDef.id];
      if (!sm) continue;

      for (const voice of sm.voices) {
        const ev = voice.events.find((e) => e.id === selectedEventId);
        if (ev) {
          const isNote = ev.kind === 'note';
          const isRest = ev.kind === 'rest';
          const pitches = isNote ? (ev as NoteEvent).pitches : [];
          return {
            eventId: ev.id,
            measureNumber: mIdx + 1,
            event: ev,
            isNote,
            isChord: pitches.length > 1,
            isRest,
            pitches,
            baseType: ev.baseType,
            dots: ev.dots,
          };
        }
      }
    }

    return null;
  }, [score, selectedEventId]);

  return {
    score,
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
    executeCommand,
    undo,
    redo,
    selectedEventId,
    selectEvent,
    selectNext,
    selectedEventInfo,
  };
}
