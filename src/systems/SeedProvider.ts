export type SeedChangeListener = (quadrantId: string, newValue: number) => void;

export class SeedProvider {
  private seeds: Record<string, { id: string; value: number; updated_at: number }> = {};
  private listeners: SeedChangeListener[] = [];
  private quadrantIds = ['q-ne', 'q-nw', 'q-se', 'q-sw'];

  constructor() {
    const baseSeed = Date.now() >>> 0;
    this.quadrantIds.forEach((id, i) => {
      this.seeds[id] = {
        id,
        value: (baseSeed + i * 999983) >>> 0,
        updated_at: Date.now() / 1000,
      };
    });
    this.scheduleDrift();
  }

  private scheduleDrift(): void {
    const delay = 30000 + Math.random() * 90000; // 30~120 秒
    setTimeout(() => {
      const id = this.quadrantIds[Math.floor(Math.random() * this.quadrantIds.length)];
      const old = this.seeds[id].value;
      this.seeds[id].value = (old * 1664525 + 1013904223) >>> 0;
      this.seeds[id].updated_at = Date.now() / 1000;
      this.listeners.forEach(fn => fn(id, this.seeds[id].value));
      this.scheduleDrift();
    }, delay);
  }

  getSeedForChunk(cx: number, cy: number): number {
    const qid = this.getQuadrantForChunk(cx, cy);
    const base = this.seeds[qid].value;
    return (base ^ (cx * 374761393 + cy * 668265263)) >>> 0;
  }

  getQuadrantForChunk(cx: number, cy: number): string {
    if (cx >= 0 && cy <= 0) return 'q-ne';
    if (cx < 0 && cy <= 0) return 'q-nw';
    if (cx >= 0 && cy > 0) return 'q-se';
    return 'q-sw';
  }

  onChange(fn: SeedChangeListener): void {
    this.listeners.push(fn);
  }
}
