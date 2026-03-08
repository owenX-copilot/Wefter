import Phaser from 'phaser';
import { VIEWPORT_W, VIEWPORT_H } from '../constants';
import { SaveManager, SlotMeta } from '../systems/SaveManager';

const CARD_W = 580;
const CARD_H = 100;
const CARD_X = VIEWPORT_W / 2;
const CARD_TOP = 155;
const CARD_GAP = 118;

export class SlotScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SlotScene' });
  }

  create(): void {
    // 背景
    this.add.rectangle(VIEWPORT_W / 2, VIEWPORT_H / 2, VIEWPORT_W, VIEWPORT_H, 0x07070f);

    // 标题
    this.add.text(VIEWPORT_W / 2, 68, '选择存档', {
      fontSize: '30px',
      fontFamily: '"Microsoft YaHei", Consolas, sans-serif',
      color: '#ccd4ee',
    }).setOrigin(0.5);

    // 三张存档卡
    const metas = SaveManager.listSlots();
    metas.forEach((meta, i) => {
      const cy = CARD_TOP + i * CARD_GAP;
      this.drawCard(meta, cy);
    });

    // 返回按钮
    this.makeTextBtn(VIEWPORT_W / 2, VIEWPORT_H - 50, '← 返回', 0x1a1a2e, 0x334488, () => {
      this.scene.start('StartScene');
    });
  }

  // ------------------------------------------------------------------
  private drawCard(meta: SlotMeta, cy: number): void {
    const x = CARD_X;
    const isEmpty = meta.timestamp === null;

    const bg  = isEmpty ? 0x12121e : 0x1a2030;
    const brd = isEmpty ? 0x223344 : 0x3355aa;

    const g = this.add.graphics();
    const draw = (col: number, brdCol: number) => {
      g.clear();
      g.fillStyle(col, 1);
      g.fillRoundedRect(x - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
      g.lineStyle(2, brdCol, 0.9);
      g.strokeRoundedRect(x - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 8);
    };
    draw(bg, brd);

    // 存档标题
    const labelX = x - CARD_W / 2 + 20;
    this.add.text(labelX, cy - 28, meta.label, {
      fontSize: '18px', fontFamily: '"Microsoft YaHei", Consolas, sans-serif', color: '#aabbdd',
    }).setOrigin(0, 0.5);

    if (isEmpty) {
      this.add.text(labelX, cy + 10, '— 空存档 —', {
        fontSize: '14px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#445566',
      }).setOrigin(0, 0.5);

      this.makeTextBtn(x + CARD_W / 2 - 70, cy, '新游戏', 0x1e3344, 0x4488aa, () => {
        this.startSlot(meta.slot);
      });
    } else {
      // 时间
      const dateStr = meta.timestamp ? new Date(meta.timestamp).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }) : '';
      this.add.text(labelX, cy + 10, `📍 区块 (${meta.chunkX}, ${meta.chunkY})   💰 ${meta.coins} 金`, {
        fontSize: '13px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#667788',
      }).setOrigin(0, 0.5);

      this.add.text(x + 10, cy - 28, dateStr, {
        fontSize: '13px', fontFamily: 'Consolas, sans-serif', color: '#445566',
      }).setOrigin(0, 0.5);

      // 继续按钮
      this.makeTextBtn(x + CARD_W / 2 - 130, cy, '继  续', 0x1a3355, 0x4488cc, () => {
        this.startSlot(meta.slot);
      });

      // 删除按钮
      this.makeTextBtn(x + CARD_W / 2 - 55, cy, '删除', 0x3a1515, 0xaa3333, () => {
        this.confirmDelete(meta, cy, g, draw);
      }, true);
    }
  }

  // ------------------------------------------------------------------
  private confirmDelete(
    meta: SlotMeta,
    cy: number,
    g: Phaser.GameObjects.Graphics,
    draw: (col: number, brd: number) => void,
  ): void {
    // 高亮卡片为红色
    draw(0x2a1010, 0xaa3333);

    // 确认提示覆盖在中央
    const key = `confirm_${meta.slot}`;
    if (this.children.getByName(key)) return; // 防止重复

    const confirmBg = this.add.rectangle(CARD_X, cy, 280, 50, 0x1a0808, 0.95)
      .setName(key);
    const confirmTxt = this.add.text(CARD_X - 60, cy, '确定删除？', {
      fontSize: '14px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#ff6666',
    }).setOrigin(0, 0.5).setName(`t_${key}`);

    const yes = this.makeTextBtn(CARD_X + 55, cy, '确定', 0x3a0f0f, 0xcc3333, () => {
      SaveManager.deleteSlot(meta.slot);
      confirmBg.destroy(); confirmTxt.destroy();
      yes.destroy(); no.destroy();
      // 重绘整个场景以刷新卡片
      this.scene.restart();
    }, false);

    const no = this.makeTextBtn(CARD_X + 115, cy, '取消', 0x1a1a2e, 0x445566, () => {
      draw(0x1a2030, 0x3355aa);
      confirmBg.destroy(); confirmTxt.destroy();
      yes.destroy(); no.destroy();
    }, false);
  }

  // ------------------------------------------------------------------
  private startSlot(slot: number): void {
    SaveManager.setSlot(slot);
    this.scene.start('GameScene', { slot });
  }

  // ------------------------------------------------------------------
  /** 返回容器根对象，方便 confirmDelete 中 destroy */
  private makeTextBtn(
    x: number, y: number, label: string,
    bg: number, hover: number,
    onClick: () => void,
    small = false,
  ): Phaser.GameObjects.Text {
    const fs   = small ? '13px' : '15px';
    const padX = small ? 10 : 14;
    const padY = small ? 5 : 8;

    const txt = this.add.text(x, y, label, {
      fontSize: fs,
      fontFamily: '"Microsoft YaHei", Consolas, sans-serif',
      color: '#bbd0ee',
      backgroundColor: `#${bg.toString(16).padStart(6, '0')}`,
      padding: { x: padX, y: padY },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    txt.on('pointerover',  () => {
      txt.setStyle({ backgroundColor: `#${hover.toString(16).padStart(6, '0')}`, color: '#ffffff' });
    });
    txt.on('pointerout',   () => {
      txt.setStyle({ backgroundColor: `#${bg.toString(16).padStart(6, '0')}`, color: '#bbd0ee' });
    });
    txt.on('pointerdown',  onClick);

    return txt;
  }
}
