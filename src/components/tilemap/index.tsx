'use client';
import { Container, Stage } from '@pixi/react';
import { useLayoutEffect, useRef, useEffect, useState } from 'react';
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

// ─── Sprite pool helper ───
// Creates / grows a pool of PixiSprites inside a container, returns the pool array.
function ensurePool(pool: PixiSprite[], container: PixiContainer, needed: number): PixiSprite[] {
  while (pool.length < needed) {
    const s = new PixiSprite();
    s.roundPixels = true;
    s.eventMode = 'none' as unknown as never;
    s.cullable = true;
    s.visible = false;
    container.addChild(s);
    pool.push(s);
  }
  return pool;
}

// Hide all sprites in a pool starting from index `from`
function hidePoolFrom(pool: PixiSprite[], from: number) {
  for (let i = from; i < pool.length; i++) pool[i].visible = false;
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

  // ─── Imperative Pixi sprite pools ───
  // Each layer has its own container ref + sprite pool
  const bgLayerRef = useRef<PixiContainer | null>(null);
  const closedLayerRef = useRef<PixiContainer | null>(null);
  const boomLayerRef = useRef<PixiContainer | null>(null);
  const flagLayerRef = useRef<PixiContainer | null>(null);

  // Pools: outer+inner for bg opened tiles, closed tiles, boom, flag, number
  const outerPoolRef = useRef<PixiSprite[]>([]);
  const innerPoolRef = useRef<PixiSprite[]>([]);
  const closedPoolRef = useRef<{ outer: PixiSprite; inner: PixiSprite }[]>([]);
  const boomPoolRef = useRef<PixiSprite[]>([]);
  const flagPoolRef = useRef<PixiSprite[]>([]);
  const numberPoolRef = useRef<PixiSprite[]>([]);

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

  // Cleanup Pixi.js resources on unmount
  useEffect(() => {
    const textures = cachedTexturesRef.current;
    const closedPool = closedPoolRef.current;

    return () => {
      textures.forEach(texture => texture.destroy());
      textures.clear();
      closedPool.forEach(({ outer, inner }) => {
        outer.destroy();
        inner.destroy();
      });
      closedPoolRef.current = [];
      outerPoolRef.current = [];
      innerPoolRef.current = [];
      boomPoolRef.current = [];
      flagPoolRef.current = [];
      numberPoolRef.current = [];
    };
  }, []);

  // ─── IMPERATIVE TILE RENDERING ───
  // Single useLayoutEffect that updates ALL sprite pools directly.
  // No useMemo, no JSX array creation, no React diffing.
  useLayoutEffect(() => {
    const bgLayer = bgLayerRef.current;
    const closedLayer = closedLayerRef.current;
    const boomLayer = boomLayerRef.current;
    const flagLayer = flagLayerRef.current;
    if (!bgLayer || !closedLayer || !boomLayer || !flagLayer) return;
    if (!texturesReady || !numbersReady) return;

    const totalRows = tiles.height;
    const totalCols = tiles.width;
    if (totalRows === 0 || totalCols === 0) return;

    // Compute visible bounds
    const startCol = Math.max(0, Math.ceil(tilePadWidth - 1));
    const endCol = Math.min(totalCols - 1, (tilePadWidth + (windowWidth + tileSize) / (tileSize || 1)) >>> 0);
    const startRow = Math.max(0, Math.ceil(tilePadHeight - 1));
    const endRow = Math.min(totalRows - 1, (tilePadHeight + (windowHeight + tileSize) / (tileSize || 1)) >>> 0);
    if (startCol > endCol || startRow > endRow || !Number.isFinite(startCol + endCol + startRow + endRow)) return;

    const textureCache = cachedTexturesRef.current;
    const defaultOuterTexture = textureCache.get(`${outer[2][0]}${outer[2][1]}${tileSize}`);
    const defaultInnerTexture = textureCache.get(`${inner[2][0]}${inner[2][1]}${tileSize}`);
    if (!defaultOuterTexture || !defaultInnerTexture) return;

    const rowsCount = Math.max(0, (endRow - startRow + 1) | 0);
    const colsCount = Math.max(0, (endCol - startCol + 1) | 0);
    const maxVisible = rowsCount * colsCount;
    const padPx = 5 * zoom;

    // Ensure pools are big enough
    ensurePool(outerPoolRef.current, bgLayer, maxVisible);
    ensurePool(innerPoolRef.current, bgLayer, maxVisible);
    ensurePool(boomPoolRef.current, boomLayer, maxVisible);
    ensurePool(flagPoolRef.current, flagLayer, maxVisible);
    ensurePool(numberPoolRef.current, bgLayer, maxVisible);

    // Ensure closed pool
    while (closedPoolRef.current.length < maxVisible) {
      const outerS = new PixiSprite();
      outerS.roundPixels = true;
      outerS.eventMode = 'none' as unknown as never;
      outerS.cullable = true;
      const innerS = new PixiSprite();
      innerS.roundPixels = true;
      innerS.eventMode = 'none' as unknown as never;
      innerS.cullable = true;
      closedLayer.addChild(outerS);
      closedLayer.addChild(innerS);
      closedPoolRef.current.push({ outer: outerS, inner: innerS });
    }

    let outerIdx = 0;
    let innerIdx = 0;
    let closedIdx = 0;
    let boomIdx = 0;
    let flagIdx = 0;
    let numIdx = 0;

    for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
      for (let colIdx = startCol; colIdx <= endCol; colIdx++) {
        const content = tiles.get(rowIdx, colIdx);
        if (content === Tile.FILL) continue;

        // Snap tile edges
        const xFloat = (colIdx - tilePadWidth) * tileSize;
        const yFloat = (rowIdx - tilePadHeight) * tileSize;
        const startX = Math.round(xFloat);
        const startY = Math.round(yFloat);
        const endX = Math.round(xFloat + tileSize);
        const endY = Math.round(yFloat + tileSize);
        const w = endX - startX;
        const h = endY - startY;

        // Determine textures
        const isClosed = isTileClosedOrFlag(content);
        let outerTexture: Texture;
        let innerTexture: Texture;
        if (isClosed) {
          const isEven = getTileChecker(content);
          const [oe, ie] = [outer[isEven], inner[isEven]];
          outerTexture = textureCache.get(`${oe[0]}${oe[1]}${tileSize}`) || defaultOuterTexture;
          innerTexture = textureCache.get(`${ie[0]}${ie[1]}${tileSize}`) || defaultInnerTexture;
        } else {
          outerTexture = defaultOuterTexture;
          innerTexture = defaultInnerTexture;
        }

        if (isClosed) {
          // ── Closed/Flagged tile: use closed pool ──
          const entry = closedPoolRef.current[closedIdx++];
          if (!entry) continue;
          entry.outer.texture = outerTexture;
          entry.outer.x = startX;
          entry.outer.y = startY;
          entry.outer.width = entry.outer.height = tileSize;
          entry.outer.visible = true;

          const sx = Math.round(startX + padPx);
          const sy = Math.round(startY + padPx);
          const ex = Math.round(endX - padPx);
          const ey = Math.round(endY - padPx);
          entry.inner.texture = innerTexture;
          entry.inner.x = sx;
          entry.inner.y = sy;
          entry.inner.width = Math.max(0, ex - sx);
          entry.inner.height = Math.max(0, ey - sy);
          entry.inner.visible = true;

          // Flag overlay
          if (isTileFlag(content)) {
            const flagIndex = getFlagColor(content);
            const fTex = textureCache.get(`flag${flagIndex}`);
            if (fTex) {
              const fs = flagPoolRef.current[flagIdx++];
              fs.texture = fTex;
              fs.anchor.set(0.5);
              fs.x = startX + tileSize / 2;
              fs.y = startY + tileSize / 2;
              fs.width = w;
              fs.height = h;
              fs.visible = true;
            }
          }
        } else {
          // ── Opened tile: use outer + inner pools ──
          const os = outerPoolRef.current[outerIdx++];
          os.texture = outerTexture;
          os.x = startX;
          os.y = startY;
          os.width = w;
          os.height = h;
          os.visible = true;

          const sx = Math.round(xFloat + padPx);
          const sy = Math.round(yFloat + padPx);
          const ex = Math.round(startX + w - padPx);
          const ey = Math.round(startY + h - padPx);
          const is = innerPoolRef.current[innerIdx++];
          is.texture = innerTexture;
          is.x = sx;
          is.y = sy;
          is.width = Math.max(0, ex - sx);
          is.height = Math.max(0, ey - sy);
          is.visible = true;

          // Boom sprite
          if (isTileBomb(content)) {
            const bTex = textureCache.get('boom');
            if (bTex) {
              const bs = boomPoolRef.current[boomIdx++];
              bs.texture = bTex;
              bs.x = startX;
              bs.y = startY;
              bs.width = w;
              bs.height = h;
              bs.visible = true;
            }
          }

          // Number sprite (1-7)
          if (content >= 1 && content <= 7) {
            const nTex = numberTexturesRef.current.get(content);
            if (nTex) {
              const ns = numberPoolRef.current[numIdx++];
              ns.texture = nTex;
              ns.anchor.set(0.5);
              ns.x = startX + tileSize / 2;
              ns.y = startY + tileSize / 2;
              ns.width = w;
              ns.height = h;
              ns.visible = true;
            }
          }
        }
      }
    }

    // Hide unused sprites in all pools
    hidePoolFrom(outerPoolRef.current, outerIdx);
    hidePoolFrom(innerPoolRef.current, innerIdx);
    hidePoolFrom(boomPoolRef.current, boomIdx);
    hidePoolFrom(flagPoolRef.current, flagIdx);
    hidePoolFrom(numberPoolRef.current, numIdx);
    for (let i = closedIdx; i < closedPoolRef.current.length; i++) {
      closedPoolRef.current[i].outer.visible = false;
      closedPoolRef.current[i].inner.visible = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, texturesReady, numbersReady]);

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
        <Container name={'background'} ref={bgLayerRef} eventMode="none" sortableChildren={false} />
        <Container name={'closed-layer'} ref={closedLayerRef} eventMode="none" sortableChildren={false} />
        <Container name={'boom-layer'} ref={boomLayerRef} eventMode="none" sortableChildren={false} />
        <Container name={'flag-layer'} ref={flagLayerRef} eventMode="none" sortableChildren={false} />
      </Container>
    </Stage>
  );
}
