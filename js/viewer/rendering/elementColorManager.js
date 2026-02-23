/**
 * ElementColorManager - 部材別色管理
 *
 * 各要素タイプ（柱、梁、壁など）の色を管理します。
 * 色定義は colorConfig.js から取得します。
 */

import { createColorManager } from './baseColorStateManager.js';
import { DEFAULT_ELEMENT_COLORS as CONFIG_ELEMENT_COLORS } from '../../config/colorConfig.js';

const {
  manager: elementColorManager,
  types: ELEMENT_TYPES,
  defaults: DEFAULT_ELEMENT_COLORS,
} = createColorManager({
  colorConfig: CONFIG_ELEMENT_COLORS,
  managerName: 'ElementColorManager',
  methodPrefix: 'Element',
});

export { ELEMENT_TYPES, DEFAULT_ELEMENT_COLORS };
export default elementColorManager;
