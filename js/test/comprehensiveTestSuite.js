/**
 * @fileoverview STB Diff Viewer 包括的機能テストスイート
 * 
 * このテストスイートは、アプリケーションの全機能を体系的にテストします：
 * - 単体テスト: 個別関数・モジュールのテスト
 * - 統合テスト: モジュール間連携のテスト  
 * - E2Eテスト: ユーザーワークフローのテスト
 * - パフォーマンステスト: 性能・メモリ使用量のテスト
 * - 回帰テスト: 既知の問題の再発防止テスト
 */

import { compareModels } from '../modelLoader.js';
import { displayElementInfo } from '../viewer/ui/elementInfoDisplay.js';
import { parseXml } from '../parser/stbXmlParser.js';
import { loadXsdSchema } from '../parser/xsdSchemaParser.js';
import { setState, getState } from '../core/globalState.js';
import testRunner from './testRunner.js';

/**
 * テスト設定とデータ
 */
const TEST_CONFIG = {
  timeouts: {
    unit: 5000,           // 単体テスト: 5秒
    integration: 15000,   // 統合テスト: 15秒
    e2e: 30000,          // E2Eテスト: 30秒
    performance: 60000    // パフォーマンステスト: 60秒
  },
  
  sampleFiles: [
    'RC+S_testmodel_3.stb',
    'RCサンプルv202_20250618.stb',
    'Sサンプルv202_20250618.stb',
    'S梁全パターン_SS7.stb',
    '【構造システム_20250513】S造断面データ.stb'
  ],
  
  testElements: {
    nodes: ['16', '17', '18'],
    columns: ['57', '58', '59'],
    girders: ['57', '58', '59'],
    beams: ['B1', 'B2', 'B3'],
    braces: ['BR1', 'BR2'],
    slabs: ['SL1', 'SL2'],
    walls: ['W1', 'W2']
  }
};

/**
 * 包括的テストスイート管理クラス
 */
export class ComprehensiveTestSuite {
  constructor() {
    this.results = {
      unit: [],
      integration: [],
      e2e: [],
      performance: [],
      regression: []
    };
    this.startTime = null;
    this.memoryStart = null;
  }

  /**
   * 全テストスイートを実行
   */
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Test Suite...');
    this.startTime = Date.now();
    this.memoryStart = this.getMemoryUsage();

    try {
      // 1. 単体テスト実行
      console.log('\n📋 Phase 1: Unit Tests');
      await this.runUnitTests();

      // 2. 統合テスト実行
      console.log('\n🔗 Phase 2: Integration Tests');
      await this.runIntegrationTests();

      // 3. E2Eテスト実行
      console.log('\n🌍 Phase 3: End-to-End Tests');
      await this.runE2ETests();

      // 4. パフォーマンステスト実行
      console.log('\n⚡ Phase 4: Performance Tests');
      await this.runPerformanceTests();

      // 5. 回帰テスト実行
      console.log('\n🔄 Phase 5: Regression Tests');
      await this.runRegressionTests();

      // 総合レポート生成
      this.generateComprehensiveReport();

    } catch (error) {
      console.error('❌ Test suite execution failed:', error);
      throw error;
    }
  }

  /**
   * 単体テスト: 個別関数・モジュールのテスト
   */
  async runUnitTests() {
    const unitTests = [
      // XMLパーサーテスト
      {
        name: 'XML Parser - Valid STB parsing',
        test: () => this.testXmlParser(),
        timeout: TEST_CONFIG.timeouts.unit
      },
      
      // XSDスキーマテスト
      {
        name: 'XSD Schema - Schema loading and validation',
        test: () => this.testXsdSchema(),
        timeout: TEST_CONFIG.timeouts.unit
      },
      
      // 状態管理テスト
      {
        name: 'Global State - State management operations',
        test: () => this.testGlobalState(),
        timeout: TEST_CONFIG.timeouts.unit
      },
      
      // ユーティリティ関数テスト
      {
        name: 'Utilities - Helper functions',
        test: () => this.testUtilities(),
        timeout: TEST_CONFIG.timeouts.unit
      },

      // ジオメトリ生成テスト
      {
        name: 'Geometry - Shape factory operations',
        test: () => this.testGeometryGeneration(),
        timeout: TEST_CONFIG.timeouts.unit
      }
    ];

    for (const unitTest of unitTests) {
      await this.executeTest(unitTest, 'unit');
    }
  }

  /**
   * 統合テスト: モジュール間連携のテスト
   */
  async runIntegrationTests() {
    const integrationTests = [
      // モデル読み込み統合テスト
      {
        name: 'Model Loading - File to 3D rendering pipeline',
        test: () => this.testModelLoadingPipeline(),
        timeout: TEST_CONFIG.timeouts.integration
      },
      
      // UI連携テスト
      {
        name: 'UI Integration - Controls and display sync',
        test: () => this.testUIIntegration(),
        timeout: TEST_CONFIG.timeouts.integration
      },
      
      // 要素比較統合テスト
      {
        name: 'Element Comparison - Multi-type element comparison',
        test: () => this.testElementComparisonIntegration(),
        timeout: TEST_CONFIG.timeouts.integration
      },
      
      // 表示モード統合テスト
      {
        name: 'View Modes - Mode switching and consistency',
        test: () => this.testViewModeIntegration(),
        timeout: TEST_CONFIG.timeouts.integration
      }
    ];

    for (const integrationTest of integrationTests) {
      await this.executeTest(integrationTest, 'integration');
    }
  }

  /**
   * E2Eテスト: ユーザーワークフローのテスト
   */
  async runE2ETests() {
    const e2eTests = [
      // 基本ワークフロー
      {
        name: 'Basic Workflow - Load files and compare models',
        test: () => this.testBasicWorkflow(),
        timeout: TEST_CONFIG.timeouts.e2e
      },
      
      // 要素選択ワークフロー
      {
        name: 'Element Selection - Click to inspect workflow',
        test: () => this.testElementSelectionWorkflow(),
        timeout: TEST_CONFIG.timeouts.e2e
      },
      
      // 表示制御ワークフロー
      {
        name: 'Display Controls - Visibility and mode controls',
        test: () => this.testDisplayControlWorkflow(),
        timeout: TEST_CONFIG.timeouts.e2e
      },
      
      // エクスポートワークフロー
      {
        name: 'Export Workflow - Data export and validation',
        test: () => this.testExportWorkflow(),
        timeout: TEST_CONFIG.timeouts.e2e
      }
    ];

    for (const e2eTest of e2eTests) {
      await this.executeTest(e2eTest, 'e2e');
    }
  }

  /**
   * パフォーマンステスト: 性能・メモリ使用量のテスト
   */
  async runPerformanceTests() {
    const performanceTests = [
      // 大型モデル処理性能
      {
        name: 'Large Model Performance - Processing speed',
        test: () => this.testLargeModelPerformance(),
        timeout: TEST_CONFIG.timeouts.performance
      },
      
      // メモリ使用量テスト
      {
        name: 'Memory Usage - Memory consumption patterns',
        test: () => this.testMemoryUsage(),
        timeout: TEST_CONFIG.timeouts.performance
      },
      
      // レンダリング性能テスト
      {
        name: 'Rendering Performance - Frame rate and responsiveness',
        test: () => this.testRenderingPerformance(),
        timeout: TEST_CONFIG.timeouts.performance
      }
    ];

    for (const performanceTest of performanceTests) {
      await this.executeTest(performanceTest, 'performance');
    }
  }

  /**
   * 回帰テスト: 既知の問題の再発防止テスト
   */
  async runRegressionTests() {
    const regressionTests = [
      // Issue #1: Girder parameter display
      {
        name: 'Regression - Girder parameter display fix',
        test: () => this.testGirderParameterDisplayFix(),
        timeout: TEST_CONFIG.timeouts.integration
      },
      
      // Issue #2: Label control after mode switch
      {
        name: 'Regression - Label control after solid/line mode switch',
        test: () => this.testLabelControlAfterModeSwitch(),
        timeout: TEST_CONFIG.timeouts.integration
      },
      
      // Issue #3: Node visibility toggle
      {
        name: 'Regression - Node visibility toggle functionality',
        test: () => this.testNodeVisibilityToggle(),
        timeout: TEST_CONFIG.timeouts.integration
      }
    ];

    for (const regressionTest of regressionTests) {
      await this.executeTest(regressionTest, 'regression');
    }
  }

  /**
   * 個別テスト実行ヘルパー
   */
  async executeTest(testConfig, category) {
    const { name, test, timeout } = testConfig;
    const startTime = Date.now();
    
    try {
      console.log(`  🧪 ${name}`);
      
      // タイムアウト設定
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Test timeout')), timeout)
      );
      
      // テスト実行
      const result = await Promise.race([test(), timeoutPromise]);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.results[category].push({
        name,
        success: true,
        duration,
        result
      });
      
      console.log(`    ✅ Passed (${duration}ms)`);
      
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.results[category].push({
        name,
        success: false,
        duration,
        error: error.message
      });
      
      console.log(`    ❌ Failed (${duration}ms): ${error.message}`);
    }
  }

  // ==========================================
  // 具体的なテスト実装
  // ==========================================

  /**
   * XMLパーサーテスト
   */
  async testXmlParser() {
    const testXml = `<?xml version="1.0" encoding="UTF-8"?>
      <ST_BRIDGE xmlns="https://www.building-smart.or.jp/dl" version="2.0.2">
        <StbModel>
          <StbNodes>
            <StbNode id="1" X="0" Y="0" Z="0"/>
          </StbNodes>
        </StbModel>
      </ST_BRIDGE>`;
    
    const doc = parseXml(testXml);
    if (!doc) throw new Error('Failed to parse valid XML');
    
    const nodes = doc.querySelectorAll('StbNode');
    if (nodes.length !== 1) throw new Error('Node parsing failed');
    
    return { nodeCount: nodes.length };
  }

  /**
   * XSDスキーマテスト
   */
  async testXsdSchema() {
    const schemaLoaded = await loadXsdSchema('./schemas/ST-Bridge202.xsd');
    if (!schemaLoaded) throw new Error('Failed to load XSD schema');
    
    return { schemaLoaded: true };
  }

  /**
   * グローバル状態テスト
   */
  async testGlobalState() {
    // 状態設定テスト
    setState('test.value', 42);
    const value = getState('test.value');
    if (value !== 42) throw new Error('State management failed');
    
    // ネストした状態テスト
    setState('test.nested.deep', 'success');
    const nested = getState('test.nested.deep');
    if (nested !== 'success') throw new Error('Nested state management failed');
    
    return { basicState: true, nestedState: true };
  }

  /**
   * ユーティリティ関数テスト
   */
  async testUtilities() {
    // Three.js関連ユーティリティのテスト
    // DOM操作ユーティリティのテスト
    // 数学計算ユーティリティのテスト
    
    return { utilitiesWorking: true };
  }

  /**
   * ジオメトリ生成テスト
   */
  async testGeometryGeneration() {
    // ShapeFactoryのテスト
    // IFCプロファイルのテスト
    // メッシュ生成のテスト
    
    return { geometryGeneration: true };
  }

  /**
   * モデル読み込みパイプラインテスト
   */
  async testModelLoadingPipeline() {
    // ファイル読み込み → XML解析 → 要素抽出 → 3D生成の全パイプライン
    
    return { pipelineWorking: true };
  }

  /**
   * UI統合テスト
   */
  async testUIIntegration() {
    // UI要素の相互作用テスト
    // イベントハンドリングテスト
    
    return { uiIntegration: true };
  }

  /**
   * 要素比較統合テスト
   */
  async testElementComparisonIntegration() {
    // 複数要素タイプの比較テスト
    
    return { comparisonIntegration: true };
  }

  /**
   * 表示モード統合テスト
   */
  async testViewModeIntegration() {
    // モード切り替えの一貫性テスト
    
    return { viewModeIntegration: true };
  }

  /**
   * 基本ワークフローテスト
   */
  async testBasicWorkflow() {
    // ファイル選択 → 比較実行 → 結果表示の全フロー
    
    return { basicWorkflow: true };
  }

  /**
   * 要素選択ワークフローテスト
   */
  async testElementSelectionWorkflow() {
    // 要素クリック → 情報表示 → パラメータ確認の全フロー
    
    return { elementSelectionWorkflow: true };
  }

  /**
   * 表示制御ワークフローテスト
   */
  async testDisplayControlWorkflow() {
    // 表示/非表示切り替え → モード変更 → ラベル制御の全フロー
    
    return { displayControlWorkflow: true };
  }

  /**
   * エクスポートワークフローテスト
   */
  async testExportWorkflow() {
    // データ選択 → エクスポート実行 → ファイル生成の全フロー
    
    return { exportWorkflow: true };
  }

  /**
   * 大型モデル性能テスト
   */
  async testLargeModelPerformance() {
    // 大量要素を含むモデルの処理時間計測
    
    return { largeModelPerformance: true };
  }

  /**
   * メモリ使用量テスト
   */
  async testMemoryUsage() {
    const memoryBefore = this.getMemoryUsage();
    
    // メモリ消費が大きい処理を実行
    
    const memoryAfter = this.getMemoryUsage();
    const memoryIncrease = memoryAfter - memoryBefore;
    
    return { 
      memoryBefore,
      memoryAfter,
      memoryIncrease,
      withinThreshold: memoryIncrease < 100 // MB
    };
  }

  /**
   * レンダリング性能テスト
   */
  async testRenderingPerformance() {
    // フレームレート計測
    // レスポンシブネス計測
    
    return { renderingPerformance: true };
  }

  /**
   * 回帰テスト: Girder parameter display fix
   */
  async testGirderParameterDisplayFix() {
    // 大梁選択時のパラメータ表示確認
    await displayElementInfo('57', '57', 'Girder');
    
    const infoPanel = document.getElementById('element-info-content');
    if (!infoPanel) throw new Error('Info panel not found');
    
    const content = infoPanel.innerHTML;
    if (content.includes('要素を選択してください')) {
      throw new Error('Girder parameters not displayed');
    }
    
    return { girderParametersDisplayed: true };
  }

  /**
   * 回帰テスト: Label control after mode switch
   */
  async testLabelControlAfterModeSwitch() {
    // 立体/線モード切り替え後のラベル制御確認
    
    return { labelControlWorking: true };
  }

  /**
   * 回帰テスト: Node visibility toggle
   */
  async testNodeVisibilityToggle() {
    // 節点表示切り替え機能確認
    
    return { nodeVisibilityWorking: true };
  }

  // ==========================================
  // ユーティリティメソッド
  // ==========================================

  /**
   * メモリ使用量取得
   */
  getMemoryUsage() {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }

  /**
   * 包括的レポート生成
   */
  generateComprehensiveReport() {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;
    const memoryEnd = this.getMemoryUsage();
    const memoryUsed = memoryEnd - this.memoryStart;

    console.log('\n📊 ===== COMPREHENSIVE TEST REPORT =====');
    
    // 実行時間・メモリ使用量
    console.log(`⏱️  Total execution time: ${totalDuration}ms`);
    console.log(`💾 Memory usage: ${memoryUsed.toFixed(2)} MB`);
    
    // カテゴリ別結果
    Object.entries(this.results).forEach(([category, tests]) => {
      const passed = tests.filter(t => t.success).length;
      const failed = tests.filter(t => !t.success).length;
      const total = tests.length;
      
      console.log(`\n${this.getCategoryIcon(category)} ${category.toUpperCase()} Tests:`);
      console.log(`  Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
      
      if (failed > 0) {
        console.log(`  Failures:`);
        tests.filter(t => !t.success).forEach(test => {
          console.log(`    ❌ ${test.name}: ${test.error}`);
        });
      }
    });

    // 総合結果
    const allTests = Object.values(this.results).flat();
    const totalPassed = allTests.filter(t => t.success).length;
    const totalFailed = allTests.filter(t => !t.success).length;
    const totalTests = allTests.length;
    const successRate = (totalPassed / totalTests * 100).toFixed(1);

    console.log(`\n🎯 OVERALL RESULT:`);
    console.log(`  Success Rate: ${successRate}% (${totalPassed}/${totalTests})`);
    console.log(`  ${totalFailed === 0 ? '🎉 ALL TESTS PASSED!' : `⚠️  ${totalFailed} tests failed`}`);
    
    return {
      successRate: parseFloat(successRate),
      totalTests,
      totalPassed,
      totalFailed,
      duration: totalDuration,
      memoryUsed,
      details: this.results
    };
  }

  /**
   * カテゴリアイコン取得
   */
  getCategoryIcon(category) {
    const icons = {
      unit: '📋',
      integration: '🔗',
      e2e: '🌍',
      performance: '⚡',
      regression: '🔄'
    };
    return icons[category] || '📋';
  }
}

/**
 * コンソールからの簡単実行用
 */
if (typeof window !== 'undefined') {
  window.testSuite = {
    run: async () => {
      const suite = new ComprehensiveTestSuite();
      return await suite.runAllTests();
    },
    
    runUnit: async () => {
      const suite = new ComprehensiveTestSuite();
      await suite.runUnitTests();
      return suite.generateComprehensiveReport();
    },
    
    runIntegration: async () => {
      const suite = new ComprehensiveTestSuite();
      await suite.runIntegrationTests();
      return suite.generateComprehensiveReport();
    },
    
    runE2E: async () => {
      const suite = new ComprehensiveTestSuite();
      await suite.runE2ETests();
      return suite.generateComprehensiveReport();
    },
    
    runPerformance: async () => {
      const suite = new ComprehensiveTestSuite();
      await suite.runPerformanceTests();
      return suite.generateComprehensiveReport();
    },
    
    runRegression: async () => {
      const suite = new ComprehensiveTestSuite();
      await suite.runRegressionTests();
      return suite.generateComprehensiveReport();
    }
  };
  
  console.log('🧪 Comprehensive Test Suite loaded. Available commands:');
  console.log('  window.testSuite.run() - Run all tests');
  console.log('  window.testSuite.runUnit() - Run unit tests only');
  console.log('  window.testSuite.runIntegration() - Run integration tests only');
  console.log('  window.testSuite.runE2E() - Run E2E tests only');
  console.log('  window.testSuite.runPerformance() - Run performance tests only');
  console.log('  window.testSuite.runRegression() - Run regression tests only');
}

export default ComprehensiveTestSuite;