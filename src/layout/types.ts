/**
 * Type definitions for ScoreForge layout structures.
 *
 * Coordinates are expressed in staff spaces where 1 unit equals the distance
 * between two adjacent staff lines. The Y axis points downward with Y = 0
 * representing the top line of the staff.
 */

export type LayoutItemKind = 'glyph' | 'line' | 'text';

/** A single positioned visual element. */
export interface LayoutItem {
  id: string;
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
}

/** Options configuring layout dimensions and wrapping behavior. */
export interface LayoutOptions {
  /** Target system width in staff spaces before wrapping to next system. */
  width?: number;
  /** Vertical distance in staff spaces between consecutive systems. */
  systemSpacing?: number;
}
