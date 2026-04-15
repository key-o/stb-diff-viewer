/**
 * @fileoverview ツリービュー基底クラス
 *
 * elementTreeView と sectionTreeView の共通ロジックを提供します。
 *
 * @module ui/panels/BaseTreeView
 */

import { createSearchUI } from './treeSearch.js';
import { initializeContextMenu } from '../common/contextMenu.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:panels:BaseTreeView');

export class BaseTreeView {
  /**
   * @param {Object} config - ツリービュー設定
   * @param {string} config.name - ツリー名（ログ用）
   * @param {string} config.emptyMessage - データなし時のメッセージ
   * @param {string} config.searchPlaceholder - 検索プレースホルダー
   * @param {boolean} config.showStatusFilter - ステータスフィルタ表示
   * @param {Array<{key: string, label: string}>} config.searchTargetOptions - 検索対象オプション
   * @param {Object} config.defaultTargetFilter - デフォルト検索対象フィルタ
   * @param {number} config.virtualScrollThreshold - 仮想スクロール閾値
   * @param {number} config.virtualItemHeight - 仮想スクロールアイテム高さ
   */
  constructor(config) {
    this.config = config;
    this.treeContainer = null;
    this.onElementSelectCallback = null;
    this.onContextMenuActionCallback = null;
    this.searchUI = null;
    this.currentSearchText = '';
    this.currentTargetFilter = { ...config.defaultTargetFilter };
    this.currentComparisonResult = null;
    this.virtualScrollManagers = new Map();
  }

  /**
   * ツリー表示を初期化
   * @param {string} containerId - コンテナーID
   * @param {Function} onElementSelect - 要素選択コールバック
   * @param {Object} [options] - オプション
   * @param {Function} [options.onContextMenuAction] - コンテキストメニューアクションコールバック
   */
  initialize(containerId, onElementSelect, options = {}) {
    this.treeContainer = document.getElementById(containerId);
    if (!this.treeContainer) {
      log.error(`ツリーコンテナーが見つかりません: ${containerId}`);
      return;
    }
    this.onElementSelectCallback = onElementSelect;
    this.onContextMenuActionCallback = options.onContextMenuAction || null;

    initializeContextMenu();
    this.initializeSearchUI();
    this._onInitialized();
  }

  /**
   * 検索UIを初期化
   */
  initializeSearchUI() {
    if (!this.treeContainer) return;

    const existingSearchUI = this.treeContainer.querySelector('.tree-search-container');
    if (existingSearchUI) {
      existingSearchUI.remove();
    }

    this.searchUI = createSearchUI({
      placeholder: this.config.searchPlaceholder,
      showStatusFilter: this.config.showStatusFilter,
      targetOptions: this.config.searchTargetOptions,
      defaultTargetFilter: this.config.defaultTargetFilter,
      onSearch: (searchText, statusFilter, targetFilter) => {
        this._onSearch(searchText, statusFilter, targetFilter);
      },
      onClear: () => {
        this._onSearchClear();
      },
    });

    this.treeContainer.insertBefore(this.searchUI.container, this.treeContainer.firstChild);
  }

  /**
   * ツリーコンテンツをクリア（検索UIは保持）
   */
  clearTreeContent() {
    if (!this.treeContainer) return;

    for (const manager of this.virtualScrollManagers.values()) {
      manager.destroy();
    }
    this.virtualScrollManagers.clear();

    const children = Array.from(this.treeContainer.children);
    children.forEach((child) => {
      if (!child.classList.contains('tree-search-container')) {
        this.treeContainer.removeChild(child);
      }
    });
  }

  /**
   * ツリー全体をクリア
   */
  clearTree() {
    if (this.treeContainer) {
      while (this.treeContainer.firstChild) {
        this.treeContainer.removeChild(this.treeContainer.firstChild);
      }
      const emptyMessage = document.createElement('div');
      emptyMessage.style.cssText = 'padding: 10px; text-align: center; color: #666;';
      emptyMessage.textContent = this.config.emptyMessage;
      this.treeContainer.appendChild(emptyMessage);
    }
    this._onTreeCleared();
  }

  /**
   * 検索結果件数を更新
   * @param {number} filtered - フィルタ後の件数
   * @param {number} total - 全件数
   */
  updateResultCount(filtered, total) {
    if (this.searchUI) {
      this.searchUI.updateResultCount(filtered, total);
    }
  }

  // --- テンプレートメソッド（サブクラスでオーバーライド） ---

  /** 初期化完了時フック */
  _onInitialized() {}

  /** ツリークリア時フック */
  _onTreeCleared() {}

  /**
   * 検索実行時フック
   * @param {string} searchText - 検索テキスト
   * @param {Object} statusFilter - ステータスフィルタ
   * @param {Object} targetFilter - 検索対象フィルタ
   */
  _onSearch(searchText, statusFilter, targetFilter) {
    this.currentSearchText = searchText;
    this.currentTargetFilter = targetFilter;
    this.rebuild();
  }

  /** 検索クリア時フック */
  _onSearchClear() {
    this.currentSearchText = '';
    this.currentTargetFilter = { ...this.config.defaultTargetFilter };
  }

  // --- DOM ヘルパーメソッド ---

  /**
   * トグルアイコン（▶/▼）を作成
   * @param {boolean} [isExpanded=false] - 初期状態で展開するか
   * @param {string} [extraClass=''] - 追加CSSクラス
   * @returns {HTMLSpanElement} トグルアイコン要素
   */
  _createToggleIcon(isExpanded = false, extraClass = '') {
    const icon = document.createElement('span');
    icon.className = `tree-toggle-icon${extraClass ? ` ${extraClass}` : ''}`;
    icon.textContent = isExpanded ? '▼' : '▶';
    if (isExpanded) {
      icon.classList.add('expanded');
    }
    return icon;
  }

  /**
   * ノードの展開/折りたたみをトグル（display方式）
   *
   * コンテナの display を none/block で切り替え、トグルアイコンの
   * テキスト（▶/▼）と expanded クラスを同期する。
   *
   * @param {HTMLElement} childrenContainer - 子要素コンテナ
   * @param {HTMLElement} toggleIcon - トグルアイコン要素
   * @returns {boolean} トグル後の展開状態（true=展開）
   */
  _toggleNodeExpand(childrenContainer, toggleIcon) {
    const isExpanded = childrenContainer.style.display !== 'none';
    childrenContainer.style.display = isExpanded ? 'none' : 'block';
    toggleIcon.textContent = isExpanded ? '▶' : '▼';
    toggleIcon.classList.toggle('expanded', !isExpanded);
    return !isExpanded;
  }

  /**
   * ツリーを再構築（サブクラスで実装必須）
   * @abstract
   */
  rebuild() {
    throw new Error('rebuild() must be implemented by subclass');
  }
}
