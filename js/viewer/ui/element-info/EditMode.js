/**
 * @fileoverview 編集モード機能
 *
 * 要素パラメータの編集、修正履歴の管理、エクスポート機能を提供します。
 * パラメータエディターとの連携、XSD バリデーション、ジオメトリ再生成を担当します。
 */

import { createLogger } from '../../../utils/logger.js';
import {
  isSchemaLoaded,
  getAttributeInfo,
  validateAttributeValue,
} from '../../../parser/xsdSchemaParser.js';

const log = createLogger('viewer:edit-mode');
import {
  exportModifiedStb,
  validateDocumentForExport,
  generateModificationReport,
} from '../../../export/stb/stbExporter.js';
import { regenerateElementGeometry } from '../../elementUpdater.js';
import { eventBus, EditEvents, RenderEvents } from '../../../app/events/index.js';
import { scheduleRender } from '../../../utils/renderScheduler.js';
import {
  getParameterEditor,
  getSuggestionEngine,
  updateLabelsForElement,
} from './ElementInfoProviders.js';
import {
  buildElementDataForLabels,
  findSectionNode,
  extractSectionData,
} from './SectionHelpers.js';
import { showSuccess, showError, showWarning } from '../../../ui/toast.js';

// 編集機能の状態管理
let editMode = false;
let modifications = []; // 修正履歴 [{elementType, id, attribute, oldValue, newValue}]
let currentEditingElement = null;

// ディスプレイ関数への参照（循環依存回避のため後から設定）
let displayElementInfoFn = null;

/**
 * displayElementInfo関数への参照を設定
 * @param {Function} fn - displayElementInfo関数
 */
export function setDisplayElementInfoFn(fn) {
  displayElementInfoFn = fn;
}

/**
 * 編集モードの状態を取得
 * @returns {boolean} 編集モードの状態
 */
export function isEditMode() {
  return editMode;
}

/**
 * 現在編集中の要素を取得
 * @returns {Object|null} 現在編集中の要素
 */
export function getCurrentEditingElement() {
  return currentEditingElement;
}

/**
 * 現在編集中の要素を設定
 * @param {Object} element - 要素情報 {idA, idB, elementType, modelSource}
 */
export function setCurrentEditingElement(element) {
  currentEditingElement = element;
}

/**
 * 修正履歴を取得
 * @returns {Array} 修正履歴配列
 */
export function getModifications() {
  return modifications;
}

/**
 * 編集モードの切り替え
 */
export function toggleEditMode() {
  editMode = !editMode;
  const editButton = document.getElementById('edit-mode-button');
  if (editButton) {
    editButton.textContent = editMode ? '終了' : '編集';
    if (editMode) {
      editButton.style.background = '#fff3cd';
      editButton.style.borderColor = '#ffeaa7';
      editButton.style.color = '#856404';
    } else {
      editButton.style.background = '#f8f9fa';
      editButton.style.borderColor = '#dee2e6';
      editButton.style.color = '#6c757d';
    }
  }

  // 現在表示中の要素を再表示して編集UIを反映
  if (currentEditingElement && displayElementInfoFn) {
    const { idA, idB, elementType, modelSource } = currentEditingElement;
    displayElementInfoFn(idA, idB, elementType, modelSource);
  }
}

/**
 * 修正をエクスポート
 */
export function exportModifications() {
  if (modifications.length === 0) {
    showWarning('修正がありません。');
    return;
  }

  // モデルAまたはBのドキュメントを選択
  const sourceDoc = window.docA || window.docB;
  if (!sourceDoc) {
    showWarning('エクスポート対象のドキュメントがありません。');
    return;
  }

  // エクスポート前のバリデーション
  const validation = validateDocumentForExport(sourceDoc);

  // ユーザーに確認
  const proceed = confirm(
    `${modifications.length}件の修正をエクスポートしますか？\n\n` +
      `バリデーション: ${validation.message}`,
  );

  if (proceed) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `modified_stb_${timestamp}.stb`;

    exportModifiedStb(sourceDoc, modifications, filename).then((success) => {
      if (success) {
        showSuccess(`STBファイルが正常にエクスポートされました。ファイル名: ${filename}`);

        // 修正レポートも生成
        const report = generateModificationReport(modifications);
      } else {
        showError('エクスポートに失敗しました。コンソールでエラーを確認してください。');
      }
    });
  }
}

/**
 * 属性値を編集（新しいParameterEditorを使用）
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} attributeName - 属性名
 * @param {string} currentValue - 現在の値
 */
export async function editAttributeValue(elementType, elementId, attributeName, currentValue) {
  // 編集開始イベントを発行
  eventBus.emit(EditEvents.EDIT_STARTED, {
    elementType,
    elementId,
    attributeName,
    currentValue,
    timestamp: Date.now(),
  });

  try {
    const suggestionEngine = getSuggestionEngine();
    const parameterEditor = getParameterEditor();

    // サジェスト候補を取得
    const suggestions = suggestionEngine
      ? suggestionEngine.getSuggestions(elementType, attributeName, { currentValue, elementId })
      : [];

    // 属性情報を取得
    const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
    const attrInfo = getAttributeInfo(tagName, attributeName);

    // ParameterEditorの設定
    const coordinateAttrNames = ['x', 'y', 'z'];
    const forceFreeText =
      elementType === 'Node' && coordinateAttrNames.includes((attributeName || '').toLowerCase());

    const config = {
      attributeName,
      currentValue: currentValue || '',
      suggestions,
      elementType,
      elementId,
      allowFreeText: forceFreeText || !attrInfo || !suggestions.length || suggestions.length > 10,
      required: attrInfo ? attrInfo.required : false,
    };

    // ParameterEditorモーダルを表示
    if (!parameterEditor) {
      log.warn('ParameterEditor not available');
      return;
    }
    const newValue = await parameterEditor.show(config);

    if (newValue === null) {
      // 編集キャンセルイベントを発行
      eventBus.emit(EditEvents.EDIT_CANCELLED, {
        elementType,
        elementId,
        attributeName,
        timestamp: Date.now(),
      });
      return; // キャンセル
    }

    // 使用統計を記録
    if (suggestionEngine) {
      suggestionEngine.recordUsage(elementType, attributeName, newValue);
    }

    // 修正を記録
    modifications.push({
      elementType,
      id: elementId,
      attribute: attributeName,
      oldValue: currentValue,
      newValue: newValue,
    });

    // XMLドキュメントを直接更新（モデルAのみ編集可能）
    const success = await updateXMLAndGeometry(elementType, elementId, attributeName, newValue);

    if (!success) {
      log.warn('ジオメトリ更新に失敗しましたが、修正履歴には記録されました');
    }

    // UIを更新（現在の要素を再表示）
    if (currentEditingElement && displayElementInfoFn) {
      const { idA, idB, modelSource } = currentEditingElement;
      displayElementInfoFn(idA, idB, elementType, modelSource);
    }

    updateEditingSummary();
  } catch (error) {
    log.error('属性編集中にエラーが発生しました:', error);

    // フォールバック: 従来のprompt()を使用
    const newValue = prompt(
      `属性「${attributeName}」の新しい値を入力してください:`,
      currentValue || '',
    );

    if (newValue === null) {
      // 編集キャンセルイベントを発行
      eventBus.emit(EditEvents.EDIT_CANCELLED, {
        elementType,
        elementId,
        attributeName,
        timestamp: Date.now(),
      });
      return; // キャンセル
    }

    // XSDバリデーション
    if (isSchemaLoaded()) {
      const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
      const validation = validateAttributeValue(tagName, attributeName, newValue);

      if (!validation.valid) {
        const proceed = confirm(
          `警告: ${validation.error}\n\n` +
            (validation.suggestions ? `推奨値: ${validation.suggestions.join(', ')}\n\n` : '') +
            'それでも続行しますか？',
        );
        if (!proceed) return;
      }
    }

    // 修正を記録
    modifications.push({
      elementType,
      id: elementId,
      attribute: attributeName,
      oldValue: currentValue,
      newValue: newValue,
    });

    // XMLドキュメントを直接更新（モデルAのみ編集可能）
    const success = await updateXMLAndGeometry(elementType, elementId, attributeName, newValue);

    if (!success) {
      log.warn('ジオメトリ更新に失敗しましたが、修正履歴には記録されました');
    }

    // UIを更新
    if (currentEditingElement && displayElementInfoFn) {
      const { idA, idB, modelSource } = currentEditingElement;
      displayElementInfoFn(idA, idB, elementType, modelSource);
    }

    updateEditingSummary();
  }
}

/**
 * XMLドキュメントを更新してジオメトリを再生成
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} attributeName - 属性名
 * @param {string} newValue - 新しい値
 * @returns {Promise<boolean>} 更新成功可否
 */
async function updateXMLAndGeometry(elementType, elementId, attributeName, newValue) {
  try {
    // モデルAのXMLドキュメントを取得
    const doc = window.docA;
    if (!doc) {
      log.error('docA not found');
      return false;
    }

    // XMLから要素を検索
    const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
    const element = doc.querySelector(`${tagName}[id="${elementId}"]`);

    if (!element) {
      log.error(`Element ${tagName}[id="${elementId}"] not found in docA`);
      return false;
    }

    // 更新前の値を保存
    const oldValue = element.getAttribute(attributeName);

    // 属性を更新
    if (newValue === null || newValue === undefined || newValue === '') {
      element.removeAttribute(attributeName);
    } else {
      element.setAttribute(attributeName, newValue);
    }

    // 属性変更イベントを発行
    eventBus.emit(EditEvents.ATTRIBUTE_CHANGED, {
      elementType,
      elementId,
      attributeName,
      oldValue,
      newValue,
      modelSource: 'modelA',
      timestamp: Date.now(),
    });

    // 断面関連の属性の場合、ジオメトリを再生成
    const geometryAffectingAttributes = [
      'id_section',
      'shape',
      'strength_name',
      'offset_bottom_X',
      'offset_bottom_Y',
      'offset_top_X',
      'offset_top_Y',
      'rotate',
      'X',
      'Y',
      'Z', // ノード座標
      'id_node_bottom',
      'id_node_top',
      'id_node_start',
      'id_node_end', // ノード参照
    ];

    const shouldRegenerateGeometry = geometryAffectingAttributes.includes(attributeName);
    const updatedElementData = buildElementDataForLabels(elementType, element, doc);

    if (shouldRegenerateGeometry) {
      const success = await regenerateElementGeometry(elementType, elementId, 'modelA');

      refreshElementLabels(elementType, elementId, updatedElementData);

      // ジオメトリ再生成イベントを発行
      eventBus.emit(EditEvents.GEOMETRY_REGENERATED, {
        elementType,
        elementId,
        success,
        timestamp: Date.now(),
      });

      if (!success) {
        log.warn('Geometry regeneration failed');
      }

      return success;
    } else {
      // ジオメトリに影響しない属性の場合は、UI更新のみ

      refreshElementLabels(elementType, elementId, updatedElementData);

      // レンダリング更新イベントを発行
      eventBus.emit(RenderEvents.REQUEST_ELEMENT_RERENDER, {
        elementType,
        elementId,
        reason: 'attributeEdit',
      });

      // レンダリング更新（色や表示プロパティが変更された可能性）
      scheduleRender();

      return true;
    }
  } catch (error) {
    log.error('Error updating XML and geometry:', error);
    return false;
  }
}

/**
 * 要素のラベルを更新
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {Object} elementData - 要素データ
 */
function refreshElementLabels(elementType, elementId, elementData) {
  try {
    updateLabelsForElement(elementType, elementId, elementData);
  } catch (error) {
    log.warn(`Failed to refresh labels for ${elementType} ${elementId}:`, error);
  }
}

/**
 * 編集サマリーを更新
 */
export function updateEditingSummary() {
  const summaryElement = document.getElementById('editing-summary');
  if (summaryElement) {
    summaryElement.innerHTML = `
      修正: ${modifications.length}件
      ${
        modifications.length > 0
          ? '<button id="export-btn" style="font-size: 0.6em; padding: 1px 4px; margin-left: 3px; background: #d4edda; border: 1px solid #c3e6cb; color: #155724;" onclick="window.exportModifications()">出力</button>'
          : ''
      }
      ${
        modifications.length > 0
          ? '<button id="clear-modifications-btn" style="font-size: 0.6em; padding: 1px 4px; margin-left: 2px; background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24;" onclick="window.clearModifications()">削除</button>'
          : ''
      }
    `;
  }
}

/**
 * 修正履歴をクリア
 */
export function clearModifications() {
  if (modifications.length === 0) return;

  const proceed = confirm(`${modifications.length}件の修正履歴をクリアしますか？`);
  if (proceed) {
    modifications = [];
    updateEditingSummary();
  }
}

// グローバル関数として登録（HTML内のonclickから呼び出すため）
// Node.js環境ではwindowが存在しないため、チェックを追加
if (typeof window !== 'undefined') {
  window.exportModifications = exportModifications;
  window.clearModifications = clearModifications;
  window.toggleEditMode = toggleEditMode;
  window.editAttribute = editAttributeValue;
}
