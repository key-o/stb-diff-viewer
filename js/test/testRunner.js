/**
 * @fileoverview 自動テストランナー
 *
 * STBファイルを自動ロードして機能をテストします:
 * - サンプルデータの自動ロード
 * - 要素選択の自動実行
 * - パラメータ表示の検証
 * - エラー検出とレポート生成
 */

import { compareModels } from "../modelLoader.js";
import { displayElementInfo } from "../viewer/ui/elementInfoDisplay.js";

/**
 * テストランナークラス
 */
export class TestRunner {
  constructor() {
    this.testResults = [];
    this.sampleData = null;
    this.isRunning = false;
  }

  /**
   * サンプルSTBデータをロード
   * @param {string} dataA - モデルAのSTBデータ（XML文字列）
   * @param {string} dataB - モデルBのSTBデータ（XML文字列）
   */
  async loadSampleData(dataA, dataB) {
    console.log("Loading sample STB data...");
    
    try {
      // Blob と File オブジェクトを作成
      const blobA = new Blob([dataA], { type: 'application/xml' });
      const blobB = new Blob([dataB], { type: 'application/xml' });
      
      const fileA = new File([blobA], 'sampleA.stb', { type: 'application/xml' });
      const fileB = new File([blobB], 'sampleB.stb', { type: 'application/xml' });

      // ファイル入力フィールドに設定
      const fileInputA = document.getElementById('fileA');
      const fileInputB = document.getElementById('fileB');
      
      if (fileInputA && fileInputB) {
        // DataTransfer を使用してファイルを設定
        const dtA = new DataTransfer();
        dtA.items.add(fileA);
        fileInputA.files = dtA.files;

        const dtB = new DataTransfer();
        dtB.items.add(fileB);
        fileInputB.files = dtB.files;

        console.log("Sample data loaded into file inputs");
        this.sampleData = { fileA, fileB, dataA, dataB };
        return true;
      } else {
        throw new Error("File input elements not found");
      }
    } catch (error) {
      console.error("Error loading sample data:", error);
      return false;
    }
  }

  /**
   * 自動比較テストを実行
   */
  async runComparisonTest() {
    if (!this.sampleData) {
      throw new Error("Sample data not loaded. Call loadSampleData() first.");
    }

    console.log("Running automatic comparison test...");
    
    const testResult = {
      name: "Model Comparison Test",
      startTime: Date.now(),
      success: false,
      errors: [],
      warnings: []
    };

    try {
      // モデル比較を実行
      const success = await compareModels(window.requestRender);
      
      if (success) {
        testResult.success = true;
        console.log("✅ Model comparison completed successfully");
      } else {
        testResult.errors.push("Model comparison failed");
        console.log("❌ Model comparison failed");
      }
    } catch (error) {
      testResult.errors.push(`Model comparison error: ${error.message}`);
      console.error("❌ Model comparison error:", error);
    }

    testResult.endTime = Date.now();
    testResult.duration = testResult.endTime - testResult.startTime;
    this.testResults.push(testResult);

    return testResult;
  }

  /**
   * 要素選択テストを自動実行
   * @param {Array<Object>} testCases - テストケース配列 [{elementType, idA, idB}, ...]
   */
  async runElementSelectionTests(testCases) {
    console.log("Running element selection tests...");
    
    const results = [];

    for (const testCase of testCases) {
      const { elementType, idA, idB, expectedAttributes = [] } = testCase;
      
      const testResult = {
        name: `Element Selection Test: ${elementType} A:${idA} B:${idB}`,
        startTime: Date.now(),
        success: false,
        errors: [],
        warnings: [],
        elementType,
        idA,
        idB
      };

      try {
        console.log(`Testing ${elementType} selection - A:${idA}, B:${idB}`);
        
        // 要素情報表示を実行
        await displayElementInfo(idA, idB, elementType);
        
        // 表示結果を検証
        const validationResult = this.validateElementDisplay(elementType, idA, idB, expectedAttributes);
        
        if (validationResult.success) {
          testResult.success = true;
          console.log(`✅ ${elementType} A:${idA} B:${idB} - Parameters displayed correctly`);
        } else {
          testResult.errors = validationResult.errors;
          testResult.warnings = validationResult.warnings;
          console.log(`❌ ${elementType} A:${idA} B:${idB} - Parameter display failed`);
        }
        
      } catch (error) {
        testResult.errors.push(`Element selection error: ${error.message}`);
        console.error(`❌ Element selection error for ${elementType}:`, error);
      }

      testResult.endTime = Date.now();
      testResult.duration = testResult.endTime - testResult.startTime;
      results.push(testResult);
    }

    this.testResults.push(...results);
    return results;
  }

  /**
   * 要素情報表示の検証
   */
  validateElementDisplay(elementType, idA, idB, expectedAttributes) {
    const result = {
      success: false,
      errors: [],
      warnings: []
    };

    try {
      // 要素情報パネルを取得
      const infoPanel = document.getElementById('element-info-content');
      if (!infoPanel) {
        result.errors.push("Element info panel not found");
        return result;
      }

      const content = infoPanel.innerHTML;
      
      // 基本検証
      if (!content || content.includes("要素を選択してください")) {
        result.errors.push("No element information displayed");
        return result;
      }

      // エラーメッセージチェック
      if (content.includes("エラー:") || content.includes("見つかりません")) {
        result.errors.push("Error message displayed in element info");
        return result;
      }

      // 要素タイプ表示確認
      if (!content.includes(elementType)) {
        result.warnings.push(`Element type ${elementType} not clearly displayed`);
      }

      // ID表示確認
      if (idA && !content.includes(idA)) {
        result.warnings.push(`ID A:${idA} not found in display`);
      }
      if (idB && !content.includes(idB)) {
        result.warnings.push(`ID B:${idB} not found in display`);
      }

      // 期待される属性の確認
      for (const attr of expectedAttributes) {
        if (!content.includes(attr)) {
          result.warnings.push(`Expected attribute '${attr}' not found`);
        }
      }

      // テーブル構造の確認
      const table = infoPanel.querySelector('table');
      if (!table) {
        result.errors.push("No table structure found in element display");
        return result;
      }

      const rows = table.querySelectorAll('tr');
      if (rows.length < 2) { // ヘッダー + 最低1行のデータ
        result.errors.push("Insufficient data rows in element table");
        return result;
      }

      // 成功判定
      if (result.errors.length === 0) {
        result.success = true;
      }

    } catch (error) {
      result.errors.push(`Validation error: ${error.message}`);
    }

    return result;
  }

  /**
   * 全てのサポート要素の自動テスト
   */
  async runFullElementTest() {
    if (!this.sampleData) {
      throw new Error("Sample data not loaded");
    }

    console.log("Running full element test suite...");

    // サンプルデータから要素IDを抽出
    const elementIds = this.extractElementIds();
    
    const testCases = [];

    // 各要素タイプのテストケースを生成
    for (const [elementType, ids] of Object.entries(elementIds)) {
      if (ids.length > 0) {
        // 最初の要素をテスト
        testCases.push({
          elementType,
          idA: ids[0],
          idB: ids[0], // 同じIDでテスト
          expectedAttributes: this.getExpectedAttributes(elementType)
        });
      }
    }

    return await this.runElementSelectionTests(testCases);
  }

  /**
   * サンプルデータから要素IDを抽出
   */
  extractElementIds() {
    const elementIds = {};
    
    if (!this.sampleData) return elementIds;

    try {
      const parser = new DOMParser();
      const docA = parser.parseFromString(this.sampleData.dataA, 'text/xml');
      
      const elementTypes = ['Node', 'Column', 'Girder', 'Beam', 'Brace', 'Slab', 'Wall'];
      
      for (const elementType of elementTypes) {
        const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
        const elements = docA.querySelectorAll(tagName);
        
        elementIds[elementType] = Array.from(elements)
          .map(el => el.getAttribute('id'))
          .filter(id => id)
          .slice(0, 3); // 最初の3個まで
      }
      
    } catch (error) {
      console.error("Error extracting element IDs:", error);
    }

    return elementIds;
  }

  /**
   * 要素タイプに応じた期待属性を取得
   */
  getExpectedAttributes(elementType) {
    const commonAttrs = ['id'];
    
    const specificAttrs = {
      'Node': ['X', 'Y', 'Z'],
      'Column': ['id_node_bottom', 'id_node_top', 'rotate', 'id_section'],
      'Girder': ['id_node_start', 'id_node_end', 'rotate', 'id_section'],
      'Beam': ['id_node_start', 'id_node_end', 'rotate', 'id_section'],
      'Brace': ['id_node_start', 'id_node_end', 'rotate', 'id_section'],
      'Slab': ['StbNodeIdOrder', 'id_section'],
      'Wall': ['StbNodeIdOrder', 'id_section']
    };

    return [...commonAttrs, ...(specificAttrs[elementType] || [])];
  }

  /**
   * テスト結果のレポート生成
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalTests: this.testResults.length,
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };

    for (const result of this.testResults) {
      if (result.success) {
        report.passed++;
      } else {
        report.failed++;
      }
      
      report.warnings += result.warnings.length;
      
      report.details.push({
        name: result.name,
        success: result.success,
        duration: result.duration,
        errors: result.errors,
        warnings: result.warnings
      });
    }

    return report;
  }

  /**
   * テスト結果をコンソールに出力
   */
  logReport() {
    const report = this.generateReport();
    
    console.group("🧪 Test Report");
    console.log(`Total Tests: ${report.totalTests}`);
    console.log(`✅ Passed: ${report.passed}`);
    console.log(`❌ Failed: ${report.failed}`);
    console.log(`⚠️ Warnings: ${report.warnings}`);
    
    if (report.details.length > 0) {
      console.group("Test Details");
      for (const detail of report.details) {
        const icon = detail.success ? "✅" : "❌";
        console.log(`${icon} ${detail.name} (${detail.duration}ms)`);
        
        if (detail.errors.length > 0) {
          console.log("  Errors:", detail.errors);
        }
        if (detail.warnings.length > 0) {
          console.log("  Warnings:", detail.warnings);
        }
      }
      console.groupEnd();
    }
    
    console.groupEnd();
    
    return report;
  }

  /**
   * テスト結果をクリア
   */
  clearResults() {
    this.testResults = [];
    console.log("Test results cleared");
  }
}

// グローバルインスタンス
const testRunner = new TestRunner();

// デバッグ用にwindowに公開
if (typeof window !== 'undefined') {
  window.testRunner = testRunner;
}

export default testRunner;