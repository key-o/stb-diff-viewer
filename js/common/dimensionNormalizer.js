/**
 * @fileoverview 寸法データ正規化ユーティリティ
 *
 * ST-Bridge XML、JSON、IFCなど異なるデータソースから取得される
 * 寸法データを統一的な形式に正規化するための共通機能を提供します。
 *
 * 主な機能:
 * - 様々な命名規則（width/Width/B/outer_width等）の統一
 * - 属性マップ（NamedNodeMap等）からの寸法抽出
 * - 円形/矩形断面の自動判定
 * - 直径から半径の自動計算
 *
 * 属性キー定義は attributeKeys.js に統一されています。
 */

import {
  WIDTH_KEYS,
  HEIGHT_KEYS,
  DIAMETER_KEYS,
  THICKNESS_KEYS,
  EXTENDED_PILE_KEYS,
  // 後方互換性のためのエイリアスを再エクスポート
  WIDTH_ATTR_KEYS,
  HEIGHT_ATTR_KEYS,
  DIAMETER_ATTR_KEYS,
  THICKNESS_ATTR_KEYS,
  EXTENDED_PILE_ATTR_KEYS
} from './attributeKeys.js';

// 後方互換性のため、既存のエクスポート名を維持
export {
  WIDTH_ATTR_KEYS,
  HEIGHT_ATTR_KEYS,
  DIAMETER_ATTR_KEYS,
  THICKNESS_ATTR_KEYS,
  EXTENDED_PILE_ATTR_KEYS
};

/**
 * 属性マップから寸法データを抽出し、正規化された形式で返す
 *
 * @param {NamedNodeMap|Object} attrMap - 属性マップ（XML要素のattributes等）
 * @returns {Object|null} 正規化された寸法データ、または抽出失敗時はnull
 *
 * @example
 * // XML要素から抽出
 * const element = xmlDoc.querySelector('StbSecColumn_RC');
 * const dimensions = deriveDimensionsFromAttributes(element.attributes);
 * // => { width: 600, height: 600, overall_width: 600, overall_depth: 600 }
 *
 * @example
 * // 円形断面
 * const circleDims = deriveDimensionsFromAttributes({ D: "400" });
 * // => { width: 400, height: 400, diameter: 400, radius: 200, profile_hint: "CIRCLE" }
 */
export function deriveDimensionsFromAttributes(attrMap) {
  if (!attrMap) return null;

  let w, h, t, length_pile_local, D_local;
  let hasExplicitWidth = false;
  let hasExplicitHeight = false;

  // 拡底杭属性を格納するオブジェクト
  const extendedPileAttrs = {};

  // 属性マップを配列に変換（NamedNodeMapとObjectの両方に対応）
  let attributes;
  if (Array.isArray(attrMap)) {
    attributes = attrMap;
  } else if (typeof NamedNodeMap !== 'undefined' && attrMap instanceof NamedNodeMap) {
    // ブラウザ環境でのNamedNodeMap対応
    attributes = Array.from(attrMap);
  } else if (typeof attrMap.length === 'number' && attrMap.length > 0) {
    // NamedNodeMap-like オブジェクト（JSDOMなど）
    attributes = [];
    for (let i = 0; i < attrMap.length; i++) {
      attributes.push(attrMap[i]);
    }
  } else {
    // 通常のオブジェクトの場合
    attributes = Object.entries(attrMap).map(([name, value]) => ({ name, value }));
  }

  for (const attr of attributes) {
    const name = attr.name;
    const valStr = typeof attr.value === 'string' ? attr.value : String(attr.value);
    if (!valStr) continue;

    const num = parseFloat(valStr);
    if (!isFinite(num)) continue;

    // 幅の抽出（厳密一致 + パターンマッチング）
    if (w === undefined) {
      if (WIDTH_KEYS.includes(name)) {
        w = num;
        hasExplicitWidth = true;
      } else if (/^width_?X$/i.test(name)) {
        w = num;
        hasExplicitWidth = true;
      }
    }

    // 高さの抽出（厳密一致 + パターンマッチング）
    if (h === undefined) {
      if (HEIGHT_KEYS.includes(name)) {
        h = num;
        hasExplicitHeight = true;
      } else if (/^width_?Y$/i.test(name)) {
        h = num;
        hasExplicitHeight = true;
      }
    }

    // 円形断面の直径（D）の特別処理
    if (name === 'D' || name === 'd') {
      // 直径は width/height としても扱うが、後続で直径としても利用
      if (w === undefined) w = num;
      if (h === undefined) h = num;
      D_local = num;
    }

    // 肉厚の抽出
    if (
      t === undefined &&
      (name === 't' || name === 'thickness' || name === 't1')
    ) {
      t = num;
    }

    // 杭の長さ（Pile-specific attribute）
    if (name === 'length_pile') {
      length_pile_local = num;
    }

    // 拡底杭固有属性の抽出
    if (EXTENDED_PILE_KEYS.includes(name)) {
      extendedPileAttrs[name] = num;
    }
  }

  // 拡底杭の場合、D_axialを主要な直径として扱う
  const hasExtendedPileAttrs = Object.keys(extendedPileAttrs).length > 0;
  if (hasExtendedPileAttrs && extendedPileAttrs.D_axial) {
    // 拡底杭の軸部径を基本直径として設定
    if (D_local === undefined) {
      D_local = extendedPileAttrs.D_axial;
      if (w === undefined) w = extendedPileAttrs.D_axial;
      if (h === undefined) h = extendedPileAttrs.D_axial;
    }
  }

  // 寸法データが何も見つからない場合はnullを返す
  if (w === undefined && h === undefined && length_pile_local === undefined && !hasExtendedPileAttrs) {
    return null;
  }

  // 正規化された寸法オブジェクトの構築
  const out = {};

  if (w !== undefined) out.width = w;
  if (h !== undefined) out.height = h;
  if (t !== undefined) out.thickness = t;

  // 互換性のための追加フィールド
  if (out.height && !out.overall_depth) out.overall_depth = out.height;
  if (out.width && !out.overall_width) out.overall_width = out.width;

  // 円形断面の処理
  if (typeof D_local === 'number') {
    out.diameter = D_local;
    out.D = D_local; // 互換性のため
    out.radius = D_local / 2; // プロファイル生成用に半径を計算

    // D が設定されているが明示的な width/height が見つからない場合は円形
    if (!hasExplicitWidth && !hasExplicitHeight) {
      out.profile_hint = 'CIRCLE';
    }
  }

  // 杭の長さ
  if (typeof length_pile_local === 'number') {
    out.length_pile = length_pile_local;
  }

  // 拡底杭固有属性をマージ
  if (hasExtendedPileAttrs) {
    Object.assign(out, extendedPileAttrs);

    // 拡底杭タイプの判定とprofile_hintの設定
    if (extendedPileAttrs.D_extended_foot && extendedPileAttrs.D_extended_top) {
      out.pile_type = 'ExtendedTopFoot';  // 頭部・根固め部拡大杭
      out.profile_hint = 'EXTENDED_PILE';
    } else if (extendedPileAttrs.D_extended_foot) {
      out.pile_type = 'ExtendedFoot';      // 根固め部拡大杭
      out.profile_hint = 'EXTENDED_PILE';
    } else if (extendedPileAttrs.D_extended_top) {
      out.pile_type = 'ExtendedTop';       // 頭部拡大杭
      out.profile_hint = 'EXTENDED_PILE';
    }
  }

  return out;
}

/**
 * オブジェクトまたはネストされた dimensions から寸法を抽出
 *
 * @param {Object} sectionData - 断面データ（dimensions プロパティを持つ可能性がある）
 * @returns {Object} 正規化された寸法オブジェクト
 *
 * @example
 * // ネスト構造
 * const dims1 = extractDimensions({ dimensions: { width: 200, height: 500 } });
 * // => { width: 200, height: 500 }
 *
 * @example
 * // 直接プロパティ
 * const dims2 = extractDimensions({ width: 200, height: 500 });
 * // => { width: 200, height: 500 }
 */
export function extractDimensions(sectionData) {
  if (!sectionData) return {};

  // dimensions プロパティがあればそれを優先
  if (sectionData.dimensions && typeof sectionData.dimensions === 'object') {
    return sectionData.dimensions;
  }

  // 直接プロパティとして持っている場合はそのまま返す
  return sectionData;
}

/**
 * 寸法データから幅を取得（複数の命名規則に対応）
 *
 * @param {Object} dimensions - 寸法データ
 * @param {number} defaultValue - デフォルト値（見つからない場合）
 * @returns {number|undefined} 幅の値
 */
export function getWidth(dimensions, defaultValue = undefined) {
  if (!dimensions) return defaultValue;

  for (const key of WIDTH_KEYS) {
    if (dimensions[key] !== undefined && dimensions[key] !== null) {
      return dimensions[key];
    }
  }

  // width_X パターンも確認
  if (dimensions.width_X !== undefined) return dimensions.width_X;

  return defaultValue;
}

/**
 * 寸法データから高さを取得（複数の命名規則に対応）
 *
 * @param {Object} dimensions - 寸法データ
 * @param {number} defaultValue - デフォルト値（見つからない場合）
 * @returns {number|undefined} 高さの値
 */
export function getHeight(dimensions, defaultValue = undefined) {
  if (!dimensions) return defaultValue;

  for (const key of HEIGHT_KEYS) {
    if (dimensions[key] !== undefined && dimensions[key] !== null) {
      return dimensions[key];
    }
  }

  // width_Y パターンも確認
  if (dimensions.width_Y !== undefined) return dimensions.width_Y;

  return defaultValue;
}

/**
 * 寸法データから直径を取得（複数の命名規則に対応）
 *
 * @param {Object} dimensions - 寸法データ
 * @param {number} defaultValue - デフォルト値（見つからない場合）
 * @returns {number|undefined} 直径の値
 */
export function getDiameter(dimensions, defaultValue = undefined) {
  if (!dimensions) return defaultValue;

  for (const key of DIAMETER_KEYS) {
    if (dimensions[key] !== undefined && dimensions[key] !== null) {
      return dimensions[key];
    }
  }

  return defaultValue;
}

/**
 * 寸法データから半径を取得（直径から自動計算も可能）
 *
 * @param {Object} dimensions - 寸法データ
 * @param {number} defaultValue - デフォルト値（見つからない場合）
 * @returns {number|undefined} 半径の値
 */
export function getRadius(dimensions, defaultValue = undefined) {
  if (!dimensions) return defaultValue;

  // 直接 radius が指定されている場合
  if (dimensions.radius !== undefined && dimensions.radius !== null) {
    return dimensions.radius;
  }

  // 直径から計算
  const diameter = getDiameter(dimensions);
  if (diameter !== undefined) {
    return diameter / 2;
  }

  return defaultValue;
}

/**
 * 寸法データから肉厚を取得（複数の命名規則に対応）
 *
 * @param {Object} dimensions - 寸法データ
 * @param {number} defaultValue - デフォルト値（見つからない場合）
 * @returns {number|undefined} 肉厚の値
 */
export function getThickness(dimensions, defaultValue = undefined) {
  if (!dimensions) return defaultValue;

  for (const key of THICKNESS_KEYS) {
    if (dimensions[key] !== undefined && dimensions[key] !== null) {
      return dimensions[key];
    }
  }

  return defaultValue;
}

/**
 * 円形断面かどうかを判定
 *
 * @param {Object} dimensions - 寸法データ
 * @returns {boolean} 円形断面の場合 true
 */
export function isCircularProfile(dimensions) {
  if (!dimensions) return false;

  // profile_hint が明示的に指定されている場合
  if (dimensions.profile_hint === 'CIRCLE') return true;

  // 直径が存在し、明示的な幅・高さがない場合
  const hasDiameter = getDiameter(dimensions) !== undefined;
  const hasWidth = dimensions.width !== undefined || dimensions.Width !== undefined;
  const hasHeight = dimensions.height !== undefined || dimensions.Height !== undefined;

  return hasDiameter && !hasWidth && !hasHeight;
}

/**
 * 矩形断面かどうかを判定
 *
 * @param {Object} dimensions - 寸法データ
 * @returns {boolean} 矩形断面の場合 true
 */
export function isRectangularProfile(dimensions) {
  if (!dimensions) return false;

  // profile_hint が明示的に指定されている場合
  if (dimensions.profile_hint === 'RECTANGLE') return true;

  // 幅と高さが両方存在する場合
  const width = getWidth(dimensions);
  const height = getHeight(dimensions);

  return width !== undefined && height !== undefined;
}

/**
 * 寸法データの検証
 *
 * @param {Object} dimensions - 寸法データ
 * @returns {Object} 検証結果 { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateDimensions(dimensions) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (!dimensions || typeof dimensions !== 'object') {
    result.valid = false;
    result.errors.push('Dimensions is not an object');
    return result;
  }

  // 幅・高さ・直径のいずれかが必要
  const hasWidth = getWidth(dimensions) !== undefined;
  const hasHeight = getHeight(dimensions) !== undefined;
  const hasDiameter = getDiameter(dimensions) !== undefined;

  if (!hasWidth && !hasHeight && !hasDiameter) {
    result.valid = false;
    result.errors.push('Missing required dimensions (width, height, or diameter)');
  }

  // 値の妥当性チェック
  const checkPositive = (value, name) => {
    if (value !== undefined && value <= 0) {
      result.errors.push(`${name} must be positive (got ${value})`);
      result.valid = false;
    }
  };

  checkPositive(getWidth(dimensions), 'width');
  checkPositive(getHeight(dimensions), 'height');
  checkPositive(getDiameter(dimensions), 'diameter');
  checkPositive(getThickness(dimensions), 'thickness');

  return result;
}

/**
 * デバッグ情報の取得
 *
 * @param {Object} dimensions - 寸法データ
 * @returns {Object} デバッグ情報
 */
export function getDimensionDebugInfo(dimensions) {
  return {
    width: getWidth(dimensions),
    height: getHeight(dimensions),
    diameter: getDiameter(dimensions),
    radius: getRadius(dimensions),
    thickness: getThickness(dimensions),
    isCircular: isCircularProfile(dimensions),
    isRectangular: isRectangularProfile(dimensions),
    isExtendedPile: isExtendedPile(dimensions),
    profileHint: dimensions?.profile_hint,
    pileType: dimensions?.pile_type,
    rawDimensions: dimensions
  };
}

/**
 * 拡底杭かどうかを判定
 *
 * @param {Object} dimensions - 寸法データ
 * @returns {boolean} 拡底杭の場合 true
 */
export function isExtendedPile(dimensions) {
  if (!dimensions) return false;

  // profile_hint が明示的に指定されている場合
  if (dimensions.profile_hint === 'EXTENDED_PILE') return true;

  // 拡底杭固有の属性が存在する場合
  return !!(
    dimensions.D_extended_foot ||
    dimensions.D_extended_top ||
    dimensions.pile_type
  );
}

/**
 * 拡底杭の多断面データを取得
 * 拡底杭のジオメトリ生成に必要な断面情報を抽出
 *
 * @param {Object} dimensions - 寸法データ
 * @returns {Object|null} 多断面データ { sections: [...], pileType: string } または null
 *
 * @example
 * const dims = { D_axial: 400, D_extended_foot: 600, length_extended_foot: 1000, angle_extended_foot_taper: 15 };
 * const multiSection = getExtendedPileSections(dims);
 * // => {
 * //   pileType: 'ExtendedFoot',
 * //   sections: [
 * //     { pos: 0, diameter: 400 },           // 軸部（頭部）
 * //     { pos: 'taper_start', diameter: 400, length: calculated },
 * //     { pos: 'foot', diameter: 600 }       // 根固め部
 * //   ],
 * //   taperAngle: 15,
 * //   footLength: 1000
 * // }
 */
export function getExtendedPileSections(dimensions) {
  if (!dimensions || !isExtendedPile(dimensions)) return null;

  const pileType = dimensions.pile_type;
  const D_axial = dimensions.D_axial || dimensions.diameter || dimensions.D;

  if (!D_axial) return null;

  const result = {
    pileType: pileType,
    axialDiameter: D_axial,
    sections: []
  };

  // ExtendedFoot: 根固め部拡大杭（軸部→テーパー→拡底部）
  if (pileType === 'ExtendedFoot' || pileType === 'ExtendedTopFoot') {
    result.footDiameter = dimensions.D_extended_foot;
    result.footLength = dimensions.length_extended_foot;
    result.footTaperAngle = dimensions.angle_extended_foot_taper;
  }

  // ExtendedTop: 頭部拡大杭（拡大部→テーパー→軸部）
  if (pileType === 'ExtendedTop' || pileType === 'ExtendedTopFoot') {
    result.topDiameter = dimensions.D_extended_top;
    result.topLength = dimensions.length_extended_top;
    result.topTaperAngle = dimensions.angle_extended_top_taper;
  }

  return result;
}
