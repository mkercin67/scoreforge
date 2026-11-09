import { describe, expect, it } from 'vitest';
import { Clef } from '../../src/core/model';
import {
  getLedgerLineYs,
  getStemDirection,
  pitchToStaffPosition,
  staffPositionToY,
} from '../../src/layout/pitch';

describe('pitchToStaffPosition and diatonic mapping', () => {
  const trebleClef: Clef = { sign: 'G', line: 2 };
  const bassClef: Clef = { sign: 'F', line: 4 };

  it('calculates pitchToStaffPosition for treble clef (bottom line E4 = 0)', () => {
    // E4 (bottom line)
    expect(pitchToStaffPosition({ step: 'E', octave: 4, alter: 0 }, trebleClef)).toBe(0);
    // G4 (line 2 from bottom)
    expect(pitchToStaffPosition({ step: 'G', octave: 4, alter: 0 }, trebleClef)).toBe(2);
    // B4 (middle line)
    expect(pitchToStaffPosition({ step: 'B', octave: 4, alter: 0 }, trebleClef)).toBe(4);
    // C5 (third space)
    expect(pitchToStaffPosition({ step: 'C', octave: 5, alter: 0 }, trebleClef)).toBe(5);
    // C4 (Middle C, 1 ledger line below)
    expect(pitchToStaffPosition({ step: 'C', octave: 4, alter: 0 }, trebleClef)).toBe(-2);
    // A5 (first ledger line above)
    expect(pitchToStaffPosition({ step: 'A', octave: 5, alter: 0 }, trebleClef)).toBe(10);
  });

  it('calculates pitchToStaffPosition for bass clef (bottom line G2 = 0)', () => {
    // G2 (bottom line)
    expect(pitchToStaffPosition({ step: 'G', octave: 2, alter: 0 }, bassClef)).toBe(0);
    // B2 (second line from bottom)
    expect(pitchToStaffPosition({ step: 'B', octave: 2, alter: 0 }, bassClef)).toBe(2);
    // D3 (middle line)
    expect(pitchToStaffPosition({ step: 'D', octave: 3, alter: 0 }, bassClef)).toBe(4);
    // C4 (Middle C, 1 ledger line above)
    expect(pitchToStaffPosition({ step: 'C', octave: 4, alter: 0 }, bassClef)).toBe(10);
  });

  it('verifies stem direction at the boundary pitch and around middle line', () => {
    // Middle line is step 4 (B4 in treble, D3 in bass)
    // Rule: Notes on or above middle line get stems down, notes below get stems up
    expect(getStemDirection(4)).toBe('down'); // Boundary pitch exactly on middle line
    expect(getStemDirection(5)).toBe('down'); // Above middle line
    expect(getStemDirection(3)).toBe('up'); // Below middle line
    expect(getStemDirection(0)).toBe('up'); // Bottom line
  });

  it('stem direction per pitch (G4 up, A4 up, B4 down, C5 down, D5 down)', () => {
    // Diatonic step positions relative to bottom line E4 (step 0):
    // G4 = step 2 (< 4) -> up
    // A4 = step 3 (< 4) -> up
    // B4 = step 4 (>= 4, middle line) -> down
    // C5 = step 5 (>= 4) -> down
    // D5 = step 6 (>= 4) -> down
    const g4Pos = pitchToStaffPosition({ step: 'G', octave: 4, alter: 0 }, trebleClef);
    const a4Pos = pitchToStaffPosition({ step: 'A', octave: 4, alter: 0 }, trebleClef);
    const b4Pos = pitchToStaffPosition({ step: 'B', octave: 4, alter: 0 }, trebleClef);
    const c5Pos = pitchToStaffPosition({ step: 'C', octave: 5, alter: 0 }, trebleClef);
    const d5Pos = pitchToStaffPosition({ step: 'D', octave: 5, alter: 0 }, trebleClef);

    expect(getStemDirection(g4Pos)).toBe('up');
    expect(getStemDirection(a4Pos)).toBe('up');
    expect(getStemDirection(b4Pos)).toBe('down');
    expect(getStemDirection(c5Pos)).toBe('down');
    expect(getStemDirection(d5Pos)).toBe('down');
  });

  it('computes correct number of ledger lines for several pitches', () => {
    // Inside the staff (no ledger lines)
    expect(getLedgerLineYs(0).length).toBe(0); // E4
    expect(getLedgerLineYs(4).length).toBe(0); // B4
    expect(getLedgerLineYs(8).length).toBe(0); // F5
    expect(getLedgerLineYs(-1).length).toBe(0); // D4 (space below bottom line)
    expect(getLedgerLineYs(9).length).toBe(0); // G5 (space above top line)

    // Below staff
    const c4Ledgers = getLedgerLineYs(-2); // C4: 1 ledger line below
    expect(c4Ledgers.length).toBe(1);
    expect(c4Ledgers[0]).toBe(staffPositionToY(-2)); // y = 5

    const b3Ledgers = getLedgerLineYs(-3); // B3: space below first ledger line
    expect(b3Ledgers.length).toBe(1);
    expect(b3Ledgers[0]).toBe(staffPositionToY(-2));

    const a3Ledgers = getLedgerLineYs(-4); // A3: 2 ledger lines below
    expect(a3Ledgers.length).toBe(2);
    expect(a3Ledgers).toEqual([staffPositionToY(-2), staffPositionToY(-4)]);

    // Above staff
    const a5Ledgers = getLedgerLineYs(10); // A5: 1 ledger line above
    expect(a5Ledgers.length).toBe(1);
    expect(a5Ledgers[0]).toBe(staffPositionToY(10)); // y = -1

    const b5Ledgers = getLedgerLineYs(11); // B5: space above first ledger line
    expect(b5Ledgers.length).toBe(1);
    expect(b5Ledgers[0]).toBe(staffPositionToY(10));

    const c6Ledgers = getLedgerLineYs(12); // C6: 2 ledger lines above
    expect(c6Ledgers.length).toBe(2);
    expect(c6Ledgers).toEqual([staffPositionToY(10), staffPositionToY(12)]);
  });
});
