/**
 * Adapters Layer Interface
 * レイヤー間データ変換の統一エクスポート
 *
 * このモジュールは、異なるレイヤー間のデータ変換を担当します。
 * - STBパース結果 → RenderModel（単一モデル用）
 * - 差分比較結果 → DiffRenderModel（差分ビューア用）
 *
 * @module adapters
 */

// ============================================
// STB → RenderModel（単一モデル用）
// ============================================

export { convertToRenderModel } from './stb-to-render-model.js';

// ============================================
// 比較結果 → DiffRenderModel（差分ビューア用）
// ============================================

export {
  convertToDiffRenderModel,
  createEmptyDiffRenderModel,
  getDiffStatistics,
} from './diff-to-render-model.js';

// ============================================
// ユーティリティ
// ============================================

export {
  createNodePositionMap,
  getNodePosition,
  calculateBoundingBox,
  getSectionById,
  convertToRenderSection,
  createDiffStatus,
} from './render-model-utils.js';
