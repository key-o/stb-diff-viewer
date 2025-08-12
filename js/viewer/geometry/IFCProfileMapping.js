/**
 * Browser-agnostic IFC profile mapping utilities.
 * Contains only mapping and parameter transforms (no THREE import).
 */
import { normalizeSectionType } from "../../common/sectionTypeUtil.js";

export const IFC_PROFILE_TYPES = {
  I_SHAPE: "IfcIShapeProfileDef",
  RECTANGLE: "IfcRectangleProfileDef",
  CIRCLE: "IfcCircleProfileDef",
  HOLLOW_RECTANGLE: "IfcRectangleHollowProfileDef",
  CIRCULAR_HOLLOW: "IfcCircularHollowProfileDef",
  L_SHAPE: "IfcLShapeProfileDef",
  T_SHAPE: "IfcTShapeProfileDef",
  U_SHAPE: "IfcUShapeProfileDef",
  C_SHAPE: "IfcCShapeProfileDef",
};

export function mapSTBToIFCProfileType(stbShapeType) {
  const mapping = {
    H: IFC_PROFILE_TYPES.I_SHAPE,
    BOX: IFC_PROFILE_TYPES.HOLLOW_RECTANGLE,
    Pipe: IFC_PROFILE_TYPES.CIRCULAR_HOLLOW,
    PIPE: IFC_PROFILE_TYPES.CIRCULAR_HOLLOW,
    L: IFC_PROFILE_TYPES.L_SHAPE,
    T: IFC_PROFILE_TYPES.T_SHAPE,
    C: IFC_PROFILE_TYPES.U_SHAPE,
    Rect: IFC_PROFILE_TYPES.RECTANGLE,
    RECTANGLE: IFC_PROFILE_TYPES.RECTANGLE,
    Circle: IFC_PROFILE_TYPES.CIRCLE,
    CIRCLE: IFC_PROFILE_TYPES.CIRCLE,
  };
  return mapping[stbShapeType] || IFC_PROFILE_TYPES.RECTANGLE;
}

export function mapSTBParametersToIFC(stbShape, stbShapeType) {
  const typeNorm = normalizeSectionType(stbShapeType) || stbShapeType;
  switch (typeNorm) {
    case "H":
      return {
        OverallWidth: parseFloat(stbShape.B),
        OverallDepth: parseFloat(stbShape.A),
        WebThickness: parseFloat(stbShape.t1),
        FlangeThickness: parseFloat(stbShape.t2),
        FilletRadius: parseFloat(stbShape.r || 0),
      };
    case "BOX":
      return {
        XDim: parseFloat(stbShape.B),
        YDim: parseFloat(stbShape.A),
        WallThickness: parseFloat(stbShape.t),
        InnerFilletRadius: parseFloat(stbShape.r1 || 0),
        OuterFilletRadius: parseFloat(stbShape.r2 || 0),
      };
    case "PIPE":
    case "Pipe":
      return {
        Radius: parseFloat(stbShape.D) / 2,
        WallThickness: parseFloat(stbShape.t),
      };
    case "L":
      return {
        Depth: parseFloat(stbShape.A),
        Width: parseFloat(stbShape.B),
        Thickness: parseFloat(stbShape.t),
        FilletRadius: parseFloat(stbShape.r || 0),
        EdgeRadius: parseFloat(stbShape.r || 0),
      };
    case "C":
      return {
        Depth: parseFloat(stbShape.A),
        FlangeWidth: parseFloat(stbShape.B),
        WebThickness: parseFloat(stbShape.t1),
        FlangeThickness: parseFloat(stbShape.t2),
        FilletRadius: parseFloat(stbShape.r1 || 0),
        EdgeRadius: parseFloat(stbShape.r2 || 0),
      };
    case "RECTANGLE":
    case "Rect":
      return {
        XDim: parseFloat(stbShape.width || stbShape.B),
        YDim: parseFloat(stbShape.height || stbShape.D),
      };
    case "CIRCLE":
    case "Circle":
      return {
        Radius: parseFloat(stbShape.D) / 2,
      };
    default:
      return { XDim: 100, YDim: 100 };
  }
}

export function createProfileFromSTB(stbSteelShape, stbShapeType) {
  const typeNorm = normalizeSectionType(stbShapeType) || stbShapeType;
  return {
    ProfileType: mapSTBToIFCProfileType(typeNorm),
    ProfileName: `STB_${typeNorm}_${stbSteelShape.name || "Custom"}`,
    ProfileParameters: mapSTBParametersToIFC(stbSteelShape, typeNorm),
  };
}
