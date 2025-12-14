/**
 * @fileoverview ST-Bridge バリデーション・修復システム 使用例
 *
 * このファイルは、バリデーション・修復システムの使用方法を示します。
 */

// =============================================================================
// 使用例 1: 基本的なバリデーション
// =============================================================================

/**
 * ファイルを読み込んでバリデーションを実行
 */
async function example1BasicValidation() {
  const { validateStbDocument, formatValidationReport } = await import('./stbValidator.js');
  const { loadStbXmlAutoEncoding } = await import('../viewer/utils/utils.js');

  // ファイル選択イベントから取得したファイル
  const fileInput = document.querySelector('input[type="file"]');
  const file = fileInput.files[0];

  // ファイルを読み込み
  const xmlDoc = await loadStbXmlAutoEncoding(file);

  // バリデーション実行
  const report = validateStbDocument(xmlDoc, {
    validateReferences: true,  // 参照整合性チェック
    validateGeometry: true,    // 幾何学検証
    includeInfo: false        // 情報レベルの問題を除外
  });

  // 結果を表示
  console.log('Valid:', report.valid);
  console.log('Errors:', report.statistics.errorCount);
  console.log('Warnings:', report.statistics.warningCount);
  console.log('Repairable:', report.statistics.repairableCount);

  // 詳細レポートを表示
  console.log(formatValidationReport(report));

  return report;
}

// =============================================================================
// 使用例 2: 自動修復の実行
// =============================================================================

/**
 * バリデーション後に自動修復を実行
 */
async function example2AutoRepair() {
  const { validateStbDocument } = await import('./stbValidator.js');
  const { autoRepairDocument, formatRepairReport } = await import('../repair/stbRepairEngine.js');
  const { loadStbXmlAutoEncoding } = await import('../viewer/utils/utils.js');

  const file = document.querySelector('input[type="file"]').files[0];
  const xmlDoc = await loadStbXmlAutoEncoding(file);

  // バリデーション
  const validationReport = validateStbDocument(xmlDoc);

  if (validationReport.statistics.repairableCount === 0) {
    console.log('修復が必要な問題はありません');
    return;
  }

  // 自動修復を実行
  const { document: repairedDoc, report: repairReport } = autoRepairDocument(
    xmlDoc,
    validationReport,
    {
      removeInvalid: true,    // 修復不能な要素を削除
      useDefaults: true,      // デフォルト値を使用
      skipCategories: []     // スキップするカテゴリ
    }
  );

  console.log('修復完了:', repairReport.successCount, '件');
  console.log('削除された要素:', repairReport.removedElements.length);
  console.log(formatRepairReport(repairReport));

  return { repairedDoc, repairReport };
}

// =============================================================================
// 使用例 3: 完全なワークフロー
// =============================================================================

/**
 * 読み込みからエクスポートまでの完全なワークフロー
 */
async function example3CompleteWorkflow() {
  const { ValidationWorkflow, generateIntegratedReport } = await import('./validationWorkflow.js');

  const workflow = new ValidationWorkflow();

  // 状態変更を監視
  workflow.addListener(state => {
    console.log('Workflow step:', state.step);
  });

  const file = document.querySelector('input[type="file"]').files[0];

  // 1. ファイルを読み込んでバリデーション
  const validationReport = await workflow.loadAndValidate(file);
  console.log('バリデーション完了:', validationReport.valid ? '有効' : 'エラーあり');

  // 2. 修復が必要な場合は実行
  if (!validationReport.valid && validationReport.statistics.repairableCount > 0) {
    const repairReport = workflow.executeAutoRepair({
      removeInvalid: true,
      useDefaults: true
    });
    console.log('修復完了:', repairReport.successCount, '件');

    // 3. 修復後の再バリデーション
    const revalidation = workflow.revalidateRepaired();
    console.log('再バリデーション結果:', revalidation.valid ? '有効' : 'エラーあり');
  }

  // 4. エクスポート
  workflow.downloadRepairedFile('repaired_model.stb');

  // 統合レポートを生成
  const report = generateIntegratedReport(workflow);
  console.log(report);
}

// =============================================================================
// 使用例 4: UIパネルの使用
// =============================================================================

/**
 * バリデーションパネルUIを使用
 */
async function example4ValidationPanel() {
  const { ValidationPanel } = await import('../ui/validationPanel.js');
  const { ValidationWorkflow } = await import('./validationWorkflow.js');

  // パネルを作成
  const container = document.getElementById('validation-container');
  const panel = new ValidationPanel(container);

  // ワークフローを作成
  const workflow = new ValidationWorkflow();

  // ファイル選択イベント
  const fileInput = document.querySelector('input[type="file"]');
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // バリデーション実行
    const report = await workflow.loadAndValidate(file);

    // パネルに結果を表示
    panel.setValidationReport(report);
  });

  // 修復コールバックを設定
  panel.onRepair((options) => {
    const repairReport = workflow.executeAutoRepair(options);
    panel.setRepairReport(repairReport);

    // 再バリデーションして結果を更新
    const revalidation = workflow.revalidateRepaired();
    panel.setValidationReport(revalidation);
  });

  // エクスポートコールバックを設定
  panel.onExport(() => {
    const filename = prompt('ファイル名を入力:', 'validated.stb');
    if (filename) {
      workflow.downloadRepairedFile(filename);
    }
  });
}

// =============================================================================
// 使用例 5: プログラム的な使用
// =============================================================================

/**
 * プログラムから直接使用
 */
async function example5ProgrammaticUsage() {
  const { processStbFile, logValidationSummary } = await import('./index.js');

  const file = document.querySelector('input[type="file"]').files[0];

  // 一括処理
  const result = await processStbFile(file, {
    autoRepair: true,
    validateReferences: true,
    validateGeometry: true
  });

  // サマリーをログ出力
  logValidationSummary(result.validationReport);

  if (result.repairReport) {
    console.log('修復結果:', result.repairReport.successCount, '件');
  }

  // 修復済みXML文字列を取得
  console.log('XML長さ:', result.xmlString.length);
}

// =============================================================================
// 使用例 6: 特定の問題タイプをフィルター
// =============================================================================

/**
 * 特定のカテゴリまたは要素タイプの問題を抽出
 */
async function example6FilterIssues() {
  const {
    validateStbDocument,
    getIssuesByCategory,
    getIssuesByElementType,
    CATEGORY
  } = await import('./stbValidator.js');
  const { loadStbXmlAutoEncoding } = await import('../viewer/utils/utils.js');

  const file = document.querySelector('input[type="file"]').files[0];
  const xmlDoc = await loadStbXmlAutoEncoding(file);
  const report = validateStbDocument(xmlDoc);

  // 参照整合性の問題のみ
  const referenceIssues = getIssuesByCategory(report, CATEGORY.REFERENCE);
  console.log('参照問題:', referenceIssues.length);

  // 柱要素の問題のみ
  const columnIssues = getIssuesByElementType(report, 'StbColumn');
  console.log('柱の問題:', columnIssues.length);

  // 修復可能な問題のみ
  const repairableIssues = report.issues.filter(i => i.repairable);
  console.log('修復可能:', repairableIssues.length);
}

// =============================================================================
// 使用例 7: カスタム修復エンジンの使用
// =============================================================================

/**
 * StbRepairEngineを直接使用してカスタム修復
 */
async function example7CustomRepair() {
  const { StbRepairEngine } = await import('../repair/stbRepairEngine.js');
  const { validateStbDocument } = await import('./stbValidator.js');
  const { buildNodeMap } = await import('../parser/stbXmlParser.js');
  const { loadStbXmlAutoEncoding } = await import('../viewer/utils/utils.js');

  const file = document.querySelector('input[type="file"]').files[0];
  const xmlDoc = await loadStbXmlAutoEncoding(file);

  // 修復エンジンを作成
  const engine = new StbRepairEngine(xmlDoc);

  // ノードマップを構築
  const nodeMap = buildNodeMap(xmlDoc);

  // 無効な参照を持つ要素を削除
  const refResults = engine.removeInvalidReferences(nodeMap);
  console.log('無効参照の修復:', refResults.length);

  // 長さゼロの要素を削除
  const zeroResults = engine.removeZeroLengthElements(nodeMap);
  console.log('長さゼロ要素の修復:', zeroResults.length);

  // 特定の要素にデフォルト値を設定
  engine.setDefaultValue('StbNode', '123', 'Z', 0);

  // 修復レポートを取得
  const report = engine.generateReport();
  console.log('総修復数:', report.totalRepairs);

  // 修復済みドキュメントを取得
}

// =============================================================================
// HTMLでの使用例
// =============================================================================

/**
 * HTML内での使用例
 *
 * <div id="validation-container"></div>
 * <input type="file" id="stb-file" accept=".stb">
 *
 * <script type="module">
 *   import { createValidationPanel } from './stb-diff-viewer/js/ui/validationPanel.js';
 *   import { ValidationWorkflow } from './stb-diff-viewer/js/validation/validationWorkflow.js';
 *
 *   const panel = createValidationPanel('#validation-container');
 *   const workflow = new ValidationWorkflow();
 *
 *   document.getElementById('stb-file').addEventListener('change', async (e) => {
 *     const file = e.target.files[0];
 *     if (file) {
 *       const report = await workflow.loadAndValidate(file);
 *       panel.setValidationReport(report);
 *     }
 *   });
 *
 *   panel.onRepair((options) => {
 *     const repairReport = workflow.executeAutoRepair(options);
 *     panel.setRepairReport(repairReport);
 *   });
 *
 *   panel.onExport(() => {
 *     workflow.downloadRepairedFile('validated.stb');
 *   });
 * </script>
 */

export {
  example1BasicValidation,
  example2AutoRepair,
  example3CompleteWorkflow,
  example4ValidationPanel,
  example5ProgrammaticUsage,
  example6FilterIssues,
  example7CustomRepair
};
