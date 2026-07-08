/**
 * @fileoverview 鋼材断面の寸法正規化処理（テーブル駆動）
 *
 * shapeName ベースの断面データ（A/B/t1/t2 等の生属性）を
 * 解析用の正規化寸法（height/width/web_thickness 等）へ変換します。
 * 各断面種別の正規化ルールをテーブル化し、保守性とテスト容易性を向上。
 *
 * MatrixCalc の `common/stb/parser/dimension-normalizers.js` から
 * 統一計画フェーズ2で移植した追加API（SDV側は当面未使用）。
 * 属性マップベースの正規化は `dimensionNormalizer.js` を参照。
 *
 * @module common-stb/import/data/steelDimensionNormalizers
 */

/**
 * STBファイルで使用される生の寸法パラメータ名
 * @constant {string[]}
 */
export const RAW_DIMENSION_PARAMS = ['A', 'B', 'D', 't', 't1', 't2', 'r', 'r1', 'r2', 'H'];

/**
 * 鋼材断面種別ごとの寸法正規化テーブル
 * 各エントリは生の寸法パラメータから正規化された寸法プロパティへのマッピングを定義
 *
 * @constant {Object<string, Function>}
 */
export const STEEL_DIMENSION_NORMALIZERS = {
  /**
   * H形鋼の寸法正規化
   * @param {Object} rawDims - 生の寸法データ
   * @returns {Object} 正規化された寸法
   */
  H: (rawDims) => ({
    height: rawDims.A,
    width: rawDims.B,
    web_thickness: rawDims.t1,
    flange_thickness: rawDims.t2,
    fillet_radius: rawDims.r,
    profile_type: 'H',
  }),

  /**
   * 角形鋼管（BOX）の寸法正規化
   * @param {Object} rawDims - 生の寸法データ
   * @returns {Object} 正規化された寸法
   */
  BOX: (rawDims) => ({
    height: rawDims.A,
    width: rawDims.B,
    wall_thickness: rawDims.t,
    corner_radius: rawDims.r,
    profile_type: 'BOX',
  }),

  /**
   * 円形鋼管（PIPE）の寸法正規化
   * @param {Object} rawDims - 生の寸法データ
   * @returns {Object} 正規化された寸法
   */
  PIPE: (rawDims) => ({
    diameter: rawDims.D,
    outer_diameter: rawDims.D,
    height: rawDims.D,
    width: rawDims.D,
    wall_thickness: rawDims.t,
    profile_type: 'PIPE',
  }),

  /**
   * L形鋼（山形鋼）の寸法正規化
   * @param {Object} rawDims - 生の寸法データ
   * @returns {Object} 正規化された寸法
   */
  L: (rawDims) => ({
    leg1: rawDims.A,
    leg2: rawDims.B,
    height: rawDims.A,
    width: rawDims.B,
    thickness1: rawDims.t1,
    thickness2: rawDims.t2,
    profile_type: 'L',
  }),

  /**
   * C形鋼（溝形鋼）の寸法正規化
   * @param {Object} rawDims - 生の寸法データ
   * @returns {Object} 正規化された寸法
   */
  C: (rawDims) => ({
    height: rawDims.A,
    flange_width: rawDims.B,
    width: rawDims.B,
    web_thickness: rawDims.t1,
    flange_thickness: rawDims.t2,
    profile_type: 'C',
  }),

  /**
   * T形鋼の寸法正規化
   * @param {Object} rawDims - 生の寸法データ
   * @returns {Object} 正規化された寸法
   */
  T: (rawDims) => ({
    height: rawDims.H || rawDims.A,
    width: rawDims.B,
    web_thickness: rawDims.t1,
    flange_thickness: rawDims.t2,
    profile_type: 'T',
  }),
};

/**
 * 生の寸法データをセクションデータから抽出する（純粋関数）
 *
 * @param {Object} sectionData - STBファイルの断面データオブジェクト
 * @returns {Object} 抽出された生の寸法データ（数値に変換済み）
 *
 * @example
 * const data = { A: '250', B: 125, t1: '6', invalid: 'text' };
 * const raw = extractRawDimensions(data);
 * // → { A: 250, B: 125, t1: 6 }
 */
export function extractRawDimensions(sectionData) {
  const rawDims = {};

  for (const param of RAW_DIMENSION_PARAMS) {
    if (sectionData[param] !== undefined) {
      const value = sectionData[param];
      const numValue = typeof value === 'number' ? value : parseFloat(value);

      // NaNでない有効な数値のみ格納
      if (!isNaN(numValue)) {
        rawDims[param] = numValue;
      }
    }
  }

  return rawDims;
}

/**
 * マッピング関数を適用し、undefinedフィールドを除去する（純粋関数）
 *
 * @param {Object} rawDims - 生の寸法データ
 * @param {Function} normalizer - 寸法正規化関数
 * @returns {Object} マッピング適用後の寸法データ（undefinedフィールドを除外）
 *
 * @example
 * const rawDims = { A: 250, B: 125, t1: 6 };
 * const normalizer = STEEL_DIMENSION_NORMALIZERS.H;
 * const result = applyMappings(rawDims, normalizer);
 * // → { height: 250, width: 125, web_thickness: 6, profile_type: 'H' }
 * // (t2, rが未定義なのでflange_thickness, fillet_radiusは除外される)
 */
export function applyMappings(rawDims, normalizer) {
  const mapped = normalizer(rawDims);
  // undefinedフィールドを除外して新しいオブジェクトを生成
  return Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined));
}

/**
 * 未知の断面形状に対するデフォルト正規化（純粋関数）
 *
 * @param {Object} rawDims - 生の寸法データ
 * @returns {Object} デフォルト正規化された寸法データ
 *
 * @example
 * const rawDims = { A: 200, B: 150, D: 100 };
 * const result = normalizeUnknownShape(rawDims);
 * // → { diameter: 100, height: 100, width: 100 }
 * // (D優先、なければA/B)
 */
export function normalizeUnknownShape(rawDims) {
  const diameter = rawDims.D;

  if (diameter !== undefined) {
    // D（直径）が優先される
    return { diameter, height: diameter, width: diameter };
  }

  // D がない場合は A/B を使用
  return {
    ...(rawDims.A !== undefined && { height: rawDims.A }),
    ...(rawDims.B !== undefined && { width: rawDims.B }),
  };
}

/**
 * 鋼材断面の寸法情報をテーブル駆動で正規化する（純粋関数）
 *
 * @param {Object} sectionData - STBファイルの断面データオブジェクト
 * @param {string} kind - 断面種別 ('H', 'BOX', 'PIPE', 'L', 'C', 'T')
 * @returns {Object|null} 正規化された寸法オブジェクト、データなしの場合はnull
 *
 * @example
 * // H形鋼の正規化
 * const hSection = { A: 250, B: 125, t1: 6, t2: 9, r: 8 };
 * const result = normalizeSteelDimensions(hSection, 'H');
 * // → {
 * //   A: 250, B: 125, t1: 6, t2: 9, r: 8,
 * //   height: 250, width: 125, web_thickness: 6,
 * //   flange_thickness: 9, fillet_radius: 8, profile_type: 'H'
 * // }
 *
 * @example
 * // 未知の形状
 * const unknown = { A: 200, B: 150 };
 * const result = normalizeSteelDimensions(unknown, 'UNKNOWN');
 * // → { A: 200, B: 150, height: 200, width: 150 }
 *
 * @example
 * // データなし
 * const result = normalizeSteelDimensions(null, 'H');
 * // → null
 */
export function normalizeSteelDimensions(sectionData, kind) {
  if (!sectionData) return null;

  // Step 1: 生の寸法データを抽出
  const rawDims = extractRawDimensions(sectionData);

  // データが空の場合はnullを返す
  if (Object.keys(rawDims).length === 0) {
    return null;
  }

  // Step 2: 断面種別に応じた正規化を適用
  const normalizer = STEEL_DIMENSION_NORMALIZERS[kind];
  let normalizedDims;

  if (normalizer) {
    // 既知の形状: テーブルから正規化関数を取得して適用
    normalizedDims = applyMappings(rawDims, normalizer);
  } else {
    // 未知の形状: デフォルト正規化を適用
    normalizedDims = normalizeUnknownShape(rawDims);
  }

  // Step 3: 生の寸法データと正規化データをマージして返す
  return { ...rawDims, ...normalizedDims };
}
