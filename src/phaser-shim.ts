// 运行时从 CDN 全局变量获取 Phaser，类型仍来自 npm 包
const Phaser = (window as any).Phaser as typeof import('phaser');
export default Phaser;
