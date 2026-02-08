/**
 * @fileoverview 統合システムの初期化（重要度、アウトライン、差分）
 */

import { createLogger } from '../../utils/logger.js';
import { setState } from '../globalState.js';
import { initializeImportancePanel } from '../../ui/panels/importancePanel.js';
import { initializeImportanceFilterSystem } from '../../ui/panels/importanceFilter.js';
import { initializeImportanceStatistics } from '../../ui/panels/statistics.js';
import { initializeBulkImportanceOperations } from '../../ui/panels/bulkImportanceOperations.js';
import { initializeDiffListPanel } from '../../ui/panels/diffList.js';
import {
  initializeDiffStatusFilterSystem,
  globalDiffStatusFilter,
} from '../../ui/panels/diffStatusFilter.js';
import { initializeDiffStatusPanel } from '../../ui/panels/diffStatusPanel.js';
import { eventBus } from '../events/eventBus.js';
import { EventTypes } from '../events/eventTypes.js';
import { getState } from '../globalState.js';
import { buildMemberDataFromDocument, updateLoadCaseSelector } from './initializationUtils.js';
import { initializeOutlineSystem, getLoadDisplayManager } from '../../viewer/index.js';

const log = createLogger('systemInitializer');

/**
 * 統合システムを初期化（重要度、アウトライン、差分）
 */
export function initializeIntegratedSystems() {
  // 重要度統合機能の初期化
  initializeImportancePanel(document.body);

  // 重要度関連システムの初期化
  const { filter, indicator } = initializeImportanceFilterSystem(document.body);
  const statistics = initializeImportanceStatistics(document.body);
  const bulkOperations = initializeBulkImportanceOperations(document.body);

  // アウトラインシステム初期化
  initializeOutlineSystem();

  // 差分一覧パネルの初期化
  const diffListPanel = initializeDiffListPanel(document.body);

  // 差分ステータスフィルタシステムの初期化
  const diffStatusFilterSystem = initializeDiffStatusFilterSystem();
  const diffStatusPanel = initializeDiffStatusPanel();

  // グローバル状態に登録
  setState('importanceSystem.filter', filter);
  setState('importanceSystem.statistics', statistics);
  setState('importanceSystem.bulkOperations', bulkOperations);
  setState('importanceSystem.filterIndicator', indicator);
  setState('diffListPanel', diffListPanel);
  setState('diffStatusFilter', diffStatusFilterSystem.filter);
  setState('diffStatusPanel', diffStatusPanel);

  log.info('重要度統合システムが初期化されました');
  log.info('差分ステータスフィルタが初期化されました');

  // テスト用グローバル関数
  window.toggleImportanceStatistics = () => statistics.toggle();
  window.toggleBulkOperations = () => bulkOperations.toggle();
  window.toggleImportanceFilter = () => filter.setEnabled(!filter.isEnabled);
  window.toggleDiffList = () => diffListPanel.toggle();
  window.toggleDiffStatusPanel = () => diffStatusPanel.toggle();
  window.diffStatusFilter = globalDiffStatusFilter; // デバッグ用
}

/**
 * 荷重表示のイベントリスナーをセットアップ
 */
export function setupLoadDisplayEventListeners() {
  // 比較完了イベントをリスンして荷重データを設定
  eventBus.on(EventTypes.Comparison.COMPLETED, () => {
    updateLoadDisplayData();
  });

  log.info('荷重表示イベントリスナーをセットアップしました');
}

/**
 * 荷重表示データを更新
 * @private
 */
function updateLoadDisplayData() {
  try {
    const loadManager = getLoadDisplayManager();
    if (!loadManager) {
      log.warn('LoadDisplayManagerが初期化されていません');
      return;
    }

    // グローバル状態から荷重データを取得
    const calDataA = getState('models.calDataA');
    const calDataB = getState('models.calDataB');
    const nodeMapA = getState('models.nodeMapA');
    const nodeMapB = getState('models.nodeMapB');
    const documentA = getState('models.documentA');
    const documentB = getState('models.documentB');

    // 荷重データがある方を使用（優先：モデルA）
    const calData = calDataA || calDataB;
    const nodeMap = calDataA ? nodeMapA : nodeMapB;
    const modelDocument = calDataA ? documentA : documentB;

    // デバッグ情報を出力
    log.debug('荷重データ取得:', {
      hasCalDataA: !!calDataA,
      hasCalDataB: !!calDataB,
      loadCasesA: calDataA?.loadCases?.length || 0,
      loadCasesB: calDataB?.loadCases?.length || 0,
      memberLoadsA: calDataA?.memberLoads?.length || 0,
      memberLoadsB: calDataB?.memberLoads?.length || 0,
    });

    if (!calData) {
      log.warn('荷重データ（StbCalData）がSTBファイルに含まれていません');
      log.info('STBファイルに<StbCalData>セクションがあることを確認してください');
      // 荷重ケースセレクターをリセット
      updateLoadCaseSelector([]);
      return;
    }

    // 部材データを構築
    const memberData = buildMemberDataFromDocument(modelDocument);

    // LoadDisplayManagerにデータを設定
    loadManager.setData(calData, nodeMap, memberData);

    // モデルバウンドからスケールを自動計算
    import('../../viewer/utils/utils.js').then(({ getModelBounds }) => {
      const bounds = getModelBounds();
      if (bounds && !bounds.isEmpty()) {
        loadManager.computeAutoScale(bounds);
      }
    });

    // 荷重ケースセレクターを更新
    updateLoadCaseSelector(calData.loadCases || []);

    log.info(
      `荷重データを設定しました: ${calData.memberLoads?.length || 0}部材荷重, ${calData.loadCases?.length || 0}荷重ケース`,
    );
  } catch (error) {
    log.error('荷重データの更新でエラーが発生しました:', error);
  }
}
