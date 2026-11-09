/**
 * Score layout engine producing deterministic LayoutResult structures.
 *
 * Implements single-staff automatic layout, horizontal spacing, accidentals,
 * chords with seconds displacement, ledger lines, stem directions, flags,
 * system wrapping, and manual override application.
 */

import { Clef, NoteEvent, Part, Score, ScoreEvent } from '../core/model';
import { PPQ } from '../core/time';
import { MeasureAccidentalTracker } from './accidentals';
import { getKeySignatureAccidentals } from './keySignature';
import { getLedgerLineYs, getStemDirection, pitchToStaffPosition, staffPositionToY } from './pitch';
import {
  LayoutItem,
  LayoutOptions,
  LayoutResult,
  LayoutStaff,
  LayoutSystem,
} from './types';

// Standard engraving dimensions in staff spaces
const NOTEHEAD_WIDTH = 1.18;
const STEM_LENGTH = 3.5;
const STEM_THICKNESS = 0.12;
const STAFF_LINE_THICKNESS = 0.13;
const LEDGER_EXTENSION = 0.4;
const LEDGER_THICKNESS = 0.16;
const BARLINE_THICKNESS = 0.16;
const THICK_BARLINE_THICKNESS = 0.5;

interface MeasureLayoutChunk {
  measureDefId: string;
  items: LayoutItem[];
  width: number;
}

/**
 * Computes the layout of a single staff in a score into wrapped systems.
 *
 * @param score - The score data to lay out.
 * @param options - Layout configuration (width, systemSpacing).
 * @returns Deterministic LayoutResult with coordinates in staff spaces.
 */
export function layoutScore(score: Score, options: LayoutOptions = {}): LayoutResult {
  const targetWidth = options.width ?? 70;
  const systemSpacing = options.systemSpacing ?? 10;
  const staffMarginTop = 4.0; // Room for ledger lines above top line

  const part: Part | undefined = score.parts[0];
  const staff = part?.staves[0];
  const clef: Clef = staff?.clef ?? { sign: 'G', line: 2 };

  // Helper to create clef items
  function createClefItems(startX: number, clefToUse: Clef): { items: LayoutItem[]; width: number } {
    const glyph = clefToUse.sign === 'F' ? 'fClef' : 'gClef';
    const y = clefToUse.sign === 'F' ? 1.0 : 3.0; // F line (line 2) or G line (line 4)
    return {
      items: [
        {
          id: `clef-${startX}`,
          kind: 'glyph',
          glyph,
          x: startX,
          y,
        },
      ],
      width: 2.8,
    };
  }

  // Helper to create key signature items
  function createKeySigItems(startX: number, keySig: number, clefToUse: Clef): { items: LayoutItem[]; width: number } {
    const accidentals = getKeySignatureAccidentals(keySig, clefToUse);
    if (accidentals.length === 0) {
      return { items: [], width: 0 };
    }
    const items: LayoutItem[] = [];
    let curX = startX;
    for (let i = 0; i < accidentals.length; i++) {
      const acc = accidentals[i];
      items.push({
        id: `keysig-${i}`,
        kind: 'glyph',
        glyph: acc.glyph,
        x: curX,
        y: acc.y,
      });
      curX += 1.1;
    }
    return { items, width: curX - startX + 0.4 };
  }

  // Helper to create time signature items
  function createTimeSigItems(startX: number, timeSig: { num: number; den: number }): { items: LayoutItem[]; width: number } {
    const items: LayoutItem[] = [];
    const numStr = timeSig.num.toString();
    const denStr = timeSig.den.toString();

    let curX = startX;
    for (let i = 0; i < numStr.length; i++) {
      items.push({
        id: `timesig-num-${i}`,
        kind: 'glyph',
        glyph: `timeSig${numStr[i]}`,
        x: curX,
        y: 1.0, // Centered on top half of staff
      });
      items.push({
        id: `timesig-den-${i}`,
        kind: 'glyph',
        glyph: `timeSig${denStr[i]}`,
        x: curX,
        y: 3.0, // Centered on bottom half of staff
      });
      curX += 1.4;
    }

    return { items, width: curX - startX + 0.8 };
  }

  // Lay out each measure sequentially into independent chunks
  const measureChunks: MeasureLayoutChunk[] = [];

  for (let mIdx = 0; mIdx < score.measures.length; mIdx++) {
    const mDef = score.measures[mIdx];
    const isFirstMeasure = mIdx === 0;
    const isLastMeasure = mIdx === score.measures.length - 1;
    const staffMeasure = staff?.measures[mDef.id];
    const events: ScoreEvent[] = staffMeasure?.voices[0]?.events ?? [];

    const tracker = new MeasureAccidentalTracker(mDef.keySig);
    const measureItems: LayoutItem[] = [];
    let relX = 0;

    // Time signature in first measure
    if (isFirstMeasure) {
      const tsLayout = createTimeSigItems(relX, mDef.timeSig);
      measureItems.push(...tsLayout.items);
      relX += tsLayout.width;
    }

    // Process events
    for (let eIdx = 0; eIdx < events.length; eIdx++) {
      const ev = events[eIdx];
      const durationFactor = ev.duration / PPQ;
      const eventWidth = 3.5 + durationFactor * 2.0;

      const eventCenterX = relX + 0.8;

      if (ev.kind === 'rest') {
        let restGlyph = 'restQuarter';
        let restY = 2.0; // Default center line

        switch (ev.baseType) {
          case 'whole':
            restGlyph = 'restWhole';
            restY = 1.0;
            break;
          case 'half':
            restGlyph = 'restHalf';
            restY = 2.0;
            break;
          case 'quarter':
            restGlyph = 'restQuarter';
            restY = 2.0;
            break;
          case 'eighth':
            restGlyph = 'rest8th';
            restY = 2.0;
            break;
          case '16th':
            restGlyph = 'rest16th';
            restY = 2.0;
            break;
          case '32nd':
            restGlyph = 'rest32nd';
            restY = 2.0;
            break;
        }

        measureItems.push({
          id: ev.id,
          kind: 'glyph',
          glyph: restGlyph,
          x: eventCenterX,
          y: restY,
        });

        // Rest dots
        if (ev.dots > 0) {
          for (let d = 0; d < ev.dots; d++) {
            measureItems.push({
              id: `${ev.id}-dot-${d}`,
              kind: 'glyph',
              glyph: 'augmentationDot',
              x: eventCenterX + 1.2 + d * 0.5,
              y: restY,
            });
          }
        }
      } else if (ev.kind === 'note') {
        const noteEv = ev as NoteEvent;
        // Sort pitches ascending by diatonic step position
        const sortedPitches = [...noteEv.pitches].sort((a, b) => {
          return pitchToStaffPosition(a, clef) - pitchToStaffPosition(b, clef);
        });

        const stepPositions = sortedPitches.map((p) => pitchToStaffPosition(p, clef));
        const meanStepPos =
          stepPositions.reduce((sum, sp) => sum + sp, 0) / (stepPositions.length || 1);
        const stemDir = getStemDirection(meanStepPos);

        // Notehead glyph selection
        let noteheadGlyph = 'noteheadBlack';
        if (ev.baseType === 'whole') {
          noteheadGlyph = 'noteheadWhole';
        } else if (ev.baseType === 'half') {
          noteheadGlyph = 'noteheadHalf';
        }

        // Chords: check for seconds displacement
        const isDisplaced: boolean[] = new Array(sortedPitches.length).fill(false);
        for (let pIdx = 1; pIdx < sortedPitches.length; pIdx++) {
          if (stepPositions[pIdx] - stepPositions[pIdx - 1] === 1) {
            // In a second:
            // Stem up: lower note normal, upper displaced right
            // Stem down: higher note normal, lower displaced left
            if (stemDir === 'up') {
              isDisplaced[pIdx] = true;
            } else {
              isDisplaced[pIdx - 1] = true;
            }
          }
        }

        // Accidentals
        let accidentalOffset = 0;
        for (let pIdx = 0; pIdx < sortedPitches.length; pIdx++) {
          const pitch = sortedPitches[pIdx];
          const accGlyph = tracker.processPitch(pitch);
          if (accGlyph) {
            const accY = staffPositionToY(stepPositions[pIdx]);
            measureItems.push({
              id: `${ev.id}-acc-${pIdx}`,
              kind: 'glyph',
              glyph: accGlyph,
              x: eventCenterX - 1.2,
              y: accY,
            });
            accidentalOffset = Math.max(accidentalOffset, 1.2);
          }
        }

        // Noteheads & Ledger lines
        for (let pIdx = 0; pIdx < sortedPitches.length; pIdx++) {
          const stepPos = stepPositions[pIdx];
          const noteY = staffPositionToY(stepPos);
          let noteX = eventCenterX;

          if (isDisplaced[pIdx]) {
            noteX += stemDir === 'up' ? NOTEHEAD_WIDTH : -NOTEHEAD_WIDTH;
          }

          measureItems.push({
            id: pIdx === 0 ? ev.id : `${ev.id}-pitch-${pIdx}`,
            kind: 'glyph',
            glyph: noteheadGlyph,
            x: noteX,
            y: noteY,
          });

          // Ledger lines
          const ledgerYs = getLedgerLineYs(stepPos);
          for (const lY of ledgerYs) {
            measureItems.push({
              id: `${ev.id}-ledger-${pIdx}-${lY}`,
              kind: 'line',
              x: noteX - LEDGER_EXTENSION,
              y: lY,
              x2: noteX + NOTEHEAD_WIDTH + LEDGER_EXTENSION,
              y2: lY,
              thickness: LEDGER_THICKNESS,
            });
          }

          // Augmentation dots
          if (ev.dots > 0) {
            // Note on line: dot goes in space above (y - 0.5); note on space: dot at y
            const dotY = stepPos % 2 === 0 ? noteY - 0.5 : noteY;
            const dotBaseX = noteX + NOTEHEAD_WIDTH + 0.3;
            for (let d = 0; d < ev.dots; d++) {
              measureItems.push({
                id: `${ev.id}-dot-${pIdx}-${d}`,
                kind: 'glyph',
                glyph: 'augmentationDot',
                x: dotBaseX + d * 0.4,
                y: dotY,
              });
            }
          }
        }

        // Stems & Flags (whole notes have no stems)
        if (ev.baseType !== 'whole') {
          const lowestStep = stepPositions[0];
          const highestStep = stepPositions[stepPositions.length - 1];

          let stemX = eventCenterX;
          let stemStartY = 0;
          let stemEndY = 0;

          if (stemDir === 'up') {
            stemX = eventCenterX + NOTEHEAD_WIDTH;
            stemStartY = staffPositionToY(lowestStep) - 0.168;
            stemEndY = staffPositionToY(highestStep) - STEM_LENGTH;
          } else {
            stemX = eventCenterX;
            stemStartY = staffPositionToY(highestStep) + 0.168;
            stemEndY = staffPositionToY(lowestStep) + STEM_LENGTH;
          }

          measureItems.push({
            id: `${ev.id}-stem`,
            kind: 'line',
            x: stemX,
            y: stemStartY,
            x2: stemX,
            y2: stemEndY,
            thickness: STEM_THICKNESS,
          });

          // Flags for eighth and shorter notes
          if (ev.baseType === 'eighth' || ev.baseType === '16th' || ev.baseType === '32nd') {
            let flagGlyph = '';
            if (ev.baseType === 'eighth') {
              flagGlyph = stemDir === 'up' ? 'flag8thUp' : 'flag8thDown';
            } else if (ev.baseType === '16th') {
              flagGlyph = stemDir === 'up' ? 'flag16thUp' : 'flag16thDown';
            } else if (ev.baseType === '32nd') {
              flagGlyph = stemDir === 'up' ? 'flag32ndUp' : 'flag32ndDown';
            }

            if (flagGlyph) {
              measureItems.push({
                id: `${ev.id}-flag`,
                kind: 'glyph',
                glyph: flagGlyph,
                x: stemX,
                y: stemEndY,
              });
            }
          }
        }
      }

      relX += eventWidth;
    }

    // Barline at end of measure
    const barlineX = relX + 0.6;
    if (isLastMeasure) {
      // Final barline: thin barline + thick barline
      measureItems.push({
        id: `barline-${mDef.id}-thin`,
        kind: 'line',
        x: barlineX,
        y: 0,
        x2: barlineX,
        y2: 4,
        thickness: BARLINE_THICKNESS,
      });
      measureItems.push({
        id: `barline-${mDef.id}-thick`,
        kind: 'line',
        x: barlineX + 0.4,
        y: 0,
        x2: barlineX + 0.4,
        y2: 4,
        thickness: THICK_BARLINE_THICKNESS,
      });
      relX = barlineX + 0.8;
    } else {
      // Single barline
      measureItems.push({
        id: `barline-${mDef.id}`,
        kind: 'line',
        x: barlineX,
        y: 0,
        x2: barlineX,
        y2: 4,
        thickness: BARLINE_THICKNESS,
      });
      relX = barlineX + 0.6;
    }

    measureChunks.push({
      measureDefId: mDef.id,
      items: measureItems,
      width: relX,
    });
  }

  // Pack measure chunks into systems with wrapping
  const systems: LayoutSystem[] = [];
  let currentSystemIndex = 0;
  let currentSystemItems: LayoutItem[] = [];
  let currentSystemX = 0;

  // Function to initialize a new system with clef, key signature, initial barline
  function startNewSystem(): number {
    currentSystemItems = [];
    let startX = 0;

    // Initial barline
    currentSystemItems.push({
      id: `sys-${currentSystemIndex}-start-barline`,
      kind: 'line',
      x: startX,
      y: 0,
      x2: startX,
      y2: 4,
      thickness: BARLINE_THICKNESS,
    });
    startX += 0.4;

    // Clef
    const clefLayout = createClefItems(startX, clef);
    currentSystemItems.push(...clefLayout.items);
    startX += clefLayout.width;

    // Key signature (from first measure or active)
    const initialKeySig = score.measures[0]?.keySig ?? 0;
    const keySigLayout = createKeySigItems(startX, initialKeySig, clef);
    currentSystemItems.push(...keySigLayout.items);
    startX += keySigLayout.width;

    return startX;
  }

  currentSystemX = startNewSystem();

  for (let mIdx = 0; mIdx < measureChunks.length; mIdx++) {
    const chunk = measureChunks[mIdx];

    // Check if adding this measure exceeds target width (and system already has at least one measure)
    if (mIdx > 0 && currentSystemX + chunk.width > targetWidth) {
      // Close current system
      const systemWidth = Math.max(currentSystemX, targetWidth);
      // Staff lines for current system
      for (let line = 0; line <= 4; line++) {
        currentSystemItems.unshift({
          id: `sys-${currentSystemIndex}-staffline-${line}`,
          kind: 'line',
          x: 0,
          y: line,
          x2: systemWidth,
          y2: line,
          thickness: STAFF_LINE_THICKNESS,
        });
      }

      const staffContainer: LayoutStaff = {
        id: `staff-${currentSystemIndex}`,
        y: staffMarginTop,
        items: currentSystemItems,
      };

      systems.push({
        index: currentSystemIndex,
        x: 0,
        y: currentSystemIndex * (systemSpacing + 4) + staffMarginTop,
        width: systemWidth,
        height: 6,
        staves: [staffContainer],
        items: [...currentSystemItems],
      });

      // Start new wrapped system
      currentSystemIndex++;
      currentSystemX = startNewSystem();
    }

    // Offset chunk items by currentSystemX and add to system
    for (const item of chunk.items) {
      currentSystemItems.push({
        ...item,
        x: item.x + currentSystemX,
        x2: item.x2 !== undefined ? item.x2 + currentSystemX : undefined,
      });
    }

    currentSystemX += chunk.width;
  }

  // Close the last system
  const finalSystemWidth = Math.max(currentSystemX, targetWidth);
  for (let line = 0; line <= 4; line++) {
    currentSystemItems.unshift({
      id: `sys-${currentSystemIndex}-staffline-${line}`,
      kind: 'line',
      x: 0,
      y: line,
      x2: finalSystemWidth,
      y2: line,
      thickness: STAFF_LINE_THICKNESS,
    });
  }

  const finalStaffContainer: LayoutStaff = {
    id: `staff-${currentSystemIndex}`,
    y: staffMarginTop,
    items: currentSystemItems,
  };

  systems.push({
    index: currentSystemIndex,
    x: 0,
    y: currentSystemIndex * (systemSpacing + 4) + staffMarginTop,
    width: finalSystemWidth,
    height: 6,
    staves: [finalStaffContainer],
    items: [...currentSystemItems],
  });

  // Apply visual overrides from score.overrides
  for (const sys of systems) {
    for (const item of sys.items) {
      const override = score.overrides[item.id];
      if (override) {
        if (override.dx !== undefined) {
          item.x += override.dx;
          if (item.x2 !== undefined) item.x2 += override.dx;
        }
        if (override.dy !== undefined) {
          item.y += override.dy;
          if (item.y2 !== undefined) item.y2 += override.dy;
        }
        if (override.scale !== undefined) {
          item.scale = override.scale;
        }
        if (override.hidden !== undefined) {
          item.hidden = override.hidden;
        }
      }
    }
  }

  // Flat list of all items across all systems
  const allItems = systems.flatMap((s) => s.items);

  return {
    width: targetWidth,
    height: systems.length * (systemSpacing + 4) + staffMarginTop + 4,
    systems,
    items: allItems,
  };
}
