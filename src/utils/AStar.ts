import { TileType } from '../constants';

export interface Vec2 { x: number; y: number; }

/**
 * A* 寻路，返回从 (sx,sy) 到 (tx,ty) 的方向步骤序列（不含起点）。
 * grid 里 Wall 不可通行，Exit 可通行（出口格）。
 * 找不到路径返回空数组。
 */
export function aStar(
  grid: number[][],
  sx: number, sy: number,
  tx: number, ty: number,
): Vec2[] {
  if (sx === tx && sy === ty) return [];

  const rows = grid.length;
  const cols = grid[0].length;

  const isWalkable = (x: number, y: number) => {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
    return grid[y][x] !== TileType.Wall;
  };

  if (!isWalkable(tx, ty)) return [];

  type Node = { x: number; y: number; g: number; f: number; parent: Node | null };

  const key = (x: number, y: number) => `${x},${y}`;
  const h = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty);

  const open = new Map<string, Node>();
  const closed = new Set<string>();

  const start: Node = { x: sx, y: sy, g: 0, f: h(sx, sy), parent: null };
  open.set(key(sx, sy), start);

  const dirs: Vec2[] = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

  while (open.size > 0) {
    // 取 f 最小的节点
    let cur: Node | null = null;
    for (const n of open.values()) {
      if (!cur || n.f < cur.f) cur = n;
    }
    if (!cur) break;

    if (cur.x === tx && cur.y === ty) {
      // 回溯路径，转换为方向向量
      const steps: Vec2[] = [];
      let node: Node | null = cur;
      while (node && node.parent) {
        steps.push({ x: node.x - node.parent.x, y: node.y - node.parent.y });
        node = node.parent;
      }
      steps.reverse();
      return steps;
    }

    const ck = key(cur.x, cur.y);
    open.delete(ck);
    closed.add(ck);

    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      const nk = key(nx, ny);
      if (closed.has(nk) || !isWalkable(nx, ny)) continue;

      const g = cur.g + 1;
      const existing = open.get(nk);
      if (!existing || g < existing.g) {
        const node: Node = { x: nx, y: ny, g, f: g + h(nx, ny), parent: cur };
        open.set(nk, node);
      }
    }
  }

  return []; // 无路径
}
