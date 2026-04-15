/**
 * @fileoverview 鋼材図形抽出ヘルパー
 *
 * S造断面の図形バリアント、ベースプレート、オフセット等の
 * 抽出ロジックを提供します。
 * sectionExtractor.js から分離された専用モジュールです。
 *
 * @module common/stb/parser/steelFigureExtractors
 */

import { SectionShapeProcessor } from './SectionShapeProcessor.js';

// STB 名前空間（querySelector がヒットしない場合にフォールバック）
const STB_NS = 'https://www.building-smart.or.jp/dl';

export function extractSteelFigureVariants(element, config) {
  if (!config.steelFigures || config.steelFigures.length === 0) {
    // フォールバック: 直接子要素から多断面パターンを検索
    const processor = new SectionShapeProcessor(element);
    return processor.expandSteelFigure();
  }

  for (const figureSelector of config.steelFigures) {
    const figureElement = findFigureElement(element, figureSelector);
    if (!figureElement) continue;
    const processor = new SectionShapeProcessor(figureElement);
    const expanded = processor.expandSteelFigure();
    if (expanded) {
      return expanded;
    }
  }

  // フォールバック: Figure要素が見つからない場合、element自体を直接調査
  // (STB v2.0.2では多断面要素がFigure要素でラップされていない場合がある)
  const processor = new SectionShapeProcessor(element);
  return processor.expandSteelFigure();
}

export function findFigureElement(element, selector) {
  if (!element) return null;
  let figureElement = null;
  if (typeof element.querySelector === 'function') {
    try {
      figureElement = element.querySelector(selector);
    } catch (_) {
      figureElement = null;
    }
    if (figureElement) return figureElement;
  }
  if (typeof element.getElementsByTagNameNS === 'function') {
    const nsList = element.getElementsByTagNameNS(STB_NS, selector);
    if (nsList && nsList.length) {
      return nsList[0];
    }
  }
  const children = element.children || [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName === selector || children[i].localName === selector) {
      return children[i];
    }
  }
  return null;
}

export function findFirstShapeElement(root) {
  if (!root) return null;
  const children = root.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.hasAttribute && child.hasAttribute('shape')) {
      return child;
    }
    const nested = findFirstShapeElement(child);
    if (nested) return nested;
  }
  return null;
}

/**
 * 断面データに mode と shapes フィールドを正規化して追加
 * 多断面ジオメトリ生成に必要な構造を提供する
 *
 * @param {Object} sectionData - 断面データオブジェクト（変更される）
 * @param {Object} steelFigureInfo - SectionShapeProcessor からの出力
 */
export function normalizeSectionMode(sectionData, steelFigureInfo) {
  if (!steelFigureInfo) return;

  const { same, notSame, beamMultiSection } = steelFigureInfo;

  // 1断面: Same が存在する
  if (same) {
    sectionData.mode = 'single';
    sectionData.shapes = [
      {
        pos: 'SAME',
        shapeName: same.shape,
        variant: same,
      },
    ];
    return;
  }

  // 多断面: 梁の特殊パターン (Haunch, Joint, FiveTypes)
  if (beamMultiSection && beamMultiSection.length >= 2) {
    sectionData.mode = beamMultiSection.length === 2 ? 'double' : 'multi';
    sectionData.shapes = beamMultiSection.map((variant) => ({
      pos: variant.position || variant.pos || 'CENTER',
      shapeName: variant.shape,
      variant: variant,
    }));
    // ハンチ等の種別を記録
    if (beamMultiSection[0]?.sourceTag) {
      sectionData.multiSectionType = beamMultiSection[0].sourceTag;
    }
    return;
  }

  // 多断面: NotSame が 2個以上
  if (notSame && notSame.length >= 2) {
    // 2断面 or 3+断面
    sectionData.mode = notSame.length === 2 ? 'double' : 'multi';
    sectionData.shapes = notSame.map((variant) => ({
      pos: variant.position || variant.pos || 'UNKNOWN',
      shapeName: variant.shape,
      variant: variant,
    }));
    return;
  }

  // 単一の多断面要素（通常はありえないが、念のため）
  if (beamMultiSection && beamMultiSection.length === 1) {
    sectionData.mode = 'single';
    sectionData.shapes = [
      {
        pos: beamMultiSection[0].position || beamMultiSection[0].pos || 'CENTER',
        shapeName: beamMultiSection[0].shape,
        variant: beamMultiSection[0],
      },
    ];
    return;
  }

  // NotSame が 1個のみ（通常はありえないが、念のため）
  if (notSame && notSame.length === 1) {
    sectionData.mode = 'single';
    sectionData.shapes = [
      {
        pos: notSame[0].position || notSame[0].pos || 'SAME',
        shapeName: notSame[0].shape,
        variant: notSame[0],
      },
    ];
    return;
  }

  // デフォルト: mode を明示的に single に設定
  if (!sectionData.mode) {
    sectionData.mode = 'single';
  }
}

// ==================== ベースプレート（柱脚）データ抽出 ====================

/**
 * ベースプレートデータを抽出（STB 2.0.2 / 2.1.0 両対応）
 *
 * S造・SRC造・CFT造の柱断面に付属するベースプレート情報を読み取る。
 * Conventional（在来型）のみプレート寸法を保持。Product（既製品）は型番のみで寸法なし。
 *
 * v2.0.2: StbSecBaseConventional_S / _SRC / _CFT > *_Plate
 * v2.1.0: StbSecBaseConventional > StbSecBaseConventionalPlate
 *
 * @param {Element} element - 柱断面のDOM要素（StbSecColumn_S / _SRC / _CFT）
 * @param {Object} config - 断面抽出設定
 * @returns {Object|null} ベースプレートデータまたはnull
 */
export function extractBasePlateData(element, config) {
  // base_type属性を鋼材図形要素から取得（メタデータとして保持）
  const baseType = extractBaseType(element, config);

  // Conventionalベースプレートを検索
  // base_type="NONE" でもStbSecBaseConventional要素が存在する場合があるため、
  // 要素の存在を優先して判定する
  // v2.1.0 統一形式 → v2.0.2 タイプ別形式 の順に検索
  const conventionalSelectors = [
    'StbSecBaseConventional', // v2.1.0
    'StbSecBaseConventional_S', // v2.0.2 S造
    'StbSecBaseConventional_SRC', // v2.0.2 SRC造
    'StbSecBaseConventional_CFT', // v2.0.2 CFT造
  ];

  for (const convSel of conventionalSelectors) {
    const conventionalEl = findFigureElement(element, convSel);
    if (!conventionalEl) continue;

    // プレート要素名を決定
    const plateSel =
      convSel === 'StbSecBaseConventional'
        ? 'StbSecBaseConventionalPlate' // v2.1.0
        : `${convSel}_Plate`; // v2.0.2: _S_Plate / _SRC_Plate / _CFT_Plate

    const plateEl = findFigureElement(conventionalEl, plateSel);
    if (!plateEl) continue;

    const B_X = parseFloat(plateEl.getAttribute('B_X'));
    const B_Y = parseFloat(plateEl.getAttribute('B_Y'));
    const t = parseFloat(plateEl.getAttribute('t'));

    // 必須寸法チェック
    if (!B_X || !B_Y || !t) continue;

    return {
      baseType: baseType || 'CONVENTIONAL',
      B_X,
      B_Y,
      t,
      C1_X: parseFloat(plateEl.getAttribute('C1_X')) || 0,
      C1_Y: parseFloat(plateEl.getAttribute('C1_Y')) || 0,
      C2_X: parseFloat(plateEl.getAttribute('C2_X')) || 0,
      C2_Y: parseFloat(plateEl.getAttribute('C2_Y')) || 0,
      C3_X: parseFloat(plateEl.getAttribute('C3_X')) || 0,
      C3_Y: parseFloat(plateEl.getAttribute('C3_Y')) || 0,
      C4_X: parseFloat(plateEl.getAttribute('C4_X')) || 0,
      C4_Y: parseFloat(plateEl.getAttribute('C4_Y')) || 0,
      offset_X: parseFloat(plateEl.getAttribute('offset_X')) || 0,
      offset_Y: parseFloat(plateEl.getAttribute('offset_Y')) || 0,
      strength: plateEl.getAttribute('strength') || '',
      height_mortar: parseFloat(conventionalEl.getAttribute('height_mortar')) || 0,
    };
  }

  return null;
}

/**
 * 鋼材図形要素からbase_type属性を取得
 * @param {Element} element - 柱断面のDOM要素
 * @param {Object} config - 断面抽出設定（steelFigures配列を含む）
 * @returns {string|null} base_type値（NONE/EXPOSE/EMBEDDED/WRAP）またはnull
 */
export function extractBaseType(element, config) {
  const steelFigureSelectors = config.steelFigures || [];
  for (const sel of steelFigureSelectors) {
    const figEl = findFigureElement(element, sel);
    if (figEl) {
      const bt = figEl.getAttribute('base_type');
      if (bt) return bt;
    }
  }
  return null;
}

/**
 * SRC造梁の鋼材図形要素からoffset/levelを抽出
 * STB仕様:
 *   offset = 鉄骨ウェブ芯までの距離（RC梁芯基準で水平方向）
 *   level = 鉄骨天端までの距離（RC梁天端基準で下方向）
 * これらが指定されていない場合、断面の芯が一致することを意味する
 *   → S梁天端はRC梁天端より(RC梁せい-S梁せい)/2だけ下がる
 *
 * @param {Element} element - 梁断面のDOM要素（StbSecBeam_SRC / StbSecGirder_SRC）
 * @param {Object} config - 断面抽出設定
 * @returns {Object|null} {offset: number|null, level: number|null} またはnull
 */
export function extractSteelFigureOffsetLevel(element, config) {
  // SRC造梁の場合のみ処理
  const tagName = element.tagName || element.localName;
  if (!/^StbSec(?:Beam|Girder)_SRC$/i.test(tagName)) {
    return null;
  }

  // 鋼材図形要素を取得
  const steelFigureSelectors = config.steelFigures || [];
  for (const sel of steelFigureSelectors) {
    const figEl = findFigureElement(element, sel);
    if (!figEl) continue;

    const offset = figEl.getAttribute('offset');
    const level = figEl.getAttribute('level');

    // 両方ともnullの場合はnullを返す（デフォルト動作）
    // いずれか一つでも指定されていればオブジェクトを返す
    if (offset === null && level === null) {
      continue;
    }

    const result = {};
    if (offset !== null) {
      const offsetVal = parseFloat(offset);
      result.offset = isFinite(offsetVal) ? offsetVal : null;
    }
    if (level !== null) {
      const levelVal = parseFloat(level);
      result.level = isFinite(levelVal) ? levelVal : null;
    }

    if (Object.keys(result).length > 0) {
      return result;
    }
  }

  return null;
}
