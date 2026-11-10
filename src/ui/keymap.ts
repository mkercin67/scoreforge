/**
 * Physical keyboard shortcut mapping for ScoreForge editor.
 *
 * All mappings are based exclusively on physical key codes (event.code),
 * ensuring identical behavior across QWERTY, Turkish Q, AZERTY, etc.
 */

import { BaseDurationType, PitchStep } from '../core/model';

export type UserAction =
  | 'transpose-semitone-up'
  | 'transpose-semitone-down'
  | 'transpose-octave-up'
  | 'transpose-octave-down'
  | 'convert-to-rest'
  | 'select-prev'
  | 'select-next'
  | 'clear-selection'
  | 'undo'
  | 'redo'
  | 'toggle-note-input'
  | 'exit-note-input'
  | 'enter-rest'
  | 'toggle-dot'
  | 'show-input-off-hint'
  | { type: 'enter-pitch'; letter: PitchStep }
  | { type: 'set-duration'; baseType: BaseDurationType };

export interface KeyEventLike {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

const DIGIT_DURATIONS: Record<string, BaseDurationType> = {
  Digit2: '32nd',
  Digit3: '16th',
  Digit4: 'eighth',
  Digit5: 'quarter',
  Digit6: 'half',
  Digit7: 'whole',
};

const PITCH_LETTERS: Record<string, PitchStep> = {
  KeyC: 'C',
  KeyD: 'D',
  KeyE: 'E',
  KeyF: 'F',
  KeyG: 'G',
  KeyA: 'A',
  KeyB: 'B',
};

/**
 * Maps a physical keyboard event to a high-level editor action.
 *
 * @param e - Keyboard event or mock event containing code and modifier keys.
 * @param isInputMode - Whether the editor is currently in note-input mode.
 * @returns Recognized UserAction or null if unmapped.
 */
export function mapKeyEvent(e: KeyEventLike, isInputMode = false): UserAction | null {
  const isCmdOrCtrl = Boolean(e.ctrlKey || e.metaKey);
  const isShift = Boolean(e.shiftKey);
  const isAlt = Boolean(e.altKey);

  // Undo / Redo (Ctrl+Z / Ctrl+Y / Cmd+Z)
  if (isCmdOrCtrl && !isAlt) {
    if (e.code === 'KeyZ') {
      return isShift ? 'redo' : 'undo';
    }
    if (e.code === 'KeyY') {
      return 'redo';
    }
    // Octave transposition with Ctrl+ArrowUp / Down
    if (e.code === 'ArrowUp' && !isShift) {
      return 'transpose-octave-up';
    }
    if (e.code === 'ArrowDown' && !isShift) {
      return 'transpose-octave-down';
    }
    return null;
  }

  // If any modifier (Ctrl, Meta, Alt) is held, ignore all remaining keys
  if (isCmdOrCtrl || isAlt) {
    return null;
  }

  // KeyN toggles note-input mode
  if (e.code === 'KeyN' && !isShift) {
    return 'toggle-note-input';
  }

  // Escape exits note-input mode if active, else clears selection
  if (e.code === 'Escape') {
    return isInputMode ? 'exit-note-input' : 'clear-selection';
  }

  // Pitch keys KeyA..KeyG: only enter note when isInputMode is true; otherwise prompt hint
  if (PITCH_LETTERS[e.code] && !isShift) {
    if (!isInputMode) {
      return 'show-input-off-hint';
    }
    return { type: 'enter-pitch', letter: PITCH_LETTERS[e.code] };
  }

  // Digit0 enters a rest when isInputMode is true; otherwise prompt hint
  if (e.code === 'Digit0' && !isShift) {
    if (!isInputMode) {
      return 'show-input-off-hint';
    }
    return 'enter-rest';
  }

  // Duration selection keys Digit2..Digit7
  if (DIGIT_DURATIONS[e.code] && !isShift) {
    return { type: 'set-duration', baseType: DIGIT_DURATIONS[e.code] };
  }

  // Period toggles dot
  if (e.code === 'Period') {
    return 'toggle-dot';
  }

  // Navigation (ArrowLeft / ArrowRight)
  if (e.code === 'ArrowLeft' && !isShift) {
    return 'select-prev';
  }
  if (e.code === 'ArrowRight' && !isShift) {
    return 'select-next';
  }

  // Semitone transposition (ArrowUp / ArrowDown)
  if (e.code === 'ArrowUp' && !isShift) {
    return 'transpose-semitone-up';
  }
  if (e.code === 'ArrowDown' && !isShift) {
    return 'transpose-semitone-down';
  }

  // Rest conversion / Deletion
  if (e.code === 'Delete' || e.code === 'Backspace') {
    return 'convert-to-rest';
  }

  return null;
}
