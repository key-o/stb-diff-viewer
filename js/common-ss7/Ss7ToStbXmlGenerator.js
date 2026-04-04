/**
 * @fileoverview SS7パースデータ → STB 2.1.0 XML文字列変換
 *
 * IFC変換の StbXmlGenerator.js と同じ文字列ベースXML生成方式。
 * @module Ss7ToStbXmlGenerator
 */

const indent = (level) => '  '.repeat(level);

/**
 * 4軸形式小梁: indices を辿って床組形状の階層リストを返す
 * @param {Object} rootShape - 床組配置が参照するルート形状
 * @param {Map} shapesMap - floorGroupShapesMap
 * @param {number[]} indices - [1次,2次,3次,4次,5次] 領域番号
 * @returns {Object[]} トップダウン順の形状配列
 */
function buildSubBeamHierarchy(rootShape, shapesMap, indices) {
  const hierarchy = [rootShape];
  let current = rootShape;
  for (let level = 1; level < indices.length; level++) {
    const regionNum = indices[level - 1];
    if (regionNum === 0) break;
    const refIndex = regionNum - 1;
    if (!current.shapeRefs || refIndex >= current.shapeRefs.length) break;
    const childId = current.shapeRefs[refIndex];
    if (!childId) break;
    const child = shapesMap.get(String(childId));
    if (!child) break;
    hierarchy.push(child);
    current = child;
  }
  return hierarchy;
}

/**
 * 4軸形式小梁: indices と形状階層から小梁の端点座標を計算する
 * @param {Object} rootShape - ルート形状
 * @param {Map} shapesMap - floorGroupShapesMap
 * @param {number[]} indices - [1次,2次,3次,4次,5次] 領域番号
 * @param {number} x1 - パネル左端X
 * @param {number} x2 - パネル右端X
 * @param {number} y1 - パネル下端Y
 * @param {number} y2 - パネル上端Y
 * @returns {{sx:number,sy:number,ex:number,ey:number}|null}
 */
function calcSubBeamPosition(rootShape, shapesMap, indices, x1, x2, y1, y2) {
  let beamOrder = 0;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== 0) beamOrder = i + 1;
  }
  if (beamOrder === 0) return null;

  const hierarchy = buildSubBeamHierarchy(rootShape, shapesMap, indices);
  let cur = { x1, x2, y1, y2 };

  for (let order = 1; order <= beamOrder; order++) {
    const regionIndex = indices[order - 1];
    if (regionIndex === 0 && order < beamOrder) continue;
    const shape = hierarchy[Math.min(order - 1, hierarchy.length - 1)];
    if (!shape) return null;
    const isX = shape.direction === 'X方向';
    const count = isX ? shape.subBeamCountX || 1 : shape.subBeamCountY || 1;

    if (order === beamOrder) {
      if (isX) {
        const spacing = (cur.y2 - cur.y1) / (count + 1);
        const y = cur.y1 + spacing * regionIndex;
        return { sx: cur.x1, sy: y, ex: cur.x2, ey: y };
      } else {
        const spacing = (cur.x2 - cur.x1) / (count + 1);
        const x = cur.x1 + spacing * regionIndex;
        return { sx: x, sy: cur.y1, ex: x, ey: cur.y2 };
      }
    } else {
      const numRegions = count + 1;
      if (isX) {
        const h = (cur.y2 - cur.y1) / numRegions;
        const newY1 = cur.y1 + h * (regionIndex - 1);
        cur = { ...cur, y1: newY1, y2: newY1 + h };
      } else {
        const w = (cur.x2 - cur.x1) / numRegions;
        const newX1 = cur.x1 + w * (regionIndex - 1);
        cur = { ...cur, x1: newX1, x2: newX1 + w };
      }
    }
  }
  return null;
}

function escXml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatGuid(value) {
  return Math.max(0, Number(value) || 0)
    .toString(16)
    .padStart(32, '0')
    .slice(-32);
}

function buildAttrString(attrs) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}="${escXml(value)}"`)
    .join(' ');
}

function normalizeSectionFloorLabel(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/MFL$/, 'M')
    .replace(/FL$/, '')
    .replace(/MF$/, 'M')
    .replace(/MSL$/, 'M')
    .replace(/SL$/, '')
    .replace(/F$/, '');
}

function mapSectionTypeToStructureKind(type) {
  switch (type) {
    case 'rc':
      return 'RC';
    case 's':
      return 'S';
    case 'src':
      return 'SRC';
    case 'cft':
      return 'CFT';
    case 'deck':
      return 'DECK';
    default:
      return 'RC';
  }
}

function getSectionContextLabel(section) {
  return normalizeSectionFloorLabel(section?.story || section?.floor || '');
}

function findMatchingSection(symbol, contextLabel, sectionList) {
  if (!sectionList || !symbol) return null;
  const target = normalizeSectionFloorLabel(contextLabel);
  const matches = sectionList.filter((section) => section.symbol === symbol);
  if (matches.length === 0) return null;
  if (target === 'CANTI' || target === 'NORMAL') {
    const bySlabKind = matches.find((section) => !!section.isCanti === (target === 'CANTI'));
    if (bySlabKind) return bySlabKind;
  }

  return (
    matches.find((section) => getSectionContextLabel(section) === target) ||
    matches.find((section) => !getSectionContextLabel(section)) ||
    matches[0]
  );
}

function determineMemberStructureKind(symbol, contextLabel, sectionList) {
  return mapSectionTypeToStructureKind(
    findMatchingSection(symbol, contextLabel, sectionList)?.type,
  );
}

function resolveBeamTypeKey(symbol, contextLabel, sectionList) {
  const matched = findMatchingSection(symbol, contextLabel, sectionList);
  return matched?.type === 's' || matched?.type === 'src' ? matched.type : 'rc';
}

function getSlabKindStructure(section) {
  return section?.type === 'deck' ? 'DECK' : 'RC';
}

/**
 * 床断面の方向フィールドから direction_load と angle_load を決定
 * @param {Object|null} section
 * @returns {{direction_load: string, angle_load: string|undefined}}
 */
function getSlabDirectionLoad(section) {
  const dir = section?.direction || '';
  if (dir.includes('Ｙ') || dir.includes('Y') || dir === 'y') {
    return { direction_load: '1WAY', angle_load: '180.0' };
  }
  if (dir.includes('Ｘ') || dir.includes('X') || dir === 'x') {
    return { direction_load: '1WAY', angle_load: '90.0' };
  }
  return { direction_load: '2WAY', angle_load: undefined };
}

function resolveConcreteStrength(ss7Data) {
  const { sections } = ss7Data || {};
  if (!sections) return 'Fc21';

  const candidates = [
    ...(sections.columns || []).map((sec) => sec.material),
    ...(sections.beams || []).map((sec) => sec.material),
    ...(sections.walls || []).map((sec) => sec.material),
    ...(sections.parapets || []).map((sec) => sec.material),
    ...(sections.floors || []).map((sec) => sec.concrete),
  ];

  return (
    candidates.find((value) => /^FC?\d+/i.test(String(value || ''))) ||
    candidates.find((value) => value) ||
    'Fc21'
  );
}

/**
 * SS7パースデータからSTB XMLを生成
 * @param {Object} ss7Data - SS7CsvReader.parseInput()の結果
 * @returns {string} STB XML文字列
 */
export function generateSs7ToStbXml(ss7Data) {
  const ctx = new GenerationContext(ss7Data);

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<ST_BRIDGE version="2.1.0" xmlns="https://www.building-smart.or.jp/dl">');

  // StbCommon
  const projectName = ss7Data.header?.projectName || 'SS7-Converted';
  lines.push(
    `${indent(1)}<StbCommon ${buildAttrString({
      guid: ctx.nextGuid(),
      project_name: projectName,
      app_name: 'SS7-STB-Converter',
      app_version: '1.0.0',
      strength_concrete: ctx.defaultConcreteStrength,
    })}>`,
  );
  lines.push(`${indent(2)}<StbApplyConditionsList>`);
  lines.push(`${indent(3)}<StbApplyConditionList_RC>`);
  lines.push(`${indent(4)}<StbApply_RC_Column/>`);
  lines.push(`${indent(4)}<StbApply_RC_Girder/>`);
  lines.push(`${indent(4)}<StbApply_RC_Beam/>`);
  lines.push(`${indent(4)}<StbApply_RC_Wall/>`);
  lines.push(`${indent(3)}</StbApplyConditionList_RC>`);
  lines.push(`${indent(2)}</StbApplyConditionsList>`);
  lines.push(`${indent(1)}</StbCommon>`);

  // StbModel
  lines.push(`${indent(1)}<StbModel>`);

  generateNodes(lines, ctx);
  generateStories(lines, ctx);
  generateAxes(lines, ctx);
  generateMembers(lines, ctx);
  lines.push(`${indent(2)}<StbSections>`);
  generateSections(lines, ctx);
  lines.push(`${indent(2)}</StbSections>`);
  generateOpenArrangements(lines, ctx);

  lines.push(`${indent(1)}</StbModel>`);

  lines.push('</ST_BRIDGE>');
  return lines.join('\n');
}

/**
 * 変換コンテキスト - IDの生成とノードルックアップを管理
 */
class GenerationContext {
  constructor(ss7Data) {
    this.ss7Data = ss7Data;
    this._nextId = 1;
    this._nextGuid = 1;
    this.defaultConcreteStrength = resolveConcreteStrength(ss7Data);

    // ノードマップ: "xAxis_yAxis_story" → { id, x, y, z }
    this.nodeMap = new Map();

    // 階→ノードIDセット: storyName → Set<nodeId>（StbNodeIdList生成用）
    this.storyNodeIds = new Map();

    // 軸位置マップ
    this.xAxisPositionMap = new Map();
    this.yAxisPositionMap = new Map();

    // 階高マップ: storyName → height(mm)
    this.storyHeightMap = new Map();

    // 断面IDマップ: symbol → stb section id
    this.sectionIdMap = new Map();

    // 断面IDフォールバックマップ: 層名なしのシンボルのみキー → 最初の断面ID
    this.sectionSymbolFallbackMap = new Map();

    // 階名→層名マップ
    this.floorToStoryMap = new Map();

    // 節点同一化マップ: "fromKey" → "toKey"
    this.nodeUnificationMap = new Map();

    // 軸振れマップ: "xAxis_yAxis" → { deltaX, deltaY }
    this.axisDeviationMap = new Map();

    // 大梁断面高さマップ（ブレースZ offset計算用・開口下端梁せい算出用）
    this.girderSectionDepthMap = new Map();
    // 大梁断面幅マップ（部材寄りのオフセット計算用）
    this.girderSectionWidthMap = new Map();

    // 床組形状マップ: shapeId → shape
    this.floorGroupShapesMap = new Map();
    // 中間節点マップ: "x_y_z" → { id, x, y, z }
    this.intermediateNodeMap = new Map();
    // 片持梁先端節点マップ: "story_x_y_direction" → { id, x, y, z }
    this.cantileverNodeMap = new Map();
    // 床組バンマップ: "story_xStart_xEnd_yStart_yEnd" → BayInfo
    this.floorGroupBayMap = new Map();
    // 床組バン→形状IDマップ: "story_xStart_xEnd_yStart_yEnd" → shapeId (小梁shape検索フォールバック用)
    this.simpleBayToShapeIdMap = new Map();
    // SS7基準床オフセット(mm): CSV最低層高さ。STB座標系では1FL=0
    this.baseZ = 0;

    // 小梁シンボルセット（セクション生成時のkind_beam判定用）
    this.beamSymbols = new Set();
    // 柱位置セット: "xAxis_yAxis"
    this.columnAxisSet = new Set();
    // 壁IDマップ: wallKey → stb wall id（StbOpenArrangement の id_member 用）
    this.wallIdByKey = new Map();

    // 床断面の「標準」コンクリートを層ごとの強度に展開: 'symbol_CANTI' → Set<concrete>
    this.floorSectionConcretesMap = new Map();

    this._buildAxisDeviationMap();
    this._buildAxisMaps();
    this._buildStoryMap();
    this._buildColumnAxisSet();
    this._buildNodes();
    this._buildNodeUnifications();
    this._buildFloorToStoryMap();
    this._buildWallSymbolMap();
    this._buildShearWallSymbolSet();
    this._buildSectionIdMap();
    this._buildGirderSectionDepthMap();
    this._buildFloorGroupMap();
    this._buildFloorGroupNodes();
    this._buildBraceApexNodes();
    this._buildCantileverNodes();
    this._buildCantileverSlabNodes();
    this._buildOutOfFrameWallNodes();
    this._buildBeamSymbolSet();
  }

  nextId() {
    return this._nextId++;
  }

  nextGuid() {
    return formatGuid(this._nextGuid++);
  }

  isOnXAxis(position) {
    for (const axisPos of this.xAxisPositionMap.values()) {
      if (Math.abs(position - axisPos) < 1e-6) return true;
    }
    return false;
  }

  isOnYAxis(position) {
    for (const axisPos of this.yAxisPositionMap.values()) {
      if (Math.abs(position - axisPos) < 1e-6) return true;
    }
    return false;
  }

  getNodeKind(x, y) {
    const onX = this.isOnXAxis(x);
    const onY = this.isOnYAxis(y);
    if (onX && onY) return 'ON_GRID';
    if (onX || onY) return 'ON_GIRDER';
    return 'ON_BEAM';
  }

  getBottomStoryName() {
    const stories = this.ss7Data?.stories || [];
    return stories.length > 0 ? stories[stories.length - 1].name : '';
  }

  isFoundationStory(storyName) {
    return (
      normalizeSectionFloorLabel(storyName) ===
      normalizeSectionFloorLabel(this.getBottomStoryName())
    );
  }

  getFoundationColumnLength() {
    const foundationBeam = (this.ss7Data.sections?.beams || []).find(
      (section) => section.type === 'rc' && this.isFoundationStory(section.story),
    );
    return foundationBeam?.dims?.height || 800;
  }

  getFloorSectionId(symbol, kindSlab = 'NORMAL', story = null) {
    // 「標準」コンクリートの断面は層ごとのIDを返す
    const concreteKey = `${symbol}_${kindSlab}`;
    if (this.floorSectionConcretesMap.has(concreteKey) && story) {
      const storyConcreteMap = this.ss7Data.storyConcretes || new Map();
      const info = storyConcreteMap.get(story);
      const isCanti = kindSlab === 'CANTI';
      const c = isCanti ? info?.cantiFloor : info?.floor;
      if (c && c !== '標準') {
        return this.sectionIdMap.get(`floor_${symbol}_${kindSlab}_${c}`) || '';
      }
      // フォールバック: 最初の登録コンクリート
      const first = [...this.floorSectionConcretesMap.get(concreteKey)][0];
      return this.sectionIdMap.get(`floor_${symbol}_${kindSlab}_${first}`) || '';
    }
    return (
      this.sectionIdMap.get(`floor_${symbol}_${kindSlab}`) ||
      this.sectionIdMap.get(`floor_${symbol}_NORMAL`) ||
      ''
    );
  }

  getCantileverNodeId(placement) {
    const key = `${placement.story}_${placement.xAxis}_${placement.yAxis}_${placement.direction}`;
    return this.cantileverNodeMap.get(key)?.id ?? null;
  }

  _buildColumnAxisSet() {
    for (const column of this.ss7Data.columnPlacements || []) {
      this.columnAxisSet.add(`${column.xAxis}_${column.yAxis}`);
    }
  }

  _buildAxisDeviationMap() {
    const { axisDeviations } = this.ss7Data;
    if (!axisDeviations) return;
    for (const dev of axisDeviations) {
      this.axisDeviationMap.set(`${dev.xAxis}_${dev.yAxis}`, {
        deltaX: dev.deltaX,
        deltaY: dev.deltaY,
      });
    }
  }

  _buildAxisMaps() {
    const { axes } = this.ss7Data;
    if (!axes) return;
    for (const ax of axes.xAxes || []) {
      this.xAxisPositionMap.set(ax.name, ax.position);
    }
    for (const ax of axes.yAxes || []) {
      this.yAxisPositionMap.set(ax.name, ax.position);
    }
  }

  _buildStoryMap() {
    const { stories } = this.ss7Data;
    if (!stories) return;
    // SS7はGL=0ではなく1FL高さ(例:100mm)を基準とするため、最低層高さを引いてSTB座標系(1FL=0)に正規化する
    this.baseZ = stories.length ? Math.min(...stories.map((s) => s.height)) : 0;
    for (const s of stories) {
      this.storyHeightMap.set(s.name, s.height - this.baseZ);
    }
  }

  _buildNodes() {
    const { axes, stories, nodeVerticalMovements } = this.ss7Data;
    if (!axes || !stories) return;

    // 節点上下移動マップ
    const verticalMoveMap = new Map();
    if (nodeVerticalMovements) {
      for (const vm of nodeVerticalMovements) {
        const key = `${vm.xAxis}_${vm.yAxis}_${vm.story}`;
        verticalMoveMap.set(key, vm.deltaZ);
      }
    }

    for (const story of stories) {
      const z = story.height - this.baseZ;
      const storyNodes = new Set();
      for (const xAx of axes.xAxes || []) {
        for (const yAx of axes.yAxes || []) {
          const key = `${xAx.name}_${yAx.name}_${story.name}`;
          const deltaZ = verticalMoveMap.get(key) || 0;
          // 軸振れ: XY平面内の節点偏差（全層共通）
          const dev = this.axisDeviationMap.get(`${xAx.name}_${yAx.name}`);
          const id = this.nextId();
          this.nodeMap.set(key, {
            id,
            guid: this.nextGuid(),
            x: xAx.position + (dev ? dev.deltaX : 0),
            y: yAx.position + (dev ? dev.deltaY : 0),
            z: z + deltaZ,
            kind: 'ON_GRID',
          });
          storyNodes.add(String(id));
        }
      }
      this.storyNodeIds.set(story.name, storyNodes);
    }
  }

  _buildSectionIdMap() {
    const { sections } = this.ss7Data;
    if (!sections) return;

    // 柱断面 (配置で使用される (symbol, floor) ペアのみ断面IDを登録する)
    const usedColKeys = new Set();
    for (const p of this.ss7Data.columnPlacements || []) {
      if (p.symbol && p.floor) usedColKeys.add(`${p.symbol}|${p.floor}`);
    }
    const colSections = deduplicateSections(sections.columns || []);
    for (const sec of colSections) {
      // 配置に使われていない (symbol, floor) の断面はスキップ
      if (sec.floor && usedColKeys.size > 0 && !usedColKeys.has(`${sec.symbol}|${sec.floor}`))
        continue;
      this.sectionIdMap.set(`col_${sec.symbol}_${sec.floor || ''}`, this.nextId());
      if (
        sec.type === 's' &&
        sec.exposedBase?.foundation?.widthX > 0 &&
        sec.exposedBase?.foundation?.widthY > 0
      ) {
        this.sectionIdMap.set(`foundation_${sec.symbol}_${sec.floor || ''}`, this.nextId());
      }
    }

    // 梁断面 (RC/S/SRC × 階ごとに別キーで登録)
    // 配置で使用される (symbol, story) ペアのみ断面IDを登録する
    const usedBeamKeys = new Set();
    for (const p of [
      ...(this.ss7Data.girderPlacements || []),
      ...(this.ss7Data.subBeamPlacements || []),
      ...(this.ss7Data.cantileverGirderPlacements || []),
    ]) {
      if (p.symbol && p.story) usedBeamKeys.add(`${p.symbol}|${p.story}`);
    }
    // floorGroupLayouts由来の小梁配置 (storyName は後でfloorGroupBayMapに格納されるが、ここではlayoutsから収集)
    for (const layout of this.ss7Data.floorGroupLayouts || []) {
      if (layout.beamSymbol && layout.story)
        usedBeamKeys.add(`${layout.beamSymbol}|${layout.story}`);
    }

    const beamsByType = { rc: [], s: [], src: [] };
    for (const sec of sections.beams || []) {
      const t = sec.type in beamsByType ? sec.type : 'rc';
      beamsByType[t].push(sec);
    }
    for (const [type, list] of Object.entries(beamsByType)) {
      for (const sec of deduplicateSections(list)) {
        if (!sec.story) {
          // story情報がない断面（RC小梁断面等）: コンクリート強度グループごとに1つIDを登録
          const placedStories = [...usedBeamKeys]
            .filter((k) => k.startsWith(`${sec.symbol}|`))
            .map((k) => k.slice(sec.symbol.length + 1));
          const storyConcretes = this.ss7Data.storyConcretes || new Map();
          // コンクリート強度→代表storyのマップ（最初に見つかったstoryを代表）
          const concGroupMap = new Map();
          for (const storyName of placedStories) {
            const concreteInfo = storyConcretes.get(storyName);
            const conc = concreteInfo?.floor || this.defaultConcreteStrength;
            if (!concGroupMap.has(conc)) concGroupMap.set(conc, storyName);
          }
          if (concGroupMap.size === 0) {
            // 配置がない断面はIDを登録しない（生成スキップ）
          } else {
            for (const [conc] of concGroupMap) {
              const id = this.nextId();
              // concreteStrengthをキーサフィックスに使用（コンクリートグループキー）
              this.sectionIdMap.set(`beam_${type}_${sec.symbol}_conc_${conc}`, id);
              if (!this.sectionSymbolFallbackMap.has(`beam_${type}_${sec.symbol}`)) {
                this.sectionSymbolFallbackMap.set(`beam_${type}_${sec.symbol}`, id);
              }
            }
          }
          continue;
        }
        // 配置に使われていない (symbol, story) の断面はIDを登録しない（生成スキップ）
        if (usedBeamKeys.size > 0 && !usedBeamKeys.has(`${sec.symbol}|${sec.story}`)) {
          continue;
        }
        const storyKey = `beam_${type}_${sec.symbol}_${sec.story}`;
        const id = this.nextId();
        this.sectionIdMap.set(storyKey, id);
        // シンボルのみフォールバック（層名が異なる配置用）
        const fallbackKey = `beam_${type}_${sec.symbol}`;
        if (!this.sectionSymbolFallbackMap.has(fallbackKey)) {
          this.sectionSymbolFallbackMap.set(fallbackKey, id);
        }
      }
    }

    // 柱断面フォールバック（階名が異なる配置用）
    for (const sec of colSections) {
      const fallbackKey = `col_${sec.symbol}`;
      if (!this.sectionSymbolFallbackMap.has(fallbackKey)) {
        this.sectionSymbolFallbackMap.set(
          fallbackKey,
          this.sectionIdMap.get(`col_${sec.symbol}_${sec.floor || ''}`),
        );
      }
    }

    // ブレース断面
    const braceSections = deduplicateSections(sections.braces || []);
    for (const sec of braceSections) {
      this.sectionIdMap.set(`brace_${sec.symbol}`, this.nextId());
    }

    // 壁断面: (symbol, floor) ペアのうち実際に配置されているものだけIDを登録
    const wallFloorsBySymbol = new Map();
    for (const p of this.ss7Data.wallPlacements || []) {
      if (!p.symbol) continue;
      if (!wallFloorsBySymbol.has(p.symbol)) wallFloorsBySymbol.set(p.symbol, new Set());
      wallFloorsBySymbol.get(p.symbol).add(p.floor || '');
    }
    for (const sec of sections.walls || []) {
      const floors = wallFloorsBySymbol.get(sec.symbol);
      if (!floors || floors.size === 0) {
        // 配置がない場合はシンボルのみキーで1つ登録
        this.sectionIdMap.set(`wall_${sec.symbol}`, this.nextId());
        continue;
      }
      for (const floor of floors) {
        this.sectionIdMap.set(`wall_${sec.symbol}_${floor}`, this.nextId());
      }
    }

    // フレーム外雑壁断面: 配置の階範囲から (symbol, story) ごとにIDを登録
    const ofwSections = deduplicateSections(sections.outOfFrameWalls || []);
    {
      const { stories } = this.ss7Data;
      const storyOrder = new Map();
      if (stories) {
        for (let i = 0; i < stories.length; i++) storyOrder.set(stories[i].name, i);
      }
      // symbol → Set<storyName>
      const ofwStoriesBySymbol = new Map();
      for (const p of this.ss7Data.outOfFrameWallPlacements || []) {
        if (!p.symbol) continue;
        const fromStory = this.floorToStoryMap.get(p.floorFrom) || p.floorFrom || '';
        const toStory =
          this.floorToStoryMap.get(p.floorTo || p.floorFrom) || p.floorTo || fromStory;
        const fromIdx = storyOrder.get(fromStory);
        const toIdx = storyOrder.get(toStory);
        if (fromIdx == null || toIdx == null) {
          if (!ofwStoriesBySymbol.has(p.symbol)) ofwStoriesBySymbol.set(p.symbol, new Set());
          ofwStoriesBySymbol.get(p.symbol).add(fromStory || toStory);
          continue;
        }
        if (!ofwStoriesBySymbol.has(p.symbol)) ofwStoriesBySymbol.set(p.symbol, new Set());
        const minIdx = Math.min(fromIdx, toIdx);
        const maxIdx = Math.max(fromIdx, toIdx);
        for (let si = minIdx; si <= maxIdx; si++) {
          ofwStoriesBySymbol.get(p.symbol).add(stories[si].name);
        }
      }
      for (const sec of ofwSections) {
        const storySet = ofwStoriesBySymbol.get(sec.symbol);
        if (!storySet || storySet.size === 0) {
          this.sectionIdMap.set(`ofw_${sec.symbol}`, this.nextId());
        } else {
          for (const storyName of storySet) {
            this.sectionIdMap.set(`ofw_${sec.symbol}_${storyName}`, this.nextId());
          }
        }
      }
    }

    // パラペット断面 (配置ごとに一意のIDを割り当て)
    const parapetPlacements = this.ss7Data.parapetPlacements || [];
    for (let i = 0; i < parapetPlacements.length; i++) {
      this.sectionIdMap.set(`parapet_${i}`, this.nextId());
    }

    // 床断面 (「標準」コンクリートは配置された層ごとの強度に展開)
    const storyConcreteMap = this.ss7Data.storyConcretes || new Map();
    const floorSections = deduplicateSections(sections.floors || []);
    for (const sec of floorSections) {
      const slabKind = sec.isCanti ? 'CANTI' : 'NORMAL';
      if (sec.concrete === '標準') {
        // 配置が存在する層のコンクリート強度を収集
        const placements = sec.isCanti
          ? (this.ss7Data.cantileverSlabPlacements || []).filter((p) => p.symbol === sec.symbol)
          : (this.ss7Data.floorPlacements || []).filter((p) => p.symbol === sec.symbol);
        const concretes = new Set();
        for (const p of placements) {
          const info = storyConcreteMap.get(p.story);
          const c = sec.isCanti ? info?.cantiFloor : info?.floor;
          if (c && c !== '標準') concretes.add(c);
        }
        if (concretes.size === 0) concretes.add(this.defaultConcreteStrength);
        this.floorSectionConcretesMap.set(`${sec.symbol}_${slabKind}`, concretes);
        for (const concrete of concretes) {
          this.sectionIdMap.set(`floor_${sec.symbol}_${slabKind}_${concrete}`, this.nextId());
        }
      } else {
        this.sectionIdMap.set(`floor_${sec.symbol}_${slabKind}`, this.nextId());
      }
    }

    // 杭断面・フーチング断面 (配置で参照される符号のみ登録)
    const pileFoundationMap = new Map();
    for (const f of this.ss7Data.sections?.pileFoundations || []) {
      pileFoundationMap.set(f.symbol, f.pileSymbol);
    }
    const usedPileSymbols = new Set();
    const usedFoundationSymbols = new Set();
    for (const p of this.ss7Data.pilePlacements || []) {
      const pileSymbol = pileFoundationMap.get(p.foundationSymbol);
      if (pileSymbol) usedPileSymbols.add(pileSymbol);
      if (p.foundationSymbol) usedFoundationSymbols.add(p.foundationSymbol);
    }
    for (const sec of this.ss7Data.sections?.piles || []) {
      if (usedPileSymbols.has(sec.symbol)) {
        this.sectionIdMap.set(`pile_${sec.symbol}`, this.nextId());
      }
    }
    // フーチング断面ID登録 (基礎符号ごと)
    for (const sec of this.ss7Data.sections?.pileFoundations || []) {
      if (usedFoundationSymbols.has(sec.symbol)) {
        this.sectionIdMap.set(`footing_sec_${sec.symbol}`, this.nextId());
      }
    }

    // 壁開口: 開口ごとに個別ID・個別断面ID
    this._openIdMap = new Map();
    const wallOpeningPlacements = this.ss7Data.wallOpeningPlacements || [];
    for (let idx = 0; idx < wallOpeningPlacements.length; idx++) {
      this._openIdMap.set(idx, this.nextId());
      this.sectionIdMap.set(`openSec_idx_${idx}`, this.nextId());
    }
  }

  _buildWallSymbolMap() {
    this.wallSymbolMap = new Map();
    for (const wall of this.ss7Data.wallPlacements || []) {
      const key = `${wall.frame}_${wall.startAxis}_${wall.endAxis}_${wall.floor}`;
      this.wallSymbolMap.set(key, wall.symbol);
    }
  }

  /**
   * 耐震壁シンボルセットを構築する
   * 判定基準: コンクリート材料指定あり かつ 縦筋径 >= D13
   */
  _buildShearWallSymbolSet() {
    this.shearWallSymbolSet = new Set();
    for (const wall of this.ss7Data.sections?.walls || []) {
      if (!wall.materialSpecified) continue;
      const vertDia = wall.reinforcement?.vertical?.dia;
      if (!vertDia) continue;
      const diaNum = parseInt(vertDia.replace(/\D/g, ''), 10);
      if (Number.isFinite(diaNum) && diaNum >= 13) {
        this.shearWallSymbolSet.add(wall.symbol);
      }
    }
  }

  isShearWall(symbol) {
    return this.shearWallSymbolSet.has(symbol);
  }

  _buildNodeUnifications() {
    const { nodeUnifications } = this.ss7Data;
    if (!nodeUnifications || nodeUnifications.length === 0) return;

    for (const u of nodeUnifications) {
      const fromKey = `${u.fromX}_${u.fromY}_${u.fromStory}`;
      const toKey = `${u.toX}_${u.toY}_${u.toStory}`;
      if (this.nodeMap.has(fromKey) && this.nodeMap.has(toKey)) {
        this.nodeUnificationMap.set(fromKey, toKey);
      }
    }
  }

  _buildFloorToStoryMap() {
    const { stories, floorStoryPairs } = this.ss7Data;

    // 位置インデックス対応を優先（中二階 "1MF" 等のサフィックス変換で得られない階名も対応）
    if (floorStoryPairs && floorStoryPairs.size > 0) {
      for (const [floorName, storyName] of floorStoryPairs) {
        this.floorToStoryMap.set(floorName, storyName);
      }
      return;
    }

    // フォールバック: 層名サフィックス変換（既存ロジック）
    if (!stories) return;
    for (const story of stories) {
      // 層名→階名の変換パターン:
      // "1FL" → "1F", "2MFL" → "2MF", "1SL" → "1S", "B1SL" → "B1S"
      // SS7の配置データでは "1F", "2F", "B1F" 等の階名が使われる
      const floorName = story.name
        .replace(/MFL$/, 'MF')
        .replace(/FL$/, 'F')
        .replace(/MSL$/, 'MS')
        .replace(/SL$/, 'S');
      this.floorToStoryMap.set(floorName, story.name);

      // 層名そのものをキーとして登録（壁配置等で層名が直接使われる場合に対応）
      if (!this.floorToStoryMap.has(story.name)) {
        this.floorToStoryMap.set(story.name, story.name);
      }

      // SL系の建物でも階名が "F" で指定されるケースに対応
      // "1SL" → "1S" だが配置データは "1F" を使う場合がある
      if (story.name.endsWith('SL') && !story.name.endsWith('MSL')) {
        const altFloor = story.name.replace(/SL$/, 'F');
        if (!this.floorToStoryMap.has(altFloor)) {
          this.floorToStoryMap.set(altFloor, story.name);
        }
      }
    }
  }

  /**
   * ノードIDを取得
   * @param {string} xAxis
   * @param {string} yAxis
   * @param {string} storyName
   * @returns {number|null}
   */
  getNodeId(xAxis, yAxis, storyName) {
    const node = this.getNode(xAxis, yAxis, storyName);
    return node ? node.id : null;
  }

  /**
   * ノード情報を取得
   * @param {string} xAxis
   * @param {string} yAxis
   * @param {string} storyName
   * @returns {{id:number,guid:string,x:number,y:number,z:number,kind:string}|null}
   */
  getNode(xAxis, yAxis, storyName) {
    let key = `${xAxis}_${yAxis}_${storyName}`;
    // 節点同一化: fromノードが参照されたらtoノードのIDを返す
    const unifiedKey = this.nodeUnificationMap.get(key);
    if (unifiedKey) key = unifiedKey;
    return this.nodeMap.get(key) || null;
  }

  /**
   * 階名から層名を取得
   */
  getStoryNameFromFloor(floorName) {
    return this.floorToStoryMap.get(floorName) || floorName;
  }

  /**
   * 階名に対応する上下の層名を取得（柱用）
   * 柱は "1F" → 1FL(底)～2FL(頂) の間
   */
  getColumnStoryRange(floorName) {
    const stories = this.ss7Data.stories;
    if (!stories) return null;

    // 階名→層名変換
    const bottomStoryName = this.floorToStoryMap.get(floorName);
    if (!bottomStoryName) return null;

    // stories は上から下の順
    const bottomIndex = stories.findIndex((s) => s.name === bottomStoryName);
    if (bottomIndex < 0) return null;

    const topIndex = bottomIndex - 1;
    if (topIndex < 0) return null;

    return {
      bottomStory: stories[bottomIndex].name,
      topStory: stories[topIndex].name,
    };
  }

  hasColumnAtAxis(xAxis, yAxis) {
    return this.columnAxisSet.has(`${xAxis}_${yAxis}`);
  }

  hasGirderPlacementAt(storyName, frameAxis, frame, startAxis, endAxis) {
    return (this.ss7Data.girderPlacements || []).some((girder) => {
      if (girder.story !== storyName || girder.frameAxis !== frameAxis || girder.frame !== frame) {
        return false;
      }
      return (
        (girder.startAxis === startAxis && girder.endAxis === endAxis) ||
        (girder.startAxis === endAxis && girder.endAxis === startAxis)
      );
    });
  }

  hasPerpendicularGirderAt(storyName, frameAxis, xAxis, yAxis) {
    return (this.ss7Data.girderPlacements || []).some((girder) => {
      if (girder.story !== storyName || girder.frameAxis === frameAxis) {
        return false;
      }

      if (frameAxis === 'Y') {
        if (girder.frame !== xAxis) return false;
        const startPos = this.yAxisPositionMap.get(girder.startAxis);
        const endPos = this.yAxisPositionMap.get(girder.endAxis);
        const pointPos = this.yAxisPositionMap.get(yAxis);
        if (startPos === undefined || endPos === undefined || pointPos === undefined) return false;
        return pointPos >= Math.min(startPos, endPos) && pointPos <= Math.max(startPos, endPos);
      }

      if (girder.frame !== yAxis) return false;
      const startPos = this.xAxisPositionMap.get(girder.startAxis);
      const endPos = this.xAxisPositionMap.get(girder.endAxis);
      const pointPos = this.xAxisPositionMap.get(xAxis);
      if (startPos === undefined || endPos === undefined || pointPos === undefined) return false;
      return pointPos >= Math.min(startPos, endPos) && pointPos <= Math.max(startPos, endPos);
    });
  }

  getBraceStoryRange(brace) {
    const stories = this.ss7Data.stories || [];
    const bottomStory = this.getStoryNameFromFloor(brace.floor);
    if (!bottomStory) return null;

    const bottomIndex = stories.findIndex((story) => story.name === bottomStory);
    if (bottomIndex < 0) return null;

    let fallbackTopStory = null;
    for (let i = bottomIndex - 1; i >= 0; i--) {
      const candidate = stories[i].name;
      fallbackTopStory ||= candidate;
      if (
        this.hasGirderPlacementAt(
          candidate,
          brace.frameAxis,
          brace.frame,
          brace.startAxis,
          brace.endAxis,
        )
      ) {
        return {
          bottomStory,
          topStory: candidate,
        };
      }
    }

    if (!fallbackTopStory) return null;
    return {
      bottomStory,
      topStory: fallbackTopStory,
    };
  }

  shouldGenerateKUpperBrace(brace, storyRange = null) {
    const range = storyRange || this.getBraceStoryRange(brace);
    if (!range) return false;
    return this.hasGirderPlacementAt(
      range.bottomStory,
      brace.frameAxis,
      brace.frame,
      brace.startAxis,
      brace.endAxis,
    );
  }

  interpolateBetweenNodes(nodeA, nodeB, ratio) {
    return {
      x: nodeA.x + (nodeB.x - nodeA.x) * ratio,
      y: nodeA.y + (nodeB.y - nodeA.y) * ratio,
      z: nodeA.z + (nodeB.z - nodeA.z) * ratio,
    };
  }

  interpolateFramePoint(frameAxis, frame, startAxis, endAxis, storyName, ratio = 0.5) {
    const startNode =
      frameAxis === 'Y'
        ? this.getNode(startAxis, frame, storyName)
        : this.getNode(frame, startAxis, storyName);
    const endNode =
      frameAxis === 'Y'
        ? this.getNode(endAxis, frame, storyName)
        : this.getNode(frame, endAxis, storyName);
    if (!startNode || !endNode) return null;
    return this.interpolateBetweenNodes(startNode, endNode, ratio);
  }

  _createPointKey(x, y, z) {
    return `${x.toFixed(3)}_${y.toFixed(3)}_${z.toFixed(3)}`;
  }

  getBayInterpolatedPoint(bay, x, y) {
    const bl = this.getNode(bay.xStart, bay.yStart, bay.storyName);
    const br = this.getNode(bay.xEnd, bay.yStart, bay.storyName);
    const tr = this.getNode(bay.xEnd, bay.yEnd, bay.storyName);
    const tl = this.getNode(bay.xStart, bay.yEnd, bay.storyName);
    if (!bl || !br || !tr || !tl) return null;

    const u = Math.abs(bay.x2 - bay.x1) < 1e-9 ? 0 : (x - bay.x1) / (bay.x2 - bay.x1);
    const v = Math.abs(bay.y2 - bay.y1) < 1e-9 ? 0 : (y - bay.y1) / (bay.y2 - bay.y1);
    const blend = (a, b, c, d) =>
      a * (1 - u) * (1 - v) + b * u * (1 - v) + c * u * v + d * (1 - u) * v;

    return {
      x: blend(bl.x, br.x, tr.x, tl.x),
      y: blend(bl.y, br.y, tr.y, tl.y),
      z: blend(bl.z, br.z, tr.z, tl.z),
    };
  }

  getOrCreateInterpolatedNodeForBay(bay, x, y) {
    const point = this.getBayInterpolatedPoint(bay, x, y);
    if (!point) return null;
    return this._getOrCreateIntermediateNode(point.x, point.y, point.z);
  }

  getInterpolatedNodeIdForBay(bay, x, y) {
    const point = this.getBayInterpolatedPoint(bay, x, y);
    if (!point) return null;
    return this._getIntermediateNodeId(point.x, point.y, point.z);
  }

  _buildGirderSectionDepthMap() {
    const { sections } = this.ss7Data;
    if (!sections) return;
    for (const beam of sections.beams || []) {
      // RC梁: dims.height（centerD）を優先、S梁: sectionNameから解析
      const depth = beam.dims?.height || parseSectionDepth(beam.sectionName);
      if (depth > 0) this.girderSectionDepthMap.set(beam.symbol, depth);
      const width = beam.dims?.width || 0;
      if (width > 0) this.girderSectionWidthMap.set(beam.symbol, width);
    }
  }

  /**
   * 大梁断面高さを取得（mm）
   * @param {string} symbol - 断面符号
   * @returns {number} 断面高さ (0 if unknown)
   */
  getGirderDepth(symbol) {
    return this.girderSectionDepthMap.get(symbol) || 0;
  }

  /**
   * 大梁断面幅を取得（mm）
   * @param {string} symbol - 断面符号
   * @returns {number} 断面幅 (0 if unknown)
   */
  getGirderWidth(symbol) {
    return this.girderSectionWidthMap.get(symbol) || 0;
  }

  /**
   * 開口端部の柱断面幅の半分を取得（mm）
   * @param {string} frameAxis - 'X' or 'Y'（壁のフレーム方向）
   * @param {string} frameName - フレーム軸名（例: 'Y1'）
   * @param {string} axisName - 開口端部の軸名（例: 'X2'）
   * @param {string} floor - 階名
   * @param {'x'|'y'} direction - 取得する方向（X方向幅 or Y方向幅）
   * @returns {number}
   */
  getColumnHalfSizeAtAxis(frameAxis, frameName, axisName, floor, direction) {
    const colPlacements = this.ss7Data.columnPlacements || [];
    let placement;
    if (frameAxis === 'Y') {
      // Y軸フレームの壁はX方向に展開: 柱交点 (yAxis=frameName, xAxis=axisName)
      placement = colPlacements.find(
        (c) =>
          c.yAxis?.toUpperCase() === frameName?.toUpperCase() &&
          c.xAxis?.toUpperCase() === axisName?.toUpperCase(),
      );
    } else {
      // X軸フレームの壁はY方向に展開: 柱交点 (xAxis=frameName, yAxis=axisName)
      placement = colPlacements.find(
        (c) =>
          c.xAxis?.toUpperCase() === frameName?.toUpperCase() &&
          c.yAxis?.toUpperCase() === axisName?.toUpperCase(),
      );
    }
    if (!placement) return 0;
    const section = findMatchingSection(placement.symbol, floor, this.ss7Data.sections?.columns);
    if (!section?.dims) return 0;
    return direction === 'x' ? (section.dims.width || 0) / 2 : (section.dims.height || 0) / 2;
  }

  /**
   * 指定フレーム上の下端梁のせい/2 を取得（mm）
   * @param {string} floor - 階名
   * @param {string} frameAxis - 'X' or 'Y'
   * @param {string} frameName - フレーム軸名
   * @param {string} startAxis - 開始軸名
   * @param {string} endAxis - 終了軸名
   * @returns {number}
   */
  getBeamHalfDepthAtFloor(floor, frameAxis, frameName, startAxis, endAxis) {
    const storyName = this.getStoryNameFromFloor(floor);
    const girder = (this.ss7Data.girderPlacements || []).find((g) => {
      const gs = this.getStoryNameFromFloor(g.floor) || g.story;
      return (
        gs === storyName &&
        g.frameAxis === frameAxis &&
        g.frame?.toUpperCase() === frameName?.toUpperCase() &&
        g.startAxis?.toUpperCase() === startAxis?.toUpperCase() &&
        g.endAxis?.toUpperCase() === endAxis?.toUpperCase()
      );
    });
    if (!girder) return 0;
    return this.getGirderDepth(girder.symbol) / 2;
  }

  /**
   * 壁の階高（高さ）を取得（mm）
   * @param {string} floor - 階名（例: '1F'）
   * @returns {number}
   */
  getWallHeightAtFloor(floor) {
    const stories = this.ss7Data.stories;
    if (!stories) return 0;
    const storyName = this.floorToStoryMap.get(floor) || floor;
    const bottomIdx = stories.findIndex((s) => s.name === storyName);
    if (bottomIdx < 0) return 0;
    const topIdx = bottomIdx - 1;
    if (topIdx < 0) return 0;
    const bottomH = this.storyHeightMap.get(stories[bottomIdx].name) ?? 0;
    const topH = this.storyHeightMap.get(stories[topIdx].name) ?? 0;
    return topH - bottomH;
  }

  getGirderPlacementKey(girder) {
    return `${girder.story}|${girder.frameAxis}|${girder.frame}|${girder.startAxis}|${girder.endAxis}`;
  }

  getGirderPlacementOffset(girder) {
    const specific = this.ss7Data.specificGirderEccentricities?.get(
      this.getGirderPlacementKey(girder),
    );
    const rawOffset =
      specific?.offset ??
      this.ss7Data.memberEccentricities?.get(String(girder.frame).toUpperCase())?.girderOffset ??
      0;
    const control =
      specific?.control ??
      this.ss7Data.memberEccentricities?.get(String(girder.frame).toUpperCase())?.control ??
      '';
    const girderSection = findMatchingSection(
      girder.symbol,
      girder.story,
      this.ss7Data.sections?.beams,
    );
    const girderWidth = girderSection?.dims?.width ?? 0;
    return rawOffset + eccControlToSectionSign(control) * (girderWidth / 2);
  }

  getGirderPlacementLevel(girder) {
    const specific = this.ss7Data.specificGirderLevelAdjustments?.get(
      this.getGirderPlacementKey(girder),
    );
    if (specific) return specific.level ?? 0;

    return this.ss7Data.girderLevelAdjustments?.get(girder.story) ?? 0;
  }

  /**
   * 小梁（StbBeam）で使用される断面シンボルを収集
   * subBeamPlacements と floorGroupBayMap から小梁シンボルを特定する
   */
  _buildBeamSymbolSet() {
    // 3軸形式の小梁配置
    for (const beam of this.ss7Data.subBeamPlacements || []) {
      if (beam.symbol) this.beamSymbols.add(beam.symbol);
    }
    // 床組由来の4軸形式小梁
    for (const [, bay] of this.floorGroupBayMap) {
      if (bay.beamSymbol) this.beamSymbols.add(bay.beamSymbol);
    }
  }

  _buildFloorGroupMap() {
    const { floorGroupShapes } = this.ss7Data;
    if (!floorGroupShapes) return;
    for (const shape of floorGroupShapes) {
      this.floorGroupShapesMap.set(String(shape.id), shape);
    }
  }

  _buildFloorGroupNodes() {
    const getSplitPositions = (shape, start, end) => {
      const spans = shape.direction === 'X方向' ? shape.spansY || [] : shape.spansX || [];
      if (spans.length > 0) {
        const positions = [];
        let cursor = start;
        for (const span of spans) {
          cursor += span;
          if (cursor > start + 1e-6 && cursor < end - 1e-6) {
            positions.push(cursor);
          }
        }
        if (positions.length > 0) return positions;
      }

      const mid = (start + end) / 2;
      return end - start > 1e-6 ? [mid] : [];
    };

    /**
     * 再帰的に床組形状を解決し、ビームセグメントを収集する。
     *
     * アルゴリズム: 各形状は方向(X/Y)に応じて1本のビームを追加し、
     * refs で指定されたサブパネルを再帰処理する。
     * - X方向: X方向ビーム(midY, x1→x2)を追加、パネルをY方向に分割
     * - Y方向: Y方向ビーム(midX, y1→y2)を追加、パネルをX方向に分割
     *
     * @param {string} shapeId - 形状ID
     * @param {number} x1,x2,y1,y2,z - パネル境界
     * @param {Array} beamSegments - 結果配列 [{sx,sy,ex,ey}]
     * @param {number} depth - 再帰深度
     */
    /**
     * スラブ矩形を再帰的に収集する。
     * ビーム生成とは独立して、各形状のビームによるパネル分割を追跡し、
     * リーフパネル（これ以上分割されない矩形）をslabRectsに記録する。
     * 1-ref の場合はビームで2分割した両半分に同じ形状を適用する。
     */
    const collectSlabRects = (shapeId, bayDef, x1, x2, y1, y2, slabRects, depth) => {
      if (depth > 15) return;
      const shape = this.floorGroupShapesMap.get(String(shapeId));
      if (!shape) {
        slabRects.push({ x1, x2, y1, y2 });
        return;
      }

      if (shape.direction === 'X方向') {
        const splitYs = getSplitPositions(shape, y1, y2);
        const bounds = [y1, ...splitYs, y2];
        for (const splitY of splitYs) {
          this.getOrCreateInterpolatedNodeForBay(bayDef, x1, splitY);
          this.getOrCreateInterpolatedNodeForBay(bayDef, x2, splitY);
        }
        for (let i = 0; i < bounds.length - 1; i++) {
          const childShapeId = shape.shapeRefs[i];
          if (childShapeId) {
            collectSlabRects(
              childShapeId,
              bayDef,
              x1,
              x2,
              bounds[i],
              bounds[i + 1],
              slabRects,
              depth + 1,
            );
          } else {
            slabRects.push({ x1, x2, y1: bounds[i], y2: bounds[i + 1] });
          }
        }
      } else {
        const splitXs = getSplitPositions(shape, x1, x2);
        const bounds = [x1, ...splitXs, x2];
        for (const splitX of splitXs) {
          this.getOrCreateInterpolatedNodeForBay(bayDef, splitX, y1);
          this.getOrCreateInterpolatedNodeForBay(bayDef, splitX, y2);
        }
        for (let i = 0; i < bounds.length - 1; i++) {
          const childShapeId = shape.shapeRefs[i];
          if (childShapeId) {
            collectSlabRects(
              childShapeId,
              bayDef,
              bounds[i],
              bounds[i + 1],
              y1,
              y2,
              slabRects,
              depth + 1,
            );
          } else {
            slabRects.push({ x1: bounds[i], x2: bounds[i + 1], y1, y2 });
          }
        }
      }
    };

    /**
     * 再帰的に形状を解決し、ビームセグメントを収集する。
     * ビーム生成用: 1-ref の場合はフルパネルで処理（1本の長いビーム）。
     */
    const resolveShape = (shapeId, bayDef, x1, x2, y1, y2, beamSegments, depth) => {
      if (depth > 15) return;
      const shape = this.floorGroupShapesMap.get(String(shapeId));
      if (!shape) return;

      if (shape.direction === 'X方向') {
        const splitYs = getSplitPositions(shape, y1, y2);
        for (const splitY of splitYs) {
          beamSegments.push({ sx: x1, sy: splitY, ex: x2, ey: splitY });
          this.getOrCreateInterpolatedNodeForBay(bayDef, x1, splitY);
          this.getOrCreateInterpolatedNodeForBay(bayDef, x2, splitY);
        }

        const bounds = [y1, ...splitYs, y2];
        for (let i = 0; i < bounds.length - 1; i++) {
          const childShapeId = shape.shapeRefs[i];
          if (childShapeId) {
            resolveShape(
              childShapeId,
              bayDef,
              x1,
              x2,
              bounds[i],
              bounds[i + 1],
              beamSegments,
              depth + 1,
            );
          }
        }
      } else {
        const splitXs = getSplitPositions(shape, x1, x2);
        for (const splitX of splitXs) {
          beamSegments.push({ sx: splitX, sy: y1, ex: splitX, ey: y2 });
          this.getOrCreateInterpolatedNodeForBay(bayDef, splitX, y1);
          this.getOrCreateInterpolatedNodeForBay(bayDef, splitX, y2);
        }

        const bounds = [x1, ...splitXs, x2];
        for (let i = 0; i < bounds.length - 1; i++) {
          const childShapeId = shape.shapeRefs[i];
          if (childShapeId) {
            resolveShape(
              childShapeId,
              bayDef,
              bounds[i],
              bounds[i + 1],
              y1,
              y2,
              beamSegments,
              depth + 1,
            );
          }
        }
      }
    };

    const processLayout = (layoutEntry) => {
      const storyName = this.floorToStoryMap.get(layoutEntry.story) || layoutEntry.story;
      const bayKey =
        `${storyName}_${layoutEntry.xStart}_${layoutEntry.xEnd}_${layoutEntry.yStart}_${layoutEntry.yEnd}` +
        `_${layoutEntry.shapeId || ''}_${layoutEntry.beamSymbol || ''}_${layoutEntry.level || ''}`;
      if (this.floorGroupBayMap.has(bayKey)) return;

      // 小梁配置のshape検索フォールバック用: 単純バイキーで形状IDを記録
      // shapeId=0 は「形状なし」なのでスキップし、有効な形状IDを優先して登録する
      const simpleBayKey = `${storyName}_${layoutEntry.xStart}_${layoutEntry.xEnd}_${layoutEntry.yStart}_${layoutEntry.yEnd}`;
      if (
        !this.simpleBayToShapeIdMap.has(simpleBayKey) &&
        layoutEntry.shapeId &&
        layoutEntry.shapeId !== '0'
      ) {
        this.simpleBayToShapeIdMap.set(simpleBayKey, layoutEntry.shapeId);
      }

      const shape = this.floorGroupShapesMap.get(String(layoutEntry.shapeId));
      if (!shape) return;

      const x1 = this.xAxisPositionMap.get(layoutEntry.xStart);
      const x2 = this.xAxisPositionMap.get(layoutEntry.xEnd);
      const y1 = this.yAxisPositionMap.get(layoutEntry.yStart);
      const y2 = this.yAxisPositionMap.get(layoutEntry.yEnd);
      if (x1 === undefined || x2 === undefined || y1 === undefined || y2 === undefined) return;

      const bayDef = {
        x1,
        x2,
        y1,
        y2,
        storyName,
        xStart: layoutEntry.xStart,
        xEnd: layoutEntry.xEnd,
        yStart: layoutEntry.yStart,
        yEnd: layoutEntry.yEnd,
      };

      // ビームセグメントとスラブ矩形をそれぞれ独立して収集
      const beamSegments = [];
      const slabRects = [];
      resolveShape(layoutEntry.shapeId, bayDef, x1, x2, y1, y2, beamSegments, 0);
      collectSlabRects(layoutEntry.shapeId, bayDef, x1, x2, y1, y2, slabRects, 0);

      if (beamSegments.length === 0) return;

      // 交点ノードを作成（X方向ビームとY方向ビームの交点）
      for (const seg of beamSegments) {
        for (const other of beamSegments) {
          if (seg === other) continue;
          // X方向ビーム(sy===ey)とY方向ビーム(sx===ex)の交点
          if (Math.abs(seg.sy - seg.ey) < 1 && Math.abs(other.sx - other.ex) < 1) {
            const xPos = other.sx;
            const yPos = seg.sy;
            if (
              xPos > seg.sx + 1 &&
              xPos < seg.ex - 1 &&
              yPos > other.sy + 1 &&
              yPos < other.ey - 1
            ) {
              this.getOrCreateInterpolatedNodeForBay(bayDef, xPos, yPos);
            }
          }
        }
      }

      // スラブ矩形の角ノードを作成
      for (const rect of slabRects) {
        this.getOrCreateInterpolatedNodeForBay(bayDef, rect.x1, rect.y1);
        this.getOrCreateInterpolatedNodeForBay(bayDef, rect.x2, rect.y1);
        this.getOrCreateInterpolatedNodeForBay(bayDef, rect.x2, rect.y2);
        this.getOrCreateInterpolatedNodeForBay(bayDef, rect.x1, rect.y2);
      }

      const mergedBeamSegments =
        layoutEntry.beamSymbol &&
        determineMemberStructureKind(
          layoutEntry.beamSymbol,
          storyName,
          this.ss7Data.sections?.beams,
        ) === 'S'
          ? mergeCollinearSegments(beamSegments)
          : beamSegments;

      this.floorGroupBayMap.set(bayKey, {
        ...bayDef,
        storyName,
        xStart: layoutEntry.xStart,
        xEnd: layoutEntry.xEnd,
        yStart: layoutEntry.yStart,
        yEnd: layoutEntry.yEnd,
        beamSegments: mergedBeamSegments,
        slabRects,
        beamSymbol: layoutEntry.beamSymbol || '',
      });
    };

    // 床組配置を先に処理（スラブ分割用）
    for (const layout of this.ss7Data.floorGroupLayouts || []) {
      processLayout(layout);
    }

    // 4軸小梁の中間節点は StbNodes 出力前に確定させる
    for (const beam of this.ss7Data.subBeamPlacements || []) {
      if (beam.format !== '4axis') continue;

      const storyName = this.floorToStoryMap.get(beam.story) || beam.story;
      const x1 = this.xAxisPositionMap.get(beam.xStart);
      const x2 = this.xAxisPositionMap.get(beam.xEnd);
      const y1 = this.yAxisPositionMap.get(beam.yStart);
      const y2 = this.yAxisPositionMap.get(beam.yEnd);
      if (x1 === undefined || x2 === undefined || y1 === undefined || y2 === undefined) continue;

      const rootShapeId = this.simpleBayToShapeIdMap.get(
        `${storyName}_${beam.xStart}_${beam.xEnd}_${beam.yStart}_${beam.yEnd}`,
      );
      const rootShape = rootShapeId ? this.floorGroupShapesMap.get(String(rootShapeId)) : null;
      if (!rootShape) continue;

      const bayDef = {
        x1,
        x2,
        y1,
        y2,
        storyName,
        xStart: beam.xStart,
        xEnd: beam.xEnd,
        yStart: beam.yStart,
        yEnd: beam.yEnd,
      };

      const indices = beam.indices || [0, 0, 0, 0, 0];
      const seg = calcSubBeamPosition(rootShape, this.floorGroupShapesMap, indices, x1, x2, y1, y2);
      if (!seg) continue;

      this.getOrCreateInterpolatedNodeForBay(bayDef, seg.sx, seg.sy);
      this.getOrCreateInterpolatedNodeForBay(bayDef, seg.ex, seg.ey);
    }
  }

  /**
   * 片持床形状配置から先端ノードを生成する
   * 方向マッピング: Xフレーム→右=+X/左=-X、Yフレーム→右=-Y/左=+Y
   */
  _buildCantileverSlabNodes() {
    for (const shape of this.ss7Data.cantileverSlabShapes || []) {
      if (!shape.length) continue;

      let dx = 0;
      let dy = 0;
      if (shape.frameAxis === 'X') {
        dx = shape.direction === '右' ? shape.length : -shape.length;
      } else {
        dy = shape.direction === '右' ? -shape.length : shape.length;
      }

      const storyName = this.getStoryNameFromFloor(shape.story);
      for (const axisName of [shape.startAxis, shape.endAxis]) {
        const baseKey =
          shape.frameAxis === 'X'
            ? `${shape.frame}_${axisName}_${storyName}`
            : `${axisName}_${shape.frame}_${storyName}`;
        const baseNode = this.nodeMap.get(baseKey);
        if (!baseNode) continue;

        const xAxis = shape.frameAxis === 'X' ? shape.frame : axisName;
        const yAxis = shape.frameAxis === 'X' ? axisName : shape.frame;
        const tipKey = `${storyName}_${xAxis}_${yAxis}_SLAB`;
        if (this.cantileverNodeMap.has(tipKey)) continue;

        const node = {
          id: this.nextId(),
          guid: this.nextGuid(),
          x: baseNode.x + dx,
          y: baseNode.y + dy,
          z: baseNode.z,
          kind: 'ON_CANTI',
        };
        this.cantileverNodeMap.set(tipKey, node);
        this.nodeMap.set(`_canti_slab_${tipKey}`, node);
        const storyNodes = this.storyNodeIds.get(storyName);
        if (storyNodes) storyNodes.add(String(node.id));
      }
    }
  }

  getSlabCantileverNodeId(story, xAxis, yAxis) {
    return this.cantileverNodeMap.get(`${story}_${xAxis}_${yAxis}_SLAB`)?.id ?? null;
  }

  _buildCantileverNodes() {
    for (const placement of this.ss7Data.cantileverGirderPlacements || []) {
      const baseKey = `${placement.xAxis}_${placement.yAxis}_${placement.story}`;
      const baseNode = this.nodeMap.get(baseKey);
      if (!baseNode || !placement.length) continue;

      let dx = 0;
      let dy = 0;
      switch (placement.direction) {
        case 'X+':
          dx = placement.length;
          dy = placement.offsetXY || 0;
          break;
        case 'X-':
          dx = -placement.length;
          dy = placement.offsetXY || 0;
          break;
        case 'Y+':
          dx = placement.offsetXY || 0;
          dy = placement.length;
          break;
        case 'Y-':
          dx = placement.offsetXY || 0;
          dy = -placement.length;
          break;
        default:
          continue;
      }

      const node = {
        id: this.nextId(),
        guid: this.nextGuid(),
        x: baseNode.x + dx,
        y: baseNode.y + dy,
        z: baseNode.z + (placement.offsetZ || 0),
        kind: 'ON_CANTI',
      };
      const key = `${placement.story}_${placement.xAxis}_${placement.yAxis}_${placement.direction}`;
      this.cantileverNodeMap.set(key, node);
      this.nodeMap.set(`_canti_${key}`, node);

      // 片持梁ノードも階のノードIDセットに登録
      const storyNodes = this.storyNodeIds.get(placement.story);
      if (storyNodes) {
        storyNodes.add(String(node.id));
      }
    }
  }

  _buildBraceApexNodes() {
    for (const brace of this.ss7Data.bracePlacements || []) {
      if (!(brace.isKUpper && brace.pair === '両方')) continue;

      const storyRange = this.getBraceStoryRange(brace);
      if (!this.shouldGenerateKUpperBrace(brace, storyRange)) continue;
      const point = this.interpolateFramePoint(
        brace.frameAxis,
        brace.frame,
        brace.startAxis,
        brace.endAxis,
        storyRange.topStory,
        0.5,
      );
      if (!point) continue;
      this._getOrCreateIntermediateNode(point.x, point.y, point.z);
    }
  }

  /**
   * フレーム外雑壁の始点・終点ノードを事前作成
   * 各配置の軸交点を基準に、オフセットを加えた座標にノードを生成する
   */
  _buildOutOfFrameWallNodes() {
    const placements = this.ss7Data.outOfFrameWallPlacements || [];
    if (placements.length === 0) return;

    // outOfFrameWallNodeMap: placementIndex_floorName_startOrEnd → node
    this.outOfFrameWallNodeMap = new Map();

    const { stories } = this.ss7Data;
    if (!stories || stories.length === 0) return;

    // 階名の順序マップ（インデックス順）
    const storyOrder = new Map();
    for (let i = 0; i < stories.length; i++) {
      storyOrder.set(stories[i].name, i);
    }

    for (let idx = 0; idx < placements.length; idx++) {
      const p = placements[idx];
      if (!p.axisPair) continue;

      // 軸交点の座標を取得
      const refX = this.xAxisPositionMap.get(p.axisPair.xAxis);
      const refY = this.yAxisPositionMap.get(p.axisPair.yAxis);
      if (refX == null || refY == null) continue;

      // 階範囲の展開
      const floorFrom = p.floorFrom;
      const floorTo = p.floorTo || floorFrom;
      const fromStory = this._resolveFloorToStory(floorFrom);
      const toStory = this._resolveFloorToStory(floorTo);
      const fromIdx = storyOrder.get(fromStory);
      const toIdx = storyOrder.get(toStory);
      if (fromIdx == null || toIdx == null) continue;

      // stories配列は上から下（RSL→B1SL）の順、対応するfloorIdxも上→下
      const minIdx = Math.min(fromIdx, toIdx);
      const maxIdx = Math.max(fromIdx, toIdx);

      for (let si = minIdx; si <= maxIdx; si++) {
        const storyName = stories[si].name;
        const z = this.storyHeightMap.get(storyName);
        if (z == null) continue;

        // 始点ノード
        const startNode = this._getOrCreateIntermediateNode(refX + p.startX, refY + p.startY, z);
        this.outOfFrameWallNodeMap.set(`${idx}_${storyName}_start`, startNode);

        // 終点ノード
        const endNode = this._getOrCreateIntermediateNode(refX + p.endX, refY + p.endY, z);
        this.outOfFrameWallNodeMap.set(`${idx}_${storyName}_end`, endNode);

        // 階のノードIDセットに登録
        const storyNodes = this.storyNodeIds.get(storyName);
        if (storyNodes) {
          storyNodes.add(String(startNode.id));
          storyNodes.add(String(endNode.id));
        }
      }
    }
  }

  /**
   * 階名から層名を解決（floorToStoryMap を使用、見つからなければそのまま返す）
   */
  _resolveFloorToStory(floorName) {
    return this.floorToStoryMap.get(floorName) || floorName;
  }

  _getOrCreateIntermediateNode(x, y, z) {
    const key = this._createPointKey(x, y, z);
    if (this.intermediateNodeMap.has(key)) {
      return this.intermediateNodeMap.get(key);
    }
    const node = {
      id: this.nextId(),
      guid: this.nextGuid(),
      x,
      y,
      z,
      kind: this.getNodeKind(x, y),
    };
    this.intermediateNodeMap.set(key, node);
    this.nodeMap.set(`_int_${key}`, node);
    return node;
  }

  _getIntermediateNodeId(x, y, z) {
    const key = this._createPointKey(x, y, z);
    return this.intermediateNodeMap.get(key)?.id ?? null;
  }
}

/**
 * H形鋼などの断面名から断面高さ(mm)を抽出する
 * 例: "H-250x125x6x9x8" → 250, "H-350" → 350
 * @param {string} sectionName
 * @returns {number}
 */
function parseSectionDepth(sectionName) {
  const match = String(sectionName || '').match(/[-−]\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function pointKey(point) {
  return `${point.x.toFixed(3)}_${point.y.toFixed(3)}_${point.z.toFixed(3)}`;
}

function pointsEqual(a, b, tolerance = 1e-6) {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.z - b.z) <= tolerance
  );
}

function edgeKey(a, b) {
  const k1 = pointKey(a);
  const k2 = pointKey(b);
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

function areCollinear3D(prev, curr, next, tolerance = 1e-6) {
  const ax = curr.x - prev.x;
  const ay = curr.y - prev.y;
  const az = curr.z - prev.z;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  const bz = next.z - curr.z;
  const crossX = ay * bz - az * by;
  const crossY = az * bx - ax * bz;
  const crossZ = ax * by - ay * bx;
  return Math.hypot(crossX, crossY, crossZ) <= tolerance;
}

function isPointOnSegment3D(point, start, end, tolerance = 1e-6) {
  const toPoint = {
    x: point.x - start.x,
    y: point.y - start.y,
    z: point.z - start.z,
  };
  const toEnd = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const crossX = toPoint.y * toEnd.z - toPoint.z * toEnd.y;
  const crossY = toPoint.z * toEnd.x - toPoint.x * toEnd.z;
  const crossZ = toPoint.x * toEnd.y - toPoint.y * toEnd.x;
  if (Math.hypot(crossX, crossY, crossZ) > tolerance) return false;

  const dot = toPoint.x * toEnd.x + toPoint.y * toEnd.y + toPoint.z * toEnd.z;
  if (dot < -tolerance) return false;

  const lenSq = toEnd.x ** 2 + toEnd.y ** 2 + toEnd.z ** 2;
  return dot <= lenSq + tolerance;
}

function edgeBlockedBySegments(start, end, blockerSegments = []) {
  return blockerSegments.some((segment) => {
    if (!segment?.start || !segment?.end) return false;
    return (
      isPointOnSegment3D(start, segment.start, segment.end) &&
      isPointOnSegment3D(end, segment.start, segment.end)
    );
  });
}

function normalizePolygonPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return [];

  const deduped = [];
  for (const point of points) {
    if (!point) continue;
    if (deduped.length === 0 || !pointsEqual(deduped[deduped.length - 1], point)) {
      deduped.push({ ...point });
    }
  }
  if (deduped.length > 1 && pointsEqual(deduped[0], deduped[deduped.length - 1])) {
    deduped.pop();
  }

  if (deduped.length <= 2) return deduped;

  let changed = true;
  while (changed && deduped.length > 2) {
    changed = false;
    for (let i = 0; i < deduped.length; i++) {
      const prev = deduped[(i - 1 + deduped.length) % deduped.length];
      const curr = deduped[i];
      const next = deduped[(i + 1) % deduped.length];
      if (pointsEqual(prev, curr) || pointsEqual(curr, next) || areCollinear3D(prev, curr, next)) {
        deduped.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  return deduped;
}

function findSharedEdge(pointsA, pointsB) {
  for (let i = 0; i < pointsA.length; i++) {
    const aStart = pointsA[i];
    const aEnd = pointsA[(i + 1) % pointsA.length];
    for (let j = 0; j < pointsB.length; j++) {
      const bStart = pointsB[j];
      const bEnd = pointsB[(j + 1) % pointsB.length];
      if (pointsEqual(aStart, bEnd) && pointsEqual(aEnd, bStart)) {
        return {
          aStartIndex: i,
          aEndIndex: (i + 1) % pointsA.length,
          bStartIndex: j,
          bEndIndex: (j + 1) % pointsB.length,
          start: aStart,
          end: aEnd,
        };
      }
    }
  }
  return null;
}

function collectCyclicPoints(points, startIndex, endIndex) {
  const result = [points[startIndex]];
  let index = startIndex;
  while (index !== endIndex) {
    index = (index + 1) % points.length;
    result.push(points[index]);
  }
  return result;
}

function mergePolygonPointArrays(pointsA, pointsB, sharedEdge) {
  const partA = collectCyclicPoints(pointsA, sharedEdge.aEndIndex, sharedEdge.aStartIndex);
  const partB = collectCyclicPoints(pointsB, sharedEdge.bEndIndex, sharedEdge.bStartIndex);
  return normalizePolygonPoints([...partA, ...partB.slice(1)]);
}

function getLineOrientation(record) {
  return Math.abs(record.end.y - record.start.y) > Math.abs(record.end.x - record.start.x)
    ? 'V'
    : 'H';
}

function normalizeLineRecord(record) {
  const orientation = getLineOrientation(record);
  const shouldSwap =
    orientation === 'H'
      ? record.start.x > record.end.x ||
        (Math.abs(record.start.x - record.end.x) < 1e-6 && record.start.y > record.end.y)
      : record.start.y > record.end.y ||
        (Math.abs(record.start.y - record.end.y) < 1e-6 && record.start.x > record.end.x);

  if (!shouldSwap) {
    return { ...record, orientation };
  }

  return {
    ...record,
    start: record.end,
    end: record.start,
    startNodeId: record.endNodeId,
    endNodeId: record.startNodeId,
    orientation,
  };
}

function mergeLineMemberRecords(records) {
  const normalized = records.map((record) => normalizeLineRecord(record));
  const endpointCount = new Map();
  for (const record of normalized) {
    endpointCount.set(pointKey(record.start), (endpointCount.get(pointKey(record.start)) || 0) + 1);
    endpointCount.set(pointKey(record.end), (endpointCount.get(pointKey(record.end)) || 0) + 1);
  }

  const groups = new Map();
  for (const record of normalized) {
    const fixedCoord =
      record.orientation === 'H' ? record.start.y.toFixed(3) : record.start.x.toFixed(3);
    const key = [
      record.storyName || '',
      record.name || '',
      record.id_section || '',
      record.kind_structure || '',
      record.orientation,
      fixedCoord,
    ].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const merged = [];
  for (const list of groups.values()) {
    list.sort((a, b) =>
      a.orientation === 'H'
        ? a.start.x - b.start.x || a.end.x - b.end.x
        : a.start.y - b.start.y || a.end.y - b.end.y,
    );

    let current = null;
    for (const record of list) {
      if (!current) {
        current = { ...record };
        continue;
      }

      const touches = pointsEqual(current.end, record.start);
      const isSimpleChain = (endpointCount.get(pointKey(current.end)) || 0) === 2;

      if (touches && isSimpleChain) {
        current.end = record.end;
        current.endNodeId = record.endNodeId;
      } else {
        merged.push(current);
        current = { ...record };
      }
    }

    if (current) merged.push(current);
  }

  return merged;
}

function mergePolygonRecords(
  records,
  {
    getMergeKey = (record) => record.name || '',
    blockerEdgeKeys = new Set(),
    blockerSegments = [],
    requireFlatSharedEdge = false,
    canMerge = () => true,
    selectMergedSectionId = (a, b) =>
      a.id_section === b.id_section
        ? a.id_section
        : Math.max(...b.points.map((point) => point.z)) >=
            Math.max(...a.points.map((point) => point.z))
          ? b.id_section
          : a.id_section,
  } = {},
) {
  const merged = records.map((record) => ({
    ...record,
    points: normalizePolygonPoints(record.points),
  }));

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (getMergeKey(merged[i]) !== getMergeKey(merged[j])) continue;

        const sharedEdge = findSharedEdge(merged[i].points, merged[j].points);
        if (!sharedEdge) continue;
        if (blockerEdgeKeys.has(edgeKey(sharedEdge.start, sharedEdge.end))) continue;
        if (edgeBlockedBySegments(sharedEdge.start, sharedEdge.end, blockerSegments)) continue;
        if (requireFlatSharedEdge && Math.abs(sharedEdge.start.z - sharedEdge.end.z) > 1e-6) {
          continue;
        }
        if (!canMerge(merged[i], merged[j], sharedEdge)) continue;

        merged[i] = {
          ...merged[i],
          id_section: selectMergedSectionId(merged[i], merged[j]),
          points: mergePolygonPointArrays(merged[i].points, merged[j].points, sharedEdge),
        };
        merged.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }

  return merged;
}

function getStoryDisplayPrefix(storyName) {
  const label = normalizeSectionFloorLabel(storyName);
  if (label.startsWith('R')) return 'R';
  const match = label.match(/^(\d+)/);
  return match ? match[1] : label;
}

function mergeLogicalLinePlacements(placements, ctx) {
  const groups = new Map();
  for (const placement of placements) {
    const key = `${placement.story}|${placement.frameAxis}|${placement.frame}|${placement.symbol}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...placement });
  }

  const getAxisPos = (axisName, axisMap) => axisMap.get(axisName) ?? Number.NaN;
  const result = [];

  for (const list of groups.values()) {
    list.sort((a, b) => {
      const axisMap = a.frameAxis === 'Y' ? ctx.xAxisPositionMap : ctx.yAxisPositionMap;
      return getAxisPos(a.startAxis, axisMap) - getAxisPos(b.startAxis, axisMap);
    });

    let current = null;
    for (const placement of list) {
      if (!current) {
        current = { ...placement };
        continue;
      }

      const sharedAxis = current.endAxis === placement.startAxis ? current.endAxis : null;
      const sharedXAxis = current.frameAxis === 'Y' ? sharedAxis : current.frame;
      const sharedYAxis = current.frameAxis === 'Y' ? current.frame : sharedAxis;
      const canMerge =
        sharedAxis &&
        !ctx.hasColumnAtAxis(sharedXAxis, sharedYAxis) &&
        !(
          current.frameAxis === 'X' &&
          ctx.hasPerpendicularGirderAt(current.story, current.frameAxis, sharedXAxis, sharedYAxis)
        ) &&
        current.story === placement.story &&
        current.frameAxis === placement.frameAxis &&
        current.frame === placement.frame &&
        current.symbol === placement.symbol;

      if (canMerge) {
        current.endAxis = placement.endAxis;
      } else {
        result.push(current);
        current = { ...placement };
      }
    }

    if (current) result.push(current);
  }

  return result;
}

function mergeCollinearSegments(segments) {
  const endpointCount = new Map();
  const countEndpoint = (x, y) => {
    const key = `${x.toFixed(6)}_${y.toFixed(6)}`;
    endpointCount.set(key, (endpointCount.get(key) || 0) + 1);
    return key;
  };
  segments.forEach((segment) => {
    countEndpoint(segment.sx, segment.sy);
    countEndpoint(segment.ex, segment.ey);
  });

  const groups = new Map();
  for (const segment of segments) {
    const horizontal = Math.abs(segment.sy - segment.ey) < 1e-6;
    const key = horizontal ? `H|${segment.sy.toFixed(6)}` : `V|${segment.sx.toFixed(6)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...segment });
  }

  const merged = [];
  for (const [key, list] of groups) {
    const horizontal = key.startsWith('H|');
    list.sort((a, b) => (horizontal ? a.sx - b.sx || a.ex - b.ex : a.sy - b.sy || a.ey - b.ey));

    let current = null;
    for (const segment of list) {
      if (!current) {
        current = { ...segment };
        continue;
      }

      const sharedPointKey = horizontal
        ? `${current.ex.toFixed(6)}_${current.ey.toFixed(6)}`
        : `${current.sx.toFixed(6)}_${current.ey.toFixed(6)}`;
      const touches = horizontal
        ? Math.abs(current.ex - segment.sx) < 1e-6 && Math.abs(current.ey - segment.sy) < 1e-6
        : Math.abs(current.ey - segment.sy) < 1e-6 && Math.abs(current.ex - segment.sx) < 1e-6;
      const isSimpleChain = (endpointCount.get(sharedPointKey) || 0) === 2;

      if (touches && isSimpleChain) {
        current.ex = segment.ex;
        current.ey = segment.ey;
      } else {
        merged.push(current);
        current = { ...segment };
      }
    }
    if (current) merged.push(current);
  }

  return merged;
}

// =============================================================================
// Nodes
// =============================================================================

function generateNodes(lines, ctx) {
  lines.push(`${indent(2)}<StbNodes>`);
  for (const [, node] of ctx.nodeMap) {
    lines.push(
      `${indent(3)}<StbNode ${buildAttrString({
        id: node.id,
        guid: node.guid,
        X: node.x,
        Y: node.y,
        Z: node.z,
        kind: node.kind,
      })}/>`,
    );
  }
  lines.push(`${indent(2)}</StbNodes>`);
}

// =============================================================================
// Stories
// =============================================================================

function generateStories(lines, ctx) {
  const { stories } = ctx.ss7Data;
  if (!stories || stories.length === 0) return;

  lines.push(`${indent(2)}<StbStories>`);
  for (const story of stories) {
    const id = ctx.nextId();
    const kind = mapStoryKind(story.name);
    const nodeIds = ctx.storyNodeIds.get(story.name);
    if (nodeIds && nodeIds.size > 0) {
      lines.push(
        `${indent(3)}<StbStory id="${id}" name="${escXml(story.name)}" height="${story.height - ctx.baseZ}" kind="${kind}">`,
      );
      lines.push(`${indent(4)}<StbNodeIdList>`);
      for (const nodeId of nodeIds) {
        lines.push(`${indent(5)}<StbNodeId id="${nodeId}"/>`);
      }
      lines.push(`${indent(4)}</StbNodeIdList>`);
      lines.push(`${indent(3)}</StbStory>`);
    } else {
      lines.push(
        `${indent(3)}<StbStory id="${id}" name="${escXml(story.name)}" height="${story.height - ctx.baseZ}" kind="${kind}"/>`,
      );
    }
  }
  lines.push(`${indent(2)}</StbStories>`);
}

function mapStoryKind(storyName) {
  // STB uses: GENERAL, BASEMENT, ROOF, PENTHOUSE, ISOLATION, DEPENDENCE
  if (!storyName) return 'GENERAL';
  const upper = String(storyName).toUpperCase();
  // 地下階: B1SL, B2SL, B1FL 等（Bで始まる）
  if (/^B\d/.test(upper)) return 'BASEMENT';
  // 屋根: RSL, RFSL, ROOFSL 等
  if (/^R(F|OOF)?SL$/.test(upper) || upper === 'RSL' || upper === 'RFSL') return 'ROOF';
  // 塔屋: PH, PHSL 等
  if (/^PH/.test(upper)) return 'PENTHOUSE';
  return 'GENERAL';
}

// =============================================================================
// Axes
// =============================================================================

function generateAxes(lines, ctx) {
  const { axes } = ctx.ss7Data;
  if (!axes) return;

  const hasX = axes.xAxes && axes.xAxes.length > 0;
  const hasY = axes.yAxes && axes.yAxes.length > 0;
  if (!hasX && !hasY) return;

  // 軸名→ノードIDセット の逆引きマップを構築
  // nodeMap キー = "xAxis_yAxis_story"
  const xAxisNodeMap = new Map(); // xAxisName → Set<nodeId>
  const yAxisNodeMap = new Map(); // yAxisName → Set<nodeId>
  for (const [key, node] of ctx.nodeMap) {
    const parts = key.split('_');
    if (parts.length >= 3) {
      const xAxis = parts[0];
      const yAxis = parts[1];
      if (!xAxisNodeMap.has(xAxis)) xAxisNodeMap.set(xAxis, new Set());
      if (!yAxisNodeMap.has(yAxis)) yAxisNodeMap.set(yAxis, new Set());
      xAxisNodeMap.get(xAxis).add(node.id);
      yAxisNodeMap.get(yAxis).add(node.id);
    }
  }

  lines.push(`${indent(2)}<StbAxes>`);

  if (hasX) {
    lines.push(`${indent(3)}<StbParallelAxes group_name="X" X="0.0" Y="0.0" angle="90.0">`);
    for (const ax of axes.xAxes) {
      const id = ctx.nextId();
      const nodeIds = xAxisNodeMap.get(ax.name);
      if (nodeIds && nodeIds.size > 0) {
        lines.push(
          `${indent(4)}<StbParallelAxis id="${id}" guid="${ctx.nextGuid()}" name="${escXml(ax.name)}" distance="${ax.position}">`,
        );
        lines.push(`${indent(5)}<StbNodeIdList>`);
        for (const nodeId of nodeIds) {
          lines.push(`${indent(6)}<StbNodeId id="${nodeId}"/>`);
        }
        lines.push(`${indent(5)}</StbNodeIdList>`);
        lines.push(`${indent(4)}</StbParallelAxis>`);
      } else {
        lines.push(
          `${indent(4)}<StbParallelAxis id="${id}" guid="${ctx.nextGuid()}" name="${escXml(ax.name)}" distance="${ax.position}"/>`,
        );
      }
    }
    lines.push(`${indent(3)}</StbParallelAxes>`);
  }

  if (hasY) {
    lines.push(`${indent(3)}<StbParallelAxes group_name="Y" X="0.0" Y="0.0" angle="0.0">`);
    for (const ax of axes.yAxes) {
      const id = ctx.nextId();
      const nodeIds = yAxisNodeMap.get(ax.name);
      if (nodeIds && nodeIds.size > 0) {
        lines.push(
          `${indent(4)}<StbParallelAxis id="${id}" guid="${ctx.nextGuid()}" name="${escXml(ax.name)}" distance="${ax.position}">`,
        );
        lines.push(`${indent(5)}<StbNodeIdList>`);
        for (const nodeId of nodeIds) {
          lines.push(`${indent(6)}<StbNodeId id="${nodeId}"/>`);
        }
        lines.push(`${indent(5)}</StbNodeIdList>`);
        lines.push(`${indent(4)}</StbParallelAxis>`);
      } else {
        lines.push(
          `${indent(4)}<StbParallelAxis id="${id}" guid="${ctx.nextGuid()}" name="${escXml(ax.name)}" distance="${ax.position}"/>`,
        );
      }
    }
    lines.push(`${indent(3)}</StbParallelAxes>`);
  }

  lines.push(`${indent(2)}</StbAxes>`);
}

// =============================================================================
// Members
// =============================================================================

function generateMembers(lines, ctx) {
  lines.push(`${indent(2)}<StbMembers>`);

  generateColumns(lines, ctx);
  generateGirders(lines, ctx);
  generateBeams(lines, ctx);
  generateBraces(lines, ctx);
  generateWalls(lines, ctx);
  generateFoundationColumns(lines, ctx);
  generateParapets(lines, ctx);
  generateSlabs(lines, ctx);
  generatePiles(lines, ctx);
  generateFootings(lines, ctx);

  lines.push(`${indent(2)}</StbMembers>`);
}

function floorRank(floor) {
  const label = normalizeSectionFloorLabel(floor);
  const match = label.match(/^(\d+)(M)?$/);
  if (match) return Number(match[1]) * 10 + (match[2] ? 1 : 0);
  if (label === 'R') return 900;
  if (label === 'RM') return 901;
  return 0;
}

/**
 * 通し柱セットから、指定軸交点・フロアが通し柱指定かを検索する。
 * セットのキー形式は "正規化フロア_xAxis_yAxis" (例: "2M_X3_Y2")。
 */
function isContinuousColumn(continuousColumns, floor, xAxis, yAxis) {
  if (!continuousColumns || continuousColumns.size === 0) return false;
  const normalizedFloor = normalizeSectionFloorLabel(floor);
  return continuousColumns.has(`${normalizedFloor}_${xAxis}_${yAxis}`);
}

function generateColumns(lines, ctx) {
  const { columnPlacements, continuousColumns } = ctx.ss7Data;
  if (!columnPlacements || columnPlacements.length === 0) return;

  lines.push(`${indent(3)}<StbColumns>`);

  // 軸位置ごとにグループ化してフロア順ソート
  const groupsByAxis = new Map();
  for (const placement of columnPlacements) {
    const key = `${placement.xAxis}_${placement.yAxis}`;
    if (!groupsByAxis.has(key)) groupsByAxis.set(key, []);
    groupsByAxis.get(key).push(placement);
  }

  for (const placements of groupsByAxis.values()) {
    placements.sort((a, b) => floorRank(a.floor) - floorRank(b.floor));

    // 通し柱グループの境界を検出して連続区間に分割する。
    // 通し柱指定は「このフロアの柱を直下フロアの柱と一本化する」を意味するので、
    // フロアNが通し柱指定なら [N-1, N] を同一グループにまとめる。
    const groups = [];
    let currentGroup = [placements[0]];
    for (let i = 1; i < placements.length; i++) {
      const cur = placements[i];
      if (isContinuousColumn(continuousColumns, cur.floor, cur.xAxis, cur.yAxis)) {
        currentGroup.push(cur);
      } else {
        groups.push(currentGroup);
        currentGroup = [cur];
      }
    }
    groups.push(currentGroup);

    for (const group of groups) {
      const first = group[0];
      const last = group[group.length - 1];

      const firstRange = ctx.getColumnStoryRange(first.floor);
      const lastRange = ctx.getColumnStoryRange(last.floor);
      if (!firstRange || !lastRange) continue;

      const bottomNodeId = ctx.getNodeId(first.xAxis, first.yAxis, firstRange.bottomStory);
      const topNodeId = ctx.getNodeId(first.xAxis, first.yAxis, lastRange.topStory);
      if (!bottomNodeId || !topNodeId) continue;

      // 代表フロアは最下段（first）
      const sectionId =
        ctx.sectionIdMap.get(`col_${first.symbol}_${first.floor || ''}`) ||
        ctx.sectionSymbolFallbackMap.get(`col_${first.symbol}`) ||
        '';
      const kindStructure = determineMemberStructureKind(
        first.symbol,
        first.floor,
        ctx.ss7Data.sections?.columns,
      );

      const eccMap = ctx.ss7Data.memberEccentricities;
      // Xフレーム軸のecc → X方向偏心、Yフレーム軸のecc → Y方向偏心
      const xFrameEcc = eccMap?.get(first.xAxis.toUpperCase());
      const yFrameEcc = eccMap?.get(first.yAxis.toUpperCase());
      const colSection = findMatchingSection(
        first.symbol,
        first.floor,
        ctx.ss7Data.sections?.columns,
      );
      const colDx = colSection?.dims?.width ?? 0;
      const colDy = colSection?.dims?.height ?? 0;
      const xEcc =
        (xFrameEcc?.columnOffset ?? 0) + eccControlToSectionSign(xFrameEcc?.control) * (colDx / 2);
      const yEcc =
        (yFrameEcc?.columnOffset ?? 0) + eccControlToSectionSign(yFrameEcc?.control) * (colDy / 2);
      const floorPrefix = normalizeSectionFloorLabel(first.floor) || '';

      lines.push(
        `${indent(4)}<StbColumn ${buildAttrString({
          id: ctx.nextId(),
          guid: ctx.nextGuid(),
          name: `${floorPrefix}${first.symbol}`,
          id_node_bottom: bottomNodeId,
          id_node_top: topNodeId,
          rotate: '0',
          id_section: sectionId,
          kind_structure: kindStructure,
          offset_bottom_X: xEcc,
          offset_bottom_Y: yEcc,
          offset_top_X: xEcc,
          offset_top_Y: yEcc,
        })}>`,
      );

      // 通し柱の中間節点を StbColumnViaNode として出力（2本以上のグループの場合）
      if (group.length > 1) {
        for (let i = 0; i < group.length - 1; i++) {
          const placement = group[i];
          const range = ctx.getColumnStoryRange(placement.floor);
          if (!range) continue;
          const viaNodeId = ctx.getNodeId(placement.xAxis, placement.yAxis, range.topStory);
          if (viaNodeId) {
            lines.push(`${indent(5)}<StbColumnViaNode id_node="${viaNodeId}"/>`);
          }
        }
      }

      lines.push(`${indent(4)}</StbColumn>`);
    }
  }

  lines.push(`${indent(3)}</StbColumns>`);
}

function generateGirders(lines, ctx) {
  const { girderPlacements, cantileverGirderPlacements } = ctx.ss7Data;
  if (
    (!girderPlacements || girderPlacements.length === 0) &&
    (!cantileverGirderPlacements || cantileverGirderPlacements.length === 0)
  ) {
    return;
  }

  lines.push(`${indent(3)}<StbGirders>`);

  for (const girder of mergeLogicalLinePlacements(girderPlacements || [], ctx)) {
    // Determine start/end node coordinates
    // frameAxis tells us the constant axis, direction tells us the varying axis
    let startXAxis, startYAxis, endXAxis, endYAxis;

    if (girder.frameAxis === 'Y') {
      // Frame is along Y axis - girder spans in X direction
      startXAxis = girder.startAxis;
      endXAxis = girder.endAxis;
      startYAxis = girder.frame;
      endYAxis = girder.frame;
    } else {
      // Frame is along X axis - girder spans in Y direction
      startXAxis = girder.frame;
      endXAxis = girder.frame;
      startYAxis = girder.startAxis;
      endYAxis = girder.endAxis;
    }

    const storyName = girder.story;
    const startNodeId = ctx.getNodeId(startXAxis, startYAxis, storyName);
    const endNodeId = ctx.getNodeId(endXAxis, endYAxis, storyName);

    if (!startNodeId || !endNodeId) continue;

    const id = ctx.nextId();
    const kindStructure = determineMemberStructureKind(
      girder.symbol,
      girder.story,
      ctx.ss7Data.sections?.beams,
    );
    const girderTypeKey = resolveBeamTypeKey(
      girder.symbol,
      girder.story,
      ctx.ss7Data.sections?.beams,
    );
    const sectionId =
      ctx.sectionIdMap.get(`beam_${girderTypeKey}_${girder.symbol}_${girder.story || ''}`) ||
      ctx.sectionSymbolFallbackMap.get(`beam_${girderTypeKey}_${girder.symbol}`) ||
      '';

    const levelAdj = ctx.getGirderPlacementLevel(girder);
    const girderOffset = ctx.getGirderPlacementOffset(girder);
    const offsetStartX = girder.frameAxis === 'X' ? String(girderOffset) : '0';
    const offsetStartY = girder.frameAxis === 'Y' ? String(girderOffset) : '0';

    lines.push(
      `${indent(4)}<StbGirder ${buildAttrString({
        id,
        guid: ctx.nextGuid(),
        name: `${getStoryDisplayPrefix(girder.story)}${girder.symbol}`,
        id_node_start: startNodeId,
        id_node_end: endNodeId,
        id_section: sectionId,
        kind_structure: kindStructure,
        isFoundation: String(kindStructure === 'RC' && ctx.isFoundationStory(girder.story)),
        offset_start_X: offsetStartX,
        offset_start_Y: offsetStartY,
        offset_start_Z: String(levelAdj),
        offset_end_X: offsetStartX,
        offset_end_Y: offsetStartY,
        offset_end_Z: String(levelAdj),
      })}/>`,
    );
  }

  for (const girder of cantileverGirderPlacements || []) {
    const startNodeId = ctx.getNodeId(girder.xAxis, girder.yAxis, girder.story);
    const endNodeId = ctx.getCantileverNodeId(girder);
    if (!startNodeId || !endNodeId) continue;

    const typeKey = resolveBeamTypeKey(girder.symbol, girder.story, ctx.ss7Data.sections?.beams);
    const sectionId =
      ctx.sectionIdMap.get(`beam_${typeKey}_${girder.symbol}_${girder.story || ''}`) ||
      ctx.sectionSymbolFallbackMap.get(`beam_${typeKey}_${girder.symbol}`) ||
      '';

    lines.push(
      `${indent(4)}<StbGirder ${buildAttrString({
        id: ctx.nextId(),
        guid: ctx.nextGuid(),
        name: girder.symbol,
        id_node_start: startNodeId,
        id_node_end: endNodeId,
        id_section: sectionId,
        kind_structure: 'S',
        isFoundation: 'false',
        offset_start_X: '0',
        offset_start_Y: '0',
        offset_start_Z: '0',
        offset_end_X: '0',
        offset_end_Y: '0',
        offset_end_Z: '0',
      })}/>`,
    );
  }

  lines.push(`${indent(3)}</StbGirders>`);
}

function collectGirderRecords(ctx) {
  const records = [];
  for (const girder of mergeLogicalLinePlacements(ctx.ss7Data.girderPlacements || [], ctx)) {
    let startXAxis, startYAxis, endXAxis, endYAxis;
    if (girder.frameAxis === 'Y') {
      startXAxis = girder.startAxis;
      endXAxis = girder.endAxis;
      startYAxis = girder.frame;
      endYAxis = girder.frame;
    } else {
      startXAxis = girder.frame;
      endXAxis = girder.frame;
      startYAxis = girder.startAxis;
      endYAxis = girder.endAxis;
    }

    const startNode = ctx.getNode(startXAxis, startYAxis, girder.story);
    const endNode = ctx.getNode(endXAxis, endYAxis, girder.story);
    if (!startNode || !endNode) continue;

    records.push({
      name: `${getStoryDisplayPrefix(girder.story)}${girder.symbol}`,
      start: { x: startNode.x, y: startNode.y, z: startNode.z },
      end: { x: endNode.x, y: endNode.y, z: endNode.z },
    });
  }
  return records;
}

function collectBeamRecords(ctx) {
  const { subBeamPlacements } = ctx.ss7Data;
  const records = [];

  for (const beam of subBeamPlacements || []) {
    if (beam.format !== '3axis') continue;

    let startXAxis, startYAxis, endXAxis, endYAxis;
    if (beam.frameAxis === 'Y') {
      startXAxis = beam.startAxis;
      endXAxis = beam.endAxis;
      startYAxis = beam.frame;
      endYAxis = beam.frame;
    } else {
      startXAxis = beam.frame;
      endXAxis = beam.frame;
      startYAxis = beam.startAxis;
      endYAxis = beam.endAxis;
    }

    const startNode = ctx.getNode(startXAxis, startYAxis, beam.story);
    const endNode = ctx.getNode(endXAxis, endYAxis, beam.story);
    if (!startNode || !endNode) continue;

    const kindStructure = determineMemberStructureKind(
      beam.symbol,
      beam.story,
      ctx.ss7Data.sections?.beams,
    );
    const beamTypeKey = resolveBeamTypeKey(beam.symbol, beam.story, ctx.ss7Data.sections?.beams);
    const sectionId =
      ctx.sectionIdMap.get(`beam_${beamTypeKey}_${beam.symbol}_${beam.story || ''}`) ||
      ctx.sectionSymbolFallbackMap.get(`beam_${beamTypeKey}_${beam.symbol}`) ||
      '';

    records.push({
      storyName: beam.story,
      name: beam.symbol,
      id_section: sectionId,
      kind_structure: kindStructure,
      isFoundation: String(
        kindStructure === 'RC' &&
          (beam.symbol.startsWith('FB') || ctx.isFoundationStory(beam.story)),
      ),
      start: { x: startNode.x, y: startNode.y, z: startNode.z },
      end: { x: endNode.x, y: endNode.y, z: endNode.z },
      startNodeId: startNode.id,
      endNodeId: endNode.id,
    });
  }

  const getBaseBayFor4AxisBeam = (beam) => {
    const storyName = ctx.getStoryNameFromFloor(beam.story);
    const baseKey = `${storyName}_${beam.xStart}_${beam.xEnd}_${beam.yStart}_${beam.yEnd}`;
    const bay = ctx.floorGroupBayMap.get(baseKey);
    if (bay) return bay;

    const x1 = ctx.xAxisPositionMap.get(beam.xStart);
    const x2 = ctx.xAxisPositionMap.get(beam.xEnd);
    const y1 = ctx.yAxisPositionMap.get(beam.yStart);
    const y2 = ctx.yAxisPositionMap.get(beam.yEnd);
    if (x1 === undefined || x2 === undefined || y1 === undefined || y2 === undefined) return null;

    return {
      x1,
      x2,
      y1,
      y2,
      storyName,
      xStart: beam.xStart,
      xEnd: beam.xEnd,
      yStart: beam.yStart,
      yEnd: beam.yEnd,
    };
  };

  for (const beam of subBeamPlacements || []) {
    if (beam.format !== '4axis' || !beam.symbol) continue;

    const bay = getBaseBayFor4AxisBeam(beam);
    if (!bay) continue;

    const rootShapeId = ctx.simpleBayToShapeIdMap.get(
      `${bay.storyName}_${beam.xStart}_${beam.xEnd}_${beam.yStart}_${beam.yEnd}`,
    );
    const rootShape = rootShapeId ? ctx.floorGroupShapesMap.get(String(rootShapeId)) : null;
    if (!rootShape) continue;

    const indices = beam.indices || [0, 0, 0, 0, 0];
    const seg = calcSubBeamPosition(
      rootShape,
      ctx.floorGroupShapesMap,
      indices,
      bay.x1,
      bay.x2,
      bay.y1,
      bay.y2,
    );
    if (!seg) continue;

    const startNode = ctx.getOrCreateInterpolatedNodeForBay(bay, seg.sx, seg.sy);
    const endNode = ctx.getOrCreateInterpolatedNodeForBay(bay, seg.ex, seg.ey);
    const startPoint = ctx.getBayInterpolatedPoint(bay, seg.sx, seg.sy);
    const endPoint = ctx.getBayInterpolatedPoint(bay, seg.ex, seg.ey);
    if (!startNode || !endNode || !startPoint || !endPoint) continue;

    const kindStructure = determineMemberStructureKind(
      beam.symbol,
      bay.storyName,
      ctx.ss7Data.sections?.beams,
    );
    const beamTypeKey = resolveBeamTypeKey(beam.symbol, bay.storyName, ctx.ss7Data.sections?.beams);
    const sectionId =
      ctx.sectionIdMap.get(`beam_${beamTypeKey}_${beam.symbol}_${bay.storyName}`) ||
      ctx.sectionSymbolFallbackMap.get(`beam_${beamTypeKey}_${beam.symbol}`) ||
      '';

    records.push({
      storyName: bay.storyName,
      name: beam.symbol,
      id_section: sectionId,
      kind_structure: kindStructure,
      isFoundation: String(kindStructure === 'RC' && beam.symbol.startsWith('FB')),
      start: startPoint,
      end: endPoint,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
    });
  }

  const steelRecords = records.filter((record) => record.kind_structure === 'S');
  const otherRecords = records.filter((record) => record.kind_structure !== 'S');
  return [...otherRecords, ...mergeLineMemberRecords(steelRecords)];
}

function registerPolygonNodeIds(pointNodeIdMap, points, nodeIds) {
  for (let i = 0; i < points.length; i++) {
    pointNodeIdMap.set(pointKey(points[i]), nodeIds[i]);
  }
}

function resolvePolygonNodeIds(record, pointNodeIdMap) {
  const nodeIds = record.points.map((point) => pointNodeIdMap.get(pointKey(point)));
  return nodeIds.every((id) => !!id) ? nodeIds : null;
}

function generateBeams(lines, ctx) {
  const beamLines = [];
  const beamRecords = collectBeamRecords(ctx);

  for (const beam of beamRecords) {
    beamLines.push(
      `${indent(4)}<StbBeam ${buildAttrString({
        id: ctx.nextId(),
        guid: ctx.nextGuid(),
        name: beam.name,
        id_node_start: beam.startNodeId,
        id_node_end: beam.endNodeId,
        id_section: beam.id_section,
        kind_structure: beam.kind_structure,
        isFoundation: beam.isFoundation,
        offset_start_X: '0',
        offset_start_Y: '0',
        offset_start_Z: '0',
        offset_end_X: '0',
        offset_end_Y: '0',
        offset_end_Z: '0',
      })}/>`,
    );
  }

  if (beamLines.length === 0) return;

  lines.push(`${indent(3)}<StbBeams>`);
  lines.push(...beamLines);
  lines.push(`${indent(3)}</StbBeams>`);
}

function generateBraces(lines, ctx) {
  const { bracePlacements } = ctx.ss7Data;
  if (!bracePlacements || bracePlacements.length === 0) return;

  const braceLines = [];

  for (const brace of bracePlacements) {
    if (brace.isKUpper && brace.pair === '両方') {
      braceLines.push(...generateKUpperBracePair(brace, ctx));
    } else {
      const line = generateSingleBrace(brace, ctx);
      if (line) braceLines.push(line);
    }
  }

  if (braceLines.length === 0) return;

  lines.push(`${indent(3)}<StbBraces>`);
  lines.push(...braceLines);
  lines.push(`${indent(3)}</StbBraces>`);
}

/**
 * 通常ブレース（1本）を生成する
 */
function generateSingleBrace(brace, ctx) {
  let startXAxis, startYAxis, endXAxis, endYAxis;

  if (brace.frameAxis === 'Y') {
    startXAxis = brace.startAxis;
    endXAxis = brace.endAxis;
    startYAxis = brace.frame;
    endYAxis = brace.frame;
  } else {
    startXAxis = brace.frame;
    endXAxis = brace.frame;
    startYAxis = brace.startAxis;
    endYAxis = brace.endAxis;
  }

  const storyRange = ctx.getColumnStoryRange(brace.floor);
  if (!storyRange) return null;

  const startNodeId = ctx.getNodeId(startXAxis, startYAxis, storyRange.bottomStory);
  const endNodeId = ctx.getNodeId(endXAxis, endYAxis, storyRange.topStory);
  if (!startNodeId || !endNodeId) return null;

  const sectionId = ctx.sectionIdMap.get(`brace_${brace.symbol}`) || '';
  const id = ctx.nextId();

  let offsetStartZ = 0;
  const isAuto =
    brace.throughFloorDir === '自動' ||
    brace.throughSpanDir === '自動' ||
    (!brace.throughFloorDir && !brace.throughSpanDir);
  if (isAuto) {
    const bottomGirderDepth = ctx.getGirderDepth(brace.startGirderSymbol || brace.symbol);
    if (bottomGirderDepth > 0) offsetStartZ = -(bottomGirderDepth / 2);
  }

  // feature_brace: X形は引張＋圧縮、それ以外は引張のみ
  const featureBrace = brace.braceType === 'X形' ? 'TENSIONANDCOMPRESSION' : 'TENSION';

  return (
    `${indent(4)}<StbBrace id="${id}" name="${escXml(brace.symbol)}" ` +
    `id_node_start="${startNodeId}" id_node_end="${endNodeId}" ` +
    `rotate="0" ` +
    `id_section="${sectionId}" kind_structure="S" ` +
    `feature_brace="${featureBrace}" ` +
    `aim_offset_start_X="0" aim_offset_start_Y="0" aim_offset_start_Z="${offsetStartZ}" ` +
    `aim_offset_end_X="0" aim_offset_end_Y="0" aim_offset_end_Z="0"/>`
  );
}

/**
 * K上形 pair=両方 のブレースペア（2本）を生成する。
 * 左斜材: (startAxis, frame, bottomStory) → K頂点
 * 右斜材: (endAxis, frame, bottomStory) → K頂点
 * K頂点: スパン中点 × topStory高さ の中間節点
 */
function generateKUpperBracePair(brace, ctx) {
  const storyRange = ctx.getBraceStoryRange(brace);
  if (!ctx.shouldGenerateKUpperBrace(brace, storyRange)) return [];
  const point = ctx.interpolateFramePoint(
    brace.frameAxis,
    brace.frame,
    brace.startAxis,
    brace.endAxis,
    storyRange.topStory,
    0.5,
  );
  if (!point) return [];

  let leftXAxis, leftYAxis, rightXAxis, rightYAxis;
  if (brace.frameAxis === 'Y') {
    leftXAxis = brace.startAxis;
    leftYAxis = brace.frame;
    rightXAxis = brace.endAxis;
    rightYAxis = brace.frame;
  } else {
    leftXAxis = brace.frame;
    leftYAxis = brace.startAxis;
    rightXAxis = brace.frame;
    rightYAxis = brace.endAxis;
  }

  // K頂点ノードを中間節点として登録
  const apexNode = ctx._getOrCreateIntermediateNode(point.x, point.y, point.z);

  const leftStartNodeId = ctx.getNodeId(leftXAxis, leftYAxis, storyRange.bottomStory);
  const rightStartNodeId = ctx.getNodeId(rightXAxis, rightYAxis, storyRange.bottomStory);
  if (!leftStartNodeId || !rightStartNodeId || !apexNode) return [];

  const sectionId = ctx.sectionIdMap.get(`brace_${brace.symbol}`) || '';
  const result = [];

  // K上形ブレースは引張のみ
  // 左斜材
  result.push(
    `${indent(4)}<StbBrace id="${ctx.nextId()}" name="${escXml(brace.symbol)}" ` +
      `id_node_start="${leftStartNodeId}" id_node_end="${apexNode.id}" ` +
      `rotate="0" ` +
      `id_section="${sectionId}" kind_structure="S" ` +
      `feature_brace="TENSION" ` +
      `aim_offset_start_X="0" aim_offset_start_Y="0" aim_offset_start_Z="0" ` +
      `aim_offset_end_X="0" aim_offset_end_Y="0" aim_offset_end_Z="0"/>`,
  );
  // 右斜材
  result.push(
    `${indent(4)}<StbBrace id="${ctx.nextId()}" name="${escXml(brace.symbol)}" ` +
      `id_node_start="${rightStartNodeId}" id_node_end="${apexNode.id}" ` +
      `rotate="0" ` +
      `id_section="${sectionId}" kind_structure="S" ` +
      `feature_brace="TENSION" ` +
      `aim_offset_start_X="0" aim_offset_start_Y="0" aim_offset_start_Z="0" ` +
      `aim_offset_end_X="0" aim_offset_end_Y="0" aim_offset_end_Z="0"/>`,
  );
  return result;
}

function generateWalls(lines, ctx) {
  const { wallPlacements, outOfFrameWallPlacements } = ctx.ss7Data;
  const hasFrameWalls = wallPlacements && wallPlacements.length > 0;
  const hasOFW = outOfFrameWallPlacements && outOfFrameWallPlacements.length > 0;
  if (!hasFrameWalls && !hasOFW) return;

  const wallRecords = [];
  const pointNodeIdMap = new Map();

  for (const wall of wallPlacements || []) {
    let startXAxis, startYAxis, endXAxis, endYAxis;
    if (wall.frameAxis === 'Y') {
      startXAxis = wall.startAxis;
      endXAxis = wall.endAxis;
      startYAxis = wall.frame;
      endYAxis = wall.frame;
    } else {
      startXAxis = wall.frame;
      endXAxis = wall.frame;
      startYAxis = wall.startAxis;
      endYAxis = wall.endAxis;
    }

    const storyRange = ctx.getColumnStoryRange(wall.floor);
    if (!storyRange) continue;

    const blNode = ctx.getNode(startXAxis, startYAxis, storyRange.bottomStory);
    const brNode = ctx.getNode(endXAxis, endYAxis, storyRange.bottomStory);
    const trNode = ctx.getNode(endXAxis, endYAxis, storyRange.topStory);
    const tlNode = ctx.getNode(startXAxis, startYAxis, storyRange.topStory);
    if (!blNode || !brNode || !trNode || !tlNode) continue;

    const sectionId =
      ctx.sectionIdMap.get(`wall_${wall.symbol}_${wall.floor || ''}`) ||
      ctx.sectionIdMap.get(`wall_${wall.symbol}`) ||
      '';

    const points = [
      { x: blNode.x, y: blNode.y, z: blNode.z },
      { x: brNode.x, y: brNode.y, z: brNode.z },
      { x: trNode.x, y: trNode.y, z: trNode.z },
      { x: tlNode.x, y: tlNode.y, z: tlNode.z },
    ];
    registerPolygonNodeIds(pointNodeIdMap, points, [blNode.id, brNode.id, trNode.id, tlNode.id]);
    wallRecords.push({
      name: wall.symbol,
      id_section: sectionId,
      kind_structure: 'RC',
      kind_layout: 'ON_GIRDER',
      kind_wall: ctx.isShearWall(wall.symbol) ? 'WALL_SHEAR' : 'WALL_NORMAL',
      points,
      wallKey: `${wall.frame}_${wall.startAxis}_${wall.endAxis}_${wall.floor}`,
    });
  }

  // フレーム外雑壁の壁レコード生成
  generateOutOfFrameWallRecords(wallRecords, pointNodeIdMap, ctx);

  const hasSteelStory = (ctx.ss7Data.stories || []).some((story) => story.kind_structure === 'S');
  const mergedWalls = hasSteelStory
    ? mergePolygonRecords(wallRecords, {
        getMergeKey: (record) =>
          `${record.name}|${record.kind_structure}|${record.kind_layout}|${record.kind_wall}`,
        requireFlatSharedEdge: true,
        canMerge: (a, b) => {
          const uniqueZCount = (record) =>
            new Set(record.points.map((point) => point.z.toFixed(3))).size;
          return (
            a.points.length === 4 &&
            b.points.length === 4 &&
            uniqueZCount(a) <= 2 &&
            uniqueZCount(b) <= 2
          );
        },
      })
    : wallRecords;

  if (mergedWalls.length === 0) return;

  lines.push(`${indent(3)}<StbWalls>`);
  for (const wall of mergedWalls) {
    const nodeIds = resolvePolygonNodeIds(wall, pointNodeIdMap);
    if (!nodeIds) continue;

    const wallId = ctx.nextId();
    // 壁キーとIDを記録（StbOpenArrangements 生成時に使用）
    if (wall.wallKey) ctx.wallIdByKey.set(wall.wallKey, wallId);

    lines.push(
      `${indent(4)}<StbWall id="${wallId}" guid="${ctx.nextGuid()}" name="${escXml(wall.name)}" ` +
        `id_section="${wall.id_section}" kind_structure="${wall.kind_structure}" ` +
        `kind_layout="${wall.kind_layout}" kind_wall="${wall.kind_wall}">`,
    );
    lines.push(`${indent(5)}<StbNodeIdOrder>${nodeIds.join(' ')}</StbNodeIdOrder>`);
    lines.push(`${indent(5)}<StbWallOffsetList>`);
    for (const nodeId of nodeIds) {
      lines.push(
        `${indent(6)}<StbWallOffset id_node="${nodeId}" offset_X="0.0" offset_Y="0.0" offset_Z="0.0"/>`,
      );
    }
    lines.push(`${indent(5)}</StbWallOffsetList>`);
    lines.push(`${indent(4)}</StbWall>`);
  }
  lines.push(`${indent(3)}</StbWalls>`);
}

/**
 * フレーム外雑壁の壁レコードを wallRecords に追加
 * 各配置について階範囲を展開し、事前作成済みノードを使用する
 */
function generateOutOfFrameWallRecords(wallRecords, pointNodeIdMap, ctx) {
  const placements = ctx.ss7Data.outOfFrameWallPlacements || [];
  if (placements.length === 0 || !ctx.outOfFrameWallNodeMap) return;

  const { stories } = ctx.ss7Data;
  if (!stories || stories.length === 0) return;

  const storyOrder = new Map();
  for (let i = 0; i < stories.length; i++) {
    storyOrder.set(stories[i].name, i);
  }

  for (let idx = 0; idx < placements.length; idx++) {
    const p = placements[idx];
    if (!p.axisPair) continue;

    const floorFrom = p.floorFrom;
    const floorTo = p.floorTo || floorFrom;
    const fromStory = ctx._resolveFloorToStory(floorFrom);
    const toStory = ctx._resolveFloorToStory(floorTo);
    const fromIdx = storyOrder.get(fromStory);
    const toIdx = storyOrder.get(toStory);
    if (fromIdx == null || toIdx == null) continue;

    const minIdx = Math.min(fromIdx, toIdx);
    const maxIdx = Math.max(fromIdx, toIdx);

    // 各階について壁レコードを生成（上下ノードを使用）
    for (let si = minIdx; si <= maxIdx; si++) {
      const bottomStory = stories[si].name;
      const sectionId =
        ctx.sectionIdMap.get(`ofw_${p.symbol}_${bottomStory}`) ||
        ctx.sectionIdMap.get(`ofw_${p.symbol}`) ||
        '';
      // 上層は1つ上（index-1）、なければ同じ層
      const topStory = si > 0 ? stories[si - 1].name : bottomStory;

      const blNode = ctx.outOfFrameWallNodeMap.get(`${idx}_${bottomStory}_start`);
      const brNode = ctx.outOfFrameWallNodeMap.get(`${idx}_${bottomStory}_end`);
      const trNode = ctx.outOfFrameWallNodeMap.get(`${idx}_${topStory}_end`);
      const tlNode = ctx.outOfFrameWallNodeMap.get(`${idx}_${topStory}_start`);

      if (!blNode || !brNode) continue;
      // 上層ノードがない場合、同じ層のノードを使う（1層分の壁）
      const actualTr = trNode || brNode;
      const actualTl = tlNode || blNode;

      const points = [
        { x: blNode.x, y: blNode.y, z: blNode.z },
        { x: brNode.x, y: brNode.y, z: brNode.z },
        { x: actualTr.x, y: actualTr.y, z: actualTr.z },
        { x: actualTl.x, y: actualTl.y, z: actualTl.z },
      ];
      registerPolygonNodeIds(pointNodeIdMap, points, [
        blNode.id,
        brNode.id,
        actualTr.id,
        actualTl.id,
      ]);
      wallRecords.push({
        name: p.symbol,
        id_section: sectionId,
        kind_structure: 'RC',
        kind_layout: 'ON_SLAB',
        kind_wall: 'WALL_NORMAL',
        points,
        wallKey: null, // フレーム外雑壁は開口なし
      });
    }
  }
}

/**
 * 開口距離の基準変換: 負値（面から）→ |val| + halfSection、0以上（心から）→ そのまま
 * @param {number} val - SS7の距離値
 * @param {number} halfSection - 柱幅/2 または 梁せい/2 (mm)
 * @returns {number} STB基準（心からの距離）
 */
export function fromAxisPos(val, halfSection) {
  return val < 0 ? Math.abs(val) + halfSection : val;
}

/**
 * 「押さえ」文字列から断面サイズ補正の符号を返す
 * 「右上面」→ -1（正側の面が基準 → 中心へは -size/2）
 * 「左下面」→ +1（負側の面が基準 → 中心へは +size/2）
 * その他（中央等）→ 0
 * @param {string} control
 * @returns {number}
 */
export function eccControlToSectionSign(control) {
  if (!control) return 0;
  if (control.includes('右') || control.includes('上')) return -1;
  if (control.includes('左') || control.includes('下')) return +1;
  return 0;
}

/**
 * 押えタイプと壁・柱・梁寸法から開口の position_X/Y, length_X/Y を計算する
 * holdType: 2桁数値。十の位=左右方向タイプ、一の位=上下方向タイプ
 *   十の位: 10=左→左, 20=左→中, 30=左右, 40=壁長さ, 50=右→中, 60=右→右
 *   一の位:  1=下→下,  2=下→中,  3=上下,   4=壁高さ,  5=上→中,  6=上→上
 * L1/L2, H1/H2: 負値→柱面/梁面基準, 0以上→心基準
 * @param {Object} op - 開口配置データ
 * @param {number} wallWidth - 壁幅 (mm)
 * @param {number} wallHeight - 壁高さ (mm)
 * @param {number} leftColHalf - 左端柱幅/2 (mm)
 * @param {number} rightColHalf - 右端柱幅/2 (mm)
 * @param {number} bottomBeamHalf - 下端梁せい/2 (mm)
 * @param {number} topBeamHalf - 上端梁せい/2 (mm)
 * @returns {{ posX: number, posY: number, lengthX: number, lengthY: number }}
 */
export function computeOpeningPosition(
  op,
  wallWidth,
  wallHeight,
  leftColHalf,
  rightColHalf,
  bottomBeamHalf,
  topBeamHalf,
) {
  const horizType = Math.floor(op.holdType / 10);
  const vertType = op.holdType % 10;

  let posX, lengthX;
  switch (horizType) {
    case 2: // 左→中: L2=左端→開口中心, L1=開口幅
      posX = fromAxisPos(op.l2, leftColHalf) - op.l1 / 2;
      lengthX = op.l1;
      break;
    case 3: // 左右: L1=左端→開口左端, L2=右端→開口右端
      posX = fromAxisPos(op.l1, leftColHalf);
      lengthX = wallWidth - posX - fromAxisPos(op.l2, rightColHalf);
      break;
    case 4: // 壁長さ基準（面変換不要）
      posX = op.l1;
      lengthX = wallWidth - op.l1 - op.l2;
      break;
    case 5: // 右→中: L2=右端→開口中心, L1=開口幅
      posX = wallWidth - fromAxisPos(op.l2, rightColHalf) - op.l1 / 2;
      lengthX = op.l1;
      break;
    case 6: // 右→右: L2=右端→開口右端, L1=開口幅
      posX = wallWidth - fromAxisPos(op.l2, rightColHalf) - op.l1;
      lengthX = op.l1;
      break;
    default: // 10（左→左）: L2=左端→開口左端, L1=開口幅
      posX = fromAxisPos(op.l2, leftColHalf);
      lengthX = op.l1;
      break;
  }

  let posY, lengthY;
  switch (vertType) {
    case 2: // 下→中: H2=下端→開口中心, H1=開口高さ
      posY = fromAxisPos(op.h2, bottomBeamHalf) - op.h1 / 2;
      lengthY = op.h1;
      break;
    case 3: // 上下: H1=下端→開口下端, H2=上端→開口上端
      posY = fromAxisPos(op.h1, bottomBeamHalf);
      lengthY = wallHeight - posY - fromAxisPos(op.h2, topBeamHalf);
      break;
    case 4: // 壁高さ基準（面変換不要）
      posY = op.h1;
      lengthY = wallHeight - op.h1 - op.h2;
      break;
    case 5: // 上→中: H2=上端→開口中心, H1=開口高さ
      posY = wallHeight - fromAxisPos(op.h2, topBeamHalf) - op.h1 / 2;
      lengthY = op.h1;
      break;
    case 6: // 上→上: H2=上端→開口上端, H1=開口高さ
      posY = wallHeight - fromAxisPos(op.h2, topBeamHalf) - op.h1;
      lengthY = op.h1;
      break;
    default: // 1（下→下）: H2=下端→開口下端, H1=開口高さ
      posY = fromAxisPos(op.h2, bottomBeamHalf);
      lengthY = op.h1;
      break;
  }

  return {
    posX: Math.max(0, posX),
    posY: Math.max(0, posY),
    lengthX: Math.max(0, lengthX),
    lengthY: Math.max(0, lengthY),
  };
}

/**
 * 壁開口配置から StbOpenArrangements を生成する（StbModel 直下に配置）
 */
function generateOpenArrangements(lines, ctx) {
  const openings = ctx.ss7Data.wallOpeningPlacements || [];
  if (openings.length === 0) return;

  const arrangements = [];

  for (let idx = 0; idx < openings.length; idx++) {
    const op = openings[idx];
    const wallKey = `${op.frame}_${op.startAxis}_${op.endAxis}_${op.floor}`;
    const wallId = ctx.wallIdByKey.get(wallKey);
    if (wallId == null) continue;

    const wallSymbol = ctx.wallSymbolMap.get(wallKey) || 'W';
    const sectionId = ctx.sectionIdMap.get(`openSec_idx_${idx}`) || '';

    // 壁幅を軸位置から計算
    let wallWidth = 0;
    if (op.frameAxis === 'Y') {
      const startPos = ctx.xAxisPositionMap.get(op.startAxis) ?? 0;
      const endPos = ctx.xAxisPositionMap.get(op.endAxis) ?? 0;
      wallWidth = Math.abs(endPos - startPos);
    } else {
      const startPos = ctx.yAxisPositionMap.get(op.startAxis) ?? 0;
      const endPos = ctx.yAxisPositionMap.get(op.endAxis) ?? 0;
      wallWidth = Math.abs(endPos - startPos);
    }

    const perpDir = op.frameAxis === 'Y' ? 'x' : 'y';
    const leftColHalf = ctx.getColumnHalfSizeAtAxis(
      op.frameAxis,
      op.frame,
      op.startAxis,
      op.floor,
      perpDir,
    );
    const rightColHalf = ctx.getColumnHalfSizeAtAxis(
      op.frameAxis,
      op.frame,
      op.endAxis,
      op.floor,
      perpDir,
    );
    const wallHeight = ctx.getWallHeightAtFloor(op.floor);
    const bottomBeamHalf = ctx.getBeamHalfDepthAtFloor(
      op.floor,
      op.frameAxis,
      op.frame,
      op.startAxis,
      op.endAxis,
    );

    const { posX, posY } = computeOpeningPosition(
      op,
      wallWidth,
      wallHeight,
      leftColHalf,
      rightColHalf,
      bottomBeamHalf,
      bottomBeamHalf,
    );
    const name = `OP-${op.counter}-${wallSymbol}-${op.floor}`;

    arrangements.push({ wallId, sectionId, name, posX, posY });
  }

  if (arrangements.length === 0) return;

  lines.push(`${indent(2)}<StbOpenArrangements>`);
  for (const arr of arrangements) {
    lines.push(
      `${indent(3)}<StbOpenArrangement ${buildAttrString({
        id: ctx.nextId(),
        name: arr.name,
        id_section: arr.sectionId || undefined,
        kind_member: 'WALL',
        id_member: arr.wallId,
        position_X: arr.posX.toFixed(1),
        position_Y: arr.posY.toFixed(1),
        rotate: '0.0',
      })} />`,
    );
  }
  lines.push(`${indent(2)}</StbOpenArrangements>`);
}

function generateFoundationColumns(lines, ctx) {
  const placements = (ctx.ss7Data.columnPlacements || []).filter((column) => {
    if (!ctx.isFoundationStory(ctx.getStoryNameFromFloor(column.floor))) return false;
    const section = findMatchingSection(column.symbol, column.floor, ctx.ss7Data.sections?.columns);
    return !!(
      section?.exposedBase?.foundation?.widthX > 0 && section?.exposedBase?.foundation?.widthY > 0
    );
  });
  if (placements.length === 0) return;

  lines.push(`${indent(3)}<StbFoundationColumns>`);

  for (const column of placements) {
    const storyName = ctx.getStoryNameFromFloor(column.floor);
    const nodeId = ctx.getNodeId(column.xAxis, column.yAxis, storyName);
    if (!nodeId) continue;

    const sectionId =
      ctx.sectionIdMap.get(`foundation_${column.symbol}_${column.floor || ''}`) || '';
    if (!sectionId) continue;

    lines.push(
      `${indent(4)}<StbFoundationColumn ${buildAttrString({
        id: ctx.nextId(),
        guid: ctx.nextGuid(),
        name: `${normalizeSectionFloorLabel(column.floor)}${column.symbol}`,
        id_node: nodeId,
        rotate: '0.0',
        offset_Z: '0.0',
        kind_structure: 'RC',
        id_section_FD: sectionId,
        length_FD: ctx.getFoundationColumnLength(),
        offset_FD_X: '0.0',
        offset_FD_Y: '0.0',
        id_section_WR: '0',
      })} />`,
    );
  }

  lines.push(`${indent(3)}</StbFoundationColumns>`);
}

function generateParapets(lines, ctx) {
  const { parapetPlacements } = ctx.ss7Data;
  if (!parapetPlacements || parapetPlacements.length === 0) return;

  const parapetLines = [];

  for (let i = 0; i < parapetPlacements.length; i++) {
    const parapet = parapetPlacements[i];

    let startXAxis, startYAxis, endXAxis, endYAxis;
    if (parapet.frameAxis === 'Y') {
      startXAxis = parapet.startAxis;
      endXAxis = parapet.endAxis;
      startYAxis = parapet.frame;
      endYAxis = parapet.frame;
    } else {
      startXAxis = parapet.frame;
      endXAxis = parapet.frame;
      startYAxis = parapet.startAxis;
      endYAxis = parapet.endAxis;
    }

    // パラペットは同一層（層名）の始端・終端ノードを使う
    const storyName = parapet.story;
    const startNodeId = ctx.getNodeId(startXAxis, startYAxis, storyName);
    const endNodeId = ctx.getNodeId(endXAxis, endYAxis, storyName);
    if (!startNodeId || !endNodeId) continue;

    const sectionId = ctx.sectionIdMap.get(`parapet_${i}`);
    if (!sectionId) continue;
    const id = ctx.nextId();

    // kind_layout: SS7では配置先の部材種別が不明なため ON_GIRDER をデフォルトとする
    const parapetOffset = parapet.tipMovement || 0;
    const parapetLevel = parapet.height || 0;
    parapetLines.push(
      `${indent(4)}<StbParapet id="${id}" name="${escXml(parapet.symbol)}" ` +
        `id_node_start="${startNodeId}" id_node_end="${endNodeId}" ` +
        `id_section="${sectionId}" kind_structure="RC" kind_layout="ON_GIRDER" ` +
        `offset="${parapetOffset}" level="${parapetLevel}"/>`,
    );
  }

  if (parapetLines.length === 0) return;

  lines.push(`${indent(3)}<StbParapets>`);
  lines.push(...parapetLines);
  lines.push(`${indent(3)}</StbParapets>`);
}

function generateSlabs(lines, ctx) {
  const { floorPlacements } = ctx.ss7Data;
  const hasFloorGroups = ctx.floorGroupBayMap.size > 0;
  const hasCantileverSlabs = (ctx.ss7Data.cantileverSlabPlacements || []).length > 0;

  if ((!floorPlacements || floorPlacements.length === 0) && !hasFloorGroups && !hasCantileverSlabs)
    return;

  const slabRecords = [];
  const pointNodeIdMap = new Map();
  const slabBlockerSegments = [...collectBeamRecords(ctx), ...collectGirderRecords(ctx)];
  const slabBlockerEdgeKeys = new Set(
    slabBlockerSegments.map((record) => edgeKey(record.start, record.end)),
  );

  const floorGroupBayByBaseKey = new Map();
  for (const [, bay] of ctx.floorGroupBayMap) {
    const baseKey = `${bay.storyName}_${bay.xStart}_${bay.xEnd}_${bay.yStart}_${bay.yEnd}`;
    if (!floorGroupBayByBaseKey.has(baseKey)) {
      floorGroupBayByBaseKey.set(baseKey, bay);
    }
  }

  for (const slab of floorPlacements || []) {
    const storyName = ctx.getStoryNameFromFloor(slab.story);

    const bayKey = `${storyName}_${slab.xStart}_${slab.xEnd}_${slab.yStart}_${slab.yEnd}`;
    const n1 = ctx.getNode(slab.xStart, slab.yStart, storyName);
    const n2 = ctx.getNode(slab.xEnd, slab.yStart, storyName);
    const n3 = ctx.getNode(slab.xEnd, slab.yEnd, storyName);
    const n4 = ctx.getNode(slab.xStart, slab.yEnd, storyName);
    if (!n1 || !n2 || !n3 || !n4) continue;

    const section = findMatchingSection(slab.symbol, 'NORMAL', ctx.ss7Data.sections?.floors);
    const sectionId = ctx.getFloorSectionId(slab.symbol, 'NORMAL', storyName);
    const bay = floorGroupBayByBaseKey.get(bayKey);

    if (bay && Array.isArray(bay.slabRects) && bay.slabRects.length > 0) {
      // indices[0] is 1-based index of the sub-rect within the floor group shape
      const rectIndex = (slab.indices?.[0] ?? 1) - 1;
      const rect = bay.slabRects[rectIndex] ?? bay.slabRects[0];
      const p1 = ctx.getBayInterpolatedPoint(bay, rect.x1, rect.y1);
      const p2 = ctx.getBayInterpolatedPoint(bay, rect.x2, rect.y1);
      const p3 = ctx.getBayInterpolatedPoint(bay, rect.x2, rect.y2);
      const p4 = ctx.getBayInterpolatedPoint(bay, rect.x1, rect.y2);
      const r1 = resolveNodeId(ctx, bay, rect.x1, rect.y1);
      const r2 = resolveNodeId(ctx, bay, rect.x2, rect.y1);
      const r3 = resolveNodeId(ctx, bay, rect.x2, rect.y2);
      const r4 = resolveNodeId(ctx, bay, rect.x1, rect.y2);
      if (!p1 || !p2 || !p3 || !p4 || !r1 || !r2 || !r3 || !r4) continue;

      const points = [p1, p2, p3, p4];
      registerPolygonNodeIds(pointNodeIdMap, points, [r1, r2, r3, r4]);
      const { direction_load: dl1, angle_load: al1 } = getSlabDirectionLoad(section);
      slabRecords.push({
        name: slab.symbol,
        id_section: sectionId,
        kind_structure: getSlabKindStructure(section),
        kind_slab: 'NORMAL',
        direction_load: dl1,
        angle_load: al1,
        isFoundation: 'false',
        points,
      });
      continue;
    }

    const points = [
      { x: n1.x, y: n1.y, z: n1.z },
      { x: n2.x, y: n2.y, z: n2.z },
      { x: n3.x, y: n3.y, z: n3.z },
      { x: n4.x, y: n4.y, z: n4.z },
    ];
    registerPolygonNodeIds(pointNodeIdMap, points, [n1.id, n2.id, n3.id, n4.id]);
    const { direction_load: dl2, angle_load: al2 } = getSlabDirectionLoad(section);
    slabRecords.push({
      name: slab.symbol,
      id_section: sectionId,
      kind_structure: getSlabKindStructure(section),
      kind_slab: 'NORMAL',
      direction_load: dl2,
      angle_load: al2,
      isFoundation: 'false',
      points,
    });
  }

  for (const slab of ctx.ss7Data.cantileverSlabPlacements || []) {
    const storyName = ctx.getStoryNameFromFloor(slab.story);
    const startNodeA =
      slab.frameAxis === 'X'
        ? ctx.getNodeId(slab.frame, slab.startAxis, storyName)
        : ctx.getNodeId(slab.startAxis, slab.frame, storyName);
    const startNodeB =
      slab.frameAxis === 'X'
        ? ctx.getNodeId(slab.frame, slab.endAxis, storyName)
        : ctx.getNodeId(slab.endAxis, slab.frame, storyName);

    const tipNodeA = (ctx.ss7Data.cantileverGirderPlacements || []).find(
      (placement) =>
        ctx.getStoryNameFromFloor(placement.story) === storyName &&
        ((slab.frameAxis === 'X' &&
          placement.xAxis === slab.frame &&
          placement.yAxis === slab.startAxis) ||
          (slab.frameAxis === 'Y' &&
            placement.yAxis === slab.frame &&
            placement.xAxis === slab.startAxis)),
    );
    const tipNodeB = (ctx.ss7Data.cantileverGirderPlacements || []).find(
      (placement) =>
        ctx.getStoryNameFromFloor(placement.story) === storyName &&
        ((slab.frameAxis === 'X' &&
          placement.xAxis === slab.frame &&
          placement.yAxis === slab.endAxis) ||
          (slab.frameAxis === 'Y' &&
            placement.yAxis === slab.frame &&
            placement.xAxis === slab.endAxis)),
    );

    let endNodeA = tipNodeA ? ctx.getCantileverNodeId(tipNodeA) : null;
    let endNodeB = tipNodeB ? ctx.getCantileverNodeId(tipNodeB) : null;

    // 片持床形状配置ベースの先端ノードにフォールバック
    if (!endNodeA) {
      endNodeA =
        slab.frameAxis === 'X'
          ? ctx.getSlabCantileverNodeId(storyName, slab.frame, slab.startAxis)
          : ctx.getSlabCantileverNodeId(storyName, slab.startAxis, slab.frame);
    }
    if (!endNodeB) {
      endNodeB =
        slab.frameAxis === 'X'
          ? ctx.getSlabCantileverNodeId(storyName, slab.frame, slab.endAxis)
          : ctx.getSlabCantileverNodeId(storyName, slab.endAxis, slab.frame);
    }

    if (!startNodeA || !startNodeB || !endNodeA || !endNodeB) continue;

    const section = findMatchingSection(slab.symbol, 'CANTI', ctx.ss7Data.sections?.floors);
    const sectionId = ctx.getFloorSectionId(slab.symbol, 'CANTI', storyName);

    let nodeOrder;
    if (slab.frameAxis === 'X') {
      nodeOrder = [startNodeB, startNodeA, endNodeA, endNodeB];
    } else {
      nodeOrder = [startNodeA, startNodeB, endNodeB, endNodeA];
    }
    const nodes = nodeOrder.map((id) => [...ctx.nodeMap.values()].find((node) => node.id === id));
    if (nodes.some((node) => !node)) continue;
    const points = nodes.map((node) => ({ x: node.x, y: node.y, z: node.z }));
    registerPolygonNodeIds(pointNodeIdMap, points, nodeOrder);
    slabRecords.push({
      name: slab.symbol,
      id_section: sectionId,
      kind_structure: getSlabKindStructure(section),
      kind_slab: 'CANTI',
      direction_load: '2WAY',
      isFoundation: 'false',
      points,
    });
  }

  // コーナー充填スラブの生成
  // X方向とY方向の片持床が交差する入隅コーナーに充填スラブを生成する
  const cantiShapes = ctx.ss7Data.cantileverSlabShapes || [];
  const cantiPlacements = ctx.ss7Data.cantileverSlabPlacements || [];
  const placementMap = new Map();
  for (const p of cantiPlacements) {
    const storyName = ctx.getStoryNameFromFloor(p.story);
    const k = `${storyName}_${p.frame}_${p.frameAxis}_${p.startAxis}_${p.endAxis}_${p.level}_${p.counter}`;
    placementMap.set(k, p);
  }

  const xShapesByStory = new Map();
  const yShapesByStory = new Map();
  for (const shape of cantiShapes) {
    const storyName = ctx.getStoryNameFromFloor(shape.story);
    if (shape.frameAxis === 'X') {
      if (!xShapesByStory.has(storyName)) xShapesByStory.set(storyName, []);
      xShapesByStory.get(storyName).push({ ...shape, storyName });
    } else {
      if (!yShapesByStory.has(storyName)) yShapesByStory.set(storyName, []);
      yShapesByStory.get(storyName).push({ ...shape, storyName });
    }
  }

  const generatedCornerKeys = new Set();
  for (const [storyName, xShapes] of xShapesByStory) {
    const yShapes = yShapesByStory.get(storyName) || [];
    for (const xShape of xShapes) {
      for (const yShape of yShapes) {
        // X方向スラブ(frame=xAxis, span startAxis-endAxis in Y)と
        // Y方向スラブ(frame=yAxis, span startAxis-endAxis in X)の交点コーナーを確認
        const xAxis = xShape.frame;
        const yAxis = yShape.frame;

        // Y方向スラブのspanがxAxisを含むか確認
        const xInYSpan = xAxis === yShape.startAxis || xAxis === yShape.endAxis;
        // X方向スラブのspanがyAxisを含むか確認
        const yInXSpan = yAxis === xShape.startAxis || yAxis === xShape.endAxis;

        if (!xInYSpan || !yInXSpan) continue;

        // コーナーの活性チェック（rangeLeft/rangeRightによるクリッピング）
        const xAxisPos = ctx.xAxisPositionMap.get(xAxis);
        const yAxisPos = ctx.yAxisPositionMap.get(yAxis);
        const xShapeStartPos = ctx.yAxisPositionMap.get(xShape.startAxis);
        const xShapeEndPos = ctx.yAxisPositionMap.get(xShape.endAxis);
        const yShapeStartPos = ctx.xAxisPositionMap.get(yShape.startAxis);
        const yShapeEndPos = ctx.xAxisPositionMap.get(yShape.endAxis);

        if (
          xAxisPos === undefined ||
          yAxisPos === undefined ||
          xShapeStartPos === undefined ||
          xShapeEndPos === undefined ||
          yShapeStartPos === undefined ||
          yShapeEndPos === undefined
        )
          continue;

        // X方向スラブの範囲チェック: yAxisがactiveか
        const xActiveFrom = Math.min(xShapeStartPos, xShapeEndPos) + xShape.rangeLeft;
        const xActiveTo = Math.max(xShapeStartPos, xShapeEndPos) - xShape.rangeRight;
        if (yAxisPos < xActiveFrom - 1 || yAxisPos > xActiveTo + 1) continue;

        // Y方向スラブの範囲チェック: xAxisがactiveか
        const yActiveFrom = Math.min(yShapeStartPos, yShapeEndPos) + yShape.rangeLeft;
        const yActiveTo = Math.max(yShapeStartPos, yShapeEndPos) - yShape.rangeRight;
        if (xAxisPos < yActiveFrom - 1 || xAxisPos > yActiveTo + 1) continue;

        // X方向スラブの跳出し方向オフセット計算
        const xDx = xShape.direction === '右' ? xShape.length : -xShape.length;
        // Y方向スラブの跳出し方向オフセット計算
        const yDy = yShape.direction === '右' ? -yShape.length : yShape.length;

        if (xDx === 0 || yDy === 0) continue;

        const baseNodeId = ctx.getNodeId(xAxis, yAxis, storyName);
        if (!baseNodeId) continue;
        const baseNode = [...ctx.nodeMap.values()].find((n) => n.id === baseNodeId);
        if (!baseNode) continue;

        // X方向スラブの先端ノードを取得または作成
        const xTipKey = `_corner_xtip_${storyName}_${xAxis}_${yAxis}`;
        let xTipNode = ctx.nodeMap.get(xTipKey);
        if (!xTipNode) {
          xTipNode = {
            id: ctx.nextId(),
            guid: ctx.nextGuid(),
            x: baseNode.x + xDx,
            y: baseNode.y,
            z: baseNode.z,
            kind: 'ON_CANTI',
          };
          ctx.nodeMap.set(xTipKey, xTipNode);
          const storyNodes = ctx.storyNodeIds.get(storyName);
          if (storyNodes) storyNodes.add(String(xTipNode.id));
        }

        // Y方向スラブの先端ノードを取得または作成
        const yTipKey = `_corner_ytip_${storyName}_${xAxis}_${yAxis}`;
        let yTipNode = ctx.nodeMap.get(yTipKey);
        if (!yTipNode) {
          yTipNode = {
            id: ctx.nextId(),
            guid: ctx.nextGuid(),
            x: baseNode.x,
            y: baseNode.y + yDy,
            z: baseNode.z,
            kind: 'ON_CANTI',
          };
          ctx.nodeMap.set(yTipKey, yTipNode);
          const storyNodes = ctx.storyNodeIds.get(storyName);
          if (storyNodes) storyNodes.add(String(yTipNode.id));
        }

        // 対角コーナー位置が建物グリッド外にあるか確認（外部コーナーのみ有効）
        const diagX = baseNode.x + xDx;
        const diagY = baseNode.y + yDy;
        const minXPos = Math.min(...ctx.xAxisPositionMap.values());
        const maxXPos = Math.max(...ctx.xAxisPositionMap.values());
        const minYPos = Math.min(...ctx.yAxisPositionMap.values());
        const maxYPos = Math.max(...ctx.yAxisPositionMap.values());
        // 対角コーナーがX方向とY方向の両方でグリッド外にある場合のみ有効
        const xOutside = diagX < minXPos - 1 || diagX > maxXPos + 1;
        const yOutside = diagY < minYPos - 1 || diagY > maxYPos + 1;
        if (!xOutside || !yOutside) continue;

        // コーナーキー
        const cornerKey = `${storyName}_${xAxis}_${yAxis}`;
        if (generatedCornerKeys.has(cornerKey)) continue;
        generatedCornerKeys.add(cornerKey);

        // 対角コーナーノードを作成または取得
        const diagKey = `_corner_${cornerKey}`;
        let diagNode = ctx.nodeMap.get(diagKey);
        if (!diagNode) {
          diagNode = {
            id: ctx.nextId(),
            guid: ctx.nextGuid(),
            x: xTipNode.x,
            y: yTipNode.y,
            z: baseNode.z,
            kind: 'ON_CANTI',
          };
          ctx.nodeMap.set(diagKey, diagNode);
          const storyNodes = ctx.storyNodeIds.get(storyName);
          if (storyNodes) storyNodes.add(String(diagNode.id));
        }

        // シンボルの決定: rangeLeft/rangeRightが非ゼロの形状のplacementを優先
        const xPlacementKey = `${storyName}_${xShape.frame}_${xShape.frameAxis}_${xShape.startAxis}_${xShape.endAxis}_${xShape.level}_${xShape.counter}`;
        const yPlacementKey = `${storyName}_${yShape.frame}_${yShape.frameAxis}_${yShape.startAxis}_${yShape.endAxis}_${yShape.level}_${yShape.counter}`;
        const xPlacement = placementMap.get(xPlacementKey);
        const yPlacement = placementMap.get(yPlacementKey);

        let symbol;
        if (xShape.rangeLeft > 0 || xShape.rangeRight > 0) {
          symbol = xPlacement?.symbol;
        } else if (yShape.rangeLeft > 0 || yShape.rangeRight > 0) {
          symbol = yPlacement?.symbol;
        } else {
          symbol = xPlacement?.symbol || yPlacement?.symbol;
        }
        if (!symbol) continue;

        const section = findMatchingSection(symbol, 'CANTI', ctx.ss7Data.sections?.floors);
        const sectionId = ctx.getFloorSectionId(symbol, 'CANTI', storyName);

        // コーナーの4頂点を決定 (時計回り or 反時計回り)
        const points = [
          { x: baseNode.x, y: baseNode.y, z: baseNode.z },
          { x: xTipNode.x, y: xTipNode.y, z: xTipNode.z },
          { x: diagNode.x, y: diagNode.y, z: diagNode.z },
          { x: yTipNode.x, y: yTipNode.y, z: yTipNode.z },
        ];
        registerPolygonNodeIds(pointNodeIdMap, points, [
          baseNodeId,
          xTipNode.id,
          diagNode.id,
          yTipNode.id,
        ]);
        slabRecords.push({
          name: symbol,
          id_section: sectionId,
          kind_structure: getSlabKindStructure(section),
          kind_slab: 'CANTI',
          direction_load: '2WAY',
          isFoundation: 'false',
          points,
        });
      }
    }
  }

  const deckSlabRecords = slabRecords.filter((record) => record.kind_structure === 'DECK');
  const nonDeckSlabRecords = slabRecords.filter((record) => record.kind_structure !== 'DECK');
  const mergedSlabs = [
    ...nonDeckSlabRecords,
    ...mergePolygonRecords(deckSlabRecords, {
      getMergeKey: (record) =>
        [
          record.name,
          record.id_section,
          record.kind_structure,
          record.kind_slab,
          record.direction_load,
          record.isFoundation,
        ].join('|'),
      blockerEdgeKeys: slabBlockerEdgeKeys,
      blockerSegments: slabBlockerSegments,
    }),
  ];

  if (mergedSlabs.length === 0) return;

  lines.push(`${indent(3)}<StbSlabs>`);
  for (const slab of mergedSlabs) {
    const nodeIds = resolvePolygonNodeIds(slab, pointNodeIdMap);
    if (!nodeIds) continue;

    lines.push(
      `${indent(4)}<StbSlab ${buildAttrString({
        id: ctx.nextId(),
        guid: ctx.nextGuid(),
        name: slab.name,
        id_section: slab.id_section,
        kind_structure: slab.kind_structure,
        kind_slab: slab.kind_slab,
        direction_load: slab.direction_load,
        angle_load: slab.angle_load,
        isFoundation: slab.isFoundation,
      })}>`,
    );
    lines.push(`${indent(5)}<StbNodeIdOrder>${nodeIds.join(' ')}</StbNodeIdOrder>`);
    lines.push(`${indent(4)}</StbSlab>`);
  }
  lines.push(`${indent(3)}</StbSlabs>`);
}

/**
 * バン内の座標から節点IDを解決する。
 * バン境界ならグリッド節点、中間位置なら中間節点を返す。
 */
function resolveNodeId(ctx, bay, x, y) {
  // 中間節点を先に確認
  const intId = ctx.getInterpolatedNodeIdForBay(bay, x, y);
  if (intId) return intId;

  // バン角の判定（1mm以内ならバン境界とみなす）
  const xAxis = Math.abs(x - bay.x1) < 1 ? bay.xStart : Math.abs(x - bay.x2) < 1 ? bay.xEnd : null;
  const yAxis = Math.abs(y - bay.y1) < 1 ? bay.yStart : Math.abs(y - bay.y2) < 1 ? bay.yEnd : null;

  if (xAxis && yAxis) {
    return ctx.getNodeId(xAxis, yAxis, bay.storyName);
  }

  return null;
}

// =============================================================================
// Sections
// =============================================================================

function generateSections(lines, ctx) {
  const { sections } = ctx.ss7Data;
  if (!sections) return;

  // Column sections
  if (sections.columns && sections.columns.length > 0) {
    generateColumnSections(lines, ctx, sections.columns);
  }

  // Beam sections
  if (sections.beams && sections.beams.length > 0) {
    generateBeamSections(lines, ctx, sections.beams);
  }

  // Brace sections
  if (sections.braces && sections.braces.length > 0) {
    generateBraceSections(lines, ctx, sections.braces);
  }

  // Wall sections
  if (sections.walls && sections.walls.length > 0) {
    generateWallSections(lines, ctx, sections.walls);
  }

  // Out-of-frame wall sections
  if (sections.outOfFrameWalls && sections.outOfFrameWalls.length > 0) {
    generateOutOfFrameWallSections(lines, ctx, sections.outOfFrameWalls);
  }

  // Open sections
  generateOpenSections(lines, ctx);

  // Parapet sections
  const parapetPlacements = ctx.ss7Data.parapetPlacements || [];
  if (parapetPlacements.length > 0) {
    generateParapetSections(lines, ctx, parapetPlacements, sections.parapets || []);
  }

  // Floor sections
  if (sections.floors && sections.floors.length > 0) {
    generateSlabSections(lines, ctx, sections.floors);
  }

  // 杭断面
  generatePileSections(lines, ctx);

  // フーチング断面
  generateFootingSections(lines, ctx);

  // SS7 CSV では鋼材カタログを完全再構成できないため、
  // 参照STBとの互換性確保として空のStbSecSteelを常に出力する。
  lines.push(`${indent(2)}<StbSecSteel />`);
}

function generateColumnSections(lines, ctx, columnSections) {
  // Group by type: RC, S
  const rcSections = columnSections.filter((s) => s.type === 'rc');
  const sSections = columnSections.filter((s) => s.type === 's');

  // RC Column Sections
  if (rcSections.length > 0) {
    // Group by symbol (unique sections)
    const uniqueSections = deduplicateSections(rcSections);

    for (const sec of uniqueSections) {
      const secId = ctx.sectionIdMap.get(`col_${sec.symbol}_${sec.floor || ''}`);
      if (!secId) continue;

      const widthX = sec.dims?.width || 0;
      const widthY = sec.dims?.height || 0;

      lines.push(
        `${indent(2)}<StbSecColumn_RC ${buildAttrString({
          id: secId,
          guid: ctx.nextGuid(),
          name: sec.symbol || sec.name,
          floor: normalizeSectionFloorLabel(sec.floor),
          kind_column: 'COLUMN',
          strength_concrete: sec.material || ctx.defaultConcreteStrength,
        })}>`,
      );
      lines.push(`${indent(3)}<StbSecFigureColumn_RC>`);

      if (sec.shape === 'circle' || sec.shape === '○') {
        lines.push(`${indent(4)}<StbSecColumnCircle D="${widthX}"/>`);
      } else {
        lines.push(`${indent(4)}<StbSecColumnRect width_X="${widthX}" width_Y="${widthY}"/>`);
      }

      lines.push(`${indent(3)}</StbSecFigureColumn_RC>`);

      // 鉄筋情報
      if (sec.rebar) {
        const rebar = sec.rebar;
        const cover = rebar.cover ?? 40;
        const mainDia = rebar.main?.diameter?.topX || 'D25';
        const hoopDia = rebar.shear?.diameter || 'D13';
        const mainMat = rebar.main?.material?.topX || 'SD345';
        const hoopMat = rebar.shear?.material || 'SD295';
        const countX = Math.max(rebar.main?.topX || 0, rebar.main?.bottomX || 0);
        const countY = Math.max(rebar.main?.topY || 0, rebar.main?.bottomY || 0);
        const hoopX = rebar.shear?.countX || 0;
        const hoopY = rebar.shear?.countY || 0;
        const pitch = rebar.shear?.pitch || 0;
        const center = (
          cover +
          (parseInt(String(hoopDia).replace(/\D/g, ''), 10) || 0) +
          (parseInt(String(mainDia).replace(/\D/g, ''), 10) || 0) / 2
        ).toFixed(1);
        lines.push(`${indent(3)}<StbSecBarArrangementColumn_RC>`);
        if (sec.shape === 'circle' || sec.shape === '○') {
          lines.push(`${indent(4)}<StbSecBarColumnCircleSame>`);
          lines.push(
            `${indent(5)}<StbSecBarColumnCircleSameSimple D_main="${mainDia}" D_hoop="${hoopDia}" strength_main="${mainMat}" strength_hoop="${hoopMat}" N_main="${countX}" N_hoop_X="${hoopX}" N_hoop_Y="${hoopY}" pitch_hoop="${pitch.toFixed(1)}" center="${center}" />`,
          );
          lines.push(`${indent(4)}</StbSecBarColumnCircleSame>`);
        } else {
          lines.push(`${indent(4)}<StbSecBarColumnRectSame>`);
          lines.push(
            `${indent(5)}<StbSecBarColumnRectSameSimple D_main="${mainDia}" D_hoop="${hoopDia}" strength_main="${mainMat}" strength_hoop="${hoopMat}" N_X="${countX}" N_Y="${countY}" N_hoop_X="${hoopX}" N_hoop_Y="${hoopY}" pitch_hoop="${pitch.toFixed(1)}" center_start_X="${center}" center_end_X="${center}" center_start_Y="${center}" center_end_Y="${center}" />`,
          );
          lines.push(`${indent(4)}</StbSecBarColumnRectSame>`);
        }
        lines.push(`${indent(3)}</StbSecBarArrangementColumn_RC>`);
      }

      lines.push(`${indent(2)}</StbSecColumn_RC>`);
    }
  }

  for (const sec of sSections) {
    const fd = sec.exposedBase?.foundation;
    const secId = ctx.sectionIdMap.get(`foundation_${sec.symbol}_${sec.floor || ''}`);
    if (!secId || !fd?.widthX || !fd?.widthY) continue;

    lines.push(
      `${indent(2)}<StbSecColumn_RC ${buildAttrString({
        id: secId,
        guid: ctx.nextGuid(),
        name: `${normalizeSectionFloorLabel(sec.floor)}${sec.symbol}_FD`,
        floor: normalizeSectionFloorLabel(sec.floor),
        kind_column: 'COLUMN',
        strength_concrete: ctx.defaultConcreteStrength,
      })}>`,
    );
    lines.push(`${indent(3)}<StbSecFigureColumn_RC>`);
    lines.push(`${indent(4)}<StbSecColumnRect width_X="${fd.widthX}" width_Y="${fd.widthY}" />`);
    lines.push(`${indent(3)}</StbSecFigureColumn_RC>`);
    lines.push(`${indent(2)}</StbSecColumn_RC>`);
  }

  // S Column Sections
  if (sSections.length > 0) {
    const uniqueSections = deduplicateSections(sSections);

    for (const sec of uniqueSections) {
      const secId = ctx.sectionIdMap.get(`col_${sec.symbol}_${sec.floor || ''}`);
      if (!secId) continue;

      lines.push(
        `${indent(2)}<StbSecColumn_S ${buildAttrString({
          id: secId,
          guid: ctx.nextGuid(),
          name: sec.name || sec.symbol,
          floor: normalizeSectionFloorLabel(sec.floor),
          kind_column: 'COLUMN',
          isReferenceDirection: 'false',
        })}>`,
      );
      const baseType = sec.exposedBase ? 'EXPOSE' : 'NONE';
      lines.push(`${indent(3)}<StbSecSteelFigureColumn_S base_type="${baseType}">`);
      lines.push(
        `${indent(4)}<StbSecSteelColumn_S_Same shape="${escXml(sec.sectionName || '')}" strength_main="${escXml(sec.material || 'SN400B')}" />`,
      );
      lines.push(`${indent(3)}</StbSecSteelFigureColumn_S>`);
      if (sec.exposedBase) {
        const { plate, anchorBolt } = sec.exposedBase;
        const boltDiameter = parseInt(String(anchorBolt.name || '').replace(/\D/g, ''), 10) || 0;
        const holeDiameter = plate.holeDiameter || (boltDiameter > 0 ? boltDiameter + 5 : 0);
        lines.push(`${indent(3)}<StbSecBaseConventional_S height_mortar="0.0">`);
        lines.push(
          `${indent(4)}<StbSecBaseConventional_S_Plate ${buildAttrString({
            B_X: plate.widthX,
            B_Y: plate.widthY,
            C1_X: plate.dtX,
            C1_Y: plate.dtY,
            C2_X: plate.dtX,
            C2_Y: plate.dtY,
            C3_X: plate.dtX,
            C3_Y: plate.dtY,
            C4_X: plate.dtX,
            C4_Y: plate.dtY,
            t: plate.thickness,
            strength: plate.material || 'SN400B',
            D_bolthole: holeDiameter,
          })} />`,
        );
        lines.push(
          `${indent(4)}<StbSecBaseConventional_S_AnchorBolt ${buildAttrString({
            kind_bolt: anchorBolt.kind || 'ABR',
            name_bolt: anchorBolt.name || '',
            length_bolt: anchorBolt.length || 0,
            strength_bolt: anchorBolt.material || 'SNR400',
            arrangement_bolt: 'CUT',
            D1_X: plate.dtX,
            D2_X: plate.dtX,
            D1_Y: plate.dtY,
            D2_Y: plate.dtY,
            N_X: anchorBolt.countX || 0,
            N_Y: anchorBolt.countY || 0,
          })} />`,
        );
        lines.push(`${indent(3)}</StbSecBaseConventional_S>`);
      }
      lines.push(`${indent(2)}</StbSecColumn_S>`);
    }
  }
}

/**
 * 梁断面のかぶり厚を返す（最下層は基礎梁扱い）
 * かぶり値は標準使用材料セクションの解析結果を使用
 * @param {string} story - 梁の層名
 * @param {Object} ctx - GenerationContext
 * @returns {{top: number, bottom: number}}
 */
function getBeamCover(story, ctx) {
  const matDef = ctx.ss7Data?.sections?.materialDefaults;
  const beamDef = matDef?.beam ?? { topCover: 40, bottomCover: 40 };
  const foundationDef = matDef?.foundationBeam ?? { topCover: 50, bottomCover: 50 };

  const stories = ctx.ss7Data?.stories || [];
  if (stories.length > 0) {
    const minHeight = Math.min(...stories.map((s) => s.height ?? 0));
    const bottomStory = stories.find((s) => (s.height ?? 0) === minHeight);
    if (story === bottomStory?.name) {
      return { top: foundationDef.topCover, bottom: foundationDef.bottomCover };
    }
  }
  return { top: beamDef.topCover, bottom: beamDef.bottomCover };
}

/**
 * StbSecBarBeamSimple + StbSecBarBeamSimpleMain のXML行を生成
 * @param {string[]} lines - 出力行配列
 * @param {string} indentStr - インデント文字列
 * @param {Object} r - 鉄筋データ
 * @param {{top:number, bottom:number}|null} cover - かぶり厚（depth_cover_top/bottom に使用）
 */
function buildBeamSimpleRebar(lines, indentStr, r, cover) {
  const stirrupDia = r.stirrupDiameter || (r.D_stirrup > 0 ? `D${r.D_stirrup}` : 'D13');
  const stirrupMat = r.strength_stirrup || 'SD295';
  const nStirup = r.N_stirrup || 2;
  const pitch = (r.pitch_stirrup || 0).toFixed(1);

  const mainDia = r.mainDiameter || (r.D_main > 0 ? `D${r.D_main}` : 'D25');
  const mainMat = r.strength_main || r.mainBarMaterialId || 'SD345';
  const nTop = r.N_main_top_1st || 0;
  const nBottom = r.N_main_bottom_1st || 0;

  // center_top/center_bottom (dt値) が優先、なければ depth_cover を使用
  const centerTop = r.dt_top || 0;
  const centerBottom = r.dt_bottom || 0;
  let coverAttrs = '';
  if (centerTop > 0) {
    coverAttrs += ` center_top="${centerTop.toFixed(1)}"`;
  } else if (cover?.top > 0) {
    coverAttrs += ` depth_cover_top="${cover.top.toFixed(1)}"`;
  }
  if (centerBottom > 0) {
    coverAttrs += ` center_bottom="${centerBottom.toFixed(1)}"`;
  } else if (cover?.bottom > 0) {
    coverAttrs += ` depth_cover_bottom="${cover.bottom.toFixed(1)}"`;
  }

  lines.push(
    `${indentStr}<StbSecBarBeamSimple D_stirrup="${stirrupDia}" strength_stirrup="${stirrupMat}" N_stirrup="${nStirup}" pitch_stirrup="${pitch}"${coverAttrs}>`,
  );
  if (nTop > 0) {
    lines.push(
      `${indentStr}  <StbSecBarBeamSimpleMain pos="TOP" step="1" D="${mainDia}" N="${nTop}" strength="${mainMat}"/>`,
    );
    if ((r.N_main_top_2nd || 0) > 0) {
      lines.push(
        `${indentStr}  <StbSecBarBeamSimpleMain pos="TOP" step="2" D="${mainDia}" N="${r.N_main_top_2nd}" strength="${mainMat}"/>`,
      );
    }
  }
  if (nBottom > 0) {
    lines.push(
      `${indentStr}  <StbSecBarBeamSimpleMain pos="BOTTOM" step="1" D="${mainDia}" N="${nBottom}" strength="${mainMat}"/>`,
    );
    if ((r.N_main_bottom_2nd || 0) > 0) {
      lines.push(
        `${indentStr}  <StbSecBarBeamSimpleMain pos="BOTTOM" step="2" D="${mainDia}" N="${r.N_main_bottom_2nd}" strength="${mainMat}"/>`,
      );
    }
  }
  // TOP/BOTTOM どちらも0の場合、スキーマ要件(minOccurs=2)を満たすためプレースホルダーを追加
  if (nTop === 0 && nBottom === 0) {
    lines.push(
      `${indentStr}  <StbSecBarBeamSimpleMain pos="TOP" step="1" D="${mainDia}" N="1" strength="${mainMat}"/>`,
    );
    lines.push(
      `${indentStr}  <StbSecBarBeamSimpleMain pos="BOTTOM" step="1" D="${mainDia}" N="1" strength="${mainMat}"/>`,
    );
  }
  lines.push(`${indentStr}</StbSecBarBeamSimple>`);
}

function generateBeamSections(lines, ctx, beamSections) {
  const rcSections = beamSections.filter((s) => s.type === 'rc');
  const sSections = beamSections.filter((s) => s.type === 's');

  // RC Beam Sections
  if (rcSections.length > 0) {
    const uniqueSections = deduplicateSections(rcSections);

    for (const sec of uniqueSections) {
      // story情報がない断面（RC小梁断面等）は concreteグループIDを全て出力
      const storyEntries = [];
      if (!sec.story) {
        const prefix = `beam_rc_${sec.symbol}_conc_`;
        for (const [key, id] of ctx.sectionIdMap) {
          if (key.startsWith(prefix)) {
            const conc = key.slice(prefix.length);
            storyEntries.push({ concreteStrength: conc, id, storyName: null });
          }
        }
        // 配置なし → スキップ
      } else {
        const secId = ctx.sectionIdMap.get(`beam_rc_${sec.symbol}_${sec.story}`);
        if (secId)
          storyEntries.push({
            storyName: sec.story,
            concreteStrength: sec.material || ctx.defaultConcreteStrength,
            id: secId,
          });
      }
      if (storyEntries.length === 0) continue;

      for (const { storyName, concreteStrength: entryConc, id: secId } of storyEntries) {
        const width = sec.dims?.width || 0;
        const depth = sec.dims?.height || 0;

        const isBeamSection = ctx.beamSymbols.has(sec.symbol);
        const concreteStrength =
          !sec.story && entryConc ? entryConc : sec.material || ctx.defaultConcreteStrength;
        const effectiveStory = sec.story || storyName || '';
        lines.push(
          `${indent(2)}<StbSecBeam_RC ${buildAttrString({
            id: secId,
            guid: ctx.nextGuid(),
            name: sec.symbol || sec.name,
            floor: normalizeSectionFloorLabel(effectiveStory) || undefined,
            kind_beam: isBeamSection ? 'BEAM' : 'GIRDER',
            isCanti: 'false',
            isFoundation: isBeamSection
              ? undefined
              : String(sec.symbol?.startsWith('FB') || ctx.isFoundationStory(effectiveStory)),
            strength_concrete: concreteStrength,
          })}>`,
        );
        lines.push(`${indent(3)}<StbSecFigureBeam_RC order="1">`);

        // Use center dimensions for straight beam
        if (sec.haunch) {
          // Haunch beam: left/center/right may differ
          const wL = sec.dimsLeft?.width || width;
          const dL = sec.dimsLeft?.height || depth;
          const wR = sec.dimsRight?.width || width;
          const dR = sec.dimsRight?.height || depth;
          lines.push(
            `${indent(4)}<StbSecBeamTaper start_width="${wL}" start_depth="${dL}" end_width="${wR}" end_depth="${dR}"/>`,
          );
        } else {
          lines.push(`${indent(4)}<StbSecBeamStraight width="${width}" depth="${depth}"/>`);
        }

        lines.push(`${indent(3)}</StbSecFigureBeam_RC>`);

        // 鉄筋情報
        if (sec.reinforcement?.beam) {
          const rf = sec.reinforcement;
          const r = rf.beam; // 中央部（後方互換）
          const cover = getBeamCover(effectiveStory, ctx);

          if (rf.isThreeTypes && rf.start && rf.end) {
            // 3区分出力: START / CENTER / END それぞれ StbSecBarArrangementBeam_RC(order=1/2/3)
            for (const [orderNum, posData] of [
              [1, rf.start],
              [2, rf.center || r],
              [3, rf.end],
            ]) {
              lines.push(`${indent(3)}<StbSecBarArrangementBeam_RC order="${orderNum}">`);
              buildBeamSimpleRebar(lines, indent(4), posData, cover);
              lines.push(`${indent(3)}</StbSecBarArrangementBeam_RC>`);
            }
          } else {
            // 統一配筋出力
            lines.push(`${indent(3)}<StbSecBarArrangementBeam_RC order="1">`);
            buildBeamSimpleRebar(lines, indent(4), r, cover);
            lines.push(`${indent(3)}</StbSecBarArrangementBeam_RC>`);
          }
        }

        lines.push(`${indent(2)}</StbSecBeam_RC>`);
      } // end for storyEntries
    }
  }

  // S Beam Sections
  if (sSections.length > 0) {
    const uniqueSections = deduplicateSections(sSections);

    for (const sec of uniqueSections) {
      const secId = ctx.sectionIdMap.get(`beam_s_${sec.symbol}_${sec.story || ''}`);
      if (!secId) continue;

      lines.push(
        `${indent(2)}<StbSecBeam_S ${buildAttrString({
          id: secId,
          guid: ctx.nextGuid(),
          name: sec.name || sec.symbol,
          floor: normalizeSectionFloorLabel(sec.story) || undefined,
          kind_beam:
            sec.memberClass === 'subBeam' || ctx.beamSymbols.has(sec.symbol) ? 'BEAM' : 'GIRDER',
          isCanti: String(!!sec.isCanti),
          isOutin: sec.isOutin ? 'true' : undefined,
        })}>`,
      );
      lines.push(`${indent(3)}<StbSecSteelFigureBeam_S>`);
      lines.push(
        `${indent(4)}<StbSecSteelBeam_S_Straight shape="${escXml(sec.sectionName || '')}" strength_main="${escXml(sec.material || 'SN400B')}" />`,
      );
      lines.push(`${indent(3)}</StbSecSteelFigureBeam_S>`);
      lines.push(`${indent(2)}</StbSecBeam_S>`);
    }
  }
}

function generateBraceSections(lines, ctx, braceSections) {
  const uniqueSections = deduplicateSections(braceSections);

  for (const sec of uniqueSections) {
    const secId = ctx.sectionIdMap.get(`brace_${sec.symbol}`);
    if (!secId) continue;

    lines.push(
      `${indent(2)}<StbSecBrace_S ${buildAttrString({
        id: secId,
        guid: ctx.nextGuid(),
        name: sec.name || sec.symbol,
        floor: normalizeSectionFloorLabel(sec.story) || undefined,
        kind_brace: 'VERTICAL',
      })}>`,
    );
    lines.push(`${indent(3)}<StbSecSteelFigureBrace_S>`);
    lines.push(
      `${indent(4)}<StbSecSteelBrace_S_Same shape="${escXml(sec.sectionName || '')}" strength_main="${escXml(sec.material || 'SN400B')}" />`,
    );
    lines.push(`${indent(3)}</StbSecSteelFigureBrace_S>`);
    lines.push(`${indent(2)}</StbSecBrace_S>`);
  }
}

function generateWallSections(lines, ctx, wallSections) {
  const floors = [...new Set((ctx.ss7Data.wallPlacements || []).map((wall) => wall.floor))];
  for (const sec of wallSections) {
    const targets = floors.length > 0 ? floors : [''];
    for (const floor of targets) {
      const secId =
        ctx.sectionIdMap.get(`wall_${sec.symbol}_${floor}`) ||
        ctx.sectionIdMap.get(`wall_${sec.symbol}`);
      if (!secId) continue;

      const thickness = Math.max(sec.dims?.thickness || 0, 1);
      const storyName = ctx.floorToStoryMap.get(floor) || floor;
      const concreteInfo = (ctx.ss7Data.storyConcretes || new Map()).get(storyName);
      const concreteStrength =
        !sec.materialSpecified && concreteInfo?.floor
          ? concreteInfo.floor
          : sec.materialSpecified && sec.material
            ? sec.material
            : ctx.defaultConcreteStrength;

      lines.push(
        `${indent(2)}<StbSecWall_RC ${buildAttrString({
          id: secId,
          guid: ctx.nextGuid(),
          name: sec.name || sec.symbol,
          strength_concrete: concreteStrength,
        })}>`,
      );
      lines.push(`${indent(3)}<StbSecFigureWall_RC>`);
      lines.push(`${indent(4)}<StbSecWall_RC_Straight t="${thickness}" />`);
      lines.push(`${indent(3)}</StbSecFigureWall_RC>`);

      // 配筋情報
      generateWallReinforcement(lines, sec.reinforcement);

      lines.push(`${indent(2)}</StbSecWall_RC>`);
    }
  }
}

/**
 * 壁断面の配筋XML (StbSecBarArrangementWall_RC) を生成
 * @param {string[]} lines
 * @param {Object|null} reinforcement
 */
function generateWallReinforcement(lines, reinforcement) {
  if (!reinforcement) return;

  const { cover, vertical, horizontal } = reinforcement;
  const hasVertical =
    vertical &&
    vertical.arrangement > 0 &&
    vertical.dia &&
    vertical.dia !== '---' &&
    vertical.pitch > 0;
  const hasHorizontal =
    horizontal &&
    horizontal.arrangement > 0 &&
    horizontal.dia &&
    horizontal.dia !== '---' &&
    horizontal.pitch > 0;

  if (!hasVertical && !hasHorizontal) return;

  const cv = (cover || 40).toFixed(1);
  lines.push(
    `${indent(3)}<StbSecBarArrangementWall_RC depth_cover_outside="${cv}" depth_cover_inside="${cv}">`,
  );

  if (hasVertical) {
    const tag =
      vertical.arrangement === 2 ? 'StbSecBarWall_RC_DoubleNet' : 'StbSecBarWall_RC_SingleNet';
    lines.push(
      `${indent(4)}<${tag} ${buildAttrString({
        pos: 'VERTICAL',
        strength: vertical.material,
        D: vertical.dia,
        pitch: vertical.pitch.toFixed(1),
      })} />`,
    );
  }

  if (hasHorizontal) {
    const tag =
      horizontal.arrangement === 2 ? 'StbSecBarWall_RC_DoubleNet' : 'StbSecBarWall_RC_SingleNet';
    lines.push(
      `${indent(4)}<${tag} ${buildAttrString({
        pos: 'HORIZONTAL',
        strength: horizontal.material,
        D: horizontal.dia,
        pitch: horizontal.pitch.toFixed(1),
      })} />`,
    );
  }

  lines.push(`${indent(3)}</StbSecBarArrangementWall_RC>`);
}

/**
 * フレーム外雑壁の断面 StbSecWall_RC を生成
 */
function generateOutOfFrameWallSections(lines, ctx, ofwSections) {
  const uniqueSections = deduplicateSections(ofwSections);
  const storyConcretes = ctx.ss7Data.storyConcretes || new Map();
  for (const sec of uniqueSections) {
    const thickness = Math.max(sec.dims?.thickness || 0, 1);
    const name = sec.name || sec.symbol;

    // 階ごとのIDが存在する場合はそれぞれ出力、なければシンボルのみキーで1つ出力
    // sectionIdMapからofw_${symbol}_で始まるエントリを検索
    const storyEntries = [];
    for (const [key, id] of ctx.sectionIdMap) {
      if (key.startsWith(`ofw_${sec.symbol}_`)) {
        const storyName = key.slice(`ofw_${sec.symbol}_`.length);
        storyEntries.push({ storyName, id });
      }
    }
    const fallbackId = ctx.sectionIdMap.get(`ofw_${sec.symbol}`);

    if (storyEntries.length === 0 && fallbackId) {
      storyEntries.push({ storyName: null, id: fallbackId });
    }

    for (const { storyName, id } of storyEntries) {
      const concreteInfo = storyName ? storyConcretes.get(storyName) : null;
      const concreteStrength =
        !sec.materialSpecified && concreteInfo?.floor
          ? concreteInfo.floor
          : sec.materialSpecified && sec.material
            ? sec.material
            : ctx.defaultConcreteStrength;
      lines.push(
        `${indent(2)}<StbSecWall_RC ${buildAttrString({
          id,
          guid: ctx.nextGuid(),
          name,
          strength_concrete: concreteStrength,
        })}>`,
      );
      lines.push(`${indent(3)}<StbSecFigureWall_RC>`);
      lines.push(`${indent(4)}<StbSecWall_RC_Straight t="${thickness}" />`);
      lines.push(`${indent(3)}</StbSecFigureWall_RC>`);
      lines.push(`${indent(2)}</StbSecWall_RC>`);
    }
  }
}

/**
 * 壁開口断面 StbSecOpen_RC を生成する
 * 同一 (壁符号, 階) の開口は1つの断面を共有する
 */
function generateOpenSections(lines, ctx) {
  const openings = ctx.ss7Data.wallOpeningPlacements || [];
  if (openings.length === 0) return;

  for (let idx = 0; idx < openings.length; idx++) {
    const op = openings[idx];
    const secId = ctx.sectionIdMap.get(`openSec_idx_${idx}`);
    if (secId == null) continue;

    const wallKey = `${op.frame}_${op.startAxis}_${op.endAxis}_${op.floor}`;
    const wallSymbol = ctx.wallSymbolMap.get(wallKey) || 'W';
    const name = `OP-${op.counter}-${wallSymbol}-${op.floor}`;

    // 開口サイズを計算
    let wallWidth = 0;
    if (op.frameAxis === 'Y') {
      const startPos = ctx.xAxisPositionMap.get(op.startAxis) ?? 0;
      const endPos = ctx.xAxisPositionMap.get(op.endAxis) ?? 0;
      wallWidth = Math.abs(endPos - startPos);
    } else {
      const startPos = ctx.yAxisPositionMap.get(op.startAxis) ?? 0;
      const endPos = ctx.yAxisPositionMap.get(op.endAxis) ?? 0;
      wallWidth = Math.abs(endPos - startPos);
    }
    const perpDir = op.frameAxis === 'Y' ? 'x' : 'y';
    const leftColHalf = ctx.getColumnHalfSizeAtAxis(
      op.frameAxis,
      op.frame,
      op.startAxis,
      op.floor,
      perpDir,
    );
    const rightColHalf = ctx.getColumnHalfSizeAtAxis(
      op.frameAxis,
      op.frame,
      op.endAxis,
      op.floor,
      perpDir,
    );
    const wallHeight = ctx.getWallHeightAtFloor(op.floor);
    const bottomBeamHalf = ctx.getBeamHalfDepthAtFloor(
      op.floor,
      op.frameAxis,
      op.frame,
      op.startAxis,
      op.endAxis,
    );

    const { lengthX, lengthY } = computeOpeningPosition(
      op,
      wallWidth,
      wallHeight,
      leftColHalf,
      rightColHalf,
      bottomBeamHalf,
      bottomBeamHalf,
    );

    lines.push(
      `${indent(2)}<StbSecOpen_RC ${buildAttrString({
        id: secId,
        guid: ctx.nextGuid(),
        name,
        length_X: lengthX.toFixed(1),
        length_Y: lengthY.toFixed(1),
      })} />`,
    );
  }
}

function generateParapetSections(lines, ctx, parapetPlacements, parapetSectionDefs) {
  // 断面定義マップ: symbol → { thickness, material }
  const secDefMap = new Map();
  for (const def of parapetSectionDefs) {
    secDefMap.set(def.symbol, def);
  }

  for (let i = 0; i < parapetPlacements.length; i++) {
    const placement = parapetPlacements[i];
    const secId = ctx.sectionIdMap.get(`parapet_${i}`);
    if (!secId) continue;

    const def = secDefMap.get(placement.symbol);
    const thickness = def?.thickness || 0;
    const material = def?.material || 'Fc21';
    const height = placement.height || 0;

    lines.push(
      `${indent(2)}<StbSecParapet_RC id="${secId}" name="${escXml(placement.symbol)}" strength_concrete="${escXml(material)}">`,
    );
    lines.push(`${indent(3)}<StbSecFigureParapet_RC>`);
    lines.push(`${indent(4)}<StbSecParapet_RC_TypeI t_T="${thickness}" depth_H="${height}"/>`);
    lines.push(`${indent(3)}</StbSecFigureParapet_RC>`);
    lines.push(`${indent(2)}</StbSecParapet_RC>`);
  }
}

function generateSlabSections(lines, ctx, floorSections) {
  const uniqueSections = deduplicateSections(floorSections);

  for (const sec of uniqueSections) {
    const kindSlab = sec.isCanti ? 'CANTI' : 'NORMAL';
    const t = sec.t || 0;
    const te = sec.te || t;

    // 「標準」コンクリート断面は使用される層ごとの強度で複数エントリを生成
    const concreteKey = `${sec.symbol}_${kindSlab}`;
    if (sec.concrete === '標準' && ctx.floorSectionConcretesMap.has(concreteKey)) {
      const concretes = ctx.floorSectionConcretesMap.get(concreteKey);
      for (const concrete of concretes) {
        const secId = ctx.sectionIdMap.get(`floor_${sec.symbol}_${kindSlab}_${concrete}`);
        if (!secId) continue;
        const slabAttrs = {
          id: secId,
          guid: ctx.nextGuid(),
          name: sec.symbol,
          floor: '',
          strength_concrete: concrete,
        };
        if (sec.isCanti) slabAttrs.isCanti = 'true';
        lines.push(`${indent(2)}<StbSecSlab_RC ${buildAttrString(slabAttrs)}>`);
        lines.push(`${indent(3)}<StbSecFigureSlab_RC>`);
        lines.push(`${indent(4)}<StbSecSlab_RC_Straight t="${t}" te="${te}"/>`);
        lines.push(`${indent(3)}</StbSecFigureSlab_RC>`);
        lines.push(`${indent(2)}</StbSecSlab_RC>`);
      }
      continue;
    }

    const secId = ctx.getFloorSectionId(sec.symbol, kindSlab);
    if (!secId) continue;

    if (sec.type === 'deck') {
      lines.push(
        `${indent(2)}<StbSecSlabDeck ${buildAttrString({
          id: secId,
          guid: ctx.nextGuid(),
          name: sec.symbol,
          product_type: 'FLAT',
        })}>`,
      );
      lines.push(`${indent(3)}<StbSecFigureSlabDeck>`);
      lines.push(`${indent(4)}<StbSecSlabDeckStraight depth="${t.toFixed(1)}" />`);
      lines.push(`${indent(3)}</StbSecFigureSlabDeck>`);
      lines.push(
        `${indent(3)}<StbSecProductSlabDeck product_code="Undefined" depth_deck="${(sec.deckHeight || 0).toFixed(1)}" />`,
      );
      lines.push(`${indent(2)}</StbSecSlabDeck>`);
      continue;
    }

    const concrete =
      sec.concrete && sec.concrete !== '標準' ? sec.concrete : ctx.defaultConcreteStrength;
    const slabAttrs = {
      id: secId,
      guid: ctx.nextGuid(),
      name: sec.symbol,
      floor: '',
      strength_concrete: concrete,
    };
    if (sec.isCanti) slabAttrs.isCanti = 'true';
    lines.push(`${indent(2)}<StbSecSlab_RC ${buildAttrString(slabAttrs)}>`);
    lines.push(`${indent(3)}<StbSecFigureSlab_RC>`);
    lines.push(`${indent(4)}<StbSecSlab_RC_Straight t="${t}" te="${te}"/>`);
    lines.push(`${indent(3)}</StbSecFigureSlab_RC>`);
    lines.push(`${indent(2)}</StbSecSlab_RC>`);
  }
}

/**
 * 杭断面（StbSecPile_RC）を生成
 * 配置で参照される杭符号ごとに 1 要素を出力する
 */
function generatePileSections(lines, ctx) {
  const { sections, pilePlacements } = ctx.ss7Data;
  if (!sections?.piles || sections.piles.length === 0) return;
  if (!pilePlacements || pilePlacements.length === 0) return;

  // 配置で参照される杭符号を収集
  const foundationMap = new Map();
  for (const f of sections.pileFoundations || []) {
    foundationMap.set(f.symbol, f.pileSymbol);
  }
  const usedPileSymbols = new Set();
  for (const p of pilePlacements) {
    const pileSymbol = foundationMap.get(p.foundationSymbol);
    if (pileSymbol) usedPileSymbols.add(pileSymbol);
  }

  // 杭符号でグループ化して重複排除
  const pileSecMap = new Map();
  for (const sec of sections.piles) {
    if (usedPileSymbols.has(sec.symbol) && !pileSecMap.has(sec.symbol)) {
      pileSecMap.set(sec.symbol, sec);
    }
  }

  if (pileSecMap.size === 0) return;

  for (const sec of pileSecMap.values()) {
    const secId = ctx.sectionIdMap.get(`pile_${sec.symbol}`);
    if (!secId) continue;

    lines.push(
      `${indent(2)}<StbSecPile_RC ${buildAttrString({
        id: secId,
        guid: ctx.nextGuid(),
        name: sec.symbol,
      })}>`,
    );
    lines.push(
      `${indent(3)}<StbSecPile_RC_Conventional ${buildAttrString({
        strength_concrete: sec.concrete || ctx.defaultConcreteStrength,
      })}>`,
    );
    lines.push(`${indent(4)}<StbSecFigurePile_RC_Conventional>`);
    lines.push(`${indent(5)}<StbSecPile_RC_ConventionalStraight D="${sec.diameter}.0" />`);
    lines.push(`${indent(4)}</StbSecFigurePile_RC_Conventional>`);
    lines.push(`${indent(3)}</StbSecPile_RC_Conventional>`);
    lines.push(`${indent(2)}</StbSecPile_RC>`);
  }
}

/**
 * フーチング断面（StbSecFoundation_RC）を生成
 * SS7の「場所打ち杭基礎断面」から独立基礎断面を出力する
 */
function generateFootingSections(lines, ctx) {
  const { sections, pilePlacements } = ctx.ss7Data;
  if (!sections?.pileFoundations || sections.pileFoundations.length === 0) return;
  if (!pilePlacements || pilePlacements.length === 0) return;

  // 配置で参照される基礎符号を収集
  const usedSymbols = new Set(pilePlacements.map((p) => p.foundationSymbol));

  for (const sec of sections.pileFoundations) {
    if (!usedSymbols.has(sec.symbol)) continue;

    const secId = ctx.sectionIdMap.get(`footing_sec_${sec.symbol}`);
    if (!secId) continue;

    const concreteStrength = sec.concrete || ctx.defaultConcreteStrength;

    // フーチング幅: 杭径 + 2×へりあき（1本杭の場合）
    const pile = (sections.piles || []).find((p) => p.symbol === sec.pileSymbol);
    const pileDiameter = pile ? pile.diameter : 0;
    const widthX = pileDiameter > 0 && sec.edgeX > 0 ? pileDiameter + 2 * sec.edgeX : 0;
    const widthY = pileDiameter > 0 && sec.edgeY > 0 ? pileDiameter + 2 * sec.edgeY : 0;
    const defaultWidth = pileDiameter > 0 ? pileDiameter * 2 : 1000;

    lines.push(
      `${indent(2)}<StbSecFoundation_RC ${buildAttrString({
        id: secId,
        guid: ctx.nextGuid(),
        name: sec.symbol,
        strength_concrete: concreteStrength,
      })}>`,
    );
    lines.push(`${indent(3)}<StbSecFigureFoundation_RC>`);
    lines.push(
      `${indent(4)}<StbSecFoundation_RC_Rect width_X="${widthX > 0 ? widthX : defaultWidth}" width_Y="${widthY > 0 ? widthY : defaultWidth}" depth="${sec.height}"/>`,
    );
    lines.push(`${indent(3)}</StbSecFigureFoundation_RC>`);
    lines.push(`${indent(2)}</StbSecFoundation_RC>`);
  }
}

/**
 * 杭部材（StbPile）を生成
 */
function generatePiles(lines, ctx) {
  const { pilePlacements, sections, stories } = ctx.ss7Data;
  if (!pilePlacements || pilePlacements.length === 0) return;

  // 基礎断面マップ: 基礎符号 → 基礎断面オブジェクト
  const foundationMap = new Map();
  for (const f of sections?.pileFoundations || []) {
    foundationMap.set(f.symbol, f);
  }

  // 杭断面マップ: 杭符号 → 杭断面オブジェクト
  const pileSecMap = new Map();
  for (const sec of sections?.piles || []) {
    if (!pileSecMap.has(sec.symbol)) {
      pileSecMap.set(sec.symbol, sec);
    }
  }

  // 層高マップ: 層名 → 高さ(mm)、STB座標系(1FL=0)に正規化
  const pileBaseZ = stories?.length ? Math.min(...stories.map((s) => s.height)) : 0;
  const storyHeightMap = new Map();
  for (const s of stories || []) {
    storyHeightMap.set(s.name, s.height - pileBaseZ);
  }

  const pileRecords = [];

  for (const placement of pilePlacements) {
    const { story, xAxis, yAxis, foundationSymbol, baseLevel } = placement;

    const foundation = foundationMap.get(foundationSymbol);
    if (!foundation) continue;

    const pileSec = pileSecMap.get(foundation.pileSymbol);
    if (!pileSec) continue;

    const sectionId = ctx.sectionIdMap.get(`pile_${foundation.pileSymbol}`);
    if (!sectionId) continue;

    const nodeId = ctx.getNodeId(xAxis, yAxis, story);
    if (!nodeId) continue;

    const storyZ = storyHeightMap.get(story);
    if (storyZ === undefined) continue;

    // 杭頭レベル計算: 基礎底面 + 杭頭の基礎内埋込長
    // baseLevel は基礎底面の層床からのオフセット(mm)
    const foundationBottom = storyZ + baseLevel;
    const levelTop = foundationBottom + foundation.embedment;

    const lengthAll = pileSec.lengthTotal;
    const lengthHead = pileSec.lengthHead;
    const lengthFoot = lengthAll - lengthHead;

    pileRecords.push({
      name: foundation.pileSymbol,
      id_node: nodeId,
      id_section: sectionId,
      kind_structure: 'RC',
      offset_X: 0.0,
      offset_Y: 0.0,
      level_top: levelTop,
      length_all: lengthAll,
      length_head: lengthHead,
      length_foot: lengthFoot,
    });
  }

  if (pileRecords.length === 0) return;

  lines.push(`${indent(3)}<StbPiles>`);
  for (const rec of pileRecords) {
    lines.push(
      `${indent(4)}<StbPile ${buildAttrString({
        id: ctx.nextId(),
        guid: ctx.nextGuid(),
        name: rec.name,
        id_node: rec.id_node,
        id_section: rec.id_section,
        kind_structure: rec.kind_structure,
        offset_X: rec.offset_X.toFixed(1),
        offset_Y: rec.offset_Y.toFixed(1),
        level_top: rec.level_top.toFixed(1),
        length_all: rec.length_all.toFixed(1),
        length_head: rec.length_head.toFixed(1),
        length_foot: rec.length_foot.toFixed(1),
      })}/>`,
    );
  }
  lines.push(`${indent(3)}</StbPiles>`);
}

/**
 * フーチング部材（StbFooting）を生成
 * SS7の「杭基礎配置」に対応するフーチングを独立基礎として出力する
 */
function generateFootings(lines, ctx) {
  const { pilePlacements, sections } = ctx.ss7Data;
  if (!pilePlacements || pilePlacements.length === 0) return;
  if (!sections?.pileFoundations || sections.pileFoundations.length === 0) return;

  // 基礎断面マップ: 基礎符号 → 基礎断面オブジェクト
  const foundationMap = new Map();
  for (const f of sections.pileFoundations) {
    foundationMap.set(f.symbol, f);
  }

  const footingRecords = [];

  for (const placement of pilePlacements) {
    const { story, xAxis, yAxis, foundationSymbol } = placement;

    const foundation = foundationMap.get(foundationSymbol);
    if (!foundation) continue;

    const sectionId = ctx.sectionIdMap.get(`footing_sec_${foundationSymbol}`);
    if (!sectionId) continue;

    const nodeId = ctx.getNodeId(xAxis, yAxis, story);
    if (!nodeId) continue;

    // フーチング底面レベル（level_bottom）の計算:
    //   node.z は ctx.baseZ で正規化済み（例: B1SL=0）
    //   level_bottom はノードZからの相対オフセット
    //   フーチング天端 = 配置層床面（参照STBと一致させる）
    //   level_bottom = ctx.baseZ - foundation.height
    //   （ctx.baseZ は最低層の1FL基準高さ = 負値。地下階なし時は0）
    const levelBottom = ctx.baseZ - foundation.height;

    footingRecords.push({
      nodeId,
      sectionId,
      symbol: foundationSymbol,
      levelBottom,
    });
  }

  if (footingRecords.length === 0) return;

  lines.push(`${indent(3)}<StbFootings>`);
  for (const rec of footingRecords) {
    lines.push(
      `${indent(4)}<StbFooting ${buildAttrString({
        id: ctx.nextId(),
        guid: ctx.nextGuid(),
        name: rec.symbol,
        id_node: rec.nodeId,
        rotate: '0.0',
        id_section: rec.sectionId,
        offset_X: '0.0',
        offset_Y: '0.0',
        level_bottom: rec.levelBottom.toFixed(1),
      })}/>`,
    );
  }
  lines.push(`${indent(3)}</StbFootings>`);
}

/**
 * 同じ符号・階の断面を重複排除（最初の出現を保持）
 * 階情報がある場合は symbol + story/floor の組み合わせで判定
 */
function deduplicateSections(sections) {
  const seen = new Set();
  const result = [];
  for (const sec of sections) {
    const key = `${sec.symbol}_${sec.story || sec.floor || ''}_${sec.memberClass || ''}_${sec.isCanti ? 'CANTI' : ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(sec);
    }
  }
  return result;
}
