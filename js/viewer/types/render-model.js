/**
 * RenderModel - 描画層入力の型定義
 *
 * STB構造モデルを描画層が受け取る形式で定義します。
 * MatrixCalcの rendering/types/rendering-input.js と互換性を持つ設計です。
 *
 * 座標単位: mm（STBファイルと同じ）
 *
 * @module viewer/types/render-model
 */

// ============================================
// メイン型定義
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

// ============================================
// ファクトリ関数
// ============================================

/**
 * 空のRenderModelを生成
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
 * @returns {RenderBoundingBox}
 */
export function createEmptyBoundingBox() {
  return {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0, y: 0, z: 0 },
    center: { x: 0, y: 0, z: 0 },
  };
}
