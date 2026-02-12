/**
 * WASM Tile Engine wrapper.
 * Lazily initializes the WASM module on first use.
 * Provides processHexTiles / processBinaryTiles that return
 * Array<{ row, col, value }> compatible with applyTileChanges.
 */

import type { TileGrid } from './tileGrid';

// ─── Types from wasm-pkg ───
type WasmModule = typeof import('@/wasm-pkg/minesweeper_tile_engine');
type InitFn = WasmModule['default'];

let wasmModule: WasmModule | null = null;
let initPromise: Promise<WasmModule> | null = null;

/** Lazily load and initialize the WASM module (singleton). */
async function getWasm(): Promise<WasmModule> {
  if (wasmModule) return wasmModule;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const mod = await import('@/wasm-pkg/minesweeper_tile_engine');
    // Initialize the WASM binary
    await (mod.default as InitFn)();
    wasmModule = mod;
    return mod;
  })();

  return initPromise;
}

/** Check if WASM is ready (already initialized). */
export function isWasmReady(): boolean {
  console.log('isWasmReady', wasmModule !== null, performance.now());
  return wasmModule !== null;
}

/** Get WASM module synchronously. Returns null if not yet initialized. */
export function getWasmSync(): WasmModule | null {
  return wasmModule;
}

/** Ensure WASM is initialized (call early, e.g. on mount). */
export async function initWasm(): Promise<void> {
  await getWasm();
}

// ─── Shared TextEncoder for hex string → Uint8Array conversion ───
export const hexEncoder = new TextEncoder();
const encoder = hexEncoder;

/**
 * Unpack packed Uint32Array changes into { row, col, value }[] array.
 * Each packed u32 = (row << 16) | (col << 8) | value
 */
function unpackChanges(packed: Uint32Array): Array<{ row: number; col: number; value: number }> {
  const changes: Array<{ row: number; col: number; value: number }> = new Array(packed.length);
  for (let i = 0; i < packed.length; i++) {
    const p = packed[i];
    changes[i] = {
      row: (p >> 16) & 0xffff,
      col: (p >> 8) & 0xff,
      value: p & 0xff,
    };
  }
  return changes;
}

/**
 * Process hex-encoded tile data using WASM engine.
 * Drop-in replacement for the JS processTileData function.
 */
export async function processHexTilesWasm(
  unsortedTiles: string,
  existingGrid: TileGrid,
  endX: number,
  endY: number,
  startX: number,
  startY: number,
  startPointX: number,
  startPointY: number,
  isAll: boolean,
): Promise<Array<{ row: number; col: number; value: number }>> {
  const wasm = await getWasm();

  // Convert hex string to Uint8Array (ASCII bytes)
  const hexBytes = encoder.encode(unsortedTiles);

  const packed = wasm.process_hex_tiles(
    hexBytes,
    existingGrid.data,
    existingGrid.width,
    existingGrid.height,
    endX,
    endY,
    startX,
    startY,
    startPointX,
    startPointY,
    isAll,
  );

  return unpackChanges(packed);
}

/**
 * Process binary tile data (1 byte/tile) using WASM engine.
 * For future use when server sends binary frames.
 */
export async function processBinaryTilesWasm(
  binaryData: Uint8Array,
  existingGrid: TileGrid,
  endX: number,
  endY: number,
  startX: number,
  startY: number,
  startPointX: number,
  startPointY: number,
  isAll: boolean,
): Promise<Array<{ row: number; col: number; value: number }>> {
  const wasm = await getWasm();

  const packed = wasm.process_binary_tiles(
    binaryData,
    existingGrid.data,
    existingGrid.width,
    existingGrid.height,
    endX,
    endY,
    startX,
    startY,
    startPointX,
    startPointY,
    isAll,
  );

  return unpackChanges(packed);
}
