/**
 * @fileoverview 荷重表示マネージャー
 *
 * STB計算データの荷重を3Dビューに矢印とラベルで可視化するモジュールです。
 *
 * 機能:
 * - 部材荷重の矢印表示
 * - 荷重値のラベル表示（CSS2DObject）
 * - 等分布荷重の複数矢印表示
 * - 集中荷重の単一矢印表示
 * - 荷重値に応じた自動スケーリング
 * - 荷重ケース別の色分け
 * - 表示モード切替（arrow/label/both/none）
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  LOAD_TYPES,
  getLoadCaseColor,
} from '../../common-stb/import/extractor/StbCalDataExtractor.js';

/**
 * 表示モード
 */
export const LOAD_DISPLAY_MODE = {
  NONE: 'none',
  ARROW: 'arrow',
  LABEL: 'label',
  BOTH: 'both',
};

/**
 * 荷重表示マネージャークラス
 */
export class LoadDisplayManager {
  /**
   * @param {THREE.Scene} scene - Three.jsシーン
   * @param {Object} options - オプション
   */
  constructor(scene, options = {}) {
    this._scene = scene;
    this._loadGroup = new THREE.Group();
    this._loadGroup.name = 'LoadDisplayGroup';
    this._scene.add(this._loadGroup);

    this._arrowMap = new Map(); // loadId -> ArrowHelper[]
    this._labelMap = new Map(); // loadId -> CSS2DObject[]
    this._displayMode = LOAD_DISPLAY_MODE.NONE;
    this._scale = options.scale || 1.0;
    this._arrowColor = options.arrowColor || 0xff4444;
    this._headLength = options.headLength || 100;
    this._headWidth = options.headWidth || 50;

    // ラベル設定
    this._labelPrecision = options.labelPrecision || 2; // 小数点桁数
    this._labelUnit = options.labelUnit || 'kN'; // 単位
    this._labelFontSize = options.labelFontSize || '12px';
    this._labelColor = options.labelColor || '#ffffff';
    this._labelBackgroundColor = options.labelBackgroundColor || 'rgba(0, 0, 0, 0.7)';

    this._calData = null;
    this._nodeMap = null;
    this._memberData = null;

    this._maxArrowLength = options.maxArrowLength || 500;
    this._minArrowLength = options.minArrowLength || 0;
    this._isVisible = false;
    this._selectedLoadCase = null;
  }

  /**
   * 計算データと部材データを設定
   * @param {Object} calData - StbCalData解析結果
   * @param {Map} nodeMap - 節点マップ
   * @param {Object} memberData - 部材データ
   */
  setData(calData, nodeMap, memberData) {
    this._calData = calData;
    this._nodeMap = nodeMap;
    this._memberData = memberData;

    if (calData && this._isVisible) {
      this.updateDisplay();
    }
  }

  /**
   * 表示モードを設定
   * @param {string} mode - LOAD_DISPLAY_MODE
   */
  setDisplayMode(mode) {
    this._displayMode = mode;
    this._isVisible = mode !== LOAD_DISPLAY_MODE.NONE;

    if (this._calData) {
      this.updateDisplay();
    }
  }

  /**
   * 表示/非表示を切り替え
   */
  toggle() {
    if (this._displayMode === LOAD_DISPLAY_MODE.NONE) {
      this.setDisplayMode(LOAD_DISPLAY_MODE.ARROW);
    } else {
      this.setDisplayMode(LOAD_DISPLAY_MODE.NONE);
    }
  }

  /**
   * 矢印スケールを設定
   * @param {number} scale - スケール値
   */
  setScale(scale) {
    this._scale = scale;
    if (this._isVisible) {
      this.updateDisplay();
    }
  }

  /**
   * 荷重ケースを選択
   * @param {string|null} loadCaseId - 荷重ケースID（null=全て表示）
   */
  selectLoadCase(loadCaseId) {
    this._selectedLoadCase = loadCaseId;
    if (this._isVisible) {
      this.updateDisplay();
    }
  }

  /**
   * ラベル設定を更新
   * @param {Object} options - ラベル設定
   */
  setLabelOptions(options = {}) {
    if (options.precision !== undefined) {
      this._labelPrecision = options.precision;
    }
    if (options.unit !== undefined) {
      this._labelUnit = options.unit;
    }
    if (options.fontSize !== undefined) {
      this._labelFontSize = options.fontSize;
    }
    if (options.color !== undefined) {
      this._labelColor = options.color;
    }
    if (options.backgroundColor !== undefined) {
      this._labelBackgroundColor = options.backgroundColor;
    }

    // ラベル表示中なら更新
    if (
      this._displayMode === LOAD_DISPLAY_MODE.LABEL ||
      this._displayMode === LOAD_DISPLAY_MODE.BOTH
    ) {
      this.updateDisplay();
    }
  }

  /**
   * バウンディングボックスから自動スケールを計算
   * @param {THREE.Box3} boundingBox - モデルのバウンディングボックス
   */
  computeAutoScale(boundingBox) {
    if (!boundingBox || !this._calData) return;

    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    // 矢印の最大長をモデルサイズの10%に設定
    const targetArrowLength = maxDim * 0.1;

    // 最大荷重値を取得
    let maxLoad = 0;
    for (const load of this._calData.memberLoads) {
      const loadValue = Math.abs(load.P1);
      if (loadValue > maxLoad) {
        maxLoad = loadValue;
      }
    }

    if (maxLoad > 1e-6) {
      this._scale = targetArrowLength / maxLoad;
    }

    // ヘッドサイズ・上限値・最小値をモデルサイズに連動
    this._headLength = maxDim * 0.008;
    this._headWidth = maxDim * 0.004;
    this._maxArrowLength = maxDim * 0.15;
    this._minArrowLength = maxDim * 0.02;
  }

  /**
   * 全ての荷重表示を更新（矢印とラベル）
   */
  updateDisplay() {
    this.clearArrows();
    this.clearLabels();

    if (!this._calData || !this._nodeMap || !this._memberData) {
      return;
    }

    if (this._displayMode === LOAD_DISPLAY_MODE.NONE) {
      return;
    }

    // スケールが未計算（デフォルト値）の場合、シーンから自動計算を試みる
    if (this._scale <= 1.0 && this._scene) {
      const box = new THREE.Box3().setFromObject(this._scene);
      if (!box.isEmpty()) {
        this.computeAutoScale(box);
      }
    }

    // 柱の荷重を処理
    this._processColumnLoads();

    // 大梁の荷重を処理
    this._processGirderLoads();

    // 小梁の荷重を処理
    this._processBeamLoads();

    // 床面荷重を処理
    this._processSlabLoads();
  }

  /**
   * 旧メソッド名との互換性のため残す
   */
  updateAllArrows() {
    this.updateDisplay();
  }

  /**
   * 柱荷重を処理
   */
  _processColumnLoads() {
    if (!this._memberData.columns) return;

    const columnArrangements = this._calData.loadArrangements.columns;
    if (!columnArrangements || columnArrangements.size === 0) return;

    for (const [memberId, loadIds] of columnArrangements) {
      const column = this._findMemberById(this._memberData.columns, memberId);
      if (!column) continue;

      for (const loadId of loadIds) {
        const load = this._findLoadById(loadId);
        if (!load) continue;

        if (this._selectedLoadCase && load.loadCaseId !== this._selectedLoadCase) {
          continue;
        }

        this._createLoadArrows(column, load, 'column');
      }
    }
  }

  /**
   * 大梁荷重を処理
   */
  _processGirderLoads() {
    if (!this._memberData.girders) return;

    const girderArrangements = this._calData.loadArrangements.girders;
    if (!girderArrangements || girderArrangements.size === 0) return;

    for (const [memberId, loadIds] of girderArrangements) {
      const girder = this._findMemberById(this._memberData.girders, memberId);
      if (!girder) continue;

      for (const loadId of loadIds) {
        const load = this._findLoadById(loadId);
        if (!load) continue;

        if (this._selectedLoadCase && load.loadCaseId !== this._selectedLoadCase) {
          continue;
        }

        this._createLoadArrows(girder, load, 'girder');
      }
    }
  }

  /**
   * 小梁荷重を処理
   */
  _processBeamLoads() {
    if (!this._memberData.beams) return;

    const beamArrangements = this._calData.loadArrangements.beams;
    if (!beamArrangements || beamArrangements.size === 0) return;

    for (const [memberId, loadIds] of beamArrangements) {
      const beam = this._findMemberById(this._memberData.beams, memberId);
      if (!beam) continue;

      for (const loadId of loadIds) {
        const load = this._findLoadById(loadId);
        if (!load) continue;

        if (this._selectedLoadCase && load.loadCaseId !== this._selectedLoadCase) {
          continue;
        }

        this._createLoadArrows(beam, load, 'beam');
      }
    }
  }

  /**
   * 床面荷重を処理（仕上げ荷重・積載荷重）
   */
  _processSlabLoads() {
    // 荷重ケースが絞り込まれている場合は床面荷重を非表示（荷重ケースなし）
    if (this._selectedLoadCase) return;

    const { slabFinishes, slabLiveloads } = this._calData.loadArrangements;
    const hasFinish = slabFinishes?.size > 0;
    const hasLive = slabLiveloads?.size > 0;
    if (!hasFinish && !hasLive) return;
    if (!this._memberData?.slabs) return;

    const downDir = new THREE.Vector3(0, 0, -1);

    if (hasFinish) {
      for (const [finishId, slabIds] of slabFinishes) {
        const finishDef = this._calData.slabFinishDefs?.find(
          (d) => String(d.id) === String(finishId),
        );
        if (!finishDef || finishDef.weight <= 0) continue;
        for (const slabId of slabIds) {
          this._createSlabLoadArrows(
            slabId,
            finishDef.weight,
            downDir,
            `FIN_${finishId}`,
            0x4488ff,
            'finish',
          );
        }
      }
    }

    if (hasLive) {
      for (const [liveloadId, slabIds] of slabLiveloads) {
        const liveDef = this._calData.loadCondition?.liveloads?.find(
          (l) => String(l.id) === String(liveloadId),
        );
        if (!liveDef || !(liveDef.slabLoad > 0)) continue;
        for (const slabId of slabIds) {
          this._createSlabLoadArrows(
            slabId,
            liveDef.slabLoad,
            downDir,
            `LL_${liveloadId}`,
            0xff8800,
            'liveload',
          );
        }
      }
    }
  }

  /**
   * 床スラブ上に面荷重矢印を配置
   * @param {string} slabId - スラブID
   * @param {number} weight - 荷重強度 (N/mm²)
   * @param {THREE.Vector3} direction - 荷重方向（単位ベクトル）
   * @param {string} loadKey - 荷重識別キー（arrowMap/labelMapのキーに使用）
   * @param {number} color - 矢印色（16進数）
   * @param {string} type - 荷重タイプ文字列
   */
  _createSlabLoadArrows(slabId, weight, direction, loadKey, color, type) {
    const slabEl = this._findMemberById(this._memberData.slabs, slabId);
    if (!slabEl) return;

    const nodeIdOrderEl = slabEl.getElementsByTagName?.('StbNodeIdOrder')?.[0];
    if (!nodeIdOrderEl) return;

    const nodeIds = (nodeIdOrderEl.textContent || '').trim().split(/\s+/).filter(Boolean);
    if (nodeIds.length < 3) return;

    const vertices = [];
    for (const nodeId of nodeIds) {
      const coord = this._nodeMap.get(nodeId);
      if (coord) vertices.push(new THREE.Vector3(coord.x, coord.y, coord.z));
    }
    if (vertices.length < 3) return;

    const gridPoints = this._computeSlabGridPoints(vertices);
    const arrowLen = Math.max(this._minArrowLength, this._maxArrowLength * 0.15);
    const hl = Math.min(this._headLength * 0.5, arrowLen * 0.3);
    const hw = Math.min(this._headWidth * 0.5, hl);

    const showArrows =
      this._displayMode === LOAD_DISPLAY_MODE.ARROW || this._displayMode === LOAD_DISPLAY_MODE.BOTH;
    const showLabels =
      this._displayMode === LOAD_DISPLAY_MODE.LABEL || this._displayMode === LOAD_DISPLAY_MODE.BOTH;

    const mapKey = `${loadKey}_${slabId}`;

    if (showArrows && gridPoints.length > 0) {
      const arrows = [];
      for (const pt of gridPoints) {
        const origin = pt.clone().addScaledVector(direction, -arrowLen);
        const arrow = new THREE.ArrowHelper(direction, origin, arrowLen, color, hl, hw);
        arrow.userData = { loadId: mapKey, type };
        arrow.renderOrder = 999;
        for (const child of arrow.children) {
          child.renderOrder = 999;
          if (child.material) child.material.depthTest = false;
        }
        arrows.push(arrow);
        this._loadGroup.add(arrow);
      }
      this._arrowMap.set(mapKey, arrows);
    }

    if (showLabels) {
      const centroid = new THREE.Vector3();
      for (const v of vertices) centroid.add(v);
      centroid.divideScalar(vertices.length);
      // N/mm² → kN/m² (×1000) for display
      const label = this._createLoadLabel(weight * 1000, centroid, mapKey);
      if (label) {
        this._labelMap.set(mapKey, [label]);
        this._scene.add(label);
      }
    }
  }

  /**
   * スラブ多角形内にグリッド点を生成（X-Y平面投影、平均Z使用）
   * @param {THREE.Vector3[]} vertices
   * @returns {THREE.Vector3[]}
   */
  _computeSlabGridPoints(vertices) {
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let avgZ = 0;

    for (const v of vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      avgZ += v.z;
    }
    avgZ /= vertices.length;

    const gridN = 3;
    const points = [];
    for (let i = 0; i <= gridN; i++) {
      for (let j = 0; j <= gridN; j++) {
        const px = minX + (i / gridN) * (maxX - minX);
        const py = minY + (j / gridN) * (maxY - minY);
        if (this._isPointInPolygonXY(px, py, vertices)) {
          points.push(new THREE.Vector3(px, py, avgZ));
        }
      }
    }

    if (points.length === 0) {
      points.push(new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, avgZ));
    }

    return points;
  }

  /**
   * Ray casting による点の多角形内判定（X-Y投影）
   * @param {number} px
   * @param {number} py
   * @param {THREE.Vector3[]} vertices
   * @returns {boolean}
   */
  _isPointInPolygonXY(px, py, vertices) {
    let inside = false;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = vertices[i].x,
        yi = vertices[i].y;
      const xj = vertices[j].x,
        yj = vertices[j].y;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * 部材IDで部材を検索
   * @param {Array} members - 部材配列
   * @param {string} id - 部材ID
   * @returns {Object|null}
   */
  _findMemberById(members, id) {
    if (!members) return null;
    for (const member of members) {
      if (member.id === id || member.getAttribute?.('id') === id) {
        return member;
      }
    }
    return null;
  }

  /**
   * 荷重IDで荷重を検索
   * @param {string} id - 荷重ID
   * @returns {Object|null}
   */
  _findLoadById(id) {
    if (!this._calData?.memberLoads) return null;
    return this._calData.memberLoads.find((ml) => ml.id === id) || null;
  }

  /**
   * 荷重矢印とラベルを作成
   * @param {Object} member - 部材データ
   * @param {Object} load - 荷重データ
   * @param {string} memberType - 部材タイプ
   */
  _createLoadArrows(member, load, memberType) {
    const isColumn = memberType === 'column';
    const startNodeId = isColumn
      ? member.getAttribute?.('id_node_bottom') || member.id_node_bottom
      : member.getAttribute?.('id_node_start') || member.id_node_start;
    const endNodeId = isColumn
      ? member.getAttribute?.('id_node_top') || member.id_node_top
      : member.getAttribute?.('id_node_end') || member.id_node_end;

    if (!startNodeId || !endNodeId) return;

    const startCoord = this._nodeMap.get(startNodeId);
    const endCoord = this._nodeMap.get(endNodeId);

    if (!startCoord || !endCoord) return;

    const start = new THREE.Vector3(startCoord.x, startCoord.y, startCoord.z);
    const end = new THREE.Vector3(endCoord.x, endCoord.y, endCoord.z);
    const memberLength = start.distanceTo(end);

    // 荷重ケースの色を取得
    const loadCase = this._calData.loadCases.find((lc) => lc.id === load.loadCaseId);
    const color = loadCase ? getLoadCaseColor(loadCase.kind) : this._arrowColor;

    const showArrows =
      this._displayMode === LOAD_DISPLAY_MODE.ARROW || this._displayMode === LOAD_DISPLAY_MODE.BOTH;
    const showLabels =
      this._displayMode === LOAD_DISPLAY_MODE.LABEL || this._displayMode === LOAD_DISPLAY_MODE.BOTH;

    // 矢印を生成
    if (showArrows) {
      const arrows = this._createArrowsByType(load, start, end, memberLength, color, memberType);

      if (arrows.length > 0) {
        this._arrowMap.set(load.id, arrows);
        for (const arrow of arrows) {
          // 矢印を建物ジオメトリの上に描画（Z-fighting防止）
          arrow.renderOrder = 999;
          for (const child of arrow.children) {
            child.renderOrder = 999;
            if (child.material) {
              child.material.depthTest = false;
            }
          }
          this._loadGroup.add(arrow);
        }
      }
    }

    // ラベルを生成
    if (showLabels) {
      const labels = this._createLabelsByType(load, start, end, memberLength, memberType);

      if (labels.length > 0) {
        this._labelMap.set(load.id, labels);
        for (const label of labels) {
          this._scene.add(label);
        }
      }
    }
  }

  /**
   * 荷重タイプに応じて矢印を生成
   * @param {Object} load - 荷重データ
   * @param {THREE.Vector3} start - 始点
   * @param {THREE.Vector3} end - 終点
   * @param {number} memberLength - 部材長
   * @param {number} color - 色
   * @param {string} memberType - 部材タイプ
   * @returns {Array<THREE.ArrowHelper>}
   */
  _createArrowsByType(load, start, end, memberLength, color, memberType) {
    const arrows = [];

    switch (load.type) {
      case LOAD_TYPES.UNIFORM_LOAD: {
        // 等分布荷重: 矢印先端が部材に接し、根元を横線でつなぐ
        const numArrows = Math.max(5, Math.floor(memberLength / 1000));
        const loadDir = this._getLoadDirection(load, start, end, memberType);
        // 矢印は荷重方向（loadDir）に向かって部材へ刺さる
        const arrowDir = loadDir.clone();
        const arrowLength = Math.abs(load.P1) * this._scale;
        const clampedLength = Math.max(
          Math.min(arrowLength, this._maxArrowLength),
          this._minArrowLength,
        );
        const hl = Math.min(this._headLength * 0.5, clampedLength * 0.3);
        const hw = Math.min(this._headWidth * 0.5, hl);

        // 根元（荷重線）の位置を収集して横線を引く
        const basePoints = [];

        for (let i = 0; i <= numArrows; i++) {
          const t = i / numArrows;
          // 部材上の点（矢印の先端位置）
          const tipPosition = new THREE.Vector3().lerpVectors(start, end, t);
          // 矢印の根元 = 先端から loadDir の逆方向に clampedLength だけ離れた位置
          const origin = tipPosition.clone().addScaledVector(loadDir, -clampedLength);

          const arrow = new THREE.ArrowHelper(arrowDir, origin, clampedLength, color, hl, hw);
          arrow.userData = { loadId: load.id, type: 'uniform' };
          arrows.push(arrow);
          basePoints.push(origin);
        }

        // 根元を横線でつなぐ
        if (basePoints.length >= 2) {
          const lineGeometry = new THREE.BufferGeometry().setFromPoints(basePoints);
          const lineMaterial = new THREE.LineBasicMaterial({ color });
          const baseLine = new THREE.Line(lineGeometry, lineMaterial);
          baseLine.userData = { loadId: load.id, type: 'uniform_baseline' };
          baseLine.renderOrder = 999;
          baseLine.material.depthTest = false;
          arrows.push(baseLine);
        }
        break;
      }

      case LOAD_TYPES.POINT_LOADS: {
        // 集中荷重: 指定位置に矢印（先端が部材に接し、荷重方向に向かう）
        const direction = this._getLoadDirection(load, start, end, memberType);
        const positions = [];

        if (load.P2 !== null) {
          // L1の位置に荷重P1
          const t1 = (load.P2 || 0) / memberLength;
          positions.push({ t: Math.min(t1, 1), value: load.P1 });
        }
        if (load.P4 !== null && load.P3 !== null) {
          // L2の位置に荷重P3
          const t2 = (load.P4 || 0) / memberLength;
          positions.push({ t: Math.min(t2, 1), value: load.P3 });
        }

        for (const pos of positions) {
          const tipPosition = new THREE.Vector3().lerpVectors(start, end, pos.t);
          const arrowLength = Math.abs(pos.value) * this._scale;
          const clampedLen = Math.max(
            Math.min(arrowLength, this._maxArrowLength),
            this._minArrowLength,
          );
          const hl = Math.min(this._headLength, clampedLen * 0.3);
          const hw = Math.min(this._headWidth, hl);
          // 根元 = 先端から荷重方向の逆に離れた位置
          const origin = tipPosition.clone().addScaledVector(direction, -clampedLen);

          const arrow = new THREE.ArrowHelper(direction, origin, clampedLen, color, hl, hw);
          arrow.userData = { loadId: load.id, type: 'point' };
          arrows.push(arrow);
        }
        break;
      }

      case LOAD_TYPES.EQUAL_POINT_LOADS: {
        // 等間隔集中荷重（先端が部材に接し、荷重方向に向かう）
        const numLoads = Math.max(1, Math.floor(load.P2 || 1));
        const direction = this._getLoadDirection(load, start, end, memberType);
        const arrowLength = Math.abs(load.P1) * this._scale;
        const clampedLen = Math.max(
          Math.min(arrowLength, this._maxArrowLength),
          this._minArrowLength,
        );
        const hl = Math.min(this._headLength, clampedLen * 0.3);
        const hw = Math.min(this._headWidth, hl);

        for (let i = 0; i < numLoads; i++) {
          const t = (i + 1) / (numLoads + 1);
          const tipPosition = new THREE.Vector3().lerpVectors(start, end, t);
          // 根元 = 先端から荷重方向の逆に離れた位置
          const origin = tipPosition.clone().addScaledVector(direction, -clampedLen);

          const arrow = new THREE.ArrowHelper(direction, origin, clampedLen, color, hl, hw);
          arrow.userData = { loadId: load.id, type: 'equal_point' };
          arrows.push(arrow);
        }
        break;
      }

      case LOAD_TYPES.TRAPEZOIDAL_1:
      case LOAD_TYPES.TRAPEZOIDAL_2: {
        // 台形分布荷重: 矢印先端が部材に接し、根元を折れ線でつなぐ
        // P1 = w1 (始点荷重密度), P2 = w2 (終点荷重密度)
        // P3 = L1 (開始位置), P4 = L2 (終了位置)
        const numArrows = Math.max(5, Math.floor(memberLength / 1000));
        const loadDir = this._getLoadDirection(load, start, end, memberType);
        const arrowDir = loadDir.clone();

        const w1 = Math.abs(load.P1 || 0);
        const w2 = Math.abs(load.P2 || load.P1 || 0);
        const L1 = load.P3 || 0;
        const L2 = load.P4 || memberLength;

        const t1 = L1 / memberLength;
        const t2 = Math.min(L2 / memberLength, 1.0);

        const basePoints = [];

        for (let i = 0; i <= numArrows; i++) {
          const localT = i / numArrows;
          const globalT = t1 + localT * (t2 - t1);

          if (globalT < 0 || globalT > 1) continue;

          const tipPosition = new THREE.Vector3().lerpVectors(start, end, globalT);

          const w = w1 + (w2 - w1) * localT;
          const arrowLength = w * this._scale;

          if (arrowLength < 1e-6) continue;

          const clampedLen = Math.max(
            Math.min(arrowLength, this._maxArrowLength),
            this._minArrowLength,
          );
          const hl = Math.min(this._headLength * 0.5, clampedLen * 0.3);
          const hw = Math.min(this._headWidth * 0.5, hl);

          // 根元 = 先端から荷重方向の逆に離れた位置
          const origin = tipPosition.clone().addScaledVector(loadDir, -clampedLen);

          const arrow = new THREE.ArrowHelper(arrowDir, origin, clampedLen, color, hl, hw);
          arrow.userData = { loadId: load.id, type: 'trapezoidal', loadValue: w };
          arrows.push(arrow);
          basePoints.push(origin);
        }

        // 根元を折れ線でつなぐ（台形の上辺）
        if (basePoints.length >= 2) {
          const lineGeometry = new THREE.BufferGeometry().setFromPoints(basePoints);
          const lineMaterial = new THREE.LineBasicMaterial({ color });
          const baseLine = new THREE.Line(lineGeometry, lineMaterial);
          baseLine.userData = { loadId: load.id, type: 'trapezoidal_baseline' };
          baseLine.renderOrder = 999;
          baseLine.material.depthTest = false;
          arrows.push(baseLine);
        }
        break;
      }

      default: {
        // その他のタイプ: 部材中央に代表矢印を表示（先端が部材に接し、荷重方向に向かう）
        const tipPoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
        const direction = this._getLoadDirection(load, start, end, memberType);
        const arrowLength = Math.abs(load.P1) * this._scale;
        const clampedLen = Math.max(
          Math.min(arrowLength, this._maxArrowLength),
          this._minArrowLength,
        );
        const hl = Math.min(this._headLength, clampedLen * 0.3);
        const hw = Math.min(this._headWidth, hl);
        const origin = tipPoint.clone().addScaledVector(direction, -clampedLen);

        const arrow = new THREE.ArrowHelper(direction, origin, clampedLen, color, hl, hw);
        arrow.userData = { loadId: load.id, type: 'other' };
        arrows.push(arrow);
      }
    }

    return arrows;
  }

  /**
   * 荷重の作用方向を取得
   * @param {Object} load - 荷重データ
   * @param {THREE.Vector3} start - 始点
   * @param {THREE.Vector3} end - 終点
   * @param {string} memberType - 部材タイプ
   * @returns {THREE.Vector3}
   */
  _getLoadDirection(load, start, end, memberType) {
    const directionToken = (load.directionLoad || '').toUpperCase();
    const coordinateToken = (load.coordinateSystem || '').toUpperCase();

    const axis =
      this._parseLoadDirectionAxis(directionToken) || this._parseLoadDirectionAxis(coordinateToken);
    if (axis) {
      return axis;
    }

    if (
      coordinateToken === 'LOCAL' ||
      coordinateToken === 'GLOBAL' ||
      coordinateToken === 'PROJECTION'
    ) {
      if (memberType === 'column') {
        return new THREE.Vector3(0, -1, 0);
      }
      return new THREE.Vector3(0, 0, -1);
    }

    if (memberType === 'column') {
      return new THREE.Vector3(-1, 0, 0);
    }
    return new THREE.Vector3(0, 0, -1);
  }

  _parseLoadDirectionAxis(token) {
    if (!token) return null;
    switch (token) {
      case 'X':
      case '+X':
      case '-X':
      case 'UX':
      case 'DX':
        return new THREE.Vector3(-1, 0, 0);
      case 'Y':
      case '+Y':
      case '-Y':
      case 'UY':
      case 'DY':
        return new THREE.Vector3(0, -1, 0);
      case 'Z':
      case '+Z':
      case '-Z':
      case 'UZ':
      case 'DZ':
        return new THREE.Vector3(0, 0, -1);
      default:
        return null;
    }
  }

  /**
   * 荷重タイプに応じてラベルを生成
   * @param {Object} load - 荷重データ
   * @param {THREE.Vector3} start - 始点
   * @param {THREE.Vector3} end - 終点
   * @param {number} memberLength - 部材長
   * @param {string} memberType - 部材タイプ
   * @returns {Array<CSS2DObject>}
   */
  _createLabelsByType(load, start, end, memberLength, _memberType) {
    const labels = [];

    switch (load.type) {
      case LOAD_TYPES.UNIFORM_LOAD: {
        // 等分布荷重: 中央にラベル1つ
        const midPoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
        const label = this._createLoadLabel(load.P1, midPoint, load.id);
        if (label) labels.push(label);
        break;
      }

      case LOAD_TYPES.POINT_LOADS: {
        // 集中荷重: 各荷重位置にラベル
        if (load.P2 !== null) {
          const t1 = (load.P2 || 0) / memberLength;
          const pos1 = new THREE.Vector3().lerpVectors(start, end, Math.min(t1, 1));
          const label1 = this._createLoadLabel(load.P1, pos1, `${load.id}_1`);
          if (label1) labels.push(label1);
        }
        if (load.P4 !== null && load.P3 !== null) {
          const t2 = (load.P4 || 0) / memberLength;
          const pos2 = new THREE.Vector3().lerpVectors(start, end, Math.min(t2, 1));
          const label2 = this._createLoadLabel(load.P3, pos2, `${load.id}_2`);
          if (label2) labels.push(label2);
        }
        break;
      }

      case LOAD_TYPES.EQUAL_POINT_LOADS: {
        // 等間隔集中荷重: 中央にまとめて1つのラベル
        const midPoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
        const label = this._createLoadLabel(load.P1, midPoint, load.id);
        if (label) labels.push(label);
        break;
      }

      case LOAD_TYPES.TRAPEZOIDAL_1:
      case LOAD_TYPES.TRAPEZOIDAL_2: {
        // 台形分布荷重: 範囲の中央に範囲情報付きラベル
        const w1 = Math.abs(load.P1 || 0);
        const w2 = Math.abs(load.P2 || load.P1 || 0);
        const L1 = load.P3 || 0;
        const L2 = load.P4 || memberLength;

        const t1 = L1 / memberLength;
        const t2 = Math.min(L2 / memberLength, 1.0);
        const tMid = (t1 + t2) / 2; // 台形範囲の中央

        const midPoint = new THREE.Vector3().lerpVectors(start, end, tMid);

        // 台形分布荷重用の特別なラベルを作成
        const label = this._createTrapezoidalLoadLabel(w1, w2, midPoint, load.id);
        if (label) labels.push(label);
        break;
      }

      default: {
        // その他: 中央にラベル
        const midPoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
        const label = this._createLoadLabel(load.P1, midPoint, load.id);
        if (label) labels.push(label);
      }
    }

    return labels;
  }

  /**
   * 荷重ラベルを作成
   * @param {number} loadValue - 荷重値
   * @param {THREE.Vector3} position - 位置
   * @param {string} id - ラベルID
   * @returns {CSS2DObject|null}
   */
  _createLoadLabel(loadValue, position, id) {
    if (Math.abs(loadValue) < 1e-6) return null;

    const formattedValue = Math.abs(loadValue).toFixed(this._labelPrecision);
    const text = `${formattedValue} ${this._labelUnit}`;

    const div = document.createElement('div');
    div.className = 'load-label';
    div.textContent = text;
    div.style.fontSize = this._labelFontSize;
    div.style.color = this._labelColor;
    div.style.backgroundColor = this._labelBackgroundColor;
    div.style.padding = '2px 6px';
    div.style.borderRadius = '3px';
    div.style.userSelect = 'none';
    div.style.pointerEvents = 'none';
    div.style.whiteSpace = 'nowrap';

    const label = new CSS2DObject(div);
    label.position.copy(position);
    label.userData = { loadId: id, loadValue };

    return label;
  }

  /**
   * 台形分布荷重ラベルを作成
   * @param {number} w1 - 始点荷重密度
   * @param {number} w2 - 終点荷重密度
   * @param {THREE.Vector3} position - 位置
   * @param {string} id - ラベルID
   * @returns {CSS2DObject|null}
   */
  _createTrapezoidalLoadLabel(w1, w2, position, id) {
    if (Math.abs(w1) < 1e-6 && Math.abs(w2) < 1e-6) return null;

    const formattedW1 = w1.toFixed(this._labelPrecision);
    const formattedW2 = w2.toFixed(this._labelPrecision);

    // w1とw2が同じ場合は単一値表示
    const text =
      Math.abs(w1 - w2) < 1e-6
        ? `${formattedW1} ${this._labelUnit}`
        : `${formattedW1}~${formattedW2} ${this._labelUnit}`;

    const div = document.createElement('div');
    div.className = 'load-label trapezoidal-load';
    div.textContent = text;
    div.style.fontSize = this._labelFontSize;
    div.style.color = this._labelColor;
    div.style.backgroundColor = this._labelBackgroundColor;
    div.style.padding = '2px 6px';
    div.style.borderRadius = '3px';
    div.style.userSelect = 'none';
    div.style.pointerEvents = 'none';
    div.style.whiteSpace = 'nowrap';

    const label = new CSS2DObject(div);
    label.position.copy(position);
    label.userData = { loadId: id, w1, w2, type: 'trapezoidal' };

    return label;
  }

  /**
   * 全ての矢印をクリア
   */
  clearArrows() {
    for (const arrows of this._arrowMap.values()) {
      for (const obj of arrows) {
        this._loadGroup.remove(obj);
        if (obj.isLine) {
          obj.geometry?.dispose();
          obj.material?.dispose();
        } else {
          obj.dispose?.();
        }
      }
    }
    this._arrowMap.clear();
  }

  /**
   * 全てのラベルをクリア
   */
  clearLabels() {
    for (const labels of this._labelMap.values()) {
      for (const label of labels) {
        this._scene.remove(label);
        // CSS2DObjectのDOMエレメントを削除
        if (label.element) {
          label.element.remove();
        }
      }
    }
    this._labelMap.clear();
  }

  /**
   * リソースを解放
   */
  dispose() {
    this.clearArrows();
    this.clearLabels();
    if (this._scene && this._loadGroup) {
      this._scene.remove(this._loadGroup);
    }
    this._loadGroup = null;
    this._calData = null;
    this._nodeMap = null;
    this._memberData = null;
  }

  /**
   * 表示状態を取得
   * @returns {boolean}
   */
  get isVisible() {
    return this._isVisible;
  }

  /**
   * 荷重ケース一覧を取得
   * @returns {Array}
   */
  getLoadCases() {
    return this._calData?.loadCases || [];
  }

  /**
   * 部材荷重一覧を取得
   * @returns {Array}
   */
  getMemberLoads() {
    return this._calData?.memberLoads || [];
  }
}

// シングルトンインスタンス
let instance = null;

/**
 * LoadDisplayManagerのシングルトンインスタンスを取得
 * @param {THREE.Scene} scene - シーン（初回のみ必須）
 * @returns {LoadDisplayManager|null}
 */
export function getLoadDisplayManager(scene = null) {
  if (!instance && scene) {
    instance = new LoadDisplayManager(scene);
  }
  return instance;
}

/**
 * LoadDisplayManagerを初期化
 * @param {THREE.Scene} scene - シーン
 * @param {Object} options - オプション
 * @returns {LoadDisplayManager}
 */
export function initLoadDisplayManager(scene, options = {}) {
  if (instance) {
    instance.dispose();
  }
  instance = new LoadDisplayManager(scene, options);
  return instance;
}
