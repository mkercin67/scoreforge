/**
 * Type definitions for ScoreForge layout structures.
 *
 * Coordinates are expressed in staff spaces where 1 unit equals the distance
 * between two adjacent staff lines. The Y axis points downward with Y = 0
 * representing the top line of the staff.
 */

import { Score } from '../core/model';

export type LayoutItemKind = 'glyph' | 'line' | 'text' | 'beam';

/** Uniform stem direction for notes, chords, and beam groups. */
export type StemDirection = 'up' | 'down';

/** A single positioned visual element. */
export interface LayoutItem {
  id: string;
  eventId?: string;
  kind: LayoutItemKind;
  x: number;
  y: number;
  glyph?: string;
  text?: string;
  x2?: number;
  y2?: number;
  thickness?: number;
  width?: number;
  scale?: number;
  hidden?: boolean;
  /** Polygon vertices (clockwise in staff spaces) for 'beam' items. */
  points?: Array<{ x: number; y: number }>;
  /** Beam level: 1 = primary, 2 = 16th secondary/stub, 3 = 32nd tertiary/stub. */
  level?: number;
  /** Beam group identifier attached to beam items (`data-beam-group`). */
  beamGroupId?: string;
  /** Ordered event IDs belonging to this beam item (`data-event-ids`). */
  eventIds?: string[];
}

/** Positioned staff container within a system. */
export interface LayoutStaff {
  id: string;
  y: number;
  items: LayoutItem[];
}

/** A single horizontal system containing staves and barlines. */
export interface LayoutSystem {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  staves: LayoutStaff[];
  items: LayoutItem[];
}

/** Complete layout output representing positioned elements ready for rendering. */
export interface LayoutResult {
  width: number;
  height: number;
  systems: LayoutSystem[];
  items: LayoutItem[];
  score?: Score;
  appliedOverrides?: Record<string, { dx: number; dy: number }>;
}

/** Options configuring layout dimensions and wrapping behavior. */
export interface LayoutOptions {
  /** Target system width in staff spaces before wrapping to next system. */
  width?: number;
  /** Vertical distance in staff spaces between consecutive systems. */
  systemSpacing?: number;
}
