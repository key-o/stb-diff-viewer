/**
 * @fileoverview 要素属性比較モジュール
 *
 * 2つの要素の構造属性（断面、材質、回転、オフセット等）を比較し、
 * 一致/不一致を判定します。XML DOM要素とJSオブジェクト両方に対応。
 */

/**
 * 要素からプロパティ値を取得する（XML DOM/JSオブジェクト両対応）
 * @param {Element|Object} element - 要素
 * @param {string} attrName - 属性名
 * @returns {*} 属性値
 */
function getProperty(element, attrName) {
  if (element && typeof element.getAttribute === 'function') {
    // XML DOM要素
    const val = element.getAttribute(attrName);
    if (val === null) return undefined;
    // 数値変換を試みる
    const num = Number(val);
    return isNaN(num) ? val : num;
  }
  // JSオブジェクト
  return element?.[attrName];
}

/**
 * 比較対象の構造属性リスト
 * @type {string[]}
 */
const STRUCTURAL_ATTRIBUTES = [
  'id_sec',
  'kind',
  'rotate',
  'offset_X',
  'offset_Y',
  'offset_Z',
  'level_top',
  'level_bottom',
  'condition_bottom',
  'condition_top',
  'joint_bottom',
  'joint_top',
  'haunch_H',
  'haunch_start',
  'haunch_end',
];

/** 数値比較の精度閾値 */
const NUMERIC_TOLERANCE = 0.001;

/**
 * 2つの要素の構造属性を比較する
 * @param {Element|Object} elementA - モデルAの要素
 * @param {Element|Object} elementB - モデルBの要素
 * @returns {boolean} 属性が一致すればtrue
 */
export function compareStructuralAttributes(elementA, elementB) {
  for (const attr of STRUCTURAL_ATTRIBUTES) {
    const valueA = getProperty(elementA, attr);
    const valueB = getProperty(elementB, attr);

    // 両方とも未定義なら一致とみなす
    if (valueA === undefined && valueB === undefined) {
      continue;
    }

    // 片方だけ定義されている場合は不一致
    if (valueA === undefined || valueB === undefined) {
      return false;
    }

    // 数値の場合は精度で比較
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      if (Math.abs(valueA - valueB) > NUMERIC_TOLERANCE) {
        return false;
      }
    } else {
      // その他の型は厳密比較
      if (String(valueA) !== String(valueB)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * BasicStrategy用の属性比較コールバックを作成する
 *
 * keyExtractorが返すdataオブジェクトから元の要素を取得し、
 * 構造属性を比較するコールバック関数を返す。
 *
 * @param {function(any): Element|Object} [elementExtractor] - dataから要素を取り出す関数
 * @returns {function(any, any): boolean} 属性比較コールバック
 */
export function createAttributeComparator(elementExtractor) {
  const getElement = elementExtractor || ((data) => data.element || data);
  return (dataA, dataB) => {
    const elementA = getElement(dataA);
    const elementB = getElement(dataB);
    return compareStructuralAttributes(elementA, elementB);
  };
}
