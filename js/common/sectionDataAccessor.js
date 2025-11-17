/**
 * @fileoverview 断面データアクセサー - 共通ユーティリティ
 *
 * このファイルは、様々なデータソース（ST-Bridge, JSON, IFC）から
 * 断面データを統一的に抽出するためのユーティリティ関数を提供します。
 *
 * 主な機能:
 * - 寸法データの抽出（ネスト構造対応）
 * - 複数のプロパティ名フォールバック
 * - 断面タイプの取得
 * - 円形/矩形断面の判定
 */

/**
 * 幅を表す可能性のあるプロパティ名（優先順位順）
 */
const WIDTH_KEYS = [
  "width",      // 標準
  "Width",      // ST-Bridge形式
  "WIDTH",      // 大文字形式
  "B",          // 鋼材形式（フランジ幅）
  "b",          // 小文字
  "outer_width", // 外側幅
  "overall_width", // 全幅
  "X",          // 座標系表記
  "x",          // 小文字
];

/**
 * 高さを表す可能性のあるプロパティ名（優先順位順）
 */
const HEIGHT_KEYS = [
  "height",     // 標準
  "Height",     // ST-Bridge形式
  "HEIGHT",     // 大文字形式
  "H",          // 鋼材形式（せい）
  "h",          // 小文字
  "depth",      // 梁用（せい）
  "Depth",      // 大文字開始
  "overall_depth", // 全せい
  "overall_height", // 全高
  "Y",          // 座標系表記
  "y",          // 小文字
  "A",          // 鋼材形式（せい）
  "a",          // 小文字
];

/**
 * 直径を表す可能性のあるプロパティ名
 */
const DIAMETER_KEYS = [
  "diameter",   // 標準
  "Diameter",   // 大文字開始
  "D",          // ST-Bridge形式
  "d",          // 小文字
];

/**
 * 肉厚を表す可能性のあるプロパティ名
 */
const THICKNESS_KEYS = [
  "thickness",  // 標準
  "Thickness",  // 大文字開始
  "t",          // 一般的な記号
  "T",          // 大文字
  "t1",         // ST-Bridge形式（ウェブ厚）
  "t2",         // ST-Bridge形式（フランジ厚）
];

/**
 * 断面データから寸法オブジェクトを取得
 * ネスト構造（sectionData.dimensions）と直接プロパティの両方に対応
 *
 * @param {Object} sectionData - 断面データ
 * @returns {Object} 寸法オブジェクト
 */
export function getDimensions(sectionData) {
  if (!sectionData) return {};

  // dimensions プロパティがあればそれを使用
  if (sectionData.dimensions && typeof sectionData.dimensions === "object") {
    return sectionData.dimensions;
  }

  // 直接プロパティとして持っている場合はそのまま返す
  return sectionData;
}

/**
 * 断面データから幅を取得
 * 複数のプロパティ名フォールバックに対応
 *
 * @param {Object} sectionData - 断面データ
 * @param {number} defaultValue - デフォルト値
 * @returns {number|undefined} 幅（mm単位）
 */
export function getWidth(sectionData, defaultValue = undefined) {
  const dims = getDimensions(sectionData);

  // width_X パターン（ST-Bridge RC断面）
  if (dims.width_X !== undefined) {
    const val = parseFloat(dims.width_X);
    if (isFinite(val)) return val;
  }

  // 標準的なプロパティ名を順に試す
  for (const key of WIDTH_KEYS) {
    if (dims[key] !== undefined) {
      const val = parseFloat(dims[key]);
      if (isFinite(val)) return val;
    }
  }

  return defaultValue;
}

/**
 * 断面データから高さを取得
 * 複数のプロパティ名フォールバックに対応
 *
 * @param {Object} sectionData - 断面データ
 * @param {number} defaultValue - デフォルト値
 * @returns {number|undefined} 高さ（mm単位）
 */
export function getHeight(sectionData, defaultValue = undefined) {
  const dims = getDimensions(sectionData);

  // width_Y パターン（ST-Bridge RC断面）
  if (dims.width_Y !== undefined) {
    const val = parseFloat(dims.width_Y);
    if (isFinite(val)) return val;
  }

  // 標準的なプロパティ名を順に試す
  for (const key of HEIGHT_KEYS) {
    if (dims[key] !== undefined) {
      const val = parseFloat(dims[key]);
      if (isFinite(val)) return val;
    }
  }

  return defaultValue;
}

/**
 * 断面データから直径を取得（円形断面用）
 *
 * @param {Object} sectionData - 断面データ
 * @param {number} defaultValue - デフォルト値
 * @returns {number|undefined} 直径（mm単位）
 */
export function getDiameter(sectionData, defaultValue = undefined) {
  const dims = getDimensions(sectionData);

  // 標準的なプロパティ名を順に試す
  for (const key of DIAMETER_KEYS) {
    if (dims[key] !== undefined) {
      const val = parseFloat(dims[key]);
      if (isFinite(val)) return val;
    }
  }

  return defaultValue;
}

/**
 * 断面データから半径を取得（円形断面用）
 * 直径から計算するか、直接radius値を取得
 *
 * @param {Object} sectionData - 断面データ
 * @param {number} defaultValue - デフォルト値
 * @returns {number|undefined} 半径（mm単位）
 */
export function getRadius(sectionData, defaultValue = undefined) {
  const dims = getDimensions(sectionData);

  // radius プロパティが直接ある場合
  if (dims.radius !== undefined) {
    const val = parseFloat(dims.radius);
    if (isFinite(val)) return val;
  }

  // 直径から計算
  const diameter = getDiameter(sectionData);
  if (diameter !== undefined) {
    return diameter / 2;
  }

  return defaultValue;
}

/**
 * 断面データから肉厚を取得
 *
 * @param {Object} sectionData - 断面データ
 * @param {number} defaultValue - デフォルト値
 * @returns {number|undefined} 肉厚（mm単位）
 */
export function getThickness(sectionData, defaultValue = undefined) {
  const dims = getDimensions(sectionData);

  // 標準的なプロパティ名を順に試す
  for (const key of THICKNESS_KEYS) {
    if (dims[key] !== undefined) {
      const val = parseFloat(dims[key]);
      if (isFinite(val)) return val;
    }
  }

  return defaultValue;
}

/**
 * 断面データから断面タイプを取得
 * 複数のプロパティ名フォールバックに対応
 *
 * @param {Object} sectionData - 断面データ
 * @param {string} defaultValue - デフォルト値
 * @returns {string|undefined} 断面タイプ
 */
export function getSectionType(sectionData, defaultValue = undefined) {
  if (!sectionData) return defaultValue;

  // 優先順位: section_type > profile_type > sectionType > profile_hint
  const type =
    sectionData.section_type ||
    sectionData.profile_type ||
    sectionData.sectionType ||
    sectionData.profile_hint; // フォールバック用ヒント（直接プロパティ）

  // 直接プロパティで見つからない場合、dimensions 内を確認
  if (!type && sectionData.dimensions) {
    return sectionData.dimensions.profile_hint || defaultValue;
  }

  return type || defaultValue;
}

/**
 * 円形断面かどうかを判定
 *
 * @param {Object} sectionData - 断面データ
 * @returns {boolean} 円形断面の場合true
 */
export function isCircularSection(sectionData) {
  const dims = getDimensions(sectionData);

  // profile_hint が CIRCLE の場合
  if (dims.profile_hint === "CIRCLE") {
    return true;
  }

  // section_type に CIRCLE, PIPE が含まれる場合
  const sectionType = getSectionType(sectionData, "").toUpperCase();
  if (sectionType.includes("CIRCLE") || sectionType.includes("PIPE")) {
    return true;
  }

  // 直径が定義されているが width/height が明示的でない場合
  const diameter = getDiameter(sectionData);
  if (diameter !== undefined) {
    // width や height が直径と同じ値の場合は円形と判定
    const width = dims.width || dims.Width || dims.B;
    const height = dims.height || dims.Height || dims.H || dims.depth;

    // width/height が未定義、または直径と同じ値の場合
    if (width === undefined && height === undefined) {
      return true;
    }
    if (width === diameter && height === diameter) {
      return true;
    }
  }

  return false;
}

/**
 * 矩形断面かどうかを判定
 *
 * @param {Object} sectionData - 断面データ
 * @returns {boolean} 矩形断面の場合true
 */
export function isRectangularSection(sectionData) {
  const dims = getDimensions(sectionData);

  // profile_hint が RECTANGLE の場合
  if (dims.profile_hint === "RECTANGLE") {
    return true;
  }

  // section_type に RECT が含まれる場合
  const sectionType = getSectionType(sectionData, "").toUpperCase();
  if (sectionType.includes("RECT")) {
    return true;
  }

  // 幅と高さが定義されていて、円形でない場合
  const width = getWidth(sectionData);
  const height = getHeight(sectionData);
  if (width !== undefined && height !== undefined && !isCircularSection(sectionData)) {
    return true;
  }

  return false;
}

/**
 * 断面データの検証
 * 必要な寸法データが揃っているかチェック
 *
 * @param {Object} sectionData - 断面データ
 * @returns {Object} 検証結果 { valid: boolean, errors: string[] }
 */
export function validateSectionData(sectionData) {
  const errors = [];

  if (!sectionData) {
    errors.push("Section data is null or undefined");
    return { valid: false, errors };
  }

  const dims = getDimensions(sectionData);

  // 円形断面の場合
  if (isCircularSection(sectionData)) {
    const diameter = getDiameter(sectionData);
    if (diameter === undefined) {
      errors.push("Circular section missing diameter");
    } else if (diameter <= 0) {
      errors.push("Circular section diameter must be positive");
    }
  }
  // 矩形断面の場合
  else {
    const width = getWidth(sectionData);
    const height = getHeight(sectionData);

    if (width === undefined && height === undefined) {
      errors.push("Section missing both width and height");
    }
    if (width !== undefined && width <= 0) {
      errors.push("Section width must be positive");
    }
    if (height !== undefined && height <= 0) {
      errors.push("Section height must be positive");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 断面データのデバッグ情報を取得
 *
 * @param {Object} sectionData - 断面データ
 * @returns {Object} デバッグ情報
 */
export function getDebugInfo(sectionData) {
  return {
    sectionType: getSectionType(sectionData),
    isCircular: isCircularSection(sectionData),
    isRectangular: isRectangularSection(sectionData),
    dimensions: {
      width: getWidth(sectionData),
      height: getHeight(sectionData),
      diameter: getDiameter(sectionData),
      radius: getRadius(sectionData),
      thickness: getThickness(sectionData),
    },
    rawDimensions: getDimensions(sectionData),
    validation: validateSectionData(sectionData),
  };
}
