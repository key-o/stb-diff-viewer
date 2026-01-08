/**
 * @fileoverview IFC準拠プロファイル押し出し用IFCプロファイルファクトリー
 *
 * このモジュールはIFC4/IFC4.3仕様に準拠したIFC標準プロファイル作成を提供します：
 * - 国際標準に従ったIFCプロファイル定義
 * - 構造要素用のパラメトリックプロファイル作成
 * - IfcIShapeProfileDef、IfcRectangleProfileDef、IfcCircleProfileDefサポート
 * - IFC準拠座標系と測定
 * - 任意パス（線形および曲線）に沿った押し出し
 * - STB形式とIFCプロファイル標準間のブリッジ
 *
 * これにより国際BIMワークフローとIFCエクスポート/インポートとの互換性が実現されます。
 */

import * as THREE from 'three';
import {
  IFC_PROFILE_TYPES as MAP_IFC_PROFILE_TYPES,
  mapToIFCProfileType,
  createIFCProfileFromSTB,
} from '../../data/accessors/profileExtractor.js';
import { normalizeSectionType } from '../../common-stb/section/sectionTypeUtil.js';
import {
  calculate2LBackToBackProfile,
  calculate2LFaceToFaceProfile,
  calculate2CBackToBackProfile,
  calculate2CFaceToFaceProfile,
} from './core/ProfileCalculator.js';

/**
 * IFC標準に従ったIFCプロファイルタイプ列挙
 */
export const IFC_PROFILE_TYPES = MAP_IFC_PROFILE_TYPES;

/**
 * 標準化プロファイル作成用IFCプロファイルファクトリー
 */
export class IFCProfileFactory {
  /**
   * STB鋼材形状データからIFCプロファイルを作成
   * @param {Object} stbSteelShape - STB鋼材形状パラメータ
   * @param {string} stbShapeType - STB形状タイプ識別子
   * @returns {Object} IFCプロファイル定義
   */
  static createProfileFromSTB(stbSteelShape, stbShapeType) {
    // 正規化: 呼び出し元から 'PIPE' / 'RECTANGLE' / 'CIRCLE' など大文字で渡されても対応
    const typeNorm = normalizeSectionType(stbShapeType) || stbShapeType;

    // 組み合わせ断面のtype属性をチェック（BACKTOBACK, FACETOFACE, SINGLE）
    const combinationType = stbSteelShape?.shapeTypeAttr?.toUpperCase();

    // 組み合わせ断面の場合は専用のプロファイルタイプを使用
    if (combinationType === 'BACKTOBACK' || combinationType === 'FACETOFACE') {
      const profileType = `${typeNorm}_${combinationType}`;
      // 統一プロファイルモジュールを使用
      const ifcProfile = createIFCProfileFromSTB(stbSteelShape, typeNorm);
      return {
        ProfileType: profileType,
        ProfileName: `STB_${profileType}_${stbSteelShape?.name || 'Custom'}`,
        ProfileParameters: ifcProfile.ProfileParameters,
        CombinationType: combinationType,
      };
    }

    // 統一プロファイルモジュールを使用
    return createIFCProfileFromSTB(stbSteelShape, typeNorm);
  }

  /**
   * Map STB shape types to IFC profile types
   * @param {string} stbShapeType - STB shape type
   * @returns {string} IFC profile type
   */
  static mapSTBToIFCProfileType(stbShapeType) {
    const typeNorm = normalizeSectionType(stbShapeType) || stbShapeType;
    return mapToIFCProfileType(typeNorm);
  }

  /**
   * Map STB parameters to IFC-standard parameters
   * @param {Object} stbShape - STB shape parameters
   * @param {string} stbShapeType - STB shape type
   * @returns {Object} IFC-compliant parameters
   */
  static mapSTBParametersToIFC(stbShape, stbShapeType) {
    const typeNorm = normalizeSectionType(stbShapeType) || stbShapeType;
    const ifcProfile = createIFCProfileFromSTB(stbShape, typeNorm);
    return ifcProfile.ProfileParameters;
  }

  /**
   * Create THREE.Shape from IFC profile definition
   * @param {Object} ifcProfile - IFC profile definition
   * @param {string} originType - Origin type ('center', 'bottom-center', 'top-center')
   * @returns {THREE.Shape|null} Generated THREE.Shape or null
   */
  static createGeometryFromProfile(ifcProfile, originType = 'center') {
    // 組み合わせ断面の処理
    if (
      ifcProfile.ProfileType?.includes('_BACKTOBACK') ||
      ifcProfile.ProfileType?.includes('_FACETOFACE')
    ) {
      return this.createCombinedSectionGeometry(ifcProfile, originType);
    }

    switch (ifcProfile.ProfileType) {
      case IFC_PROFILE_TYPES.I_SHAPE:
        return this.createIShapeGeometry(ifcProfile.ProfileParameters, originType);

      case IFC_PROFILE_TYPES.HOLLOW_RECTANGLE:
        return this.createHollowRectGeometry(ifcProfile.ProfileParameters, originType);

      case IFC_PROFILE_TYPES.CIRCULAR_HOLLOW:
        return this.createCircularHollowGeometry(ifcProfile.ProfileParameters, originType);

      case IFC_PROFILE_TYPES.L_SHAPE:
        return this.createLShapeGeometry(ifcProfile.ProfileParameters, originType);

      case IFC_PROFILE_TYPES.U_SHAPE:
        return this.createUShapeGeometry(ifcProfile.ProfileParameters, originType);

      case IFC_PROFILE_TYPES.RECTANGLE:
        return this.createRectangleGeometry(ifcProfile.ProfileParameters, originType);

      case IFC_PROFILE_TYPES.CIRCLE:
        return this.createCircleGeometry(ifcProfile.ProfileParameters, originType);

      default:
        console.warn(`Unsupported IFC profile type: ${ifcProfile.ProfileType}`);
        return null;
    }
  }

  /**
   * Create combined section (2L/2C BACKTOBACK/FACETOFACE) profile geometry
   * @param {Object} ifcProfile - IFC profile definition with CombinationType
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createCombinedSectionGeometry(ifcProfile, originType) {
    const profileType = ifcProfile.ProfileType;
    const params = ifcProfile.ProfileParameters;

    // L形鋼の組み合わせ断面
    if (profileType === 'L_BACKTOBACK') {
      const profileData = calculate2LBackToBackProfile({
        depth: params.Depth,
        width: params.Width,
        thickness: params.Thickness,
        gap: 0,
      });
      return this.createShapeFromVertices(profileData, originType);
    }

    if (profileType === 'L_FACETOFACE') {
      const profileData = calculate2LFaceToFaceProfile({
        depth: params.Depth,
        width: params.Width,
        thickness: params.Thickness,
        gap: 0,
      });
      return this.createShapeFromVertices(profileData, originType);
    }

    // C形鋼の組み合わせ断面
    if (profileType === 'C_BACKTOBACK') {
      const profileData = calculate2CBackToBackProfile({
        overallDepth: params.Depth,
        flangeWidth: params.FlangeWidth,
        webThickness: params.WebThickness,
        flangeThickness: params.FlangeThickness,
        gap: 0,
      });
      return this.createShapeFromVertices(profileData, originType);
    }

    if (profileType === 'C_FACETOFACE') {
      const profileData = calculate2CFaceToFaceProfile({
        overallDepth: params.Depth,
        flangeWidth: params.FlangeWidth,
        webThickness: params.WebThickness,
        flangeThickness: params.FlangeThickness,
        gap: 0,
      });
      return this.createShapeFromVertices(profileData, originType);
    }

    console.warn(`Unsupported combined section type: ${profileType}`);
    return null;
  }

  /**
   * Create THREE.Shape from vertices and holes
   * @param {Object} profileData - Profile data with vertices and holes
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createShapeFromVertices(profileData, _originType) {
    const shape = new THREE.Shape();
    const { vertices, holes = [] } = profileData;

    if (!vertices || vertices.length === 0) {
      console.warn('No vertices provided for shape creation');
      return null;
    }

    // 外周の頂点を設定
    shape.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      shape.lineTo(vertices[i].x, vertices[i].y);
    }
    shape.lineTo(vertices[0].x, vertices[0].y); // 閉じる

    // 穴を追加
    for (const holeVertices of holes) {
      const holePath = new THREE.Path();
      holePath.moveTo(holeVertices[0].x, holeVertices[0].y);
      for (let i = 1; i < holeVertices.length; i++) {
        holePath.lineTo(holeVertices[i].x, holeVertices[i].y);
      }
      holePath.lineTo(holeVertices[0].x, holeVertices[0].y); // 閉じる
      shape.holes.push(holePath);
    }

    return shape;
  }

  /**
   * Create I-Shape (H-beam) profile geometry
   * @param {Object} params - IFC I-Shape parameters
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createIShapeGeometry(params, originType) {
    const { OverallWidth, OverallDepth, WebThickness, FlangeThickness } = params;

    if (
      !this.validatePositiveNumbers([OverallWidth, OverallDepth, WebThickness, FlangeThickness])
    ) {
      return null;
    }

    const shape = new THREE.Shape();
    const halfWidth = OverallWidth / 2;
    const halfDepth = OverallDepth / 2;
    const halfWeb = WebThickness / 2;
    const innerDepth = halfDepth - FlangeThickness;

    // Origin adjustment based on IFC coordinate system
    const yOffset = this.calculateOriginOffset(originType, OverallDepth);

    // Create I-shape profile (X: width, Y: depth)
    // Starting from top-left, going clockwise
    shape.moveTo(-halfWidth, halfDepth + yOffset); // Top-left
    shape.lineTo(halfWidth, halfDepth + yOffset); // Top-right
    shape.lineTo(halfWidth, innerDepth + yOffset); // Top flange inner-right
    shape.lineTo(halfWeb, innerDepth + yOffset); // Web top-right
    shape.lineTo(halfWeb, -innerDepth + yOffset); // Web bottom-right
    shape.lineTo(halfWidth, -innerDepth + yOffset); // Bottom flange inner-right
    shape.lineTo(halfWidth, -halfDepth + yOffset); // Bottom-right
    shape.lineTo(-halfWidth, -halfDepth + yOffset); // Bottom-left
    shape.lineTo(-halfWidth, -innerDepth + yOffset); // Bottom flange inner-left
    shape.lineTo(-halfWeb, -innerDepth + yOffset); // Web bottom-left
    shape.lineTo(-halfWeb, innerDepth + yOffset); // Web top-left
    shape.lineTo(-halfWidth, innerDepth + yOffset); // Top flange inner-left
    shape.closePath();

    return shape;
  }

  /**
   * Create hollow rectangle profile geometry
   * @param {Object} params - IFC hollow rectangle parameters
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createHollowRectGeometry(params, originType) {
    const { XDim, YDim, WallThickness } = params;

    if (!this.validatePositiveNumbers([XDim, YDim, WallThickness])) {
      return null;
    }

    const outerShape = new THREE.Shape();
    const innerShape = new THREE.Shape();

    const halfX = XDim / 2;
    const halfY = YDim / 2;
    const innerHalfX = halfX - WallThickness;
    const innerHalfY = halfY - WallThickness;

    const yOffset = this.calculateOriginOffset(originType, YDim);

    // Outer rectangle
    outerShape.moveTo(-halfX, -halfY + yOffset);
    outerShape.lineTo(halfX, -halfY + yOffset);
    outerShape.lineTo(halfX, halfY + yOffset);
    outerShape.lineTo(-halfX, halfY + yOffset);
    outerShape.closePath();

    // Inner rectangle (hole)
    innerShape.moveTo(-innerHalfX, -innerHalfY + yOffset);
    innerShape.lineTo(innerHalfX, -innerHalfY + yOffset);
    innerShape.lineTo(innerHalfX, innerHalfY + yOffset);
    innerShape.lineTo(-innerHalfX, innerHalfY + yOffset);
    innerShape.closePath();

    // Add hole to outer shape
    outerShape.holes = [innerShape];

    return outerShape;
  }

  /**
   * Create circular hollow profile geometry
   * @param {Object} params - IFC circular hollow parameters
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createCircularHollowGeometry(params, originType) {
    const { Radius, WallThickness } = params;

    if (!this.validatePositiveNumbers([Radius, WallThickness])) {
      return null;
    }

    const outerShape = new THREE.Shape();
    const innerShape = new THREE.Shape();
    const innerRadius = Radius - WallThickness;

    const yOffset = this.calculateOriginOffset(originType, Radius * 2);

    // Outer circle
    outerShape.absarc(0, yOffset, Radius, 0, Math.PI * 2, false);

    // Inner circle (hole)
    if (innerRadius > 0) {
      innerShape.absarc(0, yOffset, innerRadius, 0, Math.PI * 2, true);
      outerShape.holes = [innerShape];
    }

    return outerShape;
  }

  /**
   * Create L-shape profile geometry
   * @param {Object} params - IFC L-shape parameters
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createLShapeGeometry(params, originType) {
    const { Depth, Width, Thickness } = params;

    if (!this.validatePositiveNumbers([Depth, Width, Thickness])) {
      return null;
    }

    const shape = new THREE.Shape();
    const yOffset = this.calculateOriginOffset(originType, Math.max(Depth, Width));

    // L-shape starting from origin, extending in positive X and Y
    shape.moveTo(0, 0 + yOffset);
    shape.lineTo(Width, 0 + yOffset);
    shape.lineTo(Width, Thickness + yOffset);
    shape.lineTo(Thickness, Thickness + yOffset);
    shape.lineTo(Thickness, Depth + yOffset);
    shape.lineTo(0, Depth + yOffset);
    shape.closePath();

    return shape;
  }

  /**
   * Create U-Shape (Channel) profile geometry
   * @param {Object} params - IFC U-Shape parameters
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createUShapeGeometry(params, originType) {
    const { Depth, FlangeWidth, WebThickness, FlangeThickness } = params;

    if (!this.validatePositiveNumbers([Depth, FlangeWidth, WebThickness, FlangeThickness])) {
      return null;
    }

    // Asymmetric U-shape (channel): web at left, flanges extend to the right
    // Keep the profile centered in X by placing the web at x = -FlangeWidth/2 .. -FlangeWidth/2 + WebThickness
    const shape = new THREE.Shape();
    const xLeft = -FlangeWidth / 2; // outer left edge
    const xWebRight = xLeft + WebThickness; // inner edge at web
    const xRight = FlangeWidth / 2; // outer right edge (flange tips)
    const yBot = -Depth / 2 + this.calculateOriginOffset(originType, Depth);
    const yTop = Depth / 2 + this.calculateOriginOffset(originType, Depth);

    // Outline counter-clockwise around the solid U cross-section
    shape.moveTo(xLeft, yBot); // bottom-left outer
    shape.lineTo(xRight, yBot); // bottom-right outer
    shape.lineTo(xRight, yBot + FlangeThickness); // inner step up at bottom flange
    shape.lineTo(xWebRight, yBot + FlangeThickness); // move to web inner edge
    shape.lineTo(xWebRight, yTop - FlangeThickness); // up along web
    shape.lineTo(xRight, yTop - FlangeThickness); // inner step at top flange
    shape.lineTo(xRight, yTop); // top-right outer
    shape.lineTo(xLeft, yTop); // top-left outer
    shape.lineTo(xLeft, yTop - FlangeThickness); // down along left outer edge (no flange on open side)
    shape.lineTo(xLeft, yBot + FlangeThickness); // continue down
    shape.lineTo(xLeft, yBot); // close at bottom-left
    shape.closePath();

    return shape;
  }

  /**
   * Create rectangle profile geometry
   * @param {Object} params - IFC rectangle parameters
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createRectangleGeometry(params, originType) {
    const { XDim, YDim } = params;

    if (!this.validatePositiveNumbers([XDim, YDim])) {
      return null;
    }

    const shape = new THREE.Shape();
    const halfX = XDim / 2;
    const halfY = YDim / 2;
    const yOffset = this.calculateOriginOffset(originType, YDim);

    shape.moveTo(-halfX, -halfY + yOffset);
    shape.lineTo(halfX, -halfY + yOffset);
    shape.lineTo(halfX, halfY + yOffset);
    shape.lineTo(-halfX, halfY + yOffset);
    shape.closePath();

    return shape;
  }

  /**
   * Create circle profile geometry
   * @param {Object} params - IFC circle parameters
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createCircleGeometry(params, originType) {
    const { Radius } = params;

    if (!this.validatePositiveNumbers([Radius])) {
      return null;
    }

    const shape = new THREE.Shape();
    const yOffset = this.calculateOriginOffset(originType, Radius * 2);

    shape.absarc(0, yOffset, Radius, 0, Math.PI * 2, false);

    return shape;
  }

  /**
   * Calculate Y-offset based on origin type
   * @param {string} originType - Origin type
   * @param {number} totalHeight - Total height of profile
   * @returns {number} Y-offset value
   */
  static calculateOriginOffset(originType, totalHeight) {
    switch (originType) {
      case 'bottom-center':
        return totalHeight / 2;
      case 'top-center':
        return -totalHeight / 2;
      case 'center':
      default:
        return 0;
    }
  }

  /**
   * Validate that all parameters are positive numbers
   * @param {Array<number>} params - Parameters to validate
   * @returns {boolean} True if all valid
   */
  static validatePositiveNumbers(params) {
    return params.every((p) => typeof p === 'number' && p > 0 && !isNaN(p));
  }

  /**
   * Create IFC profile from section type and dimensions
   * @param {string} sectionType - Section type ('PIPE', 'RECTANGLE', etc.)
   * @param {Object} dimensions - Section dimensions
   * @returns {Object|null} IFC profile with points and metadata
   */
  static createProfile(sectionType, dimensions) {
    try {
      // Create STB steel shape format from dimensions
      const stbSteelShape = {
        name: `${sectionType}_profile`,
        ...dimensions,
      };

      // Use existing method to create IFC profile
      const ifcProfile = this.createProfileFromSTB(stbSteelShape, sectionType);

      if (!ifcProfile) {
        return null;
      }

      // Convert IFC profile to points for THREE.Shape
      let points = [];

      switch (ifcProfile.ProfileType) {
        case IFC_PROFILE_TYPES.CIRCULAR_HOLLOW:
        case IFC_PROFILE_TYPES.CIRCLE: {
          // For circular (PIPE or solid CIRCLE), create circle points
          // 半径の取得: radius > outerDiameter/2 > D/2 > diameter/2 の優先順位
          let radius;
          if (dimensions.radius !== undefined && dimensions.radius !== null) {
            // 半径が直接指定されている場合はそのまま使用
            radius = dimensions.radius;
          } else if (dimensions.outerDiameter) {
            // 外径が指定されている場合は2で割る
            radius = dimensions.outerDiameter / 2;
          } else if (dimensions.D || dimensions.diameter) {
            // 直径（D または diameter）が指定されている場合は2で割る
            radius = (dimensions.D || dimensions.diameter) / 2;
          } else {
            // デフォルト値
            radius = 250;
          }
          points = this._createCirclePoints(radius, 64); // More points for smooth circle
          break;
        }

        case IFC_PROFILE_TYPES.RECTANGLE:
          // For rectangle, create rectangle points
          const width = dimensions.width || dimensions.W || 500;
          const height = dimensions.height || dimensions.H || 500;
          points = this._createRectanglePoints(width, height);
          break;

        default:
          // For other types, try to get points from profile parameters
          if (ifcProfile.ProfileParameters && ifcProfile.ProfileParameters.points) {
            points = ifcProfile.ProfileParameters.points;
          } else {
            return null;
          }
      }

      return {
        points: points,
        metadata: {
          profileType: ifcProfile.ProfileType,
          profileName: ifcProfile.ProfileName,
        },
      };
    } catch (error) {
      console.warn(`IFCProfileFactory.createProfile failed for ${sectionType}:`, error);
      return null;
    }
  }

  /**
   * Create circle points for circular profiles
   * @private
   * @param {number} radius - Circle radius
   * @param {number} segments - Number of segments (default: 32)
   * @returns {Array} Array of THREE.Vector2 points
   */
  static _createCirclePoints(radius, segments = 32) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
    }
    return points;
  }

  /**
   * Create rectangle points
   * @private
   * @param {number} width - Rectangle width
   * @param {number} height - Rectangle height
   * @returns {Array} Array of THREE.Vector2 points
   */
  static _createRectanglePoints(width, height) {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return [
      new THREE.Vector2(-halfWidth, -halfHeight),
      new THREE.Vector2(halfWidth, -halfHeight),
      new THREE.Vector2(halfWidth, halfHeight),
      new THREE.Vector2(-halfWidth, halfHeight),
    ];
  }
}

/**
 * IFC-compliant extrusion engine
 */
export class IFCExtrusionEngine {
  /**
   * Extrude profile along linear path
   * @param {THREE.Shape} profileShape - Profile to extrude
   * @param {number} extrusionLength - Length of extrusion (mm)
   * @param {THREE.Vector3} extrusionDirection - Direction vector (normalized)
   * @returns {THREE.ExtrudeGeometry} Extruded geometry
   */
  static extrudeLinear(
    profileShape,
    extrusionLength,
    extrusionDirection = new THREE.Vector3(0, 0, 1),
  ) {
    const extrudeSettings = {
      depth: extrusionLength,
      bevelEnabled: false,
      steps: 1,
      extrudePath: null, // Linear extrusion doesn't need path
    };

    const geometry = new THREE.ExtrudeGeometry(profileShape, extrudeSettings);

    // Center the geometry along extrusion axis
    geometry.translate(0, 0, -extrusionLength / 2);

    // Apply rotation if extrusion direction is not Z-axis
    if (!extrusionDirection.equals(new THREE.Vector3(0, 0, 1))) {
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), extrusionDirection);
      geometry.applyQuaternion(quaternion);
    }

    return geometry;
  }

  /**
   * Extrude profile along curved path
   * @param {THREE.Shape} profileShape - Profile to extrude
   * @param {THREE.Curve} extrusionPath - Curve to extrude along
   * @param {number} steps - Number of extrusion steps
   * @returns {THREE.ExtrudeGeometry} Extruded geometry
   */
  static extrudeAlongPath(profileShape, extrusionPath, steps = 50) {
    const extrudeSettings = {
      steps: steps,
      bevelEnabled: false,
      extrudePath: extrusionPath,
    };

    return new THREE.ExtrudeGeometry(profileShape, extrudeSettings);
  }

  /**
   * Create linear extrusion path
   * @param {THREE.Vector3} startPoint - Start point
   * @param {THREE.Vector3} endPoint - End point
   * @returns {THREE.LineCurve3} Linear curve
   */
  static createLinearPath(startPoint, endPoint) {
    return new THREE.LineCurve3(startPoint, endPoint);
  }

  /**
   * Create curved extrusion path (quadratic bezier)
   * @param {THREE.Vector3} startPoint - Start point
   * @param {THREE.Vector3} controlPoint - Control point
   * @param {THREE.Vector3} endPoint - End point
   * @returns {THREE.QuadraticBezierCurve3} Curved path
   */
  static createCurvedPath(startPoint, controlPoint, endPoint) {
    return new THREE.QuadraticBezierCurve3(startPoint, controlPoint, endPoint);
  }
}

/**
 * STB to IFC conversion utilities
 */
export class STBToIFCConverter {
  /**
   * Convert STB element to IFC-extruded geometry
   * @param {Object} stbElement - STB element data
   * @param {Object} stbSectionData - STB section data
   * @param {THREE.Vector3} startNode - Start node position
   * @param {THREE.Vector3} endNode - End node position
   * @param {string} originType - Origin type
   * @returns {THREE.ExtrudeGeometry|null} Generated geometry
   */
  static convertSTBElementToIFCGeometry(
    stbElement,
    stbSectionData,
    startNode,
    endNode,
    originType = 'center',
  ) {
    // Step 1: Determine shape type from STB section
    const shapeType = this.determineSTBShapeType(stbSectionData);

    // Step 2: Create IFC profile from STB data
    const ifcProfile = IFCProfileFactory.createProfileFromSTB(
      stbSectionData.shape || stbSectionData,
      shapeType,
    );

    // Step 3: Generate profile geometry
    const profileShape = IFCProfileFactory.createGeometryFromProfile(ifcProfile, originType);
    if (!profileShape) {
      return null;
    }

    // Step 4: Calculate extrusion parameters
    const extrusionVector = new THREE.Vector3().subVectors(endNode, startNode);
    const extrusionLength = extrusionVector.length();
    const extrusionDirection = extrusionVector.normalize();

    // Step 5: Extrude profile
    const geometry = IFCExtrusionEngine.extrudeLinear(
      profileShape,
      extrusionLength,
      extrusionDirection,
    );

    return geometry;
  }

  /**
   * Determine shape type from STB section data
   * @param {Object} sectionData - STB section data
   * @returns {string} Shape type identifier
   */
  static determineSTBShapeType(sectionData) {
    if (sectionData.type) {
      if (sectionData.type.includes('H')) return 'H';
      if (sectionData.type.includes('BOX')) return 'BOX';
      if (sectionData.type.includes('Pipe')) return 'Pipe';
      if (sectionData.type.includes('L')) return 'L';
      if (sectionData.type.includes('T')) return 'T';
      if (sectionData.type.includes('C')) return 'C';
      if (sectionData.type.includes('Rect')) return 'Rect';
      if (sectionData.type.includes('Circle')) return 'Circle';
    }

    // Fallback: analyze available parameters
    if (sectionData.shape) {
      const shape = sectionData.shape;
      if (shape.A && shape.B && shape.t1 && shape.t2) return 'H';
      if (shape.B && shape.A && shape.t) return 'BOX';
      if (shape.D && shape.t) return 'Pipe';
      if (shape.width && shape.height) return 'Rect';
      if (shape.D && !shape.t) return 'Circle';
    }

    return 'Rect'; // Default fallback
  }
}
