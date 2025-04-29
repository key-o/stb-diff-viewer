import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
// ★★★ viewer モジュールのインポートパス変更 ★★★
import {
  scene,
  camera,
  controls,
  renderer,
  materials,
  elementGroups,
  SUPPORTED_ELEMENTS,
  clearSceneContent,
  createOrUpdateGridHelper,
  adjustCameraToFitModel,
  animate,
  setupResizeListener,
  drawLineElements,
  drawPolyElements,
  drawNodes,
  drawAxes,
  drawStories,
  initRenderer,
  clearClippingPlanes,
  updateMaterialClippingPlanes,
} from "./viewer/index.js"; // ★★★ パス変更済 ★★★
// ★★★ parser モジュールのインポートパス変更 ★★★
import {
  parseXml,
  buildNodeMap,
  parseStories,
  parseElements,
  parseAxes,
} from "./parser/stbXmlParser.js"; // ★★★ パス変更済 ★★★
// ★★★ comparator.js のパス修正 ★★★
import {
  compareElements,
  lineElementKeyExtractor,
  polyElementKeyExtractor,
  nodeElementKeyExtractor,
} from "./comparator.js"; // ★★★ パス修正 (./) ★★★
// ★★★ ui.js のパス修正 ★★★
import {
  updateStorySelector,
  updateAllLabelVisibility,
  setupUIEventListeners,
  toggleLegend,
  applyStoryClip,
  setGlobalStateForUI,
  updateAxisSelectors,
  applyAxisClip,
} from "./ui.js"; // ★★★ パス修正 (./) ★★★
// ★★★ viewer モジュール内のファイルのインポートパス変更 ★★★
import { displayElementInfo } from "./viewer/elementInfoDisplay.js"; // ★★★ パス変更済 ★★★
import { createColumnMeshes } from "./viewer/geometryGenerator.js"; // ★★★ パス変更済 ★★★
// ★★★ parser モジュール内のファイルのインポートパス変更 ★★★
import { parseStbFile } from "./parser/stbStructureReader.js"; // ★★★ パス変更済 ★★★

// --- グローバル状態変数 ---
let stories = [];
let nodeMapA = new Map();
let nodeMapB = new Map();
let nodeLabels = [];
let modelBounds = new THREE.Box3();
let rendererInitialized = false;
let axesData = { xAxes: [], yAxes: [] };
let docA = null;
let docB = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedObject = null;
let originalMaterial = null;
let modelsLoaded = false; // ★★★ モデルが読み込まれたかどうかのフラグを追加 ★★★
// ★★★ 追加: モデル表示状態 ★★★
let isModelAVisible = true;
let isModelBVisible = true;

// ★★★ 再描画をリクエストする関数 ★★★
function requestRender() {
  if (rendererInitialized) {
    console.log("Manual render requested");
    if (controls && scene && camera) {
      controls.update();
      renderer.render(scene, camera);
    }
  } else {
    console.warn("Cannot request render: Renderer not initialized");
  }
}

// ★★★ グローバルに公開 ★★★
window.requestRender = requestRender;

// ★★★ 追加: モデル表示状態に基づいてオブジェクトの表示/非表示を更新 ★★★
function updateModelVisibility() {
  console.log(
    `Updating model visibility: A=${isModelAVisible}, B=${isModelBVisible}`
  );
  SUPPORTED_ELEMENTS.forEach((elementType) => {
    const group = elementGroups[elementType];
    if (group) {
      group.children.forEach((child) => {
        if (child.userData && child.userData.modelSource) {
          const source = child.userData.modelSource;
          let shouldBeVisible = false;
          if (source === "A" && isModelAVisible) {
            shouldBeVisible = true;
          } else if (source === "B" && isModelBVisible) {
            shouldBeVisible = true;
          } else if (
            source === "matched" &&
            (isModelAVisible || isModelBVisible)
          ) {
            // matched はどちらかのモデルが表示されていれば表示
            shouldBeVisible = true;
          }
          // 要素タイプ自体の表示状態も考慮する
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`
          );
          const isElementTypeVisible = elementCheckbox
            ? elementCheckbox.checked
            : false;

          child.visible = shouldBeVisible && isElementTypeVisible;
        } else if (elementType === "Axis" || elementType === "Story") {
          // 軸と階はモデルA/Bに依存しないが、要素タイプのチェックボックスには従う
          const elementCheckbox = document.querySelector(
            `#elementSelector input[name="elements"][value="${elementType}"]`
          );
          const isElementTypeVisible = elementCheckbox
            ? elementCheckbox.checked
            : false;
          child.visible = isElementTypeVisible;
        }
      });
    }
  });
  // ラベルの表示状態も更新
  updateAllLabelVisibility();
  // 再描画を要求
  requestRender();
}

// --- compareModelsをHTMLから呼び出せるようにグローバルに設定 ---
window.compareModels = async function () {
  // レンダラーが初期化されていない場合は処理中断
  if (!rendererInitialized) {
    alert("ビューアが初期化されていません。");
    return;
  }

  // ★★★ 既存のモデルがある場合の処理を変更 - 警告メッセージなしで再読み込み可能に ★★★
  // if (modelsLoaded) {
  //   console.log("Models already loaded. To reload, refresh the page.");
  //   alert("モデルは既に読み込まれています。再読み込みするには、ページを更新してください。");
  //   return;
  // }

  const fileAInput = document.getElementById("fileA");
  const fileBInput = document.getElementById("fileB");
  const fileA = fileAInput.files[0];
  const fileB = fileBInput.files[0];

  if (!fileA && !fileB) {
    alert("表示するモデルファイル（モデルAまたはモデルB）を選択してください。");
    return;
  }

  const selectedElementTypes = [
    ...document.querySelectorAll(
      '#elementSelector input[name="elements"]:checked'
    ),
  ].map((cb) => cb.value);
  console.log("Selected elements for comparison:", selectedElementTypes);
  if (selectedElementTypes.length === 0) {
    console.warn("表示する要素が選択されていません。");
  }

  const compareButton = document.querySelector(
    '#overlay button[onclick="compareModels()"]'
  );
  if (compareButton) {
    compareButton.textContent = "読込/比較中...";
    compareButton.disabled = true;
  }
  document.getElementById("overlay").style.cursor = "wait";

  // --- 既存のシーン内容をクリア ---
  modelBounds = clearSceneContent(elementGroups, nodeLabels);
  stories.length = 0;
  nodeMapA.clear();
  nodeMapB.clear();
  axesData = { xAxes: [], yAxes: [] };
  docA = null;
  docB = null;
  window.docA = null;
  window.docB = null;

  // ★★★ モデルロード状態をリセット ★★★
  modelsLoaded = false;

  try {
    // ファイルAの処理
    if (fileA) {
      const textA = await fileA.text();
      docA = parseXml(textA);
      if (!docA) throw new Error("モデルAの解析に失敗しました。");
      nodeMapA = buildNodeMap(docA);
      stories.push(...parseStories(docA));
      axesData = parseAxes(docA);
      window.docA = docA;
    }
    // ファイルBの処理
    if (fileB) {
      const textB = await fileB.text();
      docB = parseXml(textB);
      if (!docB) throw new Error("モデルBの解析に失敗しました。");
      nodeMapB = buildNodeMap(docB);
      // モデルAがない場合のみ、モデルBから階と軸データを取得
      if (!fileA) {
        stories.length = 0;
        stories.push(...parseStories(docB));
        axesData = parseAxes(docB);
      }
      window.docB = docB;
    }

    // stories 配列から重複を除去し、高さでソート
    const uniqueStoriesMap = new Map();
    stories.forEach((s) => uniqueStoriesMap.set(s.height, s));
    stories = Array.from(uniqueStoriesMap.values()).sort(
      (a, b) => a.height - b.height
    );

    // ★★★ 軸データを含む最新の状態でUI状態を設定 (updateSelectors の前に) ★★★
    setGlobalStateForUI(nodeLabels, stories, axesData);

    // ★★★ UIセレクタを更新 (setGlobalStateForUI の後) ★★★
    updateStorySelector();
    updateAxisSelectors();

    // --- 要素ごとの比較と描画 ---
    modelBounds = new THREE.Box3();
    nodeLabels.length = 0;

    for (const elementType of SUPPORTED_ELEMENTS) {
      if (elementType === "Axis" || elementType === "Story") continue;

      const isSelected = selectedElementTypes.includes(elementType);
      // ★★★ UI用のラベル表示設定を保存しておく ★★★
      const showElementLabelsInUI =
        document.getElementById(`toggleLabel-${elementType}`)?.checked ?? false;
      // ★★★ ラベル作成のためには常に true を渡す ★★★
      const createLabels = true; // ラベルは常に作成

      console.log(
        `--- Processing ${elementType} (Selected: ${isSelected}, ShowLabels in UI: ${showElementLabelsInUI}, Creating Labels: ${createLabels}) ---`
      );

      const elementsA = parseElements(docA, "Stb" + elementType);
      const elementsB = parseElements(docB, "Stb" + elementType);
      let comparisonResult = null;
      let group = elementGroups[elementType];
      group.visible = isSelected;

      try {
        let createdLabels = [];
        if (elementType === "Node") {
          comparisonResult = compareElements(
            elementsA,
            elementsB,
            nodeMapA,
            nodeMapB,
            nodeElementKeyExtractor
          );
          // ★★★ ラベル作成用に createLabels (true) を渡す ★★★
          createdLabels = drawNodes(
            comparisonResult,
            materials,
            group,
            createLabels,
            modelBounds
          );
        } else if (elementType === "Column") {
          comparisonResult = compareElements(
            elementsA,
            elementsB,
            nodeMapA,
            nodeMapB,
            (el, nm) =>
              lineElementKeyExtractor(el, nm, "id_node_bottom", "id_node_top")
          );
          // ★★★ ラベル作成用に createLabels (true) を渡す ★★★
          createdLabels = drawLineElements(
            comparisonResult,
            materials,
            group,
            elementType,
            createLabels,
            modelBounds
          );
        } else if (elementType === "Girder" || elementType === "Beam") {
          comparisonResult = compareElements(
            elementsA,
            elementsB,
            nodeMapA,
            nodeMapB,
            (el, nm) =>
              lineElementKeyExtractor(el, nm, "id_node_start", "id_node_end")
          );
          // ★★★ ラベル作成用に createLabels (true) を渡す ★★★
          createdLabels = drawLineElements(
            comparisonResult,
            materials,
            group,
            elementType,
            createLabels,
            modelBounds
          );
        } else if (elementType === "Slab" || elementType === "Wall") {
          comparisonResult = compareElements(
            elementsA,
            elementsB,
            nodeMapA,
            nodeMapB,
            (el, nm) => polyElementKeyExtractor(el, nm, "StbNodeIdOrder")
          );
          // ★★★ ラベル作成用に createLabels (true) を渡す ★★★
          createdLabels = drawPolyElements(
            comparisonResult,
            materials,
            group,
            createLabels,
            modelBounds
          );
        }
        nodeLabels.push(...createdLabels);
      } catch (compError) {
        console.error(`Error comparing/drawing ${elementType}:`, compError);
      }

      if (comparisonResult) {
        console.log(
          `${elementType} - Matched: ${comparisonResult.matched.length}, Only A: ${comparisonResult.onlyA.length}, Only B: ${comparisonResult.onlyB.length}`
        );
      }
    }

    // --- 通り芯と階の描画 ---
    const showAxes = selectedElementTypes.includes("Axis");
    const showAxesLabels =
      document.getElementById("toggleLabel-Axis")?.checked ?? false;
    // ★★★ 通り芯も常にラベル作成 ★★★
    const createAxesLabels = true;
    elementGroups["Axis"].visible = showAxes;
    if (showAxes) {
      if (axesData.xAxes.length > 0 || axesData.yAxes.length > 0) {
        console.log(
          `--- Drawing Axes (ShowLabels in UI: ${showAxesLabels}, Creating Labels: ${createAxesLabels}) ---`
        );
        const axisLabels = drawAxes(
          axesData,
          elementGroups["Axis"],
          modelBounds,
          createAxesLabels
        );
        nodeLabels.push(...axisLabels);
      } else {
        console.warn(
          "--- Skipping Axes Drawing: No axis data parsed from the file. ---"
        );
      }
    }

    const showStories = selectedElementTypes.includes("Story");
    const showStoryLabels =
      document.getElementById("toggleLabel-Story")?.checked ?? false;
    // ★★★ 階も常にラベル作成 ★★★
    const createStoryLabels = true;
    elementGroups["Story"].visible = showStories;
    if (showStories && stories.length > 0) {
      console.log(
        `--- Drawing Stories (ShowLabels in UI: ${showStoryLabels}, Creating Labels: ${createStoryLabels}) ---`
      );
      const storyLabels = drawStories(
        stories,
        elementGroups["Story"],
        modelBounds,
        createStoryLabels
      );
      nodeLabels.push(...storyLabels);
    }

    // ★★★ すべてのラベルが nodeLabels 配列に追加された後にUI状態を設定 ★★★
    // ★★★ setGlobalStateForUI の呼び出し位置をここに変更 ★★★
    setGlobalStateForUI(nodeLabels, stories, axesData);

    // --- 描画後の処理 ---
    // ★★★ モデル表示状態に基づいて初期表示を更新 ★★★
    updateModelVisibility(); // この中で updateAllLabelVisibility が呼ばれ、要素表示状態も考慮される
    // updateAllLabelVisibility(); // updateModelVisibility内で呼ばれるため不要
    createOrUpdateGridHelper(modelBounds);
    adjustCameraToFitModel(modelBounds, camera, controls);

    console.log("Clearing clipping after display...");
    clearClippingPlanes();

    // ★★★ モデルが読み込まれたフラグをセット ★★★
    modelsLoaded = true;
  } catch (error) {
    console.error("処理中にエラー:", error);
    alert(`エラーが発生しました: ${error.message || "不明なエラー"}`);
    modelBounds = clearSceneContent(elementGroups, nodeLabels);
    stories.length = 0;
    nodeMapA.clear();
    nodeMapB.clear();
    axesData = { xAxes: [], yAxes: [] };
    nodeLabels.length = 0;
    createOrUpdateGridHelper(modelBounds);
    updateStorySelector();
    updateAxisSelectors();
    setGlobalStateForUI(nodeLabels, stories, axesData);
    docA = null;
    docB = null;
    window.docA = null;
    window.docB = null;
    modelsLoaded = false; // ★★★ エラー時にフラグをリセット ★★★
  } finally {
    if (compareButton) {
      // ★★★ ボタンのテキストを「モデル読み込み・再比較」に変更してモデルの更新が可能なことを明示 ★★★
      compareButton.textContent = modelsLoaded
        ? "モデル読み込み・再比較"
        : "モデルを表示/比較";
      compareButton.disabled = false;
    }
    document.getElementById("overlay").style.cursor = "default";
  }
};

// --- 柱の線/立体表示切替用 ---
let columnViewMode = "line"; // "line" または "solid"

async function redrawColumnsForViewMode() {
  // 必要なデータが揃っているかチェック
  if (!docA && !docB) return;
  // どちらか一方のモデルを使う（A優先）
  const doc = docA || docB;
  // ★★★ stbReader.jsのparseStbFileでデータ取得 (xmlDoc を渡す) ★★★
  // const xmlString = new XMLSerializer().serializeToString(doc); // 不要
  const stbData = parseStbFile(doc); // ★★★ doc を直接渡す ★★★
  const group = elementGroups["Column"];
  group.clear();

  if (columnViewMode === "solid") {
    // 立体表示
    const meshes = createColumnMeshes(
      stbData.columnElements,
      stbData.nodes,
      stbData.columnSections,
      stbData.steelSections
    );
    meshes.forEach((mesh) => group.add(mesh));
  } else {
    // 線表示（従来通り）
    const elementsA = parseElements(docA, "StbColumn");
    const elementsB = parseElements(docB, "StbColumn");
    const comparisonResult = compareElements(
      elementsA,
      elementsB,
      nodeMapA,
      nodeMapB,
      (el, nm) =>
        lineElementKeyExtractor(el, nm, "id_node_bottom", "id_node_top")
    );
    drawLineElements(
      comparisonResult,
      materials,
      group,
      "Column",
      true,
      modelBounds
    );
  }
  // 柱の表示モード切り替え後にラベルの表示/非表示を更新
  updateAllLabelVisibility();
  requestRender();
}

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener("DOMContentLoaded", () => {
  if (initRenderer()) {
    rendererInitialized = true;
    updateMaterialClippingPlanes();
    console.log("Renderer initialized successfully via DOMContentLoaded.");
    startApp();
  } else {
    console.error("Renderer initialization failed. Cannot start application.");
    alert("3Dビューアの初期化に失敗しました。");
  }

  // ★★★ 比較ボタンにイベントリスナーを追加 ★★★
  const compareBtn = document.getElementById("compareButton");
  if (compareBtn) {
    compareBtn.addEventListener("click", window.compareModels); // グローバルスコープの compareModels を呼び出す
  } else {
    console.error("Compare button not found.");
  }

  // ★★★ 既存の clearClipButton と toggleLegendBtn のリスナー設定もここにあることを確認 ★★★
  const clearButton = document.getElementById("clearClipButton");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      clearClippingPlanes();
    });
  } else {
    console.warn("Clear Clip Button not found.");
  }

  const toggleLegendBtn = document.getElementById("toggleLegendBtn");
  if (toggleLegendBtn) {
    toggleLegendBtn.addEventListener("click", toggleLegend);
  } else {
    console.warn("Toggle Legend Button not found.");
  }

  // 以前のボタン方式のコードを削除し、チェックボックス方式に変更
  const toggleColumnViewCheckbox = document.getElementById("toggleColumnView");
  if (toggleColumnViewCheckbox) {
    toggleColumnViewCheckbox.addEventListener("change", function () {
      // チェックが入っている場合は立体表示、そうでなければ線表示
      columnViewMode = this.checked ? "solid" : "line";
      redrawColumnsForViewMode();
      console.log("柱表示モード:", columnViewMode);
    });
  }

  // ★★★ 追加: モデル表示切り替えチェックボックスのリスナー ★★★
  const toggleModelACheckbox = document.getElementById("toggleModelA");
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener("change", function () {
      isModelAVisible = this.checked;
      console.log("Model A visibility changed:", isModelAVisible);
      updateModelVisibility(); // 表示状態を更新
    });
  } else {
    console.warn("Toggle Model A checkbox not found.");
  }

  const toggleModelBCheckbox = document.getElementById("toggleModelB");
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener("change", function () {
      isModelBVisible = this.checked;
      console.log("Model B visibility changed:", isModelBVisible);
      updateModelVisibility(); // 表示状態を更新
    });
  } else {
    console.warn("Toggle Model B checkbox not found.");
  }
});

// クリックイベント処理関数
function onDocumentMouseClick(event) {
  event.preventDefault();

  const canvas = document.getElementById("three-canvas");
  if (!canvas) return; // キャンバスがない場合は何もしない
  const rect = canvas.getBoundingClientRect();

  // マウス座標を正規化デバイス座標 (-1 to +1) に変換
  // overlay の高さを考慮しない（canvas基準の座標を使う）
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // --- 選択解除処理 (先に行う) ---
  if (selectedObject) {
    // マテリアルが存在する場合のみ元に戻す
    if (originalMaterial) {
      selectedObject.material = originalMaterial;
    } else {
      console.warn(
        "Original material not found for selected object:",
        selectedObject
      );
    }
    selectedObject = null;
    originalMaterial = null;
    // ★★★ 選択解除時に情報パネルもクリア (引数を変更) ★★★
    displayElementInfo(null, null, null);
  }

  const intersects = raycaster.intersectObjects(scene.children, true);

  // ★★★ 選択ロジック修正: 線要素 > 面要素 > Axis/Story の順で優先 ★★★
  let lineObject = null; // 最優先: 線要素
  let meshOrSpriteObject = null; // 次点: メッシュ or スプライト (Axis/Story除く)
  let axisOrStoryObject = null; // 最後: Axis/Story

  for (const intersect of intersects) {
    const obj = intersect.object;
    if (obj.userData && obj.userData.elementType) {
      const elementType = obj.userData.elementType;
      // グループが表示されているか確認
      const groupVisible =
        elementGroups[elementType] && elementGroups[elementType].visible;

      // グループが表示されている場合のみ考慮
      // ★★★ さらに、オブジェクト自体が表示されているかも確認 ★★★
      if (groupVisible && obj.visible) {
        // 1. 線要素 (Line) か？ (最優先、まだ見つかっていない場合)
        if (obj instanceof THREE.Line && !lineObject) {
          lineObject = obj;
          // 最優先が見つかったので、これ以上探す必要はない
          break;
        }
        // 2. Axis/Story 以外のメッシュ or スプライトか？ (次点、まだ見つかっていない場合)
        else if (
          (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) &&
          elementType !== "Axis" &&
          elementType !== "Story" &&
          !meshOrSpriteObject
        ) {
          meshOrSpriteObject = obj;
        }
        // 3. Axis/Story か？ (最後、まだ見つかっていない場合)
        else if (
          (elementType === "Axis" || elementType === "Story") &&
          !axisOrStoryObject
        ) {
          axisOrStoryObject = obj;
        }
      }
    }
    // userData がないオブジェクトは無視
  }

  // 優先順位に従って選択対象を決定
  const objectToSelect = lineObject || meshOrSpriteObject || axisOrStoryObject;

  // ★★★ 選択されたオブジェクトに基づいて処理 ★★★
  if (objectToSelect && objectToSelect.userData) {
    const userData = objectToSelect.userData;
    const elementType = userData.elementType || userData.stbNodeType;

    // ★★★ Axis と Story 以外の場合のみハイライト処理を実行 ★★★
    if (elementType && elementType !== "Axis" && elementType !== "Story") {
      // --- ハイライト処理 ---
      selectedObject = objectToSelect;
      // 元のマテリアルが配列の場合も考慮 (MultiMaterial など)
      if (Array.isArray(selectedObject.material)) {
        originalMaterial = selectedObject.material.map((mat) => mat.clone());
      } else if (selectedObject.material) {
        originalMaterial = selectedObject.material.clone(); // 複製して保存
      } else {
        originalMaterial = null; // マテリアルがない場合
      }

      // オブジェクトの種類に応じてハイライトマテリアルを選択
      let highlightMat = null;
      if (selectedObject instanceof THREE.Line) {
        highlightMat = materials.highlightLine;
      } else if (
        selectedObject instanceof THREE.Mesh ||
        selectedObject instanceof THREE.Sprite
      ) {
        highlightMat = materials.highlightMesh;
      } else {
        console.log(
          "Highlighting an object that is not Line, Mesh, or Sprite:",
          selectedObject
        );
      }

      // ハイライトマテリアルを適用
      if (highlightMat && selectedObject.material) {
        selectedObject.material = highlightMat;
      } else if (highlightMat) {
        console.warn(
          "Cannot apply highlight: Selected object has no material.",
          selectedObject
        );
      }

      console.log("Highlighted Object:", selectedObject);

      // --- 情報表示処理 (ハイライト対象のみ) ---
      const modelSource = userData.modelSource;

      // ★★★ 柱のMesh選択時も情報表示（stbElementId優先）★★★
      if (
        elementType === "Column" ||
        elementType === "Column (fallback line)"
      ) {
        // Columnの場合はmodelSourceに応じてA/B両方のIDを取得
        let idA = null,
          idB = null;
        if (modelSource === "matched") {
          idA = userData.elementIdA || userData.elementId;
          idB = userData.elementIdB;
        } else if (modelSource === "A") {
          idA = userData.elementId;
        } else if (modelSource === "B") {
          idB = userData.elementId;
        }
        displayElementInfo(idA, idB, "Column");
      }
      // ★★★ その他のハイライト対象要素の情報表示 ★★★
      else {
        let idA = null;
        let idB = null;
        if (modelSource === "matched") {
          idA = userData.elementIdA || userData.elementId;
          idB = userData.elementIdB;
          console.log(
            `Displaying info for matched ${elementType}: A=${idA}, B=${idB}`
          );
        } else if (modelSource === "A") {
          idA = userData.elementId;
          console.log(`Displaying info for A-only ${elementType}: ${idA}`);
        } else if (modelSource === "B") {
          idB = userData.elementId;
          console.log(`Displaying info for B-only ${elementType}: ${idB}`);
        } else {
          idA = userData.elementId;
          console.warn(
            `Displaying info for ${elementType} with unknown modelSource. ID: ${idA}`
          );
        }
        if (idA || idB) {
          displayElementInfo(idA, idB, elementType);
        } else {
          // ハイライトしたがIDがない場合もクリア
          displayElementInfo(null, null, null);
        }
      }
    } else if (elementType === "Axis" || elementType === "Story") {
      // ★★★ Axis/Story がクリックされた場合: ハイライトせず、情報パネルをクリア ★★★
      console.log(`Clicked on ${elementType}, skipping highlight.`);
      displayElementInfo(null, null, null);
    } else {
      // ★★★ その他の予期しないケース: ハイライトせず、情報パネルをクリア ★★★
      console.warn(
        `Clicked on object with unknown or invalid elementType: ${elementType}. Skipping highlight.`
      );
      displayElementInfo(null, null, null);
    }
  } else {
    // ★★★ 交差したが有効なオブジェクトが見つからなかった場合 (背景など) ★★★
    // 選択解除処理は既に行われているので、ここでは何もしないか、念のためクリア
    displayElementInfo(null, null, null);
  }

  // ★★★ 再描画要求を追加 ★★★
  requestRender();
}

// --- アプリケーション開始関数 ---
function startApp() {
  // HTMLから呼び出す関数をwindowに登録
  window.toggleLegend = toggleLegend;
  window.applyStoryClip = applyStoryClip;
  window.applyAxisClip = applyAxisClip;
  // ★★★ 追加: updateModelVisibility もグローバルにする必要があれば追加 ★★★
  // window.updateModelVisibility = updateModelVisibility;

  // 初期化処理
  setupUIEventListeners();
  setupResizeListener(camera);
  updateStorySelector();
  updateAxisSelectors();
  controls.target.set(0, 0, 0);
  controls.update();
  animate(controls, scene, camera);
  createOrUpdateGridHelper(modelBounds);

  // クリックイベントリスナーを登録
  const canvasElement = document.getElementById("three-canvas");
  if (canvasElement) {
    canvasElement.addEventListener("click", onDocumentMouseClick, false);
  } else {
    console.error("Canvas element not found for click listener.");
  }
}

// グローバルスコープに関数を公開 (HTMLから呼び出すため)
window.clearClippingPlanes = clearClippingPlanes;
window.displayElementInfo = displayElementInfo;
