'use client';
import React, { useRef } from 'react';
import { XYType, SendMessageEvent } from '@/types';
import { TileGrid, isTileClosed, isTileFlag, isTileBomb, isTileOpen, getTileNumber } from '@/utils/tileGrid';
import { CanvasRefs } from '@/hooks/useMovement';
import { InteractionMode } from '@/store/cursorStore';

interface UseInputHandlersOptions {
  canvasRefs: CanvasRefs;
  tiles: TileGrid;
  tileSize: number;
  tilePaddingWidth: number;
  tilePaddingHeight: number;
  startPoint: XYType;
  cursorOriginX: number;
  cursorOriginY: number;
  isBombMode: boolean;
  interactionMode: InteractionMode;
  movingPaths: XYType[];
  moveCursor: (relativeTileX: number, relativetileY: number, clickedX: number, clickedY: number, onComplete?: (x: number, y: number) => void) => void;
  clickEvent: (x: number, y: number, clickType: SendMessageEvent) => void;
  setClickPosition: (x: number, y: number, tile: number) => void;
  isAlreadyCursorNeighbor: (x: number, y: number) => boolean;
  findOpenedNeighbors: (x: number, y: number) => { x: number; y: number };
  findOpenedNeighborsAroundTarget: (x: number, y: number) => { x: number; y: number };
  isPinching?: () => boolean;
}

// Map click type to corresponding action event
const CLICK_TYPE_TO_EVENT: Record<string, SendMessageEvent> = {
  special: SendMessageEvent.SET_FLAG,
  general: SendMessageEvent.OPEN_TILES,
};

const LONG_PRESS_DURATION = 500; // ms (mouse)
const TOUCH_FLAG_DURATION = 300; // ms (touch: SET_FLAG)
const TOUCH_DISMANTLE_DURATION = 700; // ms (touch: DISMANTLE_MINE)
const LONG_PRESS_MOVE_THRESHOLD = 10; // px

const NEIGHBOR_DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

export default function useInputHandlers({
  canvasRefs,
  tiles,
  tileSize,
  tilePaddingWidth,
  tilePaddingHeight,
  startPoint,
  cursorOriginX,
  cursorOriginY,
  isBombMode,
  interactionMode,
  movingPaths,
  moveCursor,
  clickEvent,
  setClickPosition,
  isAlreadyCursorNeighbor,
  findOpenedNeighbors,
  findOpenedNeighborsAroundTarget,
  isPinching,
}: UseInputHandlersOptions) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dismantleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressPositionRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = useRef<boolean>(false);
  const pointerTypeRef = useRef<string>('mouse');

  // Chord click state
  const didChordRef = useRef(false);

  /** Resolve canvas pixel position to tile coordinates */
  const resolveTileFromClient = (clientX: number, clientY: number) => {
    const interactionCanvas = canvasRefs.interactionCanvasRef.current;
    if (!interactionCanvas) return null;
    const { left: rectLeft, top: rectTop } = interactionCanvas.getBoundingClientRect();
    const [clickX, clickY] = [clientX - rectLeft, clientY - rectTop];
    const [tileArrayX, tileArrayY] = [(clickX / tileSize + tilePaddingWidth) >>> 0, (clickY / tileSize + tilePaddingHeight) >>> 0];
    const [tileX, tileY] = [Math.round(tileArrayX + startPoint.x), Math.round(tileArrayY + startPoint.y)];
    const clickedTile = tiles.get(tileArrayY, tileArrayX);
    return { tileArrayX, tileArrayY, tileX, tileY, clickedTile };
  };

  /** Chord click: open adjacent closed tiles if flag count matches tile number */
  const tryChordOpen = (clientX: number, clientY: number): boolean => {
    const resolved = resolveTileFromClient(clientX, clientY);
    if (!resolved) return false;
    const { tileArrayX, tileArrayY, tileX, tileY, clickedTile } = resolved;

    // Must be an opened number tile (1~7)
    if (!isTileOpen(clickedTile) || clickedTile === 0) return false;

    const [rangeX, rangeY] = [tileX - cursorOriginX, tileY - cursorOriginY];
    const isInRange = rangeX >= -1 && rangeX <= 1 && rangeY >= -1 && rangeY <= 1;
    if (!isInRange) return false;

    const number = getTileNumber(clickedTile);
    let flagCount = 0;
    const closedTiles: { x: number; y: number }[] = [];

    for (const [dx, dy] of NEIGHBOR_DIRS) {
      const neighbor = tiles.get(tileArrayY + dy, tileArrayX + dx);
      if (isTileFlag(neighbor) || isTileBomb(neighbor)) flagCount++;
      else if (isTileClosed(neighbor)) closedTiles.push({ x: tileX + dx, y: tileY + dy });
    }

    console.log(`[ChordClick] tile(${tileX},${tileY}) number=${number} flags=${flagCount} closed=${closedTiles.length}`);

    if (flagCount !== number || closedTiles.length === 0) return false;

    console.log(`[ChordClick] opening ${closedTiles.length} tiles:`, closedTiles);
    for (const pos of closedTiles) {
      clickEvent(pos.x, pos.y, SendMessageEvent.OPEN_TILES);
    }
    return true;
  };

  /** Click Event Handler */
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (didChordRef.current) {
      didChordRef.current = false;
      return;
    }
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    const interactionCanvas = canvasRefs.interactionCanvasRef.current;
    if (!interactionCanvas) return;
    const { left: rectLeft, top: rectTop } = interactionCanvas.getBoundingClientRect();
    const [clickX, clickY] = [event.clientX - rectLeft, event.clientY - rectTop];

    const [tileArrayX, tileArrayY] = [(clickX / tileSize + tilePaddingWidth) >>> 0, (clickY / tileSize + tilePaddingHeight) >>> 0];
    const [tileX, tileY] = [Math.round(tileArrayX + startPoint.x), Math.round(tileArrayY + startPoint.y)];
    const clickedTile = tiles.get(tileArrayY, tileArrayX);
    setClickPosition(tileX, tileY, clickedTile);

    const isClosed = isTileClosed(clickedTile);
    const isFlagged = isTileFlag(clickedTile);
    const [rangeX, rangeY] = [tileX - cursorOriginX, tileY - cursorOriginY];
    const isInRange = rangeX >= -1 && rangeX <= 1 && rangeY >= -1 && rangeY <= 1;
    // Touch + flag/bomb mode: treat tap as special (flag/bomb action)
    const isModeTap = pointerTypeRef.current === 'touch' && interactionMode !== 'normal';
    const clickType = event.buttons !== 2 && !isModeTap ? 'general' : 'special';
    const isActionable = isClosed || isFlagged;
    const isBombActionable = isActionable || (isBombMode && (isTileOpen(clickedTile) || isTileBomb(clickedTile)));

    // Handle in-range actions immediately
    if (isInRange) {
      if (isBombMode && isBombActionable && clickType === 'special') {
        clickEvent(tileX, tileY, SendMessageEvent.INSTALL_BOMB);
        return;
      }
      if (isActionable && clickType === 'special') clickEvent(tileX, tileY, SendMessageEvent.SET_FLAG);
      else if (isClosed && clickType === 'general') clickEvent(tileX, tileY, SendMessageEvent.OPEN_TILES);

      if (isActionable) return;
    }

    // Handle out-of-range clicks: move to nearest opened tile, then perform action
    // Skip if general click on an already-open tile (just move there instead)
    if (!isInRange && isBombActionable && !(clickType === 'general' && (isTileOpen(clickedTile) || isTileBomb(clickedTile)))) {
      const { x: targetX, y: targetY } = findOpenedNeighborsAroundTarget(tileX, tileY);
      if (targetX === Infinity || targetY === Infinity || movingPaths.length > 0) return;

      const actionEvent = isBombMode && clickType === 'special' ? SendMessageEvent.INSTALL_BOMB : CLICK_TYPE_TO_EVENT[clickType];

      const targetAbsoluteX = targetX + startPoint.x;
      const targetAbsoluteY = targetY + startPoint.y;
      if (targetAbsoluteX === cursorOriginX && targetAbsoluteY === cursorOriginY) {
        if (actionEvent) clickEvent(tileX, tileY, actionEvent);
        return;
      }

      if (!actionEvent) return;

      moveCursor(targetX, targetY, tileX, tileY, (x, y) => clickEvent(x, y, actionEvent));
      return;
    }

    // Default movement for opened tiles (general click only)
    if (clickType === 'special' && movingPaths.length > 0) return;
    let { x: targetTileX, y: targetTileY } = findOpenedNeighbors(tileArrayX, tileArrayY);
    if (isAlreadyCursorNeighbor(tileX, tileY)) [targetTileX, targetTileY] = [tileArrayX, tileArrayY];
    moveCursor(targetTileX, targetTileY, tileX, tileY);
  };

  /** Long-press handlers (for flagging via press-and-hold) */
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    // Handle right click immediately
    if (event.button === 2) {
      event.preventDefault();
      const interactionCanvas = canvasRefs.interactionCanvasRef.current;
      if (!interactionCanvas) return;

      const { left: rectLeft, top: rectTop } = interactionCanvas.getBoundingClientRect();
      const [clickX, clickY] = [event.clientX - rectLeft, event.clientY - rectTop];
      const [tileArrayX, tileArrayY] = [(clickX / tileSize + tilePaddingWidth) >>> 0, (clickY / tileSize + tilePaddingHeight) >>> 0];
      const [tileX, tileY] = [Math.round(tileArrayX + startPoint.x), Math.round(tileArrayY + startPoint.y)];
      const clickedTile = tiles.get(tileArrayY, tileArrayX);
      setClickPosition(tileX, tileY, clickedTile);
      const isClosed = isTileClosed(clickedTile);
      const isFlagged = isTileFlag(clickedTile);
      const [rangeX, rangeY] = [tileX - cursorOriginX, tileY - cursorOriginY];
      const isInRange = rangeX >= -1 && rangeX <= 1 && rangeY >= -1 && rangeY <= 1;

      const rightClickEvent = isBombMode ? SendMessageEvent.INSTALL_BOMB : SendMessageEvent.SET_FLAG;
      const isRightClickActionable = isBombMode ? (isClosed || isFlagged || isTileOpen(clickedTile) || isTileBomb(clickedTile)) : (isClosed || isFlagged);
      if (isInRange && isRightClickActionable) {
        clickEvent(tileX, tileY, rightClickEvent);
      } else if (!isInRange && isRightClickActionable) {
        const { x: targetX, y: targetY } = findOpenedNeighborsAroundTarget(tileX, tileY);
        if (!(targetX === Infinity || targetY === Infinity || movingPaths.length > 0)) {
          const targetAbsoluteX = targetX + startPoint.x;
          const targetAbsoluteY = targetY + startPoint.y;
          if (targetAbsoluteX === cursorOriginX && targetAbsoluteY === cursorOriginY) clickEvent(tileX, tileY, rightClickEvent);
          moveCursor(targetX, targetY, tileX, tileY, (cx, cy) => clickEvent(cx, cy, rightClickEvent));
        }
      }
      return;
    }

    // Handle left click for long press
    const interactionCanvas = canvasRefs.interactionCanvasRef.current;
    if (!interactionCanvas) return;

    const { left: rectLeft, top: rectTop } = interactionCanvas.getBoundingClientRect();
    const [clickX, clickY] = [event.clientX - rectLeft, event.clientY - rectTop];

    longPressPositionRef.current = { x: clickX, y: clickY };
    pointerTypeRef.current = event.pointerType;

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (dismantleTimerRef.current) clearTimeout(dismantleTimerRef.current);

    const resolveTileAt = (pos: { x: number; y: number }) => {
      const [tileArrayX, tileArrayY] = [(pos.x / tileSize + tilePaddingWidth) >>> 0, (pos.y / tileSize + tilePaddingHeight) >>> 0];
      const [tileX, tileY] = [Math.round(tileArrayX + startPoint.x), Math.round(tileArrayY + startPoint.y)];
      const clickedTile = tiles.get(tileArrayY, tileArrayX);
      const isClosed = isTileClosed(clickedTile);
      const isFlagged = isTileFlag(clickedTile);
      const [rangeX, rangeY] = [tileX - cursorOriginX, tileY - cursorOriginY];
      const isInRange = rangeX >= -1 && rangeX <= 1 && rangeY >= -1 && rangeY <= 1;
      const isOpen = isTileOpen(clickedTile);
      const isBomb = isTileBomb(clickedTile);
      const isActionable = isClosed || isFlagged;
      return { tileX, tileY, isClosed, isFlagged, isOpen, isBomb, isInRange, isActionable };
    };

    const executeAction = (actionEvent: SendMessageEvent) => {
      const position = longPressPositionRef.current;
      if (!position || isPinching?.()) return;
      const { tileX, tileY, isInRange, isActionable, isOpen, isBomb } = resolveTileAt(position);
      const canAct = isActionable || (isBombMode && (isOpen || isBomb) && actionEvent === SendMessageEvent.INSTALL_BOMB);

      if (isInRange && canAct) clickEvent(tileX, tileY, actionEvent);
      else if (canAct) {
        const { x: targetX, y: targetY } = findOpenedNeighborsAroundTarget(tileX, tileY);
        if (!(targetX === Infinity || targetY === Infinity || movingPaths.length > 0)) {
          moveCursor(targetX, targetY, tileX, tileY, (cx, cy) => clickEvent(cx, cy, actionEvent));
        }
      }

      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      longPressPositionRef.current = null;
    };

    if (event.pointerType === 'touch') {
      if (interactionMode !== 'normal') {
        // Flag/bomb mode: long-press only does dismantle (tap already handles flag/bomb)
        longPressTimerRef.current = setTimeout(() => {
          executeAction(SendMessageEvent.DISMANTLE_MINE);
        }, LONG_PRESS_DURATION);
      } else {
        // Normal mode: 300ms → SET_FLAG, 700ms → DISMANTLE_MINE
        longPressTimerRef.current = setTimeout(() => {
          const flagEvent = isBombMode ? SendMessageEvent.INSTALL_BOMB : SendMessageEvent.SET_FLAG;
          executeAction(flagEvent);

          // Start second timer for dismantle
          dismantleTimerRef.current = setTimeout(() => {
            const position = longPressPositionRef.current;
            if (!position || isPinching?.()) return;
            const { tileX, tileY, isInRange, isActionable } = resolveTileAt(position);

            if (isInRange && isActionable) clickEvent(tileX, tileY, SendMessageEvent.DISMANTLE_MINE);
            dismantleTimerRef.current = null;
          }, TOUCH_DISMANTLE_DURATION - TOUCH_FLAG_DURATION);
        }, TOUCH_FLAG_DURATION);
      }
    } else {
      // Mouse: 500ms → DISMANTLE_MINE (unchanged)
      longPressTimerRef.current = setTimeout(() => {
        executeAction(SendMessageEvent.DISMANTLE_MINE);
      }, LONG_PRESS_DURATION);
    }
  };

  /** Chord click detection via mouseDown — check buttons bitmask for both pressed */
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    console.log(`[MouseDown] button=${event.button} buttons=${event.buttons}`);
    // buttons bitmask: 1=left, 2=right → 3=both
    if ((event.buttons & 3) === 3) {
      console.log('[ChordDetect] both buttons pressed');
      const chordFired = tryChordOpen(event.clientX, event.clientY);
      if (chordFired) {
        didChordRef.current = true;
        // Cancel long press timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressPositionRef.current = null;
      }
    }
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (dismantleTimerRef.current) {
      clearTimeout(dismantleTimerRef.current);
      dismantleTimerRef.current = null;
    }
    longPressPositionRef.current = null;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!longPressTimerRef.current || !longPressPositionRef.current) return;

    const interactionCanvas = canvasRefs.interactionCanvasRef.current;
    if (!interactionCanvas) return;

    const { left: rectLeft, top: rectTop } = interactionCanvas.getBoundingClientRect();
    const [currentX, currentY] = [event.clientX - rectLeft, event.clientY - rectTop];

    const dx = currentX - longPressPositionRef.current.x;
    const dy = currentY - longPressPositionRef.current.y;
    const distance = Math.hypot(dx, dy);

    if (distance > LONG_PRESS_MOVE_THRESHOLD) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      if (dismantleTimerRef.current) {
        clearTimeout(dismantleTimerRef.current);
        dismantleTimerRef.current = null;
      }
      longPressPositionRef.current = null;
    }
  };

  return { handleClick, handleMouseDown, handlePointerDown, handlePointerUp, handlePointerMove };
}
