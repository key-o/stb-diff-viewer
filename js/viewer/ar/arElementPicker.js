/**
 * @fileoverview AR中の要素ピック（FR-6.1）
 *
 * AR空間でのタップ位置から配置済みモデルの要素を特定します。
 * バッチ描画（節点=InstancedMesh の instances[]、線要素=LineSegments の
 * segments[]）にも対応し、個別要素の userData を解決します。
 * DOM非依存で、レイキャスト結果の解決ロジックは純関数として分離しています。
 */

import * as THREE from 'three';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('viewer/ar/arElementPicker');

/**
 * AR空間（m単位）での線要素ピックの許容距離。
 * デスクトップ（mm単位）の既定値1では画面全体がヒットしてしまうため、
 * 指先サイズ相当の値に絞る。
 */
export const AR_LINE_PICK_THRESHOLD_M = 0.03;

/** AR空間（m単位）での点要素ピックの許容距離 */
export const AR_POINTS_PICK_THRESHOLD_M = 0.03;

/** ピック対象外の要素タイプ（AR中は補助表示・非構造要素を拾わない） */
const NON_PICKABLE_TYPES = new Set(['Axis', 'Story', 'Measurement']);

/**
 * ARピック結果
 * @typedef {Object} ArPickedElement
 * @property {string} elementType - 要素タイプ
 * @property {Object} userData - ヒットした個別要素のuserData
 */

/**
 * レイキャスト交差結果から最前面の要素を解決する（純関数）
 *
 * @param {THREE.Intersection[]} intersects - 距離昇順の交差結果
 * @param {Object<string, THREE.Object3D>} [elementGroups]
 *   要素タイプ→グループのマップ（グループ非表示の要素を除外するため。省略時は可視性のみ）
 * @returns {ArPickedElement|null}
 */
export function resolvePickedElement(intersects, elementGroups = null) {
  for (const intersect of Array.isArray(intersects) ? intersects : []) {
    const obj = intersect?.object;
    const ud = obj?.userData;
    if (!obj || !ud || !obj.visible) continue;

    const userData = _resolveIndividualUserData(intersect, ud);
    if (!userData) continue;

    const elementType = userData.elementType || userData.stbNodeType;
    if (!elementType || NON_PICKABLE_TYPES.has(elementType)) continue;
    if (elementGroups && elementGroups[elementType] && !elementGroups[elementType].visible) {
      continue;
    }

    return { elementType, userData };
  }
  return null;
}

/**
 * 交差結果からバッチ描画を吸収して個別要素のuserDataを取り出す
 * @private
 * @param {THREE.Intersection} intersect
 * @param {Object} ud - intersect.object.userData
 * @returns {Object|null}
 */
function _resolveIndividualUserData(intersect, ud) {
  // InstancedMesh バッチ（節点）: instanceId → instances[]
  if (ud.isInstanced && Array.isArray(ud.instances)) {
    if (intersect.instanceId == null) return null;
    return ud.instances[intersect.instanceId] || null;
  }

  // LineSegments バッチ（線要素）: 頂点index → segments[]
  // 各セグメントは連続2頂点なので index/2 がセグメント番号
  if (ud.isBatched && Array.isArray(ud.segments)) {
    if (intersect.index == null) return null;
    const segment = ud.segments[Math.floor(intersect.index / 2)];
    return segment?.userData || null;
  }

  // 通常オブジェクト
  return ud;
}

/**
 * スクリーン座標からAR配置済みモデルへレイキャストして要素をピックする
 *
 * @param {Object} params
 * @param {number} params.x - スクリーンX座標（px）
 * @param {number} params.y - スクリーンY座標（px）
 * @param {number} params.width - ビューポート幅（px）
 * @param {number} params.height - ビューポート高さ（px）
 * @param {THREE.Camera} params.camera - XRカメラ（ArrayCameraの場合はサブカメラ）
 * @param {THREE.Object3D} params.root - レイキャスト対象（ARルートグループ）
 * @param {Object<string, THREE.Object3D>} [params.elementGroups] - 要素グループのマップ
 * @returns {ArPickedElement|null}
 */
export function pickElementAtScreenPoint({ x, y, width, height, camera, root, elementGroups }) {
  if (!camera || !root || !width || !height) return null;

  const ndc = new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { ...raycaster.params.Line, threshold: AR_LINE_PICK_THRESHOLD_M };
  raycaster.params.Points = { ...raycaster.params.Points, threshold: AR_POINTS_PICK_THRESHOLD_M };
  raycaster.setFromCamera(ndc, camera);

  let intersects;
  try {
    intersects = raycaster.intersectObject(root, true);
  } catch (e) {
    log.warn('ARレイキャストに失敗しました:', e);
    return null;
  }
  return resolvePickedElement(intersects, elementGroups);
}
