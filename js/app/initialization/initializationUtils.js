/**
 * @fileoverview 初期化処理で使用されるユーティリティ関数
 */

import { createLogger } from '../../utils/logger.js';
import { getElementRegistry } from '../../viewer/utils/ElementRegistry.js';

const log = createLogger('initializationUtils');

/**
 * comparisonResultsをツリー表示用のデータ構造に変換
 * @param {Map} comparisonResults - 要素タイプごとの比較結果Map
 * @returns {Object} ツリー表示用のデータ構造
 */
export function convertComparisonResultsForTree(comparisonResults) {
  const matched = [];
  const onlyA = [];
  const onlyB = [];

  // comparisonResultsがMapかどうかチェック
  if (!comparisonResults) {
    log.warn('comparisonResults is null or undefined');
    return { matched, onlyA, onlyB };
  }

  // Mapまたはオブジェクトの各要素を処理
  const entries =
    comparisonResults instanceof Map
      ? comparisonResults.entries()
      : Object.entries(comparisonResults);

  for (const [elementType, result] of entries) {
    if (!result) continue;

    // matched要素を変換
    if (result.matched && Array.isArray(result.matched)) {
      result.matched.forEach((item) => {
        matched.push({
          elementType: elementType,
          elementA: item.dataA,
          elementB: item.dataB,
          id: item.dataA?.id,
        });
      });
    }

    // onlyA要素を変換
    if (result.onlyA && Array.isArray(result.onlyA)) {
      result.onlyA.forEach((item) => {
        onlyA.push({
          elementType: elementType,
          ...item,
        });
      });
    }

    // onlyB要素を変換
    if (result.onlyB && Array.isArray(result.onlyB)) {
      result.onlyB.forEach((item) => {
        onlyB.push({
          elementType: elementType,
          ...item,
        });
      });
    }
  }

  log.info(
    `ツリー用データ変換完了: matched=${matched.length}, onlyA=${onlyA.length}, onlyB=${onlyB.length}`,
  );
  return { matched, onlyA, onlyB };
}

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
  if (!document) return { columns: [], girders: [], beams: [] };

  const STB_NS = 'https://www.building-smart.or.jp/dl';

  // 柱を取得
  const columns = Array.from(document.getElementsByTagNameNS(STB_NS, 'StbColumn'));
  if (columns.length === 0) {
    columns.push(...Array.from(document.getElementsByTagName('StbColumn')));
  }

  // 大梁を取得
  const girders = Array.from(document.getElementsByTagNameNS(STB_NS, 'StbGirder'));
  if (girders.length === 0) {
    girders.push(...Array.from(document.getElementsByTagName('StbGirder')));
  }

  // 小梁を取得
  const beams = Array.from(document.getElementsByTagNameNS(STB_NS, 'StbBeam'));
  if (beams.length === 0) {
    beams.push(...Array.from(document.getElementsByTagName('StbBeam')));
  }

  return { columns, girders, beams };
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
