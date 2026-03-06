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

export const enum TileType {
  Floor = 0,
  Wall = 1,
  Exit = 2,
}

export const Colors = {
  WALL: 0x2a2a3e,
  FLOOR: 0x1a1a2e,
  PLAYER: 0x00ff88,
  FRAGMENT: 0x44ddff,
  CHEST_LOCKED: 0x8b4513,
  CHEST_UNLOCKED: 0xdaa520,
  HOME: 0x00aaff,
  ANCHORED: 0x336699,
  LIBERATED: 0x556633,
  EXIT: 0x444466,
  CENTER_FLOOR: 0x22223e,
} as const;
