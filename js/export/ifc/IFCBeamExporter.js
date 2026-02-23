/**
 * @fileoverview 線形要素（梁・柱・ブレース）のIFCエクスポーター
 * IFCExporterBaseを継承し、梁・柱・ブレースの出力機能を提供
 */

import { IFCExporterBase, generateIfcGuid } from './IFCExporterBase.js';
import { createLogger } from '../../utils/logger.js';
import {
  calculateBeamBasis,
  rotateVectorAroundAxis,
} from '../../data/geometry/vectorMath.js';

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

    // Validate beamData
    if (!beamData || typeof beamData !== 'object' || Array.isArray(beamData)) {
      const error = new TypeError('beamData must be a non-null object');
      log.error('Validation failed:', error);
      return null;
    }

    const {
      name = 'Beam',
      startPoint,
      endPoint,
      profile,
      rotation = 0,
      placementMode = 'center',
      sectionHeight = 0,
      isSRC = false,
      steelProfile = null,
    } = beamData;

    // Validate name
    if (typeof name !== 'string') {
      log.warn(`[IFC Export] beamData.name must be a string, using default "Beam"`);
    }

    // 必須パラメータのチェック
    if (!startPoint || !endPoint || !profile) {
      const error = new Error(
        'Required parameters missing: startPoint, endPoint, and profile are required',
      );
      log.error(`[IFC Export] 梁 "${name}" をスキップ:`, error);
      return null;
    }

    // Validate point objects
    if (
      typeof startPoint !== 'object' ||
      typeof startPoint.x !== 'number' ||
      typeof startPoint.y !== 'number' ||
      typeof startPoint.z !== 'number'
    ) {
      const error = new TypeError('startPoint must be an object with numeric x, y, z properties');
      log.error(`[IFC Export] 梁 "${name}" をスキップ:`, error);
      return null;
    }

    if (
      typeof endPoint !== 'object' ||
      typeof endPoint.x !== 'number' ||
      typeof endPoint.y !== 'number' ||
      typeof endPoint.z !== 'number'
    ) {
      const error = new TypeError('endPoint must be an object with numeric x, y, z properties');
      log.error(`[IFC Export] 梁 "${name}" をスキップ:`, error);
      return null;
    }

    // Validate profile
    if (typeof profile !== 'object' || !profile.type) {
      const error = new TypeError('profile must be an object with a type property');
      log.error(`[IFC Export] 梁 "${name}" をスキップ:`, error);
      return null;
    }

    // Validate rotation
    if (typeof rotation !== 'number' || !isFinite(rotation)) {
      log.warn(`[IFC Export] 梁 "${name}": rotation must be a finite number, using 0`);
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

    // 梁の長さを計算 (mm)
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // 長さが0の場合はスキップ
    if (length < 1e-6) {
      log.warn(`[IFC Export] 梁 "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // 梁の方向ベクトル
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

    // 梁エンティティ
    const beamId = w.createEntity('IFCBEAM', [
      generateIfcGuid(), // GlobalId
      null, // OwnerHistory
      name, // Name
      null, // Description
      null, // ObjectType
      `#${beamLocalPlacement}`, // ObjectPlacement
      `#${productShape}`, // Representation
      null, // Tag
      '.BEAM.', // PredefinedType
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
    const {
      name = 'TaperedBeam',
      startPoint,
      endPoint,
      sections,
      rotation = 0,
      placementMode = 'center',
    } = beamData;

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

    const localXX = localX.x, localXY = localX.y, localXZ = localX.z;
    const localYX = localY.x, localYY = localY.y, localYZ = localY.z;

    // 断面をposでソート
    const sortedSections = [...sections].sort((a, b) => a.pos - b.pos);

    // 各断面の3D頂点を計算
    const sectionVertices3D = [];
    for (const section of sortedSections) {
      const zPos = section.pos * length;
      const vertices3D = [];

      for (const v of section.vertices) {
        // ローカル座標 (v.x, v.y) をグローバル座標に変換
        const gx = startPoint.x + localXX * v.x + localYX * v.y + dirX * zPos;
        const gy = startPoint.y + localXY * v.x + localYY * v.y + dirY * zPos;
        const gz = startPoint.z + localXZ * v.x + localYZ * v.y + dirZ * zPos;
        vertices3D.push({ x: gx, y: gy, z: gz });
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

    // 配置点
    const beamOrigin = w.createEntity('IFCCARTESIANPOINT', [[0, 0, 0]]);
    const beamPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [`#${beamOrigin}`, null, null]);
    // 梁のローカル配置（柱と同様にグローバル座標系を使用）
    const beamLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null, // PlacementRelTo: グローバル配置
      `#${beamPlacement3D}`,
    ]);

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'Brep',
      [`#${brepId}`],
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`],
    ]);

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

    // Validate columnData
    if (!columnData || typeof columnData !== 'object' || Array.isArray(columnData)) {
      const error = new TypeError('columnData must be a non-null object');
      log.error('Validation failed:', error);
      return null;
    }

    const {
      name = 'Column',
      bottomPoint,
      topPoint,
      profile,
      rotation = 0,
      isReferenceDirection = true,
      isSRC = false,
      steelProfile = null,
    } = columnData;

    // 必須パラメータのチェック
    if (!bottomPoint || !topPoint || !profile) {
      const error = new Error(
        'Required parameters missing: bottomPoint, topPoint, and profile are required',
      );
      log.error(`[IFC Export] 柱 "${name}" をスキップ:`, error);
      return null;
    }

    // Validate point objects
    if (
      typeof bottomPoint !== 'object' ||
      typeof bottomPoint.x !== 'number' ||
      typeof bottomPoint.y !== 'number' ||
      typeof bottomPoint.z !== 'number'
    ) {
      const error = new TypeError('bottomPoint must be an object with numeric x, y, z properties');
      log.error(`[IFC Export] 柱 "${name}" をスキップ:`, error);
      return null;
    }

    if (
      typeof topPoint !== 'object' ||
      typeof topPoint.x !== 'number' ||
      typeof topPoint.y !== 'number' ||
      typeof topPoint.z !== 'number'
    ) {
      const error = new TypeError('topPoint must be an object with numeric x, y, z properties');
      log.error(`[IFC Export] 柱 "${name}" をスキップ:`, error);
      return null;
    }

    // Validate profile
    if (typeof profile !== 'object' || !profile.type) {
      const error = new TypeError('profile must be an object with a type property');
      log.error(`[IFC Export] 柱 "${name}" をスキップ:`, error);
      return null;
    }

    // Validate rotation
    if (typeof rotation !== 'number' || !isFinite(rotation)) {
      log.warn(`[IFC Export] 柱 "${name}": rotation must be a finite number, using 0`);
    }

    // Validate isReferenceDirection
    if (typeof isReferenceDirection !== 'boolean') {
      log.warn(`[IFC Export] 柱 "${name}": isReferenceDirection must be a boolean, using true`);
    }

    // 柱の長さを計算 (mm)
    const dx = topPoint.x - bottomPoint.x;
    const dy = topPoint.y - bottomPoint.y;
    const dz = topPoint.z - bottomPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-6) {
      log.warn(`[IFC Export] 柱 "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // プロファイルを作成（Position は null）
    const profileId = this._createProfileId(profile, true);
    if (profileId === null) {
      log.warn(
        `[IFC Export] 柱 "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`,
      );
      return null;
    }

    // 柱の中心点を計算（Three.jsと同じ中心基準配置）
    const centerX = (bottomPoint.x + topPoint.x) / 2;
    const centerY = (bottomPoint.y + topPoint.y) / 2;
    const centerZ = (bottomPoint.z + topPoint.z) / 2;

    // 押出方向（垂直: Z方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // プロファイルの位置（中心基準にするため、-length/2 から開始）
    const extrudeOrigin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, -length / 2]]);
    const extrudePosition = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${extrudeOrigin}`,
      null,
      null,
    ]);

    // 押出形状を作成 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      `#${extrudePosition}`, // Position: Z = -length/2 から開始（中心基準）
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

    // 柱の配置点（中心）(mm) - Three.jsと同じ配置方法
    const columnOrigin = w.createEntity('IFCCARTESIANPOINT', [[centerX, centerY, centerZ]]);

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

    // 柱エンティティ（PredefinedType は null でシンプルに）
    const columnId = w.createEntity('IFCCOLUMN', [
      generateIfcGuid(),
      null, // OwnerHistory
      name,
      null, // Description
      null, // ObjectType
      `#${columnLocalPlacement}`,
      `#${productShape}`,
      null, // Tag
      null, // PredefinedType: null でシンプルに
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
    const {
      name = 'Post',
      bottomPoint,
      topPoint,
      profile,
      rotation = 0,
      isReferenceDirection = true,
    } = postData;

    // 必須パラメータのチェック
    if (!bottomPoint || !topPoint || !profile) {
      log.warn(
        `[IFC Export] 間柱 "${name}" をスキップ: 必須パラメータ（bottomPoint, topPoint, profile）が不足しています`,
      );
      return null;
    }

    // 間柱の長さを計算 (mm)
    const dx = topPoint.x - bottomPoint.x;
    const dy = topPoint.y - bottomPoint.y;
    const dz = topPoint.z - bottomPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-6) {
      log.warn(`[IFC Export] 間柱 "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // プロファイルを作成（Position は null）
    const profileId = this._createProfileId(profile, true);
    if (profileId === null) {
      log.warn(
        `[IFC Export] 間柱 "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`,
      );
      return null;
    }

    // 間柱の中心点を計算（Three.jsと同じ中心基準配置）
    const centerX = (bottomPoint.x + topPoint.x) / 2;
    const centerY = (bottomPoint.y + topPoint.y) / 2;
    const centerZ = (bottomPoint.z + topPoint.z) / 2;

    // 押出方向（垂直: Z方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // プロファイルの位置（中心基準にするため、-length/2 から開始）
    const extrudeOrigin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, -length / 2]]);
    const extrudePosition = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${extrudeOrigin}`,
      null,
      null,
    ]);

    // 押出形状を作成 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      `#${extrudePosition}`, // Position: Z = -length/2 から開始（中心基準）
      `#${extrudeDir}`,
      length,
    ]);

    // 間柱の配置点（中心）(mm)
    const postOrigin = w.createEntity('IFCCARTESIANPOINT', [[centerX, centerY, centerZ]]);

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
      'Post', // Description: 間柱であることを示す
      'Post', // ObjectType: 間柱であることを示す
      `#${postLocalPlacement}`,
      `#${productShape}`,
      null, // Tag
      null, // PredefinedType
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

    // Validate braceData
    if (!braceData || typeof braceData !== 'object' || Array.isArray(braceData)) {
      const error = new TypeError('braceData must be a non-null object');
      log.error('Validation failed:', error);
      return null;
    }

    const { name = 'Brace', startPoint, endPoint, profile, rotation = 0 } = braceData;

    // 必須パラメータのチェック
    if (!startPoint || !endPoint || !profile) {
      const error = new Error(
        'Required parameters missing: startPoint, endPoint, and profile are required',
      );
      log.error(`[IFC Export] ブレース "${name}" をスキップ:`, error);
      return null;
    }

    // Validate point objects
    if (
      typeof startPoint !== 'object' ||
      typeof startPoint.x !== 'number' ||
      typeof startPoint.y !== 'number' ||
      typeof startPoint.z !== 'number'
    ) {
      const error = new TypeError('startPoint must be an object with numeric x, y, z properties');
      log.error(`[IFC Export] ブレース "${name}" をスキップ:`, error);
      return null;
    }

    if (
      typeof endPoint !== 'object' ||
      typeof endPoint.x !== 'number' ||
      typeof endPoint.y !== 'number' ||
      typeof endPoint.z !== 'number'
    ) {
      const error = new TypeError('endPoint must be an object with numeric x, y, z properties');
      log.error(`[IFC Export] ブレース "${name}" をスキップ:`, error);
      return null;
    }

    // Validate profile
    if (typeof profile !== 'object' || !profile.type) {
      const error = new TypeError('profile must be an object with a type property');
      log.error(`[IFC Export] ブレース "${name}" をスキップ:`, error);
      return null;
    }

    // Validate rotation
    if (typeof rotation !== 'number' || !isFinite(rotation)) {
      log.warn(`[IFC Export] ブレース "${name}": rotation must be a finite number, using 0`);
    }

    // ブレースの長さを計算 (mm)
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-6) {
      log.warn(`[IFC Export] ブレース "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // ブレースの方向ベクトル（正規化）
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

    // ブレースエンティティ（IFCMEMBER）
    const braceId = w.createEntity('IFCMEMBER', [
      generateIfcGuid(),
      null, // OwnerHistory
      name,
      null, // Description
      null, // ObjectType
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
