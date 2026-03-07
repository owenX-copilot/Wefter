export const TILE_SIZE = 28;
export const CHUNK_TILES = 21; // 奇数，保证出口中点
export const CHUNK_PX = CHUNK_TILES * TILE_SIZE; // 588
export const VIEWPORT_W = 800;
export const VIEWPORT_H = 600;
export const OFFSET_X = Math.floor((VIEWPORT_W - CHUNK_PX) / 2); // 106
export const OFFSET_Y = Math.floor((VIEWPORT_H - CHUNK_PX) / 2); // 6
export const MID = Math.floor(CHUNK_TILES / 2); // 10
export const FRAGMENT_COUNT = 5;
export const PLAYER_MOVE_SPEED = 10; // tiles/sec
export const PLAYER_MAX_HP = 20;
export const HEAL_BANK_MAX = 200;
export const HEAL_BANK_REGEN_MS = 120_000; // 2分钟 +1 储量
// === AZCoin 金币奖励 ===
export const COIN_FRAGMENT    = 1;   // 每个碎片
export const COIN_WILD_CHEST  = 5;   // 荒野宝箱
export const COIN_ENEMY_KILL  = 1;   // 击杀敌人
export const COIN_ENEMY_CHEST = 10;  // 敌营宝箱

// === 商店 ===
export const SHOP_REFRESH_MS = 600_000; // 固定商店刷新间隔：10分钟
export const SHOP_OFFER_COUNT = 3;       // 每次展示商品数

export type ItemId =
  | 'first_aid'     // 急救包
  | 'ration'        // 储备粮
  | 'smoke_bomb'    // 烟雾弹
  | 'speed_rune'    // 加速符
  | 'shield'        // 护盾
  | 'firepower_up'  // 火力强化
  | 'max_hp_up'     // 最大血量+5
  | 'scout_jammer'; // 侦测压制

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  price: number;
  desc: string;
  stackable: boolean; // 是否可叠加持有多个
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  first_aid:    { id: 'first_aid',    name: '急救包',    icon: '🩹', price:  8, desc: '立即回复 5 HP',                       stackable: true  },
  ration:       { id: 'ration',       name: '储备粮',    icon: '🍞', price: 15, desc: '回血储量 +50',                        stackable: true  },
  smoke_bomb:   { id: 'smoke_bomb',   name: '烟雾弹',    icon: '💨', price:  6, desc: '当前区块敌人 3 步内无法感应玩家',    stackable: true  },
  speed_rune:   { id: 'speed_rune',   name: '加速符',    icon: '⚡', price: 10, desc: '本区块移动步长冷却 -50%（离开失效）',  stackable: false },
  shield:       { id: 'shield',       name: '护盾',      icon: '🛡', price: 12, desc: '下次受伤免疫（1次）',                 stackable: false },
  firepower_up: { id: 'firepower_up', name: '火力强化',  icon: '🔥', price: 20, desc: '子弹伤害永久 +1',                    stackable: true  },
  max_hp_up:    { id: 'max_hp_up',    name: '最大血量+5',icon: '💖', price: 25, desc: '最大生命值永久 +5',                  stackable: true  },
  scout_jammer: { id: 'scout_jammer', name: '侦测压制',  icon: '📡', price: 18, desc: '所有巡逻者感应半径永久 -2',           stackable: true  },
};

export const ITEM_POOL: ItemId[] = [
  'first_aid', 'ration', 'smoke_bomb', 'speed_rune', 'shield',
  'firepower_up', 'max_hp_up', 'scout_jammer',
];

export const SCOUT_DETECT_RADIUS = 5;   // 欧氏距离，穿墙
export const CHASER_DETECT_STEPS = 10;  // BFS 最短路径步数
export const SNIPER_DETECT_STEPS = 15;  // BFS 最短路径步数
export const PLAYER_FIRE_RANGE = 8;     // 直线 LOS 格数
export const SNIPER_FIRE_RATE = 3;      // 回合数/次放射

export const enum TileType {
  Floor = 0,
  Wall = 1,
  Exit = 2,
}

export enum ChunkType {
  Wild  = 'wild',
  Shop  = 'shop',
  Enemy = 'enemy',
}

export const Colors = {
  WALL:          0x141428,
  FLOOR:         0x08080e,
  CENTER_FLOOR:  0x181838,
  PLAYER:        0x00ff88,
  FRAGMENT:      0x44ddff,
  CHEST_LOCKED:  0x8b4513,
  CHEST_UNLOCKED:0xdaa520,
  HOME:          0x88ee44,
  ANCHORED:      0x44aa22,
  LIBERATED:     0x556633,
  EXIT:          0x323260,
  SCOUT:         0x2244cc,
  CHASER:        0xcc2222,
  SNIPER:        0xaa8800,
  BULLET_P:      0x00ff88,
  BULLET_E:      0xff6644,
} as const;
