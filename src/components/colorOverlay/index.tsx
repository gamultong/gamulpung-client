'use client';
import { Container, Stage } from '@pixi/react';
import { useLayoutEffect, useRef, useEffect, useState } from 'react';
import { Texture, SCALE_MODES, Container as PixiContainer, Graphics } from 'pixi.js';
import useScreenSize from '@/hooks/useScreenSize';
import { ensurePool, hidePoolFrom } from '@/utils/pixiSpritePool';
import { useRenderColorTiles } from '@/store/coloredTileStore';
import { useTileSize } from '@/store/tileStore';
import { useCursorStore } from '@/store/cursorStore';
import { COLORMAP, COLORMAP_HEX } from '@/types';

interface ColorOverlayProps {
  tilePadWidth: number;
  tilePadHeight: number;
  className?: string;
  style?: React.CSSProperties;
}

const OVERLAY_ALPHA = 0.5;
const OUTLINE_WIDTH = 3;
const OUTLINE_ALPHA = 0.85;

function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

function buildColorTextures(): Map<number, Texture> {
  const map = new Map<number, Texture>();
  for (const [colorIndex, hex] of Object.entries(COLORMAP_HEX)) {
    if (Number(colorIndex) === COLORMAP.NONE) continue;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 1, 1);
    const tex = Texture.from(canvas);
    tex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
    map.set(Number(colorIndex), tex);
  }
  return map;
}

export default function ColorOverlay({ tilePadWidth, tilePadHeight, className, style }: ColorOverlayProps) {
  const colorTiles = useRenderColorTiles();
  const tileSize = useTileSize();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { zoom } = useCursorStore();
  const { windowHeight, windowWidth } = useScreenSize();

  const colorLayerRef = useRef<PixiContainer | null>(null);
  const poolRef = useRef<import('pixi.js').Sprite[]>([]);
  const outlineGfxRef = useRef<Graphics | null>(null);

  const [colorTextures, setColorTextures] = useState<Map<number, Texture> | null>(null);

  useEffect(() => {
    setColorTextures(buildColorTextures());
    return () => {
      colorTextures?.forEach(tex => tex.destroy());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup pool on unmount
  useEffect(() => {
    return () => {
      poolRef.current = [];
    };
  }, []);

  useLayoutEffect(() => {
    const colorLayer = colorLayerRef.current;
    if (!colorLayer || !colorTextures) return;

    const totalRows = colorTiles.height;
    const totalCols = colorTiles.width;
    if (totalRows === 0 || totalCols === 0) {
      hidePoolFrom(poolRef.current, 0);
      return;
    }

    const startCol = Math.max(0, Math.ceil(tilePadWidth - 1));
    const endCol = Math.min(totalCols - 1, (tilePadWidth + (windowWidth + tileSize) / (tileSize || 1)) >>> 0);
    const startRow = Math.max(0, Math.ceil(tilePadHeight - 1));
    const endRow = Math.min(totalRows - 1, (tilePadHeight + (windowHeight + tileSize) / (tileSize || 1)) >>> 0);
    if (startCol > endCol || startRow > endRow || !Number.isFinite(startCol + endCol + startRow + endRow)) {
      hidePoolFrom(poolRef.current, 0);
      return;
    }

    const rowsCount = Math.max(0, (endRow - startRow + 1) | 0);
    const colsCount = Math.max(0, (endCol - startCol + 1) | 0);
    const maxVisible = rowsCount * colsCount;
    ensurePool(poolRef.current, colorLayer, maxVisible);

    let idx = 0;

    // Ensure Graphics object exists for outlines
    if (!outlineGfxRef.current) {
      outlineGfxRef.current = new Graphics();
      colorLayer.addChild(outlineGfxRef.current);
    }
    const gfx = outlineGfxRef.current;
    gfx.clear();

    for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
      for (let colIdx = startCol; colIdx <= endCol; colIdx++) {
        const colorValue = colorTiles.get(rowIdx, colIdx);
        if (colorValue === 0) continue; // COLORMAP.NONE

        const tex = colorTextures.get(colorValue);
        if (!tex) continue;

        const xFloat = (colIdx - tilePadWidth) * tileSize;
        const yFloat = (rowIdx - tilePadHeight) * tileSize;
        const startX = Math.round(xFloat);
        const startY = Math.round(yFloat);
        const endX = Math.round(xFloat + tileSize);
        const endY = Math.round(yFloat + tileSize);

        const sprite = poolRef.current[idx++];
        sprite.texture = tex;
        sprite.x = startX;
        sprite.y = startY;
        sprite.width = endX - startX;
        sprite.height = endY - startY;
        sprite.alpha = OVERLAY_ALPHA;
        sprite.visible = true;

        // Draw outlines on edges adjacent to a different color
        const hex = COLORMAP_HEX[colorValue as COLORMAP];
        if (!hex) continue;
        const lineColor = hexToNumber(hex);
        gfx.lineStyle(OUTLINE_WIDTH, lineColor, OUTLINE_ALPHA);

        // Top edge
        if (colorTiles.get(rowIdx - 1, colIdx) !== colorValue) {
          gfx.moveTo(startX, startY);
          gfx.lineTo(endX, startY);
        }
        // Bottom edge
        if (colorTiles.get(rowIdx + 1, colIdx) !== colorValue) {
          gfx.moveTo(startX, endY);
          gfx.lineTo(endX, endY);
        }
        // Left edge
        if (colorTiles.get(rowIdx, colIdx - 1) !== colorValue) {
          gfx.moveTo(startX, startY);
          gfx.lineTo(startX, endY);
        }
        // Right edge
        if (colorTiles.get(rowIdx, colIdx + 1) !== colorValue) {
          gfx.moveTo(endX, startY);
          gfx.lineTo(endX, endY);
        }
      }
    }

    hidePoolFrom(poolRef.current, idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorTiles, colorTextures]);

  if (!colorTextures) return null;
  return (
    <Stage
      id="ColorOverlay"
      className={className}
      style={{
        pointerEvents: 'none',
        ...style,
      }}
      width={windowWidth}
      height={windowHeight}
      options={{
        backgroundAlpha: 0,
        resolution: 1,
        antialias: false,
        powerPreference: 'low-power',
        autoDensity: false,
        preserveDrawingBuffer: false,
        sharedTicker: true,
      }}
    >
      <Container name={'color-overlay'} ref={colorLayerRef} eventMode="none" sortableChildren={false} />
    </Stage>
  );
}
