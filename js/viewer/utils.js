import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { renderer, scene, camera, controls, elementGroups } from "./core.js"; // elementGroups もインポート
import { materials } from "./materials.js"; // materials をインポート

/**
 * レンダリングループを開始する
 */
export function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update(); // controls が存在する場合のみ update を呼び出す
  if (renderer && scene && camera) {
    // renderer, scene, camera が存在する場合のみ render を呼び出す
    renderer.render(scene, camera);
  }
}

/**
 * シーン内のモデル要素（メッシュ、線分、ラベル）、バウンディングボックスをクリアする。
 * @param {Object<string, THREE.Group>} elementGroups - クリア対象の要素グループ。
 * @param {Array<THREE.Sprite>} nodeLabels - クリア対象のラベル配列。
 * @returns {THREE.Box3} 新しい空のバウンディングボックス。
 */
export function clearSceneContent(elementGroups, nodeLabels) {
  for (const type in elementGroups) {
    elementGroups[type].children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    elementGroups[type].clear();
  }

  nodeLabels.forEach((label) => {
    if (label.material.map) label.material.map.dispose();
    label.material.dispose();
    if (label.parent) {
      label.parent.remove(label);
    }
  });
  nodeLabels.length = 0;

  // グリッドヘルパーがあれば削除
  const existingGridHelper = scene.children.find(
    (child) => child instanceof THREE.GridHelper
  );
  if (existingGridHelper) {
    scene.remove(existingGridHelper);
  }
  return new THREE.Box3();
}

/**
 * モデルのバウンディングボックスに基づいてグリッドヘルパーを作成または更新する。
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス (mm単位)。
 */
export function createOrUpdateGridHelper(modelBounds) {
  // 既存のグリッドヘルパーを検索して削除
  const existingGridHelper = scene.children.find(
    (child) => child instanceof THREE.GridHelper
  );
  if (existingGridHelper) {
    scene.remove(existingGridHelper);
  }

  let newGridHelper;
  if (modelBounds.isEmpty()) {
    // ★★★ デフォルトグリッドも mm 単位に ★★★
    newGridHelper = new THREE.GridHelper(100000, 100, 0x888888, 0xcccccc); // 100m, 1m間隔
    newGridHelper.rotation.x = Math.PI / 2;
    scene.add(newGridHelper);
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  modelBounds.getCenter(center);
  modelBounds.getSize(size);

  // ★★★ グリッドサイズと分割数を mm 単位で調整 ★★★
  const gridSize = Math.max(size.x, size.y, 20000) * 1.5; // 最小20m
  const divisions = Math.max(10, Math.floor(gridSize / 1000)); // 1m間隔程度を目安に
  console.log(
    `Creating grid: Size=${gridSize.toFixed(
      0
    )}mm, Divisions=${divisions}, Center(XY)=(${center.x.toFixed(
      0
    )}mm, ${center.y.toFixed(0)}mm), Z=${modelBounds.min.z.toFixed(0)}mm`
  );

  newGridHelper = new THREE.GridHelper(gridSize, divisions, 0x888888, 0xcccccc);
  newGridHelper.rotation.x = Math.PI / 2;
  newGridHelper.position.set(center.x, center.y, modelBounds.min.z); // Z座標はモデルの最小Zに合わせる
  scene.add(newGridHelper);
}

/**
 * モデル全体のバウンディングボックスに合わせてカメラの位置とターゲットを調整する。
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス (mm単位)。
 * @param {THREE.PerspectiveCamera} camera - 調整するカメラ。
 * @param {OrbitControls} controls - 調整するコントロール。
 */
export function adjustCameraToFitModel(modelBounds, camera, controls) {
  if (modelBounds.isEmpty()) {
    controls.target.set(0, 0, 0);
    // ★★★ デフォルト位置も mm 単位に ★★★
    camera.position.set(10000, 10000, 20000); // 10m, 10m, 20m
    controls.update();
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  modelBounds.getCenter(center);
  modelBounds.getSize(size);

  if (size.x === 0 && size.y === 0 && size.z === 0) {
    // ★★★ 点データの場合のオフセットも mm 単位に ★★★
    camera.position.set(center.x, center.y, center.z + 5000); // 5m離れる
    controls.target.copy(center);
    controls.update();
    return;
  }

  // ★★★ 最小サイズも mm 単位に ★★★
  const minSize = 100; // 100mm
  if (size.x < minSize) size.x = minSize;
  if (size.y < minSize) size.y = minSize;
  if (size.z < minSize) size.z = minSize;

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
  // ★★★ 係数を再調整 (mmスケールなので、以前より小さくても良いかも) ★★★
  cameraDist *= 1.5; // 係数を 1.5 に戻してみる (必要なら再調整)

  if (!Number.isFinite(cameraDist) || cameraDist === 0) {
    cameraDist = maxDim * 2;
    // ★★★ デフォルト距離も mm 単位に ★★★
    if (cameraDist === 0) cameraDist = 10000; // 10m
  }

  // ★★★ オフセットも mm 単位で調整 ★★★
  const offsetFactor = 0.5; // この係数はそのままで良いかも
  camera.position.set(
    center.x + size.x * offsetFactor * 0.5,
    center.y + size.y * offsetFactor * 0.5, // Y方向にも少しオフセット
    center.z + cameraDist
  );
  controls.target.copy(center);
  console.log(
    `Adjusting Camera: Position=(${camera.position.x.toFixed(
      0
    )}mm, ${camera.position.y.toFixed(0)}mm, ${camera.position.z.toFixed(
      0
    )}mm), Target=(${controls.target.x.toFixed(
      0
    )}mm, ${controls.target.y.toFixed(0)}mm, ${controls.target.z.toFixed(0)}mm)`
  );
  controls.update();

  // ファークリップ面を再調整
  camera.far = Math.max(50000000, cameraDist * 3); // 以前の設定値と計算値の大きい方
  camera.updateProjectionMatrix();
}

/**
 * 指定された軸と中心座標に基づいてクリッピング平面を設定する。
 * @param {'X' | 'Y' | 'Z'} axis - クリッピングする軸。
 * @param {number} centerCoord - クリッピングの中心となる座標 (mm単位)。
 * @param {number} [range=1000] - 中心からのクリッピング範囲（片側、mm単位）。
 */
export function applyClipping(axis, centerCoord, range = 1000) {
  // ★★★ デフォルト値は 1000 (1m) のまま ★★★
  console.log(
    `applyClipping called for axis ${axis} at ${centerCoord}mm with range ${range}mm. Checking renderer state...` // ログの単位を明確化
  );
  if (!renderer) {
    console.error("Renderer is not initialized when applyClipping was called!");
    alert("クリッピングエラー: レンダラーが初期化されていません。");
    return;
  }
  console.log("Renderer found in applyClipping:", renderer);
  try {
    let planeNormal1 = new THREE.Vector3();
    let planeNormal2 = new THREE.Vector3();
    let constant1 = 0;
    let constant2 = 0;

    // ★★★ 定数計算は mm 単位で行われる ★★★
    switch (axis) {
      case "X":
        planeNormal1.set(1, 0, 0);
        planeNormal2.set(-1, 0, 0);
        constant1 = -(centerCoord - range); // X > center - range
        constant2 = centerCoord + range; // X < center + range => -X > -(center + range)
        break;
      case "Y":
        planeNormal1.set(0, 1, 0);
        planeNormal2.set(0, -1, 0);
        constant1 = -(centerCoord - range); // Y > center - range
        constant2 = centerCoord + range; // Y < center + range => -Y > -(center + range)
        break;
      case "Z":
      default: // デフォルトはZ軸（階）
        planeNormal1.set(0, 0, 1);
        planeNormal2.set(0, 0, -1);
        constant1 = -(centerCoord - range); // Z > center - range
        constant2 = centerCoord + range; // Z < center + range => -Z > -(center + range)
        break;
    }

    const clipPlanes = [
      new THREE.Plane(planeNormal1, constant1),
      new THREE.Plane(planeNormal2, constant2),
    ];

    // ★★★ applyClipPlanes を呼び出すように変更 ★★★
    // renderer.clippingPlanes.length = 0; // applyClipPlanes内でクリアされる想定
    // renderer.clippingPlanes.push(...clipPlanes);
    // renderer.localClippingEnabled = true;
    applyClipPlanes(clipPlanes); // 既存の applyClipPlanes 関数を再利用

    console.log(
      `Clipping planes set via applyClipPlanes for ${axis}-axis at ${centerCoord.toFixed(
        0
      )}mm ± ${range.toFixed(0)}mm.`
    );
  } catch (error) {
    console.error("Error setting clipping planes:", error);
    alert("クリッピング中にエラーが発生しました。");
  }
}

/**
 * レンダラーのクリッピング平面を解除する。
 */
export function clearClippingPlanes() {
  console.log("clearClippingPlanes called. Checking renderer state...");
  if (!renderer) {
    console.error(
      "Renderer is not initialized when clearClippingPlanes was called!"
    );
    alert("クリッピング解除エラー: レンダラーが初期化されていません。");
    return;
  }
  console.log("Renderer found in clearClippingPlanes:", renderer);
  try {
    console.log("Attempting to clear clipping...");
    renderer.clippingPlanes.length = 0;
    renderer.localClippingEnabled = false;
    console.log(
      "Clipping planes cleared. localClippingEnabled:",
      renderer.localClippingEnabled
    );
  } catch (error) {
    console.error("Error clearing clipping planes:", error);
    alert("クリッピング解除中にエラーが発生しました。");
  }
}

/**
 * 指定されたクリッピング平面をマテリアルに適用する
 * @param {Array<THREE.Plane>} planes - 適用するクリッピング平面の配列
 */
export function applyClipPlanes(planes) {
  if (!renderer) {
    console.error("Renderer not available in applyClipPlanes.");
    return;
  }
  if (!planes || planes.length === 0) {
    console.warn("No planes provided to applyClipPlanes.");
    // Optionally clear existing planes if none are provided
    // clearClippingPlanes();
    return;
  }

  // ★★★ 設定する平面の詳細をログ出力 ★★★
  console.log(`Applying ${planes.length} clipping planes to renderer:`);
  planes.forEach((plane, index) => {
    console.log(
      `  Plane ${index}: Normal=(${plane.normal.x.toFixed(
        3
      )}, ${plane.normal.y.toFixed(3)}, ${plane.normal.z.toFixed(
        3
      )}), Constant=${plane.constant.toFixed(3)}`
    );
  });

  renderer.clippingPlanes = planes;
  renderer.localClippingEnabled = true; // ローカルクリッピングを有効化

  console.log(
    `Applied ${planes.length} clipping planes. localClippingEnabled: ${renderer.localClippingEnabled}`
  );

  // ★★★ 再描画要求は呼び出し元で行うため、ここでは不要 ★★★
  // if (window.requestRender) {
  //     window.requestRender();
  // }
}

/**
 * すべてのマテリアルのクリッピング平面を更新する（レンダラー初期化時などに使用）
 */
export function updateMaterialClippingPlanes() {
  // ★★★ export を追加 ★★★
  const planes = renderer.clippingPlanes;
  Object.values(materials).forEach((material) => {
    if (material) {
      material.clippingPlanes = planes;
      material.needsUpdate = true;
    }
  });
  // 各要素グループ内のオブジェクトのマテリアルにも適用
  Object.values(elementGroups).forEach((group) => {
    group.children.forEach((child) => {
      if (child.material) {
        if (!Array.isArray(child.material)) {
          if (
            child.material instanceof THREE.MeshStandardMaterial ||
            child.material instanceof THREE.LineBasicMaterial ||
            child.material instanceof THREE.MeshBasicMaterial
          ) {
            child.material.clippingPlanes = planes;
            child.needsUpdate = true;
          }
        } else {
          child.material.forEach((mat) => {
            if (
              mat instanceof THREE.MeshStandardMaterial ||
              mat instanceof THREE.LineBasicMaterial ||
              mat instanceof THREE.MeshBasicMaterial
            ) {
              mat.clippingPlanes = planes;
              mat.needsUpdate = true;
            }
          });
        }
      }
    });
  });
  console.log("Updated clipping planes for all materials.");
  // 再描画を要求
  if (window.requestRender) {
    window.requestRender();
  }
}

/**
 * ウィンドウリサイズ時の処理を設定する
 * @param {THREE.PerspectiveCamera} camera - カメラ
 */
export function setupResizeListener(camera) {
  // ★★★ export を追加 ★★★
  window.addEventListener(
    "resize",
    () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      // 再描画を要求 (requestRender がグローバルにある場合)
      if (window.requestRender) {
        window.requestRender();
      }
    },
    false
  );
}
