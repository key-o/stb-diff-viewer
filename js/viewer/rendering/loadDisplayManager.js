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
  getLoadTypeDescription,
  getMemberLoads,
} from '../../common-stb/parser/stbCalDataParser.js';

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

    if (calData) {
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

    // 柱の荷重を処理
    this._processColumnLoads();

    // 大梁の荷重を処理
    this._processGirderLoads();

    // 小梁の荷重を処理
    this._processBeamLoads();

    const showArrows =
      this._displayMode === LOAD_DISPLAY_MODE.ARROW || this._displayMode === LOAD_DISPLAY_MODE.BOTH;
    const showLabels =
      this._displayMode === LOAD_DISPLAY_MODE.LABEL || this._displayMode === LOAD_DISPLAY_MODE.BOTH;
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
    const startNodeId = member.getAttribute?.('id_node_start') || member.id_node_start;
    const endNodeId = member.getAttribute?.('id_node_end') || member.id_node_end;

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
        // 等分布荷重: 複数の矢印を等間隔に配置
        const numArrows = Math.max(5, Math.floor(memberLength / 1000));
        const direction = this._getLoadDirection(load, start, end, memberType);
        const arrowLength = Math.abs(load.P1) * this._scale;

        for (let i = 0; i <= numArrows; i++) {
          const t = i / numArrows;
          const position = new THREE.Vector3().lerpVectors(start, end, t);

          const arrow = new THREE.ArrowHelper(
            direction,
            position,
            Math.min(arrowLength, 500),
            color,
            this._headLength * 0.5,
            this._headWidth * 0.5,
          );
          arrow.userData = { loadId: load.id, type: 'uniform' };
          arrows.push(arrow);
        }
        break;
      }

      case LOAD_TYPES.POINT_LOADS: {
        // 集中荷重: 指定位置に矢印
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
          const position = new THREE.Vector3().lerpVectors(start, end, pos.t);
          const arrowLength = Math.abs(pos.value) * this._scale;

          const arrow = new THREE.ArrowHelper(
            direction,
            position,
            Math.min(arrowLength, 1000),
            color,
            this._headLength,
            this._headWidth,
          );
          arrow.userData = { loadId: load.id, type: 'point' };
          arrows.push(arrow);
        }
        break;
      }

      case LOAD_TYPES.EQUAL_POINT_LOADS: {
        // 等間隔集中荷重
        const numLoads = Math.max(1, Math.floor(load.P2 || 1));
        const direction = this._getLoadDirection(load, start, end, memberType);
        const arrowLength = Math.abs(load.P1) * this._scale;

        for (let i = 0; i < numLoads; i++) {
          const t = (i + 1) / (numLoads + 1);
          const position = new THREE.Vector3().lerpVectors(start, end, t);

          const arrow = new THREE.ArrowHelper(
            direction,
            position,
            Math.min(arrowLength, 1000),
            color,
            this._headLength,
            this._headWidth,
          );
          arrow.userData = { loadId: load.id, type: 'equal_point' };
          arrows.push(arrow);
        }
        break;
      }

      case LOAD_TYPES.TRAPEZOIDAL_1:
      case LOAD_TYPES.TRAPEZOIDAL_2: {
        // 台形分布荷重: 線形変化する矢印群
        // P1 = w1 (始点荷重密度), P2 = w2 (終点荷重密度)
        // P3 = L1 (開始位置), P4 = L2 (終了位置)
        const numArrows = Math.max(5, Math.floor(memberLength / 1000));
        const direction = this._getLoadDirection(load, start, end, memberType);

        const w1 = Math.abs(load.P1 || 0); // 始点荷重密度
        const w2 = Math.abs(load.P2 || load.P1 || 0); // 終点荷重密度
        const L1 = load.P3 || 0; // 開始位置
        const L2 = load.P4 || memberLength; // 終了位置

        // 台形分布荷重の適用範囲を計算
        const t1 = L1 / memberLength; // 開始位置の相対座標
        const t2 = Math.min(L2 / memberLength, 1.0); // 終了位置の相対座標

        for (let i = 0; i <= numArrows; i++) {
          // 台形分布範囲内でのパラメータ (0.0 ~ 1.0)
          const localT = i / numArrows;
          // 部材全体でのパラメータ
          const globalT = t1 + localT * (t2 - t1);

          if (globalT < 0 || globalT > 1) continue;

          const position = new THREE.Vector3().lerpVectors(start, end, globalT);

          // 線形補間で荷重密度を計算
          const w = w1 + (w2 - w1) * localT;
          const arrowLength = w * this._scale;

          if (arrowLength < 1e-6) continue; // 荷重がほぼゼロの場合はスキップ

          const arrow = new THREE.ArrowHelper(
            direction,
            position,
            Math.min(arrowLength, 500),
            color,
            this._headLength * 0.5,
            this._headWidth * 0.5,
          );
          arrow.userData = {
            loadId: load.id,
            type: 'trapezoidal',
            loadValue: w,
          };
          arrows.push(arrow);
        }
        break;
      }

      default: {
        // その他のタイプ: 部材中央に代表矢印を表示
        const midPoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
        const direction = this._getLoadDirection(load, start, end, memberType);
        const arrowLength = Math.abs(load.P1) * this._scale;

        const arrow = new THREE.ArrowHelper(
          direction,
          midPoint,
          Math.min(arrowLength, 800),
          color,
          this._headLength,
          this._headWidth,
        );
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
    // 部材軸ベクトル
    const memberAxis = new THREE.Vector3().subVectors(end, start).normalize();

    if (memberType === 'column') {
      // 柱の場合: 水平方向（X or Y軸）
      if (load.directionLoad === 'Y') {
        return new THREE.Vector3(0, -1, 0);
      }
      return new THREE.Vector3(-1, 0, 0);
    }

    // 梁の場合: 鉛直下向き（-Z方向）
    return new THREE.Vector3(0, 0, -1);
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
    div.style.fontFamily = 'monospace';
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
    div.style.fontFamily = 'monospace';
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
      for (const arrow of arrows) {
        this._loadGroup.remove(arrow);
        arrow.dispose?.();
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
