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

    // 家园地板——亮草绿
    this.tex(
      'homeFloor', S, (g) => {
        g.fillStyle(0x70c050, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x50a030, 0.5);
        g.strokeRect(0, 0, S, S);
      },
    );

    // 家园石板路——米灰石
    this.tex(
      'pathFloor', S, (g) => {
        g.fillStyle(0xb0a888, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x888060, 0.6);
        g.strokeRect(1, 1, S - 2, S - 2);
        // 砖缝细节
        g.lineStyle(1, 0x999070, 0.3);
        g.lineBetween(S / 2, 1, S / 2, S - 1);
      },
    );

    // 锚定地板——森林绿（解放、天晴感）
    this.tex(
      'anchoredFloor', S, (g) => {
        g.fillStyle(0x4a8a30, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x386020, 0.5);
        g.strokeRect(0, 0, S, S);
      },
    );

    // 锚定墙壁——深林暗绿
    this.tex(
      'anchoredWall', S, (g) => {
        g.fillStyle(0x1e3a14, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x162a0e, 0.8);
        g.strokeRect(0, 0, S, S);
      },
    );

    // 中心房间地板（未锚定区块，稍亮于普通地板）
    this.tex(
      'centerFloor', S, (g) => {
        g.fillStyle(Colors.CENTER_FLOOR, 1);
        g.fillRect(0, 0, S, S);
        g.lineStyle(1, 0x2a2a50, 0.4);
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

    // ── 敌人 ──────────────────────────────────────────────────────

    // 巡逻者 — 蓝色实心圆 + 圆环（无威胁感）
    this.tex('scout', S, (g) => {
      g.fillStyle(0x2244cc, 0.9);
      g.fillCircle(half, half, S / 3);
      g.lineStyle(2, 0x4488ff, 1);
      g.strokeCircle(half, half, S / 3);
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(half, half - 3, 3);
    });

    // 追击者 — 红色菱形（威胁感）
    this.tex('chaser', S, (g) => {
      const r = S * 0.33;
      g.fillStyle(0xcc2222, 1);
      g.beginPath();
      g.moveTo(half, half - r);
      g.lineTo(half + r, half);
      g.lineTo(half, half + r);
      g.lineTo(half - r, half);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0xff4444, 1);
      g.strokePath();
    });

    // 狙击者 — 黄色十字准星
    this.tex('sniper', S, (g) => {
      g.fillStyle(0x887700, 1);
      g.fillRect(half - 3, 2, 6, S - 4);
      g.fillRect(2, half - 3, S - 4, 6);
      g.lineStyle(2, 0xffdd00, 1);
      g.strokeCircle(half, half, S / 3);
      g.fillStyle(0xffdd00, 1);
      g.fillCircle(half, half, 3);
    });

    // 玩家子弹 — 绿色小点
    this.tex('bullet_p', 10, (g) => {
      g.fillStyle(0x00ff88, 1);
      g.fillCircle(5, 5, 4);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(3, 3, 1);
    });

    // 敌人子弹 — 橙红色小点
    this.tex('bullet_e', 10, (g) => {
      g.fillStyle(0xff6644, 1);
      g.fillCircle(5, 5, 4);
    });

    // 广播穿墙子弹 — 紫色
    this.tex('bullet_e_pierce', 10, (g) => {
      g.fillStyle(0xcc44ff, 1);
      g.fillCircle(5, 5, 4);
      g.lineStyle(1, 0xff88ff, 0.8);
      g.strokeCircle(5, 5, 4);
    });

    // 商店地板 — 暖黄石板
    this.tex('shopFloor', S, (g) => {
      g.fillStyle(0x5a4a20, 1);
      g.fillRect(0, 0, S, S);
      g.lineStyle(1, 0x7a6a3a, 0.7);
      g.strokeRect(1, 1, S - 2, S - 2);
    });

    // 商人 NPC — 橙色圆形+$符号
    this.tex('merchant', S, (g) => {
      g.fillStyle(0xcc8800, 1);
      g.fillCircle(half, half, S / 3);
      g.lineStyle(2, 0xffcc44, 1);
      g.strokeCircle(half, half, S / 3);
      g.fillStyle(0xffffff, 1);
      g.fillRect(half - 1, half - S / 4, 2, S / 2);
      g.fillRect(half - S / 5, half - S / 4, S / 2.5, 2);
      g.fillRect(half - S / 5, half, S / 2.5, 2);
    });
  }

  /** 快捷生成纹理 */
  private tex(key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.add.graphics();
    draw(g);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
