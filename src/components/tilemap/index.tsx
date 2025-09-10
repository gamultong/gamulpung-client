'use client';
import { Container, Sprite, Stage } from '@pixi/react';
import { cloneElement, useLayoutEffect, useMemo, useRef } from 'react';
import { Texture, SCALE_MODES, MIPMAP_MODES, WRAP_MODES, Container as PixiContainer, Sprite as PixiSprite } from 'pixi.js';
import Paths from '@/assets/paths.json';
import { useCursorStore } from '@/store/cursorStore';
import useScreenSize from '@/hooks/useScreenSize';
import { TileContent } from '@/types';
import { fillCtxAndPath as fillPathInCtx, makePath2d } from '@/utils';

interface TilemapProps {
  tiles: string[][];
  tileSize: number;
  tilePaddingWidth: number;
  tilePaddingHeight: number;
  className?: string;
}

export default function Tilemap({ tiles, tileSize, tilePaddingWidth, tilePaddingHeight, className }: TilemapProps) {
  // constants
  const CURSOR_COLORS = useMemo(() => ['#FF4D00', '#F0C800', '#0094FF', '#BC3FDC'], []);
  const { flagPaths, tileColors, countColors, boomPaths } = Paths;
  const { outer, inner } = tileColors;

  // stores
  const { zoom } = useCursorStore();
  const { windowHeight, windowWidth } = useScreenSize();

  // texture cache (persistent across renders)
  const cachedTexturesRef = useRef(new Map<string, Texture>());
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

  const getContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D =>
    canvas.getContext('2d', { willReadFrequently: false, desynchronized: true })!;

  // Memoize textures access/creation: create once and reuse from ref cache
  const textures = useMemo(() => {
    const textureCache = cachedTexturesRef.current;

    const createTileTexture = (color1: string, color2: string) => {
      const key = `${color1}-${color2}-${tileSize}`;
      if (textureCache.has(key)) return textureCache.get(key);

      const tempCanvas = document.createElement('canvas');
      const tileMinializedSize = 4; // fixed small size for pixelated look
      tempCanvas.width = tempCanvas.height = tileMinializedSize;
      const ctx = getContext(tempCanvas);
      if (!ctx) return;

      const hexToRgb = (hex: string) => {
        const normalized = hex.replace('#', '');
        const bigint = parseInt(normalized, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return { r, g, b };
      };

      const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

      const c1 = hexToRgb(color1);
      const c2 = hexToRgb(color2);

      // draw vertical stepped bands
      for (let x = 0; x < tileMinializedSize; x++) {
        const t = x / (tileMinializedSize - 1);
        const r = lerp(c1.r, c2.r, t);
        const g = lerp(c1.g, c2.g, t);
        const b = lerp(c1.b, c2.b, t);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
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

    // Textures for outer and inner tiles
    for (let i = 0; i < outer.length; i++) {
      createTileTexture(outer[i][0], outer[i][1]);
      createTileTexture(inner[i][0], inner[i][1]);
    }

    // Boom texture
    const boomCanvas = document.createElement('canvas');
    const boomMinimalized = 3;
    boomCanvas.width = boomCanvas.height = tileSize / boomMinimalized;
    const boomCtx = getContext(boomCanvas);
    if (boomCtx) {
      boomCtx.scale(zoom / boomMinimalized / 4, zoom / boomMinimalized / 4);
      fillPathInCtx(boomCtx, makePath2d(boomPaths[0]), 'rgba(0, 0, 0, 0.6)'); // fill boom inner
      fillPathInCtx(boomCtx, makePath2d(boomPaths[1]), 'rgba(0, 0, 0, 0.5)'); // fill boom outer

      const boomTexture = Texture.from(boomCanvas);
      boomTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      boomTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      boomTexture.baseTexture.setSize(tileSize / boomMinimalized, tileSize / boomMinimalized);

      textureCache.set('boom', boomTexture);
    }

    // Flag textures
    const flagMinimalized = 2;
    for (let i = 0; i < CURSOR_COLORS.length; i++) {
      const flagCanvas = document.createElement('canvas');
      flagCanvas.width = flagCanvas.height = tileSize / flagMinimalized;
      const flagCtx = getContext(flagCanvas);
      if (!flagCtx) continue;
      const flagGradient = flagCtx.createLinearGradient(36.5, 212.5, 36.5, 259);
      flagGradient.addColorStop(0, '#E8E8E8');
      flagGradient.addColorStop(1, 'transparent');
      flagCtx.translate(flagCanvas.width / 6, flagCanvas.height / 6);
      flagCtx.scale(zoom / flagMinimalized / 4.5, zoom / flagMinimalized / 4.5);

      fillPathInCtx(flagCtx, makePath2d(flagPaths[0]), CURSOR_COLORS[i]); // fill flag color
      fillPathInCtx(flagCtx, makePath2d(flagPaths[1]), flagGradient); // fill flag pole

      const flagTexture = Texture.from(flagCanvas);
      flagTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      flagTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      flagTexture.baseTexture.setSize(tileSize, tileSize);

      textureCache.set(`flag-${i}`, flagTexture);
    }
    return textureCache;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSize]);

  // Pre-render number textures (1-8)
  const numberTextures = useMemo(() => {
    const map = new Map<number, Texture>();
    const size = tileSize;
    for (let n = 1; n <= countColors.length; n++) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = getContext(canvas);
      if (!ctx) continue;
      ctx.clearRect(0, 0, size, size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.floor(size * 0.6)}px LOTTERIACHAB`;
      ctx.fillStyle = String(countColors[n - 1]);
      ctx.imageSmoothingEnabled = false;
      ctx.fillText(String(n), size / 2, size / 2);
      const tex = Texture.from(canvas);
      tex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      tex.baseTexture.mipmap = MIPMAP_MODES.OFF;
      tex.baseTexture.wrapMode = WRAP_MODES.CLAMP;
      tex.baseTexture.setSize(size, size);
      tex.baseTexture.resolution = 1;
      map.set(n, tex);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSize]);

  // Ensure CLOSED/FLAGGED pool exists and size to approx visible tiles
  useLayoutEffect(() => {
    if (!closedLayerRef.current) return;
    const layer = closedLayerRef.current;
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
    // hide extras (retain for reuse)
    for (let i = approxVisible; i < closedPoolRef.current.length; i++) {
      const p = closedPoolRef.current[i];
      p.outer.visible = false;
      p.inner.visible = false;
    }
  }, [windowWidth, windowHeight, tileSize]);

  // Apply closed entries to pool each tiles update
  useLayoutEffect(() => {
    const pairs = closedPoolRef.current;
    let used = 0;
    for (let i = 0; i < (closedEntries?.length || 0) && used < pairs.length; i++) {
      const e = closedEntries[i];
      const p = pairs[used++];
      // outer (snapped per-edge)
      p.outer.texture = e.outerTexture;
      p.outer.x = e.x0;
      p.outer.y = e.y0;
      p.outer.width = e.x1 - e.x0;
      p.outer.height = e.y1 - e.y0;
      p.outer.visible = true;
      // inner with 5px padding
      const pad = 5 * zoom;
      const xi0 = Math.round(e.x0 + pad);
      const yi0 = Math.round(e.y0 + pad);
      const xi1 = Math.round(e.x1 - pad);
      const yi1 = Math.round(e.y1 - pad);
      p.inner.texture = e.innerTexture;
      p.inner.x = xi0;
      p.inner.y = yi0;
      p.inner.width = Math.max(0, xi1 - xi0);
      p.inner.height = Math.max(0, yi1 - yi0);
      p.inner.visible = true;
    }
    for (let i = used; i < pairs.length; i++) {
      pairs[i].outer.visible = false;
      pairs[i].inner.visible = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, tiles, tileSize, tilePaddingWidth, tilePaddingHeight, windowWidth, windowHeight]);

  // Memoize sprites creation using cached base sprites from useRef
  const { outerSprites, innerSprites, boomSprites, flagSprites, textElements, closedEntries, bgKey } = useMemo(() => {
    // Compute visible bounds once (avoid per-tile bounds check)
    const totalRows = tiles.length;
    const totalCols = tiles[0]?.length ?? 0;
    const startCol = Math.max(0, Math.ceil(tilePaddingWidth - 1));
    const endCol = Math.min(totalCols - 1, Math.floor(tilePaddingWidth + (windowWidth + tileSize) / (tileSize || 1)));
    const startRow = Math.max(0, Math.ceil(tilePaddingHeight - 1));
    const endRow = Math.min(totalRows - 1, Math.floor(tilePaddingHeight + (windowHeight + tileSize) / (tileSize || 1)));

    if (startCol > endCol || startRow > endRow || !Number.isFinite(startCol + endCol + startRow + endRow)) {
      return { outerSprites: [], innerSprites: [], boomSprites: [], flagSprites: [], textElements: [], closedEntries: [] };
    }

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
    const closedEntries: { x0: number; y0: number; x1: number; y1: number; outerTexture: Texture; innerTexture: Texture }[] = [];
    let outerIdx = 0,
      innerIdx = 0,
      boomIdx = 0,
      flagIdx = 0,
      textIdx = 0;
    let openedCount = 0;
    let openedAccumulator = 0;

    const {
      outerCachedSprite: outerCache,
      innerCachedSprite: innerCache,
      boomCachedSprite: boomCache,
      flagCachedSprite: flagCache,
      numberCachedSprite: numberCache,
    } = cachedSpritesRef.current;

    for (let ri = startRow; ri <= endRow; ri++) {
      for (let ci = startCol; ci <= endCol; ci++) {
        // Fractional tile sizes can cause seams if each tile rounds independently.
        // Snap to an integer grid per edge and derive width/height from neighbors.
        const xFloat = (ci - tilePaddingWidth) * tileSize;
        const yFloat = (ri - tilePaddingHeight) * tileSize;
        const xNextFloat = (ci + 1 - tilePaddingWidth) * tileSize;
        const yNextFloat = (ri + 1 - tilePaddingHeight) * tileSize;
        const x0 = Math.round(xFloat);
        const y0 = Math.round(yFloat);
        const x1 = Math.round(xNextFloat);
        const y1 = Math.round(yNextFloat);
        const w = x1 - x0;
        const h = y1 - y0;
        const content = tiles[ri][ci];
        // numeric keys to avoid per-tile template strings and GC
        const tileKeyNum = ((ri * 131071 + ci) * 131 + (tileSize | 0)) >>> 0;
        const typeKeyBase = (tileKeyNum * 10) >>> 0;

        // Select textures based on tile content with bounds-safe defaults
        let outerTexture = textures.get(`${outer[2][0]}-${outer[2][1]}-${tileSize}`);
        let innerTexture = textures.get(`${inner[2][0]}-${inner[2][1]}-${tileSize}`);
        const head0 = content[0] as string | number;
        const isClosedOrFlag = head0 === TileContent.CLOSED || head0 === TileContent.FLAGGED;
        if (isClosedOrFlag) {
          const isEven = +content.slice(-1) % 2;
          outerTexture = textures.get(`${outer[isEven][0]}-${outer[isEven][1]}-${tileSize}`);
          innerTexture = textures.get(`${inner[isEven][0]}-${inner[isEven][1]}-${tileSize}`);
        }
        // opened tiles accumulator for bgKey
        if (!isClosedOrFlag) {
          openedCount++;
          const hash = ((ri * 4099) ^ (ci * 131)) >>> 0;
          const head = typeof content === 'number' ? content : content.charCodeAt ? content.charCodeAt(0) : 0;
          openedAccumulator = (openedAccumulator + hash + (head | 0)) >>> 0;
        }

        // Outer sprite
        if (outerTexture) {
          const outerKey = `${outerTexture.baseTexture.uid}-${tileSize}`;
          const baseOuter = outerCache.get(outerKey) ?? <Sprite cullable={false} roundPixels={true} eventMode="none" texture={outerTexture} />;
          outerCache.set(outerKey, baseOuter);
          if ([TileContent.CLOSED, TileContent.FLAGGED].some(t => t === content[0])) {
            // pooled path
          } else {
            const bw = outerTexture.width || 1;
            const bh = outerTexture.height || 1;
            outerSprites[outerIdx++] = cloneElement(baseOuter, {
              key: typeKeyBase + 0,
              x: x0,
              y: y0,
              scale: { x: w / bw, y: h / bh },
            });
          }
        }

        // Inner sprite
        if (innerTexture) {
          const innerKey = `${innerTexture.baseTexture.uid}-${tileSize}`;
          // Inner padding: 5px on each side scaled by zoom, then snapped per-edge
          const pad = 5 * zoom;
          const xi0 = Math.round(xFloat + pad);
          const yi0 = Math.round(yFloat + pad);
          const xi1 = Math.round(xNextFloat - pad);
          const yi1 = Math.round(yNextFloat - pad);
          const iw = Math.max(0, xi1 - xi0);
          const ih = Math.max(0, yi1 - yi0);
          const baseInner = innerCache.get(innerKey) ?? <Sprite cullable={false} roundPixels={true} eventMode="none" texture={innerTexture} />;
          innerCache.set(innerKey, baseInner);
          if ([TileContent.CLOSED, TileContent.FLAGGED].some(t => t === content[0])) {
            closedEntries.push({ x0, y0, x1, y1, outerTexture: outerTexture!, innerTexture: innerTexture! });
          } else {
            const bw = innerTexture.width || 1;
            const bh = innerTexture.height || 1;
            innerSprites[innerIdx++] = cloneElement(baseInner, {
              key: typeKeyBase + 1,
              x: xi0,
              y: yi0,
              scale: { x: iw / bw, y: ih / bh },
            }); // snapped inner
          }
        }

        // Boom sprite
        if (content === TileContent.BOOM) {
          const boomKey = `boom-${tileSize}`;
          const baseBoom = boomCache.get(boomKey) ?? <Sprite cullable={true} roundPixels={true} eventMode="none" texture={textures.get('boom')} />;
          boomCache.set(boomKey, baseBoom);
          const boomTex = textures.get('boom');
          const bw = boomTex?.width || 1;
          const bh = boomTex?.height || 1;
          boomSprites[boomIdx++] = cloneElement(baseBoom, {
            key: typeKeyBase + 2,
            x: x0,
            y: y0,
            scale: { x: w / bw, y: h / bh },
          });
        }

        // Flag sprite
        if (content[0] === TileContent.FLAGGED) {
          const flagIndex = content[1];
          const flagKey = `flag-${flagIndex}-${tileSize}`;
          const baseFlag = flagCache.get(flagKey) ?? (
            <Sprite cullable={true} roundPixels={true} eventMode="none" texture={textures.get(`flag-${flagIndex}`)} anchor={0.5} />
          );
          flagCache.set(flagKey, baseFlag);
          const flagTex = textures.get(`flag-${flagIndex}`);
          const fbw = flagTex?.width || 1;
          const fbh = flagTex?.height || 1;
          flagSprites[flagIdx++] = cloneElement(baseFlag, {
            key: typeKeyBase + 3,
            x: Math.round((x0 + x1) / 2),
            y: Math.round((y0 + y1) / 2),
            scale: { x: w / fbw, y: h / fbh },
          });
        }

        // Number sprite elements
        if (+content > 0) {
          const num = +content;
          const tex = numberTextures.get(num);
          if (tex) {
            const keyNum = `num-${num}-${tileSize}`;
            const baseNum = numberCache.get(keyNum) ?? <Sprite cullable={true} roundPixels={true} eventMode="none" texture={tex} anchor={0.5} />;
            numberCache.set(keyNum, baseNum);
            const nbw = tex.width || 1;
            const nbh = tex.height || 1;
            textElements[textIdx++] = cloneElement(baseNum, {
              key: typeKeyBase + 4,
              x: Math.round((x0 + x1) / 2),
              y: Math.round((y0 + y1) / 2),
              scale: { x: w / nbw, y: h / nbh },
            });
          }
        }
      }
    }
    const bgKey = `${tileSize}-${openedCount}-${openedAccumulator}`;
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

  if (!textures.size || !numberTextures.size) return null;
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
        powerPreference: 'high-performance',
        autoDensity: false,
        preserveDrawingBuffer: false,
        clearBeforeRender: true,
        sharedTicker: true,
      }}
    >
      <Container name={'container'} sortableChildren={false} eventMode="none" cacheAsBitmap={false} cullable={true}>
        <Container name={'background'} eventMode="none" cacheAsBitmap={true} key={`bg-${bgKey}`}>
          {outerSprites}
          {innerSprites}
        </Container>
        <Container name={'closed-layer'} ref={closedLayerRef} eventMode="none" sortableChildren={false} />
        {textElements}
        {boomSprites}
        {flagSprites}
      </Container>
    </Stage>
  );
}
