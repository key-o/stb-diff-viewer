/**
 * @fileoverview Stage 6: ハンチ検出（ジオメトリ解析）
 *
 * web-ifcのGetFlatMeshで取得したメッシュジオメトリから断面サンプリングを行い、
 * ハンチパターン（SLOPE/LEVEL/DROP）を分類する。
 * TaperedGeometryBuilder.js のパターン分類の逆解析。
 *
 * IFCEXTRUDEDAREASOLIDTAPERED が存在する場合は、始端・終端プロファイルを
 * 直接取得してメッシュ解析を省略する。
 *
 * @module HaunchDetector
 */

import * as WebIFC from 'web-ifc';
import { sampleCrossSections } from '../util/GeometrySampler.js';
import { extractStbSectionFromProfile } from '../mapping/IfcProfileToStbSection.js';

/** @typedef {'SAME'|'TAPER'|'HAUNCH_SLOPE'|'HAUNCH_LEVEL'|'HAUNCH_DROP'} HaunchPattern */

/**
 * ハンチ検出のデフォルト閾値
 */
const DEFAULT_THRESHOLDS = {
  /** 断面高さの一定断面判定許容差 (mm) */
  heightTolerance: 0.5,
  /** ハンチ最小高さ差 (mm) */
  minHeightDiff: 50,
  /** ハンチ最小長さ (mm) */
  minHaunchLength: 100,
  /** DROP判定：急変区間の最大長さ比率 */
  dropTransitionRatio: 0.02,
  /** サンプリング点数 */
  numSamples: 20,
};

export class HaunchDetector {
  /**
   * @param {Object} api - web-ifc IfcAPI
   * @param {number} modelID
   * @param {number} unitFactor - mm変換係数
   * @param {Object} [thresholds]
   */
  constructor(api, modelID, unitFactor, thresholds = {}) {
    this.api = api;
    this.modelID = modelID;
    this.unitFactor = unitFactor;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * 要素のハンチを検出する
   *
   * @param {number} expressID - IFC要素のexpressID
   * @param {number} representationRef - IFCPRODUCTDEFINITIONSHAPE の expressID
   * @param {number[]} axisDirection - ビーム軸方向 [dx,dy,dz] (正規化済み)
   * @param {number[]} origin - ビーム始点 (IFC単位) [ox,oy,oz]
   * @param {number} lengthMM - ビーム全長 (mm)
   * @returns {HaunchResult|null}
   */
  detect(expressID, representationRef, axisDirection, origin, lengthMM) {
    // 1. IFCEXTRUDEDAREASOLIDTAPERED チェック（メッシュ解析不要）
    const taperedResult = this._checkTaperedSolid(representationRef);
    if (taperedResult) return taperedResult;

    // 2. メッシュベースのサンプリング
    return this._detectFromMesh(expressID, axisDirection, origin, lengthMM);
  }

  /**
   * IFCEXTRUDEDAREASOLIDTAPERED から直接プロファイルを取得
   * @param {number} representationRef
   * @returns {HaunchResult|null}
   */
  _checkTaperedSolid(representationRef) {
    if (!representationRef) return null;

    const productShape = this.api.GetLine(this.modelID, representationRef);
    if (!productShape) return null;

    const representations = productShape.Representations || [];
    for (const repRef of representations) {
      const repId = repRef?.value ?? repRef;
      const rep = this.api.GetLine(this.modelID, repId);
      if (!rep) continue;

      const items = rep.Items || [];
      for (const itemRef of items) {
        const itemId = itemRef?.value ?? itemRef;
        const item = this.api.GetLine(this.modelID, itemId);
        if (!item) continue;

        // IFCEXTRUDEDAREASOLIDTAPERED (IFC4以降)
        if (item.type === WebIFC.IFCEXTRUDEDAREASOLIDTAPERED) {
          return this._handleTaperedSolid(item);
        }
      }
    }

    return null;
  }

  /**
   * IFCEXTRUDEDAREASOLIDTAPERED の始端・終端プロファイルを解析
   * @param {Object} item - web-ifc entity
   * @returns {HaunchResult|null}
   */
  _handleTaperedSolid(item) {
    // 始端プロファイル (SweptArea)
    const startRef = item.SweptArea?.value ?? item.SweptArea;
    if (!startRef) return null;
    const startEntity = this.api.GetLine(this.modelID, startRef);
    const startSection = extractStbSectionFromProfile(this.api, this.modelID, startEntity);

    // 終端プロファイル (EndSweptArea)
    const endRef = item.EndSweptArea?.value ?? item.EndSweptArea;
    if (!endRef) return null;
    const endEntity = this.api.GetLine(this.modelID, endRef);
    const endSection = extractStbSectionFromProfile(this.api, this.modelID, endEntity);

    if (!startSection || !endSection) return null;

    // 単位変換
    const convertParams = (params) => {
      const converted = {};
      for (const [key, value] of Object.entries(params)) {
        converted[key] = value * this.unitFactor;
      }
      return converted;
    };

    const startParams = convertParams(startSection.params);
    const endParams = convertParams(endSection.params);

    // 断面高さの比較（A パラメータ = せい）
    const startH = startParams.A || startParams.D || startParams.width_Y || 0;
    const endH = endParams.A || endParams.D || endParams.width_Y || 0;
    const diff = Math.abs(startH - endH);

    if (diff < this.thresholds.heightTolerance) {
      return { pattern: 'SAME', sections: null };
    }

    return {
      pattern: 'TAPER',
      sections: {
        start: { ...startSection, params: startParams },
        end: { ...endSection, params: endParams },
      },
    };
  }

  /**
   * メッシュジオメトリからの断面サンプリングによるハンチ検出
   * @param {number} expressID
   * @param {number[]} axisDirection
   * @param {number[]} origin - IFC単位
   * @param {number} lengthMM
   * @returns {HaunchResult|null}
   */
  _detectFromMesh(expressID, axisDirection, origin, lengthMM) {
    let vertexData, indexData;

    try {
      const flatMesh = this.api.GetFlatMesh(this.modelID, expressID);
      if (!flatMesh || flatMesh.geometries.size() === 0) return null;

      const placedGeom = flatMesh.geometries.get(0);
      const geomData = this.api.GetGeometry(this.modelID, placedGeom.geometryExpressID);

      vertexData = this.api.GetVertexArray(geomData.GetVertexData(), geomData.GetVertexDataSize());
      indexData = this.api.GetIndexArray(geomData.GetIndexData(), geomData.GetIndexDataSize());

      geomData.delete();
    } catch {
      return null;
    }

    if (!vertexData || vertexData.length < 18) return null;

    // IFC単位の長さでサンプリング
    const lengthIfc = lengthMM / this.unitFactor;
    const samples = sampleCrossSections(
      vertexData,
      indexData,
      axisDirection,
      origin,
      lengthIfc,
      this.thresholds.numSamples,
    );

    if (samples.length < 3) return null;

    // mm単位に変換
    const heightsMM = samples.map((s) => s.height * this.unitFactor);

    return this._classifyPattern(heightsMM, lengthMM);
  }

  /**
   * 断面高さ列からハンチパターンを分類
   *
   * TaperedGeometryBuilder の calculateSegmentBoundaries の逆解析:
   * - SAME: 全長で±heightTolerance以内
   * - TAPER: 始端から終端まで単調に変化（2断面テーパー）
   * - HAUNCH_SLOPE: 端部で線形変化、中央一定
   * - HAUNCH_LEVEL: 端部一定→急変→中央一定
   * - HAUNCH_DROP: LEVEL的だが急変区間が非常に短い
   *
   * @param {number[]} heights - 各サンプリング位置での断面高さ (mm)
   * @param {number} lengthMM - ビーム全長 (mm)
   * @returns {HaunchResult}
   */
  _classifyPattern(heights, lengthMM) {
    const n = heights.length;
    const { heightTolerance, minHeightDiff, minHaunchLength, dropTransitionRatio } =
      this.thresholds;

    // フィルタ：有効な値のみ
    const validHeights = heights.filter((h) => h > 0);
    if (validHeights.length < 3) return { pattern: 'SAME', sections: null };

    const maxH = Math.max(...validHeights);
    const minH = Math.min(...validHeights);
    const range = maxH - minH;

    // 一定断面判定
    if (range < heightTolerance) {
      return { pattern: 'SAME', sections: null };
    }

    // ハンチとして有意な差があるか
    if (range < minHeightDiff) {
      return { pattern: 'SAME', sections: null };
    }

    // 中央領域の断面高さを推定（中央40%の平均値）
    const midStart = Math.floor(n * 0.3);
    const midEnd = Math.ceil(n * 0.7);
    const midHeights = heights.slice(midStart, midEnd).filter((h) => h > 0);
    if (midHeights.length === 0) return { pattern: 'SAME', sections: null };
    const centerH = midHeights.reduce((a, b) => a + b, 0) / midHeights.length;

    // 始端・終端の高さ
    const startH = this._averageEdge(heights, 0, Math.min(3, n));
    const endH = this._averageEdge(heights, Math.max(0, n - 3), n);

    const startDiff = Math.abs(startH - centerH);
    const endDiff = Math.abs(endH - centerH);
    const hasStartHaunch = startDiff >= minHeightDiff;
    const hasEndHaunch = endDiff >= minHeightDiff;

    // 2断面テーパー: 始端から終端まで単調変化
    if (this._isMonotonic(heights, heightTolerance)) {
      return {
        pattern: 'TAPER',
        sections: {
          startHeight: startH,
          endHeight: endH,
        },
      };
    }

    // ハンチの詳細分析
    const result = { pattern: 'SAME', sections: null };

    if (hasStartHaunch || hasEndHaunch) {
      // ハンチ境界位置を検出
      const startBoundary = hasStartHaunch
        ? this._findTransitionBoundary(heights, 0, true, centerH, heightTolerance)
        : null;
      const endBoundary = hasEndHaunch
        ? this._findTransitionBoundary(heights, n - 1, false, centerH, heightTolerance)
        : null;

      const haunchStartMM = startBoundary !== null ? (startBoundary / (n - 1)) * lengthMM : 0;
      const haunchEndMM = endBoundary !== null ? ((n - 1 - endBoundary) / (n - 1)) * lengthMM : 0;

      // ハンチ長さの最小チェック
      const validStart = haunchStartMM >= minHaunchLength;
      const validEnd = haunchEndMM >= minHaunchLength;

      if (!validStart && !validEnd) {
        return { pattern: 'SAME', sections: null };
      }

      // ハンチ種別（SLOPE/LEVEL/DROP）の判定
      const startKind = validStart
        ? this._classifyHaunchKind(
            heights,
            0,
            startBoundary,
            centerH,
            lengthMM,
            dropTransitionRatio,
          )
        : 'SLOPE';
      const endKind = validEnd
        ? this._classifyHaunchKind(
            heights,
            n - 1,
            endBoundary,
            centerH,
            lengthMM,
            dropTransitionRatio,
          )
        : 'SLOPE';

      result.pattern = `HAUNCH_${startKind}`;
      result.sections = {
        centerHeight: centerH,
        startHeight: hasStartHaunch ? startH : centerH,
        endHeight: hasEndHaunch ? endH : centerH,
        haunchStart: validStart ? Math.round(haunchStartMM) : 0,
        haunchEnd: validEnd ? Math.round(haunchEndMM) : 0,
        kindStart: startKind,
        kindEnd: endKind,
      };
    }

    return result;
  }

  /**
   * 端部の平均断面高さ（ゼロ値を除外）
   */
  _averageEdge(heights, from, to) {
    const vals = heights.slice(from, to).filter((h) => h > 0);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  /**
   * 断面高さ列が単調に変化しているかチェック
   * @param {number[]} heights
   * @param {number} tolerance
   * @returns {boolean}
   */
  _isMonotonic(heights, tolerance) {
    const valid = heights.filter((h) => h > 0);
    if (valid.length < 3) return false;

    let increasing = 0;
    let decreasing = 0;

    for (let i = 1; i < valid.length; i++) {
      const diff = valid[i] - valid[i - 1];
      if (diff > tolerance) increasing++;
      else if (diff < -tolerance) decreasing++;
    }

    // ほぼ全区間が同方向に変化
    const total = valid.length - 1;
    return (
      (increasing >= total * 0.8 && decreasing === 0) ||
      (decreasing >= total * 0.8 && increasing === 0)
    );
  }

  /**
   * 端部からハンチ境界のインデックスを検出
   * @param {number[]} heights - 断面高さ配列
   * @param {number} edgeIdx - 端部インデックス (0 or n-1)
   * @param {boolean} fromStart - 始端側か
   * @param {number} centerH - 中央断面高さ
   * @param {number} tolerance
   * @returns {number|null} 境界インデックス
   */
  _findTransitionBoundary(heights, edgeIdx, fromStart, centerH, tolerance) {
    const n = heights.length;
    const step = fromStart ? 1 : -1;

    for (let i = edgeIdx; fromStart ? i < n : i >= 0; i += step) {
      if (heights[i] <= 0) continue;
      if (Math.abs(heights[i] - centerH) < tolerance) {
        return i;
      }
    }

    return null;
  }

  /**
   * ハンチ種別を分類（SLOPE / LEVEL / DROP）
   *
   * - SLOPE: 端部から中央へ滑らかに（線形に）変化
   * - LEVEL: 端部区間が一定値を保ち、中央との境界で急変
   * - DROP: LEVEL的だが遷移区間が極めて短い
   *
   * @param {number[]} heights
   * @param {number} edgeIdx
   * @param {number} boundaryIdx
   * @param {number} centerH
   * @param {number} lengthMM
   * @param {number} dropRatio
   * @returns {'SLOPE'|'LEVEL'|'DROP'}
   */
  _classifyHaunchKind(heights, edgeIdx, boundaryIdx, centerH, lengthMM, dropRatio) {
    if (boundaryIdx === null) return 'SLOPE';

    const start = Math.min(edgeIdx, boundaryIdx);
    const end = Math.max(edgeIdx, boundaryIdx);
    const span = end - start;

    if (span < 2) return 'DROP';

    // 端部区間内の高さ変化を分析
    const edgeH = heights[edgeIdx];
    const segHeights = heights.slice(start, end + 1).filter((h) => h > 0);

    if (segHeights.length < 2) return 'SLOPE';

    // 端部区間内で高さがほぼ一定かチェック
    const edgeRange = Math.max(...segHeights) - Math.min(...segHeights);
    const totalRange = Math.abs(edgeH - centerH);

    if (totalRange <= 0) return 'SLOPE';

    // 区間内の変化が全体変化の20%以下 → 端部は一定（LEVEL/DROP）
    if (edgeRange / totalRange < 0.2) {
      // 遷移が急激か判定
      const transitionSpan = span / heights.length;
      if (transitionSpan < dropRatio) return 'DROP';
      return 'LEVEL';
    }

    // それ以外は滑らかな変化
    return 'SLOPE';
  }
}

/**
 * @typedef {Object} HaunchResult
 * @property {HaunchPattern} pattern - 検出パターン
 * @property {Object|null} sections - 断面情報
 * @property {number} [sections.centerHeight] - 中央断面高さ (mm)
 * @property {number} [sections.startHeight] - 始端断面高さ (mm)
 * @property {number} [sections.endHeight] - 終端断面高さ (mm)
 * @property {number} [sections.haunchStart] - 始端ハンチ長さ (mm)
 * @property {number} [sections.haunchEnd] - 終端ハンチ長さ (mm)
 * @property {'SLOPE'|'LEVEL'|'DROP'} [sections.kindStart] - 始端ハンチ種別
 * @property {'SLOPE'|'LEVEL'|'DROP'} [sections.kindEnd] - 終端ハンチ種別
 */
