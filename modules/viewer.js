import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/OrbitControls.js';

// --- 定数 ---
export const SUPPORTED_ELEMENTS = ['Node', 'Column', 'Girder', 'Beam', 'Slab', 'Wall'];

// --- Three.js シーン設定 ---
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// --- カメラ設定 ---
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100000);
camera.position.set(5000, 5000, 10000);

// --- レンダラー設定 (初期化は後で行う) ---
export let renderer = null;
export function initRenderer() {
    const canvas = document.getElementById('three-canvas');
    if (!canvas) {
        console.error("Canvas element #three-canvas not found!");
        return false; // 初期化失敗
    }
    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.clippingPlanes = [];
        renderer.localClippingEnabled = false;
        // レンダラー初期化後にマテリアルのクリッピング平面を更新
        updateMaterialClippingPlanes();
        console.log("Renderer initialized successfully in initRenderer. Instance:", renderer); // 詳細ログ追加
        return true; // 初期化成功
    } catch (error) {
        console.error("Failed to initialize WebGLRenderer:", error);
        renderer = null; // 失敗時はnullに戻す
        return false; // 初期化失敗
    }
}

// --- コントロール設定 ---
// OrbitControlsはレンダラーのDOM要素が必要なので、これも遅延初期化するか、
// DOM要素だけ先に取得しておく。ここでは後者を採用。
const canvasElement = document.getElementById('three-canvas'); // 先に取得試行
export const controls = new OrbitControls(camera, canvasElement || document.body); // fallbackにdocument.bodyを指定

// --- ライト設定 ---
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1).normalize();
scene.add(light);
const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
scene.add(ambientLight);

// --- ヘルパー設定 ---
const axesHelper = new THREE.AxesHelper(5000);
scene.add(axesHelper);
export let gridHelper = null;

// --- マテリアル定義 (clippingPlanesは後で設定) ---
export const materials = {
  matched: new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
  onlyA: new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
  onlyB: new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
  lineMatched: new THREE.LineBasicMaterial({ color: 0x00aaff }),
  lineOnlyA: new THREE.LineBasicMaterial({ color: 0x00ff00 }),
  lineOnlyB: new THREE.LineBasicMaterial({ color: 0xff0000 }),
  polyMatched: new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
  polyOnlyA: new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
  polyOnlyB: new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
};

// レンダラー初期化後にマテリアルのclippingPlanesを更新する関数
function updateMaterialClippingPlanes() {
    if (!renderer) return;
    for (const key in materials) {
        if (materials[key]) { // マテリアルが存在するか確認
            materials[key].clippingPlanes = renderer.clippingPlanes;
            materials[key].needsUpdate = true; // 更新を反映させる
        }
    }
    console.log("Updated material clipping planes.");
}

// --- 要素グループの初期化 ---
export const elementGroups = {};
SUPPORTED_ELEMENTS.forEach(type => {
  elementGroups[type] = new THREE.Group();
  scene.add(elementGroups[type]);
});

// --- 描画関数 ---

/**
 * 指定されたテキストと位置を持つラベルスプライトを作成し、指定されたグループに追加する。
 * カメラからの距離に応じてスプライトのスケールを調整する。
 * @param {string} text - ラベルに表示するテキスト。
 * @param {THREE.Vector3} position - ラベルを表示する3D空間上の位置。
 * @param {THREE.Group} spriteGroup - 作成したスプライトを追加するグループ。
 * @param {string} elementType - ラベルが属する要素タイプ (表示制御用)。
 * @returns {THREE.Sprite|null} 作成されたラベルスプライト、またはエラー時にnull。
 */
export function createLabelSprite(text, position, spriteGroup, elementType) {
  const labelFontSize = 45;
  const labelCanvasWidth = 512;
  const labelCanvasHeight = 64;
  const labelBaseScaleX = 640;
  const labelBaseScaleY = 80;
  const labelOffsetX = labelCanvasWidth / 2;
  const labelOffsetY = labelCanvasHeight / 2;
  const referenceDistance = 5000;
  const minScaleFactor = 1.0;
  const maxScaleFactor = 30.0;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = labelCanvasWidth;
    canvas.height = labelCanvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error("Failed to get 2D context for label canvas.");
        return null;
    }
    ctx.clearRect(0, 0, labelCanvasWidth, labelCanvasHeight);
    ctx.font = `bold ${labelFontSize}px sans-serif`;
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.strokeText(text, labelOffsetX, labelOffsetY);
    ctx.fillText(text, labelOffsetX, labelOffsetY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;

    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, sizeAttenuation: true });
    const sprite = new THREE.Sprite(material);

    const baseScale = new THREE.Vector3(labelBaseScaleX, labelBaseScaleY, 1);
    sprite.userData.baseScale = baseScale;
    sprite.userData.referenceDistance = referenceDistance;
    sprite.userData.minScaleFactor = minScaleFactor;
    sprite.userData.maxScaleFactor = maxScaleFactor;
    sprite.userData.elementType = elementType;

    sprite.position.copy(position);

    sprite.onBeforeRender = function (renderer, scene, cameraInstance) {
      const spriteWorldPosition = new THREE.Vector3();
      this.getWorldPosition(spriteWorldPosition);
      const distance = spriteWorldPosition.distanceTo(cameraInstance.position);
      let scaleFactor = distance / this.userData.referenceDistance;
      scaleFactor = Math.max(this.userData.minScaleFactor, Math.min(scaleFactor, this.userData.maxScaleFactor));
      this.scale.copy(this.userData.baseScale).multiplyScalar(scaleFactor);
    };

    spriteGroup.add(sprite);
    return sprite;
  } catch (error) {
      console.error("Error creating label sprite:", error);
      return null;
  }
}

/**
 * 線分要素（柱、梁など）の比較結果を描画する。
 * @param {object} comparisonResult - compareElementsの比較結果。
 * @param {object} materials - マテリアルオブジェクト。
 * @param {THREE.Group} group - 描画対象の要素グループ。
 * @param {string} elementType - 描画する要素タイプ名 (例: 'Column')。
 * @param {boolean} labelToggle - ラベル表示の有無。
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス。
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列。
 */
export function drawLineElements(comparisonResult, materials, group, elementType, labelToggle, modelBounds) {
  group.clear();
  const createdLabels = [];
  const labelOffsetAmount = 150;

  comparisonResult.matched.forEach(({ dataA, dataB }) => {
    const startCoords = dataA.startCoords;
    const endCoords = dataA.endCoords;
    const idA = dataA.id;
    const idB = dataB.id;

    if (startCoords && endCoords &&
        Number.isFinite(startCoords.x) && Number.isFinite(startCoords.y) && Number.isFinite(startCoords.z) &&
        Number.isFinite(endCoords.x) && Number.isFinite(endCoords.y) && Number.isFinite(endCoords.z))
    {
        const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
        const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);
        const geometry = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
        const line = new THREE.Line(geometry, materials.lineMatched);
        group.add(line);
        modelBounds.expandByPoint(startVec);
        modelBounds.expandByPoint(endVec);

        if (labelToggle && (idA || idB)) {
          const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
          const labelText = `${idA || '?'} / ${idB || '?'}`;
          const sprite = createLabelSprite(labelText, midPoint, group, elementType); // ラベルは要素グループに追加
          if (sprite) createdLabels.push(sprite);
        }
    } else {
        console.warn(`Skipping matched line due to invalid coords: A=${idA}, B=${idB}`);
    }
  });

  comparisonResult.onlyA.forEach(({ startCoords, endCoords, id }) => {
    if (startCoords && endCoords &&
        Number.isFinite(startCoords.x) && Number.isFinite(startCoords.y) && Number.isFinite(startCoords.z) &&
        Number.isFinite(endCoords.x) && Number.isFinite(endCoords.y) && Number.isFinite(endCoords.z))
    {
        const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
        const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);
        const geometry = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
        const line = new THREE.Line(geometry, materials.lineOnlyA);
        group.add(line);
        modelBounds.expandByPoint(startVec);
        modelBounds.expandByPoint(endVec);

        if (labelToggle && id) {
          const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
          const direction = endVec.clone().sub(startVec).normalize();
          let offsetDir = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
          if (offsetDir.lengthSq() < 0.1) offsetDir = new THREE.Vector3(1, 0, 0);
          const labelPosition = midPoint.clone().add(offsetDir.multiplyScalar(labelOffsetAmount));
          const labelText = `A: ${id}`;
          const sprite = createLabelSprite(labelText, labelPosition, group, elementType);
          if (sprite) createdLabels.push(sprite);
        }
    } else {
        console.warn(`Skipping onlyA line due to invalid coords: ID=${id}`);
    }
  });

  comparisonResult.onlyB.forEach(({ startCoords, endCoords, id }) => {
    if (startCoords && endCoords &&
        Number.isFinite(startCoords.x) && Number.isFinite(startCoords.y) && Number.isFinite(startCoords.z) &&
        Number.isFinite(endCoords.x) && Number.isFinite(endCoords.y) && Number.isFinite(endCoords.z))
    {
        const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
        const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);
        const geometry = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
        const line = new THREE.Line(geometry, materials.lineOnlyB);
        group.add(line);
        modelBounds.expandByPoint(startVec);
        modelBounds.expandByPoint(endVec);

        if (labelToggle && id) {
          const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
          const direction = endVec.clone().sub(startVec).normalize();
          let offsetDir = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
          if (offsetDir.lengthSq() < 0.1) offsetDir = new THREE.Vector3(1, 0, 0);
          const labelPosition = midPoint.clone().sub(offsetDir.multiplyScalar(labelOffsetAmount));
          const labelText = `B: ${id}`;
          const sprite = createLabelSprite(labelText, labelPosition, group, elementType);
          if (sprite) createdLabels.push(sprite);
        }
    } else {
        console.warn(`Skipping onlyB line due to invalid coords: ID=${id}`);
    }
  });
  return createdLabels;
}

/**
 * ポリゴン要素（スラブ、壁など）の比較結果を描画する。
 * @param {object} comparisonResult - compareElementsの比較結果。
 * @param {object} materials - マテリアルオブジェクト。
 * @param {THREE.Group} group - 描画対象の要素グループ。
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス。
 */
export function drawPolyElements(comparisonResult, materials, group, modelBounds) {
  group.clear();

  const createMeshes = (dataList, material) => {
    dataList.forEach(({ vertexCoordsList }) => {
      if (vertexCoordsList.length < 3) return;
      const points = [];
      let validPoints = true;
      for (const p of vertexCoordsList) {
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
              points.push(new THREE.Vector3(p.x, p.y, p.z));
          } else {
              console.warn("Skipping polygon due to invalid vertex coord:", p);
              validPoints = false;
              break;
          }
      }
      if (!validPoints || points.length < 3) return;
      points.forEach(p => modelBounds.expandByPoint(p));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const indices = [];
      for (let i = 1; i < points.length - 1; i++) {
        indices.push(0, i, i + 1);
      }
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);
    });
  };

  createMeshes(comparisonResult.matched.map(item => item.dataA), materials.polyMatched);
  createMeshes(comparisonResult.onlyA, materials.polyOnlyA);
  createMeshes(comparisonResult.onlyB, materials.polyOnlyB);
}

/**
 * 節点要素の比較結果を描画する。
 * @param {object} comparisonResult - compareElementsの比較結果。
 * @param {object} materials - マテリアルオブジェクト。
 * @param {THREE.Group} group - 描画対象の要素グループ (節点メッシュ用)。
 * @param {boolean} labelToggle - ラベル表示の有無。
 * @param {THREE.Box3} modelBounds - 更新するモデル全体のバウンディングボックス。
 * @returns {Array<THREE.Sprite>} 作成されたラベルスプライトの配列。
 */
export function drawNodes(comparisonResult, materials, group, labelToggle, modelBounds) {
  group.clear();
  const createdLabels = [];

  comparisonResult.matched.forEach(({ dataA, dataB }) => {
    const coords = dataA.coords;
    const idA = dataA.id;
    const idB = dataB.id;
    if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y) && Number.isFinite(coords.z)) {
        const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
        const sphereGeo = new THREE.SphereGeometry(50, 12, 8);
        const sphere = new THREE.Mesh(sphereGeo, materials.matched);
        sphere.position.copy(pos);
        group.add(sphere);
        modelBounds.expandByPoint(pos);
        if (labelToggle) {
          const labelText = `${idA} / ${idB}`;
          const sprite = createLabelSprite(labelText, pos, group, 'Node'); // ラベルは要素グループに追加
          if (sprite) createdLabels.push(sprite);
        }
    } else {
        console.warn(`Skipping matched node due to invalid coords: A=${idA}, B=${idB}`);
    }
  });

  comparisonResult.onlyA.forEach(({ coords, id }) => {
    if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y) && Number.isFinite(coords.z)) {
        const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
        const sphereGeo = new THREE.SphereGeometry(50, 12, 8);
        const sphere = new THREE.Mesh(sphereGeo, materials.onlyA);
        sphere.position.copy(pos);
        group.add(sphere);
        modelBounds.expandByPoint(pos);
        if (labelToggle) {
          const labelText = `A: ${id}`;
          const sprite = createLabelSprite(labelText, pos, group, 'Node');
          if (sprite) createdLabels.push(sprite);
        }
    } else {
        console.warn(`Skipping onlyA node due to invalid coords: ID=${id}`);
    }
  });

  comparisonResult.onlyB.forEach(({ coords, id }) => {
    if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y) && Number.isFinite(coords.z)) {
        const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
        const sphereGeo = new THREE.SphereGeometry(50, 12, 8);
        const sphere = new THREE.Mesh(sphereGeo, materials.onlyB);
        sphere.position.copy(pos);
        group.add(sphere);
        modelBounds.expandByPoint(pos);
        if (labelToggle) {
          const labelText = `B: ${id}`;
          const sprite = createLabelSprite(labelText, pos, group, 'Node');
          if (sprite) createdLabels.push(sprite);
        }
    } else {
        console.warn(`Skipping onlyB node due to invalid coords: ID=${id}`);
    }
  });
  return createdLabels;
}

// --- シーン管理関数 ---

/**
 * シーン内のモデル要素（メッシュ、線分、ラベル）、バウンディングボックスをクリアする。
 * @param {Object<string, THREE.Group>} elementGroups - クリア対象の要素グループ。
 * @param {Array<THREE.Sprite>} nodeLabels - クリア対象のラベル配列。
 * @returns {THREE.Box3} 新しい空のバウンディングボックス。
 */
export function clearSceneContent(elementGroups, nodeLabels) {
  for (const type in elementGroups) {
    elementGroups[type].children.forEach(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    elementGroups[type].clear();
  }

  nodeLabels.forEach(label => {
      if (label.material.map) label.material.map.dispose();
      label.material.dispose();
      if (label.parent) {
          label.parent.remove(label);
      }
  });
  nodeLabels.length = 0; // 配列を空にする

  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper = null;
  }
  return new THREE.Box3(); // 新しいバウンディングボックスを返す
}

/**
 * モデルのバウンディングボックスに基づいてグリッドヘルパーを作成または更新する。
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス。
 */
export function createOrUpdateGridHelper(modelBounds) {
  if (gridHelper) { scene.remove(gridHelper); gridHelper = null; }

  if (modelBounds.isEmpty()) {
    gridHelper = new THREE.GridHelper(20000, 40, 0x888888, 0xcccccc);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  modelBounds.getCenter(center);
  modelBounds.getSize(size);

  const gridSize = Math.max(size.x, size.y, 10000) * 1.5;
  const divisions = Math.max(10, Math.floor(gridSize / 1000));
  console.log(`Creating grid: Size=${gridSize.toFixed(0)}, Divisions=${divisions}, Center(XY)=(${center.x.toFixed(0)}, ${center.y.toFixed(0)}), Z=${modelBounds.min.z.toFixed(0)}`);

  gridHelper = new THREE.GridHelper(gridSize, divisions, 0x888888, 0xcccccc);
  gridHelper.rotation.x = Math.PI / 2;
  gridHelper.position.set(center.x, center.y, modelBounds.min.z);
  scene.add(gridHelper);
}

/**
 * モデル全体のバウンディングボックスに合わせてカメラの位置とターゲットを調整する。
 * @param {THREE.Box3} modelBounds - モデル全体のバウンディングボックス。
 * @param {THREE.PerspectiveCamera} camera - 調整するカメラ。
 * @param {OrbitControls} controls - 調整するコントロール。
 */
export function adjustCameraToFitModel(modelBounds, camera, controls) {
  if (modelBounds.isEmpty()) {
    controls.target.set(0, 0, 0);
    camera.position.set(5000, 5000, 10000);
    controls.update();
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  modelBounds.getCenter(center);
  modelBounds.getSize(size);

  if (size.x === 0 && size.y === 0 && size.z === 0) {
    camera.position.set(center.x, center.y, center.z + 2000);
    controls.target.copy(center);
    controls.update();
    return;
  }

  const minSize = 1.0;
  if (size.x < minSize) size.x = minSize;
  if (size.y < minSize) size.y = minSize;
  if (size.z < minSize) size.z = minSize;

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
  cameraDist *= 2.0;

  if (!Number.isFinite(cameraDist) || cameraDist === 0) {
    cameraDist = maxDim * 2;
    if (cameraDist === 0) cameraDist = 5000;
  }

  const offsetFactor = 0.5;
  camera.position.set(
    center.x + size.x * offsetFactor * 0.5,
    center.y + size.y * offsetFactor * 0.5,
    center.z + cameraDist
  );
  controls.target.copy(center);
  console.log(`Adjusting Camera: Position=(${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)}), Target=(${controls.target.x.toFixed(0)}, ${controls.target.y.toFixed(0)}, ${controls.target.z.toFixed(0)})`);
  controls.update();
}

// --- クリッピング関数 ---

/**
 * 指定されたZ座標を中心に、上下一定範囲を表示するようにクリッピング平面を設定する。
 * @param {number} centerZ - クリッピングの中心となるZ座標。
 */
export function setClippingRange(centerZ) {
  console.log("setClippingRange called. Checking renderer state..."); // ログ追加
  if (!renderer) {
    console.error("Renderer is not initialized when setClippingRange was called!"); // エラーログ
    alert("クリッピングエラー: レンダラーが初期化されていません。");
    return;
  }
  console.log("Renderer found in setClippingRange:", renderer); // インスタンス確認ログ
  try {
      const clipPlanes = [
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -(centerZ - 1000)),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), centerZ + 1000)
      ];
      renderer.clippingPlanes.length = 0;
      renderer.clippingPlanes.push(...clipPlanes);
      renderer.localClippingEnabled = true;
      console.log("Clipping planes set. localClippingEnabled:", renderer.localClippingEnabled);
  } catch (error) {
      console.error("Error setting clipping planes:", error);
      alert("クリッピング中にエラーが発生しました。");
  }
}

/**
 * レンダラーのクリッピング平面を解除する。
 */
export function clearClippingPlanes() {
    console.log("clearClippingPlanes called. Checking renderer state..."); // ログ追加
    if (!renderer) {
        console.error("Renderer is not initialized when clearClippingPlanes was called!"); // エラーログ
        alert("クリッピング解除エラー: レンダラーが初期化されていません。");
        return;
    }
    console.log("Renderer found in clearClippingPlanes:", renderer); // インスタンス確認ログ
    try {
        console.log("Attempting to clear clipping...");
        renderer.clippingPlanes.length = 0;
        renderer.localClippingEnabled = false;
        console.log("Clipping planes cleared. localClippingEnabled:", renderer.localClippingEnabled);
    } catch (error) {
        console.error("Error clearing clipping planes:", error);
        alert("クリッピング解除中にエラーが発生しました。");
    }
}

// --- アニメーションループ ---
/**
 * Three.jsのレンダリングループ。毎フレーム呼び出される。
 */
export function animate(controls, scene, camera) {
  requestAnimationFrame(() => animate(controls, scene, camera));
  // レンダラーが初期化されるまで何もしない
  if (!renderer) return;
  controls.update();
  renderer.render(scene, camera);
}

// --- ウィンドウリサイズ処理 ---
export function setupResizeListener(camera) {
    window.addEventListener('resize', () => {
        // レンダラーが初期化されるまで何もしない
        if (!renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, false);
}