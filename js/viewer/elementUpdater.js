/**
 * @fileoverview 要素動的更新モジュール
 *
 * このモジュールは、個別要素のジオメトリをリアルタイムで更新する機能を提供します:
 * - 特定要素のメッシュ検索
 * - ジオメトリの再生成と置き換え
 * - XMLドキュメントとの同期
 *
 * 編集機能とジオメトリ表示の統合を実現します。
 */

import * as THREE from 'three';
import { elementGroups } from './core/core.js';
import { ProfileBasedColumnGenerator } from './geometry/ProfileBasedColumnGenerator.js';
import { ProfileBasedPostGenerator } from './geometry/ProfileBasedPostGenerator.js';
import { ProfileBasedBeamGenerator } from './geometry/ProfileBasedBeamGenerator.js';
import { ProfileBasedBraceGenerator } from './geometry/ProfileBasedBraceGenerator.js';
import { PileGenerator } from './geometry/PileGenerator.js';
import { FootingGenerator } from './geometry/FootingGenerator.js';
import { extractAllSections } from '../parser/sectionExtractor.js';

/**
 * グループ内から特定の要素IDを持つメッシュを検索
 * @param {THREE.Group} group - 検索対象グループ
 * @param {string} elementId - 要素ID
 * @param {string} modelSource - "modelA" または "modelB" または "matched"
 * @returns {THREE.Mesh|null} 見つかったメッシュ、または null
 */
function findMeshByElementId(group, elementId, modelSource) {
  if (!group || !group.children) return null;

  for (const child of group.children) {
    if (child.userData) {
      // モデルAの要素を探す
      if (modelSource === 'modelA' && child.userData.elementIdA === elementId) {
        return child;
      }
      // モデルBの要素を探す
      if (modelSource === 'modelB' && child.userData.elementIdB === elementId) {
        return child;
      }
      // マッチした要素（両方のIDを持つ）
      if (modelSource === 'matched' &&
          (child.userData.elementIdA === elementId || child.userData.elementIdB === elementId)) {
        return child;
      }
      // 単一要素（elementIdを持つ）
      if (child.userData.elementId === elementId) {
        return child;
      }
    }
  }

  return null;
}

/**
 * XMLドキュメントから要素データを取得
 * @param {Document} doc - XMLドキュメント
 * @param {string} elementType - 要素タイプ（"Column", "Beam"等）
 * @param {string} elementId - 要素ID
 * @returns {Element|null} XML要素
 */
function getElementFromDocument(doc, elementType, elementId) {
  if (!doc) return null;

  const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
  return doc.querySelector(`${tagName}[id="${elementId}"]`);
}

/**
 * ノードマップを取得（XMLドキュメントから構築）
 * @param {Document} doc - XMLドキュメント
 * @returns {Map<string, THREE.Vector3>} ノードマップ
 */
function buildNodeMapFromDocument(doc) {
  const nodeMap = new Map();

  if (!doc) return nodeMap;

  const nodes = doc.querySelectorAll('StbNode');
  nodes.forEach(node => {
    const id = node.getAttribute('id');
    const x = parseFloat(node.getAttribute('X') || 0);
    const y = parseFloat(node.getAttribute('Y') || 0);
    const z = parseFloat(node.getAttribute('Z') || 0);

    nodeMap.set(id, new THREE.Vector3(x, y, z));
  });

  return nodeMap;
}

/**
 * 特定要素のジオメトリを再生成
 * @param {string} elementType - "Column", "Beam", "Pile"等
 * @param {string} elementId - 要素ID
 * @param {string} modelSource - "modelA" または "modelB"
 * @returns {Promise<boolean>} 更新成功可否
 */
export async function regenerateElementGeometry(elementType, elementId, modelSource = 'modelA') {
  console.log(`[ElementUpdater] Regenerating ${elementType} ${elementId} from ${modelSource}`);

  try {
    // 1. グループとドキュメントを取得
    const group = elementGroups[elementType];
    if (!group) {
      console.error(`[ElementUpdater] Element group not found: ${elementType}`);
      return false;
    }

    const doc = modelSource === 'modelA' ? window.docA : window.docB;
    if (!doc) {
      console.error(`[ElementUpdater] Document not found: ${modelSource}`);
      return false;
    }

    // 2. 古いメッシュを削除
    const oldMesh = findMeshByElementId(group, elementId, modelSource);
    if (oldMesh) {
      console.log(`[ElementUpdater] Removing old mesh for ${elementId}`);
      group.remove(oldMesh);

      // ジオメトリとマテリアルを破棄
      if (oldMesh.geometry) oldMesh.geometry.dispose();
      if (oldMesh.material) {
        if (Array.isArray(oldMesh.material)) {
          oldMesh.material.forEach(mat => mat.dispose());
        } else {
          oldMesh.material.dispose();
        }
      }
    }

    // 3. XMLから更新された要素データを取得
    const elementNode = getElementFromDocument(doc, elementType, elementId);
    if (!elementNode) {
      console.error(`[ElementUpdater] Element not found in document: ${elementId}`);
      return false;
    }

    // 4. 必要なデータを構築
    const nodeMap = buildNodeMapFromDocument(doc);
    const sections = extractAllSections(doc);

    // 5. 要素タイプに応じてジオメトリを生成
    const newMesh = await generateMeshForElement(
      elementType,
      elementNode,
      nodeMap,
      sections
    );

    if (!newMesh) {
      console.error(`[ElementUpdater] Failed to generate mesh for ${elementId}`);
      return false;
    }

    // 6. 新しいメッシュをグループに追加
    group.add(newMesh);
    console.log(`[ElementUpdater] Successfully regenerated ${elementType} ${elementId}`);

    // 7. レンダリング更新をリクエスト
    if (typeof window.requestRender === 'function') {
      window.requestRender();
    }

    return true;

  } catch (error) {
    console.error(`[ElementUpdater] Error regenerating ${elementType} ${elementId}:`, error);
    return false;
  }
}

/**
 * 要素タイプに応じてメッシュを生成
 * @param {string} elementType - 要素タイプ
 * @param {Element} elementNode - XML要素ノード
 * @param {Map} nodeMap - ノードマップ
 * @param {Object} sections - 断面データ
 * @returns {Promise<THREE.Mesh|null>} 生成されたメッシュ
 */
async function generateMeshForElement(elementType, elementNode, nodeMap, sections) {
  // 要素データをオブジェクトに変換
  const elementData = xmlNodeToObject(elementNode);

  try {
    switch (elementType) {
      case 'Column':
        return generateColumnMesh(elementData, nodeMap, sections);

      case 'Post':
        return generatePostMesh(elementData, nodeMap, sections);

      case 'Beam':
      case 'Girder':
        return generateBeamMesh(elementData, nodeMap, sections, elementType);

      case 'Brace':
        return generateBraceMesh(elementData, nodeMap, sections);

      case 'Pile':
        return generatePileMesh(elementData, nodeMap, sections);

      case 'Footing':
        return generateFootingMesh(elementData, nodeMap, sections);

      default:
        console.warn(`[ElementUpdater] Unsupported element type: ${elementType}`);
        return null;
    }
  } catch (error) {
    console.error(`[ElementUpdater] Error generating mesh for ${elementType}:`, error);
    return null;
  }
}

/**
 * XML要素ノードをJavaScriptオブジェクトに変換
 * @param {Element} node - XML要素ノード
 * @returns {Object} 変換されたオブジェクト
 */
function xmlNodeToObject(node) {
  const obj = {};

  // 全属性を取得
  Array.from(node.attributes).forEach(attr => {
    obj[attr.name] = attr.value;
  });

  return obj;
}

/**
 * 柱メッシュを生成
 */
function generateColumnMesh(columnData, nodeMap, sections) {
  const meshes = ProfileBasedColumnGenerator.createColumnMeshes(
    [columnData],
    nodeMap,
    sections.columnSections,
    sections.steelSections,
    'Column',
    false // isJsonInput
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * ポストメッシュを生成
 */
function generatePostMesh(postData, nodeMap, sections) {
  const meshes = ProfileBasedPostGenerator.createPostMeshes(
    [postData],
    nodeMap,
    sections.postSections || sections.columnSections,
    sections.steelSections,
    'Post',
    false
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 梁メッシュを生成
 */
function generateBeamMesh(beamData, nodeMap, sections, elementType) {
  const meshes = ProfileBasedBeamGenerator.createBeamMeshes(
    [beamData],
    nodeMap,
    sections.beamSections || sections.girderSections,
    sections.steelSections,
    elementType,
    false
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * ブレースメッシュを生成
 */
function generateBraceMesh(braceData, nodeMap, sections) {
  const meshes = ProfileBasedBraceGenerator.createBraceMeshes(
    [braceData],
    nodeMap,
    sections.braceSections,
    sections.steelSections,
    'Brace',
    false
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 杭メッシュを生成
 */
function generatePileMesh(pileData, nodeMap, sections) {
  const meshes = PileGenerator.createPileMeshes(
    [pileData],
    nodeMap,
    sections.pileSections,
    'Pile',
    false
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 基礎メッシュを生成
 */
function generateFootingMesh(footingData, nodeMap, sections) {
  const meshes = FootingGenerator.createFootingMeshes(
    [footingData],
    nodeMap,
    sections.footingSections,
    'Footing',
    false
  );

  return meshes.length > 0 ? meshes[0] : null;
}

/**
 * 複数要素のジオメトリを一括再生成
 * @param {Array<{elementType: string, elementId: string}>} elements - 要素リスト
 * @param {string} modelSource - "modelA" または "modelB"
 * @returns {Promise<Object>} 更新結果の統計
 */
export async function regenerateMultipleElements(elements, modelSource = 'modelA') {
  const results = {
    success: 0,
    failed: 0,
    total: elements.length
  };

  for (const { elementType, elementId } of elements) {
    const success = await regenerateElementGeometry(elementType, elementId, modelSource);
    if (success) {
      results.success++;
    } else {
      results.failed++;
    }
  }

  console.log(`[ElementUpdater] Batch update complete:`, results);
  return results;
}
