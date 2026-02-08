/**
 * @fileoverview RC柱断面リスト用データ抽出モジュール
 *
 * STBファイルからRC柱断面リストに必要なデータを抽出し、
 * 階別・符号別にグループ化した構造を返します。
 * STB v2.0.2と v2.1の両方に対応しており、バージョンごとに
 * 異なるパーサーロジックを使用します。
 *
 * @module data/extractors/columnSectionListExtractor
 */

import { isVersion210, isVersion202 } from '../../common-stb/parser/utils/versionDetector.js';
import {
  extractMainBarInfo as extractMainBarInfoFromBar,
  extractHoopInfo as extractHoopInfoFromBar,
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
 * StbStory一覧を抽出
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {Map<string, Object>} id → {id, name, height, level, nodeIds}
 */
function extractStories(xmlDoc) {
  const stories = new Map();
  const storyElements = querySelectorAll(xmlDoc, 'StbStory');

  storyElements.forEach((el) => {
    const id = el.getAttribute('id');
    const name = el.getAttribute('name') || `階${id}`;
    const height = parseFloat(el.getAttribute('height')) || 0;
    const level = parseFloat(el.getAttribute('level')) || 0;

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
      stories.set(id, { id, name, height, level, nodeIds });
    }
  });

  return stories;
}

/**
 * StbColumn一覧を抽出（RC柱のみ）
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {Array<Object>} 柱要素情報配列
 */
function extractColumns(xmlDoc) {
  const columns = [];
  const columnElements = querySelectorAll(xmlDoc, 'StbColumn');

  columnElements.forEach((el) => {
    const id = el.getAttribute('id');
    const idSection = el.getAttribute('id_section');
    const name = el.getAttribute('name');
    const kindColumn = el.getAttribute('kind_column');
    const idNodeBottom = el.getAttribute('id_node_bottom');
    const idNodeTop = el.getAttribute('id_node_top');

    // POST（間柱）は除外
    if (kindColumn === 'POST') return;

    if (id && idSection) {
      columns.push({
        id,
        idSection,
        name,
        idNodeBottom,
        idNodeTop,
      });
    }
  });

  return columns;
}

/**
 * 柱が属する階を取得
 * @param {Object} column - 柱情報
 * @param {Map<string, Object>} stories - Story情報マップ
 * @returns {Array<string>} 階IDの配列
 */
function getStoryIdsForColumn(column, stories) {
  const storyIds = [];

  // 柱のノード（下端または上端）を含む階を探す
  stories.forEach((story, storyId) => {
    if (story.nodeIds.has(column.idNodeBottom) || story.nodeIds.has(column.idNodeTop)) {
      storyIds.push(storyId);
    }
  });

  return storyIds;
}

/**
 * StbSecColumn_RCの詳細情報を抽出
 * @param {Element} sectionElement - StbSecColumn_RC要素
 * @returns {Object} 断面詳細データ
 */
function extractRcColumnSectionDetail(sectionElement) {
  const id = sectionElement.getAttribute('id');
  const name = sectionElement.getAttribute('name');
  const strengthConcrete = sectionElement.getAttribute('strength_concrete') || 'Fc21';

  const result = {
    id,
    name,
    concrete: {
      strength: strengthConcrete,
    },
    dimensions: {},
    mainBar: {},
    hoop: {},
    coreBar: null,
  };

  // 寸法情報を抽出（矩形または円形）
  const rectFigure =
    querySelector(sectionElement, 'StbSecColumn_RC_Rect') ||
    querySelector(querySelector(sectionElement, 'StbSecFigure'), 'StbSecColumn_RC_Rect');

  const circleFigure =
    querySelector(sectionElement, 'StbSecColumn_RC_Circle') ||
    querySelector(querySelector(sectionElement, 'StbSecFigure'), 'StbSecColumn_RC_Circle');

  if (rectFigure) {
    result.dimensions.type = 'RECTANGLE';
    result.dimensions.width =
      parseFloat(rectFigure.getAttribute('width_X') || rectFigure.getAttribute('depth_X')) || 0;
    result.dimensions.height =
      parseFloat(rectFigure.getAttribute('width_Y') || rectFigure.getAttribute('depth_Y')) || 0;
  } else if (circleFigure) {
    result.dimensions.type = 'CIRCLE';
    result.dimensions.diameter = parseFloat(circleFigure.getAttribute('D')) || 0;
  }

  // 配筋情報を抽出（STB v2.0.2: StbSecBarArrangementColumn_RC を検索）
  const barArrangement = querySelector(sectionElement, 'StbSecBarArrangementColumn_RC');
  if (barArrangement) {
    // 矩形配筋: STB v2.0.2対応（RectSame/RectNotSame を優先、旧Rectにフォールバック）
    let rectBar = null;
    const rectBarSelectors = [
      'StbSecBarColumn_RC_RectSame', // v2.0.2
      'StbSecBarColumn_RC_RectNotSame', // v2.0.2（配列）
      'StbSecBarColumn_RC_Rect', // 旧バージョン
    ];

    for (const selector of rectBarSelectors) {
      const element = querySelector(barArrangement, selector);
      if (element) {
        // NotSameは配列の先頭を使用
        if (selector === 'StbSecBarColumn_RC_RectNotSame') {
          const elements = querySelectorAll(barArrangement, selector);
          rectBar = elements[0];
        } else {
          rectBar = element;
        }
        break;
      }
    }

    if (rectBar) {
      extractRectBarInfo(rectBar, result);
    }

    // 円形配筋: STB v2.0.2対応（CircleSame/CircleNotSame を優先、旧Circleにフォールバック）
    let circleBar = null;
    const circleBarSelectors = [
      'StbSecBarColumn_RC_CircleSame', // v2.0.2
      'StbSecBarColumn_RC_CircleNotSame', // v2.0.2（配列）
      'StbSecBarColumn_RC_Circle', // 旧バージョン
    ];

    for (const selector of circleBarSelectors) {
      const element = querySelector(barArrangement, selector);
      if (element) {
        if (selector === 'StbSecBarColumn_RC_CircleNotSame') {
          const elements = querySelectorAll(barArrangement, selector);
          circleBar = elements[0];
        } else {
          circleBar = element;
        }
        break;
      }
    }

    if (circleBar) {
      extractCircleBarInfo(circleBar, result);
    }
  }

  return result;
}

/**
 * 矩形配筋情報を抽出
 * @param {Element} rectBar - StbSecBarColumn_RC_Rect/RectSame/RectNotSame要素
 * @param {Object} result - 結果オブジェクト
 */
function extractRectBarInfo(rectBar, result) {
  // 主筋本数（X方向）- 3段階フォールバック（v2.0.2 → v1.x → 旧版）
  const nMainX =
    parseInt(
      rectBar.getAttribute('N_main_X_1st') || // v2.0.2
        rectBar.getAttribute('N_main_X') || // v1.x
        rectBar.getAttribute('count_main_X'), // 旧版
    ) || 0;

  // 主筋本数（Y方向）- 3段階フォールバック
  const nMainY =
    parseInt(
      rectBar.getAttribute('N_main_Y_1st') || // v2.0.2
        rectBar.getAttribute('N_main_Y') || // v1.x
        rectBar.getAttribute('count_main_Y'), // 旧版
    ) || 0;

  // 主筋径
  const dMain = rectBar.getAttribute('D_main') || rectBar.getAttribute('dia_main') || 'D25';
  const gradeMain =
    rectBar.getAttribute('strength_main') || rectBar.getAttribute('grade_main') || 'SD345';

  result.mainBar = {
    countX: nMainX,
    countY: nMainY,
    dia: dMain.toUpperCase(),
    grade: gradeMain,
  };

  // 1段目dt（かぶり＋帯筋＋主筋半径）
  const dtX = parseFloat(rectBar.getAttribute('D1_X') || rectBar.getAttribute('center_X')) || 0;
  const dtY = parseFloat(rectBar.getAttribute('D1_Y') || rectBar.getAttribute('center_Y')) || 0;
  result.mainBar.dtX = dtX;
  result.mainBar.dtY = dtY;

  // 芯鉄筋（中子筋）
  const nCoreX =
    parseInt(rectBar.getAttribute('N_core_X') || rectBar.getAttribute('count_2nd_X')) || 0;
  const nCoreY =
    parseInt(rectBar.getAttribute('N_core_Y') || rectBar.getAttribute('count_2nd_Y')) || 0;
  const dCore = rectBar.getAttribute('D_core') || rectBar.getAttribute('dia_2nd');
  const corePosition =
    parseFloat(rectBar.getAttribute('pos_core') || rectBar.getAttribute('pitch_2nd_X')) || 0;

  if (nCoreX > 0 || nCoreY > 0) {
    result.coreBar = {
      countX: nCoreX,
      countY: nCoreY,
      dia: dCore ? dCore.toUpperCase() : dMain.toUpperCase(),
      position: corePosition,
    };
  }

  // 帯筋径 - D_bandを最優先（v2.0.2）
  const dStirrup =
    rectBar.getAttribute('D_band') || // v2.0.2（最優先）
    rectBar.getAttribute('D_stirrup') ||
    rectBar.getAttribute('D_hoop') ||
    rectBar.getAttribute('dia_band') ||
    'D10';

  // 帯筋ピッチ - pitch_bandを最優先（v2.0.2）
  const pitchStirrup =
    parseFloat(
      rectBar.getAttribute('pitch_band') || // v2.0.2（最優先）
        rectBar.getAttribute('pitch_stirrup') ||
        rectBar.getAttribute('pitch'),
    ) || 100;

  // 帯筋強度 - strength_bandを最優先（v2.0.2）
  const gradeStirrup =
    rectBar.getAttribute('strength_band') || // v2.0.2（最優先）
    rectBar.getAttribute('grade_band') ||
    rectBar.getAttribute('strength_stirrup') ||
    rectBar.getAttribute('grade_stirrup') ||
    'SD295';

  // 帯筋のX/Y方向本数を取得
  const nBandX =
    parseInt(
      rectBar.getAttribute('N_hoop_X') || // STB 2.1.0
        rectBar.getAttribute('N_band_direction_X') || // STB 2.0.2
        rectBar.getAttribute('N_band_X'), // 旧版フォールバック
    ) || 0;

  const nBandY =
    parseInt(
      rectBar.getAttribute('N_hoop_Y') || // STB 2.1.0
        rectBar.getAttribute('N_band_direction_Y') || // STB 2.0.2
        rectBar.getAttribute('N_band_Y'), // 旧版フォールバック
    ) || 0;

  result.hoop = {
    dia: dStirrup.toUpperCase(),
    pitch: pitchStirrup,
    grade: gradeStirrup,
    countX: nBandX,
    countY: nBandY,
  };

  // 2種類の帯筋がある場合
  const dStirrup2 = rectBar.getAttribute('D_stirrup_2') || rectBar.getAttribute('D_hoop_2');
  const pitchStirrup2 = parseFloat(
    rectBar.getAttribute('pitch_2') || rectBar.getAttribute('pitch_band_2'),
  );
  if (dStirrup2 && pitchStirrup2) {
    result.hoop.dia2 = dStirrup2.toUpperCase();
    result.hoop.pitch2 = pitchStirrup2;
  }
}

/**
 * 円形配筋情報を抽出
 * @param {Element} circleBar - StbSecBarColumn_RC_Circle/CircleSame/CircleNotSame要素
 * @param {Object} result - 結果オブジェクト
 */
function extractCircleBarInfo(circleBar, result) {
  // 主筋本数 - 3段階フォールバック（v2.0.2 → v1.x → 旧版）
  const nMain =
    parseInt(
      circleBar.getAttribute('N_main_1st') || // v2.0.2
        circleBar.getAttribute('N_main') || // v1.x
        circleBar.getAttribute('count_main'), // 旧版
    ) || 0;

  // 主筋径
  const dMain = circleBar.getAttribute('D_main') || circleBar.getAttribute('dia_main') || 'D25';
  const gradeMain =
    circleBar.getAttribute('strength_main') || circleBar.getAttribute('grade_main') || 'SD345';

  result.mainBar = {
    count: nMain,
    dia: dMain.toUpperCase(),
    grade: gradeMain,
  };

  // 1段目dt
  const dt = parseFloat(circleBar.getAttribute('D1') || circleBar.getAttribute('center')) || 0;
  result.mainBar.dt = dt;

  // 帯筋径 - D_bandを最優先（v2.0.2）
  const dStirrup =
    circleBar.getAttribute('D_band') || // v2.0.2（最優先）
    circleBar.getAttribute('D_stirrup') ||
    circleBar.getAttribute('D_hoop') ||
    circleBar.getAttribute('dia_band') ||
    'D10';

  // 帯筋ピッチ - pitch_bandを最優先（v2.0.2）
  const pitchStirrup =
    parseFloat(
      circleBar.getAttribute('pitch_band') || // v2.0.2（最優先）
        circleBar.getAttribute('pitch_stirrup') ||
        circleBar.getAttribute('pitch'),
    ) || 100;

  // 帯筋強度 - strength_bandを最優先（v2.0.2）
  const gradeStirrup =
    circleBar.getAttribute('strength_band') || // v2.0.2（最優先）
    circleBar.getAttribute('grade_band') ||
    circleBar.getAttribute('strength_stirrup') ||
    circleBar.getAttribute('grade_stirrup') ||
    'SD295';

  result.hoop = {
    dia: dStirrup.toUpperCase(),
    pitch: pitchStirrup,
    grade: gradeStirrup,
  };
}

/**
 * 全StbSecColumn_RCを抽出
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {Map<string, Object>} id → 断面詳細データ
 */
function extractRcColumnSections(xmlDoc) {
  const sections = new Map();
  const sectionElements = querySelectorAll(xmlDoc, 'StbSecColumn_RC');

  sectionElements.forEach((el) => {
    const sectionData = extractRcColumnSectionDetail(el);
    if (sectionData && sectionData.id) {
      sections.set(sectionData.id, sectionData);
    }
  });

  return sections;
}

/**
 * 階をグループ化するためのキーを生成
 * @param {Array<Object>} storyUsages - 階使用情報配列
 * @returns {string} グループキー（例: "10F〜9F"）
 */
function createFloorRangeKey(storyUsages) {
  if (!storyUsages || storyUsages.length === 0) return '';
  if (storyUsages.length === 1) return storyUsages[0].name;

  // レベルでソート（降順：上階から）
  const sorted = [...storyUsages].sort((a, b) => (b.level || 0) - (a.level || 0));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return `${first.name}〜${last.name}`;
}

/**
 * 符号名から基本符号を抽出（階番号プレフィックスのみ除去）
 * サフィックス（a, b, c等）は保持する
 * @param {string} name - 断面名（例: "1C1a", "2C1", "C1b"）
 * @returns {string} 符号（例: "C1a", "C1", "C1b"）
 */
function extractBaseSymbol(name) {
  if (!name) return 'C';

  // サフィックスを含むパターン: C1a, SC2b など
  // 正規表現を変更: 英字+数字+英字（サフィックス）
  const match = name.match(/([A-Za-z]+\d+[a-zA-Z]*)/);

  if (match) {
    // 基本符号は大文字化、サフィックスは小文字のまま保持
    const symbol = match[1];
    // 英字プレフィックス + 数字 + サフィックス に分解
    const parts = symbol.match(/^([A-Za-z]+)(\d+)([a-zA-Z]*)$/);
    if (parts) {
      const [, prefix, number, suffix] = parts;
      return prefix.toUpperCase() + number + suffix.toLowerCase();
    }
    // フォールバック: 基本符号のみ大文字化
    return symbol.replace(/^[A-Za-z]+\d+/i, (m) => m.toUpperCase());
  }

  // フォールバック: 先頭の数字を除去して大文字化
  return name.replace(/^\d+/, '').toUpperCase() || 'C';
}

/**
 * 階名の順序を取得（降順ソート用）
 * PH/RF/R は最上階、数字は数値でソート、B1/B2等は地下階
 * @param {string} name - 階名（例: "1", "2F", "PH", "B1"）
 * @returns {number} ソート順序値（大きいほど上階）
 */
function getFloorSortOrder(name) {
  if (!name) return 0;

  const upper = name.toUpperCase();

  // ペントハウス・屋上は最上階（大きな正の値）
  if (
    upper === 'PH' ||
    upper === 'RF' ||
    upper === 'R' ||
    upper.startsWith('PH') ||
    upper.startsWith('RF')
  ) {
    // PHの後に数字がある場合（PH1, PH2等）
    const phMatch = upper.match(/^(?:PH|RF)(\d*)$/);
    if (phMatch) {
      const phNum = parseInt(phMatch[1]) || 0;
      return 10000 + phNum;
    }
    return 10000;
  }

  // 地下階（負の値）
  const basementMatch = upper.match(/^B(\d+)/);
  if (basementMatch) {
    return -parseInt(basementMatch[1], 10);
  }

  // 数字を含む階名（1F, 2, 3階 等）
  const numMatch = name.match(/(\d+)/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }

  // その他は0
  return 0;
}

/**
 * 階を降順（上階から下階）にソートする比較関数
 * 高さレベル（level）を主要なソート基準とする
 * @param {Object} a - 階情報A（level, name プロパティを持つ）
 * @param {Object} b - 階情報B
 * @returns {number} 比較結果
 */
function compareStoriesDescending(a, b) {
  // 高さレベル（level）で比較（降順：高い方が先）
  const levelA = a.level ?? null;
  const levelB = b.level ?? null;

  // 両方levelがある場合はlevelで比較
  if (levelA !== null && levelB !== null && levelA !== levelB) {
    return levelB - levelA; // 降順
  }

  // levelが同じか、片方がない場合は階名で比較（フォールバック）
  const orderA = getFloorSortOrder(a.name);
  const orderB = getFloorSortOrder(b.name);

  return orderB - orderA; // 降順
}

/**
 * 符号の自然順ソート用比較関数
 * C1, C1a, C1b, C2, SC1 の順にソートする
 * @param {string} a - 符号A
 * @param {string} b - 符号B
 * @returns {number} 比較結果
 */
function compareSymbols(a, b) {
  // "C1a" → { prefix: "C", number: 1, suffix: "a" }
  const parse = (s) => {
    const m = s.match(/^([A-Z]+)(\d+)([a-z]*)$/i);
    return m
      ? {
          prefix: m[1].toUpperCase(),
          number: parseInt(m[2], 10),
          suffix: m[3].toLowerCase(), // 小文字で比較
        }
      : { prefix: s, number: 0, suffix: '' };
  };

  const ap = parse(a);
  const bp = parse(b);

  // 3段階比較: プレフィックス → 数値 → サフィックス
  if (ap.prefix !== bp.prefix) {
    return ap.prefix.localeCompare(bp.prefix);
  }
  if (ap.number !== bp.number) {
    return ap.number - bp.number;
  }
  return ap.suffix.localeCompare(bp.suffix);
}

/**
 * RC柱断面リスト用のデータを抽出・グループ化（階×符号の組み合わせごと）
 * STB v2.0.2と v2.1.0の両方に対応
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {Object} 断面リストデータ
 */
export function extractColumnSectionList(xmlDoc) {
  if (!xmlDoc) {
    return {
      stories: [],
      sections: [],
      data: {},
    };
  }

  console.log('[extractColumnSectionList] Starting extraction...');

  // バージョンを検出
  const isV210 = isVersion210(xmlDoc);
  const isV202 = isVersion202(xmlDoc);

  console.log('[extractColumnSectionList] STB Version detected:', { isV210, isV202 });

  // バージョンに応じて適切なパーサーを呼び出す（互換性のため同一パーサーを使用）
  if (isV210) {
    return extractColumnSectionListV210(xmlDoc);
  } else if (isV202) {
    return extractColumnSectionListV202(xmlDoc);
  } else {
    console.warn('[extractColumnSectionList] Unknown STB version, using fallback parser');
    return extractColumnSectionListFallback(xmlDoc);
  }
}

/**
 * STB 2.1.0用のカラム断面リスト抽出
 */
function extractColumnSectionListV210(xmlDoc) {
  console.log('[extractColumnSectionListV210] Extracting with STB 2.1.0 parser');
  return buildColumnSectionList(xmlDoc, 'v2.1.0');
}

/**
 * STB 2.0.2用のカラム断面リスト抽出
 */
function extractColumnSectionListV202(xmlDoc) {
  console.log('[extractColumnSectionListV202] Extracting with STB 2.0.2 parser');
  return buildColumnSectionList(xmlDoc, 'v2.0.2');
}

/**
 * バージョン不明時のフォールバックパーサー
 */
function extractColumnSectionListFallback(xmlDoc) {
  console.log('[extractColumnSectionListFallback] Using fallback parser');
  return buildColumnSectionList(xmlDoc, 'fallback');
}

/**
 * カラム断面リストを構築（バージョン非依存ロジック）
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {string} parserVersion - パーサーバージョン
 * @returns {Object} 断面リストデータ
 */
function buildColumnSectionList(xmlDoc, parserVersion) {
  // 基本データを抽出
  const stories = extractStories(xmlDoc);
  const columns = extractColumns(xmlDoc);
  const sections = extractRcColumnSections(xmlDoc);

  // 断面IDと階の紐付けを構築
  // sectionId → [{ storyId, storyName, storyLevel }]
  const sectionStoryMap = new Map();

  columns.forEach((column) => {
    const { idSection } = column;
    if (!idSection) return;

    // この柱が属する階を取得（ノードから判定）
    const storyIds = getStoryIdsForColumn(column, stories);

    if (storyIds.length === 0) return;

    if (!sectionStoryMap.has(idSection)) {
      sectionStoryMap.set(idSection, []);
    }

    const existing = sectionStoryMap.get(idSection);

    // 重複チェック＆追加
    storyIds.forEach((storyId) => {
      if (!existing.find((s) => s.id === storyId)) {
        const story = stories.get(storyId);
        if (story) {
          existing.push({
            id: storyId,
            name: story.name,
            level: story.level,
          });
        }
      }
    });
  });

  // 階を降順（上階から下階）にソート
  const sortedStories = Array.from(stories.values()).sort(compareStoriesDescending);

  // 階×符号の組み合わせごとに一行を構築
  const sectionRows = [];

  // 各断面について処理
  sections.forEach((section, sectionId) => {
    const storyUsages = sectionStoryMap.get(sectionId) || [];
    if (storyUsages.length === 0) return;

    const symbol = extractBaseSymbol(section.name);

    // この断面が使用されている各階について一行を作成
    storyUsages.forEach((story) => {
      const sectionForRender = convertSectionForRender(section, [story]);

      sectionRows.push({
        storyId: story.id,
        storyName: story.name,
        storyLevel: story.level,
        symbol: symbol,
        sectionData: sectionForRender,
      });
    });
  });

  // ソート: 階（上から下、高さレベル基準）→ 符号（自然順）
  sectionRows.sort((a, b) => {
    // 高さレベル（storyLevel）で比較（降順：高い方が先）
    const levelA = a.storyLevel ?? null;
    const levelB = b.storyLevel ?? null;

    if (levelA !== null && levelB !== null && levelA !== levelB) {
      return levelB - levelA; // 降順
    }

    // levelが同じか未定義の場合は階名で比較（フォールバック）
    const floorOrderA = getFloorSortOrder(a.storyName);
    const floorOrderB = getFloorSortOrder(b.storyName);

    if (floorOrderA !== floorOrderB) {
      return floorOrderB - floorOrderA; // 階：降順（上階から下階）
    }

    return compareSymbols(a.symbol, b.symbol); // 符号：昇順
  });

  // dataオブジェクトを構築（旧互換用）
  const data = {};
  sectionRows.forEach((row) => {
    const key = `${row.storyName}-${row.symbol}`;
    data[key] = row.sectionData;
  });

  return {
    stories: sortedStories,
    sections: sectionRows,
    data,
  };
}

/**
 * 断面データをレンダリング用の形式に変換
 * @param {Object} section - 抽出した断面データ
 * @param {Array<Object>} storyUsages - 階使用情報
 * @returns {Object} レンダリング用断面データ
 */
function convertSectionForRender(section, storyUsages) {
  const { id, name, concrete, dimensions, mainBar, hoop, coreBar } = section;

  // 符号名リストを生成（例: "10C1, 9C1"）- 降順（上階から）
  const storyNames = storyUsages
    .sort((a, b) => (b.level || 0) - (a.level || 0))
    .map((s) => s.name.replace(/[F階]/g, '') + name)
    .join(', ');

  // SVGレンダラー用のデータ形式
  const renderData = {
    id,
    name,
    symbolNames: storyNames,
    storyUsages,

    // コンクリート
    concrete: {
      strength: concrete.strength,
    },

    // 寸法（SVGレンダラー用）
    width: dimensions.width || 0,
    height: dimensions.height || 0,
    diameter: dimensions.diameter || 0,
    isCircular: dimensions.type === 'CIRCLE',

    // かぶり（推定値、dtから逆算）
    cover: estimateCover(mainBar, hoop),

    // 主筋（SVGレンダラー用）
    mainBar: {
      countX: mainBar.countX || mainBar.count || 0,
      countY: mainBar.countY || mainBar.count || 0,
      count: mainBar.count || 0,
      dia: mainBar.dia,
      grade: mainBar.grade,
      dtX: mainBar.dtX || mainBar.dt || 0,
      dtY: mainBar.dtY || mainBar.dt || 0,
    },

    // 帯筋
    hoop: {
      dia: hoop.dia,
      pitch: hoop.pitch,
      grade: hoop.grade,
    },

    // 芯鉄筋
    coreBar: coreBar
      ? {
          countX: coreBar.countX || 0,
          countY: coreBar.countY || 0,
          dia: coreBar.dia,
          position: coreBar.position,
        }
      : null,

    // 元データ（詳細表示用）
    raw: section,
  };

  return renderData;
}

/**
 * かぶりを推定
 * @param {Object} mainBar - 主筋情報
 * @param {Object} hoop - 帯筋情報
 * @returns {number} 推定かぶり（mm）
 */
function estimateCover(mainBar, hoop) {
  // dt = かぶり + 帯筋径 + 主筋径/2
  // より: かぶり = dt - 帯筋径 - 主筋径/2
  const dt = mainBar.dtX || mainBar.dtY || mainBar.dt || 70;

  const hoopDia = parseBarDiameter(hoop.dia);
  const mainDia = parseBarDiameter(mainBar.dia);

  const cover = dt - hoopDia - mainDia / 2;
  return Math.max(cover, 30); // 最小30mm
}

/**
 * 鉄筋径を数値に変換
 * @param {string} dia - 鉄筋径（例: "D25"）
 * @returns {number} 直径（mm）
 */
function parseBarDiameter(dia) {
  if (!dia) return 25;
  const match = dia.match(/\d+/);
  return match ? parseInt(match[0], 10) : 25;
}

/**
 * RC柱断面リスト用のデータをグリッド形式で抽出・整理
 * 階を行、符号を列とした2次元グリッド構造を返します
 * @param {Document} xmlDoc - XMLドキュメント
 * @returns {Object} グリッド形式の断面リストデータ
 */
export function extractColumnSectionGrid(xmlDoc) {
  if (!xmlDoc) {
    return {
      stories: [],
      symbols: [],
      grid: new Map(),
      sections: [],
      data: {},
    };
  }

  // リスト形式のデータを先に抽出
  const listData = extractColumnSectionList(xmlDoc);

  // 全符号を収集
  const symbolSet = new Set();
  listData.sections.forEach((row) => {
    symbolSet.add(row.symbol);
  });

  // 符号を自然順でソート
  const symbols = Array.from(symbolSet);
  symbols.sort(compareSymbols);

  // 階を降順（上階から下階）にソート
  const sortedStories = [...listData.stories].sort(compareStoriesDescending);

  // グリッド構造を構築（Map<storyId, Map<symbol, sectionData>>）
  const grid = new Map();
  sortedStories.forEach((story) => {
    grid.set(story.id, new Map());
  });

  // セクションデータをグリッドに配置
  listData.sections.forEach((row) => {
    const floorMap = grid.get(row.storyId);
    if (floorMap) {
      floorMap.set(row.symbol, row.sectionData);
    }
  });

  return {
    stories: sortedStories,
    symbols,
    grid,
    sections: listData.sections, // 互換性のため保持
    data: listData.data, // 互換性のため保持
  };
}

export default extractColumnSectionList;
