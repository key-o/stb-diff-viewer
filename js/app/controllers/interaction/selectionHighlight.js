/**
 * @fileoverview 選択ハイライトマテリアル管理モジュール
 *
 * 選択・選択候補プレビュー用のハイライトマテリアルの生成と適用を行います。
 * 選択候補プレビュー用マテリアルは種別ごとにキャッシュして再利用します。
 */

import * as THREE from 'three';
import { colorManager } from '../../../viewer/index.js';

/** @type {{line: THREE.Material|null, sprite: THREE.Material|null, mesh: THREE.Material|null, meshSrcConcrete: THREE.Material|null}} */
const selectionCandidateMaterialCache = {
  line: null,
  sprite: null,
  mesh: null,
  meshSrcConcrete: null,
};

/**
 * ハイライト用マテリアルを生成（選択候補プレビューはキャッシュを再利用）
 * @param {THREE.Object3D} obj - 対象オブジェクト
 * @param {string} colorMode - 'highlight' | 'selectionCandidate'
 * @returns {THREE.Material|null}
 */
export function createHighlightMaterial(obj, colorMode = 'highlight') {
  let highlightMat = null;
  if (obj instanceof THREE.Line) {
    highlightMat = colorManager.getMaterial(colorMode, { isLine: true });
  } else if (obj instanceof THREE.Sprite) {
    highlightMat = colorManager.getMaterial(colorMode, { isSprite: true });
  } else if (obj instanceof THREE.Mesh) {
    highlightMat = colorManager.getMaterial(colorMode, { isLine: false });
  }

  if (colorMode === 'selectionCandidate' && highlightMat?.isMaterial) {
    if (obj instanceof THREE.Line) {
      if (!selectionCandidateMaterialCache.line) {
        selectionCandidateMaterialCache.line = highlightMat;
      }
      highlightMat = selectionCandidateMaterialCache.line;
    } else if (obj instanceof THREE.Sprite) {
      if (!selectionCandidateMaterialCache.sprite) {
        selectionCandidateMaterialCache.sprite = highlightMat;
      }
      highlightMat = selectionCandidateMaterialCache.sprite;
    } else if (obj instanceof THREE.Mesh && obj.userData?.isSRCConcrete === true) {
      if (!selectionCandidateMaterialCache.meshSrcConcrete) {
        const srcConcreteMaterial = highlightMat.clone();
        srcConcreteMaterial.transparent = true;
        srcConcreteMaterial.opacity = 0.14;
        srcConcreteMaterial.depthWrite = false;
        selectionCandidateMaterialCache.meshSrcConcrete = srcConcreteMaterial;
      }
      highlightMat = selectionCandidateMaterialCache.meshSrcConcrete;
    } else {
      if (!selectionCandidateMaterialCache.mesh) {
        selectionCandidateMaterialCache.mesh = highlightMat;
      }
      highlightMat = selectionCandidateMaterialCache.mesh;
    }
    if (!highlightMat.userData.isSelectionPreviewMaterial) {
      highlightMat.userData = { ...highlightMat.userData, isSelectionPreviewMaterial: true };
    }
  }

  return highlightMat;
}

/**
 * オブジェクトにハイライトマテリアルを適用
 * @param {THREE.Object3D} obj - 対象オブジェクト
 * @param {string} colorMode - 'highlight' | 'selectionCandidate'
 * @returns {boolean} 適用できた場合 true
 */
export function applyHighlightMaterial(obj, colorMode = 'highlight') {
  const highlightMat = createHighlightMaterial(obj, colorMode);
  if (!highlightMat || !obj?.material) {
    return false;
  }

  obj.material = highlightMat;
  return true;
}
