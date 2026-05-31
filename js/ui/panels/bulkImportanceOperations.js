/**
 * @fileoverview 重要度設定一括操作機能
 *
 * このファイルは、要素タイプ別一括重要度設定と設定プリセット機能を提供します:
 * - 要素タイプ別の一括重要度設定
 * - プリセット設定の保存・適用
 * - ルールベースの自動重要度設定
 * - 設定のインポート・エクスポート
 * - 操作履歴管理とアンドゥ機能
 *
 * 効率的な重要度設定により、大規模なプロジェクトでも
 * 迅速かつ一貫した重要度管理が可能になります。
 */

import { getImportanceManager } from '../../app/importanceManager.js';
import { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from '../../constants/importanceLevels.js';
import { setState } from '../../data/state/globalState.js';
import { floatingWindowManager } from './floatingWindowManager.js';
import { eventBus, ImportanceEvents } from '../../data/events/index.js';
import { storageHelper } from '../../utils/storageHelper.js';
import { showSuccess, showError, showWarning, showInfo } from '../common/toast.js';
import { downloadBlob } from '../../utils/downloadHelper.js';
import { createLogger } from '../../utils/logger.js';
import { createPanelHTML, createPreviewResultsHTML } from './bulkImportanceTemplates.js';
import { BulkImportanceHistory } from './bulkImportanceHistory.js';

const log = createLogger('ui:panels:bulkImportanceOperations');

/**
 * 一括操作履歴エントリー
 * @typedef {Object} BulkOperationHistoryEntry
 * @property {string} id - 操作ID
 * @property {string} type - 操作タイプ
 * @property {string} timestamp - 実行時刻
 * @property {Object} changes - 変更内容
 * @property {string} description - 操作説明
 */

/**
 * 重要度一括操作クラス
 */
export class BulkImportanceOperations {
  constructor() {
    this.manager = getImportanceManager();
    this.presets = new Map();
    this.history = new BulkImportanceHistory();
    this.isVisible = false;
    this.containerElement = null;

    this.loadPresets();
    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定する
   */
  setupEventListeners() {
    // 重要度設定変更イベント（EventBus経由）
    eventBus.on(ImportanceEvents.SETTINGS_CHANGED, (data) => {
      this.recordOperation('individual', data);
    });
  }

  /**
   * 一括操作パネルを初期化する
   * @param {HTMLElement} containerElement - パネルを配置するコンテナー要素
   */
  initialize(containerElement) {
    this.containerElement = containerElement;
    this.createPanelHTML();
    this.bindEvents();

    // Windowマネージャに登録
    this.registerWithWindowManager();
  }

  /**
   * Windowマネージャに登録
   */
  registerWithWindowManager() {
    floatingWindowManager.registerWindow({
      windowId: 'bulk-operations-panel',
      toggleButtonId: null, // ボタンは手動で管理
      closeButtonId: 'bulk-operations-close',
      headerId: 'bulk-operations-header',
      draggable: true,
      autoShow: false,
      onShow: () => {
        this.isVisible = true;
        setState('ui.bulkOperationsPanelVisible', true);
      },
      onHide: () => {
        this.isVisible = false;
        setState('ui.bulkOperationsPanelVisible', false);
      },
    });
  }

  /**
   * パネルのHTMLを作成する
   */
  createPanelHTML() {
    this.containerElement.insertAdjacentHTML('beforeend', createPanelHTML());
  }

  /**
   * イベントを関連付ける
   */
  bindEvents() {
    // パネル閉じるボタン
    document.getElementById('bulk-operations-close').addEventListener('click', () => {
      this.hide();
    });

    // セクション展開/折りたたみ
    this.setupSectionToggle();

    // 要素タイプ別一括設定
    this.setupTypeBulkOperations();

    // プリセット管理
    this.setupPresetManagement();

    // ルールベース設定
    this.setupRuleBasedOperations();

    // 操作履歴
    this.setupHistoryManagement();

    // インポート・エクスポート
    this.setupImportExport();
  }

  /**
   * セクション展開/折りたたみを設定
   */
  setupSectionToggle() {
    const sections = ['type-bulk', 'presets', 'rules', 'history', 'import-export'];

    sections.forEach((sectionId) => {
      const expandButton = document.getElementById(`expand-${sectionId}`);
      const content = document.getElementById(`${sectionId}-content`);

      if (expandButton && content) {
        expandButton.addEventListener('click', () => {
          const isExpanded = !content.classList.contains('collapsed');
          content.classList.toggle('collapsed', isExpanded);
          expandButton.classList.toggle('expanded', !isExpanded);
        });
      }
    });
  }

  /**
   * 要素タイプ別一括設定を設定
   */
  setupTypeBulkOperations() {
    // 全選択/選択解除
    document.getElementById('select-all-types').addEventListener('click', () => {
      const select = document.getElementById('bulk-element-type');
      for (const option of select.options) {
        option.selected = true;
      }
    });

    document.getElementById('clear-type-selection').addEventListener('click', () => {
      const select = document.getElementById('bulk-element-type');
      for (const option of select.options) {
        option.selected = false;
      }
    });

    // パターンフィルタ
    document.getElementById('bulk-filter-pattern').addEventListener('change', (e) => {
      document.getElementById('bulk-pattern-text').disabled = !e.target.checked;
    });

    // プレビュー
    document.getElementById('preview-bulk-operation').addEventListener('click', () => {
      this.previewBulkOperation();
    });

    // 実行
    document.getElementById('execute-bulk-operation').addEventListener('click', () => {
      this.executeBulkOperation();
    });
  }

  /**
   * プリセット管理を設定
   */
  setupPresetManagement() {
    // プリセット選択
    document.getElementById('preset-list').addEventListener('change', (e) => {
      const hasSelection = e.target.value !== '';
      document.getElementById('apply-preset').disabled = !hasSelection;
      document.getElementById('delete-preset').disabled = !hasSelection;
    });

    // プリセット適用
    document.getElementById('apply-preset').addEventListener('click', () => {
      this.applyPreset();
    });

    // プリセット削除
    document.getElementById('delete-preset').addEventListener('click', () => {
      this.deletePreset();
    });

    // プリセット保存
    document.getElementById('save-current-preset').addEventListener('click', () => {
      this.saveCurrentPreset();
    });

    this.updatePresetList();
  }

  /**
   * ルールベース設定を設定
   */
  setupRuleBasedOperations() {
    // テンプレート選択
    document.getElementById('rule-template').addEventListener('change', (e) => {
      document.getElementById('apply-rule-template').disabled = e.target.value === '';
    });

    // テンプレート適用
    document.getElementById('apply-rule-template').addEventListener('click', () => {
      this.applyRuleTemplate();
    });

    // カスタムルール追加
    document.getElementById('add-custom-rule').addEventListener('click', () => {
      this.addCustomRule();
    });
  }

  /**
   * 操作履歴管理を設定
   */
  setupHistoryManagement() {
    // 元に戻す
    document.getElementById('undo-last-operation').addEventListener('click', () => {
      this.undoLastOperation();
    });

    // 履歴クリア
    document.getElementById('clear-history').addEventListener('click', () => {
      this.clearHistory();
    });

    // 履歴出力
    document.getElementById('export-history').addEventListener('click', () => {
      this.exportHistory();
    });

    this.history.updateHistoryDisplay();
  }

  /**
   * インポート・エクスポートを設定
   */
  setupImportExport() {
    // 設定エクスポート
    document.getElementById('export-all-settings').addEventListener('click', () => {
      this.exportAllSettings();
    });

    // 設定インポート
    document.getElementById('import-settings-btn').addEventListener('click', () => {
      document.getElementById('import-settings-file').click();
    });

    document.getElementById('import-settings-file').addEventListener('change', (e) => {
      this.importSettings(e.target.files[0]);
    });
  }

  /**
   * 一括操作のプレビューを実行
   */
  previewBulkOperation() {
    const selectedTypes = Array.from(
      document.getElementById('bulk-element-type').selectedOptions,
    ).map((option) => option.value);
    const usePattern = document.getElementById('bulk-filter-pattern').checked;
    const pattern = document.getElementById('bulk-pattern-text').value;

    if (selectedTypes.length === 0) {
      showWarning('対象となる要素タイプを選択してください。');
      return;
    }

    const affectedPaths = this.getAffectedPaths(selectedTypes, usePattern ? pattern : null);

    const previewContainer = document.getElementById('bulk-preview-results');
    previewContainer.replaceChildren(createPreviewResultsHTML(affectedPaths, selectedTypes));

    previewContainer.style.display = 'block';
    document.getElementById('execute-bulk-operation').disabled = false;
  }

  /**
   * 一括操作を実行
   */
  executeBulkOperation() {
    const selectedTypes = Array.from(
      document.getElementById('bulk-element-type').selectedOptions,
    ).map((option) => option.value);
    const importanceLevel = document.getElementById('bulk-importance-level').value;
    const usePattern = document.getElementById('bulk-filter-pattern').checked;
    const pattern = document.getElementById('bulk-pattern-text').value;

    const affectedPaths = this.getAffectedPaths(selectedTypes, usePattern ? pattern : null);

    if (affectedPaths.length === 0) {
      showWarning('変更対象となる要素がありません。');
      return;
    }

    const confirmMessage = `${affectedPaths.length} 個の要素を「${IMPORTANCE_LEVEL_NAMES[importanceLevel]}」に設定しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 操作前の状態を記録
    const beforeState = this.captureCurrentState(affectedPaths);

    // 一括変更を実行
    affectedPaths.forEach((path) => {
      this.manager.setImportanceLevel(path, importanceLevel);
    });

    // 操作を履歴に記録
    this.recordOperation('bulk', {
      type: 'element_type_bulk',
      selectedTypes,
      importanceLevel,
      affectedPaths,
      beforeState,
      count: affectedPaths.length,
    });

    // 変更通知イベントを発行（EventBus経由）
    eventBus.emit(ImportanceEvents.SETTINGS_CHANGED, {
      type: 'bulk',
      operation: 'element_type_bulk',
      affectedPaths,
      newImportance: importanceLevel,
      count: affectedPaths.length,
      timestamp: new Date().toISOString(),
    });

    // プレビューをクリア
    document.getElementById('bulk-preview-results').style.display = 'none';
    document.getElementById('execute-bulk-operation').disabled = true;

    showSuccess(`${affectedPaths.length} 個の要素の重要度を変更しました。`);
  }

  /**
   * 指定条件で影響を受けるパスを取得
   * @param {string[]} selectedTypes - 選択された要素タイプ
   * @param {string|null} pattern - パターンフィルタ
   * @returns {string[]} 影響を受けるパス
   */
  getAffectedPaths(selectedTypes, pattern = null) {
    let affectedPaths = [];

    selectedTypes.forEach((type) => {
      const paths = this.manager.getElementPathsByTab(type);
      affectedPaths = affectedPaths.concat(paths);
    });

    // パターンフィルタリング
    if (pattern && pattern.trim()) {
      const filterPattern = pattern.trim().toLowerCase();
      affectedPaths = affectedPaths.filter((path) => path.toLowerCase().includes(filterPattern));
    }

    return affectedPaths;
  }

  /**
   * 現在の状態をキャプチャ
   * @param {string[]} paths - 対象パス
   * @returns {Object} 状態スナップショット
   */
  captureCurrentState(paths) {
    const state = {};
    paths.forEach((path) => {
      state[path] = this.manager.getImportanceLevel(path);
    });
    return state;
  }

  /**
   * プリセットを適用
   */
  applyPreset() {
    const presetName = document.getElementById('preset-list').value;
    if (!presetName) return;

    const preset = this.presets.get(presetName);
    if (!preset) {
      showWarning('選択されたプリセットが見つかりません。');
      return;
    }

    if (!confirm(`プリセット「${preset.name}」を適用しますか？\n${preset.description}`)) {
      return;
    }

    // 操作前の状態を記録
    const allPaths = Object.keys(preset.settings);
    const beforeState = this.captureCurrentState(allPaths);

    // プリセットを適用
    Object.entries(preset.settings).forEach(([path, importance]) => {
      this.manager.setImportanceLevel(path, importance);
    });

    // 操作を履歴に記録
    this.recordOperation('preset', {
      type: 'preset_apply',
      presetName,
      beforeState,
      settings: preset.settings,
      count: allPaths.length,
    });

    showSuccess(`プリセット「${preset.name}」を適用しました。`);
  }

  /**
   * プリセットを削除
   */
  deletePreset() {
    const presetName = document.getElementById('preset-list').value;
    if (!presetName) return;

    if (!confirm(`プリセット「${presetName}」を削除しますか？`)) {
      return;
    }

    this.presets.delete(presetName);
    this.savePresets();
    this.updatePresetList();

    showSuccess(`プリセット「${presetName}」を削除しました。`);
  }

  /**
   * 現在の設定をプリセットとして保存
   */
  saveCurrentPreset() {
    const name = document.getElementById('new-preset-name').value.trim();
    const description = document.getElementById('new-preset-description').value.trim();

    if (!name) {
      showWarning('プリセット名を入力してください。');
      return;
    }

    if (this.presets.has(name)) {
      if (!confirm(`プリセット「${name}」は既に存在します。上書きしますか？`)) {
        return;
      }
    }

    // 現在の設定を取得
    const currentSettings = this.manager.exportSettings();

    const preset = {
      name,
      description: description || `${new Date().toLocaleDateString()} に作成`,
      settings: currentSettings,
      created: new Date().toISOString(),
    };

    this.presets.set(name, preset);
    this.savePresets();
    this.updatePresetList();

    // フィールドをクリア
    document.getElementById('new-preset-name').value = '';
    document.getElementById('new-preset-description').value = '';

    showSuccess(`プリセット「${name}」を保存しました。`);
  }

  /**
   * プリセットリストを更新
   */
  updatePresetList() {
    const select = document.getElementById('preset-list');
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'プリセットを選択...';
    select.replaceChildren(defaultOption);

    for (const [name, preset] of this.presets.entries()) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = `${preset.name} (${Object.keys(preset.settings).length}件)`;
      select.appendChild(option);
    }
  }

  /**
   * ルールテンプレートを適用
   */
  applyRuleTemplate() {
    const template = document.getElementById('rule-template').value;
    if (!template) return;

    const ruleSet = this.getRuleTemplate(template);
    if (!ruleSet) {
      showWarning('選択されたテンプレートが見つかりません。');
      return;
    }

    if (!confirm(`ルールテンプレート「${ruleSet.name}」を適用しますか？\n${ruleSet.description}`)) {
      return;
    }

    // ルールを適用
    const affectedPaths = [];
    const beforeState = {};

    ruleSet.rules.forEach((rule) => {
      const paths = this.manager.getElementPathsByPattern(rule.pattern);
      paths.forEach((path) => {
        beforeState[path] = this.manager.getImportanceLevel(path);
        this.manager.setImportanceLevel(path, rule.importance);
        affectedPaths.push(path);
      });
    });

    // 操作を履歴に記録
    this.recordOperation('rule', {
      type: 'rule_template',
      template,
      beforeState,
      affectedPaths,
      count: affectedPaths.length,
    });

    showSuccess(
      `ルールテンプレート「${ruleSet.name}」を適用しました。${affectedPaths.length} 個の要素が変更されました。`,
    );
  }

  /**
   * ルールテンプレートを取得
   * @param {string} templateName - テンプレート名
   * @returns {Object|null} ルールセット
   */
  getRuleTemplate(templateName) {
    const templates = {
      structural: {
        name: '構造重要要素優先',
        description: '構造的に重要な要素（柱、梁、壁）を高重要度に設定',
        rules: [
          { pattern: '//StbColumn', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbGirder', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbBeam', importance: IMPORTANCE_LEVELS.OPTIONAL },
          { pattern: '//StbWall', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbSlab', importance: IMPORTANCE_LEVELS.OPTIONAL },
        ],
      },
      geometric: {
        name: '幾何情報重視',
        description: '幾何形状に関する情報を重視',
        rules: [
          { pattern: '//@id', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbNode', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//@id_section', importance: IMPORTANCE_LEVELS.OPTIONAL },
        ],
      },
      minimal: {
        name: '最小限設定',
        description: '最小限の要素のみを高重要度に設定',
        rules: [
          { pattern: '//StbColumn', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbGirder', importance: IMPORTANCE_LEVELS.REQUIRED },
        ],
      },
      detailed: {
        name: '詳細設定',
        description: 'すべての要素を適切な重要度に分類',
        rules: [
          { pattern: '//StbColumn', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbGirder', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbBeam', importance: IMPORTANCE_LEVELS.OPTIONAL },
          { pattern: '//StbBrace', importance: IMPORTANCE_LEVELS.OPTIONAL },
          { pattern: '//StbWall', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbSlab', importance: IMPORTANCE_LEVELS.OPTIONAL },
          { pattern: '//StbNode', importance: IMPORTANCE_LEVELS.UNNECESSARY },
        ],
      },
    };

    return templates[templateName] || null;
  }

  /**
   * カスタムルールを追加
   */
  addCustomRule() {
    // 今後の実装で詳細なカスタムルール作成UIを追加
    showInfo('カスタムルール機能は今後のバージョンで実装予定です。');
  }

  /**
   * 操作を履歴に記録
   * @param {string} type - 操作タイプ
   * @param {Object} details - 操作詳細
   */
  recordOperation(type, details) {
    this.history.recordOperation(type, details);
  }

  /**
   * 最後の操作を元に戻す
   */
  undoLastOperation() {
    this.history.undoLastOperation(this.manager);
  }

  /**
   * 履歴をクリア
   */
  clearHistory() {
    this.history.clearHistory();
  }

  /**
   * 履歴をエクスポート
   */
  exportHistory() {
    this.history.exportHistory();
  }

  /**
   * 全設定をエクスポート
   */
  exportAllSettings() {
    try {
      const includePresets = document.getElementById('export-include-presets').checked;
      const includeHistory = document.getElementById('export-include-history').checked;

      const exportData = {
        timestamp: new Date().toISOString(),
        settings: this.manager.exportSettings(),
      };

      if (includePresets) {
        exportData.presets = Object.fromEntries(this.presets.entries());
      }

      if (includeHistory) {
        exportData.history = this.history.getOperations();
      }

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      downloadBlob(blob, `bulk_operations_export_${new Date().toISOString().slice(0, 10)}.json`);
    } catch (error) {
      log.error('Failed to export settings:', error);
      showError('設定の出力に失敗しました。');
    }
  }

  /**
   * 設定をインポート
   * @param {File} file - インポートファイル
   */
  async importSettings(file) {
    if (!file) return;

    try {
      const fileContent = await this.readFileAsText(file);
      const importData = JSON.parse(fileContent);
      const mergeMode = document.getElementById('import-merge-mode').checked;

      let importedCount = 0;

      // 基本設定のインポート
      if (importData.settings) {
        if (mergeMode) {
          Object.entries(importData.settings).forEach(([path, importance]) => {
            // 既存設定が存在しない場合のみ設定
            if (this.manager.getImportanceLevel(path) === IMPORTANCE_LEVELS.REQUIRED) {
              this.manager.setImportanceLevel(path, importance);
              importedCount++;
            }
          });
        } else {
          Object.entries(importData.settings).forEach(([path, importance]) => {
            this.manager.setImportanceLevel(path, importance);
            importedCount++;
          });
        }
      }

      // プリセットのインポート
      if (importData.presets) {
        Object.entries(importData.presets).forEach(([name, preset]) => {
          if (!mergeMode || !this.presets.has(name)) {
            this.presets.set(name, preset);
          }
        });
        this.savePresets();
        this.updatePresetList();
      }

      // 履歴のインポート（マージモードでは無視）
      if (importData.history && !mergeMode) {
        this.history.replaceHistory(importData.history);
      }

      showSuccess(`設定をインポートしました。${importedCount}個の要素設定を更新しました。`);
    } catch (error) {
      log.error('Failed to import settings:', error);
      showError('設定のインポートに失敗しました。ファイル形式を確認してください。');
    }
  }

  /**
   * ファイルをテキストとして読み込む
   * @param {File} file - 読み込むファイル
   * @returns {Promise<string>} ファイル内容
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * プリセットを読み込む
   */
  loadPresets() {
    const savedPresets = storageHelper.get('importance-bulk-presets');
    if (savedPresets) {
      this.presets = new Map(Object.entries(savedPresets));
    }
  }

  /**
   * プリセットを保存する
   */
  savePresets() {
    const presetsObj = Object.fromEntries(this.presets.entries());
    storageHelper.set('importance-bulk-presets', presetsObj);
  }

  /**
   * パネルを表示する
   */
  show() {
    floatingWindowManager.showWindow('bulk-operations-panel');
  }

  /**
   * パネルを非表示にする
   */
  hide() {
    floatingWindowManager.hideWindow('bulk-operations-panel');
  }

  /**
   * パネルの表示状態を切り替える
   */
  toggle() {
    floatingWindowManager.toggleWindow('bulk-operations-panel');
  }
}

// シングルトンインスタンス
let bulkImportanceOperationsInstance = null;

/**
 * BulkImportanceOperationsのシングルトンインスタンスを取得する
 * @returns {BulkImportanceOperations} インスタンス
 */
function getBulkImportanceOperations() {
  if (!bulkImportanceOperationsInstance) {
    bulkImportanceOperationsInstance = new BulkImportanceOperations();
  }
  return bulkImportanceOperationsInstance;
}

/**
 * 一括操作パネルを初期化する
 * @param {HTMLElement} containerElement - パネルを配置するコンテナー
 * @returns {BulkImportanceOperations} 初期化済みのインスタンス
 */
export function initializeBulkImportanceOperations(containerElement = document.body) {
  const bulkOps = getBulkImportanceOperations();
  bulkOps.initialize(containerElement);
  return bulkOps;
}

// デフォルトエクスポート
export default BulkImportanceOperations;
