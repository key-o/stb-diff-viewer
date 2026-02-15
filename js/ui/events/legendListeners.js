/**
 * @fileoverview 凡例関連イベントリスナー
 *
 * 凡例パネルの表示/非表示と内容更新を処理するイベントリスナー。
 *
 * @module ui/events/legendListeners
 */

// --- UI Element Reference ---
const legendPanel = document.getElementById('legendPanel');


/**
 * Handle legend toggle
 * @param {Event} event - Click event
 */
function handleLegendToggle(event) {
  event.preventDefault();
  toggleLegend();
}

/**
 * Toggle legend visibility
 */
export function toggleLegend() {
  if (!legendPanel) {
    console.warn('[UI] 凡例: パネル要素が見つかりません');
    return;
  }

  const isCurrentlyVisible = !legendPanel.classList.contains('hidden');

  if (isCurrentlyVisible) {
    legendPanel.classList.add('hidden');
    console.log('[Event] 凡例: 非表示');
  } else {
    legendPanel.classList.remove('hidden');
    updateLegendContent(); // 凡例内容を更新
    console.log('[Event] 凡例: 表示');
  }

  // Update toggle button text if it exists
  const toggleBtn = document.getElementById('toggleLegendBtn');
  if (toggleBtn) {
    toggleBtn.textContent = isCurrentlyVisible ? '凡例を表示' : '凡例を非表示';
  }
}

/**
 * 色分けモードに応じて凡例内容を更新
 */
export function updateLegendContent() {
  if (!legendPanel) return;

  // 現在の色分けモードを取得
  import('../../colorModes/index.js').then(({ getCurrentColorMode, COLOR_MODES }) => {
    const currentMode = getCurrentColorMode();
    const legendContent = legendPanel.querySelector('.legend-content');

    if (!legendContent) return;

    switch (currentMode) {
      case COLOR_MODES.IMPORTANCE:
        updateImportanceLegend(legendContent);
        break;
      case COLOR_MODES.ELEMENT:
        updateElementLegend(legendContent);
        break;
      case COLOR_MODES.SCHEMA:
        updateSchemaLegend(legendContent);
        break;
      case COLOR_MODES.DIFF:
      default:
        updateDiffLegend(legendContent);
        break;
    }
  });
}

/**
 * 重要度別凡例を生成
 */
function updateImportanceLegend(container) {
  import('../../constants/importanceLevels.js').then(({ IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES }) => {
    // ColorManager経由で色を取得（単一データソース）
    import('../../viewer/rendering/colorManager.js').then(({ colorManager }) => {
      const html = `
        <div class="panel-header">重要度別凡例</div>
        ${Object.entries(IMPORTANCE_LEVELS)
          .map(([_key, level]) => {
            const color = colorManager.getImportanceColor(level);
            const name = IMPORTANCE_LEVEL_NAMES[level];
            return `
            <div class="legend-item">
              <span class="legend-color" style="background-color: ${color};"></span>
              <span>${name}</span>
            </div>
          `;
          })
          .join('')}
        <hr />
        <div class="legend-item">
          <span><b>操作方法:</b></span>
        </div>
        <div class="legend-item">
          <span>回転: 左ドラッグ</span>
        </div>
        <div class="legend-item">
          <span>平行移動: 右ドラッグ</span>
        </div>
        <div class="legend-item">
          <span>ズーム: ホイール</span>
        </div>
      `;
      container.innerHTML = html;
    });
  });
}

/**
 * 部材別凡例を生成
 */
function updateElementLegend(container) {
  import('../../colorModes/index.js').then(({ getElementColors }) => {
    const elementColors = getElementColors();
    const html = `
      <div class="panel-header">部材別凡例</div>
      ${Object.entries(elementColors)
        .map(
          ([type, color]) => `
        <div class="legend-item">
          <span class="legend-color" style="background-color: ${color};"></span>
          <span>${type}</span>
        </div>
      `,
        )
        .join('')}
      <hr />
      <div class="legend-item">
        <span><b>操作方法:</b></span>
      </div>
      <div class="legend-item">
        <span>回転: 左ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>平行移動: 右ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>ズーム: ホイール</span>
      </div>
    `;
    container.innerHTML = html;
  });
}

/**
 * スキーマエラー凡例を生成
 */
function updateSchemaLegend(container) {
  import('../../colorModes/index.js').then(({ getSchemaColors }) => {
    const schemaColors = getSchemaColors();
    const html = `
      <div class="panel-header">スキーマ検証凡例</div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${schemaColors.valid};"></span>
        <span>正常要素</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${schemaColors.error};"></span>
        <span>エラー要素</span>
      </div>
      <hr />
      <div class="legend-item">
        <span><b>操作方法:</b></span>
      </div>
      <div class="legend-item">
        <span>回転: 左ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>平行移動: 右ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>ズーム: ホイール</span>
      </div>
    `;
    container.innerHTML = html;
  });
}

/**
 * 差分表示凡例を生成（デフォルト）
 */
function updateDiffLegend(container) {
  // ColorManager経由で色を取得（単一データソース）
  import('../../viewer/rendering/colorManager.js').then(({ colorManager }) => {
    const html = `
      <div class="panel-header">凡例</div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${colorManager.getDiffColor('matched')};"></span>
        <span>一致要素</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${colorManager.getDiffColor('onlyA')};"></span>
        <span>モデルAのみ</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${colorManager.getDiffColor('onlyB')};"></span>
        <span>モデルBのみ</span>
      </div>
      <hr />
      <div class="legend-item">
        <span><b>操作方法:</b></span>
      </div>
      <div class="legend-item">
        <span>回転: 左ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>平行移動: 右ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>ズーム: ホイール</span>
      </div>
    `;
    container.innerHTML = html;
  });
}

/**
 * Get legend panel status
 * @returns {boolean} Whether legend panel exists
 */
export function hasLegendPanel() {
  return !!legendPanel;
}
