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
  attrs += ` id_node_bottom="${el.nodeStart}" id_node_top="${el.nodeEnd}"`;
  if (el.sectionId) attrs += ` id_section="${el.sectionId}"`;
  attrs += ` kind_structure="${el.kindStructure || 'S'}"`;
  attrs += ` kind_pile="${el.kindPile || 'CAST_IN_PLACE'}"`;
  return attrs;
}

/**
 * フーチング要素の属性文字列
 */
function footingAttrs(el) {
  let attrs = ` id="${el.id}" name="${escXml(el.name || '')}"`;
  attrs += ` id_node="${el.nodeStart}"`;
  if (el.sectionId) attrs += ` id_section="${el.sectionId}"`;
  attrs += ` kind_structure="${el.kindStructure || 'RC'}"`;
  attrs += ` kind_footing="${el.kindFooting || 'SPREAD'}"`;
  return attrs;
}

/**
 * 基礎柱要素の属性文字列
 */
function foundationColumnAttrs(el) {
  let attrs = ` id="${el.id}" name="${escXml(el.name || '')}"`;
  attrs += ` id_node="${el.nodeStart}"`;
  if (el.sectionId) attrs += ` id_section_FD="${el.sectionId}"`;
  attrs += ` kind_structure="${el.kindStructure || 'RC'}"`;
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
  for (const usage of columnUsages) {
    const sec = sectionById.get(usage.sectionId);
    if (!sec) continue;
    lines.push(
      `${indent(level)}<StbSecColumn_S id="${usage.sectionId}" name="Column-S-${usage.sectionId}" floor="ALL">`,
    );
    lines.push(`${indent(level + 1)}<StbSecSteelFigureColumn_S>`);
    lines.push(
      `${indent(level + 2)}<StbSecSteelColumn_S_Same shape="${escXml(sec.name)}" direction_type="OTHER"/>`,
    );
    lines.push(`${indent(level + 1)}</StbSecSteelFigureColumn_S>`);
    lines.push(`${indent(level)}</StbSecColumn_S>`);
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
}

/**
 * ハンチ付き梁の断面図描写を生成
 * @param {string[]} lines
 * @param {Object} sec - 中央断面情報
 * @param {Object} haunch - ハンチ検出結果
 * @param {number} level - インデントレベル
 */
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
