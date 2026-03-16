'use client';
import { useEffect, useRef, RefObject } from 'react';
import { ActiveBombMarker, COLORMAP_HEX } from '@/types';
import { useTileStore } from '@/store/tileStore';
import { useCursorStore } from '@/store/cursorStore';
import { RENDER_RANGE } from '@/app/play/constants';

interface UseBombMarkerAnimationOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  activeBombMarkers: ActiveBombMarker[];
  removeBombMarker: (id: number) => void;
}

const DURATION = 3000;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.replace('#', ''), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export default function useBombMarkerAnimation({
  canvasRef,
  activeBombMarkers,
  removeBombMarker,
}: UseBombMarkerAnimationOptions) {
  const markersRef = useRef<ActiveBombMarker[]>([]);
  markersRef.current = activeBombMarkers;
  const frameRef = useRef(0);
  const removeRef = useRef(removeBombMarker);
  removeRef.current = removeBombMarker;

  const hasMarkers = activeBombMarkers.length > 0;

  useEffect(() => {
    if (!hasMarkers) return;
    if (frameRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const animate = () => {
      const markers = markersRef.current;
      const now = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (markers.length === 0) {
        frameRef.current = 0;
        return;
      }

      // Read latest values directly from stores every frame
      const { renderStartPoint, tileSize: ts } = useTileStore.getState();
      const { originPosition } = useCursorStore.getState();
      const relX = originPosition.x - renderStartPoint.x;
      const relY = originPosition.y - renderStartPoint.y;
      const tpw = ((RENDER_RANGE - 1) * relX) / RENDER_RANGE;
      const tph = ((RENDER_RANGE - 1) * relY) / RENDER_RANGE;

      const completedIds: number[] = [];

      for (const marker of markers) {
        const elapsed = now - marker.startTime;
        if (elapsed >= DURATION) {
          completedIds.push(marker.id);
          continue;
        }

        const progress = elapsed / DURATION;
        const mx = marker.position.x - renderStartPoint.x;
        const my = marker.position.y - renderStartPoint.y;
        const cx = (mx + 0.5 - tpw) * ts;
        const cy = (my + 0.5 - tph) * ts;

        const hex = COLORMAP_HEX[marker.color as keyof typeof COLORMAP_HEX] || '#FFFFFF';
        const { r, g, b } = hexToRgb(hex);

        // Fade out in the last 40%
        const alpha = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;

        // Pulsing bomb marker
        const pulse = 1 + 0.15 * Math.sin(progress * Math.PI * 6);
        const radius = ts * 0.35 * pulse;

        // Outer glow
        const glowRadius = radius * 1.8;
        const gradient = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, glowRadius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Inner circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.7})`;
        ctx.fill();

        // Bomb icon (simple: dark circle + fuse line)
        const bombR = radius * 0.55;
        ctx.beginPath();
        ctx.arc(cx, cy, bombR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(30, 30, 30, ${alpha * 0.85})`;
        ctx.fill();

        // Fuse spark
        const sparkPhase = (progress * 8) % 1;
        const sparkAlpha = alpha * (0.5 + 0.5 * Math.sin(sparkPhase * Math.PI * 2));
        const fuseX = cx + bombR * 0.6;
        const fuseY = cy - bombR * 0.6;
        ctx.beginPath();
        ctx.arc(fuseX, fuseY, bombR * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 80, ${sparkAlpha})`;
        ctx.fill();
      }

      if (completedIds.length > 0) {
        completedIds.forEach(id => removeRef.current(id));
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMarkers]);
}
