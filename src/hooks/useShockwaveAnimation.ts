'use client';
import { useEffect, useRef, RefObject } from 'react';
import { ActiveExplosion, XYType } from '@/types';

interface UseShockwaveAnimationOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  activeExplosions: ActiveExplosion[];
  removeExplosion: (id: number) => void;
  tileSize: number;
  startPoint: XYType;
  tilePaddingWidth: number;
  tilePaddingHeight: number;
}

export default function useShockwaveAnimation({
  canvasRef,
  activeExplosions,
  removeExplosion,
  tileSize,
  startPoint,
  tilePaddingWidth,
  tilePaddingHeight,
}: UseShockwaveAnimationOptions) {
  // Refs for RAF loop (avoids effect restart on every state change)
  const activeExplosionsRef = useRef<ActiveExplosion[]>([]);
  activeExplosionsRef.current = activeExplosions;
  const shockwaveFrameRef = useRef(0);
  const sparkAnglesRef = useRef(new Map<number, number[]>());
  const removeExplosionRef = useRef(removeExplosion);
  removeExplosionRef.current = removeExplosion;

  const hasExplosions = activeExplosions.length > 0;
  useEffect(() => {
    if (!hasExplosions) return;
    if (shockwaveFrameRef.current) return; // already running

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const DURATION = 2000;
    const MAX_RADIUS_TILES = 4;
    const RING_COUNT = 5;
    const SPARK_COUNT = 16;
    const RAY_COUNT = 12;

    // Setup high-res canvas once
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';

    const getSparkAngles = (id: number): number[] => {
      const map = sparkAnglesRef.current;
      let angles = map.get(id);
      if (!angles) {
        angles = [];
        let seed = id * 9301 + 49297;
        for (let i = 0; i < SPARK_COUNT; i++) {
          seed = (seed * 9301 + 49297) % 233280;
          angles.push((seed / 233280) * Math.PI * 2);
        }
        map.set(id, angles);
      }
      return angles;
    };

    const animate = () => {
      const explosions = activeExplosionsRef.current;
      const now = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (explosions.length === 0) {
        shockwaveFrameRef.current = 0;
        return;
      }

      const completedIds: number[] = [];
      const ts = tileSize;
      const sp = startPoint;
      const tpw = tilePaddingWidth;
      const tph = tilePaddingHeight;

      for (const explosion of explosions) {
        const elapsed = now - explosion.startTime;
        if (elapsed >= DURATION) {
          completedIds.push(explosion.id);
          continue;
        }

        const progress = elapsed / DURATION;
        const relTileX = explosion.position.x - sp.x;
        const relTileY = explosion.position.y - sp.y;
        const centerX = (relTileX + 0.5 - tpw) * ts;
        const centerY = (relTileY + 0.5 - tph) * ts;
        const maxRadiusPx = MAX_RADIUS_TILES * ts;

        // === 1. Screen flash ===
        if (progress < 0.08) {
          const flashAlpha = 0.25 * (1 - progress / 0.08);
          ctx.fillStyle = `rgba(255, 200, 100, ${flashAlpha})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // === 2. Radial light rays ===
        if (progress < 0.7) {
          const rayProgress = progress / 0.7;
          const rayLength = rayProgress * rayProgress * maxRadiusPx * 1.2;
          const rayOpacity = 0.35 * (1 - rayProgress);
          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < RAY_COUNT; i++) {
            const angle = (i / RAY_COUNT) * Math.PI * 2 + progress * 0.5;
            const rayWidth = ts * 0.08 * (1 - rayProgress * 0.6);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle - rayWidth) * rayLength, Math.sin(angle - rayWidth) * rayLength);
            ctx.lineTo(Math.cos(angle + rayWidth) * rayLength, Math.sin(angle + rayWidth) * rayLength);
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 180, 60, ${rayOpacity})`;
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
        }

        // === 3. Multi-layer radial glow ===
        if (progress < 0.7) {
          const glowProgress = progress / 0.7;
          const glowEased = glowProgress * glowProgress;
          const glowRadius = glowEased * maxRadiusPx * 0.8;
          const glowOpacity = 0.5 * (1 - glowProgress);
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius || 1);
          gradient.addColorStop(0, `rgba(255, 220, 80, ${glowOpacity})`);
          gradient.addColorStop(0.3, `rgba(255, 100, 20, ${glowOpacity * 0.7})`);
          gradient.addColorStop(0.6, `rgba(200, 40, 10, ${glowOpacity * 0.3})`);
          gradient.addColorStop(1, 'rgba(150, 20, 5, 0)');
          ctx.beginPath();
          ctx.arc(centerX, centerY, glowRadius || 1, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        // === 4. Concentric shockwave rings ===
        for (let ring = 0; ring < RING_COUNT; ring++) {
          const ringDelay = ring * 0.1;
          const ringProgress = Math.max(0, Math.min(1, (progress - ringDelay) / (1 - ringDelay)));
          if (ringProgress <= 0) continue;

          const ringEased = ringProgress * ringProgress;
          const radius = ringEased * maxRadiusPx;
          const fadeIn = Math.min(1, ringProgress / 0.15);
          const fadeOut = Math.max(0, 1 - (ringProgress - 0.15) / 0.85);
          const opacity = fadeIn * fadeOut * (1 - ring * 0.12);
          const lineWidth = Math.max(2, ts * 0.3 * (1 - ringProgress * 0.8));

          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 60, 10, ${opacity * 0.4})`;
          ctx.lineWidth = lineWidth * 2.5;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, ${80 + ring * 25}, ${10 + ring * 10}, ${opacity})`;
          ctx.lineWidth = lineWidth;
          ctx.stroke();
        }

        // === 5. Flying spark particles ===
        const sparkAngles = getSparkAngles(explosion.id);
        if (progress > 0.02 && progress < 0.8) {
          const sparkProgress = (progress - 0.02) / 0.78;
          const sparkEased = sparkProgress * sparkProgress;
          const sparkOpacity = Math.min(1, sparkProgress / 0.1) * Math.max(0, 1 - (sparkProgress - 0.3) / 0.7);
          for (let i = 0; i < SPARK_COUNT; i++) {
            const dist = sparkEased * maxRadiusPx * (0.6 + (i % 3) * 0.25);
            const sx = centerX + Math.cos(sparkAngles[i]) * dist;
            const sy = centerY + Math.sin(sparkAngles[i]) * dist;
            const sparkSize = Math.max(1, ts * 0.06 * (1 - sparkProgress * 0.7));
            ctx.beginPath();
            ctx.arc(sx, sy, sparkSize, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 === 0 ? `rgba(255, 255, 180, ${sparkOpacity})` : `rgba(255, 140, 40, ${sparkOpacity * 0.8})`;
            ctx.fill();
          }
        }

        // === 6. White-hot core flash ===
        if (progress < 0.4) {
          const fp = progress / 0.4;
          const fr = ts * 0.5 * (1 - fp * fp);
          const fo = 1.0 * (1 - fp);
          ctx.beginPath();
          ctx.arc(centerX, centerY, fr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 240, ${fo})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(centerX, centerY, fr * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 150, 30, ${fo * 0.5})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(centerX, centerY, fr * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 50, 10, ${fo * 0.2})`;
          ctx.fill();
        }
      }

      // Remove completed explosions
      if (completedIds.length > 0) {
        completedIds.forEach(id => {
          sparkAnglesRef.current.delete(id);
          removeExplosionRef.current(id);
        });
      }

      shockwaveFrameRef.current = requestAnimationFrame(animate);
    };

    shockwaveFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (shockwaveFrameRef.current) {
        cancelAnimationFrame(shockwaveFrameRef.current);
        shockwaveFrameRef.current = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExplosions]);
}
