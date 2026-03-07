# Wefter

一个基于 seed 驱动的俯视角迷宫探索游戏。世界持续变动，玩家通过收集、解放、锚定，在混沌中切出一片固定的领土。

## 技术栈

- [Phaser 3](https://phaser.io/) — 游戏引擎
- [TypeScript 5](https://www.typescriptlang.org/) — 类型安全
- [Vite 5](https://vitejs.dev/) — 构建工具

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:3000）
npm run dev

# 类型检查
npx tsc --noEmit

# 构建产物
npm run build
```

## 项目结构

```
src/
├── constants.ts          # 全局常量（格子大小、视口、颜色等）
├── types.ts              # 共享类型定义
├── main.ts               # 入口，Phaser 配置
├── utils/
│   └── LCG.ts            # 线性同余伪随机数生成器
├── systems/
│   ├── MazeGenerator.ts  # Randomized DFS 迷宫生成
│   ├── SeedProvider.ts   # Seed 管理，定时漂移模拟外部节点
│   ├── ChunkManager.ts   # 区块状态管理与持久化
│   └── SaveManager.ts    # localStorage 读写封装
└── scenes/
    ├── BootScene.ts       # 程序化纹理生成
    ├── GameScene.ts       # 主游戏场景
    ├── MapScene.ts        # 世界地图总览
    └── AnchorScene.ts     # 钥匙选择与锚定界面
```

## 操作说明

| 按键 | 功能 |
|------|------|
| `WASD` | 移动 |
| `E` | 使用地图钥匙锚定当前区块（持有钥匙且区块未锚定时可用） |
| `M` | 打开世界地图 |
| `Tab` | 查看当前状态 |
| `ESC` | 关闭弹出界面 |

## 存档

存档保存在浏览器 `localStorage` 中，清除浏览器数据会丢失进度。

- `weft_save_v2` — 玩家位置与持有的钥匙
- `weft_anchored_v2` — 已锚定区块的地图快照
