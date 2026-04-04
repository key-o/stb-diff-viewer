/**
 * @fileoverview 断面ツリービュー
 *
 * 断面ごとに配置要素をグループ化して表示するツリービュー機能を提供します。
 * - 断面タイプ別の階層表示（柱断面、梁断面など）
 * - 各断面を使用している配置要素のリスト表示
 * - 階ごと・符号ごとのグループ化オプション
 * - 断面選択時に使用要素を一括ハイライト（将来の複数選択機能）
 * - テキスト検索（断面ID、断面名）
 * - 正規表現サポート（/pattern/ 形式）
 */

import {
  parseSearchPattern,
  matchesSectionSearch,
  highlightSearchMatch,
  DEFAULT_SECTION_TARGET_FILTER,
} from './treeSearch.js';
import { showContextMenu } from '../common/contextMenu.js';
import { VirtualScrollManager } from '../common/virtualScroll.js';
import { SECTION_LABELS } from '../../config/elementLabels.js';
import { createLogger } from '../../utils/logger.js';
import { VIRTUAL_SCROLL_CONFIG } from '../../config/virtualScrollConfig.js';
import { BaseTreeView } from './BaseTreeView.js';

const log = createLogger('sectionTreeView');

// 仮想スクロール関連（SSOT: virtualScrollConfig.js）
const VIRTUAL_SCROLL_THRESHOLD = VIRTUAL_SCROLL_CONFIG.THRESHOLD;
const VIRTUAL_ITEM_HEIGHT = VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT.section;

// 断面タイプの日本語名マップ - elementLabels.jsからインポートしたSECTION_LABELSを使用
const SECTION_TYPE_NAMES = SECTION_LABELS;

class SectionTreeView extends BaseTreeView {
  constructor() {
    super({
      name: 'sectionTree',
      emptyMessage: '断面データがありません',
      searchPlaceholder: '検索... (/正規表現/)',
      showStatusFilter: false,
      searchTargetOptions: [
        { key: 'sectionId', label: '断面ID' },
        { key: 'sectionName', label: '断面名' },
        { key: 'shapeName', label: '形状名' },
      ],
      defaultTargetFilter: DEFAULT_SECTION_TARGET_FILTER,
    });

    /** @type {string} グループ化モード: 'floor' (階ごと) または 'code' (符号ごと) */
    this.groupingMode = 'floor';

    /** @type {Object} 現在の断面データ（検索再実行用） */
    this.currentSectionsData = null;

    /** @type {{total: number, filtered: number}} 断面統計（全体・フィルタ後） */
    this.sectionStats = { total: 0, filtered: 0 };
  }

  // --- テンプレートメソッド オーバーライド ---

  /** 初期化完了時フック */
  _onInitialized() {
    log.info('Section tree view initialized');
  }

  /** 検索クリア時フック */
  _onSearchClear() {
    this.currentSearchText = '';
    this.currentTargetFilter = { ...DEFAULT_SECTION_TARGET_FILTER };
  }

  /**
   * ツリーを再構築
   */
  rebuild() {
    this.buildSectionTree(this.currentComparisonResult, this.currentSectionsData);
  }

  // --- 公開メソッド ---

  /**
   * グループ化モードを設定
   * @param {string} mode - 'floor' または 'code'
   */
  setGroupingMode(mode) {
    if (['floor', 'code'].includes(mode)) {
      this.groupingMode = mode;
      log.info(`Grouping mode set to: ${mode}`);
    } else {
      log.warn(`Invalid grouping mode: ${mode}`);
    }
  }

  /**
   * 比較結果から断面ツリーを構築
   * @param {Object} comparisonResult - 比較結果 {matched: [], onlyA: [], onlyB: []}
   * @param {Object} sectionsData - 断面データ {columnSections: Map, girderSections: Map, ...}
   */
  buildSectionTree(comparisonResult, sectionsData) {
    if (!this.treeContainer) {
      log.error('Tree container not initialized');
      return;
    }

    // 再検索用にデータを保存
    this.currentComparisonResult = comparisonResult;
    this.currentSectionsData = sectionsData;

    if (!sectionsData) {
      log.warn('sectionsData is null or undefined');
      this.clearTreeContent();

      // 空のメッセージを表示
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'section-tree-empty-message';
      emptyMessage.style.cssText = 'padding: 10px; text-align: center; color: #666;';
      emptyMessage.textContent = '断面データがありません';
      this.treeContainer.appendChild(emptyMessage);
      this.sectionStats = { total: 0, filtered: 0 };
      this.updateResultCount(0, 0);
      return;
    }

    this.clearTreeContent();

    // 検索パターンを解析
    const searchPattern = parseSearchPattern(this.currentSearchText);

    // 断面の使用状況マップを作成
    const sectionUsageMap = this._createSectionUsageMap(comparisonResult);

    log.info('Section usage map:', sectionUsageMap);

    // 断面タイプごとにツリーノードを作成
    const sectionTypes = ['Column', 'Girder', 'Beam', 'Brace', 'Slab', 'Wall'];

    this.sectionStats = { total: 0, filtered: 0 };

    sectionTypes.forEach((elementType) => {
      const sectionMapKey = `${elementType.toLowerCase()}Sections`;
      const sectionMap = sectionsData[sectionMapKey];

      if (!sectionMap || sectionMap.size === 0) return;

      // この要素タイプで実際に使用されている断面のみを抽出
      const usedSections = [];
      sectionMap.forEach((sectionData, sectionId) => {
        const usage = sectionUsageMap[elementType]?.[sectionId];
        if (usage && usage.length > 0) {
          usedSections.push({
            sectionId,
            sectionData,
            elements: usage,
          });
        }
      });

      if (usedSections.length === 0) return;

      // 全断面数をカウント
      this.sectionStats.total += usedSections.length;

      // 検索フィルタリングを適用
      const filteredSections = usedSections.filter((section) =>
        matchesSectionSearch(section, searchPattern, this.currentTargetFilter),
      );

      this.sectionStats.filtered += filteredSections.length;

      if (filteredSections.length === 0) return;

      // 断面タイプノードを作成
      const typeNode = this._createSectionTypeNode(elementType, filteredSections, searchPattern);
      this.treeContainer.appendChild(typeNode);
    });

    // ツリーが空の場合、メッセージを表示
    const hasContent = Array.from(this.treeContainer.children).some(
      (child) => !child.classList.contains('tree-search-container'),
    );

    if (!hasContent) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'section-tree-no-result-message';
      emptyMessage.style.cssText = 'padding: 20px; text-align: center; color: #868e96;';
      emptyMessage.textContent = this.currentSearchText
        ? '検索条件に一致する断面がありません'
        : '使用されている断面がありません';
      this.treeContainer.appendChild(emptyMessage);
    }

    // 検索結果数を更新
    this.updateResultCount(this.sectionStats.filtered, this.sectionStats.total);
  }

  /**
   * 検索をリセット
   */
  resetSearch() {
    this.currentSearchText = '';
    this.currentTargetFilter = { ...DEFAULT_SECTION_TARGET_FILTER };
    if (this.searchUI) {
      this.searchUI.reset();
    }
    if (this.currentComparisonResult && this.currentSectionsData) {
      this.buildSectionTree(this.currentComparisonResult, this.currentSectionsData);
    }
  }

  /**
   * 検索テキストを設定して検索を実行
   * @param {string} searchText - 検索テキスト
   */
  setSearchText(searchText) {
    this.currentSearchText = searchText;
    if (this.currentComparisonResult && this.currentSectionsData) {
      this.buildSectionTree(this.currentComparisonResult, this.currentSectionsData);
    }
  }

  // --- 内部メソッド ---

  /**
   * 断面の使用状況マップを作成
   * @param {Object} comparisonResult - 比較結果
   * @returns {Object} 断面使用状況マップ
   * @private
   */
  _createSectionUsageMap(comparisonResult) {
    const usageMap = {};

    if (!comparisonResult) {
      log.warn('comparisonResult is null or undefined');
      return usageMap;
    }

    // matched要素を処理
    if (comparisonResult.matched) {
      comparisonResult.matched.forEach((item) => {
        const elementA = item.elementA || item;
        const elementType = item.elementType;

        // 要素Aの断面情報
        if (elementA && elementA.element?.id_section) {
          this._addToUsageMap(usageMap, elementType, elementA.element.id_section, {
            elementId: elementA.id,
            elementType: elementType,
            modelSource: 'matched',
            name: elementA.name,
            guid: elementA.guid,
            coords: elementA.startCoords || elementA.coords,
          });
        }
      });
    }

    // onlyA要素を処理
    if (comparisonResult.onlyA) {
      comparisonResult.onlyA.forEach((item) => {
        const element = item.element || item;
        const elementType = item.elementType;

        if (element && element.id_section) {
          this._addToUsageMap(usageMap, elementType, element.id_section, {
            elementId: item.id || element.id,
            elementType: elementType,
            modelSource: 'onlyA',
            name: item.name,
            guid: item.guid,
            coords: item.coords,
          });
        }
      });
    }

    // onlyB要素を処理
    if (comparisonResult.onlyB) {
      comparisonResult.onlyB.forEach((item) => {
        const element = item.element || item;
        const elementType = item.elementType;

        if (element && element.id_section) {
          this._addToUsageMap(usageMap, elementType, element.id_section, {
            elementId: item.id || element.id,
            elementType: elementType,
            modelSource: 'onlyB',
            name: item.name,
            guid: item.guid,
            coords: item.coords,
          });
        }
      });
    }

    return usageMap;
  }

  /**
   * 使用状況マップに要素を追加
   * @param {Object} usageMap - 使用状況マップ
   * @param {string} elementType - 要素タイプ
   * @param {string} sectionId - 断面ID
   * @param {Object} elementInfo - 要素情報
   * @private
   */
  _addToUsageMap(usageMap, elementType, sectionId, elementInfo) {
    if (!usageMap[elementType]) {
      usageMap[elementType] = {};
    }
    if (!usageMap[elementType][sectionId]) {
      usageMap[elementType][sectionId] = [];
    }
    usageMap[elementType][sectionId].push(elementInfo);
  }

  /**
   * 断面タイプノードを作成
   * @param {string} elementType - 要素タイプ
   * @param {Array} usedSections - 使用されている断面のリスト
   * @param {Object} searchPattern - 検索パターン（オプション）
   * @returns {HTMLElement} 断面タイプノード
   * @private
   */
  _createSectionTypeNode(elementType, usedSections, searchPattern = null) {
    const typeContainer = document.createElement('div');
    typeContainer.className = 'section-type-container';

    const typeHeader = document.createElement('div');
    typeHeader.className = 'section-type-header';

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'tree-toggle-icon';
    toggleIcon.textContent = '▶';

    const typeName = document.createElement('span');
    typeName.className = 'section-type-name';
    typeName.textContent = SECTION_TYPE_NAMES[elementType] || `${elementType}断面`;

    const sectionCount = document.createElement('span');
    sectionCount.className = 'section-count';
    sectionCount.textContent = `${usedSections.length}断面`;

    typeHeader.appendChild(toggleIcon);
    typeHeader.appendChild(typeName);
    typeHeader.appendChild(sectionCount);

    const sectionsContainer = document.createElement('div');
    sectionsContainer.className = 'sections-container';

    // 検索中の場合は初期状態で展開
    const shouldExpand = searchPattern && searchPattern.pattern;
    sectionsContainer.style.display = shouldExpand ? 'block' : 'none';
    toggleIcon.textContent = shouldExpand ? '▼' : '▶';
    if (shouldExpand) {
      toggleIcon.classList.add('expanded');
    }

    // 各断面ノードを作成
    usedSections.forEach(({ sectionId, sectionData, elements }) => {
      const sectionNode = this._createSectionNode(
        elementType,
        sectionId,
        sectionData,
        elements,
        searchPattern,
      );
      sectionsContainer.appendChild(sectionNode);
    });

    // クリックで展開/折りたたみ
    typeHeader.addEventListener('click', () => {
      const isExpanded = sectionsContainer.style.display !== 'none';
      sectionsContainer.style.display = isExpanded ? 'none' : 'block';
      toggleIcon.textContent = isExpanded ? '▶' : '▼';
      toggleIcon.classList.toggle('expanded', !isExpanded);
    });

    typeContainer.appendChild(typeHeader);
    typeContainer.appendChild(sectionsContainer);

    return typeContainer;
  }

  /**
   * 個別断面ノードを作成
   * @param {string} elementType - 要素タイプ
   * @param {string} sectionId - 断面ID
   * @param {Object} sectionData - 断面データ
   * @param {Array} elements - この断面を使用している要素のリスト
   * @param {Object} searchPattern - 検索パターン（オプション）
   * @returns {HTMLElement} 断面ノード
   * @private
   */
  _createSectionNode(elementType, sectionId, sectionData, elements, searchPattern = null) {
    const sectionContainer = document.createElement('div');
    sectionContainer.className = 'section-item-container';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-item-header';

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'tree-toggle-icon section-toggle';
    toggleIcon.textContent = '▶';

    const sectionIcon = document.createElement('span');
    sectionIcon.className = 'section-icon';
    sectionIcon.textContent = '📐';

    const sectionInfo = document.createElement('div');
    sectionInfo.className = 'section-info';

    const sectionName = document.createElement('span');
    sectionName.className = 'section-name';
    const displayName = sectionData?.name || sectionData?.shapeName || sectionId;

    // 検索ハイライトを適用
    if (searchPattern && searchPattern.pattern) {
      if (displayName !== sectionId) {
        sectionName.innerHTML = `${highlightSearchMatch(sectionId, searchPattern)}: ${highlightSearchMatch(displayName, searchPattern)}`;
      } else {
        sectionName.innerHTML = highlightSearchMatch(sectionId, searchPattern);
      }
    } else {
      sectionName.textContent = `${sectionId}${displayName !== sectionId ? `: ${displayName}` : ''}`;
    }

    const elementCount = document.createElement('span');
    elementCount.className = 'element-count';
    elementCount.textContent = `${elements.length}要素`;

    sectionInfo.appendChild(sectionName);
    if (sectionData?.section_type || sectionData?.kind) {
      const sectionType = document.createElement('div');
      sectionType.className = 'section-type-label';
      const typeText = sectionData.section_type || sectionData.kind || '';
      // 検索ハイライトを適用
      if (searchPattern && searchPattern.pattern) {
        sectionType.innerHTML = highlightSearchMatch(typeText, searchPattern);
      } else {
        sectionType.textContent = typeText;
      }
      sectionInfo.appendChild(sectionType);
    }

    sectionHeader.appendChild(toggleIcon);
    sectionHeader.appendChild(sectionIcon);
    sectionHeader.appendChild(sectionInfo);
    sectionHeader.appendChild(elementCount);

    const elementsContainer = document.createElement('div');
    elementsContainer.className = 'section-elements-container';
    elementsContainer.style.display = 'none';

    // グループ化モードに応じて要素を整理
    const groupedElements = this._groupElements(elements);

    // 仮想スクロール用の変数
    let virtualManager = null;

    // グループごとにノードを作成
    Object.entries(groupedElements).forEach(([groupKey, groupElems]) => {
      if (this.groupingMode === 'floor' || this.groupingMode === 'code') {
        // グループヘッダーを作成
        const groupNode = this._createGroupNode(groupKey, groupElems, elementType);
        elementsContainer.appendChild(groupNode);
      } else {
        // グループ化なしの場合
        const useVirtualScroll = groupElems.length >= VIRTUAL_SCROLL_THRESHOLD;

        if (useVirtualScroll) {
          // 仮想スクロール用のコンテナ設定
          elementsContainer.style.height = '400px';
          elementsContainer.style.overflow = 'hidden';

          virtualManager = new VirtualScrollManager(elementsContainer, {
            threshold: VIRTUAL_SCROLL_THRESHOLD,
            itemHeight: VIRTUAL_ITEM_HEIGHT,
            bufferSize: VIRTUAL_SCROLL_CONFIG.BUFFER_SIZE,
            renderItem: (elem) => this._createElementNode(elem, elementType),
          });

          // 仮想スクロールマネージャーを保存
          const managerId = `section_${sectionId}_${elementType}`;
          this.virtualScrollManagers.set(managerId, virtualManager);
        } else {
          // 直接要素を追加
          groupElems.forEach((elem) => {
            const elemNode = this._createElementNode(elem, elementType);
            elementsContainer.appendChild(elemNode);
          });
        }
      }
    });

    // クリックで展開/折りたたみ または Ctrl+クリックで全要素選択
    sectionHeader.addEventListener('click', (e) => {
      e.stopPropagation();

      // Ctrl+クリック: この断面の全要素を選択
      if (e.ctrlKey || e.metaKey) {
        if (this.onElementSelectCallback && elements.length > 0) {
          // 全要素の情報を収集
          const selectedElements = elements.map((elem) => ({
            elementType: elementType,
            elementId: elem.displayId || elem.id,
            modelSource: elem.modelSource,
          }));

          this.onElementSelectCallback({
            multiSelect: true,
            selectedElements: selectedElements,
            sectionId: sectionId,
            sectionName: sectionData?.name || sectionData?.shapeName || sectionId,
          });
        }
        return;
      }

      // 通常クリック: 展開/折りたたみ
      const isExpanded = elementsContainer.style.display !== 'none';
      elementsContainer.style.display = isExpanded ? 'none' : 'block';
      toggleIcon.textContent = isExpanded ? '▶' : '▼';
      toggleIcon.classList.toggle('expanded', !isExpanded);

      // 仮想スクロールの初期化（初回展開時）
      if (!isExpanded && virtualManager && !virtualManager.isVirtualScrollEnabled()) {
        virtualManager.initialize(elements);
      }
    });

    // 右クリックイベント（コンテキストメニュー）
    sectionHeader.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showSectionContextMenu(
        e.clientX,
        e.clientY,
        sectionId,
        sectionData,
        elements,
        elementType,
      );
    });

    sectionContainer.appendChild(sectionHeader);
    sectionContainer.appendChild(elementsContainer);

    return sectionContainer;
  }

  /**
   * 要素をグループ化
   * @param {Array} elements - 要素のリスト
   * @returns {Object} グループ化された要素
   * @private
   */
  _groupElements(elements) {
    const groups = {};

    elements.forEach((elem) => {
      let groupKey;

      if (this.groupingMode === 'floor') {
        // 階ごとにグループ化
        const floor = this._extractFloorFromId(elem.elementId);
        groupKey = floor || '不明';
      } else if (this.groupingMode === 'code') {
        // 符号ごとにグループ化
        const code = this._extractCodeFromId(elem.elementId);
        groupKey = code || elem.elementId;
      } else {
        // グループ化なし
        groupKey = 'all';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(elem);
    });

    return groups;
  }

  /**
   * 要素IDから階番号を抽出
   * @param {string} elementId - 要素ID
   * @returns {string|null} 階番号（例: "1F", "2F"）
   * @private
   */
  _extractFloorFromId(elementId) {
    if (!elementId) return null;

    // パターン1: "1C1", "2G3" などの先頭が数字の場合
    const match1 = elementId.match(/^(\d+)[A-Z]/);
    if (match1) {
      return `${match1[1]}階`;
    }

    // パターン2: "F1C1", "F2G3" などのF+数字の場合
    const match2 = elementId.match(/^F(\d+)/i);
    if (match2) {
      return `${match2[1]}階`;
    }

    // パターン3: アンダースコア区切り "1_C1", "2_G3"
    const match3 = elementId.match(/^(\d+)_/);
    if (match3) {
      return `${match3[1]}階`;
    }

    return null;
  }

  /**
   * 要素IDから符号（階番号を除いた部分）を抽出
   * @param {string} elementId - 要素ID
   * @returns {string} 符号
   * @private
   */
  _extractCodeFromId(elementId) {
    if (!elementId) return elementId;

    // パターン1: "1C1" → "C1"
    const match1 = elementId.match(/^\d+([A-Z]\d+)/);
    if (match1) {
      return match1[1];
    }

    // パターン2: "F1C1" → "C1"
    const match2 = elementId.match(/^F\d+([A-Z]\d+)/i);
    if (match2) {
      return match2[1];
    }

    // パターン3: "1_C1" → "C1"
    const match3 = elementId.match(/^\d+_(.+)/);
    if (match3) {
      return match3[1];
    }

    return elementId;
  }

  /**
   * グループノード（階や符号のグループ）を作成
   * @param {string} groupKey - グループキー
   * @param {Array} elements - グループ内の要素
   * @param {string} elementType - 要素タイプ
   * @returns {HTMLElement} グループノード
   * @private
   */
  _createGroupNode(groupKey, elements, elementType) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'element-group-container';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'element-group-header';

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'tree-toggle-icon group-toggle';
    toggleIcon.textContent = '▶';

    const groupName = document.createElement('span');
    groupName.className = 'group-name';
    groupName.textContent = groupKey;

    const groupCount = document.createElement('span');
    groupCount.className = 'group-count';
    groupCount.textContent = `${elements.length}要素`;

    groupHeader.appendChild(toggleIcon);
    groupHeader.appendChild(groupName);
    groupHeader.appendChild(groupCount);

    const elementsContainer = document.createElement('div');
    elementsContainer.className = 'group-elements-container';
    elementsContainer.style.display = 'none';

    // 仮想スクロールを使用するかどうか
    const useVirtualScroll = elements.length >= VIRTUAL_SCROLL_THRESHOLD;
    let virtualManager = null;

    if (useVirtualScroll) {
      // 仮想スクロール用のコンテナ設定
      elementsContainer.style.height = '400px';
      elementsContainer.style.overflow = 'hidden';

      virtualManager = new VirtualScrollManager(elementsContainer, {
        threshold: VIRTUAL_SCROLL_THRESHOLD,
        itemHeight: VIRTUAL_ITEM_HEIGHT,
        bufferSize: VIRTUAL_SCROLL_CONFIG.BUFFER_SIZE,
        renderItem: (elem) => this._createElementNode(elem, elementType),
      });

      // 仮想スクロールマネージャーを保存
      const managerId = `group_${groupKey}_${elementType}`;
      this.virtualScrollManagers.set(managerId, virtualManager);
    } else {
      // 各要素ノードを作成
      elements.forEach((elem) => {
        const elemNode = this._createElementNode(elem, elementType);
        elementsContainer.appendChild(elemNode);
      });
    }

    // クリックで展開/折りたたみ
    groupHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = elementsContainer.style.display !== 'none';
      elementsContainer.style.display = isExpanded ? 'none' : 'block';
      toggleIcon.textContent = isExpanded ? '▶' : '▼';
      toggleIcon.classList.toggle('expanded', !isExpanded);

      // 仮想スクロールの初期化（初回展開時）
      if (!isExpanded && virtualManager && !virtualManager.isVirtualScrollEnabled()) {
        virtualManager.initialize(elements);
      }
    });

    groupContainer.appendChild(groupHeader);
    groupContainer.appendChild(elementsContainer);

    return groupContainer;
  }

  /**
   * 個別要素ノードを作成
   * @param {Object} elementInfo - 要素情報
   * @param {string} elementType - 要素タイプ
   * @returns {HTMLElement} 要素ノード
   * @private
   */
  _createElementNode(elementInfo, elementType) {
    const elementNode = document.createElement('div');
    elementNode.className = 'section-tree-element-item';

    // 差分状態アイコン
    const diffIcon = document.createElement('span');
    diffIcon.className = `tree-diff-icon ${elementInfo.modelSource}`;
    if (elementInfo.modelSource === 'matched') {
      diffIcon.textContent = '●';
      diffIcon.style.color = '#12b886';
    } else if (elementInfo.modelSource === 'onlyA') {
      diffIcon.textContent = '●';
      diffIcon.style.color = '#37b24d';
    } else if (elementInfo.modelSource === 'onlyB') {
      diffIcon.textContent = '●';
      diffIcon.style.color = '#f03e3e';
    }

    // 要素情報
    const elementInfoDiv = document.createElement('div');
    elementInfoDiv.className = 'tree-element-info';

    const elementId = document.createElement('span');
    elementId.className = 'tree-element-id';

    const idText = elementInfo.elementId || 'N/A';
    const nameText = elementInfo.name;

    if (nameText && nameText !== idText) {
      elementId.textContent = `${idText} (${nameText})`;
    } else {
      elementId.textContent = idText;
    }

    elementInfoDiv.appendChild(elementId);

    // GUIDがあれば表示
    if (elementInfo.guid) {
      const guidSpan = document.createElement('div');
      guidSpan.className = 'tree-element-guid';
      const guidText =
        elementInfo.guid.length > 20 ? elementInfo.guid.substring(0, 20) + '...' : elementInfo.guid;
      guidSpan.textContent = `GUID: ${guidText}`;
      guidSpan.title = elementInfo.guid;
      elementInfoDiv.appendChild(guidSpan);
    }

    elementNode.appendChild(diffIcon);
    elementNode.appendChild(elementInfoDiv);

    // クリックで要素を選択
    elementNode.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onElementSelectCallback) {
        this.onElementSelectCallback({
          elementType: elementType,
          elementId: elementInfo.elementId,
          modelSource: elementInfo.modelSource,
        });
      }
    });

    return elementNode;
  }

  /**
   * 断面のコンテキストメニューを表示
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {string} sectionId - 断面ID
   * @param {Object} sectionData - 断面データ
   * @param {Array} elements - この断面を使用している要素のリスト
   * @param {string} elementType - 要素タイプ
   * @private
   */
  _showSectionContextMenu(x, y, sectionId, sectionData, elements, elementType) {
    const menuItems = [
      {
        label: 'この断面の要素をすべて選択',
        icon: '☑️',
        action: () =>
          this._handleSelectAllSectionElements(sectionId, sectionData, elements, elementType),
        disabled: elements.length === 0,
      },
      { separator: true },
      {
        label: '断面情報をコピー',
        icon: '📋',
        action: () => this._handleCopySectionInfo(sectionId, sectionData, elements),
      },
      { separator: true },
      {
        label: `使用要素数: ${elements.length}`,
        icon: '📊',
        disabled: true,
      },
    ];

    showContextMenu(x, y, menuItems);
  }

  /**
   * 断面の全要素を選択
   * @param {string} sectionId - 断面ID
   * @param {Object} sectionData - 断面データ
   * @param {Array} elements - 要素リスト
   * @param {string} elementType - 要素タイプ
   * @private
   */
  _handleSelectAllSectionElements(sectionId, sectionData, elements, elementType) {
    if (!elements || elements.length === 0) {
      return;
    }

    // 選択上限チェック（100件）
    const limitedElements = elements.slice(0, 100);
    if (elements.length > 100) {
      log.warn(`選択上限（100要素）を超えました。最初の100要素のみ選択されます。`);
    }

    const selectedElements = limitedElements.map((elem) => ({
      elementType: elementType,
      elementId: elem.displayId || elem.id,
      modelSource: elem.modelSource,
    }));

    if (this.onElementSelectCallback) {
      this.onElementSelectCallback({
        multiSelect: true,
        selectedElements: selectedElements,
        sectionId: sectionId,
        sectionName: sectionData?.name || sectionData?.shapeName || sectionId,
      });
    }

    log.info(`断面「${sectionId}」の要素を${selectedElements.length}個選択しました`);
  }

  /**
   * 断面情報をクリップボードにコピー
   * @param {string} sectionId - 断面ID
   * @param {Object} sectionData - 断面データ
   * @param {Array} elements - 要素リスト
   * @private
   */
  _handleCopySectionInfo(sectionId, sectionData, elements) {
    const info = {
      断面ID: sectionId,
      断面名: sectionData?.name || sectionData?.shapeName || '-',
      断面タイプ: sectionData?.section_type || sectionData?.kind || '-',
      使用要素数: elements.length,
    };

    // 詳細情報があれば追加
    if (sectionData?.A) {
      info['面積(A)'] = sectionData.A;
    }
    if (sectionData?.Ix || sectionData?.Iy) {
      info['断面二次モーメント(Ix)'] = sectionData.Ix || '-';
      info['断面二次モーメント(Iy)'] = sectionData.Iy || '-';
    }
    if (sectionData?.Zx || sectionData?.Zy) {
      info['断面係数(Zx)'] = sectionData.Zx || '-';
      info['断面係数(Zy)'] = sectionData.Zy || '-';
    }

    const text = Object.entries(info)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    navigator.clipboard
      .writeText(text)
      .then(() => {
        log.info('断面情報をクリップボードにコピーしました');
        if (this.onContextMenuActionCallback) {
          this.onContextMenuActionCallback({
            action: 'copySectionInfo',
            success: true,
            sectionId: sectionId,
            info: info,
          });
        }
      })
      .catch((err) => {
        log.error('クリップボードへのコピーに失敗しました:', err);
      });
  }
}

// シングルトンインスタンス
const instance = new SectionTreeView();

// 既存APIとの互換ラッパー関数

/**
 * 断面ツリービューを初期化
 * @param {string} containerId - ツリーを表示するコンテナーのID
 * @param {Function} onElementSelect - 要素選択時のコールバック
 * @param {Object} [options] - オプション
 * @param {Function} [options.onContextMenuAction] - コンテキストメニューアクションのコールバック
 */
export function initializeSectionTreeView(containerId, onElementSelect, options) {
  instance.initialize(containerId, onElementSelect, options);
}

/**
 * 比較結果から断面ツリーを構築
 * @param {Object} comparisonResult - 比較結果
 * @param {Object} sectionsData - 断面データ
 */
export function buildSectionTree(comparisonResult, sectionsData) {
  instance.buildSectionTree(comparisonResult, sectionsData);
}

/**
 * グループ化モードを設定
 * @param {string} mode - 'floor' または 'code'
 */
export function setGroupingMode(mode) {
  instance.setGroupingMode(mode);
}

/**
 * 断面ツリーをクリア
 */
export function clearSectionTree() {
  instance.clearTree();
}

/**
 * 検索をリセット
 */
export function resetSectionSearch() {
  instance.resetSearch();
}

/**
 * 検索テキストを設定して検索を実行
 * @param {string} searchText - 検索テキスト
 */
export function setSectionSearchText(searchText) {
  instance.setSearchText(searchText);
}
