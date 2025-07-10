/**
 * @fileoverview IFC Profile Factory for IFC-compliant profile extrusion
 *
 * This module provides IFC-standard profile creation compatible with IFC4/IFC4.3 specifications:
 * - IFC Profile definition following international standards
 * - Parametric profile creation for structural elements
 * - Support for IfcIShapeProfileDef, IfcRectangleProfileDef, IfcCircleProfileDef
 * - IFC-compliant coordinate systems and measurements
 * - Extrusion along arbitrary paths (linear and curved)
 * - Bridge between STB format and IFC profile standards
 *
 * This enables compatibility with international BIM workflows and IFC export/import.
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";

/**
 * IFC Profile Types enumeration following IFC standard
 */
export const IFC_PROFILE_TYPES = {
  I_SHAPE: 'IfcIShapeProfileDef',
  RECTANGLE: 'IfcRectangleProfileDef', 
  CIRCLE: 'IfcCircleProfileDef',
  HOLLOW_RECTANGLE: 'IfcRectangleHollowProfileDef',
  CIRCULAR_HOLLOW: 'IfcCircularHollowProfileDef',
  L_SHAPE: 'IfcLShapeProfileDef',
  T_SHAPE: 'IfcTShapeProfileDef',
  U_SHAPE: 'IfcUShapeProfileDef',
  C_SHAPE: 'IfcCShapeProfileDef'
};

/**
 * IFC Profile Factory for creating standardized profiles
 */
export class IFCProfileFactory {
  
  /**
   * Create IFC profile from STB steel shape data
   * @param {Object} stbSteelShape - STB steel shape parameters
   * @param {string} stbShapeType - STB shape type identifier
   * @returns {Object} IFC profile definition
   */
  static createProfileFromSTB(stbSteelShape, stbShapeType) {
    const ifcProfile = {
      ProfileType: this.mapSTBToIFCProfileType(stbShapeType),
      ProfileName: `STB_${stbShapeType}_${stbSteelShape.name || 'Custom'}`,
      ProfileParameters: this.mapSTBParametersToIFC(stbSteelShape, stbShapeType)
    };
    
    return ifcProfile;
  }

  /**
   * Map STB shape types to IFC profile types
   * @param {string} stbShapeType - STB shape type
   * @returns {string} IFC profile type
   */
  static mapSTBToIFCProfileType(stbShapeType) {
    const mapping = {
      'H': IFC_PROFILE_TYPES.I_SHAPE,
      'BOX': IFC_PROFILE_TYPES.HOLLOW_RECTANGLE,
      'Pipe': IFC_PROFILE_TYPES.CIRCULAR_HOLLOW,
      'L': IFC_PROFILE_TYPES.L_SHAPE,
      'T': IFC_PROFILE_TYPES.T_SHAPE,
      'C': IFC_PROFILE_TYPES.U_SHAPE,
      'Rect': IFC_PROFILE_TYPES.RECTANGLE,
      'Circle': IFC_PROFILE_TYPES.CIRCLE
    };
    
    return mapping[stbShapeType] || IFC_PROFILE_TYPES.RECTANGLE;
  }

  /**
   * Map STB parameters to IFC-standard parameters
   * @param {Object} stbShape - STB shape parameters
   * @param {string} stbShapeType - STB shape type
   * @returns {Object} IFC-compliant parameters
   */
  static mapSTBParametersToIFC(stbShape, stbShapeType) {
    switch (stbShapeType) {
      case 'H':
        return {
          // IFC I-Shape Profile parameters (mm)
          OverallWidth: parseFloat(stbShape.B),      // Flange width
          OverallDepth: parseFloat(stbShape.A),      // Overall height
          WebThickness: parseFloat(stbShape.t1),     // Web thickness
          FlangeThickness: parseFloat(stbShape.t2),  // Flange thickness
          FilletRadius: parseFloat(stbShape.r || 0)  // Fillet radius
        };
        
      case 'BOX':
        return {
          // IFC Rectangle Hollow Profile parameters (mm)
          XDim: parseFloat(stbShape.B),              // Width
          YDim: parseFloat(stbShape.A),              // Height
          WallThickness: parseFloat(stbShape.t),     // Wall thickness
          InnerFilletRadius: parseFloat(stbShape.r1 || 0),
          OuterFilletRadius: parseFloat(stbShape.r2 || 0)
        };
        
      case 'Pipe':
        return {
          // IFC Circular Hollow Profile parameters (mm)
          Radius: parseFloat(stbShape.D) / 2,        // Outer radius
          WallThickness: parseFloat(stbShape.t)      // Wall thickness
        };
        
      case 'L':
        return {
          // IFC L-Shape Profile parameters (mm)
          Depth: parseFloat(stbShape.A),             // Leg length A
          Width: parseFloat(stbShape.B),             // Leg length B
          Thickness: parseFloat(stbShape.t),         // Thickness
          FilletRadius: parseFloat(stbShape.r || 0),
          EdgeRadius: parseFloat(stbShape.r || 0)
        };
        
      case 'Rect':
        return {
          // IFC Rectangle Profile parameters (mm)
          XDim: parseFloat(stbShape.width || stbShape.B),
          YDim: parseFloat(stbShape.height || stbShape.D)
        };
        
      case 'Circle':
        return {
          // IFC Circle Profile parameters (mm)
          Radius: parseFloat(stbShape.D) / 2
        };
        
      default:
        return {
          XDim: 100,  // Default 100mm x 100mm rectangle
          YDim: 100
        };
    }
  }

  /**
   * Create THREE.Shape from IFC profile definition
   * @param {Object} ifcProfile - IFC profile definition
   * @param {string} originType - Origin type ('center', 'bottom-center', 'top-center')
   * @returns {THREE.Shape|null} Generated THREE.Shape or null
   */
  static createGeometryFromProfile(ifcProfile, originType = 'center') {
    switch (ifcProfile.ProfileType) {
      case IFC_PROFILE_TYPES.I_SHAPE:
        return this.createIShapeGeometry(ifcProfile.ProfileParameters, originType);
        
      case IFC_PROFILE_TYPES.HOLLOW_RECTANGLE:
        return this.createHollowRectGeometry(ifcProfile.ProfileParameters, originType);
        
      case IFC_PROFILE_TYPES.CIRCULAR_HOLLOW:
        return this.createCircularHollowGeometry(ifcProfile.ProfileParameters, originType);
        
      case IFC_PROFILE_TYPES.L_SHAPE:
        return this.createLShapeGeometry(ifcProfile.ProfileParameters, originType);
        
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
   * Create I-Shape (H-beam) profile geometry
   * @param {Object} params - IFC I-Shape parameters
   * @param {string} originType - Origin type
   * @returns {THREE.Shape} Generated shape
   */
  static createIShapeGeometry(params, originType) {
    const { OverallWidth, OverallDepth, WebThickness, FlangeThickness, FilletRadius = 0 } = params;
    
    if (!this.validatePositiveNumbers([OverallWidth, OverallDepth, WebThickness, FlangeThickness])) {
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
    shape.moveTo(-halfWidth, halfDepth + yOffset);                    // Top-left
    shape.lineTo(halfWidth, halfDepth + yOffset);                     // Top-right
    shape.lineTo(halfWidth, innerDepth + yOffset);                    // Top flange inner-right
    shape.lineTo(halfWeb, innerDepth + yOffset);                      // Web top-right
    shape.lineTo(halfWeb, -innerDepth + yOffset);                     // Web bottom-right
    shape.lineTo(halfWidth, -innerDepth + yOffset);                   // Bottom flange inner-right
    shape.lineTo(halfWidth, -halfDepth + yOffset);                    // Bottom-right
    shape.lineTo(-halfWidth, -halfDepth + yOffset);                   // Bottom-left
    shape.lineTo(-halfWidth, -innerDepth + yOffset);                  // Bottom flange inner-left
    shape.lineTo(-halfWeb, -innerDepth + yOffset);                    // Web bottom-left
    shape.lineTo(-halfWeb, innerDepth + yOffset);                     // Web top-left
    shape.lineTo(-halfWidth, innerDepth + yOffset);                   // Top flange inner-left
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
    return params.every(p => typeof p === 'number' && p > 0 && !isNaN(p));
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
  static extrudeLinear(profileShape, extrusionLength, extrusionDirection = new THREE.Vector3(0, 0, 1)) {
    const extrudeSettings = {
      depth: extrusionLength,
      bevelEnabled: false,
      steps: 1,
      extrudePath: null // Linear extrusion doesn't need path
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
      extrudePath: extrusionPath
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
  static convertSTBElementToIFCGeometry(stbElement, stbSectionData, startNode, endNode, originType = 'center') {
    // Step 1: Determine shape type from STB section
    const shapeType = this.determineSTBShapeType(stbSectionData);
    
    // Step 2: Create IFC profile from STB data
    const ifcProfile = IFCProfileFactory.createProfileFromSTB(
      stbSectionData.shape || stbSectionData,
      shapeType
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
    const geometry = IFCExtrusionEngine.extrudeLinear(profileShape, extrusionLength, extrusionDirection);
    
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