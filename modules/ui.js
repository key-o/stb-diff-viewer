import { elementGroups, SUPPORTED_ELEMENTS, setClippingRange, clearClippingPlanes } from './viewer.js';

// --- グローバル状態への参照 (main.jsから渡される想定) ---
let globalNodeLabels = [];
let globalStories = [];

/**
 * UIモジュールで使用するグローバル状態を設定する。
 * @param {Array<THREE.Sprite>} nodeLabels - 全てのラベルスプライトの配列。
 * @param {Array<object>} stories - 階情報の配列。
 */
export function setGlobalStateForUI(nodeLabels, stories) {
    globalNodeLabels = nodeLabels;
    globalStories = stories;
}

// --- UI更新関数 ---

/**
 * パースされた階情報に基づいて、階選択ドロップダウンリストを更新する。
 */
export function updateStorySelector() {
  const select = document.getElementById('storySelector');
  select.innerHTML = '';
  const clipButton = document.querySelector('#storyButtons button:first-child');
  const clearClipButton = document.getElementById('clearClipButton');

  if (globalStories.length === 0) {
    const opt = document.createElement('option'); opt.textContent = '階情報なし'; opt.disabled = true; select.appendChild(opt);
    select.disabled = true; if (clipButton) clipButton.disabled = true;
  } else {
    globalStories.forEach(s => { const opt = document.createElement('option'); opt.value = s.height; opt.textContent = `${s.name} (${s.height}mm)`; select.appendChild(opt); });
    select.disabled = false; if (clipButton) clipButton.disabled = false;
  }
  if (clearClipButton) clearClipButton.disabled = false;
}

/**
 * すべてのラベルの表示/非表示状態を、現在のUI設定に基づいて更新する。
 */
export function updateAllLabelVisibility() {
    console.log("Updating all label visibility.");
    globalNodeLabels.forEach(lbl => {
        const elementType = lbl.userData.elementType;
        if (elementType && elementGroups[elementType]) {
            const elementCheckbox = document.querySelector(`#elementSelector input[name="elements"][value="${elementType}"]`);
            const labelToggleCheckbox = document.getElementById(`toggleLabel-${elementType}`);
            const isElementVisible = elementCheckbox ? elementCheckbox.checked : false;
            const showElementLabels = labelToggleCheckbox ? labelToggleCheckbox.checked : false;
            lbl.visible = isElementVisible && showElementLabels;
        } else {
            lbl.visible = false;
        }
    });
}

// --- UIイベントリスナー設定 ---
export function setupUIEventListeners() {
    // 要素タイプ表示/非表示、ラベル表示チェックボックスの変更イベント
    const elementSelector = document.getElementById('elementSelector');
    if (elementSelector) {
        elementSelector.addEventListener('change', (event) => {
            const target = event.target;
            if (target.name === 'elements') {
                const elementType = target.value;
                const isVisible = target.checked;
                if (elementGroups[elementType]) {
                    elementGroups[elementType].visible = isVisible;
                    updateAllLabelVisibility(); // ラベル表示も更新
                }
            } else if (target.name === 'labelToggle') {
                updateAllLabelVisibility(); // ラベル表示設定が変わったら全体を更新
            }
        });
    } else {
        console.error("Element selector (id='elementSelector') not found!");
    }


    // 凡例ボタンのイベントリスナー設定
    const toggleBtn = document.getElementById('toggleLegendBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleLegend); // toggleLegendを直接呼び出す
        // 初期テキスト設定 (ボタンが見つかった場合のみ)
        const legendPanel = document.getElementById('legendPanel');
        if (legendPanel && legendPanel.style.display !== 'none') {
            toggleBtn.textContent = '凡例を非表示';
        } else if (legendPanel) {
            toggleBtn.textContent = '凡例を表示';
            // legendPanel.style.display = 'none'; // 初期状態はHTML/CSSで設定推奨
        }
    } else {
        console.error("Toggle legend button (id='toggleLegendBtn') not found!");
    }

    // クリッピング解除ボタンのイベントリスナー設定
    const clearClipBtn = document.getElementById('clearClipButton');
    if (clearClipBtn) {
        clearClipBtn.addEventListener('click', () => {
            console.log("Clear clip button clicked. Calling clearClippingPlanes..."); // 呼び出し前ログ
            try {
                clearClippingPlanes(); // viewer.jsの関数を呼び出す
            } catch (error) {
                 console.error("Error occurred during clearClippingPlanes call from ui.js:", error);
            }
        });
    } else {
        console.error("Clear clip button (id='clearClipButton') not found! Check HTML id.");
    }

    // 初期チェック状態を反映 (これはUI初期化の一部として残しても良い)
    document.querySelectorAll('#elementSelector input[name="elements"]').forEach(checkbox => {
        const elementType = checkbox.value;
        const isVisible = checkbox.checked;
        if (elementGroups[elementType]) {
            elementGroups[elementType].visible = isVisible;
        }
    });
    updateAllLabelVisibility(); // 初期ラベル表示
}


// --- HTMLから呼び出される関数 ---

/**
 * 凡例パネルの表示/非表示を切り替える。
 */
export function toggleLegend() {
  const legendPanel = document.getElementById('legendPanel');
  if (legendPanel) {
    const isVisible = legendPanel.style.display !== 'none';
    legendPanel.style.display = isVisible ? 'none' : 'block';
    const toggleBtn = document.getElementById('toggleLegendBtn');
    if (toggleBtn) {
      toggleBtn.textContent = isVisible ? '凡例を表示' : '凡例を非表示';
    }
  }
}

/**
 * 選択された階の高さに基づいてクリッピングを適用する。
 */
export function applyStoryClip() {
  console.log("applyStoryClip function called.");
  const select = document.getElementById('storySelector');
  if (select.value && globalStories.length > 0 && !select.disabled) {
    const centerZ = parseFloat(select.value);
    console.log(`Applying clipping around Z = ${centerZ}. Calling setClippingRange...`); // 呼び出し前ログ
    try {
        setClippingRange(centerZ); // viewer.jsの関数を呼び出す
        // ★★★ ここで renderer を直接参照しているコードがないか確認 ★★★
        // 例: console.log(renderer.info); などが残っていないか？
    } catch (error) {
        console.error("Error occurred during setClippingRange call from ui.js:", error);
    }
  } else if (globalStories.length === 0) {
    alert("比較対象のモデルに階情報が含まれていません。");
  } else {
    alert("階を選択してください。");
  }
}