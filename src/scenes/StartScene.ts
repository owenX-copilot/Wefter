import Phaser from 'phaser';
import { VIEWPORT_W, VIEWPORT_H } from '../constants';

export class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' });
  }

  create(): void {
    // 背景
    this.add.rectangle(VIEWPORT_W / 2, VIEWPORT_H / 2, VIEWPORT_W, VIEWPORT_H, 0x07070f);

    // 装饰星点
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.Between(0, VIEWPORT_W);
      const y = Phaser.Math.Between(0, VIEWPORT_H);
      const r = Math.random() < 0.3 ? 2 : 1;
      const a = 0.3 + Math.random() * 0.5;
      this.add.circle(x, y, r, 0xaabbdd, a);
    }

    // 标题
    this.add.text(VIEWPORT_W / 2, 160, 'WEFT', {
      fontSize: '72px',
      fontFamily: 'Consolas, "Courier New", monospace',
      color: '#eeeeff',
      stroke: '#4466cc',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(VIEWPORT_W / 2, 232, '在混沌中织出你的领地', {
      fontSize: '16px',
      fontFamily: '"Microsoft YaHei", sans-serif',
      color: '#667799',
    }).setOrigin(0.5);

    // 按钮区
    const btnY = 340;
    const gap  = 80;

    this.makeButton(VIEWPORT_W / 2 - gap, btnY, '存  档', 0x223355, 0x4488cc, () => {
      this.scene.start('SlotScene');
    });

    this.makeButton(VIEWPORT_W / 2 + gap, btnY, '设  置', 0x222233, 0x445566, () => {
      this.showNotice('设置功能开发中…');
    });

    // 版本号
    this.add.text(VIEWPORT_W - 8, VIEWPORT_H - 8, 'v1.0.0', {
      fontSize: '11px', fontFamily: 'Consolas', color: '#334455',
    }).setOrigin(1, 1);
  }

  private makeButton(
    x: number, y: number, label: string,
    bg: number, hover: number,
    onClick: () => void,
  ): void {
    const W = 140, H = 46, R = 8;
    const g = this.add.graphics();
    const drawBg = (col: number) => {
      g.clear();
      g.fillStyle(col, 1);
      g.fillRoundedRect(x - W / 2, y - H / 2, W, H, R);
      g.lineStyle(2, hover, 0.8);
      g.strokeRoundedRect(x - W / 2, y - H / 2, W, H, R);
    };
    drawBg(bg);

    const txt = this.add.text(x, y, label, {
      fontSize: '18px', fontFamily: '"Microsoft YaHei", Consolas, sans-serif', color: '#cce0ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // 让整个矩形区域可点击
    const zone = this.add.zone(x, y, W, H).setInteractive({ useHandCursor: true });
    zone.on('pointerover',  () => { drawBg(hover); txt.setColor('#ffffff'); });
    zone.on('pointerout',   () => { drawBg(bg);    txt.setColor('#cce0ff'); });
    zone.on('pointerdown',  onClick);
    txt.on('pointerover',   () => { drawBg(hover); txt.setColor('#ffffff'); });
    txt.on('pointerout',    () => { drawBg(bg);    txt.setColor('#cce0ff'); });
    txt.on('pointerdown',   onClick);
  }

  private showNotice(msg: string): void {
    const existing = this.children.getByName('notice');
    if (existing) existing.destroy();

    const t = this.add.text(VIEWPORT_W / 2, 420, msg, {
      fontSize: '14px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#aab0cc',
      backgroundColor: '#111122', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setName('notice');

    this.time.delayedCall(2000, () => t.destroy());
  }
}
