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

  const {
    loadCondition,
    loadCases,
    memberLoads,
    addedWeights,
    pointLoads,
    loadArrangements,
    slabFinishDefs,
  } = calData;
  const hasLiveloads = loadCondition?.liveloads?.length > 0;
  const hasSlabFinishes = slabFinishDefs?.length > 0;
  const hasMemberLoads = memberLoads?.length > 0;
  const hasPointLoads = pointLoads?.length > 0;
  const hasAddedWeights = addedWeights?.length > 0;
  if (
    !hasLiveloads &&
    !hasSlabFinishes &&
    (!loadCases || loadCases.length === 0) &&
    !hasMemberLoads &&
    !hasPointLoads &&
    !hasAddedWeights
  ) {
    return null;
  }

  const idMap = _buildIdMap(loadCases, memberLoads, addedWeights, pointLoads);

  const calDataEl = _createNsEl(doc, 'StbCalData');

  // StbCalCommon → StbCalLoadCondition（積載荷重テーブル）
  if (hasLiveloads) {
    const commonEl = _createNsEl(doc, 'StbCalCommon');
    commonEl.appendChild(_serializeLoadCondition(doc, loadCondition));
    calDataEl.appendChild(commonEl);
  }

  // StbCalLoad（仕上げ定義 + 荷重ケース + 部材荷重）
  // スキーマ順: StbCalFinish > StbCalLoadCases > StbCalAdditionalLoads
  const calLoadEl = _createNsEl(doc, 'StbCalLoad');
  let hasContent = false;

  if (hasSlabFinishes) {
    calLoadEl.appendChild(_serializeCalFinish(doc, slabFinishDefs));
    hasContent = true;
  }

  if (loadCases && loadCases.length > 0) {
    const casesEl = _serializeLoadCases(doc, loadCases, idMap);
    calLoadEl.appendChild(casesEl);
    hasContent = true;
  }

  // StbCalAdditionalLoads（部材荷重 → 集中荷重 の順。スキーマ: MemberLoad > AreaLoad > PointLoad）
  if (hasMemberLoads || hasPointLoads) {
    const additionalEl = _serializeAdditionalLoads(doc, memberLoads, pointLoads, idMap);
    calLoadEl.appendChild(additionalEl);
    hasContent = true;
  }

  // StbCalAddedWeights（節点付加重量）。スキーマ: StbCalAdditionalLoads の後
  if (hasAddedWeights) {
    calLoadEl.appendChild(_serializeAddedWeights(doc, addedWeights, idMap));
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

  _insertCalDataElement(doc, calDataEl);

  return calDataEl;
}

function _serializeLoadCondition(doc, loadCondition) {
  const condEl = _createNsEl(doc, 'StbCalLoadCondition');
  const liveloads = loadCondition?.liveloads || [];
  if (liveloads.length === 0) return condEl;

  const liveloadsEl = _createNsEl(doc, 'StbCalLiveloads');
  const isStb20 = _isStb20Document(doc);
  liveloads.forEach((ll, index) => {
    const id = _positiveIntegerId(ll.id, index + 1);
    const el = _createNsEl(doc, 'StbCalLiveload');
    el.setAttribute('id', String(id));
    if (!isStb20) {
      el.setAttribute('code', ll.code || `LL${id}`);
      el.setAttribute('type', _normalizeLiveloadType(ll.type));
    } else {
      el.setAttribute('type', String(_nonNegativeIntegerType(ll.type)));
    }
    if (ll.name) el.setAttribute('name', ll.name);
    el.setAttribute('liveload_slab', String(ll.slabLoad ?? 0));
    el.setAttribute('liveload_beam', String(ll.beamLoad ?? 0));
    el.setAttribute('liveload_frame', String(ll.frameLoad ?? 0));
    el.setAttribute('liveload_seismic', String(ll.seismicLoad ?? 0));
    liveloadsEl.appendChild(el);
  });
  condEl.appendChild(liveloadsEl);
  return condEl;
}

/**
 * StbCalFinish > StbCalMemberFinishes_RC > StbCalSlabFinish_RC* をシリアライズ
 * @param {XMLDocument} doc
 * @param {Array<{id: number, weight: number}>} slabFinishDefs
 */
function _serializeCalFinish(doc, slabFinishDefs) {
  const finishEl = _createNsEl(doc, 'StbCalFinish');
  const memberFinishesEl = _createNsEl(doc, 'StbCalMemberFinishes_RC');
  for (const def of slabFinishDefs) {
    const el = _createNsEl(doc, 'StbCalSlabFinish_RC');
    el.setAttribute('id', String(def.id));
    el.setAttribute('weight', String(def.weight));
    memberFinishesEl.appendChild(el);
  }
  finishEl.appendChild(memberFinishesEl);
  return finishEl;
}

function _isStb20Document(doc) {
  const version = doc?.documentElement?.getAttribute('version') || '';
  return version.startsWith('2.0');
}

function _positiveIntegerId(rawId, fallback) {
  const parsed = Number.parseInt(String(rawId ?? '').replace(/\D+/g, ''), 10);
  return parsed > 0 ? parsed : fallback;
}

function _normalizeLiveloadType(type) {
  const value = String(type || '').toUpperCase();
  const valid = new Set([
    'HABITABLEROOMS',
    'OFFICES',
    'CLASSROOMS',
    'STORES',
    'MEETINGROOMS_FIXEDSEATING',
    'MEETINGROOMS_OTHERSEATS',
    'AUTOMOBILEGARAGES',
    'INPUT_VALUES',
  ]);
  return valid.has(value) ? value : 'INPUT_VALUES';
}

function _nonNegativeIntegerType(type) {
  const parsed = Number.parseInt(type, 10);
  return parsed >= 0 ? parsed : 0;
}

// 笏笏 ID 繝槭ャ繝斐Φ繧ｰ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/**
 * 譁・ｭ怜・ ID 竊・豁｣縺ｮ謨ｴ謨ｰ ID 縺ｮ繝槭ャ繝斐Φ繧ｰ繧呈ｧ狗ｯ・
 * @returns {{ caseId: Map<string, number>, loadId: Map<string, number> }}
 */
function _buildIdMap(loadCases, memberLoads, addedWeights, pointLoads) {
  const _numberById = (items) => {
    const map = new Map();
    let counter = 1;
    for (const item of items || []) {
      if (!map.has(item.id)) map.set(item.id, counter++);
    }
    return map;
  };

  // 各要素型は独立した ID 空間を持つ（配置リストはそれぞれの型の id を参照する）
  return {
    caseId: _numberById(loadCases),
    loadId: _numberById(memberLoads),
    weightId: _numberById(addedWeights),
    pointId: _numberById(pointLoads),
  };
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

function _serializeAdditionalLoads(doc, memberLoads, pointLoads, idMap) {
  const additionalEl = _createNsEl(doc, 'StbCalAdditionalLoads');

  for (const ml of memberLoads || []) {
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

  // 集中荷重（節点方向力など）。スキーマ順: StbCalAdditionalLoads 内で StbCalMemberLoad の後
  for (const pl of pointLoads || []) {
    const resolvedCaseId = idMap.caseId.get(pl.loadCaseId);
    if (resolvedCaseId == null) {
      log.warn(
        `[StbCalDataSerializer] load case ID "${pl.loadCaseId}" が見つからないため、集中荷重 "${pl.id}" のシリアライズをスキップします`,
      );
      continue;
    }
    const el = _createNsEl(doc, 'StbCalPointLoad');
    el.setAttribute('id', String(idMap.pointId.get(pl.id)));
    el.setAttribute('id_loadcase', String(resolvedCaseId));
    if (pl.loadCaseName) el.setAttribute('loadcase', pl.loadCaseName);
    // P1..P6 は既定 0.0。非ゼロのみ明示出力する
    for (const key of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      if (pl[key] != null && pl[key] !== 0) el.setAttribute(key, String(pl[key]));
    }
    if (pl.description) el.setAttribute('description', pl.description);
    additionalEl.appendChild(el);
  }

  return additionalEl;
}

/**
 * StbCalAddedWeights > StbCalNodeAddedWeight をシリアライズ（節点付加重量）
 * @param {XMLDocument} doc
 * @param {Array<{id, loadCaseId, loadCaseName, weight, description}>} addedWeights
 * @param {{caseId: Map, weightId: Map}} idMap
 */
function _serializeAddedWeights(doc, addedWeights, idMap) {
  const weightsEl = _createNsEl(doc, 'StbCalAddedWeights');
  for (const aw of addedWeights) {
    const resolvedCaseId = idMap.caseId.get(aw.loadCaseId);
    if (resolvedCaseId == null) {
      log.warn(
        `[StbCalDataSerializer] load case ID "${aw.loadCaseId}" が見つからないため、付加重量 "${aw.id}" のシリアライズをスキップします`,
      );
      continue;
    }
    const el = _createNsEl(doc, 'StbCalNodeAddedWeight');
    el.setAttribute('id', String(idMap.weightId.get(aw.id)));
    el.setAttribute('id_loadcase', String(resolvedCaseId));
    if (aw.loadCaseName) el.setAttribute('loadcase', aw.loadCaseName);
    el.setAttribute('weight', String(aw.weight));
    if (aw.description) el.setAttribute('description', aw.description);
    weightsEl.appendChild(el);
  }
  return weightsEl;
}

// 笏笏 StbCalLoadArrangements 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

function _serializeLoadArrangements(doc, arrangements, idMap) {
  const { columns, girders, beams, slabFinishes, slabLiveloads, nodeWeights, nodePointLoads } =
    arrangements;

  const hasColumns = columns && columns.size > 0;
  const hasGirders = girders && girders.size > 0;
  const hasBeams = beams && beams.size > 0;
  const hasSlabLiveloads = slabLiveloads && slabLiveloads.size > 0;
  const hasSlabFinishes = slabFinishes && slabFinishes.size > 0;
  const hasNodeWeights = nodeWeights && nodeWeights.size > 0;
  const hasNodePointLoads = nodePointLoads && nodePointLoads.size > 0;

  if (
    !hasColumns &&
    !hasGirders &&
    !hasBeams &&
    !hasSlabLiveloads &&
    !hasSlabFinishes &&
    !hasNodeWeights &&
    !hasNodePointLoads
  ) {
    return null;
  }

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
  // スキーマ順: StbCalSlabLiveLoadArr → StbCalSlabFinish_RC_Arr
  if (hasSlabLiveloads) {
    _serializeSlabLiveLoadArrangements(doc, arrEl, slabLiveloads);
  }
  if (hasSlabFinishes) {
    _serializeSlabFinishArrangements(doc, arrEl, slabFinishes);
  }
  // スキーマ順: 節点系は末尾（StbCalNodeWeightArr → StbCalNodePointLoadArr）
  // 注意: 要素名は不規則。NodeWeight は "...WeightLoadList"、NodePointLoad は "...PointLoadList"（"Load" 重複なし）
  if (hasNodeWeights) {
    _serializeNodeArrangements(doc, arrEl, nodeWeights, idMap.weightId, {
      arr: 'StbCalNodeWeightArr',
      loadList: 'StbCalNodeWeightLoadList',
      nodeList: 'StbCalNodeWeightNodeList',
    });
  }
  if (hasNodePointLoads) {
    _serializeNodeArrangements(doc, arrEl, nodePointLoads, idMap.pointId, {
      arr: 'StbCalNodePointLoadArr',
      loadList: 'StbCalNodePointLoadList',
      nodeList: 'StbCalNodePointLoadNodeList',
    });
  }

  return arrEl;
}

/**
 * 節点荷重配置をシリアライズ（StbCalNodeWeightArr / StbCalNodePointLoadArr）。
 * 同一 loadId セットを持つ節点をグループ化して 1 Arr にまとめる。
 * @param {XMLDocument} doc
 * @param {Element} parentEl
 * @param {Map<string, string[]>} arrangementMap - nodeId → loadId[]
 * @param {Map<string, number>} loadIdMap - 荷重文字列ID → 数値ID
 * @param {{arr: string, loadList: string, nodeList: string}} names - 出力する要素名（スキーマ準拠）
 */
function _serializeNodeArrangements(doc, parentEl, arrangementMap, loadIdMap, names) {
  const groupMap = new Map(); // loadIdsKey → { loadIds: number[], nodeIds: string[] }

  for (const [nodeId, loadIds] of arrangementMap) {
    const numericLoadIds = loadIds
      .map((lid) => loadIdMap.get(lid))
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    if (numericLoadIds.length === 0) continue;

    const key = numericLoadIds.join(' ');
    if (!groupMap.has(key)) {
      groupMap.set(key, { loadIds: numericLoadIds, nodeIds: [] });
    }
    groupMap.get(key).nodeIds.push(nodeId);
  }

  for (const { loadIds, nodeIds } of groupMap.values()) {
    const arrEl = _createNsEl(doc, names.arr);

    const loadListEl = _createNsEl(doc, names.loadList);
    loadListEl.textContent = loadIds.join(' ');
    arrEl.appendChild(loadListEl);

    const nodeListEl = _createNsEl(doc, names.nodeList);
    nodeListEl.textContent = nodeIds.join(' ');
    arrEl.appendChild(nodeListEl);

    parentEl.appendChild(arrEl);
  }
}

/**
 * StbCalSlabLiveLoadArr をシリアライズ（liveloadId → slabId[]）
 */
function _serializeSlabLiveLoadArrangements(doc, parentEl, slabLiveloads) {
  for (const [liveloadId, slabIds] of slabLiveloads) {
    const arrEl = _createNsEl(doc, 'StbCalSlabLiveLoadArr');
    const listEl = _createNsEl(doc, 'StbCalSlabLiveLoadList');
    listEl.textContent = String(liveloadId);
    arrEl.appendChild(listEl);
    const memListEl = _createNsEl(doc, 'StbCalSlabLiveLoadMemList');
    memListEl.textContent = slabIds.join(' ');
    arrEl.appendChild(memListEl);
    parentEl.appendChild(arrEl);
  }
}

/**
 * StbCalSlabFinish_RC_Arr をシリアライズ（finishId → slabId[]）
 */
function _serializeSlabFinishArrangements(doc, parentEl, slabFinishes) {
  for (const [finishId, slabIds] of slabFinishes) {
    const arrEl = _createNsEl(doc, 'StbCalSlabFinish_RC_Arr');
    const listEl = _createNsEl(doc, 'StbCalSlabFinish_RC_LoadList');
    listEl.textContent = String(finishId);
    arrEl.appendChild(listEl);
    const memListEl = _createNsEl(doc, 'StbCalSlabFinish_RC_MemList');
    memListEl.textContent = slabIds.join(' ');
    arrEl.appendChild(memListEl);
    parentEl.appendChild(arrEl);
  }
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
