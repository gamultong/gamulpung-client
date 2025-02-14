'use client';
import { Container, Sprite, Stage, Text } from '@pixi/react';
import { cloneElement, useMemo, useRef } from 'react';
import { useCursorStore } from '@/store/cursorStore';
import Paths from '@/assets/paths.json';
import useScreenSize from '@/hooks/useScreenSize';
import { Texture, TextStyle, SCALE_MODES } from 'pixi.js';

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

  // 캐시 객체를 useRef로 한 번만 생성
  const cachesRef = useRef({
    outerCache: new Map<string, JSX.Element>(),
    innerCache: new Map<string, JSX.Element>(),
    boomCache: new Map<string, JSX.Element>(),
    flagCache: new Map<string, JSX.Element>(),
  });

  // Memoize textures creation
  const textures = useMemo(() => {
    const newTileTextures = new Map<string, Texture>();

    const createTileTexture = (color1: string, color2: string) => {
      const key = `${color1}-${color2}-${tileSize}`;
      if (newTileTextures.has(key)) return newTileTextures.get(key)!;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = tileSize;
      tempCanvas.height = tileSize;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;
      const gradient = ctx.createLinearGradient(0, 0, tileSize, tileSize);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, tileSize, tileSize);
      const texture = Texture.from(tempCanvas);
      texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      texture.baseTexture.resolution = 0.0001;
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
    boomCanvas.width = tileSize;
    boomCanvas.height = tileSize;
    const boomCtx = boomCanvas.getContext('2d');
    if (boomCtx) {
      boomCtx.scale(zoom / 4, zoom / 4);
      const inner = new Path2D(boomPaths[0]);
      boomCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      boomCtx.fill(inner);
      const outer = new Path2D(boomPaths[1]);
      boomCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      boomCtx.fill(outer);
      const boomTexture = Texture.from(boomCanvas);
      boomTexture.baseTexture.resolution = 0.5;
      boomTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      newTileTextures.set('boom', boomTexture);
    }

    // Flag textures
    for (let i = 0; i < 4; i++) {
      const flagCanvas = document.createElement('canvas');
      flagCanvas.width = tileSize;
      flagCanvas.height = tileSize;
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
      const flagTexture = Texture.from(flagCanvas);
      flagTexture.baseTexture.resolution = 0.5;
      flagTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      newTileTextures.set(`flag-${i}`, flagTexture);
    }

    return newTileTextures;
  }, [tileSize, tileColors, boomPaths, flagPaths, cursorColors, zoom]);

  // Cache text styles for numbers using useMemo
  const cachedTextStyles = useMemo(() => {
    return Array.from(
      { length: 8 },
      (_, i) =>
        new TextStyle({
          fontFamily: 'LOTTERIACHAB',
          fontSize: 50 * zoom,
          fill: countColors[i],
        }),
    );
  }, [zoom, countColors]);

  // Memoize sprites creation using cached base sprites from useRef
  const { outerSprites, innerSprites, boomSprites, flagSprites, textElements } = useMemo(() => {
    const outerSpritesArr: JSX.Element[] = [];
    const innerSpritesArr: JSX.Element[] = [];
    const boomSpritesArr: JSX.Element[] = [];
    const flagSpritesArr: JSX.Element[] = [];
    const textElementsArr: JSX.Element[] = [];

    const { outerCache, innerCache, boomCache, flagCache } = cachesRef.current;

    for (let ri = 0; ri < tiles.length; ri++) {
      for (let ci = 0; ci < tiles[ri].length; ci++) {
        const content = tiles[ri][ci];
        const x = (ci - tilePaddingWidth) * tileSize;
        const y = (ri - tilePaddingHeight) * tileSize;
        if (x < -tileSize || y < -tileSize || x > windowWidth + tileSize || y > windowHeight + tileSize) continue;

        // 기본 텍스처 선택
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
            baseOuter = <Sprite interactive={false} texture={outerTexture} width={tileSize} height={tileSize} />;
            outerCache.set(outerKey, baseOuter);
          }

          outerSpritesArr.push(cloneElement(baseOuter, { key: `outer-${ri}-${ci}-${tileSize}`, x, y }));
        }

        // Inner sprite
        if (innerTexture) {
          const innerKey = `${innerTexture.textureCacheIds || innerTexture}-${tileSize}-${zoom}`;
          let baseInner = innerCache.get(innerKey);
          if (!baseInner) {
            baseInner = <Sprite interactive={false} texture={innerTexture} width={tileSize - 10 * zoom} height={tileSize - 10 * zoom} />;
            innerCache.set(innerKey, baseInner);
          }
          innerSpritesArr.push(cloneElement(baseInner, { key: `inner-${ri}-${ci}-${tileSize}`, x: x + 5 * zoom, y: y + 5 * zoom }));
        }

        // Boom sprite
        if (content === 'B') {
          const boomKey = `boom-${tileSize}`;
          let baseBoom = boomCache.get(boomKey);
          if (!baseBoom) {
            baseBoom = <Sprite interactive={false} texture={textures.get('boom')} width={tileSize} height={tileSize} />;
            boomCache.set(boomKey, baseBoom);
          }
          boomSpritesArr.push(cloneElement(baseBoom, { key: `boom-${ri}-${ci}-${tileSize}`, x, y }));
        }

        // Flag sprite
        if (content[0] === 'F') {
          const flagIndex = content[1];
          const flagKey = `flag-${flagIndex}-${tileSize}-${zoom}`;
          let baseFlag = flagCache.get(flagKey);
          if (!baseFlag) {
            baseFlag = <Sprite interactive={false} texture={textures.get(`flag-${flagIndex}`)} anchor={0.5} width={tileSize} height={tileSize} />;
            flagCache.set(flagKey, baseFlag);
          }
          flagSpritesArr.push(cloneElement(baseFlag, { key: `flag-${ri}-${ci}-${tileSize}`, x: x + tileSize / 2, y: y + tileSize / 2 }));
        }

        // 숫자 텍스트 (재생성해도 큰 비용은 아님)
        const num = parseInt(content);
        if (num > 0) {
          textElementsArr.push(
            <Text
              key={`text-${ri}-${ci}`}
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
  }, [tiles, textures, zoom, cachedTextStyles]);

  if (!textures.size || !cachedTextStyles) return null;
  return (
    <Stage
      id="Tilemap"
      className={className}
      width={windowWidth}
      height={windowHeight}
      options={{
        backgroundColor: 0x808080,
        resolution: isMoving ? 0.5 : 0.8,
        antialias: false,
        powerPreference: 'high-performance',
        autoDensity: true,
      }}
    >
      <Container sortableChildren={false}>
        {outerSprites}
        {innerSprites}
        {boomSprites}
        {flagSprites}
        {textElements}
      </Container>
    </Stage>
  );
}
