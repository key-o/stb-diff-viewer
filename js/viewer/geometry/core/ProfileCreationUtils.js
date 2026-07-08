/**
 * @fileoverview プロファイル作成ユーティリティ
 *
 * Column, Post, FoundationColumn ジェネレーター間で共有される
 * プロファイル作成・断面解決ロジックを集約。
 *
 * 抽出元:
 * - ProfileBasedColumnGenerator._tryIFCProfile, _createProfileUsingCalculator, etc.
 * - ProfileBasedPostGenerator._tryIFCProfile, _createProfileUsingCalculator, etc.
 * - ProfileBasedFoundationColumnGenerator._tryIFCProfile, _createProfileUsingCalculator, etc.
 */

import * as THREE from 'three';
import { calculateProfile } from './ProfileCalculator.js';
import {
  convertProfileToThreeShape,
  createExtrudeGeometry,
  applyPlacementToMesh,
} from './ThreeJSConverter.js';
import { calculateColumnPlacement } from './GeometryCalculator.js';
import { colorManager } from '../../rendering/colorManager.js';
import { IFCProfileFactory } from '../IFCProfileFactory.js';
import { mapToProfileParams } from './ProfileParameterMapper.js';
import { ElementGeometryUtils } from '../ElementGeometryUtils.js';
// E4: 全レイヤー → common-stb/import/ は許可（STB読み込み共通カーネル）
import { parseDimensionsFromShapeName } from '../../../common-stb/import/extractor/dimensionExtractors.js';

/**
 * 有限数値への変換ヘルパー
 * @param {*} value - 値
 * @param {number} defaultValue - 既定値
 * @returns {number} 数値
 */
export function toFiniteNumber(value, defaultValue) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

/**
 * CROSS_H断面かどうかを判定
 * @param {Object} sectionData - 断面データ
 * @returns {boolean}
 */
export function isCrossHSection(sectionData) {
  if (!sectionData || typeof sectionData !== 'object') {
    return false;
  }

  const dimensions = sectionData.dimensions || {};
  if (dimensions.crossH_shapeX || dimensions.crossH_shapeY) {
    return true;
  }

  const candidates = [
    sectionData.section_type,
    sectionData.profile_type,
    sectionData.sectionType,
    dimensions.profile_hint,
    sectionData.steelShape?.type,
    sectionData.steelProfile?.section_type,
  ];

  for (const candidate of candidates) {
    const up = String(candidate || '')
      .trim()
      .toUpperCase();
    if (
      up === 'CROSS_H' ||
      up === 'CROSS-H' ||
      up === 'CROSS' ||
      up === 'CRUCIFORM' ||
      up === '+'
    ) {
      return true;
    }
  }

  return false;
}

/**
 * T形複合断面（shape_H + shape_T）かどうかを判定
 * @param {Object} sectionData - 断面データ
 * @returns {boolean}
 */
export function isShapeTSection(sectionData) {
  if (!sectionData || typeof sectionData !== 'object') {
    return false;
  }
  if (sectionData.isShapeT) return true;

  const dimensions = sectionData.dimensions || {};
  if (dimensions.shapeT_shapeH || dimensions.profile_hint === 'SHAPE_T') {
    return true;
  }

  const candidates = [
    sectionData.section_type,
    sectionData.profile_type,
    sectionData.sectionType,
    dimensions.profile_hint,
    sectionData.steelProfile?.section_type,
    sectionData.steelProfile?.dimensions?.profile_hint,
  ];
  return candidates.some((c) => String(c || '').toUpperCase() === 'SHAPE_T');
}

/**
 * IFCProfileFactoryを使用したプロファイル生成を試行
 * @param {Object} sectionData - 断面データ
 * @param {string} sectionType - 断面タイプ
 * @param {Object} log - ロガー
 * @param {Object} [options] - オプション
 * @param {boolean} [options.supportCircle=false] - CIRCLE断面をサポートするか
 * @returns {Object|null} プロファイル結果
 */
export function tryIFCProfile(sectionData, sectionType, log, options = {}) {
  const { supportCircle = false } = options;
  const steelTypes = new Set(['H', 'BOX', 'PIPE', 'L', 'T', 'C', 'CIRCLE']);

  try {
    let ifcProfile = null;

    if (steelTypes.has(sectionType) && sectionData.steelShape) {
      ifcProfile = IFCProfileFactory.createProfileFromSTB(sectionData.steelShape, sectionType);
    } else if (sectionType === 'RECTANGLE') {
      const rectDims = sectionData.dimensions || sectionData;
      ifcProfile = {
        ProfileType: IFCProfileFactory.mapSTBToIFCProfileType('RECTANGLE'),
        ProfileName: `STB_RECT_${
          rectDims.width || rectDims.outer_width || rectDims.width_X || 'W'
        }x${rectDims.height || rectDims.outer_height || rectDims.width_Y || 'H'}`,
        ProfileParameters: {
          XDim: rectDims.width || rectDims.outer_width || rectDims.width_X,
          YDim: rectDims.height || rectDims.outer_height || rectDims.width_Y || rectDims.depth,
        },
      };
    } else if (supportCircle && sectionType === 'CIRCLE') {
      const circleDims = sectionData.dimensions || sectionData;
      const diameter = circleDims.diameter || circleDims.D;
      if (diameter) {
        ifcProfile = {
          ProfileType: 'IfcCircleProfileDef',
          ProfileName: `STB_CIRCLE_D${diameter}`,
          ProfileParameters: {
            Radius: diameter / 2,
          },
        };
      }
    }

    if (ifcProfile) {
      const threeJSProfile = IFCProfileFactory.createGeometryFromProfile(ifcProfile, 'center');
      if (threeJSProfile) {
        log.debug(`IFC profile created successfully: ${ifcProfile.ProfileType}`);
        return {
          shape: threeJSProfile,
          meta: {
            profileSource: 'ifc',
            sectionTypeResolved: sectionType,
            factoryType: ifcProfile.ProfileType,
          },
        };
      }
    }
  } catch (error) {
    log.warn(`IFC profile creation failed for ${sectionType}: ${error?.message}`);
  }

  return null;
}

/**
 * ProfileCalculatorを使用したプロファイル生成（フォールバック）
 * @param {Object} sectionData - 断面データ
 * @param {string} sectionType - 断面タイプ
 * @param {Object} log - ロガー
 * @returns {Object|null} プロファイル結果
 */
export function createProfileUsingCalculator(sectionData, sectionType, log) {
  const dimensions = sectionData.dimensions || sectionData;
  const profileParams = mapToProfileParams(dimensions, sectionType);

  try {
    const profileData = calculateProfile(sectionType, profileParams);
    const threeShape = convertProfileToThreeShape(profileData);

    log.debug(`Profile created using ProfileCalculator: ${sectionType}`);

    return {
      shape: threeShape,
      meta: {
        profileSource: 'calculator',
        sectionTypeResolved: sectionType,
      },
    };
  } catch (error) {
    log.error(`ProfileCalculator creation failed for ${sectionType}: ${error?.message}`);
    return null;
  }
}

/**
 * 断面プロファイルを作成（IFC優先、フォールバックでProfileCalculator）
 * @param {Object} sectionData - 断面データ
 * @param {string} sectionType - 断面タイプ
 * @param {string} elementId - 要素ID（ログ用）
 * @param {Object} log - ロガー
 * @param {Object} [options] - IFCプロファイルオプション
 * @returns {Object|null} プロファイル結果
 */
export function createSectionProfile(sectionData, sectionType, elementId, log, options = {}) {
  log.debug(`Creating profile for ${elementId}: section_type=${sectionType}`);

  const ifcResult = tryIFCProfile(sectionData, sectionType, log, options);
  if (ifcResult) {
    return ifcResult;
  }

  return createProfileUsingCalculator(sectionData, sectionType, log);
}

/**
 * CROSS_H断面の形状名から実際のH鋼寸法を解決
 * @param {Object} dimensions - crossH_shapeX/crossH_shapeY を含む寸法データ
 * @param {Map} steelSections - 鋼材形状マップ
 * @returns {Object|null} 解決された寸法データ、または null
 */
export function resolveCrossHDimensions(dimensions, steelSections) {
  if (!dimensions) return null;

  const shapeX = dimensions.crossH_shapeX;
  const shapeY = dimensions.crossH_shapeY;

  if (!shapeX) return null;

  const dataX = steelSections?.get(shapeX);
  const dataY = steelSections?.get(shapeY || shapeX);

  const getDim = (data, key) => {
    if (!data) return null;
    const d = data.dimensions || data;
    return d[key] || null;
  };

  const hX = getDim(dataX, 'H') || getDim(dataX, 'A') || 400.0;
  const bX = getDim(dataX, 'B') || 200.0;
  const hY = getDim(dataY, 'H') || getDim(dataY, 'A') || hX;
  const bY = getDim(dataY, 'B') || bX;

  return {
    profile_hint: 'CROSS_H',
    crossH_shapeX: shapeX,
    crossH_shapeY: shapeY || shapeX,
    overallDepthX: hX,
    overallWidthX: bX,
    overallDepthY: hY,
    overallWidthY: bY,
  };
}

/**
 * H断面寸法を鋼材定義から解決（不足時はフォールバック）
 * @param {string} shapeName - 鋼材形状名
 * @param {Map} steelSections - 鋼材形状マップ
 * @param {Object} [fallback={}] - フォールバック寸法
 * @returns {Object} H断面寸法
 */
export function resolveHDimensions(shapeName, steelSections, fallback = {}) {
  const source = steelSections?.get(shapeName);
  const dims = source?.dimensions || source || {};

  const H = toFiniteNumber(
    dims.H ?? dims.A ?? dims.height ?? dims.overall_depth,
    fallback.H ?? 400,
  );
  const B = toFiniteNumber(dims.B ?? dims.width ?? dims.overall_width, fallback.B ?? 200);
  const t1 = toFiniteNumber(
    dims.t1 ?? dims.tw ?? dims.web_thickness ?? dims.webThickness,
    fallback.t1 ?? 9,
  );
  const t2 = toFiniteNumber(
    dims.t2 ?? dims.tf ?? dims.flange_thickness ?? dims.flangeThickness,
    fallback.t2 ?? 14,
  );
  const r = toFiniteNumber(dims.r ?? dims.fillet_radius ?? dims.filletRadius, fallback.r ?? 0);

  return {
    profile_hint: 'H',
    H,
    B,
    t1,
    t2,
    r,
    height: H,
    width: B,
    overall_depth: H,
    overall_width: B,
    web_thickness: t1,
    flange_thickness: t2,
  };
}

/**
 * ベースプレート（柱脚プレート）のメッシュを生成
 * @param {Object} basePlate - ベースプレートデータ {baseType, B_X, B_Y, t, offset_X, offset_Y}
 * @param {Object} bottomNode - 下端ノード座標 {x, y, z}
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @param {boolean} isJsonInput - JSON入力かどうか
 * @param {number} rollAngle - 回転角度（ラジアン）
 * @param {Object} log - ロガー
 * @returns {THREE.Mesh|null}
 */
export function createBasePlateMesh(
  basePlate,
  bottomNode,
  element,
  elementType,
  isJsonInput,
  rollAngle,
  log,
) {
  const { B_X, B_Y, t, offset_X = 0, offset_Y = 0 } = basePlate;

  if (!B_X || !B_Y || !t) {
    log.warn(`${element.id}: ベースプレートの寸法が不足 (B_X=${B_X}, B_Y=${B_Y}, t=${t})`);
    return null;
  }

  const geometry = new THREE.BoxGeometry(B_X, B_Y, t);
  const mesh = new THREE.Mesh(
    geometry,
    colorManager.getMaterial('diff', { comparisonState: 'matched' }),
  );

  mesh.position.set(bottomNode.x + offset_X, bottomNode.y + offset_Y, bottomNode.z - t / 2);

  if (rollAngle !== 0) {
    mesh.rotation.z = rollAngle;
  }

  mesh.userData = {
    elementType: elementType,
    elementId: element.id,
    isJsonInput: isJsonInput,
    isBasePlate: true,
    basePlateData: { baseType: basePlate.baseType, B_X, B_Y, t },
    sectionType: 'RECTANGLE',
    profileBased: false,
    profileMeta: { profileSource: 'BoxGeometry', profileType: 'BASE_PLATE' },
  };

  return mesh;
}

/**
 * SRC造のRC（コンクリート）部分のジオメトリを生成
 * @param {Object} params - パラメータ
 * @param {Object} params.sectionData - 断面データ
 * @param {Object} params.element - 要素データ
 * @param {Object} params.placement - 配置情報
 * @param {string} params.elementType - 要素タイプ
 * @param {boolean} params.isJsonInput - JSON入力かどうか
 * @param {Object} params.log - ロガー
 * @param {Function} params.buildMetadata - メタデータ構築関数
 * @param {number|null} [params.concreteColor] - コンクリート部分のカラー
 * @returns {THREE.Mesh|null}
 */
export function createSRCConcreteGeometry(params) {
  const {
    sectionData,
    element,
    placement,
    elementType,
    isJsonInput,
    log,
    buildMetadata,
    concreteColor = null,
  } = params;

  const concreteProfile = sectionData.concreteProfile;
  if (!concreteProfile) {
    return null;
  }

  let width, height;
  if (concreteProfile.profileType === 'CIRCLE') {
    const diameter = concreteProfile.diameter;
    if (!diameter) {
      log.warn(`${element.id}: SRC円形断面の直径が不明です`);
      return null;
    }
    width = diameter;
    height = diameter;
  } else {
    width = concreteProfile.width_X || concreteProfile.width;
    height = concreteProfile.width_Y || concreteProfile.height;
    if (!width || !height) {
      log.warn(`${element.id}: SRC矩形断面の寸法が不明です (width=${width}, height=${height})`);
      return null;
    }
  }

  log.debug(`${element.id}: SRC RC部分 - ${concreteProfile.profileType} ${width}x${height}`);

  const rcDimensions = {
    width: width,
    height: height,
    outer_width: width,
    outer_height: height,
  };

  // 円形の場合はdiameterを明示的に設定
  if (concreteProfile.profileType === 'CIRCLE') {
    rcDimensions.diameter = concreteProfile.diameter;
  }

  const rcSectionData = {
    section_type: concreteProfile.profileType,
    dimensions: rcDimensions,
  };

  const rcProfileResult = createSectionProfile(
    rcSectionData,
    concreteProfile.profileType,
    element.id,
    log,
  );

  if (!rcProfileResult || !rcProfileResult.shape) {
    log.warn(`${element.id}: SRC RC部分のプロファイル生成に失敗`);
    return null;
  }

  const rcGeometry = createExtrudeGeometry(rcProfileResult.shape, placement.length);
  if (!rcGeometry) {
    log.warn(`${element.id}: SRC RC部分のジオメトリ生成に失敗`);
    return null;
  }

  const materialOptions = { comparisonState: 'matched', isTransparent: true };
  if (concreteColor) {
    materialOptions.overrideColor = concreteColor;
  }

  const rcMesh = new THREE.Mesh(rcGeometry, colorManager.getMaterial('diff', materialOptions));

  applyPlacementToMesh(rcMesh, placement);

  rcMesh.userData = buildMetadata({
    element: element,
    elementType: elementType,
    placement: placement,
    sectionType: concreteProfile.profileType,
    profileResult: rcProfileResult,
    sectionData: rcSectionData,
    isJsonInput: isJsonInput,
  });
  rcMesh.userData.isSRCConcrete = true;
  rcMesh.userData.srcComponentType = 'RC';

  return rcMesh;
}

/**
 * CROSS_H断面をH鋼2本（0度/90度）として生成
 * @param {Object} params - パラメータ
 * @param {Object} params.element - 要素データ
 * @param {Object} params.placement - 配置情報
 * @param {Object} params.crossDimensions - CROSS_H寸法/shape情報
 * @param {Map} params.steelSections - 鋼材形状マップ
 * @param {string} params.elementType - 要素タイプ
 * @param {boolean} params.isJsonInput - JSON入力かどうか
 * @param {Object} params.log - ロガー
 * @param {Function} params.buildMetadata - メタデータ構築関数
 * @param {number|null} [params.steelColor] - 鋼材部分のカラー
 * @returns {Array<THREE.Mesh>|null}
 */
export function createCrossHSteelMeshes(params) {
  const {
    element,
    placement,
    crossDimensions,
    steelSections,
    elementType,
    isJsonInput,
    log,
    buildMetadata,
    steelColor = null,
  } = params;

  if (!crossDimensions) return null;

  const shapeX = crossDimensions.crossH_shapeX || null;
  const shapeY = crossDimensions.crossH_shapeY || shapeX;
  if (!shapeX) return null;

  const fallbackX = {
    H: crossDimensions.overallDepthX || crossDimensions['H_x'] || crossDimensions.H,
    B: crossDimensions.overallWidthX || crossDimensions['B_x'] || crossDimensions.B,
  };
  const fallbackY = {
    H: crossDimensions.overallDepthY || crossDimensions['H_y'] || fallbackX.H,
    B: crossDimensions.overallWidthY || crossDimensions['B_y'] || fallbackX.B,
  };

  const dimsX = resolveHDimensions(shapeX, steelSections, fallbackX);
  const dimsY = resolveHDimensions(shapeY, steelSections, { ...dimsX, ...fallbackY });

  const armDefs = [
    { arm: 'X', shapeName: shapeX, dimensions: dimsX, angle: 0 },
    { arm: 'Y', shapeName: shapeY, dimensions: dimsY, angle: Math.PI / 2 },
  ];

  const meshes = [];
  for (const armDef of armDefs) {
    const armSectionData = {
      section_type: 'H',
      dimensions: armDef.dimensions,
    };
    const armProfile = createSectionProfile(armSectionData, 'H', element.id, log);
    if (!armProfile || !armProfile.shape) {
      log.warn(`${element.id}: CROSS_H ${armDef.arm}アームのH断面生成に失敗`);
      continue;
    }

    const armGeometry = createExtrudeGeometry(armProfile.shape, placement.length);
    if (!armGeometry) {
      log.warn(`${element.id}: CROSS_H ${armDef.arm}アームのジオメトリ生成に失敗`);
      continue;
    }

    if (armDef.angle !== 0) {
      armGeometry.rotateZ(armDef.angle);
    }

    const materialOptions = { comparisonState: 'matched' };
    if (steelColor) {
      materialOptions.overrideColor = steelColor;
    }

    const armMesh = new THREE.Mesh(armGeometry, colorManager.getMaterial('diff', materialOptions));
    applyPlacementToMesh(armMesh, placement);

    armMesh.userData = buildMetadata({
      element: element,
      elementType: elementType,
      placement: placement,
      sectionType: 'H',
      profileResult: armProfile,
      sectionData: armSectionData,
      isJsonInput: isJsonInput,
    });
    armMesh.userData.srcComponentType = 'S';
    armMesh.userData.isCrossHSteel = true;
    armMesh.userData.crossHArm = armDef.arm;
    armMesh.userData.crossHShape = armDef.shapeName;

    meshes.push(armMesh);
  }

  return meshes.length > 0 ? meshes : null;
}

/**
 * 鋼材形状名から断面寸法を解決（steelSections優先、形状名解析でフォールバック）
 * @param {string} shapeName - 鋼材形状名
 * @param {Map} steelSections - 鋼材形状マップ
 * @returns {Object} 寸法オブジェクト
 */
function resolveSteelDimsByName(shapeName, steelSections) {
  const source = steelSections?.get(shapeName);
  const dims = source?.dimensions || source;
  if (dims && typeof dims === 'object' && Object.keys(dims).length > 0) {
    return dims;
  }
  return parseDimensionsFromShapeName(shapeName) || {};
}

/**
 * T形複合断面（shape_H + shape_T）をH形鋼1本＋T形鋼1本として生成
 *
 * STB仕様 StbSecColumn_SRC_*ShapeT（ver.2.0.2 図「T1/T2の例」）準拠。
 * - H形鋼: 図心基準で (offset_HX, offset_HY) に配置。T1/T3 はウェブ水平、T2/T4 はウェブ鉛直。
 * - T形鋼: H形鋼と「直交」する。ウェブの自由端を必ずH形鋼のウェブ線へ接合し、フランジは外側を向く
 *   （T1=下/T2=左/T3=上/T4=右）。offset_T は H形鋼ウェブ中心からT形鋼ウェブまでの距離
 *   （H形ウェブ方向に沿う）。
 *
 * @param {Object} params
 * @param {Object} params.element - 要素データ
 * @param {Object} params.placement - 配置情報
 * @param {Object} params.shapeTDimensions - shapeT_* を含む寸法データ
 * @param {Map} params.steelSections - 鋼材形状マップ
 * @param {string} params.elementType - 要素タイプ
 * @param {boolean} params.isJsonInput - JSON入力かどうか
 * @param {Object} params.log - ロガー
 * @param {Function} params.buildMetadata - メタデータ構築関数
 * @param {number|null} [params.steelColor] - 鋼材部分のカラー
 * @returns {Array<THREE.Mesh>|null}
 */
export function createShapeTSteelMeshes(params) {
  const {
    element,
    placement,
    shapeTDimensions,
    steelSections,
    elementType,
    isJsonInput,
    log,
    buildMetadata,
    steelColor = null,
  } = params;

  const dims = shapeTDimensions || {};
  const shapeH = dims.shapeT_shapeH;
  const shapeT = dims.shapeT_shapeT;
  if (!shapeH || !shapeT) return null;

  const direction = String(dims.shapeT_direction || 'T1').toUpperCase();
  const offsetHX = toFiniteNumber(dims.shapeT_offsetHX, 0);
  const offsetHY = toFiniteNumber(dims.shapeT_offsetHY, 0);
  const offsetT = toFiniteNumber(dims.shapeT_offsetT, 0);

  const meshes = [];
  const matOptions = () => {
    const o = { comparisonState: 'matched' };
    if (steelColor) o.overrideColor = steelColor;
    return o;
  };

  // 寸法解決（T形鋼のせい/2 = halfT を配置計算に使う）
  const hDims = resolveHDimensions(shapeH, steelSections);
  const tDims = resolveSteelDimsByName(shapeT, steelSections);
  const tDepth = toFiniteNumber(tDims.overall_depth ?? tDims.H ?? tDims.height ?? tDims.A, 350);
  const halfT = tDepth / 2;

  // direction_type ごとの向き・配置（STB仕様 ver.2.0.2 図「T1/T2の例」準拠）
  //   T形鋼はH形鋼と「直交」し、ウェブの自由端をH形鋼のウェブ線へ接合、フランジは外側を向く。
  //   offset_T = H形鋼ウェブ中心からT形鋼ウェブまでの距離（H形ウェブ方向に沿う）。
  //   hAngle : H形鋼のZ回り回転（T1/T3=ウェブ水平、T2/T4=ウェブ鉛直）
  //   tAngle : T形鋼のZ回り回転（基準プロファイルはフランジ下・ウェブ上）
  //   tCenter: T形鋼の幾何中心。ウェブ自由端（基準+Y側, 中心から halfT）をH形ウェブ線へ合わせる。
  const DIR = {
    // T1(⊤): H水平・T下（フランジ下, ステム上）, offset_TはX方向
    T1: { hAngle: Math.PI / 2, tAngle: 0, tCenter: { x: offsetHX + offsetT, y: offsetHY - halfT } },
    // T3(⊥): H水平・T上（フランジ上, ステム下）, offset_TはX方向
    T3: {
      hAngle: Math.PI / 2,
      tAngle: Math.PI,
      tCenter: { x: offsetHX + offsetT, y: offsetHY + halfT },
    },
    // T2(⊣): H鉛直・T左（フランジ左, ステム右）, offset_TはY方向
    T2: {
      hAngle: 0,
      tAngle: -Math.PI / 2,
      tCenter: { x: offsetHX - halfT, y: offsetHY + offsetT },
    },
    // T4(⊢): H鉛直・T右（フランジ右, ステム左）, offset_TはY方向
    T4: { hAngle: 0, tAngle: Math.PI / 2, tCenter: { x: offsetHX + halfT, y: offsetHY + offsetT } },
  };
  const cfg = DIR[direction] || DIR.T1;

  // --- H形鋼（図心を (offset_HX, offset_HY) に配置） ---
  const hSectionData = { section_type: 'H', dimensions: hDims };
  const hProfile = createSectionProfile(hSectionData, 'H', element.id, log);
  if (hProfile?.shape) {
    const hGeo = createExtrudeGeometry(hProfile.shape, placement.length);
    if (hGeo) {
      if (cfg.hAngle !== 0) hGeo.rotateZ(cfg.hAngle);
      hGeo.translate(offsetHX, offsetHY, 0);
      const hMesh = new THREE.Mesh(hGeo, colorManager.getMaterial('diff', matOptions()));
      applyPlacementToMesh(hMesh, placement);
      hMesh.userData = buildMetadata({
        element,
        elementType,
        placement,
        sectionType: 'H',
        profileResult: hProfile,
        sectionData: hSectionData,
        isJsonInput,
      });
      hMesh.userData.srcComponentType = 'S';
      hMesh.userData.isShapeTSteel = true;
      hMesh.userData.shapeTPart = 'H';
      hMesh.userData.shapeTShape = shapeH;
      meshes.push(hMesh);
    }
  } else {
    log.warn(`${element.id}: SHAPE_T H形鋼の断面生成に失敗 (${shapeH})`);
  }

  // --- T形鋼（H形鋼と直交、ウェブをH形ウェブ線へ接合） ---
  const tSectionData = { section_type: 'T', dimensions: tDims };
  const tProfile = createSectionProfile(tSectionData, 'T', element.id, log);
  if (tProfile?.shape) {
    const tGeo = createExtrudeGeometry(tProfile.shape, placement.length);
    if (tGeo) {
      if (cfg.tAngle !== 0) tGeo.rotateZ(cfg.tAngle);
      tGeo.translate(cfg.tCenter.x, cfg.tCenter.y, 0);
      const tMesh = new THREE.Mesh(tGeo, colorManager.getMaterial('diff', matOptions()));
      applyPlacementToMesh(tMesh, placement);
      tMesh.userData = buildMetadata({
        element,
        elementType,
        placement,
        sectionType: 'T',
        profileResult: tProfile,
        sectionData: tSectionData,
        isJsonInput,
      });
      tMesh.userData.srcComponentType = 'S';
      tMesh.userData.isShapeTSteel = true;
      tMesh.userData.shapeTPart = 'T';
      tMesh.userData.shapeTShape = shapeT;
      meshes.push(tMesh);
    }
  } else {
    log.warn(`${element.id}: SHAPE_T T形鋼の断面生成に失敗 (${shapeT})`);
  }

  return meshes.length > 0 ? meshes : null;
}

/**
 * 縦方向部材（柱・間柱）の共通メッシュ生成
 *
 * Column と Post の _createSingleMesh で重複していたロジックを統合。
 * 差異はオプションで吸収する:
 *   - options.supportMultiSection: true なら double/multi 断面モードをサポート
 *   - options.srcColors: SRC_COMPONENT_COLORS.Column 等の色設定（省略可）
 *   - options.createMultiSectionGeometry: multi-section用のジオメトリ生成関数
 *
 * @param {Object} element - 要素データ
 * @param {Object} context - コンテキスト（nodes, sections, steelSections, elementType, isJsonInput, log）
 * @param {Object} generator - ジェネレータークラス（BaseElementGenerator サブクラス）
 * @param {Object} [options={}] - オプション
 * @param {boolean} [options.supportMultiSection=false] - 多断面サポート
 * @param {Object|null} [options.srcColors=null] - SRC色設定 { steel, concrete }
 * @param {Function|null} [options.createMultiSectionGeometry=null] - 多断面ジオメトリ生成関数
 * @returns {THREE.Mesh|Array<THREE.Mesh>|null}
 */
export function createVerticalMemberMesh(element, context, generator, options = {}) {
  const { nodes, sections, steelSections, elementType, isJsonInput, log } = context;
  const {
    supportMultiSection = false,
    srcColors = null,
    createMultiSectionGeometry: multiSectionFn = null,
  } = options;

  const elementName = generator.getConfig().elementName;

  // 1. ノード位置の取得
  const nodePositions = ElementGeometryUtils.getNodePositions(element, nodes, {
    nodeType: '2node-vertical',
    isJsonInput: isJsonInput,
    node1KeyStart: 'id_node_bottom',
    node1KeyEnd: 'id_node_top',
  });

  if (!generator._validateNodePositions(nodePositions, element, context)) {
    return null;
  }

  // 2. 断面データの取得
  const sectionData = ElementGeometryUtils.getSectionData(element, sections, isJsonInput);

  if (!generator._validateSectionData(sectionData, element, context)) {
    return null;
  }

  // 3. 断面タイプの推定（SRC造対応）
  let sectionType = generator._resolveGeometryProfileType(sectionData);
  let steelSectionData = sectionData;
  let isCrossH = isCrossHSection(sectionData);
  let isShapeT = isShapeTSection(sectionData);

  if (sectionData.isSRC && sectionData.steelProfile?.section_type) {
    sectionType = generator._resolveGeometryProfileType(sectionData.steelProfile, {
      defaultType: sectionType,
    });
    steelSectionData = {
      section_type: sectionData.steelProfile.section_type,
      dimensions: sectionData.steelProfile.dimensions,
    };
    isCrossH =
      isCrossH || isCrossHSection(sectionData.steelProfile) || isCrossHSection(steelSectionData);
    isShapeT =
      isShapeT || isShapeTSection(sectionData.steelProfile) || isShapeTSection(steelSectionData);
    log.debug(
      `${elementName} ${element.id}: SRC造 S部分プロファイル: ${sectionType} (RC型から復元)`,
    );

    // CROSS_H断面の場合、shape名から実際のH鋼寸法を解決
    if (isCrossH) {
      const crossDims = resolveCrossHDimensions(steelSectionData.dimensions, steelSections);
      if (crossDims) {
        steelSectionData = { ...steelSectionData, dimensions: crossDims };
        log.debug(
          `${elementName} ${element.id}: CROSS_H寸法を解決 ` +
            `(X: ${crossDims.overallDepthX}x${crossDims.overallWidthX}, ` +
            `Y: ${crossDims.overallDepthY}x${crossDims.overallWidthY})`,
        );
      }
    }
  }

  log.debug(`Creating ${elementName.toLowerCase()} ${element.id}: section_type=${sectionType}`);

  // 4. プロファイル生成
  const profileResult = createSectionProfile(steelSectionData, sectionType, element.id, log);

  if (!generator._validateProfile(profileResult, element, context)) {
    return null;
  }

  // 5. 配置計算
  const bottomNodePlain = {
    x: nodePositions.bottomNode.x,
    y: nodePositions.bottomNode.y,
    z: nodePositions.bottomNode.z,
  };
  const topNodePlain = {
    x: nodePositions.topNode.x,
    y: nodePositions.topNode.y,
    z: nodePositions.topNode.z,
  };

  const bottomOffset = {
    x: Number(element.offset_bottom_X || 0),
    y: Number(element.offset_bottom_Y || 0),
    z: Number(element.offset_bottom_Z || 0),
  };
  const topOffset = {
    x: Number(element.offset_top_X || 0),
    y: Number(element.offset_top_Y || 0),
    z: Number(element.offset_top_Z || 0),
  };

  // 回転角度の取得（度単位）
  let rollAngleDegrees = 0;
  if (element.geometry && element.geometry.rotation !== undefined) {
    rollAngleDegrees = element.geometry.rotation;
  } else if (element.rotate !== undefined) {
    rollAngleDegrees = element.rotate;
  } else if (element.angle !== undefined) {
    rollAngleDegrees = element.angle;
  }

  rollAngleDegrees = generator._calculateRotation(sectionData, rollAngleDegrees);
  const rollAngle = (rollAngleDegrees * Math.PI) / 180;

  const placement = calculateColumnPlacement(bottomNodePlain, topNodePlain, {
    bottomOffset,
    topOffset,
    rollAngle,
  });

  if (!generator._validatePlacement(placement, element, context)) {
    return null;
  }

  log.debug(
    `${elementName} ${element.id}: length=${placement.length.toFixed(1)}mm` +
      (supportMultiSection ? `, mode=${sectionData.mode || 'single'}` : ''),
  );

  // T形複合断面（shape_H + shape_T）はH形鋼1本＋T形鋼1本として生成
  if (isShapeT) {
    const shapeTMeshes = createShapeTSteelMeshes({
      element,
      placement,
      shapeTDimensions: steelSectionData?.dimensions || {},
      steelSections,
      elementType,
      isJsonInput,
      log,
      buildMetadata: (args) => generator._buildColumnMetadata(args),
      steelColor: srcColors?.steel || null,
    });

    if (shapeTMeshes && shapeTMeshes.length > 0) {
      const extras = [];
      if (sectionData.isSRC && sectionData.concreteProfile) {
        const rcMesh = createSRCConcreteGeometry({
          sectionData,
          element,
          placement,
          elementType,
          isJsonInput,
          log,
          buildMetadata: (args) => generator._buildColumnMetadata(args),
          concreteColor: srcColors?.concrete || null,
        });
        if (rcMesh) {
          log.debug(`${elementName} ${element.id}: SRC造 T形複合 - RC部分のメッシュを追加生成`);
          extras.push(rcMesh);
        }
      }
      if (sectionData.basePlate) {
        const basePlateMesh = createBasePlateMesh(
          sectionData.basePlate,
          nodePositions.bottomNode,
          element,
          elementType,
          isJsonInput,
          rollAngle,
          log,
        );
        if (basePlateMesh) extras.push(basePlateMesh);
      }
      return [...shapeTMeshes, ...extras];
    }

    log.warn(
      `${elementName} ${element.id}: T形複合断面の生成に失敗したため単一断面にフォールバック`,
    );
  }

  // CROSS_H判定時は十字断面ではなく、90度回転したH鋼2本として生成
  if (isCrossH) {
    const crossHMeshes = createCrossHSteelMeshes({
      element,
      placement,
      crossDimensions: steelSectionData?.dimensions || {},
      steelSections,
      elementType,
      isJsonInput,
      log,
      buildMetadata: (args) => generator._buildColumnMetadata(args),
      steelColor: srcColors?.steel || null,
    });

    if (crossHMeshes && crossHMeshes.length > 0) {
      if (sectionData.isSRC && sectionData.concreteProfile) {
        const rcMesh = createSRCConcreteGeometry({
          sectionData,
          element,
          placement,
          elementType,
          isJsonInput,
          log,
          buildMetadata: (args) => generator._buildColumnMetadata(args),
          concreteColor: srcColors?.concrete || null,
        });
        if (rcMesh) {
          log.debug(`${elementName} ${element.id}: SRC造 - RC部分のメッシュを追加生成`);
          return [...crossHMeshes, rcMesh];
        }
      }

      if (sectionData.basePlate) {
        const basePlateMesh = createBasePlateMesh(
          sectionData.basePlate,
          nodePositions.bottomNode,
          element,
          elementType,
          isJsonInput,
          rollAngle,
          log,
        );
        if (basePlateMesh) {
          log.debug(
            `${elementName} ${element.id}: ベースプレートメッシュを追加生成 (${sectionData.basePlate.baseType})`,
          );
          return [...crossHMeshes, basePlateMesh];
        }
      }

      return crossHMeshes;
    }

    log.warn(
      `${elementName} ${element.id}: CROSS_Hの2本H鋼生成に失敗したため単一断面にフォールバック`,
    );
  }

  // 6. ジオメトリ作成
  let geometry = null;
  const mode = sectionData.mode || 'single';

  if (mode === 'single' || !supportMultiSection) {
    geometry = createExtrudeGeometry(profileResult.shape, placement.length);
  } else if (supportMultiSection && multiSectionFn && (mode === 'double' || mode === 'multi')) {
    geometry = multiSectionFn(sectionData, element, steelSections, placement.length);
  }

  if (!generator._validateGeometry(geometry, element, context)) {
    return null;
  }

  // 7. メッシュを作成
  const materialOptions = { comparisonState: 'matched' };
  if (sectionData.isSRC && srcColors?.steel) {
    materialOptions.overrideColor = srcColors.steel;
  }

  const mesh = new THREE.Mesh(geometry, colorManager.getMaterial('diff', materialOptions));

  // 8. 配置を適用
  applyPlacementToMesh(mesh, placement);

  // 9. メタデータを設定
  mesh.userData = generator._buildColumnMetadata({
    element,
    elementType,
    placement,
    sectionType,
    profileResult,
    sectionData,
    isJsonInput,
  });
  if (sectionData.isSRC) {
    mesh.userData.srcComponentType = 'S';
  }

  // 10. SRC造の場合、RC部分のメッシュも生成して配列で返す
  if (sectionData.isSRC && sectionData.concreteProfile) {
    const rcMesh = createSRCConcreteGeometry({
      sectionData,
      element,
      placement,
      elementType,
      isJsonInput,
      log,
      buildMetadata: (args) => generator._buildColumnMetadata(args),
      concreteColor: srcColors?.concrete || null,
    });
    if (rcMesh) {
      log.debug(`${elementName} ${element.id}: SRC造 - RC部分のメッシュを追加生成`);
      return [mesh, rcMesh];
    }
  }

  // 11. ベースプレートメッシュの生成
  if (sectionData.basePlate) {
    const basePlateMesh = createBasePlateMesh(
      sectionData.basePlate,
      nodePositions.bottomNode,
      element,
      elementType,
      isJsonInput,
      rollAngle,
      log,
    );
    if (basePlateMesh) {
      log.debug(
        `${elementName} ${element.id}: ベースプレートメッシュを追加生成 (${sectionData.basePlate.baseType})`,
      );
      return [mesh, basePlateMesh];
    }
  }

  return mesh;
}
