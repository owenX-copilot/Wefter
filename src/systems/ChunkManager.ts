import { SeedProvider } from './SeedProvider';
import { MazeGenerator } from './MazeGenerator';
import { SaveManager } from './SaveManager';
import { CHUNK_TILES, MID, TileType } from '../constants';
import type { ChunkData, AnchoredChunkData } from '../types';

export class ChunkManager {
  private seedProvider: SeedProvider;
  private chunks = new Map<string, ChunkData>();
  private anchoredData: Record<string, AnchoredChunkData>;

  constructor(seedProvider: SeedProvider) {
    this.seedProvider = seedProvider;
    this.anchoredData = SaveManager.loadAnchored();

    // (0,0) 家园：固定 seed 生成，始终锚定
    if (!this.anchoredData['0,0']) {
      const homeGrid = MazeGenerator.generate(42);
      this.anchoredData['0,0'] = { grid: homeGrid, type: 'home', anchoredAt: Date.now() };
      SaveManager.saveAnchored(this.anchoredData);
    }

    // 监听 seed 变化
    seedProvider.onChange((qid) => this.onSeedChange(qid));
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  isAnchored(cx: number, cy: number): boolean {
    return !!this.anchoredData[this.key(cx, cy)];
  }

  isHome(cx: number, cy: number): boolean {
    return cx === 0 && cy === 0;
  }

  getChunk(cx: number, cy: number): ChunkData {
    const k = this.key(cx, cy);

    // 已锚定
    if (this.anchoredData[k]) {
      if (!this.chunks.has(k)) {
        this.chunks.set(k, {
          cx, cy,
          grid: this.anchoredData[k].grid,
          fragments: [],
          chestUnlocked: true,
          chestOpened: true,
          state: 'anchored',
          seed: 0,
        });
      }
      return this.chunks.get(k)!;
    }

    // 未锚定：用当前 seed 生成
    const seed = this.seedProvider.getSeedForChunk(cx, cy);
    const existing = this.chunks.get(k);
    if (existing && existing.seed === seed) return existing;

    // 生成新迷宫；若该区块已被解放（开过宝箱但尚未锚定），则不再生成碎片和宝箱
    const wasLiberated = existing?.chestOpened ?? false;
    const grid = MazeGenerator.generate(seed);
    const fragments = wasLiberated ? [] : MazeGenerator.placeFragments(grid, seed, cx, cy);

    const chunk: ChunkData = {
      cx, cy, grid, fragments,
      chestUnlocked: wasLiberated,
      chestOpened: wasLiberated,
      state: 'uncharted',
      seed,
    };
    this.chunks.set(k, chunk);
    return chunk;
  }

  /**
   * 锚定一个区块（用钥匙中的 grid 快照）
   */
  anchorChunk(cx: number, cy: number, grid: number[][]): boolean {
    const k = this.key(cx, cy);
    this.anchoredData[k] = { grid, type: 'wild', anchoredAt: Date.now() };
    SaveManager.saveAnchored(this.anchoredData);

    // 更新缓存
    this.chunks.set(k, {
      cx, cy, grid,
      fragments: [],
      chestUnlocked: true,
      chestOpened: true,
      state: 'anchored',
      seed: 0,
    });
    return true;
  }

  private onSeedChange(quadrantId: string): void {
    // 标记该象限所有未锚定区块为「需要重新生成」，但保留解放状态（chestOpened）
    for (const chunk of this.chunks.values()) {
      if (chunk.state === 'anchored') continue;
      const qid = this.seedProvider.getQuadrantForChunk(chunk.cx, chunk.cy);
      if (qid === quadrantId) {
        chunk.seed = -1; // 失效标记，下次 getChunk 时会重新生成迷宫
      }
    }
  }

  getAnchoredCount(): number {
    return Object.keys(this.anchoredData).length;
  }

  getAllAnchoredKeys(): string[] {
    return Object.keys(this.anchoredData);
  }

  /**
   * 检查一个 tile 位置是否安全（Floor 或 Exit）
   */
  isSafeTile(grid: number[][], tx: number, ty: number): boolean {
    if (ty < 0 || ty >= CHUNK_TILES || tx < 0 || tx >= CHUNK_TILES) return false;
    const t = grid[ty][tx];
    return t === TileType.Floor || t === TileType.Exit;
  }
}
