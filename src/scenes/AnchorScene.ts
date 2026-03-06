import Phaser from 'phaser';
import { VIEWPORT_W, VIEWPORT_H } from '../constants';
import type { MapKey } from '../types';

interface AnchorSceneData {
  keys: MapKey[];
  targetLabel: string;  // 目标区块坐标，仅用于显示
  onAnchor: (index: number) => void;
}

export class AnchorScene extends Phaser.Scene {
  private keys: MapKey[] = [];
  private targetLabel = '';
  private onAnchorCb!: (index: number) => void;
  private selectedIndex = 0;
  private keyItems: { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[] = [];

  private kUp!: Phaser.Input.Keyboard.Key;
  private kDown!: Phaser.Input.Keyboard.Key;
  private kEnter!: Phaser.Input.Keyboard.Key;
  private kEsc!: Phaser.Input.Keyboard.Key;
  private kW!: Phaser.Input.Keyboard.Key;
  private kS!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'AnchorScene' });
  }

  init(data: AnchorSceneData): void {
    this.keys = data.keys;
    this.targetLabel = data.targetLabel;
    this.onAnchorCb = data.onAnchor;
    this.selectedIndex = 0;
  }

  create(): void {
    this.add.rectangle(VIEWPORT_W / 2, VIEWPORT_H / 2, VIEWPORT_W, VIEWPORT_H, 0x000000, 0.9);

    this.add.text(VIEWPORT_W / 2, 40, '🔑 使用地图钥匙', {
      fontSize: '24px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#aabbcc',
    }).setOrigin(0.5);

    this.add.text(VIEWPORT_W / 2, 70, `选择钥匙 → 将当前区块 ${this.targetLabel} 锚定为该迷宫快照`, {
      fontSize: '14px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#667788',
    }).setOrigin(0.5);

    this.keyItems = [];
    this.keys.forEach((k, i) => {
      const y = 120 + i * 50;
      const bg = this.add.rectangle(VIEWPORT_W / 2, y, 440, 40, 0x1a2a3e, 0.8).setInteractive();
      const text = this.add.text(VIEWPORT_W / 2, y, `🔑 ${k.label}`, {
        fontSize: '18px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#ccddee',
      }).setOrigin(0.5);

      bg.on('pointerover', () => { this.selectedIndex = i; this.updateSelection(); });
      bg.on('pointerdown', () => this.confirmAnchor(i));

      this.keyItems.push({ bg, text });
    });

    this.add.text(VIEWPORT_W / 2, VIEWPORT_H - 60, '↑↓ 选择  |  Enter 锚定  |  ESC 取消', {
      fontSize: '14px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#667788',
    }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    this.kUp = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.kDown = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.kEnter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.kEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.kW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.kS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);

    this.updateSelection();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.kEsc)) {
      this.scene.stop();
      this.scene.resume('GameScene');
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.kUp) || Phaser.Input.Keyboard.JustDown(this.kW)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(this.kDown) || Phaser.Input.Keyboard.JustDown(this.kS)) {
      this.selectedIndex = Math.min(this.keys.length - 1, this.selectedIndex + 1);
      this.updateSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(this.kEnter)) {
      this.confirmAnchor(this.selectedIndex);
    }
  }

  private updateSelection(): void {
    this.keyItems.forEach((item, i) => {
      if (i === this.selectedIndex) {
        item.bg.setStrokeStyle(2, 0x00ff88);
        item.text.setColor('#00ff88');
      } else {
        item.bg.setStrokeStyle(0);
        item.text.setColor('#ccddee');
      }
    });
  }

  private confirmAnchor(index: number): void {
    if (index < 0 || index >= this.keys.length) return;
    const k = this.keys[index];

    this.add.text(VIEWPORT_W / 2, VIEWPORT_H / 2,
      `✅ 区块 ${this.targetLabel} 已锚定为「${k.label}」的迷宫！`, {
        fontSize: '18px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#00ff88',
        wordWrap: { width: 500 }, align: 'center',
      }).setOrigin(0.5).setDepth(10);

    this.time.delayedCall(1200, () => {
      this.onAnchorCb(index);
      this.scene.stop();
      this.scene.resume('GameScene');
    });
  }
}
