'use client';
import { useLayoutEffect, useMemo, useCallback } from 'react';
import { XYType, Direction } from '@/types';
import { HEX_NIBBLE } from '@/utils/tiles';
import { TileGrid } from '@/utils/tileGrid';
import { useColoredTileStore } from '@/store/coloredTileStore';

interface UseColoredTileProcessingOptions {
  padColorTiles: (sx: number, sy: number, ex: number, ey: number, dir: Direction) => void;
  startPoint: XYType;
  cachingColorTiles: TileGrid;
  cursorPosition: XYType;
  cursorOriginPosition: XYType;
  renderStartPoint: XYType;
  setColorTiles: (tiles: TileGrid) => void;
  setRenderColorTiles: (tiles: TileGrid) => void;
  applyColorChanges: (changes: Array<{ row: number; col: number; value: number }>) => void;
}

const COLOR_NONE = 0;

export default function useColoredTileProcessing({
  padColorTiles,
  startPoint,
  cachingColorTiles,
  cursorPosition,
  cursorOriginPosition,
  renderStartPoint,
  setColorTiles,
  setRenderColorTiles,
  applyColorChanges,
}: UseColoredTileProcessingOptions) {
  const processColorData = useCallback(
    (end_x: number, end_y: number, start_x: number, start_y: number, hexData: string, type: 'All' | 'PART', currentStartPoint: XYType) => {
      const rowlengthBytes = Math.abs(end_x - start_x + 1) << 1;
      const tilesPerRow = rowlengthBytes >> 1;
      const columnlength = Math.abs(start_y - end_y + 1);

      const isAll = type === 'All';
      const yOffset = end_y - currentStartPoint.y;
      // end_x here is already inner-trimmed (original end_x - 1).
      // colIndex=0 in hex data = left edge of original range = end_x + 1 in world coords.
      const xOffset = isAll ? 0 : end_x + 1 - currentStartPoint.x;

      const totalTiles = columnlength * tilesPerRow;
      const changes: Array<{ row: number; col: number; value: number }> = [];

      const colorTiles = useColoredTileStore.getState().colorTiles;

      for (let tileIndex = 0; tileIndex < totalTiles; tileIndex++) {
        const rowIndex = Math.floor(tileIndex / tilesPerRow);
        const colIndex = tileIndex % tilesPerRow;

        const reversedI = columnlength - 1 - rowIndex;
        const row = reversedI + yOffset;

        if (row < 0 || row >= colorTiles.height) continue;
        if (colorTiles.width === 0) continue;

        const tStart = Math.max(0, -xOffset);
        const tEnd = Math.min(tilesPerRow, colorTiles.width - xOffset);
        if (colIndex < tStart || colIndex >= tEnd) continue;

        const byteOffset = rowIndex * rowlengthBytes + (colIndex << 1);
        const firstChar = hexData.charCodeAt(byteOffset);
        const secondChar = hexData.charCodeAt(byteOffset + 1);

        // hex 2글자 → 1바이트 → COLORMAP 값 (0-4)
        const n0 = firstChar < 128 ? HEX_NIBBLE[firstChar] : -1;
        const n1 = secondChar < 128 ? HEX_NIBBLE[secondChar] : -1;
        if (n0 < 0 || n1 < 0) continue;

        const colorValue = (n0 << 4) | n1;

        const col = colIndex + xOffset;
        if (colorTiles.get(row, col) !== colorValue) {
          changes.push({ row, col, value: colorValue });
        }
      }

      return changes;
    },
    [],
  );

  const replaceColoredTiles = useCallback(
    async (end_x: number, end_y: number, start_x: number, start_y: number, hexData: string, type: 'All' | 'PART') => {
      if (hexData.length === 0) return;

      if (type === 'All') padColorTiles(start_x, start_y, end_x, end_y, Direction.ALL);

      const innerStartX = start_x + 1;
      const innerEndX = end_x - 1;

      const changes = processColorData(innerEndX, end_y, innerStartX, start_y, hexData, type, startPoint);
      if (changes.length > 0) applyColorChanges(changes);
    },
    [padColorTiles, processColorData, startPoint, applyColorChanges],
  );

  const computedRenderColorTiles = useMemo(() => {
    if (cachingColorTiles.isEmpty) return TileGrid.empty();

    const offsetX = cursorOriginPosition.x - cursorPosition.x;
    const offsetY = cursorOriginPosition.y - cursorPosition.y;
    if (offsetX === 0 && offsetY === 0) return cachingColorTiles;

    const w = cachingColorTiles.width;
    const h = cachingColorTiles.height;
    const srcData = cachingColorTiles.data;
    const result = new TileGrid(w, h, COLOR_NONE);
    const dstData = result.data;

    const srcRowStart = Math.max(0, offsetY);
    const srcRowEnd = Math.min(h, h + offsetY);
    const srcColStart = Math.max(0, offsetX);
    const srcColEnd = Math.min(w, w + offsetX);
    const dstRowStart = Math.max(0, -offsetY);
    const dstColStart = Math.max(0, -offsetX);
    const copyWidth = srcColEnd - srcColStart;

    if (copyWidth <= 0 || srcRowEnd <= srcRowStart) return result;

    const rowCount = srcRowEnd - srcRowStart;
    for (let i = 0; i < rowCount; i++) {
      const srcOff = (srcRowStart + i) * w + srcColStart;
      const dstOff = (dstRowStart + i) * w + dstColStart;
      dstData.set(srcData.subarray(srcOff, srcOff + copyWidth), dstOff);
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachingColorTiles, cursorOriginPosition, renderStartPoint]);

  useLayoutEffect(() => {
    setRenderColorTiles(computedRenderColorTiles);
  }, [computedRenderColorTiles, setRenderColorTiles]);

  return { replaceColoredTiles };
}
