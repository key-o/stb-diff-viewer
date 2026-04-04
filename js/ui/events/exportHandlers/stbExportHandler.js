/**
 * @fileoverview STBエクスポートハンドラー
 *
 * STBファイルのエクスポート機能を処理します。
 * 元のSTBファイルが利用可能な場合、バージョン変換ルール（12種類）を適用します。
 * IFC/SS7ソースの場合はDOMドキュメントのバージョン属性のみ更新します。
 *
 * @module ui/events/exportHandlers/stbExportHandler
 */

import { showSuccess, showError, showWarning } from '../../common/toast.js';
import { downloadBlob } from '../../../utils/downloadHelper.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ui:events:exportHandlers:stbExportHandler');

/**
 * バージョン文字列を正規化
 * @param {string} version - バージョン文字列
 * @returns {string} 正規化されたバージョン
 */
function normalizeVersion(version) {
  const v = version.toLowerCase().replace(/^v/, '');
  if (v === '202' || v === '2.0' || v.startsWith('2.0.')) return '2.0.2';
  if (v === '210' || v === '2.1' || v.startsWith('2.1.')) return '2.1.0';
  return v;
}

/**
 * Setup STB export button listener
 */
export function setupStbExportListener() {
  const exportStbBtn = document.getElementById('exportStbBtn');

  if (exportStbBtn) {
    exportStbBtn.addEventListener('click', handleStbExport);
  }
}

/**
 * Handle STB export button click
 */
async function handleStbExport() {
  const exportStbBtn = document.getElementById('exportStbBtn');
  const versionSelect = document.getElementById('stbExportVersion');
  const targetSelect = document.getElementById('stbExportTarget');
  const filenameInput = document.getElementById('stbExportFilename');

  try {
    if (exportStbBtn) {
      exportStbBtn.disabled = true;
      exportStbBtn.textContent = '⏳ 出力中...';
    }

    const targetVersion = versionSelect?.value || '2.1.0';
    const targetModel = targetSelect?.value || 'auto';

    const { getState } = await import('../../../app/globalState.js');
    const { exportStbDocument } = await import('../../../export/stb/stbExporter.js');

    const docA = getState('models.documentA');
    const docB = getState('models.documentB');
    const fileA = getState('files.originalFileA');
    const fileB = getState('files.originalFileB');

    let sourceDoc = null;
    let sourceFile = null;

    if (targetModel === 'A') {
      sourceDoc = docA;
      sourceFile = fileA;
    } else if (targetModel === 'B') {
      sourceDoc = docB;
      sourceFile = fileB;
    } else {
      sourceDoc = docB || docA;
      sourceFile = fileB || fileA;
    }

    if (!sourceDoc) {
      showWarning('出力するモデルが読み込まれていません。');
      return;
    }

    let filename = filenameInput?.value?.trim();
    if (!filename) {
      if (sourceFile?.name) {
        filename = sourceFile.name.replace(/\.stb$/i, '');
      } else {
        filename = 'stb_export';
      }
    }

    filename = filename.endsWith('.stb') ? filename : `${filename}.stb`;

    // 元のSTBファイルが利用可能な場合、バージョン変換ルールを適用
    const isStbSource = sourceFile && /\.(stb|xml)$/i.test(sourceFile.name);
    if (isStbSource) {
      const { convert, detectVersion } = await import('../../../common-stb/converter/index.js');
      const xmlContent = await sourceFile.text();
      const currentVersion = await detectVersion(xmlContent);

      if (currentVersion && normalizeVersion(currentVersion) !== normalizeVersion(targetVersion)) {
        const result = await convert(xmlContent, targetVersion);
        if (result.converted) {
          const blob = new Blob([result.xml], { type: 'application/xml' });
          downloadBlob(blob, filename);
          const warnCount = result.summary?.warnings || 0;
          const msg =
            warnCount > 0
              ? `変換して出力しました: ${filename} (警告: ${warnCount}件)`
              : `変換して出力しました: ${filename}`;
          showSuccess(msg);
          log.info('[STB Export] Converted and exported:', {
            sourceVersion: result.sourceVersion,
            targetVersion: result.targetVersion,
            filename,
            warnings: warnCount,
          });
          return;
        }
      }
    }

    // IFC/SS7ソースまたは同バージョンの場合はDOM経由で出力
    const { validateJsonSchema } =
      await import('../../../common-stb/validation/jsonSchemaValidator.js');
    const schemaIssues = validateJsonSchema(sourceDoc, {
      version: normalizeVersion(targetVersion),
    });
    const schemaErrors = schemaIssues.filter((i) => i.severity === 'error');
    if (schemaErrors.length > 0) {
      log.warn(
        '[STB Export] スキーマ違反が検出されました:',
        schemaErrors.map((e) => e.message),
      );
      showWarning(`スキーマ違反 ${schemaErrors.length} 件が検出されました（出力は続行します）`);
    }

    exportStbDocument(sourceDoc, { filename, targetVersion });
    showSuccess(`出力しました: ${filename}`);
  } catch (error) {
    log.error('STB出力エラー:', error);
    showError(`STB出力に失敗しました: ${error.message}`);
  } finally {
    if (exportStbBtn) {
      exportStbBtn.disabled = false;
      exportStbBtn.textContent = '📦 STBファイルを出力';
    }
  }
}
