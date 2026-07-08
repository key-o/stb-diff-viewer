/**
 * @fileoverview 初期化処理で使用されるユーティリティ関数
 */

import { getElementRegistry, findElementInGroup } from '../../viewer/index.js';
import { STB_TAG_NAMES } from '../../constants/elementTypes.js';

/**
 * 3Dシーンから要素を検索するヘルパー関数。
 * ElementRegistryでO(1)検索し、無ければグループ走査にフォールバックする。
 * バッチ描画（節点=InstancedMesh / 線要素=LineSegmentsバッチ）にも対応する。
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} modelSource - モデルソース
 * @param {Object} elementGroups - 要素グループ
 * @returns {import('../../viewer/utils/batchElementLookup.js').BatchElementHit|null}
 */
export function find3DObjectByElement(elementType, elementId, modelSource, elementGroups) {
  // まずElementRegistryから検索（O(1)、非バッチ要素のみ登録される）
  const registry = getElementRegistry();
  const registryResult = registry.find(elementType, elementId, modelSource);
  if (registryResult) {
    return {
      object: registryResult,
      kind: 'object',
      index: null,
      userData: registryResult.userData,
    };
  }

  // Registryに見つからない場合はフォールバック（バッチ要素はここで解決）
  const hit = findElementInGroup(elementGroups[elementType], elementType, elementId, modelSource);
  if (!hit) return null;

  // 非バッチ要素はRegistryに登録（次回からはO(1)で取得可能）。
  // バッチ要素は単一オブジェクトで表現できないため登録しない。
  if (hit.kind === 'object') {
    registry.register(hit.object);
  }

  return hit;
}

/**
 * モデルドキュメントから部材データを構築
 * @param {Document} document - XMLドキュメント
 * @returns {Object} 部材データ
 */
export function buildMemberDataFromDocument(document) {
  if (!document) return { columns: [], girders: [], beams: [], slabs: [] };

  const STB_NS = 'https://www.building-smart.or.jp/dl';

  // 柱を取得
  const columns = Array.from(document.getElementsByTagNameNS(STB_NS, STB_TAG_NAMES.COLUMN));
  if (columns.length === 0) {
    columns.push(...Array.from(document.getElementsByTagName(STB_TAG_NAMES.COLUMN)));
  }

  // 大梁を取得
  const girders = Array.from(document.getElementsByTagNameNS(STB_NS, STB_TAG_NAMES.GIRDER));
  if (girders.length === 0) {
    girders.push(...Array.from(document.getElementsByTagName(STB_TAG_NAMES.GIRDER)));
  }

  // 小梁を取得
  const beams = Array.from(document.getElementsByTagNameNS(STB_NS, STB_TAG_NAMES.BEAM));
  if (beams.length === 0) {
    beams.push(...Array.from(document.getElementsByTagName(STB_TAG_NAMES.BEAM)));
  }

  // 床を取得
  const slabs = Array.from(document.getElementsByTagNameNS(STB_NS, STB_TAG_NAMES.SLAB));
  if (slabs.length === 0) {
    slabs.push(...Array.from(document.getElementsByTagName(STB_TAG_NAMES.SLAB)));
  }

  return { columns, girders, beams, slabs };
}

/**
 * 荷重ケースセレクターを更新
 * @param {Array} loadCases - 荷重ケース配列
 */
export function updateLoadCaseSelector(loadCases) {
  const selector = document.getElementById('loadCaseSelector');
  if (!selector) return;

  // 既存のオプションをクリア（最初の「全て」オプション以外）
  while (selector.options.length > 1) {
    selector.remove(1);
  }

  // 荷重ケースがない場合は無効化
  if (!loadCases || loadCases.length === 0) {
    selector.disabled = true;
    return;
  }

  // 荷重ケースオプションを追加
  loadCases.forEach((lc) => {
    const option = document.createElement('option');
    option.value = lc.id;
    option.textContent = `${lc.name || lc.id} (${lc.kind})`;
    selector.appendChild(option);
  });

  selector.disabled = false;
}
