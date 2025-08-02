/**
 * @fileoverview ブラウザコンソールでの手動テスト用ヘルパー
 *
 * 開発サーバー起動後、ブラウザコンソールで新エンジンの動作確認を行うための
 * ユーティリティ関数を提供します。
 */

/**
 * テスト用のモックXMLドキュメントを作成
 * @returns {Document} モックXMLドキュメント
 */
function createTestXMLDocument() {
  const xmlString = `
    <StbModel>
      <StbSections>
        <StbSecColumn_S id="1" name="C1">
          <StbSecSteelFigureColumn_S>
            <StbSecColumn_S_Straight shape="H-400x200x8x13"/>
          </StbSecSteelFigureColumn_S>
        </StbSecColumn_S>
        <StbSecBeam_S id="2" name="G6">
          <StbSecSteelFigureBeam_S>
            <StbSecBeam_S_Straight shape="H-200x80x7.5x11"/>
          </StbSecSteelFigureBeam_S>
        </StbSecBeam_S>
        <StbSecBrace_S id="3" name="B1">
          <StbSecSteelFigureBrace_S>
            <StbSecBrace_S_Straight shape="H-100x50x5x7"/>
          </StbSecSteelFigureBrace_S>
        </StbSecBrace_S>
      </StbSections>
    </StbModel>
  `;
  return new DOMParser().parseFromString(xmlString, "text/xml");
}

// デバッグモード判定
const isDebugMode = () =>
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.search.includes("debug=true");

// 条件付きログ関数
const debugLog = (...args) => isDebugMode() && console.log(...args);
const debugWarn = (...args) => isDebugMode() && console.warn(...args);
const debugError = (...args) => console.error(...args); // エラーは常に表示

/**
 * 新エンジンの基本動作テスト
 */
async function testNewEngine() {
  try {
    debugLog("🧪 新統一エンジンテスト開始...");

    // 新エンジンをインポート
    const { extractAllSections } = await import(
      "./js/parser/sectionExtractor.js"
    );

    // テストデータで動作確認
    const testDoc = createTestXMLDocument();
    const result = extractAllSections(testDoc);

    console.log("✅ 新エンジン結果:", result);
    console.log(`   Column: ${result.columnSections.size}件`);
    console.log(`   Beam: ${result.beamSections.size}件`);
    console.log(`   Brace: ${result.braceSections.size}件`);

    // 詳細データ確認
    const columnSection = result.columnSections.get("1");
    const beamSection = result.beamSections.get("2");
    const braceSection = result.braceSections.get("3");

    console.log("📊 詳細データ:");
    console.log("   Column:", columnSection);
    console.log("   Beam:", beamSection);
    console.log("   Brace:", braceSection);

    return { success: true, result };
  } catch (error) {
    console.error("❌ 新エンジンテストエラー:", error);
    return { success: false, error };
  }
}

/**
 * 既存システムとの比較テスト（実際のSTBファイルが読み込まれている場合）
 */
async function compareWithExistingSystem() {
  try {
    if (!window.docA) {
      console.warn("⚠️ 比較テストにはSTBファイルの読み込みが必要です");
      return { success: false, message: "No STB document loaded" };
    }

    console.log("🔍 既存システムとの比較テスト開始...");

    // 新エンジンをインポート
    const { extractAllSections } = await import(
      "./js/parser/sectionExtractor.js"
    );

    // 新エンジンで抽出
    const newResult = extractAllSections(window.docA);

    console.log("✅ 新エンジン結果:");
    console.log(`   Column: ${newResult.columnSections.size}件`);
    console.log(`   Beam: ${newResult.beamSections.size}件`);
    console.log(`   Brace: ${newResult.braceSections.size}件`);

    // パフォーマンス測定
    const startTime = performance.now();
    extractAllSections(window.docA);
    const endTime = performance.now();

    console.log(`⚡ 処理時間: ${(endTime - startTime).toFixed(2)}ms`);

    return { success: true, newResult, processingTime: endTime - startTime };
  } catch (error) {
    console.error("❌ 比較テストエラー:", error);
    return { success: false, error };
  }
}

/**
 * 設定の妥当性確認
 */
async function validateConfiguration() {
  try {
    console.log("🔧 設定妥当性チェック開始...");

    const { validateSectionConfig } = await import(
      "./js/config/sectionConfig.js"
    );
    const errors = validateSectionConfig();

    if (errors.length === 0) {
      console.log("✅ 設定は正常です");
    } else {
      console.warn("⚠️ 設定エラー:", errors);
    }

    return { success: true, errors };
  } catch (error) {
    console.error("❌ 設定チェックエラー:", error);
    return { success: false, error };
  }
}

/**
 * 包括的なテストスイート実行
 */
async function runComprehensiveTest() {
  console.log("🚀 包括的テストスイート開始...");
  console.log("==========================================");

  const results = {};

  // 1. 設定妥当性チェック
  results.configValidation = await validateConfiguration();

  // 2. 新エンジン基本テスト
  results.newEngineTest = await testNewEngine();

  // 3. 既存システム比較テスト
  results.comparisonTest = await compareWithExistingSystem();

  console.log("==========================================");
  console.log("📋 テスト結果サマリー:");
  console.log(
    `   設定妥当性: ${results.configValidation.success ? "✅ OK" : "❌ NG"}`
  );
  console.log(
    `   新エンジン: ${results.newEngineTest.success ? "✅ OK" : "❌ NG"}`
  );
  console.log(
    `   比較テスト: ${results.comparisonTest.success ? "✅ OK" : "⚠️ SKIP"}`
  );

  return results;
}

// グローバルに登録してブラウザコンソールから呼び出し可能に
window.sectionExtractorTest = {
  testNewEngine,
  compareWithExistingSystem,
  validateConfiguration,
  runComprehensiveTest,
  createTestXMLDocument,
};

console.log("🧪 断面抽出テストヘルパーが準備完了しました");
console.log("   使用方法: sectionExtractorTest.runComprehensiveTest()");
console.log("   個別テスト: sectionExtractorTest.testNewEngine()");
console.log("   比較テスト: sectionExtractorTest.compareWithExistingSystem()");
