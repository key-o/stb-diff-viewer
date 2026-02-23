/**
 * @fileoverview 差分表示モード
 *
 * モデルA/Bの差分を視覚的に表示するデフォルトの色付けモードを提供します。
 *
 * @module colorModes/diffColorMode
 */

import { createApplyColorMode } from './colorModeState.js';

/** 全要素に差分色分けを適用 */
export const applyDiffColorModeToAll = createApplyColorMode('DiffColorMode');
