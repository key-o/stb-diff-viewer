/**
 * 要素ツリー表示コンポーネント
 * BIMVisionのような階層構造のツリービューを提供
 *
 * 機能:
 * - 要素タイプ別の階層表示
 * - ソート機能（ID/名前/GUID順）
 * - テキスト検索（ID、名前、GUID）
 * - 正規表現サポート（/pattern/ 形式）
 * - 差分ステータスフィルタ（一致/Aのみ/Bのみ）
 */

import {
  parseSearchPattern,
  matchesSearch,
  highlightSearchMatch,
  DEFAULT_STATUS_FILTER,
  DEFAULT_ELEMENT_TARGET_FILTER,
} from './treeSearch.js';
import { showContextMenu } from '../common/contextMenu.js';
import { VirtualScrollManager } from '../common/virtualScroll.js';
import { ELEMENT_ICONS, ELEMENT_LABELS } from '../../config/elementLabels.js';
import { VIRTUAL_SCROLL_CONFIG } from '../../config/virtualScrollConfig.js';
import { BaseTreeView } from './BaseTreeView.js';

// 仮想スクロール関連（SSOT: virtualScrollConfig.js）
const VIRTUAL_SCROLL_THRESHOLD = VIRTUAL_SCROLL_CONFIG.THRESHOLD;
const VIRTUAL_ITEM_HEIGHT = VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT.element;

class ElementTreeView extends BaseTreeView {
  constructor() {
    super({
      name: 'elementTree',
      emptyMessage: 'モデルを読み込んでください',
      searchPlaceholder: '検索... (/正規表現/)',
      showStatusFilter: true,
      searchTargetOptions: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: '名前' },
        { key: 'guid', label: 'GUID' },
      ],
      defaultTargetFilter: DEFAULT_ELEMENT_TARGET_FILTER,
      virtualScrollThreshold: VIRTUAL_SCROLL_THRESHOLD,
      virtualItemHeight: VIRTUAL_ITEM_HEIGHT,
    });

    /** @type {Set<string>} */
    this.selectedElementKeys = new Set();
    this.lastClickedElementKey = null;
    this.sortMode = 'id'; // 'id', 'name', or 'guid'
    this.currentStatusFilter = { ...DEFAULT_STATUS_FILTER };
    this.totalElementCount = 0;
    this.filteredElementCount = 0;
  }

  // --- テンプレートメソッド オーバーライド ---

  /**
   * 検索実行時フック: currentStatusFilter も設定する
   * @param {string} searchText - 検索テキスト
   * @param {Object} statusFilter - ステータスフィルタ
   * @param {Object} targetFilter - 検索対象フィルタ
   */
  _onSearch(searchText, statusFilter, targetFilter) {
    this.currentSearchText = searchText;
    this.currentStatusFilter = statusFilter;
    this.currentTargetFilter = targetFilter;
    this.rebuild();
  }

  /**
   * 検索クリア時フック: currentStatusFilter もリセットする
   */
  _onSearchClear() {
    this.currentSearchText = '';
    this.currentStatusFilter = { ...DEFAULT_STATUS_FILTER };
    this.currentTargetFilter = { ...this.config.defaultTargetFilter };
  }

  /**
   * ツリークリア時フック: selectedElementKeys をクリアする
   */
  _onTreeCleared() {
    this.selectedElementKeys.clear();
  }

  /**
   * ツリーを再構築
   */
  rebuild() {
    this.buildTree(this.currentComparisonResult);
  }

  // --- 公開メソッド ---

  /**
   * ツリーを構築して表示
   * @param {Object} comparisonResult - 比較結果データ
   */
  buildTree(comparisonResult) {
    if (!this.treeContainer) {
      console.error('ツリービューが初期化されていません');
      return;
    }

    // 比較結果を保存
    this.currentComparisonResult = comparisonResult;

    // 検索UIを保持してツリー部分のみクリア
    this.clearTreeContent();

    if (!comparisonResult) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'tree-empty-message';
      emptyMessage.style.cssText = 'padding: 10px; text-align: center; color: #666;';
      emptyMessage.textContent = 'モデルを読み込んでください';
      this.treeContainer.appendChild(emptyMessage);
      this.totalElementCount = 0;
      this.filteredElementCount = 0;
      this.updateResultCount(0, 0);
      return;
    }

    // 検索パターンを解析
    const searchPattern = parseSearchPattern(this.currentSearchText);

    // ルートノードを作成
    const rootNode = document.createElement('div');
    rootNode.className = 'tree-root';

    // 要素タイプ別にグループ化
    const elementsByType = this._groupElementsByType(comparisonResult);

    // 全要素数をカウント
    this.totalElementCount = 0;
    this.filteredElementCount = 0;

    Object.keys(elementsByType).forEach((elementType) => {
      this.totalElementCount += elementsByType[elementType].length;
    });

    // 各要素タイプのノードを作成（フィルタリング適用）
    Object.keys(elementsByType).forEach((elementType) => {
      const elements = elementsByType[elementType];
      if (elements.length > 0) {
        // フィルタリングを適用
        const filteredElements = elements.filter((element) =>
          matchesSearch(element, searchPattern, this.currentStatusFilter, this.currentTargetFilter),
        );

        this.filteredElementCount += filteredElements.length;

        if (filteredElements.length > 0) {
          const typeNode = this._createTypeNode(elementType, filteredElements, searchPattern);
          rootNode.appendChild(typeNode);
        }
      }
    });

    // フィルタで全要素が非表示になった場合のメッセージ
    if (this.filteredElementCount === 0 && this.totalElementCount > 0) {
      const noResultMessage = document.createElement('div');
      noResultMessage.className = 'tree-no-result-message';
      noResultMessage.style.cssText = 'padding: 20px; text-align: center; color: #868e96;';
      noResultMessage.textContent = '検索条件に一致する要素がありません';
      rootNode.appendChild(noResultMessage);
    }

    this.treeContainer.appendChild(rootNode);

    // 検索結果数を更新
    this.updateResultCount(this.filteredElementCount, this.totalElementCount);
  }

  /**
   * 選択をクリア
   */
  clearTreeSelection() {
    if (this.treeContainer) {
      const previouslySelected = this.treeContainer.querySelectorAll('.tree-node-header.selected');
      previouslySelected.forEach((el) => el.classList.remove('selected'));
    }
    this.selectedElementKeys.clear();
    this.lastClickedElementKey = null;
  }

  /**
   * 3Dビューアーからの選択に応じてツリー内の要素を選択
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   * @param {string} modelSource - モデルソース (matched, onlyA, onlyB)
   */
  selectElementInTree(elementType, elementId, modelSource) {
    if (!this.treeContainer) {
      return;
    }

    const elementKey = `${elementType}_${elementId}_${modelSource}`;

    // 仮想スクロールが有効な要素タイプかチェック
    const virtualManager = this.virtualScrollManagers.get(elementType);

    if (virtualManager && virtualManager.isVirtualScrollEnabled()) {
      // 仮想スクロールの場合: アイテムを検索してスクロール
      const index = virtualManager.scrollToItem((item) => {
        const itemKey = `${elementType}_${item.displayId}_${item.modelSource}`;
        return itemKey === elementKey;
      }, 'center');

      if (index !== -1) {
        // 少し遅延してから選択状態を更新（レンダリング完了後）
        setTimeout(() => {
          const node = this.treeContainer.querySelector(`[data-element-key="${elementKey}"]`);
          if (node) {
            const header = node.querySelector('.tree-node-header');
            this._selectTreeElement(elementKey, header);
          }
        }, 50);
      }
      return;
    }

    // 通常のツリーノード検索
    const leafNodes = this.treeContainer.querySelectorAll('.tree-leaf-node');

    for (const node of leafNodes) {
      if (node.dataset.elementKey === elementKey) {
        const header = node.querySelector('.tree-node-header');
        this._selectTreeElement(elementKey, header);

        // ノードが見えるようにスクロール
        node.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });

        break;
      }
    }
  }

  // --- 内部メソッド ---

  /**
   * 要素をタイプ別にグループ化してソート
   * @param {Object} comparisonResult - 比較結果
   * @returns {Object} タイプ別にグループ化され、ソートされた要素
   * @private
   */
  _groupElementsByType(comparisonResult) {
    const groups = {};

    // 全要素タイプを初期化
    Object.keys(ELEMENT_LABELS).forEach((type) => {
      groups[type] = [];
    });

    // matched要素を追加
    if (comparisonResult.matched) {
      comparisonResult.matched.forEach((item) => {
        const elementType = item.elementType || item.type;
        if (elementType && groups[elementType]) {
          const element = item.elementA || item.elementB || item;
          groups[elementType].push({
            ...item,
            modelSource: 'matched',
            displayId: item.elementA?.id || item.id,
            name: element.name,
            guid: element.guid,
          });
        }
      });
    }

    // onlyA要素を追加
    if (comparisonResult.onlyA) {
      comparisonResult.onlyA.forEach((item) => {
        const elementType = item.elementType || item.type;
        if (elementType && groups[elementType]) {
          groups[elementType].push({
            ...item,
            modelSource: 'onlyA',
            displayId: item.id,
            name: item.name,
            guid: item.guid,
          });
        }
      });
    }

    // onlyB要素を追加
    if (comparisonResult.onlyB) {
      comparisonResult.onlyB.forEach((item) => {
        const elementType = item.elementType || item.type;
        if (elementType && groups[elementType]) {
          groups[elementType].push({
            ...item,
            modelSource: 'onlyB',
            displayId: item.id,
            name: item.name,
            guid: item.guid,
          });
        }
      });
    }

    // 各グループ内の要素をソート
    Object.keys(groups).forEach((elementType) => {
      groups[elementType] = this._sortElements(groups[elementType]);
    });

    return groups;
  }

  /**
   * 要素配列をソートモードに応じてソート
   * @param {Array} elements - 要素配列
   * @returns {Array} ソートされた要素配列
   * @private
   */
  _sortElements(elements) {
    return elements.sort((a, b) => {
      let aValue, bValue;

      switch (this.sortMode) {
        case 'name':
          aValue = a.name || a.displayId || '';
          bValue = b.name || b.displayId || '';
          return aValue.localeCompare(bValue, 'ja');

        case 'guid':
          aValue = a.guid || a.displayId || '';
          bValue = b.guid || b.displayId || '';
          return aValue.localeCompare(bValue);

        case 'id':
        default:
          aValue = a.displayId || '';
          bValue = b.displayId || '';
          // 数値として比較を試みる
          const aNum = parseInt(aValue, 10);
          const bNum = parseInt(bValue, 10);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return aNum - bNum;
          }
          return aValue.localeCompare(bValue);
      }
    });
  }

  /**
   * 要素タイプノードを作成
   * @param {string} elementType - 要素タイプ
   * @param {Array} elements - 要素配列
   * @param {Object} searchPattern - 検索パターン（オプション）
   * @returns {HTMLElement} タイプノード
   * @private
   */
  _createTypeNode(elementType, elements, searchPattern = null) {
    const node = document.createElement('div');
    node.className = 'tree-node';

    const header = document.createElement('div');
    header.className = 'tree-node-header';

    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = '\u25BC';

    const label = document.createElement('div');
    label.className = 'tree-node-label';

    const icon = document.createElement('span');
    icon.className = 'tree-node-icon';
    icon.textContent = ELEMENT_ICONS[elementType] || '\u25C9';

    const text = document.createElement('span');
    text.className = 'tree-node-text';
    text.textContent = ELEMENT_LABELS[elementType] || elementType;

    const count = document.createElement('span');
    count.className = 'tree-node-count';
    count.textContent = `(${elements.length})`;

    // 仮想スクロールが有効な場合はバッジを表示
    if (elements.length >= VIRTUAL_SCROLL_THRESHOLD) {
      const virtualBadge = document.createElement('span');
      virtualBadge.className = 'tree-virtual-badge';
      virtualBadge.textContent = '\u4EEE\u60F3';
      virtualBadge.title =
        '\u4EEE\u60F3\u30B9\u30AF\u30ED\u30FC\u30EB\u304C\u6709\u52B9\uFF08\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\u6700\u9069\u5316\uFF09';
      virtualBadge.style.cssText = `
        font-size: var(--font-size-xs);
        background: #228be6;
        color: white;
        padding: 1px 4px;
        border-radius: 3px;
        margin-left: 4px;
      `;
      count.appendChild(virtualBadge);
    }

    label.appendChild(icon);
    label.appendChild(text);
    label.appendChild(count);

    header.appendChild(toggle);
    header.appendChild(label);

    // 子要素コンテナー
    const children = document.createElement('div');
    children.className = 'tree-node-children expanded';

    // 仮想スクロールを適用するかどうかを判定
    const useVirtualScroll = elements.length >= VIRTUAL_SCROLL_THRESHOLD;

    if (useVirtualScroll) {
      // 仮想スクロール用のコンテナを設定
      children.style.cssText = `
        height: 400px;
        overflow: hidden;
        position: relative;
      `;

      // 仮想スクロールマネージャーを作成
      const virtualManager = new VirtualScrollManager(children, {
        threshold: 1, // 常に仮想スクロールを使用（閾値チェックは既に済んでいる）
        itemHeight: VIRTUAL_ITEM_HEIGHT,
        bufferSize: 15,
        renderItem: (element, _index) => {
          return this._createLeafNode(element, elementType, searchPattern);
        },
      });

      // 初期化
      virtualManager.initialize(elements);
      this.virtualScrollManagers.set(elementType, virtualManager);
    } else {
      // 通常のレンダリング
      elements.forEach((element) => {
        const leafNode = this._createLeafNode(element, elementType, searchPattern);
        children.appendChild(leafNode);
      });
    }

    node.appendChild(header);
    node.appendChild(children);

    // トグル機能
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleNode(toggle, children);
    });

    header.addEventListener('click', (e) => {
      if (e.target !== toggle) {
        this._toggleNode(toggle, children);
      }
    });

    return node;
  }

  /**
   * 要素のリーフノードを作成
   * @param {Object} element - 要素データ
   * @param {string} elementType - 要素タイプ
   * @param {Object} searchPattern - 検索パターン（オプション）
   * @returns {HTMLElement} リーフノード
   * @private
   */
  _createLeafNode(element, elementType, searchPattern = null) {
    const node = document.createElement('div');
    node.className = 'tree-node tree-leaf-node';

    const header = document.createElement('div');
    header.className = 'tree-node-header';

    const label = document.createElement('div');
    label.className = 'tree-node-label';

    // ID と名前を表示
    const elementInfo = document.createElement('div');
    elementInfo.className = 'tree-element-info';

    const elementId = document.createElement('span');
    elementId.className = 'tree-element-id';
    const idText = element.displayId || element.id || 'N/A';
    const nameText = element.name;

    // ID と名前を組み合わせて表示（検索ハイライト付き）
    if (searchPattern && searchPattern.pattern) {
      if (nameText && nameText !== idText) {
        elementId.innerHTML = `${highlightSearchMatch(idText, searchPattern)} (${highlightSearchMatch(nameText, searchPattern)})`;
      } else {
        elementId.innerHTML = highlightSearchMatch(idText, searchPattern);
      }
    } else {
      if (nameText && nameText !== idText) {
        elementId.textContent = `${idText} (${nameText})`;
      } else {
        elementId.textContent = idText;
      }
    }

    elementInfo.appendChild(elementId);

    // GUID を小さく表示（存在する場合）
    if (element.guid) {
      const guidSpan = document.createElement('div');
      guidSpan.className = 'tree-element-guid';
      // GUIDが長い場合は短縮表示
      const guidText =
        element.guid.length > 20 ? element.guid.substring(0, 20) + '...' : element.guid;

      // 検索ハイライト付き
      if (searchPattern && searchPattern.pattern) {
        guidSpan.innerHTML = `GUID: ${highlightSearchMatch(guidText, searchPattern)}`;
      } else {
        guidSpan.textContent = `GUID: ${guidText}`;
      }
      guidSpan.title = element.guid; // ツールチップに完全なGUIDを表示
      elementInfo.appendChild(guidSpan);
    }

    label.appendChild(elementInfo);

    // ステータスバッジを追加
    const status = document.createElement('span');
    status.className = `tree-element-status ${element.modelSource}`;

    if (element.modelSource === 'matched') {
      status.textContent = '\u4E00\u81F4';
    } else if (element.modelSource === 'onlyA') {
      status.textContent = 'A\u306E\u307F';
    } else if (element.modelSource === 'onlyB') {
      status.textContent = 'B\u306E\u307F';
    }

    label.appendChild(status);

    header.appendChild(label);
    node.appendChild(header);

    // クリックイベント（複数選択対応）
    const elementKey = `${elementType}_${element.displayId}_${element.modelSource}`;
    header.addEventListener('click', (event) => {
      const isMultiSelect = event.ctrlKey || event.metaKey;
      const isRangeSelect = event.shiftKey;

      this._selectTreeElement(elementKey, header, {
        addToSelection: isMultiSelect,
        rangeSelect: isRangeSelect,
      });

      // コールバック呼び出し
      if (this.onElementSelectCallback) {
        // 複数選択の場合は選択された全要素の情報を渡す
        const selectedKeys = this._getSelectedTreeElementKeys();
        if (selectedKeys.length > 1) {
          // 複数選択: 選択されたすべての要素情報を収集
          const selectedElements = selectedKeys.map((key) => {
            const parts = key.split('_');
            const modelSource = parts.pop();
            const elementId = parts.pop();
            const elemType = parts.join('_');
            return {
              elementType: elemType,
              elementId: elementId,
              modelSource: modelSource,
            };
          });
          this.onElementSelectCallback({
            multiSelect: true,
            selectedElements: selectedElements,
            // 最後にクリックした要素の情報も含める
            elementType: elementType,
            elementId: element.displayId,
            modelSource: element.modelSource,
            element: element,
          });
        } else {
          // 単一選択: 従来通り
          this.onElementSelectCallback({
            multiSelect: false,
            elementType: elementType,
            elementId: element.displayId,
            modelSource: element.modelSource,
            element: element,
          });
        }
      }
    });

    // データ属性を設定
    node.dataset.elementKey = elementKey;
    node.dataset.elementType = elementType;
    node.dataset.elementId = element.displayId;
    node.dataset.modelSource = element.modelSource;

    // 右クリックイベント（コンテキストメニュー）
    header.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();

      // まず要素を選択状態にする（まだ選択されていない場合）
      if (!this.selectedElementKeys.has(elementKey)) {
        this._selectTreeElement(elementKey, header, { addToSelection: false });
      }

      // コンテキストメニューを表示
      this._showElementContextMenu(event.clientX, event.clientY, element, elementType);
    });

    return node;
  }

  /**
   * ノードの展開/折りたたみをトグル
   * @param {HTMLElement} toggle - トグル要素
   * @param {HTMLElement} children - 子要素コンテナ
   * @private
   */
  _toggleNode(toggle, children) {
    if (children.classList.contains('expanded')) {
      children.classList.remove('expanded');
      children.classList.add('collapsed');
      toggle.classList.add('collapsed');
    } else {
      children.classList.remove('collapsed');
      children.classList.add('expanded');
      toggle.classList.remove('collapsed');
    }
  }

  /**
   * ツリー要素を選択（複数選択対応）
   * @param {string} elementKey - 要素キー
   * @param {HTMLElement} headerElement - ヘッダー要素
   * @param {Object} options - オプション
   * @param {boolean} options.addToSelection - 既存選択に追加
   * @param {boolean} options.rangeSelect - 範囲選択
   * @private
   */
  _selectTreeElement(elementKey, headerElement, options = {}) {
    const { addToSelection = false, rangeSelect = false } = options;

    if (rangeSelect && this.lastClickedElementKey && this.treeContainer) {
      // Shift+クリック: 範囲選択
      const allLeafNodes = Array.from(this.treeContainer.querySelectorAll('.tree-leaf-node'));
      const startKey = this.lastClickedElementKey;
      const endKey = elementKey;

      let startIdx = allLeafNodes.findIndex((n) => n.dataset.elementKey === startKey);
      let endIdx = allLeafNodes.findIndex((n) => n.dataset.elementKey === endKey);

      if (startIdx !== -1 && endIdx !== -1) {
        // 順序を調整
        if (startIdx > endIdx) {
          [startIdx, endIdx] = [endIdx, startIdx];
        }

        // 範囲内の要素を選択
        for (let i = startIdx; i <= endIdx; i++) {
          const node = allLeafNodes[i];
          const key = node.dataset.elementKey;
          this.selectedElementKeys.add(key);
          const header = node.querySelector('.tree-node-header');
          if (header) header.classList.add('selected');
        }
      }
    } else if (addToSelection) {
      // Ctrl+クリック: 追加選択またはトグル
      if (this.selectedElementKeys.has(elementKey)) {
        // 既に選択済み → 選択解除
        this.selectedElementKeys.delete(elementKey);
        if (headerElement) headerElement.classList.remove('selected');
      } else {
        // 新規追加
        this.selectedElementKeys.add(elementKey);
        if (headerElement) headerElement.classList.add('selected');
      }
    } else {
      // 通常クリック: 単一選択（既存選択を解除）
      if (this.treeContainer) {
        const previouslySelected = this.treeContainer.querySelectorAll(
          '.tree-node-header.selected',
        );
        previouslySelected.forEach((el) => el.classList.remove('selected'));
      }
      this.selectedElementKeys.clear();

      if (headerElement) {
        headerElement.classList.add('selected');
      }
      this.selectedElementKeys.add(elementKey);
    }

    // 最後にクリックした要素を記録（範囲選択用）
    this.lastClickedElementKey = elementKey;
  }

  /**
   * 選択されているすべてのツリー要素のキーを取得
   * @returns {string[]}
   * @private
   */
  _getSelectedTreeElementKeys() {
    return Array.from(this.selectedElementKeys);
  }

  /**
   * 要素のコンテキストメニューを表示
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {Object} element - 要素データ
   * @param {string} elementType - 要素タイプ
   * @private
   */
  _showElementContextMenu(x, y, element, elementType) {
    const selectedCount = this.selectedElementKeys.size;
    const isMultipleSelected = selectedCount > 1;

    const menuItems = [
      {
        label: isMultipleSelected
          ? `${selectedCount}\u500B\u306E\u8981\u7D20\u3092\u975E\u8868\u793A`
          : '\u8981\u7D20\u3092\u975E\u8868\u793A',
        icon: '\uD83D\uDC41\uFE0F',
        action: () => this._handleHideElements(element, elementType),
      },
      { separator: true },
      {
        label: '\u540C\u3058\u30BF\u30A4\u30D7\u306E\u8981\u7D20\u3092\u5168\u9078\u629E',
        icon: '\u2611\uFE0F',
        action: () => this._handleSelectAllOfType(elementType),
      },
      { separator: true },
      {
        label: '\u30D7\u30ED\u30D1\u30C6\u30A3\u3092\u30B3\u30D4\u30FC',
        icon: '\uD83D\uDCCB',
        action: () => this._handleCopyProperties(element, elementType),
        disabled: isMultipleSelected,
      },
    ];

    showContextMenu(x, y, menuItems);
  }

  /**
   * 要素を非表示にする
   * @param {Object} element - 要素データ
   * @param {string} elementType - 要素タイプ
   * @private
   */
  _handleHideElements(element, elementType) {
    const selectedKeys = Array.from(this.selectedElementKeys);

    if (selectedKeys.length > 1) {
      // 複数選択の場合
      const elements = selectedKeys.map((key) => {
        const parts = key.split('_');
        const modelSource = parts.pop();
        const elementId = parts.pop();
        const elemType = parts.join('_');
        return { elementType: elemType, elementId, modelSource };
      });

      if (this.onContextMenuActionCallback) {
        this.onContextMenuActionCallback({
          action: 'hide',
          multiple: true,
          elements: elements,
        });
      }
    } else {
      // 単一選択の場合
      if (this.onContextMenuActionCallback) {
        this.onContextMenuActionCallback({
          action: 'hide',
          multiple: false,
          elementType: elementType,
          elementId: element.displayId,
          modelSource: element.modelSource,
          element: element,
        });
      }
    }
  }

  /**
   * 同じタイプの要素を全選択
   * @param {string} elementType - 要素タイプ
   * @private
   */
  _handleSelectAllOfType(elementType) {
    if (!this.treeContainer || !this.currentComparisonResult) {
      return;
    }

    // 同じタイプの全要素を収集
    const elementsOfType = [];

    // matched
    if (this.currentComparisonResult.matched) {
      this.currentComparisonResult.matched.forEach((pair) => {
        if (pair.a && this._getElementType(pair.a) === elementType) {
          elementsOfType.push({
            elementType: elementType,
            elementId: pair.a.displayId || pair.a.id,
            modelSource: 'matched',
          });
        }
      });
    }

    // onlyA
    if (this.currentComparisonResult.onlyA) {
      this.currentComparisonResult.onlyA.forEach((elem) => {
        if (this._getElementType(elem) === elementType) {
          elementsOfType.push({
            elementType: elementType,
            elementId: elem.displayId || elem.id,
            modelSource: 'onlyA',
          });
        }
      });
    }

    // onlyB
    if (this.currentComparisonResult.onlyB) {
      this.currentComparisonResult.onlyB.forEach((elem) => {
        if (this._getElementType(elem) === elementType) {
          elementsOfType.push({
            elementType: elementType,
            elementId: elem.displayId || elem.id,
            modelSource: 'onlyB',
          });
        }
      });
    }

    // ツリー上の対応するノードを選択
    this.clearTreeSelection();

    elementsOfType.forEach((elem) => {
      const elementKey = `${elem.elementType}_${elem.elementId}_${elem.modelSource}`;
      const node = this.treeContainer.querySelector(`[data-element-key="${elementKey}"]`);
      if (node) {
        const header = node.querySelector('.tree-node-header');
        if (header) {
          this.selectedElementKeys.add(elementKey);
          header.classList.add('selected');
        }
      }
    });

    // 選択数の上限チェック（100件）
    if (this.selectedElementKeys.size > 100) {
      console.warn(
        '\u9078\u629E\u4E0A\u9650\uFF08100\u8981\u7D20\uFF09\u3092\u8D85\u3048\u307E\u3057\u305F\u3002\u6700\u521D\u306E100\u8981\u7D20\u306E\u307F\u9078\u629E\u3055\u308C\u307E\u3059\u3002',
      );
      const keysArray = Array.from(this.selectedElementKeys);
      this.selectedElementKeys.clear();
      keysArray.slice(0, 100).forEach((key) => this.selectedElementKeys.add(key));
    }

    // コールバックを呼び出す
    if (this.onElementSelectCallback && elementsOfType.length > 0) {
      this.onElementSelectCallback({
        multiSelect: true,
        selectedElements: elementsOfType.slice(0, 100),
      });
    }

    console.log(
      `${elementType}\u30BF\u30A4\u30D7\u306E\u8981\u7D20\u3092${Math.min(elementsOfType.length, 100)}\u500B\u9078\u629E\u3057\u307E\u3057\u305F`,
    );
  }

  /**
   * 要素のプロパティをクリップボードにコピー
   * @param {Object} element - 要素データ
   * @param {string} elementType - 要素タイプ
   * @private
   */
  _handleCopyProperties(element, elementType) {
    const properties = {
      '\u30BF\u30A4\u30D7': ELEMENT_LABELS[elementType] || elementType,
      ID: element.displayId || element.id,
      '\u540D\u524D': element.name || '-',
      GUID: element.guid || '-',
      '\u30B9\u30C6\u30FC\u30BF\u30B9':
        element.modelSource === 'matched'
          ? '\u4E00\u81F4'
          : element.modelSource === 'onlyA'
            ? 'A\u306E\u307F'
            : element.modelSource === 'onlyB'
              ? 'B\u306E\u307F'
              : '-',
    };

    // 追加のプロパティがあれば追加
    if (element.section) {
      properties['\u65AD\u9762'] = element.section;
    }
    if (element.material) {
      properties['\u6750\u8CEA'] = element.material;
    }

    const text = Object.entries(properties)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    navigator.clipboard
      .writeText(text)
      .then(() => {
        console.log(
          '\u30D7\u30ED\u30D1\u30C6\u30A3\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F',
        );
        // 簡易的なフィードバック（将来的にトースト通知に置き換え）
        if (this.onContextMenuActionCallback) {
          this.onContextMenuActionCallback({
            action: 'copyProperties',
            success: true,
            elementType: elementType,
            elementId: element.displayId,
            properties: properties,
          });
        }
      })
      .catch((err) => {
        console.error(
          '\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u3078\u306E\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F:',
          err,
        );
      });
  }

  /**
   * 要素から要素タイプを取得するヘルパー
   * @param {Object} element - 要素データ
   * @returns {string} 要素タイプ
   * @private
   */
  _getElementType(element) {
    // elementTypeプロパティがあればそれを使用
    if (element.elementType) {
      return element.elementType;
    }
    // typeプロパティがあればそれを使用
    if (element.type) {
      return element.type;
    }
    // それ以外はUnknown
    return 'Unknown';
  }
}

// シングルトンインスタンス
const instance = new ElementTreeView();

// 既存APIとの互換ラッパー関数

/**
 * ツリー表示を初期化
 * @param {string} containerId - ツリーを表示するコンテナーのID
 * @param {Function} onElementSelect - 要素選択時のコールバック関数
 * @param {Object} [options] - オプション
 * @param {Function} [options.onContextMenuAction] - コンテキストメニューアクションのコールバック
 */
export function initializeTreeView(containerId, onElementSelect, options) {
  instance.initialize(containerId, onElementSelect, options);
}

/**
 * ツリーを構築して表示
 * @param {Object} comparisonResult - 比較結果データ
 */
export function buildTree(comparisonResult) {
  instance.buildTree(comparisonResult);
}

/**
 * 選択をクリア
 */
export function clearTreeSelection() {
  instance.clearTreeSelection();
}

/**
 * 3Dビューアーからの選択に応じてツリー内の要素を選択
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} modelSource - モデルソース (matched, onlyA, onlyB)
 */
export function selectElementInTree(elementType, elementId, modelSource) {
  instance.selectElementInTree(elementType, elementId, modelSource);
}

/**
 * ツリーをクリア
 */
export function clearTree() {
  instance.clearTree();
}
