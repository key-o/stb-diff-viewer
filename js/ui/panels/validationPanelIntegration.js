/**
 * @fileoverview ST-Bridgeバリデーションパネルの実行配線
 */

import { createLogger } from '../../utils/logger.js';
import { UI_TIMING } from '../../config/uiTimingConfig.js';
import { createValidationPanel } from './validationPanel.js';
import { sharedManager } from '../../common-stb/validation/validationManager.js';
import { getState } from '../../app/globalState.js';
import { notify } from '../../app/controllers/notificationController.js';

const log = createLogger('ui:validationPanelIntegration');

let validationPanelInstance = null;
let delayedValidationTimerId = null;
let delayedValidationHandle = null;
let delayedHandleUsesTimeout = false;

const ELEMENT_INFO_VALIDATION_OPTIONS = {
  validateReferences: true,
  validateGeometry: false,
  includeInfo: false,
};

function clearScheduledValidation() {
  if (delayedValidationTimerId !== null) {
    clearTimeout(delayedValidationTimerId);
    delayedValidationTimerId = null;
  }

  if (delayedValidationHandle !== null) {
    if (
      !delayedHandleUsesTimeout &&
      typeof window !== 'undefined' &&
      typeof window.cancelIdleCallback === 'function'
    ) {
      window.cancelIdleCallback(delayedValidationHandle);
    } else {
      clearTimeout(delayedValidationHandle);
    }
    delayedValidationHandle = null;
    delayedHandleUsesTimeout = false;
  }
}

function resolveTargetModel(targetModel = 'auto') {
  const documentA = getState('models.documentA');
  const documentB = getState('models.documentB');
  const fileA = getState('files.originalFileA');
  const fileB = getState('files.originalFileB');

  if (targetModel === 'A') {
    return {
      document: documentA,
      modelLabel: 'モデルA',
      baseFilename: fileA?.name || 'modelA',
      modelSource: 'A',
    };
  }

  if (targetModel === 'B') {
    return {
      document: documentB,
      modelLabel: 'モデルB',
      baseFilename: fileB?.name || 'modelB',
      modelSource: 'B',
    };
  }

  if (documentA) {
    return {
      document: documentA,
      modelLabel: 'モデルA',
      baseFilename: fileA?.name || 'modelA',
      modelSource: 'A',
    };
  }

  return {
    document: documentB,
    modelLabel: 'モデルB',
    baseFilename: fileB?.name || 'modelB',
    modelSource: 'B',
  };
}

function buildExportFilename(baseFilename) {
  const stem = String(baseFilename || 'validated')
    .replace(/\.stb$/i, '')
    .replace(/\.xml$/i, '')
    .trim();
  return `${stem || 'validated'}_validated.stb`;
}

function runValidation(panel, request, executionOptions = {}) {
  clearScheduledValidation();

  const { suppressNotification = false } = executionOptions;
  const { targetModel, options } = request;
  const target = resolveTargetModel(targetModel);

  if (!target.document) {
    notify.warning('検証対象モデルが読み込まれていません。');
    return null;
  }

  try {
    const report = sharedManager.validateDocument(
      target.document,
      options || {},
      target.modelSource,
    );
    panel.setRepairReport(null);
    panel.setValidationReport(report);

    if (!suppressNotification) {
      notify.info(
        `${target.modelLabel}の検証完了: エラー ${report.statistics.errorCount}件, 警告 ${report.statistics.warningCount}件`,
      );
    }

    return report;
  } catch (error) {
    log.error('Validation failed:', error);
    notify.error(`検証に失敗しました: ${error.message}`);
    return null;
  }
}

function runImmediateElementInfoValidation(documentA, documentB) {
  sharedManager.clearIntegration();

  if (documentA) {
    sharedManager.validateDocument(documentA, ELEMENT_INFO_VALIDATION_OPTIONS, 'A');
  }

  if (documentB) {
    sharedManager.validateDocument(documentB, ELEMENT_INFO_VALIDATION_OPTIONS, 'B');
  }
}

function refreshCurrentElementInfoPanel() {
  return import('./element-info/index.js')
    .then(({ refreshElementInfoPanel }) => {
      if (typeof refreshElementInfoPanel === 'function') {
        refreshElementInfoPanel();
      }
    })
    .catch((error) => {
      log.debug('Element info refresh skipped:', error);
    });
}

function schedulePanelValidation() {
  if (!validationPanelInstance) {
    return;
  }

  clearScheduledValidation();
  validationPanelInstance.clear();

  delayedValidationTimerId = setTimeout(() => {
    delayedValidationTimerId = null;

    const executeValidation = () => {
      delayedValidationHandle = null;
      delayedHandleUsesTimeout = false;

      const request = validationPanelInstance.getValidationRequest();
      const report = runValidation(validationPanelInstance, request, {
        suppressNotification: true,
      });

      if (report) {
        void refreshCurrentElementInfoPanel();
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      delayedValidationHandle = window.requestIdleCallback(executeValidation, {
        timeout: UI_TIMING.VALIDATION_PANEL_IDLE_TIMEOUT_MS,
      });
      delayedHandleUsesTimeout = false;
      return;
    }

    delayedValidationHandle = setTimeout(executeValidation, 0);
    delayedHandleUsesTimeout = true;
  }, UI_TIMING.VALIDATION_PANEL_AUTO_RUN_DELAY_MS);
}

/**
 * モデルロード後のバリデーションを実行
 * - 要素情報パネル向け: 読み込み直後に実行
 * - STBバリデーションパネル向け: UIブロック回避のため遅延実行
 *
 * @param {Object} [models]
 * @param {Document|null} [models.documentA]
 * @param {Document|null} [models.documentB]
 */
export function runPostLoadValidations(models = {}) {
  const documentA = models.documentA ?? getState('models.documentA');
  const documentB = models.documentB ?? getState('models.documentB');

  clearScheduledValidation();

  if (!documentA && !documentB) {
    return;
  }

  try {
    runImmediateElementInfoValidation(documentA, documentB);
    void refreshCurrentElementInfoPanel();
  } catch (error) {
    log.warn('Failed to run immediate validation for element info:', error);
  }

  schedulePanelValidation();
}

function runRepair(panel, options) {
  try {
    const repairReport = sharedManager.executeAutoRepair(options || {});
    panel.setRepairReport(repairReport);

    const revalidation = sharedManager.revalidateRepaired();
    panel.setValidationReport(revalidation);

    notify.success(
      `自動修復を実行しました: ${repairReport.successCount}/${repairReport.totalRepairs}件`,
    );
  } catch (error) {
    log.error('Repair failed:', error);
    notify.error(`自動修復に失敗しました: ${error.message}`);
  }
}

function runExport(panel) {
  try {
    const { targetModel } = panel.getValidationRequest();
    const target = resolveTargetModel(targetModel);
    const filename = buildExportFilename(target.baseFilename);

    sharedManager.downloadRepairedFile(filename, { format: true });
    notify.success(`検証済みファイルを出力しました: ${filename}`);
  } catch (error) {
    log.error('Export failed:', error);
    notify.error(`エクスポートに失敗しました: ${error.message}`);
  }
}

/**
 * バリデーションパネルを初期化
 * @returns {import('./validationPanel.js').ValidationPanel|null}
 */
export function initializeValidationPanel() {
  if (validationPanelInstance) {
    return validationPanelInstance;
  }

  const container = document.getElementById('validation-panel-container');
  if (!container) {
    log.warn('Validation panel container not found');
    return null;
  }

  validationPanelInstance = createValidationPanel(container);
  validationPanelInstance.onValidate((request) => runValidation(validationPanelInstance, request));
  validationPanelInstance.onRepair((options) => runRepair(validationPanelInstance, options));
  validationPanelInstance.onExport(() => runExport(validationPanelInstance));

  return validationPanelInstance;
}

export function getValidationPanelInstance() {
  return validationPanelInstance;
}
