'use client';
import { useLayoutEffect, useCallback, useRef, useEffect } from 'react';
import { SendMessageEvent, SendSetWindowPayloadType, XYType } from '@/types';
import { RENDER_RANGE, ORIGIN_TILE_SIZE } from '@/app/play/constants';

interface UseTileViewportOptions {
  zoom: number;
  windowWidth: number;
  windowHeight: number;
  cursorPosition: XYType;
  cursorOriginPosition: XYType;
  isInitialized: boolean;
  setStartPoint: (p: XYType) => void;
  setEndPoint: (p: XYType) => void;
  setRenderStartPoint: (p: XYType) => void;
  setTileSize: (s: number) => void;
  sendMessage: (event: SendMessageEvent, payload: SendSetWindowPayloadType) => void;
}

export default function useTileViewport({
  zoom,
  windowWidth,
  windowHeight,
  cursorPosition,
  cursorOriginPosition,
  isInitialized,
  setStartPoint,
  setEndPoint,
  setRenderStartPoint,
  setTileSize,
  sendMessage,
}: UseTileViewportOptions) {
  const getCurrentTileWidthAndHeight = useCallback(() => {
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    const width = ((windowWidth * RENDER_RANGE) / newTileSize / 2) >>> 0;
    const height = ((windowHeight * RENDER_RANGE) / newTileSize / 2) >>> 0;
    return { width, height };
  }, [zoom, windowWidth, windowHeight]);

  /** Reset screen range when cursor position or screen size changes */
  useLayoutEffect(() => {
    const newTileSize = ORIGIN_TILE_SIZE * zoom;
    const [tilePaddingWidth, tilePaddingHeight] = [
      ((windowWidth * RENDER_RANGE) / newTileSize / 2) >>> 0,
      ((windowHeight * RENDER_RANGE) / newTileSize / 2) >>> 0,
    ];

    if (tilePaddingHeight < 1 || tilePaddingWidth < 1) return;
    setStartPoint({
      x: cursorPosition.x - tilePaddingWidth,
      y: cursorPosition.y - tilePaddingHeight,
    });
    setEndPoint({
      x: cursorPosition.x + tilePaddingWidth,
      y: cursorPosition.y + tilePaddingHeight,
    });

    setRenderStartPoint({
      x: cursorOriginPosition.x - tilePaddingWidth,
      y: cursorOriginPosition.y - tilePaddingHeight,
    });
    setTileSize(newTileSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, cursorOriginPosition, cursorPosition, isInitialized]);

  /** Handling zoom event — debounced to avoid flooding server with SET_WINDOW requests */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (!isInitialized) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const payload: SendSetWindowPayloadType = getCurrentTileWidthAndHeight();
      sendMessage(SendMessageEvent.SET_WINDOW, payload);
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, windowHeight, zoom, isInitialized]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { getCurrentTileWidthAndHeight };
}
