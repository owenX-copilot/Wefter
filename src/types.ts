export interface FragmentInfo {
  x: number;
  y: number;
  id: string;
  collected: boolean;
}

export interface ChunkData {
  cx: number;
  cy: number;
  grid: number[][];
  fragments: FragmentInfo[];
  chestUnlocked: boolean;
  chestOpened: boolean;
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
  timestamp: number;
}

export interface AnchoredChunkData {
  grid: number[][];
  type: string;
  anchoredAt: number;
}
