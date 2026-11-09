import { describe, expect, it, vi } from 'vitest';
import { createPitch } from '../../src/core/factory';
import { formatPitchName } from '../../src/ui/i18n/formatPitch';
import trLocale from '../../src/ui/i18n/locales/tr.json';
import enLocale from '../../src/ui/i18n/locales/en.json';
import { translate } from '../../src/ui/i18n/context';

describe('i18n module', () => {
  describe('formatPitchName', () => {
    it('formats solfege and letter styles correctly for natural notes', () => {
      const c4 = createPitch('C', 4, 0);
      const a3 = createPitch('A', 3, 0);
      const b5 = createPitch('B', 5, 0);

      expect(formatPitchName(c4, 'solfege')).toBe('Do4');
      expect(formatPitchName(c4, 'letter')).toBe('C4');

      expect(formatPitchName(a3, 'solfege')).toBe('La3');
      expect(formatPitchName(a3, 'letter')).toBe('A3');

      expect(formatPitchName(b5, 'solfege')).toBe('Si5');
      expect(formatPitchName(b5, 'letter')).toBe('B5');
    });

    it('formats every accidental symbol correctly (-2, -1, 0, 1, 2)', () => {
      const fSharp = createPitch('F', 4, 1);
      const bFlat = createPitch('B', 3, -1);
      const fDoubleSharp = createPitch('F', 4, 2);
      const eDoubleFlat = createPitch('E', 4, -2);
      const gNatural = createPitch('G', 4, 0);

      expect(formatPitchName(fSharp, 'solfege')).toBe('Fa♯4');
      expect(formatPitchName(fSharp, 'letter')).toBe('F♯4');

      expect(formatPitchName(bFlat, 'solfege')).toBe('Si♭3');
      expect(formatPitchName(bFlat, 'letter')).toBe('B♭3');

      expect(formatPitchName(fDoubleSharp, 'solfege')).toBe('Fa𝄪4');
      expect(formatPitchName(fDoubleSharp, 'letter')).toBe('F𝄪4');

      expect(formatPitchName(eDoubleFlat, 'solfege')).toBe('Mi𝄫4');
      expect(formatPitchName(eDoubleFlat, 'letter')).toBe('E𝄫4');

      expect(formatPitchName(gNatural, 'solfege')).toBe('Sol4');
      expect(formatPitchName(gNatural, 'letter')).toBe('G4');
    });

    it('formats extreme octaves correctly', () => {
      const a0 = createPitch('A', 0, 0);
      const c8 = createPitch('C', 8, 0);

      expect(formatPitchName(a0, 'solfege')).toBe('La0');
      expect(formatPitchName(c8, 'letter')).toBe('C8');
    });

    it('handles non-integer microtonal alterations without crashing', () => {
      const quarterToneSharp = createPitch('C', 4, 0.5);
      const quarterToneFlat = createPitch('E', 4, -0.5);

      expect(formatPitchName(quarterToneSharp, 'solfege')).toBe('Do4 (+0.5)');
      expect(formatPitchName(quarterToneSharp, 'letter')).toBe('C4 (+0.5)');

      expect(formatPitchName(quarterToneFlat, 'solfege')).toBe('Mi4 (-0.5)');
      expect(formatPitchName(quarterToneFlat, 'letter')).toBe('E4 (-0.5)');
    });
  });

  describe('locale parity and fallback behavior', () => {
    it('tr.json and en.json key sets are identical', () => {
      const trKeys = Object.keys(trLocale).sort();
      const enKeys = Object.keys(enLocale).sort();

      expect(trKeys).toEqual(enKeys);
    });

    it('falls back to English when a key is missing in Turkish', () => {
      expect(translate('tr', 'toolbar.undo')).toBe('Geri Al');
      expect(translate('en', 'toolbar.undo')).toBe('Undo');
    });

    it('falls back to key and logs warning when key is missing completely', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = translate('tr', 'unknown.key.xyz');
      expect(result).toBe('unknown.key.xyz');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[i18n] Missing translation key: "unknown.key.xyz"')
      );

      warnSpy.mockRestore();
    });
  });
});
