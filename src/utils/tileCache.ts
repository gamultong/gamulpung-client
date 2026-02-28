import { Tile } from './tileGrid';

const MAX_CACHE_SIZE = 100_000;
const cache = new Map<string, number>();

/** Store non-FILL tiles from a grid into the world-coordinate cache. */
export function cacheTiles(worldStartX: number, worldStartY: number, data: Uint8Array, width: number, height: number) {
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const value = data[row * width + col];
      if (value !== Tile.FILL) {
        cache.set(`${worldStartX + col},${worldStartY + row}`, value);
      }
    }
  }
  // Evict oldest entries if over limit (FIFO — oldest inserted tiles are likely furthest away)
  if (cache.size > MAX_CACHE_SIZE) {
    const toDelete = cache.size - MAX_CACHE_SIZE;
    let count = 0;
    for (const key of cache.keys()) {
      if (count >= toDelete) break;
      cache.delete(key);
      count++;
    }
  }
}

/** Restore cached tiles into a FILL-initialized grid. Returns number of tiles restored. */
export function restoreCachedTiles(worldStartX: number, worldStartY: number, data: Uint8Array, width: number, height: number): number {
  let restored = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cached = cache.get(`${worldStartX + col},${worldStartY + row}`);
      if (cached !== undefined) {
        data[row * width + col] = cached;
        restored++;
      }
    }
  }
  return restored;
}

export function clearTileCache() {
  cache.clear();
}
