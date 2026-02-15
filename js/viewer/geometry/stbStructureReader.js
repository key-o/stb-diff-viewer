/**
 * @fileoverview STB構造データ読み込みモジュール
 *
 * このファイルは、STB XMLデータから構造モデルの情報を抽出・加工します:
 * - ノード（節点）情報の抽出と座標変換
 * - 柱・梁・床・壁などの要素情報の抽出
 * - 断面情報の取得と整理
 * - 鋼材形状データの解析
 * - 3D形状生成に必要なデータ構造の作成
 *
 * このモジュールは、XMLデータから3D形状生成に必要な構造化データを
 * 提供し、columnGeneratorやbeamGeneratorの入力となります。
 *
 * ST-Bridge（略称STB）は、一般社団法人buildingSMART Japanが策定した
 * 建築構造分野のデータ交換フォーマットです。
 *
 * @module parser/stbStructureReader
 * @requires THREE
 * @requires ./stbXmlParser
 */

import * as THREE from 'three';
// ★★★ stbXmlParser からインポートする関数を追加 ★★★
import {
  buildNodeMap,
  parseElements,
  extractSteelSections,
  extractColumnElements,
  extractPostElements,
  extractBeamElements,
  extractGirderElements,
  extractBraceElements,
  extractPileElements, // 杭要素の抽出
  extractFootingElements, // 基礎要素の抽出
  extractFoundationColumnElements, // 基礎柱要素の抽出
  extractSlabElements, // 床要素の抽出
  extractWallElements, // 壁要素の抽出
  extractParapetElements, // パラペット要素の抽出
  extractOpeningElements, // 開口要素の抽出
  extractJointElements, // 継手要素の抽出
  extractJointArrangements, // 継手配置情報の抽出
  applyJointArrangementsToElements, // 継手IDを部材に適用
  extractStripFootingElements, // 布基礎要素の抽出
} from '../../common-stb/parser/stbXmlParser.js';
import { extractAllSections } from '../../common-stb/parser/sectionExtractor.js';
import { ensureUnifiedSectionType } from '../../common-stb/section/sectionTypeUtil.js';

// ============================================
// 状態保存コールバック（依存性注入）
// ============================================

/**
 * @typedef {Object} StateProvider
 * @property {function(string, *): void} setState - 状態を設定する関数
 * @property {function(string): *} [getState] - 状態を取得する関数
 */

/** @type {StateProvider|null} */
let stateProvider = null;

/** @type {Map<string, Object>} パース結果のキャッシュ（モデルキー → パース結果） */
const parseCache = new Map();

/**
 * 状態プロバイダーを設定（依存性注入）
 * @param {StateProvider} provider - 状態プロバイダー
 */
export function setStateProvider(provider) {
  stateProvider = provider;
}

/**
 * 状態を設定（プロバイダー経由）
 * @param {string} key - 状態キー
 * @param {*} value - 値
 */
function setStateInternal(key, value) {
  if (stateProvider && stateProvider.setState) {
    stateProvider.setState(key, value);
  }
}

/**
 * 状態を取得（プロバイダー経由）
 * @param {string} key - 状態キー
 * @returns {*} 値
 */
function getStateInternal(key) {
  if (stateProvider && stateProvider.getState) {
    return stateProvider.getState(key);
  }
  return undefined;
}

/**
 * パースキャッシュをクリア
 * @param {string} [modelKey] - 特定のモデルキーのみクリアする場合に指定
 */
export function clearParseCache(modelKey) {
  if (modelKey) {
    parseCache.delete(modelKey);
  } else {
    parseCache.clear();
  }
}

/**
 * ST-Bridge XMLデータを解析し、Three.jsで利用可能なデータ構造を作成
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @param {Object} options - オプション
 * @param {string} options.modelKey - モデルキー ('A' or 'B') - globalStateに保存する場合に指定
 * @param {boolean} options.saveToGlobalState - trueの場合、パース結果をglobalStateに保存
 * @return {Object} 解析結果を含むオブジェクト (Three.js形式のデータを含む)
 */
export function parseStbFile(xmlDoc, options = {}) {
  const { modelKey, saveToGlobalState = false, forceReparse = false } = options;

  // キャッシュチェック: modelKeyが指定されていてキャッシュがあれば再利用
  if (modelKey && !forceReparse && parseCache.has(modelKey)) {
    // キャッシュヒット - 再パースをスキップ
    return parseCache.get(modelKey);
  }

  // 入力バリデーション
  if (!xmlDoc || !xmlDoc.documentElement) {
    console.warn('parseStbFile: xmlDoc is null, undefined, or has no documentElement');
    // 空の結果を返して後続を安全にスキップ
    const emptyMap = new Map();
    return {
      nodes: new Map(),
      steelSections: emptyMap,
      columnSections: emptyMap,
      postSections: emptyMap,
      girderSections: emptyMap,
      beamSections: emptyMap,
      braceSections: emptyMap,
      columnElements: [],
      postElements: [],
      beamElements: [],
      girderElements: [],
      braceElements: [],
    };
  }
  // 1. 節点データの抽出と変換 (IDをキーとするMap<string, THREE.Vector3>)
  const nodeMapRaw = buildNodeMap(xmlDoc);
  const nodes = new Map();
  for (const [id, coords] of nodeMapRaw.entries()) {
    // ここで THREE.Vector3 に変換
    nodes.set(id, new THREE.Vector3(coords.x, coords.y, coords.z));
  }

  // 2. 鋼材形状データの抽出 (stbXmlParserから呼び出し)
  const steelSections = extractSteelSections(xmlDoc);

  // 3. 統一断面抽出エンジンによる断面データ抽出
  const sectionMaps = extractAllSections(xmlDoc);
  const columnSections = sectionMaps.columnSections;
  const postSections = sectionMaps.postSections;
  const girderSections = sectionMaps.girderSections;
  const beamSections = sectionMaps.beamSections;
  const braceSections = sectionMaps.braceSections;
  const pileSections = sectionMaps.pileSections;
  const footingSections = sectionMaps.footingSections;
  const foundationColumnSections = sectionMaps.foundationcolumnSections;
  const slabSections = sectionMaps.slabSections;
  const wallSections = sectionMaps.wallSections;
  const parapetSections = sectionMaps.parapetSections;
  const undefinedSections = sectionMaps.undefinedSections || new Map();

  // 追加: steelSections 情報を用いて抽出断面に寸法/種別を付加
  enrichSectionMapsWithSteelDimensions(
    {
      columnSections,
      postSections,
      girderSections,
      beamSections,
      braceSections,
      pileSections,
      footingSections,
      foundationColumnSections,
      slabSections,
      wallSections,
    },
    steelSections,
  );

  // 4. 要素データの抽出 (stbXmlParserから呼び出し)
  const columnElements = extractColumnElements(xmlDoc);

  const postElements = extractPostElements(xmlDoc);

  const beamElements = extractBeamElements(xmlDoc);

  const girderElements = extractGirderElements(xmlDoc);

  const braceElements = extractBraceElements(xmlDoc);

  const pileElements = extractPileElements(xmlDoc);

  const footingElements = extractFootingElements(xmlDoc);

  const foundationColumnElements = extractFoundationColumnElements(xmlDoc);

  const slabElements = extractSlabElements(xmlDoc);

  const wallElements = extractWallElements(xmlDoc);

  const parapetElements = extractParapetElements(xmlDoc);

  // 開口情報の抽出
  const openingElements = extractOpeningElements(xmlDoc);

  // 継手情報の抽出
  const jointElements = extractJointElements(xmlDoc);

  // 継手配置情報の抽出と部材への適用
  const jointArrangements = extractJointArrangements(xmlDoc);
  console.log('[DEBUG] stbStructureReader: jointArrangements.length =', jointArrangements.length);
  if (jointArrangements.length > 0) {
    // 各部材に継手IDを付与
    applyJointArrangementsToElements(columnElements, jointArrangements, 'COLUMN');
    applyJointArrangementsToElements(postElements, jointArrangements, 'POST');
    applyJointArrangementsToElements(girderElements, jointArrangements, 'GIRDER');
    applyJointArrangementsToElements(beamElements, jointArrangements, 'BEAM');
    applyJointArrangementsToElements(braceElements, jointArrangements, 'BRACE');
    console.log('[DEBUG] stbStructureReader: Applied joint arrangements to elements');
    // 大梁の継手ID確認
    const jointedGirders = girderElements.filter((g) => g.joint_id_start || g.joint_id_end);
    console.log('[DEBUG] stbStructureReader: Girders with joint IDs:', jointedGirders.length);
  }

  // 布基礎情報の抽出
  const stripFootingElements = extractStripFootingElements(xmlDoc);

  // Undefined断面を参照する要素を別カテゴリに分類
  // StbSecUndefined断面IDを持つ要素を各配列から抽出してundefinedElementsに移動
  const undefinedSectionIds = new Set(undefinedSections.keys());
  const undefinedElements = [];

  // 各要素配列からUndefined断面を参照する要素を分離するヘルパー関数
  // originalType: 元の要素タイプ（'Column', 'Girder'など）
  // nodeStartAttr, nodeEndAttr: ライン描画用のノード属性名
  const separateUndefinedElements = (elements, originalType, nodeStartAttr, nodeEndAttr) => {
    const normalElements = [];
    for (const element of elements) {
      const sectionId = parseInt(element.id_section, 10);
      if (undefinedSectionIds.has(sectionId)) {
        // Undefined要素として分類し、元の要素タイプとノード属性情報を保持
        undefinedElements.push({
          ...element,
          originalType,
          nodeStartAttr,
          nodeEndAttr,
        });
      } else {
        normalElements.push(element);
      }
    }
    return normalElements;
  };

  // 各要素配列からUndefined断面参照要素を分離
  // 垂直要素（bottom-top形式）
  const filteredColumnElements = separateUndefinedElements(
    columnElements,
    'Column',
    'id_node_bottom',
    'id_node_top',
  );
  const filteredPostElements = separateUndefinedElements(
    postElements,
    'Post',
    'id_node_bottom',
    'id_node_top',
  );
  // 水平要素（start-end形式）
  const filteredGirderElements = separateUndefinedElements(
    girderElements,
    'Girder',
    'id_node_start',
    'id_node_end',
  );
  const filteredBeamElements = separateUndefinedElements(
    beamElements,
    'Beam',
    'id_node_start',
    'id_node_end',
  );
  const filteredBraceElements = separateUndefinedElements(
    braceElements,
    'Brace',
    'id_node_start',
    'id_node_end',
  );

  // 5. グローバル公開（診断/デバッグ用）
  if (typeof window !== 'undefined') {
    window.stbParsedData = {
      nodes,
      steelSections,
      columnSections,
      postSections,
      girderSections,
      beamSections,
      braceSections,
      slabSections,
      wallSections,
      parapetSections,
      undefinedSections,
      columnElements: filteredColumnElements,
      postElements: filteredPostElements,
      beamElements: filteredBeamElements,
      girderElements: filteredGirderElements,
      braceElements: filteredBraceElements,
      pileElements,
      footingElements,
      foundationColumnElements,
      slabElements,
      wallElements,
      parapetElements,
      openingElements,
      jointElements,
      stripFootingElements,
      undefinedElements,
    };
    window.steelSections = steelSections; // 既存診断ロジック参照用
  }

  // globalStateに保存（オプション）
  if (saveToGlobalState && modelKey) {
    const suffix = modelKey.toUpperCase();
    // 生の座標データ（IFC変換用）
    setStateInternal(`models.nodeMapRaw${suffix}`, nodeMapRaw);
    // 鋼材断面データ
    setStateInternal('models.steelSections', steelSections);
    // 要素データ
    setStateInternal('models.elementData.columnElements', filteredColumnElements);
    setStateInternal('models.elementData.postElements', filteredPostElements);
    setStateInternal('models.elementData.girderElements', filteredGirderElements);
    setStateInternal('models.elementData.beamElements', filteredBeamElements);
    setStateInternal('models.elementData.braceElements', filteredBraceElements);
    setStateInternal('models.elementData.pileElements', pileElements);
    setStateInternal('models.elementData.footingElements', footingElements);
    setStateInternal('models.elementData.foundationColumnElements', foundationColumnElements);
    setStateInternal('models.elementData.slabElements', slabElements);
    setStateInternal('models.elementData.wallElements', wallElements);
    setStateInternal('models.elementData.parapetElements', parapetElements);
    setStateInternal('models.elementData.openingElements', openingElements);
    setStateInternal('models.elementData.jointElements', jointElements);
    setStateInternal('models.elementData.stripFootingElements', stripFootingElements);
    setStateInternal('models.elementData.undefinedElements', undefinedElements);
    // 断面データ
    setStateInternal('models.sectionMaps.columnSections', columnSections);
    setStateInternal('models.sectionMaps.postSections', postSections);
    setStateInternal('models.sectionMaps.girderSections', girderSections);
    setStateInternal('models.sectionMaps.beamSections', beamSections);
    setStateInternal('models.sectionMaps.braceSections', braceSections);
    setStateInternal('models.sectionMaps.pileSections', pileSections);
    setStateInternal('models.sectionMaps.footingSections', footingSections);
    setStateInternal('models.sectionMaps.foundationcolumnSections', foundationColumnSections);
    setStateInternal('models.sectionMaps.slabSections', slabSections);
    setStateInternal('models.sectionMaps.wallSections', wallSections);
    setStateInternal('models.sectionMaps.parapetSections', parapetSections);
    setStateInternal('models.sectionMaps.undefinedSections', undefinedSections);
  }

  const result = {
    nodes, // THREE.Vector3 の Map
    nodeMapRaw, // 生の座標データ（IFC変換用）
    steelSections, // 汎用データ
    columnSections, // 統一エンジンから抽出
    postSections, // 統一エンジンから抽出（間柱）
    girderSections, // 統一エンジンから抽出（大梁断面）
    beamSections, // 統一エンジンから抽出（小梁断面）
    braceSections, // 統一エンジンから抽出（新規追加）
    pileSections, // 統一エンジンから抽出（杭断面）
    footingSections, // 統一エンジンから抽出（基礎断面）
    foundationColumnSections, // 統一エンジンから抽出（基礎柱断面）
    slabSections, // 統一エンジンから抽出（床断面）
    wallSections, // 統一エンジンから抽出（壁断面）
    parapetSections, // 統一エンジンから抽出（パラペット断面）
    undefinedSections, // Undefined断面（StbSecUndefined）
    columnElements: filteredColumnElements, // Undefined断面参照要素を除外
    postElements: filteredPostElements, // Undefined断面参照要素を除外
    beamElements: filteredBeamElements, // Undefined断面参照要素を除外
    girderElements: filteredGirderElements, // Undefined断面参照要素を除外
    braceElements: filteredBraceElements, // Undefined断面参照要素を除外
    pileElements, // 杭要素のデータ（新規追加）
    footingElements, // 基礎要素のデータ（新規追加）
    foundationColumnElements, // 基礎柱要素のデータ（新規追加）
    slabElements, // 床要素のデータ（新規追加）
    wallElements, // 壁要素のデータ（新規追加）
    parapetElements, // パラペット要素のデータ（新規追加）
    openingElements, // 開口要素のデータ（新規追加）
    jointElements, // 継手要素のデータ（新規追加）
    stripFootingElements, // 布基礎要素のデータ（新規追加）
    undefinedElements, // Undefined断面を参照する要素（ラインのみ表示）
  };

  // キャッシュに保存（modelKeyが指定されている場合）
  if (modelKey) {
    parseCache.set(modelKey, result);
  }

  return result;
}

// ------------------ 付加処理ヘルパー ------------------
function enrichSectionMapsWithSteelDimensions(sectionMaps, steelSections) {
  if (!steelSections || !steelSections.size) return;
  const maps = [
    sectionMaps.columnSections,
    sectionMaps.postSections,
    sectionMaps.girderSections,
    sectionMaps.beamSections,
    sectionMaps.braceSections,
    sectionMaps.pileSections,
    sectionMaps.footingSections,
    sectionMaps.foundationColumnSections,
    sectionMaps.slabSections,
    sectionMaps.wallSections,
  ];
  for (const m of maps) {
    if (!m) continue;
    for (const section of m.values()) {
      if (!section || !section.shapeName) continue;
      const steel = steelSections.get(section.shapeName);
      if (!steel) continue;
      section.steelShape = steel;
      if (!section.id_steel && steel && steel.name) {
        section.id_steel = steel.name;
      }
      // 断面タイプを正確に決定（steelのタグ/パラメータを常に優先）
      // 1) elementTagから決定
      let typeBySteel = classifySteelElementTag(steel.elementTag);

      // 2) elementTagで決まらなければパラメータから推定
      if (!typeBySteel) {
        typeBySteel = inferSectionTypeFromParameters(steel);
      }

      // 3) steel由来の種別を適用（既存値に関わらず上書き：名前依存を排除）
      if (typeBySteel) {
        section.section_type = typeBySteel;
      }
      ensureUnifiedSectionType(section);
      // 寸法抽出
      const dims = deriveDimensionsFromSteelShape(steel);
      if (dims) {
        section.dimensions = dims;
      }
    }
  }
}

function classifySteelElementTag(tag = '') {
  const t = tag.toUpperCase();
  // 正確なSTB要素タグ名から断面タイプを決定
  if (
    t.includes('SECROLL-H') ||
    t.includes('ROLL-H') ||
    t.includes('BUILD-H') ||
    t.includes('SECSTEELH')
  ) {
    return 'H';
  }
  if (
    t.includes('SECROLL-BOX') ||
    t.includes('ROLL-BOX') ||
    t.includes('SECSTEELBOX') ||
    t.includes('BOX')
  ) {
    return 'BOX';
  }
  if (
    t.includes('SECROLL-C') ||
    t.includes('ROLL-C') ||
    t.includes('SECSTEELC') ||
    t.includes('CHANNEL')
  ) {
    return 'C';
  }
  if (t.includes('SECROLL-L') || t.includes('ROLL-L') || t.includes('SECSTEELL')) {
    return 'L';
  }
  if (t.includes('SECROLL-T') || t.includes('ROLL-T') || t.includes('SECSTEELT')) {
    return 'T';
  }
  if (t.includes('PIPE')) {
    return 'PIPE';
  }
  if (t.includes('CFT')) {
    return 'CFT'; // 充填鋼管柱
  }
  // フラットバー（平鋼）: StbSecFlatBar
  if (t.includes('FLATBAR') || t.includes('FLAT-BAR') || t.includes('SECFLATBAR')) {
    return 'FB';
  }
  // 丸鋼（中実円）: StbSecRoundBar
  if (t.includes('ROUNDBAR') || t.includes('ROUND-BAR') || t.includes('SECROUNDBAR')) {
    return 'CIRCLE';
  }

  // フォールバック: elementTagから推定できない場合は、パラメータから推定
  return null; // nullを返してパラメータベース推定に委ねる
}

function inferSectionTypeFromParameters(steel) {
  if (!steel) return 'RECTANGLE';

  const hasA = steel.A !== undefined && steel.A !== null;
  const hasB = steel.B !== undefined && steel.B !== null;
  const hasT = steel.t !== undefined && steel.t !== null;
  const hasT1 = steel.t1 !== undefined && steel.t1 !== null;
  const hasT2 = steel.t2 !== undefined && steel.t2 !== null;
  const hasD = steel.D !== undefined && steel.D !== null;
  const hasR = steel.r !== undefined && steel.r !== null;
  const hasR1 = steel.r1 !== undefined && steel.r1 !== null;
  const hasR2 = steel.r2 !== undefined && steel.r2 !== null;

  // PIPE: D(直径) + t(厚さ)
  if (hasD && hasT && !hasA && !hasB) {
    return 'PIPE';
  }

  // H形鋼: A(高さ) + B(幅) + t1(web) + t2(flange) + r(単一フィレット)
  if (hasA && hasB && hasT1 && hasT2 && hasR && !hasR1 && !hasR2) {
    return 'H';
  }

  // チャンネル材: A(高さ) + B(フランジ幅) + t1(web) + t2(flange) + r1, r2(2つのフィレット)
  if (hasA && hasB && hasT1 && hasT2 && (hasR1 || hasR2)) {
    return 'C';
  }

  // BOX: A(高さ) + B(幅) + t(厚さ) [+ r(コーナー)]
  if (hasA && hasB && hasT && !hasT1 && !hasT2) {
    return 'BOX';
  }

  // L形鋼: A + B + t1 + t2 + r(単一フィレット、r1/r2なし)
  if (hasA && hasB && hasT1 && hasT2 && hasR && !hasR1 && !hasR2) {
    return 'L';
  }

  // 矩形（RC等）: A + B のみ
  if (hasA && hasB && !hasT && !hasT1 && !hasT2) {
    return 'RECTANGLE';
  }

  // フラットバー: B(幅) + t(厚さ) のみ（A, t1, t2なし）
  if (hasB && hasT && !hasA && !hasT1 && !hasT2) {
    return 'FB';
  }

  // 円形: D のみ（中実）
  if (hasD && !hasT) {
    return 'CIRCLE';
  }

  // デフォルト
  return 'RECTANGLE';
}

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : undefined;
}

function deriveDimensionsFromSteelShape(steel) {
  if (!steel) return null;
  const tag = (steel.elementTag || '').toUpperCase();
  // H形鋼: A(高さ) B(幅) t1(web) t2(flange)
  if (tag.includes('ROLL-H') || tag.includes('BUILD-H') || tag.includes('SECSTEELH')) {
    const A = num(steel.A); // overall depth
    const B = num(steel.B);
    const t1 = num(steel.t1);
    const t2 = num(steel.t2);
    if (A && B) {
      return {
        height: A,
        width: B,
        overall_depth: A,
        overall_width: B,
        web_thickness: t1,
        flange_thickness: t2,
      };
    }
  }
  // BOX形鋼管: A(高さ) B(幅) t(厚)
  if (tag.includes('ROLL-BOX') || tag.includes('SECSTEELBOX') || tag.includes('BOX')) {
    const A = num(steel.A);
    const B = num(steel.B);
    const t = num(steel.t);
    if (A && B) {
      return {
        height: A,
        width: B,
        outer_height: A,
        outer_width: B,
        wall_thickness: t,
      };
    }
  }
  // PIPE: D (直径) t (厚)
  if (tag.includes('PIPE')) {
    const D = num(steel.D);
    const t = num(steel.t);
    if (D) {
      return {
        outer_diameter: D,
        diameter: D,
        thickness: t,
        wall_thickness: t,
      };
    }
  }
  // L形鋼: A, B, t1, t2
  if (tag.includes('SECSTEELL') || tag.includes('ROLL-L')) {
    const A = num(steel.A);
    const B = num(steel.B);
    const t1 = num(steel.t1);
    const t2 = num(steel.t2);
    if (A && B) {
      return { leg1: A, leg2: B, A: A, B: B, t1: t1, t2: t2 };
    }
  }
  // チャンネル C: A(=H) B(=フランジ幅) t1(web) t2(flange)
  if (tag.includes('SECSTEELC') || tag.includes('ROLL-C') || tag.includes('CHANNEL')) {
    const A = num(steel.A);
    const B = num(steel.B);
    const t1 = num(steel.t1);
    const t2 = num(steel.t2);
    if (A && B) {
      return {
        overall_depth: A,
        height: A,
        flange_width: B,
        width: B,
        web_thickness: t1,
        flange_thickness: t2,
      };
    }
  }
  // フラットバー（平鋼）: B(幅) t(厚さ)
  if (tag.includes('FLATBAR') || tag.includes('SECFLATBAR')) {
    const B = num(steel.B);
    const t = num(steel.t);
    if (B && t) {
      return {
        width: B,
        thickness: t,
        A: B,
        t: t,
      };
    }
  }
  // 丸鋼（中実円）: R(半径) または D(直径)
  if (tag.includes('ROUNDBAR') || tag.includes('SECROUNDBAR')) {
    const R = num(steel.R);
    const D = num(steel.D);
    const diameter = D || (R ? R * 2 : undefined);
    if (diameter) {
      return {
        diameter: diameter,
        radius: diameter / 2,
      };
    }
  }
  // フォールバック: A,B があれば矩形とみなす
  if (steel.A && steel.B) {
    const A = num(steel.A);
    const B = num(steel.B);
    if (A && B) return { height: A, width: B };
  }
  return null;
}
