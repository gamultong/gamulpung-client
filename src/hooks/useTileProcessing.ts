'use client';
import { useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { XYType, Direction } from '@/types';
import { VECTORIZED_TILE_LUT } from '@/utils/tiles';
import { TileGrid, Tile, makeClosedTile, makeFlagTile } from '@/utils/tileGrid';
import { initWasm, getWasmSync, hexEncoder } from '@/utils/wasmTileEngine';
import { useTileStore } from '@/store/tileStore';

interface UseTileProcessingOptions {
  padtiles: (sx: number, sy: number, ex: number, ey: number, dir: Direction) => void;
  startPoint: XYType;
  cachingTiles: TileGrid;
  cursorPosition: XYType;
  cursorOriginPosition: XYType;
  renderStartPoint: XYType;
  setTiles: (tiles: TileGrid) => void;
  setRenderTiles: (tiles: TileGrid) => void;
  applyTileChanges: (changes: Array<{ row: number; col: number; value: number }>) => void;
  applyPackedChanges: (packed: Uint32Array) => void;
}

export default function useTileProcessing({
  padtiles,
  startPoint,
  cachingTiles,
  cursorPosition,
  cursorOriginPosition,
  renderStartPoint,
  setTiles,
  setRenderTiles,
  applyTileChanges,
  applyPackedChanges,
}: UseTileProcessingOptions) {
  // Pre-initialize WASM tile engine (non-blocking)
  useEffect(() => {
    initWasm().catch(err => console.warn('WASM tile engine init failed, will use JS fallback:', err));
  }, []);

  /** Common tile processing logic (numeric Uint8Array encoding) */
  const processTileData = useCallback(
    (
      end_x: number,
      end_y: number,
      start_x: number,
      start_y: number,
      unsortedTiles: string,
      type: 'All' | 'PART',
      currentStartPoint: XYType,
      startIndex: number = 0,
      endIndex: number = -1,
    ) => {
      const rowlengthBytes = Math.abs(end_x - start_x + 1) << 1;
      const tilesPerRow = rowlengthBytes >> 1;
      const columnlength = Math.abs(start_y - end_y + 1);

      const isAll = type === 'All';
      const yOffset = end_y - currentStartPoint.y;
      const xOffset = isAll ? 0 : start_x - currentStartPoint.x - 1;

      const actualEndIndex = endIndex === -1 ? columnlength * tilesPerRow : endIndex;
      const changes: Array<{ row: number; col: number; value: number }> = [];

      const tiles = useTileStore.getState().tiles;

      for (let tileIndex = startIndex; tileIndex < actualEndIndex; tileIndex++) {
        const rowIndex = Math.floor(tileIndex / tilesPerRow);
        const colIndex = tileIndex % tilesPerRow;

        const reversedI = columnlength - 1 - rowIndex;
        const row = reversedI + yOffset;

        if (row < 0 || row >= tiles.height) continue;
        if (tiles.width === 0) continue;

        const yAbs = end_y - reversedI;

        const tStart = Math.max(0, -xOffset);
        const tEnd = Math.min(tilesPerRow, tiles.width - xOffset);
        if (colIndex < tStart || colIndex >= tEnd) continue;

        const byteOffset = rowIndex * rowlengthBytes + (colIndex << 1);
        const firstByte = unsortedTiles.charCodeAt(byteOffset);
        const secondByte = unsortedTiles.charCodeAt(byteOffset + 1);

        // 16bit combination vectorized LUT LookUp (O(1) operation)
        const lookupIndex = (firstByte << 8) | secondByte;
        const tileType = VECTORIZED_TILE_LUT[lookupIndex];

        if (tileType === 255) continue; // Check invalid hex

        const col = colIndex + xOffset;
        const checker = (col + yAbs + currentStartPoint.x) & 1;

        // Direct numeric tile encoding (no string allocation)
        let value: number = Tile.FILL;
        if (tileType < 8)
          value = tileType; // 0-7 maps directly to OPEN_0..OPEN_7
        else if (tileType === 8) value = Tile.BOMB;
        else if (tileType === 24) value = makeClosedTile(checker);
        else if (tileType >= 16 && tileType < 24) {
          const flagColor = (tileType - 16) >> 1;
          value = makeFlagTile(flagColor, checker);
        }

        if (tiles.get(row, col) !== value) changes.push({ row, col, value });
      }

      return changes;
    },
    [],
  );

  /** Apply incoming hex tile data to the internal tile grid.
   *  Uses WASM engine when available, falls back to JS processing. */
  const replaceTiles = useCallback(
    async (end_x: number, end_y: number, start_x: number, start_y: number, unsortedTiles: string, type: 'All' | 'PART') => {
      if (unsortedTiles.length === 0) return;
      console.log('replaceTiles', type, performance.now());

      // For full window updates, pre-shift the grid with dummy tiles
      if (type === 'All') padtiles(start_x, start_y, end_x, end_y, Direction.ALL);

      // Internal processing uses an inner window trimmed by 1 tile on each X side
      const innerStartX = start_x + 1;
      const innerEndX = end_x - 1;
      const isAll = type === 'All';

      // ─── WASM synchronous fast path (no async/await overhead) ───
      const wasm = getWasmSync();
      if (wasm) {
        const tiles = useTileStore.getState().tiles;
        const hexBytes = hexEncoder.encode(unsortedTiles);

        // Inplace: clone grid, let WASM write directly
        if (wasm.process_hex_tiles_inplace) {
          const newTiles = tiles.clone();
          const changeCount = wasm.process_hex_tiles_inplace(
            hexBytes,
            newTiles.data,
            newTiles.width,
            newTiles.height,
            innerEndX,
            end_y,
            innerStartX,
            start_y,
            startPoint.x,
            startPoint.y,
            isAll,
          );
          if (changeCount > 0) setTiles(newTiles);
        } else {
          // Fallback to packed approach (old WASM without inplace)
          const packed = wasm.process_hex_tiles(
            hexBytes,
            tiles.data,
            tiles.width,
            tiles.height,
            innerEndX,
            end_y,
            innerStartX,
            start_y,
            startPoint.x,
            startPoint.y,
            isAll,
          );
          applyPackedChanges(packed);
        }
      } else {
        // ─── JS fallback (only runs before WASM init completes) ───
        const allChanges = processTileData(innerEndX, end_y, innerStartX, start_y, unsortedTiles, type, startPoint);
        applyTileChanges(allChanges);
      }
      console.log('replace', performance.now());
    },
    [padtiles, processTileData, startPoint, applyTileChanges, applyPackedChanges, setTiles],
  );

  /** STABLE & FAST: Reliable tile computation using TileGrid (Uint8Array) */
  const computedRenderTiles = useMemo(() => {
    if (cachingTiles.isEmpty) return TileGrid.empty();

    const offsetX = cursorOriginPosition.x - cursorPosition.x;
    const offsetY = cursorOriginPosition.y - cursorPosition.y;
    // INSTANT: Perfect alignment - no processing needed
    if (offsetX === 0 && offsetY === 0) return cachingTiles; // O(1) return!

    // STABLE CPU processing using flat Uint8Array - no disappearing tiles
    return processWithStableCPU();

    function processWithStableCPU(): TileGrid {
      const srcData = cachingTiles.data;
      const w = cachingTiles.width;
      const h = cachingTiles.height;
      const result = new TileGrid(w, h);
      const dstData = result.data;

      // Fill entire grid with FILL, then overwrite valid region via bulk copy
      dstData.fill(Tile.FILL);

      // Calculate valid source/dest regions
      const srcRowStart = Math.max(0, offsetY);
      const srcRowEnd = Math.min(h, h + offsetY);
      const srcColStart = Math.max(0, offsetX);
      const srcColEnd = Math.min(w, w + offsetX);
      const dstRowStart = Math.max(0, -offsetY);
      const dstColStart = Math.max(0, -offsetX);
      const copyWidth = srcColEnd - srcColStart;

      if (copyWidth <= 0 || srcRowEnd <= srcRowStart) return result;

      // Bulk copy rows + checkerboard pass for closed/flag tiles only
      const rowCount = srcRowEnd - srcRowStart;
      for (let i = 0; i < rowCount; i++) {
        const srcOff = (srcRowStart + i) * w + srcColStart;
        const dstOff = (dstRowStart + i) * w + dstColStart;

        // Row-level native memcpy
        dstData.set(srcData.subarray(srcOff, srcOff + copyWidth), dstOff);

        // Recompute checkerboard only for closed/flag tiles (0x10-0x27)
        const absY = renderStartPoint.y + dstRowStart + i;
        for (let j = 0; j < copyWidth; j++) {
          const tile = dstData[dstOff + j];
          if (tile >= 0x10 && tile <= 0x27) {
            const absX = renderStartPoint.x + dstColStart + j;
            dstData[dstOff + j] = (tile & 0xfe) | ((absX + absY) & 1);
          }
        }
      }

      return result;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachingTiles, cursorOriginPosition, renderStartPoint]);

  /** Apply computed tiles */
  useLayoutEffect(() => {
    setRenderTiles(computedRenderTiles);
  }, [computedRenderTiles, setRenderTiles]);

  return { replaceTiles };
}
