'use client';
import { useState, useRef, useCallback } from 'react';
import { ActiveExplosion, XYType } from '@/types';

export default function useExplosionManager() {
  const [activeExplosions, setActiveExplosions] = useState<ActiveExplosion[]>([]);
  const explosionIdRef = useRef(0);

  const onExplosion = useCallback((position: XYType) => {
    const id = ++explosionIdRef.current;
    setActiveExplosions(prev => [...prev, { id, position, startTime: performance.now() }]);
  }, []);

  const removeExplosion = useCallback((id: number) => {
    setActiveExplosions(prev => prev.filter(e => e.id !== id));
  }, []);

  return { activeExplosions, onExplosion, removeExplosion };
}
