/**
 * @fileoverview STB XMLパーサーモジュール（統合版）
 *
 * このファイルは、ST-Bridge形式のXMLデータを解析する機能を提供します:
 * - XMLドキュメントの読み込みと解析
 * - 節点・柱・梁・床・壁などの構造要素の抽出
 * - 軸・階情報の抽出
 * - 座標データの正規化
 * - 構造要素の基本情報の整理
 *
 * このモジュールは、STBファイルからのデータ取得の基盤となり、
 * 3D表示やモデル比較のための前処理を担当します。
 *
 * STB 2.0.2 and 2.1.0 対応
 *
 * @module common/stb/parser/stbXmlParser
 */

// バージョン検出ユーティリティ
import {
  detectStbVersion,
  getVersionInfo,
  isVersion210,
  isVersion202,
} from './utils/versionDetector.js';

// --- 定数 ---
const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl';

// --- ロガー設定 ---
// デフォルトはconsole、外部から差し替え可能
let logger = {
  log: (...args) => {},
  warn: (...args) => console.warn(...args),
  debug: (..._args) => {},
  error: (...args) => console.error(...args),
};

/**
 * ロガーを設定する
 * @param {Object} customLogger - カスタムロガーオブジェクト
 */
export function setLogger(customLogger) {
  if (customLogger) {
    logger = { ...logger, ...customLogger };
  }
}

// --- 要素パース関数 (汎用) ---
/**
 * 指定された要素タイプの要素をXMLドキュメントから取得する。
 *
 * **用途**:
 * - 3D立体表示: メッシュジオメトリ生成の基礎データ
 * - 線分表示: 構造線生成の基礎データ
 * - 比較処理: モデルA・B間の要素差分解析
 *
 * @param {Document} doc - パースされたXMLドキュメント。
 * @param {string} elementType - 取得する要素のタグ名 (例: "StbColumn")。
 * @returns {Array<Element>} 取得した要素の配列。
 */
export function parseElements(doc, elementType) {
  if (!doc) return [];

  // getElementsByTagNameNS がサポートされている場合は使用
  if (typeof doc.getElementsByTagNameNS === 'function') {
    try {
      const elements = doc.getElementsByTagNameNS(STB_NAMESPACE, elementType);
      // 結果が iterable かチェック
      if (elements && typeof elements[Symbol.iterator] === 'function') {
        return [...elements];
      }
    } catch (e) {
      // フォールバックへ
    }
  }

  // フォールバック: getElementsByTagName を使用（名前空間なし）
  if (typeof doc.getElementsByTagName === 'function') {
    const elements = doc.getElementsByTagName(elementType);
    if (elements) {
      return Array.from(elements);
    }
  }

  return [];
}

// --- ノードマップ構築関数 ---
/**
 * XMLドキュメントからノード情報を読み取り、ノードIDと座標のマッピングを作成する。
 *
 * **用途**:
 * - 3D立体表示: 柱・梁・ブレースのメッシュ配置座標として使用
 * - 線分表示: 構造線の端点座標として使用
 * - 要素間接続: 構造要素の結合部解析に使用
 *
 * @param {Document} doc - パースされたXMLドキュメント。
 * @returns {Map<string, {x: number, y: number, z: number}>} ノードIDをキー、座標オブジェクト(mm単位)を値とするMap。
 */
export function buildNodeMap(doc) {
  const nodeMap = new Map();
  if (!doc) return nodeMap;
  const nodes = parseElements(doc, 'StbNode');
  for (const node of nodes) {
    const id = node.getAttribute('id');

    // 属性値を取得
    const xAttr = node.getAttribute('X');
    const yAttr = node.getAttribute('Y');
    const zAttr = node.getAttribute('Z');

    // 座標値をパース
    const x = parseFloat(xAttr);
    const y = parseFloat(yAttr);
    const z = parseFloat(zAttr);

    // IDチェック
    if (!id) {
      logger.warn(`[Data] ノード: IDが欠落しています`);
      continue;
    }

    // 座標の有効性チェック（NaNとInfinityを除外）
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      logger.warn(`[Data] ノード ${id}: 無効な座標値 (X=${xAttr}, Y=${yAttr}, Z=${zAttr})`);
      continue;
    }

    // 極端に大きな座標値のチェック（潜在的なデータ破損）
    const MAX_COORD_VALUE = 1e9; // 1,000km in mm
    if (
      Math.abs(x) > MAX_COORD_VALUE ||
      Math.abs(y) > MAX_COORD_VALUE ||
      Math.abs(z) > MAX_COORD_VALUE
    ) {
      logger.warn(`[Data] ノード ${id}: 座標値が極端に大きいです (X=${x}, Y=${y}, Z=${z})`);
      // 警告のみで続行（データ破損の可能性があるが処理は継続）
    }

    nodeMap.set(id, { x, y, z });
  }
  logger.log(`[Load] ノードマップ構築完了: ${nodeMap.size}個`);

  return nodeMap;
}

// --- 階情報パース関数 ---
/**
 * XMLドキュメントから階情報をパースする。
 *
 * **用途**:
 * - 3D立体表示: 階レベル平面の立体表示・クリッピング平面設定
 * - 線分表示: 階高線・レベル線の2D表示
 * - UI制御: 階セレクターでの階別表示切り替え
 *
 * この関数で取得した階情報（名前、高さ）は、ビュー上に階名やレベル線を表示するために使用できます。
 * @param {Document} doc - パースされたXMLドキュメント。
 * @param {Object} options - オプション設定
 * @param {boolean} options.includeNodeIds - node_idsを含めるかどうか（デフォルト: false）
 * @returns {Array<{id: string, name: string, height: number, kind?: string, node_ids?: string[]}>} 階情報の配列（高さ(mm単位)でソート済み）。
 */
export function parseStories(doc, options = {}) {
  if (!doc) return [];
  const { includeNodeIds = false } = options;

  const stories = parseElements(doc, 'StbStory');
  const parsed = stories
    .map((s) => {
      const heightAttr = s.getAttribute('height');
      const height = heightAttr !== null ? parseFloat(heightAttr) : NaN;

      const storyData = {
        id: s.getAttribute('id'),
        name: s.getAttribute('name'),
        height: height,
        kind: s.getAttribute('kind') || 'GENERAL',
      };

      // オプション: StbNodeIdList 内の節点IDを取得
      if (includeNodeIds) {
        const nodeIds = [];
        const nodeList = s.getElementsByTagName('StbNodeIdList')[0];
        if (nodeList) {
          const idElements = Array.from(nodeList.getElementsByTagName('StbNodeId'));
          for (const idEl of idElements) {
            const nid = idEl.getAttribute('id');
            if (nid) nodeIds.push(nid);
          }
        }
        storyData.node_ids = nodeIds;
      }

      return storyData;
    })
    .filter((s) => !isNaN(s.height));

  logger.log(`[Load] 階情報読込完了: ${parsed.length}階`);

  return parsed.sort((a, b) => a.height - b.height);
}

// --- 通り芯情報パース関数 ---
/**
 * ST-Bridge XMLドキュメントから通り芯データをパースする。
 *
 * **用途**:
 * - 3D立体表示: 通り芯の立体グリッド表示・参照平面設定
 * - 線分表示: 通り芯線の2D表示・建築図面風表示
 * - UI制御: 軸セレクターでの軸別表示切り替え
 *
 * @param {XMLDocument} doc - パース済みのXMLドキュメント。
 * @param {Object} options - オプション設定
 * @param {boolean} options.includeNodeIds - node_idsを含めるかどうか（デフォルト: false）
 * @returns {object} 軸データ ({ xAxes: [], yAxes: [] }) (距離はmm単位)。
 */
export function parseAxes(doc, options = {}) {
  const { includeNodeIds = false } = options;
  const xAxes = [];
  const yAxes = [];

  // <StbParallelAxes> 要素をすべて取得
  const parallelAxesElements = parseElements(doc, 'StbParallelAxes');

  for (let i = 0; i < parallelAxesElements.length; i++) {
    const parallelAxes = parallelAxesElements[i];
    const groupName = parallelAxes.getAttribute('group_name');
    // StbParallelAxes の原点座標と角度を取得
    const originX = parseFloat(parallelAxes.getAttribute('X')) || 0;
    const originY = parseFloat(parallelAxes.getAttribute('Y')) || 0;
    const angle = parseFloat(parallelAxes.getAttribute('angle')) || 0;

    // group_nameからX/Y軸を判定
    // "X", "Y" に加えて "_X", "_Y" で終わる場合も対応
    const isXGroup = groupName === 'X' || groupName.endsWith('_X');
    const isYGroup = groupName === 'Y' || groupName.endsWith('_Y');

    // <StbParallelAxis> 要素を取得
    const axisElements = parallelAxes.getElementsByTagName
      ? Array.from(parallelAxes.getElementsByTagName('StbParallelAxis'))
      : [];

    for (let j = 0; j < axisElements.length; j++) {
      const axis = axisElements[j];
      const id = axis.getAttribute('id') || `${groupName}_${j}`;
      const name = axis.getAttribute('name');
      const distance = parseFloat(axis.getAttribute('distance'));

      // 実際の座標を計算
      // ST-Bridge仕様:
      // - angle=270 (X軸グループ標準): Y方向に平行な線、distanceはX方向のオフセット
      // - angle=0 (Y軸グループ標準): X方向に平行な線、distanceはY方向のオフセット
      // 座標 = 原点 + distance * (角度に垂直な方向の単位ベクトル)
      const angleRad = (angle * Math.PI) / 180;
      // 垂直方向（angle + 90度）のベクトル
      const perpAngleRad = angleRad + Math.PI / 2;
      const actualX = originX + distance * Math.cos(perpAngleRad);
      const actualY = originY + distance * Math.sin(perpAngleRad);

      const axisData = {
        id,
        name,
        distance,
        // 実際の座標位置を追加
        x: actualX,
        y: actualY,
        angle, // 軸線の角度（度）
        originX,
        originY,
      };

      // オプション: StbNodeIdList 内の節点IDを取得
      if (includeNodeIds) {
        const nodeIds = [];
        const nodeList = axis.getElementsByTagName('StbNodeIdList')[0];
        if (nodeList) {
          const idElements = Array.from(nodeList.getElementsByTagName('StbNodeId'));
          for (const idEl of idElements) {
            const nid = idEl.getAttribute('id');
            if (nid) nodeIds.push(nid);
          }
        }
        axisData.node_ids = nodeIds;
      }

      if (name && !isNaN(distance)) {
        if (isXGroup) {
          xAxes.push(axisData);
        } else if (isYGroup) {
          yAxes.push(axisData);
        }
      } else {
        logger.warn(
          `[Data] 軸: 無効なデータをスキップ (ID=${axis.getAttribute('id')}, Name=${name}, Distance=${axis.getAttribute('distance')})`,
        );
      }
    }
  }

  // 距離でソート
  xAxes.sort((a, b) => a.distance - b.distance);
  yAxes.sort((a, b) => a.distance - b.distance);

  logger.log(`[Load] 軸情報読込完了: X軸${xAxes.length}本, Y軸${yAxes.length}本`);

  return { xAxes, yAxes };
}

// --- ノード所属情報ルックアップ構築関数 ---
/**
 * XMLドキュメントからノードIDをキーとする所属階・所属通芯の逆引きマップを構築する。
 *
 * StbStory と StbParallelAxis の StbNodeIdList を解析し、
 * 各ノードがどの階・どの通芯に所属しているかを高速に検索できるMapを返します。
 *
 * @param {Document} doc - パース済みのXMLドキュメント。
 * @returns {Map<string, {storyName: string|null, axisNames: string[]}>}
 *   ノードIDをキー、所属情報を値とするMap。
 */
export function buildNodeStoryAxisLookup(doc) {
  const lookup = new Map();
  if (!doc) return lookup;

  // 階情報から所属階を構築
  const stories = parseStories(doc, { includeNodeIds: true });
  for (const story of stories) {
    if (story.node_ids) {
      for (const nodeId of story.node_ids) {
        if (!lookup.has(nodeId)) {
          lookup.set(nodeId, { storyName: null, axisNames: [] });
        }
        lookup.get(nodeId).storyName = story.name;
      }
    }
  }

  // 通芯情報から所属通芯を構築
  const axes = parseAxes(doc, { includeNodeIds: true });
  const allAxes = [...axes.xAxes, ...axes.yAxes];
  for (const axis of allAxes) {
    if (axis.node_ids) {
      for (const nodeId of axis.node_ids) {
        if (!lookup.has(nodeId)) {
          lookup.set(nodeId, { storyName: null, axisNames: [] });
        }
        lookup.get(nodeId).axisNames.push(axis.name);
      }
    }
  }

  logger.log(`[Load] ノード所属情報ルックアップ構築完了: ${lookup.size}ノード`);
  return lookup;
}

// --- 鋼材形状データ抽出関数 ---
/**
 * 鋼材形状データを抽出する
 *
 * **用途**:
 * - 3D立体表示: H鋼・角鋼管などの正確な断面形状メッシュ生成
 * - 線分表示: 簡略化された構造線の太さ・スタイル設定
 * - 断面設計: 構造計算・断面性能表示
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Map} 鋼材名をキーとする形状データのマップ
 */
export function extractSteelSections(xmlDoc) {
  const steelSections = new Map();
  if (!xmlDoc) {
    logger.warn('[Data] 鋼材断面: XMLドキュメントが未定義です');
    return steelSections;
  }

  // StbSecSteel 要素を取得（StbSecSteel または StbSecSteel_S）
  let steelSectionList = null;

  if (typeof xmlDoc.querySelector === 'function') {
    steelSectionList = xmlDoc.querySelector('StbSecSteel_S') || xmlDoc.querySelector('StbSecSteel');
  }

  if (!steelSectionList) {
    steelSectionList =
      parseElements(xmlDoc, 'StbSecSteel_S')[0] || parseElements(xmlDoc, 'StbSecSteel')[0] || null;
  }

  if (steelSectionList) {
    const children = steelSectionList.children || steelSectionList.childNodes || [];
    const elementChildren = Array.from(children).filter((node) => node.nodeType === 1);

    for (const steelEl of elementChildren) {
      const name = steelEl.getAttribute('name');

      if (name) {
        const sectionData = {
          elementTag: steelEl.tagName,
          shapeTypeAttr: steelEl.getAttribute('type'),
          name: name,
        };

        // 数値属性リスト（ST-Bridge標準の断面寸法パラメータ）
        const numericAttrs = ['A', 'B', 'D', 't', 't1', 't2', 'r', 'r1', 'r2', 'H'];

        const attrs = Array.from(steelEl.attributes || []);
        for (const attr of attrs) {
          if (attr.name !== 'type' && attr.name !== 'name') {
            // 数値属性は数値に変換して保存
            if (numericAttrs.includes(attr.name)) {
              const numVal = parseFloat(attr.value);
              sectionData[attr.name] = isFinite(numVal) ? numVal : attr.value;
            } else {
              sectionData[attr.name] = attr.value;
            }
          }
        }

        // 形状タイプ(kind_struct)をタグ/属性から推定
        const tag = (sectionData.elementTag || '').toUpperCase();
        let kind = undefined;
        if (tag.includes('ROLL-H') || tag.includes('BUILD-H') || tag.includes('_H')) kind = 'H';
        else if (tag.includes('ROLL-BOX') || tag.includes('BUILD-BOX') || tag.includes('_BOX'))
          kind = 'BOX';
        else if (tag.includes('PIPE')) kind = 'PIPE';
        else if (
          tag.includes('ROLL-C') ||
          tag.includes('BUILD-C') ||
          tag.includes('_C') ||
          tag.includes('LIPC')
        )
          kind = 'C';
        else if (tag.includes('ROLL-L') || tag.includes('BUILD-L') || tag.includes('_L'))
          kind = 'L';
        else if (tag.includes('ROLL-T') || tag.includes('BUILD-T') || tag.includes('_T'))
          kind = 'T';
        else if (tag.includes('FLATBAR')) kind = 'FB';
        else if (tag.includes('ROUNDBAR')) kind = 'CIRCLE';

        // type属性で判別できる場合の対応
        const typeAttr = (sectionData.shapeTypeAttr || '').toUpperCase();
        if (!kind && (typeAttr === 'BCR' || typeAttr === 'BCP')) kind = 'BOX';
        if (!kind && typeAttr === 'H') kind = 'H';
        if (kind) sectionData.kind_struct = kind;

        // 正規化された寸法情報を追加
        const normalizedDims = normalizeSteelDimensions(sectionData, kind);
        if (normalizedDims) {
          sectionData.dimensions = normalizedDims;
        }

        steelSections.set(name, sectionData);
      } else {
        logger.warn(`[Data] 鋼材断面: name属性が不足 (tagName=${steelEl.tagName})`);
      }
    }
  } else {
    logger.log('[Load] 鋼材断面: StbSecSteel要素なし');
  }
  logger.log(`[Load] 鋼材断面読込完了: ${steelSections.size}種類`);
  return steelSections;
}

/**
 * 鋼材断面の寸法情報を正規化する
 *
 * @param {Object} sectionData - 鋼材断面データ
 * @param {string} kind - 断面種別 ('H', 'BOX', 'PIPE', 'L', 'C', 'T')
 * @returns {Object|null} 正規化された寸法オブジェクト
 */
function normalizeSteelDimensions(sectionData, kind) {
  if (!sectionData) return null;

  const dims = {};

  // 共通: 生の寸法パラメータをコピー
  const rawParams = ['A', 'B', 'D', 't', 't1', 't2', 'r', 'r1', 'r2', 'H'];
  for (const param of rawParams) {
    if (sectionData[param] !== undefined) {
      dims[param] =
        typeof sectionData[param] === 'number'
          ? sectionData[param]
          : parseFloat(sectionData[param]);
    }
  }

  // 種別に応じた正規化
  switch (kind) {
    case 'H':
      if (dims.A) dims.height = dims.A;
      if (dims.B) dims.width = dims.B;
      if (dims.t1) dims.web_thickness = dims.t1;
      if (dims.t2) dims.flange_thickness = dims.t2;
      if (dims.r) dims.fillet_radius = dims.r;
      dims.profile_type = 'H';
      break;

    case 'BOX':
      if (dims.A) dims.height = dims.A;
      if (dims.B) dims.width = dims.B;
      if (dims.t) dims.wall_thickness = dims.t;
      if (dims.r) dims.corner_radius = dims.r;
      dims.profile_type = 'BOX';
      break;

    case 'PIPE':
      if (dims.D) {
        dims.diameter = dims.D;
        dims.outer_diameter = dims.D;
        dims.height = dims.D;
        dims.width = dims.D;
      }
      if (dims.t) dims.wall_thickness = dims.t;
      dims.profile_type = 'PIPE';
      break;

    case 'L':
      if (dims.A) {
        dims.leg1 = dims.A;
        dims.height = dims.A;
      }
      if (dims.B) {
        dims.leg2 = dims.B;
        dims.width = dims.B;
      }
      if (dims.t1) dims.thickness1 = dims.t1;
      if (dims.t2) dims.thickness2 = dims.t2;
      dims.profile_type = 'L';
      break;

    case 'C':
      if (dims.A) dims.height = dims.A;
      if (dims.B) {
        dims.flange_width = dims.B;
        dims.width = dims.B;
      }
      if (dims.t1) dims.web_thickness = dims.t1;
      if (dims.t2) dims.flange_thickness = dims.t2;
      dims.profile_type = 'C';
      break;

    case 'T':
      if (dims.H) dims.height = dims.H;
      else if (dims.A) dims.height = dims.A;
      if (dims.B) dims.width = dims.B;
      if (dims.t1) dims.web_thickness = dims.t1;
      if (dims.t2) dims.flange_thickness = dims.t2;
      dims.profile_type = 'T';
      break;

    default:
      if (dims.A) dims.height = dims.A;
      if (dims.B) dims.width = dims.B;
      if (dims.D) {
        dims.diameter = dims.D;
        dims.height = dims.D;
        dims.width = dims.D;
      }
      break;
  }

  return Object.keys(dims).length > 0 ? dims : null;
}

// --- 柱要素データ抽出関数 ---
/**
 * 柱要素データを抽出する
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 柱要素データの配列
 */
export function extractColumnElements(xmlDoc) {
  const columnElementsData = [];
  const columnElements = parseElements(xmlDoc, 'StbColumn');

  for (const colEl of columnElements) {
    const id = colEl.getAttribute('id');
    const idNodeBottom = colEl.getAttribute('id_node_bottom');
    const idNodeTop = colEl.getAttribute('id_node_top');
    const idSection = colEl.getAttribute('id_section');
    const name = colEl.getAttribute('name');
    const guid = colEl.getAttribute('guid');
    const rotate = colEl.getAttribute('rotate');

    const offset_bottom_X = colEl.getAttribute('offset_bottom_X');
    const offset_bottom_Y = colEl.getAttribute('offset_bottom_Y');
    const offset_top_X = colEl.getAttribute('offset_top_X');
    const offset_top_Y = colEl.getAttribute('offset_top_Y');

    if (id && idNodeBottom && idNodeTop && idSection) {
      const elementData = {
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        name: name,
        guid: guid || undefined,
        rotate: rotate ? parseFloat(rotate) : 0,
        offset_bottom_X: offset_bottom_X ? parseFloat(offset_bottom_X) : 0,
        offset_bottom_Y: offset_bottom_Y ? parseFloat(offset_bottom_Y) : 0,
        offset_top_X: offset_top_X ? parseFloat(offset_top_X) : 0,
        offset_top_Y: offset_top_Y ? parseFloat(offset_top_Y) : 0,
      };
      columnElementsData.push(elementData);
    } else {
      logger.warn(`[Data] 柱: 必須属性が不足 (id=${id})`);
    }
  }
  logger.log(`[Load] 柱要素読込完了: ${columnElementsData.length}本`);
  return columnElementsData;
}

/**
 * 梁要素データを抽出する（汎用関数）
 *
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @param {string} elementType - 要素タイプ（"StbBeam" または "StbGirder"）
 * @return {Array} 梁要素データの配列
 */
function extractBeamLikeElements(xmlDoc, elementType) {
  const elementsData = [];
  const elements = parseElements(xmlDoc, elementType);

  for (const el of elements) {
    const id = el.getAttribute('id');
    const idNodeStart = el.getAttribute('id_node_start');
    const idNodeEnd = el.getAttribute('id_node_end');
    const idSection = el.getAttribute('id_section');
    const name = el.getAttribute('name');
    const guid = el.getAttribute('guid');

    const offset_start_X = el.getAttribute('offset_start_X');
    const offset_start_Y = el.getAttribute('offset_start_Y');
    const offset_start_Z = el.getAttribute('offset_start_Z');
    const offset_end_X = el.getAttribute('offset_end_X');
    const offset_end_Y = el.getAttribute('offset_end_Y');
    const offset_end_Z = el.getAttribute('offset_end_Z');

    const haunch_start = el.getAttribute('haunch_start');
    const haunch_end = el.getAttribute('haunch_end');
    const kind_haunch_start = el.getAttribute('kind_haunch_start');
    const kind_haunch_end = el.getAttribute('kind_haunch_end');
    const joint_start = el.getAttribute('joint_start');
    const joint_end = el.getAttribute('joint_end');
    // 継手ID（部材要素に直接記述される場合）
    const joint_id_start = el.getAttribute('joint_id_start');
    const joint_id_end = el.getAttribute('joint_id_end');

    // rotate属性を取得（大梁・小梁は梁天端中心、ブレースはジオメトリ中心を回転軸とする）
    const rotate = el.getAttribute('rotate');

    if (id && idNodeStart && idNodeEnd && idSection) {
      const data = {
        id: id,
        id_node_start: idNodeStart,
        id_node_end: idNodeEnd,
        id_section: idSection,
        name: name,
        guid: guid || undefined,
      };

      if (
        offset_start_X !== null ||
        offset_start_Y !== null ||
        offset_start_Z !== null ||
        offset_end_X !== null ||
        offset_end_Y !== null ||
        offset_end_Z !== null
      ) {
        data.offset_start_X = offset_start_X ? parseFloat(offset_start_X) : 0;
        data.offset_start_Y = offset_start_Y ? parseFloat(offset_start_Y) : 0;
        data.offset_start_Z = offset_start_Z ? parseFloat(offset_start_Z) : 0;
        data.offset_end_X = offset_end_X ? parseFloat(offset_end_X) : 0;
        data.offset_end_Y = offset_end_Y ? parseFloat(offset_end_Y) : 0;
        data.offset_end_Z = offset_end_Z ? parseFloat(offset_end_Z) : 0;
      }

      if (haunch_start !== null || haunch_end !== null) {
        data.haunch_start = haunch_start ? parseFloat(haunch_start) : 0;
        data.haunch_end = haunch_end ? parseFloat(haunch_end) : 0;
        // XSDデフォルト値: SLOPE
        data.kind_haunch_start = kind_haunch_start || 'SLOPE';
        data.kind_haunch_end = kind_haunch_end || 'SLOPE';
      }

      if (joint_start !== null || joint_end !== null) {
        data.joint_start = joint_start ? parseFloat(joint_start) : 0;
        data.joint_end = joint_end ? parseFloat(joint_end) : 0;
      }

      // 継手ID（部材要素に直接記述される場合）
      if (joint_id_start !== null) {
        data.joint_id_start = joint_id_start;
      }
      if (joint_id_end !== null) {
        data.joint_id_end = joint_id_end;
      }

      // rotate属性がある場合は追加
      if (rotate !== null) {
        data.rotate = parseFloat(rotate);
      }

      elementsData.push(data);
    } else {
      logger.warn(`[Data] ${elementType}: 必須属性が不足 (id=${id})`);
    }
  }

  logger.log(`[Load] ${elementType}要素読込完了: ${elementsData.length}本`);
  return elementsData;
}

/**
 * 梁要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 梁要素データの配列
 */
export function extractBeamElements(xmlDoc) {
  return extractBeamLikeElements(xmlDoc, 'StbBeam');
}

/**
 * 大梁要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 大梁要素データの配列
 */
export function extractGirderElements(xmlDoc) {
  return extractBeamLikeElements(xmlDoc, 'StbGirder');
}

/**
 * ブレース要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} ブレース要素データの配列
 */
export function extractBraceElements(xmlDoc) {
  return extractBeamLikeElements(xmlDoc, 'StbBrace');
}

/**
 * 間柱要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 間柱要素データの配列
 */
export function extractPostElements(xmlDoc) {
  const postElementsData = [];
  const postElements = parseElements(xmlDoc, 'StbPost');

  for (const postEl of postElements) {
    const id = postEl.getAttribute('id');
    const idNodeBottom = postEl.getAttribute('id_node_bottom');
    const idNodeTop = postEl.getAttribute('id_node_top');
    const idSection = postEl.getAttribute('id_section');
    const name = postEl.getAttribute('name');
    const guid = postEl.getAttribute('guid');

    const offset_bottom_X = postEl.getAttribute('offset_bottom_X');
    const offset_bottom_Y = postEl.getAttribute('offset_bottom_Y');
    const offset_top_X = postEl.getAttribute('offset_top_X');
    const offset_top_Y = postEl.getAttribute('offset_top_Y');
    const rotate = postEl.getAttribute('rotate');

    if (id && idNodeBottom && idNodeTop && idSection) {
      const elementData = {
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        name: name,
        guid: guid || undefined,
        offset_bottom_X: offset_bottom_X ? parseFloat(offset_bottom_X) : 0,
        offset_bottom_Y: offset_bottom_Y ? parseFloat(offset_bottom_Y) : 0,
        offset_top_X: offset_top_X ? parseFloat(offset_top_X) : 0,
        offset_top_Y: offset_top_Y ? parseFloat(offset_top_Y) : 0,
        rotate: rotate ? parseFloat(rotate) : 0,
      };
      postElementsData.push(elementData);
    } else {
      logger.warn(`[Data] 間柱: 必須属性が不足 (id=${id})`);
    }
  }
  logger.log(`[Load] 間柱要素読込完了: ${postElementsData.length}本`);
  return postElementsData;
}

// ==============================================================================
// 杭・基礎要素の抽出関数
// ==============================================================================

/**
 * 杭(Pile)要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 杭要素データの配列
 */
export function extractPileElements(xmlDoc) {
  const pileElementsData = [];
  const pileElements = parseElements(xmlDoc, 'StbPile');

  for (const pileEl of pileElements) {
    const id = pileEl.getAttribute('id');
    const idSection = pileEl.getAttribute('id_section');
    const name = pileEl.getAttribute('name');
    const guid = pileEl.getAttribute('guid');
    const kind = pileEl.getAttribute('kind');
    const kindStructure = pileEl.getAttribute('kind_structure');

    const idNodeBottom = pileEl.getAttribute('id_node_bottom');
    const idNodeTop = pileEl.getAttribute('id_node_top');

    const idNode = pileEl.getAttribute('id_node');
    const levelTop = pileEl.getAttribute('level_top');
    const lengthAll = pileEl.getAttribute('length_all');

    const offset_bottom_X = pileEl.getAttribute('offset_bottom_X');
    const offset_bottom_Y = pileEl.getAttribute('offset_bottom_Y');
    const offset_top_X = pileEl.getAttribute('offset_top_X');
    const offset_top_Y = pileEl.getAttribute('offset_top_Y');

    const offsetX = pileEl.getAttribute('offset_X');
    const offsetY = pileEl.getAttribute('offset_Y');
    const rotate = pileEl.getAttribute('rotate');

    // 2ノード形式の場合
    if (id && idNodeBottom && idNodeTop && idSection) {
      const elementData = {
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        name: name,
        guid: guid || undefined,
        kind: kind,
        kind_structure: kindStructure,
        length_all: lengthAll ? parseFloat(lengthAll) : undefined,
        offset_bottom_X: offset_bottom_X ? parseFloat(offset_bottom_X) : 0,
        offset_bottom_Y: offset_bottom_Y ? parseFloat(offset_bottom_Y) : 0,
        offset_top_X: offset_top_X ? parseFloat(offset_top_X) : 0,
        offset_top_Y: offset_top_Y ? parseFloat(offset_top_Y) : 0,
        rotate: rotate ? parseFloat(rotate) : 0,
        pileFormat: '2node',
      };
      pileElementsData.push(elementData);
    }
    // 1ノード形式の場合
    else if (id && idNode && idSection && levelTop) {
      const elementData = {
        id: id,
        id_node: idNode,
        level_top: parseFloat(levelTop),
        id_section: idSection,
        name: name,
        guid: guid || undefined,
        kind: kind,
        kind_structure: kindStructure,
        length_all: lengthAll ? parseFloat(lengthAll) : undefined,
        offset_X: offsetX ? parseFloat(offsetX) : 0,
        offset_Y: offsetY ? parseFloat(offsetY) : 0,
        rotate: rotate ? parseFloat(rotate) : 0,
        pileFormat: '1node',
      };
      pileElementsData.push(elementData);
    } else {
      logger.warn(
        `[Data] 杭: 必須属性が不足 (id=${id}, 2node=${!!idNodeBottom && !!idNodeTop}, 1node=${!!idNode && !!levelTop})`,
      );
    }
  }
  logger.log(`[Load] 杭要素読込完了: ${pileElementsData.length}本`);
  return pileElementsData;
}

/**
 * 基礎(Footing)要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 基礎要素データの配列
 */
export function extractFootingElements(xmlDoc) {
  const footingElementsData = [];
  const footingElements = parseElements(xmlDoc, 'StbFooting');

  for (const footingEl of footingElements) {
    const id = footingEl.getAttribute('id');
    const idNode = footingEl.getAttribute('id_node');
    const idSection = footingEl.getAttribute('id_section');
    const name = footingEl.getAttribute('name');
    const guid = footingEl.getAttribute('guid');

    const levelBottom = footingEl.getAttribute('level_bottom');
    const offsetX = footingEl.getAttribute('offset_X');
    const offsetY = footingEl.getAttribute('offset_Y');
    const rotate = footingEl.getAttribute('rotate');

    if (id && idNode && idSection) {
      const elementData = {
        id: id,
        id_node: idNode,
        id_section: idSection,
        name: name,
        guid: guid || undefined,
        level_bottom: levelBottom ? parseFloat(levelBottom) : 0,
        offset_X: offsetX ? parseFloat(offsetX) : 0,
        offset_Y: offsetY ? parseFloat(offsetY) : 0,
        rotate: rotate ? parseFloat(rotate) : 0,
      };
      footingElementsData.push(elementData);
    } else {
      logger.warn(`[Data] 基礎: 必須属性が不足 (id=${id})`);
    }
  }
  logger.log(`[Load] 基礎要素読込完了: ${footingElementsData.length}個`);
  return footingElementsData;
}

/**
 * 基礎柱(FoundationColumn)要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 基礎柱要素データの配列
 */
export function extractFoundationColumnElements(xmlDoc) {
  const foundationColumnElementsData = [];
  const foundationColumnElements = parseElements(xmlDoc, 'StbFoundationColumn');

  for (const fcEl of foundationColumnElements) {
    const id = fcEl.getAttribute('id');
    const idNodeBottom = fcEl.getAttribute('id_node_bottom');
    const idNodeTop = fcEl.getAttribute('id_node_top');
    const idSection = fcEl.getAttribute('id_section');
    const name = fcEl.getAttribute('name');
    const guid = fcEl.getAttribute('guid');

    const offset_bottom_X = fcEl.getAttribute('offset_bottom_X');
    const offset_bottom_Y = fcEl.getAttribute('offset_bottom_Y');
    const offset_top_X = fcEl.getAttribute('offset_top_X');
    const offset_top_Y = fcEl.getAttribute('offset_top_Y');
    const rotate = fcEl.getAttribute('rotate');

    if (id && idNodeBottom && idNodeTop && idSection) {
      const elementData = {
        id: id,
        id_node_bottom: idNodeBottom,
        id_node_top: idNodeTop,
        id_section: idSection,
        name: name,
        guid: guid || undefined,
        offset_bottom_X: offset_bottom_X ? parseFloat(offset_bottom_X) : 0,
        offset_bottom_Y: offset_bottom_Y ? parseFloat(offset_bottom_Y) : 0,
        offset_top_X: offset_top_X ? parseFloat(offset_top_X) : 0,
        offset_top_Y: offset_top_Y ? parseFloat(offset_top_Y) : 0,
        rotate: rotate ? parseFloat(rotate) : 0,
      };
      foundationColumnElementsData.push(elementData);
    } else {
      logger.warn(`[Data] 基礎柱: 必須属性が不足 (id=${id})`);
    }
  }
  logger.log(`[Load] 基礎柱要素読込完了: ${foundationColumnElementsData.length}本`);
  return foundationColumnElementsData;
}

// ==============================================================================
// 床・壁要素の抽出関数
// ==============================================================================

/**
 * 床(Slab)要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 床要素データの配列
 */
export function extractSlabElements(xmlDoc) {
  const slabElementsData = [];
  const slabElements = parseElements(xmlDoc, 'StbSlab');

  for (const slabEl of slabElements) {
    const id = slabEl.getAttribute('id');
    const idSection = slabEl.getAttribute('id_section');
    const name = slabEl.getAttribute('name');
    const kindStructure = slabEl.getAttribute('kind_structure');
    const kindSlab = slabEl.getAttribute('kind_slab');
    const directionLoad = slabEl.getAttribute('direction_load');
    const isFoundation = slabEl.getAttribute('isFoundation');
    const guid = slabEl.getAttribute('guid');

    const nodeIdOrderEl = slabEl.getElementsByTagName('StbNodeIdOrder')[0];
    const nodeIdText = nodeIdOrderEl
      ? nodeIdOrderEl.textContent || nodeIdOrderEl.innerText || ''
      : '';
    const nodeIds = nodeIdText.trim().split(/\s+/).filter(Boolean);

    const offsets = new Map();
    const offsetList = slabEl.getElementsByTagName('StbSlabOffsetList')[0];
    if (offsetList) {
      const offsetElements = Array.from(offsetList.getElementsByTagName('StbSlabOffset'));
      for (const offsetEl of offsetElements) {
        const nodeId = offsetEl.getAttribute('id_node');
        if (nodeId) {
          offsets.set(nodeId, {
            x: parseFloat(offsetEl.getAttribute('offset_X')) || 0,
            y: parseFloat(offsetEl.getAttribute('offset_Y')) || 0,
            z: parseFloat(offsetEl.getAttribute('offset_Z')) || 0,
          });
        }
      }
    }

    if (id && idSection && nodeIds.length >= 3) {
      const elementData = {
        id: id,
        id_section: idSection,
        name: name,
        guid: guid || undefined,
        kind_structure: kindStructure,
        kind_slab: kindSlab,
        direction_load: directionLoad,
        isFoundation: isFoundation === 'true',
        node_ids: nodeIds,
        offsets: offsets,
      };
      slabElementsData.push(elementData);
    } else {
      logger.warn(`[Data] 床: 必須属性またはノードが不足 (id=${id}, nodes=${nodeIds.length})`);
    }
  }
  logger.log(`[Load] 床要素読込完了: ${slabElementsData.length}枚`);
  return slabElementsData;
}

/**
 * 壁(Wall)要素データを抽出する
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @return {Array} 壁要素データの配列
 */
export function extractWallElements(xmlDoc) {
  const wallElementsData = [];
  const wallElements = parseElements(xmlDoc, 'StbWall');

  for (const wallEl of wallElements) {
    const id = wallEl.getAttribute('id');
    const idSection = wallEl.getAttribute('id_section');
    const name = wallEl.getAttribute('name');
    const kindStructure = wallEl.getAttribute('kind_structure');
    const kindLayout = wallEl.getAttribute('kind_layout');
    const kindWall = wallEl.getAttribute('kind_wall');
    const guid = wallEl.getAttribute('guid');

    const nodeIdOrderEl = wallEl.getElementsByTagName('StbNodeIdOrder')[0];
    const nodeIdText = nodeIdOrderEl
      ? nodeIdOrderEl.textContent || nodeIdOrderEl.innerText || ''
      : '';
    const nodeIds = nodeIdText.trim().split(/\s+/).filter(Boolean);

    const offsets = new Map();
    const offsetList = wallEl.getElementsByTagName('StbWallOffsetList')[0];
    if (offsetList) {
      const offsetElements = Array.from(offsetList.getElementsByTagName('StbWallOffset'));
      for (const offsetEl of offsetElements) {
        const nodeId = offsetEl.getAttribute('id_node');
        if (nodeId) {
          offsets.set(nodeId, {
            x: parseFloat(offsetEl.getAttribute('offset_X')) || 0,
            y: parseFloat(offsetEl.getAttribute('offset_Y')) || 0,
            z: parseFloat(offsetEl.getAttribute('offset_Z')) || 0,
          });
        }
      }
    }

    const openIds = [];
    const openList = wallEl.getElementsByTagName('StbOpenIdList')[0];
    if (openList) {
      const openElements = Array.from(openList.getElementsByTagName('StbOpenId'));
      for (const openEl of openElements) {
        const openId = openEl.getAttribute('id');
        if (openId) openIds.push(openId);
      }
    }

    if (id && idSection && nodeIds.length >= 3) {
      const elementData = {
        id: id,
        id_section: idSection,
        name: name,
        guid: guid || undefined,
        kind_structure: kindStructure,
        kind_layout: kindLayout,
        kind_wall: kindWall,
        node_ids: nodeIds,
        offsets: offsets,
        open_ids: openIds,
      };
      wallElementsData.push(elementData);
    } else {
      logger.warn(`[Data] 壁: 必須属性またはノードが不足 (id=${id}, nodes=${nodeIds.length})`);
    }
  }
  logger.log(`[Load] 壁要素読込完了: ${wallElementsData.length}枚`);
  return wallElementsData;
}

// ==============================================================================
// パラペット・開口・継手・布基礎要素の抽出関数 (StbDiffViewer由来)
// ==============================================================================

/**
 * StbParapets要素からパラペット（パラペット壁）情報を抽出します。
 * パラペットは屋上の手すり壁で、2ノード間の線状要素として定義されます。
 *
 * @param {Document} xmlDoc - STB XMLドキュメント
 * @returns {Array} パラペット要素の配列
 */
export function extractParapetElements(xmlDoc) {
  const parapetElementsData = [];
  const parapetElements = parseElements(xmlDoc, 'StbParapet');

  for (const parapetEl of parapetElements) {
    const id = parapetEl.getAttribute('id');
    const idSection = parapetEl.getAttribute('id_section');
    const name = parapetEl.getAttribute('name');
    const guid = parapetEl.getAttribute('guid');
    const kindStructure = parapetEl.getAttribute('kind_structure');
    const kindLayout = parapetEl.getAttribute('kind_layout');
    const idNodeStart = parapetEl.getAttribute('id_node_start');
    const idNodeEnd = parapetEl.getAttribute('id_node_end');
    const offset = parseFloat(parapetEl.getAttribute('offset')) || 0;

    if (id && idSection && idNodeStart && idNodeEnd) {
      const elementData = {
        id: id,
        id_section: idSection,
        name: name,
        guid: guid,
        kind_structure: kindStructure,
        kind_layout: kindLayout,
        id_node_start: idNodeStart,
        id_node_end: idNodeEnd,
        offset: offset,
      };
      parapetElementsData.push(elementData);
    } else {
      logger.warn(
        `[Data] パラペット: 必須属性が不足 (id=${id}, id_node_start=${idNodeStart}, id_node_end=${idNodeEnd})`,
      );
    }
  }
  logger.log(`[Load] パラペット要素読込完了: ${parapetElementsData.length}枚`);
  return parapetElementsData;
}

/**
 * StbOpens要素から開口情報を抽出します。
 * 開口情報は壁に関連付けられ、3D表示およびIFCエクスポートで使用されます。
 *
 * @param {Document} xmlDoc - STB XMLドキュメント
 * @returns {Map<string, Object>} 開口IDをキーとする開口情報のMap
 */
export function extractOpeningElements(xmlDoc) {
  const openingMap = new Map();
  const version = detectStbVersion(xmlDoc);

  if (version === '2.1.0') {
    // STB 2.1.0: StbOpenArrangement から開口情報を取得
    extractOpeningsFromArrangements(xmlDoc, openingMap);
  } else {
    // STB 2.0.2: StbOpen から開口情報を取得
    extractOpeningsFromStbOpen(xmlDoc, openingMap);
  }

  logger.log(`[Load] 開口要素読込完了: ${openingMap.size}個 (${version})`);
  return openingMap;
}

/**
 * STB 2.0.2形式: StbOpen要素から開口情報を抽出
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {Map} openingMap - 開口マップ
 */
function extractOpeningsFromStbOpen(xmlDoc, openingMap) {
  const openElements = parseElements(xmlDoc, 'StbOpen');

  for (const openEl of openElements) {
    const id = openEl.getAttribute('id');
    if (!id) continue;

    const posX =
      parseFloat(openEl.getAttribute('position_X') || openEl.getAttribute('offset_X')) || 0;
    const posY =
      parseFloat(openEl.getAttribute('position_Y') || openEl.getAttribute('offset_Y')) || 0;

    const opening = {
      id: id,
      name: openEl.getAttribute('name') || '',
      guid: openEl.getAttribute('guid') || '',
      id_section: openEl.getAttribute('id_section') || '',
      position_X: posX,
      position_Y: posY,
      offset_X: posX,
      offset_Y: posY,
      offset_Z: parseFloat(openEl.getAttribute('offset_Z')) || 0,
      length_X: parseFloat(openEl.getAttribute('length_X')) || 0,
      length_Y: parseFloat(openEl.getAttribute('length_Y')) || 0,
      rotate: parseFloat(openEl.getAttribute('rotate')) || 0,
      sourceVersion: '2.0.2',
    };

    openingMap.set(id, opening);
  }
}

/**
 * STB 2.1.0形式: StbOpenArrangement要素から開口情報を抽出
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {Map} openingMap - 開口マップ
 */
function extractOpeningsFromArrangements(xmlDoc, openingMap) {
  // 開口セクションマップを構築（length_X, length_Yを取得するため）
  const openingSectionMap = buildOpeningSectionMap(xmlDoc);

  const arrangements = parseElements(xmlDoc, 'StbOpenArrangement');

  for (const arr of arrangements) {
    const id = arr.getAttribute('id');
    if (!id) continue;

    const idSection = arr.getAttribute('id_section') || '';
    const sectionData = openingSectionMap.get(idSection) || {};

    const opening = {
      id: id,
      name: arr.getAttribute('name') || '',
      guid: arr.getAttribute('guid') || '',
      id_section: idSection,
      id_member: arr.getAttribute('id_member') || '',
      kind_member: arr.getAttribute('kind_member') || '',
      position_X: parseFloat(arr.getAttribute('position_X')) || 0,
      position_Y: parseFloat(arr.getAttribute('position_Y')) || 0,
      offset_X: parseFloat(arr.getAttribute('offset_X')) || 0,
      offset_Y: parseFloat(arr.getAttribute('offset_Y')) || 0,
      offset_Z: parseFloat(arr.getAttribute('offset_Z')) || 0,
      rotate: parseFloat(arr.getAttribute('rotate')) || 0,
      length_X: sectionData.length_X || 0,
      length_Y: sectionData.length_Y || 0,
      sourceVersion: '2.1.0',
    };

    openingMap.set(id, opening);
  }
}

/**
 * 開口セクションマップを構築
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {Map<string, Object>} 開口セクションマップ
 */
function buildOpeningSectionMap(xmlDoc) {
  const sectionMap = new Map();
  const openSections = parseElements(xmlDoc, 'StbSecOpen_RC');

  for (const sec of openSections) {
    const id = sec.getAttribute('id');
    if (!id) continue;

    sectionMap.set(id, {
      id: id,
      name: sec.getAttribute('name') || '',
      length_X: parseFloat(sec.getAttribute('length_X')) || 0,
      length_Y: parseFloat(sec.getAttribute('length_Y')) || 0,
    });
  }

  return sectionMap;
}

/**
 * StbJoints要素から継手情報を抽出します。
 * 継手は鋼構造の梁・柱接合部の詳細情報を定義します。
 *
 * @param {Document} xmlDoc - STB XMLドキュメント
 * @returns {Map<string, Object>} 継手IDをキーとする継手情報のMap
 */
export function extractJointElements(xmlDoc) {
  const jointMap = new Map();

  const jointTypes = [
    { tag: 'StbJointBeamShapeH', type: 'BeamShapeH' },
    { tag: 'StbJointColumnShapeH', type: 'ColumnShapeH' },
    { tag: 'StbJointBeamShapeBox', type: 'BeamShapeBox' },
    { tag: 'StbJointColumnShapeBox', type: 'ColumnShapeBox' },
    { tag: 'StbJointBeamShapeT', type: 'BeamShapeT' },
    { tag: 'StbJointColumnShapeT', type: 'ColumnShapeT' },
  ];

  for (const { tag, type } of jointTypes) {
    const elements = parseElements(xmlDoc, tag);
    for (const el of elements) {
      const id = el.getAttribute('id');
      if (!id) continue;

      const joint = {
        id: id,
        joint_name: el.getAttribute('joint_name') || '',
        joint_mark: el.getAttribute('joint_mark') || '',
        joint_type: type,
      };

      // 共通形状情報
      const shapeEl = el.querySelector
        ? el.querySelector('StbJointShapeH, StbJointShapeBox, StbJointShapeT')
        : null;
      if (shapeEl) {
        joint.shape = {
          strength_plate: shapeEl.getAttribute('strength_plate') || '',
          strength_bolt: shapeEl.getAttribute('strength_bolt') || '',
          name_bolt: shapeEl.getAttribute('name_bolt') || '',
          clearance: parseFloat(shapeEl.getAttribute('clearance')) || 0,
        };
      }

      // フランジ情報
      const flangeEl = el.querySelector
        ? el.querySelector('StbJointShapeHFlange, StbJointShapeBoxFlange, StbJointShapeTFlange')
        : null;
      if (flangeEl) {
        joint.flange = {
          nf: parseInt(flangeEl.getAttribute('nf')) || 0,
          mf: parseInt(flangeEl.getAttribute('mf')) || 0,
          g1: parseFloat(flangeEl.getAttribute('g1')) || 0,
          pitch: parseFloat(flangeEl.getAttribute('pitch')) || 0,
          e1: parseFloat(flangeEl.getAttribute('e1')) || 0,
          outside_thickness: parseFloat(flangeEl.getAttribute('outside_thickness')) || 0,
          outside_width: parseFloat(flangeEl.getAttribute('outside_width')) || 0,
          outside_length: parseFloat(flangeEl.getAttribute('outside_length')) || 0,
          inside_thickness: parseFloat(flangeEl.getAttribute('inside_thickness')) || 0,
          inside_width: parseFloat(flangeEl.getAttribute('inside_width')) || 0,
          inside_length: parseFloat(flangeEl.getAttribute('inside_length')) || 0,
          bolt_length: parseFloat(flangeEl.getAttribute('bolt_length')) || 0,
          isZigzag: flangeEl.getAttribute('isZigzag') === 'true',
        };
      }

      // ウェブ情報
      const webEl = el.querySelector
        ? el.querySelector('StbJointShapeHWeb, StbJointShapeBoxWeb, StbJointShapeTWeb')
        : null;
      if (webEl) {
        joint.web = {
          mw: parseInt(webEl.getAttribute('mw')) || 0,
          nw: parseInt(webEl.getAttribute('nw')) || 0,
          pitch_depth: parseFloat(webEl.getAttribute('pitch_depth')) || 0,
          pitch: parseFloat(webEl.getAttribute('pitch')) || 0,
          e1: parseFloat(webEl.getAttribute('e1')) || 0,
          plate_thickness: parseFloat(webEl.getAttribute('plate_thickness')) || 0,
          plate_width: parseFloat(webEl.getAttribute('plate_width')) || 0,
          plate_length: parseFloat(webEl.getAttribute('plate_length')) || 0,
          bolt_length: parseFloat(webEl.getAttribute('bolt_length')) || 0,
        };
      }

      jointMap.set(id, joint);
    }
  }

  logger.log(`[Load] 継手要素読込完了: ${jointMap.size}個`);
  return jointMap;
}

/**
 * StbJointArrangements要素から継手配置情報を抽出します。
 * 継手配置情報は、どの部材のどの端部にどの継手が配置されているかを定義します。
 *
 * @param {Document} xmlDoc - STB XMLドキュメント
 * @returns {Array<Object>} 継手配置情報の配列
 */
export function extractJointArrangements(xmlDoc) {
  const jointArrangements = [];
  const arrangementElements = parseElements(xmlDoc, 'StbJointArrangement');

  for (const arrEl of arrangementElements) {
    const id = arrEl.getAttribute('id');
    // STB 2.1.0以降: id_section、STB 2.0.x: idで継手定義を参照
    const idSection = arrEl.getAttribute('id_section') || arrEl.getAttribute('id');
    const kindMember = arrEl.getAttribute('kind_member');
    const idMember = arrEl.getAttribute('id_member');
    // STB 2.1.0以降: starting_point、STB 2.0.x: pos
    const startingPoint = arrEl.getAttribute('starting_point') || arrEl.getAttribute('pos');

    if (id && kindMember && idMember && startingPoint) {
      jointArrangements.push({
        id: id,
        id_section: idSection, // 継手定義のID
        kind_member: kindMember, // COLUMN, POST, GIRDER, BEAM, BRACE
        id_member: idMember, // 部材ID
        starting_point: startingPoint, // START or END
        name: arrEl.getAttribute('name') || '',
        guid: arrEl.getAttribute('guid') || '',
      });
    } else {
      logger.warn(
        `[Data] 継手配置: 必須属性が不足 (id=${id}, section=${idSection}, member=${kindMember}/${idMember}, pos=${startingPoint})`,
      );
    }
  }

  logger.log(`[Load] 継手配置情報読込完了: ${jointArrangements.length}個`);
  return jointArrangements;
}

/**
 * 継手配置情報を部材要素に適用します。
 * 各部材に joint_id_start / joint_id_end 属性を追加します。
 *
 * @param {Array<Object>} elements - 部材要素の配列
 * @param {Array<Object>} jointArrangements - 継手配置情報の配列
 * @param {string} kindMember - 部材種別 (COLUMN, POST, GIRDER, BEAM, BRACE)
 * @returns {Array<Object>} 継手ID属性が追加された部材要素の配列
 */
export function applyJointArrangementsToElements(elements, jointArrangements, kindMember) {
  if (!elements || elements.length === 0) return elements;
  if (!jointArrangements || jointArrangements.length === 0) return elements;

  // 部材種別でフィルタリング
  const relevantArrangements = jointArrangements.filter(
    (arr) => arr.kind_member.toUpperCase() === kindMember.toUpperCase(),
  );

  if (relevantArrangements.length === 0) return elements;

  // 部材IDをキーとしたマップを作成（STARTとENDを分けて管理）
  const startJointMap = new Map();
  const endJointMap = new Map();

  for (const arr of relevantArrangements) {
    if (arr.starting_point.toUpperCase() === 'START') {
      startJointMap.set(arr.id_member, arr.id_section);
    } else if (arr.starting_point.toUpperCase() === 'END') {
      endJointMap.set(arr.id_member, arr.id_section);
    }
  }

  // 各部材要素に継手IDを付与
  let appliedCount = 0;
  for (const element of elements) {
    const elementId = element.id;
    if (startJointMap.has(elementId)) {
      element.joint_id_start = startJointMap.get(elementId);
      appliedCount++;
    }
    if (endJointMap.has(elementId)) {
      element.joint_id_end = endJointMap.get(elementId);
      appliedCount++;
    }
  }

  if (appliedCount > 0) {
    logger.log(`[Load] ${kindMember}: ${appliedCount}個の継手IDを付与`);
  }

  return elements;
}

/**
 * StbStripFootings要素から布基礎情報を抽出します。
 * 布基礎は壁下に連続して設置される基礎で、2ノード間の線状要素として定義されます。
 *
 * @param {Document} xmlDoc - STB XMLドキュメント
 * @returns {Array} 布基礎要素の配列
 */
export function extractStripFootingElements(xmlDoc) {
  const stripFootingElementsData = [];
  const stripFootingElements = parseElements(xmlDoc, 'StbStripFooting');

  for (const stripFootingEl of stripFootingElements) {
    const id = stripFootingEl.getAttribute('id');
    const idSection = stripFootingEl.getAttribute('id_section');
    const name = stripFootingEl.getAttribute('name');
    const guid = stripFootingEl.getAttribute('guid');
    const kindStructure = stripFootingEl.getAttribute('kind_structure');
    const idNodeStart = stripFootingEl.getAttribute('id_node_start');
    const idNodeEnd = stripFootingEl.getAttribute('id_node_end');
    const level = parseFloat(stripFootingEl.getAttribute('level')) || 0;
    const offset = parseFloat(stripFootingEl.getAttribute('offset')) || 0;

    if (id && idSection && idNodeStart && idNodeEnd) {
      const elementData = {
        id,
        id_section: idSection,
        name,
        guid,
        kind_structure: kindStructure,
        id_node_start: idNodeStart,
        id_node_end: idNodeEnd,
        level,
        offset,
      };
      stripFootingElementsData.push(elementData);
    } else {
      logger.warn(
        `[Data] 布基礎: 必須属性が不足 (id=${id}, section=${idSection}, nodes=${idNodeStart}/${idNodeEnd})`,
      );
    }
  }

  logger.log(`[Load] 布基礎要素読込完了: ${stripFootingElementsData.length}個`);
  return stripFootingElementsData;
}

// ==============================================================================
// エクスポート（名前空間定数・バージョン検出関数）
// ==============================================================================
export { STB_NAMESPACE };
export { detectStbVersion, getVersionInfo, isVersion210, isVersion202 };
