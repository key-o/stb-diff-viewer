/**
 * @fileoverview Stage 2: 空間構造（階情報）抽出
 *
 * IFCBUILDINGSTOREY から階名・標高を取得し、
 * IFCRELCONTAINEDINSPATIALSTRUCTURE で要素→階のマッピングを構築する。
 *
 * @module SpatialStructureExtractor
 */

import * as WebIFC from 'web-ifc';

export class SpatialStructureExtractor {
  /**
   * @param {Object} api - web-ifc IfcAPI
   * @param {number} modelID
   * @param {number} unitFactor - mm変換係数
   */
  constructor(api, modelID, unitFactor) {
    this.api = api;
    this.modelID = modelID;
    this.unitFactor = unitFactor;
  }

  /**
   * 階情報を抽出
   * @returns {{ stories: Array, elementToStory: Map<number, string> }}
   */
  extract() {
    const rawStoreys = this._getStoreys();

    // 標高でソート
    rawStoreys.sort((a, b) => a.elevation - b.elevation);

    // STB形式の階データを生成
    const stories = rawStoreys.map((s, idx) => ({
      id: String(idx + 1),
      name: s.name || `${idx + 1}FL`,
      height: Math.round(s.elevation * this.unitFactor * 100) / 100,
      kind: 'GENERAL',
      _expressID: s.expressID, // 内部参照用
    }));

    // 要素expressID → 階IDのマッピング
    const elementToStory = this._buildElementToStoryMap(rawStoreys, stories);

    return { stories, elementToStory };
  }

  /**
   * IFCBUILDINGSTOREY 一覧を取得
   */
  _getStoreys() {
    const storeys = [];
    const ids = this.api.GetLineIDsWithType(this.modelID, WebIFC.IFCBUILDINGSTOREY);

    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i);
      const line = this.api.GetLine(this.modelID, id);
      storeys.push({
        expressID: id,
        name: line.Name?.value || line.LongName?.value || null,
        elevation: line.Elevation?.value ?? 0,
      });
    }

    return storeys;
  }

  /**
   * IFCRELCONTAINEDINSPATIALSTRUCTURE から要素→階マッピングを構築
   */
  _buildElementToStoryMap(rawStoreys, stories) {
    const map = new Map();

    // expressID → STB story ID のマップ
    const storeyIdMap = new Map();
    for (let i = 0; i < rawStoreys.length; i++) {
      storeyIdMap.set(rawStoreys[i].expressID, stories[i].id);
    }

    const relIds = this.api.GetLineIDsWithType(
      this.modelID,
      WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
    );

    for (let i = 0; i < relIds.size(); i++) {
      const rel = this.api.GetLine(this.modelID, relIds.get(i));
      const structureRef = rel.RelatingStructure;
      const structureId = structureRef?.value ?? structureRef;
      const storyId = storeyIdMap.get(structureId);
      if (!storyId) continue;

      const elements = rel.RelatedElements || [];
      for (const elemRef of elements) {
        const elemId = elemRef?.value ?? elemRef;
        if (elemId) map.set(elemId, storyId);
      }
    }

    return map;
  }
}
