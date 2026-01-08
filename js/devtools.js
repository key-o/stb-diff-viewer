/**
 * @fileoverview 開発者用ツール
 *
 * 本番では不要だが開発時に有用な機能をまとめたモジュール:
 * - STBサンプルデータの自動生成
 * - 要素選択テストの自動実行
 * - デバッグ用ユーティリティ
 * - パフォーマンス測定
 *
 * 使用方法: ブラウザコンソールで window.devtools.* を実行
 */

import { compareModels } from './modelLoader.js';
import { displayElementInfo } from './viewer/ui/element-info/index.js';
import { UI_TIMING } from './config/uiTimingConfig.js';
import { scheduleRender } from './utils/renderScheduler.js';

/**
 * 開発者用ツールクラス
 */
class DevTools {
  constructor() {
    this.startTime = null;
    this.memoryStart = null;
  }

  /**
   * 簡単なSTBサンプルデータを生成（テスト用）
   */
  generateMinimalSTBSample() {
    return `<?xml version="1.0" encoding="utf-8"?>
<StbModel xmlns="http://www.jsca.or.jp/stb" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <StbCommon app="STB Diff Viewer Test" version="2.0.2"/>
  <StbModel>
    <StbStories>
      <StbStory id="1" name="1F" height="3000"/>
      <StbStory id="2" name="2F" height="3000"/>
    </StbStories>
    <StbAxes>
      <StbX_axis id="X1" name="X1" distance="0"/>
      <StbX_axis id="X2" name="X2" distance="6000"/>
      <StbY_axis id="Y1" name="Y1" distance="0"/>
      <StbY_axis id="Y2" name="Y2" distance="6000"/>
    </StbAxes>
    <StbNodes>
      <StbNode id="N1" X="0" Y="0" Z="0"/>
      <StbNode id="N2" X="6000" Y="0" Z="0"/>
      <StbNode id="N3" X="6000" Y="6000" Z="0"/>
      <StbNode id="N4" X="0" Y="6000" Z="0"/>
      <StbNode id="N5" X="0" Y="0" Z="3000"/>
      <StbNode id="N6" X="6000" Y="0" Z="3000"/>
      <StbNode id="N7" X="6000" Y="6000" Z="3000"/>
      <StbNode id="N8" X="0" Y="6000" Z="3000"/>
    </StbNodes>
    <StbMembers>
      <StbColumns>
        <StbColumn id="C1" id_node_bottom="N1" id_node_top="N5" rotate="0" id_section="SC1"/>
        <StbColumn id="C2" id_node_bottom="N2" id_node_top="N6" rotate="0" id_section="SC1"/>
        <StbColumn id="C3" id_node_bottom="N3" id_node_top="N7" rotate="0" id_section="SC1"/>
        <StbColumn id="C4" id_node_bottom="N4" id_node_top="N8" rotate="0" id_section="SC1"/>
      </StbColumns>
      <StbGirders>
        <StbGirder id="G1" id_node_start="N5" id_node_end="N6" rotate="0" id_section="SG1"/>
        <StbGirder id="G2" id_node_start="N6" id_node_end="N7" rotate="0" id_section="SG1"/>
        <StbGirder id="G3" id_node_start="N7" id_node_end="N8" rotate="0" id_section="SG1"/>
        <StbGirder id="G4" id_node_start="N8" id_node_end="N5" rotate="0" id_section="SG1"/>
      </StbGirders>
      <StbBeams>
        <StbBeam id="B1" id_node_start="N5" id_node_end="N7" rotate="0" id_section="SB1"/>
        <StbBeam id="B2" id_node_start="N6" id_node_end="N8" rotate="0" id_section="SB1"/>
      </StbBeams>
    </StbMembers>
    <StbSections>
      <StbSecColumn id="SC1" name="C-300x300" kind="RC">
        <StbSecSteelColumn>
          <StbSecRcColumn D="300" B="300"/>
        </StbSecSteelColumn>
      </StbSecColumn>
      <StbSecGirder id="SG1" name="G-400x700" kind="RC">
        <StbSecRcGirder D="700" B="400"/>
      </StbSecGirder>
      <StbSecBeam id="SB1" name="B-300x500" kind="RC">
        <StbSecRcBeam D="500" B="300"/>
      </StbSecBeam>
    </StbSections>
  </StbModel>
</StbModel>`;
  }

  /**
   * サンプルSTBデータをロード
   */
  async loadSampleData(dataA, dataB = null) {
    try {
      const blobA = new Blob([dataA], { type: 'application/xml' });
      const blobB = new Blob([dataB || dataA], { type: 'application/xml' });

      const fileA = new File([blobA], 'sampleA.stb', {
        type: 'application/xml',
      });
      const fileB = new File([blobB], 'sampleB.stb', {
        type: 'application/xml',
      });

      const fileInputA = document.getElementById('fileA');
      const fileInputB = document.getElementById('fileB');

      if (fileInputA && fileInputB) {
        const dtA = new DataTransfer();
        dtA.items.add(fileA);
        fileInputA.files = dtA.files;

        const dtB = new DataTransfer();
        dtB.items.add(fileB);
        fileInputB.files = dtB.files;

        return true;
      } else {
        throw new Error('File input elements not found');
      }
    } catch (error) {
      console.error('❌ Error loading sample data:', error);
      return false;
    }
  }

  /**
   * 要素情報表示テスト
   */
  async testElementDisplay(elementType, idA, idB) {
    try {
      await displayElementInfo(idA, idB, elementType, 'matched');

      const infoPanel = document.getElementById('element-info-content');
      if (!infoPanel) {
        throw new Error('Element info panel not found');
      }

      const content = infoPanel.innerHTML;

      if (!content || content.includes('要素を選択してください')) {
        throw new Error('No element information displayed');
      }

      if (content.includes('エラー:') || content.includes('見つかりません')) {
        throw new Error('Error message displayed in element info');
      }

      return true;
    } catch (error) {
      console.error(`❌ ${elementType} display test failed:`, error);
      return false;
    }
  }

  /**
   * クイックテスト実行
   */
  async quickTest() {
    try {
      // 1. サンプルデータ生成・ロード
      const sampleData = this.generateMinimalSTBSample();
      const loadSuccess = await this.loadSampleData(sampleData);

      if (!loadSuccess) {
        throw new Error('Failed to load sample data');
      }

      // 2. モデル比較実行
      const success = await compareModels(scheduleRender);

      if (!success) {
        throw new Error('Model comparison failed');
      }

      // 少し待機してレンダリング完了（SSOT: uiTimingConfig.js）
      await new Promise((resolve) => setTimeout(resolve, UI_TIMING.DEVTOOLS_WAIT_MS));

      // 3. 要素選択テスト
      const testResults = [];

      const testCases = [
        { elementType: 'Column', idA: 'C1', idB: 'C1' },
        { elementType: 'Girder', idA: 'G1', idB: 'G1' },
        { elementType: 'Beam', idA: 'B1', idB: 'B1' },
      ];

      for (const testCase of testCases) {
        const result = await this.testElementDisplay(
          testCase.elementType,
          testCase.idA,
          testCase.idB,
        );
        testResults.push({ ...testCase, success: result });
      }

      // 結果サマリー
      const passed = testResults.filter((r) => r.success).length;
      const total = testResults.length;

      return {
        success: true,
        passed,
        total,
        results: testResults,
      };
    } catch (error) {
      console.error('❌ Quick test failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * パフォーマンス測定開始
   */
  startPerformanceMonitoring() {
    this.startTime = Date.now();
    this.memoryStart = this.getMemoryUsage();
  }

  /**
   * パフォーマンス測定終了
   */
  endPerformanceMonitoring() {
    if (!this.startTime) {
      console.warn('Performance monitoring not started');
      return null;
    }

    const endTime = Date.now();
    const memoryEnd = this.getMemoryUsage();

    const result = {
      duration: endTime - this.startTime,
      memoryUsed: memoryEnd - this.memoryStart,
      memoryStart: this.memoryStart,
      memoryEnd: memoryEnd,
    };

    this.startTime = null;
    this.memoryStart = null;

    return result;
  }

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
   * デバッグ情報出力
   */
  printDebugInfo() {}

  /**
   * 利用可能なコマンド一覧表示
   */
  showHelp() {}
}

// グローバルインスタンス
const devtools = new DevTools();

// デバッグ用にwindowに公開
if (typeof window !== 'undefined') {
  window.devtools = devtools;
}

export default devtools;
