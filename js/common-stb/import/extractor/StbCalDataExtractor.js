/**
 * @fileoverview STB計算データ（StbCalData）パーサー
 *
 * ST-Bridge形式の計算データ（荷重条件、荷重ケース、部材荷重など）を解析します。
 * 荷重可視化機能の基盤となるモジュールです。
 *
 * 対応要素:
 * - StbCalLoadCases: 荷重ケース定義
 * - StbCalMemberLoad: 部材特殊荷重
 * - StbCalLoadArrangements: 荷重配置
 */

// --- 定数 ---
const STB_NAMESPACE = 'https://www.building-smart.or.jp/dl';

/**
 * 荷重タイプの定義
 * STB計算データ編仕様に基づく
 */
export const LOAD_TYPES = {
  POINT_LOADS: 1, // 集中荷重（複数点） P1(N), L1(mm), P2(N), L2(mm)...
  MOMENT_LOADS: 2, // モーメント荷重（複数点） M1(Nmm), L1(mm)...
  EQUAL_POINT_LOADS: 3, // 等間隔集中荷重 P(N), 個数
  UNIFORM_LOAD: 4, // 等分布荷重 w(N/mm)
  PARTIAL_UNIFORM: 5, // 部分等分布荷重 w(N/mm), L(mm)
  TRAPEZOIDAL_1: 6, // 台形分布荷重1 w1, w2, L1, L2
  TRAPEZOIDAL_2: 7, // 台形分布荷重2
  THREE_POINT_1: 8, // 三点分布荷重1
  THREE_POINT_2: 9, // 三点分布荷重2
  CMQ_VALUES: 10, // CMQ値指定
  AREA_LOAD_1: 11, // 面荷重1
  AREA_LOAD_2: 12, // 面荷重2
  AREA_LOAD_3: 13, // 面荷重3
  AREA_LOAD_4: 14, // 面荷重4
};

/**
 * 荷重ケースカテゴリ
 */
const LOAD_CASE_CATEGORY = {
  STANDARD: 'STANDARD', // 標準荷重
  ANALYSIS: 'ANALYSIS', // 解析用荷重
};

/**
 * 座標系タイプ
 */
const COORDINATE_SYSTEM = {
  LOCAL: 'LOCAL', // 部材座標系
  GLOBAL: 'GLOBAL', // 全体座標系（実長）
  PROJECTION: 'PROJECTION', // 全体座標系（投影）
};

const STB_LOAD_TYPES = {
  CONCENTRATED: 1,
  MOMENT: 2,
  CONCENTRATED_BYNUMBER: 3,
  DISTRIBUTED_UNIFORM: 4,
  DISTRIBUTED_TRIANGLE: 5,
  DISTRIBUTED_ISOSCELESTRIANGLE: 6,
  DISTRIBUTED_QUADRILATERAL1: 7,
  DISTRIBUTED_QUADRILATERAL2: 8,
  DISTRIBUTED_3POINT_SPECIFY1: 9,
  DISTRIBUTED_3POINT_SPECIFY2: 10,
  INPUT_CMQ: 11,
  TORTOISE_SHELL1: 12,
  TORTOISE_SHELL2: 13,
  TORTOISE_SHELL3: 14,
};

const STB_LOAD_CASE_KIND = {
  DEADLOAD: 'DL',
  LIVELOAD_FRAME: 'LL',
  LIVELOAD_SEISMIC: 'LLe',
  SNOWLOAD: 'S',
  WINDLOAD: 'W',
  SEISMICLOAD: 'K',
  OTHER: 'T',
};

/**
 * XMLドキュメントからStbCalDataを解析
 * @param {Document} doc - XMLドキュメント
 * @returns {Object|null} 計算データオブジェクト
 */
export function parseStbCalData(doc) {
  if (!doc) return null;

  const calData = doc.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalData')[0];
  if (!calData) {
    return null;
  }

  const result = {
    loadCondition: parseLoadCondition(calData),
    loadCases: parseLoadCases(calData),
    memberLoads: parseMemberLoads(calData),
    loadArrangements: parseLoadArrangements(calData),
  };

  return result;
}

/**
 * 荷重条件を解析
 * @param {Element} calData - StbCalData要素
 * @returns {Object} 荷重条件
 */
function parseLoadCondition(calData) {
  const condition = calData.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalLoadCondition')[0];
  if (!condition) return null;

  const result = {};

  // 地震荷重条件
  const seismic = condition.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalSeismicCondition')[0];
  if (seismic) {
    result.seismic = {
      zone: seismic.getAttribute('zone'),
      soil: seismic.getAttribute('soil'),
    };
  }

  // 風荷重条件
  const wind = condition.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalWindCondition')[0];
  if (wind) {
    result.wind = {
      roughness: wind.getAttribute('roughness'),
      windSpeed: parseFloat(wind.getAttribute('wind_speed')) || 0,
      height: parseFloat(wind.getAttribute('height')) || 0,
    };
  }

  // 積雪荷重条件
  const snow = condition.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalSnowCondition')[0];
  if (snow) {
    result.snow = {
      unitWeight: parseFloat(snow.getAttribute('unit_weight')) || 0,
      depth: parseFloat(snow.getAttribute('snow_depth')) || 0,
    };
  }

  // 積載荷重
  const liveloads = condition.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalLiveload');
  result.liveloads = Array.from(liveloads).map((ll) => ({
    id: ll.getAttribute('id'),
    name: ll.getAttribute('name'),
    type: parseInt(ll.getAttribute('type')) || 0,
    slabLoad: parseFloat(ll.getAttribute('liveload_slab')) || 0,
    beamLoad: parseFloat(ll.getAttribute('liveload_beam')) || 0,
    frameLoad: parseFloat(ll.getAttribute('liveload_frame')) || 0,
    seismicLoad: parseFloat(ll.getAttribute('liveload_seismic')) || 0,
  }));

  return result;
}

/**
 * 荷重ケースを解析
 * @param {Element} calData - StbCalData要素
 * @returns {Array} 荷重ケース配列
 */
function parseLoadCases(calData) {
  const loadCasesEl = calData.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalLoadCases')[0];
  if (!loadCasesEl) return [];

  const cases = loadCasesEl.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalLoadCase');
  return Array.from(cases).map((lc) => ({
    id: lc.getAttribute('id'),
    name: lc.getAttribute('name'),
    category: lc.getAttribute('category') || LOAD_CASE_CATEGORY.STANDARD,
    kind:
      STB_LOAD_CASE_KIND[(lc.getAttribute('kind') || '').toUpperCase()] ||
      lc.getAttribute('kind') ||
      'DL',
    direction: parseFloat(lc.getAttribute('direction')) || 0,
  }));
}

/**
 * 部材荷重を解析
 * @param {Element} calData - StbCalData要素
 * @returns {Array} 部材荷重配列
 */
function parseMemberLoads(calData) {
  const additionalLoads = calData.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalAdditionalLoads')[0];
  if (!additionalLoads) return [];

  const memberLoads = additionalLoads.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalMemberLoad');
  return Array.from(memberLoads).map((ml) => ({
    id: ml.getAttribute('id'),
    loadCaseId: ml.getAttribute('id_loadcase'),
    loadCaseName: ml.getAttribute('loadcase'),
    type: _parseLoadType(ml.getAttribute('type')),
    P1: parseFloat(ml.getAttribute('P1')) || 0,
    P2: parseFloat(ml.getAttribute('P2')) || null,
    P3: parseFloat(ml.getAttribute('P3')) || null,
    P4: parseFloat(ml.getAttribute('P4')) || null,
    P5: parseFloat(ml.getAttribute('P5')) || null,
    P6: parseFloat(ml.getAttribute('P6')) || null,
    coordinateSystem: _parseCoordinateSystem(
      ml.getAttribute('direction_load'),
      ml.getAttribute('coordinate_load'),
    ),
    directionLoad: _parseDirectionLoad(
      ml.getAttribute('direction_load'),
      ml.getAttribute('coordinate_load'),
    ),
    description: ml.getAttribute('description') || '',
  }));
}

function _parseCoordinateSystem(directionLoadAttr, coordinateLoadAttr) {
  const upperDirection = (directionLoadAttr || '').toUpperCase();
  if (
    upperDirection === 'LOCAL' ||
    upperDirection === 'GLOBAL' ||
    upperDirection === 'PROJECTION'
  ) {
    return upperDirection;
  }

  const upperCoordinate = (coordinateLoadAttr || '').toUpperCase();
  if (
    upperCoordinate === 'LOCAL' ||
    upperCoordinate === 'GLOBAL' ||
    upperCoordinate === 'PROJECTION'
  ) {
    return upperCoordinate;
  }

  return COORDINATE_SYSTEM.LOCAL;
}

function _parseDirectionLoad(directionLoadAttr, coordinateLoadAttr) {
  const upperDirection = (directionLoadAttr || '').toUpperCase();
  if (_isDirectionAxisToken(upperDirection)) {
    return upperDirection;
  }

  const upperCoordinate = (coordinateLoadAttr || '').toUpperCase();
  if (_isDirectionAxisToken(upperCoordinate)) {
    return upperCoordinate;
  }

  // 方向情報が明示されていない場合は、SS7由来データとの整合を取りやすくするため Z を既定値にする
  return 'Z';
}

function _isDirectionAxisToken(token) {
  if (!token) return false;
  return [
    'X',
    '+X',
    '-X',
    'UX',
    'DX',
    'Y',
    '+Y',
    '-Y',
    'UY',
    'DY',
    'Z',
    '+Z',
    '-Z',
    'UZ',
    'DZ',
  ].includes(token);
}

/**
 * STBの荷重種別文字列/数値をDisplayManagerが利用する数値型へ変換
 *
 * @param {string|number|null} rawType
 * @returns {number}
 */
function _parseLoadType(rawType) {
  if (rawType == null) return 0;
  const asNumber = Number.parseInt(rawType, 10);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }
  const normalized = String(rawType).trim().toUpperCase();
  return STB_LOAD_TYPES[normalized] || 0;
}

/**
 * 荷重配置を解析
 * @param {Element} calData - StbCalData要素
 * @returns {Object} 荷重配置マッピング
 */
function parseLoadArrangements(calData) {
  const arrangements = calData.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalLoadArrangements')[0];
  if (!arrangements) return {};

  const result = {
    columns: parseColumnLoadArrangements(arrangements),
    girders: parseGirderLoadArrangements(arrangements),
    beams: parseBeamLoadArrangements(arrangements),
  };

  return result;
}

/**
 * 柱荷重配置を解析
 * @param {Element} arrangements - StbCalLoadArrangements要素
 * @returns {Map} 部材ID→荷重IDマッピング
 */
function parseColumnLoadArrangements(arrangements) {
  const result = new Map();
  const columnArrs = arrangements.getElementsByTagNameNS(
    STB_NAMESPACE,
    'StbCalColumnMemberLoadArr',
  );

  for (const arr of columnArrs) {
    const loadListEl = arr.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalColumnMemberLoadList')[0];
    const memListEl = arr.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalColumnMemberLoadMemList')[0];

    if (loadListEl && memListEl) {
      const loadIds = loadListEl.textContent.trim().split(/\s+/);
      const memberIds = memListEl.textContent.trim().split(/\s+/);

      for (const memberId of memberIds) {
        if (!result.has(memberId)) {
          result.set(memberId, []);
        }
        result.get(memberId).push(...loadIds);
      }
    }
  }

  return result;
}

/**
 * 大梁荷重配置を解析
 * @param {Element} arrangements - StbCalLoadArrangements要素
 * @returns {Map} 部材ID→荷重IDマッピング
 */
function parseGirderLoadArrangements(arrangements) {
  const result = new Map();
  const girderArrs = arrangements.getElementsByTagNameNS(
    STB_NAMESPACE,
    'StbCalGirderMemberLoadArr',
  );

  for (const arr of girderArrs) {
    const loadListEl = arr.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalGirderMemberLoadList')[0];
    const memListEl = arr.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalGirderMemberLoadMemList')[0];

    if (loadListEl && memListEl) {
      const loadIds = loadListEl.textContent.trim().split(/\s+/);
      const memberIds = memListEl.textContent.trim().split(/\s+/);

      for (const memberId of memberIds) {
        if (!result.has(memberId)) {
          result.set(memberId, []);
        }
        result.get(memberId).push(...loadIds);
      }
    }
  }

  return result;
}

/**
 * 小梁荷重配置を解析
 * @param {Element} arrangements - StbCalLoadArrangements要素
 * @returns {Map} 部材ID→荷重IDマッピング
 */
function parseBeamLoadArrangements(arrangements) {
  const result = new Map();
  const beamArrs = arrangements.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalBeamMemberLoadArr');

  for (const arr of beamArrs) {
    const loadListEl = arr.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalBeamMemberLoadList')[0];
    const memListEl = arr.getElementsByTagNameNS(STB_NAMESPACE, 'StbCalBeamMemberLoadMemList')[0];

    if (loadListEl && memListEl) {
      const loadIds = loadListEl.textContent.trim().split(/\s+/);
      const memberIds = memListEl.textContent.trim().split(/\s+/);

      for (const memberId of memberIds) {
        if (!result.has(memberId)) {
          result.set(memberId, []);
        }
        result.get(memberId).push(...loadIds);
      }
    }
  }

  return result;
}

/**
 * 荷重データをIDで検索
 * @param {Array} memberLoads - 部材荷重配列
 * @param {string} loadId - 荷重ID
 * @returns {Object|null} 荷重データ
 */
function findMemberLoadById(memberLoads, loadId) {
  return memberLoads.find((ml) => ml.id === loadId) || null;
}

/**
 * 部材に配置された荷重を取得
 * @param {Object} calData - 計算データ
 * @param {string} memberType - 部材タイプ（'columns', 'girders', 'beams'）
 * @param {string} memberId - 部材ID
 * @returns {Array} 配置された荷重の配列
 */
export function getMemberLoads(calData, memberType, memberId) {
  if (!calData || !calData.loadArrangements || !calData.loadArrangements[memberType]) {
    return [];
  }

  const loadIds = calData.loadArrangements[memberType].get(memberId) || [];
  return loadIds
    .map((id) => findMemberLoadById(calData.memberLoads, id))
    .filter((load) => load !== null);
}

/**
 * 荷重タイプの説明を取得
 * @param {number} type - 荷重タイプ
 * @returns {string} 説明文字列
 */
export function getLoadTypeDescription(type) {
  const descriptions = {
    1: '集中荷重（複数点）',
    2: 'モーメント荷重（複数点）',
    3: '等間隔集中荷重',
    4: '等分布荷重',
    5: '部分等分布荷重',
    6: '台形分布荷重',
    7: '台形分布荷重（逆）',
    8: '三点分布荷重',
    9: '三点分布荷重（逆）',
    10: 'CMQ値指定',
    11: '面荷重（台形）',
    12: '面荷重（部分）',
    13: '面荷重（三点）',
    14: '面荷重（等間隔）',
  };
  return descriptions[type] || `タイプ${type}`;
}

/**
 * 荷重ケースの色を取得
 * @param {string} kind - 荷重ケース種別
 * @returns {number} Three.js用の色値
 */
export function getLoadCaseColor(kind) {
  const colors = {
    DL: 0x4caf50, // 緑: 固定荷重
    LL: 0x2196f3, // 青: 積載荷重
    LLf: 0x2196f3,
    LLe: 0x2196f3,
    S: 0x00bcd4, // シアン: 積雪荷重
    W: 0x9c27b0, // 紫: 風荷重
    K: 0xf44336, // 赤: 地震荷重
    T: 0xff9800, // オレンジ: 温度荷重
  };
  return colors[kind] || 0x757575;
}
