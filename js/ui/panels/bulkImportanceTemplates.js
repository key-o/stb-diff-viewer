/**
 * @fileoverview 重要度一括操作パネルのHTMLテンプレート生成
 *
 * パネルUI構造のHTML生成とプレビュー結果の表示を担当します。
 */

import { STB_ELEMENT_TABS } from '../../app/importanceManager.js';
import { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from '../../constants/importanceLevels.js';

/**
 * 一括操作パネルのメインHTMLを生成する
 * @returns {string} パネルHTML文字列
 */
export function createPanelHTML() {
  return `
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
                  ${STB_ELEMENT_TABS.map(
                    (tab) => `
                    <option value="${tab.id}">${tab.name}</option>
                  `,
                  ).join('')}
                </select>
                <div class="type-controls">
                  <button id="select-all-types" class="btn btn-sm">全選択</button>
                  <button id="clear-type-selection" class="btn btn-sm">選択解除</button>
                </div>
              </div>

              <div class="importance-selector">
                <label>設定する重要度:</label>
                <select id="bulk-importance-level">
                  ${Object.entries(IMPORTANCE_LEVELS)
                    .map(
                      ([_key, value]) => `
                    <option value="${value}">${IMPORTANCE_LEVEL_NAMES[value]}</option>
                  `,
                    )
                    .join('')}
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
}

/**
 * プレビュー結果のHTMLを生成する
 * @param {string[]} affectedPaths - 影響を受けるパス
 * @param {string[]} selectedTypes - 選択された要素タイプ
 * @returns {string} プレビュー結果HTML
 */
export function createPreviewResultsHTML(affectedPaths, selectedTypes) {
  const fragment = document.createDocumentFragment();

  const summary = document.createElement('div');
  summary.className = 'preview-summary';
  const strong = document.createElement('strong');
  strong.textContent = 'プレビュー結果:';
  summary.appendChild(strong);
  summary.appendChild(document.createTextNode(` ${affectedPaths.length}個の要素が変更されます`));
  fragment.appendChild(summary);

  const details = document.createElement('div');
  details.className = 'preview-details';
  for (const type of selectedTypes) {
    const count = affectedPaths.filter((path) => path.includes(type)).length;
    const item = document.createElement('div');
    item.className = 'preview-item';
    const typeSpan = document.createElement('span');
    typeSpan.textContent = type;
    const countSpan = document.createElement('span');
    countSpan.textContent = `${count} 個`;
    item.appendChild(typeSpan);
    item.appendChild(countSpan);
    details.appendChild(item);
  }
  fragment.appendChild(details);

  return fragment;
}

/**
 * 操作履歴リストのHTMLを生成する
 * @param {Array<{description: string, timestamp: string}>} operations - 操作履歴
 * @returns {string} 履歴リストHTML
 */
export function createHistoryListHTML(operations) {
  const fragment = document.createDocumentFragment();

  if (operations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-item';
    empty.textContent = '操作履歴はありません';
    fragment.appendChild(empty);
    return fragment;
  }

  for (const operation of operations.slice(0, 10)) {
    const item = document.createElement('div');
    item.className = 'history-item';

    const desc = document.createElement('div');
    desc.className = 'operation-description';
    desc.textContent = operation.description;

    const time = document.createElement('div');
    time.className = 'operation-time';
    time.textContent = new Date(operation.timestamp).toLocaleString();

    item.appendChild(desc);
    item.appendChild(time);
    fragment.appendChild(item);
  }

  return fragment;
}
