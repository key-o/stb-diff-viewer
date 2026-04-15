/**
 * @fileoverview ブラウザ用 IFC → STB 変換オーケストレーター
 *
 * Node.js版 IfcToStbConverter のブラウザ対応版。
 * ArrayBuffer を受け取り、7段階パイプラインでSTB XMLを生成する。
 *
 * @module IfcToStbBrowserConverter
 */

import * as WebIFC from 'web-ifc';
import { IfcBrowserModelReader } from './IfcBrowserModelReader.js';
import { SpatialStructureExtractor } from './pipeline/SpatialStructureExtractor.js';
import { NodeReconstructor } from './pipeline/NodeReconstructor.js';
import { ElementClassifier } from './pipeline/ElementClassifier.js';
import { ProfileAnalyzer } from './pipeline/ProfileAnalyzer.js';
import { HaunchDetector } from './pipeline/HaunchDetector.js';
import { generateStbXml } from './pipeline/StbXmlGenerator.js';
import { resolvePlacement, extractPosition, transformPoint } from './util/CoordinateHelper.js';
import {
  calculateBeamBasis,
  dotProduct,
  crossProduct,
  normalizeVector,
} from '../data/geometry/vectorMath.js';

export class IfcToStbBrowserConverter {
  /**
   * @param {Object} [options]
   * @param {number} [options.nodeTolerance=1.0] - 節点マージ許容差 (mm)
   * @param {boolean} [options.enableHaunch=false] - ハンチ検出
   * @param {number} [options.haunchSamples=20] - ハンチサンプリング数
   * @param {function} [options.onProgress] - 進捗コールバック (message: string) => void
   */
  constructor(options = {}) {
    this.nodeTolerance = options.nodeTolerance ?? 1.0;
    this.enableHaunch = options.enableHaunch ?? false;
    this.haunchSamples = options.haunchSamples ?? 20;
    this.onProgress = options.onProgress || null;
    this.reader = new IfcBrowserModelReader();
    this.warnings = [];
  }

  /**
   * web-ifc を初期化
   * @param {string} [wasmPath='./wasm/'] - WASMパス
   */
  async init(wasmPath = './wasm/') {
    this._progress('IFCエンジンを初期化中...');
    await this.reader.init(wasmPath);
  }

  /**
   * ArrayBuffer からSTB XMLに変換
   * @param {ArrayBuffer} arrayBuffer - IFCファイルデータ
   * @returns {Promise<{xml: string, summary: Object}>}
   */
  async convert(arrayBuffer) {
    // Stage 1: IFC読み込み
    this._progress('IFCモデルを解析中...');
    const { api, modelID, schema, unitFactor } = await this.reader.load(arrayBuffer);

    // Stage 2: 階情報
    this._progress('階情報を抽出中...');
    const spatialExtractor = new SpatialStructureExtractor(api, modelID, unitFactor);
    const { stories, elementToStory } = spatialExtractor.extract();

    // Stage 3: 節点テーブル
    const nodeReconstructor = new NodeReconstructor(this.nodeTolerance);

    // Stage 4: 要素分類
    this._progress('構造要素を分類中...');
    const classifier = new ElementClassifier(api, modelID, unitFactor);
    const rawElements = classifier.classify();

    // Stage 5: プロファイル解析
    this._progress('断面を解析中...');
    const profileAnalyzer = new ProfileAnalyzer(api, modelID, unitFactor);

    // Stage 6: ハンチ検出（オプション）
    const haunchDetector = this.enableHaunch
      ? new HaunchDetector(api, modelID, unitFactor, {
          numSamples: this.haunchSamples,
        })
      : null;

    // Stage 3+5+6 統合
    const placementCache = new Map();
    const processedElements = [];
    let elementIdCounter = 1;

    // 開口マップ構築: wallExpressID → [openingInfo, ...]
    const wallOpeningMap = this._buildWallOpeningMap(api, modelID, unitFactor);

    for (const el of rawElements) {
      const processed = this._processElement(
        api,
        modelID,
        unitFactor,
        el,
        nodeReconstructor,
        profileAnalyzer,
        elementToStory,
        placementCache,
        elementIdCounter++,
        haunchDetector,
        wallOpeningMap,
      );
      if (processed) {
        processedElements.push(processed);
      }
    }

    const nodes = nodeReconstructor.getNodes();
    const sections = profileAnalyzer.getSections();

    // Stage 7: XML生成
    this._progress('STB形式に変換中...');
    const xml = generateStbXml({
      nodes,
      stories,
      elements: processedElements,
      sections,
      meta: { projectName: 'IFC-Converted' },
    });

    const summary = {
      schema,
      unitFactor,
      stories: stories.length,
      nodes: nodes.length,
      elements: processedElements.length,
      sections: sections.length,
      elementsByType: this._countByType(processedElements),
      warnings: this.warnings,
    };

    return { xml, summary, schema };
  }

  /**
   * リソース解放
   */
  close() {
    this.reader.close();
  }

  _processElement(
    api,
    modelID,
    unitFactor,
    el,
    nodeReconstructor,
    profileAnalyzer,
    elementToStory,
    placementCache,
    elementId,
    haunchDetector,
    wallOpeningMap = new Map(),
  ) {
    if (['column', 'beam', 'brace', 'pile'].includes(el.stbCategory)) {
      return this._processLinearElement(
        api,
        modelID,
        unitFactor,
        el,
        nodeReconstructor,
        profileAnalyzer,
        elementToStory,
        placementCache,
        elementId,
        haunchDetector,
      );
    }
    if (el.stbCategory === 'wall') {
      return this._processWallElement(
        api,
        modelID,
        unitFactor,
        el,
        nodeReconstructor,
        elementToStory,
        placementCache,
        elementId,
        wallOpeningMap,
      );
    }
    if (el.stbCategory === 'slab') {
      return this._processSlabElement(
        api,
        modelID,
        unitFactor,
        el,
        nodeReconstructor,
        profileAnalyzer,
        elementToStory,
        placementCache,
        elementId,
      );
    }
    return this._processSimpleElement(
      api,
      modelID,
      unitFactor,
      el,
      nodeReconstructor,
      profileAnalyzer,
      elementToStory,
      placementCache,
      elementId,
    );
  }

  _processLinearElement(
    api,
    modelID,
    unitFactor,
    el,
    nodeReconstructor,
    profileAnalyzer,
    elementToStory,
    placementCache,
    elementId,
    haunchDetector,
  ) {
    if (!el.placementRef) return null;

    const worldMatrix = resolvePlacement(api, modelID, el.placementRef, placementCache);
    const origin = extractPosition(worldMatrix);
    const pileMeta = el.stbCategory === 'pile' ? this._parsePileMetadata(el.description) : null;
    const analyzedProfile = profileAnalyzer.analyzeElement(
      el.representationRef,
      pileMeta ? { skipSectionRegistration: true } : {},
    );
    const profileResult =
      el.stbCategory === 'pile' && pileMeta
        ? this._buildPileProfileResult(profileAnalyzer, pileMeta, analyzedProfile)
        : analyzedProfile;
    const length = profileResult?.length || analyzedProfile?.length || 0;

    const dirX = worldMatrix[8];
    const dirY = worldMatrix[9];
    const dirZ = worldMatrix[10];

    const startPt = {
      x: origin.x * unitFactor,
      y: origin.y * unitFactor,
      z: origin.z * unitFactor,
    };
    const endPt = {
      x: (origin.x + dirX * (length / unitFactor)) * unitFactor,
      y: (origin.y + dirY * (length / unitFactor)) * unitFactor,
      z: (origin.z + dirZ * (length / unitFactor)) * unitFactor,
    };

    const nodeStart = nodeReconstructor.addOrGet(startPt.x, startPt.y, startPt.z);
    const nodeEnd = nodeReconstructor.addOrGet(endPt.x, endPt.y, endPt.z);

    let haunch = null;
    if (haunchDetector && el.stbCategory === 'beam') {
      const dirNorm = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
      const axisDir = dirNorm > 0 ? [dirX / dirNorm, dirY / dirNorm, dirZ / dirNorm] : [0, 0, 1];
      const originArr = [origin.x, origin.y, origin.z];
      const haunchResult = haunchDetector.detect(
        el.expressID,
        el.representationRef,
        axisDir,
        originArr,
        length,
      );
      if (haunchResult && haunchResult.pattern !== 'SAME') {
        haunch = haunchResult;
      }
    }

    const rotate = this._extractRotation(worldMatrix, el.stbCategory);
    const kindStructure = this._resolveLinearKindStructure(el, profileResult);

    return {
      id: String(elementId),
      stbType: el.stbType,
      stbCategory: el.stbCategory,
      name: el.name || `${el.stbType}-${elementId}`,
      nodeStart,
      nodeEnd,
      sectionId: profileResult?.sectionId || null,
      storyId: elementToStory.get(el.expressID) || null,
      kindStructure,
      rotate,
      haunch,
      ...(el.stbCategory === 'pile'
        ? this._buildPileAttrs(startPt, endPt, nodeStart, nodeEnd, length, pileMeta)
        : {}),
    };
  }

  _processSurfaceElement(
    api,
    modelID,
    unitFactor,
    el,
    nodeReconstructor,
    profileAnalyzer,
    elementToStory,
    placementCache,
    elementId,
  ) {
    if (!el.placementRef) return null;

    const worldMatrix = resolvePlacement(api, modelID, el.placementRef, placementCache);
    const origin = extractPosition(worldMatrix);
    const profileResult = profileAnalyzer.analyzeElement(el.representationRef);

    const nodeId = nodeReconstructor.addOrGet(
      origin.x * unitFactor,
      origin.y * unitFactor,
      origin.z * unitFactor,
    );

    return {
      id: String(elementId),
      stbType: el.stbType,
      stbCategory: el.stbCategory,
      name: el.name || `${el.stbType}-${elementId}`,
      nodeIds: [nodeId],
      sectionId: profileResult?.sectionId || null,
      storyId: elementToStory.get(el.expressID) || null,
    };
  }

  _processSimpleElement(
    api,
    modelID,
    unitFactor,
    el,
    nodeReconstructor,
    profileAnalyzer,
    elementToStory,
    placementCache,
    elementId,
  ) {
    if (!el.placementRef) return null;

    const worldMatrix = resolvePlacement(api, modelID, el.placementRef, placementCache);
    const origin = extractPosition(worldMatrix);
    const profileResult = profileAnalyzer.analyzeElement(el.representationRef);

    const nodeStart = nodeReconstructor.addOrGet(
      origin.x * unitFactor,
      origin.y * unitFactor,
      origin.z * unitFactor,
    );

    return {
      id: String(elementId),
      stbType: el.stbType,
      stbCategory: el.stbCategory,
      name: el.name || `${el.stbType}-${elementId}`,
      nodeStart,
      nodeEnd: nodeStart,
      sectionId: profileResult?.sectionId || null,
      storyId: elementToStory.get(el.expressID) || null,
    };
  }

  /**
   * 壁要素の処理: 4コーナーノードを復元し開口を付与
   */
  _processWallElement(
    api,
    modelID,
    unitFactor,
    el,
    nodeReconstructor,
    elementToStory,
    placementCache,
    elementId,
    wallOpeningMap,
  ) {
    if (!el.placementRef) return null;

    const worldMatrix = resolvePlacement(api, modelID, el.placementRef, placementCache);
    const origin = extractPosition(worldMatrix);

    // RefDirection（壁方向 = ローカルX軸）
    const refDirX = worldMatrix[0];
    const refDirY = worldMatrix[1];
    const refLen = Math.sqrt(refDirX * refDirX + refDirY * refDirY) || 1;
    const dirX = refDirX / refLen;
    const dirY = refDirY / refLen;

    const { wallLength, height } = this._extractWallDimensions(
      api,
      modelID,
      unitFactor,
      el.representationRef,
    );

    if (!wallLength || !height) {
      const nodeId = nodeReconstructor.addOrGet(
        origin.x * unitFactor,
        origin.y * unitFactor,
        origin.z * unitFactor,
      );
      return {
        id: String(elementId),
        stbType: el.stbType,
        stbCategory: el.stbCategory,
        name: el.name || `${el.stbType}-${elementId}`,
        nodeIds: [nodeId],
        sectionId: null,
        storyId: elementToStory.get(el.expressID) || null,
        kindStructure: el.kindStructure || 'RC',
        openings: [],
      };
    }

    const cx = origin.x * unitFactor;
    const cy = origin.y * unitFactor;
    const cz = origin.z * unitFactor;
    const halfLen = wallLength / 2;

    const startX = cx - dirX * halfLen;
    const startY = cy - dirY * halfLen;
    const endX = cx + dirX * halfLen;
    const endY = cy + dirY * halfLen;

    const n1 = nodeReconstructor.addOrGet(startX, startY, cz);
    const n2 = nodeReconstructor.addOrGet(endX, endY, cz);
    const n3 = nodeReconstructor.addOrGet(endX, endY, cz + height);
    const n4 = nodeReconstructor.addOrGet(startX, startY, cz + height);

    const openings = (wallOpeningMap.get(el.expressID) || []).map((op, idx) => ({
      id: String(elementId * 1000 + idx + 1),
      name: op.name || `Opening_${elementId}_${idx + 1}`,
      wallId: String(elementId),
      positionX: Math.round((op.localX - op.width / 2 + wallLength / 2) * 100) / 100,
      positionY: Math.round(op.positionY * 100) / 100,
      width: Math.round(op.width * 100) / 100,
      height: Math.round(op.height * 100) / 100,
      rotate: 0,
    }));

    return {
      id: String(elementId),
      stbType: el.stbType,
      stbCategory: el.stbCategory,
      name: el.name || `${el.stbType}-${elementId}`,
      nodeIds: [n1, n2, n3, n4],
      sectionId: null,
      storyId: elementToStory.get(el.expressID) || null,
      kindStructure: el.kindStructure || 'RC',
      openings,
    };
  }

  /**
   * IFC表現から壁の長さ・高さを抽出
   */
  _extractWallDimensions(api, modelID, unitFactor, representationRef) {
    if (!representationRef) return {};
    const productShape = api.GetLine(modelID, representationRef);
    if (!productShape?.Representations) return {};

    for (const repRef of productShape.Representations) {
      const repId = repRef?.value ?? repRef;
      const rep = api.GetLine(modelID, repId);
      if (!rep?.Items) continue;

      for (const itemRef of rep.Items) {
        const itemId = itemRef?.value ?? itemRef;
        const item = api.GetLine(modelID, itemId);
        if (!item || item.type !== WebIFC.IFCEXTRUDEDAREASOLID) continue;

        const depth = item.Depth?.value ?? item.Depth ?? 0;
        const height = Math.round(depth * unitFactor * 100) / 100;

        const sweptAreaRef = item.SweptArea?.value ?? item.SweptArea;
        if (!sweptAreaRef) continue;
        const profile = api.GetLine(modelID, sweptAreaRef);
        if (!profile || profile.type !== WebIFC.IFCRECTANGLEPROFILEDEF) continue;

        const xDim = (profile.XDim?.value ?? profile.XDim ?? 0) * unitFactor;
        const yDim = (profile.YDim?.value ?? profile.YDim ?? 0) * unitFactor;
        return {
          wallLength: Math.round(xDim * 100) / 100,
          height,
          thickness: Math.round(yDim * 100) / 100,
        };
      }
    }
    return {};
  }

  /**
   * スラブ要素の処理: プロファイル多角形から複数ノードを復元
   */
  _processSlabElement(
    api,
    modelID,
    unitFactor,
    el,
    nodeReconstructor,
    profileAnalyzer,
    elementToStory,
    placementCache,
    elementId,
  ) {
    if (!el.placementRef) return null;

    const worldMatrix = resolvePlacement(api, modelID, el.placementRef, placementCache);
    const profileResult = profileAnalyzer.analyzeElement(el.representationRef);

    const vertices = this._extractSlabVertices(
      api,
      modelID,
      unitFactor,
      el.representationRef,
      worldMatrix,
    );
    if (!vertices || vertices.length < 3) return null;

    const nodeIds = vertices.map((v) => nodeReconstructor.addOrGet(v.x, v.y, v.z));

    return {
      id: String(elementId),
      stbType: el.stbType,
      stbCategory: el.stbCategory,
      name: el.name || `${el.stbType}-${elementId}`,
      nodeIds,
      sectionId: profileResult?.sectionId || null,
      storyId: elementToStory.get(el.expressID) || null,
      kindStructure: el.kindStructure || 'RC',
    };
  }

  /**
   * IFC表現からスラブの平面頂点列をワールド座標で返す
   * @returns {Array<{x,y,z}>|null}
   */
  _extractSlabVertices(api, modelID, unitFactor, representationRef, worldMatrix) {
    if (!representationRef) return null;
    const productShape = api.GetLine(modelID, representationRef);
    if (!productShape?.Representations) return null;

    for (const repRef of productShape.Representations) {
      const repId = repRef?.value ?? repRef;
      const rep = api.GetLine(modelID, repId);
      if (!rep?.Items) continue;

      for (const itemRef of rep.Items) {
        const itemId = itemRef?.value ?? itemRef;
        const item = api.GetLine(modelID, itemId);
        if (!item || item.type !== WebIFC.IFCEXTRUDEDAREASOLID) continue;

        const sweptAreaRef = item.SweptArea?.value ?? item.SweptArea;
        if (!sweptAreaRef) continue;
        const profile = api.GetLine(modelID, sweptAreaRef);
        if (!profile) continue;

        let localPoints = [];

        if (profile.type === WebIFC.IFCARBITRARYCLOSEDPROFILEDEF) {
          const curveRef = profile.OuterCurve?.value ?? profile.OuterCurve;
          if (curveRef) {
            const curve = api.GetLine(modelID, curveRef);
            if (curve?.Points) {
              for (const ptRef of curve.Points) {
                const ptId = ptRef?.value ?? ptRef;
                const pt = api.GetLine(modelID, ptId);
                const coords = pt?.Coordinates;
                if (coords) {
                  localPoints.push({
                    x: coords[0]?.value ?? coords[0] ?? 0,
                    y: coords[1]?.value ?? coords[1] ?? 0,
                    z: 0,
                  });
                }
              }
            }
          }
        } else if (profile.type === WebIFC.IFCRECTANGLEPROFILEDEF) {
          const hx = (profile.XDim?.value ?? profile.XDim ?? 0) / 2;
          const hy = (profile.YDim?.value ?? profile.YDim ?? 0) / 2;
          localPoints = [
            { x: -hx, y: -hy, z: 0 },
            { x: hx, y: -hy, z: 0 },
            { x: hx, y: hy, z: 0 },
            { x: -hx, y: hy, z: 0 },
          ];
        }

        if (localPoints.length >= 3) {
          return localPoints.map((p) => {
            const w = transformPoint(p, worldMatrix);
            return {
              x: w.x * unitFactor,
              y: w.y * unitFactor,
              z: w.z * unitFactor,
            };
          });
        }
      }
    }
    return null;
  }

  /**
   * IFCRELVOIDSELEMENT を解析して壁ID → 開口情報リストのマップを構築
   * @returns {Map<number, Array>}
   */
  _buildWallOpeningMap(api, modelID, unitFactor) {
    const map = new Map();
    let voidIds;
    try {
      voidIds = api.GetLineIDsWithType(modelID, WebIFC.IFCRELVOIDSELEMENT);
    } catch {
      return map;
    }

    for (let i = 0; i < voidIds.size(); i++) {
      const rel = api.GetLine(modelID, voidIds.get(i));
      if (!rel) continue;

      const wallRef = rel.RelatingBuildingElement?.value ?? rel.RelatingBuildingElement;
      const openingRef = rel.RelatedOpeningElement?.value ?? rel.RelatedOpeningElement;
      if (!wallRef || !openingRef) continue;

      const openingEl = api.GetLine(modelID, openingRef);
      if (!openingEl) continue;

      const openingInfo = this._extractOpeningInfo(api, modelID, unitFactor, openingEl);
      if (!openingInfo) continue;

      if (!map.has(wallRef)) map.set(wallRef, []);
      map.get(wallRef).push(openingInfo);
    }
    return map;
  }

  /**
   * IFCOPENINGELEMENT から開口情報を抽出（壁ローカル座標系）
   */
  _extractOpeningInfo(api, modelID, unitFactor, openingEl) {
    const name = openingEl.Name?.value || null;
    const repRef = openingEl.Representation?.value ?? openingEl.Representation;
    if (!repRef) return null;

    const productShape = api.GetLine(modelID, repRef);
    if (!productShape?.Representations) return null;

    for (const repItemRef of productShape.Representations) {
      const repId = repItemRef?.value ?? repItemRef;
      const rep = api.GetLine(modelID, repId);
      if (!rep?.Items) continue;

      for (const itemRef of rep.Items) {
        const itemId = itemRef?.value ?? itemRef;
        const item = api.GetLine(modelID, itemId);
        if (!item || item.type !== WebIFC.IFCEXTRUDEDAREASOLID) continue;

        const depth = item.Depth?.value ?? item.Depth ?? 0;
        const openingHeight = depth * unitFactor;

        const sweptAreaRef = item.SweptArea?.value ?? item.SweptArea;
        if (!sweptAreaRef) continue;
        const profile = api.GetLine(modelID, sweptAreaRef);
        if (!profile || profile.type !== WebIFC.IFCRECTANGLEPROFILEDEF) continue;

        const openingWidth = (profile.XDim?.value ?? profile.XDim ?? 0) * unitFactor;

        const placementRef = openingEl.ObjectPlacement?.value ?? openingEl.ObjectPlacement;
        let localX = 0,
          localZ = 0;
        if (placementRef) {
          const placement = api.GetLine(modelID, placementRef);
          const relPlacement = placement?.RelativePlacement;
          if (relPlacement) {
            const axisId = relPlacement?.value ?? relPlacement;
            const axis = api.GetLine(modelID, axisId);
            const loc = axis?.Location;
            if (loc) {
              const locId = loc?.value ?? loc;
              const point = api.GetLine(modelID, locId);
              const coords = point?.Coordinates;
              if (coords) {
                localX = (coords[0]?.value ?? coords[0] ?? 0) * unitFactor;
                localZ = (coords[2]?.value ?? coords[2] ?? 0) * unitFactor;
              }
            }
          }
        }

        return {
          name,
          localX,
          positionY: localZ,
          width: Math.round(openingWidth * 100) / 100,
          height: Math.round(openingHeight * 100) / 100,
        };
      }
    }
    return null;
  }

  /**
   * ワールド変換行列から断面回転角度（度）を復元
   * column-major 4x4行列: X軸=[m0,m1,m2], Y軸=[m4,m5,m6], Z軸=[m8,m9,m10]
   * @param {number[]} m - 16要素 column-major 行列
   * @param {string} category - 'column' | 'beam' | 'brace'
   * @returns {number} 回転角度（度）
   */
  _extractRotation(m, category) {
    const dirX = m[8];
    const dirY = m[9];
    const dirZ = m[10];
    const refX = m[0];
    const refY = m[1];
    const refZ = m[2];

    if (category === 'column') {
      const angle = Math.atan2(refY, refX) * (180 / Math.PI);
      return Math.round(angle * 1000) / 1000;
    }

    const dir = normalizeVector({ x: dirX, y: dirY, z: dirZ });
    const basis = calculateBeamBasis(dir);
    const defaultX = basis.xAxis;
    const actualRef = normalizeVector({ x: refX, y: refY, z: refZ });

    const crossed = crossProduct(defaultX, actualRef);
    const sinAngle = dotProduct(crossed, dir);
    const cosAngle = dotProduct(defaultX, actualRef);
    const angle = Math.atan2(sinAngle, cosAngle) * (180 / Math.PI);
    return Math.round(angle * 1000) / 1000;
  }

  _resolveLinearKindStructure(el, profileResult) {
    if (el.stbCategory === 'pile') {
      const profileType = profileResult?.sectionInfo?.stbType;
      if (profileType === 'PILE_RC' || profileType === 'CIRCLE') return 'RC';
      if (profileType === 'PILE_S' || profileType === 'PIPE') return 'S';
      if (profileType === 'PILE_PRODUCT') return 'PC';
    }
    return el.kindStructure || 'S';
  }

  _buildPileAttrs(startPt, endPt, nodeStart, nodeEnd, length, pileMeta = null) {
    const isStartTop = startPt.z >= endPt.z;
    const elementMeta = pileMeta?.element || null;
    const lengthAll = this._toFiniteNumber(elementMeta?.length_all) ?? Math.round(length * 100) / 100;
    const kindPile = elementMeta?.kind_pile || 'CAST_IN_PLACE';

    if (elementMeta?.format === '1node') {
      return {
        pileFormat: '1node',
        nodeSingle: isStartTop ? nodeStart : nodeEnd,
        levelTop: this._toFiniteNumber(elementMeta.level_top) ?? (isStartTop ? startPt.z : endPt.z),
        lengthAll,
        offsetX: this._toFiniteNumber(elementMeta.offset_X) ?? 0,
        offsetY: this._toFiniteNumber(elementMeta.offset_Y) ?? 0,
        kindPile,
      };
    }

    return {
      pileFormat: '2node',
      nodeBottom: isStartTop ? nodeEnd : nodeStart,
      nodeTop: isStartTop ? nodeStart : nodeEnd,
      lengthAll,
      kindPile,
    };
  }

  _parsePileMetadata(description) {
    if (typeof description !== 'string' || !description.startsWith('STBPILE_META:')) {
      return null;
    }

    try {
      return JSON.parse(description.slice('STBPILE_META:'.length));
    } catch {
      return null;
    }
  }

  _buildPileProfileResult(profileAnalyzer, pileMeta, analyzedProfile) {
    const sectionMeta = pileMeta?.section;
    if (!sectionMeta) return analyzedProfile;

    const sectionInfo = {
      stbType: sectionMeta.stbType || analyzedProfile?.sectionInfo?.stbType || 'PILE_RC',
      name: sectionMeta.name || 'Pile',
      pileTagName: sectionMeta.pileTagName || null,
      pileType: sectionMeta.pileType || null,
      params: { ...(sectionMeta.params || {}) },
      segments: Array.isArray(sectionMeta.segments) ? [...sectionMeta.segments] : null,
      sectionKey: JSON.stringify({
        stbType: sectionMeta.stbType || 'PILE_RC',
        name: sectionMeta.name || 'Pile',
        pileTagName: sectionMeta.pileTagName || null,
        params: Object.fromEntries(
          Object.entries(sectionMeta.params || {}).sort(([a], [b]) => a.localeCompare(b)),
        ),
        segments: Array.isArray(sectionMeta.segments)
          ? sectionMeta.segments.map((segment) =>
              Object.fromEntries(
                Object.entries(segment)
                  .filter(([, value]) => value !== undefined)
                  .sort(([a], [b]) => a.localeCompare(b)),
              ),
            )
          : null,
      }),
    };

    const registered = profileAnalyzer.registerSection(sectionInfo);
    return {
      sectionId: registered?.id || null,
      sectionInfo: registered || sectionInfo,
      length: analyzedProfile?.length || 0,
    };
  }

  _toFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  _countByType(elements) {
    const counts = {};
    for (const el of elements) {
      counts[el.stbType] = (counts[el.stbType] || 0) + 1;
    }
    return counts;
  }

  _progress(message) {
    if (this.onProgress) this.onProgress(message);
  }
}
