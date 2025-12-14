import { createLogger, Logger } from '../utils/logger.js';

// 互換レイヤ: 既存コードが `AppLogger.getInstance(name)` を期待しているためラッパーを提供
export const AppLogger = {
  getInstance: (name) => createLogger(name),
  setLevel: (...args) => Logger.setLevel(...args),
  enable: (...args) => Logger.enable(...args),
  getLevel: () => Logger.getLevel(),
  getNamespaces: () => Logger.getNamespaces()
};

export default AppLogger;
