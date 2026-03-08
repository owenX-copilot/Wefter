import { SeedProvider } from './SeedProvider';
import { MazeGenerator } from './MazeGenerator';
import { SaveManager } from './SaveManager';
import { CHUNK_TILES, MID, TileType, ChunkType, ITEM_POOL, SHOP_OFFER_COUNT, DAILY_FRAGMENT_COUNT, DAILY_REGEN_VERSION } from '../constants';
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
    if (r < 9)  return ChunkType.Wild;   // 45%
    if (r < 19) return ChunkType.Enemy;  // 50%
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
      const chunk = this.chunks.get(k)!;
      this.applyDailyRegen(k, chunk);
      return chunk;
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
    // 商店始终用模板 grid（不保存迷宫快照）；其他类型保存传入的快照
    const isShop = existingType === ChunkType.Shop;
    const storedGrid = isShop ? MazeGenerator.generateShopFloor() : grid;
    this.anchoredData[k] = { grid: storedGrid, type: existingType, anchoredAt: Date.now() };
    SaveManager.saveAnchored(this.anchoredData);

    // 更新缓存
    this.chunks.set(k, {
      cx, cy, grid: storedGrid,
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

  /** 返回所有锚定区块的类型映射（key → ChunkType），供地图标注用 */
  getAnchoredTypeMap(): Record<string, ChunkType> {
    const map: Record<string, ChunkType> = {};
    for (const k of Object.keys(this.anchoredData)) {
      map[k] = (this.anchoredData[k].type as ChunkType) || ChunkType.Wild;
    }
    return map;
  }

  /**
   * 检查一个 tile 位置是否安全（Floor 或 Exit）
   */
  isSafeTile(grid: number[][], tx: number, ty: number): boolean {
    if (ty < 0 || ty >= CHUNK_TILES || tx < 0 || tx >= CHUNK_TILES) return false;
    const t = grid[ty][tx];
    return t === TileType.Floor || t === TileType.Exit;
  }

  // ---- 每日资源刷新 ----

  private dateStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private dailySeed(cx: number, cy: number, dateStr: string): number {
    const dn = parseInt(dateStr.replace(/-/g, ''), 10);
    return ((Math.imul(cx, 0x9e3779b9) ^ Math.imul(cy, 0x6c62272e) ^ dn) >>> 0) || 1;
  }

  private applyDailyRegen(k: string, chunk: ChunkData): void {
    if (chunk.chunkType !== ChunkType.Wild) return;
    const ad = this.anchoredData[k];
    if (!ad) return;
    const today = this.dateStr();

    // 版本不匹配（包含旧存档、a0e8b32 过渡数据）→ 无条件重新生成
    const isNewVersion = ad.regenVersion === DAILY_REGEN_VERSION;

    if (!isNewVersion || ad.lastRegenDate !== today) {
      // 新的一天 或 版本升级：重新生成 DAILY_FRAGMENT_COUNT 个碎片
      const seed = this.dailySeed(chunk.cx, chunk.cy, today);
      chunk.fragments = MazeGenerator.placeFragments(chunk.grid, seed, chunk.cx, chunk.cy, DAILY_FRAGMENT_COUNT);
      chunk.chestUnlocked = false;
      chunk.chestOpened = false;
      ad.lastRegenDate = today;
      ad.dailyChestOpened = false;
      ad.regenVersion = DAILY_REGEN_VERSION;
      SaveManager.saveAnchored(this.anchoredData);
    } else if (chunk.fragments.length === 0) {
      // 同一天、同版本、缓存为空（刷新页面）：恢复今日状态
      if (ad.dailyChestOpened) {
        // 今日已全部领取，fragments 保持空
        chunk.chestOpened = true;
      } else {
        const seed = this.dailySeed(chunk.cx, chunk.cy, today);
        chunk.fragments = MazeGenerator.placeFragments(chunk.grid, seed, chunk.cx, chunk.cy, DAILY_FRAGMENT_COUNT);
        chunk.chestUnlocked = false;
        chunk.chestOpened = false;
      }
    }
    // 否则：缓存中有存活碎片，保持原状（玩家正在收集中）
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

  /** 锚定荒野区块：标记今日宝箱已领取 */
  markDailyChestOpened(cx: number, cy: number): void {
    const k = this.key(cx, cy);
    if (this.anchoredData[k]) {
      this.anchoredData[k].dailyChestOpened = true;
      SaveManager.saveAnchored(this.anchoredData);
    }
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
