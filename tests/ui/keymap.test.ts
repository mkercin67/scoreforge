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

  it('maps ArrowLeft and ArrowRight to previous and next selection', () => {
    expect(mapKeyEvent({ code: 'ArrowLeft' })).toBe('select-prev');
    expect(mapKeyEvent({ code: 'ArrowRight' })).toBe('select-next');
  });

  it('maps Escape to clear-selection', () => {
    expect(mapKeyEvent({ code: 'Escape' })).toBe('clear-selection');
  });

  it('maps Ctrl+Z and Ctrl+Shift+Z / Ctrl+Y to undo and redo', () => {
    expect(mapKeyEvent({ code: 'KeyZ', ctrlKey: true })).toBe('undo');
    expect(mapKeyEvent({ code: 'KeyZ', metaKey: true })).toBe('undo');

    expect(mapKeyEvent({ code: 'KeyZ', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(mapKeyEvent({ code: 'KeyY', ctrlKey: true })).toBe('redo');
    expect(mapKeyEvent({ code: 'KeyY', metaKey: true })).toBe('redo');
  });

  it('returns null for unrecognized keys', () => {
    expect(mapKeyEvent({ code: 'KeyA' })).toBeNull();
    expect(mapKeyEvent({ code: 'Space' })).toBeNull();
    expect(mapKeyEvent({ code: 'Tab' })).toBeNull();
  });
});
