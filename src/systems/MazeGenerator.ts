import { LCG } from '../utils/LCG';
import { CHUNK_TILES, MID, FRAGMENT_COUNT, TileType } from '../constants';
import type { FragmentInfo, EnemyData, EnemyKind } from '../types';

type Cell = [number, number]; // [cx, cy] in cell coordinates

/**
 * 迷宫生成器 — Randomized DFS
 *
 * 保证：
 * - 所有通路格互相连通
 * - 四个出口（边中点）均可到达
 * - 3×3 中心房间可到达
 * - 所有碎片可到达
 */
export class MazeGenerator {

  static generate(seed: number): number[][] {
    const size = CHUNK_TILES;                   // 21
    const cellsPerAxis = Math.floor(size / 2);  // 10
    const rng = new LCG(seed);

    // ---- 1. 全部初始化为墙 ----
    const grid: number[][] = [];
    for (let y = 0; y < size; y++) {
      grid[y] = new Array(size).fill(TileType.Wall);
    }

    // ---- 2. 开辟 3×3 中心房间 (MID-1..MID+1) ----
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        grid[MID + dy][MID + dx] = TileType.Floor;
      }
    }

    // ---- 3. 用 cell 坐标系做 Randomized DFS ----
    // cell (cx, cy) → grid (2*cx+1, 2*cy+1)
    // 中心房间覆盖的 cell: cc1=4, cc2=5
    const cc1 = Math.floor((MID - 1) / 2); // 4
    const cc2 = cc1 + 1;                    // 5

    const visited: boolean[][] = Array.from(
      { length: cellsPerAxis },
      () => new Array(cellsPerAxis).fill(false),
    );

    // 标记中心 4 个 cell 为已访问
    for (const cy of [cc1, cc2]) {
      for (const cx of [cc1, cc2]) {
        visited[cy][cx] = true;
        grid[cy * 2 + 1][cx * 2 + 1] = TileType.Floor;
      }
    }

    // DFS
    const centerCells: Cell[] = [[cc1, cc1], [cc1, cc2], [cc2, cc1], [cc2, cc2]];
    rng.shuffle(centerCells);
    const stack: Cell[] = [...centerCells];
    const dirs: Cell[] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];

      // 收集未访问邻居
      const unvisited: Cell[] = [];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < cellsPerAxis && ny >= 0 && ny < cellsPerAxis && !visited[ny][nx]) {
          unvisited.push([nx, ny]);
        }
      }

      if (unvisited.length === 0) {
        stack.pop();
        continue;
      }

      const [nx, ny] = unvisited[rng.next() % unvisited.length];
      visited[ny][nx] = true;

      // 打通 cell 格
      grid[ny * 2 + 1][nx * 2 + 1] = TileType.Floor;
      // 打通两个 cell 之间的墙
      grid[cy + ny + 1][cx + nx + 1] = TileType.Floor;

      stack.push([nx, ny]);
    }

    // ---- 4. 额外打通一些墙，增加路线多样性 ----
    const extraPassages = Math.floor(cellsPerAxis * 1.5);
    for (let i = 0; i < extraPassages; i++) {
      const cx = rng.next() % cellsPerAxis;
      const cy = rng.next() % cellsPerAxis;
      const [dx, dy] = dirs[rng.next() % 4];
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < cellsPerAxis && ny >= 0 && ny < cellsPerAxis) {
        grid[cy + ny + 1][cx + nx + 1] = TileType.Floor;
      }
    }

    // ---- 5. 设置出口 ----
    grid[0][MID] = TileType.Exit;            // 上
    grid[size - 1][MID] = TileType.Exit;     // 下
    grid[MID][0] = TileType.Exit;            // 左
    grid[MID][size - 1] = TileType.Exit;     // 右

    // 确保出口与迷宫连通（打通出口旁的墙格）
    grid[1][MID] = TileType.Floor;
    grid[size - 2][MID] = TileType.Floor;
    grid[MID][1] = TileType.Floor;
    grid[MID][size - 2] = TileType.Floor;

    return grid;
  }

  /**
   * 生成家园网格——围墙边框 + 十字石板路 + 门柱 + 角落装饰
   */
  static generateHome(): number[][] {
    const size = CHUNK_TILES; // 21
    // 全面地板开始
    const grid: number[][] = Array.from(
      { length: size },
      () => new Array(size).fill(TileType.Floor),
    );

    // 1. 围墙边框（除出口外全部是墙）
    for (let i = 0; i < size; i++) {
      grid[0][i]        = TileType.Wall;
      grid[size-1][i]   = TileType.Wall;
      grid[i][0]        = TileType.Wall;
      grid[i][size-1]   = TileType.Wall;
    }
    grid[0][MID]        = TileType.Exit; // 上
    grid[size-1][MID]   = TileType.Exit; // 下
    grid[MID][0]        = TileType.Exit; // 左
    grid[MID][size-1]   = TileType.Exit; // 右

    // 2. 门柱（进入时两侧各一块石住）
    // 上门
    grid[2][MID-1] = TileType.Wall; grid[2][MID+1] = TileType.Wall;
    // 下门
    grid[size-3][MID-1] = TileType.Wall; grid[size-3][MID+1] = TileType.Wall;
    // 左门
    grid[MID-1][2] = TileType.Wall; grid[MID+1][2] = TileType.Wall;
    // 右门
    grid[MID-1][size-3] = TileType.Wall; grid[MID+1][size-3] = TileType.Wall;

    // 3. 角落小堆装饰石
    const corners = [2, size-3] as const;
    for (const cy2 of corners) {
      for (const cx2 of corners) {
        grid[cy2][cx2]   = TileType.Wall;
        grid[cy2][cx2 + (cx2 < MID ? 1 : -1)] = TileType.Wall;
        grid[cy2 + (cy2 < MID ? 1 : -1)][cx2] = TileType.Wall;
      }
    }

    return grid;
  }

  /**
   * 生成锚定商店网格——全开放地板 + 围墙 + 四方出口（无迷宫）
   */
  static generateShopFloor(): number[][] {
    const size = CHUNK_TILES;
    const grid: number[][] = Array.from(
      { length: size },
      () => new Array(size).fill(TileType.Floor),
    );
    for (let i = 0; i < size; i++) {
      grid[0][i]      = TileType.Wall;
      grid[size-1][i] = TileType.Wall;
      grid[i][0]      = TileType.Wall;
      grid[i][size-1] = TileType.Wall;
    }
    grid[0][MID]      = TileType.Exit;
    grid[size-1][MID] = TileType.Exit;
    grid[MID][0]      = TileType.Exit;
    grid[MID][size-1] = TileType.Exit;
    return grid;
  }

  /**
   * 在通路格上放置碎片（保证可达）
   */
  static placeFragments(
    grid: number[][],
    seed: number,
    cx: number,
    cy: number,
  ): FragmentInfo[] {
    const rng = new LCG(seed ^ 0xdeadbeef);
    const candidates: { x: number; y: number }[] = [];

    for (let y = 1; y < CHUNK_TILES - 1; y++) {
      for (let x = 1; x < CHUNK_TILES - 1; x++) {
        if (grid[y][x] !== TileType.Floor) continue;
        // 排除中心房间 (MID±1)
        if (Math.abs(x - MID) <= 1 && Math.abs(y - MID) <= 1) continue;
        // 排除出口附近
        if (x === MID && y <= 2) continue;
        if (x === MID && y >= CHUNK_TILES - 3) continue;
        if (y === MID && x <= 2) continue;
        if (y === MID && x >= CHUNK_TILES - 3) continue;
        candidates.push({ x, y });
      }
    }

    rng.shuffle(candidates);
    const count = Math.min(FRAGMENT_COUNT, candidates.length);
    return candidates.slice(0, count).map((pos, i) => ({
      x: pos.x,
      y: pos.y,
      id: `frag_${cx}_${cy}_${i}`,
      collected: false,
    }));
  }

  /**
   * 在敌营区块中放置三类敌人（排除中心区和出口通道）
   */
  static placeEnemies(grid: number[][], seed: number, cx: number, cy: number): EnemyData[] {
    const rng = new LCG((seed ^ 0xcafebabe) >>> 0);
    const dist = Math.abs(cx) + Math.abs(cy);

    const numScouts  = Math.min(3, 1 + Math.floor(dist / 4));
    const numChasers = Math.min(4, 1 + Math.floor(dist / 3));
    const numSnipers = Math.min(2, Math.floor(dist / 4));

    // 收集候选地板格（排除中心区、出口通道、边界）
    const candidates: [number, number][] = [];
    for (let y = 1; y < CHUNK_TILES - 1; y++) {
      for (let x = 1; x < CHUNK_TILES - 1; x++) {
        if (grid[y][x] !== TileType.Floor) continue;
        if (Math.abs(x - MID) <= 3 && Math.abs(y - MID) <= 3) continue;
        if (x === MID && y <= 2) continue;
        if (x === MID && y >= CHUNK_TILES - 3) continue;
        if (y === MID && x <= 2) continue;
        if (y === MID && x >= CHUNK_TILES - 3) continue;
        candidates.push([x, y]);
      }
    }
    rng.shuffle(candidates);

    const enemies: EnemyData[] = [];
    const occupied = new Set<string>();
    let idx = 0;

    const place = (kind: EnemyKind, hp: number): EnemyData | null => {
      while (idx < candidates.length) {
        const [x, y] = candidates[idx++];
        const k = `${x},${y}`;
        if (occupied.has(k)) continue;
        occupied.add(k);

        const visibleCells: string[] = [];
        if (kind === 'sniper') {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
            let nx = x + dx, ny = y + dy;
            while (nx >= 0 && nx < CHUNK_TILES && ny >= 0 && ny < CHUNK_TILES
                   && grid[ny][nx] !== TileType.Wall) {
              visibleCells.push(`${nx},${ny}`);
              nx += dx; ny += dy;
            }
          }
        }

        return {
          id: `${kind}_${cx}_${cy}_${enemies.length}`,
          kind, x, y, hp, maxHp: hp,
          activated: false,
          stepCount: 0,
          attackTimer: 3 + (rng.next() % 2),
          visibleCells,
          broadcasting: false,
        };
      }
      return null;
    };

    for (let i = 0; i < numScouts;  i++) { const e = place('scout',  2); if (e) enemies.push(e); }
    for (let i = 0; i < numChasers; i++) { const e = place('chaser', 3); if (e) enemies.push(e); }
    for (let i = 0; i < numSnipers; i++) { const e = place('sniper', 2); if (e) enemies.push(e); }

    return enemies;
  }
}
