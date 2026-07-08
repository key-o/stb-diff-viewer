/**
 * @fileoverview 一致要素のモデルBオーバーレイ表示用のマテリアルスタイル定数・ヘルパー
 *
 * 断面が異なる一致要素（ATTRIBUTE_MISMATCH）について、モデルB側の形状を
 * モデルA側に半透明で重ねて表示するためのマテリアル設定を一元管理する。
 * THREE に依存せず、渡されたマテリアルのプロパティのみを設定する。
 */

/** モデルBオーバーレイの不透明度 */
export const MODEL_B_OVERLAY_OPACITY = 0.35;

/**
 * マテリアルをモデルBオーバーレイ用（半透明・polygonOffset）に設定する。
 * 共有マテリアルを壊さないよう、呼び出し側で clone 済みのインスタンスを渡すこと。
 * @param {Object} material - THREE.Material（clone 済み）
 * @returns {Object} 同じ material インスタンス（設定後）
 */
export function styleAsModelBOverlay(material) {
  if (!material) return material;
  material.transparent = true;
  material.opacity = MODEL_B_OVERLAY_OPACITY;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;
  material.needsUpdate = true;
  return material;
}

/**
 * clone 済みマテリアル（配列対応）にオーバーレイスタイルを適用するユーティリティ。
 * @param {Object|Object[]} material - clone 済みマテリアルまたはその配列
 * @returns {Object|Object[]} スタイル適用後のマテリアル
 */
export function styleClonedAsModelBOverlay(material) {
  if (Array.isArray(material)) {
    return material.map((m) => styleAsModelBOverlay(m));
  }
  return styleAsModelBOverlay(material);
}
