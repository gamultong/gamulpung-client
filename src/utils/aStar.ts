import { XYType } from '@/types';
import { TileGrid } from '@/utils/tileGrid';
import { isTileOpened } from '@/utils/tileGrid';
import { CURSOR_DIRECTIONS } from '@/constants';

export class TileNode {
  x: number;
  y: number;
  gScore: number;
  heuristic: number;
  fTotal: number;
  parent: TileNode | null;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.gScore = Infinity; // Cost from start node
    this.heuristic = 0; // Heuristic (estimated cost to goal)
    this.fTotal = Infinity; // Total cost f = g + h
    this.parent = null; // For path reconstruction
  }
}

/**
 * Find path using A* algorithm avoiding flags and move cursor in 8 directions
 * @param tiles - the tile grid to search on
 * @param startX - x position of start point (relative)
 * @param startY - y position of start point (relative)
 * @param targetX - x position of target point (relative)
 * @param targetY - y position of target point (relative)
 * @param isBlocked - function to check if a tile is blocked (e.g., occupied by another cursor)
 * @param onProgress - optional callback to report progress (distance from start)
 */
export function findPathUsingAStar(
  tiles: TileGrid,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  isBlocked: (x: number, y: number) => boolean,
  onProgress?: (leftPaths: XYType) => void,
): XYType[] {
  // Early return: if already at target, return empty path
  if (startX === targetX && startY === targetY) return [{ x: 0, y: 0 }];

  // Early return: if target is directly adjacent, return direct path
  const dx = targetX - startX;
  const dy = targetY - startY;
  const isAdjacent = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0);
  if (isAdjacent) {
    // Check if the target tile is accessible
    const targetRelativeY = targetY;
    const targetRelativeX = targetX;
    if (
      targetRelativeY >= 0 &&
      targetRelativeY < tiles.height &&
      targetRelativeX >= 0 &&
      targetRelativeX < tiles.width &&
      isTileOpened(tiles.get(targetRelativeY, targetRelativeX)) &&
      !isBlocked(targetRelativeX, targetRelativeY)
    ) {
      return [
        { x: 0, y: 0 },
        { x: dx, y: dy },
      ];
    }
  }

  // Function to get neighbors of a node
  const getNeighbors = (grid: (TileNode | null)[][], node: TileNode) => {
    const neighbors = [];
    for (const [dx, dy] of CURSOR_DIRECTIONS) {
      // Check if the neighbor is within bounds and not a flag or other cursor
      const [x, y] = [node.x + dx, node.y + dy];
      // Check if the neighbor is within bounds
      if (y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) continue;
      // Check if the tile is opened and not occupied by another cursor
      if (grid[y][x] === null || isBlocked(x, y)) continue;
      // Add the neighbor node
      neighbors.push({ node: grid[y][x], isDiagonal: dx !== 0 && dy !== 0 });
    }
    return neighbors;
  };

  /** calculate distance from target */
  const getLeftPaths = (temp: TileNode, x: number, y: number): XYType => ({ x: temp.x - x, y: temp.y - y });

  /** initialize tiles */
  const [start, target] = [new TileNode(startX, startY), new TileNode(targetX, targetY)];

  const grid: (TileNode | null)[][] = [];
  for (let i = 0; i < tiles.height; i++) {
    const row: (TileNode | null)[] = [];
    for (let j = 0; j < tiles.width; j++) {
      row.push(isTileOpened(tiles.get(i, j)) ? new TileNode(j, i) : null);
    }
    grid.push(row);
  }

  // Check if target is accessible
  if (targetY < 0 || targetY >= grid.length || targetX < 0 || targetX >= grid[targetY]?.length || grid[targetY][targetX] === null) {
    return [];
  }

  /** initialize open and close list */
  let openNodeList = [start];
  const closedList: TileNode[] = [];
  start.gScore = 0;
  start.heuristic = Math.abs(startX - targetX) + Math.abs(startY - targetY);
  start.fTotal = start.gScore + start.heuristic;

  while (openNodeList.length > 0) {
    const nowNode = openNodeList.reduce((a, b) => (a.fTotal < b.fTotal ? a : b));
    const leftPaths = getLeftPaths(nowNode, startX, startY);
    onProgress?.(leftPaths);
    if (nowNode.x === target.x && nowNode.y === target.y) {
      const path = [];
      for (let temp = nowNode; temp; temp = temp.parent!) path.unshift({ x: temp.x - startX, y: temp.y - startY });
      return path;
    }
    openNodeList = openNodeList.filter(node => node !== nowNode);
    closedList.push(nowNode);

    /** Find neighbor nodes from current node. */
    const neighbors = getNeighbors(grid, nowNode);
    for (const { node, isDiagonal } of neighbors) {
      if (closedList.includes(node)) continue;
      // Apply different cost for diagonal movement
      const tempG = nowNode.gScore + (isDiagonal ? 14 : 10);
      if (tempG >= node.gScore) continue;
      if (!openNodeList.includes(node)) openNodeList.push(node);
      node.parent = nowNode;
      node.gScore = tempG;
      node.heuristic = Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
      node.fTotal = node.gScore + node.heuristic;
    }
  }
  return [];
}
