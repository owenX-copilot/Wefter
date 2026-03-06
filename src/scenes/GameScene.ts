import Phaser from 'phaser';
import {
  TILE_SIZE, CHUNK_TILES, CHUNK_PX, VIEWPORT_W, VIEWPORT_H,
  OFFSET_X, OFFSET_Y, MID, FRAGMENT_COUNT, PLAYER_MOVE_SPEED,
  TileType, Colors,
} from '../constants';
import type { ChunkData, MapKey, SaveData } from '../types';
import { SeedProvider } from '../systems/SeedProvider';
import { ChunkManager } from '../systems/ChunkManager';
import { SaveManager } from '../systems/SaveManager';

/**
 * 主游戏场景
 */
export class GameScene extends Phaser.Scene {
  // Systems
  private seedProvider!: SeedProvider;
  private chunkManager!: ChunkManager;

  // Player state
  private playerChunkX = 0;
  private playerChunkY = 0;
  private playerTileX = MID;
  private playerTileY = MID;
  private playerKeys: MapKey[] = [];

  // Rendering
  private gameLayer!: Phaser.GameObjects.Container;
  private mapLayer!: Phaser.GameObjects.Container;
  private fragmentLayer!: Phaser.GameObjects.Container;
  private player!: Phaser.GameObjects.Sprite;
  private chestSprite: Phaser.GameObjects.Sprite | null = null;
  private fragmentSprites = new Map<string, Phaser.GameObjects.Sprite>();

  // Movement
  private isMoving = false;
  private moveTarget = { x: 0, y: 0 };

  // Current chunk
  private currentChunk: ChunkData | null = null;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;

  // HUD
  private hudCoord!: Phaser.GameObjects.Text;
  private hudStatus!: Phaser.GameObjects.Text;
  private hudKeys!: Phaser.GameObjects.Text;
  private hudFragments!: Phaser.GameObjects.Text;
  private hudHint!: Phaser.GameObjects.Text;

  // Message
  private msgText: Phaser.GameObjects.Text | null = null;
  private msgBg: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  /* ================================================================
   * LIFECYCLE
   * ================================================================ */

  create(): void {
    // ---- 系统初始化 ----
    this.seedProvider = new SeedProvider();
    this.chunkManager = new ChunkManager(this.seedProvider);

    // ---- 读取存档 ----
    const save = SaveManager.load();
    if (save) {
      this.playerChunkX = save.chunkX;
      this.playerChunkY = save.chunkY;
      this.playerTileX = save.tileX;
      this.playerTileY = save.tileY;
      this.playerKeys = save.keys || [];
    }

    // ---- 渲染层（gameLayer 用 offset 保证居中）----
    this.gameLayer = this.add.container(OFFSET_X, OFFSET_Y);
    this.mapLayer = this.add.container(0, 0);
    this.fragmentLayer = this.add.container(0, 0);
    const entityLayer = this.add.container(0, 0);
    this.gameLayer.add([this.mapLayer, this.fragmentLayer, entityLayer]);

    this.player = this.add.sprite(0, 0, 'player').setDepth(10);
    entityLayer.add(this.player);

    // ---- 输入 ----
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyM = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyTab = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);

    // ---- HUD ----
    this.createHUD();

    // ---- 加载起始区块 ----
    this.loadChunk(this.playerChunkX, this.playerChunkY);
    this.syncPlayerSprite();

    // ---- Seed 变化 ----
    this.seedProvider.onChange((qid) => this.onSeedChanged(qid));

    // ---- 自动保存 ----
    this.time.addEvent({ delay: 5000, callback: () => this.autoSave(), loop: true });

    // ---- 欢迎提示 ----
    this.showMessage('WASD 移动 | 收集5碎片→开宝箱得钥匙 | E 使用钥匙锚定区块 | M 地图', 4000);
  }

  update(_time: number, delta: number): void {
    if (this.scene.isActive('MapScene') || this.scene.isActive('AnchorScene')) return;
    this.handleMovement(delta);
  }

  /* ================================================================
   * MOVEMENT
   * ================================================================ */

  private handleMovement(delta: number): void {
    if (this.isMoving) {
      const tx = this.moveTarget.x * TILE_SIZE + TILE_SIZE / 2;
      const ty = this.moveTarget.y * TILE_SIZE + TILE_SIZE / 2;
      const dx = tx - this.player.x;
      const dy = ty - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        this.player.setPosition(tx, ty);
        this.playerTileX = this.moveTarget.x;
        this.playerTileY = this.moveTarget.y;
        this.isMoving = false;
        this.checkFragmentPickup();
        this.checkChestInteraction();
        this.checkExit();
      } else {
        const speed = PLAYER_MOVE_SPEED * TILE_SIZE * (delta / 1000);
        const step = Math.min(speed, dist);
        this.player.x += (dx / dist) * step;
        this.player.y += (dy / dist) * step;
      }
      return;
    }

    // 读取方向输入
    let mx = 0, my = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) mx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) mx = 1;
    else if (this.cursors.up.isDown || this.wasd.W.isDown) my = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) my = 1;

    if (mx === 0 && my === 0) {
      if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.tryAnchor();
      if (Phaser.Input.Keyboard.JustDown(this.keyM)) this.openMap();
      if (Phaser.Input.Keyboard.JustDown(this.keyTab)) this.showStatus();
      return;
    }

    const nx = this.playerTileX + mx;
    const ny = this.playerTileY + my;
    if (nx < 0 || nx >= CHUNK_TILES || ny < 0 || ny >= CHUNK_TILES) return;

    const tile = this.currentChunk!.grid[ny][nx];
    if (tile === TileType.Wall) return;

    this.isMoving = true;
    this.moveTarget = { x: nx, y: ny };
  }

  /* ================================================================
   * CHUNK MANAGEMENT
   * ================================================================ */

  private loadChunk(cx: number, cy: number): void {
    this.playerChunkX = cx;
    this.playerChunkY = cy;
    this.currentChunk = this.chunkManager.getChunk(cx, cy);

    this.clearRendered();
    this.renderChunk(this.currentChunk);
    this.renderFragments(this.currentChunk);
    this.renderChest(this.currentChunk);
    this.updateHUD();
  }

  private clearRendered(): void {
    this.mapLayer.removeAll(true);
    this.fragmentLayer.removeAll(true);
    this.fragmentSprites.clear();
    if (this.chestSprite) {
      this.chestSprite.destroy();
      this.chestSprite = null;
    }
  }

  private renderChunk(chunk: ChunkData): void {
    const isHome = this.chunkManager.isHome(chunk.cx, chunk.cy);
    const isAnchored = chunk.state === 'anchored';

    for (let y = 0; y < CHUNK_TILES; y++) {
      for (let x = 0; x < CHUNK_TILES; x++) {
        const tile = chunk.grid[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (tile === TileType.Wall) {
          const s = this.add.sprite(px, py, 'wall').setOrigin(0);
          if (isHome) s.setTint(0x1a3a5e);
          else if (isAnchored) s.setTint(Colors.ANCHORED);
          this.mapLayer.add(s);
        } else if (tile === TileType.Exit) {
          this.mapLayer.add(this.add.sprite(px, py, 'exit').setOrigin(0));
          this.mapLayer.add(
            this.add.text(px + TILE_SIZE / 2, py + TILE_SIZE / 2, '◆', {
              fontSize: '12px', color: '#8888aa',
            }).setOrigin(0.5),
          );
        } else {
          // Floor — 判断是否中心房间
          const inCenter = Math.abs(x - MID) <= 1 && Math.abs(y - MID) <= 1;
          let key = 'floor';
          if (isHome) key = 'homeFloor';
          else if (inCenter && !isAnchored) key = 'centerFloor';
          const s = this.add.sprite(px, py, key).setOrigin(0);
          if (isAnchored && !isHome) s.setTint(0x152535);
          this.mapLayer.add(s);
        }
      }
    }

    // 区块边框
    const border = this.add.graphics();
    if (isHome) border.lineStyle(2, Colors.HOME, 0.5);
    else if (isAnchored) border.lineStyle(2, Colors.ANCHORED, 0.5);
    else border.lineStyle(1, 0x333355, 0.3);
    border.strokeRect(0, 0, CHUNK_PX, CHUNK_PX);
    this.mapLayer.add(border);
  }

  private renderFragments(chunk: ChunkData): void {
    if (chunk.state === 'anchored') return;
    for (const frag of chunk.fragments) {
      if (frag.collected) continue;
      const px = frag.x * TILE_SIZE + TILE_SIZE / 2;
      const py = frag.y * TILE_SIZE + TILE_SIZE / 2;
      const sprite = this.add.sprite(px, py, 'fragment');
      this.tweens.add({
        targets: sprite,
        alpha: { from: 1, to: 0.4 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.fragmentLayer.add(sprite);
      this.fragmentSprites.set(frag.id, sprite);
    }
  }

  private renderChest(chunk: ChunkData): void {
    if (chunk.state === 'anchored') return;
    if (this.chunkManager.isHome(chunk.cx, chunk.cy)) return;

    const px = MID * TILE_SIZE + TILE_SIZE / 2;
    const py = MID * TILE_SIZE + TILE_SIZE / 2;

    let texKey = 'chest_locked';
    if (chunk.chestOpened) texKey = 'chest_opened';
    else if (chunk.chestUnlocked) texKey = 'chest_unlocked';

    this.chestSprite = this.add.sprite(px, py, texKey).setDepth(5);
    this.fragmentLayer.add(this.chestSprite);

    // 解锁后的脉冲动画
    if (chunk.chestUnlocked && !chunk.chestOpened) {
      this.tweens.add({
        targets: this.chestSprite,
        scaleX: { from: 1, to: 1.15 },
        scaleY: { from: 1, to: 1.15 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private syncPlayerSprite(): void {
    const px = this.playerTileX * TILE_SIZE + TILE_SIZE / 2;
    const py = this.playerTileY * TILE_SIZE + TILE_SIZE / 2;
    this.player.setPosition(px, py);
  }

  /* ================================================================
   * INTERACTIONS
   * ================================================================ */

  private checkFragmentPickup(): void {
    const chunk = this.currentChunk;
    if (!chunk || chunk.state === 'anchored') return;

    for (const frag of chunk.fragments) {
      if (frag.collected) continue;
      if (frag.x !== this.playerTileX || frag.y !== this.playerTileY) continue;

      frag.collected = true;

      // 动画
      const sprite = this.fragmentSprites.get(frag.id);
      if (sprite) {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          scaleX: 1.5, scaleY: 1.5, alpha: 0,
          duration: 300,
          onComplete: () => sprite.destroy(),
        });
        this.fragmentSprites.delete(frag.id);
      }

      const collected = chunk.fragments.filter(f => f.collected).length;
      this.showFloatingText(
        `✦ ${collected}/${FRAGMENT_COUNT}`,
        frag.x * TILE_SIZE + TILE_SIZE / 2,
        frag.y * TILE_SIZE,
      );

      // 检查是否全部收集
      if (collected >= FRAGMENT_COUNT && !chunk.chestUnlocked) {
        chunk.chestUnlocked = true;
        this.cameras.main.flash(400, 50, 150, 200);
        this.showMessage('✦ 碎片收集完毕！中心区宝箱已解锁！', 3000);
        // 更新宝箱显示
        if (this.chestSprite) {
          this.chestSprite.setTexture('chest_unlocked');
          this.tweens.add({
            targets: this.chestSprite,
            scaleX: { from: 1, to: 1.15 },
            scaleY: { from: 1, to: 1.15 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }

      this.updateHUD();
    }
  }

  private checkChestInteraction(): void {
    const chunk = this.currentChunk;
    if (!chunk || chunk.state === 'anchored') return;
    if (this.chunkManager.isHome(chunk.cx, chunk.cy)) return;
    if (!chunk.chestUnlocked || chunk.chestOpened) return;
    if (this.playerTileX !== MID || this.playerTileY !== MID) return;

    // 打开宝箱
    chunk.chestOpened = true;

    // 保存当前地图快照为钥匙（快照只含迷宫结构，不含任何关卡内容）
    const gridSnapshot = chunk.grid.map(row => [...row]);
    const label = `从 (${chunk.cx}, ${chunk.cy}) 获得`;
    this.playerKeys.push({ grid: gridSnapshot, label });

    // 视觉反馈
    if (this.chestSprite) {
      this.tweens.killTweensOf(this.chestSprite);
      this.chestSprite.setTexture('chest_opened');
      this.chestSprite.setScale(1);
    }
    this.cameras.main.flash(500, 100, 200, 100);
    this.showMessage(
      `🔑 获得地图钥匙「从 (${chunk.cx}, ${chunk.cy}) 获得」\n在任意未锚定区块按 E 即可使用`,
      4000,
    );
    this.updateHUD();
  }

  private checkExit(): void {
    const chunk = this.currentChunk!;
    let ncx = this.playerChunkX, ncy = this.playerChunkY;
    let ntx = this.playerTileX, nty = this.playerTileY;

    if (this.playerTileX === MID && this.playerTileY === 0) {
      ncy--; nty = CHUNK_TILES - 2;
    } else if (this.playerTileX === MID && this.playerTileY === CHUNK_TILES - 1) {
      ncy++; nty = 1;
    } else if (this.playerTileY === MID && this.playerTileX === 0) {
      ncx--; ntx = CHUNK_TILES - 2;
    } else if (this.playerTileY === MID && this.playerTileX === CHUNK_TILES - 1) {
      ncx++; ntx = 1;
    } else {
      return;
    }

    this.playerTileX = ntx;
    this.playerTileY = nty;
    this.loadChunk(ncx, ncy);
    this.syncPlayerSprite();
    this.cameras.main.fadeIn(250);
  }

  /* ================================================================
   * ANCHOR / MAP
   * ================================================================ */

  private tryAnchor(): void {
    const cx = this.playerChunkX, cy = this.playerChunkY;
    if (this.chunkManager.isAnchored(cx, cy)) {
      this.showMessage('此区块已锚定', 2000);
      return;
    }
    if (this.playerKeys.length === 0) {
      this.showMessage('没有可用的地图钥匙，去探索收集碎片并开启宝箱！', 2000);
      return;
    }
    this.scene.launch('AnchorScene', {
      keys: this.playerKeys,
      targetLabel: `(${cx}, ${cy})`,
      onAnchor: (index: number) => {
        const key = this.playerKeys[index];
        this.chunkManager.anchorChunk(cx, cy, key.grid);
        this.playerKeys.splice(index, 1);
        this.updateHUD();
        this.loadChunk(cx, cy);
        this.syncPlayerSprite();
      },
    });
    this.scene.pause();
  }

  private openMap(): void {
    this.scene.launch('MapScene', {
      chunkManager: this.chunkManager,
      playerChunkX: this.playerChunkX,
      playerChunkY: this.playerChunkY,
    });
    this.scene.pause();
  }

  private showStatus(): void {
    const chunk = this.currentChunk!;
    const collected = chunk.fragments.filter(f => f.collected).length;
    const total = chunk.fragments.length;
    const isHome = this.chunkManager.isHome(chunk.cx, chunk.cy);

    let s = `📍 区块 (${this.playerChunkX}, ${this.playerChunkY})\n`;
    s += `状态: ${isHome ? '🏠 家园' : chunk.state === 'anchored' ? '🔒 已锚定' : '❓ 未解放'}\n`;
    if (!isHome && chunk.state !== 'anchored') {
      s += `碎片: ${collected}/${total}  宝箱: ${chunk.chestOpened ? '已开启' : chunk.chestUnlocked ? '已解锁' : '锁定中'}\n`;
    }
    s += `钥匙: ${this.playerKeys.length}  已锚定: ${this.chunkManager.getAnchoredCount()}`;
    this.showMessage(s, 3000);
  }

  /* ================================================================
   * SEED CHANGE
   * ================================================================ */

  private onSeedChanged(quadrantId: string): void {
    const qid = this.seedProvider.getQuadrantForChunk(this.playerChunkX, this.playerChunkY);
    if (qid !== quadrantId) return;
    if (this.chunkManager.isAnchored(this.playerChunkX, this.playerChunkY)) return;

    this.showMessage('⚡ 迷宫正在重构...', 2000);
    this.time.delayedCall(400, () => {
      this.loadChunk(this.playerChunkX, this.playerChunkY);
      const chunk = this.currentChunk!;

      // 如果玩家位置变成了墙，传送到中心（中心保证是通路）
      if (!this.chunkManager.isSafeTile(chunk.grid, this.playerTileX, this.playerTileY)) {
        this.playerTileX = MID;
        this.playerTileY = MID;
      }
      this.syncPlayerSprite();
    });
  }

  /* ================================================================
   * HUD
   * ================================================================ */

  private createHUD(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '14px',
      fontFamily: 'Consolas, "Microsoft YaHei", monospace',
      color: '#aabbcc',
      backgroundColor: '#0a0a12cc',
      padding: { x: 8, y: 4 },
    };

    this.hudCoord = this.add.text(10, 10, '', style).setScrollFactor(0).setDepth(100);
    this.hudStatus = this.add.text(10, 34, '', style).setScrollFactor(0).setDepth(100);
    this.hudKeys = this.add.text(10, 58, '', style).setScrollFactor(0).setDepth(100);
    this.hudFragments = this.add.text(VIEWPORT_W - 10, 10, '', { ...style, align: 'right' })
      .setScrollFactor(0).setDepth(100).setOrigin(1, 0);
    this.hudHint = this.add.text(VIEWPORT_W / 2, VIEWPORT_H - 16, '', {
      fontSize: '12px',
      fontFamily: '"Microsoft YaHei", sans-serif',
      color: '#667788',
      align: 'center',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 1);
  }

  private updateHUD(): void {
    const chunk = this.currentChunk;
    if (!chunk) return;

    const isHome = this.chunkManager.isHome(chunk.cx, chunk.cy);

    this.hudCoord.setText(`📍 (${this.playerChunkX}, ${this.playerChunkY})`);

    if (isHome) this.hudStatus.setText('🏠 家园');
    else if (chunk.state === 'anchored') this.hudStatus.setText('🔒 已锚定');
    else this.hudStatus.setText('❓ 未解放');

    this.hudKeys.setText(`🔑 ${this.playerKeys.length}  |  🔒 ${this.chunkManager.getAnchoredCount()}`);

    if (!isHome && chunk.state !== 'anchored') {
      const c = chunk.fragments.filter(f => f.collected).length;
      const t = chunk.fragments.length;
      let chestLabel = '';
      if (chunk.chestOpened) chestLabel = '  📦 已开启';
      else if (chunk.chestUnlocked) chestLabel = '  📦✨ 已解锁!';
      this.hudFragments.setText(`✦ ${c}/${t}${chestLabel}`);
    } else {
      this.hudFragments.setText('');
    }

    let hint = 'WASD 移动';
    const canUseKey = !this.chunkManager.isAnchored(this.playerChunkX, this.playerChunkY)
                   && this.playerKeys.length > 0;
    if (canUseKey) hint += '  |  E 使用钥匙';
    hint += '  |  M 地图  |  TAB 状态';
    this.hudHint.setText(hint);
  }

  /* ================================================================
   * MESSAGES
   * ================================================================ */

  private showMessage(text: string, duration: number): void {
    if (this.msgText) this.msgText.destroy();
    if (this.msgBg) this.msgBg.destroy();

    this.msgText = this.add.text(VIEWPORT_W / 2, VIEWPORT_H / 2 - 60, text, {
      fontSize: '16px',
      fontFamily: '"Microsoft YaHei", sans-serif',
      color: '#eeffee',
      align: 'center',
      wordWrap: { width: 420 },
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5);

    const b = this.msgText.getBounds();
    this.msgBg = this.add.graphics().setScrollFactor(0).setDepth(199);
    this.msgBg.fillStyle(0x000000, 0.8);
    this.msgBg.fillRoundedRect(b.x - 16, b.y - 10, b.width + 32, b.height + 20, 8);

    this.time.delayedCall(duration, () => {
      if (this.msgText) {
        this.tweens.add({
          targets: [this.msgText, this.msgBg],
          alpha: 0,
          duration: 400,
          onComplete: () => {
            this.msgText?.destroy();
            this.msgBg?.destroy();
            this.msgText = null;
            this.msgBg = null;
          },
        });
      }
    });
  }

  private showFloatingText(text: string, x: number, y: number): void {
    // 需要加上 gameLayer 偏移
    const ft = this.add.text(OFFSET_X + x, OFFSET_Y + y, text, {
      fontSize: '14px',
      fontFamily: 'Consolas',
      color: '#44ddff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(150);

    this.tweens.add({
      targets: ft,
      y: ft.y - 30,
      alpha: 0,
      duration: 800,
      onComplete: () => ft.destroy(),
    });
  }

  /* ================================================================
   * SAVE
   * ================================================================ */

  private autoSave(): void {
    SaveManager.save({
      chunkX: this.playerChunkX,
      chunkY: this.playerChunkY,
      tileX: this.playerTileX,
      tileY: this.playerTileY,
      keys: this.playerKeys,
      timestamp: Date.now(),
    });
  }

  /** 供 AnchorScene 回调 */
  onAnchorComplete(): void {
    this.updateHUD();
    this.loadChunk(this.playerChunkX, this.playerChunkY);
    this.syncPlayerSprite();
  }
}
