/**
 * @fileoverview STB XMLパーサー コアモジュール
 *
 * パーサー共通の基盤機能を提供します:
 * - ロガー設定
 * - StbExtensionsパーサー
 * - 汎用要素パース関数
 * - ノードマップ構築
 * - 階情報・通り芯情報パース
 * - ノード所属情報ルックアップ構築
 *
 * @module common/stb/parser/stbParserCore
 */

// --- 定数 ---
const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl';

import { createLogger } from '../../../utils/logger.js';

const _log = createLogger('common-stb:parser:stbXmlParser');

// --- ロガー設定 ---
// デフォルトはcreateLogger、外部から差し替え可能
let logger = {
  log: (...args) => _log.info(...args),
  warn: (...args) => _log.warn(...args),
  debug: (...args) => _log.debug(...args),
  error: (...args) => _log.error(...args),
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

/**
 * 内部ロガーを取得する（サブモジュール向け）
 * @returns {Object} ロガーオブジェクト
 */
export function getLogger() {
  return logger;
}

// --- StbExtensions パーサー ---
/**
 * StbExtensionsからSS7拡張プロパティを読み込む
 * @param {Document} doc - XML ドキュメント
 * @param {string} objectName - 対象オブジェクト名 (e.g. 'StbNode', 'StbGirder')
 * @returns {Map<string, Object>} id → { key: value, ... } マップ
 */
const _stbExtCache = new WeakMap();
export function parseStbExtensions(doc, objectName) {
  // ドキュメント単位でキャッシュ
  if (!_stbExtCache.has(doc)) {
    const allExtMap = new Map();
    const extObjects = doc.getElementsByTagName('StbExtObject');
    for (let i = 0; i < extObjects.length; i++) {
      const extObj = extObjects[i];
      const objName = extObj.getAttribute('object_name');
      const idObj = extObj.getAttribute('id_object');
      if (!objName || !idObj) continue;

      const props = {};
      const propEls = extObj.getElementsByTagName('StbExtProperty');
      for (let j = 0; j < propEls.length; j++) {
        const key = propEls[j].getAttribute('key');
        const value = propEls[j].getAttribute('value');
        if (key) props[key] = value || '';
      }

      if (!allExtMap.has(objName)) allExtMap.set(objName, new Map());
      allExtMap.get(objName).set(idObj, props);
    }
    _stbExtCache.set(doc, allExtMap);
  }

  const cached = _stbExtCache.get(doc);
  return cached.get(objectName) || new Map();
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
      if (elements) {
        return Array.from(elements);
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
 * @param {Object} [options] - オプション設定
 * @param {boolean} [options.includeNodeIds=false] - node_idsを含めるかどうか（デフォルト: false）
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
 * @param {Object} [options] - オプション設定
 * @param {boolean} [options.includeNodeIds=false] - node_idsを含めるかどうか（デフォルト: false）
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

  // SS7原典グリッド属性（StbExtensions経由）によるフォールバック補完
  // 節点同一化・軸振れ等でStbParallelAxisのNodeIdListに登録されなかったノードや
  // getFramePath で shared=[] になるノードを正しくマップするために使用
  const ss7ExtMap = parseStbExtensions(doc, 'StbNode');
  for (const [nodeId, props] of ss7ExtMap) {
    const ss7X = props.ss7_x;
    const ss7Y = props.ss7_y;
    const ss7Story = props.ss7_story;
    if (!ss7X || !ss7Y) continue;

    if (!lookup.has(nodeId)) {
      lookup.set(nodeId, { storyName: null, axisNames: [] });
    }
    const entry = lookup.get(nodeId);
    // ss7_story で storyName を上書き（より信頼性が高い）
    if (ss7Story) entry.storyName = ss7Story;
    // ss7_x/ss7_y で axisNames を上書き（NodeIdList依存より正確）
    entry.axisNames = [ss7X, ss7Y];
  }

  logger.log(`[Load] ノード所属情報ルックアップ構築完了: ${lookup.size}ノード`);
  return lookup;
}

export { STB_NAMESPACE };
