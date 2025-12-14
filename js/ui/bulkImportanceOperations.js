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

import { getImportanceManager, IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES, STB_ELEMENT_TABS } from '../core/importanceManager.js';
import { IMPORTANCE_COLORS } from '../config/importanceConfig.js';
import { getState, setState } from '../core/globalState.js';
import { floatingWindowManager } from './floatingWindowManager.js';

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
    this.operationHistory = [];
    this.maxHistorySize = 50;
    this.isVisible = false;
    this.containerElement = null;

    this.loadPresets();
    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定する
   */
  setupEventListeners() {
    // 重要度設定変更イベント
    window.addEventListener('importanceSettingsChanged', (event) => {
      this.recordOperation('individual', event.detail);
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

    console.log('BulkImportanceOperations initialized');
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
      }
    });
  }

  /**
   * パネルのHTMLを作成する
   */
  createPanelHTML() {
    const panelHTML = `
      <div id="bulk-operations-panel" class="floating-window">
        <div class="float-window-header" id="bulk-operations-header">
          <span class="float-window-title">⚙️ 一括操作</span>
          <div class="float-window-controls">
            <button class="float-window-btn" id="bulk-operations-close">✕</button>
          </div>
        </div>

        <div class="float-window-content">
          <!-- 要素タイプ別一括設定 -->
          <div class="operation-section">
            <div class="section-header">
              <h4>要素タイプ別一括設定</h4>
              <button id="expand-type-bulk" class="expand-button">▼</button>
            </div>
            <div class="section-content" id="type-bulk-content">
              <div class="type-selector">
                <label>対象要素タイプ:</label>
                <select id="bulk-element-type" multiple size="4">
                  ${STB_ELEMENT_TABS.map(tab => `
                    <option value="${tab.id}">${tab.name}</option>
                  `).join('')}
                </select>
                <div class="type-controls">
                  <button id="select-all-types" class="btn btn-sm">全選択</button>
                  <button id="clear-type-selection" class="btn btn-sm">選択解除</button>
                </div>
              </div>
              
              <div class="importance-selector">
                <label>設定する重要度:</label>
                <select id="bulk-importance-level">
                  ${Object.entries(IMPORTANCE_LEVELS).map(([key, value]) => `
                    <option value="${value}">${IMPORTANCE_LEVEL_NAMES[value]}</option>
                  `).join('')}
                </select>
              </div>
              
              <div class="filter-options">
                <label>
                  <input type="checkbox" id="bulk-filter-pattern" />
                  パターンフィルタ使用
                </label>
                <input type="text" id="bulk-pattern-text" placeholder="例: //@id, //StbColumn" disabled />
              </div>
              
              <div class="operation-controls">
                <button id="preview-bulk-operation" class="btn btn-primary">プレビュー</button>
                <button id="execute-bulk-operation" class="btn btn-success" disabled>実行</button>
              </div>
              
              <div id="bulk-preview-results" class="preview-results" style="display: none;">
                <!-- プレビュー結果がここに表示される -->
              </div>
            </div>
          </div>
          
          <!-- プリセット管理 -->
          <div class="operation-section">
            <div class="section-header">
              <h4>プリセット管理</h4>
              <button id="expand-presets" class="expand-button">▼</button>
            </div>
            <div class="section-content" id="presets-content">
              <div class="preset-selector">
                <label>保存済みプリセット:</label>
                <select id="preset-list">
                  <option value="">プリセットを選択...</option>
                </select>
                <div class="preset-controls">
                  <button id="apply-preset" class="btn btn-primary" disabled>適用</button>
                  <button id="delete-preset" class="btn btn-danger" disabled>削除</button>
                </div>
              </div>
              
              <div class="preset-creation">
                <div class="form-group">
                  <label>新規プリセット名:</label>
                  <input type="text" id="new-preset-name" placeholder="プリセット名を入力..." />
                </div>
                <div class="form-group">
                  <label>説明:</label>
                  <textarea id="new-preset-description" placeholder="プリセットの説明..." rows="2"></textarea>
                </div>
                <button id="save-current-preset" class="btn btn-success">現在の設定を保存</button>
              </div>
            </div>
          </div>
          
          <!-- ルールベース設定 -->
          <div class="operation-section">
            <div class="section-header">
              <h4>ルールベース設定</h4>
              <button id="expand-rules" class="expand-button">▼</button>
            </div>
            <div class="section-content" id="rules-content" style="display: none;">
              <div class="rule-templates">
                <label>テンプレート:</label>
                <select id="rule-template">
                  <option value="">テンプレートを選択...</option>
                  <option value="structural">構造重要要素優先</option>
                  <option value="geometric">幾何情報重視</option>
                  <option value="minimal">最小限設定</option>
                  <option value="detailed">詳細設定</option>
                </select>
                <button id="apply-rule-template" class="btn btn-primary" disabled>適用</button>
              </div>
              
              <div class="custom-rules">
                <h5>カスタムルール</h5>
                <div id="custom-rules-list">
                  <!-- カスタムルールがここに表示される -->
                </div>
                <button id="add-custom-rule" class="btn btn-secondary">ルール追加</button>
              </div>
            </div>
          </div>
          
          <!-- 操作履歴 -->
          <div class="operation-section">
            <div class="section-header">
              <h4>操作履歴</h4>
              <button id="expand-history" class="expand-button">▼</button>
            </div>
            <div class="section-content" id="history-content" style="display: none;">
              <div class="history-controls">
                <button id="undo-last-operation" class="btn btn-warning" disabled>元に戻す</button>
                <button id="clear-history" class="btn btn-danger">履歴クリア</button>
                <button id="export-history" class="btn btn-info">履歴出力</button>
              </div>
              
              <div class="history-list" id="operation-history-list">
                <!-- 操作履歴がここに表示される -->
              </div>
            </div>
          </div>
          
          <!-- インポート・エクスポート -->
          <div class="operation-section">
            <div class="section-header">
              <h4>設定の入出力</h4>
              <button id="expand-import-export" class="expand-button">▼</button>
            </div>
            <div class="section-content" id="import-export-content" style="display: none;">
              <div class="export-options">
                <h5>エクスポート</h5>
                <div class="export-controls">
                  <label>
                    <input type="checkbox" id="export-include-presets" checked />
                    プリセットを含める
                  </label>
                  <label>
                    <input type="checkbox" id="export-include-history" />
                    履歴を含める
                  </label>
                </div>
                <button id="export-all-settings" class="btn btn-primary">設定エクスポート</button>
              </div>
              
              <div class="import-options">
                <h5>インポート</h5>
                <input type="file" id="import-settings-file" accept=".json" style="display: none;" />
                <button id="import-settings-btn" class="btn btn-primary">設定インポート</button>
                <div class="import-options-detail">
                  <label>
                    <input type="checkbox" id="import-merge-mode" />
                    既存設定とマージ（上書きしない）
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    `;

    this.containerElement.insertAdjacentHTML('beforeend', panelHTML);
    this.addStyles();
  }

  /**
   * スタイルを追加する
   * 注: スタイルは importance.css に外部化されました
   */
  addStyles() {
    // スタイルは stb-diff-viewer/style/components/importance.css で定義
    // このメソッドは互換性のために残されています
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

    sections.forEach(sectionId => {
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

    this.updateHistoryDisplay();
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
    const selectedTypes = Array.from(document.getElementById('bulk-element-type').selectedOptions)
      .map(option => option.value);
    const importanceLevel = document.getElementById('bulk-importance-level').value;
    const usePattern = document.getElementById('bulk-filter-pattern').checked;
    const pattern = document.getElementById('bulk-pattern-text').value;

    if (selectedTypes.length === 0) {
      alert('対象となる要素タイプを選択してください。');
      return;
    }

    const affectedPaths = this.getAffectedPaths(selectedTypes, usePattern ? pattern : null);

    const previewContainer = document.getElementById('bulk-preview-results');
    previewContainer.innerHTML = `
      <div class="preview-summary">
        <strong>プレビュー結果:</strong> ${affectedPaths.length} 個の要素が変更されます
      </div>
      <div class="preview-details">
        ${selectedTypes.map(type => {
    const typePaths = affectedPaths.filter(path => path.includes(type));
    return `<div class="preview-item">
            <span>${type}</span>
            <span>${typePaths.length} 個</span>
          </div>`;
  }).join('')}
      </div>
    `;

    previewContainer.style.display = 'block';
    document.getElementById('execute-bulk-operation').disabled = false;
  }

  /**
   * 一括操作を実行
   */
  executeBulkOperation() {
    const selectedTypes = Array.from(document.getElementById('bulk-element-type').selectedOptions)
      .map(option => option.value);
    const importanceLevel = document.getElementById('bulk-importance-level').value;
    const usePattern = document.getElementById('bulk-filter-pattern').checked;
    const pattern = document.getElementById('bulk-pattern-text').value;

    const affectedPaths = this.getAffectedPaths(selectedTypes, usePattern ? pattern : null);

    if (affectedPaths.length === 0) {
      alert('変更対象となる要素がありません。');
      return;
    }

    const confirmMessage = `${affectedPaths.length} 個の要素を「${IMPORTANCE_LEVEL_NAMES[importanceLevel]}」に設定しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 操作前の状態を記録
    const beforeState = this.captureCurrentState(affectedPaths);

    // 一括変更を実行
    affectedPaths.forEach(path => {
      this.manager.setImportanceLevel(path, importanceLevel);
    });

    // 操作を履歴に記録
    this.recordOperation('bulk', {
      type: 'element_type_bulk',
      selectedTypes,
      importanceLevel,
      affectedPaths,
      beforeState,
      count: affectedPaths.length
    });

    // 変更通知イベントを発行
    window.dispatchEvent(new CustomEvent('importanceSettingsChanged', {
      detail: {
        type: 'bulk',
        operation: 'element_type_bulk',
        affectedPaths,
        newImportance: importanceLevel,
        count: affectedPaths.length,
        timestamp: new Date().toISOString()
      }
    }));

    // プレビューをクリア
    document.getElementById('bulk-preview-results').style.display = 'none';
    document.getElementById('execute-bulk-operation').disabled = true;

    alert(`${affectedPaths.length} 個の要素の重要度を変更しました。`);
  }

  /**
   * 指定条件で影響を受けるパスを取得
   * @param {string[]} selectedTypes - 選択された要素タイプ
   * @param {string|null} pattern - パターンフィルタ
   * @returns {string[]} 影響を受けるパス
   */
  getAffectedPaths(selectedTypes, pattern = null) {
    let affectedPaths = [];

    selectedTypes.forEach(type => {
      const paths = this.manager.getElementPathsByTab(type);
      affectedPaths = affectedPaths.concat(paths);
    });

    // パターンフィルタリング
    if (pattern && pattern.trim()) {
      const filterPattern = pattern.trim().toLowerCase();
      affectedPaths = affectedPaths.filter(path =>
        path.toLowerCase().includes(filterPattern)
      );
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
    paths.forEach(path => {
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
      alert('選択されたプリセットが見つかりません。');
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
      count: allPaths.length
    });

    alert(`プリセット「${preset.name}」を適用しました。`);
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

    alert(`プリセット「${presetName}」を削除しました。`);
  }

  /**
   * 現在の設定をプリセットとして保存
   */
  saveCurrentPreset() {
    const name = document.getElementById('new-preset-name').value.trim();
    const description = document.getElementById('new-preset-description').value.trim();

    if (!name) {
      alert('プリセット名を入力してください。');
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
      created: new Date().toISOString()
    };

    this.presets.set(name, preset);
    this.savePresets();
    this.updatePresetList();

    // フィールドをクリア
    document.getElementById('new-preset-name').value = '';
    document.getElementById('new-preset-description').value = '';

    alert(`プリセット「${name}」を保存しました。`);
  }

  /**
   * プリセットリストを更新
   */
  updatePresetList() {
    const select = document.getElementById('preset-list');
    select.innerHTML = '<option value="">プリセットを選択...</option>';

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
      alert('選択されたテンプレートが見つかりません。');
      return;
    }

    if (!confirm(`ルールテンプレート「${ruleSet.name}」を適用しますか？\n${ruleSet.description}`)) {
      return;
    }

    // ルールを適用
    const affectedPaths = [];
    const beforeState = {};

    ruleSet.rules.forEach(rule => {
      const paths = this.manager.getElementPathsByPattern(rule.pattern);
      paths.forEach(path => {
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
      count: affectedPaths.length
    });

    alert(`ルールテンプレート「${ruleSet.name}」を適用しました。${affectedPaths.length} 個の要素が変更されました。`);
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
          { pattern: '//StbSlab', importance: IMPORTANCE_LEVELS.OPTIONAL }
        ]
      },
      geometric: {
        name: '幾何情報重視',
        description: '幾何形状に関する情報を重視',
        rules: [
          { pattern: '//@id', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbNode', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//@id_section', importance: IMPORTANCE_LEVELS.OPTIONAL }
        ]
      },
      minimal: {
        name: '最小限設定',
        description: '最小限の要素のみを高重要度に設定',
        rules: [
          { pattern: '//StbColumn', importance: IMPORTANCE_LEVELS.REQUIRED },
          { pattern: '//StbGirder', importance: IMPORTANCE_LEVELS.REQUIRED }
        ]
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
          { pattern: '//StbNode', importance: IMPORTANCE_LEVELS.UNNECESSARY }
        ]
      }
    };

    return templates[templateName] || null;
  }

  /**
   * カスタムルールを追加
   */
  addCustomRule() {
    // 今後の実装で詳細なカスタムルール作成UIを追加
    alert('カスタムルール機能は今後のバージョンで実装予定です。');
  }

  /**
   * 操作を履歴に記録
   * @param {string} type - 操作タイプ
   * @param {Object} details - 操作詳細
   */
  recordOperation(type, details) {
    const operation = {
      id: Date.now().toString(),
      type,
      timestamp: new Date().toISOString(),
      details,
      description: this.generateOperationDescription(type, details)
    };

    this.operationHistory.unshift(operation);

    // 履歴サイズ制限
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory = this.operationHistory.slice(0, this.maxHistorySize);
    }

    this.updateHistoryDisplay();
    this.updateUndoButton();
  }

  /**
   * 操作説明を生成
   * @param {string} type - 操作タイプ
   * @param {Object} details - 操作詳細
   * @returns {string} 操作説明
   */
  generateOperationDescription(type, details) {
    switch (type) {
      case 'bulk':
        return `一括設定: ${details.count}個の要素を${IMPORTANCE_LEVEL_NAMES[details.importanceLevel]}に変更`;
      case 'preset':
        return `プリセット適用: ${details.presetName} (${details.count}個の要素)`;
      case 'rule':
        return `ルールテンプレート適用: ${details.template} (${details.count}個の要素)`;
      case 'individual':
        return `個別変更: ${details.path || '不明'}`;
      default:
        return `操作: ${type}`;
    }
  }

  /**
   * 最後の操作を元に戻す
   */
  undoLastOperation() {
    if (this.operationHistory.length === 0) {
      alert('元に戻す操作がありません。');
      return;
    }

    const lastOperation = this.operationHistory[0];

    if (!confirm(`「${lastOperation.description}」を元に戻しますか？`)) {
      return;
    }

    // 操作を元に戻す
    if (lastOperation.details.beforeState) {
      Object.entries(lastOperation.details.beforeState).forEach(([path, importance]) => {
        this.manager.setImportanceLevel(path, importance);
      });

      // 履歴から削除
      this.operationHistory.shift();
      this.updateHistoryDisplay();
      this.updateUndoButton();

      alert('操作を元に戻しました。');
    } else {
      alert('この操作は元に戻すことができません。');
    }
  }

  /**
   * 履歴をクリア
   */
  clearHistory() {
    if (!confirm('操作履歴をすべてクリアしますか？')) {
      return;
    }

    this.operationHistory = [];
    this.updateHistoryDisplay();
    this.updateUndoButton();
  }

  /**
   * 履歴表示を更新
   */
  updateHistoryDisplay() {
    const container = document.getElementById('operation-history-list');

    if (this.operationHistory.length === 0) {
      container.innerHTML = '<div class="history-item">操作履歴はありません</div>';
      return;
    }

    container.innerHTML = this.operationHistory.slice(0, 10).map(operation => `
      <div class="history-item">
        <div class="operation-description">${operation.description}</div>
        <div class="operation-time">${new Date(operation.timestamp).toLocaleString()}</div>
      </div>
    `).join('');
  }

  /**
   * アンドゥボタンの状態を更新
   */
  updateUndoButton() {
    const button = document.getElementById('undo-last-operation');
    button.disabled = this.operationHistory.length === 0;
  }

  /**
   * 履歴をエクスポート
   */
  exportHistory() {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        history: this.operationHistory
      };

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');

      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `operation_history_${new Date().toISOString().slice(0, 10)}.json`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Failed to export history:', error);
      alert('履歴の出力に失敗しました。');
    }
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
        settings: this.manager.exportSettings()
      };

      if (includePresets) {
        exportData.presets = Object.fromEntries(this.presets.entries());
      }

      if (includeHistory) {
        exportData.history = this.operationHistory;
      }

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');

      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `bulk_operations_export_${new Date().toISOString().slice(0, 10)}.json`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Failed to export settings:', error);
      alert('設定の出力に失敗しました。');
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
        this.operationHistory = importData.history.slice(0, this.maxHistorySize);
        this.updateHistoryDisplay();
        this.updateUndoButton();
      }

      alert(`設定をインポートしました。${importedCount}個の要素設定を更新しました。`);

    } catch (error) {
      console.error('Failed to import settings:', error);
      alert('設定のインポートに失敗しました。ファイル形式を確認してください。');
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
    try {
      const savedPresets = localStorage.getItem('importance-bulk-presets');
      if (savedPresets) {
        const presets = JSON.parse(savedPresets);
        this.presets = new Map(Object.entries(presets));
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  }

  /**
   * プリセットを保存する
   */
  savePresets() {
    try {
      const presetsObj = Object.fromEntries(this.presets.entries());
      localStorage.setItem('importance-bulk-presets', JSON.stringify(presetsObj));
    } catch (error) {
      console.error('Failed to save presets:', error);
    }
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
export function getBulkImportanceOperations() {
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
