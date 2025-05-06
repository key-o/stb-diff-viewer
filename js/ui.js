/**
 * @fileoverview UI管理および操作モジュール
 *
 * このファイルは、アプリケーションのUI要素と操作に関する機能を提供します:
 * - UI要素の表示/非表示状態の管理
 * - セレクターとフィルターの操作処理
 * - クリッピング平面の適用制御
 * - ラベル表示の制御
 * - UIイベントリスナーのセットアップ
 * - 凡例表示の切り替え
 *
 * このモジュールは、HTMLインターフェースと3Dビューの連携を担当し、
 * ユーザー操作に応じた表示制御を行います。
 */

// ★★★ THREE ライブラリをインポート ★★★
import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
// ★★★ viewer モジュールからのインポートパス変更 ★★★
import {
  clearClippingPlanes,
  applyClipPlanes,
  elementGroups,
  SUPPORTED_ELEMENTS,
  // ★★★ requestRender をインポート (再描画要求用) ★★★
  renderer, // requestRender がなければ renderer を直接使う
} from "./viewer/index.js"; // ★★★ パス変更済 ★★★
import { createLabel } from "./viewer/ui/labels.js"; // ★★★ パス変更済 ★★★

// --- グローバル状態 (UIモジュール内) ---
let allLabels = []; // すべてのラベルオブジェクトを保持
let currentStories = []; // 現在の階情報
let currentAxesData = { xAxes: [], yAxes: [] }; // 現在の軸情報

// --- UI要素への参照 ---
const storySelector = document.getElementById("storySelector");
const xAxisSelector = document.getElementById("xAxisSelector");
const yAxisSelector = document.getElementById("yAxisSelector");
const legendPanel = document.getElementById("legendPanel");
const elementSelector = document.getElementById("elementSelector");
// ★★★ モデル表示チェックボックスへの参照を追加 ★★★
const toggleModelACheckbox = document.getElementById("toggleModelA");
const toggleModelBCheckbox = document.getElementById("toggleModelB");

/**
 * UIモジュールで使用するグローバル状態を設定/更新する
 * @param {Array} labels - すべてのラベルオブジェクトの配列
 * @param {Array} stories - 階情報の配列
 * @param {Object} axesData - 軸情報オブジェクト
 */
export function setGlobalStateForUI(labels, stories, axesData) {
  allLabels = labels;
  currentStories = stories;
  currentAxesData = axesData;
  console.log("UI State Updated:", {
    labelCount: allLabels.length,
    storyCount: currentStories.length,
    axisCountX: currentAxesData.xAxes.length,
    axisCountY: currentAxesData.yAxes.length,
  });
}

/**
 * ストーリーセレクターを更新する
 */
export function updateStorySelector() {
  // ★★★ 関数呼び出しと使用するデータをログ出力 ★★★
  console.log("Updating Story Selector with stories:", currentStories);
  if (!storySelector) {
    console.warn("Story selector element not found.");
    return;
  }

  // 既存のオプションをクリア
  storySelector.innerHTML = "";

  // デフォルトオプションを追加
  const defaultOption = document.createElement("option");
  defaultOption.value = "none";
  defaultOption.textContent = "階を選択...";
  storySelector.appendChild(defaultOption);

  if (currentStories && currentStories.length > 0) {
    currentStories.forEach((story) => {
      const option = document.createElement("option");
      option.value = story.name; // または story.id など一意な値
      option.textContent = `${story.name} (高さ: ${story.height})`;
      storySelector.appendChild(option);
    });
    storySelector.disabled = false; // データがあれば有効化
    console.log(
      `Story selector updated with ${currentStories.length} stories.`
    );
  } else {
    // データがない場合はデフォルトオプションのみ表示し、無効化する
    defaultOption.textContent = "階情報なし";
    storySelector.disabled = true;
    console.log("No story data available for selector.");
  }
}

/**
 * 軸セレクターを更新する
 */
export function updateAxisSelectors() {
  // ★★★ 関数呼び出しと使用するデータをログ出力 ★★★
  console.log("Updating Axis Selectors with data:", currentAxesData);
  if (!xAxisSelector || !yAxisSelector) {
    console.warn("Axis selector elements not found.");
    return;
  }

  // --- X軸セレクターの更新 ---
  xAxisSelector.innerHTML = ""; // クリア
  const defaultXOption = document.createElement("option");
  defaultXOption.value = "none";
  defaultXOption.textContent = "X軸を選択...";
  xAxisSelector.appendChild(defaultXOption);

  if (
    currentAxesData &&
    currentAxesData.xAxes &&
    currentAxesData.xAxes.length > 0
  ) {
    currentAxesData.xAxes.forEach((axis) => {
      const option = document.createElement("option");
      option.value = axis.name; // または axis.id
      option.textContent = axis.name;
      xAxisSelector.appendChild(option);
    });
    xAxisSelector.disabled = false; // 有効化
    console.log(
      `X-Axis selector updated with ${currentAxesData.xAxes.length} axes.`
    );
  } else {
    defaultXOption.textContent = "X軸情報なし";
    xAxisSelector.disabled = true; // 無効化
    console.log("No X-axis data available for selector.");
  }

  // --- Y軸セレクターの更新 ---
  yAxisSelector.innerHTML = ""; // クリア
  const defaultYOption = document.createElement("option");
  defaultYOption.value = "none";
  defaultYOption.textContent = "Y軸を選択...";
  yAxisSelector.appendChild(defaultYOption);

  if (
    currentAxesData &&
    currentAxesData.yAxes &&
    currentAxesData.yAxes.length > 0
  ) {
    currentAxesData.yAxes.forEach((axis) => {
      const option = document.createElement("option");
      option.value = axis.name; // または axis.id
      option.textContent = axis.name;
      yAxisSelector.appendChild(option);
    });
    yAxisSelector.disabled = false; // 有効化
    console.log(
      `Y-Axis selector updated with ${currentAxesData.yAxes.length} axes.`
    );
  } else {
    defaultYOption.textContent = "Y軸情報なし";
    yAxisSelector.disabled = true; // 無効化
    console.log("No Y-axis data available for selector.");
  }
}

/**
 * すべてのラベルの表示/非表示を更新する
 */
export function updateAllLabelVisibility() {
  console.log(`Updating visibility for ${allLabels.length} labels...`);
  if (!allLabels || allLabels.length === 0) {
    console.log("No labels to update.");
    return;
  }

  // ★★★ モデル表示状態を取得 ★★★
  const isModelAVisible = toggleModelACheckbox
    ? toggleModelACheckbox.checked
    : false;
  const isModelBVisible = toggleModelBCheckbox
    ? toggleModelBCheckbox.checked
    : false;

  allLabels.forEach((label) => {
    if (!label || !label.userData || !label.userData.elementType) {
      console.warn(
        "Skipping label update: Missing userData or elementType",
        label
      );
      return;
    }

    const elementType = label.userData.elementType;
    const modelSource = label.userData.modelSource; // 'A', 'B', 'matched', or undefined for Axis/Story

    // 1. 要素タイプ自体の表示状態を取得
    const elementCheckbox = document.querySelector(
      `#elementSelector input[name="elements"][value="${elementType}"]`
    );
    const isElementTypeVisible = elementCheckbox
      ? elementCheckbox.checked
      : false;

    // 2. この要素タイプのラベル表示状態を取得
    const labelCheckbox = document.getElementById(`toggleLabel-${elementType}`);
    const showLabelsForType = labelCheckbox ? labelCheckbox.checked : false;

    // 3. モデル表示状態を考慮 (Axis/Story以外)
    let isModelVisibleForLabel = true; // デフォルトは表示 (Axis/Story用)
    if (elementType !== "Axis" && elementType !== "Story") {
      if (modelSource === "A") {
        isModelVisibleForLabel = isModelAVisible;
      } else if (modelSource === "B") {
        isModelVisibleForLabel = isModelBVisible;
      } else if (modelSource === "matched") {
        // matched は A または B が表示されていればOK
        isModelVisibleForLabel = isModelAVisible || isModelBVisible;
      } else {
        // modelSource が不明な場合はとりあえず表示しておくか、警告を出す
        console.warn(
          `Label for ${elementType} has unknown modelSource:`,
          label.userData
        );
        isModelVisibleForLabel = true; // 不明な場合は表示として扱う
      }
    }

    // 最終的な表示状態を決定
    const shouldBeVisible =
      isElementTypeVisible && showLabelsForType && isModelVisibleForLabel;

    // デバッグログ (変更時のみ)
    if (label.visible !== shouldBeVisible) {
      console.log(
        `Label '${
          label.userData.originalText || label.userData.elementId || "N/A"
        }' (${elementType}, ${modelSource || "N/A"}): Visibility ${
          label.visible
        } -> ${shouldBeVisible} (ElemVis: ${isElementTypeVisible}, LabelToggle: ${showLabelsForType}, ModelVis: ${isModelVisibleForLabel})`
      );
    }

    label.visible = shouldBeVisible;
  });

  // ★★★ 再描画を要求 ★★★
  // requestRender がグローバルに公開されている場合
  if (window.requestRender) {
    window.requestRender();
  } else if (renderer) {
    // renderer が直接インポートされている場合 (代替)
    // この方法は main.js の animate ループと競合する可能性があるため注意
    // renderer.render(scene, camera); // scene, camera もインポートが必要
  } else {
    console.warn("Cannot request render after updating label visibility.");
  }
}

/**
 * UI要素のイベントリスナーを設定する
 */
export function setupUIEventListeners() {
  // --- 要素表示チェックボックス ---
  const elementCheckboxes = document.querySelectorAll(
    '#elementSelector input[name="elements"]'
  );
  elementCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const elementType = checkbox.value;
      const isVisible = checkbox.checked;
      console.log(
        `Element type '${elementType}' visibility changed to ${isVisible}`
      );
      if (elementGroups[elementType]) {
        elementGroups[elementType].visible = isVisible;
        // ★★★ 要素表示が変わったら、関連するラベルの表示も更新 ★★★
        updateAllLabelVisibility();
        // ★★★ 再描画を要求 ★★★
        if (window.requestRender) window.requestRender();
      } else {
        console.warn(`Element group for type '${elementType}' not found.`);
      }
    });
  });

  // --- ラベル表示チェックボックス ---
  const labelToggleCheckboxes = document.querySelectorAll(
    '#elementSelector input[name="labelToggle"]'
  );
  labelToggleCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const elementType = checkbox.value; // value属性から要素タイプを取得
      const showLabels = checkbox.checked;
      console.log(
        `Label visibility for '${elementType}' changed to ${showLabels}`
      );
      // ★★★ ラベル表示状態が変わったら、すべてのラベル表示を更新 ★★★
      updateAllLabelVisibility();
      // 再描画は updateAllLabelVisibility 内で行われる
    });
  });

  // --- 階クリッピング ---
  if (storySelector) {
    // ★★★ ボタン要素を取得し、addEventListener を使用 ★★★
    const storyClipButton = document.getElementById("applyStoryClipButton");
    if (storyClipButton) {
      storyClipButton.addEventListener("click", () => {
        console.log("Story clip button clicked, calling applyStoryClip...");
        applyStoryClip(); // セレクターの値は関数内で取得
      });
    } else {
      console.warn("Apply Story Clip button not found.");
    }
  } else {
    console.warn("Story selector not found.");
  }

  // --- 軸クリッピング ---
  if (!xAxisSelector || !yAxisSelector) {
    console.warn("Axis selectors not found.");
  } else {
    // ★★★ X軸クリップボタンにリスナーを追加 ★★★
    const xAxisClipButton = document.getElementById("applyXAxisClipButton");
    if (xAxisClipButton) {
      xAxisClipButton.addEventListener("click", () => {
        console.log(
          "X-Axis clip button clicked, calling applyAxisClip('X')..."
        );
        applyAxisClip("X");
      });
    } else {
      console.warn("Apply X-Axis Clip button not found.");
    }

    // ★★★ Y軸クリップボタンにリスナーを追加 ★★★
    const yAxisClipButton = document.getElementById("applyYAxisClipButton");
    if (yAxisClipButton) {
      yAxisClipButton.addEventListener("click", () => {
        console.log(
          "Y-Axis clip button clicked, calling applyAxisClip('Y')..."
        );
        applyAxisClip("Y");
      });
    } else {
      console.warn("Apply Y-Axis Clip button not found.");
    }
  }

  // --- クリッピング解除ボタン ---
  const clearClipButton = document.getElementById("clearClipButton");
  if (clearClipButton) {
    clearClipButton.addEventListener("click", () => {
      console.log("Clear Clip Button clicked.");
      clearClippingPlanes();
      // ★★★ セレクトボックスの選択を解除 ★★★
      if (storySelector) storySelector.value = "none";
      if (xAxisSelector) xAxisSelector.value = "none";
      if (yAxisSelector) yAxisSelector.value = "none";
      // ★★★ 再描画を要求 ★★★
      console.log("Requesting render after clearing clips..."); // ログ追加
      if (window.requestRender) {
        window.requestRender();
        console.log("window.requestRender() called."); // ログ追加
      } else {
        console.warn("window.requestRender not found after clearing clips."); // ログ追加
      }
    });
  } else {
    console.warn("Clear Clip Button not found.");
  }

  // --- 凡例表示ボタン ---
  const toggleLegendBtn = document.getElementById("toggleLegendBtn");
  if (toggleLegendBtn) {
    // toggleLegend はグローバルスコープにある想定
  } else {
    console.warn("Toggle Legend Button not found.");
  }

  // ★★★ モデル表示チェックボックスのリスナーは main.js にあるため、ここでは不要 ★★★
  // const toggleModelACheckbox = document.getElementById("toggleModelA");
  // const toggleModelBCheckbox = document.getElementById("toggleModelB");
  // ... (これらのリスナーは main.js で updateModelVisibility を呼ぶ) ...

  console.log("UI Event Listeners setup complete.");
}

/**
 * 凡例パネルの表示/非表示を切り替える
 */
export function toggleLegend() {
  // ★★★ 実装を追加 ★★★
  if (!legendPanel) {
    console.warn("Legend panel element not found.");
    return;
  }
  const currentDisplay = legendPanel.style.display;
  if (currentDisplay === "none" || currentDisplay === "") {
    legendPanel.style.display = "block"; // 表示する
    console.log("Legend panel shown.");
  } else {
    legendPanel.style.display = "none"; // 非表示にする
    console.log("Legend panel hidden.");
  }
  // ★★★ ここまで追加 ★★★
}

/**
 * 指定されたストーリーに基づいてクリッピング平面を適用する
 */
export function applyStoryClip() {
  // 引数を削除し、関数内でセレクターの値を取得
  if (!storySelector) {
    console.error("Story selector not found for applying clip.");
    return;
  }
  const selectedStoryName = storySelector.value;
  console.log(`Apply Story Clip called for story: ${selectedStoryName}`); // ★★★ 呼び出しログ追加 ★★★

  if (selectedStoryName === "none") {
    console.log("No story selected for clipping.");
    // オプション: 何も選択されていない場合はクリッピングを解除する
    // clearClippingPlanes();
    // if (window.requestRender) window.requestRender();
    return;
  }

  const selectedStory = currentStories.find(
    (story) => story.name === selectedStoryName
  );

  if (!selectedStory) {
    console.error(`Story '${selectedStoryName}' not found in current stories.`);
    return;
  }

  // ★★★ 階高とマージンを mm 単位で扱う ★★★
  const storyHeightMM = selectedStory.height; // STBデータ由来 (mm想定)
  const clipMarginMM = 1000.0; // 階高の上下 1000mm (1m) でクリップ

  if (typeof storyHeightMM !== "number" || isNaN(storyHeightMM)) {
    console.error(
      `Invalid height for story '${selectedStoryName}': ${selectedStory.height}`
    );
    return;
  }

  console.log(
    `Applying story clip around height ${storyHeightMM}mm ± ${clipMarginMM}mm`
  );

  const planes = [
    // ★★★ 定数計算を mm 単位で行う ★★★
    new THREE.Plane(new THREE.Vector3(0, 0, -1), storyHeightMM + clipMarginMM), // 上面 (Y > height + margin => -Y < -(height + margin))
    new THREE.Plane(
      new THREE.Vector3(0, 0, 1),
      -(storyHeightMM - clipMarginMM)
    ), // 下面 (Y < height - margin)
  ];

  // ★★★ viewer モジュールの applyClipPlanes を使用 ★★★
  console.log(
    "Applying story clip planes:",
    planes.map((p) => ({ normal: p.normal, constant: p.constant }))
  );
  applyClipPlanes(planes);

  // ★★★ 再描画を要求 ★★★
  console.log("Requesting render after applying story clip...");
  if (window.requestRender) {
    window.requestRender();
    console.log("window.requestRender() called after story clip.");
  } else {
    console.warn("window.requestRender not found after applying story clip.");
  }
}

/**
 * 指定された軸に基づいてクリッピング平面を適用する
 * @param {string} axisType - 'X' または 'Y'
 */
export function applyAxisClip(axisType) {
  const selector = axisType === "X" ? xAxisSelector : yAxisSelector;
  const axesData =
    axisType === "X" ? currentAxesData.xAxes : currentAxesData.yAxes;

  if (!selector) {
    console.error(`${axisType}-Axis selector not found for applying clip.`);
    return;
  }
  const selectedAxisName = selector.value;
  console.log(
    `Apply Axis Clip called for ${axisType}-axis: ${selectedAxisName}`
  ); // ★★★ 呼び出しログ追加 ★★★

  if (selectedAxisName === "none") {
    console.log(`No ${axisType}-axis selected for clipping.`);
    return;
  }

  const selectedAxis = axesData.find((axis) => axis.name === selectedAxisName);

  if (!selectedAxis) {
    console.error(
      `${axisType}-Axis '${selectedAxisName}' not found in current axes data.`
    );
    return;
  }

  // ★★★ 軸の位置情報をログ出力 ★★★
  console.log(`Selected ${axisType}-Axis data:`, selectedAxis);
  if (typeof selectedAxis.distance === "undefined") {
    console.error(
      `Selected ${axisType}-Axis '${selectedAxisName}' does not have a 'distance' property.`
    );
    return;
  }
  // ★★★ 軸の位置を mm 単位のまま使用 ★★★
  const axisPositionMM = selectedAxis.distance; // 元の distance 値 (mm想定)
  console.log(`Selected ${axisType}-Axis distance (mm): ${axisPositionMM}`);

  if (typeof axisPositionMM !== "number" || isNaN(axisPositionMM)) {
    console.error(
      `Invalid position (distance) for ${axisType}-Axis '${selectedAxisName}'. Original distance: ${selectedAxis.distance}`
    );
    return;
  }

  // ★★★ マージンも mm 単位で定義 ★★★
  const clipMarginMM = 500.0; // 軸から左右 500mm (0.5m) でクリップ
  console.log(
    `Applying axis clip around position ${axisPositionMM}mm ± ${clipMarginMM}mm`
  );

  let planes = [];
  if (axisType === "X") {
    // X軸 (YZ平面) でクリップ (Three.js X軸)
    planes = [
      new THREE.Plane(
        new THREE.Vector3(-1, 0, 0),
        axisPositionMM + clipMarginMM
      ), // Keep x < P + M
      new THREE.Plane(
        new THREE.Vector3(1, 0, 0),
        -(axisPositionMM - clipMarginMM)
      ), // Keep x > P - M
    ];
  } else {
    // Y軸 (XZ平面) でクリップ
    // ★★★ STBのY軸がThree.jsのZ軸に対応すると仮定して修正 ★★★
    console.log("Applying Y-axis clip using Three.js Z-axis normals.");
    planes = [
      new THREE.Plane(
        new THREE.Vector3(0, -1, 0), // Z方向の法線
        axisPositionMM + clipMarginMM
      ), // Keep z < P + M
      new THREE.Plane(
        new THREE.Vector3(0, 1, 0), // Z方向の法線
        -(axisPositionMM - clipMarginMM)
      ), // Keep z > P - M
    ];
    // --- 以前のY軸クリップロジック (コメントアウト) ---
    /*
    console.log("Applying Y-axis clip using Three.js Y-axis normals.");
    planes = [
      new THREE.Plane(
        new THREE.Vector3(0, -1, 0),
        axisPositionMM + clipMarginMM
      ), // Keep y < P + M
      new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        -(axisPositionMM - clipMarginMM)
      ), // Keep y > P - M
    ];
    */
  }

  // ★★★ viewer モジュールの applyClipPlanes を使用 ★★★
  console.log(
    `Applying ${axisType}-axis clip planes:`,
    planes.map((p) => ({ normal: p.normal, constant: p.constant }))
  );
  applyClipPlanes(planes);

  // ★★★ 再描画を要求 ★★★
  console.log(`Requesting render after applying ${axisType}-axis clip...`);
  if (window.requestRender) {
    window.requestRender();
    console.log(`window.requestRender() called after ${axisType}-axis clip.`);
  } else {
    console.warn(
      `window.requestRender not found after applying ${axisType}-axis clip.`
    );
  }
}
