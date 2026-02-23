/**
 * LoadColorManager - 荷重表示色管理
 *
 * 各荷重タイプ（等分布荷重、集中荷重など）の色を管理します。
 * 色定義は colorConfig.js から取得します。
 */

import { createColorManager } from './baseColorStateManager.js';
import { DEFAULT_LOAD_COLORS as CONFIG_LOAD_COLORS } from '../../config/colorConfig.js';

const { manager: loadColorManager, types: LOAD_TYPES } = createColorManager({
  colorConfig: CONFIG_LOAD_COLORS,
  managerName: 'LoadColorManager',
  methodPrefix: 'Load',
  fallbackKey: 'default',
});

export { LOAD_TYPES };
export default loadColorManager;
