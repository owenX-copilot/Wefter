import type { SaveData, MapKey } from '../types';

const SAVE_KEY = 'weft_save_v2';
const ANCHOR_KEY = 'weft_anchored_v2';

export class SaveManager {
  static save(data: SaveData): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  }

  static saveAnchored(data: Record<string, { grid: number[][]; type: string; anchoredAt: number }>): void {
    localStorage.setItem(ANCHOR_KEY, JSON.stringify(data));
  }

  static loadAnchored(): Record<string, { grid: number[][]; type: string; anchoredAt: number }> {
    try {
      const raw = localStorage.getItem(ANCHOR_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  static clear(): void {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(ANCHOR_KEY);
  }
}
