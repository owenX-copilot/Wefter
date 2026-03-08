import Phaser from 'phaser';
import {
  TILE_SIZE, CHUNK_TILES, CHUNK_PX, VIEWPORT_W, VIEWPORT_H,
  OFFSET_X, OFFSET_Y, MID, FRAGMENT_COUNT, DAILY_FRAGMENT_COUNT, PLAYER_MOVE_SPEED,
  TileType, Colors, ChunkType,
  PLAYER_MAX_HP, HEAL_BANK_MAX, HEAL_BANK_REGEN_MS,
  SCOUT_DETECT_RADIUS, CHASER_DETECT_STEPS,
  SNIPER_DETECT_STEPS, PLAYER_FIRE_RANGE, SNIPER_FIRE_RATE,
  COIN_FRAGMENT, COIN_WILD_CHEST, COIN_ENEMY_KILL, COIN_ENEMY_CHEST,
  ITEM_DEFS, ITEM_POOL, SHOP_REFRESH_MS, SHOP_OFFER_COUNT,
  STAT_DEFS, RARITY_NAMES, RARITY_COLORS, SLOT_NAMES, EQUIP_INVENTORY_MAX,
} from '../constants';
import type { StatType, EquipSlot } from '../constants';
import type { ItemId } from '../constants';
import type { ChunkData, MapKey, SaveData, EnemyData, InventoryItem, Equipment, StatRoll } from '../types';
import { SeedProvider } from '../systems/SeedProvider';
import { ChunkManager } from '../systems/ChunkManager';
import { SaveManager } from '../systems/SaveManager';
import { EquipmentGenerator } from '../systems/EquipmentGenerator';

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
  private enemyLayer!: Phaser.GameObjects.Container;
  private player!: Phaser.GameObjects.Sprite;
  private chestSprite: Phaser.GameObjects.Sprite | null = null;
  private fragmentSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private enemySprites  = new Map<string, Phaser.GameObjects.Sprite>();
  private enemyHpBars   = new Map<string, Phaser.GameObjects.Graphics>();

  // Player combat
  private playerHp = PLAYER_MAX_HP;
  private healBank = HEAL_BANK_MAX;
  private playerCoins = 0;
  private playerInvincible = false;
  private inventory: InventoryItem[] = [];
  private playerDamageBonus = 0;
  private playerMaxHpBonus = 0;
  private scoutRadiusReduction = 0;
  private shieldActive = false;
  private speedRuneActive = false;
  private smokeStepsLeft = 0;

  // Equipment
  private equipped: { weapon: Equipment | null; armor: Equipment | null; trinket: Equipment | null } = { weapon: null, armor: null, trinket: null };
  private equipInventory: Equipment[] = [];
  private equipStats: Record<StatType, number> = { hp: 0, atk: 0, spd: 0, crit_rate: 0, crit_dmg: 0, dodge: 0 };

  // Movement
  private isMoving = false;
  private moveTarget = { x: 0, y: 0 };
  private moveDir = { x: 0, y: 0 };   // keydown/keyup 维护的当前方向
  private moveCooldown = 0;            // 步进冷却时长（ms）
  private hudTickAccum = 0;            // 商店倒计时 HUD 刷新累计（ms）
  private static readonly MOVE_STEP_MS = 60; // 连续移动间隔，与动画时长匹配

  // Current chunk
  private currentChunk: ChunkData | null = null;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;
  private keyG!: Phaser.Input.Keyboard.Key;
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

  // UI overlay (shop / bag)
  private overlayOpen = false;
  private overlayContainer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  /* ================================================================
   * LIFECYCLE
   * ================================================================ */

  init(data: { slot?: number }): void {
    SaveManager.setSlot(data?.slot ?? 0);
  }

  create(): void {
    // ---- 系统初始化 ----
    this.seedProvider = new SeedProvider();
    this.chunkManager = new ChunkManager(this.seedProvider);

    // ---- 读取存档 ----
    const save = SaveManager.load();
    if (save) {
      this.playerChunkX = save.chunkX;
      this.playerChunkY = save.chunkY;
      this.playerTileX  = save.tileX;
      this.playerTileY  = save.tileY;
      this.playerKeys   = save.keys || [];
      this.playerHp     = save.hp   ?? PLAYER_MAX_HP;
      this.healBank     = save.healBank ?? HEAL_BANK_MAX;
      this.playerCoins  = save.coins ?? 0;
      this.inventory    = save.inventory ?? [];
      this.playerDamageBonus    = save.playerDamageBonus ?? 0;
      this.playerMaxHpBonus     = save.playerMaxHpBonus ?? 0;
      this.scoutRadiusReduction = save.scoutRadiusReduction ?? 0;
      this.equipped       = save.equipped ?? { weapon: null, armor: null, trinket: null };
      this.equipInventory = save.equipInventory ?? [];

      // 迁移：旧存档可能把永久升级误放进背包，读档时消化掉
      const permanents: ItemId[] = ['firepower_up', 'max_hp_up', 'scout_jammer'];
      this.inventory = this.inventory.filter(item => {
        if (!permanents.includes(item.id)) return true;
        // 将每个道具的效果叠加
        for (let i = 0; i < item.qty; i++) {
          if (item.id === 'firepower_up')  this.playerDamageBonus++;
          if (item.id === 'max_hp_up')     { this.playerMaxHpBonus += 5; this.playerHp += 5; }
          if (item.id === 'scout_jammer')  this.scoutRadiusReduction++;
        }
        return false; // 从背包移除
      });
    }

    // 计算装备词条汇总
    this.recalcEquipStats();

    // ---- 渲染层（gameLayer 用 offset 保证居中）----
    this.gameLayer = this.add.container(OFFSET_X, OFFSET_Y);
    this.mapLayer = this.add.container(0, 0);
    this.fragmentLayer = this.add.container(0, 0);
    this.enemyLayer = this.add.container(0, 0);
    const entityLayer = this.add.container(0, 0);
    this.gameLayer.add([this.mapLayer, this.fragmentLayer, this.enemyLayer, entityLayer]);

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
    this.keyF = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyB = kb.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.keyM = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyG = kb.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.keyTab = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);

    // keydown/keyup 维护方向状态，完全绕开系统 key-repeat
    const setDir = (x: number, y: number) => { this.moveDir.x = x; this.moveDir.y = y; this.moveCooldown = 0; };
    const clrDir = (x: number, y: number) => {
      if (this.moveDir.x === x && this.moveDir.y === y) { this.moveDir.x = 0; this.moveDir.y = 0; }
    };
    kb.on('keydown-W', () => setDir(0, -1));  kb.on('keyup-W', () => clrDir(0, -1));
    kb.on('keydown-S', () => setDir(0,  1));  kb.on('keyup-S', () => clrDir(0,  1));
    kb.on('keydown-A', () => setDir(-1, 0));  kb.on('keyup-A', () => clrDir(-1, 0));
    kb.on('keydown-D', () => setDir( 1, 0));  kb.on('keyup-D', () => clrDir( 1, 0));
    kb.on('keydown-UP',    () => setDir(0, -1));  kb.on('keyup-UP',    () => clrDir(0, -1));
    kb.on('keydown-DOWN',  () => setDir(0,  1));  kb.on('keyup-DOWN',  () => clrDir(0,  1));
    kb.on('keydown-LEFT',  () => setDir(-1, 0));  kb.on('keyup-LEFT',  () => clrDir(-1, 0));
    kb.on('keydown-RIGHT', () => setDir( 1, 0));  kb.on('keyup-RIGHT', () => clrDir( 1, 0));

    // 切出场景时清除方向状态，防止回来后嫌idental挥不停
    this.events.on('pause',  () => { this.moveDir.x = 0; this.moveDir.y = 0; });
    this.events.on('resume', () => { this.moveDir.x = 0; this.moveDir.y = 0; this.moveCooldown = 0; });

    // ---- HUD ----
    this.createHUD();

    // ---- 加载起始区块 ----
    this.loadChunk(this.playerChunkX, this.playerChunkY);
    this.syncPlayerSprite();

    // ---- Seed 变化 ----
    this.seedProvider.onChange((qid) => this.onSeedChanged(qid));

    // ---- 自动保存 ----
    this.time.addEvent({ delay: 5000, callback: () => this.autoSave(), loop: true });

    // ---- 回血储量计时器（实时，2分钟 +1，上限200）----
    this.time.addEvent({
      delay: HEAL_BANK_REGEN_MS,
      callback: () => {
        if (this.healBank < HEAL_BANK_MAX) {
          this.healBank = Math.min(HEAL_BANK_MAX, this.healBank + 1);
          if (this.chunkManager.isHome(this.playerChunkX, this.playerChunkY)) {
            this.updateHUD();
          }
        }
      },
      loop: true,
    });

    // ---- 欢迎提示 ----
    this.showMessage('WASD 移动 | 收集5碎片→开宝箱得钥匙 | E 使用钥匙锚定区块 | M 地图', 4000);
  }

  update(_time: number, delta: number): void {
    if (this.scene.isActive('MapScene') || this.scene.isActive('AnchorScene')) return;
    this.handleMovement(delta);

    // 锚定商店倒计时实时刷新（每秒更新一次 HUD）
    const chunk = this.currentChunk;
    if (chunk?.chunkType === ChunkType.Shop && chunk.state === 'anchored' && chunk.shopPurchased) {
      this.hudTickAccum += delta;
      if (this.hudTickAccum >= 1000) {
        this.hudTickAccum = 0;
        this.updateHUD();
      }
    } else {
      this.hudTickAccum = 0;
    }
  }

  /* ================================================================
   * MOVEMENT
   * ================================================================ */

  private handleMovement(delta: number): void {
    // 动画进行中：推进动画
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
        this.checkEnemyChestInteraction();
        this.checkShopNpcStep();
        this.processTurn();
        this.checkExit();
      } else {
        const speed = PLAYER_MOVE_SPEED * TILE_SIZE * (delta / 1000);
        const step = Math.min(speed, dist);
        this.player.x += (dx / dist) * step;
        this.player.y += (dy / dist) * step;
      }
      return;
    }

    // 冷却计时正在过期——减少剩余时长
    if (this.moveCooldown > 0) {
      this.moveCooldown -= delta;
    }

    const { x: mx, y: my } = this.moveDir;
    if (mx === 0 && my === 0) {
      if (Phaser.Input.Keyboard.JustDown(this.keyE))   this.tryAnchor();
      if (Phaser.Input.Keyboard.JustDown(this.keyF))   this.tryOpenShop();
      if (Phaser.Input.Keyboard.JustDown(this.keyB))   this.openBagUI();
      if (Phaser.Input.Keyboard.JustDown(this.keyM))   this.openMap();
      if (Phaser.Input.Keyboard.JustDown(this.keyG))   this.openEquipUI();
      if (Phaser.Input.Keyboard.JustDown(this.keyTab)) this.showStatus();
      return;
    }

    if (this.moveCooldown > 0) return;

    const nx = this.playerTileX + mx;
    const ny = this.playerTileY + my;
    if (nx < 0 || nx >= CHUNK_TILES || ny < 0 || ny >= CHUNK_TILES) return;

    const tile = this.currentChunk!.grid[ny][nx];
    if (tile === TileType.Wall) return;

    // 目标格有存活敌人 → 近战攻击（不位移）
    const enemyHere = this.getEnemyAt(nx, ny);
    if (enemyHere) {
      this.moveCooldown = this.calcMoveCooldown();
      this.dealDamageToEnemy(enemyHere, this.calcPlayerDamage());
      this.showFloatingText('⚔', nx * TILE_SIZE + TILE_SIZE / 2, (ny - 1) * TILE_SIZE);
      this.processTurn();
      return;
    }

    this.isMoving = true;
    this.moveTarget = { x: nx, y: ny };
    this.moveCooldown = this.calcMoveCooldown();
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
    this.renderEnemies(this.currentChunk);
    this.tryHomeHeal();
    this.tryAnchoredWildNotice();
    this.updateHUD();
  }

  private tryAnchoredWildNotice(): void {
    const chunk = this.currentChunk;
    if (!chunk || chunk.chunkType !== ChunkType.Wild || chunk.state !== 'anchored') return;
    const remaining = chunk.fragments.filter(f => !f.collected).length;
    if (remaining > 0) {
      this.showMessage(`🌿 领土资源已刷新！共 ${DAILY_FRAGMENT_COUNT} 个碎片待收集`, 2500);
    } else if (chunk.fragments.length > 0 || chunk.chestOpened) {
      // fragments 全收完或今日已领取
      this.showMessage('🌿 今日资源已领取，明日零点刷新', 2000);
    }
  }

  private tryHomeHeal(): void {
    if (!this.chunkManager.isHome(this.playerChunkX, this.playerChunkY)) return;
    const maxHp = this.getMaxHp();
    const missing = maxHp - this.playerHp;
    if (missing <= 0) {
      this.showMessage('🏠 家园——生命已满', 1500);
      return;
    }
    if (this.healBank <= 0) {
      this.showMessage('🏠 家园——回血储量已耗尽，请等待恢复（每2分钟 +1）', 2500);
      return;
    }
    const actual = Math.min(missing, this.healBank);
    this.playerHp  += actual;
    this.healBank  -= actual;
    this.showMessage(`🏠 家园——回血 +${actual}，生命恢复至 ${this.playerHp}/${maxHp}\n回血储量: ${this.healBank}/${HEAL_BANK_MAX}`, 2000);
  }

  private clearRendered(): void {
    this.mapLayer.removeAll(true);
    this.fragmentLayer.removeAll(true);
    this.fragmentSprites.clear();
    if (this.chestSprite) {
      this.chestSprite.destroy();
      this.chestSprite = null;
    }
    this.closeOverlay();
    // 清除敌人层
    for (const sprite of this.enemySprites.values()) {
      this.tweens.killTweensOf(sprite);
      sprite.destroy();
    }
    this.enemySprites.clear();
    for (const bar of this.enemyHpBars.values()) bar.destroy();
    this.enemyHpBars.clear();
    this.enemyLayer.removeAll(false); // 子元素已单独销毁，只清引用
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
          const texKey = isAnchored ? 'anchoredWall' : 'wall';
          this.mapLayer.add(this.add.sprite(px, py, texKey).setOrigin(0));
        } else if (tile === TileType.Exit) {
          this.mapLayer.add(this.add.sprite(px, py, 'exit').setOrigin(0));
          this.mapLayer.add(
            this.add.text(px + TILE_SIZE / 2, py + TILE_SIZE / 2, '◆', {
              fontSize: '12px', color: '#8888aa',
            }).setOrigin(0.5),
          );
        } else {
          // 地板——优先级：家园 > 已锚定商店 > 已锚定 > 中心房间(未锚定) > 普通
          const inCenter = Math.abs(x - MID) <= 1 && Math.abs(y - MID) <= 1;
          const isAnchoredShop = isAnchored && chunk.chunkType === ChunkType.Shop;
          let key = 'floor';
          if (isHome) {
            const onDiamond = Math.abs(x - MID) + Math.abs(y - MID) <= 4;
            const onCross = (x === MID || y === MID);
            key = (onDiamond || onCross) ? 'pathFloor' : 'homeFloor';
          } else if (isAnchoredShop) key = 'shopFloor';
          else if (isAnchored) key = 'anchoredFloor';
          else if (inCenter) key = 'centerFloor';
          this.mapLayer.add(this.add.sprite(px, py, key).setOrigin(0));
        }
      }
    }

    // 区块边框
    const border = this.add.graphics();
    if (isHome) border.lineStyle(2, Colors.HOME, 0.7);
    else if (isAnchored && chunk.chunkType === ChunkType.Shop) border.lineStyle(2, 0xffcc44, 0.8);
    else if (isAnchored) border.lineStyle(2, Colors.ANCHORED, 0.6);
    else border.lineStyle(1, 0x1a1a38, 0.4);
    border.strokeRect(0, 0, CHUNK_PX, CHUNK_PX);
    this.mapLayer.add(border);
  }

  private renderFragments(chunk: ChunkData): void {
    // 锚定荒野区块允许每日刷新碎片；其余锚定区块跳过
    if (chunk.state === 'anchored' && chunk.chunkType !== ChunkType.Wild) return;
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
    // 销毁旷有的
    if (this.chestSprite) {
      this.tweens.killTweensOf(this.chestSprite);
      this.chestSprite.destroy();
      this.chestSprite = null;
    }
    if (chunk.state === 'anchored') {
      // 锚定商店：商人 NPC
      if (chunk.chunkType === ChunkType.Shop) {
        const px = MID * TILE_SIZE + TILE_SIZE / 2;
        const py = MID * TILE_SIZE + TILE_SIZE / 2;
        this.chestSprite = this.add.sprite(px, py, 'merchant').setDepth(5);
        this.tweens.add({
          targets: this.chestSprite,
          y: { from: py - 2, to: py + 2 },
          duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        this.fragmentLayer.add(this.chestSprite);
        return;
      }
      // 锚定荒野：无宝箱，全部领取后直接提示，不渲染任何箱子
      return;
    }
    if (this.chunkManager.isHome(chunk.cx, chunk.cy)) return;

    const isWild  = chunk.chunkType === ChunkType.Wild;
    const isEnemy = chunk.chunkType === ChunkType.Enemy;
    const isShop  = chunk.chunkType === ChunkType.Shop;

    // 商店区块：显示商人（未购买）
    if (isShop) {
      if (chunk.shopPurchased) return;
      const px = MID * TILE_SIZE + TILE_SIZE / 2;
      const py = MID * TILE_SIZE + TILE_SIZE / 2;
      this.chestSprite = this.add.sprite(px, py, 'merchant').setDepth(5);
      this.tweens.add({
        targets: this.chestSprite,
        y: { from: py - 2, to: py + 2 },
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.fragmentLayer.add(this.chestSprite);
      return;
    }

    if (!isWild && !isEnemy) return;
    // 敌营区块必须先清场才出现宝箱
    if (isEnemy && !chunk.chestUnlocked) return;

    const px = MID * TILE_SIZE + TILE_SIZE / 2;
    const py = MID * TILE_SIZE + TILE_SIZE / 2;
    let texKey = 'chest_locked';
    if (chunk.chestOpened) texKey = 'chest_opened';
    else if (chunk.chestUnlocked) texKey = 'chest_unlocked';

    this.chestSprite = this.add.sprite(px, py, texKey).setDepth(5);
    this.fragmentLayer.add(this.chestSprite);

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
    if (!chunk) return;
    // 正常未锚定或锚定荒野均允许收碎片
    if (chunk.state === 'anchored' && chunk.chunkType !== ChunkType.Wild) return;
    if (chunk.chunkType !== ChunkType.Wild) return;

    for (const frag of chunk.fragments) {
      if (frag.collected) continue;
      if (frag.x !== this.playerTileX || frag.y !== this.playerTileY) continue;

      frag.collected = true;
      this.gainCoins(COIN_FRAGMENT);

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

      if (chunk.state === 'anchored') {
        // 锚定荒野：独立逻辑，收完即提示，无宝箱
        const total = chunk.fragments.length; // = DAILY_FRAGMENT_COUNT
        this.showFloatingText(
          `✦ ${collected}/${total}`,
          frag.x * TILE_SIZE + TILE_SIZE / 2,
          frag.y * TILE_SIZE,
        );
        if (collected >= total) {
          this.chunkManager.markDailyChestOpened(chunk.cx, chunk.cy);
          this.cameras.main.flash(500, 80, 200, 80);
          this.showMessage(`🌿 今日资源已全部领取！
明日零点刷新，请届时再来`, 3500);
        }
      } else {
        // 未锚定荒野：原有逻辑
        this.showFloatingText(
          `✦ ${collected}/${FRAGMENT_COUNT}`,
          frag.x * TILE_SIZE + TILE_SIZE / 2,
          frag.y * TILE_SIZE,
        );
        if (collected >= FRAGMENT_COUNT && !chunk.chestUnlocked) {
          chunk.chestUnlocked = true;
          this.cameras.main.flash(400, 50, 150, 200);
          this.showMessage('✦ 碎片收集完毕！中心区宝箱已解锁！', 3000);
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
      }

      this.updateHUD();
    }
  }

  private checkChestInteraction(): void {
    const chunk = this.currentChunk;
    if (!chunk || chunk.state === 'anchored') return; // 锚定区块无宝箱交互
    if (this.chunkManager.isHome(chunk.cx, chunk.cy)) return;
    if (chunk.chunkType !== ChunkType.Wild) return;
    if (!chunk.chestUnlocked || chunk.chestOpened) return;
    if (this.playerTileX !== MID || this.playerTileY !== MID) return;

    chunk.chestOpened = true;
    this.gainCoins(COIN_WILD_CHEST);
    this.tryChestEquipDrop(chunk.cx, chunk.cy, 'wild_chest');
    this.chunkManager.liberateChunk(chunk.cx, chunk.cy);

    const gridSnapshot = chunk.grid.map(row => [...row]);
    const label = `从 (${chunk.cx}, ${chunk.cy}) 获得`;
    this.playerKeys.push({ grid: gridSnapshot, label });
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
   * ENEMY COMBAT
   * ================================================================ */

  // ---- Helper: 取目标格上存活的敌人 ----
  private getEnemyAt(x: number, y: number, excludeId?: string): EnemyData | undefined {
    return this.currentChunk?.enemies.find(
      e => e.hp > 0 && e.x === x && e.y === y && e.id !== excludeId,
    );
  }

  // ---- BFS：返回到目标的最短路径第一步 + 距离；不可达返回 null ----
  private bfs(
    grid: number[][], sx: number, sy: number, tx: number, ty: number,
  ): { dist: number; nx: number; ny: number } | null {
    if (sx === tx && sy === ty) return { dist: 0, nx: sx, ny: sy };
    const visited = new Map<string, string | null>();
    const q: [number, number, number][] = [[sx, sy, 0]];
    visited.set(`${sx},${sy}`, null);
    while (q.length > 0) {
      const [x, y, d] = q.shift()!;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= CHUNK_TILES || ny < 0 || ny >= CHUNK_TILES) continue;
        if (grid[ny][nx] === TileType.Wall) continue;
        const k = `${nx},${ny}`;
        if (visited.has(k)) continue;
        visited.set(k, `${x},${y}`);
        if (nx === tx && ny === ty) {
          // 回溯找第一步
          let cur = k;
          while (true) {
            const par = visited.get(cur)!;
            if (par === `${sx},${sy}`) {
              const [fx, fy] = cur.split(',').map(Number);
              return { dist: d + 1, nx: fx, ny: fy };
            }
            cur = par;
          }
        }
        q.push([nx, ny, d + 1]);
      }
    }
    return null;
  }

  // ---- 渲染敌人 ----
  private renderEnemies(chunk: ChunkData): void {
    if (chunk.chunkType !== ChunkType.Enemy || chunk.state === 'anchored') return;
    for (const e of chunk.enemies) {
      if (e.hp > 0) this.spawnEnemySprite(e);
    }
  }

  private spawnEnemySprite(e: EnemyData): void {
    const px = e.x * TILE_SIZE + TILE_SIZE / 2;
    const py = e.y * TILE_SIZE + TILE_SIZE / 2;
    const sprite = this.add.sprite(px, py, e.kind).setDepth(8);
    this.enemyLayer.add(sprite);
    this.enemySprites.set(e.id, sprite);
    const bar = this.add.graphics();
    this.enemyLayer.add(bar);
    this.enemyHpBars.set(e.id, bar);
    this.drawHpBar(e, bar);
  }

  private drawHpBar(e: EnemyData, bar: Phaser.GameObjects.Graphics): void {
    bar.clear();
    const px = e.x * TILE_SIZE + 2;
    const py = e.y * TILE_SIZE - 5;
    bar.fillStyle(0x333333, 1);
    bar.fillRect(px, py, TILE_SIZE - 4, 3);
    bar.fillStyle(0xff3333, 1);
    bar.fillRect(px, py, Math.floor((TILE_SIZE - 4) * e.hp / e.maxHp), 3);
  }

  private syncEnemySprites(chunk: ChunkData): void {
    for (const e of chunk.enemies) {
      if (e.hp <= 0) continue;
      const sprite = this.enemySprites.get(e.id);
      const bar    = this.enemyHpBars.get(e.id);
      if (!sprite) continue;
      const px = e.x * TILE_SIZE + TILE_SIZE / 2;
      const py = e.y * TILE_SIZE + TILE_SIZE / 2;
      this.tweens.add({ targets: sprite, x: px, y: py, duration: 80, ease: 'Linear' });
      if (bar) this.drawHpBar(e, bar);
    }
  }

  // ---- 伤害 ----
  private dealDamageToEnemy(e: EnemyData, amount: number): void {
    e.hp = Math.max(0, e.hp - amount);
    const sprite = this.enemySprites.get(e.id);
    const bar    = this.enemyHpBars.get(e.id);
    if (sprite) {
      sprite.setTint(0xffffff);
      this.time.delayedCall(100, () => { if (sprite.active) sprite.clearTint(); });
    }
    if (bar && e.hp > 0) this.drawHpBar(e, bar);
    if (e.hp <= 0) {
      // 死亡动画
      if (sprite) {
        this.enemyLayer.remove(sprite, false);
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite, scaleX: 0, scaleY: 0, alpha: 0, duration: 280,
          onComplete: () => { if (sprite.active) sprite.destroy(); },
        });
        this.enemySprites.delete(e.id);
      }
      if (bar) {
        this.enemyLayer.remove(bar, false);
        bar.destroy();
        this.enemyHpBars.delete(e.id);
      }
      this.showFloatingText('💀', e.x * TILE_SIZE + TILE_SIZE / 2, (e.y - 1) * TILE_SIZE);
      this.tryEnemyEquipDrop(e);
      this.checkAllEnemiesCleared();
    }
  }

  private damagePlayer(amount: number): void {
    if (this.playerInvincible) return;
    if (this.shieldActive) {
      this.shieldActive = false;
      this.showFloatingText('🛡 护盾!', this.playerTileX * TILE_SIZE + TILE_SIZE / 2, (this.playerTileY - 1) * TILE_SIZE);
      return;
    }
    // 闪避判定
    if (this.equipStats.dodge > 0 && Math.random() * 100 < this.equipStats.dodge) {
      this.showFloatingText('🌀 闪避!', this.playerTileX * TILE_SIZE + TILE_SIZE / 2, (this.playerTileY - 1) * TILE_SIZE);
      return;
    }
    this.playerHp = Math.max(0, this.playerHp - amount);
    this.cameras.main.flash(180, 220, 20, 20);
    this.playerInvincible = true;
    this.time.delayedCall(600, () => { this.playerInvincible = false; });
    this.updateHUD();
    if (this.playerHp <= 0) this.onPlayerDeath();
  }

  private onPlayerDeath(): void {
    this.showMessage('💀 你倒下了...\n传送回家园', 2000);
    this.moveDir.x = 0; this.moveDir.y = 0;
    // 重置临时增益（死亡不影响背包/永久道具）
    this.speedRuneActive = false;
    this.shieldActive = false;
    this.smokeStepsLeft = 0;
    this.time.delayedCall(1600, () => {
      this.playerHp = this.getMaxHp();
      this.playerInvincible = false;
      this.playerTileX = MID;
      this.playerTileY = MID;
      this.loadChunk(0, 0);
      this.syncPlayerSprite();
      this.cameras.main.fadeIn(500);
      this.updateHUD();
    });
  }

  private checkAllEnemiesCleared(): void {
    const chunk = this.currentChunk;
    if (!chunk || chunk.chunkType !== ChunkType.Enemy) return;
    if (chunk.chestUnlocked) return;
    if (!chunk.enemies.every(e => e.hp <= 0)) return;
    chunk.chestUnlocked = true;
    this.cameras.main.flash(400, 30, 200, 50);
    this.showMessage('⚔️ 所有敌人已击败！中心区宝箱已解锁！', 3000);
    this.renderChest(chunk);
    this.updateHUD();
  }

  // ---- 子弹视觉 ----
  private firePlayerBullet(sx: number, sy: number, tx: number, ty: number): void {
    const startX = OFFSET_X + sx * TILE_SIZE + TILE_SIZE / 2;
    const startY = OFFSET_Y + sy * TILE_SIZE + TILE_SIZE / 2;
    const endX   = OFFSET_X + tx * TILE_SIZE + TILE_SIZE / 2;
    const endY   = OFFSET_Y + ty * TILE_SIZE + TILE_SIZE / 2;
    const bullet = this.add.sprite(startX, startY, 'bullet_p').setDepth(200);
    const dist   = Math.abs(tx - sx) + Math.abs(ty - sy);
    this.tweens.add({ targets: bullet, x: endX, y: endY, duration: dist * 35,
      onComplete: () => bullet.destroy() });
  }

  private fireEnemyBullet(sx: number, sy: number, tx: number, ty: number, pierce: boolean): void {
    const startX = OFFSET_X + sx * TILE_SIZE + TILE_SIZE / 2;
    const startY = OFFSET_Y + sy * TILE_SIZE + TILE_SIZE / 2;
    const endX   = OFFSET_X + tx * TILE_SIZE + TILE_SIZE / 2;
    const endY   = OFFSET_Y + ty * TILE_SIZE + TILE_SIZE / 2;
    const key    = pierce ? 'bullet_e_pierce' : 'bullet_e';
    const bullet = this.add.sprite(startX, startY, key).setDepth(200);
    const dist   = Math.max(1, Math.abs(tx - sx) + Math.abs(ty - sy));
    this.tweens.add({ targets: bullet, x: endX, y: endY, duration: dist * 50,
      onComplete: () => bullet.destroy() });
  }

  // ---- 玩家自动开火 ----
  private playerAutoFire(chunk: ChunkData): void {
    const alive = chunk.enemies.filter(e => e.hp > 0);
    if (alive.length === 0) return;

    const inLOS: EnemyData[] = [];
    for (const e of alive) {
      if (e.x === this.playerTileX) {
        const minY = Math.min(e.y, this.playerTileY);
        const maxY = Math.max(e.y, this.playerTileY);
        let clear = true;
        for (let y = minY + 1; y < maxY; y++) {
          if (chunk.grid[y][e.x] === TileType.Wall) { clear = false; break; }
        }
        if (clear && Math.abs(e.y - this.playerTileY) <= PLAYER_FIRE_RANGE) inLOS.push(e);
      } else if (e.y === this.playerTileY) {
        const minX = Math.min(e.x, this.playerTileX);
        const maxX = Math.max(e.x, this.playerTileX);
        let clear = true;
        for (let x = minX + 1; x < maxX; x++) {
          if (chunk.grid[e.y][x] === TileType.Wall) { clear = false; break; }
        }
        if (clear && Math.abs(e.x - this.playerTileX) <= PLAYER_FIRE_RANGE) inLOS.push(e);
      }
    }
    if (inLOS.length === 0) return;

    const target = inLOS.reduce((a, b) =>
      (Math.abs(a.x - this.playerTileX) + Math.abs(a.y - this.playerTileY)) <=
      (Math.abs(b.x - this.playerTileX) + Math.abs(b.y - this.playerTileY)) ? a : b,
    );
    this.firePlayerBullet(this.playerTileX, this.playerTileY, target.x, target.y);
    this.dealDamageToEnemy(target, this.calcPlayerDamage());
  }

  // ---- 回合处理 ----
  private processTurn(): void {
    const chunk = this.currentChunk;
    if (!chunk || chunk.chunkType !== ChunkType.Enemy || chunk.state === 'anchored') return;
    if (chunk.enemies.length === 0) return;

    // 1. 玩家先自动开火
    this.playerAutoFire(chunk);

    // 2. 更新巡逻者广播状态（开火后立即更新，保证被击杀的巡逻者不广播）
    for (const e of chunk.enemies) {
      if (e.kind !== 'scout' || e.hp <= 0) continue;
      const dx = e.x - this.playerTileX, dy = e.y - this.playerTileY;
      e.broadcasting = (dx * dx + dy * dy) <= SCOUT_DETECT_RADIUS * SCOUT_DETECT_RADIUS;
    }
    const anyBroadcast = chunk.enemies.some(e => e.kind === 'scout' && e.hp > 0 && e.broadcasting);

    // 3. 各敌人 AI
    for (const e of chunk.enemies) {
      if (e.hp <= 0) continue;
      if (e.kind === 'scout')  this.processScout(e, chunk.grid);
      if (e.kind === 'chaser') this.processChaser(e, chunk.grid);
      if (e.kind === 'sniper') this.processSniper(e, chunk.grid, anyBroadcast);
    }

    // 4. 同步动画
    this.syncEnemySprites(chunk);
  }

  private processScout(e: EnemyData, grid: number[][]): void {
    // 随机移动（不寻路，不追玩家）
    const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dx, dy] of dirs) {
      const nx = e.x + dx, ny = e.y + dy;
      if (nx < 0 || nx >= CHUNK_TILES || ny < 0 || ny >= CHUNK_TILES) continue;
      if (grid[ny][nx] === TileType.Wall || grid[ny][nx] === TileType.Exit) continue;
      if (nx === this.playerTileX && ny === this.playerTileY) continue;
      if (this.getEnemyAt(nx, ny, e.id)) continue;
      e.x = nx; e.y = ny;
      break;
    }
  }

  private processChaser(e: EnemyData, grid: number[][]): void {
    if (!e.activated) {
      if (this.smokeStepsLeft > 0) return;
      const r = this.bfs(grid, e.x, e.y, this.playerTileX, this.playerTileY);
      if (r && r.dist <= CHASER_DETECT_STEPS) e.activated = true;
      if (!e.activated) return;
    }
    const doStep = (): void => {
      const r = this.bfs(grid, e.x, e.y, this.playerTileX, this.playerTileY);
      if (!r) return;
      if (r.nx === this.playerTileX && r.ny === this.playerTileY) {
        this.damagePlayer(1);
      } else if (!this.getEnemyAt(r.nx, r.ny, e.id)) {
        e.x = r.nx; e.y = r.ny;
      }
    };
    doStep();
    e.stepCount++;
    if (e.stepCount % 3 === 0) doStep(); // 每3步额外多走一步（冲刺）
  }

  private processSniper(e: EnemyData, grid: number[][], anyBroadcast: boolean): void {
    // 烟雾弹生效时巡逻不广播，狙击者也不需激活
    if (this.smokeStepsLeft > 0) return;
    // 广播时无视激活条件直接计时
    if (!anyBroadcast && !e.activated) {
      const r = this.bfs(grid, e.x, e.y, this.playerTileX, this.playerTileY);
      if (r && r.dist <= SNIPER_DETECT_STEPS) e.activated = true;
      if (!e.activated) return;
    }
    e.attackTimer--;
    if (e.attackTimer > 0) return;
    e.attackTimer = SNIPER_FIRE_RATE;

    if (anyBroadcast) {
      // 穿墙攻击
      this.fireEnemyBullet(e.x, e.y, this.playerTileX, this.playerTileY, true);
      this.damagePlayer(1);
      return;
    }
    // 正常：只攻击在预计算 LOS 内的玩家
    if (e.visibleCells.includes(`${this.playerTileX},${this.playerTileY}`)) {
      this.fireEnemyBullet(e.x, e.y, this.playerTileX, this.playerTileY, false);
      this.damagePlayer(1);
    }
  }

  // ---- 敌营宝箱交互（与 Wild 逻辑独立） ----
  private checkEnemyChestInteraction(): void {
    const chunk = this.currentChunk;
    if (!chunk || chunk.state === 'anchored') return;
    if (this.chunkManager.isHome(chunk.cx, chunk.cy)) return;
    if (chunk.chunkType !== ChunkType.Enemy) return;
    if (!chunk.chestUnlocked || chunk.chestOpened) return;
    if (this.playerTileX !== MID || this.playerTileY !== MID) return;

    chunk.chestOpened = true;
    this.gainCoins(COIN_ENEMY_CHEST);
    this.tryChestEquipDrop(chunk.cx, chunk.cy, 'enemy_chest');
    this.chunkManager.liberateChunk(chunk.cx, chunk.cy);
    const gridSnapshot = chunk.grid.map(row => [...row]);
    const label = `从 (${chunk.cx}, ${chunk.cy}) 获得`;
    this.playerKeys.push({ grid: gridSnapshot, label });

    if (this.chestSprite) {
      this.tweens.killTweensOf(this.chestSprite);
      this.chestSprite.setTexture('chest_opened');
      this.chestSprite.setScale(1);
    }
    this.cameras.main.flash(500, 50, 200, 50);
    this.showMessage(
      `🔑 获得地图钥匙「${label}」\n在任意未锚定区块按 E 即可使用`,
      4000,
    );
    this.updateHUD();
  }

  /* ==============================================================
   * SHOP
   * ============================================================== */

  /** 走到商人格子时提示 */
  private checkShopNpcStep(): void {
    const chunk = this.currentChunk;
    if (!chunk) return;
    if (this.playerTileX !== MID || this.playerTileY !== MID) return;

    if (chunk.chunkType === ChunkType.Shop && !chunk.shopPurchased) {
      this.showMessage('🏪 按 F 与商人交易', 1200);
    } else if (chunk.state === 'anchored' && chunk.chunkType === ChunkType.Shop) {
      const now = Date.now();
      if (chunk.shopRefreshAt === 0 || now >= chunk.shopRefreshAt) {
        this.showMessage('🏪 按 F 查看商品 (已刷新)', 1200);
      } else {
        const mins = Math.ceil((chunk.shopRefreshAt - now) / 60000);
        this.showMessage(`🏪 按 F 查看商品 | 下次刷新: ${mins} 分钟`, 1200);
      }
    }
  }

  /** F 键 — 打开商店 */
  private tryOpenShop(): void {
    if (this.overlayOpen) { this.closeOverlay(); return; }
    const chunk = this.currentChunk;
    if (!chunk) return;
    if (this.playerTileX !== MID || this.playerTileY !== MID) {
      this.showMessage('需要走到商人处才能交易', 1500);
      return;
    }
    if (chunk.chunkType !== ChunkType.Shop) return;

    // 一次性商店（未解放）
    if (chunk.state !== 'anchored') {
      if (chunk.shopPurchased) {
        this.showMessage('此商店已完成交易', 1500);
        return;
      }
      this.openShopUI(chunk.shopOffers, false);
      return;
    }

    // 锚定固定商店
    const now = Date.now();
    if (chunk.shopRefreshAt === 0 || now >= chunk.shopRefreshAt) {
      // 刷新商品
      const seed = Math.floor(now / SHOP_REFRESH_MS);
      chunk.shopOffers = this.chunkManager.rollShopOffers(seed);
      chunk.shopRefreshAt = Math.ceil(now / SHOP_REFRESH_MS) * SHOP_REFRESH_MS;
      chunk.shopPurchased = false; // 每次刷新重置购买次数
      // 持久化刷新状态（含新商品列表，防刷新绕过）
      this.chunkManager.saveShopState(chunk.cx, chunk.cy, false, chunk.shopRefreshAt, chunk.shopOffers);
    }
    if (chunk.shopPurchased) {
      const mins = Math.ceil((chunk.shopRefreshAt - now) / 60000);
      this.showMessage(`本轮商品已购买，下次刷新: ${mins} 分钟`, 2000);
      return;
    }
    this.openShopUI(chunk.shopOffers, true);
  }

  private openShopUI(offers: string[], isAnchored: boolean): void {
    this.overlayOpen = true;
    const W = 500, H = 240;
    const ox = (VIEWPORT_W - W) / 2, oy = (VIEWPORT_H - H) / 2;
    const c = this.add.container(ox, oy).setDepth(300);
    this.overlayContainer = c;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a20, 0.95);
    bg.fillRoundedRect(0, 0, W, H, 10);
    bg.lineStyle(2, 0xcc8800, 1);
    bg.strokeRoundedRect(0, 0, W, H, 10);
    c.add(bg);

    c.add(this.add.text(W / 2, 16, '🏪 商店 — 3 选 1', {
      fontSize: '16px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#ffcc44',
    }).setOrigin(0.5, 0));

    const btnW = 140, btnH = 155, gap = 10;
    const startX = (W - (btnW * 3 + gap * 2)) / 2;

    offers.forEach((id, i) => {
      const def = ITEM_DEFS[id as keyof typeof ITEM_DEFS];
      const bx = startX + i * (btnW + gap);
      const by = 40;
      const canAfford = this.playerCoins >= def.price;

      const btnBg = this.add.graphics();
      btnBg.fillStyle(canAfford ? 0x1a1a40 : 0x181818, 1);
      btnBg.fillRoundedRect(bx, by, btnW, btnH, 6);
      btnBg.lineStyle(2, canAfford ? 0x4466cc : 0x444444, 1);
      btnBg.strokeRoundedRect(bx, by, btnW, btnH, 6);
      c.add(btnBg);

      c.add(this.add.text(bx + btnW / 2, by + 14, def.icon, {
        fontSize: '28px',
      }).setOrigin(0.5, 0));
      c.add(this.add.text(bx + btnW / 2, by + 52, def.name, {
        fontSize: '13px', fontFamily: '"Microsoft YaHei"', color: canAfford ? '#eeeeff' : '#666666',
      }).setOrigin(0.5, 0));
      c.add(this.add.text(bx + btnW / 2, by + 72, def.desc, {
        fontSize: '11px', fontFamily: '"Microsoft YaHei"', color: '#8899aa',
        wordWrap: { width: btnW - 10 }, align: 'center',
      }).setOrigin(0.5, 0));
      c.add(this.add.text(bx + btnW / 2, by + 132, `🪙 ${def.price}`, {
        fontSize: '14px', fontFamily: 'Consolas', color: canAfford ? '#ffcc44' : '#884400',
      }).setOrigin(0.5, 0));

      if (canAfford) {
        const hitArea = this.add.graphics();
        hitArea.fillStyle(0xffffff, 0);
        hitArea.fillRect(bx, by, btnW, btnH);
        hitArea.setInteractive(
          new Phaser.Geom.Rectangle(bx, by, btnW, btnH),
          Phaser.Geom.Rectangle.Contains,
        );
        hitArea.on('pointerover', () => { btnBg.clear(); btnBg.fillStyle(0x2a2a60, 1); btnBg.fillRoundedRect(bx, by, btnW, btnH, 6); btnBg.lineStyle(2, 0x8899ff, 1); btnBg.strokeRoundedRect(bx, by, btnW, btnH, 6); });
        hitArea.on('pointerout',  () => { btnBg.clear(); btnBg.fillStyle(0x1a1a40, 1); btnBg.fillRoundedRect(bx, by, btnW, btnH, 6); btnBg.lineStyle(2, 0x4466cc, 1); btnBg.strokeRoundedRect(bx, by, btnW, btnH, 6); });
        hitArea.on('pointerdown', () => this.purchaseItem(id as keyof typeof ITEM_DEFS, isAnchored));
        c.add(hitArea);
      }
    });

    // 关闭按钮
    const closeBtn = this.add.text(W - 10, 6, '✕', {
      fontSize: '18px', color: '#888888',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeOverlay());
    c.add(closeBtn);

    c.add(this.add.text(W / 2, H - 14, `当前金币: 🪙 ${this.playerCoins}  |  ESC 关闭`, {
      fontSize: '11px', fontFamily: 'Consolas', color: '#667788',
    }).setOrigin(0.5, 1));

    this.input.keyboard!.once('keydown-ESC', () => this.closeOverlay());
    this.input.keyboard!.once('keydown-F',   () => this.closeOverlay());
  }

  private purchaseItem(id: keyof typeof ITEM_DEFS, isAnchored: boolean): void {
    const def = ITEM_DEFS[id];
    if (this.playerCoins < def.price) return;
    this.playerCoins -= def.price;

    // 永久升级：立即生效，不进背包
    const permanentUpgrades: ItemId[] = ['firepower_up', 'max_hp_up', 'scout_jammer'];
    if (permanentUpgrades.includes(id)) {
      if (id === 'firepower_up')   this.playerDamageBonus++;
      if (id === 'max_hp_up')     { this.playerMaxHpBonus += 5; this.playerHp += 5; }
      if (id === 'scout_jammer')  this.scoutRadiusReduction++;
    } else {
      // 消耗品/增益符：加入背包
      const existing = this.inventory.find(i => i.id === id);
      if (existing && def.stackable) {
        existing.qty++;
      } else if (!existing) {
        this.inventory.push({ id, qty: 1 });
      }
    }

    // 标记商店已购买
    const chunk = this.currentChunk!;
    chunk.shopPurchased = true;
    // 锚定商店：持久化冷却状态，防刷新绕过
    if (isAnchored) {
      this.chunkManager.saveShopState(chunk.cx, chunk.cy, true, chunk.shopRefreshAt);
    }

    // 一次性商店：解放区块，获得钥匙
    if (!isAnchored) {
      this.chunkManager.liberateChunk(chunk.cx, chunk.cy);
      const gridSnapshot = chunk.grid.map(row => [...row]);
      const label = `🏪 商店 (${chunk.cx}, ${chunk.cy})`;
      this.playerKeys.push({ grid: gridSnapshot, label });
      if (this.chestSprite) {
        this.tweens.killTweensOf(this.chestSprite);
        this.chestSprite.destroy();
        this.chestSprite = null;
      }
      this.cameras.main.flash(400, 100, 180, 50);
      this.time.delayedCall(100, () =>
        this.showMessage(`购买了「${def.icon} ${def.name}」！\n🔑 获得地图钥匙「${label}」`, 3000));
    } else {
      this.showMessage(`购买了「${def.icon} ${def.name}」！`, 2000);
    }

    this.closeOverlay();
    this.updateHUD();
  }

  /* ==============================================================
   * BAG (B 键)
   * ============================================================== */

  private openBagUI(): void {
    if (this.overlayOpen) { this.closeOverlay(); return; }
    this.overlayOpen = true;

    const W = 460, itemH = 46, padding = 12;
    const rows = Math.max(1, this.inventory.length);
    const H = 50 + rows * itemH + 30;
    const ox = (VIEWPORT_W - W) / 2, oy = Math.max(10, (VIEWPORT_H - H) / 2);

    const c = this.add.container(ox, oy).setDepth(300);
    this.overlayContainer = c;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a20, 0.95);
    bg.fillRoundedRect(0, 0, W, H, 10);
    bg.lineStyle(2, 0x4466cc, 1);
    bg.strokeRoundedRect(0, 0, W, H, 10);
    c.add(bg);

    c.add(this.add.text(W / 2, 14, `🎒 背包  (🪙 ${this.playerCoins})`, {
      fontSize: '15px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#aabbff',
    }).setOrigin(0.5, 0));

    const closeBtn = this.add.text(W - 10, 8, '✕', {
      fontSize: '16px', color: '#888888',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeOverlay());
    c.add(closeBtn);

    if (this.inventory.length === 0) {
      c.add(this.add.text(W / 2, 50 + itemH / 2, '背包是空的', {
        fontSize: '14px', fontFamily: '"Microsoft YaHei"', color: '#556677',
      }).setOrigin(0.5));
    } else {
      this.inventory.forEach((item, idx) => {
        const def = ITEM_DEFS[item.id];
        const by = 44 + idx * itemH;
        const rowBg = this.add.graphics();
        rowBg.fillStyle(0x151530, 1);
        rowBg.fillRoundedRect(padding, by, W - padding * 2, itemH - 4, 4);
        c.add(rowBg);

        c.add(this.add.text(padding + 8, by + (itemH - 4) / 2, `${def.icon} ${def.name}`, {
          fontSize: '14px', fontFamily: '"Microsoft YaHei"', color: '#ddeeff',
        }).setOrigin(0, 0.5));

        if (item.qty > 1) {
          c.add(this.add.text(padding + 120, by + (itemH - 4) / 2, `×${item.qty}`, {
            fontSize: '13px', fontFamily: 'Consolas', color: '#88aacc',
          }).setOrigin(0, 0.5));
        }

        c.add(this.add.text(W / 2, by + (itemH - 4) / 2, def.desc, {
          fontSize: '11px', fontFamily: '"Microsoft YaHei"', color: '#667788',
        }).setOrigin(0.5, 0.5));

        // 消耗品/增益符才能手动使用（永久升级在购买时已自动生效）
        const usable = ['first_aid', 'ration', 'smoke_bomb', 'speed_rune', 'shield'];
        if (usable.includes(item.id)) {
          const useBtn = this.add.text(W - padding - 8, by + (itemH - 4) / 2, '[使用]', {
            fontSize: '13px', fontFamily: '"Microsoft YaHei"', color: '#44cc88',
          }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
          useBtn.on('pointerover', () => useBtn.setColor('#88ffbb'));
          useBtn.on('pointerout',  () => useBtn.setColor('#44cc88'));
          useBtn.on('pointerdown', () => { this.useItem(item.id); this.closeOverlay(); this.openBagUI(); });
          c.add(useBtn);
        }
      });
    }

    c.add(this.add.text(W / 2, H - 12, 'B / ESC 关闭', {
      fontSize: '11px', fontFamily: 'Consolas', color: '#445566',
    }).setOrigin(0.5, 1));

    this.input.keyboard!.once('keydown-ESC', () => this.closeOverlay());
    this.input.keyboard!.once('keydown-B',   () => this.closeOverlay());
  }

  private useItem(id: string): void {
    const maxHp = this.getMaxHp();
    switch (id) {
      case 'first_aid':
        this.playerHp = Math.min(maxHp, this.playerHp + 5);
        this.showFloatingText('+5❤️', this.playerTileX * TILE_SIZE + TILE_SIZE / 2, (this.playerTileY - 1) * TILE_SIZE);
        break;
      case 'ration':
        this.healBank = Math.min(HEAL_BANK_MAX, this.healBank + 50);
        this.showFloatingText('+50💊', this.playerTileX * TILE_SIZE + TILE_SIZE / 2, (this.playerTileY - 1) * TILE_SIZE);
        break;
      case 'smoke_bomb':
        this.smokeStepsLeft = 3;
        this.showMessage('💨 烟雾弹！敌人 3 步内无法感应你', 2000);
        break;
      case 'speed_rune':
        this.speedRuneActive = true;
        this.showMessage('⚡ 加速符激活！移动间隔减半', 2000);
        break;
      case 'shield':
        this.shieldActive = true;
        this.showMessage('🛡 护盾激活！下次受伤免疫', 2000);
        break;
      case 'firepower_up':
        this.playerDamageBonus++;
        this.showMessage(`🔥 火力强化！攻击力 +1（当前 +${this.playerDamageBonus}）`, 2000);
        break;
      case 'max_hp_up':
        this.playerMaxHpBonus += 5;
        this.playerHp += 5;  // 立即恢复等量血量
        this.showMessage(`💖 最大血量 +5（当前上限 ${this.getMaxHp()}）`, 2000);
        break;
      case 'scout_jammer':
        this.scoutRadiusReduction++;
        this.showMessage(`📡 侦测压制！Scout 感应半径 -1（共 -${this.scoutRadiusReduction}）`, 2000);
        break;
    }
    // 扣除背包
    const item = this.inventory.find(i => i.id === id);
    if (item) {
      item.qty--;
      if (item.qty <= 0) this.inventory.splice(this.inventory.indexOf(item), 1);
    }
    this.updateHUD();
  }

  private closeOverlay(): void {
    if (this.overlayContainer) {
      this.overlayContainer.destroy(true);
      this.overlayContainer = null;
    }
    this.overlayOpen = false;
    // 清除可能残留的 ESC/F/B/G 监听
    this.input.keyboard?.removeAllListeners('keydown-ESC');
    this.input.keyboard?.removeAllListeners('keydown-F');
    this.input.keyboard?.removeAllListeners('keydown-B');
    this.input.keyboard?.removeAllListeners('keydown-G');
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
    const isCurrentAnchored =
      this.chunkManager.isHome(this.playerChunkX, this.playerChunkY) ||
      this.chunkManager.isAnchored(this.playerChunkX, this.playerChunkY);

    this.scene.launch('MapScene', {
      chunkManager: this.chunkManager,
      playerChunkX: this.playerChunkX,
      playerChunkY: this.playerChunkY,
      canTeleport: isCurrentAnchored,
      onTeleport: (cx: number, cy: number) => {
        this.playerTileX = MID;
        this.playerTileY = MID;
        this.loadChunk(cx, cy);
        this.syncPlayerSprite();
        this.showMessage(`传送至 (${cx}, ${cy})`, 1500);
      },
    });
    this.scene.pause();
  }

  private showStatus(): void {
    const chunk = this.currentChunk!;
    const collected = chunk.fragments.filter(f => f.collected).length;
    const total = chunk.fragments.length;
    const isHome = this.chunkManager.isHome(chunk.cx, chunk.cy);

    let s = `📍 区块 (${this.playerChunkX}, ${this.playerChunkY})\n`;
    const typeLabel = isHome ? '🏠 家园'
      : chunk.state === 'anchored' ? '🔒 已锚定'
      : chunk.chunkType === ChunkType.Shop ? '🏪 商店'
      : chunk.chunkType === ChunkType.Enemy ? '⚔️ 敌营'
      : '🌿 荒野';
    s += `状态: ${typeLabel}\n`;
    if (!isHome && chunk.state !== 'anchored' && chunk.chunkType === ChunkType.Wild) {
      s += `碎片: ${collected}/${total}  宝箱: ${chunk.chestOpened ? '已开启' : chunk.chestUnlocked ? '已解锁' : '锁定中'}\n`;
    } else if (!isHome && chunk.state !== 'anchored' && chunk.chunkType === ChunkType.Enemy) {
      const alive = chunk.enemies.filter(e => e.hp > 0).length;
      s += `敌人: ${alive}/${chunk.enemies.length}  宝箱: ${chunk.chestOpened ? '已开启' : chunk.chestUnlocked ? '已解锁' : '待清场'}\n`;
    }
    s += `生命: ${this.playerHp}/${this.getMaxHp()}\n`;
    s += `钥匙: ${this.playerKeys.length}  已锚定: ${this.chunkManager.getAnchoredCount()}`;
    const eqCount = [this.equipped.weapon, this.equipped.armor, this.equipped.trinket].filter(Boolean).length;
    if (eqCount > 0) s += `\n装备: ${eqCount}/3`;
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
    else if (chunk.chunkType === ChunkType.Shop) this.hudStatus.setText('🏪 商店');
    else if (chunk.chunkType === ChunkType.Enemy) this.hudStatus.setText('⚔️ 敌营');
    else this.hudStatus.setText('🌿 荒野');

    const healBankStr = isHome ? `  💊 ${this.healBank}/${HEAL_BANK_MAX}` : '';
    const anchorStr   = isHome ? `  |  🔒 ${this.chunkManager.getAnchoredCount()}` : '';
    this.hudKeys.setText(`🔑 ${this.playerKeys.length}${anchorStr}  |  ❤️ ${this.playerHp}/${this.getMaxHp()}${healBankStr}  |  🪙 ${this.playerCoins}`);

    if (!isHome && chunk.state !== 'anchored' && chunk.chunkType === ChunkType.Wild) {
      const c = chunk.fragments.filter(f => f.collected).length;
      const t = chunk.fragments.length;
      let chestLabel = '';
      if (chunk.chestOpened) chestLabel = '  📦 已开启';
      else if (chunk.chestUnlocked) chestLabel = '  📦✨ 已解锁!';
      this.hudFragments.setText(`✦ ${c}/${t}${chestLabel}`);
    } else if (!isHome && chunk.state !== 'anchored' && chunk.chunkType === ChunkType.Enemy) {
      const alive = chunk.enemies.filter(e => e.hp > 0).length;
      const total = chunk.enemies.length;
      const chestLabel = chunk.chestOpened ? ' 📦✅' : chunk.chestUnlocked ? ' 📦✨' : '';
      this.hudFragments.setText(total > 0 ? `⚔️ ${alive}/${total}${chestLabel}` : '');
    } else if (chunk.chunkType === ChunkType.Shop && chunk.state === 'anchored') {
      // 锚定商店：显示刷新倒计时
      const now = Date.now();
      if (chunk.shopPurchased && chunk.shopRefreshAt > now) {
        const secsLeft = Math.ceil((chunk.shopRefreshAt - now) / 1000);
        const mins = Math.floor(secsLeft / 60);
        const secs = secsLeft % 60;
        this.hudFragments.setText(`🏩 商店刷新: ${mins}:${secs.toString().padStart(2, '0')}`);
      } else if (!chunk.shopPurchased && chunk.shopOffers.length > 0) {
        this.hudFragments.setText('🏩 商店 — F 开始购物');
      } else {
        this.hudFragments.setText('🏩 商店');
      }
    } else {
      this.hudFragments.setText('');
    }

    let hint = 'WASD 移动';
    const canUseKey = !this.chunkManager.isAnchored(this.playerChunkX, this.playerChunkY)
                   && this.playerKeys.length > 0;
    if (canUseKey) hint += '  |  E 使用钥匙';
    hint += '  |  G 装备  |  M 地图  |  TAB 状态';
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

  private gainCoins(amount: number): void {
    this.playerCoins += amount;
    // 浮动文字显示在玩家上方
    const px = this.playerTileX * TILE_SIZE + TILE_SIZE / 2;
    const py = (this.playerTileY - 1) * TILE_SIZE;
    this.showFloatingText(`+${amount}🪙`, px, py);
    this.updateHUD();
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
   * EQUIPMENT — 词条计算 / 掉落 / 战斗辅助
   * ================================================================ */

  /** 汇总所有装备的词条数值 */
  private recalcEquipStats(): void {
    const s: Record<StatType, number> = { hp: 0, atk: 0, spd: 0, crit_rate: 0, crit_dmg: 0, dodge: 0 };
    for (const eq of [this.equipped.weapon, this.equipped.armor, this.equipped.trinket]) {
      if (!eq) continue;
      s[eq.mainStat.type] += eq.mainStat.value;
      for (const sub of eq.subStats) s[sub.type] += sub.value;
    }
    this.equipStats = s;
  }

  /** 计算玩家单次伤害（含暴击） */
  private calcPlayerDamage(): number {
    const base = 1 + this.playerDamageBonus + this.equipStats.atk;
    if (this.equipStats.crit_rate > 0 && Math.random() * 100 < this.equipStats.crit_rate) {
      const mult = 1.5 + this.equipStats.crit_dmg / 100;
      const dmg = Math.ceil(base * mult);
      this.showFloatingText('💥暴击!', this.playerTileX * TILE_SIZE + TILE_SIZE / 2, (this.playerTileY - 2) * TILE_SIZE);
      return dmg;
    }
    return base;
  }

  /** 步进冷却（毫秒） */
  private calcMoveCooldown(): number {
    let ms = GameScene.MOVE_STEP_MS;
    if (this.speedRuneActive) ms *= 0.5;
    if (this.equipStats.spd > 0) ms *= Math.max(0.3, 1 - this.equipStats.spd / 100);
    return ms;
  }

  /** 获得玩家最大 HP（基础 + 商店永久 + 装备） */
  private getMaxHp(): number {
    return PLAYER_MAX_HP + this.playerMaxHpBonus + this.equipStats.hp;
  }

  /** 击杀敌人时尝试掉落装备 */
  private tryEnemyEquipDrop(e: EnemyData): void {
    const dist = Math.abs(this.playerChunkX) + Math.abs(this.playerChunkY);
    const dropSeed = (this.currentChunk!.seed * 31 + e.x * 997 + e.y * 127) >>> 0;
    if (!EquipmentGenerator.shouldDrop(dropSeed, e.kind, dist)) return;
    const equip = EquipmentGenerator.generate(dropSeed ^ 0xbeef, dist, 'enemy_kill');
    this.receiveEquipment(equip);
  }

  /** 开宝箱时必定掉落一件装备 */
  private tryChestEquipDrop(cx: number, cy: number, source: string): void {
    const dist = Math.abs(cx) + Math.abs(cy);
    const seed = (this.currentChunk!.seed * 37 + cx * 131 + cy * 997) >>> 0;
    const equip = EquipmentGenerator.generate(seed, dist, source);
    this.receiveEquipment(equip);
  }

  /** 获得装备：加入背包或提示已满 */
  private receiveEquipment(equip: Equipment): void {
    const rarityColor = RARITY_COLORS[equip.rarity];
    const rarityName = RARITY_NAMES[equip.rarity];
    const statDef = STAT_DEFS[equip.mainStat.type];
    if (this.equipInventory.length >= EQUIP_INVENTORY_MAX) {
      this.showMessage(`装备背包已满(${EQUIP_INVENTORY_MAX})，无法拾取「${equip.name}」\nG 键打开装备栏整理`, 3000);
      return;
    }
    this.equipInventory.push(equip);
    this.showMessage(
      `获得装备: ${rarityName}「${equip.name}」\n${statDef.icon} ${statDef.name} +${equip.mainStat.value}${statDef.unit}` +
      (equip.subStats.length > 0 ? `  (+${equip.subStats.length}副词条)` : '') +
      '\nG 键打开装备栏',
      3000,
    );
  }

  /* ================================================================
   * EQUIPMENT UI  (G 键)
   * ================================================================ */

  private openEquipUI(): void {
    if (this.overlayOpen) { this.closeOverlay(); return; }
    this.overlayOpen = true;

    const W = 600, H = 500;
    const ox = (VIEWPORT_W - W) / 2, oy = Math.max(5, (VIEWPORT_H - H) / 2);
    const c = this.add.container(ox, oy).setDepth(300);
    this.overlayContainer = c;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1a, 0.96);
    bg.fillRoundedRect(0, 0, W, H, 10);
    bg.lineStyle(2, 0x6644cc, 1);
    bg.strokeRoundedRect(0, 0, W, H, 10);
    c.add(bg);

    c.add(this.add.text(W / 2, 12, '⚔️ 装备栏', {
      fontSize: '16px', fontFamily: '"Microsoft YaHei", sans-serif', color: '#ccbbff',
    }).setOrigin(0.5, 0));

    // 关闭
    const closeBtn = this.add.text(W - 10, 6, '✕', {
      fontSize: '18px', color: '#888888',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeOverlay());
    c.add(closeBtn);

    // ---- 已装备区（顶部3列） ----
    const slots: EquipSlot[] = ['weapon', 'armor', 'trinket'];
    const slotW = 180, slotH = 120, slotGap = 10;
    const slotStartX = (W - (slotW * 3 + slotGap * 2)) / 2;

    slots.forEach((slot, i) => {
      const sx = slotStartX + i * (slotW + slotGap);
      const sy = 40;
      const eq = this.equipped[slot];

      const slotBg = this.add.graphics();
      slotBg.fillStyle(eq ? 0x1a1a3a : 0x0e0e20, 1);
      slotBg.fillRoundedRect(sx, sy, slotW, slotH, 6);
      slotBg.lineStyle(1, eq ? parseInt(RARITY_COLORS[eq.rarity].replace('#', ''), 16) : 0x333355, 0.8);
      slotBg.strokeRoundedRect(sx, sy, slotW, slotH, 6);
      c.add(slotBg);

      c.add(this.add.text(sx + slotW / 2, sy + 8, SLOT_NAMES[slot], {
        fontSize: '11px', fontFamily: '"Microsoft YaHei"', color: '#667788',
      }).setOrigin(0.5, 0));

      if (eq) {
        c.add(this.add.text(sx + slotW / 2, sy + 26, eq.name, {
          fontSize: '14px', fontFamily: '"Microsoft YaHei"', color: RARITY_COLORS[eq.rarity],
        }).setOrigin(0.5, 0));
        this.renderStatLine(c, sx + 8, sy + 48, eq.mainStat, true);
        eq.subStats.forEach((sub, j) => {
          this.renderStatLine(c, sx + 8, sy + 66 + j * 16, sub, false);
        });
        // 卸下按钮
        const unequipBtn = this.add.text(sx + slotW - 6, sy + slotH - 6, '[卸下]', {
          fontSize: '11px', fontFamily: '"Microsoft YaHei"', color: '#cc6666',
        }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
        unequipBtn.on('pointerdown', () => {
          if (this.equipInventory.length >= EQUIP_INVENTORY_MAX) {
            this.showMessage('装备背包已满，无法卸下', 1500); return;
          }
          this.equipInventory.push(eq);
          this.equipped[slot] = null;
          this.recalcEquipStats();
          this.closeOverlay();
          this.openEquipUI();
        });
        c.add(unequipBtn);
      } else {
        c.add(this.add.text(sx + slotW / 2, sy + slotH / 2, '— 空 —', {
          fontSize: '13px', fontFamily: '"Microsoft YaHei"', color: '#333355',
        }).setOrigin(0.5));
      }
    });

    // ---- 词条汇总 ----
    const sumY = 170;
    const activeStats = (Object.keys(this.equipStats) as StatType[]).filter(k => this.equipStats[k] > 0);
    if (activeStats.length > 0) {
      let sumText = '总计: ';
      activeStats.forEach(k => {
        const d = STAT_DEFS[k];
        sumText += `${d.icon}+${this.equipStats[k]}${d.unit}  `;
      });
      c.add(this.add.text(W / 2, sumY, sumText, {
        fontSize: '11px', fontFamily: '"Microsoft YaHei", Consolas', color: '#8899bb',
      }).setOrigin(0.5, 0));
    }

    // ---- 装备背包 ----
    const listTop = 195;
    c.add(this.add.text(10, listTop, `背包 (${this.equipInventory.length}/${EQUIP_INVENTORY_MAX})`, {
      fontSize: '13px', fontFamily: '"Microsoft YaHei"', color: '#8899bb',
    }));

    const itemH = 42;
    const listH = H - listTop - 30;
    const maxVisible = Math.floor(listH / itemH);

    if (this.equipInventory.length === 0) {
      c.add(this.add.text(W / 2, listTop + 30, '没有装备', {
        fontSize: '13px', fontFamily: '"Microsoft YaHei"', color: '#334455',
      }).setOrigin(0.5, 0));
    } else {
      this.equipInventory.slice(0, maxVisible).forEach((eq, idx) => {
        const iy = listTop + 22 + idx * itemH;
        const rowBg = this.add.graphics();
        rowBg.fillStyle(0x121225, 1);
        rowBg.fillRoundedRect(8, iy, W - 16, itemH - 4, 4);
        c.add(rowBg);

        // 名称 + 稀有度颜色
        c.add(this.add.text(16, iy + 6, `${eq.name}`, {
          fontSize: '13px', fontFamily: '"Microsoft YaHei"', color: RARITY_COLORS[eq.rarity],
        }));

        // 槽位标签
        c.add(this.add.text(80, iy + 6, SLOT_NAMES[eq.slot], {
          fontSize: '11px', fontFamily: '"Microsoft YaHei"', color: '#556677',
        }));

        // 主词条
        const md = STAT_DEFS[eq.mainStat.type];
        c.add(this.add.text(120, iy + 6, `${md.icon}${md.name}+${eq.mainStat.value}${md.unit}`, {
          fontSize: '11px', fontFamily: '"Microsoft YaHei", Consolas', color: '#aabbdd',
        }));

        // 副词条简述
        if (eq.subStats.length > 0) {
          const subStr = eq.subStats.map(s => {
            const d = STAT_DEFS[s.type];
            return `${d.icon}+${s.value}${d.unit}`;
          }).join(' ');
          c.add(this.add.text(120, iy + 22, subStr, {
            fontSize: '10px', fontFamily: 'Consolas', color: '#667799',
          }));
        }

        // 装备按钮
        const equipBtn = this.add.text(W - 80, iy + itemH / 2 - 2, '[装备]', {
          fontSize: '12px', fontFamily: '"Microsoft YaHei"', color: '#44cc88',
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        equipBtn.on('pointerover', () => equipBtn.setColor('#88ffbb'));
        equipBtn.on('pointerout',  () => equipBtn.setColor('#44cc88'));
        equipBtn.on('pointerdown', () => {
          this.equipItem(idx);
          this.closeOverlay();
          this.openEquipUI();
        });
        c.add(equipBtn);

        // 丢弃按钮
        const discardBtn = this.add.text(W - 30, iy + itemH / 2 - 2, '[弃]', {
          fontSize: '11px', fontFamily: '"Microsoft YaHei"', color: '#886644',
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        discardBtn.on('pointerover', () => discardBtn.setColor('#cc8844'));
        discardBtn.on('pointerout',  () => discardBtn.setColor('#886644'));
        discardBtn.on('pointerdown', () => {
          this.equipInventory.splice(idx, 1);
          this.closeOverlay();
          this.openEquipUI();
        });
        c.add(discardBtn);
      });

      if (this.equipInventory.length > maxVisible) {
        c.add(this.add.text(W / 2, H - 25, `还有 ${this.equipInventory.length - maxVisible} 件未显示…`, {
          fontSize: '11px', fontFamily: '"Microsoft YaHei"', color: '#445566',
        }).setOrigin(0.5, 0));
      }
    }

    c.add(this.add.text(W / 2, H - 10, 'G / ESC 关闭', {
      fontSize: '11px', fontFamily: 'Consolas', color: '#445566',
    }).setOrigin(0.5, 1));

    this.input.keyboard!.once('keydown-ESC', () => this.closeOverlay());
    this.input.keyboard!.once('keydown-G',   () => this.closeOverlay());
  }

  /** 渲染一行词条 */
  private renderStatLine(
    c: Phaser.GameObjects.Container,
    x: number, y: number,
    stat: StatRoll, isMain: boolean,
  ): void {
    const d = STAT_DEFS[stat.type];
    const col = isMain ? '#ddeeff' : '#8899bb';
    const fs = isMain ? '12px' : '11px';
    c.add(this.add.text(x, y, `${d.icon} ${d.name} +${stat.value}${d.unit}`, {
      fontSize: fs, fontFamily: '"Microsoft YaHei", Consolas', color: col,
    }));
  }

  /** 装备背包中第 idx 件到对应槽位 */
  private equipItem(idx: number): void {
    const eq = this.equipInventory[idx];
    if (!eq) return;
    const prev = this.equipped[eq.slot];
    this.equipped[eq.slot] = eq;
    this.equipInventory.splice(idx, 1);
    if (prev) this.equipInventory.push(prev);
    this.recalcEquipStats();
    this.updateHUD();
  }

  /* ================================================================
   * SAVE
   * ================================================================ */

  private autoSave(): void {
    SaveManager.save({
      chunkX: this.playerChunkX,
      chunkY: this.playerChunkY,
      tileX:  this.playerTileX,
      tileY:  this.playerTileY,
      keys:   this.playerKeys,
      hp:     this.playerHp,
      healBank: this.healBank,
      coins:  this.playerCoins,
      inventory: this.inventory,
      playerDamageBonus: this.playerDamageBonus,
      playerMaxHpBonus:  this.playerMaxHpBonus,
      scoutRadiusReduction: this.scoutRadiusReduction,
      equipped: this.equipped,
      equipInventory: this.equipInventory,
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
