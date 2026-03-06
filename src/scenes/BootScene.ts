import Phaser from 'phaser';
import { TILE_SIZE, Colors } from '../constants';

/**
 * 启动场景 — 生成所有程序化纹理
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.createTextures();
    this.scene.start('GameScene');
  }

  private createTextures(): void {
    const S = TILE_SIZE;
    const half = S / 2;

    // 墙壁
    this.tex(
      'wall', S, (g) => {
        g.fillStyle(Colors.WALL, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x3a3a5e, 0.3);
        g.strokeRect(0, 0, S, S);
      },
    );

    // 地板
    this.tex(
      'floor', S, (g) => {
        g.fillStyle(Colors.FLOOR, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x222238, 0.5);
        g.strokeRect(0, 0, S, S);
      },
    );

    // 出口
    this.tex(
      'exit', S, (g) => {
        g.fillStyle(Colors.EXIT, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x555577, 0.6);
        g.strokeRect(2, 2, S - 4, S - 4);
      },
    );

    // 家园地板
    this.tex(
      'homeFloor', S, (g) => {
        g.fillStyle(Colors.FLOOR, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, Colors.HOME, 0.12);
        g.strokeRect(0, 0, S, S);
      },
    );

    // 中心房间地板
    this.tex(
      'centerFloor', S, (g) => {
        g.fillStyle(Colors.CENTER_FLOOR, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x3a3a5e, 0.25);
        g.strokeRect(0, 0, S, S);
      },
    );

    // 玩家
    this.tex(
      'player', S, (g) => {
        g.fillStyle(Colors.PLAYER, 1);
        g.fillCircle(half, half, S / 3);
        g.fillStyle(0xffffff, 0.6);
        g.fillCircle(half - 2, half - 3, 3);
      },
    );

    // 碎片（菱形晶体）
    this.tex(
      'fragment', S, (g) => {
        const r = S / 3;
        g.fillStyle(Colors.FRAGMENT, 1);
        g.beginPath();
        g.moveTo(half, half - r);
        g.lineTo(half + r * 0.6, half);
        g.lineTo(half, half + r);
        g.lineTo(half - r * 0.6, half);
        g.closePath();
        g.fillPath();
        g.fillStyle(0xffffff, 0.4);
        g.fillCircle(half - 2, half - 3, 2);
      },
    );

    // 宝箱 — 锁定
    this.tex(
      'chest_locked', S, (g) => {
        g.fillStyle(Colors.CHEST_LOCKED, 1);
        g.fillRect(S * 0.15, S * 0.35, S * 0.7, S * 0.45);
        g.fillStyle(0x654321, 1);
        g.fillRect(S * 0.15, S * 0.25, S * 0.7, S * 0.15);
        g.fillStyle(0xff4444, 1);
        g.fillRect(S * 0.4, S * 0.52, S * 0.2, S * 0.15);
      },
    );

    // 宝箱 — 已解锁
    this.tex(
      'chest_unlocked', S, (g) => {
        g.fillStyle(Colors.CHEST_UNLOCKED, 1);
        g.fillRect(S * 0.15, S * 0.35, S * 0.7, S * 0.45);
        g.fillStyle(0xb8860b, 1);
        g.fillRect(S * 0.15, S * 0.25, S * 0.7, S * 0.15);
        g.fillStyle(0xffee00, 1);
        g.fillRect(S * 0.4, S * 0.52, S * 0.2, S * 0.15);
      },
    );

    // 宝箱 — 已打开
    this.tex(
      'chest_opened', S, (g) => {
        g.fillStyle(0x4a3520, 0.6);
        g.fillRect(S * 0.15, S * 0.4, S * 0.7, S * 0.4);
        g.fillStyle(0x3a2510, 0.6);
        g.fillRect(S * 0.15, S * 0.2, S * 0.7, S * 0.2);
      },
    );
  }

  /** 快捷生成纹理 */
  private tex(key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.add.graphics();
    draw(g);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
