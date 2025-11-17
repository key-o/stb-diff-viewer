/**
 * 要素ツリー表示コンポーネント
 * BIMVisionのような階層構造のツリービューを提供
 */

import { getState, setState } from '../core/globalState.js';

// 要素タイプのアイコンマッピング
const ELEMENT_ICONS = {
  Node: '⚫',
  Column: '🏛️',
  Girder: '➖',
  Beam: '━',
  Brace: '╱',
  Post: '│',
  Slab: '▭',
  Wall: '▯',
  Axis: '⊞',
  Story: '⬜',
  Pile: '↓',
  Footing: '⊏',
  FoundationColumn: '🏛️',
};

// 要素タイプの表示名
const ELEMENT_LABELS = {
  Node: '節点',
  Column: '柱',
  Girder: '大梁',
  Beam: '小梁',
  Brace: 'ブレース',
  Post: '間柱',
  Slab: 'スラブ',
  Wall: '壁',
  Axis: '通り芯',
  Story: '階',
  Pile: '杭',
  Footing: '基礎',
  FoundationColumn: '基礎柱',
};

let treeContainer = null;
let onElementSelectCallback = null;
let selectedElementKey = null;
let sortMode = 'id'; // 'id', 'name', or 'guid'

/**
 * ツリー表示を初期化
 * @param {string} containerId - ツリーを表示するコンテナのID
 * @param {Function} onElementSelect - 要素選択時のコールバック関数
 */
export function initializeTreeView(containerId, onElementSelect) {
  treeContainer = document.getElementById(containerId);
  onElementSelectCallback = onElementSelect;

  if (!treeContainer) {
    console.error(`ツリーコンテナが見つかりません: ${containerId}`);
    return;
  }
}

/**
 * ツリーを構築して表示
 * @param {Object} comparisonResult - 比較結果データ
 */
export function buildTree(comparisonResult) {
  if (!treeContainer) {
    console.error('ツリービューが初期化されていません');
    return;
  }

  // コンテナをクリア（イベントリスナーも適切にクリーンアップ）
  while (treeContainer.firstChild) {
    treeContainer.removeChild(treeContainer.firstChild);
  }

  if (!comparisonResult) {
    const emptyMessage = document.createElement('div');
    emptyMessage.style.cssText = 'padding: 10px; text-align: center; color: #666;';
    emptyMessage.textContent = 'モデルを読み込んでください';
    treeContainer.appendChild(emptyMessage);
    return;
  }

  // ルートノードを作成
  const rootNode = document.createElement('div');
  rootNode.className = 'tree-root';

  // 要素タイプ別にグループ化
  const elementsByType = groupElementsByType(comparisonResult);

  // 各要素タイプのノードを作成
  Object.keys(elementsByType).forEach(elementType => {
    const elements = elementsByType[elementType];
    if (elements.length > 0) {
      const typeNode = createTypeNode(elementType, elements);
      rootNode.appendChild(typeNode);
    }
  });

  treeContainer.appendChild(rootNode);
}

/**
 * 要素をタイプ別にグループ化してソート
 * @param {Object} comparisonResult - 比較結果
 * @returns {Object} タイプ別にグループ化され、ソートされた要素
 */
function groupElementsByType(comparisonResult) {
  const groups = {};

  // 全要素タイプを初期化
  Object.keys(ELEMENT_LABELS).forEach(type => {
    groups[type] = [];
  });

  // matched要素を追加
  if (comparisonResult.matched) {
    comparisonResult.matched.forEach(item => {
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
    comparisonResult.onlyA.forEach(item => {
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
    comparisonResult.onlyB.forEach(item => {
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
  Object.keys(groups).forEach(elementType => {
    groups[elementType] = sortElements(groups[elementType]);
  });

  return groups;
}

/**
 * 要素配列をソートモードに応じてソート
 * @param {Array} elements - 要素配列
 * @returns {Array} ソートされた要素配列
 */
function sortElements(elements) {
  return elements.sort((a, b) => {
    let aValue, bValue;

    switch (sortMode) {
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
 * @returns {HTMLElement} タイプノード
 */
function createTypeNode(elementType, elements) {
  const node = document.createElement('div');
  node.className = 'tree-node';

  const header = document.createElement('div');
  header.className = 'tree-node-header';

  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle';
  toggle.textContent = '▼';

  const label = document.createElement('div');
  label.className = 'tree-node-label';

  const icon = document.createElement('span');
  icon.className = 'tree-node-icon';
  icon.textContent = ELEMENT_ICONS[elementType] || '◉';

  const text = document.createElement('span');
  text.className = 'tree-node-text';
  text.textContent = ELEMENT_LABELS[elementType] || elementType;

  const count = document.createElement('span');
  count.className = 'tree-node-count';
  count.textContent = `(${elements.length})`;

  label.appendChild(icon);
  label.appendChild(text);
  label.appendChild(count);

  header.appendChild(toggle);
  header.appendChild(label);

  // 子要素コンテナ
  const children = document.createElement('div');
  children.className = 'tree-node-children expanded';

  // 各要素のリーフノードを作成
  elements.forEach(element => {
    const leafNode = createLeafNode(element, elementType);
    children.appendChild(leafNode);
  });

  node.appendChild(header);
  node.appendChild(children);

  // トグル機能
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNode(toggle, children);
  });

  header.addEventListener('click', (e) => {
    if (e.target !== toggle) {
      toggleNode(toggle, children);
    }
  });

  return node;
}

/**
 * 要素のリーフノードを作成
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {HTMLElement} リーフノード
 */
function createLeafNode(element, elementType) {
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

  // ID と名前を組み合わせて表示
  if (nameText && nameText !== idText) {
    elementId.textContent = `${idText} (${nameText})`;
  } else {
    elementId.textContent = idText;
  }

  elementInfo.appendChild(elementId);

  // GUID を小さく表示（存在する場合）
  if (element.guid) {
    const guidSpan = document.createElement('div');
    guidSpan.className = 'tree-element-guid';
    // GUIDが長い場合は短縮表示
    const guidText = element.guid.length > 20
      ? element.guid.substring(0, 20) + '...'
      : element.guid;
    guidSpan.textContent = `GUID: ${guidText}`;
    guidSpan.title = element.guid; // ツールチップに完全なGUIDを表示
    elementInfo.appendChild(guidSpan);
  }

  label.appendChild(elementInfo);

  // ステータスバッジを追加
  const status = document.createElement('span');
  status.className = `tree-element-status ${element.modelSource}`;

  if (element.modelSource === 'matched') {
    status.textContent = '一致';
  } else if (element.modelSource === 'onlyA') {
    status.textContent = 'A専用';
  } else if (element.modelSource === 'onlyB') {
    status.textContent = 'B専用';
  }

  label.appendChild(status);

  header.appendChild(label);
  node.appendChild(header);

  // クリックイベント
  const elementKey = `${elementType}_${element.displayId}_${element.modelSource}`;
  header.addEventListener('click', () => {
    selectTreeElement(elementKey, header);

    if (onElementSelectCallback) {
      onElementSelectCallback({
        elementType: elementType,
        elementId: element.displayId,
        modelSource: element.modelSource,
        element: element,
      });
    }
  });

  // データ属性を設定
  node.dataset.elementKey = elementKey;
  node.dataset.elementType = elementType;
  node.dataset.elementId = element.displayId;
  node.dataset.modelSource = element.modelSource;

  return node;
}

/**
 * ノードの展開/折りたたみをトグル
 * @param {HTMLElement} toggle - トグル要素
 * @param {HTMLElement} children - 子要素コンテナ
 */
function toggleNode(toggle, children) {
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
 * ツリー内の要素を選択
 * @param {string} elementKey - 要素キー
 * @param {HTMLElement} headerElement - ヘッダー要素
 */
function selectTreeElement(elementKey, headerElement) {
  // 既存の選択を解除
  if (treeContainer) {
    const previouslySelected = treeContainer.querySelectorAll('.tree-node-header.selected');
    previouslySelected.forEach(el => el.classList.remove('selected'));
  }

  // 新しい選択を設定
  if (headerElement) {
    headerElement.classList.add('selected');
  }

  selectedElementKey = elementKey;
}

/**
 * 3Dビューアーからの選択に応じてツリー内の要素を選択
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} modelSource - モデルソース (matched, onlyA, onlyB)
 */
export function selectElementInTree(elementType, elementId, modelSource) {
  if (!treeContainer) {
    return;
  }

  const elementKey = `${elementType}_${elementId}_${modelSource}`;

  // 対応するツリーノードを検索
  const leafNodes = treeContainer.querySelectorAll('.tree-leaf-node');

  for (const node of leafNodes) {
    if (node.dataset.elementKey === elementKey) {
      const header = node.querySelector('.tree-node-header');
      selectTreeElement(elementKey, header);

      // ノードが見えるようにスクロール
      node.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });

      break;
    }
  }
}

/**
 * ツリーをクリア
 */
export function clearTree() {
  if (treeContainer) {
    // イベントリスナーを適切にクリーンアップ
    while (treeContainer.firstChild) {
      treeContainer.removeChild(treeContainer.firstChild);
    }

    const emptyMessage = document.createElement('div');
    emptyMessage.style.cssText = 'padding: 10px; text-align: center; color: #666;';
    emptyMessage.textContent = 'モデルを読み込んでください';
    treeContainer.appendChild(emptyMessage);
  }
  selectedElementKey = null;
}

/**
 * 選択されている要素キーを取得
 * @returns {string|null} 選択されている要素キー
 */
export function getSelectedElementKey() {
  return selectedElementKey;
}

/**
 * ソートモードを設定
 * @param {string} mode - ソートモード ('id', 'name', 'guid')
 */
export function setSortMode(mode) {
  if (['id', 'name', 'guid'].includes(mode)) {
    sortMode = mode;
    console.log(`要素ツリーのソートモードを ${mode} に設定しました`);
  } else {
    console.warn(`無効なソートモード: ${mode}. 'id', 'name', 'guid' のいずれかを指定してください`);
  }
}

/**
 * 現在のソートモードを取得
 * @returns {string} 現在のソートモード
 */
export function getSortMode() {
  return sortMode;
}
