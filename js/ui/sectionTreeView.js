/**
 * @fileoverview 断面ツリービュー
 *
 * 断面ごとに配置要素をグループ化して表示するツリービュー機能を提供します。
 * - 断面タイプ別の階層表示（柱断面、梁断面など）
 * - 各断面を使用している配置要素のリスト表示
 * - 階ごと・符号ごとのグループ化オプション
 * - 断面選択時に使用要素を一括ハイライト（将来の複数選択機能）
 */

/**
 * ツリーコンテナのDOM要素
 * @type {HTMLElement}
 */
let treeContainer = null;

/**
 * 要素選択時のコールバック関数
 * @type {Function}
 */
let onElementSelectCallback = null;

/**
 * グループ化モード: 'floor' (階ごと) または 'code' (符号ごと)
 * @type {string}
 */
let groupingMode = 'floor';

/**
 * 断面タイプの日本語名マップ
 */
const SECTION_TYPE_NAMES = {
  'Column': '柱断面',
  'Girder': '大梁断面',
  'Beam': '小梁断面',
  'Brace': 'ブレース断面',
  'Slab': 'スラブ断面',
  'Wall': '壁断面',
  'Foundation': '基礎断面',
  'Pile': '杭断面'
};

/**
 * 断面ツリービューを初期化
 * @param {string} containerId - ツリーを表示するコンテナのID
 * @param {Function} onElementSelect - 要素選択時のコールバック
 */
export function initializeSectionTreeView(containerId, onElementSelect) {
  treeContainer = document.getElementById(containerId);
  if (!treeContainer) {
    console.error(`Container with id '${containerId}' not found`);
    return;
  }
  onElementSelectCallback = onElementSelect;
  console.log('Section tree view initialized');
}

/**
 * グループ化モードを設定
 * @param {string} mode - 'floor' または 'code'
 */
export function setGroupingMode(mode) {
  if (['floor', 'code'].includes(mode)) {
    groupingMode = mode;
    console.log(`Grouping mode set to: ${mode}`);
  } else {
    console.warn(`Invalid grouping mode: ${mode}`);
  }
}

/**
 * 断面ツリーをクリア
 */
export function clearSectionTree() {
  if (!treeContainer) return;

  // メモリリーク防止のため、子要素を1つずつ削除
  while (treeContainer.firstChild) {
    treeContainer.removeChild(treeContainer.firstChild);
  }
}

/**
 * 比較結果から断面ツリーを構築
 * @param {Object} comparisonResult - 比較結果 {matched: [], onlyA: [], onlyB: []}
 * @param {Object} sectionsData - 断面データ {columnSections: Map, girderSections: Map, ...}
 */
export function buildSectionTree(comparisonResult, sectionsData) {
  if (!treeContainer) {
    console.error('Tree container not initialized');
    return;
  }

  if (!sectionsData) {
    console.warn('sectionsData is null or undefined');
    clearSectionTree();

    // 空のメッセージを表示
    const emptyMessage = document.createElement('div');
    emptyMessage.style.cssText = 'padding: 10px; text-align: center; color: #666;';
    emptyMessage.textContent = '断面データがありません';
    treeContainer.appendChild(emptyMessage);
    return;
  }

  clearSectionTree();

  // 断面の使用状況マップを作成
  const sectionUsageMap = createSectionUsageMap(comparisonResult);

  console.log('Section usage map:', sectionUsageMap);

  // 断面タイプごとにツリーノードを作成
  const sectionTypes = ['Column', 'Girder', 'Beam', 'Brace', 'Slab', 'Wall'];

  sectionTypes.forEach(elementType => {
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
          elements: usage
        });
      }
    });

    if (usedSections.length === 0) return;

    // 断面タイプノードを作成
    const typeNode = createSectionTypeNode(elementType, usedSections);
    treeContainer.appendChild(typeNode);
  });

  // ツリーが空の場合、メッセージを表示
  if (treeContainer.children.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.style.cssText = 'padding: 10px; text-align: center; color: #666;';
    emptyMessage.textContent = '使用されている断面がありません';
    treeContainer.appendChild(emptyMessage);
  }
}

/**
 * 断面の使用状況マップを作成
 * @param {Object} comparisonResult - 比較結果
 * @returns {Object} 断面使用状況マップ
 */
function createSectionUsageMap(comparisonResult) {
  const usageMap = {};

  if (!comparisonResult) {
    console.warn('comparisonResult is null or undefined');
    return usageMap;
  }

  // matched要素を処理
  if (comparisonResult.matched) {
    comparisonResult.matched.forEach(item => {
      const elementA = item.elementA || item;
      const elementB = item.elementB;
      const elementType = item.elementType;

      // 要素Aの断面情報
      if (elementA && elementA.element?.id_section) {
        addToUsageMap(usageMap, elementType, elementA.element.id_section, {
          elementId: elementA.id,
          elementType: elementType,
          modelSource: 'matched',
          name: elementA.name,
          guid: elementA.guid,
          coords: elementA.startCoords || elementA.coords
        });
      }
    });
  }

  // onlyA要素を処理
  if (comparisonResult.onlyA) {
    comparisonResult.onlyA.forEach(item => {
      const element = item.element || item;
      const elementType = item.elementType;

      if (element && element.id_section) {
        addToUsageMap(usageMap, elementType, element.id_section, {
          elementId: item.id || element.id,
          elementType: elementType,
          modelSource: 'onlyA',
          name: item.name,
          guid: item.guid,
          coords: item.coords
        });
      }
    });
  }

  // onlyB要素を処理
  if (comparisonResult.onlyB) {
    comparisonResult.onlyB.forEach(item => {
      const element = item.element || item;
      const elementType = item.elementType;

      if (element && element.id_section) {
        addToUsageMap(usageMap, elementType, element.id_section, {
          elementId: item.id || element.id,
          elementType: elementType,
          modelSource: 'onlyB',
          name: item.name,
          guid: item.guid,
          coords: item.coords
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
 */
function addToUsageMap(usageMap, elementType, sectionId, elementInfo) {
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
 * @returns {HTMLElement} 断面タイプノード
 */
function createSectionTypeNode(elementType, usedSections) {
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
  sectionsContainer.style.display = 'none'; // 初期状態は折りたたみ

  // 各断面ノードを作成
  usedSections.forEach(({ sectionId, sectionData, elements }) => {
    const sectionNode = createSectionNode(elementType, sectionId, sectionData, elements);
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
 * @returns {HTMLElement} 断面ノード
 */
function createSectionNode(elementType, sectionId, sectionData, elements) {
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
  sectionName.textContent = `${sectionId}${displayName !== sectionId ? `: ${displayName}` : ''}`;

  const elementCount = document.createElement('span');
  elementCount.className = 'element-count';
  elementCount.textContent = `${elements.length}要素`;

  sectionInfo.appendChild(sectionName);
  if (sectionData?.section_type || sectionData?.kind) {
    const sectionType = document.createElement('div');
    sectionType.className = 'section-type-label';
    sectionType.textContent = sectionData.section_type || sectionData.kind || '';
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
  const groupedElements = groupElements(elements);

  // グループごとにノードを作成
  Object.entries(groupedElements).forEach(([groupKey, groupElements]) => {
    if (groupingMode === 'floor' || groupingMode === 'code') {
      // グループヘッダーを作成
      const groupNode = createGroupNode(groupKey, groupElements, elementType);
      elementsContainer.appendChild(groupNode);
    } else {
      // グループ化なしの場合、直接要素を追加
      groupElements.forEach(elem => {
        const elemNode = createElementNode(elem, elementType);
        elementsContainer.appendChild(elemNode);
      });
    }
  });

  // クリックで展開/折りたたみ
  sectionHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = elementsContainer.style.display !== 'none';
    elementsContainer.style.display = isExpanded ? 'none' : 'block';
    toggleIcon.textContent = isExpanded ? '▶' : '▼';
    toggleIcon.classList.toggle('expanded', !isExpanded);
  });

  sectionContainer.appendChild(sectionHeader);
  sectionContainer.appendChild(elementsContainer);

  return sectionContainer;
}

/**
 * 要素をグループ化
 * @param {Array} elements - 要素のリスト
 * @returns {Object} グループ化された要素
 */
function groupElements(elements) {
  const groups = {};

  elements.forEach(elem => {
    let groupKey;

    if (groupingMode === 'floor') {
      // 階ごとにグループ化
      const floor = extractFloorFromId(elem.elementId);
      groupKey = floor || '不明';
    } else if (groupingMode === 'code') {
      // 符号ごとにグループ化
      const code = extractCodeFromId(elem.elementId);
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
 */
function extractFloorFromId(elementId) {
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
 */
function extractCodeFromId(elementId) {
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
 */
function createGroupNode(groupKey, elements, elementType) {
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

  // 各要素ノードを作成
  elements.forEach(elem => {
    const elemNode = createElementNode(elem, elementType);
    elementsContainer.appendChild(elemNode);
  });

  // クリックで展開/折りたたみ
  groupHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = elementsContainer.style.display !== 'none';
    elementsContainer.style.display = isExpanded ? 'none' : 'block';
    toggleIcon.textContent = isExpanded ? '▶' : '▼';
    toggleIcon.classList.toggle('expanded', !isExpanded);
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
 */
function createElementNode(elementInfo, elementType) {
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
    const guidText = elementInfo.guid.length > 20
      ? elementInfo.guid.substring(0, 20) + '...'
      : elementInfo.guid;
    guidSpan.textContent = `GUID: ${guidText}`;
    guidSpan.title = elementInfo.guid;
    elementInfoDiv.appendChild(guidSpan);
  }

  elementNode.appendChild(diffIcon);
  elementNode.appendChild(elementInfoDiv);

  // クリックで要素を選択
  elementNode.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onElementSelectCallback) {
      onElementSelectCallback({
        elementType: elementType,
        elementId: elementInfo.elementId,
        modelSource: elementInfo.modelSource
      });
    }
  });

  return elementNode;
}
