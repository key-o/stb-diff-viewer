/**
 * SchemaColorManager - スキーマエラー色管理
 *
 * スキーマチェック結果に基づく色を管理します。
 * 色定義は colorConfig.js から取得します。
 */

import { createColorManager } from './baseColorStateManager.js';
import { DEFAULT_SCHEMA_COLORS as CONFIG_SCHEMA_COLORS } from '../../config/colorConfig.js';

const { manager: schemaColorManager, defaults: DEFAULT_SCHEMA_COLORS } = createColorManager({
  colorConfig: CONFIG_SCHEMA_COLORS,
  managerName: 'SchemaColorManager',
  methodPrefix: 'Schema',
  fallbackKey: 'valid',
});

export { DEFAULT_SCHEMA_COLORS };
export default schemaColorManager;
