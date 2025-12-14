/**
 * @fileoverview 線形要素（梁・柱・ブレース）のIFCエクスポーター
 * IFCExporterBaseを継承し、梁・柱・ブレースの出力機能を提供
 */

import { IFCExporterBase, generateIfcGuid } from './IFCExporterBase.js';

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
   */
  addBeam(beamData) {
    this._ensureInitialized();
    const w = this.writer;
    const {
      name = 'Beam',
      startPoint,
      endPoint,
      profile,
      rotation = 0,
      placementMode = 'center',
      sectionHeight = 0
    } = beamData;

    // 必須パラメータのチェック
    if (!startPoint || !endPoint || !profile) {
      console.warn(`[IFC Export] 梁 "${name}" をスキップ: 必須パラメータ（startPoint, endPoint, profile）が不足しています`);
      return null;
    }

    // 梁の長さを計算 (mm)
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // 長さが0の場合はスキップ
    if (length < 1e-6) {
      console.warn(`[IFC Export] 梁 "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // 梁の方向ベクトル
    const dirX = dx / length;
    const dirY = dy / length;
    const dirZ = dz / length;

    // プロファイルを作成
    const profileId = this._createProfileId(profile, false);
    if (profileId === null) {
      console.warn(`[IFC Export] 梁 "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`);
      return null;
    }

    // 梁のローカルY軸（せい方向=上方向）を計算
    // Three.js GeometryCalculator.calculateBeamBasis と同じロジック
    // 水平梁の場合、Y軸は鉛直上向きに近い方向
    let localYX, localYY, localYZ;
    if (Math.abs(dirZ) < 0.99) {
      // 水平に近い梁:
      // xAxis = globalUp × beamAxis（水平方向）
      // yAxis = beamAxis × xAxis（せい方向=上向き）
      // globalUp = (0, 0, 1)
      const crossX = 0 * dirZ - 1 * dirY;  // globalUp × dir
      const crossY = 1 * dirX - 0 * dirZ;
      const crossZ = 0 * dirY - 0 * dirX;
      const crossLen = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
      if (crossLen > 1e-6) {
        // ローカルX軸（梁軸と垂直、水平）
        const localXX = crossX / crossLen;
        const localXY = crossY / crossLen;
        const localXZ = crossZ / crossLen;
        // ローカルY軸 = 梁軸 × ローカルX軸（せい方向=上向き）
        localYX = dirY * localXZ - dirZ * localXY;
        localYY = dirZ * localXX - dirX * localXZ;
        localYZ = dirX * localXY - dirY * localXX;
      } else {
        localYX = 0;
        localYY = 0;
        localYZ = 1;
      }
    } else {
      // 垂直に近い梁: Y軸はグローバルY方向
      localYX = 0;
      localYY = 1;
      localYZ = 0;
    }

    // 天端基準配置の場合、配置点をローカルY軸方向に -sectionHeight/2 シフト
    let adjustedStartX = startPoint.x;
    let adjustedStartY = startPoint.y;
    let adjustedStartZ = startPoint.z;

    if (placementMode === 'top-aligned' && sectionHeight > 0 && isFinite(sectionHeight)) {
      const shift = -sectionHeight / 2;
      adjustedStartX += localYX * shift;
      adjustedStartY += localYY * shift;
      adjustedStartZ += localYZ * shift;
    }

    // 梁の配置点（天端基準調整後）(mm)
    const beamOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [adjustedStartX, adjustedStartY, adjustedStartZ]
    ]);

    // 梁の軸方向
    const beamAxisDir = w.createEntity('IFCDIRECTION', [[dirX, dirY, dirZ]]);

    // 梁のZ方向（上方向）- 梁軸と直交する方向を計算
    let baseRefDirX, baseRefDirY, baseRefDirZ;
    if (Math.abs(dirZ) < 0.99) {
      // 水平に近い梁: Z方向を参照方向とする
      const crossX = dirY * 1 - dirZ * 0;
      const crossY = dirZ * 0 - dirX * 1;
      const crossZ = dirX * 0 - dirY * 0;
      const crossLen = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
      if (crossLen > 1e-6) {
        baseRefDirX = crossX / crossLen;
        baseRefDirY = crossY / crossLen;
        baseRefDirZ = crossZ / crossLen;
      } else {
        baseRefDirX = 0;
        baseRefDirY = 0;
        baseRefDirZ = 1;
      }
    } else {
      // 垂直に近い梁: Y方向を参照方向とする
      baseRefDirX = 0;
      baseRefDirY = 1;
      baseRefDirZ = 0;
    }

    // 回転角度を適用（梁軸周りの回転）
    let refDirX = baseRefDirX;
    let refDirY = baseRefDirY;
    let refDirZ = baseRefDirZ;
    if (Math.abs(rotation) > 1e-6) {
      const rotationRad = (rotation * Math.PI) / 180;
      const cosR = Math.cos(rotationRad);
      const sinR = Math.sin(rotationRad);

      // 梁軸周りの回転（Rodrigues' rotation formula）
      // v' = v*cos(θ) + (k×v)*sin(θ) + k*(k·v)*(1-cos(θ))
      // k = (dirX, dirY, dirZ) が回転軸
      const dotKV = dirX * baseRefDirX + dirY * baseRefDirY + dirZ * baseRefDirZ;
      const crossKVX = dirY * baseRefDirZ - dirZ * baseRefDirY;
      const crossKVY = dirZ * baseRefDirX - dirX * baseRefDirZ;
      const crossKVZ = dirX * baseRefDirY - dirY * baseRefDirX;

      refDirX = baseRefDirX * cosR + crossKVX * sinR + dirX * dotKV * (1 - cosR);
      refDirY = baseRefDirY * cosR + crossKVY * sinR + dirY * dotKV * (1 - cosR);
      refDirZ = baseRefDirZ * cosR + crossKVZ * sinR + dirZ * dotKV * (1 - cosR);

      // 正規化
      const refLen = Math.sqrt(refDirX * refDirX + refDirY * refDirY + refDirZ * refDirZ);
      if (refLen > 1e-6) {
        refDirX /= refLen;
        refDirY /= refLen;
        refDirZ /= refLen;
      }
    }
    const beamRefDir = w.createEntity('IFCDIRECTION', [[refDirX, refDirY, refDirZ]]);

    // 梁の配置座標系
    const beamPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${beamOrigin}`,
      `#${beamAxisDir}`,
      `#${beamRefDir}`
    ]);

    // 梁のローカル配置
    const beamLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      `#${this._refs.storeyPlacement}`,
      `#${beamPlacement3D}`
    ]);

    // 押出方向（ローカル座標系のZ方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 押出用の配置（プロファイルの位置）
    const extrudeOrigin = w.createEntity('IFCCARTESIANPOINT', [[0.0, 0.0, 0.0]]);
    const extrudePlacement = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${extrudeOrigin}`,
      null,
      null
    ]);

    // 押出形状を作成 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      `#${extrudePlacement}`,
      `#${extrudeDir}`,
      length
    ]);

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,      // ContextOfItems
      'Body',                            // RepresentationIdentifier
      'SweptSolid',                      // RepresentationType
      [`#${solidId}`]                    // Items
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,                              // Name
      null,                              // Description
      [`#${shapeRep}`]                   // Representations
    ]);

    // 梁エンティティ
    const beamId = w.createEntity('IFCBEAM', [
      generateIfcGuid(),                 // GlobalId
      null,                              // OwnerHistory
      name,                              // Name
      null,                              // Description
      null,                              // ObjectType
      `#${beamLocalPlacement}`,          // ObjectPlacement
      `#${productShape}`,                // Representation
      null,                              // Tag
      '.BEAM.'                           // PredefinedType
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
      placementMode = 'center'
    } = beamData;

    // 必須パラメータのチェック
    if (!startPoint || !endPoint || !sections || sections.length < 2) {
      console.warn(`[IFC Export] テーパー梁 "${name}" をスキップ: 必須パラメータ（startPoint, endPoint, sections>=2）が不足しています`);
      return null;
    }

    // 各断面の頂点数をチェック
    const vertexCount = sections[0].vertices?.length;
    if (!vertexCount || vertexCount < 3) {
      console.warn(`[IFC Export] テーパー梁 "${name}" をスキップ: 断面の頂点が不足しています`);
      return null;
    }

    for (const section of sections) {
      if (!section.vertices || section.vertices.length !== vertexCount) {
        console.warn(`[IFC Export] テーパー梁 "${name}" をスキップ: 断面の頂点数が一致しません`);
        return null;
      }
    }

    // 梁の長さと方向を計算
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-6) {
      console.warn(`[IFC Export] テーパー梁 "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // 方向ベクトル（梁軸=Z軸方向）
    const dirX = dx / length;
    const dirY = dy / length;
    const dirZ = dz / length;

    // ローカル座標系の基底ベクトルを計算
    let localXX, localXY, localXZ;
    let localYX, localYY, localYZ;

    if (Math.abs(dirZ) < 0.99) {
      // 水平に近い梁
      const crossX = -dirY;
      const crossY = dirX;
      const crossZ = 0;
      const crossLen = Math.sqrt(crossX * crossX + crossY * crossY);
      if (crossLen > 1e-6) {
        localXX = crossX / crossLen;
        localXY = crossY / crossLen;
        localXZ = 0;
        // Y軸 = Z軸 × X軸
        localYX = dirY * localXZ - dirZ * localXY;
        localYY = dirZ * localXX - dirX * localXZ;
        localYZ = dirX * localXY - dirY * localXX;
      } else {
        localXX = 1; localXY = 0; localXZ = 0;
        localYX = 0; localYY = 0; localYZ = 1;
      }
    } else {
      // 垂直に近い梁
      localXX = 1; localXY = 0; localXZ = 0;
      localYX = 0; localYY = 1; localYZ = 0;
    }

    // 回転を適用
    if (Math.abs(rotation) > 1e-6) {
      const rotRad = (rotation * Math.PI) / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      const newXX = localXX * cosR + localYX * sinR;
      const newXY = localXY * cosR + localYY * sinR;
      const newXZ = localXZ * cosR + localYZ * sinR;
      const newYX = -localXX * sinR + localYX * cosR;
      const newYY = -localXY * sinR + localYY * cosR;
      const newYZ = -localXZ * sinR + localYZ * cosR;

      localXX = newXX; localXY = newXY; localXZ = newXZ;
      localYX = newYX; localYY = newYY; localYZ = newYZ;
    }

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
          [`#${currSection[i1]}`, `#${currSection[i2]}`, `#${nextSection[i2]}`, `#${nextSection[i1]}`]
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
      const loop = w.createEntity('IFCPOLYLOOP', [reversedPoints.map(id => `#${id}`)]);
      const bound = w.createEntity('IFCFACEOUTERBOUND', [`#${loop}`, '.T.']);
      const face = w.createEntity('IFCFACE', [[`#${bound}`]]);
      faceIds.push(face);
    }

    // 終端面（最後の断面）
    {
      const lastSection = pointIds[pointIds.length - 1];
      const loop = w.createEntity('IFCPOLYLOOP', [lastSection.map(id => `#${id}`)]);
      const bound = w.createEntity('IFCFACEOUTERBOUND', [`#${loop}`, '.T.']);
      const face = w.createEntity('IFCFACE', [[`#${bound}`]]);
      faceIds.push(face);
    }

    // IFCCLOSEDSHELLを作成
    const shellId = w.createEntity('IFCCLOSEDSHELL', [faceIds.map(id => `#${id}`)]);

    // IFCFACETEDBREPを作成
    const brepId = w.createEntity('IFCFACETEDBREP', [`#${shellId}`]);

    // 配置点
    const beamOrigin = w.createEntity('IFCCARTESIANPOINT', [[0, 0, 0]]);
    const beamPlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${beamOrigin}`,
      null,
      null
    ]);
    const beamLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      `#${this._refs.storeyPlacement}`,
      `#${beamPlacement3D}`
    ]);

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'Brep',
      [`#${brepId}`]
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`]
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
      '.BEAM.'
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
   */
  addColumn(columnData) {
    this._ensureInitialized();
    const w = this.writer;
    const { name = 'Column', bottomPoint, topPoint, profile, rotation = 0, isReferenceDirection = true } = columnData;

    // 必須パラメータのチェック
    if (!bottomPoint || !topPoint || !profile) {
      console.warn(`[IFC Export] 柱 "${name}" をスキップ: 必須パラメータ（bottomPoint, topPoint, profile）が不足しています`);
      return null;
    }

    // 柱の長さを計算 (mm)
    const dx = topPoint.x - bottomPoint.x;
    const dy = topPoint.y - bottomPoint.y;
    const dz = topPoint.z - bottomPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-6) {
      console.warn(`[IFC Export] 柱 "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // プロファイルを作成（Position は null）
    const profileId = this._createProfileId(profile, true);
    if (profileId === null) {
      console.warn(`[IFC Export] 柱 "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`);
      return null;
    }

    // 押出方向（垂直: Z方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 押出形状を作成 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      null,                // Position: デフォルト（原点）
      `#${extrudeDir}`,
      length
    ]);

    // 柱の配置点（底部）(mm)
    const columnOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [bottomPoint.x, bottomPoint.y, bottomPoint.z]
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
      `#${axisDir}`,       // Axis: Z方向
      `#${refDir}`         // RefDirection: 回転を反映
    ]);

    // 柱のローカル配置
    const columnLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null,                // PlacementRelTo: グローバル配置
      `#${columnPlacement3D}`
    ]);

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`]
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`]
    ]);

    // 柱エンティティ（PredefinedType は null でシンプルに）
    const columnId = w.createEntity('IFCCOLUMN', [
      generateIfcGuid(),
      null,                // OwnerHistory
      name,
      null,                // Description
      null,                // ObjectType
      `#${columnLocalPlacement}`,
      `#${productShape}`,
      null,                // Tag
      null                 // PredefinedType: null でシンプルに
    ]);

    // 柱を階に所属させる（底部Z座標で適切な階を決定）
    this._addToStorey(columnId, bottomPoint.z);

    return columnId;
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
   */
  addBrace(braceData) {
    this._ensureInitialized();
    const w = this.writer;
    const { name = 'Brace', startPoint, endPoint, profile, rotation = 0 } = braceData;

    // 必須パラメータのチェック
    if (!startPoint || !endPoint || !profile) {
      console.warn(`[IFC Export] ブレース "${name}" をスキップ: 必須パラメータ（startPoint, endPoint, profile）が不足しています`);
      return null;
    }

    // ブレースの長さを計算 (mm)
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 1e-6) {
      console.warn(`[IFC Export] ブレース "${name}" をスキップ: 長さが0です`);
      return null;
    }

    // ブレースの方向ベクトル（正規化）
    const dirX = dx / length;
    const dirY = dy / length;
    const dirZ = dz / length;

    // プロファイルを作成（シンプル版、Position = null）
    const profileId = this._createProfileId(profile, true);
    if (profileId === null) {
      console.warn(`[IFC Export] ブレース "${name}" をスキップ: 未対応のプロファイルタイプ "${profile.type}"`);
      return null;
    }

    // ブレースの配置点（始点）(mm)
    const braceOrigin = w.createEntity('IFCCARTESIANPOINT', [
      [startPoint.x, startPoint.y, startPoint.z]
    ]);

    // ブレースの軸方向（押出方向と同じ）
    const braceAxisDir = w.createEntity('IFCDIRECTION', [[dirX, dirY, dirZ]]);

    // 参照方向の計算（グローバルZ方向との外積、または垂直の場合はY方向）
    let baseRefDirX, baseRefDirY, baseRefDirZ;
    if (Math.abs(dirZ) < 0.99) {
      // 非垂直: グローバルZ方向との外積
      const crossX = dirY * 1 - dirZ * 0;
      const crossY = dirZ * 0 - dirX * 1;
      const crossZ = dirX * 0 - dirY * 0;
      const crossLen = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
      if (crossLen > 1e-6) {
        baseRefDirX = crossX / crossLen;
        baseRefDirY = crossY / crossLen;
        baseRefDirZ = crossZ / crossLen;
      } else {
        baseRefDirX = 0;
        baseRefDirY = 0;
        baseRefDirZ = 1;
      }
    } else {
      // ほぼ垂直: グローバルY方向を参照
      baseRefDirX = 0;
      baseRefDirY = 1;
      baseRefDirZ = 0;
    }

    // 回転角度を適用（ブレース軸周りの回転）
    let refDirX = baseRefDirX;
    let refDirY = baseRefDirY;
    let refDirZ = baseRefDirZ;
    if (Math.abs(rotation) > 1e-6) {
      const rotationRad = (rotation * Math.PI) / 180;
      const cosR = Math.cos(rotationRad);
      const sinR = Math.sin(rotationRad);

      // 軸周りの回転（Rodrigues' rotation formula）
      const dotKV = dirX * baseRefDirX + dirY * baseRefDirY + dirZ * baseRefDirZ;
      const crossKVX = dirY * baseRefDirZ - dirZ * baseRefDirY;
      const crossKVY = dirZ * baseRefDirX - dirX * baseRefDirZ;
      const crossKVZ = dirX * baseRefDirY - dirY * baseRefDirX;

      refDirX = baseRefDirX * cosR + crossKVX * sinR + dirX * dotKV * (1 - cosR);
      refDirY = baseRefDirY * cosR + crossKVY * sinR + dirY * dotKV * (1 - cosR);
      refDirZ = baseRefDirZ * cosR + crossKVZ * sinR + dirZ * dotKV * (1 - cosR);

      // 正規化
      const refLen = Math.sqrt(refDirX * refDirX + refDirY * refDirY + refDirZ * refDirZ);
      if (refLen > 1e-6) {
        refDirX /= refLen;
        refDirY /= refLen;
        refDirZ /= refLen;
      }
    }
    const braceRefDir = w.createEntity('IFCDIRECTION', [[refDirX, refDirY, refDirZ]]);

    // 配置座標系（始点、軸方向、参照方向）
    const bracePlacement3D = w.createEntity('IFCAXIS2PLACEMENT3D', [
      `#${braceOrigin}`,
      `#${braceAxisDir}`,
      `#${braceRefDir}`
    ]);

    // ローカル配置（グローバル基準）
    const braceLocalPlacement = w.createEntity('IFCLOCALPLACEMENT', [
      null,                // PlacementRelTo: グローバル配置
      `#${bracePlacement3D}`
    ]);

    // 押出方向（ローカル座標系のZ方向 = 軸方向）
    const extrudeDir = w.createEntity('IFCDIRECTION', [[0.0, 0.0, 1.0]]);

    // 押出形状 (mm)
    const solidId = w.createEntity('IFCEXTRUDEDAREASOLID', [
      `#${profileId}`,
      null,                // Position: デフォルト
      `#${extrudeDir}`,
      length
    ]);

    // 形状表現
    const shapeRep = w.createEntity('IFCSHAPEREPRESENTATION', [
      `#${this._refs.bodyContext}`,
      'Body',
      'SweptSolid',
      [`#${solidId}`]
    ]);

    // 製品定義形状
    const productShape = w.createEntity('IFCPRODUCTDEFINITIONSHAPE', [
      null,
      null,
      [`#${shapeRep}`]
    ]);

    // ブレースエンティティ（IFCMEMBER）
    const braceId = w.createEntity('IFCMEMBER', [
      generateIfcGuid(),
      null,                // OwnerHistory
      name,
      null,                // Description
      null,                // ObjectType
      `#${braceLocalPlacement}`,
      `#${productShape}`,
      null,                // Tag
      '.BRACE.'            // PredefinedType
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
      ...options
    });
  }
}

/**
 * 簡易エクスポート関数
 * @param {Object} beamData - 梁データ
 * @returns {string} IFCファイル内容
 */
export function exportSingleBeamToIFC(beamData) {
  const exporter = new IFCBeamExporter();
  exporter.addBeam(beamData);
  return exporter.generate();
}

// Re-export for backward compatibility
export { generateIfcGuid } from './IFCExporterBase.js';
