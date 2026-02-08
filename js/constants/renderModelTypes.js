/**
 * RenderModel Types and Factory Functions
 *
 * このファイルは、描画層（viewer/）で使用されるデータ構造の型定義とファクトリー関数を提供します。
 * Layer 0（constants/）に配置することで、全レイヤーからアクセス可能にしています。
 *
 * 設計原則:
 * - 純粋なデータ構造とファクトリー関数のみ
 * - Three.js依存なし
 * - ビジネスロジックなし
 * - イミュータブルパターンを推奨
 *
 * @module constants/renderModelTypes
 */

// ============================================
// 型定義 (JSDoc)
// ============================================

/**
 * STB構造モデルの描画用データ
 * @typedef {Object} StbRenderModel
 * @property {RenderNode[]} nodes - 節点
 * @property {RenderColumn[]} columns - 柱
 * @property {RenderPost[]} posts - 間柱
 * @property {RenderGirder[]} girders - 大梁
 * @property {RenderBeam[]} beams - 小梁
 * @property {RenderBrace[]} braces - ブレース
 * @property {RenderSlab[]} slabs - スラブ
 * @property {RenderWall[]} walls - 壁
 * @property {RenderFooting[]} footings - 基礎
 * @property {RenderPile[]} piles - 杭
 * @property {RenderFoundationColumn[]} foundationColumns - 基礎柱
 * @property {RenderParapet[]} parapets - パラペット
 * @property {RenderStripFooting[]} stripFootings - 布基礎
 * @property {RenderJoint[]} joints - 継手
 * @property {RenderAxis[]} axes - 通り芯
 * @property {RenderStory[]} stories - 階情報
 * @property {RenderModelMeta} meta - メタ情報
 */

/**
 * モデルメタ情報
 * @typedef {Object} RenderModelMeta
 * @property {string} [fileName] - ファイル名
 * @property {string} [stbVersion] - STBバージョン
 * @property {RenderBoundingBox} [boundingBox] - バウンディングボックス
 */

/**
 * バウンディングボックス
 * @typedef {Object} RenderBoundingBox
 * @property {RenderPosition} min - 最小座標
 * @property {RenderPosition} max - 最大座標
 * @property {RenderPosition} center - 中心座標
 */

/**
 * 座標
 * @typedef {Object} RenderPosition
 * @property {number} x - X座標 (mm)
 * @property {number} y - Y座標 (mm)
 * @property {number} z - Z座標 (mm)
 */

/**
 * 要素描画スタイル
 * @typedef {Object} RenderElementStyle
 * @property {string} [color] - 色 (hex)
 * @property {number} [opacity] - 不透明度 (0-1)
 * @property {boolean} [wireframe] - ワイヤーフレーム表示
 * @property {boolean} [visible] - 表示/非表示
 */

// 再エクスポート用の型定義は viewer/types/ 側に残す

// ============================================
// ファクトリー関数
// ============================================

/**
 * 空のRenderModelを生成
 *
 * 使用例:
 * ```javascript
 * import { createEmptyRenderModel } from './constants/renderModelTypes.js';
 * const model = createEmptyRenderModel();
 * ```
 *
 * @returns {StbRenderModel}
 */
export function createEmptyRenderModel() {
  return {
    nodes: [],
    columns: [],
    posts: [],
    girders: [],
    beams: [],
    braces: [],
    slabs: [],
    walls: [],
    footings: [],
    piles: [],
    foundationColumns: [],
    parapets: [],
    stripFootings: [],
    joints: [],
    axes: [],
    stories: [],
    meta: {
      fileName: null,
      stbVersion: null,
      boundingBox: null,
    },
  };
}

/**
 * デフォルトのバウンディングボックスを生成
 *
 * @returns {RenderBoundingBox}
 */
export function createEmptyBoundingBox() {
  return {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0, y: 0, z: 0 },
    center: { x: 0, y: 0, z: 0 },
  };
}

/**
 * 座標オブジェクトを生成
 *
 * 使用例:
 * ```javascript
 * import { createPosition } from './constants/renderModelTypes.js';
 * const pos = createPosition(1000, 2000, 3000);
 * ```
 *
 * @param {number} x - X座標
 * @param {number} y - Y座標
 * @param {number} z - Z座標
 * @returns {RenderPosition}
 */
export function createPosition(x, y, z) {
  return { x, y, z };
}

/**
 * デフォルトの要素スタイルを生成
 *
 * @returns {RenderElementStyle}
 */
export function createDefaultStyle() {
  return {
    color: null,
    opacity: 1.0,
    wireframe: false,
    visible: true,
  };
}
