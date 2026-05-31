/**
 * @fileoverview Stage 4: IFC要素 → STB要素タイプ分類
 *
 * IFCエンティティを走査し、タイプ・配置・プロパティに基づいて
 * STB要素に分類する。
 *
 * @module ElementClassifier
 */

import * as WebIFC from 'web-ifc';
import {
  IFC_TO_STB_TYPE,
  STRUCTURAL_IFC_TYPES,
  IFC_TYPE_NAMES,
} from '../mapping/IfcToStbTypeMap.js';
import { RevitPropertyExtractor } from '../mapping/RevitPropertyExtractor.js';

export class ElementClassifier {
  /**
   * @param {Object} api - web-ifc IfcAPI
   * @param {number} modelID
   * @param {number} unitFactor
   */
  constructor(api, modelID, unitFactor) {
    this.api = api;
    this.modelID = modelID;
    this.unitFactor = unitFactor;
  }

  /**
   * 全構造要素を走査・分類
   * @returns {Array<Object>} 分類済み要素リスト
   */
  classify() {
    const materialMap = this._buildMaterialMap();
    const elements = [];

    for (const ifcType of STRUCTURAL_IFC_TYPES) {
      let ids;
      try {
        ids = this.api.GetLineIDsWithType(this.modelID, ifcType);
      } catch {
        continue;
      }

      for (let i = 0; i < ids.size(); i++) {
        const expressID = ids.get(i);
        const line = this.api.GetLine(this.modelID, expressID);
        const mapping = IFC_TO_STB_TYPE.get(ifcType);
        if (!mapping) continue;

        const objectType = line.ObjectType?.value || null;
        const name = line.Name?.value || null;
        const materialName = materialMap.get(expressID) || null;
        const revitProps = RevitPropertyExtractor.extractElementMetadata(line, materialName);
        const element = {
          expressID,
          ifcType,
          ifcTypeName: IFC_TYPE_NAMES.get(ifcType) || `TYPE_${ifcType}`,
          name,
          globalId: line.GlobalId?.value || null,
          objectType,
          typeName: revitProps.typeName,
          typeSignature: revitProps.typeSignature,
          materialName,
          sectionHint: revitProps.sectionHint,
          description: line.Description?.value || null,
          stbType: this._discriminateStbType(line, mapping, revitProps),
          stbCategory: mapping.stbCategory,
          kindStructure: revitProps.kindStructure,
          placementRef: line.ObjectPlacement?.value ?? line.ObjectPlacement ?? null,
          representationRef: line.Representation?.value ?? line.Representation ?? null,
        };

        elements.push(element);
      }
    }

    return elements;
  }

  /**
   * STBの具体的な要素タイプを判別する
   *
   * IFCCOLUMN → StbColumn / StbPost
   * IFCBEAM → StbGirder / StbBeam
   *
   * @param {Object} line - web-ifc GetLine 結果
   * @param {Object} mapping - IFC_TO_STB_TYPE エントリ
   * @param {Object} [revitProps]
   * @returns {string} STB要素タイプ名
   */
  _discriminateStbType(line, mapping, revitProps = null) {
    if (!mapping.alt) return mapping.default;

    const objectType = (line.ObjectType?.value || '').toLowerCase();
    const name = (line.Name?.value || '').toLowerCase();
    const predefinedType = line.PredefinedType?.value || '';
    const textValues = [
      line.ObjectType?.value || '',
      line.Name?.value || '',
      revitProps?.typeName || '',
      revitProps?.typeSignature || '',
    ];

    // Column vs Post vs FoundationColumn
    if (mapping.stbCategory === 'column') {
      if (
        objectType.includes('foundationcolumn') ||
        RevitPropertyExtractor.isFoundationColumn(textValues)
      ) {
        return 'StbFoundationColumn';
      }
      if (
        objectType.includes('間柱') ||
        objectType.includes('post') ||
        name.includes('間柱') ||
        name.includes('post') ||
        RevitPropertyExtractor.isPost(textValues) ||
        predefinedType === '.USERDEFINED.' ||
        predefinedType === 'USERDEFINED'
      ) {
        return mapping.alt; // StbPost
      }
      return mapping.default; // StbColumn
    }

    // Girder vs Beam
    if (mapping.stbCategory === 'beam') {
      if (
        objectType.includes('小梁') ||
        objectType.includes('secondary') ||
        name.includes('小梁') ||
        name.includes('sub beam') ||
        name.includes('subbeam') ||
        RevitPropertyExtractor.isSmallBeam(textValues) ||
        predefinedType === '.USERDEFINED.' ||
        predefinedType === 'USERDEFINED'
      ) {
        return mapping.alt; // StbBeam
      }
      return mapping.default; // StbGirder
    }

    return mapping.default;
  }

  /**
   * ObjectType・要素Name・材料名からkind_structureを抽出
   *
   * 判定優先順位:
   *   1. ObjectType（明示的に設定されている場合）
   *   2. 要素Name のプレフィックス（例: RC_B:..., S_C_H_roll:..., CFT_C_Box:...）
   *   3. 材料名（例: Fc21→RC, SS400→S）
   *   4. デフォルト 'S'
   *
   * @param {string|null} objectType
   * @param {string|null} name - IFC要素のName
   * @param {string|null} materialName - IFCRELASSOCIATESMATERIAL 経由の材料名
   * @returns {string} 'S' | 'RC' | 'SRC' | 'CFT'
   */
  _extractKindStructure(objectType, name, materialName) {
    if (objectType) {
      const upper = objectType.toUpperCase();
      if (upper === 'UNDEFINED') return 'UNDEFINED';
    }
    return RevitPropertyExtractor.extractKindStructure(
      [objectType, name].filter(Boolean),
      materialName,
    );
  }

  /**
   * Revit TypeName プレフィックスからkind_structureを推定
   * @param {string} name
   * @returns {string|null}
   */
  static _kindFromNamePrefix(name) {
    return RevitPropertyExtractor.kindFromTypeName(name);
  }

  /**
   * 材料名からkind_structureを推定
   * FC/Fc → RC (コンクリート), SS/SN/SM/STKR/BCR/BCP → S (鉄骨)
   * @param {string} materialName
   * @returns {string|null}
   */
  static _kindFromMaterial(materialName) {
    return RevitPropertyExtractor.kindFromMaterial(materialName);
  }

  /**
   * IFCRELASSOCIATESMATERIAL を走査して expressID → 材料名マップを構築
   * @returns {Map<number, string>}
   */
  _buildMaterialMap() {
    const map = new Map();
    let relIds;
    try {
      relIds = this.api.GetLineIDsWithType(this.modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
    } catch {
      return map;
    }

    for (let i = 0; i < relIds.size(); i++) {
      const rel = this.api.GetLine(this.modelID, relIds.get(i));
      if (!rel) continue;

      const materialRef = rel.RelatingMaterial?.value ?? rel.RelatingMaterial;
      if (!materialRef) continue;

      const materialName = this._resolveMaterialName(materialRef);

      if (!materialName) continue;

      const relatedObjects = rel.RelatedObjects;
      if (!relatedObjects) continue;
      for (const objRef of relatedObjects) {
        const objId = objRef?.value ?? objRef;
        if (typeof objId === 'number') {
          map.set(objId, materialName);
        }
      }
    }

    return map;
  }

  _resolveMaterialName(materialRef, seen = new Set()) {
    const materialId = materialRef?.value ?? materialRef;
    if (!materialId || seen.has(materialId)) return null;
    seen.add(materialId);

    let material;
    try {
      material = this.api.GetLine(this.modelID, materialId);
    } catch {
      return null;
    }

    if (!material) return null;
    if (material.Name?.value) return material.Name.value;

    const nestedRefs = [];
    const pushRef = (ref) => {
      const id = ref?.value ?? ref;
      if (id) nestedRefs.push(id);
    };

    pushRef(material.ForLayerSet);
    pushRef(material.ForProfileSet);
    pushRef(material.Material);

    for (const collectionName of [
      'Materials',
      'MaterialLayers',
      'MaterialProfiles',
      'MaterialConstituents',
    ]) {
      const collection = material[collectionName];
      if (!Array.isArray(collection)) continue;
      for (const itemRef of collection) {
        const itemId = itemRef?.value ?? itemRef;
        if (!itemId) continue;
        try {
          const item = this.api.GetLine(this.modelID, itemId);
          pushRef(item?.Material);
          pushRef(itemId);
        } catch {
          pushRef(itemId);
        }
      }
    }

    for (const nestedRef of nestedRefs) {
      const name = this._resolveMaterialName(nestedRef, seen);
      if (name) return name;
    }

    return null;
  }
}
