/**
 * @fileoverview 段階的レンダリング統合モジュール
 *
 * このモジュールは既存のレンダリングシステムと段階的ローディングを統合し、
 * パフォーマンスを向上させます。
 */

import * as THREE from 'three';
import { ELEMENT_PRIORITY } from '../core/progressiveLoader.js';
import {
  getLoadingIndicator,
  showLoading,
  hideLoading,
  completeLoading
} from '../ui/loadingIndicator.js';
import {
  materials,
  elementGroups,
  drawNodes,
  drawNodesBatched,
  drawLineElements,
  drawPolyElements,
  drawLineElementsBatched,
  shouldUseBatchRendering,
  drawAxes,
  drawStories,
  getActiveCamera
} from '../viewer/index.js';

/**
 * 段階的レンダリングを有効にするかどうかのフラグ
 * パフォーマンステストや問題発生時に切り替え可能
 */
let progressiveRenderingEnabled = true;

/**
 * バッチレンダリングを有効にするかどうかのフラグ
 */
let batchRenderingEnabled = true;

/**
 * バッチレンダリングの有効/無効を設定
 * @param {boolean} enabled
 */
export function setBatchRenderingEnabled(enabled) {
  batchRenderingEnabled = enabled;
}

/**
 * バッチレンダリングが有効かどうかを取得
 * @returns {boolean}
 */
export function isBatchRenderingEnabled() {
  return batchRenderingEnabled;
}

/**
 * 段階的レンダリングの有効/無効を設定
 * @param {boolean} enabled
 */
export function setProgressiveRenderingEnabled(enabled) {
  progressiveRenderingEnabled = enabled;
}

/**
 * 段階的レンダリングが有効かどうかを取得
 * @returns {boolean}
 */
export function isProgressiveRenderingEnabled() {
  return progressiveRenderingEnabled;
}

/**
 * 段階的にレンダリングを実行
 *
 * @param {Map} comparisonResults - 比較結果
 * @param {THREE.Box3} modelBounds - モデル境界
 * @param {Object} globalData - グローバルデータ（stories, axesData）
 * @param {function} scheduleRender - 再描画関数
 * @returns {Promise<Object>} レンダリング結果
 */
export async function orchestrateProgressiveRendering(
  comparisonResults,
  modelBounds,
  globalData,
  scheduleRender
) {
  // 段階的レンダリングが無効な場合は従来の方法を使用
  if (!progressiveRenderingEnabled) {
    return orchestrateSynchronousRendering(
      comparisonResults,
      modelBounds,
      globalData
    );
  }

  const indicator = getLoadingIndicator();
  indicator.show('3Dモデルを描画中...');

  const renderingResults = {
    nodeLabels: [],
    renderedElements: new Map(),
    errors: []
  };

  // 要素タイプを優先度順にソート
  const sortedElementTypes = Array.from(comparisonResults.keys()).sort(
    (a, b) => {
      const priorityA = ELEMENT_PRIORITY[`Stb${a}`] || ELEMENT_PRIORITY[a] || 99;
      const priorityB = ELEMENT_PRIORITY[`Stb${b}`] || ELEMENT_PRIORITY[b] || 99;
      return priorityA - priorityB;
    }
  );

  // 総要素数を計算
  let totalElements = 0;
  let processedElements = 0;
  for (const result of comparisonResults.values()) {
    totalElements +=
      (result.matched?.length || 0) +
      (result.onlyA?.length || 0) +
      (result.onlyB?.length || 0);
  }

  // フェーズごとに処理
  for (const elementType of sortedElementTypes) {
    const comparisonResult = comparisonResults.get(elementType);
    if (!comparisonResult) continue;

    // 進捗更新
    const elementCount =
      (comparisonResult.matched?.length || 0) +
      (comparisonResult.onlyA?.length || 0) +
      (comparisonResult.onlyB?.length || 0);

    indicator.update(
      Math.round((processedElements / totalElements) * 100),
      `描画中: ${elementType}`,
      `${processedElements}/${totalElements} 要素`
    );

    try {
      const elementRenderResult = await renderElementTypeAsync(
        elementType,
        comparisonResult,
        modelBounds,
        globalData
      );

      renderingResults.renderedElements.set(elementType, elementRenderResult);

      if (elementRenderResult.labels) {
        renderingResults.nodeLabels.push(...elementRenderResult.labels);
      }

      // フェーズ完了後に描画更新
      if (scheduleRender) {
        scheduleRender();
      }
    } catch (error) {
      console.error(`Error rendering ${elementType}:`, error);
      renderingResults.errors.push({
        elementType,
        error: error.message
      });
    }

    processedElements += elementCount;

    // UIスレッドに制御を戻す
    await yieldToMain();
  }

  // 補助要素（通り芯・階）を描画
  try {
    await renderAuxiliaryElementsAsync(globalData, renderingResults, modelBounds);
    if (scheduleRender) {
      scheduleRender();
    }
  } catch (error) {
    console.error('Error rendering auxiliary elements:', error);
    renderingResults.errors.push({
      elementType: 'auxiliary',
      error: error.message
    });
  }

  indicator.complete('描画完了');

  return renderingResults;
}

/**
 * 同期的なレンダリング（従来方式）
 *
 * @param {Map} comparisonResults - 比較結果
 * @param {THREE.Box3} modelBounds - モデル境界
 * @param {Object} globalData - グローバルデータ
 * @returns {Object} レンダリング結果
 */
function orchestrateSynchronousRendering(
  comparisonResults,
  modelBounds,
  globalData
) {
  console.log('=== Starting Synchronous Element Rendering ===');

  const renderingResults = {
    nodeLabels: [],
    renderedElements: new Map(),
    errors: []
  };

  for (const [elementType, comparisonResult] of comparisonResults.entries()) {
    try {
      const elementRenderResult = renderElementTypeSync(
        elementType,
        comparisonResult,
        modelBounds,
        globalData
      );

      renderingResults.renderedElements.set(elementType, elementRenderResult);

      if (elementRenderResult.labels) {
        renderingResults.nodeLabels.push(...elementRenderResult.labels);
      }
    } catch (error) {
      console.error(`Error rendering ${elementType}:`, error);
      renderingResults.errors.push({
        elementType,
        error: error.message
      });
    }
  }

  // 補助要素を描画
  renderAuxiliaryElementsSync(globalData, renderingResults, modelBounds);

  console.log('=== Synchronous Element Rendering Complete ===');

  return renderingResults;
}

/**
 * 要素タイプを非同期でレンダリング
 *
 * @param {string} elementType - 要素タイプ
 * @param {Object} comparisonResult - 比較結果
 * @param {THREE.Box3} modelBounds - モデル境界
 * @param {Object} globalData - グローバルデータ
 * @returns {Promise<Object>} レンダリング結果
 */
async function renderElementTypeAsync(
  elementType,
  comparisonResult,
  modelBounds,
  globalData
) {
  // 基本的には同期処理と同じだが、大量要素の場合はバッチ処理
  return renderElementTypeSync(
    elementType,
    comparisonResult,
    modelBounds,
    globalData
  );
}

/**
 * 要素タイプを同期的にレンダリング
 *
 * @param {string} elementType - 要素タイプ
 * @param {Object} comparisonResult - 比較結果
 * @param {THREE.Box3} modelBounds - モデル境界
 * @param {Object} globalData - グローバルデータ
 * @returns {Object} レンダリング結果
 */
function renderElementTypeSync(
  elementType,
  comparisonResult,
  modelBounds,
  _globalData
) {
  const group = elementGroups[elementType];
  if (!group) {
    throw new Error(`Element group not found for type: ${elementType}`);
  }

  group.visible = comparisonResult.isSelected;

  const result = {
    meshCount: 0,
    labels: [],
    groupVisible: group.visible
  };

  if (comparisonResult.error) {
    console.warn(
      `Skipping rendering for ${elementType} due to comparison error`
    );
    return result;
  }

  const createLabels = true;

  // バッチ処理を使用するかどうかを判定
  const useBatch =
    batchRenderingEnabled && shouldUseBatchRendering(comparisonResult);

  switch (elementType) {
    case 'Node':
      // 要素数が多い場合はバッチ処理（InstancedMesh）を使用
      if (useBatch) {
        result.labels = drawNodesBatched(
          comparisonResult,
          materials,
          group,
          createLabels,
          modelBounds
        );
      } else {
        result.labels = drawNodes(
          comparisonResult,
          materials,
          group,
          createLabels,
          modelBounds
        );
      }
      break;

    case 'Column':
    case 'Post':
    case 'Girder':
    case 'Beam':
    case 'Brace':
    case 'Pile':
    case 'Footing':
    case 'FoundationColumn':
      // 要素数が多い場合はバッチ処理を使用
      if (useBatch) {
        result.labels = drawLineElementsBatched(
          comparisonResult,
          materials,
          group,
          elementType,
          createLabels,
          modelBounds
        );
      } else {
        result.labels = drawLineElements(
          comparisonResult,
          materials,
          group,
          elementType,
          createLabels,
          modelBounds
        );
      }
      break;

    case 'Slab':
    case 'Wall':
      result.labels = drawPolyElements(
        comparisonResult,
        materials,
        group,
        createLabels,
        modelBounds
      );
      break;

    default:
      console.warn(`Unknown element type for rendering: ${elementType}`);
  }

  result.meshCount = countMeshesInGroup(group);

  return result;
}

/**
 * 補助要素を非同期でレンダリング
 *
 * @param {Object} globalData - グローバルデータ
 * @param {Object} renderingResults - レンダリング結果
 * @param {THREE.Box3} modelBounds - モデル境界
 */
async function renderAuxiliaryElementsAsync(
  globalData,
  renderingResults,
  modelBounds
) {
  renderAuxiliaryElementsSync(globalData, renderingResults, modelBounds);
}

/**
 * 補助要素を同期的にレンダリング
 *
 * @param {Object} globalData - グローバルデータ
 * @param {Object} renderingResults - レンダリング結果
 * @param {THREE.Box3} modelBounds - モデル境界
 */
function renderAuxiliaryElementsSync(globalData, renderingResults, modelBounds) {
  const { stories, axesData } = globalData;

  if (axesData && (axesData.xAxes.length > 0 || axesData.yAxes.length > 0)) {
    try {
      const axisLabels = drawAxes(
        axesData,
        stories,
        elementGroups['Axis'],
        modelBounds,
        true,
        getActiveCamera()
      );
      renderingResults.nodeLabels.push(...axisLabels);
    } catch (error) {
      console.error('Error rendering axes:', error);
    }
  }

  if (stories && stories.length > 0) {
    try {
      const storyLabels = drawStories(
        stories,
        elementGroups['Story'],
        modelBounds,
        true
      );
      renderingResults.nodeLabels.push(...storyLabels);
    } catch (error) {
      console.error('Error rendering stories:', error);
    }
  }
}

/**
 * グループ内のメッシュ数をカウント
 *
 * @param {THREE.Group} group
 * @returns {number}
 */
function countMeshesInGroup(group) {
  let count = 0;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      count++;
    }
  });
  return count;
}

/**
 * メインスレッドに制御を譲る
 *
 * @returns {Promise<void>}
 */
function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(resolve, { timeout: 16 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * 読み込み開始時のUI更新
 */
export function onLoadingStart() {
  showLoading('モデルを読み込み中...');
}

/**
 * 読み込み完了時のUI更新
 */
export function onLoadingComplete() {
  completeLoading('読み込み完了');
}

/**
 * 読み込みエラー時のUI更新
 * @param {string} message
 */
export function onLoadingError(message) {
  const indicator = getLoadingIndicator();
  indicator.error(message);
  setTimeout(() => hideLoading(), 3000);
}
