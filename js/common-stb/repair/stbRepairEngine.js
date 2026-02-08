/**
 * @fileoverview ST-Bridgeデータ修復エンジン
 *
 * バリデーションで検出された問題を自動または手動で修復します。
 *
 * 修復項目:
 * - 欠損値の補完（デフォルト値設定）
 * - 範囲外値の修正（丸め処理）
 * - 無効な参照の削除/修正
 * - 重複要素の削除
 * - 幾何学的に無効な要素の削除
 *
 * @module common/stb/repair/stbRepairEngine
 */

import { parseElements } from '../parser/stbXmlParser.js';
import { SEVERITY, CATEGORY, getRepairableIssues } from '../validation/stbValidator.js';

// ========================================
// 定数定義
// ========================================

/**
 * 修復アクションの種類
 */
export const REPAIR_ACTION = {
  SET_DEFAULT: 'set_default', // デフォルト値を設定
  CLAMP_VALUE: 'clamp_value', // 値を範囲内に丸める
  REMOVE_ELEMENT: 'remove_element', // 要素を削除
  REMOVE_ATTRIBUTE: 'remove_attribute', // 属性を削除
  UPDATE_REFERENCE: 'update_reference', // 参照を更新
};

/**
 * デフォルト値の設定
 */
export const DEFAULT_VALUES = {
  // 座標デフォルト
  X: 0,
  Y: 0,
  Z: 0,

  // オフセットデフォルト
  offset_X: 0,
  offset_Y: 0,
  offset_bottom_X: 0,
  offset_bottom_Y: 0,
  offset_top_X: 0,
  offset_top_Y: 0,
  offset_start_X: 0,
  offset_start_Y: 0,
  offset_start_Z: 0,
  offset_end_X: 0,
  offset_end_Y: 0,
  offset_end_Z: 0,

  // 回転デフォルト
  rotate: 0,

  // 寸法デフォルト（mm）
  width: 300,
  height: 300,
  diameter: 300,
  thickness: 10,
  width_X: 300,
  width_Y: 300,

  // 深度デフォルト
  level_bottom: 0,
  level_top: -5000, // 5m下
};

/**
 * 値の範囲制限
 */
export const VALUE_CONSTRAINTS = {
  // 座標（mm）
  coordinates: { min: -1e9, max: 1e9 },

  // 寸法（mm）
  dimensions: { min: 0.1, max: 100000 },

  // オフセット（mm）
  offsets: { min: -100000, max: 100000 },

  // 回転（度）
  rotation: { min: -360, max: 360 },
};

// ========================================
// 修復エンジンクラス
// ========================================

/**
 * 修復エンジンクラス
 */
export class StbRepairEngine {
  /**
   * @param {Document} xmlDoc - 修復対象のXMLドキュメント
   */
  constructor(xmlDoc) {
    this.xmlDoc = xmlDoc;
    this.results = [];
    this.removedElements = [];
  }

  /**
   * バリデーションレポートに基づいて自動修復を実行
   *
   * @param {Object} validationReport - バリデーションレポート
   * @param {Object} options - 修復オプション
   * @param {boolean} options.removeInvalid - 修復不能な要素を削除
   * @param {boolean} options.useDefaults - デフォルト値を使用
   * @param {string[]} options.skipCategories - スキップするカテゴリ
   * @returns {RepairReport} 修復レポート
   */
  autoRepair(validationReport, options = {}) {
    const { removeInvalid = true, useDefaults = true, skipCategories = [] } = options;

    const repairableIssues = getRepairableIssues(validationReport);

    for (const issue of repairableIssues) {
      if (skipCategories.includes(issue.category)) {
        continue;
      }

      try {
        this.repairIssue(issue, { removeInvalid, useDefaults });
      } catch (e) {
        this.results.push({
          action: 'unknown',
          elementType: issue.elementType,
          elementId: issue.elementId,
          attribute: issue.attribute,
          success: false,
          message: `修復中にエラーが発生: ${e.message}`,
        });
      }
    }

    return this.generateReport();
  }

  /**
   * 個別の問題を修復
   *
   * @param {Object} issue - バリデーション問題
   * @param {Object} options - 修復オプション
   */
  repairIssue(issue, options = {}) {
    const { removeInvalid = true, useDefaults = true } = options;

    switch (issue.category) {
      case CATEGORY.DATA:
        this.repairDataIssue(issue, useDefaults);
        break;

      case CATEGORY.REFERENCE:
        this.repairReferenceIssue(issue, removeInvalid);
        break;

      case CATEGORY.GEOMETRY:
        if (removeInvalid) {
          this.repairGeometryIssue(issue);
        }
        break;

      case CATEGORY.DUPLICATE:
        if (removeInvalid) {
          this.repairDuplicateIssue(issue);
        }
        break;

      default:
        // 未対応のカテゴリ
        break;
    }
  }

  /**
   * データ問題の修復
   */
  repairDataIssue(issue, useDefaults) {
    const element = this.findElement(issue.elementType, issue.elementId);
    if (!element) {
      this.results.push({
        action: REPAIR_ACTION.SET_DEFAULT,
        elementType: issue.elementType,
        elementId: issue.elementId,
        attribute: issue.attribute,
        success: false,
        message: '要素が見つかりません',
      });
      return;
    }

    const attribute = issue.attribute;

    // 欠損値の場合
    if (issue.message.includes('欠落') || issue.message.includes('ありません')) {
      if (useDefaults && attribute in DEFAULT_VALUES) {
        const defaultValue = DEFAULT_VALUES[attribute];
        element.setAttribute(attribute, String(defaultValue));

        this.results.push({
          action: REPAIR_ACTION.SET_DEFAULT,
          elementType: issue.elementType,
          elementId: issue.elementId,
          attribute,
          oldValue: null,
          newValue: defaultValue,
          success: true,
          message: `デフォルト値 ${defaultValue} を設定しました`,
        });
      }
    }
    // 無効な値（NaN, Infinity）の場合
    else if (issue.message.includes('数値ではありません') || issue.message.includes('無限大')) {
      if (useDefaults && attribute in DEFAULT_VALUES) {
        const defaultValue = DEFAULT_VALUES[attribute];
        const oldValue = element.getAttribute(attribute);
        element.setAttribute(attribute, String(defaultValue));

        this.results.push({
          action: REPAIR_ACTION.SET_DEFAULT,
          elementType: issue.elementType,
          elementId: issue.elementId,
          attribute,
          oldValue,
          newValue: defaultValue,
          success: true,
          message: `無効な値を ${defaultValue} に置換しました`,
        });
      }
    }
    // 範囲外の値の場合
    else if (issue.message.includes('非常に大きい') || issue.message.includes('非常に小さい')) {
      // 値のクランプは必要に応じて実装
    }
  }

  /**
   * 参照問題の修復
   */
  repairReferenceIssue(issue, removeInvalid) {
    const element = this.findElement(issue.elementType, issue.elementId);
    if (!element) {
      this.results.push({
        action: REPAIR_ACTION.UPDATE_REFERENCE,
        elementType: issue.elementType,
        elementId: issue.elementId,
        attribute: issue.attribute,
        success: false,
        message: '要素が見つかりません',
      });
      return;
    }

    // 存在しない参照の場合、要素を削除
    if (removeInvalid && issue.message.includes('存在しない')) {
      this.removeElement(element);

      this.results.push({
        action: REPAIR_ACTION.REMOVE_ELEMENT,
        elementType: issue.elementType,
        elementId: issue.elementId,
        attribute: issue.attribute,
        oldValue: issue.value,
        newValue: null,
        success: true,
        message: `無効な参照を持つ要素を削除しました`,
      });
    }
  }

  /**
   * 幾何学問題の修復
   */
  repairGeometryIssue(issue) {
    const element = this.findElement(issue.elementType, issue.elementId);
    if (!element) {
      this.results.push({
        action: REPAIR_ACTION.REMOVE_ELEMENT,
        elementType: issue.elementType,
        elementId: issue.elementId,
        success: false,
        message: '要素が見つかりません',
      });
      return;
    }

    // 長さゼロの要素や非常に短い要素を削除
    if (issue.message.includes('同じノード') || issue.message.includes('非常に短い')) {
      this.removeElement(element);

      this.results.push({
        action: REPAIR_ACTION.REMOVE_ELEMENT,
        elementType: issue.elementType,
        elementId: issue.elementId,
        oldValue: issue.value,
        newValue: null,
        success: true,
        message: `幾何学的に無効な要素を削除しました`,
      });
    }
  }

  /**
   * 重複問題の修復
   */
  repairDuplicateIssue(issue) {
    // 重複IDの場合、後の要素を削除（通常は最初の定義を保持）
    // この実装では個別の処理が必要
    this.results.push({
      action: REPAIR_ACTION.REMOVE_ELEMENT,
      elementType: issue.elementType,
      elementId: issue.elementId,
      success: false,
      message: '重複問題の自動修復は手動確認が必要です',
    });
  }

  /**
   * 要素を検索
   */
  findElement(elementType, elementId) {
    if (!elementId) return null;

    const elements = parseElements(this.xmlDoc, elementType);
    return elements.find((el) => el.getAttribute('id') === elementId) || null;
  }

  /**
   * 要素を削除
   */
  removeElement(element) {
    if (element && element.parentNode) {
      const elementInfo = {
        tagName: element.tagName,
        id: element.getAttribute('id'),
      };
      element.parentNode.removeChild(element);
      this.removedElements.push(elementInfo);
    }
  }

  /**
   * 座標値を正規化
   *
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   * @param {string} attribute - 属性名
   * @param {number} value - 現在の値
   * @returns {RepairResult} 修復結果
   */
  normalizeCoordinate(elementType, elementId, attribute, value) {
    const element = this.findElement(elementType, elementId);
    if (!element) {
      return {
        action: REPAIR_ACTION.CLAMP_VALUE,
        elementType,
        elementId,
        attribute,
        success: false,
        message: '要素が見つかりません',
      };
    }

    const { min, max } = VALUE_CONSTRAINTS.coordinates;
    const clampedValue = Math.max(min, Math.min(max, value));

    if (clampedValue !== value) {
      element.setAttribute(attribute, String(clampedValue));

      const result = {
        action: REPAIR_ACTION.CLAMP_VALUE,
        elementType,
        elementId,
        attribute,
        oldValue: value,
        newValue: clampedValue,
        success: true,
        message: `座標値を ${min}〜${max} の範囲に丸めました`,
      };

      this.results.push(result);
      return result;
    }

    return {
      action: REPAIR_ACTION.CLAMP_VALUE,
      elementType,
      elementId,
      attribute,
      success: true,
      message: '修復不要',
    };
  }

  /**
   * 寸法値を正規化
   *
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   * @param {string} attribute - 属性名
   * @param {number} value - 現在の値
   * @returns {RepairResult} 修復結果
   */
  normalizeDimension(elementType, elementId, attribute, value) {
    const element = this.findElement(elementType, elementId);
    if (!element) {
      return {
        action: REPAIR_ACTION.CLAMP_VALUE,
        elementType,
        elementId,
        attribute,
        success: false,
        message: '要素が見つかりません',
      };
    }

    const { min, max } = VALUE_CONSTRAINTS.dimensions;
    let clampedValue = Math.max(min, Math.min(max, value));

    // NaNやInfinityの場合はデフォルト値を使用
    if (!isFinite(value)) {
      clampedValue = DEFAULT_VALUES[attribute] || 300;
    }

    if (clampedValue !== value) {
      element.setAttribute(attribute, String(clampedValue));

      const result = {
        action: REPAIR_ACTION.CLAMP_VALUE,
        elementType,
        elementId,
        attribute,
        oldValue: value,
        newValue: clampedValue,
        success: true,
        message: `寸法値を正規化しました`,
      };

      this.results.push(result);
      return result;
    }

    return {
      action: REPAIR_ACTION.CLAMP_VALUE,
      elementType,
      elementId,
      attribute,
      success: true,
      message: '修復不要',
    };
  }

  /**
   * 欠損属性にデフォルト値を設定
   *
   * @param {string} elementType - 要素タイプ
   * @param {string} elementId - 要素ID
   * @param {string} attribute - 属性名
   * @param {*} defaultValue - デフォルト値（省略時は DEFAULT_VALUES から取得）
   * @returns {RepairResult} 修復結果
   */
  setDefaultValue(elementType, elementId, attribute, defaultValue = null) {
    const element = this.findElement(elementType, elementId);
    if (!element) {
      return {
        action: REPAIR_ACTION.SET_DEFAULT,
        elementType,
        elementId,
        attribute,
        success: false,
        message: '要素が見つかりません',
      };
    }

    const currentValue = element.getAttribute(attribute);
    if (currentValue !== null && currentValue !== '') {
      return {
        action: REPAIR_ACTION.SET_DEFAULT,
        elementType,
        elementId,
        attribute,
        success: true,
        message: '値が既に設定されています',
      };
    }

    const valueToSet = defaultValue !== null ? defaultValue : DEFAULT_VALUES[attribute];
    if (valueToSet === undefined) {
      return {
        action: REPAIR_ACTION.SET_DEFAULT,
        elementType,
        elementId,
        attribute,
        success: false,
        message: 'デフォルト値が定義されていません',
      };
    }

    element.setAttribute(attribute, String(valueToSet));

    const result = {
      action: REPAIR_ACTION.SET_DEFAULT,
      elementType,
      elementId,
      attribute,
      oldValue: null,
      newValue: valueToSet,
      success: true,
      message: `デフォルト値 ${valueToSet} を設定しました`,
    };

    this.results.push(result);
    return result;
  }

  /**
   * 無効な参照を持つ要素を削除
   *
   * @param {Map} nodeMap - ノードマップ
   * @returns {RepairResult[]} 修復結果の配列
   */
  removeInvalidReferences(nodeMap) {
    const results = [];

    const checkAndRemove = (elementType, nodeAttrs) => {
      const elements = parseElements(this.xmlDoc, elementType);

      for (const element of elements) {
        const id = element.getAttribute('id');
        let hasInvalidRef = false;

        for (const attr of nodeAttrs) {
          const nodeId = element.getAttribute(attr);
          if (nodeId && !nodeMap.has(nodeId)) {
            hasInvalidRef = true;
            break;
          }
        }

        if (hasInvalidRef) {
          this.removeElement(element);

          const result = {
            action: REPAIR_ACTION.REMOVE_ELEMENT,
            elementType,
            elementId: id,
            success: true,
            message: '無効なノード参照を持つ要素を削除しました',
          };

          results.push(result);
          this.results.push(result);
        }
      }
    };

    // 各要素タイプの参照チェック
    checkAndRemove('StbColumn', ['id_node_bottom', 'id_node_top']);
    checkAndRemove('StbPost', ['id_node_bottom', 'id_node_top']);
    checkAndRemove('StbGirder', ['id_node_start', 'id_node_end']);
    checkAndRemove('StbBeam', ['id_node_start', 'id_node_end']);
    checkAndRemove('StbBrace', ['id_node_start', 'id_node_end']);
    checkAndRemove('StbFoundationColumn', ['id_node_bottom', 'id_node_top']);
    checkAndRemove('StbFooting', ['id_node']);

    return results;
  }

  /**
   * 長さゼロの要素を削除
   *
   * @param {Map} nodeMap - ノードマップ
   * @returns {RepairResult[]} 修復結果の配列
   */
  removeZeroLengthElements(nodeMap) {
    const results = [];

    const checkAndRemove = (elementType, startAttr, endAttr) => {
      const elements = parseElements(this.xmlDoc, elementType);

      for (const element of elements) {
        const id = element.getAttribute('id');
        const startId = element.getAttribute(startAttr);
        const endId = element.getAttribute(endAttr);

        // 同一ノードを参照
        if (startId && endId && startId === endId) {
          this.removeElement(element);

          const result = {
            action: REPAIR_ACTION.REMOVE_ELEMENT,
            elementType,
            elementId: id,
            success: true,
            message: '長さゼロの要素を削除しました',
          };

          results.push(result);
          this.results.push(result);
          continue;
        }

        // 座標が同じ
        if (startId && endId && nodeMap.has(startId) && nodeMap.has(endId)) {
          const start = nodeMap.get(startId);
          const end = nodeMap.get(endId);

          if (start.x === end.x && start.y === end.y && start.z === end.z) {
            this.removeElement(element);

            const result = {
              action: REPAIR_ACTION.REMOVE_ELEMENT,
              elementType,
              elementId: id,
              success: true,
              message: '長さゼロの要素を削除しました（同一座標）',
            };

            results.push(result);
            this.results.push(result);
          }
        }
      }
    };

    checkAndRemove('StbColumn', 'id_node_bottom', 'id_node_top');
    checkAndRemove('StbPost', 'id_node_bottom', 'id_node_top');
    checkAndRemove('StbGirder', 'id_node_start', 'id_node_end');
    checkAndRemove('StbBeam', 'id_node_start', 'id_node_end');
    checkAndRemove('StbBrace', 'id_node_start', 'id_node_end');
    checkAndRemove('StbFoundationColumn', 'id_node_bottom', 'id_node_top');

    return results;
  }

  /**
   * 修復レポートを生成
   *
   * @returns {RepairReport} 修復レポート
   */
  generateReport() {
    const successCount = this.results.filter((r) => r.success).length;
    const failureCount = this.results.filter((r) => !r.success).length;

    return {
      totalRepairs: this.results.length,
      successCount,
      failureCount,
      results: [...this.results],
      removedElements: [...this.removedElements],
      timestamp: new Date(),
    };
  }

  /**
   * 修復された XMLドキュメントを取得
   *
   * @returns {Document} 修復済みXMLドキュメント
   */
  getRepairedDocument() {
    return this.xmlDoc;
  }

  /**
   * 修復結果をリセット
   */
  reset() {
    this.results = [];
    this.removedElements = [];
  }
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * 修復レポートをフォーマット
 *
 * @param {RepairReport} report - 修復レポート
 * @returns {string} フォーマットされたテキスト
 */
export function formatRepairReport(report) {
  if (!report) return '修復レポートはありません。';

  const lines = [];

  lines.push('='.repeat(60));
  lines.push('ST-Bridge データ修復レポート');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`実行日時: ${report.timestamp ? report.timestamp.toISOString() : '不明'}`);
  lines.push('');

  // サマリー
  lines.push('--- サマリー ---');
  lines.push(`総修復数: ${report.totalRepairs}`);
  lines.push(`成功: ${report.successCount}`);
  lines.push(`失敗: ${report.failureCount}`);
  lines.push(`削除された要素数: ${report.removedElements ? report.removedElements.length : 0}`);
  lines.push('');

  // 成功した修復
  const successes = report.results ? report.results.filter((r) => r.success) : [];
  if (successes.length > 0) {
    lines.push('--- 成功した修復 ---');
    for (const result of successes) {
      lines.push(`  [${result.action}] ${result.elementType}`);
      if (result.elementId) {
        lines.push(`    ID: ${result.elementId}`);
      }
      if (result.attribute) {
        lines.push(`    属性: ${result.attribute}`);
        if (result.oldValue !== undefined) {
          lines.push(`    旧値: ${result.oldValue}`);
        }
        if (result.newValue !== undefined) {
          lines.push(`    新値: ${result.newValue}`);
        }
      }
      lines.push(`    ${result.message}`);
      lines.push('');
    }
  }

  // 失敗した修復
  const failures = report.results ? report.results.filter((r) => !r.success) : [];
  if (failures.length > 0) {
    lines.push('--- 失敗した修復 ---');
    for (const result of failures) {
      lines.push(`  [${result.action}] ${result.elementType}`);
      if (result.elementId) {
        lines.push(`    ID: ${result.elementId}`);
      }
      lines.push(`    理由: ${result.message}`);
      lines.push('');
    }
  }

  // 削除された要素
  if (report.removedElements && report.removedElements.length > 0) {
    lines.push('--- 削除された要素 ---');
    for (const elem of report.removedElements) {
      lines.push(`  - ${elem.tagName} (ID: ${elem.id})`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * 便利関数: ドキュメントを自動修復
 *
 * @param {Document} xmlDoc - 修復対象のXMLドキュメント
 * @param {Object} validationReport - バリデーションレポート
 * @param {Object} options - 修復オプション
 * @returns {Object} { document, report }
 */
export function autoRepairDocument(xmlDoc, validationReport, options = {}) {
  const engine = new StbRepairEngine(xmlDoc);
  const report = engine.autoRepair(validationReport, options);

  return {
    document: engine.getRepairedDocument(),
    report,
  };
}
