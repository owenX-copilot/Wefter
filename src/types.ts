import type { ChunkType, ItemId } from './constants';

export interface InventoryItem {
  id: ItemId;
  qty: number;
}

export interface FragmentInfo {
  x: number;
  y: number;
  id: string;
  collected: boolean;
}

export type EnemyKind = 'scout' | 'chaser' | 'sniper';

export interface EnemyData {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  activated: boolean;   // chaser/sniper: 已感应到玩家
  stepCount: number;    // chaser: 冲刺步计数
  attackTimer: number;  // sniper: 距离下次射击的回合数
  visibleCells: string[]; // sniper: 预计算的 LOS 格子 "x,y"
  broadcasting: boolean;  // scout: 正在广播玩家位置
}

export interface ChunkData {
  cx: number;
  cy: number;
  grid: number[][];
  chunkType: ChunkType;
  fragments: FragmentInfo[];
  enemies: EnemyData[];
  chestUnlocked: boolean;
  chestOpened: boolean;
  shopPurchased: boolean;    // 一次性商店：是否已购买
  shopOffers: ItemId[];      // 本次随机展示的3件商品（seed固定）
  shopRefreshAt: number;     // 固定商店下次刷新时间戳（ms）
  state: 'uncharted' | 'anchored';
  seed: number;
}

export interface MapKey {
  /** 地图快照，可用于任意区块的锚定 */
  grid: number[][];
  /** 仅用于 UI 显示，例如「从 (2,-1) 获得」 */
  label: string;
}

export interface SaveData {
  chunkX: number;
  chunkY: number;
  tileX: number;
  tileY: number;
  keys: MapKey[];
  hp: number;
  healBank: number;
  coins: number;
  inventory: InventoryItem[];
  playerDamageBonus: number; // 火力强化累计
  playerMaxHpBonus: number;  // 最大血量累计
  scoutRadiusReduction: number; // 侦测压制累计
  timestamp: number;
}

export interface AnchoredChunkData {
  grid: number[][];
  type: string;
  anchoredAt: number;
  shopPurchased?: boolean;
  shopRefreshAt?: number;
  shopOffers?: string[];
}
