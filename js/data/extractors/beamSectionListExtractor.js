/**
 * @fileoverview RC梁断面リスト用データ抽出モジュール
 *
 * STBファイルからRC梁断面リストに必要なデータを抽出し、
 * グリッド形式（階×符号マトリクス）で返します。
 * STB v2.0.2と v2.1の両方に対応しており、バージョンごとに
 * 異なるパーサーロジックを使用します。
 *
 * @module data/extractors/beamSectionListExtractor
 */

import { isVersion210, isVersion202 } from '../../common-stb/parser/utils/versionDetector.js';
import {
  extractBeamMainBar,
  extractStirrupInfo as extractStirrupInfoFromBar,
  extractWebBarInfo as extractWebBarInfoFromBar,
} from '../../common-stb/utils/barArrangementExtractor.js';

const STB_NS = 'https://www.building-smart.or.jp/dl';

/**
 * 要素を取得するヘルパー（名前空間対応）
 * @param {Element} parent - 親要素
 * @param {string} selector - セレクタ
 * @returns {Element|null}
 */
function querySelector(parent, selector) {
  if (!parent) return null;
  try {
    const result = parent.querySelector(selector);
    if (result) return result;
  } catch (_) {
    // querySelector失敗時は名前空間フォールバック
  }
  if (typeof parent.getElementsByTagNameNS === 'function') {
    const nsList = parent.getElementsByTagNameNS(STB_NS, selector);
    if (nsList && nsList.length > 0) return nsList[0];
  }
  // 直接子要素検索
  const children = parent.children || [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName === selector || children[i].localName === selector) {
      return children[i];
    }
  }
  return null;
}

/**
 * 複数要素を取得するヘルパー
 * @param {Element} parent - 親要素
 * @param {string} selector - セレクタ
 * @returns {Element[]}
 */
function querySelectorAll(parent, selector) {
  if (!parent) return [];
  const results = [];
  try {
    const nodeList = parent.querySelectorAll(selector);
    if (nodeList && nodeList.length > 0) {
      nodeList.forEach((el) => results.push(el));
      return results;
    }
  } catch (_) {
    // querySelector失敗時は名前空間フォールバック
  }
  if (typeof parent.getElementsByTagNameNS === 'function') {
    const nsList = parent.getElementsByTagNameNS(STB_NS, selector);
    for (let i = 0; i < nsList.length; i++) {
      results.push(nsList[i]);
    }
    if (results.length > 0) return results;
  }
  // 再帰的に子要素を検索
  function findAll(el) {
    const children = el.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.tagName === selector || child.localName === selector) {
        results.push(child);
      }
      findAll(child);
    }
  }
  findAll(parent);
  return results;
}

/**
 * StbStory一覧を抽出（階データ）
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {Map<string, Object>} id → {id, name, level, nodeIds}
 */
function extractStories(xmlDoc) {
  const stories = new Map();
  const storyElements = querySelectorAll(xmlDoc, 'StbStory');

  storyElements.forEach((el) => {
    const id = el.getAttribute('id');
    const name = el.getAttribute('name') || `階${id}`;
    const levelAttr = el.getAttribute('level');
    const parsedLevel =
      levelAttr !== null && levelAttr !== '' ? Number.parseFloat(levelAttr) : Number.NaN;
    const level = Number.isFinite(parsedLevel) ? parsedLevel : null;

    // このStoryに属するノードIDを抽出
    const nodeIds = new Set();
    const nodeIdElements = querySelectorAll(el, 'StbNodeId');
    nodeIdElements.forEach((nodeEl) => {
      const nodeId = nodeEl.getAttribute('id');
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    });

    if (id) {
      stories.set(id, { id, name, level, nodeIds });
    }
  });

  return stories;
}

/**
 * 階名の順序値を取得（降順ソート用）
 * @param {string} name - 階名（例: "1FL", "RFL", "PH1", "B1"）
 * @returns {number} 大きいほど上階
 */
function getFloorSortOrder(name) {
  if (!name) return 0;

  const upper = String(name).toUpperCase().trim();

  if (upper === 'PH' || upper.startsWith('PH')) {
    const phNum = Number.parseInt((upper.match(/^PH(\d*)$/) || [])[1] || '0', 10);
    return 20000 + (Number.isFinite(phNum) ? phNum : 0);
  }

  if (upper === 'R' || upper === 'RF' || upper === 'RFL' || upper.startsWith('RF')) {
    const rfNum = Number.parseInt((upper.match(/^RF(\d*)$/) || [])[1] || '0', 10);
    return 10000 + (Number.isFinite(rfNum) ? rfNum : 0);
  }

  const basementMatch = upper.match(/^B(\d+)/);
  if (basementMatch) {
    return -Number.parseInt(basementMatch[1], 10);
  }

  const numMatch = upper.match(/(\d+)/);
  if (numMatch) {
    return Number.parseInt(numMatch[1], 10);
  }

  return 0;
}

/**
 * 階を上階から下階へソート
 * @param {{ level?: number|null, name?: string }} a
 * @param {{ level?: number|null, name?: string }} b
 * @returns {number}
 */
function compareStoriesDescending(a, b) {
  const levelA = typeof a?.level === 'number' ? a.level : null;
  const levelB = typeof b?.level === 'number' ? b.level : null;

  if (levelA !== null && levelB !== null && levelA !== levelB) {
    return levelB - levelA;
  }

  const orderA = getFloorSortOrder(a?.name);
  const orderB = getFloorSortOrder(b?.name);
  if (orderA !== orderB) {
    return orderB - orderA;
  }

  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

/**
 * StbGirder一覧を抽出（梁要素）
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {Array<Object>} 梁要素情報配列
 */
function extractGirders(xmlDoc) {
  const girders = [];
  const girderElements = querySelectorAll(xmlDoc, 'StbGirder');

  girderElements.forEach((el) => {
    const id = el.getAttribute('id');
    const idSection = el.getAttribute('id_section');
    const name = el.getAttribute('name');
    const idNodeStart = el.getAttribute('id_node_start');
    const idNodeEnd = el.getAttribute('id_node_end');

    if (id && idSection) {
      girders.push({
        id,
        idSection,
        name,
        idNodeStart,
        idNodeEnd,
      });
    }
  });

  return girders;
}

/**
 * 梁が属する階を取得
 * @param {Object} girder - 梁情報
 * @param {Map<string, Object>} stories - Story情報マップ
 * @returns {Array<string>} 階IDの配列
 */
function getStoryIdsForGirder(girder, stories) {
  const startStoryIds = [];
  const endStoryIds = [];

  // 梁は通常同一階内の部材として扱うため、開始ノード側を優先して1階に割り当てる。
  stories.forEach((story, storyId) => {
    if (story.nodeIds.has(girder.idNodeStart)) {
      startStoryIds.push(storyId);
    }
    if (story.nodeIds.has(girder.idNodeEnd)) {
      endStoryIds.push(storyId);
    }
  });

  if (startStoryIds.length > 0) {
    return [startStoryIds[0]];
  }
  if (endStoryIds.length > 0) {
    return [endStoryIds[0]];
  }

  return [];
}

/**
 * RC梁断面の詳細情報を抽出（STB v2.0.2と v2.1の両対応）
 * @param {Element} sectionElement - StbSecBeam_RC または StbSecGirder_RC要素
 * @returns {Object} 断面詳細データ
 */
function extractRcBeamSectionDetail(sectionElement) {
  const id = sectionElement.getAttribute('id');
  const name = sectionElement.getAttribute('name');
  const strengthConcrete = sectionElement.getAttribute('strength_concrete') || 'Fc21';
  const kindBeam = sectionElement.getAttribute('kind_beam') || 'GIRDER';

  const result = {
    id,
    name,
    beamType: kindBeam,
    concrete: {
      strength: strengthConcrete,
    },
    positionPattern: 'UNKNOWN',
    positions: {},
  };

  // 寸法と配筋情報の抽出
  // STB v2.1: StbSecBeam_RC → StbSecBeamStraight/StbSecBeamTaper
  // STB v2.0.2: StbSecGirder_RC → StbSecGirder_RC_Straight
  const figureElement =
    querySelector(sectionElement, 'StbSecFigureBeam_RC') ||
    querySelector(sectionElement, 'StbSecFigureGirder_RC');

  if (figureElement) {
    // STB v2.1形式: 複数のStbSecBeam_RC_Straight_NotSame要素（order属性付き）
    const straightNotSameElements = querySelectorAll(
      figureElement,
      'StbSecBeam_RC_Straight_NotSame',
    );
    if (straightNotSameElements.length > 0) {
      extractMultiplePositionFigures(straightNotSameElements, result, 'STB_V21');
    } else {
      // STB v2.0.2形式: ハンチ形状（複数位置、pos属性付き）
      const haunchElements = querySelectorAll(figureElement, 'StbSecBeam_RC_Haunch');
      if (haunchElements.length > 0) {
        extractHaunchPositionFigures(haunchElements, result);
      } else {
        // STB v2.0.2形式: StbSecBeam_RC_Straight, StbSecGirder_RC_Straight（order属性なし、単一）
        const straightSameElement =
          querySelector(figureElement, 'StbSecBeam_RC_Straight_Same') ||
          querySelector(figureElement, 'StbSecBeam_RC_Straight') ||
          querySelector(figureElement, 'StbSecGirder_RC_Straight');
        if (straightSameElement) {
          extractSinglePositionFigure(straightSameElement, result, 'SAME');
        }
      }
    }
  }

  // 配筋情報の抽出
  const barArrangementElement =
    querySelector(sectionElement, 'StbSecBarArrangementBeam_RC') ||
    querySelector(sectionElement, 'StbSecBarArrangementGirder_RC');

  if (barArrangementElement) {
    extractBeamBarArrangement(barArrangementElement, result);
  }

  // 位置構成パターンを判定
  if (!result.positionPattern || result.positionPattern === 'UNKNOWN') {
    determinePositionPattern(result);
  }

  return result;
}

/**
 * ハンチ形状の図形情報を抽出（STB v2.0.2形式）
 * @param {Element[]} haunchElements - StbSecBeam_RC_Haunch要素の配列
 * @param {Object} result - 結果オブジェクト
 */
function extractHaunchPositionFigures(haunchElements, result) {
  const positionMap = {
    START: 'LEFT',
    CENTER: 'CENTER',
    END: 'RIGHT',
  };

  const orders = [];

  haunchElements.forEach((el) => {
    const posAttr = el.getAttribute('pos');
    const position = positionMap[posAttr] || 'SAME';
    const width = parseFloat(el.getAttribute('width')) || 0;
    const depth = parseFloat(el.getAttribute('depth')) || 0;

    // orderを決定（START=1, CENTER=2, END=3）
    let order = 1;
    if (posAttr === 'START') order = 1;
    else if (posAttr === 'CENTER') order = 2;
    else if (posAttr === 'END') order = 3;

    orders.push(order);
    result.positions[position] = {
      order: order,
      width,
      depth,
      topBar: null,
      bottomBar: null,
      stirrup: null,
      webBar: null,
    };
  });

  // 複数位置を昇順でソート
  result.orders = orders.sort((a, b) => a - b);
}

/**
 * 複数位置の図形情報を抽出（STB v2.1形式）
 * @param {Element[]} straightElements - StbSecBeam_RC_Straight_NotSame要素の配列
 * @param {Object} result - 結果オブジェクト
 */
function extractMultiplePositionFigures(straightElements, result) {
  const orders = [];

  straightElements.forEach((el) => {
    const orderAttr = el.getAttribute('order');
    const order = orderAttr !== null ? parseInt(orderAttr, 10) : -1;
    const width = parseFloat(el.getAttribute('width')) || 0;
    const depth = parseFloat(el.getAttribute('depth')) || 0;

    // order属性がない場合はインデックスを使用
    let finalOrder = order;
    if (order < 0) {
      finalOrder = straightElements.indexOf(el) + 1;
      console.warn('[beamSectionListExtractor] No order attribute, using index:', {
        index: straightElements.indexOf(el),
        finalOrder,
        width,
        depth,
      });
    }

    if (finalOrder > 0) {
      orders.push(finalOrder);
      const position = getPositionName(finalOrder, straightElements.length);
      result.positions[position] = {
        order: finalOrder,
        width,
        depth,
        topBar: null,
        bottomBar: null,
        stirrup: null,
        webBar: null,
      };
    }
  });

  // 複数位置を昇順でソート
  result.orders = orders.sort((a, b) => a - b);
}

/**
 * 単一位置の図形情報を抽出（STB v2.0.2形式）
 * @param {Element} straightElement - StbSecGirder_RC_Straight要素
 * @param {Object} result - 結果オブジェクト
 * @param {string} positionName - 位置名（SAME）
 */
function extractSinglePositionFigure(straightElement, result, positionName = 'SAME') {
  const width = parseFloat(straightElement.getAttribute('width')) || 0;
  const depth = parseFloat(straightElement.getAttribute('depth')) || 0;

  result.positions[positionName] = {
    order: 1,
    width,
    depth,
    topBar: null,
    bottomBar: null,
    stirrup: null,
    webBar: null,
  };
  result.orders = [1];
}

/**
 * order値から位置名を取得
 * @param {number} order - order属性値
 * @param {number} totalOrders - 総order数
 * @returns {string} 位置名（LEFT, CENTER, RIGHT）
 */
function getPositionName(order, totalOrders) {
  if (totalOrders === 1) return 'SAME';
  if (totalOrders === 2) {
    return order === 1 ? 'LEFT' : 'CENTER';
  }
  if (totalOrders === 3) {
    if (order === 1) return 'LEFT';
    if (order === 2) return 'CENTER';
    if (order === 3) return 'RIGHT';
  }
  // 将来拡張用
  return `POS_${order}`;
}

/**
 * 梁の配筋情報を抽出
 * @param {Element} barArrangementElement - StbSecBarArrangementBeam_RC要素
 * @param {Object} result - 結果オブジェクト
 */
function extractBeamBarArrangement(barArrangementElement, result) {
  // STB v2.1: StbSecBarBeamSimple
  let simpleBarElement = querySelector(barArrangementElement, 'StbSecBarBeamSimple');
  let isV202Format = false;

  // STB v2.0.2: StbSecBarBeam_RC_Same or StbSecBarBeam_RC_ThreeTypes
  if (!simpleBarElement) {
    simpleBarElement = querySelector(barArrangementElement, 'StbSecBarBeam_RC_Same');
    isV202Format = !!simpleBarElement;
  }

  // STB v2.0.2: StbSecBarBeam_RC_ThreeTypesがある場合
  if (!simpleBarElement) {
    const threeTypes = querySelectorAll(barArrangementElement, 'StbSecBarBeam_RC_ThreeTypes');
    if (threeTypes.length > 0) {
      // ThreeTypesの場合、最初の要素を使用（すべての位置で同じ属性値）
      simpleBarElement = threeTypes[0];
      isV202Format = true;
    }
  }

  if (simpleBarElement) {
    // STB v2.0.2形式：直接属性から読み込み
    if (isV202Format) {
      extractBarDataFromDirectAttributes(simpleBarElement, result);
    } else {
      // STB v2.1.0形式：子要素から読み込み
      extractBarDataFromChildElements(simpleBarElement, result);
    }

    // 統一されたカバー情報をresultに記録
    const coverTop =
      parseFloat(barArrangementElement.getAttribute('depth_cover_top')) ||
      parseFloat(simpleBarElement.getAttribute('depth_cover_top')) ||
      parseFloat(simpleBarElement.getAttribute('center_X')) ||
      40;
    const coverBottom =
      parseFloat(barArrangementElement.getAttribute('depth_cover_bottom')) ||
      parseFloat(simpleBarElement.getAttribute('depth_cover_bottom')) ||
      parseFloat(simpleBarElement.getAttribute('center_Y')) ||
      40;

    result.cover = {
      top: coverTop,
      bottom: coverBottom,
    };
  }
}

/**
 * STB v2.0.2形式：直接属性から配筋情報を抽出
 * @param {Element} barElement - StbSecBarBeam_RC_Same or StbSecBarBeam_RC_ThreeTypes要素
 * @param {Object} result - 結果オブジェクト
 */
function extractBarDataFromDirectAttributes(barElement, result) {
  // STB v2.0.2では全位置で同じ鉄筋データを使用
  const positions = ['SAME', 'LEFT', 'CENTER', 'RIGHT'].filter((p) => result.positions[p]);

  positions.forEach((position) => {
    const positionData = result.positions[position];

    // 上端筋：N_main_top_1st（最上段），D_main（径）
    const mainTopCount = parseInt(barElement.getAttribute('N_main_top_1st')) || 0;
    if (mainTopCount > 0) {
      const dia = (barElement.getAttribute('D_main') || 'D25').toUpperCase();
      positionData.topBar = {
        count: mainTopCount,
        dia: dia,
        grade: 'SD345',
      };
    }

    // 下端筋：N_main_bottom_1st，D_main
    const mainBottomCount = parseInt(barElement.getAttribute('N_main_bottom_1st')) || 0;
    if (mainBottomCount > 0) {
      const dia = (barElement.getAttribute('D_main') || 'D25').toUpperCase();
      positionData.bottomBar = {
        count: mainBottomCount,
        dia: dia,
        grade: 'SD345',
      };
    }

    // スターラップ：N_stirrup，D_stirrup，pitch_stirrup
    const stirrupCount = parseInt(barElement.getAttribute('N_stirrup')) || 0;
    if (stirrupCount > 0) {
      const dia = (barElement.getAttribute('D_stirrup') || 'D10').toUpperCase();
      const pitch = parseInt(barElement.getAttribute('pitch_stirrup')) || 200;
      positionData.stirrup = {
        count: stirrupCount,
        dia: dia,
        pitch: pitch,
        grade: 'SD295',
      };
    }

    // 腹筋：N_web，D_web
    const webCount = parseInt(barElement.getAttribute('N_web')) || 0;
    if (webCount > 0) {
      const dia = (barElement.getAttribute('D_web') || 'D13').toUpperCase();
      positionData.webBar = {
        count: webCount,
        dia: dia,
        grade: 'SD345',
      };
    }
  });
}

/**
 * STB v2.1.0形式：子要素から配筋情報を抽出
 * @param {Element} simpleBarElement - StbSecBarBeamSimple要素
 * @param {Object} result - 結果オブジェクト
 */
function extractBarDataFromChildElements(simpleBarElement, result) {
  // 各位置ごとに配筋情報を抽出
  result.orders.forEach((order) => {
    const position = getPositionName(order, result.orders.length);
    const positionData = result.positions[position];

    if (positionData) {
      // 上端筋
      const topBarElement = findMainBarElement(simpleBarElement, 'TOP', order);
      if (topBarElement) {
        positionData.topBar = extractMainBarInfo(topBarElement);
      }

      // 下端筋
      const bottomBarElement = findMainBarElement(simpleBarElement, 'BOTTOM', order);
      if (bottomBarElement) {
        positionData.bottomBar = extractMainBarInfo(bottomBarElement);
      }

      // スターラップ（order属性が直下 or 内部）
      const stirrupInfo = extractStirrupInfo(simpleBarElement, order);
      if (stirrupInfo) {
        positionData.stirrup = stirrupInfo;
      }

      // 腹筋（存在する場合のみ）
      const webBarInfo = extractWebBarInfo(simpleBarElement, order);
      if (webBarInfo) {
        positionData.webBar = webBarInfo;
      }
    }
  });
}

/**
 * 指定した位置の主筋要素を検索
 * @param {Element} simpleBarElement - StbSecBarBeamSimple要素
 * @param {string} pos - 位置（TOP/BOTTOM）
 * @param {number} order - order値
 * @returns {Element|null}
 */
function findMainBarElement(simpleBarElement, pos, order) {
  const mainBars = querySelectorAll(simpleBarElement, 'StbSecBarBeamSimpleMain');

  for (const bar of mainBars) {
    const barPos = bar.getAttribute('pos');
    const barOrder = parseInt(bar.getAttribute('order')) || 1;

    if (barPos === pos && barOrder === order) {
      return bar;
    }
  }

  // STB v2.0.2形式のフォールバック
  const mainBarElements = querySelectorAll(simpleBarElement, 'StbSecBarGirder_RC_Same_Main');
  for (const bar of mainBarElements) {
    const barPos = bar.getAttribute('pos') || bar.getAttribute('position');
    if (barPos === pos) {
      return bar;
    }
  }

  return null;
}

/**
 * 主筋情報を抽出（barArrangementExtractorベース）
 * 3段階属性フォールバック: v2.0.2 → v1.x → legacy
 * @param {Element} mainBarElement - StbSecBarBeamSimpleMain要素
 * @returns {Object} 主筋情報
 */
function extractMainBarInfo(mainBarElement) {
  if (!mainBarElement) {
    return { count: 0, dia: 'D25', grade: 'SD345' };
  }

  // barArrangementExtractor の3段階フォールバックを使用
  const barInfo = extractBeamMainBar(mainBarElement);

  // v2.0.2 と v2.1.0 の両方の属性名対応
  const count =
    parseInt(
      mainBarElement.getAttribute('N') ||
        mainBarElement.getAttribute('count_main') ||
        barInfo.N_main_X,
    ) || 0;
  const dia = (
    mainBarElement.getAttribute('D_bar') ||
    mainBarElement.getAttribute('D') ||
    barInfo.D_main ||
    'D25'
  ).toUpperCase();
  const grade =
    mainBarElement.getAttribute('strength') || mainBarElement.getAttribute('grade') || 'SD345';

  return {
    count,
    dia,
    grade,
  };
}

/**
 * スターラップ情報を抽出（barArrangementExtractorベース）
 * 3段階属性フォールバック: v2.0.2 → v1.x → legacy
 * @param {Element} simpleBarElement - StbSecBarBeamSimple要素
 * @param {number} order - order値
 * @returns {Object|null} スターラップ情報
 */
function extractStirrupInfo(simpleBarElement, order) {
  if (!simpleBarElement) {
    return null;
  }

  // barArrangementExtractor の3段階フォールバックを使用
  const stirrupInfo = extractStirrupInfoFromBar(simpleBarElement);

  // 径を確定（v2.0.2と v2.1.0の両方に対応）
  const dStirrup =
    simpleBarElement.getAttribute('D_stirrup') ||
    simpleBarElement.getAttribute('D_band') ||
    stirrupInfo.D_stirrup ||
    'D10';

  if (!dStirrup) {
    return null;
  }

  // 本数（デフォルト2）
  const nStirrup =
    parseInt(
      simpleBarElement.getAttribute('N_stirrup') ||
        simpleBarElement.getAttribute('N_band') ||
        stirrupInfo.N_stirrup,
    ) || 2;

  // 間隔（デフォルト100）
  const pitchStirrup =
    parseFloat(
      simpleBarElement.getAttribute('pitch_stirrup') ||
        simpleBarElement.getAttribute('pitch_band') ||
        stirrupInfo.spacing,
    ) || 100;

  // グレード
  const gradeStirrup =
    simpleBarElement.getAttribute('strength_stirrup') ||
    simpleBarElement.getAttribute('strength_band') ||
    'SD295';

  return {
    dia: dStirrup.toUpperCase(),
    pitch: pitchStirrup,
    count: nStirrup,
    grade: gradeStirrup,
  };
}

/**
 * 腹筋情報を抽出（barArrangementExtractorベース）
 * 3段階属性フォールバック: v2.0.2 → v1.x → legacy
 * @param {Element} simpleBarElement - StbSecBarBeamSimple要素
 * @param {number} order - order値
 * @returns {Object|null} 腹筋情報
 */
function extractWebBarInfo(simpleBarElement, order) {
  if (!simpleBarElement) {
    return null;
  }

  // barArrangementExtractor の3段階フォールバックを使用
  const webBarInfo = extractWebBarInfoFromBar(simpleBarElement);

  // 径を確定
  const dWeb = simpleBarElement.getAttribute('D_web') || webBarInfo.D_web;

  if (!dWeb) {
    return null;
  }

  // 本数
  const nWeb = parseInt(simpleBarElement.getAttribute('N_web') || webBarInfo.N_web) || 0;

  if (nWeb <= 0) {
    return null;
  }

  // グレード
  const gradeWeb = simpleBarElement.getAttribute('strength_web') || 'SD345';

  return {
    dia: dWeb.toUpperCase(),
    count: nWeb,
    grade: gradeWeb,
  };
}

/**
 * 位置構成パターンを判定（SAME/END_CENTER/THREE等）
 * @param {Object} result - 結果オブジェクト
 */
function determinePositionPattern(result) {
  const orders = result.orders || [1];

  if (orders.length === 1) {
    result.positionPattern = 'SAME';
  } else if (orders.length === 2) {
    result.positionPattern = 'END_CENTER';
  } else if (orders.length === 3) {
    result.positionPattern = 'THREE';
  } else {
    result.positionPattern = `MULTI_${orders.length}`;
  }
}

/**
 * 断面符号の基本部分を抽出（"G1"など）
 * @param {string} sectionName - 断面名（"3G1"など）
 * @returns {string} 基本符号
 */
function extractBaseSymbol(sectionName) {
  if (!sectionName) return '';

  // 先頭の階プレフィックス（例: 3, 10F）だけを除去し、残りの末尾トークンを符号として採用する。
  // 例: "3G1" -> "G1", "10B1G1" -> "B1G1", "3F-G1" -> "G1"
  const normalized = sectionName.trim();
  const withoutFloorPrefix = normalized.replace(/^\d+F?/i, '');
  const tokens = withoutFloorPrefix.match(/[A-Za-z][A-Za-z0-9]*/g);

  if (tokens && tokens.length > 0) {
    return tokens[tokens.length - 1].toUpperCase();
  }

  return (withoutFloorPrefix || normalized).toUpperCase();
}

/**
 * 自然順ソート用の比較関数
 * @param {string} a - 符号A
 * @param {string} b - 符号B
 * @returns {number} 比較結果
 */
function compareSymbols(a, b) {
  const aNum = parseInt(a.replace(/[A-Z]/g, '')) || 0;
  const bNum = parseInt(b.replace(/[A-Z]/g, '')) || 0;

  if (aNum !== bNum) return aNum - bNum;
  return a.localeCompare(b);
}

/**
 * STBファイルからRC梁断面リストをグリッド形式で抽出
 *
 * @param {Document} xmlDoc - STB XMLドキュメント
 * @returns {Object} { stories: Array, symbols: Array, grid: Map }
 *   - stories: { id, name, level } の配列（level降順）
 *   - symbols: 符号の配列（自然順ソート）
 *   - grid: Map<"階ID:符号", BeamSectionData>
 */
export function extractBeamSectionGrid(xmlDoc) {
  if (!xmlDoc) {
    console.warn('[extractBeamSectionGrid] xmlDoc is null or undefined');
    return {
      stories: [],
      symbols: [],
      grid: new Map(),
    };
  }

  console.log('[extractBeamSectionGrid] Starting extraction...');

  // バージョンを検出
  const isV210 = isVersion210(xmlDoc);
  const isV202 = isVersion202(xmlDoc);

  console.log('[extractBeamSectionGrid] STB Version detected:', { isV210, isV202 });

  // バージョンに応じて適切なパーサーを呼び出す
  if (isV210) {
    return extractBeamSectionGridV210(xmlDoc);
  } else if (isV202) {
    return extractBeamSectionGridV202(xmlDoc);
  } else {
    // バージョン不明の場合は、従来のフォールバック（両方を試す）
    console.warn('[extractBeamSectionGrid] Unknown STB version, using fallback parser');
    return extractBeamSectionGridFallback(xmlDoc);
  }
}

/**
 * STB 2.1.0用のビーム断面グリッド抽出
 * StbSecBeam_RC要素を使用
 */
function extractBeamSectionGridV210(xmlDoc) {
  console.log('[extractBeamSectionGridV210] Extracting with STB 2.1.0 parser');

  // 1. 階データを抽出
  const storiesMap = extractStories(xmlDoc);
  const storiesList = Array.from(storiesMap.values()).sort(compareStoriesDescending);
  console.log('[extractBeamSectionGridV210] Stories extracted:', storiesList.length);

  // 2. 梁要素を抽出
  const girders = extractGirders(xmlDoc);
  console.log('[extractBeamSectionGridV210] Girders extracted:', girders.length);

  // 3. 梁断面（StbSecBeam_RC のみ）を抽出
  const beamSectionElements = querySelectorAll(xmlDoc, 'StbSecBeam_RC');
  console.log(
    '[extractBeamSectionGridV210] Beam section elements found:',
    beamSectionElements.length,
  );

  const sectionsMap = new Map();
  beamSectionElements.forEach((el) => {
    const id = el.getAttribute('id');
    if (id) {
      const detail = extractRcBeamSectionDetail(el);
      sectionsMap.set(id, detail);
      console.log('[extractBeamSectionGridV210] Section extracted:', id, detail.name);
    }
  });

  // 4. グリッド構築
  return buildBeamSectionGrid(xmlDoc, storiesMap, storiesList, girders, sectionsMap, 'v2.1.0');
}

/**
 * STB 2.0.2用のビーム断面グリッド抽出
 * StbSecBeam_RC要素を使用（STB 2.1.0と同じ要素名）
 */
function extractBeamSectionGridV202(xmlDoc) {
  console.log('[extractBeamSectionGridV202] Extracting with STB 2.0.2 parser');

  // 1. 階データを抽出
  const storiesMap = extractStories(xmlDoc);
  const storiesList = Array.from(storiesMap.values()).sort(compareStoriesDescending);
  console.log('[extractBeamSectionGridV202] Stories extracted:', storiesList.length);

  // 2. 梁要素を抽出
  const girders = extractGirders(xmlDoc);
  console.log('[extractBeamSectionGridV202] Girders extracted:', girders.length);

  // 3. 梁断面（StbSecBeam_RC のみ）を抽出
  const beamSectionElements = querySelectorAll(xmlDoc, 'StbSecBeam_RC');
  console.log(
    '[extractBeamSectionGridV202] Beam section elements found:',
    beamSectionElements.length,
  );

  const sectionsMap = new Map();
  beamSectionElements.forEach((el) => {
    const id = el.getAttribute('id');
    if (id) {
      const detail = extractRcBeamSectionDetail(el);
      sectionsMap.set(id, detail);
      console.log('[extractBeamSectionGridV202] Section extracted:', id, detail.name);
    }
  });

  // 4. グリッド構築
  return buildBeamSectionGrid(xmlDoc, storiesMap, storiesList, girders, sectionsMap, 'v2.0.2');
}

/**
 * バージョン不明時のフォールバックパーサー
 * 両方の要素タイプを試す
 */
function extractBeamSectionGridFallback(xmlDoc) {
  console.log('[extractBeamSectionGridFallback] Using fallback parser');

  // 1. 階データを抽出
  const storiesMap = extractStories(xmlDoc);
  const storiesList = Array.from(storiesMap.values()).sort(compareStoriesDescending);

  // 2. 梁要素を抽出
  const girders = extractGirders(xmlDoc);

  // 3. 梁断面（両方を試す）を抽出
  const beamSectionElements = [
    ...querySelectorAll(xmlDoc, 'StbSecBeam_RC'), // STB v2.1 および v2.0.2
    ...querySelectorAll(xmlDoc, 'StbSecGirder_RC'), // 非標準ファイル対応
  ];

  const sectionsMap = new Map();
  beamSectionElements.forEach((el) => {
    const id = el.getAttribute('id');
    if (id) {
      const detail = extractRcBeamSectionDetail(el);
      sectionsMap.set(id, detail);
    }
  });

  // 4. グリッド構築
  return buildBeamSectionGrid(xmlDoc, storiesMap, storiesList, girders, sectionsMap, 'fallback');
}

/**
 * ビーム断面グリッドを構築
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {Map} storiesMap - 階マップ
 * @param {Array} storiesList - 階リスト
 * @param {Array} girders - 梁要素リスト
 * @param {Map} sectionsMap - 断面マップ
 * @param {string} parserVersion - パーサーバージョン
 */
function buildBeamSectionGrid(
  xmlDoc,
  storiesMap,
  storiesList,
  girders,
  sectionsMap,
  parserVersion,
) {
  // 梁-階マッピング
  const sectionUsageMap = new Map(); // sectionId → [{ storyId, symbol, ... }]

  girders.forEach((girder) => {
    const storyIds = getStoryIdsForGirder(girder, storiesMap);
    const sectionDetail = sectionsMap.get(girder.idSection);
    const symbolSource = sectionDetail?.name || girder.name;
    const symbol = extractBaseSymbol(symbolSource);

    storyIds.forEach((storyId) => {
      if (!sectionUsageMap.has(girder.idSection)) {
        sectionUsageMap.set(girder.idSection, []);
      }
      sectionUsageMap.get(girder.idSection).push({
        storyId,
        symbol,
      });
    });
  });

  // グリッドデータを構築
  const grid = new Map();
  const symbolSet = new Set();

  console.log(
    `[buildBeamSectionGrid] (${parserVersion}) Section usage entries:`,
    sectionUsageMap.size,
  );

  sectionUsageMap.forEach((usages, sectionId) => {
    const sectionData = sectionsMap.get(sectionId);
    if (!sectionData) {
      console.warn(
        `[buildBeamSectionGrid] (${parserVersion}) Section data not found for:`,
        sectionId,
      );
      return;
    }

    usages.forEach(({ storyId, symbol }) => {
      const story = storiesMap.get(storyId);
      if (!story) {
        console.warn(`[buildBeamSectionGrid] (${parserVersion}) Story not found for:`, storyId);
        return;
      }

      const key = `${storyId}:${symbol}`;
      const cellData = {
        sectionId,
        storyId,
        storyName: story.name,
        storyLevel: story.level,
        symbol,
        symbolNames: `${story.name}${symbol}`, // 例："3F G1"
        beamType: sectionData.beamType,
        positionPattern: sectionData.positionPattern,
        positions: sectionData.positions,
        concrete: sectionData.concrete,
        cover: sectionData.cover,
      };

      const existingCell = grid.get(key);
      if (!existingCell) {
        grid.set(key, cellData);
      } else {
        const variants = Array.isArray(existingCell) ? existingCell : [existingCell];
        const alreadyRegistered = variants.some((variant) => variant.sectionId === sectionId);

        if (!alreadyRegistered) {
          variants.push(cellData);
          grid.set(key, variants);
          console.warn(
            `[buildBeamSectionGrid] (${parserVersion}) Multiple sections detected in same cell:`,
            key,
            variants.map((variant) => variant.sectionId),
          );
        }
      }

      symbolSet.add(symbol);
      console.log(`[buildBeamSectionGrid] (${parserVersion}) Grid cell added:`, key);
    });
  });

  // 符号を自然順でソート
  const symbols = Array.from(symbolSet).sort(compareSymbols);

  console.log(`[buildBeamSectionGrid] (${parserVersion}) Final result:`, {
    storiesCount: storiesList.length,
    symbolsCount: symbols.length,
    gridSize: grid.size,
  });

  return {
    stories: storiesList,
    symbols,
    grid,
  };
}

/**
 * リスト形式でRC梁断面を抽出（階別・符号別）
 *
 * @param {Document} xmlDoc - STB XMLドキュメント
 * @returns {Object} { sections: Array<BeamSectionRow> }
 */
export function extractBeamSectionList(xmlDoc) {
  const gridData = extractBeamSectionGrid(xmlDoc);
  const sections = [];

  // グリッドデータをリスト形式に変換
  // 階を降順、符号を昇順でソート
  const rows = Array.from(gridData.grid.values())
    .flatMap((cell) => (Array.isArray(cell) ? cell : [cell]))
    .sort((a, b) => {
      const storyComp = compareStoriesDescending(
        { level: a.storyLevel, name: a.storyName },
        { level: b.storyLevel, name: b.storyName },
      );
      if (storyComp !== 0) return storyComp;
      return compareSymbols(a.symbol, b.symbol);
    });

  sections.push(...rows);

  return {
    sections,
  };
}
