/**
 * @fileoverview 構造要素ジオメトリ生成共通ユーティリティ
 *
 * 全ての構造要素（柱、梁、ブレース、杭、基礎）に共通する
 * ジオメトリ生成ロジックを提供します。
 *
 * 設計思想:
 * - 要素種別に依存しない汎用的な実装
 * - STB形式とJSON形式の両対応
 * - 1ノード要素と2ノード要素の両対応
 * - 既存の3層アーキテクチャ（Profile/Geometry/ThreeJS）との統合
 *
 * 使用例:
 * ```javascript
 * // 2ノード垂直要素（柱、杭）
 * const nodePos = ElementGeometryUtils.getNodePositions(element, nodes, {
 *   nodeType: '2node-vertical',
 *   isJsonInput: false,
 *   node1KeyStart: 'id_node_bottom',
 *   node1KeyEnd: 'id_node_top'
 * });
 *
 * // 1ノード要素（基礎）
 * const nodePos = ElementGeometryUtils.getNodePositions(element, nodes, {
 *   nodeType: '1node',
 *   isJsonInput: false,
 *   node1Key: 'id_node'
 * });
 * ```
 */

import * as THREE from "three";
import { IFCProfileFactory } from "./IFCProfileFactory.js";
import { calculateProfile } from "./core/ProfileCalculator.js";
import {
  calculateColumnPlacement,
  inferSectionTypeFromDimensions,
} from "./core/GeometryCalculator.js";
import {
  convertProfileToThreeShape,
  createExtrudeGeometry,
  applyPlacementToMesh,
  attachPlacementAxisLine,
} from "./core/ThreeJSConverter.js";
import { ensureUnifiedSectionType } from "../../common/sectionTypeUtil.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("viewer:geometry:utils");

/**
 * 構造要素ジオメトリ生成共通ユーティリティクラス
 */
export class ElementGeometryUtils {
  // ========================================
  // 1. ノード位置取得（1ノード/2ノード両対応）
  // ========================================

  /**
   * 要素のノード位置を取得
   *
   * @param {Object} element - 要素データ
   * @param {Map} nodes - ノードマップ
   * @param {Object} config - 設定
   * @param {string} config.nodeType - '1node' | '2node-vertical' | '2node-horizontal'
   * @param {boolean} config.isJsonInput - JSON形式かどうか
   * @param {string} [config.node1Key] - 1ノード要素のノードキー名（例: 'id_node'）
   * @param {string} [config.node1KeyStart] - 2ノード要素の始点キー（例: 'id_node_start', 'id_node_bottom'）
   * @param {string} [config.node1KeyEnd] - 2ノード要素の終点キー（例: 'id_node_end', 'id_node_top'）
   * @returns {Object} ノード位置データ { type, node(s), valid }
   */
  static getNodePositions(element, nodes, config) {
    const { nodeType, isJsonInput } = config;

    if (isJsonInput) {
      return this._getNodePositionsFromJson(element, config);
    }

    // STB形式
    if (nodeType === "1node") {
      // 基礎などの1ノード要素
      const nodeId = element[config.node1Key];
      const node = nodes ? nodes.get(nodeId) : null;

      if (!node) {
        log.warn(
          `1node element ${element.id}: node not found (${config.node1Key}=${nodeId})`
        );
      }

      return {
        type: "1node",
        node: node,
        valid: !!node,
      };
    } else if (nodeType === "2node-vertical") {
      // 柱、杭などの垂直要素（bottom/top）
      const bottomNodeId = element[config.node1KeyStart];
      const topNodeId = element[config.node1KeyEnd];
      const bottomNode = nodes ? nodes.get(bottomNodeId) : null;
      const topNode = nodes ? nodes.get(topNodeId) : null;

      if (!bottomNode || !topNode) {
        log.warn(
          `2node-vertical element ${element.id}: nodes not found (${config.node1KeyStart}=${bottomNodeId}, ${config.node1KeyEnd}=${topNodeId})`
        );
      }

      return {
        type: "2node-vertical",
        startNode: bottomNode,
        endNode: topNode,
        bottomNode: bottomNode,
        topNode: topNode,
        valid: !!(bottomNode && topNode),
      };
    } else if (nodeType === "2node-horizontal") {
      // 梁、ブレースなどの水平要素（start/end）
      const startNodeId = element[config.node1KeyStart];
      const endNodeId = element[config.node1KeyEnd];
      const startNode = nodes ? nodes.get(startNodeId) : null;
      const endNode = nodes ? nodes.get(endNodeId) : null;

      if (!startNode || !endNode) {
        log.warn(
          `2node-horizontal element ${element.id}: nodes not found (${config.node1KeyStart}=${startNodeId}, ${config.node1KeyEnd}=${endNodeId})`
        );
      }

      return {
        type: "2node-horizontal",
        startNode: startNode,
        endNode: endNode,
        valid: !!(startNode && endNode),
      };
    }

    log.error(`Unknown nodeType: ${nodeType}`);
    return { valid: false };
  }

  /**
   * JSON形式からノード位置を取得
   * @private
   */
  static _getNodePositionsFromJson(element, config) {
    const geometry = element.geometry;
    if (!geometry) {
      log.warn(`JSON element ${element.id}: no geometry data`);
      return { valid: false };
    }

    if (config.nodeType === "1node") {
      // 1ノード要素（JSON形式では center_point などを想定）
      const point = geometry.center_point || geometry.position;
      if (!point) {
        log.warn(`JSON 1node element ${element.id}: no center_point/position`);
        return { valid: false };
      }

      return {
        type: "1node",
        node: this._arrayOrObjectToVector3(point),
        valid: true,
      };
    } else {
      // 2ノード要素
      const startPoint = geometry.start_point;
      const endPoint = geometry.end_point;

      if (!startPoint || !endPoint) {
        log.warn(
          `JSON 2node element ${element.id}: missing start_point or end_point`
        );
        return { valid: false };
      }

      return {
        type: config.nodeType,
        startNode: this._arrayOrObjectToVector3(startPoint),
        endNode: this._arrayOrObjectToVector3(endPoint),
        valid: true,
      };
    }
  }

  /**
   * 配列またはオブジェクトをTHREE.Vector3に変換
   * @private
   */
  static _arrayOrObjectToVector3(point) {
    if (Array.isArray(point)) {
      return new THREE.Vector3(point[0], point[1], point[2]);
    }
    return new THREE.Vector3(point.x, point.y, point.z);
  }

  // ========================================
  // 2. 断面データ取得（STB/JSON両対応）
  // ========================================

  /**
   * 要素の断面データを取得
   *
   * @param {Object} element - 要素データ
   * @param {Map} sections - 断面マップ
   * @param {boolean} isJsonInput - JSON形式かどうか
   * @returns {Object|null} 断面データ（統一フォーマット）
   */
  static getSectionData(element, sections, isJsonInput) {
    let sectionData;

    if (isJsonInput) {
      // JSON形式: 要素に直接含まれる
      sectionData = element.section;
      if (!sectionData) {
        log.warn(`JSON element ${element.id}: no section data`);
      }
    } else {
      // STB形式: id_section を使ってマップから取得
      const sectionId = element.id_section;
      if (!sectionId) {
        log.warn(`STB element ${element.id}: no id_section`);
        return null;
      }
      if (!sections) {
        log.warn(`STB element ${element.id}: sections map is null`);
        return null;
      }
      sectionData = sections.get(sectionId);
      if (!sectionData) {
        log.warn(
          `STB element ${element.id}: section not found (id_section=${sectionId})`
        );
      }
    }

    if (!sectionData) {
      return null;
    }

    // 統一フォーマットに変換
    return ensureUnifiedSectionType(sectionData);
  }

  // ========================================
  // 3. プロファイル生成（統一インターフェース）
  // ========================================

  /**
   * 断面プロファイルを生成
   *
   * @param {Object} sectionData - 断面データ
   * @param {string} sectionType - 断面タイプ（"H", "BOX", "PIPE", "RECTANGLE"など）
   * @param {Object} element - 要素データ（エラーログ用）
   * @returns {Object|null} { shape: THREE.Shape, meta: Object }
   */
  static createProfile(sectionData, sectionType, element) {
    // 1. IFCProfileFactory を優先的に使用
    try {
      const dims = sectionData.dimensions || sectionData;
      const dimsStr = (() => {
        try {
          return JSON.stringify(dims);
        } catch (e) {
          return String(dims);
        }
      })();

      const ifcProfile = IFCProfileFactory.createProfile(sectionType, dims);

      if (ifcProfile) {
        log.debug(
          `Element ${element?.id}: profile created via IFCProfileFactory (${sectionType})`
        );
        return {
          shape: convertProfileToThreeShape({
            vertices: ifcProfile.points,
            _meta: { type: sectionType === "PIPE" ? "circular" : "polygon" },
          }),
          meta: {
            profileSource: "IFCProfileFactory",
            profileType: sectionType,
            ...ifcProfile.metadata,
          },
        };
      } else {
        log.debug(
          `Element ${element?.id}: IFCProfileFactory returned null for sectionType=${sectionType}, dims=${dimsStr}`
        );
      }
    } catch (error) {
      log.warn(
        `Element ${element?.id}: IFCProfileFactory failed - ${error.message}`
      );
    }

    // 2. フォールバック: ProfileCalculator を使用
    try {
      const dims = sectionData.dimensions || sectionData;
      const dimsStr = (() => {
        try {
          return JSON.stringify(dims);
        } catch (e) {
          return String(dims);
        }
      })();

      const profilePoints = calculateProfile(sectionType, dims);

      // ProfileCalculator は通常 { vertices, holes, _meta } を返す。
      // ただし古い実装や一部呼び出しでは配列を返すこともあるため両方を許容する。
      const hasVertices =
        profilePoints &&
        ((Array.isArray(profilePoints) && profilePoints.length > 0) ||
          (profilePoints.vertices && profilePoints.vertices.length > 0));

      if (hasVertices) {
        log.debug(
          `Element ${element?.id}: profile created via ProfileCalculator (${sectionType})`
        );

        const profileData = Array.isArray(profilePoints)
          ? { vertices: profilePoints }
          : profilePoints;

        return {
          shape: convertProfileToThreeShape(profileData),
          meta: {
            profileSource: "ProfileCalculator",
            profileType: sectionType,
            ...(profileData._meta ? { _meta: profileData._meta } : {}),
          },
        };
      } else {
        log.debug(
          `Element ${element?.id}: ProfileCalculator returned empty for sectionType=${sectionType}, dims=${dimsStr}`
        );
      }
    } catch (error) {
      log.warn(
        `Element ${element?.id}: ProfileCalculator failed - ${error.message}`
      );
    }

    log.error(
      `Element ${element?.id}: Failed to create profile for section type ${sectionType}`
    );
    return null;
  }

  // ========================================
  // 4. 配置計算ディスパッチャー
  // ========================================

  /**
   * 2ノード要素の配置を計算
   *
   * @param {THREE.Vector3} startNode - 始点ノード
   * @param {THREE.Vector3} endNode - 終点ノード
   * @param {Object} options - オフセット・回転角度など
   * @param {Object} [options.startOffset] - 始点オフセット {x, y}
   * @param {Object} [options.endOffset] - 終点オフセット {x, y}
   * @param {number} [options.rollAngle] - 回転角度（度）
   * @returns {Object} 配置情報 { position, rotation, length, ... }
   */
  static calculateDualNodePlacement(startNode, endNode, options = {}) {
    // THREE.Vector3 → Plain Object に変換
    const startPlain = { x: startNode.x, y: startNode.y, z: startNode.z };
    const endPlain = { x: endNode.x, y: endNode.y, z: endNode.z };

    // GeometryCalculatorを使用（柱用だが汎用的に使える）
    return calculateColumnPlacement(startPlain, endPlain, {
      bottomOffset: options.startOffset || { x: 0, y: 0 },
      topOffset: options.endOffset || { x: 0, y: 0 },
      rollAngle: options.rollAngle || 0,
    });
  }

  /**
   * 1ノード要素の配置を計算（基礎用）
   *
   * @param {THREE.Vector3} node - ノード位置
   * @param {number} levelBottom - 底面レベル（Z座標、mm単位）
   * @param {number} depth - 深さ（高さ、mm単位）
   * @param {Object} options - オフセット・回転角度など
   * @param {Object} [options.offset] - 水平オフセット {x, y} (mm)
   * @param {number} [options.rotation] - 回転角度（ラジアン）
   * @returns {Object} 配置情報 { position, rotation, bottomZ, topZ, ... }
   */
  static calculateSingleNodePlacement(node, levelBottom, depth, options = {}) {
    // ノード位置を基準に配置を計算
    const basePosition = node.clone();

    // オフセット適用
    if (options.offset) {
      basePosition.x += options.offset.x || 0;
      basePosition.y += options.offset.y || 0;
    }

    // 基礎の底面は level_bottom に配置
    const bottomZ = levelBottom;
    const topZ = levelBottom + depth;

    // 基礎の中心位置（底面中心を基準）
    const centerZ = (bottomZ + topZ) / 2;

    // 最終位置
    const position = new THREE.Vector3(basePosition.x, basePosition.y, centerZ);

    // 回転
    const rotation = new THREE.Euler(0, 0, options.rotation || 0);

    return {
      position: position,
      rotation: rotation,
      bottomZ: bottomZ,
      topZ: topZ,
      nodePosition: node,
      offset: options.offset || { x: 0, y: 0 },
    };
  }

  // ========================================
  // 5. メッシュ生成・メタデータ設定
  // ========================================

  /**
   * ジオメトリとメタデータからメッシュを作成
   *
   * @param {THREE.BufferGeometry} geometry - ジオメトリ
   * @param {THREE.Material} material - マテリアル
   * @param {Object} elementData - 要素データ
   * @param {Object} config - メタデータ設定
   * @param {string} config.elementType - 要素タイプ（"Column", "Pile", "Footing" など）
   * @param {boolean} [config.isJsonInput] - JSON入力かどうか
   * @param {number} [config.length] - 要素の長さ
   * @param {string} [config.sectionType] - 断面タイプ
   * @param {Object} [config.profileMeta] - プロファイルメタデータ
   * @param {Object} [config.sectionData] - 断面データ
   * @returns {THREE.Mesh} メッシュ
   */
  static createMeshWithMetadata(geometry, material, elementData, config) {
    const mesh = new THREE.Mesh(geometry, material);

    // 基本メタデータ
    mesh.userData = {
      elementType: config.elementType,
      elementId: elementData.id,
      isJsonInput: config.isJsonInput || false,
      length: config.length,
      sectionType: config.sectionType,
      profileBased: true,
      profileMeta: config.profileMeta || { profileSource: "unknown" },
      sectionDataOriginal: config.sectionData,
    };

    // 要素固有データを保存
    const dataKey = `${config.elementType.toLowerCase()}Data`;
    mesh.userData[dataKey] = elementData;

    log.debug(
      `Mesh created for ${config.elementType} ${
        elementData.id
      }: length=${config.length?.toFixed(1)}mm`
    );

    return mesh;
  }

  /**
   * メッシュに配置基準線を添付（オプション）
   *
   * @param {THREE.Mesh} mesh - 対象メッシュ
   * @param {number} length - 線の長さ
   * @param {THREE.Material} material - 線のマテリアル
   * @param {Object} userData - 線のuserData
   */
  static attachPlacementLine(mesh, length, material, userData) {
    try {
      attachPlacementAxisLine(mesh, length, material, userData);
      log.debug(
        `Placement line attached for ${userData.elementType} ${userData.elementId}`
      );
    } catch (error) {
      log.warn(
        `Failed to attach placement line for ${userData.elementId}:`,
        error
      );
    }
  }

  // ========================================
  // 6. 断面タイプ推定
  // ========================================

  /**
   * 断面寸法から断面タイプを推定
   *
   * @param {Object} sectionData - 断面データ
   * @returns {string} 断面タイプ（大文字）
   */
  static inferSectionType(sectionData) {
    // 既に断面タイプが指定されている場合
    if (sectionData.section_type) {
      return sectionData.section_type.toUpperCase();
    }
    if (sectionData.profile_type) {
      return sectionData.profile_type.toUpperCase();
    }

    // 寸法から推定
    const inferred = inferSectionTypeFromDimensions(
      sectionData.dimensions || sectionData
    );
    log.debug(`Section type inferred: ${inferred}`);
    return inferred;
  }

  // ========================================
  // 7. オフセット・回転角度の取得
  // ========================================

  /**
   * 要素からオフセットと回転角度を取得
   *
   * @param {Object} element - 要素データ
   * @param {Object} config - 設定
   * @param {string} config.nodeType - ノードタイプ
   * @returns {Object} { startOffset, endOffset, rollAngle }
   */
  static getOffsetAndRotation(element, config) {
    // デフォルト値
    const result = {
      startOffset: { x: 0, y: 0 },
      endOffset: { x: 0, y: 0 },
      rollAngle: 0,
    };

    // STB形式の場合、オフセット属性を取得
    if (element.offset_X_start !== undefined) {
      result.startOffset.x = element.offset_X_start;
    }
    if (element.offset_Y_start !== undefined) {
      result.startOffset.y = element.offset_Y_start;
    }
    if (element.offset_X_end !== undefined) {
      result.endOffset.x = element.offset_X_end;
    }
    if (element.offset_Y_end !== undefined) {
      result.endOffset.y = element.offset_Y_end;
    }
    if (element.roll_angle !== undefined) {
      result.rollAngle = element.roll_angle;
    }

    return result;
  }
}

// デバッグ・開発支援
if (typeof window !== "undefined") {
  window.ElementGeometryUtils = ElementGeometryUtils;
}

export default ElementGeometryUtils;
