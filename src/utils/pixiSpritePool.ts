import { Container as PixiContainer, Sprite as PixiSprite } from 'pixi.js';

/** Creates / grows a pool of PixiSprites inside a container, returns the pool array. */
export function ensurePool(pool: PixiSprite[], container: PixiContainer, needed: number): PixiSprite[] {
  while (pool.length < needed) {
    const s = new PixiSprite();
    s.roundPixels = true;
    s.eventMode = 'none' as unknown as never;
    s.cullable = true;
    s.visible = false;
    container.addChild(s);
    pool.push(s);
  }
  return pool;
}

/** Hide all sprites in a pool starting from index `from` */
export function hidePoolFrom(pool: PixiSprite[], from: number) {
  for (let i = from; i < pool.length; i++) pool[i].visible = false;
}
