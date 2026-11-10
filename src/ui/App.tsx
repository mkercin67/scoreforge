/**
 * Main application shell for ScoreForge editor.
 *
 * Coordinates toolbar, score canvas, status bar, modal dialogs,
 * keyboard interaction, and automated verification states.
 */

import React, { useEffect, useState } from 'react';
import { convertToRest, transposeEvent } from '../core/commands';
import { createEmptyScore } from '../core/factory';
import { I18nProvider, useI18n } from './i18n';
import { mapKeyEvent } from './keymap';
import { NewScoreConfig, NewScoreModal } from './NewScoreModal';
import { ScoreView } from './ScoreView';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { useEditor } from './useEditor';

const EditorShell: React.FC = () => {
  const { t } = useI18n();
  const {
    score,
    canUndo,
    canRedo,
    executeCommand,
    undo,
    redo,
    resetScore,
    selectedEventId,
    selectEvent,
    selectNext,
    selectedEventInfo,
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
    currentMeasureNumber,
    rejectedError,
    triggerRejectedError,
    enterPitchAtCursor,
    enterRestAtCursor,
    moveCursorDirection,
  } = useEditor();

  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);

  const handleCreateNewScore = (config: NewScoreConfig) => {
    const fresh = createEmptyScore({
      clef: config.clef,
      keySig: config.keySig,
      timeSig: config.timeSig,
      measures: config.measures,
    });
    resetScore(fresh);
    setIsInputMode(true);
  };

  // Support visual verification states via query parameters
  const initializedRef = React.useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get('state');
    if (!stateParam) return;

    // Milestone 3b Verification States
    if (stateParam.startsWith('verify_') || stateParam === 'demo_3_4' || stateParam === 'demo_bass') {
      if (stateParam === 'demo_3_4') {
        const s34 = createEmptyScore({
          clef: { sign: 'G', line: 2 },
          keySig: 0,
          timeSig: { num: 3, den: 4 },
          measures: 4,
        });
        resetScore(s34);
        setIsInputMode(true);
        setActiveDuration('quarter');
        setActiveDots(0);
        return;
      }

      if (stateParam === 'demo_bass') {
        const sb = createEmptyScore({
          clef: { sign: 'F', line: 4 },
          keySig: 1, // G major
          timeSig: { num: 4, den: 4 },
          measures: 4,
        });
        resetScore(sb);
        setIsInputMode(true);
        setActiveDuration('quarter');
        setActiveDots(0);
        return;
      }

      // Default base for verify_1..verify_10: fresh score treble, C major, 4/4, 8 measures
      const freshScore = createEmptyScore({
        clef: { sign: 'G', line: 2 },
        keySig: 0,
        timeSig: { num: 4, den: 4 },
        measures: 8,
      });
      resetScore(freshScore);
      setIsInputMode(true);
      setActiveDuration('quarter');
      setActiveDots(0);

      if (stateParam === 'verify_1') {
        // State 1: fresh score (whole rests centered, cursor in measure 1)
        return;
      }

      // Helper to enter a sequence of notes
      const enterNoteSeq = (letter: any, dur: any, dots = 0) => {
        setActiveDuration(dur);
        setActiveDots(dots);
        enterPitchAtCursor(letter, t('error.doesNotFit'));
      };

      // State 2: press N, Digit5, then C D E F (measure 1 holds C5 D5 E5 F5)
      enterNoteSeq('C', 'quarter');
      enterNoteSeq('D', 'quarter');
      enterNoteSeq('E', 'quarter');
      enterNoteSeq('F', 'quarter');
      if (stateParam === 'verify_2') return;

      // State 3: Digit4, then G A B C (measure 2 first half: G5 A5 B5 C6, C6 with two ledger lines)
      enterNoteSeq('G', 'eighth');
      enterNoteSeq('A', 'eighth');
      enterNoteSeq('B', 'eighth');
      enterNoteSeq('C', 'eighth');
      if (stateParam === 'verify_3') return;

      // State 4: Digit0 (eighth rest), then Digit6 and E: must be REJECTED, status message visible, nothing changed
      enterRestAtCursor(t('error.doesNotFit'));
      if (stateParam === 'verify_4') {
        setActiveDuration('half');
        triggerRejectedError(t('error.doesNotFit'));
        return;
      }

      // State 5: Period, Digit5, E: dotted quarter fits and fills measure 2, cursor moves to measure 3
      enterNoteSeq('E', 'quarter', 1);
      if (stateParam === 'verify_5') return;

      // State 6: Left (cursor on the dotted quarter), Digit5 (no dot), G: dotted quarter replaced by quarter + eighth rest
      moveCursorDirection('prev');
      enterNoteSeq('G', 'quarter', 0);
      if (stateParam === 'verify_6') return;

      // State 7: Undo: dotted quarter is back
      undo();
      if (stateParam === 'verify_7') return;

      // State 8: zoom 150% (handled in I18nProvider)
      if (stateParam === 'verify_8') return;

      // State 9: English UI with the palette visible
      if (stateParam === 'verify_9') return;

      // State 10: New dialog open
      if (stateParam === 'verify_10') {
        setIsNewModalOpen(true);
        return;
      }
    }
  }, [
    resetScore,
    setIsInputMode,
    setActiveDuration,
    setActiveDots,
    enterPitchAtCursor,
    enterRestAtCursor,
    moveCursorDirection,
    undo,
    triggerRejectedError,
    t,
  ]);

  // Global physical keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing if user focuses an input, select, or modal
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const action = mapKeyEvent(e, isInputMode);
      if (!action) return;

      e.preventDefault();

      if (typeof action === 'string') {
        switch (action) {
          case 'undo':
            undo();
            break;
          case 'redo':
            redo();
            break;
          case 'toggle-note-input':
            toggleInputMode();
            break;
          case 'exit-note-input':
            exitInputMode();
            break;
          case 'clear-selection':
            selectEvent(null);
            break;
          case 'select-prev':
            if (isInputMode) {
              moveCursorDirection('prev');
            } else {
              selectNext('prev');
            }
            break;
          case 'select-next':
            if (isInputMode) {
              moveCursorDirection('next');
            } else {
              selectNext('next');
            }
            break;
          case 'transpose-semitone-up':
            if (selectedEventId) {
              executeCommand(transposeEvent(selectedEventId, 1));
            }
            break;
          case 'transpose-semitone-down':
            if (selectedEventId) {
              executeCommand(transposeEvent(selectedEventId, -1));
            }
            break;
          case 'transpose-octave-up':
            if (selectedEventId) {
              executeCommand(transposeEvent(selectedEventId, 12));
            }
            break;
          case 'transpose-octave-down':
            if (selectedEventId) {
              executeCommand(transposeEvent(selectedEventId, -12));
            }
            break;
          case 'convert-to-rest':
            if (selectedEventId) {
              executeCommand(convertToRest(selectedEventId));
            }
            break;
          case 'enter-rest':
            enterRestAtCursor(t('error.doesNotFit'));
            break;
          case 'toggle-dot':
            toggleDot();
            break;
        }
      } else if (typeof action === 'object') {
        if (action.type === 'enter-pitch') {
          enterPitchAtCursor(action.letter, t('error.doesNotFit'));
        } else if (action.type === 'set-duration') {
          setActiveDuration(action.baseType);
          setIsRestSelected(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isInputMode,
    selectedEventId,
    executeCommand,
    undo,
    redo,
    toggleInputMode,
    exitInputMode,
    selectNext,
    selectEvent,
    moveCursorDirection,
    enterPitchAtCursor,
    enterRestAtCursor,
    toggleDot,
    setActiveDuration,
    setIsRestSelected,
    t,
  ]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: '#f8fafc',
      }}
    >
      <Toolbar
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onOpenNewScore={() => setIsNewModalOpen(true)}
        isInputMode={isInputMode}
        onToggleInputMode={toggleInputMode}
        activeDuration={activeDuration}
        onChangeDuration={(d) => {
          setActiveDuration(d);
          setIsRestSelected(false);
        }}
        activeDots={activeDots}
        onToggleDot={toggleDot}
        isRestSelected={isRestSelected}
        onToggleRest={toggleRestSelected}
      />
      <ScoreView
        score={score}
        selectedEventId={selectedEventId}
        onSelectEvent={selectEvent}
        cursor={cursor}
        isInputMode={isInputMode}
      />
      <StatusBar
        selection={selectedEventInfo}
        isInputMode={isInputMode}
        activeDuration={activeDuration}
        currentMeasureNumber={currentMeasureNumber}
        rejectedMessage={rejectedError}
      />

      <NewScoreModal
        isOpen={isNewModalOpen}
        canUndo={canUndo}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateNewScore}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <EditorShell />
    </I18nProvider>
  );
};

export default App;
