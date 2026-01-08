/**
 * Viewer Types - 描画層型定義の統一エクスポート
 *
 * 描画層が受け取るデータ形式の型定義を提供します。
 * 他のレイヤーからはこのindex.jsを経由してインポートしてください。
 *
 * @example
 * // 推奨: index.js経由のインポート
 * import { createEmptyRenderModel, createPosition } from './viewer/types/index.js';
 *
 * @module viewer/types
 */

// ============================================
// RenderModel（メイン型）
// ============================================

export { createEmptyRenderModel, createEmptyBoundingBox } from './render-model.js';

// ============================================
// 要素型・ファクトリ関数
// ============================================

export { createDefaultStyle, createPosition } from './render-elements.js';

// ============================================
// 型定義の再エクスポート（JSDoc用）
// ============================================

/**
 * @typedef {import('./render-model.js').StbRenderModel} StbRenderModel
 * @typedef {import('./render-model.js').RenderModelMeta} RenderModelMeta
 * @typedef {import('./render-model.js').RenderBoundingBox} RenderBoundingBox
 *
 * @typedef {import('./render-elements.js').RenderPosition} RenderPosition
 * @typedef {import('./render-elements.js').RenderNode} RenderNode
 * @typedef {import('./render-elements.js').RenderLinearElement} RenderLinearElement
 * @typedef {import('./render-elements.js').RenderColumn} RenderColumn
 * @typedef {import('./render-elements.js').RenderPost} RenderPost
 * @typedef {import('./render-elements.js').RenderGirder} RenderGirder
 * @typedef {import('./render-elements.js').RenderBeam} RenderBeam
 * @typedef {import('./render-elements.js').RenderBrace} RenderBrace
 * @typedef {import('./render-elements.js').RenderFoundationColumn} RenderFoundationColumn
 * @typedef {import('./render-elements.js').RenderSlab} RenderSlab
 * @typedef {import('./render-elements.js').RenderWall} RenderWall
 * @typedef {import('./render-elements.js').RenderParapet} RenderParapet
 * @typedef {import('./render-elements.js').RenderFooting} RenderFooting
 * @typedef {import('./render-elements.js').RenderPile} RenderPile
 * @typedef {import('./render-elements.js').RenderStripFooting} RenderStripFooting
 * @typedef {import('./render-elements.js').RenderJoint} RenderJoint
 * @typedef {import('./render-elements.js').RenderOpening} RenderOpening
 * @typedef {import('./render-elements.js').RenderHaunch} RenderHaunch
 * @typedef {import('./render-elements.js').RenderSection} RenderSection
 * @typedef {import('./render-elements.js').RenderDimensions} RenderDimensions
 * @typedef {import('./render-elements.js').RenderSteelShape} RenderSteelShape
 * @typedef {import('./render-elements.js').RenderAxis} RenderAxis
 * @typedef {import('./render-elements.js').RenderStory} RenderStory
 * @typedef {import('./render-elements.js').RenderElementStyle} RenderElementStyle
 * @typedef {import('./render-elements.js').RenderDiffStatus} RenderDiffStatus
 */
