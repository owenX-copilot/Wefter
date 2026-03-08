import type { SaveData } from '../types';

const SLOT_COUNT = 3;
let activeSlot = 0;

const saveKey    = (s: number) => `weft_save_v2_s${s}`;
const anchorKey  = (s: number) => `weft_anchored_v2_s${s}`;
const visitedKey = (s: number) => `weft_visited_v1_s${s}`;

export interface SlotMeta {
  slot: number;
  label: string;
  timestamp: number | null; // null = 空存档
  chunkX: number;
  chunkY: number;
  coins: number;
}

export class SaveManager {
  static setSlot(n: number): void {
    activeSlot = Math.max(0, Math.min(SLOT_COUNT - 1, n));
  }

  static getSlot(): number { return activeSlot; }

  static listSlots(): SlotMeta[] {
    const result: SlotMeta[] = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      try {
        const raw = localStorage.getItem(saveKey(i));
        if (raw) {
          const d = JSON.parse(raw) as SaveData;
          result.push({ slot: i, label: `存档 ${i + 1}`, timestamp: d.timestamp ?? null, chunkX: d.chunkX, chunkY: d.chunkY, coins: d.coins ?? 0 });
        } else {
          result.push({ slot: i, label: `存档 ${i + 1}`, timestamp: null, chunkX: 0, chunkY: 0, coins: 0 });
        }
      } catch {
        result.push({ slot: i, label: `存档 ${i + 1}`, timestamp: null, chunkX: 0, chunkY: 0, coins: 0 });
      }
    }
    return result;
  }

  static deleteSlot(n: number): void {
    localStorage.removeItem(saveKey(n));
    localStorage.removeItem(anchorKey(n));
    localStorage.removeItem(visitedKey(n));
  }

  static save(data: SaveData): void {
    localStorage.setItem(saveKey(activeSlot), JSON.stringify(data));
  }

  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(saveKey(activeSlot));
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  }

  static saveAnchored(data: Record<string, { grid: number[][]; type: string; anchoredAt: number; shopPurchased?: boolean; shopRefreshAt?: number; shopOffers?: string[] }>): void {
    localStorage.setItem(anchorKey(activeSlot), JSON.stringify(data));
  }

  static loadAnchored(): Record<string, { grid: number[][]; type: string; anchoredAt: number; shopPurchased?: boolean; shopRefreshAt?: number; shopOffers?: string[] }> {
    try {
      const raw = localStorage.getItem(anchorKey(activeSlot));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  static saveVisited(data: Record<string, boolean>): void {
    localStorage.setItem(visitedKey(activeSlot), JSON.stringify(data));
  }

  static loadVisited(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem(visitedKey(activeSlot));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  static clear(): void {
    localStorage.removeItem(saveKey(activeSlot));
    localStorage.removeItem(anchorKey(activeSlot));
    localStorage.removeItem(visitedKey(activeSlot));
  }
}

