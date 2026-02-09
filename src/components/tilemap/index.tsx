'use client';
import { Container, Sprite, Stage } from '@pixi/react';
import { cloneElement, useLayoutEffect, useMemo, useRef, useEffect, useState } from 'react';
import { Texture, SCALE_MODES, MIPMAP_MODES, WRAP_MODES, Container as PixiContainer, Sprite as PixiSprite } from 'pixi.js';
import RenderPaths from '@/assets/renderPaths.json';
import { useCursorStore } from '@/store/cursorStore';
import useScreenSize from '@/hooks/useScreenSize';
import { fillCtxAndPath as fillPathInCtx, makePath2d, hexToRgb, lerp, canvasToTexture } from '@/utils';
import { Tile, isTileClosedOrFlag, isTileBomb, isTileFlag, getFlagColor, getTileChecker } from '@/utils/tileGrid';
import { CURSOR_COLORS } from '@/constants';
import { useRenderTiles, useTileSize } from '@/store/tileStore';

interface TilemapProps {
  tilePadWidth: number;
  tilePadHeight: number;
  className?: string;
}

export default function Tilemap({ tilePadWidth, tilePadHeight, className }: TilemapProps) {
  // Get tiles and tileSize from zustand store
  const tiles = useRenderTiles();
  const tileSize = useTileSize();
  // constants
  const { flagPaths, tileColors, countColors, boomPaths } = RenderPaths;
  const { outer, inner } = tileColors;
  // stores
  const { zoom } = useCursorStore();
  const { windowHeight, windowWidth } = useScreenSize();
  // texture cache (persistent across renders)
  const cachedTexturesRef = useRef(new Map<string, Texture>());
  const numberTexturesRef = useRef(new Map<number, Texture>());
  const [texturesReady, setTexturesReady] = useState(false);
  const [numbersReady, setNumbersReady] = useState(false);
  const makeSpriteMap = () => new Map<string, JSX.Element>();
  // CLOSED/FLAGGED tiles pooling layer (imperative Pixi for max perf)
  const closedLayerRef = useRef<PixiContainer | null>(null);
  const closedPoolRef = useRef<{ outer: PixiSprite; inner: PixiSprite }[]>([]);
  // Generate textures for tiles, boom, and flags
  const cachedSpritesRef = useRef({
    outerCachedSprite: makeSpriteMap(),
    innerCachedSprite: makeSpriteMap(),
    boomCachedSprite: makeSpriteMap(),
    flagCachedSprite: makeSpriteMap(),
    numberCachedSprite: makeSpriteMap(),
  });

  const getCtx = (canvas: HTMLCanvasElement): CanvasRenderingContext2D =>
    canvas.getContext('2d', { willReadFrequently: false, desynchronized: true })!;

  // Concurrency limiter to avoid overwhelming main thread/GPU during mass texture creation
  const createLimiter = (maxConcurrent: number) => {
    let activeCount = 0;
    const queue: Array<() => void> = [];
    const runNext = () => {
      if (activeCount >= maxConcurrent) return;
      const nextTask = queue.shift();
      if (!nextTask) return;
      activeCount++;
      nextTask();
    };
    return <T,>(task: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const execute = (d?: boolean) => {
          const taskPromise = task();
          taskPromise.then(resolve);
          taskPromise.catch(reject);
          taskPromise.finally(() => {
            if (!d) activeCount--;
            runNext();
          });
        };

        if (activeCount >= maxConcurrent) queue.push(execute);
        else execute(true);
      });
  };

  useEffect(() => {
    // Pre-render number textures (1-8) in parallel
    const size = tileSize;
    const build = async () => {
      const promises: Promise<void>[] = [];
      const limit = createLimiter(8);
      const local = new Map<number, Texture>();
      for (let num = 1; num <= countColors.length; num++) {
        promises.push(
          limit(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = getCtx(canvas);
            if (!ctx) return;
            ctx.clearRect(0, 0, size, size);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${(size * 0.6) >>> 0}px LOTTERIACHAB`;
            ctx.fillStyle = countColors[num - 1];
            ctx.imageSmoothingEnabled = false;
            ctx.fillText(`${num}`, size / 2, size / 2);
            const tex = await canvasToTexture(canvas, size, size, 1);
            local.set(num, tex);
          }),
        );
      }
      await Promise.all(promises);
      numberTexturesRef.current = local;
      setNumbersReady(true);
    };
    build();

    // Build textures (boom/flags + gradient tiles) and cache; heavy parts are parallelized
    const textureCache = cachedTexturesRef.current;
    const createTileTexture = (startColor: string, endColor: string) => {
      const key = `${startColor}${endColor}${tileSize}`;
      if (textureCache.has(key)) return;
      const tempCanvas = document.createElement('canvas');
      const tileMinializedSize = 4;
      tempCanvas.width = tempCanvas.height = tileMinializedSize;
      const ctx = getCtx(tempCanvas);
      if (!ctx) return;
      const startRGB = hexToRgb(startColor);
      const endRGB = hexToRgb(endColor);
      for (let x = 0; x < tileMinializedSize; x++) {
        const t = x / (tileMinializedSize - 1);
        const r = lerp(startRGB.r, endRGB.r, t);
        const g = lerp(startRGB.g, endRGB.g, t);
        const b = lerp(startRGB.b, endRGB.b, t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, 0, 1, tileMinializedSize);
      }
      const texture = Texture.from(tempCanvas);
      texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      texture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      texture.baseTexture.wrapMode = WRAP_MODES.CLAMP;
      texture.baseTexture.setSize(tileMinializedSize, tileMinializedSize);
      texture.baseTexture.resolution = 0.001;
      textureCache.set(key, texture);
    };

    // sync generation for gradients
    for (let i = 0; i < outer.length; i++) {
      createTileTexture(outer[i][0], outer[i][1]);
      createTileTexture(inner[i][0], inner[i][1]);
    }

    // parallel generation for boom + flags (with concurrency limit)
    const promises: Promise<void>[] = [];
    const limit = createLimiter(8);
    // boom
    promises.push(
      limit(async () => {
        const boomCanvas = document.createElement('canvas');
        const boomMinimalized = 3;
        boomCanvas.width = boomCanvas.height = tileSize / boomMinimalized;
        const boomCtx = getCtx(boomCanvas);
        if (!boomCtx) return;
        boomCtx.scale(zoom / boomMinimalized / 4, zoom / boomMinimalized / 4);
        fillPathInCtx(boomCtx, makePath2d(boomPaths[0]), 'rgba(0, 0, 0, 0.6)');
        fillPathInCtx(boomCtx, makePath2d(boomPaths[1]), 'rgba(0, 0, 0, 0.5)');
        const tex = await canvasToTexture(boomCanvas, tileSize / boomMinimalized, tileSize / boomMinimalized);
        textureCache.set('boom', tex);
      }),
    );
    // flags 0..3
    const flagMinimalized = 2;
    [0, 1, 2, 3].forEach(idx =>
      promises.push(
        limit(async () => {
          const flagCanvas = document.createElement('canvas');
          flagCanvas.width = flagCanvas.height = tileSize / flagMinimalized;
          const flagCtx = getCtx(flagCanvas);
          if (!flagCtx) return;
          const flagGradient = flagCtx.createLinearGradient(36.5, 212.5, 36.5, 259);
          flagGradient.addColorStop(0, '#E8E8E8');
          flagGradient.addColorStop(1, 'transparent');
          flagCtx.translate(flagCanvas.width / 6, flagCanvas.height / 6);
          flagCtx.scale(zoom / flagMinimalized / 4.5, zoom / flagMinimalized / 4.5);
          fillPathInCtx(flagCtx, makePath2d(flagPaths[0]), CURSOR_COLORS[idx]);
          fillPathInCtx(flagCtx, makePath2d(flagPaths[1]), flagGradient);
          const tex = await canvasToTexture(flagCanvas, tileSize, tileSize);
          textureCache.set(`flag${idx}`, tex);
        }),
      ),
    );

    Promise.all(promises).finally(() => setTexturesReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSize]);

  const computeVisibleBounds = (totalRows: number, totalCols: number, padW: number, padH: number, viewW: number, viewH: number, size: number) => {
    const startCol = Math.max(0, Math.ceil(padW - 1));
    const endCol = Math.min(totalCols - 1, (padW + (viewW + size) / (size || 1)) >>> 0);
    const startRow = Math.max(0, Math.ceil(padH - 1));
    const endRow = Math.min(totalRows - 1, (padH + (viewH + size) / (size || 1)) >>> 0);
    return { startCol, endCol, startRow, endRow };
  };

  // make numeric keys for number textures based on row and column and tile size
  const makeNumericKeys = (ri: number, ci: number, size: number) => {
    const tileKeyNum = ((ri * 131071 + ci) * 131 + (size | 0)) >>> 0;
    const key = (tileKeyNum * 10) >>> 0;
    return { tileKeyNum, key };
  };

  const getTileTexturesForContent = (content: number, defaults: { outerTexture?: Texture; innerTexture?: Texture }) => {
    if (!isTileClosedOrFlag(content)) return { ...defaults, closed: false };
    const isEven = getTileChecker(content);
    const textureCache = cachedTexturesRef.current;
    const [outerEven, innerEven] = [outer[isEven], inner[isEven]];
    const outerTexture = textureCache.get(`${outerEven[0]}${outerEven[1]}${tileSize}`) || defaults.outerTexture;
    const innerTexture = textureCache.get(`${innerEven[0]}${innerEven[1]}${tileSize}`) || defaults.innerTexture;
    return { outerTexture, innerTexture, closed: true } as const;
  };

  const snapTileEdges = (ci: number, ri: number, padW: number, padH: number, size: number) => {
    const xFloat = (ci - padW) * size;
    const yFloat = (ri - padH) * size;
    const xNextFloat = xFloat + size;
    const yNextFloat = yFloat + size;
    const startX = Math.round(xFloat);
    const startY = Math.round(yFloat);
    const endX = Math.round(xNextFloat);
    const endY = Math.round(yNextFloat);
    const w = endX - startX;
    const h = endY - startY;
    return { xFloat, yFloat, startX, startY, endX, endY, w, h };
  };

  // Cleanup Pixi.js resources on unmount
  useEffect(() => {
    const textures = cachedTexturesRef.current;
    const closedPool = closedPoolRef.current;
    const sprites = cachedSpritesRef.current;

    return () => {
      // Destroy all textures
      textures.forEach(texture => texture.destroy());
      textures.clear();

      // Destroy all sprites in the closed pool
      closedPool.forEach(({ outer, inner }) => {
        outer.destroy();
        inner.destroy();
      });
      closedPoolRef.current = [];

      // Remove all sprites from the cache
      Object.values(sprites).forEach(map => map.clear());
    };
  }, []);

  // Ensure CLOSED/FLAGGED pool exists and then apply entries in a single pass
  useLayoutEffect(() => {
    const layer = closedLayerRef.current;
    if (!layer) return;

    const approxVisible = Math.ceil((windowWidth / (tileSize || 1) + 2) * (windowHeight / (tileSize || 1) + 2));
    while (closedPoolRef.current.length < approxVisible) {
      const outer = new PixiSprite();
      outer.roundPixels = true;
      outer.eventMode = 'none' as unknown as never;
      outer.cullable = true;
      const inner = new PixiSprite();
      inner.roundPixels = true;
      inner.eventMode = 'none' as unknown as never;
      inner.cullable = true;
      layer.addChild(outer);
      layer.addChild(inner);
      closedPoolRef.current.push({ outer, inner });
    }
    for (let i = approxVisible; i < closedPoolRef.current.length; i++) {
      const { outer, inner } = closedPoolRef.current[i];
      outer.visible = inner.visible = false;
    }

    const { current } = closedPoolRef;
    let usedIdx = 0;
    while (usedIdx < closedEntries.length && usedIdx < current.length) {
      const { outerTexture, innerTexture, startX, startY, endX, endY } = closedEntries[usedIdx];
      const closed = current[usedIdx++];
      closed.outer.texture = outerTexture;
      closed.outer.x = startX;
      closed.outer.y = startY;
      closed.outer.width = closed.outer.height = tileSize;
      const pad = 5 * zoom;
      const startXFloat = Math.round(startX + pad);
      const startYFloat = Math.round(startY + pad);
      const endXFloat = Math.round(endX - pad);
      const endYFloat = Math.round(endY - pad);
      closed.inner.x = startXFloat;
      closed.inner.y = startYFloat;
      closed.inner.texture = innerTexture;
      closed.inner.width = Math.max(0, endXFloat - startXFloat);
      closed.inner.height = Math.max(0, endYFloat - startYFloat);
      closed.outer.visible = closed.inner.visible = true;
    }
    while (usedIdx < current.length) current[usedIdx].outer.visible = current[usedIdx++].inner.visible = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  // Memoize sprites creation using cached base sprites from useRef
  const { outerSprites, innerSprites, boomSprites, flagSprites, textElements, closedEntries, bgKey } = useMemo(() => {
    const emptySprites = { outerSprites: [], innerSprites: [], boomSprites: [], flagSprites: [], textElements: [], closedEntries: [], bgKey: '' };
    // Compute visible bounds once (avoid per-tile bounds check)
    const totalRows = tiles.height;
    if (totalRows === 0) return emptySprites;
    const totalCols = tiles.width;
    if (totalCols === 0) return emptySprites;
    const { startCol, endCol, startRow, endRow } = computeVisibleBounds(
      totalRows,
      totalCols,
      tilePadWidth,
      tilePadHeight,
      windowWidth,
      windowHeight,
      tileSize,
    );

    if (startCol > endCol || startRow > endRow || !Number.isFinite(startCol + endCol + startRow + endRow)) return emptySprites;

    // Preallocate arrays (upper bound)
    const rowsCount = Math.max(0, (endRow - startRow + 1) | 0);
    const colsCount = Math.max(0, (endCol - startCol + 1) | 0);
    let maxVisibleTiles = rowsCount * colsCount;
    if (!Number.isFinite(maxVisibleTiles) || maxVisibleTiles < 0) maxVisibleTiles = 0;
    const outerSprites: JSX.Element[] = new Array(maxVisibleTiles);
    const innerSprites: JSX.Element[] = new Array(maxVisibleTiles);
    const boomSprites: JSX.Element[] = new Array(maxVisibleTiles);
    const flagSprites: JSX.Element[] = new Array(maxVisibleTiles);
    const textElements: JSX.Element[] = new Array(maxVisibleTiles);
    const closedEntries: { startX: number; startY: number; endX: number; endY: number; outerTexture: Texture; innerTexture: Texture }[] = [];
    let [outerIdx, innerIdx, boomIdx, flagIdx, textIdx] = [0, 0, 0, 0, 0];
    let [openedCount, openedAccumulator] = [0, 0];

    const {
      outerCachedSprite: outerCache,
      innerCachedSprite: innerCache,
      boomCachedSprite: boomCache,
      flagCachedSprite: flagCache,
      numberCachedSprite: numberCache,
    } = cachedSpritesRef.current;

    // Select textures based on tile content with bounds-safe defaults
    const textureCache = cachedTexturesRef.current;
    const defaultTextures = {
      outerTexture: textureCache.get(`${outer[2][0]}${outer[2][1]}${tileSize}`),
      innerTexture: textureCache.get(`${inner[2][0]}${inner[2][1]}${tileSize}`),
    } as const;
    if (!defaultTextures.outerTexture || !defaultTextures.innerTexture) return emptySprites;

    for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
      for (let colIdx = startCol; colIdx <= endCol; colIdx++) {
        const { xFloat, yFloat, startX, startY, endX, endY, w, h } = snapTileEdges(colIdx, rowIdx, tilePadWidth, tilePadHeight, tileSize);
        const content = tiles.get(rowIdx, colIdx);
        if (content === Tile.FILL) continue;
        const { outerTexture, innerTexture, closed } = getTileTexturesForContent(content, defaultTextures);
        const { key } = makeNumericKeys(rowIdx, colIdx, tileSize);

        // opened tiles accumulator for bgKey
        if (!closed) {
          openedCount++;
          const hash = ((rowIdx * 4099) ^ (colIdx * 131)) >>> 0; // make it to unsigned integer number
          openedAccumulator = (openedAccumulator + hash + content) >>> 0; // numeric tile value directly
        }

        // Outer sprite
        if (outerTexture) {
          const outerKey = `${outerTexture.baseTexture.uid}${tileSize}`;
          const baseOuter = outerCache.get(outerKey) ?? <Sprite cullable={false} roundPixels={true} eventMode="none" texture={outerTexture} />;
          outerCache.set(outerKey, baseOuter);
          if (!closed) {
            const { width, height } = outerTexture;
            const scale = { x: w / width, y: h / height };
            outerSprites[outerIdx++] = cloneElement(baseOuter, { key, x: startX, y: startY, scale });
          }
        }

        // Inner sprite
        if (innerTexture) {
          const innerKey = `${innerTexture.baseTexture.uid}${tileSize}`;
          // Inner padding: 5px on each side scaled by zoom, then snapped per-edge
          const pad = 5 * zoom;
          const startXFloat = Math.round(xFloat + pad);
          const startYFloat = Math.round(yFloat + pad);
          const endXFloat = Math.round(startX + w - pad);
          const endYFloat = Math.round(startY + h - pad);
          const iw = Math.max(0, endXFloat - startXFloat);
          const ih = Math.max(0, endYFloat - startYFloat);
          const baseInner = innerCache.get(innerKey) ?? <Sprite cullable={false} roundPixels={true} eventMode="none" texture={innerTexture} />;
          innerCache.set(innerKey, baseInner);
          if (closed) closedEntries.push({ startX, startY, endX, endY, outerTexture: outerTexture!, innerTexture: innerTexture! });
          else {
            const { width, height } = innerTexture;
            const scale = { x: iw / width, y: ih / height };
            innerSprites[innerIdx++] = cloneElement(baseInner, { key, x: startXFloat, y: startYFloat, scale }); // snapped inner
          }
        }

        // Boom sprite
        if (isTileBomb(content) && texturesReady) {
          const boomKey = `boom${tileSize}`;
          const texture = textureCache.get('boom');
          const baseBoom = boomCache.get(boomKey) ?? <Sprite cullable={true} roundPixels={true} eventMode="none" texture={texture} />;
          boomCache.set(boomKey, baseBoom);
          if (!texture) continue;
          const { width, height } = texture;
          const scale = { x: w / width, y: h / height };
          boomSprites[boomIdx++] = cloneElement(baseBoom, { key, x: startX, y: startY, scale });
        }

        // Flag sprite
        if (isTileFlag(content) && texturesReady) {
          const flagIndex = getFlagColor(content);
          const flagKey = `flag${flagIndex}${tileSize}`;
          const texture = textureCache.get(`flag${flagIndex}`);
          const baseFlag = flagCache.get(flagKey) ?? <Sprite cullable={true} roundPixels={true} eventMode="none" texture={texture} anchor={0.5} />;
          flagCache.set(flagKey, baseFlag);
          if (!texture) continue;
          const { width, height } = texture;
          const scale = { x: w / width, y: h / height };
          flagSprites[flagIdx++] = cloneElement(baseFlag, { key, x: startX + tileSize / 2, y: startY + tileSize / 2, scale });
        }

        const texture = numbersReady && content >= 1 && content <= 7 ? numberTexturesRef.current.get(content) : undefined;
        if (!texture) continue;
        // Number sprite elements
        const keyNum = `num${content}${tileSize}`;
        const baseNum = numberCache.get(keyNum) ?? <Sprite cullable={true} roundPixels={true} eventMode="none" texture={texture} anchor={0.5} />;
        numberCache.set(keyNum, baseNum);
        const { width, height } = texture;
        const scale = { x: w / width, y: h / height };
        textElements[textIdx++] = cloneElement(baseNum, { key: key + 4, x: startX + tileSize / 2, y: startY + tileSize / 2, scale });
      }
    }
    const bgKey = `${tileSize}${openedCount}${openedAccumulator}`;
    return {
      outerSprites: outerSprites.slice(0, outerIdx),
      innerSprites: innerSprites.slice(0, innerIdx),
      boomSprites: boomSprites.slice(0, boomIdx),
      flagSprites: flagSprites.slice(0, flagIdx),
      textElements: textElements.slice(0, textIdx),
      closedEntries,
      bgKey,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  if (!texturesReady || !numbersReady) return null;
  return (
    <Stage
      id="Tilemap"
      className={className}
      width={windowWidth}
      height={windowHeight}
      options={{
        backgroundColor: 0x808080,
        resolution: 1,
        antialias: false,
        powerPreference: 'low-power',
        autoDensity: false,
        preserveDrawingBuffer: false,
        sharedTicker: true,
      }}
    >
      <Container name={'container'} sortableChildren={false} eventMode="none" cacheAsBitmap={false} cullable={true}>
        {texturesReady && (
          <Container name={'background'} eventMode="none" cacheAsBitmap={true} key={`bg${bgKey}`}>
            {outerSprites}
            {innerSprites}
            {textElements}
          </Container>
        )}
        <Container name={'closed-layer'} ref={closedLayerRef} eventMode="none" sortableChildren={false} />
        {boomSprites}
        {flagSprites}
      </Container>
    </Stage>
  );
}
