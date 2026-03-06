import Phaser from 'phaser';
import { VIEWPORT_W, VIEWPORT_H, Colors } from '../constants';
import type { ChunkManager } from '../systems/ChunkManager';

export class MapScene extends Phaser.Scene {
  private chunkManager!: ChunkManager;
  private playerChunkX = 0;
  private playerChunkY = 0;
  private keyM!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'MapScene' });
  }

  init(data: { chunkManager: ChunkManager; playerChunkX: number; playerChunkY: number }): void {
    this.chunkManager = data.chunkManager;
    this.playerChunkX = data.playerChunkX;
    this.playerChunkY = data.playerChunkY;
  }

  create(): void {
    this.add.rectangle(VIEWPORT_W / 2, VIEWPORT_H / 2, VIEWPORT_W, VIEWPORT_H, 0x000000, 0.85);

    this.add.text(VIEWPORT_W / 2, 30, '🗺️ 世界地图', {
      fontSize: '24px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#aabbcc',
    }).setOrigin(0.5);

    const cellSize = 36;
    const range = 7;
    const cx0 = VIEWPORT_W / 2;
    const cy0 = VIEWPORT_H / 2;

    const anchoredSet = new Set(this.chunkManager.getAllAnchoredKeys());

    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const cx = this.playerChunkX + dx;
        const cy = this.playerChunkY + dy;
        const key = `${cx},${cy}`;
        const px = cx0 + dx * cellSize;
        const py = cy0 + dy * cellSize;

        let color = 0x1a1a2e, alpha = 0.3, label = '';

        if (cx === 0 && cy === 0) {
          color = Colors.HOME; alpha = 0.8; label = '🏠';
        } else if (anchoredSet.has(key)) {
          color = Colors.ANCHORED; alpha = 0.7; label = '🔒';
        }

        this.add.rectangle(px, py, cellSize - 2, cellSize - 2, color, alpha);

        if (label) {
          this.add.text(px, py, label, { fontSize: '14px' }).setOrigin(0.5);
        }

        if (dx === 0 && dy === 0) {
          this.add.rectangle(px, py, cellSize - 2, cellSize - 2)
            .setStrokeStyle(2, 0x00ff88);
          if (!label) {
            this.add.text(px, py, '▲', { fontSize: '14px', color: '#00ff88' }).setOrigin(0.5);
          }
        }

        if ((cx === 0 && cy === 0) || (dx === 0 && dy === 0)) {
          this.add.text(px, py + cellSize / 2 + 2, `${cx},${cy}`, {
            fontSize: '9px', color: '#667788',
          }).setOrigin(0.5, 0);
        }
      }
    }

    // 图例
    const legends = [
      { color: Colors.HOME, label: '家园' },
      { color: Colors.ANCHORED, label: '已锚定' },
    ];
    legends.forEach((l, i) => {
      const lx = 20 + i * 100;
      this.add.rectangle(lx + 8, VIEWPORT_H - 60, 14, 14, l.color, 0.8);
      this.add.text(lx + 20, VIEWPORT_H - 60, l.label, {
        fontSize: '12px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#aabbcc',
      }).setOrigin(0, 0.5);
    });

    this.add.text(VIEWPORT_W / 2, VIEWPORT_H - 30, '按 M 或 ESC 关闭', {
      fontSize: '14px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#667788',
    }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    this.keyM = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keyM) || Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.scene.stop();
      this.scene.resume('GameScene');
    }
  }
}
