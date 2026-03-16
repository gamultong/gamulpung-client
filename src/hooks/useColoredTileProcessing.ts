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
  cachingMyColoredTiles: TileGrid;
  cursorPosition: XYType;
  cursorOriginPosition: XYType;
  renderStartPoint: XYType;
  setColorTiles: (tiles: TileGrid) => void;
  setRenderColorTiles: (tiles: TileGrid) => void;
  setRenderMyColoredTiles: (tiles: TileGrid) => void;
  applyColorChanges: (changes: Array<{ row: number; col: number; value: number }>) => void;
  applyMyColoredTileChanges: (changes: Array<{ row: number; col: number; value: number }>) => void;
}

const COLOR_NONE = 0;

export default function useColoredTileProcessing({
  padColorTiles,
  startPoint,
  cachingColorTiles,
  cachingMyColoredTiles,
  cursorPosition,
  cursorOriginPosition,
  renderStartPoint,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setColorTiles,
  setRenderColorTiles,
  setRenderMyColoredTiles,
  applyColorChanges,
  applyMyColoredTileChanges,
}: UseColoredTileProcessingOptions) {
  const processHexData = useCallback(
    (end_x: number, end_y: number, start_x: number, start_y: number, hexData: string, type: 'All' | 'PART', currentStartPoint: XYType, referenceGrid: TileGrid) => {
      const rowlengthBytes = Math.abs(end_x - start_x + 1) << 1;
      const tilesPerRow = rowlengthBytes >> 1;
      const columnlength = Math.abs(start_y - end_y + 1);

      const isAll = type === 'All';
      const yOffset = end_y - currentStartPoint.y;
      const xOffset = isAll ? 0 : end_x + 1 - currentStartPoint.x;

      const totalTiles = columnlength * tilesPerRow;
      const changes: Array<{ row: number; col: number; value: number }> = [];

      for (let tileIndex = 0; tileIndex < totalTiles; tileIndex++) {
        const rowIndex = Math.floor(tileIndex / tilesPerRow);
        const colIndex = tileIndex % tilesPerRow;

        const reversedI = columnlength - 1 - rowIndex;
        const row = reversedI + yOffset;

        if (row < 0 || row >= referenceGrid.height) continue;
        if (referenceGrid.width === 0) continue;

        const tStart = Math.max(0, -xOffset);
        const tEnd = Math.min(tilesPerRow, referenceGrid.width - xOffset);
        if (colIndex < tStart || colIndex >= tEnd) continue;

        const byteOffset = rowIndex * rowlengthBytes + (colIndex << 1);
        const firstChar = hexData.charCodeAt(byteOffset);
        const secondChar = hexData.charCodeAt(byteOffset + 1);

        const n0 = firstChar < 128 ? HEX_NIBBLE[firstChar] : -1;
        const n1 = secondChar < 128 ? HEX_NIBBLE[secondChar] : -1;
        if (n0 < 0 || n1 < 0) continue;

        const value = (n0 << 4) | n1;

        const col = colIndex + xOffset;
        if (referenceGrid.get(row, col) !== value) changes.push({ row, col, value });
      }

      return changes;
    },
    [],
  );

  const replaceColoredTiles = useCallback(
    async (end_x: number, end_y: number, start_x: number, start_y: number, coloredTilesData: string, myTilesData: string, type: 'All' | 'PART') => {
      if (coloredTilesData.length === 0 && myTilesData.length === 0) return;

      if (type === 'All') padColorTiles(start_x, start_y, end_x, end_y, Direction.ALL);

      const innerStartX = start_x + 1;
      const innerEndX = end_x - 1;

      const { colorTiles, myColoredTiles } = useColoredTileStore.getState();

      if (coloredTilesData.length > 0) {
        const colorChanges = processHexData(innerEndX, end_y, innerStartX, start_y, coloredTilesData, type, startPoint, colorTiles);
        if (colorChanges.length > 0) applyColorChanges(colorChanges);
      }

      if (myTilesData.length > 0) {
        const myChanges = processHexData(innerEndX, end_y, innerStartX, start_y, myTilesData, type, startPoint, myColoredTiles);
        if (myChanges.length > 0) applyMyColoredTileChanges(myChanges);
      }
    },
    [padColorTiles, processHexData, startPoint, applyColorChanges, applyMyColoredTileChanges],
  );

  const shiftGrid = useCallback((grid: TileGrid, offsetX: number, offsetY: number, fillValue: number): TileGrid => {
    if (grid.isEmpty) return TileGrid.empty();
    if (offsetX === 0 && offsetY === 0) return grid;

    const w = grid.width;
    const h = grid.height;
    const srcData = grid.data;
    const result = new TileGrid(w, h, fillValue);
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
  }, []);

  const computedRenderColorTiles = useMemo(() => {
    const offsetX = cursorOriginPosition.x - cursorPosition.x;
    const offsetY = cursorOriginPosition.y - cursorPosition.y;
    return shiftGrid(cachingColorTiles, offsetX, offsetY, COLOR_NONE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachingColorTiles, cursorOriginPosition, renderStartPoint]);

  const computedRenderMyColoredTiles = useMemo(() => {
    const offsetX = cursorOriginPosition.x - cursorPosition.x;
    const offsetY = cursorOriginPosition.y - cursorPosition.y;
    return shiftGrid(cachingMyColoredTiles, offsetX, offsetY, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachingMyColoredTiles, cursorOriginPosition, renderStartPoint]);

  useLayoutEffect(() => {
    setRenderColorTiles(computedRenderColorTiles);
  }, [computedRenderColorTiles, setRenderColorTiles]);

  useLayoutEffect(() => {
    setRenderMyColoredTiles(computedRenderMyColoredTiles);
  }, [computedRenderMyColoredTiles, setRenderMyColoredTiles]);

  return { replaceColoredTiles };
}
