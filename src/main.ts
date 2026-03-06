import Phaser from 'phaser';
import { VIEWPORT_W, VIEWPORT_H } from './constants';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MapScene } from './scenes/MapScene';
import { AnchorScene } from './scenes/AnchorScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: VIEWPORT_W,
  height: VIEWPORT_H,
  parent: 'game-container',
  backgroundColor: '#0a0a12',
  pixelArt: true,
  scene: [BootScene, GameScene, MapScene, AnchorScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);

// 阻止 Tab 键焦点切换
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') e.preventDefault();
});
