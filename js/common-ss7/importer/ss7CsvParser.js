/**
 * ss7CsvParser.js
 * SS7入力CSVファイルのパーサー
 * Shift-JIS形式のCSVを解析し、セクションごとにデータを抽出する
 *
 * 巨大ファイル対応: name=で分割し並列パース可能
 *
 * ported from MatrixCalc for StbDiffViewer
 */

const log = {
  debug: (...args) => console.debug('[SS7CsvParser]', ...args),
  warn: (...args) => console.warn('[SS7CsvParser]', ...args),
  error: (...args) => console.error('[SS7CsvParser]', ...args),
};

/**
 * CSVテキストをname=で分割してチャンクに分ける（並列パース用）
 * @param {string} csvText - CSVテキスト全体
 * @returns {{ header: string, chunks: string[] }} ヘッダー部分とセクションチャンクの配列
 */
export function splitByNameSections(csvText) {
  // name= で始まる行の位置を全て検出
  const namePattern = /^name=/gm;
  const positions = [];
  let match;

  while ((match = namePattern.exec(csvText)) !== null) {
    positions.push(match.index);
  }

  if (positions.length === 0) {
    log.warn('name= セクションが見つかりません');
    return { header: csvText, chunks: [] };
  }

  // ヘッダー部分（最初のname=より前）
  const header = csvText.substring(0, positions[0]);

  // 各セクションチャンクを抽出
  const chunks = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : csvText.length;
    chunks.push(csvText.substring(start, end));
  }

  log.debug(`splitByNameSections: ${chunks.length}セクション検出`);

  return { header, chunks };
}

/**
 * 単一セクションチャンクをパースする（並列実行用）
 * @param {string} chunkText - name=で始まる単一セクションのテキスト
 * @returns {Object|null} パースされたセクションオブジェクト
 */
export function parseSingleSection(chunkText) {
  const lines = chunkText.split('\n').map((line) => line.trim());

  let currentSection = null;
  let currentTab = null;
  let currentCase = null;
  let currentGroup = null;
  let headers = [];
  let units = [];
  const data = [];
  let inDataBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line) continue;

    // セクション開始
    if (line.startsWith('name=')) {
      const sectionInfo = parseSectionName(line);
      currentSection = sectionInfo.name;
      currentTab = sectionInfo.tab || null;
      currentCase = sectionInfo.case || null;
      currentGroup = sectionInfo.group || null;
      continue;
    }

    const cells = parseRow(line);
    const unitIndex = cells.findIndex((cell) => cell.includes('<unit>'));
    const dataIndex = cells.findIndex((cell) => cell.includes('<data>'));

    // <unit> 処理
    if (unitIndex !== -1) {
      const inlineUnits = cells.slice(unitIndex + 1, dataIndex !== -1 ? dataIndex : undefined);

      if (inlineUnits.length > 0) {
        units = inlineUnits;
      } else if (i + 1 < lines.length) {
        units = parseRow(lines[i + 1]);
        i++;
      }
    }

    // <data> 処理
    if (dataIndex !== -1) {
      inDataBlock = true;
      const inlineData = cells.slice(dataIndex + 1).filter((cell) => cell !== '');
      if (inlineData.length > 0) {
        data.push(inlineData);
      }
      continue;
    }

    // データ行
    if (inDataBlock && currentSection !== null) {
      const cleanLine = line.replace(/,<RE>$/, '').replace(/<RE>$/, '');
      if (cleanLine) {
        const row = parseRow(cleanLine);
        if (row.length > 0) {
          data.push(row);
        }
      }
      continue;
    }

    // ヘッダー行
    if (currentSection !== null && !inDataBlock && !line.startsWith('<')) {
      const row = parseRow(line);
      if (row.length > 0) {
        if (headers.length === 0) {
          headers = row;
        } else {
          headers = mergeHeaders(headers, row);
        }
      }
    }
  }

  if (currentSection === null) {
    return null;
  }

  return {
    name: currentSection,
    tab: currentTab,
    group: currentGroup,
    case: currentCase,
    headers,
    units,
    data,
  };
}

/**
 * 並列でCSVをパースする
 * @param {string} csvText - CSVテキスト全体
 * @param {Object} [options] - オプション
 * @param {number} [options.batchSize=50] - 並列処理のバッチサイズ
 * @returns {Promise<Map<string, Object>>} セクション名をキーとするデータマップ
 */
export async function parseSs7CsvParallel(csvText, options = {}) {
  const { batchSize = 50 } = options;

  // Step 1: name=で分割
  const { chunks } = splitByNameSections(csvText);

  if (chunks.length === 0) {
    log.warn('並列パース: セクションなし、空のMapを返します');
    return new Map();
  }

  log.debug(`並列パース開始: ${chunks.length}セクション, バッチサイズ=${batchSize}`);

  // Step 2: バッチごとに並列パース
  const sections = new Map();

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    // Promise.all で並列実行（各チャンクは独立）
    const results = await Promise.all(
      batch.map(
        (chunk) =>
          // setTimeoutで非同期化してUIブロッキングを軽減
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(parseSingleSection(chunk));
            }, 0);
          }),
      ),
    );

    // 結果をMapに統合
    for (const section of results) {
      if (section) {
        addSectionToMap(sections, section);
      }
    }
  }

  log.debug(`並列パース完了: ${sections.size}セクション`);

  return sections;
}

/**
 * セクションをMapに追加（重複キー対応）
 * @param {Map} sections
 * @param {Object} section
 */
function addSectionToMap(sections, section) {
  const { name, tab, group, case: caseValue, headers, units, data } = section;

  let key = name;
  if (tab) key += `:${tab}`;
  if (group) key += `:${group}`;
  if (caseValue) key += `:${caseValue}`;

  const baseKey = key;
  let occurrence = 1;

  while (sections.has(key)) {
    occurrence += 1;
    key = `${baseKey}#${occurrence}`;
  }

  sections.set(key, {
    name,
    tab,
    group,
    case: caseValue,
    headers,
    units,
    data,
    occurrence,
    baseKey,
  });
}

/**
 * SS7 CSVテキストをセクションごとに分割してパースする
 * @param {string} csvText - CSVテキスト（UTF-8変換済み）
 * @returns {Map<string, Object>} セクション名をキーとするデータマップ
 */
export function parseSs7Csv(csvText) {
  try {
    const sections = new Map();
    const lines = csvText.split('\n').map((line) => line.trim());

    let currentSection = null;
    let currentTab = null;
    let currentCase = null;
    let currentGroup = null;
    let headers = [];
    let units = [];
    let data = [];
    let inDataBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 空行はスキップ
      if (!line) {
        continue;
      }

      // セクション開始の検出: name=セクション名
      if (line.startsWith('name=')) {
        // 前のセクションを保存
        if (currentSection) {
          saveSectionData(
            sections,
            currentSection,
            currentTab,
            currentCase,
            headers,
            units,
            data,
            currentGroup,
          );
        }

        // 新しいセクションの開始
        const sectionInfo = parseSectionName(line);
        currentSection = sectionInfo.name;
        currentTab = sectionInfo.tab || null;
        currentCase = sectionInfo.case || null;
        currentGroup = sectionInfo.group || null;
        headers = [];
        units = [];
        data = [];
        inDataBlock = false;
        continue;
      }

      const cells = parseRow(line);
      const unitIndex = cells.findIndex((cell) => cell.includes('<unit>'));
      const dataIndex = cells.findIndex((cell) => cell.includes('<data>'));

      // <unit> が同一行に含まれる場合を含めて処理
      if (unitIndex !== -1) {
        const inlineUnits = cells.slice(unitIndex + 1, dataIndex !== -1 ? dataIndex : undefined);

        if (inlineUnits.length > 0) {
          units = inlineUnits;
        } else if (i + 1 < lines.length) {
          units = parseRow(lines[i + 1]);
          i++;
        }
      }

      // データブロック開始（同一行にデータを含むケースも処理）
      if (dataIndex !== -1) {
        inDataBlock = true;
        const inlineData = cells.slice(dataIndex + 1).filter((cell) => cell !== '');
        if (inlineData.length > 0) {
          data.push(inlineData);
        }
        continue;
      }

      // データブロック内のデータ行
      if (inDataBlock && currentSection) {
        // <RE>マーカーを除去してパース
        const cleanLine = line.replace(/,<RE>$/, '').replace(/<RE>$/, '');
        if (cleanLine) {
          const row = parseRow(cleanLine);
          if (row.length > 0) {
            data.push(row);
          }
        }
        continue;
      }

      // ヘッダー行（データブロック前の非空行）
      if (currentSection && !inDataBlock && !line.startsWith('<')) {
        // 複数行ヘッダーの場合は追加
        const row = parseRow(line);
        if (row.length > 0) {
          if (headers.length === 0) {
            headers = row;
          } else {
            // 複数行ヘッダーをマージ
            headers = mergeHeaders(headers, row);
          }
        }
      }
    }

    // 最後のセクションを保存
    if (currentSection) {
      saveSectionData(
        sections,
        currentSection,
        currentTab,
        currentCase,
        headers,
        units,
        data,
        currentGroup,
      );
    }

    return sections;
  } catch (error) {
    log.error('SS7 CSVパース失敗:', error);
    throw error;
  }
}

/**
 * セクション名をパース（name=xxx,tab=yyy形式）
 * @param {string} line
 * @returns {Object} {name, tab, group, case}
 */
function parseSectionName(line) {
  const result = { name: '' };
  const parts = line.substring(5).split(','); // 'name='を除去

  for (const part of parts) {
    if (part.startsWith('tab=')) {
      result.tab = part.substring(4);
    } else if (part.startsWith('group=')) {
      result.group = part.substring(6);
    } else if (part.startsWith('case=')) {
      result.case = part.substring(5);
    } else if (!result.name) {
      result.name = part;
    }
  }

  return result;
}

/**
 * CSV行をパース
 * @param {string} line
 * @returns {string[]}
 */
function parseRow(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

/**
 * 複数行ヘッダーをマージ
 * @param {string[]} headers1
 * @param {string[]} headers2
 * @returns {string[]}
 */
function mergeHeaders(headers1, headers2) {
  const result = [];
  const maxLen = Math.max(headers1.length, headers2.length);

  for (let i = 0; i < maxLen; i++) {
    const h1 = headers1[i] || '';
    const h2 = headers2[i] || '';

    if (h1 && h2) {
      result.push(`${h1}/${h2}`);
    } else {
      result.push(h1 || h2);
    }
  }

  return result;
}

/**
 * セクションデータを保存
 * @param {Map} sections
 * @param {string} name
 * @param {string|null} tab
 * @param {string|null} caseValue - 荷重ケース名（例: 'G+P', 'EX+'）
 * @param {string[]} headers
 * @param {string[]} units
 * @param {string[][]} data
 */
function saveSectionData(sections, name, tab, caseValue, headers, units, data, group = null) {
  // キー生成: name:tab:group:case の形式
  // tabやgroupがない場合でもcaseがあれば:caseを付ける
  let key = name;
  if (tab) {
    key += `:${tab}`;
  }
  if (group) {
    key += `:${group}`;
  }
  if (caseValue) {
    key += `:${caseValue}`;
  }

  // 同一キーのセクションが複数ある場合は #2, #3... を付与してユニーク化する
  const baseKey = key;
  let occurrence = 1;
  while (sections.has(key)) {
    occurrence += 1;
    key = `${baseKey}#${occurrence}`;
    if (occurrence === 2) {
      log.warn(`セクション重複検出: ${baseKey}`);
    }
  }

  sections.set(key, {
    name,
    tab,
    group,
    case: caseValue,
    headers,
    units,
    data,
    occurrence,
    baseKey,
  });
}

/**
 * ヘッダー情報（ファイル先頭のメタデータ）を抽出
 * @param {string} csvText
 * @returns {Object}
 */
export function extractHeaderInfo(csvText) {
  const lines = csvText.split('\n').map((line) => line.trim());
  const info = {};

  for (const line of lines) {
    if (line.startsWith('name=')) {
      break; // 最初のセクションで終了
    }

    const parts = parseRow(line);
    if (parts.length >= 2) {
      const key = parts[0];
      const value = parts[1];

      switch (key) {
        case 'ApName':
          info.appName = value;
          break;
        case 'Version':
          info.version = value;
          break;
        case '物件名':
          info.projectName = value;
          break;
        case '工事名':
          info.constructionName = value;
          break;
        case '略称':
          info.shortName = value;
          break;
        case '出力日時':
          info.exportDate = value;
          break;
      }
    }
  }

  return info;
}

/**
 * 特定のセクションを取得
 * @param {Map} sections
 * @param {string} name
 * @param {string} [tab]
 * @param {string|Object} [caseValueOrOptions] - 荷重ケース名（例: 'G+P', 'EX+'）または { case, group }
 * @param {string|null} [group] - グループ名（例: '異形鉄筋の種別'）
 * @returns {Object|null}
 */
export function getSection(sections, name, tab = null, caseValueOrOptions = null, group = null) {
  let caseValue = null;
  let index = null;

  if (caseValueOrOptions && typeof caseValueOrOptions === 'object') {
    caseValue = caseValueOrOptions.case || null;
    group = caseValueOrOptions.group || group;
    index = caseValueOrOptions.index ?? null;
  } else {
    caseValue = caseValueOrOptions;
  }

  let key = name;
  if (tab) {
    key += `:${tab}`;
  }
  if (group) {
    key += `:${group}`;
  }
  if (caseValue) {
    key += `:${caseValue}`;
  }

  if (index !== null && index > 1) {
    const indexedKey = `${key}#${index}`;
    if (sections.has(indexedKey)) {
      return sections.get(indexedKey);
    }
  }

  if (sections.has(key)) {
    return sections.get(key);
  }

  // フォールバック: 同名セクションを走査し、タブ・グループ・ケースが一致するものを返す
  for (const section of sections.values()) {
    if (section.name !== name) continue;
    if (tab && section.tab !== tab) continue;
    if (group && section.group !== group) continue;
    if (caseValue && section.case !== caseValue) continue;
    if (index && section.occurrence !== index) continue;
    return section;
  }

  return null;
}

/**
 * 条件に一致するすべてのセクションを取得
 * @param {Map} sections
 * @param {string} name
 * @param {string|null} [tab]
 * @param {Object} [options]
 * @param {string|null} [options.case]
 * @param {string|null} [options.group]
 * @returns {Object[]}
 */
export function getSections(sections, name, tab = null, options = {}) {
  const { case: caseValue = null, group = null } = options;

  const results = [];

  for (const section of sections.values()) {
    if (section.name !== name) continue;
    if (tab && section.tab !== tab) continue;
    if (group && section.group !== group) continue;
    if (caseValue && section.case !== caseValue) continue;
    results.push(section);
  }

  return results;
}

/**
 * セクションからデータをオブジェクト配列として取得
 *
 * @param {Object} section - パース済みセクション
 * @param {Object} [options] - オプション
 * @param {('suffix'|'array'|'first')} [options.handleDuplicates='suffix'] - 重複キーの処理方法
 *   - 'suffix': 重複キーに連番を付与（例: 'key', 'key_2', 'key_3'）
 *   - 'array': 重複キーの値を配列にまとめる
 *   - 'first': 最初の値のみ保持（後の値は無視）
 * @returns {Object[]} オブジェクト配列
 */
export function sectionToObjects(section, options = {}) {
  if (!section || !section.data || section.data.length === 0) {
    return [];
  }

  const { handleDuplicates = 'suffix' } = options;
  const headers = section.headers || [];
  const result = [];

  for (const row of section.data) {
    const obj = {};
    const keyCount = new Map();

    for (let i = 0; i < row.length; i++) {
      const originalKey = headers[i] || `col${i}`;
      const count = keyCount.get(originalKey) || 0;

      if (handleDuplicates === 'suffix') {
        // 重複キーに接尾辞を付与
        const key = count > 0 ? `${originalKey}_${count + 1}` : originalKey;
        obj[key] = row[i];
      } else if (handleDuplicates === 'array') {
        // 重複キーの値を配列にまとめる
        if (count === 0) {
          obj[originalKey] = row[i];
        } else if (count === 1) {
          // 2回目の出現時に配列化
          obj[originalKey] = [obj[originalKey], row[i]];
        } else {
          // 3回目以降は配列に追加
          obj[originalKey].push(row[i]);
        }
      } else if (handleDuplicates === 'first') {
        // 最初の値のみ保持
        if (count === 0) {
          obj[originalKey] = row[i];
        }
      }

      keyCount.set(originalKey, count + 1);
    }

    result.push(obj);
  }

  return result;
}

/**
 * セクションのヘッダー情報を取得（重複対応）
 *
 * @param {Object} section - パース済みセクション
 * @param {Object} [options] - オプション
 * @param {('suffix'|'unique')} [options.handleDuplicates='suffix'] - 重複キーの処理方法
 * @returns {{ headers: string[], headerIndexMap: Map<string, number[]> }}
 */
export function getSectionHeaders(section, options = {}) {
  if (!section || !section.headers) {
    return { headers: [], headerIndexMap: new Map() };
  }

  const { handleDuplicates = 'suffix' } = options;
  const originalHeaders = section.headers;
  const headers = [];
  const headerIndexMap = new Map();
  const keyCount = new Map();

  for (let i = 0; i < originalHeaders.length; i++) {
    const originalKey = originalHeaders[i] || `col${i}`;
    const count = keyCount.get(originalKey) || 0;

    // インデックスマップを更新
    if (!headerIndexMap.has(originalKey)) {
      headerIndexMap.set(originalKey, []);
    }
    headerIndexMap.get(originalKey).push(i);

    // ヘッダー配列を更新
    if (handleDuplicates === 'suffix') {
      const key = count > 0 ? `${originalKey}_${count + 1}` : originalKey;
      headers.push(key);
    } else {
      headers.push(originalKey);
    }

    keyCount.set(originalKey, count + 1);
  }

  return { headers, headerIndexMap };
}
