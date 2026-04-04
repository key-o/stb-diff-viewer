/**
 * @fileoverview Stage 5: 断面プロファイル解析
 *
 * IFC要素の表現(Representation)から断面プロファイルを抽出し、
 * STB断面情報に変換する。同一断面は重複排除して共有する。
 *
 * @module ProfileAnalyzer
 */

import * as WebIFC from 'web-ifc';
import {
  extractStbSectionFromProfile,
  buildSectionKey,
} from '../mapping/IfcProfileToStbSection.js';

export class ProfileAnalyzer {
  /**
   * @param {Object} api - web-ifc IfcAPI
   * @param {number} modelID
   * @param {number} unitFactor - mm変換係数
   */
  constructor(api, modelID, unitFactor) {
    this.api = api;
    this.modelID = modelID;
    this.unitFactor = unitFactor;

    /** @type {Map<string, Object>} sectionKey → section定義 */
    this.sectionMap = new Map();
    this.nextSectionId = 1;
  }

  /**
   * 要素のRepresentationからプロファイルを抽出し、断面IDを返す
   * @param {number} representationRef - IFCPRODUCTDEFINITIONSHAPE の expressID
   * @returns {{ sectionId: string, sectionInfo: Object, length: number } | null}
   */
  analyzeElement(representationRef) {
    if (!representationRef) return null;

    const productShape = this.api.GetLine(this.modelID, representationRef);
    if (!productShape) return null;

    const representations = productShape.Representations || [];

    for (const repRef of representations) {
      const repId = repRef?.value ?? repRef;
      const rep = this.api.GetLine(this.modelID, repId);
      if (!rep) continue;

      // Body表現を優先
      const repType = rep.RepresentationType?.value || '';
      const repId2 = rep.RepresentationIdentifier?.value || '';
      if (
        repId2 !== 'Body' &&
        repType !== 'SweptSolid' &&
        repType !== 'Brep' &&
        repType !== 'MappedRepresentation' &&
        repType !== 'Clipping'
      ) {
        continue;
      }

      const items = rep.Items || [];
      for (const itemRef of items) {
        const itemId = itemRef?.value ?? itemRef;
        const result = this._extractFromItem(itemId);
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * 表現アイテムからプロファイルと長さを再帰的に抽出
   * @param {number} itemId
   * @returns {{ sectionId: string, sectionInfo: Object, length: number } | null}
   */
  _extractFromItem(itemId) {
    const item = this.api.GetLine(this.modelID, itemId);
    if (!item) return null;

    // IFCEXTRUDEDAREASOLID
    if (item.type === WebIFC.IFCEXTRUDEDAREASOLID) {
      return this._handleExtrudedAreaSolid(item);
    }

    // IFCMAPPEDITEM → MappingSource → MappedRepresentation → 再帰
    if (item.type === WebIFC.IFCMAPPEDITEM) {
      const sourceRef = item.MappingSource?.value ?? item.MappingSource;
      if (sourceRef) {
        const source = this.api.GetLine(this.modelID, sourceRef);
        if (source) {
          const mappedRepRef = source.MappedRepresentation?.value ?? source.MappedRepresentation;
          if (mappedRepRef) {
            const mappedRep = this.api.GetLine(this.modelID, mappedRepRef);
            if (mappedRep?.Items) {
              for (const subRef of mappedRep.Items) {
                const subId = subRef?.value ?? subRef;
                const result = this._extractFromItem(subId);
                if (result) return result;
              }
            }
          }
        }
      }
    }

    // IFCBOOLEANCLIPPINGRESULT → FirstOperand を再帰
    if (item.type === WebIFC.IFCBOOLEANCLIPPINGRESULT) {
      const firstRef = item.FirstOperand?.value ?? item.FirstOperand;
      if (firstRef) return this._extractFromItem(firstRef);
    }

    return null;
  }

  /**
   * IFCEXTRUDEDAREASOLID からプロファイルと押出長さを抽出
   */
  _handleExtrudedAreaSolid(item) {
    // 押出長さ
    const depth = item.Depth?.value ?? item.Depth ?? 0;
    const lengthMM = depth * this.unitFactor;

    // SweptArea → プロファイル定義
    const sweptAreaRef = item.SweptArea?.value ?? item.SweptArea;
    if (!sweptAreaRef) return null;

    const profileEntity = this.api.GetLine(this.modelID, sweptAreaRef);
    if (!profileEntity) return null;

    const sectionInfo = extractStbSectionFromProfile(this.api, this.modelID, profileEntity);

    if (!sectionInfo) return null;

    // mm変換（IFC内の寸法値は長さ単位と同じ）
    const convertedParams = {};
    for (const [key, value] of Object.entries(sectionInfo.params)) {
      convertedParams[key] = value * this.unitFactor;
    }
    sectionInfo.params = convertedParams;

    // 正規化キーで重複排除
    const key = buildSectionKey(sectionInfo.stbType, convertedParams);
    if (!this.sectionMap.has(key)) {
      const sectionId = String(this.nextSectionId++);
      this.sectionMap.set(key, {
        id: sectionId,
        ...sectionInfo,
        params: convertedParams,
      });
    }

    const section = this.sectionMap.get(key);
    return {
      sectionId: section.id,
      sectionInfo: section,
      length: Math.round(lengthMM * 100) / 100,
    };
  }

  /**
   * 全断面定義を返す
   * @returns {Array<Object>}
   */
  getSections() {
    return [...this.sectionMap.values()];
  }
}
