/**
 * Score layout engine producing deterministic LayoutResult structures.
 *
 * Implements single-staff automatic layout, horizontal spacing, accidentals,
 * chords with seconds displacement, ledger lines, stem directions, flags,
 * system wrapping, non-last system justification, and manual visual overrides.
 */

import {
  Clef,
  MeasureDef,
  NoteEvent,
  Part,
  RestEvent,
  Score,
  ScoreEvent,
  StaffMeasure,
} from '../core/model';
import { PPQ } from '../core/time';
import { MeasureAccidentalTracker } from './accidentals';
import { getKeySignatureAccidentals, getKeySignatureAlter } from './keySignature';
import { getLedgerLineYs, getStemDirection, pitchToStaffPosition, staffPositionToY } from './pitch';
import {
  LayoutItem,
  LayoutOptions,
  LayoutResult,
  LayoutStaff,
  LayoutSystem,
} from './types';

// Standard engraving dimensions in staff spaces
export const NOTEHEAD_WIDTH = 1.18;
export const STEM_LENGTH = 3.5;
export const STEM_THICKNESS = 0.12;
export const STAFF_LINE_THICKNESS = 0.13;
export const LEDGER_EXTENSION = 0.4;
export const LEDGER_THICKNESS = 0.16;
export const BARLINE_THICKNESS = 0.16;
export const THICK_BARLINE_THICKNESS = 0.5;

/**
 * Returns estimated layout width for a single item in staff spaces.
 */
export function getItemWidth(item: LayoutItem): number {
  if (item.kind === 'line') {
    if (item.x2 !== undefined) {
      return Math.max(0, item.x2 - item.x);
    }
    return item.thickness ?? BARLINE_THICKNESS;
  }
  if (item.kind === 'glyph' && item.glyph) {
    if (item.glyph === 'gClef' || item.glyph === 'fClef') return 2.8;
    if (item.glyph === 'noteheadWhole') return 1.5;
    if (item.glyph.startsWith('notehead')) return NOTEHEAD_WIDTH;
    if (item.glyph.startsWith('accidental')) return 1.0;
    if (item.glyph.startsWith('timeSig')) return 1.2;
    if (item.glyph.startsWith('flag')) return 1.2;
    if (item.glyph.startsWith('rest')) return 1.2;
    if (item.glyph === 'augmentationDot') return 0.5;
    return 1.0;
  }
  return 1.0;
}

interface MeasureItemEntry {
  item: LayoutItem;
  /** If this item is a ledger line attached to a note, relative offset to note center */
  ledgerNoteRelativeX?: number;
}

export interface MeasureLayoutChunk {
  measureDefId: string;
  items: MeasureItemEntry[];
  naturalWidth: number;
  barlineItemIndex: number;
}

export const measureLayoutCacheStats = {
  calls: 0,
  hits: 0,
  misses: 0,
  reset() {
    this.calls = 0;
    this.hits = 0;
    this.misses = 0;
  },
};

const measureChunkCache = new WeakMap<StaffMeasure, Map<string, MeasureLayoutChunk>>();

function createTimeSigItems(
  startX: number,
  timeSig: { num: number; den: number }
): { items: LayoutItem[]; width: number } {
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
      y: 1.0,
    });
    items.push({
      id: `timesig-den-${i}`,
      kind: 'glyph',
      glyph: `timeSig${denStr[i]}`,
      x: curX,
      y: 3.0,
    });
    curX += 1.4;
  }

  return { items, width: curX - startX + 0.8 };
}

/**
 * Computes natural layout items and natural width for a single measure.
 * Uses a WeakMap cache keyed by the StaffMeasure reference for O(1) retrieval of unchanged measures.
 */
export function layoutSingleMeasure(
  staffMeasure: StaffMeasure | undefined,
  mDef: MeasureDef,
  clef: Clef,
  isFirstMeasure: boolean,
  isLastMeasure: boolean
): MeasureLayoutChunk {
  measureLayoutCacheStats.calls++;

  const cacheKey = `${mDef.id}_${mDef.keySig}_${mDef.timeSig.num}/${mDef.timeSig.den}_${clef.sign}${clef.line}_${isFirstMeasure}_${isLastMeasure}`;

  if (staffMeasure) {
    const existing = measureChunkCache.get(staffMeasure);
    if (existing && existing.has(cacheKey)) {
      measureLayoutCacheStats.hits++;
      return existing.get(cacheKey)!;
    }
  }

  measureLayoutCacheStats.misses++;

  const events: ScoreEvent[] = staffMeasure?.voices[0]?.events ?? [];
  const tracker = new MeasureAccidentalTracker(mDef.keySig);
  const measureItems: MeasureItemEntry[] = [];
  let relX = 0;

  // Time signature in first measure
  if (isFirstMeasure) {
    const tsLayout = createTimeSigItems(relX, mDef.timeSig);
    for (const item of tsLayout.items) {
      measureItems.push({ item });
    }
    relX += tsLayout.width;
  }

  // Process events
  for (let eIdx = 0; eIdx < events.length; eIdx++) {
    const ev = events[eIdx];
    const isWholeMeasureRest = ev.kind === 'rest' && Boolean((ev as RestEvent).wholeMeasure);
    const durationFactor = ev.duration / PPQ;
    const eventWidth = isWholeMeasureRest ? 8.0 : 3.5 + durationFactor * 2.0;

    let firstEventAccidentalPadding = 0;
    if (eIdx === 0 && ev.kind === 'note') {
      const noteEv = ev as NoteEvent;
      const hasAccidental = noteEv.pitches.some((p) => {
        const activeAlter = getKeySignatureAlter(p.step, mDef.keySig);
        return (
          p.alter !== activeAlter &&
          Number.isInteger(p.alter) &&
          p.alter >= -2 &&
          p.alter <= 2
        );
      });
      if (hasAccidental) {
        firstEventAccidentalPadding = 1.2;
      }
    }

    const eventCenterX = isWholeMeasureRest
      ? relX + eventWidth / 2 - 0.7
      : relX + 0.8 + firstEventAccidentalPadding;

    if (ev.kind === 'rest') {
      let restGlyph = 'restQuarter';
      let restY = 2.0;

      if (isWholeMeasureRest) {
        restGlyph = 'restWhole';
        restY = 1.0;
      } else {
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
      }

      measureItems.push({
        item: {
          id: ev.id,
          eventId: ev.id,
          kind: 'glyph',
          glyph: restGlyph,
          x: eventCenterX,
          y: restY,
        },
      });

      if (ev.dots > 0) {
        for (let d = 0; d < ev.dots; d++) {
          measureItems.push({
            item: {
              id: `${ev.id}-dot-${d}`,
              eventId: ev.id,
              kind: 'glyph',
              glyph: 'augmentationDot',
              x: eventCenterX + 1.2 + d * 0.5,
              y: restY,
            },
          });
        }
      }
    } else if (ev.kind === 'note') {
      const noteEv = ev as NoteEvent;
      const sortedPitches = [...noteEv.pitches].sort((a, b) => {
        return pitchToStaffPosition(a, clef) - pitchToStaffPosition(b, clef);
      });

      const stepPositions = sortedPitches.map((p) => pitchToStaffPosition(p, clef));
      const meanStepPos =
        stepPositions.reduce((sum, sp) => sum + sp, 0) / (stepPositions.length || 1);
      const stemDir = getStemDirection(meanStepPos);

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
          if (stemDir === 'up') {
            isDisplaced[pIdx] = true;
          } else {
            isDisplaced[pIdx - 1] = true;
          }
        }
      }

      // Accidentals
      for (let pIdx = 0; pIdx < sortedPitches.length; pIdx++) {
        const pitch = sortedPitches[pIdx];
        const accGlyph = tracker.processPitch(pitch);
        if (accGlyph) {
          const accY = staffPositionToY(stepPositions[pIdx]);
          measureItems.push({
            item: {
              id: `${ev.id}-acc-${pIdx}`,
              eventId: ev.id,
              kind: 'glyph',
              glyph: accGlyph,
              x: eventCenterX - 1.2,
              y: accY,
            },
          });
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
          item: {
            id: pIdx === 0 ? ev.id : `${ev.id}-pitch-${pIdx}`,
            eventId: ev.id,
            kind: 'glyph',
            glyph: noteheadGlyph,
            x: noteX,
            y: noteY,
          },
        });

        const ledgerYs = getLedgerLineYs(stepPos);
        for (const lY of ledgerYs) {
          measureItems.push({
            item: {
              id: `${ev.id}-ledger-${pIdx}-${lY}`,
              eventId: ev.id,
              kind: 'line',
              x: noteX - LEDGER_EXTENSION,
              y: lY,
              x2: noteX + NOTEHEAD_WIDTH + LEDGER_EXTENSION,
              y2: lY,
              thickness: LEDGER_THICKNESS,
            },
            ledgerNoteRelativeX: noteX,
          });
        }

        if (ev.dots > 0) {
          const dotY = stepPos % 2 === 0 ? noteY - 0.5 : noteY;
          const dotBaseX = noteX + NOTEHEAD_WIDTH + 0.3;
          for (let d = 0; d < ev.dots; d++) {
            measureItems.push({
              item: {
                id: `${ev.id}-dot-${pIdx}-${d}`,
                eventId: ev.id,
                kind: 'glyph',
                glyph: 'augmentationDot',
                x: dotBaseX + d * 0.4,
                y: dotY,
              },
            });
          }
        }
      }

      // Stems & Flags
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
          item: {
            id: `${ev.id}-stem`,
            eventId: ev.id,
            kind: 'line',
            x: stemX,
            y: stemStartY,
            x2: stemX,
            y2: stemEndY,
            thickness: STEM_THICKNESS,
          },
        });

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
              item: {
                id: `${ev.id}-flag`,
                eventId: ev.id,
                kind: 'glyph',
                glyph: flagGlyph,
                x: stemX,
                y: stemEndY,
              },
            });
          }
        }
      }
    }

    relX += eventWidth + firstEventAccidentalPadding;
  }

  // Barline at end of measure
  const barlineX = relX + 0.6;
  let barlineItemIndex = measureItems.length;

  if (isLastMeasure) {
    measureItems.push({
      item: {
        id: `barline-${mDef.id}-thin`,
        kind: 'line',
        x: barlineX,
        y: 0,
        x2: barlineX,
        y2: 4,
        thickness: BARLINE_THICKNESS,
      },
    });
    measureItems.push({
      item: {
        id: `barline-${mDef.id}-thick`,
        kind: 'line',
        x: barlineX + 0.4,
        y: 0,
        x2: barlineX + 0.4,
        y2: 4,
        thickness: THICK_BARLINE_THICKNESS,
      },
    });
    relX = barlineX + 0.4 + THICK_BARLINE_THICKNESS;
  } else {
    measureItems.push({
      item: {
        id: `barline-${mDef.id}`,
        kind: 'line',
        x: barlineX,
        y: 0,
        x2: barlineX,
        y2: 4,
        thickness: BARLINE_THICKNESS,
      },
    });
    relX = barlineX + BARLINE_THICKNESS;
  }

  const chunk: MeasureLayoutChunk = {
    measureDefId: mDef.id,
    items: measureItems,
    naturalWidth: relX,
    barlineItemIndex,
  };

  if (staffMeasure) {
    let map = measureChunkCache.get(staffMeasure);
    if (!map) {
      map = new Map();
      measureChunkCache.set(staffMeasure, map);
    }
    map.set(cacheKey, chunk);
  }

  return chunk;
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
  const staffMarginTop = 4.0;
  const staffMarginBottom = 4.0;

  const part: Part | undefined = score.parts[0];
  const staff = part?.staves[0];
  const clef: Clef = staff?.clef ?? { sign: 'G', line: 2 };

  function createClefItems(startX: number, clefToUse: Clef): { items: LayoutItem[]; width: number } {
    const glyph = clefToUse.sign === 'F' ? 'fClef' : 'gClef';
    const y = clefToUse.sign === 'F' ? 1.0 : 3.0;
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

  // Measure each measure definition into a natural chunk
  const measureChunks: MeasureLayoutChunk[] = [];

  for (let mIdx = 0; mIdx < score.measures.length; mIdx++) {
    const mDef = score.measures[mIdx];
    const isFirstMeasure = mIdx === 0;
    const isLastMeasure = mIdx === score.measures.length - 1;
    const staffMeasure = staff?.measures[mDef.id];
    measureChunks.push(
      layoutSingleMeasure(staffMeasure, mDef, clef, isFirstMeasure, isLastMeasure)
    );
  }

  // Pack measures into systems with width check
  // Pack measures into systems with width check
  interface SystemPlan {
    measures: MeasureLayoutChunk[];
    headerWidth: number;
    headerItems: LayoutItem[];
  }

  const systemPlans: SystemPlan[] = [];
  let currentPlanMeasures: MeasureLayoutChunk[] = [];
  let currentUsedWidth = 0;

  function computeHeader(): { headerWidth: number; headerItems: LayoutItem[] } {
    const items: LayoutItem[] = [];
    let startX = 0;

    items.push({
      id: `sys-start-barline`,
      kind: 'line',
      x: startX,
      y: 0,
      x2: startX,
      y2: 4,
      thickness: BARLINE_THICKNESS,
    });
    startX += 0.4;

    const clefLayout = createClefItems(startX, clef);
    items.push(...clefLayout.items);
    startX += clefLayout.width;

    const initialKeySig = score.measures[0]?.keySig ?? 0;
    const keySigLayout = createKeySigItems(startX, initialKeySig, clef);
    items.push(...keySigLayout.items);
    startX += keySigLayout.width;

    return { headerWidth: startX, headerItems: items };
  }

  let currentHeader = computeHeader();
  currentUsedWidth = currentHeader.headerWidth;

  for (let mIdx = 0; mIdx < measureChunks.length; mIdx++) {
    const chunk = measureChunks[mIdx];
    const projectedWidth = currentUsedWidth + chunk.naturalWidth;

    if (projectedWidth > targetWidth) {
      if (currentPlanMeasures.length > 0) {
        // Measure does not fit in current system; close system and wrap to next
        systemPlans.push({
          measures: currentPlanMeasures,
          headerWidth: currentHeader.headerWidth,
          headerItems: currentHeader.headerItems,
        });

        // Start new system plan
        currentPlanMeasures = [chunk];
        currentHeader = computeHeader();
        currentUsedWidth = currentHeader.headerWidth + chunk.naturalWidth;
      } else {
        // Width is too small for even one measure: put one measure and allow overflow
        console.warn(
          `[ScoreForge layout] Container width (${targetWidth}) is too small for measure ${chunk.measureDefId}; allowing overflow.`
        );
        systemPlans.push({
          measures: [chunk],
          headerWidth: currentHeader.headerWidth,
          headerItems: currentHeader.headerItems,
        });

        currentPlanMeasures = [];
        currentHeader = computeHeader();
        currentUsedWidth = currentHeader.headerWidth;
      }
    } else {
      currentPlanMeasures.push(chunk);
      currentUsedWidth = projectedWidth;
    }
  }

  if (currentPlanMeasures.length > 0) {
    systemPlans.push({
      measures: currentPlanMeasures,
      headerWidth: currentHeader.headerWidth,
      headerItems: currentHeader.headerItems,
    });
  }

  // Construct LayoutSystem objects (justify non-last systems, do not stretch last system)
  const systems: LayoutSystem[] = [];

  for (let sIdx = 0; sIdx < systemPlans.length; sIdx++) {
    const plan = systemPlans[sIdx];
    const isLastSystem = sIdx === systemPlans.length - 1;
    const systemItems: LayoutItem[] = [];

    // Header items
    for (const hItem of plan.headerItems) {
      systemItems.push({
        ...hItem,
        id: `sys-${sIdx}-${hItem.id}`,
      });
    }

    const naturalContentWidth = plan.measures.reduce((sum, m) => sum + m.naturalWidth, 0);
    const availableContentSpace = targetWidth - plan.headerWidth;

    // Non-last systems are justified so the last barline lands at targetWidth.
    // Last system is NOT stretched.
    // Overflowing single measures are NOT stretched.
    const shouldJustify =
      !isLastSystem && naturalContentWidth > 0 && availableContentSpace > naturalContentWidth;
    const stretchRatio = shouldJustify ? availableContentSpace / naturalContentWidth : 1.0;

    let contentOffset = plan.headerWidth;

    for (let mInSys = 0; mInSys < plan.measures.length; mInSys++) {
      const chunk = plan.measures[mInSys];
      const isLastMeasureInSystem = mInSys === plan.measures.length - 1;

      for (let iIdx = 0; iIdx < chunk.items.length; iIdx++) {
        const entry = chunk.items[iIdx];
        const raw = entry.item;
        const isBarline = iIdx >= chunk.barlineItemIndex;

        let finalX: number;
        let finalX2: number | undefined = undefined;

        if (isLastMeasureInSystem && shouldJustify && isBarline) {
          // Align last barline exactly so right edge lands at targetWidth
          const barlineThickness = raw.thickness ?? BARLINE_THICKNESS;
          finalX = targetWidth - barlineThickness;
          finalX2 = finalX;
        } else if (entry.ledgerNoteRelativeX !== undefined) {
          // Keep ledger lines centered on stretched noteheads
          const stretchedNoteX = contentOffset + entry.ledgerNoteRelativeX * stretchRatio;
          finalX = stretchedNoteX - LEDGER_EXTENSION;
          finalX2 = stretchedNoteX + NOTEHEAD_WIDTH + LEDGER_EXTENSION;
        } else {
          finalX = contentOffset + raw.x * stretchRatio;
          if (raw.x2 !== undefined) {
            finalX2 = contentOffset + raw.x2 * stretchRatio;
          }
        }

        systemItems.push({
          ...raw,
          x: finalX,
          x2: finalX2,
        });
      }

      contentOffset += chunk.naturalWidth * stretchRatio;
    }

    // Determine staff line end X:
    // In justified non-last systems: staff line ends exactly at targetWidth.
    // In last system: staff line ends exactly at final barline right edge.
    let staffEndEndX: number;
    if (!isLastSystem && shouldJustify) {
      staffEndEndX = targetWidth;
    } else {
      staffEndEndX = contentOffset;
    }

    for (let line = 0; line <= 4; line++) {
      systemItems.unshift({
        id: `sys-${sIdx}-staffline-${line}`,
        kind: 'line',
        x: 0,
        y: line,
        x2: staffEndEndX,
        y2: line,
        thickness: STAFF_LINE_THICKNESS,
      });
    }

    const staffContainer: LayoutStaff = {
      id: `staff-${sIdx}`,
      y: staffMarginTop,
      items: systemItems,
    };

    systems.push({
      index: sIdx,
      x: 0,
      y: sIdx * (systemSpacing + 4) + staffMarginTop,
      width: Math.max(staffEndEndX, targetWidth),
      height: 6,
      staves: [staffContainer],
      items: [...systemItems],
    });
  }

  // Build lookup of event IDs to their kind for layout override rules
  const eventKindMap = new Map<string, string>();
  for (const part of score.parts) {
    for (const st of part.staves) {
      for (const mId of Object.keys(st.measures)) {
        for (const vc of st.measures[mId].voices) {
          for (const ev of vc.events) {
            eventKindMap.set(ev.id, ev.kind);
          }
        }
      }
    }
  }

  // Apply visual overrides (both element-level and event-level overrides apply)
  for (const sys of systems) {
    for (const item of sys.items) {
      const itemOverride = score.overrides[item.id];
      const evOverride =
        item.eventId && item.eventId !== item.id ? score.overrides[item.eventId] : undefined;

      const dx = (itemOverride?.dx ?? 0) + (evOverride?.dx ?? 0);
      const dy = (itemOverride?.dy ?? 0) + (evOverride?.dy ?? 0);

      // Manual positioning: notes and chords ignore dy (only pitch changes affect vertical position)
      const isNoteOrChord = item.eventId ? eventKindMap.get(item.eventId) === 'note' : false;

      if (dx !== 0) {
        item.x += dx;
        if (item.x2 !== undefined) item.x2 += dx;
      }
      if (dy !== 0 && !isNoteOrChord) {
        item.y += dy;
        if (item.y2 !== undefined) item.y2 += dy;
      }

      const scale = itemOverride?.scale ?? evOverride?.scale;
      if (scale !== undefined) {
        item.scale = scale;
      }

      const hidden = itemOverride?.hidden ?? evOverride?.hidden;
      if (hidden !== undefined) {
        item.hidden = hidden;
      }
    }
  }

  const allItems = systems.flatMap((s) => s.items);

  // SVG height fits its content accurately
  const totalHeight = systems.length * (systemSpacing + 4) + staffMarginTop + staffMarginBottom;

  const maxSysWidth = Math.max(targetWidth, ...systems.map((s) => s.width));

  return {
    width: maxSysWidth,
    height: totalHeight,
    systems,
    items: allItems,
    score,
  };
}
