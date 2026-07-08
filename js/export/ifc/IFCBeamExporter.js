/**
 * @fileoverview 線形要素（梁・柱・ブレース）のIFCエクスポーター
 * IFCExporterBaseを継承し、梁・柱・ブレースの出力機能を提供
 */

import { IFCExporterBase, generateIfcGuid } from './IFCExporterBase.js';
import { createLogger } from '../../utils/logger.js';
import { calculateBeamBasis, rotateVectorAroundAxis } from '../../data/geometry/vectorMath.js';
import { STB_TAG_NAMES } from '../../constants/elementTypes.js';

const log = createLogger('IFCBeamExporter');

/**
 * 線形要素をIFCファイルとしてエクスポートするクラス
 * 梁（Beam）、柱（Column）、ブレース（Brace）に対応
 */
export class IFCBeamExporter extends IFCExporterBase {
  constructor() {
    super();
  }

  /**
   * 梁を追加
   * @param {Object} beamData - 梁データ
   * @param {string} beamData.name - 梁名
   * @param {Object} beamData.startPoint - 始点座標 {x, y, z} (mm)
   * @param {Object} beamData.endPoint - 終点座標 {x, y, z} (mm)
   * @param {Object} beamData.profile - プロファイル情報
   * @param {string} beamData.profile.type - プロファイルタイプ ('H', 'BOX', 'PIPE', 'RECTANGLE')
   * @param {Object} beamData.profile.params - プロファイルパラメータ
   * @param {number} [beamData.rotation=0] - 断面の回転角度（度）、軸周りの回転
   * @param {string} [beamData.placementMode='center'] - 配置モード ('center' | 'top-aligned')
   * @param {number} [beamData.sectionHeight=0] - 断面高さ（mm）天端基準配置用
   * @returns {number|null} 梁エンティティID（未対応の場合はnull）
   * @throws {TypeError} If beamData is not a valid object
   */
  addBeam(beamData) {
    this._ensureInitialized();
    const w = this.writer;

    // 共通バリデーション
    const validation = this._validateLinearElementData(beamData, '梁', {
      point1: 'startPoint',
      point2: 'endPoint',
    });

    if (!validation.isValid) {
      log.error(`[IFC Export] 梁をスキップ: ${validation.error}`);
      return null;
    }

    const {
      name = 'Beam',
      placementMode = 'center',
      sectionHeight = 0,
      isSRC = false,
      steelProfile = null,
      kindStructure = 'S',
      stbType = STB_TAG_NAMES.GIRDER,
    } = beamData;

    // Validate name
    if (typeof name !== 'string') {
      log.warn(`[IFC Export] beamData.name must be a string, using default "Beam"`);
    }

    // Validate placementMode
    if (placementMode !== 'center' && placementMode !== 'top-aligned') {
      log.warn(
        `[IFC Export] 梁 "${name}": invalid placementMode "${placementMode}", using "center"`,
      );
    }

    // Validate sectionHeight
    if (typeof sectionHeight !== 'number' || !isFinite(sectionHeight) || sectionHeight < 0) {
      log.warn(
        `[IFC Export] 梁 "${name}": sectionHeight must be a non-negative finite number, using 0`,
      );
    }

    const { point1: startPoint, point2: endPoint, profile, length, rotation } = validation;

    // 梁の方向ベクトル
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const dirX = dx / length;
    const dirY = dy / length;
    const dirZ = dz / length;

    // プロファイルを作成
    const profileId = this._createProfileId(profile, false);
    if (profileId === null) {
      log.warn(
        `[IFC Export] 梁 "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`,
      );
      return null;
    }

    // 梁のローカル基底ベクトルを計算（vectorMath共通関数を使用）
    const dir = { x: dirX, y: dirY, z: dirZ };
    const basis = calculateBeamBasis(dir);

    // 天端基準配置の場合、配置点をローカルY軸方向に -sectionHeight/2 シフト
    let adjustedStartX = startPoint.x;
    let adjustedStartY = startPoint.y;
    let adjustedStartZ = startPoint.z;

    if (placementMode === 'top-aligned' && sectionHeight > 0 && isFinite(sectionHeight)) {
      const shift = -sectionHeight / 2;
      adjustedStartX += basis.yAxis.x * shift;
      adjustedStartY += basis.yAxis.y * shift;
      adjustedStartZ += basis.yAxis.z * shift;
    }

    // 梁の配置点（天端基準調整後）(mm)
    const beamOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [adjustedStartX, adjustedStartY, adjustedStartZ],
    ]);

    // 梁の軸方向
    const beamAxisDir = w.createEntity('IFCDIRECTION', [[dirX, dirY, dirZ]]);

    // 梁の参照方向（RefDirection）- 回転角度を適用
    let refDir = basis.xAxis;
    if (Math.abs(rotation) > 1e-6) {
      const rotationRad = (rotation * Math.PI) / 180;
      refDir = rotateVectorAroundAxis(basis.xAxis, dir, rotationRad);
    }
    const beamRefDir = w.createEntity('IFCDIRECTION', [[refDir.x, refDir.y, refDir.z]]);

    // 梁の配置座標系
    const beamPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${beamOrigin}`,
      `#${beamAxisDir}`,
      `#${beamRefDir}`,
    ]);

    // 梁のローカル配置（柱と同様にグローバル座標系を使用）
    const beamLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null, // PlacementRelTo: グローバル配置
      `#${beamPlacement3D}`,
    ]);

    // 押出方向（ローカル座標系のZ方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 押出用の配置（プロファイルの位置）
    const extrudeOrigin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, 0.0]]);
    const extrudePlacement = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${extrudeOrigin}`,
      null,
      null,
    ]);

    // 押出形状を作成 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      `#${extrudePlacement}`,
      `#${extrudeDir}`,
      length,
    ]);

    // 形状表現の Items を構築
    const solidItems = [`#${solidId}`];

    // SRC造の場合、鉄骨プロファイルも追加（コンクリート外殻＋鉄骨内部の複合表現）
    if (isSRC && steelProfile) {
      const steelProfileId = this._createProfileId(steelProfile, false);
      if (steelProfileId !== null) {
        const steelSolidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
          `#${steelProfileId}`,
          `#${extrudePlacement}`,
          `#${extrudeDir}`,
          length,
        ]);
        solidItems.push(`#${steelSolidId}`);
      }
    }

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`, // ContextOfItems
      'Body', // RepresentationIdentifier
      'SweptSolid', // RepresentationType
      solidItems, // Items
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null, // Name
      null, // Description
      [`#${shapeRep}`], // Representations
    ]);

    // 梁エンティティ（ObjectTypeにkind_structureを格納）
    const beamId = w.createEntity('IFCBEAM', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      name, // Name
      null, // Description
      kindStructure, // ObjectType: kind_structure (S/RC/SRC)
      `#${beamLocalPlacement}`, // ObjectPlacement
      `#${productShape}`, // Representation
      null, // Tag
      stbType === STB_TAG_NAMES.BEAM ? '.USERDEFINED.' : '.BEAM.', // PredefinedType: StbBeam=USERDEFINED, StbGirder=BEAM
    ]);

    // 梁を階に所属させる（天端基準配置調整後のZ座標で適切な階を決定）
    const beamZ = Math.min(adjustedStartZ, adjustedStartZ + dz);
    this._addToStorey(beamId, beamZ);

    return beamId;
  }

  /**
   * テーパー（ハンチ）付き梁を追加
   * マルチセクション形状をIFCFACETEDBREPで表現
   * @param {Object} beamData - 梁データ
   * @param {string} beamData.name - 梁名
   * @param {Object} beamData.startPoint - 始点座標 {x, y, z} (mm)
   * @param {Object} beamData.endPoint - 終点座標 {x, y, z} (mm)
   * @param {Array<Object>} beamData.sections - 断面情報配列
   * @param {number} beamData.sections[].pos - 断面位置 (0.0〜1.0)
   * @param {Array<{x: number, y: number}>} beamData.sections[].vertices - 断面頂点（ローカル座標）
   * @param {number} [beamData.rotation=0] - 断面の回転角度（度）
   * @param {string} [beamData.placementMode='center'] - 配置モード ('center' | 'top-aligned')
   * @returns {number|null} 梁エンティティID（未対応の場合はnull）
   */
  addTaperedBeam(beamData) {
    this._ensureInitialized();
    const w = this.writer;
    const { name = 'TaperedBeam', startPoint, endPoint, sections, rotation = 0 } = beamData;

    // 必須パラメータのチェック
    if (!startPoint || !endPoint || !sections || sections.length < 2) {
      log.warn(
        `[IFC Export] テーパー梁 "${name}" をスキップ: 必須パラメータ（startPoint, endPoint, sections>=2）が不足しています`,
      );
      return null;
    }

    const vertexCount = sections[0].vertices?.length;
    if (!vertexCount || vertexCount < 3) {
      log.warn(`[IFC Export] テーパー梁 "${name}" をスキップ: 断面の頂点が不足しています`);
      return null;
    }

    for (const section of sections) {
      if (!section.vertices || section.vertices.length !== vertexCount) {
        log.warn(`[IFC Export] テーパー梁 "${name}" をスキップ: 断面の頂点数が一致しません`);
        return null;
      }
    }

    // 梁の長さと方向を計算
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-6) {
      log.warn(`[IFC Export] テーパー梁 "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // 方向ベクトル（梁軸=Z軸方向）
    const dirX = dx / length;
    const dirY = dy / length;
    const dirZ = dz / length;

    // ローカル座標系の基底ベクトルを計算（vectorMath共通関数を使用）
    // calculateBeamBasis は水平梁・傾斜梁・垂直要素いずれにも正しい基底を返す
    // - 水平梁: yAxis = {0,0,1}（真上向き）
    // - 傾斜梁: yAxis は梁軸に垂直かつ鉛直面内の上向き成分
    // - 垂直要素: globalX基準のフォールバック
    const dir = { x: dirX, y: dirY, z: dirZ };
    const basis = calculateBeamBasis(dir);
    let localX = basis.xAxis;
    let localY = basis.yAxis;

    // 回転を適用（梁軸周りのX/Y軸回転）
    if (Math.abs(rotation) > 1e-6) {
      const rotRad = (rotation * Math.PI) / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      const newX = {
        x: localX.x * cosR + localY.x * sinR,
        y: localX.y * cosR + localY.y * sinR,
        z: localX.z * cosR + localY.z * sinR,
      };
      const newY = {
        x: -localX.x * sinR + localY.x * cosR,
        y: -localX.y * sinR + localY.y * cosR,
        z: -localX.z * sinR + localY.z * cosR,
      };
      localX = newX;
      localY = newY;
    }

    // 断面をposでソート
    const sortedSections = [...sections].sort((a, b) => a.pos - b.pos);

    // 各断面のローカル3D頂点を計算
    // IFCLOCALPLACEMENT で始点・軸方向を与えるため、BRep 頂点はローカル座標で保持する。
    const sectionVertices3D = [];
    for (const section of sortedSections) {
      const zPos = section.pos * length;
      const vertices3D = [];

      for (const v of section.vertices) {
        vertices3D.push({ x: v.x, y: v.y, z: zPos });
      }

      sectionVertices3D.push(vertices3D);
    }

    // IFCCARTESIANPOINTを作成
    const pointIds = [];
    for (const sectionVerts of sectionVertices3D) {
      const sectionPointIds = [];
      for (const v of sectionVerts) {
        const pointId = w.createEntity('IFCCARTESIANPOINT', [[v.x, v.y, v.z]]);
        sectionPointIds.push(pointId);
      }
      pointIds.push(sectionPointIds);
    }

    // IFCFACEを作成
    const faceIds = [];

    // 側面を作成（隣接する断面間）
    for (let s = 0; s < sectionVertices3D.length - 1; s++) {
      const currSection = pointIds[s];
      const nextSection = pointIds[s + 1];

      for (let i = 0; i < vertexCount; i++) {
        const i1 = i;
        const i2 = (i + 1) % vertexCount;

        // 四角形面を2つの三角形に分割、または四角形として
        // IFCでは四角形面が使えるのでそのまま使用
        const loop = w.createEntity('IFCPOLYLOOP', [
          [
            `#${currSection[i1]}`,
            `#${currSection[i2]}`,
            `#${nextSection[i2]}`,
            `#${nextSection[i1]}`,
          ],
        ]);
        const bound = w.createEntity('IFCFACEOUTERBOUND', [`#${loop}`, '.T.']);
        const face = w.createEntity('IFCFACE', [[`#${bound}`]]);
        faceIds.push(face);
      }
    }

    // 始端面（最初の断面）
    {
      const firstSection = pointIds[0];
      // 面の向きを反転（外向き）
      const reversedPoints = [...firstSection].reverse();
      const loop = w.createEntity('IFCPOLYLOOP', [reversedPoints.map((id) => `#${id}`)]);
      const bound = w.createEntity('IFCFACEOUTERBOUND', [`#${loop}`, '.T.']);
      const face = w.createEntity('IFCFACE', [[`#${bound}`]]);
      faceIds.push(face);
    }

    // 終端面（最後の断面）
    {
      const lastSection = pointIds[pointIds.length - 1];
      const loop = w.createEntity('IFCPOLYLOOP', [lastSection.map((id) => `#${id}`)]);
      const bound = w.createEntity('IFCFACEOUTERBOUND', [`#${loop}`, '.T.']);
      const face = w.createEntity('IFCFACE', [[`#${bound}`]]);
      faceIds.push(face);
    }

    // IFCCLOSEDSHELLを作成
    const shellId = w.createEntity('IFCCLOSEDSHELL', [faceIds.map((id) => `#${id}`)]);

    // IFCFACETEDBREPを作成
    const brepId = w.createEntity('IFCFACETEDBREP', [`#${shellId}`]);

    // 梁の配置：始点と方向ベクトルを使用（ifc-to-stbがノード位置を正しく復元できるよう）
    const beamAxisDir = w.createEntity('IFCDIRECTION', [[dirX, dirY, dirZ]]);
    const beamRefDir = w.createEntity('IFCDIRECTION', [[localX.x, localX.y, localX.z]]);
    const beamOriginPt = w.createEntity('IFCCARTESIANPOINT', [
      [startPoint.x, startPoint.y, startPoint.z],
    ]);
    const beamPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${beamOriginPt}`,
      `#${beamAxisDir}`,
      `#${beamRefDir}`,
    ]);
    const beamLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [null, `#${beamPlacement3D}`]);

    // Brep形状表現（視覚表現）
    const brepShapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'Brep',
      [`#${brepId}`],
    ]);

    // SweptSolid補助表現（ProfileAnalyzerが梁長さを抽出できるよう IFCEXTRUDEDAREASOLID を追加）
    const repIds = [`#${brepShapeRep}`];
    const firstProfile = sections[0]?.profile;
    const auxProfileId = firstProfile ? this._createProfileId(firstProfile, false) : null;
    if (auxProfileId !== null) {
      const extrudeOrigin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, 0.0]]);
      const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);
      const extrudePlacement = w.createEntity('IFCAXIS2PLACEMENT3D', [
        `#${extrudeOrigin}`,
        null,
        null,
      ]);
      const auxSolidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
        `#${auxProfileId}`,
        `#${extrudePlacement}`,
        `#${extrudeDir}`,
        length,
      ]);
      const auxShapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
        `#${this._refs.bodyContext}`,
        'Body',
        'SweptSolid',
        [`#${auxSolidId}`],
      ]);
      repIds.push(`#${auxShapeRep}`);
    }

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [null, null, repIds]);

    // 梁エンティティ
    const beamId = w.createEntity('IFCBEAM', [
      generateIfcGuid(),
      null,
      name,
      null,
      null,
      `#${beamLocalPlacement}`,
      `#${productShape}`,
      null,
      '.BEAM.',
    ]);

    // 階に所属
    const beamZ = Math.min(startPoint.z, endPoint.z);
    this._addToStorey(beamId, beamZ);

    return beamId;
  }

  /**
   * 柱を追加
   * @param {Object} columnData - 柱データ
   * @param {string} columnData.name - 柱名
   * @param {Object} columnData.bottomPoint - 底部座標 {x, y, z} (mm)
   * @param {Object} columnData.topPoint - 頂部座標 {x, y, z} (mm)
   * @param {Object} columnData.profile - プロファイル情報
   * @param {string} columnData.profile.type - プロファイルタイプ ('H', 'BOX', 'PIPE', 'RECTANGLE')
   * @param {Object} columnData.profile.params - プロファイルパラメータ
   * @param {number} [columnData.rotation=0] - 断面の回転角度（度）
   * @param {boolean} [columnData.isReferenceDirection=true] - 基準方向フラグ（falseの場合90度回転追加）
   * @returns {number|null} 柱エンティティID（未対応の場合はnull）
   * @throws {TypeError} If columnData is not a valid object
   */
  addColumn(columnData) {
    this._ensureInitialized();
    const w = this.writer;

    // 共通バリデーション
    const validation = this._validateLinearElementData(columnData, '柱', {
      point1: 'bottomPoint',
      point2: 'topPoint',
    });

    if (!validation.isValid) {
      log.error(`[IFC Export] 柱をスキップ: ${validation.error}`);
      return null;
    }

    const {
      name = 'Column',
      isReferenceDirection = true,
      isSRC = false,
      steelProfile = null,
      kindStructure = 'S',
    } = columnData;

    // Validate isReferenceDirection
    if (typeof isReferenceDirection !== 'boolean') {
      log.warn(`[IFC Export] 柱 "${name}": isReferenceDirection must be a boolean, using true`);
    }

    const { point1: bottomPoint, profile, length, rotation } = validation;

    // プロファイルを作成（Position は null）
    const profileId = this._createProfileId(profile, true);
    if (profileId === null) {
      log.warn(
        `[IFC Export] 柱 "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`,
      );
      return null;
    }

    // 押出方向（垂直: Z方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // プロファイルの位置（下端原点基準: 0 から length まで押出）
    const extrudeOrigin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, 0.0]]);
    const extrudePosition = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${extrudeOrigin}`,
      null,
      null,
    ]);

    // 押出形状を作成 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      `#${extrudePosition}`, // Position: Z = 0 から開始（下端原点基準）
      `#${extrudeDir}`,
      length,
    ]);

    // 形状表現の Items を構築
    const solidItems = [`#${solidId}`];

    // SRC造の場合、鉄骨プロファイルも追加（コンクリート外殻＋鉄骨内部の複合表現）
    if (isSRC && steelProfile) {
      const steelProfileId = this._createProfileId(steelProfile, true);
      if (steelProfileId !== null) {
        const steelSolidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
          `#${steelProfileId}`,
          `#${extrudePosition}`,
          `#${extrudeDir}`,
          length,
        ]);
        solidItems.push(`#${steelSolidId}`);
      }
    }

    // 柱の配置点（下端）(mm) - IFC標準に従い下端を原点とする
    const columnOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [bottomPoint.x, bottomPoint.y, bottomPoint.z],
    ]);

    // 回転角度を計算（度 → ラジアン）
    // isReferenceDirection=false の場合は90度追加（H型配置）
    let effectiveRotationDeg = rotation;
    if (!isReferenceDirection) {
      effectiveRotationDeg += 90;
    }
    const effectiveRotationRad = (effectiveRotationDeg * Math.PI) / 180;

    // Z軸（垂直方向）
    const axisDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 参照方向（XY平面上の回転）
    const cosVal = Math.cos(effectiveRotationRad);
    const sinVal = Math.sin(effectiveRotationRad);
    const refDir = w.createEntity('IFCDIRECTION', [[cosVal, sinVal, 0.0]]);

    // 配置座標系（軸・参照方向を設定）
    const columnPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${columnOrigin}`,
      `#${axisDir}`, // Axis: Z方向
      `#${refDir}`, // RefDirection: 回転を反映
    ]);

    // 柱のローカル配置
    const columnLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null, // PlacementRelTo: グローバル配置
      `#${columnPlacement3D}`,
    ]);

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      solidItems,
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`],
    ]);

    // 柱エンティティ（ObjectTypeにkind_structureを格納）
    const columnId = w.createEntity('IFCCOLUMN', [
      generateIfcGuid(),
      null, // OwnerHistory
      name,
      null, // Description
      kindStructure, // ObjectType: kind_structure (S/RC/SRC/CFT)
      `#${columnLocalPlacement}`,
      `#${productShape}`,
      null, // Tag
      null, // PredefinedType
    ]);

    // 柱を階に所属させる（底部Z座標で適切な階を決定）
    this._addToStorey(columnId, bottomPoint.z);

    return columnId;
  }

  /**
   * 間柱を追加
   * @param {Object} postData - 間柱データ
   * @param {string} postData.name - 間柱名
   * @param {Object} postData.bottomPoint - 底部座標 {x, y, z} (mm)
   * @param {Object} postData.topPoint - 頂部座標 {x, y, z} (mm)
   * @param {Object} postData.profile - プロファイル情報
   * @param {string} postData.profile.type - プロファイルタイプ ('H', 'BOX', 'PIPE', 'RECTANGLE')
   * @param {Object} postData.profile.params - プロファイルパラメータ
   * @param {number} [postData.rotation=0] - 断面の回転角度（度）
   * @param {boolean} [postData.isReferenceDirection=true] - 基準方向フラグ（falseの場合90度回転追加）
   * @returns {number|null} 間柱エンティティID（未対応の場合はnull）
   */
  addPost(postData) {
    this._ensureInitialized();
    const w = this.writer;

    // 共通バリデーション
    const validation = this._validateLinearElementData(postData, '間柱', {
      point1: 'bottomPoint',
      point2: 'topPoint',
    });

    if (!validation.isValid) {
      log.error(`[IFC Export] 間柱をスキップ: ${validation.error}`);
      return null;
    }

    const { name = 'Post', isReferenceDirection = true, kindStructure = 'S' } = postData;

    const { point1: bottomPoint, profile, length, rotation } = validation;

    // プロファイルを作成（Position は null）
    const profileId = this._createProfileId(profile, true);
    if (profileId === null) {
      log.warn(
        `[IFC Export] 間柱 "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`,
      );
      return null;
    }

    // 押出方向（垂直: Z方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // プロファイルの位置（下端原点基準: 0 から length まで押出）
    const extrudeOrigin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, 0.0]]);
    const extrudePosition = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${extrudeOrigin}`,
      null,
      null,
    ]);

    // 押出形状を作成 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      `#${extrudePosition}`, // Position: Z = 0 から開始（下端原点基準）
      `#${extrudeDir}`,
      length,
    ]);

    // 間柱の配置点（下端）(mm) - IFC標準に従い下端を原点とする
    const postOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [bottomPoint.x, bottomPoint.y, bottomPoint.z],
    ]);

    // 回転角度を計算（度 → ラジアン）
    // isReferenceDirection=false の場合は90度追加（H型配置）
    let effectiveRotationDeg = rotation;
    if (!isReferenceDirection) {
      effectiveRotationDeg += 90;
    }
    const effectiveRotationRad = (effectiveRotationDeg * Math.PI) / 180;

    // Z軸（垂直方向）
    const axisDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 参照方向（XY平面上の回転）
    const cosVal = Math.cos(effectiveRotationRad);
    const sinVal = Math.sin(effectiveRotationRad);
    const refDir = w.createEntity('IFCDIRECTION', [[cosVal, sinVal, 0.0]]);

    // 配置座標系（軸・参照方向を設定）
    const postPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${postOrigin}`,
      `#${axisDir}`, // Axis: Z方向
      `#${refDir}`, // RefDirection: 回転を反映
    ]);

    // 間柱のローカル配置
    const postLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null, // PlacementRelTo: グローバル配置
      `#${postPlacement3D}`,
    ]);

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`],
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`],
    ]);

    // 間柱エンティティ（IFCCOLUMNとして出力、ObjectTypeで区別）
    const postId = w.createEntity('IFCCOLUMN', [
      generateIfcGuid(),
      null, // OwnerHistory
      name,
      null, // Description
      kindStructure, // ObjectType: kind_structure (S/RC/SRC/CFT)
      `#${postLocalPlacement}`,
      `#${productShape}`,
      null, // Tag
      '.USERDEFINED.', // PredefinedType: 間柱識別子
    ]);

    // 間柱を階に所属させる（底部Z座標で適切な階を決定）
    this._addToStorey(postId, bottomPoint.z);

    return postId;
  }

  /**
   * ブレースを追加
   * @param {Object} braceData - ブレースデータ
   * @param {string} braceData.name - ブレース名
   * @param {Object} braceData.startPoint - 始点座標 {x, y, z} (mm)
   * @param {Object} braceData.endPoint - 終点座標 {x, y, z} (mm)
   * @param {Object} braceData.profile - プロファイル情報
   * @param {number} [braceData.rotation=0] - 断面の回転角度（度）、軸周りの回転
   * @returns {number|null} ブレースエンティティID（未対応の場合はnull）
   * @throws {TypeError} If braceData is not a valid object
   */
  addBrace(braceData) {
    this._ensureInitialized();
    const w = this.writer;

    // 共通バリデーション
    const validation = this._validateLinearElementData(braceData, 'ブレース', {
      point1: 'startPoint',
      point2: 'endPoint',
    });

    if (!validation.isValid) {
      log.error(`[IFC Export] ブレースをスキップ: ${validation.error}`);
      return null;
    }

    const { name = 'Brace', kindStructure = 'S' } = braceData;

    const { point1: startPoint, point2: endPoint, profile, length, rotation } = validation;

    // ブレースの方向ベクトル（正規化）
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const dirX = dx / length;
    const dirY = dy / length;
    const dirZ = dz / length;

    // プロファイルを作成（シンプル版、Position = null）
    const profileId = this._createProfileId(profile, true);
    if (profileId === null) {
      log.warn(
        `[IFC Export] ブレース "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`,
      );
      return null;
    }

    // ブレースの配置点（始点）(mm)
    const braceOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [startPoint.x, startPoint.y, startPoint.z],
    ]);

    // ブレースの軸方向（押出方向と同じ）
    const braceAxisDir = w.createEntity('IFCDIRECTION', [[dirX, dirY, dirZ]]);

    // 参照方向の計算（vectorMath共通関数を使用）
    // ブレースでは dir × globalUp を参照方向とする（梁のxAxisの反転に相当）
    const dir = { x: dirX, y: dirY, z: dirZ };
    const basis = calculateBeamBasis(dir);
    // ブレースの参照方向は -xAxis（dir × globalUp = -(globalUp × dir)）
    let baseRefDir = { x: -basis.xAxis.x, y: -basis.xAxis.y, z: -basis.xAxis.z };

    // 垂直に近い場合はY方向を参照（calculateBeamBasisの垂直時とは異なるため上書き）
    if (Math.abs(dirZ) >= 0.99) {
      baseRefDir = { x: 0, y: 1, z: 0 };
    }

    // 回転角度を適用（ブレース軸周りの回転）
    let refDir = baseRefDir;
    if (Math.abs(rotation) > 1e-6) {
      const rotationRad = (rotation * Math.PI) / 180;
      refDir = rotateVectorAroundAxis(baseRefDir, dir, rotationRad);
    }
    const braceRefDir = w.createEntity('IFCDIRECTION', [[refDir.x, refDir.y, refDir.z]]);

    // 配置座標系（始点、軸方向、参照方向）
    const bracePlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${braceOrigin}`,
      `#${braceAxisDir}`,
      `#${braceRefDir}`,
    ]);

    // ローカル配置（グローバル基準）
    const braceLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null, // PlacementRelTo: グローバル配置
      `#${bracePlacement3D}`,
    ]);

    // 押出方向（ローカル座標系のZ方向 = 軸方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 押出形状 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      null, // Position: デフォルト
      `#${extrudeDir}`,
      length,
    ]);

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`],
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`],
    ]);

    // ブレースエンティティ（IFCMEMBER、ObjectTypeにkind_structureを格納）
    const braceId = w.createEntity('IFCMEMBER', [
      generateIfcGuid(),
      null, // OwnerHistory
      name,
      null, // Description
      kindStructure, // ObjectType: kind_structure (S)
      `#${braceLocalPlacement}`,
      `#${productShape}`,
      null, // Tag
      '.BRACE.', // PredefinedType
    ]);

    // 階に所属させる（Z座標で適切な階を決定）
    const braceZ = Math.min(startPoint.z, endPoint.z);
    this._addToStorey(braceId, braceZ);

    return braceId;
  }

  /**
   * 線形要素データのバリデーション（梁・柱・ブレース共通）
   * @private
   * @param {Object} data - バリデーション対象オブジェクト
   * @param {string} elementType - 要素型の日本語名（例: '梁', '柱', 'ブレース'）
   * @param {Object} pointFieldNames - ポイントフィールド名
   * @param {string} pointFieldNames.point1 - 第1ポイントのフィールド名（例: 'startPoint'）
   * @param {string} pointFieldNames.point2 - 第2ポイントのフィールド名（例: 'endPoint'）
   * @returns {Object} バリデーション結果
   * @returns {boolean} result.isValid - バリデーション成功フラグ
   * @returns {string} [result.error] - エラーメッセージ（失敗時）
   * @returns {Object} [result.point1] - 第1ポイント（成功時）
   * @returns {Object} [result.point2] - 第2ポイント（成功時）
   * @returns {Object} [result.profile] - プロファイル（成功時）
   * @returns {number} [result.length] - ポイント間の距離（成功時）
   * @returns {number} [result.rotation] - 回転値（成功時）
   */
  _validateLinearElementData(data, elementType, pointFieldNames) {
    // Step 1: データオブジェクト自体のチェック
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        isValid: false,
        error: `${elementType}データは null でないオブジェクトである必要があります`,
      };
    }

    const point1Name = pointFieldNames.point1;
    const point2Name = pointFieldNames.point2;
    const point1 = data[point1Name];
    const point2 = data[point2Name];
    const profile = data.profile;

    // Step 2: 必須パラメータのチェック
    if (!point1 || !point2 || !profile) {
      return {
        isValid: false,
        error: `${elementType}の必須パラメータが不足しています: ${point1Name}, ${point2Name}, profile`,
      };
    }

    // Step 3: ポイント1のオブジェクト妥当性チェック
    if (
      typeof point1 !== 'object' ||
      typeof point1.x !== 'number' ||
      typeof point1.y !== 'number' ||
      typeof point1.z !== 'number'
    ) {
      return {
        isValid: false,
        error: `${elementType}の${point1Name}は数値プロパティ x, y, z を持つオブジェクトである必要があります`,
      };
    }

    // Step 4: ポイント2のオブジェクト妥当性チェック
    if (
      typeof point2 !== 'object' ||
      typeof point2.x !== 'number' ||
      typeof point2.y !== 'number' ||
      typeof point2.z !== 'number'
    ) {
      return {
        isValid: false,
        error: `${elementType}の${point2Name}は数値プロパティ x, y, z を持つオブジェクトである必要があります`,
      };
    }

    // Step 5: プロファイルのオブジェクト妥当性チェック
    if (typeof profile !== 'object' || !profile.type) {
      return {
        isValid: false,
        error: `${elementType}のプロファイルはtype プロパティを持つオブジェクトである必要があります`,
      };
    }

    // Step 6: 回転値のチェック
    const rotation = data.rotation ?? 0;
    if (typeof rotation !== 'number' || !isFinite(rotation)) {
      return {
        isValid: false,
        error: `${elementType}の回転値は有限数である必要があります`,
      };
    }

    // Step 7: ポイント間の距離計算と0チェック
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const dz = point2.z - point1.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-6) {
      return {
        isValid: false,
        error: `${elementType}の長さが0です`,
      };
    }

    return {
      isValid: true,
      point1,
      point2,
      profile,
      length,
      rotation,
    };
  }

  /**
   * IFCファイルを生成（梁用のデフォルトオプション）
   * @param {Object} options - オプション
   * @param {string} [options.fileName='beam_export.ifc'] - ファイル名
   * @returns {string} IFCファイル内容
   */
  generate(options = {}) {
    return super.generate({
      fileName: options.fileName || 'beam_export.ifc',
      description: options.description || 'Single Beam IFC Export',
      ...options,
    });
  }
}

/**
 * 簡易エクスポート関数
 * @param {Object} beamData - 梁データ
 * @returns {string} IFCファイル内容
 * @throws {TypeError} If beamData is not a valid object
 */
export function exportSingleBeamToIFC(beamData) {
  // Validate beamData
  if (!beamData || typeof beamData !== 'object' || Array.isArray(beamData)) {
    const error = new TypeError('beamData must be a non-null object');
    log.error('Validation failed:', error);
    throw error;
  }

  const exporter = new IFCBeamExporter();
  exporter.addBeam(beamData);
  return exporter.generate();
}
