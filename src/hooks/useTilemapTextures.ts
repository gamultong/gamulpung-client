'use client';
import { useEffect, useRef, useState } from 'react';
import { Texture, SCALE_MODES, MIPMAP_MODES, WRAP_MODES } from 'pixi.js';
import RenderPaths from '@/assets/renderPaths.json';
import { fillCtxAndPath as fillPathInCtx, makePath2d, hexToRgb, lerp, canvasToTexture } from '@/utils';
import { CURSOR_COLORS } from '@/constants';

// Concurrency limiter to avoid overwhelming main thread/GPU during mass texture creation
function createLimiter(maxConcurrent: number) {
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
}

function getCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d', { willReadFrequently: false, desynchronized: true })!;
}

export default function useTilemapTextures(tileSize: number, zoom: number) {
  const { flagPaths, tileColors, countColors, boomPaths } = RenderPaths;
  const { outer, inner } = tileColors;

  const cachedTexturesRef = useRef(new Map<string, Texture>());
  const numberTexturesRef = useRef(new Map<number, Texture>());
  const [texturesReady, setTexturesReady] = useState(false);
  const [numbersReady, setNumbersReady] = useState(false);

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

    // Build textures (boom/flags + gradient tiles) and cache
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

  // Cleanup Pixi.js textures on unmount
  useEffect(() => {
    const textures = cachedTexturesRef.current;
    return () => {
      textures.forEach(texture => texture.destroy());
      textures.clear();
    };
  }, []);

  return { cachedTexturesRef, numberTexturesRef, texturesReady, numbersReady };
}
