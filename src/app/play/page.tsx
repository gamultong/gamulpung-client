'use client';
/** style */
import S from './page.module.scss';

/** hooks */
import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import useScreenSize from '@/hooks/useScreenSize';
import { useClickStore } from '@/store/interactionStore';
import useTileProcessing from '@/hooks/useTileProcessing';
import useTileViewport from '@/hooks/useTileViewport';
import useExplosionManager from '@/hooks/useExplosionManager';

/** components */
import CanvasRenderComponent from '@/components/canvas';
import useWebSocketStore from '@/store/websocketStore';
import Inactive from '@/components/inactive';
import CanvasDashboard from '@/components/canvasDashboard';
import TutorialStep from '@/components/tutorialstep';
import ScoreBoardComponent from '@/components/scoreboard';
import useMessageHandler from '@/hooks/useMessageHandler';
import { useCursorStore } from '@/store/cursorStore';
import { useTileStore, useTiles } from '@/store/tileStore';
import SkillTree from '@/components/skilltree';
import { RENDER_RANGE, MAX_TILE_COUNT, WS_URL } from './constants';

export default function Play() {
  /** stores */
  const {} = useClickStore();
  const { isOpen, sendMessage, connect, disconnect } = useWebSocketStore();
  const { position: cursorPosition, zoom, originPosition: cursorOriginPosition } = useCursorStore();
  const { zoomUp, zoomDown, setZoom } = useCursorStore();
  const cachingTiles = useTiles();
  const {
    startPoint,
    endPoint,
    renderStartPoint,
    setTiles,
    setRenderTiles,
    setStartPoint,
    setEndPoint,
    setRenderStartPoint,
    setTileSize,
    padtiles,
    applyTileChanges,
    applyPackedChanges,
    reset: resetTiles,
  } = useTileStore();

  /** hooks */
  const { windowWidth, windowHeight } = useScreenSize();

  /** states */
  const [leftReviveTime, setLeftReviveTime] = useState<number>(-1);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const reviveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectedRef = useRef<boolean>(false);

  // Extracted hooks
  const { activeExplosions, onExplosion, removeExplosion } = useExplosionManager();

  const { replaceTiles } = useTileProcessing({
    padtiles,
    startPoint,
    cachingTiles,
    cursorPosition,
    cursorOriginPosition,
    renderStartPoint,
    setTiles,
    setRenderTiles,
    applyTileChanges,
    applyPackedChanges,
  });

  const { getCurrentTileWidthAndHeight } = useTileViewport({
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
  });

  const zoomHandler = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['-', '='].includes(key)) e.preventDefault();
    switch (key) {
      case '-':
        zoomDown();
        break;
      case '=':
        zoomUp();
        break;
    }
  };

  /** Initialize Browser Events and Disconnect websocket when this Component is unmounted */
  useLayoutEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    setIsInitialized(false);
    setZoom(1);
    document.addEventListener('keydown', zoomHandler);
    return () => {
      document.documentElement.style.overflow = 'auto';
      document.removeEventListener('keydown', zoomHandler);

      if (reviveTimerRef.current) {
        clearTimeout(reviveTimerRef.current);
        reviveTimerRef.current = null;
      }

      disconnect();
      resetTiles();
      setIsInitialized(false);
      setLeftReviveTime(-1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Re-connect websocket when websocket is closed state. */
  useLayoutEffect(() => {
    if (isOpen || startPoint.x === endPoint.x || endPoint.y === startPoint.y) return;
    setLeftReviveTime(-1);
    if (!connectedRef.current) {
      connect(WS_URL);
      connectedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, startPoint]);

  /** Message handler for tile processing */
  useMessageHandler({
    getCurrentTileWidthAndHeight,
    replaceTiles,
    setLeftReviveTime,
    setIsInitialized,
    onExplosion,
  });

  useEffect(() => {
    if (leftReviveTime > 0) reviveTimerRef.current = setTimeout(() => setLeftReviveTime(e => (e > 0 ? e - 1 : e)), 1000);
    return () => {
      if (reviveTimerRef.current) {
        clearTimeout(reviveTimerRef.current);
        reviveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftReviveTime]);

  return (
    <div className={S.page}>
      {leftReviveTime > 0 && <Inactive time={leftReviveTime} />}
      <TutorialStep />
      <ScoreBoardComponent />
      <SkillTree />
      <CanvasDashboard renderRange={RENDER_RANGE} maxTileCount={MAX_TILE_COUNT} />
      <CanvasRenderComponent
        leftReviveTime={leftReviveTime}
        paddingTiles={RENDER_RANGE}
        cursorOriginX={cursorOriginPosition.x}
        cursorOriginY={cursorOriginPosition.y}
        activeExplosions={activeExplosions}
        removeExplosion={removeExplosion}
      />
    </div>
  );
}
