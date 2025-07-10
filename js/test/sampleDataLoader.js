/**
 * @fileoverview サンプルデータローダー
 *
 * STBサンプルデータの自動ロードとテスト実行を簡素化します
 */

import testRunner from './testRunner.js';

/**
 * サンプルSTBデータをロードしてテストを実行
 * @param {string} sampleDataA - モデルAのSTBデータ（XML文字列）
 * @param {string} sampleDataB - モデルBのSTBデータ（XML文字列） 
 */
export async function loadAndTestSampleData(sampleDataA, sampleDataB = null) {
  console.log("🚀 Starting automatic STB data test...");
  
  try {
    // サンプルBが提供されていない場合はAを複製
    const dataB = sampleDataB || sampleDataA;
    
    // 1. サンプルデータをロード
    console.log("📁 Loading sample data...");
    const loadSuccess = await testRunner.loadSampleData(sampleDataA, dataB);
    
    if (!loadSuccess) {
      throw new Error("Failed to load sample data");
    }
    
    // 2. モデル比較テストを実行
    console.log("🔄 Running model comparison...");
    await testRunner.runComparisonTest();
    
    // 少し待機してレンダリングを完了
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. 要素選択テストを実行
    console.log("🎯 Running element selection tests...");
    await testRunner.runFullElementTest();
    
    // 4. レポート生成
    console.log("📊 Generating test report...");
    const report = testRunner.logReport();
    
    return report;
    
  } catch (error) {
    console.error("❌ Test execution failed:", error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 文字列からSTBデータをロード（開発・デバッグ用）
 */
export async function loadSampleFromString(xmlString) {
  return await loadAndTestSampleData(xmlString);
}

/**
 * ファイルからSTBデータをロード
 */
export async function loadSampleFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const xmlContent = e.target.result;
        const report = await loadAndTestSampleData(xmlContent);
        resolve(report);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsText(file);
  });
}

/**
 * URLからSTBデータをロード
 */
export async function loadSampleFromUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xmlContent = await response.text();
    return await loadAndTestSampleData(xmlContent);
    
  } catch (error) {
    console.error("Failed to load sample from URL:", error);
    throw error;
  }
}

/**
 * 簡単なSTBサンプルデータを生成（テスト用）
 */
export function generateMinimalSTBSample() {
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
 * テスト用のコンソールコマンドを設定
 */
if (typeof window !== 'undefined') {
  window.stbTest = {
    loadString: loadSampleFromString,
    loadFile: loadSampleFromFile,
    loadUrl: loadSampleFromUrl,
    generateSample: generateMinimalSTBSample,
    runMinimalTest: async () => {
      const sample = generateMinimalSTBSample();
      return await loadSampleFromString(sample);
    }
  };
  
  console.log("🧪 STB Test utilities loaded. Available commands:");
  console.log("  window.stbTest.runMinimalTest() - Run test with minimal sample");
  console.log("  window.stbTest.loadString(xmlString) - Load from XML string");
  console.log("  window.stbTest.generateSample() - Generate minimal sample XML");
}