/**
 * @fileoverview 編集モード機能
 *
 * 要素パラメータの編集、修正履歴の管理、エクスポート機能を提供します。
 * XMLドキュメントの更新と EditEvents.ATTRIBUTE_CHANGED の発行までを担当し、
 * キャッシュ反映・再比較・3D再描画は editComparisonSyncController /
 * editGeometrySyncController が行います。
 *
 * id属性を持たない断面子要素（フィギュア要素等）は editPath.js の
 * パスアドレッシングで特定します。
 */

import { createLogger } from '../../../utils/logger.js';
import {
  isSchemaLoaded,
  getAttributeInfo,
  validateAttributeValue,
} from '../../../common-stb/import/parser/jsonSchemaLoader.js';
import { detectStbVersion } from '../../../common-stb/import/parser/utils/stbVersionDetection.js';

const log = createLogger('viewer:edit-mode');
import {
  exportStbDocument,
  validateDocumentForExport,
  generateModificationReport,
} from '../../../export/stb/stbExporter.js';
import { eventBus, EditEvents } from '../../../data/events/index.js';
import { getParameterEditor, getSuggestionEngine } from './ElementInfoProviders.js';
import { resolveElementEditPath, getEditPathAnchor } from './editPath.js';
import { showSuccess, showError, showWarning } from '../../common/toast.js';
import { getState } from '../../../data/state/globalState.js';
import { generateStbGuid } from '../../../common-stb/utils/guidUtil.js';
import {
  collectIdReferences,
  countIdReferences,
  applyIdReferenceUpdate,
} from '../../../common-stb/edit/idReferenceUpdater.js';

// 編集機能の状態管理
let editMode = false;
// 修正履歴（op 判別子付きコマンド履歴）:
//   { op: 'attr', elementType, id, path, attribute, oldValue, newValue } 属性編集
//   { op: 'add',  elementType, id } 要素追加（Undo で要素を削除）
//   { op: 'linkNodes', elementType, id, tagName, addedNodeIds } 既存の階・通り芯への節点後追い紐づけ（Undo で追加分を削除）
let modifications = [];
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
    editButton.textContent = editMode ? '✏️ 編集モード（ON）' : '✏️ 編集モード';
    editButton.classList.toggle('edit-mode-active', editMode);
  }

  // 現在表示中の要素を再表示して編集UIを反映
  if (currentEditingElement && displayElementInfoFn) {
    const { idA, idB, elementType, modelSource } = currentEditingElement;
    displayElementInfoFn(idA, idB, elementType, modelSource);
  }
}

/**
 * 修正済みドキュメントをエクスポート
 * 編集はdocumentAへ直接適用済みのため、ドキュメントをそのままシリアライズする
 */
export function exportModifications() {
  if (modifications.length === 0) {
    showWarning('修正がありません。');
    return;
  }

  // 編集はモデルAにのみ適用される
  const sourceDoc = getState('models.documentA');
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

    exportStbDocument(sourceDoc, { filename }).then((success) => {
      if (success) {
        showSuccess(`STBファイルが正常にエクスポートされました。ファイル名: ${filename}`);

        // 修正レポートも生成
        generateModificationReport(modifications);
      } else {
        showError('エクスポートに失敗しました。コンソールでエラーを確認してください。');
      }
    });
  }
}

/**
 * 自己同一性属性（id / guid）の専用入力設定を構築する。
 *
 * これらは「既存値から選択する」参照属性（id_section / id_node 等）とは意図が逆で、
 * 「重複しない一意な新規値を入力・生成する」用途。ParameterEditor へ generate（自動生成）
 * と extraValidate（id の一意性検証）を渡し、直接入力＋自動生成ボタンの専用入力を有効化する。
 * @param {string} attributeName - 属性名
 * @param {string} tagName - STB タグ名（例: 'StbColumn'）
 * @param {string} elementId - 編集対象の現在の id（自身との重複を許容するため）
 * @returns {{generate: () => string, generateLabel: string, inputHelp: string,
 *   extraValidate?: (value: string) => (string|null)}|null} 識別子でなければ null
 */
function buildIdentityEditConfig(attributeName, tagName, elementId) {
  if (attributeName === 'guid') {
    return {
      generate: () => generateStbGuid(),
      generateLabel: '🔄 自動生成',
      inputHelp: 'GUID を直接入力するか、自動生成してください（小文字16進32桁）',
    };
  }

  if (attributeName === 'id') {
    return {
      generate: () => {
        const doc = getState('models.documentA');
        return doc ? generateNextId(doc, tagName) : '';
      },
      generateLabel: '🔢 空き番号',
      inputHelp: '一意な番号を直接入力するか、空き番号を自動採番してください',
      extraValidate: (value) => validateUniqueId(tagName, elementId, value),
    };
  }

  return null;
}

/**
 * 編集後の id が同種要素（同一タグ名）の中で一意かを検証する。
 * 値が現在の id から変わっておらず、または重複が無ければ null、重複していればメッセージを返す。
 * @param {string} tagName - STB タグ名
 * @param {string} currentId - 編集前の id
 * @param {string} value - 入力された新しい id
 * @returns {string|null} 重複時のエラーメッセージ、問題なければ null
 */
function validateUniqueId(tagName, currentId, value) {
  const v = String(value ?? '').trim();
  if (!v || v === String(currentId ?? '')) return null;
  const doc = getState('models.documentA');
  if (!doc) return null;
  const dup = doc.querySelector(`${tagName}[id="${v.replace(/"/g, '\\"')}"]`);
  return dup ? `ID ${v} は既に ${tagName} で使用されています` : null;
}

/**
 * id のリナンバー（要素自身の id 変更）を、参照追従更新と確認ダイアログ付きで実行する。
 * 節点・断面の id 変更時は、これを参照する部材等（id_node 系属性・StbNodeId・
 * StbNodeIdOrder・id_section 系属性）を同一ドキュメント内で同時に更新し、整合した STB を保つ。
 * 履歴には {op:'renumberId'} を記録し、Undo で逆方向のリナンバーとして取り消す。
 * @param {string} elementType - 要素タイプ（'Node' / 'Column' / 'SecColumn_RC' 等）
 * @param {string} oldId - 変更前の id
 * @param {string} currentValue - 現在の id（oldId と同じ。比較用）
 * @param {string} newId - 変更後の id
 */
function handleIdRenumber(elementType, oldId, currentValue, newId) {
  const old = String(currentValue ?? oldId ?? '');
  const nw = String(newId ?? '');
  if (!nw || old === nw) return; // 変更なし

  const doc = getState('models.documentA');
  if (!doc) {
    showWarning('モデルAが読み込まれていません。');
    return;
  }

  const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
  const refCount = countIdReferences(doc, tagName, old);

  // 警告: id 変更が参照に波及することをユーザーへ確認する
  const proceed = confirm(
    `ID ${old} を ${nw} に変更します。\n\n` +
      (refCount > 0
        ? `このIDを参照している${refCount}件の要素も自動的に更新されます。\n`
        : 'このIDを参照している要素はありません。\n') +
      '続行しますか？',
  );
  if (!proceed) {
    eventBus.emit(EditEvents.EDIT_CANCELLED, {
      elementType,
      elementId: old,
      attributeName: 'id',
      timestamp: Date.now(),
    });
    return;
  }

  const result = applyIdRenumber(elementType, old, nw);
  if (!result.success) {
    showError('ID の変更に失敗しました。');
    return;
  }

  modifications.push({ op: 'renumberId', elementType, oldId: old, newId: nw });

  // 表示中の要素自身をリナンバーした場合は、再表示用の参照IDも追従させる
  if (currentEditingElement && String(currentEditingElement.idA) === old) {
    currentEditingElement.idA = nw;
  }
  if (currentEditingElement && displayElementInfoFn) {
    const { idA, idB, elementType: parentElementType, modelSource } = currentEditingElement;
    displayElementInfoFn(idA, idB, parentElementType, modelSource);
  }

  updateEditingSummary();
  showSuccess(
    result.refCount > 0
      ? `ID を ${nw} に変更し、参照 ${result.refCount}件を更新しました`
      : `ID を ${nw} に変更しました`,
  );
}

/**
 * id とその参照を oldId → newId へ書き換え、再比較・再描画パイプラインを起動する。
 * Undo では new→old を渡して逆方向に適用する（処理は対称）。
 * @param {string} elementType - 要素タイプ
 * @param {string} oldId - 変更前の id
 * @param {string} newId - 変更後の id
 * @returns {{success: boolean, refCount: number, category?: string}}
 */
function applyIdRenumber(elementType, oldId, newId) {
  const doc = getState('models.documentA');
  if (!doc) return { success: false, refCount: 0 };

  const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
  const owner = doc.querySelector(`${tagName}[id="${String(oldId).replace(/"/g, '\\"')}"]`);
  if (!owner) {
    log.error(`リナンバー対象が見つかりません: ${tagName}#${oldId}`);
    return { success: false, refCount: 0 };
  }

  const { category, refs } = collectIdReferences(doc, tagName, oldId);
  applyIdReferenceUpdate(refs, oldId, newId);
  owner.setAttribute('id', String(newId));

  emitRenumberEvents(category, elementType, oldId, newId);
  return { success: true, refCount: refs.length, category };
}

/**
 * リナンバー後の再比較・再描画イベントを発行する。
 * 節点は「旧IDの除去」→「新IDの反映（影響部材の再抽出）」の2段で通知し、
 * 既存の節点編集パイプライン（キャッシュ・nodeMap 同期）を再利用する。
 * @param {'node'|'section'|'other'} category
 * @param {string} elementType
 * @param {string} oldId
 * @param {string} newId
 */
function emitRenumberEvents(category, elementType, oldId, newId) {
  const base = {
    attributeName: 'id',
    oldValue: oldId,
    newValue: newId,
    modelSource: 'modelA',
  };
  if (category === 'node') {
    eventBus.emit(EditEvents.ATTRIBUTE_CHANGED, {
      ...base,
      elementType: 'Node',
      elementId: oldId,
      timestamp: Date.now(),
    });
    eventBus.emit(EditEvents.ATTRIBUTE_CHANGED, {
      ...base,
      elementType: 'Node',
      elementId: newId,
      timestamp: Date.now(),
    });
  } else {
    eventBus.emit(EditEvents.ATTRIBUTE_CHANGED, {
      ...base,
      elementType,
      elementId: newId,
      timestamp: Date.now(),
    });
  }
}

/**
 * 属性値を編集（ParameterEditorモーダル、失敗時はprompt()フォールバック）
 * @param {string} elementType - 要素タイプ（タグ名から 'Stb' を除いたもの）
 * @param {string} elementId - 要素ID（id属性を持たない要素は空文字）
 * @param {string} attributeName - 属性名
 * @param {string} currentValue - 現在の値
 * @param {{path?: string|null}} [options] - 編集パス（id属性を持たない子要素用）
 */
export async function editAttributeValue(
  elementType,
  elementId,
  attributeName,
  currentValue,
  options = {},
) {
  const editPath = options.path || null;

  // 編集開始イベントを発行
  eventBus.emit(EditEvents.EDIT_STARTED, {
    elementType,
    elementId,
    attributeName,
    currentValue,
    timestamp: Date.now(),
  });

  let newValue = null;
  // プレビュー状態（try/catch をまたいで参照するためスコープを外に出す）
  let provisionalApplied = false;
  let previewTimer = null;

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

    // プレビュー: 入力中の値をデバウンス付きで仮適用（modifications には追記しない）
    const onPreview = (previewValue) => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        applyAttributeEditToDocument(elementType, elementId, attributeName, previewValue, editPath);
        provisionalApplied = true;
      }, 400);
    };

    // 自己同一性属性（id / guid）は「既存値から選ぶ」のではなく「一意な新規値を入力・生成する」用途。
    // 既存値サジェストは重複を誘発するため使わず、直接入力＋自動生成（id は空き番号採番・重複検証付き）を提供する。
    const identity = buildIdentityEditConfig(attributeName, tagName, elementId);

    // id のリナンバーは参照追従を伴う確定処理として扱うため、入力中のライブ仮適用は行わない。
    const isIdRenumber = attributeName === 'id' && !editPath;

    const config = {
      attributeName,
      currentValue: currentValue || '',
      // 識別子は既存値サジェスト（＝重複候補）を出さない
      suggestions: identity ? [] : suggestions,
      elementType,
      elementId,
      // スキーマ定義（型・制約・列挙値）。ParameterEditor が入力コントロールの種別を決定する
      schema: attrInfo,
      allowFreeText:
        !!identity || forceFreeText || !attrInfo || !suggestions.length || suggestions.length > 10,
      required: attrInfo ? attrInfo.required : false,
      onPreview: isIdRenumber ? undefined : onPreview,
      // 識別子用の専用入力（直接入力＋自動生成ボタン）を有効化する
      ...(identity || {}),
    };

    // ParameterEditorモーダルを表示
    if (!parameterEditor) {
      log.warn('ParameterEditor not available');
      return;
    }
    newValue = await parameterEditor.show(config);
    clearTimeout(previewTimer);

    if (newValue !== null && suggestionEngine) {
      // 使用統計を記録
      suggestionEngine.recordUsage(elementType, attributeName, newValue);
    }
  } catch (error) {
    log.error('属性編集中にエラーが発生しました:', error);

    // フォールバック: 従来のprompt()を使用
    newValue = prompt(`属性「${attributeName}」の新しい値を入力してください:`, currentValue || '');

    // XSDバリデーション
    if (newValue !== null && isSchemaLoaded()) {
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
  }

  if (newValue === null) {
    // プレビューで仮適用済みなら元の値に rollback
    if (provisionalApplied) {
      applyAttributeEditToDocument(
        elementType,
        elementId,
        attributeName,
        currentValue || null,
        editPath,
      );
    }
    // 編集キャンセルイベントを発行
    eventBus.emit(EditEvents.EDIT_CANCELLED, {
      elementType,
      elementId,
      attributeName,
      timestamp: Date.now(),
    });
    return;
  }

  // id のリナンバー（自己IDの変更）は参照追従更新と確認ダイアログを伴う専用処理へ委譲する。
  if (attributeName === 'id' && !editPath) {
    handleIdRenumber(elementType, elementId, currentValue, newValue);
    return;
  }

  // 修正を記録
  modifications.push({
    op: 'attr',
    elementType,
    id: elementId,
    path: editPath,
    attribute: attributeName,
    oldValue: currentValue,
    newValue: newValue,
  });

  // XMLドキュメントを直接更新（モデルAのみ編集可能）
  const success = applyAttributeEditToDocument(
    elementType,
    elementId,
    attributeName,
    newValue,
    editPath,
  );

  if (!success) {
    log.warn('XML更新に失敗しましたが、修正履歴には記録されました');
  }

  // UIを更新（現在の要素を再表示）
  // 再表示は親部材（currentEditingElement）のタイプとIDで行う（断面ノード編集後も親部材パネルに戻す）
  if (currentEditingElement && displayElementInfoFn) {
    const { idA, idB, elementType: parentElementType, modelSource } = currentEditingElement;
    displayElementInfoFn(idA, idB, parentElementType, modelSource);
  }

  updateEditingSummary();
}

/**
 * XMLドキュメントの属性を更新し、ATTRIBUTE_CHANGED イベントを発行する。
 * キャッシュ反映・再比較・3D再描画・ラベル更新は購読側のコントローラーが行う。
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} attributeName - 属性名
 * @param {string} newValue - 新しい値
 * @param {string|null} [editPath] - 編集パス（id属性を持たない子要素用）
 * @returns {boolean} 更新成功可否
 */
function applyAttributeEditToDocument(elementType, elementId, attributeName, newValue, editPath) {
  try {
    // モデルAのXMLドキュメントを取得
    const doc = getState('models.documentA');
    if (!doc) {
      log.error('docA not found');
      return false;
    }

    // XMLから要素を検索（id無し子要素はパスで解決）
    let element;
    if (editPath) {
      element = resolveElementEditPath(doc, editPath);
    } else {
      const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
      element = doc.querySelector(`${tagName}[id="${elementId}"]`);
    }

    if (!element) {
      log.error(`編集対象要素が見つかりません: ${editPath || `${elementType}#${elementId}`}`);
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

    // 属性変更イベントの発行対象を決定。
    // パス編集（id無し子要素）の場合は、idを持つアンカー要素（断面ルート等）として通知し、
    // editComparisonSyncController が断面キャッシュ更新と影響部材の解決を行えるようにする。
    let emitElementType = elementType;
    let emitElementId = elementId;
    if (editPath) {
      const anchor = getEditPathAnchor(editPath);
      if (anchor?.tagName?.startsWith('Stb')) {
        emitElementType = anchor.tagName.slice(3);
        emitElementId = anchor.id;
      }
    }

    eventBus.emit(EditEvents.ATTRIBUTE_CHANGED, {
      elementType: emitElementType,
      elementId: emitElementId,
      attributeName,
      oldValue,
      newValue,
      modelSource: 'modelA',
      timestamp: Date.now(),
    });

    return true;
  } catch (error) {
    log.error('Error updating XML document:', error);
    return false;
  }
}

/**
 * 編集サマリーを更新
 */
export function updateEditingSummary() {
  const summaryElement = document.getElementById('editing-summary');
  if (!summaryElement) return;

  const count = modifications.length;
  summaryElement.innerHTML = `
    修正: ${count}件
    ${count > 0 ? '<button id="undo-modification-btn" class="edit-summary-btn edit-summary-btn-undo">元に戻す</button>' : ''}
    ${count > 0 ? '<button id="export-btn" class="edit-summary-btn edit-summary-btn-export">出力</button>' : ''}
    ${count > 0 ? '<button id="clear-modifications-btn" class="edit-summary-btn edit-summary-btn-clear">削除</button>' : ''}
  `;
  const undoBtn = summaryElement.querySelector('#undo-modification-btn');
  if (undoBtn) undoBtn.onclick = undoLastModification;
  const exportBtn = summaryElement.querySelector('#export-btn');
  if (exportBtn) exportBtn.onclick = exportModifications;
  const clearBtn = summaryElement.querySelector('#clear-modifications-btn');
  if (clearBtn) clearBtn.onclick = clearModifications;
}

/**
 * 直前の修正を元に戻す（Undo）
 * op に応じて逆操作を行い、同じ ATTRIBUTE_CHANGED パイプラインで再描画する。
 *   attr → oldValue を逆適用、add → 追加した要素を削除
 */
export function undoLastModification() {
  if (modifications.length === 0) return;

  const last = modifications[modifications.length - 1];

  let success;
  if (last.op === 'add') {
    // 要素追加の取り消し: XMLから要素を削除し、同パイプラインで再描画
    success = removeElementFromDocument(last.elementType, last.id, last.tagName);
  } else if (last.op === 'linkNodes') {
    // 後追い紐づけの取り消し: 追加した StbNodeId のみ削除
    success = unlinkNodesFromDocument(last);
  } else if (last.op === 'renumberId') {
    // id リナンバーの取り消し: new→old へ逆方向に適用（参照も追従）
    success = applyIdRenumber(last.elementType, last.newId, last.oldId).success;
    // 表示中要素が当該IDなら参照IDを戻す
    if (
      success &&
      currentEditingElement &&
      String(currentEditingElement.idA) === String(last.newId)
    ) {
      currentEditingElement.idA = String(last.oldId);
    }
  } else {
    // 属性編集の取り消し: oldValue を逆適用
    success = applyAttributeEditToDocument(
      last.elementType,
      last.id,
      last.attribute,
      last.oldValue,
      last.path,
    );
  }

  if (success) {
    modifications.pop();
    updateEditingSummary();
    if (currentEditingElement && displayElementInfoFn) {
      const { idA, idB, elementType, modelSource } = currentEditingElement;
      displayElementInfoFn(idA, idB, elementType, modelSource);
    }
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

// ============================================================================
// 新規部材の配置（Phase 6）
// ============================================================================

/**
 * 新規部材タイプごとの XML 定義。
 * - tagName: STB要素タグ名
 * - container: StbModel 直下からのコンテナパス（無ければ生成する）
 * - required: 必須属性名（未指定は追加を拒否）
 * - hasName: name 属性を持つ要素か（StbNode は持たない）。STB 2.0.x では name が
 *   XSD 必須のため、addNewMember が未入力時に自動採番する判定に用いる。
 * - nodeList: 面材（節点列を StbNodeIdOrder 子要素で持つ）か
 * - defaults: 省略時に補完する属性のデフォルト値
 * @type {Object<string, {tagName: string, container: string[], required: string[], hasName?: boolean, nodeList?: boolean, defaults: Object<string,string>}>}
 */
const NEW_MEMBER_DEFINITIONS = {
  Node: {
    tagName: 'StbNode',
    container: ['StbNodes'],
    required: ['X', 'Y', 'Z'],
    defaults: { kind: 'ON_GIRDER' },
  },
  Column: {
    tagName: 'StbColumn',
    container: ['StbMembers', 'StbColumns'],
    required: ['id_node_bottom', 'id_node_top', 'id_section'],
    hasName: true,
    defaults: { kind_structure: 'S', rotate: '0' },
  },
  Post: {
    tagName: 'StbPost',
    container: ['StbMembers', 'StbPosts'],
    required: ['id_node_bottom', 'id_node_top', 'id_section'],
    hasName: true,
    defaults: { kind_structure: 'S', rotate: '0' },
  },
  Girder: {
    tagName: 'StbGirder',
    container: ['StbMembers', 'StbGirders'],
    required: ['id_node_start', 'id_node_end', 'id_section'],
    hasName: true,
    defaults: { kind_structure: 'S', rotate: '0' },
  },
  Beam: {
    tagName: 'StbBeam',
    container: ['StbMembers', 'StbBeams'],
    required: ['id_node_start', 'id_node_end', 'id_section'],
    hasName: true,
    defaults: { kind_structure: 'S', rotate: '0' },
  },
  Brace: {
    tagName: 'StbBrace',
    container: ['StbMembers', 'StbBraces'],
    required: ['id_node_start', 'id_node_end', 'id_section'],
    hasName: true,
    defaults: { kind_structure: 'S', rotate: '0' },
  },
  // 面材: 2節点の線材と異なり、3点以上の節点列を StbNodeIdOrder 子要素で定義する。
  // nodeList:true の場合、addNewMember が node_ids（string[]）から StbNodeIdOrder を生成する。
  Slab: {
    tagName: 'StbSlab',
    container: ['StbMembers', 'StbSlabs'],
    required: ['id_section', 'kind_structure', 'kind_slab', 'isFoundation'],
    nodeList: true,
    hasName: true,
    defaults: { kind_structure: 'RC', kind_slab: 'NORMAL', isFoundation: 'false' },
  },
  Wall: {
    tagName: 'StbWall',
    container: ['StbMembers', 'StbWalls'],
    required: ['id_section', 'kind_structure', 'kind_layout'],
    nodeList: true,
    hasName: true,
    defaults: { kind_structure: 'RC', kind_layout: 'ON_GIRDER' },
  },
  // 基礎・パラペット: 子要素を持たず属性のみで定義する（StbNodeIdOrder は不要）。
  // 杭・基礎・基礎柱は1節点（id_node）で配置する点部材、パラペットは2節点線材。
  Pile: {
    tagName: 'StbPile',
    container: ['StbMembers', 'StbPiles'],
    required: ['id_node', 'id_section', 'kind_structure'],
    hasName: true,
    defaults: { kind_structure: 'RC', level_top: '0' },
  },
  Footing: {
    tagName: 'StbFooting',
    container: ['StbMembers', 'StbFootings'],
    required: ['id_node', 'id_section'],
    hasName: true,
    defaults: { level_bottom: '0', rotate: '0' },
  },
  // 基礎柱は id_section（単一）を持たず id_section_FD（基礎部・描画上の実質必須）と
  // id_section_WR（立上り部・任意）の2断面で定義する。
  FoundationColumn: {
    tagName: 'StbFoundationColumn',
    container: ['StbMembers', 'StbFoundationColumns'],
    required: ['id_node', 'kind_structure', 'id_section_FD'],
    hasName: true,
    defaults: { kind_structure: 'RC', rotate: '0' },
  },
  Parapet: {
    tagName: 'StbParapet',
    container: ['StbMembers', 'StbParapets'],
    required: ['id_node_start', 'id_node_end', 'id_section', 'kind_structure', 'kind_layout'],
    hasName: true,
    defaults: { kind_structure: 'RC', kind_layout: 'ON_GIRDER', offset: '0' },
  },
  // 階・通り芯: 部材ではなくモデルの基準情報。節点を StbNodeIdList 子要素で「紐づける」点が特徴。
  // nodeIdList:true の場合、addNewMember が node_ids（任意・0個可）から StbNodeIdList > StbNodeId を生成する。
  Story: {
    tagName: 'StbStory',
    container: ['StbStories'],
    required: ['name', 'height'],
    hasName: true,
    nodeIdList: true,
    defaults: { kind: 'GENERAL' },
  },
  // 通り芯は StbAxes > StbParallelAxes/StbArcAxes/StbRadialAxes[group_name] > StbXxxAxis の入れ子構造。
  // コンテナは group（グループ名）により動的に決まるため container は使わず axisGroup フラグで分岐する。
  // axisContainerTag: 軸グループ要素のタグ。groupAttrFields: 入力フィールド→グループ要素属性の対応
  // （グループ新設時のみ使用。group_name は別途設定）。これらと group/node_ids は軸要素の属性ループから除外する。
  Axis: {
    tagName: 'StbParallelAxis',
    axisGroup: true,
    axisContainerTag: 'StbParallelAxes',
    groupAttrFields: [],
    required: ['group', 'name', 'distance'],
    hasName: true,
    nodeIdList: true,
    defaults: { group: 'X', distance: '0' },
  },
  // 円弧軸: StbArcAxes（中心 X/Y・開始/終了角）配下に StbArcAxis（name・radius）。
  ArcAxis: {
    tagName: 'StbArcAxis',
    axisGroup: true,
    axisContainerTag: 'StbArcAxes',
    groupAttrFields: [
      { field: 'center_x', attr: 'X', default: '0.0' },
      { field: 'center_y', attr: 'Y', default: '0.0' },
      // stb:angle は [0,360)。360 は maxExclusive のため不正値。既定は 0〜90 の円弧。
      { field: 'start_angle', attr: 'start_angle', default: '0' },
      { field: 'end_angle', attr: 'end_angle', default: '90' },
    ],
    required: ['group', 'name', 'radius'],
    hasName: true,
    nodeIdList: true,
    // group は X/Y（または *_X/*_Y）のときのみレンダラ（drawAxes）が描画・選択対象にするため既定は 'X'。
    // radius は stb:length（>0）。既定は 1000mm。
    defaults: { group: 'X', radius: '1000' },
  },
  // 放射軸: StbRadialAxes（中心 X/Y）配下に StbRadialAxis（name・angle）。
  RadialAxis: {
    tagName: 'StbRadialAxis',
    axisGroup: true,
    axisContainerTag: 'StbRadialAxes',
    groupAttrFields: [
      { field: 'center_x', attr: 'X', default: '0.0' },
      { field: 'center_y', attr: 'Y', default: '0.0' },
    ],
    required: ['group', 'name', 'angle'],
    hasName: true,
    nodeIdList: true,
    // group は X/Y のときのみ描画・選択対象。angle は stb:angle（[0,360)）で 0 は有効。
    defaults: { group: 'X', angle: '0' },
  },
};

/** 通り芯グループ（StbParallelAxes）を新設する際の既定属性。SS7→STB 出力と同じ角度を用いる。 */
const AXIS_GROUP_DEFAULTS = {
  X: { angle: '90.0' },
  Y: { angle: '0.0' },
};

/**
 * 配置可能な新規部材タイプの定義を取得する（UI 用）。
 * @returns {Object<string, {tagName: string, container: string[], required: string[], defaults: Object<string,string>}>}
 */
export function getNewMemberDefinitions() {
  return NEW_MEMBER_DEFINITIONS;
}

/**
 * 親要素の直下から指定タグ名の子要素を返す（querySelector は子孫も拾うため使わない）。
 * @param {Element} parent
 * @param {string} tagName
 * @returns {Element|null}
 */
function findDirectChild(parent, tagName) {
  for (const child of parent.children) {
    if (child.tagName === tagName) return child;
  }
  return null;
}

/** XSD sequence 順を持つ親要素ごとの子要素順序（ST-Bridge 2.1.x XSD 準拠）。新規子はこの順序を保って挿入する。 */
const CHILD_ORDER_BY_PARENT = {
  StbModel: [
    'StbNodes',
    'StbAxes',
    'StbStories',
    'StbMembers',
    'StbSections',
    'StbJoints',
    'StbConnections',
    'StbWeld',
  ],
  StbAxes: ['StbParallelAxes', 'StbArcAxes', 'StbRadialAxes', 'StbDrawingAxes'],
};

/**
 * 子要素を XSD の sequence 順を保って親へ挿入する。順序定義に無い要素や対象外の親では
 * 末尾へ追加する（既存挙動を維持）。StbAxes/StbStories や円弧/放射軸グループを後発で
 * 作成した際に sequence 順を崩してバリデーションエラーになるのを防ぐ。
 * @param {Element} parent
 * @param {Element} child
 */
function insertChildInOrder(parent, child) {
  const order = CHILD_ORDER_BY_PARENT[parent.tagName] || null;
  const targetIndex = order ? order.indexOf(child.tagName) : -1;
  if (targetIndex < 0) {
    parent.appendChild(child);
    return;
  }
  // 自分より後ろに並ぶべき最初の既存子の前に挿入する。
  for (const existing of parent.children) {
    const existingIndex = order.indexOf(existing.tagName);
    if (existingIndex > targetIndex) {
      parent.insertBefore(child, existing);
      return;
    }
  }
  parent.appendChild(child);
}

/**
 * StbModel 直下からコンテナパスを辿り、無ければ生成して末端コンテナを返す。
 * 既定名前空間（xmlns）を親から継承するため createElementNS を用いる。
 * @param {Document} doc
 * @param {string[]} pathTags - 例 ['StbMembers', 'StbColumns']
 * @returns {Element|null} 末端コンテナ要素（StbModel が無い場合は null）
 */
function ensureContainer(doc, pathTags) {
  let parent = doc.querySelector('StbModel');
  if (!parent) return null;

  const ns = parent.namespaceURI;
  for (const tag of pathTags) {
    let child = findDirectChild(parent, tag);
    if (!child) {
      child = ns ? doc.createElementNS(ns, tag) : doc.createElement(tag);
      insertChildInOrder(parent, child);
    }
    parent = child;
  }
  return parent;
}

/**
 * 軸の所属グループ（StbAxes > containerTag[group_name=group]）を辿り、無ければ生成して返す。
 * 返したグループ要素が個々の軸要素（StbParallelAxis 等）を追加する直接の親となる。
 * グループ新設時は def に応じたグループ属性（StbParallelAxes は角度、円弧/放射は中心/角度）を設定する。
 * @param {Document} doc
 * @param {{axisContainerTag: string, groupAttrFields?: Array<{field:string,attr:string,default:string}>}} def
 * @param {Object<string,string>} attrs - 入力属性（group=グループ名、グループ属性フィールドを含む）
 * @returns {Element|null} 軸グループ要素（StbModel が無い場合は null）
 */
function ensureAxisGroup(doc, def, attrs) {
  const model = doc.querySelector('StbModel');
  if (!model) return null;

  const group = String(attrs.group ?? def.defaults?.group ?? '').trim();
  const ns = model.namespaceURI;
  const create = (tag) => (ns ? doc.createElementNS(ns, tag) : doc.createElement(tag));

  let axes = findDirectChild(model, 'StbAxes');
  if (!axes) {
    axes = create('StbAxes');
    insertChildInOrder(model, axes);
  }

  for (const child of axes.children) {
    if (child.tagName === def.axisContainerTag && child.getAttribute('group_name') === group) {
      return child;
    }
  }

  const groupEl = create(def.axisContainerTag);
  groupEl.setAttribute('group_name', group);
  if (def.axisContainerTag === 'StbParallelAxes') {
    // 平行軸グループは中心 0,0・角度は X/Y で既定（SS7→STB 出力と同じ）
    groupEl.setAttribute('X', '0.0');
    groupEl.setAttribute('Y', '0.0');
    groupEl.setAttribute('angle', (AXIS_GROUP_DEFAULTS[group] || AXIS_GROUP_DEFAULTS.Y).angle);
  } else {
    // 円弧/放射軸グループは入力フィールド（中心・角度）からグループ属性を設定する
    for (const { field, attr, default: dflt } of def.groupAttrFields || []) {
      const raw = attrs[field];
      groupEl.setAttribute(attr, String(raw === undefined || raw === '' ? dflt : raw));
    }
  }
  insertChildInOrder(axes, groupEl);
  return groupEl;
}

/**
 * 面材の節点列を string[] に正規化する。配列・スペース区切り文字列の双方を受け付け、
 * 空要素を除去する（順序は保持する）。
 * @param {string[]|string|undefined} src
 * @returns {string[]}
 */
function normalizeNodeIds(src) {
  const arr = Array.isArray(src)
    ? src
    : String(src ?? '')
        .trim()
        .split(/\s+/);
  return arr.map((v) => String(v).trim()).filter(Boolean);
}

/**
 * 指定タグ名の既存IDの最大値＋1を新規IDとして採番する。
 * 階・通り芯（global=true）は他要素と同じ id 空間で一意にする必要があるため、
 * モデル全体（全要素）の最大 id を基準にする（疎な id を持つ階・通り芯が部材 id と衝突するのを防ぐ）。
 * @param {Document} doc
 * @param {string} tagName
 * @param {{global?: boolean}} [options]
 * @returns {string}
 */
function generateNextId(doc, tagName, { global = false } = {}) {
  let maxId = 0;
  const elements = global ? doc.querySelectorAll('[id]') : doc.querySelectorAll(tagName);
  for (const el of elements) {
    const id = parseInt(el.getAttribute('id'), 10);
    if (Number.isFinite(id) && id > maxId) maxId = id;
  }
  return String(maxId + 1);
}

/**
 * 要素の追加・削除後に「型単位の再抽出 → 再比較 → 再描画」パイプラインを起動する。
 * 属性変更ではなく要素構成の変化のため、attributeName/oldValue/newValue は null で発行する。
 * @param {string} elementType - タグ名から 'Stb' を除いたタイプ
 * @param {string} elementId - 追加・削除した要素の id
 */
function emitStructuralChange(elementType, elementId) {
  eventBus.emit(EditEvents.ATTRIBUTE_CHANGED, {
    elementType,
    elementId,
    attributeName: null,
    oldValue: null,
    newValue: null,
    modelSource: 'modelA',
    timestamp: Date.now(),
  });
}

/**
 * 新規部材を documentA に追加し、ATTRIBUTE_CHANGED で再比較・再描画パイプラインを起動する。
 * 履歴には {op:'add'} を記録し、Undo で削除できるようにする。
 * 面材（definition.nodeList=true）の場合、attrs.node_ids（string[]）から StbNodeIdOrder 子要素を生成する。
 * 階・通り芯（definition.nodeIdList=true）の場合、attrs.node_ids（任意）から StbNodeIdList 子要素を生成し、節点を紐づける。
 * 軸（definition.axisGroup=true）は attrs.group（グループ名）に応じた軸グループ（StbParallelAxes/StbArcAxes/StbRadialAxes）配下へ追加する。
 * @param {string} elementType - NEW_MEMBER_DEFINITIONS のキー（'Node' | 'Column' | 'Post' | 'Girder' | 'Beam' | 'Brace' | 'Slab' | 'Wall' | 'Pile' | 'Footing' | 'FoundationColumn' | 'Parapet' | 'Story' | 'Axis' | 'ArcAxis' | 'RadialAxis'）
 * @param {Object<string,string|string[]>} attrs - 属性値（id は自動採番、必須属性は definition.required）。面材・階・通り芯は node_ids に節点列を持つ。
 * @returns {{success: boolean, id: string|null, error?: string}}
 */
export function addNewMember(elementType, attrs = {}) {
  const def = NEW_MEMBER_DEFINITIONS[elementType];
  if (!def) {
    return { success: false, id: null, error: `未対応の部材タイプ: ${elementType}` };
  }

  const doc = getState('models.documentA');
  if (!doc) {
    return { success: false, id: null, error: 'モデルAが読み込まれていません' };
  }

  // 必須属性チェック
  const missing = def.required.filter((key) => {
    const v = attrs[key];
    return v === undefined || v === null || String(v).trim() === '';
  });
  if (missing.length > 0) {
    return { success: false, id: null, error: `必須項目が未入力です: ${missing.join(', ')}` };
  }

  // 面材は節点列（3点以上）を要求する。階・通り芯（nodeIdList）は任意（0個可）。
  const nodeIds = def.nodeList ? normalizeNodeIds(attrs.node_ids) : null;
  if (def.nodeList && nodeIds.length < 3) {
    return { success: false, id: null, error: '面材には3点以上の節点が必要です' };
  }
  // 階・通り芯に紐づける任意の節点列（StbNodeIdList 子要素として書き出す）
  const linkedNodeIds = def.nodeIdList ? normalizeNodeIds(attrs.node_ids) : null;

  // 軸（平行/円弧/放射）はグループ配下に追加するためコンテナを動的に解決する。
  const container = def.axisGroup
    ? ensureAxisGroup(doc, def, attrs)
    : ensureContainer(doc, def.container);
  if (!container) {
    return { success: false, id: null, error: 'StbModel が見つかりません' };
  }

  const ns = container.namespaceURI;
  const element = ns ? doc.createElementNS(ns, def.tagName) : doc.createElement(def.tagName);

  // 階・通り芯は部材と同じ id 空間で一意にする（モデル全体で採番）
  const id = generateNextId(doc, def.tagName, { global: def.nodeIdList === true });
  element.setAttribute('id', id);

  // デフォルト＋入力値を設定（入力値が優先）。node_ids は属性ではないため除外する。
  const merged = { ...def.defaults, ...attrs };

  // モデルAのバージョンに合わせる: name 属性は STB 2.0.x では XSD 必須・2.1.x では任意。
  // 直接作成フォームは name を入力させないため、2.1.x 以外（2.0.x / 判定不能）かつ
  // name 属性を持つ部材では自動採番し、追加した要素が読み込み元バージョンで妥当になるようにする。
  const version = detectStbVersion(doc);
  const is21x = version === '2.1.0' || version === '2.1.1';
  if (def.hasName && !is21x && !String(merged.name ?? '').trim()) {
    merged.name = `${def.tagName.replace(/^Stb/, '')}${id}`;
  }
  // node_ids は子要素、group はグループ名、グループ属性フィールド（中心・角度）は親グループ要素の
  // 属性として扱うため、いずれも軸要素自身の属性にはしない。
  const groupFieldKeys = new Set((def.groupAttrFields || []).map((f) => f.field));
  for (const [key, value] of Object.entries(merged)) {
    if (key === 'node_ids' || key === 'group' || groupFieldKeys.has(key)) continue;
    if (value === undefined || value === null || String(value).trim() === '') continue;
    element.setAttribute(key, String(value));
  }

  // 面材: 節点列を StbNodeIdOrder 子要素（スペース区切りテキスト）として追加する
  if (def.nodeList) {
    const orderEl = ns
      ? doc.createElementNS(ns, 'StbNodeIdOrder')
      : doc.createElement('StbNodeIdOrder');
    orderEl.textContent = nodeIds.join(' ');
    element.appendChild(orderEl);
  }

  // 階・通り芯: 紐づける節点を StbNodeIdList > StbNodeId 子要素として追加する（0個なら省略）
  if (def.nodeIdList && linkedNodeIds.length > 0) {
    const listEl = ns
      ? doc.createElementNS(ns, 'StbNodeIdList')
      : doc.createElement('StbNodeIdList');
    for (const nodeId of linkedNodeIds) {
      const idEl = ns ? doc.createElementNS(ns, 'StbNodeId') : doc.createElement('StbNodeId');
      idEl.setAttribute('id', nodeId);
      listEl.appendChild(idEl);
    }
    element.appendChild(listEl);
  }

  container.appendChild(element);

  // 履歴に追加（Undo 対象）
  modifications.push({ op: 'add', elementType, id, tagName: def.tagName });

  // 既存パイプラインを起動（部材タイプの全要素を再抽出 → 再比較 → 型単位再描画）
  emitStructuralChange(elementType, id);

  updateEditingSummary();
  showSuccess(`${def.tagName} #${id} を追加しました`);
  return { success: true, id };
}

/** 節点紐づけ対象タイプ → XML タグ名（既存の階・通り芯への後追い紐づけで使用） */
const NODE_LINK_TAGS = {
  Story: 'StbStory',
  Axis: 'StbParallelAxis',
  ArcAxis: 'StbArcAxis',
  RadialAxis: 'StbRadialAxis',
};

/**
 * 後追い紐づけの対象になる既存要素（階・各種通り芯）の一覧を取得する（UI のセレクト用）。
 * 通り芯は所属グループ名を併記してラベル化する。
 * @param {string} elementType - 'Story' | 'Axis' | 'ArcAxis' | 'RadialAxis'
 * @returns {Array<{id: string, label: string}>}
 */
export function getNodeLinkTargets(elementType) {
  const tagName = NODE_LINK_TAGS[elementType];
  const doc = getState('models.documentA');
  if (!tagName || !doc) return [];
  const result = [];
  for (const el of doc.querySelectorAll(tagName)) {
    const id = el.getAttribute('id');
    if (!id) continue;
    const name = el.getAttribute('name') || '';
    const groupName =
      elementType === 'Story' ? '' : el.parentNode?.getAttribute?.('group_name') || '';
    const parts = [name, groupName ? `(${groupName})` : ''].filter(Boolean).join(' ');
    result.push({ id, label: parts ? `#${id} ${parts}` : `#${id}` });
  }
  return result.sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * 既存の階・通り芯（StbStory/StbParallelAxis/StbArcAxis/StbRadialAxis）へ節点を後追いで紐づける。
 * 対象要素の StbNodeIdList（無ければ生成）へ未登録の節点のみ StbNodeId を追加する（xs:key の重複を防ぐ）。
 * 履歴には {op:'linkNodes', addedNodeIds} を記録し、Undo で追加分のみ取り消す。
 * @param {string} elementType - 'Story' | 'Axis' | 'ArcAxis' | 'RadialAxis'
 * @param {string} elementId - 対象要素の id
 * @param {string[]|string} nodeIdsInput - 紐づける節点ID（配列またはスペース区切り）
 * @returns {{success: boolean, added: number, error?: string}}
 */
export function linkNodesToExisting(elementType, elementId, nodeIdsInput) {
  const tagName = NODE_LINK_TAGS[elementType];
  if (!tagName) {
    return { success: false, added: 0, error: `未対応の紐づけ対象: ${elementType}` };
  }
  const doc = getState('models.documentA');
  if (!doc) {
    return { success: false, added: 0, error: 'モデルAが読み込まれていません' };
  }
  const target = doc.querySelector(`${tagName}[id="${String(elementId).replace(/"/g, '\\"')}"]`);
  if (!target) {
    return { success: false, added: 0, error: `対象要素が見つかりません: ${tagName}#${elementId}` };
  }

  const requested = normalizeNodeIds(nodeIdsInput);
  if (requested.length === 0) {
    return { success: false, added: 0, error: '紐づける節点を指定してください' };
  }
  // 存在しない節点は拒否する
  const missing = requested.filter(
    (nid) => !doc.querySelector(`StbNode[id="${nid.replace(/"/g, '\\"')}"]`),
  );
  if (missing.length > 0) {
    return { success: false, added: 0, error: `節点 #${missing.join(', #')} が存在しません` };
  }

  const ns = target.namespaceURI;
  let listEl = findDirectChild(target, 'StbNodeIdList');
  if (!listEl) {
    listEl = ns ? doc.createElementNS(ns, 'StbNodeIdList') : doc.createElement('StbNodeIdList');
    target.appendChild(listEl);
  }
  const existing = new Set(
    Array.from(listEl.getElementsByTagName('StbNodeId'))
      .map((el) => el.getAttribute('id'))
      .filter(Boolean),
  );
  const toAdd = requested.filter((nid) => !existing.has(nid));
  if (toAdd.length === 0) {
    return { success: false, added: 0, error: '指定した節点はすべて既に紐づけ済みです' };
  }
  for (const nid of toAdd) {
    const idEl = ns ? doc.createElementNS(ns, 'StbNodeId') : doc.createElement('StbNodeId');
    idEl.setAttribute('id', nid);
    listEl.appendChild(idEl);
  }

  modifications.push({
    op: 'linkNodes',
    elementType,
    id: String(elementId),
    tagName,
    addedNodeIds: toAdd,
  });

  eventBus.emit(EditEvents.ATTRIBUTE_CHANGED, {
    elementType,
    elementId: String(elementId),
    attributeName: null,
    oldValue: null,
    newValue: null,
    modelSource: 'modelA',
    timestamp: Date.now(),
  });

  updateEditingSummary();
  showSuccess(`${tagName} #${elementId} に節点 ${toAdd.length}件を紐づけました`);
  return { success: true, added: toAdd.length };
}

/**
 * 後追い紐づけ（op:'linkNodes'）の Undo。追加した StbNodeId のみ削除し、リストが空になれば
 * StbNodeIdList も除去する。
 * @param {{elementType: string, id: string, tagName: string, addedNodeIds: string[]}} mod
 * @returns {boolean}
 */
function unlinkNodesFromDocument(mod) {
  const doc = getState('models.documentA');
  if (!doc) return false;
  const target = doc.querySelector(`${mod.tagName}[id="${String(mod.id).replace(/"/g, '\\"')}"]`);
  const listEl = target && findDirectChild(target, 'StbNodeIdList');
  if (!listEl) return false;

  const toRemove = new Set(mod.addedNodeIds.map(String));
  for (const idEl of Array.from(listEl.getElementsByTagName('StbNodeId'))) {
    if (toRemove.has(idEl.getAttribute('id'))) idEl.remove();
  }
  if (listEl.getElementsByTagName('StbNodeId').length === 0) listEl.remove();

  eventBus.emit(EditEvents.ATTRIBUTE_CHANGED, {
    elementType: mod.elementType,
    elementId: mod.id,
    attributeName: null,
    oldValue: null,
    newValue: null,
    modelSource: 'modelA',
    timestamp: Date.now(),
  });
  return true;
}

/**
 * StbSections 直下の全断面で重複しない次の id を採番する。
 * 断面 id は部材の id_section から参照されるため、断面種別をまたいで一意にする。
 * @param {Element} sectionsContainer - StbSections 要素
 * @returns {string}
 */
function generateNextSectionId(sectionsContainer) {
  let maxId = 0;
  // 直下だけでなく全子孫の id を走査する（型コンテナで入れ子になる版・実装に備える）。
  for (const el of sectionsContainer.querySelectorAll('*')) {
    const id = parseInt(el.getAttribute('id'), 10);
    if (Number.isFinite(id) && id > maxId) maxId = id;
  }
  return String(maxId + 1);
}

/**
 * スキーマ駆動ビルダーで組み立てた断面要素（子・孫を含む）を documentA に追加する。
 * id は StbSections 全体で一意になるよう採番し、付与済みの要素を StbSections 直下へ追加する。
 * 履歴には {op:'add', tagName} を記録し、Undo で要素ごと削除できるようにする。
 *
 * @param {Element} builtElement - sectionXmlBuilder.buildSectionElement の戻り値（id 未設定）
 * @returns {{success: boolean, id: string|null, tagName?: string, error?: string}}
 */
export function addNewSectionElement(builtElement) {
  const doc = getState('models.documentA');
  if (!doc) {
    return { success: false, id: null, error: 'モデルAが読み込まれていません' };
  }
  if (!builtElement || !builtElement.tagName) {
    return { success: false, id: null, error: '断面要素がありません' };
  }

  const container = ensureContainer(doc, ['StbSections']);
  if (!container) {
    return { success: false, id: null, error: 'StbModel が見つかりません' };
  }

  const tagName = builtElement.tagName;
  const id = generateNextSectionId(container);
  builtElement.setAttribute('id', id);
  container.appendChild(builtElement);

  // elementType はタグ名から 'Stb' を除いたもの（パイプライン通知・Undo 用）
  const elementType = tagName.startsWith('Stb') ? tagName.slice(3) : tagName;
  modifications.push({ op: 'add', elementType, id, tagName });

  // 断面キャッシュ再構築のためパイプラインを起動（参照部材が無ければ描画は変化しない）
  emitStructuralChange(elementType, id);

  updateEditingSummary();
  showSuccess(`${tagName} #${id} を追加しました`);
  return { success: true, id, tagName };
}

/**
 * documentA から要素を削除し、ATTRIBUTE_CHANGED で再描画パイプラインを起動する。
 * 新規追加（op:'add'）の Undo に使用する。
 * @param {string} elementType
 * @param {string} elementId
 * @param {string} [explicitTagName] - 明示タグ名（断面要素など elementType から復元できない場合）
 * @returns {boolean}
 */
/**
 * 子要素が空になったコンテナを祖先方向へ辿って除去する（StbModel は対象外）。
 * 新規追加の Undo で、追加時に生成された空コンテナ（StbStories・StbAxes・各軸グループ・
 * StbColumns 等の型コンテナ）が残り XSD 違反になるのを防ぐ。属性のみで子を持たない
 * 要素（StbNode 等）は対象にならない（リーフはこの関数に渡さない）。
 * @param {Element|null} startParent - 削除したリーフの親要素
 */
function removeEmptyAncestors(startParent) {
  let node = startParent;
  while (node && node.tagName !== 'StbModel' && node.children.length === 0) {
    const parent = node.parentNode;
    node.remove();
    node = parent;
  }
}

function removeElementFromDocument(elementType, elementId, explicitTagName) {
  try {
    const doc = getState('models.documentA');
    if (!doc) {
      log.error('docA not found');
      return false;
    }

    const tagName = explicitTagName || (elementType === 'Node' ? 'StbNode' : `Stb${elementType}`);
    const element = doc.querySelector(`${tagName}[id="${String(elementId).replace(/"/g, '\\"')}"]`);
    if (!element) {
      log.warn(`削除対象要素が見つかりません: ${elementType}#${elementId}`);
      return false;
    }

    const parent = element.parentNode;
    element.remove();

    // 追加時に副作用で生成されたコンテナ（StbStories・各軸グループ・StbAxes・型コンテナ等）が
    // 空のまま残ると XSD（コンテナは子要素 1 以上必須）違反になるため、空になった祖先を除去する。
    removeEmptyAncestors(parent);

    // 既存パイプラインを起動（節点削除は applyNodeEdit が removeCachedNode を呼ぶ）
    emitStructuralChange(elementType, elementId);

    return true;
  } catch (error) {
    log.error('要素削除中にエラーが発生しました:', error);
    return false;
  }
}

/** 編集ボタンデリゲーションの登録済みフラグ */
let isEditButtonDelegationInitialized = false;

// DOM初期化後にイベントリスナーを設定（window.*グローバル汚染の解消）
export function initializeEditModeButton() {
  const editModeBtn = document.getElementById('edit-mode-button');
  if (editModeBtn) {
    editModeBtn.addEventListener('click', toggleEditMode);
  }

  // 動的生成される編集ボタン（ComparisonRenderer）のイベントデリゲーション
  if (!isEditButtonDelegationInitialized) {
    document.addEventListener('click', (event) => {
      const target = /** @type {Element} */ (event.target);
      const button = target?.closest?.('.edit-btn[data-edit-attr]');
      if (!button) return;
      const { editType, editId, editAttr, editValue, editPath } = button.dataset;
      editAttributeValue(editType, editId || '', editAttr, editValue || '', {
        path: editPath || null,
      });
    });
    isEditButtonDelegationInitialized = true;
  }

  // E2Eテスト用ブリッジ: UIを介さずに属性編集パイプラインを直接起動する
  window.__editBridge = {
    applyEdit: (elementType, elementId, attrName, newValue, editPath = null) =>
      applyAttributeEditToDocument(elementType, elementId, attrName, newValue, editPath),
  };
}
