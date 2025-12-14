/**
 * @fileoverview 属性キー定義（単一ソース・オブ・トゥルース）
 *
 * ST-Bridge XML、JSON、IFCなど異なるデータソースで使用される
 * 属性名の正規化のための共通定義。
 *
 * このファイルは以下のモジュールで共有されます:
 * - sectionDataAccessor.js
 * - dimensionNormalizer.js
 * - その他の寸法データを扱うモジュール
 *
 * 設計思想:
 * - 配列の順序は優先順位を表す（先頭が最優先）
 * - より一般的/標準的な名前を先頭に配置
 * - ST-Bridge固有の命名規則も網羅
 *
 * @version 1.0.0
 * @created 2025-12
 */

/**
 * 幅を表す属性キーのリスト（優先順位順）
 *
 * 対応形式:
 * - 標準: width
 * - ST-Bridge: Width, B, width_X
 * - 鋼材: B (フランジ幅)
 * - その他: outer_width, overall_width, X
 *
 * @type {ReadonlyArray<string>}
 */
export const WIDTH_KEYS = Object.freeze([
  'width',        // 標準形式
  'Width',        // ST-Bridge形式
  'WIDTH',        // 大文字形式
  'B',            // 鋼材形式（フランジ幅）
  'b',            // 小文字
  'outer_width',  // 外側幅
  'overall_width', // 全幅
  'X',            // 座標系表記
  'x'             // 小文字
]);

/**
 * 高さ/せいを表す属性キーのリスト（優先順位順）
 *
 * 対応形式:
 * - 標準: height, depth
 * - ST-Bridge: Height, H, width_Y
 * - 梁用: depth, overall_depth
 * - 鋼材: H (せい), A
 *
 * 注意: depthとoverall_depthの優先順位について
 * - 梁などでは depth が「せい」を表す
 * - depth を overall_depth より先に配置
 *
 * @type {ReadonlyArray<string>}
 */
export const HEIGHT_KEYS = Object.freeze([
  'height',        // 標準形式
  'Height',        // ST-Bridge形式
  'HEIGHT',        // 大文字形式
  'H',             // 鋼材形式（せい）
  'h',             // 小文字
  'depth',         // 梁用（せい）
  'Depth',         // 大文字開始
  'overall_depth', // 全せい
  'overall_height', // 全高
  'Y',             // 座標系表記
  'y',             // 小文字
  'A',             // 鋼材形式（せい）
  'a'              // 小文字
]);

/**
 * 直径を表す属性キーのリスト（優先順位順）
 *
 * 対応形式:
 * - 標準: diameter
 * - ST-Bridge: D
 * - パイプ: outer_diameter
 *
 * @type {ReadonlyArray<string>}
 */
export const DIAMETER_KEYS = Object.freeze([
  'diameter',       // 標準形式
  'Diameter',       // 大文字開始
  'D',              // ST-Bridge形式
  'd',              // 小文字
  'outer_diameter'  // 外径（パイプなど）
]);

/**
 * 肉厚を表す属性キーのリスト（優先順位順）
 *
 * 対応形式:
 * - 標準: thickness
 * - ST-Bridge: t, t1, t2
 * - 詳細形式: wall_thickness, web_thickness, flange_thickness
 * - 鋼材記号: tw (ウェブ厚), tf (フランジ厚)
 *
 * @type {ReadonlyArray<string>}
 */
export const THICKNESS_KEYS = Object.freeze([
  'thickness',        // 標準形式
  'Thickness',        // 大文字開始
  't',                // 一般的な記号
  'T',                // 大文字
  't1',               // ST-Bridge形式（ウェブ厚）
  't2',               // ST-Bridge形式（フランジ厚）
  'wall_thickness',   // 壁厚（パイプなど）
  'web_thickness',    // ウェブ厚
  'flange_thickness', // フランジ厚
  'tw',               // ウェブ厚（鋼材記号）
  'tf'                // フランジ厚（鋼材記号）
]);

/**
 * 拡底杭固有の属性キーのリスト
 * STB形式の拡底杭（StbSecPile_RC_Extended*）で使用される属性
 *
 * @type {ReadonlyArray<string>}
 */
export const EXTENDED_PILE_KEYS = Object.freeze([
  'D_axial',                  // 軸部径
  'D_extended_foot',          // 根固め部（拡底部）径
  'D_extended_top',           // 頭部拡大径
  'length_extended_foot',     // 根固め部長さ
  'length_extended_top',      // 頭部拡大長さ（存在する場合）
  'angle_extended_foot_taper', // 根固め部テーパー角度
  'angle_extended_top_taper'   // 頭部テーパー角度
]);

/**
 * 断面タイプを表す属性キーのリスト（優先順位順）
 *
 * @type {ReadonlyArray<string>}
 */
export const SECTION_TYPE_KEYS = Object.freeze([
  'section_type',  // 標準形式
  'profile_type',  // プロファイル形式
  'sectionType',   // キャメルケース形式
  'profile_hint'   // ヒント形式（フォールバック）
]);

// ===== 後方互換性のためのエイリアス =====

/**
 * @deprecated WIDTH_KEYSを使用してください
 */
export const WIDTH_ATTR_KEYS = WIDTH_KEYS;

/**
 * @deprecated HEIGHT_KEYSを使用してください
 */
export const HEIGHT_ATTR_KEYS = HEIGHT_KEYS;

/**
 * @deprecated DIAMETER_KEYSを使用してください
 */
export const DIAMETER_ATTR_KEYS = DIAMETER_KEYS;

/**
 * @deprecated THICKNESS_KEYSを使用してください
 */
export const THICKNESS_ATTR_KEYS = THICKNESS_KEYS;

/**
 * @deprecated EXTENDED_PILE_KEYSを使用してください
 */
export const EXTENDED_PILE_ATTR_KEYS = EXTENDED_PILE_KEYS;
