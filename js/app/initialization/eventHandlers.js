/**
 * @fileoverview メインアプリケーションのイベントハンドラ
 */

import { createLogger } from '../../utils/logger.js';
import { compareModels } from '../modelLoader.js';
import { getState } from '../globalState.js';
import { buildTree } from '../../ui/panels/elementTreeView.js';
import { buildSectionTree } from '../../ui/panels/sectionTreeView.js';
import { updateLabelVisibility } from '../../ui/viewer3d/unifiedLabelManager.js';
import { displayElementInfo } from '../../ui/panels/element-info/index.js';
import { selectElement3D, selectMultipleElements3D } from '../interaction.js';
import { showError } from '../../ui/common/toast.js';
import { UI_TIMING } from '../../config/uiTimingConfig.js';
import { convertComparisonResultsForTree, find3DObjectByElement } from './initializationUtils.js';
import { scene, axesHelper } from '../../viewer/index.js';

const log = createLogger('eventHandlers');

/**
 * モデル比較ボタンのクリックハンドラ
 * @param {Function} scheduleRender - 再描画関数
 * @param {Object} dependencies - 依存オブジェクト
 * @param {boolean} dependencies.rendererInitialized - レンダラー初期化フラグ
 * @param {Object} dependencies.camera - カメラオブジェクト
 * @param {Object} dependencies.controls - コントロールオブジェクト
 * @returns {Promise<void>}
 */
export async function handleCompareModelsClick(scheduleRender, dependencies) {
  const { rendererInitialized, camera, controls } = dependencies;

  // レンダラーが初期化されていない場合は処理中断
  if (!rendererInitialized) {
    showError('ビューアが初期化されていません。');
    return;
  }

  // モデルの読み込みと比較処理
  await compareModels(scheduleRender, { camera, controls });

  // 比較結果を取得してツリーを構築
  const comparisonResults = getState('comparisonResults');
  if (comparisonResults) {
    log.info('要素ツリーを構築しています...');
    // comparisonResultsをツリー表示用に変換
    const treeData = convertComparisonResultsForTree(comparisonResults);
    buildTree(treeData);

    // 断面ツリーも構築
    const sectionsData = getState('sectionsData');
    if (sectionsData) {
      log.info('断面ツリーを構築しています...');
      buildSectionTree(treeData, sectionsData);
    }
  }

  // 少し待ってからラベル表示状態をチェックボックスに基づいて更新
  // （ラベル作成処理の完了を待つ）
  log.info('チェックボックスの状態に基づいてラベル表示を初期化しています...');
  setTimeout(() => {
    updateLabelVisibility();
    // 再描画
    if (typeof window.requestRender === 'function') window.requestRender();
  }, UI_TIMING.LABEL_UPDATE_DELAY_MS);
}

/**
 * ツリービューで選択された要素を3Dビューで検索・選択する共通ハンドラ
 * @param {Object} selectedElement - 選択された要素情報
 * @param {string} selectedElement.elementType - 要素タイプ
 * @param {string|number} selectedElement.elementId - 要素ID
 * @param {string} selectedElement.modelSource - モデルソース ('matched', 'onlyA', 'onlyB')
 * @param {string} sourceName - ソース名（ログ出力用）
 * @param {boolean} [enableDebugInfo=false] - デバッグ情報を収集するか
 * @param {Function} scheduleRender - 再描画関数
 * @param {Object} elementGroups - 要素グループ
 */
export function handleTreeElementSelection(
  selectedElement,
  sourceName,
  enableDebugInfo,
  scheduleRender,
  elementGroups,
) {
  if (!selectedElement) {
    log.error(`${sourceName}: 選択された要素情報がnullまたはundefinedです`);
    return;
  }

  // 複数選択の場合
  if (selectedElement.multiSelect && selectedElement.selectedElements) {
    log.info(`${sourceName}: 複数選択 (${selectedElement.selectedElements.length}要素)`);

    const objectsToSelect = [];
    for (const elem of selectedElement.selectedElements) {
      const obj = find3DObjectByElement(
        elem.elementType,
        elem.elementId,
        elem.modelSource,
        elementGroups,
      );
      if (obj) {
        objectsToSelect.push(obj);
      }
    }

    if (objectsToSelect.length > 0) {
      selectMultipleElements3D(objectsToSelect, scheduleRender);
      log.info(`${sourceName}: ${objectsToSelect.length}個の3D要素を選択しました`);
    } else {
      log.warn(`${sourceName}: 3Dビューアーで要素が見つかりませんでした`);
    }
    return;
  }

  // 単一選択の場合（従来の処理）
  const { elementType, elementId, modelSource } = selectedElement;

  if (!elementType || !elementId) {
    log.error(`${sourceName}: 要素タイプまたはIDが指定されていません`);
    return;
  }

  const elementGroup = elementGroups[elementType];
  if (!elementGroup) {
    log.warn(`${sourceName}: 要素グループが見つかりません: ${elementType}`);
    if (enableDebugInfo) {
      log.warn('利用可能な要素グループ:', Object.keys(elementGroups));
    }
    return;
  }

  log.info(
    `${sourceName}: 要素を検索中: タイプ=${elementType}, ID=${elementId}, ソース=${modelSource}`,
  );

  let found = false;
  let searchedCount = 0;
  const candidateMatches = enableDebugInfo ? [] : null;

  elementGroup.traverse((obj) => {
    if (found) return;

    if (obj.userData && obj.userData.elementType === elementType) {
      searchedCount++;

      // デバッグ用: 最初の5個の候補を記録
      if (candidateMatches && candidateMatches.length < 5) {
        const objId = obj.userData.elementIdA || obj.userData.elementIdB || obj.userData.elementId;
        candidateMatches.push({
          objId: objId,
          objIdType: typeof objId,
          modelSource: obj.userData.modelSource,
        });
      }

      const objId = obj.userData.elementIdA || obj.userData.elementIdB || obj.userData.elementId;
      const objIdStr = String(objId);
      const elementIdStr = String(elementId);

      // modelSourceの柔軟な比較
      const modelSourceMatches =
        obj.userData.modelSource === modelSource ||
        (modelSource === 'onlyA' && obj.userData.modelSource === 'A') ||
        (modelSource === 'onlyB' && obj.userData.modelSource === 'B') ||
        (modelSource === 'matched' && obj.userData.modelSource === 'matched');

      if (objIdStr === elementIdStr && modelSourceMatches) {
        found = true;
        log.info(`${sourceName}: 要素が見つかりました: ${elementType} ${elementId}`);

        // 要素情報を表示用のIDを決定
        let idA = null;
        let idB = null;
        if (modelSource === 'matched') {
          idA = obj.userData.elementIdA || obj.userData.elementId;
          idB = obj.userData.elementIdB;
        } else if (modelSource === 'onlyA' || modelSource === 'A') {
          idA = obj.userData.elementId;
        } else if (modelSource === 'onlyB' || modelSource === 'B') {
          idB = obj.userData.elementId;
        }

        // 要素情報を表示
        displayElementInfo(idA, idB, elementType, modelSource).catch((err) =>
          log.error(`${sourceName}: displayElementInfo エラー:`, err),
        );

        // 3D選択
        try {
          selectElement3D(obj, scheduleRender);
          log.info(`${sourceName}: 3D要素の選択が完了しました`);
        } catch (err) {
          log.error(`${sourceName}: selectElement3D エラー:`, err);
        }
      }
    }
  });

  if (!found) {
    log.warn(
      `${sourceName}: 3Dビューアーで要素が見つかりませんでした: ${elementType} ${elementId} (${modelSource})`,
    );
    if (enableDebugInfo) {
      log.warn(`検索した要素数: ${searchedCount}`);
      if (candidateMatches && candidateMatches.length > 0) {
        log.warn('最初の候補オブジェクト (デバッグ用):', candidateMatches);
      }
    }
  }
}

/**
 * 原点軸（AxesHelper）の表示切り替え
 * @param {boolean} isVisible - 表示するかどうか
 */
export function toggleOriginAxesVisibility(isVisible) {
  try {
    if (!axesHelper) {
      log.warn('原点軸切り替えのためのAxesHelperが利用できません');
      return;
    }
    axesHelper.visible = isVisible;
    log.info(`原点軸の表示状態を切り替えました: ${isVisible}`);
  } catch (error) {
    log.error('原点軸の表示切り替えでエラーが発生しました:', error);
  }
}

/**
 * 配置基準線の表示切り替え
 * @param {boolean} isVisible - 表示するかどうか
 */
export function togglePlacementLinesVisibility(isVisible) {
  try {
    if (!scene) {
      log.warn('配置基準線切り替えのためのシーンが利用できません');
      return;
    }

    // すべてのメッシュオブジェクトを探索して配置基準線を切り替え
    scene.traverse((object) => {
      if (object.userData && object.userData.isPlacementLine) {
        object.visible = isVisible;
      }
    });

    log.info(`配置基準線の表示状態を切り替えました: ${isVisible}`);
  } catch (error) {
    log.error('配置基準線の表示切り替えでエラーが発生しました:', error);
  }
}
