'use client';
import { useState, useRef, useCallback } from 'react';
import { ActiveBombMarker, XYType } from '@/types';

export default function useBombMarkerManager() {
  const [activeBombMarkers, setActiveBombMarkers] = useState<ActiveBombMarker[]>([]);
  const markerIdRef = useRef(0);

  const onBombPosition = useCallback((position: XYType, color: number) => {
    const id = ++markerIdRef.current;
    setActiveBombMarkers(prev => [...prev, { id, position, color, startTime: performance.now() }]);
  }, []);

  const removeBombMarker = useCallback((id: number) => {
    setActiveBombMarkers(prev => prev.filter(m => m.id !== id));
  }, []);

  return { activeBombMarkers, onBombPosition, removeBombMarker };
}
