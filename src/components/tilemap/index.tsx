'use client';
import { Container, Sprite, Stage, Text } from '@pixi/react';
import { cloneElement, useMemo, useRef, useState } from 'react';
import { Texture, TextStyle, SCALE_MODES, MIPMAP_MODES, WRAP_MODES, TextStyleFill } from 'pixi.js';
import Paths from '@/assets/paths.json';
import { useCursorStore } from '@/store/cursorStore';
import useScreenSize from '@/hooks/useScreenSize';

interface TilemapProps {
  tiles: string[][];
  tileSize: number;
  tilePaddingWidth: number;
  tilePaddingHeight: number;
  isMoving: boolean;
  className?: string;
}

export default function Tilemap({ tiles, tileSize, tilePaddingWidth, tilePaddingHeight, className, isMoving }: TilemapProps) {
  // constants
  const CURSOR_COLORS = useMemo(() => ['#FF4D00', '#F0C800', '#0094FF', '#BC3FDC'], []);
  const { flagPaths, tileColors, countColors, boomPaths } = Paths;

  // stores
  const { zoom } = useCursorStore();
  const { windowHeight, windowWidth } = useScreenSize();

  // states
  const [innerZoom, setInnerZoom] = useState(zoom);
  const [cachedTextures, setCachedTextures] = useState(new Map<string, Texture>());
  const makeSpriteMap = () => new Map<string, JSX.Element>();

  // Generate textures for tiles, boom, and flags
  const cachedSpritesRef = useRef({
    outerCachedSprite: makeSpriteMap(),
    innerCachedSprite: makeSpriteMap(),
    boomCachedSprite: makeSpriteMap(),
    flagCachedSprite: makeSpriteMap(),
  });

  const getContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D =>
    canvas.getContext('2d', { willReadFrequently: false, desynchronized: true })!;

  // Memoize textures creation
  const textures = useMemo(() => {
    const newTileTextures = new Map(Array.from(cachedTextures.entries()).map(([key, t]) => [key, Texture.from(t.baseTexture)]));

    const createTileTexture = (color1: string, color2: string) => {
      const key = `${color1}-${color2}-${tileSize}`;
      if (newTileTextures.has(key)) return newTileTextures.get(key);

      const tempCanvas = document.createElement('canvas');
      const tileMinializedSize = Math.sqrt(tileSize / 5);
      tempCanvas.width = tempCanvas.height = tileMinializedSize;
      const ctx = getContext(tempCanvas);
      if (!ctx) return;
      const gradient = ctx.createLinearGradient(0, 0, tileMinializedSize, tileMinializedSize);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, tileMinializedSize, tileMinializedSize);

      const texture = Texture.from(tempCanvas);
      texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      texture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      texture.baseTexture.wrapMode = WRAP_MODES.CLAMP;
      texture.baseTexture.setSize(tileMinializedSize, tileMinializedSize);
      texture.baseTexture.resolution = 0;

      newTileTextures.set(key, texture);
    };

    // Textures for outer and inner tiles
    for (let i = 0; i < 3; i++) {
      createTileTexture(tileColors.outer[i][0], tileColors.outer[i][1]);
      createTileTexture(tileColors.inner[i][0], tileColors.inner[i][1]);
    }

    // Boom texture
    const boomCanvas = document.createElement('canvas');
    const boomMinimalized = 3;
    boomCanvas.width = boomCanvas.height = tileSize / boomMinimalized;
    const boomCtx = getContext(boomCanvas);
    if (boomCtx) {
      boomCtx.scale(zoom / boomMinimalized / 4, zoom / boomMinimalized / 4);
      const inner = new Path2D(boomPaths[0]);
      boomCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      boomCtx.fill(inner);
      const outer = new Path2D(boomPaths[1]);
      boomCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      boomCtx.fill(outer);

      const boomTexture = Texture.from(boomCanvas);
      boomTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      boomTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      boomTexture.baseTexture.setSize(tileSize / boomMinimalized, tileSize / boomMinimalized);
      boomTexture.baseTexture.resolution = 0.1;

      newTileTextures.set('boom', boomTexture);
    }

    // Flag textures
    const flagMinimalized = 3;
    for (let i = 0; i < 4; i++) {
      const flagCanvas = document.createElement('canvas');
      flagCanvas.width = flagCanvas.height = tileSize / flagMinimalized;
      const flagCtx = getContext(flagCanvas);
      if (!flagCtx) continue;
      const flagGradient = flagCtx.createLinearGradient(36.5, 212.5, 36.5, 259);
      flagGradient.addColorStop(0, '#E8E8E8');
      flagGradient.addColorStop(1, 'transparent');
      flagCtx.translate(tileSize / flagMinimalized / 6, tileSize / flagMinimalized / 6);
      flagCtx.scale(zoom / flagMinimalized / 4.5, zoom / flagMinimalized / 4.5);
      const flagPath = new Path2D(flagPaths[0]);
      const polePath = new Path2D(flagPaths[1]);
      flagCtx.fillStyle = CURSOR_COLORS[i];
      flagCtx.fill(flagPath);
      flagCtx.fillStyle = flagGradient;
      flagCtx.fill(polePath);

      const flagTexture = Texture.from(flagCanvas);
      flagTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      flagTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      flagTexture.baseTexture.setSize(tileSize, tileSize);
      flagTexture.baseTexture.resolution = 0.5;

      newTileTextures.set(`flag-${i}`, flagTexture);
    }
    setInnerZoom(zoom);
    setCachedTextures(newTileTextures);
    return newTileTextures;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSize]);

  // Cache text styles for numbers using useMemo
  const cachedTextStyles = useMemo(() => {
    const fontFamily = 'LOTTERIACHAB';
    const fontSize = 50 * zoom;
    const makeTextStyle = (fill: TextStyleFill) => new TextStyle({ fontFamily, fontSize, fill });
    return Array.from({ length: 8 }, (_, i) => makeTextStyle(countColors[i % countColors.length]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Memoize sprites creation using cached base sprites from useRef
  const { outerSprites, innerSprites, boomSprites, flagSprites, textElements } = useMemo(() => {
    const outerSprites: JSX.Element[] = [];
    const innerSprites: JSX.Element[] = [];
    const boomSprites: JSX.Element[] = [];
    const flagSprites: JSX.Element[] = [];
    const textElements: JSX.Element[] = [];

    const {
      outerCachedSprite: outerCache,
      innerCachedSprite: innerCache,
      boomCachedSprite: boomCache,
      flagCachedSprite: flagCache,
    } = cachedSpritesRef.current;

    for (let ri = 0; ri < tiles.length; ri++) {
      for (let ci = 0; ci < tiles[ri].length; ci++) {
        const content = tiles[ri][ci];
        const x = (ci - tilePaddingWidth) * tileSize;
        const y = (ri - tilePaddingHeight) * tileSize;
        if (x < -tileSize || y < -tileSize || x > windowWidth + tileSize || y > windowHeight + tileSize) continue;
        const tileKey = `${ri}-${ci}-${tileSize}`;

        // Select textures based on tile content
        let outerTexture = textures.get(`${tileColors.outer[2][0]}-${tileColors.outer[2][1]}-${tileSize}`);
        let innerTexture = textures.get(`${tileColors.inner[2][0]}-${tileColors.inner[2][1]}-${tileSize}`);
        if (content[0] === 'C' || content[0] === 'F') {
          const isEven = content.slice(-1) === '0' ? 0 : 1;
          outerTexture = textures.get(`${tileColors.outer[isEven][0]}-${tileColors.outer[isEven][1]}-${tileSize}`);
          innerTexture = textures.get(`${tileColors.inner[isEven][0]}-${tileColors.inner[isEven][1]}-${tileSize}`);
        }

        // Outer sprite
        if (outerTexture) {
          const outerKey = `${outerTexture.textureCacheIds || outerTexture}-${tileSize}`;
          let baseOuter = outerCache.get(outerKey);
          if (!baseOuter) {
            baseOuter = (
              <Sprite
                cullable={true}
                scale={0.1}
                eventMode="none"
                texture={outerTexture}
                width={tileSize}
                height={tileSize}
                cacheAsBitmapResolution={0.0001}
              />
            );
            outerCache.set(outerKey, baseOuter);
          }
          outerSprites.push(cloneElement(baseOuter, { key: `outer-${tileKey}`, x, y }));
        }

        // Inner sprite
        if (innerTexture) {
          const innerKey = `${innerTexture.textureCacheIds || innerTexture}-${tileSize}`;
          let baseInner = innerCache.get(innerKey);
          if (!baseInner) {
            const size = tileSize - 10 * zoom;
            baseInner = (
              <Sprite
                cullable={true}
                scale={0.1}
                eventMode="none"
                texture={innerTexture}
                width={size}
                height={size}
                cacheAsBitmapResolution={0.001}
              />
            );
            innerCache.set(innerKey, baseInner);
          }
          innerSprites.push(cloneElement(baseInner, { key: `inner-${tileKey}`, x: x + 5 * zoom, y: y + 5 * zoom }));
        }

        // Boom sprite
        if (content === 'B') {
          const boomKey = `boom-${tileSize}`;
          let baseBoom = boomCache.get(boomKey);
          if (!baseBoom) {
            baseBoom = (
              <Sprite
                cullable={true}
                scale={0.1}
                eventMode="none"
                texture={textures.get('boom')}
                width={tileSize}
                height={tileSize}
                cacheAsBitmapResolution={0.1}
              />
            );
            boomCache.set(boomKey, baseBoom);
          }
          boomSprites.push(cloneElement(baseBoom, { key: `boom-${tileKey}`, x, y }));
        }

        // Flag sprite
        if (content[0] === 'F') {
          const flagIndex = content[1];
          const flagKey = `flag-${flagIndex}-${tileSize}`;
          let baseFlag = flagCache.get(flagKey);
          if (!baseFlag) {
            baseFlag = (
              <Sprite
                cullable={true}
                eventMode="none"
                texture={textures.get(`flag-${flagIndex}`)}
                anchor={0.5}
                scale={0.1}
                width={tileSize}
                height={tileSize}
                cacheAsBitmapResolution={0.1}
              />
            );
            flagCache.set(flagKey, baseFlag);
          }
          flagSprites.push(cloneElement(baseFlag, { key: `flag-${tileKey}`, x: x + tileSize / 2, y: y + tileSize / 2 }));
        }

        // Text elements
        const num = parseInt(content);
        if (num > 0) {
          textElements.push(
            <Text
              key={`text-${tileKey}`}
              text={content}
              x={x + tileSize / 2}
              y={y + tileSize / 2}
              resolution={0.5}
              anchor={0.5}
              style={cachedTextStyles[num - 1]}
              cacheAsBitmapResolution={0.001}
            />,
          );
        }
      }
    }
    return {
      outerSprites,
      innerSprites,
      boomSprites,
      flagSprites,
      textElements,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  if (!textures.size || !cachedTextStyles) return null;
  return (
    <Stage
      id="Tilemap"
      className={className}
      width={windowWidth}
      height={windowHeight}
      options={{
        backgroundColor: 0x808080,
        resolution: isMoving ? 0.3 : 0.8,
        antialias: false,
        powerPreference: 'low-power',
        autoDensity: false,
      }}
    >
      <Container name={'container'} sortableChildren={false} eventMode="none" cacheAsBitmap={!isMoving && zoom !== innerZoom}>
        {outerSprites}
        {innerSprites}
        {boomSprites}
        {flagSprites}
        {textElements}
      </Container>
    </Stage>
  );
}
