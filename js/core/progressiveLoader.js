/**
 * @fileoverview 段階的ローディングモジュール
 *
 * モデルの読み込みと処理を段階的に実行し、
 * ユーザー体験を向上させます。
 */

/**
 * 要素タイプの処理優先度定義
 * 数値が小さいほど優先的に処理される
 */
export const ELEMENT_PRIORITY = {
  // Phase 1: 構造要素（最優先）
  StbColumn: 1,
  StbPost: 1,
  StbGirder: 2,
  StbBeam: 2,

  // Phase 2: 面要素
  StbSlab: 3,
  StbWall: 3,

  // Phase 3: 基礎要素
  StbFooting: 4,
  StbPile: 4,
  StbFoundationColumn: 4,

  // Phase 4: 補助要素
  StbBrace: 5,
  StbOpening: 6,

  // Phase 5: 参照情報（最後）
  StbNode: 7,
  axes: 8,
  stories: 8
};

/**
 * フェーズ名の定義
 */
export const PHASE_NAMES = {
  1: '構造要素（柱）',
  2: '構造要素（梁）',
  3: '面要素',
  4: '基礎要素',
  5: '補助要素',
  6: '開口',
  7: '節点',
  8: '参照情報'
};

/**
 * 段階的ローディングの状態
 * @typedef {Object} LoadingState
 * @property {number} totalPhases - 総フェーズ数
 * @property {number} currentPhase - 現在のフェーズ
 * @property {string} currentElementType - 現在処理中の要素タイプ
 * @property {number} processedElements - 処理済み要素数
 * @property {number} totalElements - 総要素数
 * @property {number} progressPercent - 進捗率（0-100）
 */

/**
 * 段階的ローディングのコールバック
 * @typedef {Object} ProgressiveLoaderCallbacks
 * @property {function(LoadingState): void} [onProgress] - 進捗更新時のコールバック
 * @property {function(number, string): void} [onPhaseStart] - フェーズ開始時のコールバック
 * @property {function(number, string): void} [onPhaseComplete] - フェーズ完了時のコールバック
 * @property {function(Error): void} [onError] - エラー発生時のコールバック
 */

/**
 * 段階的ローディングマネージャー
 *
 * モデルの読み込みを優先度に基づいて段階的に実行し、
 * 各フェーズ完了時にUIを更新できるようにします。
 */
export class ProgressiveLoader {
  /**
   * @param {ProgressiveLoaderCallbacks} callbacks - コールバック関数群
   */
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.state = this.createInitialState();
    this.aborted = false;
  }

  /**
   * 初期状態を作成
   * @private
   * @returns {LoadingState}
   */
  createInitialState() {
    return {
      totalPhases: 0,
      currentPhase: 0,
      currentElementType: '',
      processedElements: 0,
      totalElements: 0,
      progressPercent: 0
    };
  }

  /**
   * 要素タイプをフェーズごとにグループ化
   *
   * @param {string[]} elementTypes - 処理対象の要素タイプ配列
   * @returns {Map<number, string[]>} フェーズ番号 -> 要素タイプ配列のマップ
   */
  groupByPhase(elementTypes) {
    const phases = new Map();

    elementTypes.forEach((type) => {
      const priority = ELEMENT_PRIORITY[type] || 99;
      if (!phases.has(priority)) {
        phases.set(priority, []);
      }
      phases.get(priority).push(type);
    });

    // 優先度順にソート
    return new Map([...phases.entries()].sort((a, b) => a[0] - b[0]));
  }

  /**
   * 進捗状態を更新
   *
   * @param {Partial<LoadingState>} updates - 更新する状態
   */
  updateState(updates) {
    Object.assign(this.state, updates);

    // 進捗率を計算
    if (this.state.totalElements > 0) {
      this.state.progressPercent = Math.round(
        (this.state.processedElements / this.state.totalElements) * 100
      );
    }

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress({ ...this.state });
    }
  }

  /**
   * フェーズを開始
   *
   * @param {number} phaseNumber - フェーズ番号
   * @param {string[]} elementTypes - このフェーズの要素タイプ
   */
  startPhase(phaseNumber, elementTypes) {
    const phaseName = PHASE_NAMES[phaseNumber] || `フェーズ ${phaseNumber}`;

    this.updateState({
      currentPhase: phaseNumber,
      currentElementType: elementTypes.join(', ')
    });

    if (this.callbacks.onPhaseStart) {
      this.callbacks.onPhaseStart(phaseNumber, phaseName);
    }
  }

  /**
   * フェーズを完了
   *
   * @param {number} phaseNumber - フェーズ番号
   */
  completePhase(phaseNumber) {
    const phaseName = PHASE_NAMES[phaseNumber] || `フェーズ ${phaseNumber}`;

    if (this.callbacks.onPhaseComplete) {
      this.callbacks.onPhaseComplete(phaseNumber, phaseName);
    }
  }

  /**
   * 段階的に要素を処理
   *
   * @param {Map<string, Object>} comparisonResults - 比較結果
   * @param {function(string, Object): Promise<void>} processElementType - 要素タイプごとの処理関数
   * @returns {Promise<void>}
   */
  async processElementsProgressively(comparisonResults, processElementType) {
    const elementTypes = Array.from(comparisonResults.keys());
    const phases = this.groupByPhase(elementTypes);

    // 総要素数を計算
    let totalElements = 0;
    comparisonResults.forEach((result) => {
      totalElements +=
        (result.matched?.length || 0) +
        (result.onlyA?.length || 0) +
        (result.onlyB?.length || 0);
    });

    this.updateState({
      totalPhases: phases.size,
      totalElements,
      processedElements: 0
    });

    for (const [phaseNumber, phaseElementTypes] of phases) {
      if (this.aborted) {
        break;
      }

      this.startPhase(phaseNumber, phaseElementTypes);

      for (const elementType of phaseElementTypes) {
        if (this.aborted) {
          break;
        }

        const result = comparisonResults.get(elementType);
        if (!result) continue;

        this.updateState({ currentElementType: elementType });

        try {
          await processElementType(elementType, result);

          // 処理済み要素数を更新
          const processedInType =
            (result.matched?.length || 0) +
            (result.onlyA?.length || 0) +
            (result.onlyB?.length || 0);

          this.updateState({
            processedElements: this.state.processedElements + processedInType
          });
        } catch (error) {
          console.error(`Error processing ${elementType}:`, error);
          if (this.callbacks.onError) {
            this.callbacks.onError(error);
          }
        }

        // UIスレッドに制御を戻す
        await this.yieldToMain();
      }

      this.completePhase(phaseNumber);
    }

    this.updateState({ progressPercent: 100 });
  }

  /**
   * メインスレッドに制御を譲る
   *
   * 長時間のループ処理中にUIをブロックしないようにする
   *
   * @returns {Promise<void>}
   */
  yieldToMain() {
    return new Promise((resolve) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(resolve, { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /**
   * 処理を中断
   */
  abort() {
    this.aborted = true;
  }

  /**
   * 状態をリセット
   */
  reset() {
    this.state = this.createInitialState();
    this.aborted = false;
  }
}

/**
 * 段階的ローディング用のデフォルトコールバックを作成
 *
 * @param {function(): void} scheduleRender - レンダリングをスケジュールする関数
 * @param {function(LoadingState): void} [updateUI] - UI更新関数
 * @returns {ProgressiveLoaderCallbacks}
 */
export function createDefaultCallbacks(scheduleRender, updateUI = null) {
  return {
    onProgress: (state) => {
      console.log(
        `Loading: ${state.currentElementType} - ${state.progressPercent}%`
      );
      if (updateUI) {
        updateUI(state);
      }
    },
    onPhaseStart: (phase, name) => {
      console.log(`Starting phase ${phase}: ${name}`);
    },
    onPhaseComplete: (phase, name) => {
      console.log(`Completed phase ${phase}: ${name}`);
      if (scheduleRender) {
        scheduleRender();
      }
    },
    onError: (error) => {
      console.error('Progressive loading error:', error);
    }
  };
}

/**
 * 要素数に基づいてバッチサイズを計算
 *
 * 大量の要素を処理する際に、適切なバッチサイズを決定します。
 *
 * @param {number} totalElements - 総要素数
 * @returns {number} バッチサイズ
 */
export function calculateBatchSize(totalElements) {
  if (totalElements < 100) {
    return totalElements; // 少量なら一括処理
  } else if (totalElements < 1000) {
    return 50;
  } else if (totalElements < 10000) {
    return 100;
  } else {
    return 200;
  }
}

/**
 * 配列をバッチに分割
 *
 * @template T
 * @param {T[]} array - 分割する配列
 * @param {number} batchSize - バッチサイズ
 * @returns {T[][]} バッチ配列
 */
export function splitIntoBatches(array, batchSize) {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}
