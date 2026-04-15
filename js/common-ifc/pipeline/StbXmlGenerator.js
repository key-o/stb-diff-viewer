/**
 * @fileoverview Stage 7: STB 2.1.0 XML生成
 *
 * パイプラインで収集したデータからSTB形式のXMLを生成する。
 * DOM非依存の文字列ベース実装。
 *
 * @module StbXmlGenerator
 */

import { getStbSecSteelTagName } from '../mapping/IfcProfileToStbSection.js';

/**
 * STB XMLを生成
 * @param {Object} data - 変換済みデータ
 * @param {Array} data.nodes - 節点リスト [{id, x, y, z}]
 * @param {Array} data.stories - 階リスト [{id, name, height, kind}]
 * @param {Array} data.elements - 要素リスト [{stbType, id, ...}]
 * @param {Array} data.sections - 断面リスト [{id, stbType, name, params}]
 * @param {Object} [data.meta] - メタ情報
 * @returns {string} STB XML文字列
 */
export function generateStbXml(data) {
  const lines = [];
  const indent = (level) => '  '.repeat(level);

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<ST_BRIDGE version="2.1.0" xmlns="https://www.building-smart.or.jp/dl">');

  // StbCommon
  const projectName = data.meta?.projectName || 'IFC-Converted';
  lines.push(
    `${indent(1)}<StbCommon project_name="${escXml(projectName)}" app_name="IFC-STB-Converter" app_version="1.0.0"/>`,
  );

  // StbModel
  lines.push(`${indent(1)}<StbModel>`);

  // -- StbNodes
  lines.push(`${indent(2)}<StbNodes>`);
  for (const n of data.nodes) {
    lines.push(`${indent(3)}<StbNode id="${n.id}" X="${n.x}" Y="${n.y}" Z="${n.z}"/>`);
  }
  lines.push(`${indent(2)}</StbNodes>`);

  // -- StbStories
  lines.push(`${indent(2)}<StbStories>`);
  for (const s of data.stories) {
    lines.push(
      `${indent(3)}<StbStory id="${s.id}" name="${escXml(s.name)}" height="${s.height}" kind="${s.kind}"/>`,
    );
  }
  lines.push(`${indent(2)}</StbStories>`);

  // -- StbMembers
  lines.push(`${indent(2)}<StbMembers>`);
  generateMembers(lines, data.elements, 3);
  lines.push(`${indent(2)}</StbMembers>`);

  lines.push(`${indent(1)}</StbModel>`);

  // StbSections
  lines.push(`${indent(1)}<StbSections>`);
  generateSections(lines, data.sections, data.elements, 2);
  lines.push(`${indent(1)}</StbSections>`);

  // StbOpen（開口）
  const allOpenings = data.elements
    .filter((el) => el.stbType === 'StbWall' && el.openings && el.openings.length > 0)
    .flatMap((el) => el.openings);
  if (allOpenings.length > 0) {
    lines.push(`${indent(1)}<StbOpen>`);
    lines.push(`${indent(2)}<StbOpenings>`);
    for (const op of allOpenings) {
      lines.push(
        `${indent(3)}<StbOpening id="${op.id}" name="${escXml(op.name || '')}" ` +
          `kind_member="WALL" id_member="${op.wallId}" ` +
          `position_X="${op.positionX}" position_Y="${op.positionY}" ` +
          `length_X="${op.width}" length_Y="${op.height}" rotate="${op.rotate || 0}"/>`,
      );
    }
    lines.push(`${indent(2)}</StbOpenings>`);
    lines.push(`${indent(1)}</StbOpen>`);
  }

  lines.push('</ST_BRIDGE>');

  return lines.join('\n');
}

/**
 * StbMembers の各カテゴリを生成
 */
function generateMembers(lines, elements, level) {
  const indent = (l) => '  '.repeat(l);

  const groups = {
    StbColumn: [],
    StbPost: [],
    StbFoundationColumn: [],
    StbGirder: [],
    StbBeam: [],
    StbBrace: [],
    StbSlab: [],
    StbWall: [],
    StbPile: [],
    StbFooting: [],
  };

  for (const el of elements) {
    if (groups[el.stbType]) {
      groups[el.stbType].push(el);
    }
  }

  // Columns
  if (
    groups.StbColumn.length > 0 ||
    groups.StbPost.length > 0 ||
    groups.StbFoundationColumn.length > 0
  ) {
    lines.push(`${indent(level)}<StbColumns>`);
    for (const el of groups.StbColumn) {
      lines.push(`${indent(level + 1)}<StbColumn${memberAttrs(el, 'column')}/>`);
    }
    for (const el of groups.StbPost) {
      lines.push(`${indent(level + 1)}<StbPost${memberAttrs(el, 'column')}/>`);
    }
    for (const el of groups.StbFoundationColumn) {
      lines.push(`${indent(level + 1)}<StbFoundationColumn${foundationColumnAttrs(el)}/>`);
    }
    lines.push(`${indent(level)}</StbColumns>`);
  }

  // Girders
  if (groups.StbGirder.length > 0) {
    lines.push(`${indent(level)}<StbGirders>`);
    for (const el of groups.StbGirder) {
      lines.push(`${indent(level + 1)}<StbGirder${memberAttrs(el, 'beam')}/>`);
    }
    lines.push(`${indent(level)}</StbGirders>`);
  }

  // Beams
  if (groups.StbBeam.length > 0) {
    lines.push(`${indent(level)}<StbBeams>`);
    for (const el of groups.StbBeam) {
      lines.push(`${indent(level + 1)}<StbBeam${memberAttrs(el, 'beam')}/>`);
    }
    lines.push(`${indent(level)}</StbBeams>`);
  }

  // Braces
  if (groups.StbBrace.length > 0) {
    lines.push(`${indent(level)}<StbBraces>`);
    for (const el of groups.StbBrace) {
      lines.push(`${indent(level + 1)}<StbBrace${memberAttrs(el, 'beam')}/>`);
    }
    lines.push(`${indent(level)}</StbBraces>`);
  }

  // Slabs
  if (groups.StbSlab.length > 0) {
    lines.push(`${indent(level)}<StbSlabs>`);
    for (const el of groups.StbSlab) {
      lines.push(`${indent(level + 1)}<StbSlab${slabAttrs(el)}>`);
      if (el.nodeIds && el.nodeIds.length > 0) {
        lines.push(`${indent(level + 2)}<StbNodeIdOrder>${el.nodeIds.join(' ')}</StbNodeIdOrder>`);
      }
      lines.push(`${indent(level + 1)}</StbSlab>`);
    }
    lines.push(`${indent(level)}</StbSlabs>`);
  }

  // Walls
  if (groups.StbWall.length > 0) {
    lines.push(`${indent(level)}<StbWalls>`);
    for (const el of groups.StbWall) {
      lines.push(`${indent(level + 1)}<StbWall${wallAttrs(el)}>`);
      if (el.nodeIds && el.nodeIds.length > 0) {
        lines.push(`${indent(level + 2)}<StbNodeIdOrder>${el.nodeIds.join(' ')}</StbNodeIdOrder>`);
      }
      if (el.openings && el.openings.length > 0) {
        lines.push(`${indent(level + 2)}<StbOpenIdList>`);
        for (const op of el.openings) {
          lines.push(`${indent(level + 3)}<StbOpenId id="${op.id}"/>`);
        }
        lines.push(`${indent(level + 2)}</StbOpenIdList>`);
      }
      lines.push(`${indent(level + 1)}</StbWall>`);
    }
    lines.push(`${indent(level)}</StbWalls>`);
  }

  // Piles
  if (groups.StbPile.length > 0) {
    lines.push(`${indent(level)}<StbPiles>`);
    for (const el of groups.StbPile) {
      lines.push(`${indent(level + 1)}<StbPile${pileAttrs(el)}/>`);
    }
    lines.push(`${indent(level)}</StbPiles>`);
  }

  // Footings
  if (groups.StbFooting.length > 0) {
    lines.push(`${indent(level)}<StbFootings>`);
    for (const el of groups.StbFooting) {
      lines.push(`${indent(level + 1)}<StbFooting${footingAttrs(el)}/>`);
    }
    lines.push(`${indent(level)}</StbFootings>`);
  }
}

/**
 * 線材要素の属性文字列を生成
 */
function memberAttrs(el, category) {
  let attrs = ` id="${el.id}" name="${escXml(el.name || '')}"`;

  if (category === 'column') {
    attrs += ` id_node_bottom="${el.nodeStart}" id_node_top="${el.nodeEnd}"`;
  } else {
    attrs += ` id_node_start="${el.nodeStart}" id_node_end="${el.nodeEnd}"`;
  }

  if (el.sectionId) {
    attrs += ` id_section="${el.sectionId}"`;
  }

  attrs += ` kind_structure="${el.kindStructure || 'S'}"`;

  if (el.rotate) {
    attrs += ` rotate="${el.rotate}"`;
  }

  // ハンチ属性
  if (el.haunch?.sections) {
    const h = el.haunch.sections;
    if (h.haunchStart > 0) {
      attrs += ` haunch_start="${h.haunchStart}"`;
      if (h.kindStart) attrs += ` kind_haunch_start="${h.kindStart}"`;
    }
    if (h.haunchEnd > 0) {
      attrs += ` haunch_end="${h.haunchEnd}"`;
      if (h.kindEnd) attrs += ` kind_haunch_end="${h.kindEnd}"`;
    }
  }

  return attrs;
}

/**
 * スラブ要素の属性文字列
 */
function slabAttrs(el) {
  let attrs = ` id="${el.id}" name="${escXml(el.name || '')}"`;
  if (el.sectionId) attrs += ` id_section="${el.sectionId}"`;
  attrs += ` kind_structure="${el.kindStructure || 'S'}"`;
  return attrs;
}

/**
 * 壁要素の属性文字列
 */
function wallAttrs(el) {
  let attrs = ` id="${el.id}" name="${escXml(el.name || '')}"`;
  if (el.sectionId) attrs += ` id_section="${el.sectionId}"`;
  attrs += ` kind_structure="${el.kindStructure || 'S'}"`;
  return attrs;
}

/**
 * 杭要素の属性文字列
 */
function pileAttrs(el) {
  let attrs = ` id="${el.id}" name="${escXml(el.name || '')}"`;
  if (el.pileFormat === '1node' && el.nodeSingle) {
    attrs += ` id_node="${el.nodeSingle}"`;
    if (el.levelTop !== undefined) attrs += ` level_top="${el.levelTop}"`;
    if (el.offsetX !== undefined) attrs += ` offset_X="${el.offsetX}"`;
    if (el.offsetY !== undefined) attrs += ` offset_Y="${el.offsetY}"`;
  } else {
    attrs += ` id_node_bottom="${el.nodeBottom || el.nodeStart}" id_node_top="${el.nodeTop || el.nodeEnd}"`;
  }
  if (el.sectionId) attrs += ` id_section="${el.sectionId}"`;
  if (el.lengthAll !== undefined) attrs += ` length_all="${el.lengthAll}"`;
  attrs += ` kind_structure="${el.kindStructure || 'S'}"`;
  attrs += ` kind_pile="${el.kindPile || 'CAST_IN_PLACE'}"`;
  if (el.rotate) attrs += ` rotate="${el.rotate}"`;
  return attrs;
}

/**
 * フーチング要素の属性文字列
 */
function footingAttrs(el) {
  let attrs = ` id="${el.id}" name="${escXml(el.name || '')}"`;
  attrs += ` id_node="${el.nodeStart}"`;
  if (el.sectionId) attrs += ` id_section="${el.sectionId}"`;
  if (el.rotate) attrs += ` rotate="${el.rotate}"`;
  if (el.offsetX !== undefined) attrs += ` offset_X="${el.offsetX}"`;
  if (el.offsetY !== undefined) attrs += ` offset_Y="${el.offsetY}"`;
  if (el.levelBottom !== undefined) attrs += ` level_bottom="${el.levelBottom}"`;
  if (el.kindStructure) attrs += ` kind_structure="${el.kindStructure}"`;
  if (el.kindFooting) attrs += ` kind_footing="${el.kindFooting}"`;
  return attrs;
}

/**
 * 基礎柱要素の属性文字列
 */
function foundationColumnAttrs(el) {
  let attrs = ` id="${el.id}" name="${escXml(el.name || '')}"`;
  attrs += ` id_node="${el.nodeStart}"`;
  if (el.rotate) attrs += ` rotate="${el.rotate}"`;
  if (el.idSectionFD) attrs += ` id_section_FD="${el.idSectionFD}"`;
  if (el.lengthFD) attrs += ` length_FD="${el.lengthFD}"`;
  if (el.idSectionWR) attrs += ` id_section_WR="${el.idSectionWR}"`;
  if (el.lengthWR) attrs += ` length_WR="${el.lengthWR}"`;
  if (el.offsetFDX !== undefined) attrs += ` offset_FD_X="${el.offsetFDX}"`;
  if (el.offsetFDY !== undefined) attrs += ` offset_FD_Y="${el.offsetFDY}"`;
  if (el.offsetZ !== undefined && el.offsetZ !== 0) attrs += ` offset_Z="${el.offsetZ}"`;
  if (el.kindStructure) attrs += ` kind_structure="${el.kindStructure}"`;
  return attrs;
}

/**
 * StbSections を生成
 */
function generateSections(lines, sections, elements, level) {
  const indent = (l) => '  '.repeat(l);

  // 鋼材断面定義（StbSecSteel）
  const steelSections = sections.filter((s) =>
    ['H', 'BOX', 'PIPE', 'L', 'T', 'C', 'FB', 'CIRCLE'].includes(s.stbType),
  );

  if (steelSections.length > 0) {
    lines.push(`${indent(level)}<StbSecSteel>`);
    for (const sec of steelSections) {
      const tag = getStbSecSteelTagName(sec.stbType);
      const paramStr = Object.entries(sec.params)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      lines.push(`${indent(level + 1)}<${tag} name="${escXml(sec.name)}" ${paramStr}/>`);
    }
    lines.push(`${indent(level)}</StbSecSteel>`);
  }

  // 要素カテゴリ別の断面参照
  generateMemberSections(lines, elements, sections, level);
}

/**
 * 要素別の断面参照を生成（StbSecColumn_S, StbSecBeam_S 等）
 */
function generateMemberSections(lines, elements, sections, level) {
  const indent = (l) => '  '.repeat(l);

  // セクションIDで使われている断面をグループ化
  const sectionUsage = new Map();
  for (const el of elements) {
    if (!el.sectionId) continue;
    const key = `${el.stbCategory}_${el.sectionId}`;
    if (!sectionUsage.has(key)) {
      sectionUsage.set(key, { category: el.stbCategory, sectionId: el.sectionId, elements: [] });
    }
    sectionUsage.get(key).elements.push(el);
  }

  // 断面ID → 断面情報
  const sectionById = new Map();
  for (const sec of sections) {
    sectionById.set(sec.id, sec);
  }

  // カテゴリ別にグループ
  const categoryGroups = new Map();
  for (const usage of sectionUsage.values()) {
    if (!categoryGroups.has(usage.category)) {
      categoryGroups.set(usage.category, []);
    }
    categoryGroups.get(usage.category).push(usage);
  }

  // 柱断面
  const columnUsages = categoryGroups.get('column') || [];
  const columnSecIdsDone = new Set();
  for (const usage of columnUsages) {
    if (columnSecIdsDone.has(usage.sectionId)) continue;
    columnSecIdsDone.add(usage.sectionId);

    const sec = sectionById.get(usage.sectionId);
    if (!sec) continue;
    const kindStructure = inferSectionKindStructure(usage.elements, sec);

    if (kindStructure === 'RC' && ['RECTANGLE', 'CIRCLE'].includes(sec.stbType)) {
      generateRcColumnSection(lines, usage.sectionId, sec, level);
    } else {
      generateSteelColumnSection(lines, usage.sectionId, sec, level);
    }
  }

  // 大梁断面
  const beamUsages = categoryGroups.get('beam') || [];
  const beamSecIdsDone = new Set();
  for (const usage of beamUsages) {
    if (beamSecIdsDone.has(usage.sectionId)) continue;
    beamSecIdsDone.add(usage.sectionId);

    const sec = sectionById.get(usage.sectionId);
    if (!sec) continue;

    // ハンチ付き要素があるかチェック
    const haunchEl = usage.elements.find((e) => e.haunch && e.haunch.pattern !== 'SAME');

    lines.push(
      `${indent(level)}<StbSecBeam_S id="${usage.sectionId}" name="Beam-S-${usage.sectionId}" floor="ALL">`,
    );
    lines.push(`${indent(level + 1)}<StbSecSteelFigureBeam_S>`);

    if (haunchEl && haunchEl.haunch.sections) {
      // ハンチ断面出力（StbSecSteelBeam_S_Haunch）
      generateHaunchBeamFigure(lines, sec, haunchEl.haunch, level + 2);
    } else {
      lines.push(`${indent(level + 2)}<StbSecSteelBeam_S_Same shape="${escXml(sec.name)}"/>`);
    }

    lines.push(`${indent(level + 1)}</StbSecSteelFigureBeam_S>`);
    lines.push(`${indent(level)}</StbSecBeam_S>`);
  }

  // ブレース断面
  const braceUsages = categoryGroups.get('brace') || [];
  for (const usage of braceUsages) {
    const sec = sectionById.get(usage.sectionId);
    if (!sec) continue;
    lines.push(
      `${indent(level)}<StbSecBrace_S id="${usage.sectionId}" name="Brace-S-${usage.sectionId}" floor="ALL">`,
    );
    lines.push(`${indent(level + 1)}<StbSecSteelFigureBrace_S>`);
    lines.push(`${indent(level + 2)}<StbSecSteelBrace_S_Same shape="${escXml(sec.name)}"/>`);
    lines.push(`${indent(level + 1)}</StbSecSteelFigureBrace_S>`);
    lines.push(`${indent(level)}</StbSecBrace_S>`);
  }

  const footingUsages = categoryGroups.get('footing') || [];
  const footingSecIdsDone = new Set();
  for (const usage of footingUsages) {
    if (footingSecIdsDone.has(usage.sectionId)) continue;
    footingSecIdsDone.add(usage.sectionId);

    const sec = sectionById.get(usage.sectionId);
    if (!sec) continue;

    generateRcFootingSection(lines, usage.sectionId, sec, usage.elements[0], level);
  }

  const pileUsages = categoryGroups.get('pile') || [];
  const pileSecIdsDone = new Set();
  for (const usage of pileUsages) {
    if (pileSecIdsDone.has(usage.sectionId)) continue;
    pileSecIdsDone.add(usage.sectionId);

    const sec = sectionById.get(usage.sectionId);
    if (!sec) continue;

    const kindStructure = inferSectionKindStructure(usage.elements, sec);
    if (sec.stbType === 'PILE_PRODUCT' || kindStructure === 'PC') {
      generatePileProductSection(lines, usage.sectionId, sec, level);
    } else if (kindStructure === 'RC' && ['PILE_RC', 'CIRCLE'].includes(sec.stbType)) {
      generateRcPileSection(lines, usage.sectionId, sec, level);
    } else if (kindStructure === 'S' && ['PILE_S', 'PIPE'].includes(sec.stbType)) {
      generateSteelPileSection(lines, usage.sectionId, sec, usage.elements[0], level);
    }
  }
}

/*
 * ハンチ付き梁の断面図描写を生成
 * @param {string[]} lines
 * @param {Object} sec - 中央断面情報
 * @param {Object} haunch - ハンチ検出結果
 * @param {number} level - インデントレベル
 */
function inferSectionKindStructure(elements, sec) {
  const explicit = elements.find((el) => el.kindStructure && el.kindStructure !== 'UNDEFINED')?.kindStructure;
  if (explicit) return explicit;

  if (['RECTANGLE', 'CIRCLE', 'PILE_RC'].includes(sec.stbType)) return 'RC';
  if (sec.stbType === 'PILE_PRODUCT') return 'PC';
  return 'S';
}

function generateSteelColumnSection(lines, sectionId, sec, level) {
  const indent = (l) => '  '.repeat(l);
  lines.push(`${indent(level)}<StbSecColumn_S id="${sectionId}" name="Column-S-${sectionId}" floor="ALL">`);
  lines.push(`${indent(level + 1)}<StbSecSteelFigureColumn_S>`);
  lines.push(
    `${indent(level + 2)}<StbSecSteelColumn_S_Same shape="${escXml(sec.name)}" direction_type="OTHER"/>`,
  );
  lines.push(`${indent(level + 1)}</StbSecSteelFigureColumn_S>`);
  lines.push(`${indent(level)}</StbSecColumn_S>`);
}

function generateRcColumnSection(lines, sectionId, sec, level) {
  const indent = (l) => '  '.repeat(l);
  lines.push(
    `${indent(level)}<StbSecColumn_RC id="${sectionId}" name="Column-RC-${sectionId}" floor="ALL" kind_column="COLUMN" strength_concrete="Fc21">`,
  );
  lines.push(`${indent(level + 1)}<StbSecFigureColumn_RC>`);

  if (sec.stbType === 'CIRCLE') {
    lines.push(`${indent(level + 2)}<StbSecColumn_RC_Circle D="${sec.params.D}"/>`);
  } else {
    lines.push(
      `${indent(level + 2)}<StbSecColumn_RC_Rect width_X="${sec.params.width_X}" width_Y="${sec.params.width_Y}"/>`,
    );
  }

  lines.push(`${indent(level + 1)}</StbSecFigureColumn_RC>`);
  lines.push(`${indent(level)}</StbSecColumn_RC>`);
}

function generateRcFootingSection(lines, sectionId, sec, element, level) {
  const indent = (l) => '  '.repeat(l);
  const depth = Math.abs(element?.levelBottom ?? 0);
  const widthX = sec.params.width_X ?? sec.params.width ?? 0;
  const widthY = sec.params.width_Y ?? sec.params.height ?? widthX;

  lines.push(
    `${indent(level)}<StbSecFoundation_RC id="${sectionId}" name="Foundation-RC-${sectionId}" strength_concrete="Fc21">`,
  );
  lines.push(`${indent(level + 1)}<StbSecFigureFoundation_RC>`);
  lines.push(
    `${indent(level + 2)}<StbSecFoundation_RC_Rect width_X="${widthX}" width_Y="${widthY}" depth="${depth}"/>`,
  );
  lines.push(`${indent(level + 1)}</StbSecFigureFoundation_RC>`);
  lines.push(`${indent(level + 1)}<StbSecBarArrangementFoundation_RC depth_cover_bottom="0.0"/>`);
  lines.push(`${indent(level)}</StbSecFoundation_RC>`);
}

function generateRcPileSection(lines, sectionId, sec, level) {
  const indent = (l) => '  '.repeat(l);
  const tagName = sec.pileTagName || 'StbSecPile_RC_Straight';
  const params = sec.params || {};
  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  lines.push(
    `${indent(level)}<StbSecPile_RC id="${sectionId}" name="${escXml(sec.name || `Pile-RC-${sectionId}`)}" strength_concrete="Fc21">`,
  );
  lines.push(`${indent(level + 1)}<StbSecFigurePile_RC>`);
  lines.push(
    `${indent(level + 2)}<${tagName}${paramStr ? ` ${paramStr}` : ''}/>`,
  );
  lines.push(`${indent(level + 1)}</StbSecFigurePile_RC>`);
  lines.push(`${indent(level)}</StbSecPile_RC>`);
}

function generateSteelPileSection(lines, sectionId, sec, element, level) {
  const indent = (l) => '  '.repeat(l);
  const segments = Array.isArray(sec.segments) ? sec.segments : [];
  const lengthPile = Number.isFinite(element?.lengthAll) ? element.lengthAll : 0;
  lines.push(
    `${indent(level)}<StbSecPile_S id="${sectionId}" name="${escXml(sec.name || `Pile-S-${sectionId}`)}">`,
  );
  lines.push(`${indent(level + 1)}<StbSecFigurePile_S>`);
  if (segments.length > 0) {
    for (const segment of segments) {
      lines.push(
        `${indent(level + 2)}<StbSecPile_S_Straight id_order="${segment.id_order}" length_pile="${segment.length_pile}" D="${segment.D}" t="${segment.t}" strength="${escXml(segment.strength || '')}"/>`,
      );
    }
  } else {
    lines.push(
      `${indent(level + 2)}<StbSecPile_S_Straight id_order="1" length_pile="${sec.params.length_pile ?? lengthPile}" D="${sec.params.D}" t="${sec.params.t}" strength=""/>`,
    );
  }
  lines.push(`${indent(level + 1)}</StbSecFigurePile_S>`);
  lines.push(`${indent(level)}</StbSecPile_S>`);
}

function generatePileProductSection(lines, sectionId, sec, level) {
  const indent = (l) => '  '.repeat(l);
  const segments = Array.isArray(sec.segments) ? sec.segments : [];

  lines.push(
    `${indent(level)}<StbSecPileProduct id="${sectionId}" name="${escXml(sec.name || `Pile-PC-${sectionId}`)}">`,
  );
  lines.push(`${indent(level + 1)}<StbSecFigurePileProduct>`);

  if (segments.length > 0) {
    for (const segment of segments) {
      const tagName = segment.tagName || 'StbSecPileProduct_PHC';
      const attrs = [`id_order="${segment.id_order}"`, `length_pile="${segment.length_pile}"`];

      if (/Nodular_.*PRC/i.test(tagName)) {
        attrs.push(`D1="${segment.D}"`, `D2="${segment.D}"`, `tc="${segment.t}"`);
      } else if (/Nodular_/i.test(tagName)) {
        attrs.push(`D1="${segment.D}"`, `D2="${segment.D}"`, `t="${segment.t}"`);
      } else if (/_ST$/i.test(tagName)) {
        attrs.push(`D1="${segment.D}"`, `D2="${segment.D}"`, `t1="${segment.t}"`, `t2="${segment.t}"`);
      } else if (/_SC$/i.test(tagName)) {
        attrs.push(`D="${segment.D}"`, `tc="${segment.t}"`, `ts="${segment.ts ?? 0}"`);
      } else if (/_PRC$/i.test(tagName) || /_CPRC$/i.test(tagName)) {
        attrs.push(`D="${segment.D}"`, `tc="${segment.t}"`);
      } else {
        attrs.push(`D="${segment.D}"`, `t="${segment.t}"`);
      }

      if (segment.kind) attrs.push(`kind="${escXml(segment.kind)}"`);
      lines.push(`${indent(level + 2)}<${tagName} ${attrs.join(' ')}/>`);
    }
  } else {
    lines.push(
      `${indent(level + 2)}<StbSecPileProduct_PHC id_order="1" length_pile="${sec.params.length_pile ?? 0}" D="${sec.params.D}" t="${sec.params.t ?? 0}"/>`,
    );
  }

  lines.push(`${indent(level + 1)}</StbSecFigurePileProduct>`);
  lines.push(`${indent(level)}</StbSecPileProduct>`);
}

function generateHaunchBeamFigure(lines, sec, haunch, level) {
  const indent = (l) => '  '.repeat(l);
  const h = haunch.sections;

  // TAPER: 2断面（始端・終端が異なる）
  if (haunch.pattern === 'TAPER') {
    // 始端と終端で名前を変えて出力
    const startName = h.start?.name || sec.name;
    const endName = h.end?.name || sec.name;
    lines.push(
      `${indent(level)}<StbSecSteelBeam_S_Haunch pos="START" shape="${escXml(startName)}"/>`,
    );
    lines.push(`${indent(level)}<StbSecSteelBeam_S_Haunch pos="END" shape="${escXml(endName)}"/>`);
    return;
  }

  // HAUNCH: 3断面（始端・中央・終端）
  // 中央断面は常にsecの名前を使用
  const centerShape = sec.name;

  // 始端が中央と異なるか
  const startDiffers = h.haunchStart > 0;
  // 終端が中央と異なるか
  const endDiffers = h.haunchEnd > 0;

  if (startDiffers || endDiffers) {
    lines.push(
      `${indent(level)}<StbSecSteelBeam_S_Haunch pos="START" shape="${escXml(startDiffers ? sec.name + '-H' : centerShape)}"/>`,
    );
    lines.push(
      `${indent(level)}<StbSecSteelBeam_S_Haunch pos="CENTER" shape="${escXml(centerShape)}"/>`,
    );
    lines.push(
      `${indent(level)}<StbSecSteelBeam_S_Haunch pos="END" shape="${escXml(endDiffers ? sec.name + '-H' : centerShape)}"/>`,
    );
  } else {
    lines.push(`${indent(level)}<StbSecSteelBeam_S_Same shape="${escXml(centerShape)}"/>`);
  }
}

/** XML特殊文字エスケープ */
function escXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
