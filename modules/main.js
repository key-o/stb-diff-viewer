import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';
import {
    scene, camera, controls, materials, elementGroups, SUPPORTED_ELEMENTS,
    clearSceneContent, createOrUpdateGridHelper, adjustCameraToFitModel,
    animate, setupResizeListener,
    drawLineElements, drawPolyElements, drawNodes,
    initRenderer
} from './viewer.js';
import { parseXml, buildNodeMap, parseStories, parseElements } from './stbParser.js';
import {
    compareElements, lineElementKeyExtractor, polyElementKeyExtractor, nodeElementKeyExtractor
} from './comparator.js';
import {
    updateStorySelector, updateAllLabelVisibility, setupUIEventListeners, // setupUIEventListenersをインポート
    toggleLegend, applyStoryClip, setGlobalStateForUI
} from './ui.js';

// --- グローバル状態変数 (変更なし) ---
let stories = [];
let nodeMapA = new Map();
let nodeMapB = new Map();
let nodeLabels = [];
let modelBounds = new THREE.Box3();
let rendererInitialized = false;

setGlobalStateForUI(nodeLabels, stories);

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener('DOMContentLoaded', () => {
    const canvasElement = document.getElementById('three-canvas');
    if (canvasElement) {
        controls.domElement = canvasElement;
        controls.update();
    } else {
         console.error("Canvas element not found for OrbitControls after DOMContentLoaded.");
    }

    if (initRenderer()) {
        rendererInitialized = true;
        console.log("Renderer initialized successfully via DOMContentLoaded.");
        startApp(); // レンダラー初期化成功後にアプリを開始
    } else {
        console.error("Renderer initialization failed. Cannot start application.");
        alert("3Dビューアの初期化に失敗しました。");
    }
});

// --- アプリケーション開始関数 ---
function startApp() {
    // --- HTMLから呼び出す関数をwindowに登録 ---
    window.compareModels = compareModels;
    window.applyStoryClip = applyStoryClip;
    window.toggleLegend = toggleLegend;

    // --- 初期化処理 ---
    setupUIEventListeners(); // ★★★ ここでUIイベントリスナーを設定 ★★★
    setupResizeListener(camera);
    updateStorySelector();
    controls.target.set(0, 0, 0);
    controls.update();
    animate(controls, scene, camera);
    createOrUpdateGridHelper(modelBounds);
}


// --- メイン処理関数 (compareModels) ---
async function compareModels() {
    // レンダラーが初期化されていない場合は処理中断
    if (!rendererInitialized) {
        alert("ビューアが初期化されていません。");
        return;
    }

    const fileAInput = document.getElementById('fileA');
    const fileBInput = document.getElementById('fileB');
    const fileA = fileAInput.files[0];
    const fileB = fileBInput.files[0];

    if (!fileA && !fileB) {
        alert('表示するモデルファイル（モデルAまたはモデルB）を選択してください。');
        return;
    }

    const selectedElementTypes = [...document.querySelectorAll('#elementSelector input[name="elements"]:checked')]
        .map(cb => cb.value);
    console.log("Selected elements for comparison:", selectedElementTypes);
    if (selectedElementTypes.length === 0) {
        console.warn("表示する要素が選択されていません。");
    }

    const compareButton = document.querySelector('#overlay button[onclick="window.compareModels()"]');
    if(compareButton) { // ボタンが存在するか確認
        compareButton.textContent = '読込/比較中...';
        compareButton.disabled = true;
    }
    document.getElementById('overlay').style.cursor = 'wait';

    // --- 既存のシーン内容をクリア ---
    modelBounds = clearSceneContent(elementGroups, nodeLabels);
    stories.length = 0;
    nodeMapA.clear();
    nodeMapB.clear();

    let docA = null, docB = null;

    try {
        if (fileA) {
            const textA = await fileA.text();
            docA = parseXml(textA);
            if (!docA) throw new Error("モデルAの解析に失敗しました。");
            nodeMapA = buildNodeMap(docA);
            stories.push(...parseStories(docA));
        }
        if (fileB) {
            const textB = await fileB.text();
            docB = parseXml(textB);
            if (!docB) throw new Error("モデルBの解析に失敗しました。");
            nodeMapB = buildNodeMap(docB);
            if (!fileA) {
                stories.push(...parseStories(docB));
            }
        }

        updateStorySelector();

        // --- 要素ごとの比較と描画 ---
        modelBounds = new THREE.Box3(); // 描画前にリセット
        nodeLabels.length = 0; // 描画前に既存ラベルをクリア (clearSceneContentでもクリアされるが念のため)


        for (const elementType of SUPPORTED_ELEMENTS) {
            const isSelected = selectedElementTypes.includes(elementType);
            const showElementLabels = document.getElementById(`toggleLabel-${elementType}`)?.checked ?? false;
            console.log(`--- Processing ${elementType} (Selected: ${isSelected}, ShowLabels: ${showElementLabels}) ---`);

            const elementsA = parseElements(docA, 'Stb' + elementType);
            const elementsB = parseElements(docB, 'Stb' + elementType);
            let comparisonResult = null;
            let group = elementGroups[elementType];
            group.visible = isSelected;

            try {
                let createdLabels = [];
                if (elementType === 'Node') {
                    comparisonResult = compareElements(elementsA, elementsB, nodeMapA, nodeMapB, nodeElementKeyExtractor);
                    createdLabels = drawNodes(comparisonResult, materials, group, showElementLabels, modelBounds);
                } else if (elementType === 'Column') {
                    comparisonResult = compareElements(elementsA, elementsB, nodeMapA, nodeMapB, (el, nm) => lineElementKeyExtractor(el, nm, 'id_node_bottom', 'id_node_top'));
                    createdLabels = drawLineElements(comparisonResult, materials, group, elementType, showElementLabels, modelBounds);
                } else if (elementType === 'Girder' || elementType === 'Beam') {
                    comparisonResult = compareElements(elementsA, elementsB, nodeMapA, nodeMapB, (el, nm) => lineElementKeyExtractor(el, nm, 'id_node_start', 'id_node_end'));
                    createdLabels = drawLineElements(comparisonResult, materials, group, elementType, showElementLabels, modelBounds);
                } else if (elementType === 'Slab' || elementType === 'Wall') {
                    comparisonResult = compareElements(elementsA, elementsB, nodeMapA, nodeMapB, (el, nm) => polyElementKeyExtractor(el, nm, 'StbNodeIdOrder'));
                    drawPolyElements(comparisonResult, materials, group, modelBounds);
                }
                nodeLabels.push(...createdLabels);
            } catch (compError) {
                console.error(`Error comparing/drawing ${elementType}:`, compError);
            }

            if (comparisonResult) {
                console.log(`${elementType} - Matched: ${comparisonResult.matched.length}, Only A: ${comparisonResult.onlyA.length}, Only B: ${comparisonResult.onlyB.length}`);
            }
        }

        updateAllLabelVisibility();
        createOrUpdateGridHelper(modelBounds);
        adjustCameraToFitModel(modelBounds, camera, controls);

        // viewer.js の clearClippingPlanes を呼び出す
        const { clearClippingPlanes } = await import('./viewer.js'); // 動的にインポートして呼び出す（または通常通りimport）
        console.log("Clearing clipping after display...");
        clearClippingPlanes();
        // console.log("Clipping state after clear:", renderer.localClippingEnabled); // rendererに直接アクセスできない

    } catch (error) {
        console.error("処理中にエラー:", error);
        alert(`エラーが発生しました: ${error.message || '不明なエラー'}`);
        modelBounds = clearSceneContent(elementGroups, nodeLabels);
        stories.length = 0;
        nodeMapA.clear();
        nodeMapB.clear();
        createOrUpdateGridHelper(modelBounds);
    } finally {
        if(compareButton) { // ボタンが存在するか確認
            compareButton.textContent = 'モデルを表示/比較';
            compareButton.disabled = false;
        }
        document.getElementById('overlay').style.cursor = 'default';
    }
};