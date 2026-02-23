/**
 * @fileoverview IFCエクスポーターの基底クラス
 * 共通のIFCエンティティ（プロジェクト階層、座標系、単位系）と
 * プロファイル作成機能を提供
 */

import { StepWriter, generateIfcGuid } from './StepWriter.js';
import { resolveProfileType } from '../../constants/profileTypeAliases.js';
import { downloadBlob } from '../../utils/downloadHelper.js';

/**
 * IFCエクスポーターの基底クラス
 * 梁、柱、床、壁など各要素タイプのエクスポーターはこのクラスを継承する
 */
export class IFCExporterBase {
  constructor() {
    this.writer = new StepWriter();
    this._refs = {};
    this._initialized = false;
    // 階データ（STBから取得した階情報）
    this._storiesData = [];
    // 階IDとIFCエンティティIDのマップ
    this._storeyMap = new Map();
    // 各階の要素リスト
    this._storeyElements = new Map();
  }

  /**
   * STB階データを設定
   * @param {Array<{id: string, name: string, height: number}>} stories - 階情報配列（heightはmm）
   */
  setStories(stories) {
    if (stories && Array.isArray(stories) && stories.length > 0) {
      // 高さでソート
      this._storiesData = [...stories].sort((a, b) => a.height - b.height);
    }
  }

  /**
   * 共通エンティティが作成されていることを保証
   * @protected
   */
  _ensureInitialized() {
    if (!this._initialized) {
      this._createCommonEntities();
      this._initialized = true;
    }
  }

  /**
   * 共通のIFCエンティティ（プロジェクト階層、座標系など）を作成
   * @protected
   */
  _createCommonEntities() {
    const w = this.writer;

    // ===== 基本ジオメトリ =====
    // 原点
    this._refs.origin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, 0.0]]);

    // 方向ベクトル
    this._refs.dirZ = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);
    this._refs.dirX = w.createEntity('IFCDIRECTION', [[1.0, 0.0, 0.0]]);
    this._refs.dirY = w.createEntity('IFCDIRECTION', [[0.0, 1.0, 0.0]]);
    this._refs.dir2dX = w.createEntity('IFCDIRECTION', [[1.0, 0.0]]);
    this._refs.dir2dY = w.createEntity('IFCDIRECTION', [[0.0, 1.0]]);

    // 2D原点
    this._refs.origin2d = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0]]);

    // ワールド座標系
    this._refs.worldCoordSystem = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${this._refs.origin}`,
      `#${this._refs.dirZ}`,
      `#${this._refs.dirX}`,
    ]);

    // 2D座標系（プロファイル用）
    this._refs.profilePlacement = w.createEntity('IFCAXIS2PLACEMENT2D', [
      `#${this._refs.origin2d}`,
      `#${this._refs.dir2dX}`,
    ]);

    // ===== 単位系 =====
    // 長さ: ミリメートル (STBデータと同じ)
    this._refs.unitLength = w.createEntity('IFCSIUNIT', [
      '*',
      '.LENGTHUNIT.',
      '.MILLI.',
      '.METRE.',
    ]);
    // 面積: 平方メートル
    this._refs.unitArea = w.createEntity('IFCSIUNIT', ['*', '.AREAUNIT.', null, '.SQUARE_METRE.']);
    // 体積: 立方メートル
    this._refs.unitVolume = w.createEntity('IFCSIUNIT', [
      '*',
      '.VOLUMEUNIT.',
      null,
      '.CUBIC_METRE.',
    ]);
    // 角度: ラジアン
    this._refs.unitAngle = w.createEntity('IFCSIUNIT', ['*', '.PLANEANGLEUNIT.', null, '.RADIAN.']);

    // 単位割当
    this._refs.unitAssignment = w.createEntity('IFCUNITASSIGNMENT', [
      [
        `#${this._refs.unitLength}`,
        `#${this._refs.unitArea}`,
        `#${this._refs.unitVolume}`,
        `#${this._refs.unitAngle}`,
      ],
    ]);

    // ===== コンテキスト =====
    // 幾何表現コンテキスト
    this._refs.geometricContext = w.createEntity('IFCGEOMETRICREPRESENTATIONCONTEXT', [
      null, // ContextIdentifier
      'Model', // ContextType
      3, // CoordinateSpaceDimension
      1.0e-5, // Precision
      `#${this._refs.worldCoordSystem}`, // WorldCoordinateSystem
      null, // TrueNorth
    ]);

    // サブコンテキスト（Body用）
    this._refs.bodyContext = w.createEntity('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', [
      'Body', // ContextIdentifier
      'Model', // ContextType
      '*', // CoordinateSpaceDimension (inherited)
      '*', // Precision (inherited)
      '*', // WorldCoordinateSystem (inherited)
      '*', // TrueNorth (inherited)
      `#${this._refs.geometricContext}`, // ParentContext
      null, // TargetScale
      '.MODEL_VIEW.', // TargetView
      null, // UserDefinedTargetView
    ]);

    // ===== プロジェクト =====
    this._refs.project = w.createEntity('IFCPROJECT', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      'STB Export Project', // Name
      'Exported from StbDiffViewer', // Description
      null, // ObjectType
      null, // LongName
      null, // Phase
      [`#${this._refs.geometricContext}`], // RepresentationContexts
      `#${this._refs.unitAssignment}`, // UnitsInContext
    ]);

    // ===== サイト =====
    this._refs.sitePlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null, // PlacementRelTo
      `#${this._refs.worldCoordSystem}`, // RelativePlacement
    ]);

    this._refs.site = w.createEntity('IFCSITE', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      'Default Site', // Name
      null, // Description
      null, // ObjectType
      `#${this._refs.sitePlacement}`, // ObjectPlacement
      null, // Representation
      null, // LongName
      '.ELEMENT.', // CompositionType
      null, // RefLatitude
      null, // RefLongitude
      null, // RefElevation
      null, // LandTitleNumber
      null, // SiteAddress
    ]);

    // プロジェクト → サイト 関係
    this._refs.relProjectSite = w.createEntity('IFCRELAGGREGATES', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      null, // Name
      null, // Description
      `#${this._refs.project}`, // RelatingObject
      [`#${this._refs.site}`], // RelatedObjects
    ]);

    // ===== 建物 =====
    this._refs.buildingPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      `#${this._refs.sitePlacement}`, // PlacementRelTo
      `#${this._refs.worldCoordSystem}`, // RelativePlacement
    ]);

    this._refs.building = w.createEntity('IFCBUILDING', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      'Default Building', // Name
      null, // Description
      null, // ObjectType
      `#${this._refs.buildingPlacement}`, // ObjectPlacement
      null, // Representation
      null, // LongName
      '.ELEMENT.', // CompositionType
      null, // ElevationOfRefHeight
      null, // ElevationOfTerrain
      null, // BuildingAddress
    ]);

    // サイト → 建物 関係
    this._refs.relSiteBuilding = w.createEntity('IFCRELAGGREGATES', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      null, // Name
      null, // Description
      `#${this._refs.site}`, // RelatingObject
      [`#${this._refs.building}`], // RelatedObjects
    ]);

    // ===== 階 =====
    this._createStoreys(w);
  }

  /**
   * 階（IFCBUILDINGSTOREY）を作成
   * @param {StepWriter} w - StepWriterインスタンス
   * @protected
   */
  _createStoreys(w) {
    const storeyIds = [];

    // 階データがある場合は複数階を作成
    if (this._storiesData.length > 0) {
      for (const story of this._storiesData) {
        const storeyId = this._createSingleStorey(w, story.name, story.height);
        this._storeyMap.set(story.id, storeyId);
        this._storeyElements.set(storeyId, []);
        storeyIds.push(`#${storeyId}`);
      }
      // デフォルトの階（最初の階）を設定
      this._refs.storey = this._storeyMap.get(this._storiesData[0].id);
    } else {
      // フォールバック: 階データがない場合は単一の1Fを作成
      const storeyId = this._createSingleStorey(w, '1F', 0.0);
      this._storeyMap.set('default', storeyId);
      this._storeyElements.set(storeyId, []);
      storeyIds.push(`#${storeyId}`);
      this._refs.storey = storeyId;
    }

    // 建物 → 階 関係
    this._refs.relBuildingStorey = w.createEntity('IFCRELAGGREGATES', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      null, // Name
      null, // Description
      `#${this._refs.building}`, // RelatingObject
      storeyIds, // RelatedObjects
    ]);
  }

  /**
   * 単一の階を作成
   * @param {StepWriter} w - StepWriterインスタンス
   * @param {string} name - 階名
   * @param {number} elevation - 階高さ（mm）
   * @returns {number} 階エンティティID
   * @protected
   */
  _createSingleStorey(w, name, elevation) {
    // 階の配置（高さを反映）
    const storeyOrigin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, elevation]]);
    const storeyAxis2Placement = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${storeyOrigin}`,
      `#${this._refs.dirZ}`,
      `#${this._refs.dirX}`,
    ]);
    const storeyPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      `#${this._refs.buildingPlacement}`, // PlacementRelTo
      `#${storeyAxis2Placement}`, // RelativePlacement
    ]);

    // 最初の階の配置をデフォルトとして保持
    if (!this._refs.storeyPlacement) {
      this._refs.storeyPlacement = storeyPlacement;
    }

    const storeyId = w.createEntity('IFCBUILDINGSTOREY', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      name, // Name
      null, // Description
      null, // ObjectType
      `#${storeyPlacement}`, // ObjectPlacement
      null, // Representation
      null, // LongName
      '.ELEMENT.', // CompositionType
      elevation, // Elevation
    ]);

    return storeyId;
  }

  // ===== プロファイル作成メソッド =====

  /**
   * H形鋼プロファイルを作成
   * @param {Object} params - プロファイルパラメータ
   * @param {number} params.overallDepth - 全高 (mm)
   * @param {number} params.overallWidth - 全幅 (mm)
   * @param {number} params.webThickness - ウェブ厚 (mm)
   * @param {number} params.flangeThickness - フランジ厚 (mm)
   * @param {number} [params.filletRadius=0] - フィレット半径 (mm)
   * @returns {number} プロファイルエンティティID
   */
  createIShapeProfile(params, { simple = false } = {}) {
    this._ensureInitialized();
    const w = this.writer;
    const {
      overallDepth = 400,
      overallWidth = 200,
      webThickness = 8,
      flangeThickness = 13,
      filletRadius = 0,
    } = params;

    return w.createEntity('IFCISHAPEPROFILEDEF', [
      '.AREA.', // ProfileType
      'H-Shape', // ProfileName
      simple ? null : `#${this._refs.profilePlacement}`, // Position
      overallWidth, // OverallWidth (mm)
      overallDepth, // OverallDepth (mm)
      webThickness, // WebThickness (mm)
      flangeThickness, // FlangeThickness (mm)
      filletRadius > 0 ? filletRadius : null, // FilletRadius (mm)
      null, // FlangeEdgeRadius (optional)
      null, // FlangeSlope (optional)
    ]);
  }

  /**
   * 矩形プロファイルを作成
   * @param {Object} params - プロファイルパラメータ
   * @param {number} params.width - 幅 (mm)
   * @param {number} params.height - 高さ (mm)
   * @returns {number} プロファイルエンティティID
   */
  createRectangleProfile(params, { simple = false } = {}) {
    this._ensureInitialized();
    const w = this.writer;
    const { width = 400, height = 600 } = params;

    return w.createEntity('IFCRECTANGLEPROFILEDEF', [
      '.AREA.', // ProfileType
      'Rectangle', // ProfileName
      simple ? null : `#${this._refs.profilePlacement}`, // Position
      width, // XDim (mm)
      height, // YDim (mm)
    ]);
  }

  /**
   * 角形鋼管（BOX）プロファイルを作成
   * @param {Object} params - プロファイルパラメータ
   * @param {number} params.width - 幅 (mm)
   * @param {number} params.height - 高さ (mm)
   * @param {number} params.wallThickness - 板厚 (mm)
   * @returns {number} プロファイルエンティティID
   */
  createHollowRectangleProfile(params, { simple = false } = {}) {
    this._ensureInitialized();
    const w = this.writer;
    const {
      width = 200,
      height = 200,
      wallThickness = 9,
      innerFilletRadius = null,
      outerFilletRadius = null,
    } = params;

    return w.createEntity('IFCRECTANGLEHOLLOWPROFILEDEF', [
      '.AREA.', // ProfileType
      'Box', // ProfileName
      simple ? null : `#${this._refs.profilePlacement}`, // Position
      width, // XDim (mm)
      height, // YDim (mm)
      wallThickness, // WallThickness (mm)
      innerFilletRadius, // InnerFilletRadius
      outerFilletRadius, // OuterFilletRadius
    ]);
  }

  /**
   * 円形鋼管（PIPE）プロファイルを作成
   * @param {Object} params - プロファイルパラメータ
   * @param {number} params.diameter - 外径 (mm)
   * @param {number} params.wallThickness - 板厚 (mm)
   * @returns {number} プロファイルエンティティID
   */
  createCircularHollowProfile(params, { simple = false } = {}) {
    this._ensureInitialized();
    const w = this.writer;
    const { diameter = 200, wallThickness = 6 } = params;

    return w.createEntity('IFCCIRCLEHOLLOWPROFILEDEF', [
      '.AREA.', // ProfileType
      'Pipe', // ProfileName
      simple ? null : `#${this._refs.profilePlacement}`, // Position
      diameter / 2, // Radius (mm)
      wallThickness, // WallThickness (mm)
    ]);
  }

  /**
   * 中実円（丸鋼）プロファイルを作成
   * @param {Object} params - プロファイルパラメータ
   * @param {number} params.diameter - 直径 (mm)
   * @returns {number} プロファイルエンティティID
   */
  createCircleProfile(params, { simple = false } = {}) {
    this._ensureInitialized();
    const w = this.writer;
    const { diameter = 60 } = params;

    return w.createEntity('IFCCIRCLEPROFILEDEF', [
      '.AREA.', // ProfileType
      'Circle', // ProfileName
      simple ? null : `#${this._refs.profilePlacement}`, // Position
      diameter / 2, // Radius (mm)
    ]);
  }

  /**
   * L形鋼プロファイルを作成
   * @param {Object} params - プロファイルパラメータ
   * @param {number} params.depth - 長辺 (mm)
   * @param {number} params.width - 短辺 (mm)
   * @param {number} params.thickness - 板厚 (mm)
   * @param {number} [params.filletRadius=0] - フィレット半径 (mm)
   * @returns {number} プロファイルエンティティID
   */
  createLShapeProfile(params, { simple = false } = {}) {
    this._ensureInitialized();
    const w = this.writer;
    const { depth = 75, width = 75, thickness = 6, filletRadius = 0 } = params;

    return w.createEntity('IFCLSHAPEPROFILEDEF', [
      '.AREA.', // ProfileType
      'L-Shape', // ProfileName
      simple ? null : `#${this._refs.profilePlacement}`, // Position
      depth, // Depth (mm)
      width, // Width (mm)
      thickness, // Thickness (mm)
      filletRadius > 0 ? filletRadius : null, // FilletRadius (mm)
      null, // EdgeRadius
      null, // LegSlope (傾斜角度)
    ]);
  }

  /**
   * U形鋼（C形鋼・チャンネル）プロファイル作成
   * @param {Object} params - プロファイルパラメータ
   * @param {number} [params.depth=200] - 高さ（ウェブ長さ）(mm)
   * @param {number} [params.flangeWidth=80] - フランジ幅 (mm)
   * @param {number} [params.webThickness=7.5] - ウェブ厚 (mm)
   * @param {number} [params.flangeThickness=11] - フランジ厚 (mm)
   * @param {number} [params.filletRadius=0] - フィレット半径 (mm)
   * @returns {number} プロファイルエンティティID
   */
  createUShapeProfile(params, { simple = false } = {}) {
    this._ensureInitialized();
    const w = this.writer;
    const {
      depth = 200,
      flangeWidth = 80,
      webThickness = 7.5,
      flangeThickness = 11,
      filletRadius = 0,
    } = params;

    return w.createEntity('IFCUSHAPEPROFILEDEF', [
      '.AREA.', // ProfileType
      'U-Shape', // ProfileName
      simple ? null : `#${this._refs.profilePlacement}`, // Position
      depth, // Depth (mm)
      flangeWidth, // FlangeWidth (mm)
      webThickness, // WebThickness (mm)
      flangeThickness, // FlangeThickness (mm)
      filletRadius > 0 ? filletRadius : null, // FilletRadius (mm)
      null, // EdgeRadius
      null, // FlangeSlope
    ]);
  }

  /**
   * T形鋼プロファイルを作成
   * @param {Object} params - プロファイルパラメータ
   * @param {number} [params.depth=200] - ウェブ高さ (mm)
   * @param {number} [params.flangeWidth=150] - フランジ幅 (mm)
   * @param {number} [params.webThickness=8] - ウェブ厚 (mm)
   * @param {number} [params.flangeThickness=12] - フランジ厚 (mm)
   * @param {number} [params.filletRadius=0] - フィレット半径 (mm)
   * @returns {number} プロファイルエンティティID
   */
  createTShapeProfile(params, { simple = false } = {}) {
    this._ensureInitialized();
    const w = this.writer;
    const {
      depth = 200,
      flangeWidth = 150,
      webThickness = 8,
      flangeThickness = 12,
      filletRadius = 0,
    } = params;

    return w.createEntity('IFCTSHAPEPROFILEDEF', [
      '.AREA.', // ProfileType
      'T-Shape', // ProfileName
      simple ? null : `#${this._refs.profilePlacement}`, // Position
      depth, // Depth (ウェブ高さ) (mm)
      flangeWidth, // FlangeWidth (mm)
      webThickness, // WebThickness (mm)
      flangeThickness, // FlangeThickness (mm)
      filletRadius > 0 ? filletRadius : null, // FilletRadius (mm)
      null, // FlangeEdgeRadius
      null, // WebEdgeRadius
      null, // WebSlope
    ]);
  }

  /**
   * プロファイルIDを作成（共通ヘルパー）
   * @protected
   * @param {Object} profile - プロファイル情報 {type, params}
   * @param {boolean} [useSimple=false] - Position = null のシンプル版を使用するか
   * @returns {number|null} プロファイルエンティティID（未対応の場合はnull）
   */
  _createProfileId(profile, useSimple = false) {
    const canonical = resolveProfileType(profile.type);
    const p = profile.params || {};
    const opts = { simple: useSimple };

    switch (canonical) {
      case 'H':
        return this.createIShapeProfile(p, opts);

      case 'BOX':
        return this.createHollowRectangleProfile(p, opts);

      case 'PIPE':
        return this.createCircularHollowProfile(p, opts);

      case 'L':
        return this.createLShapeProfile(p, opts);

      case 'C':
        return this.createUShapeProfile(p, opts);

      case 'FB': {
        const fbParams = {
          width: p.width || p.A || 100,
          height: p.thickness || p.t || 9,
        };
        return this.createRectangleProfile(fbParams, opts);
      }

      case 'CIRCLE': {
        const circleParams = { diameter: p.diameter || p.D || 60 };
        return this.createCircleProfile(circleParams, opts);
      }

      case 'T': {
        const tParams = {
          depth: p.depth || p.overallDepth || p.H || p.A || 200,
          flangeWidth: p.flangeWidth || p.B || 150,
          webThickness: p.webThickness || p.t1 || p.tw || 8,
          flangeThickness: p.flangeThickness || p.t2 || p.tf || 12,
          filletRadius: p.filletRadius || p.r || 0,
        };
        return this.createTShapeProfile(tParams, opts);
      }

      case 'SRC': {
        const srcParams = {
          width: p.width || p.width_X || p.B || 800,
          height: p.height || p.width_Y || p.A || 800,
        };
        return this.createRectangleProfile(srcParams, opts);
      }

      case 'CFT': {
        // CFT（充填鋼管）はコンクリートで充填されているため、
        // IFC上では中実断面（矩形）として表現する
        // 鋼管の板厚情報はプロパティセットで補完可能
        const cftParams = {
          width: p.width || p.outer_width || p.B || 200,
          height: p.height || p.outer_height || p.A || 200,
        };
        return this.createRectangleProfile(cftParams, opts);
      }

      case 'RECTANGLE':
        return this.createRectangleProfile(p, opts);

      default:
        return null;
    }
  }

  /**
   * 押出形状を作成
   * @param {number} profileId - プロファイルエンティティID
   * @param {number} length - 押出長さ (mm)
   * @param {Object} [direction] - 押出方向
   * @returns {number} ExtrudedAreaSolidエンティティID
   */
  createExtrudedSolid(profileId, length, direction = null) {
    const w = this.writer;

    // 押出方向（デフォルトはX方向 = 梁の長手方向）
    const dirRef = direction || this._refs.dirX;

    return w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`, // SweptArea
      `#${this._refs.worldCoordSystem}`, // Position
      `#${dirRef}`, // ExtrudedDirection
      length, // Depth (mm)
    ]);
  }

  /**
   * 要素を階に追加（containedElementsに登録）
   * @protected
   * @param {number} elementId - 要素エンティティID
   * @param {number} [zCoordinate] - 要素のZ座標（mm）。指定された場合、適切な階に割り当てる
   */
  _addToStorey(elementId, zCoordinate = null) {
    // Z座標が指定され、階データがある場合は適切な階を検索
    if (zCoordinate !== null && this._storiesData.length > 0) {
      const storeyId = this._findStoreyForElevation(zCoordinate);
      if (storeyId) {
        if (!this._storeyElements.has(storeyId)) {
          this._storeyElements.set(storeyId, []);
        }
        this._storeyElements.get(storeyId).push(`#${elementId}`);
        return;
      }
    }

    // フォールバック: デフォルトの階に追加
    if (!this._refs.containedElements) {
      this._refs.containedElements = [];
    }
    this._refs.containedElements.push(`#${elementId}`);
  }

  /**
   * Z座標に対応する階を検索
   * @param {number} zCoordinate - Z座標（mm）
   * @returns {number|null} 階エンティティID
   * @protected
   */
  _findStoreyForElevation(zCoordinate) {
    if (this._storiesData.length === 0) {
      return null;
    }

    // 要素のZ座標が属する階を検索
    // 要素は、その階の高さ以上で次の階の高さ未満にある場合にその階に属する
    for (let i = this._storiesData.length - 1; i >= 0; i--) {
      const story = this._storiesData[i];
      if (zCoordinate >= story.height) {
        return this._storeyMap.get(story.id);
      }
    }

    // 最も低い階より下の場合は最初の階に割り当て
    return this._storeyMap.get(this._storiesData[0].id);
  }

  /**
   * 階と要素の包含関係を作成
   * @protected
   */
  _createContainmentRelation() {
    // 各階の包含関係を作成
    for (const [storeyId, elements] of this._storeyElements) {
      if (elements && elements.length > 0) {
        this.writer.createEntity('IFCRELCONTAINEDINSPATIALSTRUCTURE', [
          generateIfcGuid(), // GlobalId
          null, // OwnerHistory
          null, // Name
          null, // Description
          elements, // RelatedElements
          `#${storeyId}`, // RelatingStructure
        ]);
      }
    }

    // デフォルトの要素リスト（互換性のため）
    if (this._refs.containedElements && this._refs.containedElements.length > 0) {
      this.writer.createEntity('IFCRELCONTAINEDINSPATIALSTRUCTURE', [
        generateIfcGuid(), // GlobalId
        null, // OwnerHistory
        null, // Name
        null, // Description
        this._refs.containedElements, // RelatedElements
        `#${this._refs.storey}`, // RelatingStructure
      ]);
    }
  }

  /**
   * IFCファイルを生成
   * @param {Object} options - オプション
   * @param {string} [options.fileName='export.ifc'] - ファイル名
   * @returns {string} IFCファイル内容
   */
  generate(options = {}) {
    this._ensureInitialized();
    this._createContainmentRelation();

    return this.writer.generate({
      fileName: options.fileName || 'export.ifc',
      description: options.description || 'IFC Export',
      ...options,
    });
  }

  /**
   * Blobを生成（ダウンロード用）
   * @param {Object} options - オプション
   * @returns {Blob} IFCファイルのBlob
   */
  generateBlob(options = {}) {
    const content = this.generate(options);
    return new Blob([content], { type: 'application/x-step' });
  }

  /**
   * ファイルをダウンロード
   * @param {Object} options - オプション
   * @param {string} [options.fileName='export.ifc'] - ファイル名
   */
  download(options = {}) {
    const fileName = options.fileName || 'export.ifc';
    const blob = this.generateBlob(options);
    downloadBlob(blob, fileName);
  }

  /**
   * 壁を追加（共通実装）
   * IFCSTBExporter と IFCWallExporter の共通ロジック
   * @param {Object} wallData - 壁データ
   * @param {string} wallData.name - 壁名
   * @param {Object} wallData.startPoint - 始点 {x, y, z} (mm)
   * @param {Object} wallData.endPoint - 終点 {x, y, z} (mm)
   * @param {number} wallData.height - 高さ (mm)
   * @param {number} wallData.thickness - 厚さ (mm)
   * @param {string} [wallData.predefinedType='STANDARD'] - 壁タイプ
   * @param {Array<Object>} [wallData.openings] - 開口情報配列
   * @returns {number|null} 壁エンティティID
   */
  addWall(wallData) {
    this._ensureInitialized();
    const w = this.writer;
    const {
      name = 'Wall',
      startPoint,
      endPoint,
      height = 3000,
      thickness = 200,
      predefinedType = 'STANDARD',
      openings = [],
    } = wallData;

    if (!startPoint || !endPoint) {
      console.warn(`[IFC Export] 壁 "${name}" をスキップ: 始点・終点が不足`);
      return null;
    }

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);

    if (wallLength < 1 || height <= 0 || thickness <= 0) {
      console.warn(`[IFC Export] 壁 "${name}" をスキップ: 寸法が不正`);
      return null;
    }

    // 壁の方向ベクトル（正規化）
    const dirX = dx / wallLength;
    const dirY = dy / wallLength;

    // 矩形プロファイル（長さ x 厚さ）
    const profileId = w.createEntity('IFCRECTANGLEPROFILEDEF', [
      '.AREA.',
      'WallProfile',
      null,
      wallLength,
      thickness,
    ]);

    // 押出方向: Z軸（上向き）
    const extrudeDirId = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 押出形状
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      null,
      `#${extrudeDirId}`,
      height,
    ]);

    // 壁の中心点を計算（始点と終点の中間）
    const centerX = (startPoint.x + endPoint.x) / 2;
    const centerY = (startPoint.y + endPoint.y) / 2;

    const wallOrigin = w.createEntity('IFCCARTESIANPOINT', [[centerX, centerY, startPoint.z]]);
    const wallRefDir = w.createEntity('IFCDIRECTION', [[dirX, dirY, 0.0]]);

    const wallPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${wallOrigin}`,
      null,
      `#${wallRefDir}`,
    ]);

    const wallLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [null, `#${wallPlacement3D}`]);

    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`],
    ]);

    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`],
    ]);

    const wallId = w.createEntity('IFCWALL', [
      generateIfcGuid(),
      null,
      name,
      null,
      null,
      `#${wallLocalPlacement}`,
      `#${productShape}`,
      null,
      `.${predefinedType}.`,
    ]);

    this._addToStorey(wallId, startPoint.z);

    // 開口を追加
    if (openings && openings.length > 0) {
      this._addOpeningsToWall(wallId, openings, {
        wallLength,
        thickness,
        wallLocalPlacement,
      });
    }

    return wallId;
  }

  /**
   * 壁に開口を追加（共通実装）
   * @param {number} wallId - 壁エンティティID
   * @param {Array<Object>} openings - 開口情報配列
   * @param {Object} wallContext - 壁のコンテキスト情報
   */
  _addOpeningsToWall(wallId, openings, wallContext) {
    const w = this.writer;
    const { wallLength, thickness, wallLocalPlacement } = wallContext;

    for (const opening of openings) {
      const openingWidth = opening.width;
      const openingHeight = opening.height;

      if (!openingWidth || openingWidth <= 0 || !openingHeight || openingHeight <= 0) {
        console.warn(`[IFC Export] 開口 "${opening.id}" をスキップ: サイズが不正です`);
        continue;
      }

      const openingName = opening.name || `Opening_${opening.id}`;

      // 開口の矩形プロファイル
      const openingProfileId = w.createEntity('IFCRECTANGLEPROFILEDEF', [
        '.AREA.',
        'OpeningProfile',
        null,
        openingWidth,
        thickness + 100,
      ]);

      const extrudeDirId = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

      const openingSolidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
        `#${openingProfileId}`,
        null,
        `#${extrudeDirId}`,
        openingHeight,
      ]);

      // 開口の位置計算（壁ローカル座標系での位置）
      const openingCenterX = opening.positionX + openingWidth / 2 - wallLength / 2;
      const openingCenterZ = opening.positionY;

      const openingOrigin = w.createEntity('IFCCARTESIANPOINT', [
        [openingCenterX, 0, openingCenterZ],
      ]);

      const openingPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
        `#${openingOrigin}`,
        null,
        null,
      ]);

      const openingLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
        `#${wallLocalPlacement}`,
        `#${openingPlacement3D}`,
      ]);

      const openingShapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
        `#${this._refs.bodyContext}`,
        'Body',
        'SweptSolid',
        [`#${openingSolidId}`],
      ]);

      const openingProductShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
        null,
        null,
        [`#${openingShapeRep}`],
      ]);

      const openingId = w.createEntity('IFCOPENINGELEMENT', [
        generateIfcGuid(),
        null,
        openingName,
        null,
        null,
        `#${openingLocalPlacement}`,
        `#${openingProductShape}`,
        null,
        '.OPENING.',
      ]);

      w.createEntity('IFCRELVOIDSELEMENT', [
        generateIfcGuid(),
        null,
        null,
        null,
        `#${wallId}`,
        `#${openingId}`,
      ]);
    }
  }
}

// Re-export generateIfcGuid for convenience
export { generateIfcGuid } from './StepWriter.js';
