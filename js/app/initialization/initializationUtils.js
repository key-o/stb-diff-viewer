/**
 * @fileoverview 初期化処理で使用されるユーティリティ関数
 */

import { getElementRegistry } from '../../viewer/utils/ElementRegistry.js';
import { STB_TAG_NAMES } from '../../constants/elementTypes.js';

/**
 * 3Dシーンから要素を検索するヘルパー関数
 * ElementRegistryを使用してO(1)で検索
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} modelSource - モデルソース
 * @param {Object} elementGroups - 要素グループ
 * @returns {THREE.Object3D|null}
 */
export function find3DObjectByElement(elementType, elementId, modelSource, elementGroups) {
  // まずElementRegistryから検索（O(1)）
  const registry = getElementRegistry();
  const registryResult = registry.find(elementType, elementId, modelSource);
  if (registryResult) {
    return registryResult;
  }

  // Registryに見つからない場合はフォールバック（互換性のため）
  const elementGroup = elementGroups[elementType];
  if (!elementGroup) return null;

  let foundObj = null;
  elementGroup.traverse((obj) => {
    if (foundObj) return;

    if (obj.userData && obj.userData.elementType === elementType) {
      const objId = obj.userData.elementIdA || obj.userData.elementIdB || obj.userData.elementId;
      const objIdStr = String(objId);
      const elementIdStr = String(elementId);

      const modelSourceMatches =
        obj.userData.modelSource === modelSource ||
        (modelSource === 'onlyA' && obj.userData.modelSource === 'A') ||
        (modelSource === 'onlyB' && obj.userData.modelSource === 'B') ||
        (modelSource === 'matched' && obj.userData.modelSource === 'matched');

      if (objIdStr === elementIdStr && modelSourceMatches) {
        foundObj = obj;
        // 見つかった要素をRegistryに登録（次回からはO(1)で取得可能）
        registry.register(obj);
      }
    }
  });

  return foundObj;
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
