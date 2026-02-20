'use client';
import { Container, Stage } from '@pixi/react';
import { useLayoutEffect, useRef, useEffect } from 'react';
import { Texture, Container as PixiContainer, Sprite as PixiSprite } from 'pixi.js';
import RenderPaths from '@/assets/renderPaths.json';
import { useCursorStore } from '@/store/cursorStore';
import useScreenSize from '@/hooks/useScreenSize';
import useTilemapTextures from '@/hooks/useTilemapTextures';
import { ensurePool, hidePoolFrom } from '@/utils/pixiSpritePool';
import { Tile, isTileClosedOrFlag, isTileBomb, isTileFlag, getFlagColor, getTileChecker } from '@/utils/tileGrid';
import { useRenderTiles, useTileSize } from '@/store/tileStore';

interface TilemapProps {
  tilePadWidth: number;
  tilePadHeight: number;
  className?: string;
}

export default function Tilemap({ tilePadWidth, tilePadHeight, className }: TilemapProps) {
  const tiles = useRenderTiles();
  const tileSize = useTileSize();
  const { tileColors } = RenderPaths;
  const { outer, inner } = tileColors;
  const { zoom } = useCursorStore();
  const { windowHeight, windowWidth } = useScreenSize();

  // Texture building (extracted hook)
  const { cachedTexturesRef, numberTexturesRef, texturesReady, numbersReady } = useTilemapTextures(tileSize, zoom);

  // ─── Imperative Pixi sprite pools ───
  const bgLayerRef = useRef<PixiContainer | null>(null);
  const closedLayerRef = useRef<PixiContainer | null>(null);
  const boomLayerRef = useRef<PixiContainer | null>(null);
  const flagLayerRef = useRef<PixiContainer | null>(null);

  const outerPoolRef = useRef<PixiSprite[]>([]);
  const innerPoolRef = useRef<PixiSprite[]>([]);
  const closedPoolRef = useRef<{ outer: PixiSprite; inner: PixiSprite }[]>([]);
  const boomPoolRef = useRef<PixiSprite[]>([]);
  const flagPoolRef = useRef<PixiSprite[]>([]);
  const numberPoolRef = useRef<PixiSprite[]>([]);

  // Cleanup sprite pools on unmount
  useEffect(() => {
    const closedPool = closedPoolRef.current;
    return () => {
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
        if (content === Tile.FILL) {
          // FILL을 닫힌 타일 모양으로 렌더링 (시각적으로만, 데이터는 변경 없음)
          const xFloat = (colIdx - tilePadWidth) * tileSize;
          const yFloat = (rowIdx - tilePadHeight) * tileSize;
          const startX = Math.round(xFloat);
          const startY = Math.round(yFloat);
          const endX = Math.round(xFloat + tileSize);
          const endY = Math.round(yFloat + tileSize);

          const checker = (rowIdx + colIdx) & 1;
          const [oe, ie] = [outer[checker], inner[checker]];
          const fillOuterTex = textureCache.get(`${oe[0]}${oe[1]}${tileSize}`) || defaultOuterTexture;
          const fillInnerTex = textureCache.get(`${ie[0]}${ie[1]}${tileSize}`) || defaultInnerTexture;

          const entry = closedPoolRef.current[closedIdx++];
          if (!entry) continue;
          entry.outer.texture = fillOuterTex;
          entry.outer.x = startX;
          entry.outer.y = startY;
          entry.outer.width = entry.outer.height = tileSize;
          entry.outer.visible = true;

          const sx = Math.round(startX + padPx);
          const sy = Math.round(startY + padPx);
          entry.inner.texture = fillInnerTex;
          entry.inner.x = sx;
          entry.inner.y = sy;
          entry.inner.width = Math.max(0, Math.round(endX - padPx) - sx);
          entry.inner.height = Math.max(0, Math.round(endY - padPx) - sy);
          entry.inner.visible = true;
          continue;
        }

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
