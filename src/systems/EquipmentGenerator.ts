import { LCG } from '../utils/LCG';
import type { Equipment, StatRoll } from '../types';
import type { StatType, EquipSlot } from '../constants';
import { SLOT_MAIN_STATS, MAIN_STAT_RANGES, SUB_STAT_RANGES } from '../constants';

const ALL_STATS: StatType[] = ['hp', 'atk', 'spd', 'crit_rate', 'crit_dmg', 'dodge'];
const ALL_SLOTS: EquipSlot[] = ['weapon', 'armor', 'trinket'];

const WEAPON_NAMES  = ['短刃', '铁剑', '匕首', '弯刀', '长矛', '战锤'];
const ARMOR_NAMES   = ['布甲', '皮甲', '锁甲', '铁胸甲', '风衣', '斗篷'];
const TRINKET_NAMES = ['护符', '指环', '徽章', '挂坠', '腰带', '臂章'];
const NAME_MAP: Record<EquipSlot, string[]> = {
  weapon: WEAPON_NAMES, armor: ARMOR_NAMES, trinket: TRINKET_NAMES,
};

export class EquipmentGenerator {
  /**
   * 生成一件装备，完全由 seed 决定
   * @param seed      随机种子
   * @param distance  区块离 (0,0) 的曼哈顿距离
   * @param source    掉落来源 'enemy_kill' | 'enemy_chest' | 'wild_chest' | 'shop'
   */
  static generate(seed: number, distance: number, source: string): Equipment {
    const rng = new LCG(seed);
    const slot = ALL_SLOTS[rng.int(0, ALL_SLOTS.length - 1)];
    const rarity = this.rollRarity(rng, distance, source);
    return this.build(rng, slot, rarity);
  }

  /** 为指定槽位生成（商店、特殊掉落用） */
  static generateForSlot(seed: number, slot: EquipSlot, distance: number, source: string): Equipment {
    const rng = new LCG(seed);
    const rarity = this.rollRarity(rng, distance, source);
    return this.build(rng, slot, rarity);
  }

  /** 击杀敌人是否掉落装备 */
  static shouldDrop(seed: number, enemyKind: string, distance: number): boolean {
    const rng = new LCG(seed);
    const base = enemyKind === 'scout' ? 0.05 : enemyKind === 'sniper' ? 0.25 : 0.15;
    const bonus = Math.min(distance * 0.01, 0.15);
    return rng.float() < base + bonus;
  }

  // ------------------------------------------------------------------

  private static rollRarity(rng: LCG, distance: number, source: string): 0 | 1 | 2 {
    const roll = rng.float();
    const db = Math.min(distance * 0.02, 0.3);

    let epic: number, rare: number;
    switch (source) {
      case 'enemy_chest': epic = 0.15 + db;       rare = 0.55;         break;
      case 'enemy_kill':  epic = 0.03 + db * 0.5;  rare = 0.25 + db;   break;
      case 'wild_chest':  epic = 0.05 + db * 0.5;  rare = 0.35 + db;   break;
      case 'shop':        epic = 0.20 + db;        rare = 0.60;         break;
      default:            epic = 0.05;              rare = 0.30;
    }
    if (roll < epic) return 2;
    if (roll < epic + rare) return 1;
    return 0;
  }

  private static build(rng: LCG, slot: EquipSlot, rarity: 0 | 1 | 2): Equipment {
    // 主词条
    const mainPool = SLOT_MAIN_STATS[slot];
    const mainType = mainPool[rng.int(0, mainPool.length - 1)];
    const mr = MAIN_STAT_RANGES[mainType][rarity];
    const mainStat: StatRoll = { type: mainType, value: rng.int(mr[0], mr[1]) };

    // 副词条
    const subCount = rarity === 0 ? 0 : rarity === 2 ? 3 : rng.int(1, 2);
    const subPool = ALL_STATS.filter(s => s !== mainType);
    rng.shuffle(subPool);
    const subStats: StatRoll[] = [];
    for (let i = 0; i < subCount && i < subPool.length; i++) {
      const st = subPool[i];
      const sr = SUB_STAT_RANGES[st][rarity];
      subStats.push({ type: st, value: rng.int(sr[0], sr[1]) });
    }

    const names = NAME_MAP[slot];
    const name = names[rng.int(0, names.length - 1)];
    const id = `eq_${rng.next().toString(36)}_${rng.next().toString(36)}`;

    return { id, name, slot, rarity: rarity as 0 | 1 | 2, mainStat, subStats, obtainedAt: Date.now() };
  }
}
