/**
 * Beam geometry engine for ScoreForge.
 *
 * Pure functions operating strictly in staff spaces (Y grows downward).
 * Computes uniform stem direction, clamped primary beam slope, minimum stem
 * length shifting, secondary beams (level 2/3), and directional stubs.
 */

import { BaseDurationType } from '../core/model';
import { PPQ } from '../core/time';
import { getEngravingDefault } from '../render/smufl';
import { getBeamLevelCount } from './beams';
import { LayoutItem, StemDirection } from './types';

/** Default beam engraving dimensions in staff spaces if font metadata is unavailable. */
export const DEFAULT_BEAM_THICKNESS = 0.5;
export const DEFAULT_BEAM_SPACING = 0.25;
export const DEFAULT_MIN_STEM_LENGTH = 2.5;
export const DEFAULT_STUB_LENGTH = 1.25;
export const DEFAULT_STEM_THICKNESS = 0.12;

/** Geometric input for one beamed stem/event inside a beam group. */
export interface BeamStemInput {
  eventId: string;
  baseType: BaseDurationType;
  /** Diatonic step positions sorted ascending (0 = bottom line, 4 = middle line). */
  stepPositions: number[];
  /** Left X of main notehead column in staff spaces. */
  noteX: number;
  /** Resolved final X coordinate of the stem center in staff spaces. */
  stemX: number;
  /** Resolved start Y of stem at outer notehead away from beam. */
  stemStartY: number;
  /** Y of the notehead closest to the beam (`highest` for up, `lowest` for down). */
  beamSideNoteY: number;
  /** Natural unshifted end Y of stem (`beamSideNoteY +/- STEM_LENGTH`). */
  naturalStemEndY: number;
  /** Start tick inside measure for secondary stub beat-subgroup direction. */
  startTick: number;
}

/** Computed primary beam line, per-event stem ends, and beam polygon items. */
export interface ComputedBeamGroupGeometry {
  beamGroupId: string;
  stemDir: StemDirection;
  xFirst: number;
  xLast: number;
  yFirst: number;
  yLast: number;
  /** Exact Y on the primary beam outer line keyed by eventId. */
  stemEndYs: Record<string, number>;
  /** Beam polygon items (level 1, 2, 3) ready to place in the system layer. */
  beamItems: LayoutItem[];
}

/**
 * Determines uniform stem direction for a beam group based on the pitch
 * farthest from the middle staff line (step 4: B4 treble, D3 bass, C4 alto).
 * Ties and exact middle-line placements break downward ('down').
 */
export function getBeamGroupStemDirection(eventsSteps: number[][]): StemDirection {
  let maxAbsDist = -1;
  let maxDistSigned = 0;

  for (const steps of eventsSteps) {
    for (const pos of steps) {
      const signed = pos - 4;
      const abs = Math.abs(signed);
      if (abs > maxAbsDist) {
        maxAbsDist = abs;
        maxDistSigned = signed;
      } else if (abs === maxAbsDist && signed >= 0) {
        maxDistSigned = signed;
      }
    }
  }

  return maxDistSigned >= 0 ? 'down' : 'up';
}

/**
 * Builds a 4-vertex parallelogram polygon item for one beam span or stub.
 * Vertex order: outerLeft, outerRight, innerRight, innerLeft.
 */
function createBeamPolygonItem(
  id: string,
  beamGroupId: string,
  eventIds: string[],
  level: number,
  xLeft: number,
  xRight: number,
  outerYAtX: (x: number) => number,
  dirSign: 1 | -1,
  beamThickness: number,
  beamSpacing: number
): LayoutItem {
  const levelOffset = dirSign * (level - 1) * (beamThickness + beamSpacing);
  const innerDelta = dirSign * beamThickness;

  const yOuterL = outerYAtX(xLeft) + levelOffset;
  const yOuterR = outerYAtX(xRight) + levelOffset;
  const yInnerR = yOuterR + innerDelta;
  const yInnerL = yOuterL + innerDelta;

  return {
    id,
    kind: 'beam',
    x: xLeft,
    y: Math.min(yOuterL, yOuterR, yInnerL, yInnerR),
    level,
    beamGroupId,
    eventIds,
    points: [
      { x: xLeft, y: yOuterL },
      { x: xRight, y: yOuterR },
      { x: xRight, y: yInnerR },
      { x: xLeft, y: yInnerL },
    ],
  };
}

/** Determines whether an isolated interior secondary stub points left or right. */
function chooseStubDirection(
  stems: BeamStemInput[],
  index: number,
  level: number
): 'left' | 'right' {
  if (index <= 0) return 'right';
  if (index >= stems.length - 1) return 'left';

  const subTicks = level === 2 ? PPQ / 2 : PPQ / 4;
  const curStart = stems[index].startTick;
  const mySub = Math.floor(curStart / subTicks);
  const leftSub = Math.floor(stems[index - 1].startTick / subTicks);
  const rightSub = Math.floor(stems[index + 1].startTick / subTicks);

  const sameLeft = leftSub === mySub;
  const sameRight = rightSub === mySub;

  if (sameLeft && !sameRight) return 'left';
  if (sameRight && !sameLeft) return 'right';

  // If starting on subgroup boundary, point forward/right; else complete previous/left
  return curStart % subTicks === 0 ? 'right' : 'left';
}

/**
 * Computes primary beam geometry, per-event stem ends, and secondary/tertiary beam polygons.
 *
 * @param beamGroupId - Unique identifier for this beam group.
 * @param stems - Ordered geometric descriptors of stems in the group (length >= 2).
 * @param stemDir - Uniform stem direction ('up' | 'down').
 * @param beamThickness - Override for Bravura beamThickness (defaults from metadata or 0.5).
 * @param beamSpacing - Override for Bravura beamSpacing (defaults from metadata or 0.25).
 * @param stemThickness - Stem stroke thickness in staff spaces (defaults to 0.12).
 */
export function computeBeamGroupGeometry(
  beamGroupId: string,
  stems: BeamStemInput[],
  stemDir: StemDirection,
  beamThickness: number = getEngravingDefault('beamThickness', DEFAULT_BEAM_THICKNESS),
  beamSpacing: number = getEngravingDefault('beamSpacing', DEFAULT_BEAM_SPACING),
  stemThickness: number = DEFAULT_STEM_THICKNESS
): ComputedBeamGroupGeometry {
  if (stems.length < 2) {
    throw new Error('computeBeamGroupGeometry requires at least 2 stems.');
  }

  const first = stems[0];
  const last = stems[stems.length - 1];
  const xFirst = first.stemX;
  const xLast = last.stemX;
  const dxGroup = xLast - xFirst;

  // Damped Y difference over the group width, clamped strictly to [-1.0, +1.0] staff spaces.
  const rawDelta = last.naturalStemEndY - first.naturalStemEndY;
  const deltaY = rawDelta === 0 ? 0 : Math.max(-1.0, Math.min(1.0, rawDelta * 0.5));
  const midY = (first.naturalStemEndY + last.naturalStemEndY) / 2;

  let yFirst = midY - deltaY / 2;
  let yLast = midY + deltaY / 2;

  const lineAt = (x: number, yA: number, yB: number): number => {
    if (Math.abs(dxGroup) < 1e-12) return yA;
    return yA + ((yB - yA) * (x - xFirst)) / dxGroup;
  };

  // Shift whole beam away from noteheads so every stem is at least 2.5 spaces long
  // (checking both stem line length |yEnd - stemStartY| >= 2.5 and beamSideNoteY clearance >= 2.5).
  let shift = 0;
  for (const s of stems) {
    const curY = lineAt(s.stemX, yFirst, yLast);
    if (stemDir === 'up') {
      const maxAllowedY = Math.min(
        s.stemStartY - DEFAULT_MIN_STEM_LENGTH,
        s.beamSideNoteY - DEFAULT_MIN_STEM_LENGTH
      );
      if (curY > maxAllowedY) {
        shift = Math.min(shift, maxAllowedY - curY);
      }
    } else {
      const minAllowedY = Math.max(
        s.stemStartY + DEFAULT_MIN_STEM_LENGTH,
        s.beamSideNoteY + DEFAULT_MIN_STEM_LENGTH
      );
      if (curY < minAllowedY) {
        shift = Math.max(shift, minAllowedY - curY);
      }
    }
  }

  yFirst += shift;
  yLast += shift;

  const beamOuterYAtX = (x: number): number => lineAt(x, yFirst, yLast);

  const stemEndYs: Record<string, number> = {};
  for (const s of stems) {
    stemEndYs[s.eventId] = beamOuterYAtX(s.stemX);
  }

  // Notehead side offset sign: +1 (downward in Y) when stems go up; -1 (upward in Y) when stems go down.
  const dirSign: 1 | -1 = stemDir === 'up' ? 1 : -1;
  const halfStem = stemThickness / 2;
  const allEventIds = stems.map((s) => s.eventId);

  const beamItems: LayoutItem[] = [];

  // Level 1 (primary beam spanning entire group)
  beamItems.push(
    createBeamPolygonItem(
      `${beamGroupId}-lvl1`,
      beamGroupId,
      allEventIds,
      1,
      xFirst - halfStem,
      xLast + halfStem,
      beamOuterYAtX,
      dirSign,
      beamThickness,
      beamSpacing
    )
  );

  // Secondary (level 2) & Tertiary (level 3) beams / stubs
  const levels = stems.map((s) => getBeamLevelCount(s.baseType));
  for (const level of [2, 3]) {
    let idx = 0;
    while (idx < stems.length) {
      if (levels[idx] < level) {
        idx++;
        continue;
      }

      const start = idx;
      while (idx + 1 < stems.length && levels[idx + 1] >= level) {
        idx++;
      }
      const end = idx;

      if (end > start) {
        const spanEventIds = stems.slice(start, end + 1).map((s) => s.eventId);
        beamItems.push(
          createBeamPolygonItem(
            `${beamGroupId}-lvl${level}-${start}-${end}`,
            beamGroupId,
            spanEventIds,
            level,
            stems[start].stemX - halfStem,
            stems[end].stemX + halfStem,
            beamOuterYAtX,
            dirSign,
            beamThickness,
            beamSpacing
          )
        );
      } else {
        // Isolated event requiring this beam level -> 1.25-space stub
        const dir = chooseStubDirection(stems, start, level);
        const anchorStem = stems[start];
        const xLeft =
          dir === 'right'
            ? anchorStem.stemX - halfStem
            : anchorStem.stemX + halfStem - DEFAULT_STUB_LENGTH;
        const xRight =
          dir === 'right'
            ? anchorStem.stemX - halfStem + DEFAULT_STUB_LENGTH
            : anchorStem.stemX + halfStem;

        beamItems.push(
          createBeamPolygonItem(
            `${beamGroupId}-lvl${level}-stub-${start}`,
            beamGroupId,
            [anchorStem.eventId],
            level,
            xLeft,
            xRight,
            beamOuterYAtX,
            dirSign,
            beamThickness,
            beamSpacing
          )
        );
      }

      idx++;
    }
  }

  return {
    beamGroupId,
    stemDir,
    xFirst,
    xLast,
    yFirst,
    yLast,
    stemEndYs,
    beamItems,
  };
}
