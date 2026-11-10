import { describe, expect, it } from 'vitest';
import { mapKeyEvent } from '../../src/ui/keymap';

describe('keymap', () => {
  it('maps ArrowUp and ArrowDown to semitone transposition', () => {
    expect(mapKeyEvent({ code: 'ArrowUp' })).toBe('transpose-semitone-up');
    expect(mapKeyEvent({ code: 'ArrowDown' })).toBe('transpose-semitone-down');
  });

  it('maps Ctrl/Cmd+ArrowUp and Ctrl/Cmd+ArrowDown to octave transposition', () => {
    expect(mapKeyEvent({ code: 'ArrowUp', ctrlKey: true })).toBe('transpose-octave-up');
    expect(mapKeyEvent({ code: 'ArrowUp', metaKey: true })).toBe('transpose-octave-up');

    expect(mapKeyEvent({ code: 'ArrowDown', ctrlKey: true })).toBe('transpose-octave-down');
    expect(mapKeyEvent({ code: 'ArrowDown', metaKey: true })).toBe('transpose-octave-down');
  });

  it('maps Delete and Backspace to convert-to-rest', () => {
    expect(mapKeyEvent({ code: 'Delete' })).toBe('convert-to-rest');
    expect(mapKeyEvent({ code: 'Backspace' })).toBe('convert-to-rest');
  });

  it('maps ArrowLeft and ArrowRight to previous and next navigation', () => {
    expect(mapKeyEvent({ code: 'ArrowLeft' })).toBe('select-prev');
    expect(mapKeyEvent({ code: 'ArrowRight' })).toBe('select-next');
  });

  it('maps Escape based on isInputMode', () => {
    expect(mapKeyEvent({ code: 'Escape' }, false)).toBe('clear-selection');
    expect(mapKeyEvent({ code: 'Escape' }, true)).toBe('exit-note-input');
  });

  it('maps Ctrl+Z and Ctrl+Shift+Z / Ctrl+Y to undo and redo, untouched by input keys', () => {
    expect(mapKeyEvent({ code: 'KeyZ', ctrlKey: true })).toBe('undo');
    expect(mapKeyEvent({ code: 'KeyZ', metaKey: true })).toBe('undo');

    expect(mapKeyEvent({ code: 'KeyZ', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(mapKeyEvent({ code: 'KeyY', ctrlKey: true })).toBe('redo');
    expect(mapKeyEvent({ code: 'KeyY', metaKey: true })).toBe('redo');
  });

  it('maps KeyN to toggle-note-input', () => {
    expect(mapKeyEvent({ code: 'KeyN' })).toBe('toggle-note-input');
    // Ignored when Ctrl is held
    expect(mapKeyEvent({ code: 'KeyN', ctrlKey: true })).toBeNull();
  });

  it('maps KeyA..KeyG to enter-pitch when isInputMode is true; prompts hint when false', () => {
    // When isInputMode is true: enters pitch
    expect(mapKeyEvent({ code: 'KeyA' }, true)).toEqual({ type: 'enter-pitch', letter: 'A' });
    expect(mapKeyEvent({ code: 'KeyB' }, true)).toEqual({ type: 'enter-pitch', letter: 'B' });
    expect(mapKeyEvent({ code: 'KeyC' }, true)).toEqual({ type: 'enter-pitch', letter: 'C' });
    expect(mapKeyEvent({ code: 'KeyD' }, true)).toEqual({ type: 'enter-pitch', letter: 'D' });
    expect(mapKeyEvent({ code: 'KeyE' }, true)).toEqual({ type: 'enter-pitch', letter: 'E' });
    expect(mapKeyEvent({ code: 'KeyF' }, true)).toEqual({ type: 'enter-pitch', letter: 'F' });
    expect(mapKeyEvent({ code: 'KeyG' }, true)).toEqual({ type: 'enter-pitch', letter: 'G' });

    // When isInputMode is false: returns 'show-input-off-hint'
    expect(mapKeyEvent({ code: 'KeyA' }, false)).toBe('show-input-off-hint');
    expect(mapKeyEvent({ code: 'KeyC' }, false)).toBe('show-input-off-hint');

    // Modifiers ignore note entry
    expect(mapKeyEvent({ code: 'KeyC', ctrlKey: true }, true)).toBeNull();
    expect(mapKeyEvent({ code: 'KeyC', altKey: true }, true)).toBeNull();
  });

  it('maps Digit0 to enter-rest when isInputMode is true; prompts hint when false', () => {
    expect(mapKeyEvent({ code: 'Digit0' }, true)).toBe('enter-rest');
    expect(mapKeyEvent({ code: 'Digit0' }, false)).toBe('show-input-off-hint');
    expect(mapKeyEvent({ code: 'Digit0', ctrlKey: true }, true)).toBeNull();
  });

  it('maps Digit2..Digit7 to set-duration', () => {
    expect(mapKeyEvent({ code: 'Digit2' })).toEqual({ type: 'set-duration', baseType: '32nd' });
    expect(mapKeyEvent({ code: 'Digit3' })).toEqual({ type: 'set-duration', baseType: '16th' });
    expect(mapKeyEvent({ code: 'Digit4' })).toEqual({ type: 'set-duration', baseType: 'eighth' });
    expect(mapKeyEvent({ code: 'Digit5' })).toEqual({ type: 'set-duration', baseType: 'quarter' });
    expect(mapKeyEvent({ code: 'Digit6' })).toEqual({ type: 'set-duration', baseType: 'half' });
    expect(mapKeyEvent({ code: 'Digit7' })).toEqual({ type: 'set-duration', baseType: 'whole' });
  });

  it('maps Period to toggle-dot', () => {
    expect(mapKeyEvent({ code: 'Period' })).toBe('toggle-dot');
  });

  it('returns null for unrecognized keys', () => {
    expect(mapKeyEvent({ code: 'Space' })).toBeNull();
    expect(mapKeyEvent({ code: 'Tab' })).toBeNull();
    expect(mapKeyEvent({ code: 'Digit1' })).toBeNull();
    expect(mapKeyEvent({ code: 'Digit8' })).toBeNull();
  });
});
