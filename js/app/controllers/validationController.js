/**
 * @fileoverview バリデーションコントローラー
 *
 * バリデーション機能（parser、validation、repair層）へのFacadeを提供します。
 * UI層がバリデーションドメイン層に直接依存することを防ぎます。
 *
 * @module app/controllers/validationController
 */

import {
  validateAttributeValue,
  isSchemaLoaded,
} from '../../parser/xsdSchemaParser.js';
import {
  SEVERITY,
  CATEGORY,
  formatValidationReport,
} from '../../validation/stbValidator.js';
import { formatRepairReport } from '../../repair/stbRepairEngine.js';

/**
 * バリデーションコントローラー
 * バリデーション・リペア機能への統一的なインターフェースを提供
 */
export const validationController = {
  /**
   * 属性値をバリデート
   * @param {string} nodeName - ノード名
   * @param {string} attrName - 属性名
   * @param {*} value - 検証する値
   * @returns {boolean|Object} バリデーション結果
   */
  validateAttribute(nodeName, attrName, value) {
    return validateAttributeValue(nodeName, attrName, value);
  },

  /**
   * スキーマが読み込まれているかチェック
   * @returns {boolean} スキーマが読み込まれていればtrue
   */
  isSchemaReady() {
    return isSchemaLoaded();
  },

  /**
   * バリデーションレポートをフォーマット
   * @param {Object} results - バリデーション結果
   * @returns {string} フォーマット済みレポート
   */
  formatValidationReport(results) {
    return formatValidationReport(results);
  },

  /**
   * リペアレポートをフォーマット
   * @param {Object} results - リペア結果
   * @returns {string} フォーマット済みレポート
   */
  formatRepairReport(results) {
    return formatRepairReport(results);
  },

  // 定数のエクスポート
  SEVERITY,
  CATEGORY,
};

export default validationController;
