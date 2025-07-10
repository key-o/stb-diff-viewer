/**
 * @fileoverview Mesh positioning and orientation utility
 *
 * This module provides unified mesh positioning logic to eliminate code duplication across:
 * - Column geometry generation
 * - Beam geometry generation
 * - Brace geometry generation
 *
 * Handles proper positioning and rotation for all linear structural elements,
 * supporting various geometry types and coordinate systems.
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";

/**
 * Unified mesh positioning utility for linear structural elements
 */
export class MeshPositioner {
  /**
   * Position and orient a linear structural element mesh
   * @param {THREE.Mesh} mesh - Mesh to position
   * @param {THREE.Vector3} startNode - Start node position (mm)
   * @param {THREE.Vector3} endNode - End node position (mm)
   * @param {THREE.Geometry} geometry - Geometry type for rotation logic
   * @param {Object} options - Positioning options
   * @param {string} options.elementType - Element type ('column', 'beam', 'brace')
   * @param {string} options.coordinateSystem - Coordinate system ('architectural', 'structural')
   * @param {number} options.rollAngle - Roll angle in radians (default: 0)
   * @param {Object} options.offsets - Element offsets ({start_X, start_Y, start_Z, end_X, end_Y, end_Z})
   * @param {Object} options.sectionDimensions - Section dimensions for height adjustment
   * @returns {THREE.Mesh} Positioned mesh
   */
  static positionLinearElement(
    mesh,
    startNode,
    endNode,
    geometry,
    options = {}
  ) {
    const {
      elementType = "beam",
      coordinateSystem = "architectural",
      rollAngle = 0,
      offsets = {},
      sectionDimensions = {},
    } = options;

    // Calculate element vector and properties
    const elementVector = new THREE.Vector3().subVectors(endNode, startNode);
    const elementLength = elementVector.length();
    const elementDirection = elementVector.normalize();

    // Apply offsets to node positions if provided
    const adjustedStartNode = this.applyNodeOffsets(
      startNode,
      offsets,
      "start"
    );
    const adjustedEndNode = this.applyNodeOffsets(endNode, offsets, "end");

    // Calculate position with offset adjustments
    const basePosition = new THREE.Vector3()
      .copy(adjustedStartNode)
      .lerp(adjustedEndNode, 0.5);

    // Apply beam-specific height adjustment for proper bottom level positioning
    if (elementType === "beam" && sectionDimensions.height) {
      this.applyBeamHeightAdjustment(basePosition, sectionDimensions, offsets);
    }

    // Set mesh position
    mesh.position.copy(basePosition);

    // Apply rotation based on geometry type and element orientation
    this.applyElementRotation(
      mesh,
      elementDirection,
      geometry,
      elementType,
      rollAngle
    );

    // Apply coordinate system adjustments if needed
    if (coordinateSystem === "structural") {
      this.applyStructuralCoordinateAdjustment(mesh, elementType);
    }

    return mesh;
  }

  /**
   * Apply rotation to mesh based on element direction and geometry type
   * @param {THREE.Mesh} mesh - Mesh to rotate
   * @param {THREE.Vector3} direction - Element direction vector (normalized)
   * @param {THREE.Geometry} geometry - Geometry type
   * @param {string} elementType - Element type
   * @param {number} rollAngle - Roll angle in radians
   */
  static applyElementRotation(
    mesh,
    direction,
    geometry,
    elementType,
    rollAngle
  ) {
    // Define reference axes based on geometry type
    const referenceAxis = this.getReferenceAxis(geometry, elementType);

    // Calculate rotation quaternion
    const rotationQuaternion = new THREE.Quaternion();
    rotationQuaternion.setFromUnitVectors(referenceAxis, direction);

    // Apply primary rotation
    mesh.quaternion.copy(rotationQuaternion);

    // Apply roll angle if specified
    if (Math.abs(rollAngle) > 0.001) {
      const rollQuaternion = new THREE.Quaternion();
      rollQuaternion.setFromAxisAngle(direction, rollAngle);
      mesh.quaternion.multiply(rollQuaternion);
    }

    // Apply element-specific rotation adjustments
    this.applyElementSpecificRotation(mesh, direction, elementType);
  }

  /**
   * Get reference axis based on geometry type
   * @param {THREE.Geometry} geometry - Geometry instance
   * @param {string} elementType - Element type
   * @returns {THREE.Vector3} Reference axis vector
   */
  static getReferenceAxis(geometry, elementType) {
    if (geometry instanceof THREE.CylinderGeometry) {
      // CylinderGeometry: Y軸が高さ方向（長軸）なので、正しくY軸を基準軸とする
      // RC円形柱などが正しく節点間の方向に配置されるように
      return new THREE.Vector3(0, 1, 0);
    } else if (geometry instanceof THREE.ExtrudeGeometry) {
      // ExtrudeGeometry: Z軸が押し出し方向
      return new THREE.Vector3(0, 0, 1);
    } else if (geometry instanceof THREE.BoxGeometry) {
      // BoxGeometry: Z軸を長軸として統一
      return new THREE.Vector3(0, 0, 1);
    }

    // Default: Z-axis（IFC標準に準拠）
    return new THREE.Vector3(0, 0, 1);
  }

  /**
   * Apply element-specific rotation adjustments
   * @param {THREE.Mesh} mesh - Mesh to adjust
   * @param {THREE.Vector3} direction - Element direction
   * @param {string} elementType - Element type
   */
  static applyElementSpecificRotation(mesh, direction, elementType) {
    // ExtrudeGeometry（H型鋼など）の場合は建築的な向きのための追加回転を適用
    if (mesh.geometry instanceof THREE.ExtrudeGeometry) {
      // H型鋼などのExtrudeGeometryは、XY平面で断面が定義され、Z軸方向に押し出される
      // 建築では通常、H型鋼のフランジが水平、ウェブが垂直になるよう配置する
      // これを実現するため、部材軸回りに90度回転させる
      const rollQuaternion = new THREE.Quaternion();
      rollQuaternion.setFromAxisAngle(direction, Math.PI / 2);
      mesh.quaternion.multiply(rollQuaternion);

      // デバッグ用ログ
      if (Math.random() < 0.01) {
        // 1%の確率
        console.log(
          `Applied H-section roll rotation for ${elementType} along direction:`,
          direction.toArray().map((v) => v.toFixed(3))
        );
      }
    }

    // その他の要素タイプ固有の処理は現在無効化
    // （節点間の実際のベクトルを尊重するため）

    // デバッグ用：実際の配置情報をログ出力
    if (console.log && Math.random() < 0.01) {
      // 1%の確率でログ出力
      console.log(
        `Element ${elementType} positioned along direction:`,
        direction.toArray().map((v) => v.toFixed(3))
      );
    }
  }

  /**
   * Apply column web orientation logic
   * @param {THREE.Mesh} mesh - Column mesh
   * @param {THREE.Vector3} direction - Column direction (should be vertical)
   */
  static applyColumnWebOrientation(mesh, direction) {
    // 柱の場合は、実際の節点間ベクトルが垂直でない場合は
    // そのまま斜め柱として扱い、特別な回転は行わない

    // 垂直柱の場合のみウェブ方向を調整
    if (Math.abs(direction.z) > 0.9) {
      // 垂直柱：断面のウェブを適切な方向に向ける
      // （現在は特別な処理は行わず、デフォルトの向きを使用）
    }

    // 斜め柱や水平柱の場合は、節点間の実際の方向をそのまま使用
    // （構造的に意図された配置として扱う）
  }

  /**
   * Apply beam load-bearing orientation
   * @param {THREE.Mesh} mesh - Beam mesh
   * @param {THREE.Vector3} direction - Beam direction
   */
  static applyBeamLoadOrientation(mesh, direction) {
    // 梁の場合は、実際の節点間ベクトルに従って配置し、
    // 強軸を垂直に向ける処理は行わない（現実の建築では梁は水平配置）

    // 水平な梁の場合（Z方向成分が小さい場合）は、
    // 強軸（断面の高さ方向）をZ軸（上下方向）に向ける
    if (Math.abs(direction.z) < 0.1) {
      // 水平梁：強軸をZ軸に向ける
      const rightVector = new THREE.Vector3().copy(direction).normalize();
      const upVector = new THREE.Vector3(0, 0, 1); // Z軸を上方向とする
      const forwardVector = new THREE.Vector3()
        .crossVectors(rightVector, upVector)
        .normalize();

      // 梁の向きに合わせた座標系を作成
      const matrix = new THREE.Matrix4();
      matrix.makeBasis(forwardVector, upVector, rightVector);

      const quaternion = new THREE.Quaternion();
      quaternion.setFromRotationMatrix(matrix);
      mesh.quaternion.copy(quaternion);
    }
    // 斜め梁や垂直梁の場合は、そのまま節点間方向に配置
    // （特別な回転は適用しない）
  }

  /**
   * Apply structural coordinate system adjustments
   * @param {THREE.Mesh} mesh - Mesh to adjust
   * @param {string} elementType - Element type
   */
  static applyStructuralCoordinateAdjustment(mesh, elementType) {
    // Structural coordinate systems may differ from architectural
    // Apply any necessary transformations here

    switch (elementType) {
      case "column":
        // Columns in structural coordinates may need different base reference
        break;

      case "beam":
        // Beams may need coordinate system conversion
        break;

      case "brace":
        // Braces typically follow architectural coordinates
        break;
    }
  }

  /**
   * Calculate element bounds for positioning validation
   * @param {THREE.Vector3} startNode - Start node position
   * @param {THREE.Vector3} endNode - End node position
   * @param {Object} sectionDimensions - Section dimensions
   * @returns {THREE.Box3} Element bounding box
   */
  static calculateElementBounds(startNode, endNode, sectionDimensions) {
    const box = new THREE.Box3();

    // Add start and end points
    box.expandByPoint(startNode);
    box.expandByPoint(endNode);

    // Expand by section dimensions if provided
    if (sectionDimensions) {
      const maxDim = Math.max(
        sectionDimensions.width || 0,
        sectionDimensions.height || 0,
        sectionDimensions.depth || 0
      );

      box.expandByScalar(maxDim / 2);
    }

    return box;
  }

  /**
   * Validate positioning parameters
   * @param {THREE.Vector3} startNode - Start node position
   * @param {THREE.Vector3} endNode - End node position
   * @param {Object} options - Positioning options
   * @returns {boolean} True if parameters are valid
   */
  static validatePositioningParameters(startNode, endNode, options = {}) {
    // Check node validity
    if (!startNode || !endNode) {
      console.error("Invalid start or end node for positioning");
      return false;
    }

    // Check if nodes are different
    if (startNode.distanceTo(endNode) < 0.001) {
      console.warn("Start and end nodes are too close together");
      return false;
    }

    // Check for invalid coordinates
    if (!this.isValidVector(startNode) || !this.isValidVector(endNode)) {
      console.error("Invalid coordinates in positioning nodes");
      return false;
    }

    return true;
  }

  /**
   * Check if a vector has valid coordinates
   * @param {THREE.Vector3} vector - Vector to validate
   * @returns {boolean} True if valid
   */
  static isValidVector(vector) {
    return (
      vector &&
      typeof vector.x === "number" &&
      !isNaN(vector.x) &&
      typeof vector.y === "number" &&
      !isNaN(vector.y) &&
      typeof vector.z === "number" &&
      !isNaN(vector.z) &&
      isFinite(vector.x) &&
      isFinite(vector.y) &&
      isFinite(vector.z)
    );
  }

  /**
   * Create debug visualization for element positioning
   * @param {THREE.Vector3} startNode - Start node position
   * @param {THREE.Vector3} endNode - End node position
   * @param {THREE.Vector3} direction - Element direction
   * @param {string} elementId - Element identifier for debugging
   * @returns {THREE.Group} Debug visualization group
   */
  static createDebugVisualization(startNode, endNode, direction, elementId) {
    const debugGroup = new THREE.Group();
    debugGroup.name = `debug_${elementId}`;

    // Element centerline
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      startNode,
      endNode,
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const centerline = new THREE.Line(lineGeometry, lineMaterial);
    debugGroup.add(centerline);

    // Direction arrow at midpoint
    const midpoint = new THREE.Vector3().lerpVectors(startNode, endNode, 0.5);
    const arrowGeometry = new THREE.ConeGeometry(5, 20, 8);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.copy(midpoint);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    debugGroup.add(arrow);

    // Node markers
    const nodeGeometry = new THREE.SphereGeometry(3);
    const startMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const endMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });

    const startMarker = new THREE.Mesh(nodeGeometry, startMaterial);
    startMarker.position.copy(startNode);
    debugGroup.add(startMarker);

    const endMarker = new THREE.Mesh(nodeGeometry, endMaterial);
    endMarker.position.copy(endNode);
    debugGroup.add(endMarker);

    return debugGroup;
  }

  /**
   * Apply offsets to a node position
   * @param {THREE.Vector3} nodePosition - Original node position
   * @param {Object} offsets - Offset values
   * @param {string} side - 'start' or 'end'
   * @returns {THREE.Vector3} Adjusted node position
   */
  static applyNodeOffsets(nodePosition, offsets, side) {
    const adjustedNode = nodePosition.clone();

    // Apply X, Y, Z offsets if they exist
    if (offsets[`${side}_X`]) {
      adjustedNode.x += parseFloat(offsets[`${side}_X`]) || 0;
    }
    if (offsets[`${side}_Y`]) {
      adjustedNode.y += parseFloat(offsets[`${side}_Y`]) || 0;
    }
    if (offsets[`${side}_Z`]) {
      adjustedNode.z += parseFloat(offsets[`${side}_Z`]) || 0;
    }

    return adjustedNode;
  }

  /**
   * Apply beam-specific height adjustment for proper bottom level positioning
   * @param {THREE.Vector3} position - Base position to adjust
   * @param {Object} sectionDimensions - Section dimensions
   * @param {Object} offsets - Offset values
   */
  static applyBeamHeightAdjustment(position, sectionDimensions, offsets) {
    const beamHeight = sectionDimensions.height || 0;

    // 梁の場合：節点レベルから梁せいの半分下げて、梁の中心位置とする
    // これにより、梁の下端が「基準レベル - 梁せい - オフセット」の位置になる
    // 注意：オフセットは既に applyNodeOffsets で適用済み
    position.z -= beamHeight / 2;

    // デバッグ用ログ
    if (Math.random() < 0.01) {
      console.log(
        `Beam height adjustment: height=${beamHeight}mm, position adjusted by ${
          -beamHeight / 2
        }mm in Z`
      );
    }
  }
}
