'use client';
import { useRef, useCallback } from 'react';

interface UsePinchZoomOptions {
  zoomUp: () => void;
  zoomDown: () => void;
}

const PINCH_ZOOM_THRESHOLD = 30; // px distance change to trigger zoom step

export default function usePinchZoom({ zoomUp, zoomDown }: UsePinchZoomOptions) {
  const initialPinchDistanceRef = useRef<number | null>(null);
  const accumulatedDeltaRef = useRef<number>(0);

  const getTouchDistance = (touches: React.TouchList): number => {
    const [t0, t1] = [touches[0], touches[1]];
    return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  };

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length === 2) {
      initialPinchDistanceRef.current = getTouchDistance(event.touches);
      accumulatedDeltaRef.current = 0;
    }
  }, []);

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLCanvasElement>) => {
      if (event.touches.length !== 2 || initialPinchDistanceRef.current === null) return;

      const currentDistance = getTouchDistance(event.touches);
      const delta = currentDistance - initialPinchDistanceRef.current;
      accumulatedDeltaRef.current = delta;

      if (Math.abs(delta) >= PINCH_ZOOM_THRESHOLD) {
        if (delta > 0) zoomUp();
        else zoomDown();
        initialPinchDistanceRef.current = currentDistance;
        accumulatedDeltaRef.current = 0;
      }
    },
    [zoomUp, zoomDown],
  );

  const handleTouchEnd = useCallback(() => {
    initialPinchDistanceRef.current = null;
    accumulatedDeltaRef.current = 0;
  }, []);

  const isPinching = useCallback(() => initialPinchDistanceRef.current !== null, []);

  return { handleTouchStart, handleTouchMove, handleTouchEnd, isPinching };
}
