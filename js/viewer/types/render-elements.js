/**
 * RenderElements - 描画用要素の型定義
 *
 * 各構造要素（柱、梁、スラブ等）の描画用データ形式を定義します。
 *
 * @module viewer/types/render-elements
 */

// ============================================
// 基本型
// ============================================

/**
 * 座標
 * @typedef {Object} RenderPosition
 * @property {number} x - X座標 (mm)
 * @property {number} y - Y座標 (mm)
 * @property {number} z - Z座標 (mm)
 */

/**
 * 描画用節点データ
 * @typedef {Object} RenderNode
 * @property {string} id - 節点ID
 * @property {number} x - X座標 (mm)
 * @property {number} y - Y座標 (mm)
 * @property {number} z - Z座標 (mm)
 */

// ============================================
// 線状要素
// ============================================

/**
 * 線状要素の基底型（柱、梁、ブレース等）
 * @typedef {Object} RenderLinearElement
 * @property {string} id - 要素ID
 * @property {string} name - 要素名
 * @property {string} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {string} kindStructure - 構造種別 ('RC'|'S'|'SRC'|'CFT')
 * @property {RenderSection} section - 断面情報
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用柱データ
 * @typedef {Object} RenderColumn
 * @property {string} id - 要素ID
 * @property {string} name - 要素名
 * @property {'Column'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID（下端）
 * @property {string} idNodeEnd - 終端節点ID（上端）
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {string} kindStructure - 構造種別
 * @property {number} rotate - 回転角度 (度)
 * @property {RenderSection} section - 断面情報
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用間柱データ
 * @typedef {Object} RenderPost
 * @property {string} id - 要素ID
 * @property {string} name - 要素名
 * @property {'Post'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {string} kindStructure - 構造種別
 * @property {number} rotate - 回転角度 (度)
 * @property {RenderSection} section - 断面情報
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用大梁データ
 * @typedef {Object} RenderGirder
 * @property {string} id - 要素ID
 * @property {string} name - 要素名
 * @property {'Girder'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {string} kindStructure - 構造種別
 * @property {boolean} isFoundation - 基礎梁かどうか
 * @property {RenderSection} section - 断面情報
 * @property {RenderHaunch} [haunchStart] - 始端ハンチ
 * @property {RenderHaunch} [haunchEnd] - 終端ハンチ
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用小梁データ
 * @typedef {Object} RenderBeam
 * @property {string} id - 要素ID
 * @property {string} name - 要素名
 * @property {'Beam'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {string} kindStructure - 構造種別
 * @property {RenderSection} section - 断面情報
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用ブレースデータ
 * @typedef {Object} RenderBrace
 * @property {string} id - 要素ID
 * @property {string} name - 要素名
 * @property {'Brace'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {string} kindStructure - 構造種別
 * @property {RenderSection} section - 断面情報
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用基礎柱データ
 * @typedef {Object} RenderFoundationColumn
 * @property {string} id - 要素ID
 * @property {string} name - 要素名
 * @property {'FoundationColumn'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {string} kindStructure - 構造種別
 * @property {number} rotate - 回転角度 (度)
 * @property {RenderSection} section - 断面情報
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * ハンチ情報
 * @typedef {Object} RenderHaunch
 * @property {number} width - 幅増分 (mm)
 * @property {number} height - 高さ増分 (mm)
 * @property {number} length - ハンチ長さ (mm)
 */

// ============================================
// 面状要素
// ============================================

/**
 * 描画用スラブデータ
 * @typedef {Object} RenderSlab
 * @property {string} id - スラブID
 * @property {string} name - スラブ名
 * @property {'Slab'} elementType - 要素タイプ
 * @property {string[]} nodeIds - 頂点節点ID配列（順序付き）
 * @property {RenderPosition[]} vertices - 頂点座標配列 (mm)
 * @property {number} thickness - 厚さ (mm)
 * @property {number} level - レベル高さ (mm)
 * @property {RenderOpening[]} [openings] - 開口
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用壁データ
 * @typedef {Object} RenderWall
 * @property {string} id - 壁ID
 * @property {string} name - 壁名
 * @property {'Wall'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {number} thickness - 厚さ (mm)
 * @property {number} bottomLevel - 下端レベル (mm)
 * @property {number} topLevel - 上端レベル (mm)
 * @property {RenderOpening[]} [openings] - 開口
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用パラペットデータ
 * @typedef {Object} RenderParapet
 * @property {string} id - パラペットID
 * @property {string} name - パラペット名
 * @property {'Parapet'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {number} thickness - 厚さ (mm)
 * @property {number} height - 高さ (mm)
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 開口情報
 * @typedef {Object} RenderOpening
 * @property {string} id - 開口ID
 * @property {string[]} nodeIds - 頂点節点ID配列
 * @property {RenderPosition[]} vertices - 頂点座標配列 (mm)
 */

// ============================================
// 基礎要素
// ============================================

/**
 * 描画用基礎データ
 * @typedef {Object} RenderFooting
 * @property {string} id - 基礎ID
 * @property {string} name - 基礎名
 * @property {'Footing'} elementType - 要素タイプ
 * @property {string} idNode - 節点ID
 * @property {RenderPosition} position - 位置座標 (mm)
 * @property {number} width - 幅X (mm)
 * @property {number} length - 長さY (mm)
 * @property {number} thickness - 厚さ (mm)
 * @property {number} rotate - 回転角度 (度)
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用杭データ
 * @typedef {Object} RenderPile
 * @property {string} id - 杭ID
 * @property {string} name - 杭名
 * @property {'Pile'} elementType - 要素タイプ
 * @property {string} idNode - 節点ID
 * @property {RenderPosition} position - 位置座標 (mm)
 * @property {number} diameter - 直径 (mm)
 * @property {number} length - 長さ (mm)
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

/**
 * 描画用布基礎データ
 * @typedef {Object} RenderStripFooting
 * @property {string} id - 布基礎ID
 * @property {string} name - 布基礎名
 * @property {'StripFooting'} elementType - 要素タイプ
 * @property {string} idNodeStart - 始端節点ID
 * @property {string} idNodeEnd - 終端節点ID
 * @property {RenderPosition} startPos - 始端座標 (mm)
 * @property {RenderPosition} endPos - 終端座標 (mm)
 * @property {number} width - 幅 (mm)
 * @property {number} thickness - 厚さ (mm)
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

// ============================================
// 継手
// ============================================

/**
 * 描画用継手データ
 * @typedef {Object} RenderJoint
 * @property {string} id - 継手ID
 * @property {string} name - 継手名
 * @property {'Joint'} elementType - 要素タイプ
 * @property {string} jointType - 継手タイプ ('BeamShapeH'|'ColumnShapeH'|'BeamShapeBox'等)
 * @property {string} idNode - 節点ID
 * @property {RenderPosition} position - 位置座標 (mm)
 * @property {string} kindJoint - 接合種別 ('WELD'|'BOLT'等)
 * @property {RenderSection} [section] - 断面情報
 * @property {RenderElementStyle} [style] - スタイル設定
 * @property {RenderDiffStatus} [diffStatus] - 差分ステータス
 */

// ============================================
// 断面情報
// ============================================

/**
 * 断面情報
 * @typedef {Object} RenderSection
 * @property {string} id - 断面ID
 * @property {string} name - 断面名
 * @property {string} shape - 形状タイプ ('RECTANGLE'|'CIRCLE'|'H'|'BOX'|'PIPE'|'L'|'T'|'C')
 * @property {RenderDimensions} dimensions - 寸法
 * @property {RenderSteelShape} [steelShape] - 鋼材形状（S造の場合）
 */

/**
 * 寸法情報
 * @typedef {Object} RenderDimensions
 * @property {number} [width] - 幅 (mm)
 * @property {number} [height] - 高さ/せい (mm)
 * @property {number} [depth] - 奥行き (mm)
 * @property {number} [diameter] - 直径 (mm)
 * @property {number} [thickness] - 厚さ (mm)
 * @property {number} [flangeWidth] - フランジ幅 (mm)
 * @property {number} [flangeThickness] - フランジ厚 (mm)
 * @property {number} [webThickness] - ウェブ厚 (mm)
 */

/**
 * 鋼材形状情報
 * @typedef {Object} RenderSteelShape
 * @property {string} shapeName - 形状名 (例: 'H-400x200x8x13')
 * @property {string} type - 形状タイプ ('H'|'BOX'|'PIPE'|'L'|'C'|'T')
 * @property {RenderDimensions} dimensions - 寸法
 */

// ============================================
// 通り芯・階情報
// ============================================

/**
 * 描画用通り芯データ
 * @typedef {Object} RenderAxis
 * @property {string} id - 通り芯ID
 * @property {string} name - 通り芯名
 * @property {'X'|'Y'} direction - 方向
 * @property {number} position - 位置 (mm)
 */

/**
 * 描画用階情報データ
 * @typedef {Object} RenderStory
 * @property {string} id - 階ID
 * @property {string} name - 階名
 * @property {number} height - 階高 (mm)
 * @property {number} level - レベル (mm)
 */

// ============================================
// スタイル・差分
// ============================================

/**
 * 要素描画スタイル
 * @typedef {Object} RenderElementStyle
 * @property {string} [color] - 色 (hex)
 * @property {number} [opacity] - 不透明度 (0-1)
 * @property {boolean} [wireframe] - ワイヤーフレーム表示
 * @property {boolean} [visible] - 表示/非表示
 */

/**
 * 差分ステータス
 * @typedef {Object} RenderDiffStatus
 * @property {'added'|'removed'|'modified'|'unchanged'} status - 差分状態
 * @property {'modelA'|'modelB'} [source] - ソース
 * @property {Object} [changes] - 変更詳細
 */

// ============================================
// ファクトリー関数について
// ============================================

/**
 * 注意: ファクトリー関数は constants/renderModelTypes.js に移動されました。
 *
 * 使用例:
 * ```javascript
 * // 直接インポート（推奨：data/層から使用する場合）
 * import { createPosition, createDefaultStyle } from '../../constants/renderModelTypes.js';
 *
 * // viewer/types/index.js経由（viewer/内で使用する場合）
 * import { createPosition, createDefaultStyle } from './viewer/types/index.js';
 * ```
 *
 * 利用可能なファクトリー関数:
 * - createPosition(x, y, z): 座標オブジェクトを生成
 * - createDefaultStyle(): デフォルトの要素スタイルを生成
 */
