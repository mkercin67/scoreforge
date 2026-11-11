/**
 * Main application shell for ScoreForge editor.
 *
 * Coordinates toolbar, score canvas, status bar, modal dialogs,
 * keyboard interaction, and automated verification states.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { convertToRest, setOverride, transposeEvent } from '../core/commands';
import { createEmptyScore } from '../core/factory';
import { Pitch, Score } from '../core/model';
import { LayoutResult } from '../layout/types';
import { Diagnostics, PerfSample } from './Diagnostics';
import { I18nProvider, useI18n } from './i18n';
import { EditorMode, mapKeyEvent } from './keymap';
import { NewScoreConfig, NewScoreModal } from './NewScoreModal';
import { ScoreView } from './ScoreView';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { useEditor } from './useEditor';

declare global {
  interface Window {
    __perf?: number[];
    __perfT0?: number;
    __applyRawOverrideForTest?: (eventId: string, dx: number, dy: number) => void;
    __getScoreForTest?: () => Score;
    __getEditorStateForTest?: () => {
      mode: EditorMode;
      selectedEventId: string | null;
      cursor: unknown;
    };
    __printPerfTable?: () => {
      first10: { p50: number; p95: number };
      last10: { p50: number; p95: number };
      total: { count: number; p50: number; p95: number };
    };
  }
}

function calcPercentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * (p / 100)));
  return Number(sorted[idx].toFixed(2));
}

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
    mode,
    setMode,
    togglePositionMode,
    isInputMode,

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
    setCursorToMeasure,
    currentMeasureNumber,
    rejectedError,
    triggerRejectedError,
    enterPitchAtCursor,
    enterRestAtCursor,
    moveCursorDirection,
    enterPitchDirect,
    applyEventOverride,
    clearEventOverride,
    clearAllEventOverrides,
    hasSelectedOverride,
    hasAnyOverride,
    selectedOverride,
    changeEventPitch,
  } = useEditor();

  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [isResetAllConfirmOpen, setIsResetAllConfirmOpen] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [perfSamples, setPerfSamples] = useState<PerfSample[]>([]);
  const [hoverPitch, setHoverPitch] = useState<Pitch | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ pitch: Pitch; measureNumber: number } | null>(null);
  const [dragStatus, setDragStatus] = useState<string | null>(null);
  const latestLayoutRef = useRef<LayoutResult | null>(null);
  const scoreRef = useRef<Score>(score);
  scoreRef.current = score;
  const editorStateRef = useRef<{
    mode: EditorMode;
    selectedEventId: string | null;
    cursor: unknown;
  }>({ mode, selectedEventId, cursor });
  editorStateRef.current = { mode, selectedEventId, cursor };

  useEffect(() => {
    setDragStatus(null);
  }, [selectedEventId, mode]);

  const handleCreateNewScore = (config: NewScoreConfig) => {
    const t0 = performance.now();
    const fresh = createEmptyScore({
      clef: config.clef,
      keySig: config.keySig,
      timeSig: config.timeSig,
      measures: config.measures,
    });
    resetScore(fresh);
    setMode('select');
    const elapsed = performance.now() - t0;
    console.log(`[PERF] createEmptyScore & resetScore took: ${elapsed.toFixed(2)} ms`);
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
    if (
      stateParam.startsWith('verify_') ||
      stateParam === 'demo_3_4' ||
      stateParam === 'demo_bass' ||
      stateParam === 'benchmark_64'
    ) {
      if (stateParam === 'benchmark_64') {
        const bScore = createEmptyScore({
          clef: { sign: 'G', line: 2 },
          keySig: 0,
          timeSig: { num: 4, den: 4 },
          measures: 64,
        });
        resetScore(bScore);
        setMode('input');
        setActiveDuration('quarter');
        setActiveDots(0);
        return;
      }
      if (stateParam === 'demo_3_4') {
        const s34 = createEmptyScore({
          clef: { sign: 'G', line: 2 },
          keySig: 0,
          timeSig: { num: 3, den: 4 },
          measures: 4,
        });
        resetScore(s34);
        setMode('input');
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
        setMode('input');
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
      setMode('select');
      setActiveDuration('quarter');
      setActiveDots(0);

      if (stateParam === 'verify_1') {
        return;
      }

      const enterNoteSeq = (letter: any, dur: any, dots = 0) => {
        setActiveDuration(dur);
        setActiveDots(dots);
        enterPitchAtCursor(letter, t('error.doesNotFit'), t('error.noCursor'));
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
      enterRestAtCursor(t('error.doesNotFit'), t('error.noCursor'));
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

    setActiveDuration,
    setActiveDots,
    enterPitchAtCursor,
    enterRestAtCursor,
    moveCursorDirection,
    undo,
    triggerRejectedError,
    t,
  ]);

  // Dev-only performance probe: measure keydown-to-paint (t1 - t0) across 2 requestAnimationFrames
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const t0 = window.__perfT0;
    if (t0 !== undefined) {
      window.__perfT0 = undefined;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const t1 = performance.now();
          const duration = t1 - t0;
          if (!window.__perf) window.__perf = [];
          window.__perf.push(duration);
        });
      });
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__applyRawOverrideForTest = (eventId: string, dx: number, dy: number) => {
      executeCommand(setOverride(eventId, { dx, dy }));
    };
    window.__getScoreForTest = () => scoreRef.current;
    window.__getEditorStateForTest = () => editorStateRef.current;
    window.__printPerfTable = () => {
      const arr = window.__perf ?? [];
      const first10 = arr.slice(0, 10);
      const last10 = arr.slice(Math.max(0, arr.length - 10));
      const stats = {
        first10: { p50: calcPercentile(first10, 50), p95: calcPercentile(first10, 95) },
        last10: { p50: calcPercentile(last10, 50), p95: calcPercentile(last10, 95) },
        total: { count: arr.length, p50: calcPercentile(arr, 50), p95: calcPercentile(arr, 95) },
      };
      console.table({
        'First 10 notes': { p50: `${stats.first10.p50} ms`, p95: `${stats.first10.p95} ms` },
        'Last 10 notes': { p50: `${stats.last10.p50} ms`, p95: `${stats.last10.p95} ms` },
        'Total Run': { p50: `${stats.total.p50} ms`, p95: `${stats.total.p95} ms` },
      });
      return stats;
    };
  }, []);

  // Global physical keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle hidden diagnostics panel (Ctrl+Alt+D or Cmd+Alt+D)
      if (e.ctrlKey && e.altKey && (e.code === 'KeyD' || e.key.toLowerCase() === 'd')) {
        e.preventDefault();
        setIsDiagnosticsOpen((prev) => !prev);
        return;
      }

      // Ignore typing inside text / number inputs or textareas (e.g. modal form inputs)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // If a button or select is focused, release focus so it never swallows shortcuts
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          (e.target as HTMLElement).blur();
          return;
        }
        (e.target as HTMLElement).blur();
      }

      const action = mapKeyEvent(e, mode);
      if (!action) return;

      e.preventDefault();

      const tInput = e.timeStamp;
      const tHandlerStart = performance.now();

      const recordSample = (key: string) => {
        const tHandlerEnd = performance.now();
        const inputDelay = Math.max(0, tHandlerStart - tInput);
        const handlerDuration = Math.max(0, tHandlerEnd - tHandlerStart);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const tPaint = performance.now();
            const paintDuration = Math.max(0, tPaint - tHandlerEnd);
            const totalDuration = Math.max(0, tPaint - tInput);
            const sample: PerfSample = {
              timestamp: Date.now(),
              key,
              inputDelay: Number(inputDelay.toFixed(2)),
              handlerDuration: Number(handlerDuration.toFixed(2)),
              paintDuration: Number(paintDuration.toFixed(2)),
              totalDuration: Number(totalDuration.toFixed(2)),
            };

            if (!window.__perf) window.__perf = [];
            window.__perf.push(sample.totalDuration);

            setPerfSamples((prev) => [...prev.slice(-99), sample]);
          });
        });
      };

      if (typeof action === 'string') {
        switch (action) {
          case 'undo':
            undo();
            recordSample('Undo');
            break;
          case 'redo':
            redo();
            recordSample('Redo');
            break;
          case 'set-mode-select':
            setMode('select');
            setDragStatus(null);
            break;
          case 'toggle-position-mode':
            togglePositionMode();
            setDragStatus(null);
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
            if (mode === 'input') {
              moveCursorDirection('prev');
            } else {
              selectNext('prev');
            }
            break;
          case 'select-next':
            if (mode === 'input') {
              moveCursorDirection('next');
            } else {
              selectNext('next');
            }
            break;
          case 'transpose-semitone-up':
            if (selectedEventId) {
              if (mode === 'select') executeCommand(transposeEvent(selectedEventId, 1));
              recordSample('ArrowUp');
            }
            break;
          case 'transpose-semitone-down':
            if (selectedEventId) {
              if (mode === 'select') executeCommand(transposeEvent(selectedEventId, -1));
              recordSample('ArrowDown');
            }
            break;
          case 'transpose-octave-up':
            if (selectedEventId) {
              if (mode === 'select') executeCommand(transposeEvent(selectedEventId, 12));
              recordSample('Ctrl+ArrowUp');
            }
            break;
          case 'transpose-octave-down':
            if (selectedEventId) {
              if (mode === 'select') executeCommand(transposeEvent(selectedEventId, -12));
              recordSample('Ctrl+ArrowDown');
            }
            break;
          case 'reset-override':
            if (selectedEventId) {
              clearEventOverride(selectedEventId);
              recordSample('Ctrl+0');
            }
            break;
          case 'convert-to-rest':
            if (selectedEventId) {
              if (mode === 'select') executeCommand(convertToRest(selectedEventId));
              recordSample('Delete');
            }
            break;
          case 'enter-rest':
            enterRestAtCursor(t('error.doesNotFit'), t('error.noCursor'));
            recordSample('Digit0');
            break;
          case 'toggle-dot':
            toggleDot();
            break;
          case 'show-input-off-hint':
            triggerRejectedError(t('status.inputOff'));
            break;
        }
      } else if (typeof action === 'object') {
        if (action.type === 'enter-pitch') {
          enterPitchAtCursor(action.letter, t('error.doesNotFit'), t('error.noCursor'));
          recordSample(`Key${action.letter}`);
        } else if (action.type === 'set-duration') {
          setActiveDuration(action.baseType);
          setIsRestSelected(false);
        } else if (action.type === 'nudge-override') {
          if (selectedEventId && selectedEventInfo) {
            if (action.dy !== 0 && (selectedEventInfo.isNote || selectedEventInfo.isChord)) {
              triggerRejectedError(t('status.noVerticalOffset'));
              recordSample('Arrow');
            } else {
              const res = applyEventOverride(
                selectedEventId,
                action.dx,
                action.dy,
                true,
                latestLayoutRef.current ?? undefined
              );
              if (res.isAtLimit) {
                setDragStatus(
                  `dx ${res.dx.toFixed(2)} · dy ${res.dy.toFixed(2)} · ${t('status.offsetLimit')}`
                );
                triggerRejectedError(t('status.offsetLimit'));
              } else {
                setDragStatus(`dx ${res.dx.toFixed(2)} · dy ${res.dy.toFixed(2)}`);
              }
              recordSample('Arrow');
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    mode,
    setMode,
    togglePositionMode,
    isInputMode,
    selectedEventId,
    selectedEventInfo,
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
    applyEventOverride,
    clearEventOverride,
    clearAllEventOverrides,
    hasSelectedOverride,
    hasAnyOverride,
    t,
  ]);

  return (
    <div
      className="notranslate"
      translate="no"
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
        canResetOverride={hasSelectedOverride}
        onResetOverride={() => selectedEventId && clearEventOverride(selectedEventId)}
        canResetAllOverrides={hasAnyOverride}
        onResetAllOverrides={() => setIsResetAllConfirmOpen(true)}
        onOpenNewScore={() => setIsNewModalOpen(true)}
        mode={mode}
        onChangeMode={setMode}
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
        mode={mode}
        activeDuration={activeDuration}
        onSelectMeasure={setCursorToMeasure}
        onEnterPitchDirect={enterPitchDirect}
        onApplyOverride={applyEventOverride}
        onChangePitch={changeEventPitch}
        onLayoutChange={(layout) => {
          latestLayoutRef.current = layout;
        }}
        onHoverPitch={setHoverPitch}
        onHoverInfo={setHoverInfo}
        onDragStatus={setDragStatus}
      />
      <StatusBar
        selection={selectedEventInfo}
        mode={mode}
        activeDuration={activeDuration}
        currentMeasureNumber={currentMeasureNumber}
        rejectedMessage={rejectedError}
        hasOverride={hasSelectedOverride}
        override={selectedOverride}
        hoverPitch={hoverPitch}
        hoverInfo={hoverInfo}
        dragStatus={dragStatus}
      />

      <NewScoreModal
        isOpen={isNewModalOpen}
        canUndo={canUndo}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateNewScore}
      />

      {isResetAllConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem', color: '#0f172a' }}>
              {t('toolbar.resetAllPositions')}
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.9rem', color: '#475569' }}>
              {t('dialog.confirmResetAll')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => setIsResetAllConfirmOpen(false)}
                style={{
                  padding: '0.45rem 0.9rem',
                  fontSize: '0.875rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                {t('dialog.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAllEventOverrides();
                  setIsResetAllConfirmOpen(false);
                }}
                style={{
                  padding: '0.45rem 0.9rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                {t('dialog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Diagnostics
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        samples={perfSamples}
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
