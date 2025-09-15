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

const CURSOR_COLORS = ['#FF4D00', '#F0C800', '#0094FF', '#BC3FDC'];

export default function Tilemap({ tiles, tileSize, tilePaddingWidth, tilePaddingHeight, className, isMoving }: TilemapProps) {
  // constants
  const { flagPaths, tileColors, countColors, boomPaths } = Paths;
  // stores
  const { zoom } = useCursorStore();
  const { windowHeight, windowWidth } = useScreenSize();
  // states
  const [innerZoom, setInnerZoom] = useState(zoom);

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

    const createTileTexture = (color0: string, color1: string) => {
      const key = `${color0}${color1}${tileSize}`;
      const quarterSize = tileSize / 2;
      if (newTileTextures.has(key)) return newTileTextures.get(key)!;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = tempCanvas.height = quarterSize;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;
      const gradient = ctx.createLinearGradient(0, 0, quarterSize, quarterSize);
      gradient.addColorStop(0, color0);
      gradient.addColorStop(1, color1);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, quarterSize, quarterSize);
      const texture = Texture.from(tempCanvas, { resolution: 0.0001, scaleMode: SCALE_MODES.NEAREST });
      newTileTextures.set(key, texture);
      return texture;
    };

    // Textures for outer and inner tiles
    for (let idx = 0; idx < 3; idx++) {
      createTileTexture(tileColors.outer[idx][0], tileColors.outer[idx][1]);
      createTileTexture(tileColors.inner[idx][0], tileColors.inner[idx][1]);
    }

    // Boom texture
    const boomCanvas = document.createElement('canvas');
    const boomMinimalized = 3;
    boomCanvas.width = boomCanvas.height = tileSize / boomMinimalized;
    const boomCtx = getContext(boomCanvas);
    if (boomCtx) {
      boomCtx.scale(zoom / 4, zoom / 4);
      const outer = new Path2D(boomPaths[1]);
      const inner = new Path2D(boomPaths[0]);
      boomCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      boomCtx.fill(inner);
      boomCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      boomCtx.fill(outer);
      const boomTexture = Texture.from(boomCanvas, { resolution: 0.5, scaleMode: SCALE_MODES.NEAREST });
      newTileTextures.set('boom', boomTexture);
    }

    // Flag textures
    for (let idx = 0; idx < 4; idx++) {
      const flagCanvas = document.createElement('canvas');
      flagCanvas.width = flagCanvas.height = tileSize / flagMinimalized;
      const flagCtx = getContext(flagCanvas);
      if (!flagCtx) continue;
      const flagGradient = flagCtx.createLinearGradient(36.5, 212.5, 36.5, 259);
      flagGradient.addColorStop(0, '#E8E8E8');
      flagGradient.addColorStop(1, 'transparent');
      flagCtx.translate(flagCanvas.width / 6, flagCanvas.height / 6);
      flagCtx.scale(zoom / 4.5, zoom / 4.5);
      const flagPath = new Path2D(flagPaths[0]);
      const polePath = new Path2D(flagPaths[1]);
      flagCtx.fillStyle = CURSOR_COLORS[idx];
      flagCtx.fill(flagPath);
      flagCtx.fillStyle = flagGradient;
      flagCtx.fill(polePath);
      const flagTexture = Texture.from(flagCanvas, { resolution: 0.5, scaleMode: SCALE_MODES.NEAREST });
      newTileTextures.set(`flag${idx}`, flagTexture);
    }
    setInnerZoom(zoom);
    return newTileTextures;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSize, zoom]);

  // For UnderLine useMemo function.
  const makeCacheTextStyles = () => {
    const [style, len] = [{ fontFamily: 'LOTTERIACHAB', fontSize: 50 * zoom }, { length: 8 }];
    return Array.from(len, (_, i) => new TextStyle({ ...style, fill: countColors[i] }));
  };
  const cachedTextStyles = useMemo(makeCacheTextStyles, [zoom, countColors]);

  // Memoize sprites creation using cached base sprites from useRef
  const { outerSprites, innerSprites, boomSprites, flagSprites, textElements } = useMemo(() => {
    // Get empty arrays & Caches
    const [outerSprites, innerSprites, boomSprites, flagSprites, textElements]: JSX.Element[][] = [[], [], [], [], []];
    const { outerCache, innerCache, boomCache, flagCache } = cachesRef.current;

    for (let ri = 0; ri < tiles.length; ri++) {
      for (let ci = 0; ci < tiles[ri].length; ci++) {
        const renderStartX = (ci - tilePaddingWidth) * tileSize;
        const renderStartY = (ri - tilePaddingHeight) * tileSize;
        if (renderStartX < -tileSize || renderStartY < -tileSize) continue; // out of bounds
        if (renderStartX > windowWidth + tileSize || renderStartY > windowHeight + tileSize) continue; // out of bounds
        const tileKey = `${ri}${ci}${tileSize}`;
        const content = tiles[ri][ci];
        const { inner, outer } = tileColors;

        // Select textures based on tile content
        let outerTexture = textures.get(`${outer[2][0]}${outer[2][1]}${tileSize}`);
        let innerTexture = textures.get(`${inner[2][0]}${inner[2][1]}${tileSize}`);
        if (['C', 'F'].includes(content[0])) {
          const isEven = +content.slice(-1) % 2;
          outerTexture = textures.get(`${outer[isEven][0]}${outer[isEven][1]}${tileSize}`);
          innerTexture = textures.get(`${inner[isEven][0]}${inner[isEven][1]}${tileSize}`);
        }

        // Outer sprite
        if (outerTexture) {
          const outerKey = `${outerTexture.textureCacheIds || outerTexture}${tileSize}`;
          let outerSprite = outerCache.get(outerKey);
          if (!outerSprite) {
            const [width, height, cacheAsBitmapResolution] = [tileSize, tileSize, 0.1];
            outerSprite = <Sprite scale={0.1} interactive={false} texture={outerTexture} {...{ width, height, cacheAsBitmapResolution }} />;
            outerCache.set(outerKey, outerSprite);
          }
          outerSprites.push(cloneElement(outerSprite, { key: `outer${tileKey}`, x: renderStartX, y: renderStartY }));
        }

        // Inner sprite
        if (innerTexture) {
          const innerKey = `${innerTexture.textureCacheIds || innerTexture}${tileSize}`;
          let innerSprite = innerCache.get(innerKey);
          if (!innerSprite) {
            const [width, height, cacheAsBitmapResolution] = [tileSize - 10 * zoom, tileSize - 10 * zoom, 0.1];
            innerSprite = <Sprite scale={0.1} interactive={false} texture={innerTexture} {...{ width, height, cacheAsBitmapResolution }} />;
            innerCache.set(innerKey, innerSprite);
          }
          innerSprites.push(cloneElement(innerSprite, { key: `inner${tileKey}`, x: renderStartX + 5 * zoom, y: renderStartY + 5 * zoom }));
        }

        // Boom sprite
        if (content === 'B') {
          const boomKey = `boom${tileSize}`;
          let boomSprite = boomCache.get(boomKey);
          if (!boomSprite) {
            const [width, height, cacheAsBitmapResolution] = [tileSize, tileSize, 0.1];
            boomSprite = <Sprite scale={0.1} interactive={false} texture={textures.get('boom')} {...{ width, height, cacheAsBitmapResolution }} />;
            boomCache.set(boomKey, boomSprite);
          }
          boomSprites.push(cloneElement(boomSprite, { key: `boom${tileKey}`, x: renderStartX, y: renderStartY }));
        }

        // Flag sprite
        if (content[0] === 'F') {
          const flagColor = content[1];
          const flagKey = `flag${flagColor}${tileSize}`;
          let baseFlag = flagCache.get(flagKey);
          if (!baseFlag) {
            const [width, height, cacheAsBitmapResolution, texture] = [tileSize, tileSize, 0.1, textures.get(`flag${flagColor}`)];
            baseFlag = <Sprite scale={0.1} interactive={false} anchor={0.5} {...{ width, height, cacheAsBitmapResolution, texture }} />;
            flagCache.set(flagKey, baseFlag);
          }
          flagSprites.push(cloneElement(baseFlag, { key: `flag${tileKey}`, x: renderStartX + tileSize / 2, y: renderStartY + tileSize / 2 }));
        }

        // Text elements
        if (+content > 0) {
          const [x, y, style] = [renderStartX + tileSize / 2, renderStartY + tileSize / 2, cachedTextStyles[+content - 1]];
          textElements.push(<Text key={`text${tileKey}`} text={content} resolution={0.8} anchor={0.5} {...{ x, y, style }} />);
        }
      }
    }
    return { outerSprites, innerSprites, boomSprites, flagSprites, textElements };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  // if no textures or text styles, return null
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
