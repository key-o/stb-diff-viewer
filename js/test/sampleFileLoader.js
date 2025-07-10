/**
 * @fileoverview サンプルファイル自動ローダー
 *
 * sampleStbフォルダのSTBファイルを自動的にロードしてテストします
 */

import { loadAndTestSampleData } from './sampleDataLoader.js';

/**
 * 利用可能なサンプルファイル一覧
 */
const SAMPLE_FILES = [
  'RC+S_testmodel_3.stb',
  'RCサンプルv202_20250618.stb', 
  'Sサンプルv202_20250618.stb',
  'S梁全パターン_SS7.stb',
  '【構造システム_20250513】S造断面データ.stb'
];

/**
 * サンプルファイルをロードしてテスト実行
 * @param {string} fileName - ファイル名
 * @param {string} [compareFileName] - 比較用ファイル名（省略時は同じファイル）
 */
export async function loadSampleFile(fileName, compareFileName = null) {
  console.log(`📁 Loading sample file: ${fileName}`);
  
  try {
    // ファイルパスを構築
    const filePathA = `sampleStb/${fileName}`;
    const filePathB = compareFileName ? `sampleStb/${compareFileName}` : filePathA;
    
    // ファイル内容を取得
    const [dataA, dataB] = await Promise.all([
      fetchFileContent(filePathA),
      fetchFileContent(filePathB)
    ]);
    
    console.log(`✅ Files loaded successfully`);
    console.log(`  Model A: ${fileName} (${dataA.length} characters)`);
    console.log(`  Model B: ${compareFileName || fileName} (${dataB.length} characters)`);
    
    // テスト実行
    const report = await loadAndTestSampleData(dataA, dataB);
    
    // ファイル情報をレポートに追加
    report.sampleFiles = {
      modelA: fileName,
      modelB: compareFileName || fileName,
      sizesKB: {
        modelA: Math.round(dataA.length / 1024),
        modelB: Math.round(dataB.length / 1024)
      }
    };
    
    return report;
    
  } catch (error) {
    console.error(`❌ Failed to load sample file ${fileName}:`, error);
    throw error;
  }
}

/**
 * ファイル内容を取得（相対パスで）
 */
async function fetchFileContent(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Failed to fetch ${filePath}:`, error);
    throw new Error(`Failed to load file: ${filePath}`);
  }
}

/**
 * 全サンプルファイルでテスト実行
 */
export async function testAllSampleFiles() {
  console.log("🚀 Testing all sample files...");
  
  const results = [];
  
  for (const fileName of SAMPLE_FILES) {
    try {
      console.log(`\n--- Testing ${fileName} ---`);
      const report = await loadSampleFile(fileName);
      results.push({
        fileName,
        success: true,
        report
      });
      
      // 各テスト間に少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Failed to test ${fileName}:`, error);
      results.push({
        fileName,
        success: false,
        error: error.message
      });
    }
  }
  
  // 総合レポート
  console.log("\n📊 === COMPREHENSIVE TEST REPORT ===");
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total files tested: ${results.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  
  // 詳細結果
  results.forEach(result => {
    const icon = result.success ? "✅" : "❌";
    console.log(`${icon} ${result.fileName}`);
    
    if (result.success && result.report) {
      const { passed = 0, failed = 0, warnings = 0 } = result.report;
      console.log(`    Tests: ${passed} passed, ${failed} failed, ${warnings} warnings`);
    } else if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
  });
  
  return results;
}

/**
 * 特定の大梁問題に焦点を当てたテスト
 */
export async function testGirderIssue() {
  console.log("🎯 Testing Girder parameter display issue...");
  
  // RC+S_testmodel_3.stbは大梁データが豊富
  const fileName = 'RC+S_testmodel_3.stb';
  
  try {
    const report = await loadSampleFile(fileName);
    
    // 大梁関連のテスト結果を詳細分析
    const girderTests = report.details?.filter(test => 
      test.name.includes('Girder') || test.elementType === 'Girder'
    ) || [];
    
    console.log(`\n🔍 Girder Test Analysis:`);
    console.log(`  Total Girder tests: ${girderTests.length}`);
    
    girderTests.forEach(test => {
      const icon = test.success ? "✅" : "❌";
      console.log(`  ${icon} ${test.name}`);
      
      if (test.errors?.length > 0) {
        console.log(`    Errors:`, test.errors);
      }
      if (test.warnings?.length > 0) {
        console.log(`    Warnings:`, test.warnings);
      }
    });
    
    return {
      fileName,
      girderTests,
      overall: report
    };
    
  } catch (error) {
    console.error("❌ Girder test failed:", error);
    throw error;
  }
}

/**
 * コンソールからの簡単操作用
 */
if (typeof window !== 'undefined') {
  window.stbSamples = {
    list: () => {
      console.log("📁 Available sample files:");
      SAMPLE_FILES.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file}`);
      });
    },
    
    test: (fileName) => loadSampleFile(fileName),
    
    testAll: () => testAllSampleFiles(),
    
    testGirder: () => testGirderIssue(),
    
    // ショートカット
    quick: () => loadSampleFile('RC+S_testmodel_3.stb'),
    
    // 大梁パターンテスト
    beamPatterns: () => loadSampleFile('S梁全パターン_SS7.stb')
  };
  
  console.log("🧪 Sample file testing loaded. Available commands:");
  console.log("  window.stbSamples.list() - Show available files");
  console.log("  window.stbSamples.quick() - Quick test with RC+S_testmodel_3.stb");
  console.log("  window.stbSamples.testGirder() - Focus on Girder issue");
  console.log("  window.stbSamples.testAll() - Test all sample files");
  console.log("  window.stbSamples.beamPatterns() - Test beam patterns");
}