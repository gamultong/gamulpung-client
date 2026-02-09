'use client';
/** style */
import S from './page.module.scss';

/** hooks */
import { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback } from 'react';
import useScreenSize from '@/hooks/useScreenSize';
import { useClickStore } from '@/store/interactionStore';

/** components */
import CanvasRenderComponent from '@/components/canvas';
import useWebSocketStore from '@/store/websocketStore';
import Inactive from '@/components/inactive';
import CanvasDashboard from '@/components/canvasDashboard';
import TutorialStep from '@/components/tutorialstep';
import ScoreBoardComponent from '@/components/scoreboard';
import { SendMessageEvent, SendSetWindowPayloadType, XYType, Direction } from '@/types';
// WebGPU imports removed - using simple CPU processing only
import { VECTORIZED_TILE_LUT } from '@/utils/tiles';
import { TileGrid, Tile, isTileClosedOrFlag, makeClosedTile, makeFlagTile } from '@/utils/tileGrid';
import { initWasm, isWasmReady, processHexTilesWasm } from '@/utils/wasmTileEngine';
import useMessageHandler from '@/hooks/useMessageHandler';
import { useCursorStore } from '@/store/cursorStore';
import { useTileStore, useTiles } from '@/store/tileStore';
import SkillTree from '@/components/skilltree';

export default function Play() {
  /** constants */
  const RENDER_RANGE = 1.5;
  const ORIGIN_TILE_SIZE = 80;
  const MAX_TILE_COUNT = 20000;
  const WS_URL = `${process.env.NEXT_PUBLIC_WS_HOST}/session`;

  /** stores */
  const {} = useClickStore();
  const { isOpen, sendMessage, connect, disconnect } = useWebSocketStore();
  // for states
  const { position: cursorPosition, zoom, originPosition: cursorOriginPosition } = useCursorStore();
  // for movings
  const { zoomUp, zoomDown, setZoom } = useCursorStore();
  // tile store - use selectors for better performance
  const cachingTiles = useTiles();
  const {
    startPoint,
    endPoint,
    renderStartPoint,
    setRenderTiles,
    setStartPoint,
    setEndPoint,
    setRenderStartPoint,
    setTileSize,
    padtiles,
    applyTileChanges,
    reset: resetTiles,
  } = useTileStore();

  /** hooks */
  const { windowWidth, windowHeight } = useScreenSize();

  /** states */
  const [leftReviveTime, setLeftReviveTime] = useState<number>(-1); // secs
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const reviveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectedRef = useRef<boolean>(false);

  const zoomHandler = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['-', '='].includes(key)) e.preventDefault();
    switch (key) {
      case '-':
        zoomDown();
        break;
      case '=':
        zoomUp();
        break;
      // case 'w':
      //   e.preventDefault();
      //   moveUp();
      //   break;
      // case 's':
      //   e.preventDefault();
      //   moveDown();
      //   break;
      // case 'a':
      //   e.preventDefault();
      //   moveLeft();
      //   break;
      // case 'd':
      //   e.preventDefault();
      //   moveRight();
      //   break;
    }
  };

  // Pre-initialize WASM tile engine (non-blocking)
  useEffect(() => {
    initWasm().catch(err => console.warn('WASM tile engine init failed, will use JS fallback:', err));
  }, []);

  /** Initialize Browser Events and Disconnect websocket when this Component is unmounted */
  useLayoutEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    setIsInitialized(false);
    setZoom(1);
    document.addEventListener('keydown', zoomHandler);
    return () => {
      document.documentElement.style.overflow = 'auto';
      document.removeEventListener('keydown', zoomHandler);

      // clear all timers
      if (reviveTimerRef.current) {
        clearTimeout(reviveTimerRef.current);
        reviveTimerRef.current = null;
      }

      // force disconnect
      disconnect();

      // reset states
      resetTiles();
      setIsInitialized(false);
      setLeftReviveTime(-1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Initialize
   * Re-connect websocket when websocket is closed state.
   * */
  useLayoutEffect(() => {
    if (isOpen || startPoint.x === endPoint.x || endPoint.y === startPoint.y) return;
    setLeftReviveTime(-1);
    // const [view_width, view_height] = [endPoint.x - startPoint.x + 1, endPoint.y - startPoint.y + 1];
    if (!connectedRef.current) {
      connect(WS_URL);
      connectedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, startPoint]);

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

      // This is temporary fix for the issue of the tiles not being updated correctly when the window is zoomed in or out.
      const isAll = type === 'All';
      const yOffset = end_y - currentStartPoint.y;
      const xOffset = isAll ? 0 : start_x - currentStartPoint.x - 1;

      const actualEndIndex = endIndex === -1 ? columnlength * tilesPerRow : endIndex;
      const changes: Array<{ row: number; col: number; value: number }> = [];

      // Get current tiles from store (TileGrid)
      const tiles = useTileStore.getState().tiles;

      for (let tileIndex = startIndex; tileIndex < actualEndIndex; tileIndex++) {
        // Calculate row and column indices
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
        // Use absolute coordinates for checker calculation to match computedRenderTiles
        const checker = (col + yAbs + currentStartPoint.x) & 1;

        // Direct numeric tile encoding (no string allocation)
        let value: number = Tile.FILL;
        if (tileType < 8) value = tileType; // 0-7 maps directly to OPEN_0..OPEN_7
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

      let allChanges: Array<{ row: number; col: number; value: number }>;

      // ─── WASM fast path ───
      if (isWasmReady()) {
        const tiles = useTileStore.getState().tiles;
        allChanges = await processHexTilesWasm(
          unsortedTiles,
          tiles,
          innerEndX,
          end_y,
          innerStartX,
          start_y,
          startPoint.x,
          startPoint.y,
          isAll,
        );
      } else {
        // ─── JS fallback ───
        allChanges = processTileData(innerEndX, end_y, innerStartX, start_y, unsortedTiles, type, startPoint);
      }

      // Apply all changes to tiles (single clone via Uint8Array.slice)
      applyTileChanges(allChanges);
      console.log('replace', performance.now());
    },
    [padtiles, processTileData, startPoint, applyTileChanges],
  );

  const getCurrentTileWidthAndHeight = useCallback(() => {
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    // Use the exact same calculation as tilePaddingWidth / tilePaddingHeight
    const width = ((windowWidth * RENDER_RANGE) / newTileSize / 2) >>> 0;
    const height = ((windowHeight * RENDER_RANGE) / newTileSize / 2) >>> 0;
    return { width, height };
  }, [zoom, windowWidth, windowHeight]);

  /** Message handler for tile processing */
  useMessageHandler({
    getCurrentTileWidthAndHeight,
    replaceTiles,
    setLeftReviveTime,
    setIsInitialized,
  });

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
      const result = new TileGrid(cachingTiles.width, cachingTiles.height);
      const srcData = cachingTiles.data;
      const dstData = result.data;
      const w = cachingTiles.width;
      const h = cachingTiles.height;

      for (let row = 0; row < h; row++) {
        const srcRowIndex = row + offsetY;
        const dstRowOffset = row * w;

        // Bounds check for source row
        if (srcRowIndex < 0 || srcRowIndex >= h) {
          dstData.fill(Tile.FILL, dstRowOffset, dstRowOffset + w);
          continue;
        }

        const srcRowOffset = srcRowIndex * w;

        for (let col = 0; col < w; col++) {
          const srcColIndex = col + offsetX;

          // Bounds check for source column
          if (srcColIndex < 0 || srcColIndex >= w) {
            dstData[dstRowOffset + col] = Tile.FILL;
            continue;
          }

          const srcTile = srcData[srcRowOffset + srcColIndex];

          if (srcTile === Tile.FILL) {
            dstData[dstRowOffset + col] = Tile.FILL;
            continue;
          }

          // For closed/flag tiles, recompute checkerboard with new absolute coordinates
          if (isTileClosedOrFlag(srcTile)) {
            const absX = renderStartPoint.x + col;
            const absY = renderStartPoint.y + row;
            const checkerBit = (absX + absY) & 1;
            dstData[dstRowOffset + col] = (srcTile & 0xfe) | checkerBit;
          } else {
            // Fast path for opened/bomb tiles - no transformation needed
            dstData[dstRowOffset + col] = srcTile;
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

  /** Reset screen range when cursor position or screen size changes */
  useLayoutEffect(() => {
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    const [tilePaddingWidth, tilePaddingHeight] = [
      ((windowWidth * RENDER_RANGE) / newTileSize / 2) >>> 0,
      ((windowHeight * RENDER_RANGE) / newTileSize / 2) >>> 0,
    ];

    if (tilePaddingHeight < 1 || tilePaddingWidth < 1) return;
    setStartPoint({
      x: cursorPosition.x - tilePaddingWidth,
      y: cursorPosition.y - tilePaddingHeight,
    });
    setEndPoint({
      x: cursorPosition.x + tilePaddingWidth,
      y: cursorPosition.y + tilePaddingHeight,
    });

    setRenderStartPoint({
      x: cursorOriginPosition.x - tilePaddingWidth,
      y: cursorOriginPosition.y - tilePaddingHeight,
    });
    setTileSize(newTileSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, cursorOriginPosition, cursorPosition, isInitialized]);

  /** Handling zoom event, same as the initial request */
  useLayoutEffect(() => {
    if (!isInitialized) return;
    const payload: SendSetWindowPayloadType = getCurrentTileWidthAndHeight();
    sendMessage(SendMessageEvent.SET_WINDOW, payload);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, isInitialized]);

  useEffect(() => {
    if (leftReviveTime > 0) reviveTimerRef.current = setTimeout(() => setLeftReviveTime(e => (e > 0 ? e - 1 : e)), 1000);
    return () => {
      if (reviveTimerRef.current) {
        clearTimeout(reviveTimerRef.current);
        reviveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftReviveTime]);

  return (
    <div className={S.page}>
      {leftReviveTime > 0 && <Inactive time={leftReviveTime} />}
      <TutorialStep />
      <ScoreBoardComponent />
      <SkillTree />
      <CanvasDashboard renderRange={RENDER_RANGE} maxTileCount={MAX_TILE_COUNT} />
      <CanvasRenderComponent
        leftReviveTime={leftReviveTime}
        paddingTiles={RENDER_RANGE}
        cursorOriginX={cursorOriginPosition.x}
        cursorOriginY={cursorOriginPosition.y}
      />
    </div>
  );
}
