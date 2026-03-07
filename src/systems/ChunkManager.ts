import { SeedProvider } from './SeedProvider';
import { MazeGenerator } from './MazeGenerator';
import { SaveManager } from './SaveManager';
import { CHUNK_TILES, MID, TileType, ChunkType, ITEM_POOL, SHOP_OFFER_COUNT } from '../constants';
import type { ChunkData, AnchoredChunkData } from '../types';

export class ChunkManager {
  private seedProvider: SeedProvider;
  private chunks = new Map<string, ChunkData>();
  private anchoredData: Record<string, AnchoredChunkData>;
  private liberatedData: Record<string, boolean>;

  constructor(seedProvider: SeedProvider) {
    this.seedProvider = seedProvider;
    this.anchoredData = SaveManager.loadAnchored();
    this.liberatedData = SaveManager.loadVisited();

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

  private chunkTypeFor(cx: number, cy: number): ChunkType {
    // 位置哈希：与 seed 无关，同一坐标永远相同类型
    const n = ((Math.imul(cx, 0x9e3779b9) ^ Math.imul(cy, 0x6c62272e)) >>> 0);
    const r = n % 20;
    if (r < 12) return ChunkType.Wild;   // 60%
    if (r < 19) return ChunkType.Enemy;  // 35%
    return ChunkType.Shop;               // 5%
  }

  isAnchored(cx: number, cy: number): boolean {
    return !!this.anchoredData[this.key(cx, cy)];
  }

  isHome(cx: number, cy: number): boolean {
    return cx === 0 && cy === 0;
  }

  getChunk(cx: number, cy: number): ChunkData {
    const k = this.key(cx, cy);

    // 家园 (0,0)：全开放地板，始终安全
    if (this.isHome(cx, cy)) {
      if (!this.chunks.has(k)) {
        this.chunks.set(k, {
          cx: 0, cy: 0,
          chunkType: ChunkType.Wild,
          grid: MazeGenerator.generateHome(),
          fragments: [],
          enemies: [],
          chestUnlocked: true,
          chestOpened: true,
          shopPurchased: false,
          shopOffers: [],
          shopRefreshAt: 0,
          state: 'anchored',
          seed: 0,
        });
      }
      return this.chunks.get(k)!;
    }

    // 已锚定
    if (this.anchoredData[k]) {
      if (!this.chunks.has(k)) {
        const storedType = (this.anchoredData[k].type as ChunkType) || ChunkType.Wild;
        // 锚定商店用全开放无迷宫地板；其他类型用存档的 grid
        const anchoredGrid = storedType === ChunkType.Shop
          ? MazeGenerator.generateShopFloor()
          : this.anchoredData[k].grid;
        this.chunks.set(k, {
          cx, cy,
          chunkType: storedType,
          grid: anchoredGrid,
          fragments: [],
          enemies: [],
          chestUnlocked: true,
          chestOpened: true,
          shopPurchased: this.anchoredData[k].shopPurchased ?? false,
          shopOffers: (this.anchoredData[k].shopOffers as import('../constants').ItemId[] | undefined) ?? [],
          shopRefreshAt: this.anchoredData[k].shopRefreshAt ?? 0,
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
    const wasLiberated = this.liberatedData[k] ?? false;
    const chunkType = this.chunkTypeFor(cx, cy);
    const grid = MazeGenerator.generate(seed);
    const isWild  = chunkType === ChunkType.Wild;
    const isEnemy = chunkType === ChunkType.Enemy;
    const fragments = (wasLiberated || !isWild) ? [] : MazeGenerator.placeFragments(grid, seed, cx, cy);
    const enemies   = (wasLiberated || !isEnemy) ? [] : MazeGenerator.placeEnemies(grid, seed, cx, cy);

    const isShop  = chunkType === ChunkType.Shop;
    const shopOffers = isShop ? this.rollShopOffers(seed) : [];

    const chunk: ChunkData = {
      cx, cy, grid, fragments, enemies, chunkType,
      chestUnlocked: wasLiberated,
      chestOpened: wasLiberated,
      shopPurchased: wasLiberated && isShop,
      shopOffers,
      shopRefreshAt: 0,
      state: 'uncharted',
      seed,
    };
    this.chunks.set(k, chunk);
    return chunk;
  }

  /**
   * 标记区块已解放（宝箱已开，但尚未锚定）
   * GameScene 开箱后调用，确保刷新页面后状态不丢失
   */
  liberateChunk(cx: number, cy: number): void {
    const k = this.key(cx, cy);
    this.liberatedData[k] = true;
    SaveManager.saveVisited(this.liberatedData);
  }

  /**
   * 锚定一个区块（用钥匙中的 grid 快照）
   */
  anchorChunk(cx: number, cy: number, grid: number[][]): boolean {
    const k = this.key(cx, cy);
    const existingType = this.chunks.get(k)?.chunkType ?? ChunkType.Wild;
    const existingSeed = this.chunks.get(k)?.seed ?? 0;
    this.anchoredData[k] = { grid, type: existingType, anchoredAt: Date.now() };
    SaveManager.saveAnchored(this.anchoredData);

    // 更新缓存
    this.chunks.set(k, {
      cx, cy, grid,
      chunkType: existingType,
      fragments: [],
      enemies: [],
      chestUnlocked: true,
      chestOpened: true,
      shopPurchased: false,
      shopOffers: existingType === ChunkType.Shop ? this.rollShopOffers(existingSeed) : [],
      shopRefreshAt: 0,
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

  /** 用 seed 派生 SHOP_OFFER_COUNT 件不重复商品 */
  rollShopOffers(seed: number): (typeof ITEM_POOL[number])[] {
    const pool = [...ITEM_POOL];
    const offers: (typeof ITEM_POOL[number])[] = [];
    let s = (seed >>> 0) || 1;
    for (let i = 0; i < SHOP_OFFER_COUNT && pool.length > 0; i++) {
      s = Math.imul(s + 0x9e3779b9, 0x6c62272e) >>> 0;
      const idx = s % pool.length;
      offers.push(pool.splice(idx, 1)[0]);
    }
    return offers;
  }

  /** 持久化锚定商店的冷却状态（防刷新绕过） */
  saveShopState(cx: number, cy: number, shopPurchased: boolean, shopRefreshAt: number, shopOffers?: import('../constants').ItemId[]): void {
    const k = this.key(cx, cy);
    if (this.anchoredData[k]) {
      this.anchoredData[k].shopPurchased = shopPurchased;
      this.anchoredData[k].shopRefreshAt = shopRefreshAt;
      if (shopOffers !== undefined) this.anchoredData[k].shopOffers = shopOffers;
      SaveManager.saveAnchored(this.anchoredData);
    }
  }
}
