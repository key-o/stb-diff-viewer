/**
 * @fileoverview ツリービュー検索ユーティリティ
 *
 * 要素ツリー・断面ツリー共通の検索・フィルタリング機能を提供します。
 * - テキスト検索（ID、名前、GUID）
 * - 検索対象フィルタ（ID/名前/GUID を個別に選択可能）
 * - 正規表現サポート（/pattern/ 形式）
 * - 差分ステータスフィルタ（一致/Aのみ/Bのみ）
 * - デバウンス処理
 */

import { escapeHtml } from '../../utils/htmlUtils.js';

/**
 * デフォルトの差分ステータスフィルタ（全て表示）
 */
export const DEFAULT_STATUS_FILTER = {
  matched: true,
  onlyA: true,
  onlyB: true,
};

/**
 * デフォルトの検索対象フィルタ（要素ツリー用、全て有効）
 */
export const DEFAULT_ELEMENT_TARGET_FILTER = {
  id: true,
  name: true,
  guid: true,
};

/**
 * デフォルトの検索対象フィルタ（断面ツリー用、全て有効）
 */
export const DEFAULT_SECTION_TARGET_FILTER = {
  sectionId: true,
  sectionName: true,
  shapeName: true,
};

/**
 * 検索パターンを解析
 * /pattern/flags 形式の場合は正規表現として解析、それ以外は通常のテキスト検索
 *
 * @param {string} searchText - 検索テキスト
 * @returns {Object} { isRegex: boolean, pattern: RegExp|string, error: string|null }
 */
export function parseSearchPattern(searchText) {
  if (!searchText || searchText.trim() === '') {
    return {
      isRegex: false,
      pattern: '',
      error: null,
    };
  }

  const trimmed = searchText.trim();

  // /pattern/flags 形式の正規表現をチェック
  const regexMatch = trimmed.match(/^\/(.+)\/([gimsuvy]*)$/);
  if (regexMatch) {
    try {
      const flags = regexMatch[2] || 'i'; // デフォルトで大文字小文字無視
      return {
        isRegex: true,
        pattern: new RegExp(regexMatch[1], flags),
        error: null,
      };
    } catch (e) {
      // 無効な正規表現の場合はエラーを返す
      return {
        isRegex: true,
        pattern: null,
        error: `無効な正規表現: ${e.message}`,
      };
    }
  }

  // 通常のテキスト検索（大文字小文字無視）
  return {
    isRegex: false,
    pattern: trimmed.toLowerCase(),
    error: null,
  };
}

/**
 * 要素が検索条件にマッチするかチェック
 *
 * @param {Object} element - 要素データ
 * @param {string} element.id - 要素ID
 * @param {string} element.displayId - 表示用ID
 * @param {string} element.name - 要素名
 * @param {string} element.guid - GUID
 * @param {string} element.modelSource - モデルソース (matched, onlyA, onlyB)
 * @param {Object} searchPattern - parseSearchPatternの戻り値
 * @param {Object} statusFilter - 差分ステータスフィルタ {matched: bool, onlyA: bool, onlyB: bool}
 * @param {Object} targetFilter - 検索対象フィルタ {id: bool, name: bool, guid: bool}
 * @returns {boolean} マッチする場合true
 */
export function matchesSearch(
  element,
  searchPattern,
  statusFilter = DEFAULT_STATUS_FILTER,
  targetFilter = DEFAULT_ELEMENT_TARGET_FILTER,
) {
  // 差分ステータスフィルタ
  if (statusFilter) {
    const modelSource = element.modelSource || 'matched';
    if (!statusFilter[modelSource]) {
      return false;
    }
  }

  // 検索パターンが無効または空の場合は全マッチ
  if (!searchPattern || searchPattern.error) {
    return true;
  }

  if (
    !searchPattern.pattern ||
    (typeof searchPattern.pattern === 'string' && searchPattern.pattern === '')
  ) {
    return true;
  }

  // 検索対象フィルタに基づいてフィールドを収集
  const searchFields = [];
  if (targetFilter.id) {
    if (element.id) searchFields.push(element.id);
    if (element.displayId && element.displayId !== element.id) {
      searchFields.push(element.displayId);
    }
  }
  if (targetFilter.name && element.name) {
    searchFields.push(element.name);
  }
  if (targetFilter.guid && element.guid) {
    searchFields.push(element.guid);
  }

  // 検索対象が無い場合（フィルタで全て無効になっている）
  if (searchFields.length === 0) {
    return false;
  }

  // 正規表現検索
  if (searchPattern.isRegex && searchPattern.pattern instanceof RegExp) {
    return searchFields.some((field) => {
      try {
        return searchPattern.pattern.test(field);
      } catch {
        return false;
      }
    });
  }

  // 通常のテキスト検索（部分一致、大文字小文字無視）
  const lowerPattern = searchPattern.pattern;
  return searchFields.some((field) => field.toLowerCase().includes(lowerPattern));
}

/**
 * 断面が検索条件にマッチするかチェック
 *
 * @param {Object} section - 断面データ
 * @param {string} section.sectionId - 断面ID
 * @param {Object} section.sectionData - 断面詳細データ
 * @param {Object} searchPattern - parseSearchPatternの戻り値
 * @param {Object} targetFilter - 検索対象フィルタ {sectionId: bool, sectionName: bool, shapeName: bool}
 * @returns {boolean} マッチする場合true
 */
export function matchesSectionSearch(
  section,
  searchPattern,
  targetFilter = DEFAULT_SECTION_TARGET_FILTER,
) {
  // 検索パターンが無効または空の場合は全マッチ
  if (!searchPattern || searchPattern.error) {
    return true;
  }

  if (
    !searchPattern.pattern ||
    (typeof searchPattern.pattern === 'string' && searchPattern.pattern === '')
  ) {
    return true;
  }

  // 検索対象フィルタに基づいてフィールドを収集
  const searchFields = [];
  if (targetFilter.sectionId && section.sectionId) {
    searchFields.push(section.sectionId);
  }
  if (targetFilter.sectionName && section.sectionData?.name) {
    searchFields.push(section.sectionData.name);
  }
  if (targetFilter.shapeName) {
    if (section.sectionData?.shapeName) {
      searchFields.push(section.sectionData.shapeName);
    }
    // section_type と kind も shapeName に含める
    if (section.sectionData?.section_type) {
      searchFields.push(section.sectionData.section_type);
    }
    if (section.sectionData?.kind) {
      searchFields.push(section.sectionData.kind);
    }
  }

  // 検索対象が無い場合（フィルタで全て無効になっている）
  if (searchFields.length === 0) {
    return false;
  }

  // 正規表現検索
  if (searchPattern.isRegex && searchPattern.pattern instanceof RegExp) {
    return searchFields.some((field) => {
      try {
        return searchPattern.pattern.test(field);
      } catch {
        return false;
      }
    });
  }

  // 通常のテキスト検索
  const lowerPattern = searchPattern.pattern;
  return searchFields.some((field) => field.toLowerCase().includes(lowerPattern));
}

/**
 * デバウンス関数
 * 連続した呼び出しを間引き、最後の呼び出しから指定時間後に実行
 *
 * @param {Function} func - 実行する関数
 * @param {number} wait - 待機時間(ms) デフォルト200ms
 * @returns {Function} デバウンスされた関数
 */
export function debounce(func, wait = 200) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 検索UIコンポーネントを作成
 *
 * @param {Object} options - オプション
 * @param {string} options.placeholder - プレースホルダーテキスト
 * @param {Function} options.onSearch - 検索時のコールバック (searchText, statusFilter, targetFilter) => void
 * @param {Function} options.onClear - クリア時のコールバック () => void
 * @param {boolean} options.showStatusFilter - 差分ステータスフィルタを表示するか
 * @param {Array} options.targetOptions - 検索対象オプション [{key, label}]
 * @param {Object} options.defaultTargetFilter - デフォルトの検索対象フィルタ
 * @returns {Object} { container: HTMLElement, updateResultCount: Function, getSearchText: Function }
 */
export function createSearchUI(options = {}) {
  const {
    placeholder = '検索...',
    onSearch = () => {},
    onClear = () => {},
    showStatusFilter = true,
    targetOptions = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: '名前' },
      { key: 'guid', label: 'GUID' },
    ],
    defaultTargetFilter = DEFAULT_ELEMENT_TARGET_FILTER,
  } = options;

  // コンテナ
  const container = document.createElement('div');
  container.className = 'tree-search-container';

  // 検索対象フィルタ（チェックボックス）
  let targetFilter = { ...defaultTargetFilter };
  const targetFilterContainer = document.createElement('div');
  targetFilterContainer.className = 'tree-search-target-filter';

  const targetLabel = document.createElement('span');
  targetLabel.className = 'tree-search-target-label';
  targetLabel.textContent = '検索対象:';
  targetFilterContainer.appendChild(targetLabel);

  targetOptions.forEach(({ key, label }) => {
    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'tree-search-target-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = targetFilter[key] !== false;
    checkbox.dataset.targetKey = key;

    const text = document.createElement('span');
    text.textContent = label;

    checkbox.addEventListener('change', (e) => {
      targetFilter[key] = e.target.checked;
      // 検索テキストがある場合のみ再検索
      if (searchInput.value) {
        onSearch(searchInput.value, statusFilter, targetFilter);
      }
    });

    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(text);
    targetFilterContainer.appendChild(checkboxLabel);
  });

  // 検索入力ラッパー
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'tree-search-input-wrapper';

  // 検索アイコン
  const searchIcon = document.createElement('span');
  searchIcon.className = 'tree-search-icon';
  searchIcon.textContent = '🔍';

  // 検索入力
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'tree-search-input';
  searchInput.placeholder = placeholder;

  // クリアボタン
  const clearBtn = document.createElement('button');
  clearBtn.className = 'tree-search-clear';
  clearBtn.textContent = '×';
  clearBtn.title = '検索をクリア';
  clearBtn.style.display = 'none';

  inputWrapper.appendChild(searchIcon);
  inputWrapper.appendChild(searchInput);
  inputWrapper.appendChild(clearBtn);

  // 差分ステータスフィルタ
  let statusFilter = { ...DEFAULT_STATUS_FILTER };
  let filterDropdown = null;
  let filterBtn = null;

  // ドキュメントクリックハンドラーの参照（クリーンアップ用）
  let documentClickHandler = null;

  if (showStatusFilter) {
    filterBtn = document.createElement('button');
    filterBtn.className = 'tree-filter-btn';
    filterBtn.textContent = '▼';
    filterBtn.title = '差分フィルタ';

    filterDropdown = createFilterDropdown(statusFilter, (newFilter) => {
      statusFilter = newFilter;
      onSearch(searchInput.value, statusFilter, targetFilter);
    });

    // フィルタボタンのクリック
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = filterDropdown.style.display !== 'none';
      filterDropdown.style.display = isVisible ? 'none' : 'block';
    });

    // 外部クリックでドロップダウンを閉じる
    documentClickHandler = () => {
      if (filterDropdown) {
        filterDropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', documentClickHandler);
  }

  // 結果表示
  const resultCount = document.createElement('div');
  resultCount.className = 'tree-search-result-count';

  // エラー表示
  const errorDisplay = document.createElement('div');
  errorDisplay.className = 'tree-search-error';
  errorDisplay.style.display = 'none';

  // イベントリスナー
  const debouncedSearch = debounce((value) => {
    const pattern = parseSearchPattern(value);
    if (pattern.error) {
      errorDisplay.textContent = pattern.error;
      errorDisplay.style.display = 'block';
    } else {
      errorDisplay.style.display = 'none';
    }
    onSearch(value, statusFilter, targetFilter);
  }, 200);

  searchInput.addEventListener('input', (e) => {
    const value = e.target.value;
    clearBtn.style.display = value ? 'block' : 'none';
    debouncedSearch(value);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    errorDisplay.style.display = 'none';
    onClear();
    onSearch('', statusFilter, targetFilter);
  });

  // 組み立て
  container.appendChild(targetFilterContainer);
  container.appendChild(inputWrapper);
  if (filterBtn) {
    const filterWrapper = document.createElement('div');
    filterWrapper.className = 'tree-filter-wrapper';
    filterWrapper.appendChild(filterBtn);
    filterWrapper.appendChild(filterDropdown);
    container.appendChild(filterWrapper);
  }
  container.appendChild(resultCount);
  container.appendChild(errorDisplay);

  // 公開API
  return {
    container,
    /**
     * 検索結果数を更新
     * @param {number} matchCount - マッチ数
     * @param {number} totalCount - 全体数
     */
    updateResultCount: (matchCount, totalCount) => {
      if (
        searchInput.value ||
        !isAllStatusEnabled(statusFilter) ||
        !isAllTargetEnabled(targetFilter, targetOptions)
      ) {
        resultCount.textContent = `結果: ${matchCount}件 / 全${totalCount}件`;
        resultCount.style.display = 'block';
      } else {
        resultCount.style.display = 'none';
      }
    },
    /**
     * 現在の検索テキストを取得
     * @returns {string}
     */
    getSearchText: () => searchInput.value,
    /**
     * 現在のステータスフィルタを取得
     * @returns {Object}
     */
    getStatusFilter: () => ({ ...statusFilter }),
    /**
     * 現在の検索対象フィルタを取得
     * @returns {Object}
     */
    getTargetFilter: () => ({ ...targetFilter }),
    /**
     * 検索をリセット
     */
    reset: () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      errorDisplay.style.display = 'none';
      statusFilter = { ...DEFAULT_STATUS_FILTER };
      targetFilter = { ...defaultTargetFilter };
      resultCount.style.display = 'none';
      if (filterDropdown) {
        updateFilterDropdownUI(filterDropdown, statusFilter);
      }
      // 検索対象チェックボックスをリセット
      const targetCheckboxes = targetFilterContainer.querySelectorAll('input[type="checkbox"]');
      targetCheckboxes.forEach((checkbox) => {
        const key = checkbox.dataset.targetKey;
        if (key && defaultTargetFilter.hasOwnProperty(key)) {
          checkbox.checked = defaultTargetFilter[key];
        }
      });
    },
    /**
     * リソースを解放する（イベントリスナーのクリーンアップ）
     */
    destroy: () => {
      if (documentClickHandler) {
        document.removeEventListener('click', documentClickHandler);
        documentClickHandler = null;
      }
    },
  };
}

/**
 * フィルタドロップダウンを作成
 * @private
 */
function createFilterDropdown(statusFilter, onChange) {
  const dropdown = document.createElement('div');
  dropdown.className = 'tree-filter-dropdown';
  dropdown.style.display = 'none';

  const filters = [
    { key: 'matched', label: '一致', color: '#12b886' },
    { key: 'onlyA', label: 'Aのみ', color: '#37b24d' },
    { key: 'onlyB', label: 'Bのみ', color: '#f03e3e' },
  ];

  filters.forEach(({ key, label, color }) => {
    const labelEl = document.createElement('label');
    labelEl.className = 'tree-filter-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = statusFilter[key];
    checkbox.dataset.filterKey = key;

    const colorDot = document.createElement('span');
    colorDot.className = 'tree-filter-color-dot';
    colorDot.style.backgroundColor = color;

    const text = document.createElement('span');
    text.textContent = label;

    checkbox.addEventListener('change', (e) => {
      statusFilter[key] = e.target.checked;
      onChange({ ...statusFilter });
    });

    labelEl.appendChild(checkbox);
    labelEl.appendChild(colorDot);
    labelEl.appendChild(text);
    dropdown.appendChild(labelEl);
  });

  // クリックイベントの伝播を止める
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  return dropdown;
}

/**
 * フィルタドロップダウンのUIを更新
 * @private
 */
function updateFilterDropdownUI(dropdown, statusFilter) {
  const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((checkbox) => {
    const key = checkbox.dataset.filterKey;
    if (key && statusFilter.hasOwnProperty(key)) {
      checkbox.checked = statusFilter[key];
    }
  });
}

/**
 * 全てのステータスフィルタが有効かチェック
 * @private
 */
function isAllStatusEnabled(statusFilter) {
  return statusFilter.matched && statusFilter.onlyA && statusFilter.onlyB;
}

/**
 * 全ての検索対象フィルタが有効かチェック
 * @private
 */
function isAllTargetEnabled(targetFilter, targetOptions) {
  return targetOptions.every(({ key }) => targetFilter[key] !== false);
}

/**
 * テキストの検索ハイライト用HTMLを生成
 *
 * @param {string} text - 元のテキスト
 * @param {Object} searchPattern - parseSearchPatternの戻り値
 * @returns {string} ハイライト付きHTML文字列
 */
export function highlightSearchMatch(text, searchPattern) {
  if (!text || !searchPattern || !searchPattern.pattern) {
    return escapeHtml(text || '');
  }

  if (searchPattern.error) {
    return escapeHtml(text);
  }

  try {
    if (searchPattern.isRegex && searchPattern.pattern instanceof RegExp) {
      // グローバルフラグを追加して全マッチを置換
      const flags = searchPattern.pattern.flags.includes('g')
        ? searchPattern.pattern.flags
        : searchPattern.pattern.flags + 'g';
      const globalRegex = new RegExp(searchPattern.pattern.source, flags);
      return escapeHtml(text).replace(globalRegex, '<span class="search-highlight">$&</span>');
    } else {
      // 通常のテキスト検索
      const lowerText = text.toLowerCase();
      const lowerPattern = searchPattern.pattern;
      const index = lowerText.indexOf(lowerPattern);

      if (index === -1) {
        return escapeHtml(text);
      }

      const before = text.substring(0, index);
      const match = text.substring(index, index + lowerPattern.length);
      const after = text.substring(index + lowerPattern.length);

      return (
        escapeHtml(before) +
        '<span class="search-highlight">' +
        escapeHtml(match) +
        '</span>' +
        escapeHtml(after)
      );
    }
  } catch {
    return escapeHtml(text);
  }
}
