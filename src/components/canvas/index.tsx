'use client';
import S from './style.module.scss';
import React, { useRef, useEffect } from 'react';

import useScreenSize from '@/hooks/useScreenSize';
import { useClickStore, useAnimationStore } from '@/store/interactionStore';
import { useCursorStore, useOtherUserCursorsStore } from '@/store/cursorStore';
import useWebSocketStore from '@/store/websocketStore';
import { useRenderTiles, useRenderStartPoint, useTileSize, useStartPoint, useEndPoint, useTileStore } from '@/store/tileStore';
import ChatComponent from '@/components/chat';
import Tilemap from '@/components/tilemap';
import { ActiveExplosion } from '@/types';
import useSkillTree from '@/hooks/useSkillTree';
import useMovement from '@/hooks/useMovement';
import useCursorRenderer from '@/hooks/useCursorRenderer';
import useInputHandlers from '@/hooks/useInputHandlers';
import useShockwaveAnimation from '@/hooks/useShockwaveAnimation';

interface CanvasRenderComponentProps {
  cursorOriginX: number;
  cursorOriginY: number;
  paddingTiles: number;
  leftReviveTime: number;
  activeExplosions: ActiveExplosion[];
  removeExplosion: (id: number) => void;
}

const CanvasRenderComponent: React.FC<CanvasRenderComponentProps> = ({
  paddingTiles,
  cursorOriginX,
  cursorOriginY,
  leftReviveTime,
  activeExplosions,
  removeExplosion,
}) => {
  // Store subscriptions
  const tiles = useRenderTiles();
  const tileSize = useTileSize();
  const startPoint = useRenderStartPoint();
  const viewStart = useStartPoint();
  const viewEnd = useEndPoint();
  const { padtiles } = useTileStore();
  const { MOVE_SPEED } = useSkillTree();
  const { windowHeight, windowWidth } = useScreenSize();
  const { setPosition: setClickPosition, x: clickX, y: clickY, setMovecost } = useClickStore();
  const { position: cursorPosition, zoom, color, setPosition: setCursorPosition, setOriginPosition, isBombMode } = useCursorStore();
  const { cursors } = useOtherUserCursorsStore();
  const { sendMessage } = useWebSocketStore();
  const { useAnimation } = useAnimationStore();

  // Computed constants
  const [relativeX, relativeY] = [cursorOriginX - startPoint.x, cursorOriginY - startPoint.y];
  const [tilePaddingWidth, tilePaddingHeight] = [((paddingTiles - 1) * relativeX) / paddingTiles, ((paddingTiles - 1) * relativeY) / paddingTiles];

  // Canvas refs
  const shockwaveCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRefs = {
    interactionCanvasRef: useRef<HTMLCanvasElement>(null),
    otherCursorsRef: useRef<HTMLCanvasElement>(null),
    otherPointerRef: useRef<HTMLCanvasElement>(null),
    myCursorRef: useRef<HTMLCanvasElement>(null),
  };

  // Movement hook
  const {
    movingPaths,
    forwardPath,
    lastMovingPosition,
    leftMovingPaths,
    moveCursor,
    cancelCurrentMovement,
    clickEvent,
    isAlreadyCursorNeighbor,
    findOpenedNeighbors,
    findOpenedNeighborsAroundTarget,
  } = useMovement({
    tiles,
    tileSize,
    startPoint,
    viewStart,
    viewEnd,
    cursorOriginX,
    cursorOriginY,
    cursorPosition,
    relativeX,
    relativeY,
    padtiles,
    sendMessage,
    setCursorPosition,
    setOriginPosition,
    setMovecost,
    MOVE_SPEED,
    useAnimation,
    canvasRefs,
    shockwaveCanvasRef,
    cursors,
  });

  // Cursor renderer hook
  const { isInitializing, cleanupCanvasResources } = useCursorRenderer({
    canvasRefs,
    tiles,
    tileSize,
    zoom,
    windowWidth,
    windowHeight,
    cursors,
    color,
    cursorOriginX,
    cursorOriginY,
    relativeX,
    relativeY,
    paddingTiles,
    clickX,
    clickY,
    tilePaddingWidth,
    tilePaddingHeight,
    startPoint,
    movingPaths,
    forwardPath,
    lastMovingPosition,
    leftMovingPaths,
  });

  // Input handlers hook
  const { handleClick, handlePointerDown, handlePointerUp, handlePointerMove } = useInputHandlers({
    canvasRefs,
    tiles,
    tileSize,
    tilePaddingWidth,
    tilePaddingHeight,
    startPoint,
    cursorOriginX,
    cursorOriginY,
    isBombMode,
    movingPaths,
    moveCursor,
    clickEvent,
    setClickPosition,
    isAlreadyCursorNeighbor,
    findOpenedNeighbors,
    findOpenedNeighborsAroundTarget,
  });

  // Shockwave animation hook
  useShockwaveAnimation({
    canvasRef: shockwaveCanvasRef,
    activeExplosions,
    removeExplosion,
    tileSize,
    startPoint,
    tilePaddingWidth,
    tilePaddingHeight,
  });

  // Prevent default right click event
  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('contextmenu', preventContextMenu);
    return () => {
      window.removeEventListener('contextmenu', preventContextMenu);
      cancelCurrentMovement();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelCurrentMovement();
      cleanupCanvasResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {isInitializing && (
        <div className={S.loading}>
          <h1>Assets Loading...</h1>
          <div className={`${tiles.isEmpty ? S.loadingBar : S.loadComplete}`} />
        </div>
      )}
      {!isInitializing && (
        <div className={`${S.canvasContainer} ${leftReviveTime > 0 ? S.vibration : ''}`}>
          <ChatComponent />
          <Tilemap className={S.canvas} tilePadHeight={tilePaddingHeight} tilePadWidth={tilePaddingWidth} />
          <canvas className={S.canvas} id="ShockwaveCanvas" ref={shockwaveCanvasRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas} id="OtherCursors" ref={canvasRefs.otherCursorsRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas} id="OtherPointer" ref={canvasRefs.otherPointerRef} width={windowWidth} height={windowHeight} />
          <canvas className={S.canvas} id="MyCursor" ref={canvasRefs.myCursorRef} width={windowWidth} height={windowHeight} />
          <canvas
            className={S.canvas}
            id="InteractionCanvas"
            ref={canvasRefs.interactionCanvasRef}
            width={windowWidth}
            height={windowHeight}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerMove={handlePointerMove}
            onPointerCancel={handlePointerUp}
            onClick={handleClick}
          />
        </div>
      )}
    </>
  );
};

export default CanvasRenderComponent;
