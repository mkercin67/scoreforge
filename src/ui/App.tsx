/**
 * Main application shell for ScoreForge editor.
 *
 * Coordinates toolbar, score canvas, status bar, and physical keyboard interaction.
 */

import React, { useEffect } from 'react';
import { convertToRest, transposeEvent } from '../core/commands';
import { I18nProvider } from './i18n';
import { mapKeyEvent } from './keymap';
import { ScoreView } from './ScoreView';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { useEditor } from './useEditor';

const EditorShell: React.FC = () => {
  const {
    score,
    canUndo,
    canRedo,
    executeCommand,
    undo,
    redo,
    selectedEventId,
    selectEvent,
    selectNext,
    selectedEventInfo,
  } = useEditor();

  // Support visual verification states via query parameters
  const initializedRef = React.useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get('state');
    if (!stateParam || stateParam === 'initial') return;

    const staff = score.parts[0]?.staves[0];
    const firstNote = staff?.measures[score.measures[0]?.id]?.voices[0]?.events[0];
    if (!firstNote) return;

    if (stateParam === 'selected') {
      selectEvent(firstNote.id);
    } else if (stateParam === 'pitch_up') {
      selectEvent(firstNote.id);
      executeCommand(transposeEvent(firstNote.id, 1));
    } else if (stateParam === 'delete') {
      selectEvent(firstNote.id);
      executeCommand(convertToRest(firstNote.id));
    } else if (stateParam === 'undo') {
      selectEvent(firstNote.id);
      executeCommand(convertToRest(firstNote.id));
      undo();
    } else if (stateParam === 'lang_en') {
      selectEvent(firstNote.id);
    } else if (stateParam === 'letters') {
      selectEvent(firstNote.id);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing if user focuses an input or select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const action = mapKeyEvent(e);
      if (!action) return;

      e.preventDefault();

      switch (action) {
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'select-prev':
          selectNext('prev');
          break;
        case 'select-next':
          selectNext('next');
          break;
        case 'clear-selection':
          selectEvent(null);
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEventId, executeCommand, undo, redo, selectNext, selectEvent]);

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
      />
      <ScoreView
        score={score}
        selectedEventId={selectedEventId}
        onSelectEvent={selectEvent}
      />
      <StatusBar selection={selectedEventInfo} />
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
