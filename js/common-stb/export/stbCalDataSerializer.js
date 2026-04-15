/**
 * @fileoverview StbCalData 繧ｷ繝ｪ繧｢繝ｩ繧､繧ｶ
 *
 * calData JavaScript 繧ｪ繝悶ず繧ｧ繧ｯ繝医ｒ STB XML DOM 隕∫ｴ縺ｫ螟画鋤縺励・
 * ST_BRIDGE 繝峨く繝･繝｡繝ｳ繝医↓謖ｿ蜈･縺吶ｋ縲・
 *
 * SS7 CSV 縺九ｉ讒狗ｯ峨＆繧後◆闕ｷ驥阪ョ繝ｼ繧ｿ繧・STB XML 縺ｫ蜿肴丐縺吶ｋ縺薙→縺ｧ縲・
 * 逕盜ML陦ｨ遉ｺ繧・STB 繧ｨ繧ｯ繧ｹ繝昴・繝域凾縺ｫ闕ｷ驥肴ュ蝣ｱ縺悟・蜉帙＆繧後ｋ繧医≧縺ｫ縺ｪ繧九・
 *
 * @module common-stb/export/stbCalDataSerializer
 */

import { createLogger } from '../../utils/logger.js';

const STB_NS = 'https://www.building-smart.or.jp/dl';
const log = createLogger('common-stb:export:stbCalDataSerializer');

/**
 * 闕ｷ驥阪ち繧､繝暦ｼ域焚蛟､・俄・ STB 繧ｹ繧ｭ繝ｼ繝槫・謖吝､縺ｮ繝槭ャ繝斐Φ繧ｰ
 * @see ST-Bridge211.xsd StbCalMemberLoad type
 */
const TYPE_NUM_TO_STB = {
  1: 'CONCENTRATED',
  2: 'MOMENT',
  3: 'CONCENTRATED_BYNUMBER',
  4: 'DISTRIBUTED_UNIFORM',
  5: 'DISTRIBUTED_TRIANGLE',
  6: 'DISTRIBUTED_ISOSCELESTRIANGLE',
  7: 'DISTRIBUTED_QUADRILATERAL1',
  8: 'DISTRIBUTED_QUADRILATERAL2',
  9: 'DISTRIBUTED_3POINT_SPECIFY1',
  10: 'DISTRIBUTED_3POINT_SPECIFY2',
  11: 'INPUT_CMQ',
  12: 'TORTOISE_SHELL1',
  13: 'TORTOISE_SHELL2',
  14: 'TORTOISE_SHELL3',
  15: 'TORTOISE_SHELL4',
};

/**
 * 闕ｷ驥阪こ繝ｼ繧ｹ kind 遏ｭ邵ｮ蠖｢ 竊・STB 繧ｹ繧ｭ繝ｼ繝槫・謖吝､
 * @see ST-Bridge211.xsd StbCalLoadCase kind
 */
const KIND_TO_STB = {
  DL: 'DEADLOAD',
  LL: 'LIVELOAD_FRAME',
  LLe: 'LIVELOAD_SEISMIC',
  S: 'SNOWLOAD',
  K: 'SEISMICLOAD',
  W: 'WINDLOAD',
  T: 'OTHER',
};

/**
 * calData 繧ｪ繝悶ず繧ｧ繧ｯ繝医ｒ StbCalData XML 隕∫ｴ縺ｨ縺励※繧ｷ繝ｪ繧｢繝ｩ繧､繧ｺ縺励√ラ繧ｭ繝･繝｡繝ｳ繝医↓謖ｿ蜈･縺吶ｋ
 *
 * @param {XMLDocument} doc - ST_BRIDGE XML 繝峨く繝･繝｡繝ｳ繝・
 * @param {Object} calData - buildSs7CalData 縺瑚ｿ斐☆繧ｪ繝悶ず繧ｧ繧ｯ繝・
 * @param {Array} calData.loadCases - 闕ｷ驥阪こ繝ｼ繧ｹ驟榊・
 * @param {Array} calData.memberLoads - 驛ｨ譚占差驥埼・蛻・
 * @param {Object} calData.loadArrangements - 闕ｷ驥埼・鄂ｮ {columns: Map, girders: Map, beams: Map}
 * @returns {Element|null} 謖ｿ蜈･縺輔ｌ縺・StbCalData 隕∫ｴ・郁差驥阪↑縺玲凾縺ｯ null・・
 */
export function serializeCalDataToXml(doc, calData) {
  if (!doc || !calData) return null;

  const { loadCases, memberLoads, loadArrangements } = calData;
  if ((!loadCases || loadCases.length === 0) && (!memberLoads || memberLoads.length === 0)) {
    return null;
  }

  // 譁・ｭ怜・ ID 竊・謨ｰ蛟､ ID 縺ｮ繝槭ャ繝斐Φ繧ｰ繧呈ｧ狗ｯ・
  const idMap = _buildIdMap(loadCases, memberLoads);

  // StbCalData 隕∫ｴ繝・Μ繝ｼ繧呈ｧ狗ｯ・
  const calDataEl = _createNsEl(doc, 'StbCalData');

  // StbCalLoad 竊・StbCalLoadCases + StbCalAdditionalLoads
  const calLoadEl = _createNsEl(doc, 'StbCalLoad');
  let hasContent = false;

  if (loadCases && loadCases.length > 0) {
    const casesEl = _serializeLoadCases(doc, loadCases, idMap);
    calLoadEl.appendChild(casesEl);
    hasContent = true;
  }

  if (memberLoads && memberLoads.length > 0) {
    const additionalEl = _serializeMemberLoads(doc, memberLoads, idMap);
    calLoadEl.appendChild(additionalEl);
    hasContent = true;
  }

  if (hasContent) {
    calDataEl.appendChild(calLoadEl);
  }

  // StbCalLoadArrangements
  if (loadArrangements) {
    const arrEl = _serializeLoadArrangements(doc, loadArrangements, idMap);
    if (arrEl) {
      calDataEl.appendChild(arrEl);
    }
  }

  // DOM 縺ｫ謖ｿ蜈･・・tbModel 縺ｮ蠕後ヾtbAnaModels 縺ｮ蜑搾ｼ・
  _insertCalDataElement(doc, calDataEl);

  return calDataEl;
}

// 笏笏 ID 繝槭ャ繝斐Φ繧ｰ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/**
 * 譁・ｭ怜・ ID 竊・豁｣縺ｮ謨ｴ謨ｰ ID 縺ｮ繝槭ャ繝斐Φ繧ｰ繧呈ｧ狗ｯ・
 * @returns {{ caseId: Map<string, number>, loadId: Map<string, number> }}
 */
function _buildIdMap(loadCases, memberLoads) {
  const caseId = new Map();
  let caseCounter = 1;
  for (const lc of loadCases || []) {
    if (!caseId.has(lc.id)) {
      caseId.set(lc.id, caseCounter++);
    }
  }

  const loadId = new Map();
  let loadCounter = 1;
  for (const ml of memberLoads || []) {
    if (!loadId.has(ml.id)) {
      loadId.set(ml.id, loadCounter++);
    }
  }

  return { caseId, loadId };
}

// 笏笏 StbCalLoadCases 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

function _serializeLoadCases(doc, loadCases, idMap) {
  const casesEl = _createNsEl(doc, 'StbCalLoadCases');

  for (const lc of loadCases) {
    const el = _createNsEl(doc, 'StbCalLoadCase');
    el.setAttribute('id', String(idMap.caseId.get(lc.id)));
    el.setAttribute('category', lc.category || 'STANDARD');
    el.setAttribute('kind', KIND_TO_STB[lc.kind] || lc.kind || 'OTHER');
    if (lc.name) el.setAttribute('name', lc.name);
    if (lc.direction != null) el.setAttribute('direction', String(lc.direction));
    casesEl.appendChild(el);
  }

  return casesEl;
}

// 笏笏 StbCalAdditionalLoads 竊・StbCalMemberLoad 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

function _serializeMemberLoads(doc, memberLoads, idMap) {
  const additionalEl = _createNsEl(doc, 'StbCalAdditionalLoads');

  for (const ml of memberLoads) {
    const el = _createNsEl(doc, 'StbCalMemberLoad');

    el.setAttribute('id', String(idMap.loadId.get(ml.id)));
    const resolvedCaseId = idMap.caseId.get(ml.loadCaseId);
    if (resolvedCaseId == null) {
      log.warn(
        `[StbCalDataSerializer] load case ID "${ml.loadCaseId}" が見つからないため、荷重 "${ml.id}" のシリアライズをスキップします`,
      );
      continue;
    }
    el.setAttribute('id_loadcase', String(resolvedCaseId));
    if (ml.loadCaseName) el.setAttribute('loadcase', ml.loadCaseName);

    // type: 謨ｰ蛟､ 竊・STB 蛻玲嫌譁・ｭ怜・
    const typeStr = typeof ml.type === 'number' ? TYPE_NUM_TO_STB[ml.type] : ml.type;
    el.setAttribute('type', typeStr || 'DISTRIBUTED_UNIFORM');

    // P1 縺ｯ蠢・・
    el.setAttribute('P1', String(ml.P1 ?? 0));
    if (ml.P2 != null) el.setAttribute('P2', String(ml.P2));
    if (ml.P3 != null) el.setAttribute('P3', String(ml.P3));
    if (ml.P4 != null) el.setAttribute('P4', String(ml.P4));
    if (ml.P5 != null) el.setAttribute('P5', String(ml.P5));
    if (ml.P6 != null) el.setAttribute('P6', String(ml.P6));

    // direction_load: LOCAL/GLOBAL/PROJECTION
    // calData 縺ｮ coordinateSystem 縺ｯ direction_load 縺ｫ蟇ｾ蠢・
    const dirLoad = _mapDirectionLoad(ml.coordinateSystem);
    if (dirLoad) el.setAttribute('direction_load', dirLoad);

    // coordinate_load: X/Y
    // calData 縺ｮ directionLoad 縺ｯ coordinate_load 縺ｫ蟇ｾ蠢・
    const coordLoad = _mapCoordinateLoad(ml.directionLoad);
    if (coordLoad) {
      el.setAttribute('coordinate_load', coordLoad);
    }

    if (ml.description) el.setAttribute('description', ml.description);

    additionalEl.appendChild(el);
  }

  return additionalEl;
}

// 笏笏 StbCalLoadArrangements 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

function _serializeLoadArrangements(doc, arrangements, idMap) {
  const { columns, girders, beams } = arrangements;

  const hasColumns = columns && columns.size > 0;
  const hasGirders = girders && girders.size > 0;
  const hasBeams = beams && beams.size > 0;

  if (!hasColumns && !hasGirders && !hasBeams) return null;

  const arrEl = _createNsEl(doc, 'StbCalLoadArrangements');

  if (hasColumns) {
    _serializeMemberLoadArrangements(doc, arrEl, columns, 'Column', idMap);
  }
  if (hasGirders) {
    _serializeMemberLoadArrangements(doc, arrEl, girders, 'Girder', idMap);
  }
  if (hasBeams) {
    _serializeMemberLoadArrangements(doc, arrEl, beams, 'Beam', idMap);
  }

  return arrEl;
}

/**
 * 驛ｨ譚舌ち繧､繝怜挨縺ｮ闕ｷ驥埼・鄂ｮ繧貞・蜉・
 *
 * StbCalLoadArrangements 縺ｮ蟄占ｦ∫ｴ鬆・ｺ上・繧ｹ繧ｭ繝ｼ繝槭〒隕丞ｮ壹＆繧後※縺・ｋ:
 *   ColumnFinish_RC_Arr, ColumnFinish_S_Arr, ColumnFinishValueArr,
 *   ColumnMemberLoadArr, GirderFinish_RC_Arr, ... GirderMemberLoadArr, ...
 *
 * 蜷御ｸ驛ｨ譚舌↓隍・焚闕ｷ驥阪′蜑ｲ繧雁ｽ薙※繧峨ｌ縺ｦ縺・ｋ蝣ｴ蜷医〒繧ゅ・
 * 1縺､縺ｮ Arr 隕∫ｴ蜀・↓ LoadList 縺ｨ MemList 繧偵∪縺ｨ繧√※蜃ｺ蜉帙☆繧九・
 * 縺溘□縺励・Κ譚舌＃縺ｨ縺ｫ逡ｰ縺ｪ繧玖差驥阪そ繝・ヨ縺悟牡繧雁ｽ薙※繧峨ｌ縺ｦ縺・ｋ蝣ｴ蜷医・
 * 隍・焚縺ｮ Arr 隕∫ｴ繧剃ｽ懈・縺吶ｋ縲・
 */
function _serializeMemberLoadArrangements(doc, parentEl, arrangementMap, memberType, idMap) {
  // arrangementMap: Map<memberId, loadId[]>
  // 蜷後§ loadIds 繧ｻ繝・ヨ繧呈戟縺､驛ｨ譚舌ｒ繧ｰ繝ｫ繝ｼ繝怜喧
  const groupMap = new Map(); // loadIdsKey 竊・{ loadIds: string[], memberIds: string[] }

  for (const [memberId, loadIds] of arrangementMap) {
    // 闕ｷ驥巧D繧呈焚蛟､ID縺ｫ螟画鋤
    const numericLoadIds = loadIds.map((lid) => idMap.loadId.get(lid)).filter((v) => v != null);
    if (numericLoadIds.length === 0) continue;

    const key = numericLoadIds.sort((a, b) => a - b).join(' ');
    if (!groupMap.has(key)) {
      groupMap.set(key, { loadIds: numericLoadIds, memberIds: [] });
    }
    groupMap.get(key).memberIds.push(memberId);
  }

  for (const { loadIds, memberIds } of groupMap.values()) {
    const arrEl = _createNsEl(doc, `StbCal${memberType}MemberLoadArr`);

    const loadListEl = _createNsEl(doc, `StbCal${memberType}MemberLoadList`);
    loadListEl.textContent = loadIds.join(' ');
    arrEl.appendChild(loadListEl);

    const memListEl = _createNsEl(doc, `StbCal${memberType}MemberLoadMemList`);
    memListEl.textContent = memberIds.join(' ');
    arrEl.appendChild(memListEl);

    parentEl.appendChild(arrEl);
  }
}

// 笏笏 DOM 謖ｿ蜈･ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/**
 * StbCalData 繧偵せ繧ｭ繝ｼ繝樣・ｺ上↓蠕薙▲縺ｦ ST_BRIDGE 縺ｫ謖ｿ蜈･
 *
 * ST_BRIDGE 縺ｮ蟄占ｦ∫ｴ鬆・ StbCommon, StbModel, StbExtensions,
 * StbExportInformation, StbCalData, StbAnaModels
 */
function _insertCalDataElement(doc, calDataEl) {
  const root = doc.documentElement;
  if (!root) return;

  // 譌｢蟄倥・ StbCalData 繧帝勁蜴ｻ
  const existing =
    root.getElementsByTagNameNS(STB_NS, 'StbCalData')[0] ||
    root.getElementsByTagName('StbCalData')[0];
  if (existing && existing.parentNode === root) {
    root.removeChild(existing);
  }

  // StbAnaModels 縺ｮ蜑阪↓謖ｿ蜈･・医↑縺代ｌ縺ｰ譛ｫ蟆ｾ縺ｫ霑ｽ蜉・・
  const anaModels =
    root.getElementsByTagNameNS(STB_NS, 'StbAnaModels')[0] ||
    root.getElementsByTagName('StbAnaModels')[0];
  if (anaModels) {
    root.insertBefore(calDataEl, anaModels);
  } else {
    root.appendChild(calDataEl);
  }
}

// 笏笏 繝倥Ν繝代・ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

function _createNsEl(doc, tagName) {
  return doc.createElementNS(STB_NS, tagName);
}

/**
 * coordinateSystem 竊・direction_load 螻樊ｧ蛟､
 */
function _mapDirectionLoad(coordinateSystem) {
  if (!coordinateSystem) return null;
  const upper = coordinateSystem.toUpperCase();
  if (['LOCAL', 'GLOBAL', 'PROJECTION'].includes(upper)) return upper;
  return 'LOCAL';
}

/**
 * directionLoad 竊・coordinate_load 螻樊ｧ蛟､
 * STB 繧ｹ繧ｭ繝ｼ繝槭〒縺ｯ X/Y 縺ｮ縺ｿ譛牙柑
 */
function _mapCoordinateLoad(directionLoad) {
  if (!directionLoad) return null;
  const upper = directionLoad.toUpperCase();
  if (upper === 'X' || upper === 'Y') return upper;
  // Z は STB の coordinate_load では表現できないため、属性を設定しない
  return null;
}
