/**
 * State management hook for ScoreForge editor.
 *
 * Encapsulates the Score data model, Command history stack, explicit editor mode
 * ('select' | 'input' | 'position'), selection state, cursor positioning, and error timing.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Command, History, setOverride, clearOverride, clearAllOverrides, changePitch } from '../core/commands';
import {
  BaseDurationType,
  NoteEvent,
  Pitch,
  PitchStep,
  Score,
  ScoreEvent,
} from '../core/model';
import { eventExists, nextEventId } from '../core/selection';
import {
  advanceCursor,
  appendMeasure,
  enterNote,
  enterRest,
  getLastNotePitchBeforeCursor,
  moveCursor,
  pitchFromLetter,
  planEnter,
  ScoreCursor,
  snapCursor,
} from '../core/input';
import { durationTicks, measureTicks } from '../core/time';
import { newId } from '../core/factory';
import { buildSampleScore } from './Demo';
import { EditorMode } from './keymap';
import { layoutScore } from '../layout/layoutScore';
import { LayoutResult } from '../layout/types';
import { clampEventOverrideInLayout } from '../layout/mouse';

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
  const historyRef = useRef<History>(new History(initialScore ?? buildSampleScore('G')));
  const [score, setScore] = useState<Score>(() => historyRef.current.score);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Single source of truth for active editor mode
  const [mode, setModeState] = useState<EditorMode>('select');
  const isInputMode = mode === 'input';

  const [activeDuration, setActiveDuration] = useState<BaseDurationType>('quarter');
  const [activeDots, setActiveDots] = useState<number>(0);
  const [isRestSelected, setIsRestSelected] = useState<boolean>(false);

  const [cursor, setCursor] = useState<ScoreCursor | null>(() => {
    const sId = historyRef.current.score.parts[0]?.staves[0]?.id;
    const mId = historyRef.current.score.measures[0]?.id;
    const vId = historyRef.current.score.parts[0]?.staves[0]?.measures[mId]?.voices[0]?.id;
    if (sId && mId && vId) {
      return { staffId: sId, voiceId: vId, measureId: mId, tick: 0 };
    }
    return null;
  });

  const lastEnteredPitchRef = useRef<Pitch | null>(null);

  const [rejectedError, setRejectedError] = useState<string | null>(null);
  const errorTimerRef = useRef<number | null>(null);

  const triggerRejectedError = useCallback((msg: string) => {
    if (typeof window === 'undefined') return;
    if (errorTimerRef.current) {
      window.clearTimeout(errorTimerRef.current);
    }
    setRejectedError(msg);
    errorTimerRef.current = window.setTimeout(() => {
      setRejectedError(null);
      errorTimerRef.current = null;
    }, 2000);
  }, []);

  const resetScore = useCallback((newScore: Score) => {
    historyRef.current = new History(newScore);
    setScore(historyRef.current.score);
    setSelectedEventId(null);
    lastEnteredPitchRef.current = null;

    const sId = newScore.parts[0]?.staves[0]?.id;
    const mId = newScore.measures[0]?.id;
    const vId = newScore.parts[0]?.staves[0]?.measures[mId]?.voices[0]?.id;
    if (sId && mId && vId) {
      setCursor({ staffId: sId, voiceId: vId, measureId: mId, tick: 0 });
    } else {
      setCursor(null);
    }
  }, []);

  const executeCommand = useCallback((cmd: Command) => {
    const nextScore = historyRef.current.do(cmd);
    setScore(nextScore);
    return nextScore;
  }, []);

  const undo = useCallback(() => {
    const prevScore = historyRef.current.undo();
    if (prevScore) {
      setScore(prevScore);
      setSelectedEventId((curr) => (curr && eventExists(prevScore, curr) ? curr : null));
      setCursor((c) => {
        const nextC = c ? snapCursor(prevScore, c) : null;
        lastEnteredPitchRef.current = getLastNotePitchBeforeCursor(prevScore, nextC);
        return nextC;
      });
    }
  }, []);

  const redo = useCallback(() => {
    const nextScore = historyRef.current.redo();
    if (nextScore) {
      setScore(nextScore);
      setSelectedEventId((curr) => (curr && eventExists(nextScore, curr) ? curr : null));
      setCursor((c) => {
        const nextC = c ? snapCursor(nextScore, c) : null;
        lastEnteredPitchRef.current = getLastNotePitchBeforeCursor(nextScore, nextC);
        return nextC;
      });
    }
  }, []);

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

  // Set explicit mode ('select' | 'input' | 'position')
  const setMode = useCallback(
    (nextMode: EditorMode) => {
      setModeState(nextMode);
      if (nextMode === 'input') {
        setCursor((curr) => {
          if (curr) return curr;
          const sId = score.parts[0]?.staves[0]?.id;
          const mId = score.measures[0]?.id;
          const vId = score.parts[0]?.staves[0]?.measures[mId]?.voices[0]?.id;
          if (sId && mId && vId) {
            return { staffId: sId, voiceId: vId, measureId: mId, tick: 0 };
          }
          return null;
        });
      }
    },
    [score]
  );

  const setIsInputMode = useCallback(
    (val: boolean) => {
      setMode(val ? 'input' : 'select');
    },
    [setMode]
  );

  const toggleInputMode = useCallback(() => {
    setModeState((prev) => {
      const next: EditorMode = prev === 'input' ? 'select' : 'input';
      if (next === 'input') {
        setCursor((curr) => {
          if (curr) return curr;
          const sId = score.parts[0]?.staves[0]?.id;
          const mId = score.measures[0]?.id;
          const vId = score.parts[0]?.staves[0]?.measures[mId]?.voices[0]?.id;
          if (sId && mId && vId) {
            return { staffId: sId, voiceId: vId, measureId: mId, tick: 0 };
          }
          return null;
        });
      }
      return next;
    });
  }, [score]);

  const togglePositionMode = useCallback(() => {
    setModeState((prev) => (prev === 'position' ? 'select' : 'position'));
  }, []);

  const exitInputMode = useCallback(() => {
    setModeState('select');
  }, []);

  const toggleDot = useCallback(() => {
    setActiveDots((prev) => (prev > 0 ? 0 : 1));
  }, []);

  const toggleRestSelected = useCallback(() => {
    setIsRestSelected((prev) => !prev);
  }, []);

  // Enter a note with the keyboard
  const enterPitchAtCursor = useCallback(
    (letter: PitchStep, errorMsg: string, noCursorMsg?: string) => {
      if (mode !== 'input') return;
      if (!cursor) {
        triggerRejectedError(noCursorMsg ?? 'İmleç yok, bir ölçüye tıklayın');
        return;
      }

      const activeCursor = cursor;
      const mDef = score.measures.find((m) => m.id === activeCursor.measureId);
      if (!mDef) {
        triggerRejectedError(errorMsg);
        return;
      }

      const part = score.parts.find((p) => p.staves.some((s) => s.id === activeCursor.staffId));
      const staff = part?.staves.find((s) => s.id === activeCursor.staffId);
      const clef = staff?.clef ?? { sign: 'G' as const, line: 2 };
      const keySig = mDef.keySig;

      // Determine previous pitch reference: LAST ENTERED note, or note before cursor
      const refPitch =
        lastEnteredPitchRef.current ?? getLastNotePitchBeforeCursor(score, activeCursor);

      const pitch = pitchFromLetter(letter, refPitch, clef, keySig);
      const eventId = newId();

      const plan = planEnter(score, activeCursor, {
        kind: 'note',
        baseType: activeDuration,
        dots: activeDots,
        pitch,
        eventId,
      });

      if (!plan.ok) {
        triggerRejectedError(errorMsg);
        return;
      }

      const duration = durationTicks(activeDuration, activeDots);
      const mIdx = score.measures.findIndex((m) => m.id === activeCursor.measureId);
      const mLength = measureTicks(mDef.timeSig);
      const isLastMeasure = mIdx === score.measures.length - 1;
      const willFinishMeasure = activeCursor.tick + duration >= mLength;

      if (isLastMeasure && willFinishMeasure) {
        historyRef.current.do(appendMeasure());
      }

      const nextScore = historyRef.current.do(
        enterNote(activeCursor, {
          baseType: activeDuration,
          dots: activeDots,
          pitch,
          eventId,
        })
      );

      setScore(nextScore);
      setSelectedEventId(eventId);
      lastEnteredPitchRef.current = pitch;

      const nextCursor = advanceCursor(nextScore, activeCursor, duration);
      setCursor(nextCursor);
    },
    [mode, cursor, score, activeDuration, activeDots, triggerRejectedError]
  );

  const enterPitchDirect = useCallback(
    (pitch: Pitch, customCursor?: ScoreCursor, errorMsg = 'Nota ölçüye sığmıyor') => {
      if (mode !== 'input') return;
      const targetC = customCursor ?? cursor;
      if (!targetC) {
        triggerRejectedError('İmleç yok, bir ölçüye tıklayın');
        return;
      }

      const activeCursor = snapCursor(score, targetC);
      const mDef = score.measures.find((m) => m.id === activeCursor.measureId);
      if (!mDef) return;

      const eventId = newId();
      const plan = planEnter(score, activeCursor, {
        kind: 'note',
        baseType: activeDuration,
        dots: activeDots,
        pitch,
        eventId,
      });

      if (!plan.ok) {
        triggerRejectedError(errorMsg);
        return;
      }

      const duration = durationTicks(activeDuration, activeDots);
      const mIdx = score.measures.findIndex((m) => m.id === activeCursor.measureId);
      const mLength = measureTicks(mDef.timeSig);
      const isLastMeasure = mIdx === score.measures.length - 1;
      const willFinishMeasure = activeCursor.tick + duration >= mLength;

      if (isLastMeasure && willFinishMeasure) {
        historyRef.current.do(appendMeasure());
      }

      const nextScore = historyRef.current.do(
        enterNote(activeCursor, {
          baseType: activeDuration,
          dots: activeDots,
          pitch,
          eventId,
        })
      );

      setScore(nextScore);
      setSelectedEventId(eventId);
      lastEnteredPitchRef.current = pitch;

      const nextCursor = advanceCursor(nextScore, activeCursor, duration);
      setCursor(nextCursor);
    },
    [mode, cursor, score, activeDuration, activeDots, triggerRejectedError]
  );

  const applyEventOverride = useCallback(
    (
      eventId: string,
      dx: number,
      dy: number,
      accumulate = true,
      layoutArg?: LayoutResult
    ): { dx: number; dy: number; isAtLimit: boolean; isRest: boolean } => {
      const currScore = historyRef.current.score;
      const existing = currScore.overrides[eventId];
      const targetDx = accumulate ? (existing?.dx ?? 0) + dx : dx;
      const targetDy = accumulate ? (existing?.dy ?? 0) + dy : dy;
      const activeLayout = layoutArg ?? layoutScore(currScore, { width: 70 });
      const clamped = clampEventOverrideInLayout(activeLayout, currScore, eventId, targetDx, targetDy);

      const nextScore = historyRef.current.do(
        setOverride(eventId, { dx: clamped.dx, dy: clamped.dy }, false)
      );
      setScore(nextScore);
      return clamped;
    },
    []
  );

  const changeEventPitch = useCallback((eventId: string, pitches: Pitch[]) => {
    const nextScore = historyRef.current.do(changePitch(eventId, pitches));
    setScore(nextScore);
  }, []);

  const clearEventOverride = useCallback(
    (eventId?: string) => {
      const targetId = eventId ?? selectedEventId;
      if (!targetId) return;
      const nextScore = historyRef.current.do(clearOverride(targetId));
      setScore(nextScore);
    },
    [selectedEventId]
  );

  const clearAllEventOverrides = useCallback(() => {
    const nextScore = historyRef.current.do(clearAllOverrides());
    setScore(nextScore);
  }, []);

  const enterRestAtCursor = useCallback(
    (errorMsg: string, noCursorMsg?: string) => {
      if (mode !== 'input') return;
      if (!cursor) {
        triggerRejectedError(noCursorMsg ?? 'İmleç yok, bir ölçüye tıklayın');
        return;
      }

      const activeCursor = cursor;
      const mDef = score.measures.find((m) => m.id === activeCursor.measureId);
      if (!mDef) {
        triggerRejectedError(errorMsg);
        return;
      }

      const eventId = newId();
      const plan = planEnter(score, activeCursor, {
        kind: 'rest',
        baseType: activeDuration,
        dots: activeDots,
        eventId,
      });

      if (!plan.ok) {
        triggerRejectedError(errorMsg);
        return;
      }

      const duration = durationTicks(activeDuration, activeDots);
      const mIdx = score.measures.findIndex((m) => m.id === activeCursor.measureId);
      const mLength = measureTicks(mDef.timeSig);
      const isLastMeasure = mIdx === score.measures.length - 1;
      const willFinishMeasure = activeCursor.tick + duration >= mLength;

      if (isLastMeasure && willFinishMeasure) {
        historyRef.current.do(appendMeasure());
      }

      const nextScore = historyRef.current.do(
        enterRest(activeCursor, {
          baseType: activeDuration,
          dots: activeDots,
          eventId,
        })
      );

      setScore(nextScore);
      setSelectedEventId(eventId);

      const nextCursor = advanceCursor(nextScore, activeCursor, duration);
      setCursor(nextCursor);
    },
    [mode, cursor, score, activeDuration, activeDots, triggerRejectedError]
  );

  const moveCursorDirection = useCallback(
    (direction: 'prev' | 'next') => {
      if (!cursor) return;
      const nextCursor = moveCursor(score, cursor, direction);
      setCursor(nextCursor);
      lastEnteredPitchRef.current = getLastNotePitchBeforeCursor(score, nextCursor);

      const staff = score.parts[0]?.staves.find((s) => s.id === nextCursor.staffId);
      const sm = staff?.measures[nextCursor.measureId];
      const voice = sm?.voices.find((v) => v.id === nextCursor.voiceId) ?? sm?.voices[0];
      if (voice) {
        let t = 0;
        for (const ev of voice.events) {
          if (t === nextCursor.tick) {
            setSelectedEventId(ev.id);
            break;
          }
          t += ev.duration;
        }
      }
    },
    [cursor, score]
  );

  // Set cursor to a specific measure (e.g. on click)
  const setCursorToMeasure = useCallback(
    (measureId: string, tick = 0) => {
      const sId = score.parts[0]?.staves[0]?.id;
      const staff = score.parts[0]?.staves[0];
      const sm = staff?.measures[measureId];
      const vId = sm?.voices[0]?.id;
      if (sId && vId) {
        const nextC = { staffId: sId, voiceId: vId, measureId, tick };
        setCursor(nextC);
        lastEnteredPitchRef.current = getLastNotePitchBeforeCursor(score, nextC);
      }
    },
    [score]
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

  const currentMeasureNumber = useMemo(() => {
    if (!cursor) return 1;
    const idx = score.measures.findIndex((m) => m.id === cursor.measureId);
    return idx >= 0 ? idx + 1 : 1;
  }, [score, cursor]);

  return {
    score,
    canUndo: historyRef.current.canUndo(),
    canRedo: historyRef.current.canRedo(),
    executeCommand,
    undo,
    redo,
    resetScore,
    selectedEventId,
    selectEvent,
    selectNext,
    selectedEventInfo,
    mode,
    setMode,
    togglePositionMode,
    isInputMode,
    setIsInputMode,
    toggleInputMode,
    exitInputMode,
    activeDuration,
    setActiveDuration,
    activeDots,
    setActiveDots,
    toggleDot,
    isRestSelected,
    setIsRestSelected,
    toggleRestSelected,
    cursor,
    setCursor,
    setCursorToMeasure,
    currentMeasureNumber,
    rejectedError,
    triggerRejectedError,
    enterPitchAtCursor,
    enterPitchDirect,
    applyEventOverride,
    clearEventOverride,
    hasSelectedOverride: Boolean(selectedEventId && score.overrides[selectedEventId]),
    hasAnyOverride: Object.keys(score.overrides || {}).length > 0,
    clearAllEventOverrides,
    selectedOverride: selectedEventId ? score.overrides[selectedEventId] : undefined,
    changeEventPitch,
    enterRestAtCursor,
    moveCursorDirection,
  };
}
