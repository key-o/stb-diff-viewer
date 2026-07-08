/**
 * @fileoverview 比較上の識別子属性判定
 *
 * モデル間で再採番・再生成されやすいID系属性は、属性値そのものを
 * 差分として扱わない。参照先の内容差は別の比較軸で検出する。
 */

/**
 * 属性比較から除外する識別子属性かどうかを判定する。
 *
 * @param {string} attributeName - 属性名
 * @returns {boolean} ID/GUID系属性ならtrue
 */
export function isIdentityAttribute(attributeName) {
  if (typeof attributeName !== 'string') return false;
  const normalized = attributeName.trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized === 'id' ||
    normalized === 'guid' ||
    normalized.startsWith('id_') ||
    normalized.endsWith('_id') ||
    normalized.includes('_id_')
  );
}
