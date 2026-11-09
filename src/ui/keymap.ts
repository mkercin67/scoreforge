/**
 * Physical keyboard shortcut mapping for ScoreForge editor.
 *
 * All mappings are based exclusively on physical key codes (event.code),
 * ensuring identical behavior across QWERTY, Turkish Q, AZERTY, etc.
 */

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
  | 'redo';

export interface KeyEventLike {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Maps a physical keyboard event to a high-level editor action.
 *
 * @param e - Keyboard event or mock event containing code and modifier keys.
 * @returns Recognized UserAction or null if unmapped.
 */
export function mapKeyEvent(e: KeyEventLike): UserAction | null {
  const isCmdOrCtrl = Boolean(e.ctrlKey || e.metaKey);
  const isShift = Boolean(e.shiftKey);
  const isAlt = Boolean(e.altKey);

  // Undo / Redo
  if (isCmdOrCtrl && !isAlt) {
    if (e.code === 'KeyZ') {
      return isShift ? 'redo' : 'undo';
    }
    if (e.code === 'KeyY') {
      return 'redo';
    }
  }

  // Navigation
  if (e.code === 'ArrowLeft' && !isCmdOrCtrl && !isAlt && !isShift) {
    return 'select-prev';
  }
  if (e.code === 'ArrowRight' && !isCmdOrCtrl && !isAlt && !isShift) {
    return 'select-next';
  }
  if (e.code === 'Escape') {
    return 'clear-selection';
  }

  // Transposition
  if (e.code === 'ArrowUp') {
    return isCmdOrCtrl ? 'transpose-octave-up' : 'transpose-semitone-up';
  }
  if (e.code === 'ArrowDown') {
    return isCmdOrCtrl ? 'transpose-octave-down' : 'transpose-semitone-down';
  }

  // Rest conversion / Deletion
  if (e.code === 'Delete' || e.code === 'Backspace') {
    return 'convert-to-rest';
  }

  return null;
}
