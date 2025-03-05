'use client';
import { Container, Sprite, Stage, Text } from '@pixi/react';
import { cloneElement, useMemo, useRef, useState } from 'react';
import { Texture, TextStyle, SCALE_MODES } from 'pixi.js';
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
  const cursorColors = useMemo(() => ['#FF4D00', '#F0C800', '#0094FF', '#BC3FDC'], []);
  const { flagPaths, tileColors, countColors, boomPaths } = Paths;
  const { zoom } = useCursorStore();
  const { windowHeight, windowWidth } = useScreenSize();

  const [innerZoom, setInnerZoom] = useState(zoom);

  // Generate textures for tiles, boom, and flags
  const cachesRef = useRef({
    outerCachedSprite: new Map<string, JSX.Element>(),
    innerCachedSprite: new Map<string, JSX.Element>(),
    boomCachedSprite: new Map<string, JSX.Element>(),
    flagCachedSprite: new Map<string, JSX.Element>(),
  });

  // Memoize textures creation
  const textures = useMemo(() => {
    const newTileTextures = new Map<string, Texture>();

    const createTileTexture = (color1: string, color2: string) => {
      const key = `${color1}-${color2}-${tileSize}`;
      if (newTileTextures.has(key)) return newTileTextures.get(key)!;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = tempCanvas.height = tileSize;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;
      const gradient = ctx.createLinearGradient(0, 0, tileSize, tileSize);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, tileSize, tileSize);
      const texture = Texture.from(tempCanvas, { resolution: 0.0001, scaleMode: SCALE_MODES.NEAREST });
      newTileTextures.set(key, texture);
      return texture;
    };

    // Textures for outer and inner tiles
    for (let i = 0; i < 3; i++) {
      createTileTexture(tileColors.outer[i][0], tileColors.outer[i][1]);
      createTileTexture(tileColors.inner[i][0], tileColors.inner[i][1]);
    }

    // Boom texture
    const boomCanvas = document.createElement('canvas');
    boomCanvas.width = boomCanvas.height = tileSize;
    const boomCtx = boomCanvas.getContext('2d');
    if (boomCtx) {
      boomCtx.scale(zoom / 4, zoom / 4);
      const inner = new Path2D(boomPaths[0]);
      boomCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      boomCtx.fill(inner);
      const outer = new Path2D(boomPaths[1]);
      boomCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      boomCtx.fill(outer);
      const boomTexture = Texture.from(boomCanvas, { resolution: 0.5, scaleMode: SCALE_MODES.NEAREST });
      newTileTextures.set('boom', boomTexture);
    }

    // Flag textures
    for (let i = 0; i < 4; i++) {
      const flagCanvas = document.createElement('canvas');
      flagCanvas.width = flagCanvas.height = tileSize;
      const flagCtx = flagCanvas.getContext('2d');
      if (!flagCtx) continue;
      const flagGradient = flagCtx.createLinearGradient(36.5, 212.5, 36.5, 259);
      flagGradient.addColorStop(0, '#E8E8E8');
      flagGradient.addColorStop(1, 'transparent');
      flagCtx.translate(tileSize / 6, tileSize / 6);
      flagCtx.scale(zoom / 4.5, zoom / 4.5);
      const flagPath = new Path2D(flagPaths[0]);
      const polePath = new Path2D(flagPaths[1]);
      flagCtx.fillStyle = cursorColors[i];
      flagCtx.fill(flagPath);
      flagCtx.fillStyle = flagGradient;
      flagCtx.fill(polePath);
      const flagTexture = Texture.from(flagCanvas, { resolution: 0.5, scaleMode: SCALE_MODES.NEAREST });
      newTileTextures.set(`flag-${i}`, flagTexture);
    }
    setInnerZoom(zoom);
    return newTileTextures;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSize]);

  // Cache text styles for numbers using useMemo
  const cachedTextStyles = useMemo(
    () =>
      Array.from(
        { length: 8 },
        (_, i) =>
          new TextStyle({
            fontFamily: 'LOTTERIACHAB',
            fontSize: 50 * zoom,
            fill: countColors[i],
          }),
      ),
    [zoom, countColors],
  );

  // Memoize sprites creation using cached base sprites from useRef
  const { outerSprites, innerSprites, boomSprites, flagSprites, textElements } = useMemo(() => {
    const outerSpritesArr: JSX.Element[] = [];
    const innerSpritesArr: JSX.Element[] = [];
    const boomSpritesArr: JSX.Element[] = [];
    const flagSpritesArr: JSX.Element[] = [];
    const textElementsArr: JSX.Element[] = [];

    const {
      outerCachedSprite: outerCache,
      innerCachedSprite: innerCache,
      boomCachedSprite: boomCache,
      flagCachedSprite: flagCache,
    } = cachesRef.current;

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
        if (['C', 'F'].includes(content[0])) {
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
              <Sprite scale={0.1} interactive={false} texture={outerTexture} width={tileSize} height={tileSize} cacheAsBitmapResolution={0.1} />
            );
            outerCache.set(outerKey, baseOuter);
          }
          outerSpritesArr.push(cloneElement(baseOuter, { key: `outer-${tileKey}`, x, y }));
        }

        // Inner sprite
        if (innerTexture) {
          const innerKey = `${innerTexture.textureCacheIds || innerTexture}-${tileSize}`;
          let baseInner = innerCache.get(innerKey);
          if (!baseInner) {
            const size = tileSize - 10 * zoom;
            baseInner = <Sprite scale={0.1} interactive={false} texture={innerTexture} width={size} height={size} cacheAsBitmapResolution={0.1} />;
            innerCache.set(innerKey, baseInner);
          }
          innerSpritesArr.push(cloneElement(baseInner, { key: `inner-${tileKey}`, x: x + 5 * zoom, y: y + 5 * zoom }));
        }

        // Boom sprite
        if (content === 'B') {
          const boomKey = `boom-${tileSize}`;
          let baseBoom = boomCache.get(boomKey);
          if (!baseBoom) {
            baseBoom = (
              <Sprite
                scale={0.1}
                interactive={false}
                texture={textures.get('boom')}
                width={tileSize}
                height={tileSize}
                cacheAsBitmapResolution={0.1}
              />
            );
            boomCache.set(boomKey, baseBoom);
          }
          boomSpritesArr.push(cloneElement(baseBoom, { key: `boom-${tileKey}`, x, y }));
        }

        // Flag sprite
        if (content[0] === 'F') {
          const flagIndex = content[1];
          const flagKey = `flag-${flagIndex}-${tileSize}`;
          let baseFlag = flagCache.get(flagKey);
          if (!baseFlag) {
            baseFlag = (
              <Sprite
                interactive={false}
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
          flagSpritesArr.push(cloneElement(baseFlag, { key: `flag-${tileKey}`, x: x + tileSize / 2, y: y + tileSize / 2 }));
        }

        // Text elements
        const num = parseInt(content);
        if (num > 0) {
          textElementsArr.push(
            <Text
              key={`text-${tileKey}`}
              text={content}
              x={x + tileSize / 2}
              y={y + tileSize / 2}
              resolution={0.8}
              anchor={0.5}
              style={cachedTextStyles[num - 1]}
            />,
          );
        }
      }
    }
    return {
      outerSprites: outerSpritesArr,
      innerSprites: innerSpritesArr,
      boomSprites: boomSpritesArr,
      flagSprites: flagSpritesArr,
      textElements: textElementsArr,
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
        resolution: isMoving ? 0.4 : 0.8,
        antialias: false,
        powerPreference: 'high-performance',
        autoDensity: true,
      }}
    >
      <Container sortableChildren={false} interactiveChildren={false} cacheAsBitmap={!isMoving && zoom !== innerZoom}>
        {outerSprites}
        {innerSprites}
        {boomSprites}
        {flagSprites}
        {textElements}
      </Container>
    </Stage>
  );
}
