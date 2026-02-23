/**
 * @fileoverview 重要度パネルのデバッグユーティリティ
 * 重複パスの検出とXSD属性の整合性チェック
 */

import { getImportanceManager } from '../app/importanceManager.js';
import { STB_ELEMENT_TABS } from '../app/importanceManager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ImportanceDebug');

/**
 * タブ別のパス重複をチェックする
 * @param {string[]} tabIds - チェックするタブIDの配列
 * @returns {Object} 重複情報
 */
export function checkDuplicatePathsByTab(tabIds = null) {
  const manager = getImportanceManager();
  const tabs = tabIds || STB_ELEMENT_TABS.map((tab) => tab.id);
  const results = {};

  for (const tabId of tabs) {
    const paths = manager.getElementPathsByTab(tabId);
    const uniquePaths = [...new Set(paths)];
    const duplicateCount = paths.length - uniquePaths.length;

    if (duplicateCount > 0) {
      const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
      results[tabId] = {
        total: paths.length,
        unique: uniquePaths.length,
        duplicates: duplicateCount,
        duplicatePaths: [...new Set(duplicates)],
      };
    } else {
      results[tabId] = {
        total: paths.length,
        unique: uniquePaths.length,
        duplicates: 0,
      };
    }
  }

  return results;
}

/**
 * 全パスの重複をチェックする
 * @returns {Object} 重複情報
 */
export function checkAllDuplicatePaths() {
  const manager = getImportanceManager();
  const allPaths = manager.orderedElementPaths;
  const uniquePaths = [...new Set(allPaths)];
  const duplicateCount = allPaths.length - uniquePaths.length;

  const results = {
    total: allPaths.length,
    unique: uniquePaths.length,
    duplicates: duplicateCount,
  };

  if (duplicateCount > 0) {
    const duplicates = allPaths.filter((path, index) => allPaths.indexOf(path) !== index);
    results.duplicatePaths = [...new Set(duplicates)];
  }

  return results;
}

/**
 * ツリーノードのterminalPathsの重複をチェックする
 * @param {Object} tree - ツリールートノード
 * @returns {Array} 重複情報の配列
 */
export function checkTreeNodeDuplicates(tree) {
  const results = [];

  const checkNode = (node, path = []) => {
    const currentPath = [...path, node.name];

    if (node.terminalPaths && node.terminalPaths.length > 0) {
      const uniquePaths = [...new Set(node.terminalPaths)];
      const duplicateCount = node.terminalPaths.length - uniquePaths.length;

      if (duplicateCount > 0) {
        const duplicates = node.terminalPaths.filter(
          (p, index) => node.terminalPaths.indexOf(p) !== index,
        );
        results.push({
          nodePath: currentPath.join(' > '),
          nodeName: node.name,
          total: node.terminalPaths.length,
          unique: uniquePaths.length,
          duplicates: duplicateCount,
          duplicatePaths: [...new Set(duplicates)],
        });
      }
    }

    if (node.children) {
      for (const childNode of node.children.values()) {
        checkNode(childNode, currentPath);
      }
    }
  };

  checkNode(tree);
  return results;
}

/**
 * パス正規化の一貫性をチェックする
 * @param {string[]} testPaths - テストパスの配列
 * @returns {Object} 正規化結果
 */
export function checkPathNormalization(testPaths) {
  const manager = getImportanceManager();
  const results = {};

  for (const path of testPaths) {
    const normalized = manager.normalizePath(path);
    if (!results[normalized]) {
      results[normalized] = [];
    }
    results[normalized].push(path);
  }

  const duplicateNormalizations = Object.entries(results).filter(([, paths]) => paths.length > 1);

  return {
    totalPaths: testPaths.length,
    uniqueNormalized: Object.keys(results).length,
    duplicateNormalizations: Object.fromEntries(duplicateNormalizations),
  };
}

/**
 * 重複診断レポートを生成する
 * @returns {string} レポート文字列
 */
export function generateDuplicateReport() {
  const lines = [];
  lines.push('========================================');
  lines.push('重要度パネル 重複診断レポート');
  lines.push('========================================');
  lines.push('');

  // 全パスの重複チェック
  lines.push('【全パスの重複チェック】');
  const allDuplicates = checkAllDuplicatePaths();
  lines.push(`総パス数: ${allDuplicates.total}`);
  lines.push(`ユニークパス数: ${allDuplicates.unique}`);
  lines.push(`重複数: ${allDuplicates.duplicates}`);
  if (allDuplicates.duplicatePaths && allDuplicates.duplicatePaths.length > 0) {
    lines.push('重複パス:');
    for (const path of allDuplicates.duplicatePaths) {
      lines.push(`  - ${path}`);
    }
  }
  lines.push('');

  // タブ別の重複チェック
  lines.push('【タブ別の重複チェック】');
  const tabDuplicates = checkDuplicatePathsByTab();
  const tabsWithDuplicates = Object.entries(tabDuplicates).filter(
    ([, info]) => info.duplicates > 0,
  );

  if (tabsWithDuplicates.length === 0) {
    lines.push('✓ 重複なし');
  } else {
    for (const [tabId, info] of tabsWithDuplicates) {
      lines.push(`タブ: ${tabId}`);
      lines.push(`  総数: ${info.total}, ユニーク: ${info.unique}, 重複: ${info.duplicates}`);
      if (info.duplicatePaths && info.duplicatePaths.length > 0) {
        lines.push('  重複パス:');
        for (const path of info.duplicatePaths) {
          lines.push(`    - ${path}`);
        }
      }
    }
  }
  lines.push('');

  // サマリー
  lines.push('【サマリー】');
  lines.push(`総タブ数: ${Object.keys(tabDuplicates).length}`);
  lines.push(`重複があるタブ数: ${tabsWithDuplicates.length}`);
  lines.push(`全体の重複数: ${allDuplicates.duplicates}`);
  lines.push('');
  lines.push('========================================');

  return lines.join('\n');
}

/**
 * ブラウザコンソールに重複診断レポートを出力する
 */
export function logDuplicateReport() {
  const report = generateDuplicateReport();
  log.info('\n' + report);
  return report;
}

/**
 * XSD属性の欠落をチェックする（ブラウザ環境のみ）
 * @param {Function} getElementDefinition - XSD要素定義取得関数
 * @returns {Array} 欠落属性の配列
 */
export function checkMissingXsdAttributes(getElementDefinition) {
  const manager = getImportanceManager();
  const missingAttributes = [];

  for (const tab of STB_ELEMENT_TABS) {
    const elementId = tab.xsdElem || tab.id;
    const elementDef = getElementDefinition(elementId);

    if (!elementDef || !elementDef.attributes) {
      continue;
    }

    const paths = manager.getElementPathsByTab(tab.id);
    const attributePaths = paths.filter((path) => path.includes('@'));

    for (const [attrName] of elementDef.attributes) {
      const attrFound = attributePaths.some((path) => path.endsWith(`@${attrName}`));

      if (!attrFound) {
        missingAttributes.push({
          tab: tab.id,
          element: elementId,
          attribute: attrName,
        });
      }
    }
  }

  return missingAttributes;
}

/**
 * XSD属性の網羅性レポートを生成する
 * @param {Function} getElementDefinition - XSD要素定義取得関数
 * @returns {string} レポート文字列
 */
export function generateXsdCoverageReport(getElementDefinition) {
  const lines = [];
  lines.push('========================================');
  lines.push('XSD属性 網羅性レポート');
  lines.push('========================================');
  lines.push('');

  const missingAttributes = checkMissingXsdAttributes(getElementDefinition);

  if (missingAttributes.length === 0) {
    lines.push('✓ 全てのXSD属性がパスリストに含まれています');
  } else {
    lines.push(`⚠ ${missingAttributes.length}個の属性が欠落しています:`);
    lines.push('');
    for (const missing of missingAttributes) {
      lines.push(`タブ: ${missing.tab}`);
      lines.push(`  要素: ${missing.element}`);
      lines.push(`  欠落属性: @${missing.attribute}`);
      lines.push('');
    }
  }

  lines.push('========================================');
  return lines.join('\n');
}

// ブラウザ環境でグローバルに公開（デバッグ用）
export function initializeDebugTools() {
  if (typeof window !== 'undefined') {
    window.importanceDebug = {
      checkDuplicatePathsByTab,
      checkAllDuplicatePaths,
      checkTreeNodeDuplicates,
      checkPathNormalization,
      generateDuplicateReport,
      logDuplicateReport,
      checkMissingXsdAttributes,
      generateXsdCoverageReport,
    };
    return true;
  }
  return false;
}

// 即座に初期化
initializeDebugTools();
