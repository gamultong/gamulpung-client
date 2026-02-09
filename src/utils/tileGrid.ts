/**
 * TileGrid: Flat Uint8Array-based tile storage for high-performance tile operations.
 * Replaces string[][] with O(1) copy via native memcpy (Uint8Array.slice).
 *
 * Tile byte encoding:
 *   0x00 (0)       : Opened, 0 adjacent mines ('O')
 *   0x01-0x07 (1-7): Opened, 1-7 adjacent mines ('1'-'7')
 *   0x08 (8)       : Bomb ('B')
 *   0x10 (16)      : Closed, checker 0 ('C0')
 *   0x11 (17)      : Closed, checker 1 ('C1')
 *   0x20-0x27      : Flags (color 0-3, checker 0-1)
 *   0xFF (255)     : Fill / Uninitialized ('??')
 */

// ─── Tile byte constants ───

export const Tile = {
  OPEN_0: 0,
  OPEN_1: 1,
  OPEN_2: 2,
  OPEN_3: 3,
  OPEN_4: 4,
  OPEN_5: 5,
  OPEN_6: 6,
  OPEN_7: 7,
  BOMB: 8,
  CLOSED_0: 16,
  CLOSED_1: 17,
  FLAG_00: 32,
  FLAG_01: 33,
  FLAG_10: 34,
  FLAG_11: 35,
  FLAG_20: 36,
  FLAG_21: 37,
  FLAG_30: 38,
  FLAG_31: 39,
  FILL: 255,
} as const;

export type TileValue = (typeof Tile)[keyof typeof Tile];

// ─── Fast tile type predicates (branchless bit operations) ───

/** Opened tile with 0-7 adjacent mines */
export const isTileOpen = (b: number): boolean => b <= 7;

/** Bomb tile */
export const isTileBomb = (b: number): boolean => b === Tile.BOMB;

/** Closed (unopened, non-flagged) tile */
export const isTileClosed = (b: number): boolean => (b & 0xfe) === 0x10;

/** Flagged tile */
export const isTileFlag = (b: number): boolean => b >= 0x20 && b <= 0x27;

/** Uninitialized / fill tile */
export const isTileFill = (b: number): boolean => b === Tile.FILL;

/** Closed or flagged tile */
export const isTileClosedOrFlag = (b: number): boolean => b >= 0x10 && b <= 0x27;

/**
 * "Opened" = tile that has been revealed (not closed, not flagged).
 * Note: FILL tiles (0xFF) are treated as "opened" to match original behavior
 * where '??' passes checkTileHasOpened since '?' is neither 'C' nor 'F'.
 */
export const isTileOpened = (b: number): boolean => b < 0x10 || b > 0x27;

// ─── Tile property extraction ───

/** Get checkerboard parity (0 or 1) */
export const getTileChecker = (b: number): number => b & 1;

/** Get flag color index (0-3) for flag tiles */
export const getFlagColor = (b: number): number => (b - 0x20) >> 1;

/** Get mine count (0-7) for open tiles */
export const getTileNumber = (b: number): number => b & 7;

// ─── Tile value constructors ───

/** Create a closed tile byte with given checkerboard parity */
export const makeClosedTile = (checker: number): number => 0x10 | (checker & 1);

/** Create a flag tile byte with given color (0-3) and checkerboard parity */
export const makeFlagTile = (color: number, checker: number): number => 0x20 | ((color & 3) << 1) | (checker & 1);

// ─── TileGrid class ───

export class TileGrid {
  data: Uint8Array;
  width: number;
  height: number;

  constructor(width: number, height: number, fill: number = Tile.FILL) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
    if (fill !== 0) this.data.fill(fill);
  }

  /** Get tile value at (row, col). Returns Tile.FILL for out-of-bounds. */
  get(row: number, col: number): number {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) return Tile.FILL;
    return this.data[row * this.width + col];
  }

  /** Set tile value at (row, col). No-op for out-of-bounds. */
  set(row: number, col: number, value: number): void {
    if (row >= 0 && row < this.height && col >= 0 && col < this.width) {
      this.data[row * this.width + col] = value;
    }
  }

  /** Create an independent deep copy (uses native memcpy via Uint8Array.slice). */
  clone(): TileGrid {
    const grid = new TileGrid(0, 0, 0);
    grid.width = this.width;
    grid.height = this.height;
    grid.data = this.data.slice();
    return grid;
  }

  /** Whether the grid has zero dimensions */
  get isEmpty(): boolean {
    return this.width === 0 || this.height === 0;
  }

  /** Create an empty TileGrid with zero dimensions */
  static empty(): TileGrid {
    return new TileGrid(0, 0, 0);
  }
}
