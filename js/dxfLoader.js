/**
 * @fileoverview DXFファイル読み込み統合モジュール
 *
 * DXFファイルの読み込みからビューアへの表示までを統合的に管理します。
 */

import { createLogger } from './utils/logger.js';
import { parseDxf, extractEntities, getLayers, calculateBounds } from './parser/dxfParser.js';
import {
  renderDxfEntities,
  clearDxfGroup,
  getDxfGroup,
  fitCameraToDxfBounds,
  setLayerVisibility,
  toggleDxfEditMode
} from './viewer/dxfViewer.js';
import { getState, setState } from './core/globalState.js';
import { scene, camera, controls } from './viewer/core/core.js';
import { exportDxf, getExportStats } from './exporter/dxfExporter.js';
import {
  canExportStbToDxf,
  exportStbToDxf,
  getStbExportStats
} from './exporter/stbToDxfExporter.js';
import { getCurrentStories, getCurrentAxesData, addStateChangeListener } from './ui/state.js';

const log = createLogger('DXFLoader');

// DXF状態管理
let currentDxfData = null;
let currentEntities = null;
let currentLayers = [];
let dxfLoaded = false;
const selectedExportLayers = new Set(); // エクスポート用に選択されたレイヤー

/**
 * DXF配置オプションを取得
 * @returns {Object} 配置オプション {plane, offsetX, offsetY, offsetZ, rotation}
 */
export function getDxfPlacementOptions() {
  const planeSelect = document.getElementById('dxfPlacementPlane');
  const positionSelect = document.getElementById('dxfPlacementPosition');
  const manualOffsetCheckbox = document.getElementById('dxfManualOffset');
  const offsetXInput = document.getElementById('dxfOffsetX');
  const offsetYInput = document.getElementById('dxfOffsetY');
  const offsetZInput = document.getElementById('dxfOffsetZ');

  const plane = planeSelect?.value || 'xy';
  const position = positionSelect?.value || 'origin';
  const useManualOffset = manualOffsetCheckbox?.checked || false;

  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = 0;

  if (useManualOffset) {
    // 手動オフセットを使用
    offsetX = parseFloat(offsetXInput?.value) || 0;
    offsetY = parseFloat(offsetYInput?.value) || 0;
    offsetZ = parseFloat(offsetZInput?.value) || 0;
  } else if (position !== 'origin') {
    // 階または通りの位置を使用
    const positionData = getPositionFromSelection(plane, position);
    offsetX = positionData.offsetX;
    offsetY = positionData.offsetY;
    offsetZ = positionData.offsetZ;
  }

  return {
    plane,
    position,
    offsetX,
    offsetY,
    offsetZ,
    useManualOffset
  };
}

/**
 * 選択された配置位置から実際のオフセット値を計算
 * @param {string} plane - 配置面 ('xy', 'xz', 'yz')
 * @param {string} position - 配置位置の識別子
 * @returns {Object} オフセット値 {offsetX, offsetY, offsetZ}
 */
function getPositionFromSelection(plane, position) {
  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = 0;

  if (plane === 'xy') {
    // XY平面 - 階への配置
    const stories = getCurrentStories();
    const story = stories.find((s) => s.id === position);
    if (story) {
      offsetZ = story.height; // 階の高さをZオフセットに
      log.info(`階 "${story.name}" (高さ: ${story.height}mm) に配置`);
    }
  } else if (plane === 'xz') {
    // XZ平面 - Y通りへの配置
    const axesData = getCurrentAxesData();
    if (axesData?.yAxes) {
      const axis = axesData.yAxes.find((a) => a.id === position);
      if (axis) {
        offsetY = axis.distance; // Y通りの距離をYオフセットに
        log.info(`Y通り "${axis.name}" (距離: ${axis.distance}mm) に配置`);
      }
    }
  } else if (plane === 'yz') {
    // YZ平面 - X通りへの配置
    const axesData = getCurrentAxesData();
    if (axesData?.xAxes) {
      const axis = axesData.xAxes.find((a) => a.id === position);
      if (axis) {
        offsetX = axis.distance; // X通りの距離をXオフセットに
        log.info(`X通り "${axis.name}" (距離: ${axis.distance}mm) に配置`);
      }
    }
  }

  return { offsetX, offsetY, offsetZ };
}

/**
 * DXFファイルを読み込んで表示
 * @param {File} file - DXFファイル
 * @param {Object} options - 配置オプション（省略時はUIから取得）
 * @returns {Promise<boolean>} 読み込み成功フラグ
 */
export async function loadDxfFile(file, options = null) {
  try {
    log.info('DXFファイル読み込み開始:', file.name);

    // 配置オプションを取得（引数が無ければUIから取得）
    const placementOptions = options || getDxfPlacementOptions();
    log.info('配置オプション:', placementOptions);

    // ファイル内容を読み込み
    const content = await readFileAsText(file);

    // DXFをパース
    currentDxfData = parseDxf(content);

    // エンティティを抽出
    currentEntities = extractEntities(currentDxfData);

    // レイヤー情報を取得
    currentLayers = getLayers(currentDxfData);

    // バウンドを計算
    const bounds = calculateBounds(currentEntities);

    // シーンを確認
    if (!scene) {
      throw new Error('シーンが初期化されていません');
    }

    // DXFグループをシーンに追加
    const dxfGroup = getDxfGroup();
    if (!scene.getObjectByName('DXFEntities')) {
      scene.add(dxfGroup);
    }

    // 配置面に応じた回転とオフセットを計算
    const renderOptions = calculateRenderOptions(placementOptions);

    // エンティティを描画
    renderDxfEntities(currentEntities, renderOptions);

    // カメラを調整
    if (camera && controls) {
      fitCameraToDxfBounds(bounds, camera, controls);
    }

    // 再描画をリクエスト
    const scheduleRender = getState('rendering.scheduleRender');
    if (scheduleRender) {
      scheduleRender();
    }

    // 状態を更新
    dxfLoaded = true;
    setState('dxf.loaded', true);
    setState('dxf.data', currentDxfData);
    setState('dxf.entities', currentEntities);
    setState('dxf.layers', currentLayers);
    setState('dxf.bounds', bounds);
    setState('dxf.placementOptions', placementOptions);

    // レイヤーUI を更新
    updateLayerUI();

    log.info('DXFファイル読み込み完了:', {
      entities: {
        lines: currentEntities.lines.length,
        polylines: currentEntities.lwpolylines.length,
        circles: currentEntities.circles.length,
        arcs: currentEntities.arcs.length,
        dimensions: currentEntities.dimensions.length,
        texts: currentEntities.texts.length
      },
      layers: currentLayers.length,
      placement: placementOptions
    });

    return true;
  } catch (error) {
    log.error('DXFファイル読み込みエラー:', error);
    alert(`DXFファイルの読み込みに失敗しました: ${error.message}`);
    return false;
  }
}

/**
 * 配置オプションからレンダリングオプションを計算
 * @param {Object} placementOptions - 配置オプション
 * @returns {Object} レンダリングオプション
 */
function calculateRenderOptions(placementOptions) {
  const { plane, offsetX, offsetY, offsetZ } = placementOptions;

  // 基本オプション
  const renderOptions = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    plane: plane // 配置面情報を渡す
  };

  // 配置面に応じてオフセットを設定
  switch (plane) {
    case 'xy':
      // XY平面（平面図） - DXFのX,YはそのままX,Y、オフセットはZ方向
      renderOptions.offsetX = offsetX;
      renderOptions.offsetY = offsetY;
      renderOptions.offsetZ = offsetZ;
      break;

    case 'xz':
      // XZ平面（Y通り断面） - DXFのX→X, Y→Z、オフセットはY方向
      renderOptions.offsetX = offsetX;
      renderOptions.offsetY = offsetY;
      renderOptions.offsetZ = offsetZ;
      renderOptions.swapYZ = true; // Y軸とZ軸を交換
      break;

    case 'yz':
      // YZ平面（X通り断面） - DXFのX→Y, Y→Z、オフセットはX方向
      renderOptions.offsetX = offsetX;
      renderOptions.offsetY = offsetY;
      renderOptions.offsetZ = offsetZ;
      renderOptions.swapXYZ = true; // 座標を回転
      break;
  }

  return renderOptions;
}

/**
 * DXFファイルのコードページからエンコーディングを推定
 * @param {ArrayBuffer} buffer - ファイルのバイナリデータ
 * @returns {string} エンコーディング名
 */
function detectDxfEncoding(buffer) {
  // まずASCIIとして読み込んでヘッダーを確認
  const uint8 = new Uint8Array(buffer);
  let headerText = '';

  // 最初の4KB程度を確認（ヘッダー情報はファイル先頭にある）
  const headerLength = Math.min(4096, uint8.length);
  for (let i = 0; i < headerLength; i++) {
    headerText += String.fromCharCode(uint8[i]);
  }

  // $DWGCODEPAGEを検索
  const codepageMatch = headerText.match(/\$DWGCODEPAGE[\s\S]*?\n\s*3\s*\n([^\n]+)/i);
  if (codepageMatch) {
    const codepage = codepageMatch[1].trim().toUpperCase();
    log.info('DXFコードページ検出:', codepage);

    // コードページからエンコーディングへのマッピング
    const codepageMap = {
      'ANSI_932': 'shift_jis',      // Japanese
      'ANSI_936': 'gb2312',          // Simplified Chinese
      'ANSI_949': 'euc-kr',          // Korean
      'ANSI_950': 'big5',            // Traditional Chinese
      'ANSI_1250': 'windows-1250',   // Central European
      'ANSI_1251': 'windows-1251',   // Cyrillic
      'ANSI_1252': 'windows-1252',   // Western European
      'ANSI_1253': 'windows-1253',   // Greek
      'ANSI_1254': 'windows-1254',   // Turkish
      'ANSI_1255': 'windows-1255',   // Hebrew
      'ANSI_1256': 'windows-1256',   // Arabic
      'ANSI_1257': 'windows-1257',   // Baltic
      'ANSI_1258': 'windows-1258',   // Vietnamese
      'UTF-8': 'utf-8',
      'UTF8': 'utf-8'
    };

    if (codepageMap[codepage]) {
      return codepageMap[codepage];
    }

    // ANSI_xxxの形式をパース
    const ansiMatch = codepage.match(/ANSI_(\d+)/);
    if (ansiMatch) {
      const cpNum = ansiMatch[1];
      // 日本語環境でよく使われるCP932
      if (cpNum === '932') {
        return 'shift_jis';
      }
    }
  }

  // BOM（Byte Order Mark）を確認
  if (uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    log.info('UTF-8 BOM検出');
    return 'utf-8';
  }
  if (uint8[0] === 0xFF && uint8[1] === 0xFE) {
    log.info('UTF-16LE BOM検出');
    return 'utf-16le';
  }
  if (uint8[0] === 0xFE && uint8[1] === 0xFF) {
    log.info('UTF-16BE BOM検出');
    return 'utf-16be';
  }

  // 日本語環境向け: Shift_JISの特徴的なバイトパターンを検出
  let shiftJisScore = 0;
  let utf8Score = 0;

  for (let i = 0; i < Math.min(buffer.byteLength, 8192); i++) {
    const b = uint8[i];

    // Shift_JIS特徴的パターン（全角文字の先頭バイト）
    if ((b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xFC)) {
      const next = uint8[i + 1];
      if (next && ((next >= 0x40 && next <= 0x7E) || (next >= 0x80 && next <= 0xFC))) {
        shiftJisScore += 2;
        i++; // 2バイト文字なのでスキップ
      }
    }

    // UTF-8特徴的パターン（マルチバイトシーケンス）
    if ((b & 0xE0) === 0xC0) { // 2バイトシーケンス開始
      const next = uint8[i + 1];
      if (next && (next & 0xC0) === 0x80) {
        utf8Score += 2;
        i++;
      }
    } else if ((b & 0xF0) === 0xE0) { // 3バイトシーケンス開始
      const next1 = uint8[i + 1];
      const next2 = uint8[i + 2];
      if (next1 && next2 && (next1 & 0xC0) === 0x80 && (next2 & 0xC0) === 0x80) {
        utf8Score += 3;
        i += 2;
      }
    }
  }

  log.info('エンコーディング推定スコア:', { shiftJis: shiftJisScore, utf8: utf8Score });

  // スコアが高い方を選択
  if (shiftJisScore > utf8Score && shiftJisScore > 5) {
    log.info('Shift_JISと推定');
    return 'shift_jis';
  }

  if (utf8Score > 5) {
    log.info('UTF-8と推定');
    return 'utf-8';
  }

  // デフォルト: 日本語環境ではShift_JISが多いが、新しいファイルはUTF-8の可能性も
  // 安全のためUTF-8を試し、失敗したらShift_JISにフォールバック
  log.info('エンコーディング不明、UTF-8をデフォルトとして使用');
  return 'utf-8';
}

/**
 * ファイルをテキストとして読み込む（自動エンコーディング検出）
 * @param {File} file - ファイル
 * @returns {Promise<string>} ファイル内容
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target.result;
        const encoding = detectDxfEncoding(buffer);

        // 検出したエンコーディングでデコード
        let text;
        try {
          const decoder = new TextDecoder(encoding);
          text = decoder.decode(buffer);
        } catch (decodeError) {
          // エンコーディングがサポートされていない場合、Shift_JISを試す
          log.warn(`${encoding}でのデコード失敗、Shift_JISを試行:`, decodeError);
          try {
            const fallbackDecoder = new TextDecoder('shift_jis');
            text = fallbackDecoder.decode(buffer);
          } catch (fallbackError) {
            // 最終フォールバック: UTF-8
            log.warn('Shift_JISでもデコード失敗、UTF-8でフォールバック');
            const utf8Decoder = new TextDecoder('utf-8');
            text = utf8Decoder.decode(buffer);
          }
        }

        resolve(text);
      } catch (error) {
        reject(new Error('ファイル読み込みエラー: ' + error.message));
      }
    };
    reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * DXFデータをクリア
 */
export function clearDxfData() {
  clearDxfGroup();
  currentDxfData = null;
  currentEntities = null;
  currentLayers = [];
  dxfLoaded = false;

  setState('dxf.loaded', false);
  setState('dxf.data', null);
  setState('dxf.entities', null);
  setState('dxf.layers', null);

  // 再描画をリクエスト
  const scheduleRender = getState('rendering.scheduleRender');
  if (scheduleRender) {
    scheduleRender();
  }

  log.info('DXFデータをクリアしました');
}

/**
 * DXFが読み込まれているか確認
 * @returns {boolean}
 */
export function isDxfLoaded() {
  return dxfLoaded;
}

/**
 * 現在のレイヤー情報を取得
 * @returns {Array}
 */
export function getDxfLayers() {
  return currentLayers;
}

/**
 * レイヤーの表示/非表示を切り替え
 * @param {string} layerName - レイヤー名
 * @param {boolean} visible - 表示状態
 */
export function toggleDxfLayer(layerName, visible) {
  setLayerVisibility(layerName, visible);

  // 再描画をリクエスト
  const scheduleRender = getState('rendering.scheduleRender');
  if (scheduleRender) {
    scheduleRender();
  }
}

/**
 * レイヤーUIを更新
 */
function updateLayerUI() {
  const layerContainer = document.getElementById('dxf-layer-list');
  if (!layerContainer) return;

  layerContainer.innerHTML = '';

  for (const layer of currentLayers) {
    const layerItem = document.createElement('label');
    layerItem.className = 'dxf-layer-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = layer.visible;
    checkbox.addEventListener('change', (e) => {
      toggleDxfLayer(layer.name, e.target.checked);
    });

    const colorBox = document.createElement('span');
    colorBox.className = 'dxf-layer-color';
    colorBox.style.backgroundColor = `#${layer.color.toString(16).padStart(6, '0')}`;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = layer.name;

    layerItem.appendChild(checkbox);
    layerItem.appendChild(colorBox);
    layerItem.appendChild(nameSpan);
    layerContainer.appendChild(layerItem);
  }
}

/**
 * DXFローダーUIを初期化
 */
export function initDxfLoaderUI() {
  // 配置オプションUIを初期化
  initPlacementOptionsUI();

  // DXFファイル入力のイベントリスナー
  const dxfFileInput = document.getElementById('dxfFile');
  if (dxfFileInput) {
    dxfFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        const loadBtn = document.getElementById('loadDxfButton');
        if (loadBtn) {
          loadBtn.disabled = true;
          loadBtn.textContent = '読み込み中...';
        }

        const success = await loadDxfFile(file);

        if (loadBtn) {
          loadBtn.disabled = false;
          loadBtn.textContent = 'DXF読込';
        }

        if (success) {
          // DXFセクションのサマリーを表示
          const summaryEl = document.getElementById('dxf-summary');
          if (summaryEl) {
            summaryEl.classList.remove('hidden');
            const placementOptions = getDxfPlacementOptions();
            const placementInfo = getPlacementInfoText(placementOptions);
            summaryEl.innerHTML = `
              <div class="dxf-summary-title">DXF読み込み完了</div>
              <div class="dxf-summary-content">
                <div>線分: ${currentEntities.lines.length}</div>
                <div>ポリライン: ${currentEntities.lwpolylines.length}</div>
                <div>円: ${currentEntities.circles.length}</div>
                <div>円弧: ${currentEntities.arcs.length}</div>
                <div>寸法: ${currentEntities.dimensions.length}</div>
                <div>テキスト: ${currentEntities.texts.length}</div>
                <div>レイヤー: ${currentLayers.length}</div>
                <div style="grid-column: span 2; margin-top: 4px; color: var(--info-text, #0c5460);">配置: ${placementInfo}</div>
              </div>
            `;
          }

          // レイヤーパネルを表示
          const layerPanel = document.getElementById('dxf-layer-panel');
          if (layerPanel) {
            layerPanel.classList.remove('hidden');
          }

          // エクスポートパネルを表示
          const exportPanel = document.getElementById('dxf-export-panel');
          if (exportPanel) {
            exportPanel.classList.remove('hidden');
          }

          // エクスポートレイヤーUIを更新
          updateExportLayerUI();
        }
      }
    });
  }

  // DXF読み込みボタンのイベントリスナー
  const loadDxfBtn = document.getElementById('loadDxfButton');
  if (loadDxfBtn) {
    loadDxfBtn.addEventListener('click', () => {
      const dxfFileInput = document.getElementById('dxfFile');
      if (dxfFileInput && dxfFileInput.files[0]) {
        loadDxfFile(dxfFileInput.files[0]);
      } else {
        alert('DXFファイルを選択してください');
      }
    });
  }

  // DXFクリアボタンのイベントリスナー
  const clearDxfBtn = document.getElementById('clearDxfButton');
  if (clearDxfBtn) {
    clearDxfBtn.addEventListener('click', () => {
      clearDxfData();

      // UIをリセット
      const dxfFileInput = document.getElementById('dxfFile');
      if (dxfFileInput) {
        dxfFileInput.value = '';
      }
      const fileNameEl = document.getElementById('dxfFile-name');
      if (fileNameEl) {
        fileNameEl.textContent = '選択されていません';
      }
      const summaryEl = document.getElementById('dxf-summary');
      if (summaryEl) {
        summaryEl.classList.add('hidden');
      }
      const layerPanel = document.getElementById('dxf-layer-panel');
      if (layerPanel) {
        layerPanel.classList.add('hidden');
      }
      // エクスポートパネルを非表示
      const exportPanel = document.getElementById('dxf-export-panel');
      if (exportPanel) {
        exportPanel.classList.add('hidden');
      }
      // エクスポート用選択レイヤーをクリア
      selectedExportLayers.clear();
    });
  }

  // エクスポートUIを初期化
  initExportUI();

  // STBエクスポートUIを初期化
  initStbExportUI();

  // 位置調整モードトグルボタン
  const toggleEditModeBtn = document.getElementById('toggleDxfEditMode');
  if (toggleEditModeBtn) {
    toggleEditModeBtn.addEventListener('click', (e) => {
      const isActive = e.target.classList.toggle('active');
      toggleDxfEditMode(isActive);
      e.target.textContent = isActive ? '位置調整モード終了' : '位置調整モード開始';
    });
  }

  log.info('DXFローダーUI初期化完了');
}

/**
 * 配置オプションUIを初期化
 */
function initPlacementOptionsUI() {
  const planeSelect = document.getElementById('dxfPlacementPlane');
  const positionSelect = document.getElementById('dxfPlacementPosition');
  const manualOffsetCheckbox = document.getElementById('dxfManualOffset');
  const manualOffsetInputs = document.getElementById('dxf-manual-offset-inputs');

  // 配置面の変更イベント
  if (planeSelect) {
    planeSelect.addEventListener('change', () => {
      updatePlacementPositionOptions();
    });
  }

  // 手動オフセットチェックボックスの変更イベント
  if (manualOffsetCheckbox && manualOffsetInputs) {
    manualOffsetCheckbox.addEventListener('change', () => {
      if (manualOffsetCheckbox.checked) {
        manualOffsetInputs.classList.remove('hidden');
        // 位置選択を無効化
        if (positionSelect) {
          positionSelect.disabled = true;
        }
      } else {
        manualOffsetInputs.classList.add('hidden');
        // 位置選択を有効化
        if (positionSelect) {
          positionSelect.disabled = false;
        }
      }
    });
  }

  // 初期配置位置オプションを設定
  updatePlacementPositionOptions();

  // STBモデル読み込み時に配置位置選択肢を自動更新
  addStateChangeListener(() => {
    updatePlacementPositionOptions();
  });

  log.info('配置オプションUI初期化完了');
}

/**
 * 配置面に応じて配置位置のオプションを更新
 */
export function updatePlacementPositionOptions() {
  const planeSelect = document.getElementById('dxfPlacementPlane');
  const positionSelect = document.getElementById('dxfPlacementPosition');

  if (!planeSelect || !positionSelect) return;

  const plane = planeSelect.value;

  // 既存のオプションをクリア（原点以外）
  positionSelect.innerHTML = '<option value="origin">原点 (0)</option>';

  // STBモデルの階・通り情報を取得
  const stories = getCurrentStories();
  const axesData = getCurrentAxesData();

  if (plane === 'xy') {
    // XY平面 - 階を追加
    if (stories && stories.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = '階';

      // 高さ順にソート（昇順）
      const sortedStories = [...stories].sort((a, b) => a.height - b.height);
      for (const story of sortedStories) {
        const option = document.createElement('option');
        option.value = story.id;
        option.textContent = `${story.name} (${story.height}mm)`;
        optgroup.appendChild(option);
      }
      positionSelect.appendChild(optgroup);
    }
  } else if (plane === 'xz') {
    // XZ平面 - Y通りを追加
    if (axesData?.yAxes && axesData.yAxes.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'Y通り';

      // 距離順にソート
      const sortedAxes = [...axesData.yAxes].sort(
        (a, b) => a.distance - b.distance
      );
      for (const axis of sortedAxes) {
        const option = document.createElement('option');
        option.value = axis.id;
        option.textContent = `${axis.name} (${axis.distance}mm)`;
        optgroup.appendChild(option);
      }
      positionSelect.appendChild(optgroup);
    }
  } else if (plane === 'yz') {
    // YZ平面 - X通りを追加
    if (axesData?.xAxes && axesData.xAxes.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'X通り';

      // 距離順にソート
      const sortedAxes = [...axesData.xAxes].sort(
        (a, b) => a.distance - b.distance
      );
      for (const axis of sortedAxes) {
        const option = document.createElement('option');
        option.value = axis.id;
        option.textContent = `${axis.name} (${axis.distance}mm)`;
        optgroup.appendChild(option);
      }
      positionSelect.appendChild(optgroup);
    }
  }
}

/**
 * 配置情報のテキストを取得
 * @param {Object} options - 配置オプション
 * @returns {string} 配置情報テキスト
 */
function getPlacementInfoText(options) {
  const planeNames = {
    xy: 'XY平面',
    xz: 'XZ平面',
    yz: 'YZ平面'
  };

  let text = planeNames[options.plane] || options.plane;

  if (options.useManualOffset) {
    text += ` (手動: X=${options.offsetX}, Y=${options.offsetY}, Z=${options.offsetZ}mm)`;
  } else if (options.position !== 'origin') {
    // 階または通りの名前を取得
    const stories = getCurrentStories();
    const axesData = getCurrentAxesData();

    if (options.plane === 'xy') {
      const story = stories.find((s) => s.id === options.position);
      if (story) {
        text += ` → ${story.name}`;
      }
    } else if (options.plane === 'xz') {
      const axis = axesData?.yAxes?.find((a) => a.id === options.position);
      if (axis) {
        text += ` → ${axis.name}通り`;
      }
    } else if (options.plane === 'yz') {
      const axis = axesData?.xAxes?.find((a) => a.id === options.position);
      if (axis) {
        text += ` → ${axis.name}通り`;
      }
    }
  } else {
    text += ' → 原点';
  }

  return text;
}

/**
 * エクスポートレイヤーUIを更新
 */
function updateExportLayerUI() {
  const layerContainer = document.getElementById('dxf-export-layer-list');
  if (!layerContainer) return;

  layerContainer.innerHTML = '';
  selectedExportLayers.clear();

  // 各レイヤーのエンティティ数をカウント
  const layerCounts = {};
  for (const layer of currentLayers) {
    layerCounts[layer.name] = 0;
  }

  // エンティティをカウント
  const countEntities = (entities, layerName) => {
    return entities.filter(e => e.layer === layerName).length;
  };

  for (const layer of currentLayers) {
    layerCounts[layer.name] =
      countEntities(currentEntities.lines || [], layer.name) +
      countEntities(currentEntities.circles || [], layer.name) +
      countEntities(currentEntities.arcs || [], layer.name) +
      countEntities(currentEntities.lwpolylines || [], layer.name) +
      countEntities(currentEntities.points || [], layer.name) +
      countEntities(currentEntities.texts || [], layer.name) +
      countEntities(currentEntities.dimensions || [], layer.name);
  }

  for (const layer of currentLayers) {
    const layerItem = document.createElement('label');
    layerItem.className = 'dxf-export-layer-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true; // デフォルトで全選択
    checkbox.dataset.layerName = layer.name;
    selectedExportLayers.add(layer.name);

    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedExportLayers.add(layer.name);
      } else {
        selectedExportLayers.delete(layer.name);
      }
      updateExportStats();
    });

    const colorBox = document.createElement('span');
    colorBox.className = 'layer-color';
    colorBox.style.backgroundColor = `#${layer.color.toString(16).padStart(6, '0')}`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = layer.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'layer-count';
    countSpan.textContent = `(${layerCounts[layer.name]})`;

    layerItem.appendChild(checkbox);
    layerItem.appendChild(colorBox);
    layerItem.appendChild(nameSpan);
    layerItem.appendChild(countSpan);
    layerContainer.appendChild(layerItem);
  }

  updateExportStats();
}

/**
 * エクスポート統計を更新
 */
function updateExportStats() {
  const statsEl = document.getElementById('export-entity-count');
  if (!statsEl || !currentEntities) return;

  const selectedLayerArray = Array.from(selectedExportLayers);
  const stats = getExportStats(currentEntities, selectedLayerArray);

  statsEl.textContent = `選択: ${stats.total} 要素 (線分: ${stats.lines}, 円: ${stats.circles}, 円弧: ${stats.arcs}, ポリライン: ${stats.polylines})`;

  // エクスポートボタンの有効/無効
  const exportBtn = document.getElementById('exportDxfButton');
  if (exportBtn) {
    exportBtn.disabled = stats.total === 0;
  }
}

/**
 * 全レイヤーを選択
 */
function selectAllExportLayers() {
  const checkboxes = document.querySelectorAll('#dxf-export-layer-list input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = true;
    selectedExportLayers.add(cb.dataset.layerName);
  });
  updateExportStats();
}

/**
 * 全レイヤーを解除
 */
function deselectAllExportLayers() {
  const checkboxes = document.querySelectorAll('#dxf-export-layer-list input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = false;
    selectedExportLayers.delete(cb.dataset.layerName);
  });
  updateExportStats();
}

/**
 * DXFをエクスポート
 */
function handleExportDxf() {
  if (!currentEntities || !currentLayers.length) {
    alert('エクスポートするDXFデータがありません');
    return;
  }

  const selectedLayerArray = Array.from(selectedExportLayers);
  if (selectedLayerArray.length === 0) {
    alert('エクスポートするレイヤーを選択してください');
    return;
  }

  const filenameInput = document.getElementById('dxfExportFilename');
  const filename = filenameInput?.value?.trim() || 'export';

  const success = exportDxf(currentEntities, currentLayers, selectedLayerArray, filename);

  if (success) {
    log.info('DXFエクスポート成功:', filename);
  }
}

/**
 * エクスポートUIの初期化
 */
function initExportUI() {
  // 全選択ボタン
  const selectAllBtn = document.getElementById('selectAllExportLayers');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', selectAllExportLayers);
  }

  // 全解除ボタン
  const deselectAllBtn = document.getElementById('deselectAllExportLayers');
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', deselectAllExportLayers);
  }

  // エクスポートボタン
  const exportBtn = document.getElementById('exportDxfButton');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExportDxf);
  }

  log.info('エクスポートUI初期化完了');
}

// ========================================
// STB→DXFエクスポート関連
// ========================================

// STBエクスポート用に選択された要素タイプ
const selectedStbExportTypes = new Set();

// 要素タイプの日本語名と色
const ELEMENT_TYPE_INFO = {
  Column: { name: '柱', color: '#ff0000' },
  Post: { name: '間柱', color: '#ff00ff' },
  Girder: { name: '大梁', color: '#ffff00' },
  Beam: { name: '小梁', color: '#00ff00' },
  Brace: { name: 'ブレース', color: '#00ffff' },
  Pile: { name: '杭', color: '#0000ff' },
  Footing: { name: '基礎', color: '#808080' },
  FoundationColumn: { name: '基礎柱', color: '#c0c0c0' }
};

/**
 * STBエクスポートの状態を更新
 */
export function updateStbExportStatus() {
  const statusEl = document.getElementById('stb-export-status');
  const statusTextEl = document.getElementById('stb-export-status-text');
  const elementSelectEl = document.getElementById('stb-export-element-select');
  const statsEl = document.getElementById('stb-export-stats');
  const filenameGroupEl = document.getElementById('stb-export-filename-group');
  const exportBtn = document.getElementById('exportStbDxfButton');

  if (!statusEl || !statusTextEl) return;

  const { canExport, reason, solidElementTypes } = canExportStbToDxf();

  if (canExport) {
    statusEl.className = 'stb-export-status status-ready';
    statusTextEl.textContent = `エクスポート可能: ${solidElementTypes.length}種類の部材`;

    // 要素選択UIを表示
    if (elementSelectEl) elementSelectEl.classList.remove('hidden');
    if (statsEl) statsEl.classList.remove('hidden');
    if (filenameGroupEl) filenameGroupEl.classList.remove('hidden');

    // 要素タイプリストを更新
    updateStbExportTypeList(solidElementTypes);

    // エクスポートボタンを有効化
    if (exportBtn) exportBtn.disabled = false;
  } else {
    statusEl.className = 'stb-export-status status-not-ready';
    statusTextEl.textContent = reason;

    // UIを非表示
    if (elementSelectEl) elementSelectEl.classList.add('hidden');
    if (statsEl) statsEl.classList.add('hidden');
    if (filenameGroupEl) filenameGroupEl.classList.add('hidden');

    // エクスポートボタンを無効化
    if (exportBtn) exportBtn.disabled = true;
  }
}

/**
 * STBエクスポート要素タイプリストを更新
 * @param {Array<string>} availableTypes - 利用可能な要素タイプ
 */
function updateStbExportTypeList(availableTypes) {
  const listContainer = document.getElementById('stb-export-type-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';
  selectedStbExportTypes.clear();

  // メッシュ数を取得
  const stats = getStbExportStats(availableTypes);

  for (const type of availableTypes) {
    const info = ELEMENT_TYPE_INFO[type] || { name: type, color: '#ffffff' };
    const meshCount = stats.byElementType[type] || 0;

    const item = document.createElement('label');
    item.className = 'stb-export-type-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.elementType = type;
    selectedStbExportTypes.add(type);

    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedStbExportTypes.add(type);
      } else {
        selectedStbExportTypes.delete(type);
      }
      updateStbExportStats();
    });

    const colorBox = document.createElement('span');
    colorBox.className = 'type-color';
    colorBox.style.backgroundColor = info.color;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'type-name';
    nameSpan.textContent = info.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'type-count';
    countSpan.textContent = `(${meshCount}メッシュ)`;

    item.appendChild(checkbox);
    item.appendChild(colorBox);
    item.appendChild(nameSpan);
    item.appendChild(countSpan);
    listContainer.appendChild(item);
  }

  updateStbExportStats();
}

/**
 * STBエクスポート統計を更新
 */
function updateStbExportStats() {
  const statsEl = document.getElementById('stb-export-mesh-count');
  const exportBtn = document.getElementById('exportStbDxfButton');
  if (!statsEl) return;

  const selectedTypes = Array.from(selectedStbExportTypes);
  const stats = getStbExportStats(selectedTypes);

  statsEl.textContent = `選択: ${stats.totalMeshes} メッシュ`;

  // エクスポートボタンの有効/無効
  if (exportBtn) {
    exportBtn.disabled = stats.totalMeshes === 0;
  }
}

/**
 * STB→DXFエクスポートを実行
 */
function handleExportStbDxf() {
  const selectedTypes = Array.from(selectedStbExportTypes);
  if (selectedTypes.length === 0) {
    alert('エクスポートする部材を選択してください');
    return;
  }

  const filenameInput = document.getElementById('stbDxfExportFilename');
  const filename = filenameInput?.value?.trim() || 'stb_export';

  const success = exportStbToDxf(selectedTypes, filename);
  if (success) {
    log.info('STB→DXFエクスポート成功:', filename);
  }
}

/**
 * STBエクスポートUIを初期化
 */
function initStbExportUI() {
  // 全選択ボタン
  const selectAllBtn = document.getElementById('selectAllStbExportTypes');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#stb-export-type-list input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = true;
        selectedStbExportTypes.add(cb.dataset.elementType);
      });
      updateStbExportStats();
    });
  }

  // 全解除ボタン
  const deselectAllBtn = document.getElementById('deselectAllStbExportTypes');
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#stb-export-type-list input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = false;
        selectedStbExportTypes.delete(cb.dataset.elementType);
      });
      updateStbExportStats();
    });
  }

  // エクスポートボタン
  const exportBtn = document.getElementById('exportStbDxfButton');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExportStbDxf);
  }

  // 初期状態を更新
  updateStbExportStatus();

  log.info('STBエクスポートUI初期化完了');
}

/**
 * STBエクスポートパネルの表示/非表示を切り替え
 * @param {boolean} show - 表示するかどうか
 */
export function setStbExportPanelVisibility(show) {
  const panel = document.getElementById('stb-dxf-export-panel');
  if (panel) {
    if (show) {
      panel.classList.remove('hidden');
      updateStbExportStatus();
    } else {
      panel.classList.add('hidden');
    }
  }
}

// グローバルにエクスポート
window.loadDxfFile = loadDxfFile;
window.clearDxfData = clearDxfData;
window.toggleDxfLayer = toggleDxfLayer;
window.exportDxfFile = handleExportDxf;
window.updateStbExportStatus = updateStbExportStatus;
window.setStbExportPanelVisibility = setStbExportPanelVisibility;
