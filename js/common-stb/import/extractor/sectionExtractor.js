/**
 * @fileoverview 統一断面抽出エンジン
 *
 * 設定駆動による統一的な断面データ抽出機能を提供します。
 * 従来の個別関数（extractColumnSections等）を統合し、
 * 重複コードを排除した効率的な実装を実現します。
 *
 * @module common/stb/parser/sectionExtractor
 */

import { deriveDimensionsFromAttributes } from '../../data/dimensionNormalizer.js';
import { resolveGeometryProfileTypeInPlace } from '../../section/sectionTypeUtil.js';
import { SectionShapeProcessor } from './SectionShapeProcessor.js';
import { SECTION_CONFIG } from '../../section/sectionConfig.js';

// STB 名前空間（querySelector がヒットしない場合にフォールバック）
const STB_NS = 'https://www.building-smart.or.jp/dl';

// プロジェクト固有の設定とロガーを直接使用
const _sectionConfig = SECTION_CONFIG;
const _logger = {
  log: () => {},
  debug: () => {},
  warn: console.warn,
  error: console.error,
};

/**
 * 全要素タイプの断面データを一括抽出
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @returns {Object} 全断面データマップ {columnSections: Map, girderSections: Map, beamSections: Map, braceSections: Map}
 */
export function extractAllSections(xmlDoc) {
  if (!xmlDoc) {
    _logger.warn('[Data] 断面抽出: XMLドキュメントが未定義です');
    return createEmptyResult();
  }

  const result = {};

  // 設定に基づいて各要素タイプを処理
  Object.entries(_sectionConfig).forEach(([elementType, config]) => {
    const sectionKey = `${elementType.toLowerCase()}Sections`;
    result[sectionKey] = extractSectionsByType(xmlDoc, elementType, config);
  });

  logExtractionResults(result);
  return result;
}

/**
 * 指定要素タイプの断面データを抽出
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {string} elementType - 要素タイプ
 * @param {Object} config - 抽出設定
 * @returns {Map} 断面データマップ
 */
function extractSectionsByType(xmlDoc, elementType, config) {
  const sections = new Map();

  try {
    // 設定されたセレクターで要素を取得
    const elements = [];
    for (const sel of config.selectors) {
      let nodeList = [];
      try {
        nodeList = xmlDoc.querySelectorAll(sel);
      } catch (_) {
        nodeList = [];
      }
      if (!nodeList || nodeList.length === 0) {
        // 名前空間フォールバック
        if (typeof xmlDoc.getElementsByTagNameNS === 'function') {
          const nsNodes = xmlDoc.getElementsByTagNameNS(STB_NS, sel);
          for (let i = 0; i < nsNodes.length; i++) elements.push(nsNodes[i]);
          if (nsNodes.length > 0) {
            _logger.debug(
              `[${elementType}] Found ${nsNodes.length} elements via getElementsByTagNameNS for selector: ${sel}`,
            );
          }
          continue;
        }
      }
      // 通常経路
      if (nodeList && nodeList.forEach) {
        if (nodeList.length > 0) {
          _logger.debug(
            `[${elementType}] Found ${nodeList.length} elements via querySelectorAll for selector: ${sel}`,
          );
        }
        nodeList.forEach((el) => elements.push(el));
      }
    }

    if (elements.length === 0) {
      _logger.warn(
        `[${elementType}] No elements found for any selector. Selectors: ${config.selectors.join(', ')}`,
      );
    }

    let filteredCount = 0;
    let extractedCount = 0;

    elements.forEach((element) => {
      const elementId = element.getAttribute('id');
      const tagName = element.tagName || element.localName;

      // attributeFilter が設定されている場合、フィルタリングを適用
      if (config.attributeFilter) {
        // skipFilterForTags に含まれるタグはフィルターをスキップ
        const shouldSkipFilter =
          config.skipFilterForTags && config.skipFilterForTags.includes(tagName);

        // isFoundation="true" の基礎梁もフィルターをスキップ（kind_beam属性を持たないため）
        const isFoundation = element.getAttribute('isFoundation') === 'true';

        if (!shouldSkipFilter && !isFoundation) {
          let matches = true;
          for (const [attr, value] of Object.entries(config.attributeFilter)) {
            const attrValue = element.getAttribute(attr);
            // 属性が存在しない場合
            if (attrValue === null) {
              // skipFilterIfAttributeMissingが設定されていればマッチとみなす
              if (!config.skipFilterIfAttributeMissing) {
                matches = false;
              }
              continue;
            }
            // 属性が存在し、値が異なる場合は不一致
            if (attrValue !== value) {
              matches = false;
              break;
            }
          }
          if (!matches) {
            filteredCount++;
            if (elementId === '51' && elementType === 'Girder') {
              _logger.debug(
                `[${elementType}] Filtering out ${tagName} id="${elementId}" (kind_beam="${element.getAttribute('kind_beam')}" does not match filter)`,
              );
            }
            return; // フィルタに一致しない要素はスキップ
          }
        }
      }

      const sectionData = extractSectionData(element, config);
      if (sectionData && sectionData.id) {
        sections.set(sectionData.id, sectionData);
        extractedCount++;
        if (sectionData.id === 51 && elementType === 'Girder') {
          _logger.debug(
            `[${elementType}] Successfully extracted section id="${sectionData.id}" from ${tagName}`,
          );
        }
      }
    });

    if (elementType === 'Girder') {
      _logger.debug(
        `[${elementType}] Summary: extracted=${extractedCount}, filtered=${filteredCount}, total=${sections.size}`,
      );
    }
  } catch (error) {
    _logger.error(`Error extracting ${elementType} sections:`, error);
  }

  return sections;
}

/**
 * 単一要素から断面データを抽出
 * @param {Element} element - DOM要素
 * @param {Object} config - 抽出設定
 * @returns {Object|null} 断面データまたはnull
 */
function extractSectionData(element, config) {
  const idAttr = element.getAttribute('id');
  const name = element.getAttribute('name');
  const idSteel = element.getAttribute('id_steel');
  const steelFigureInfo = extractSteelFigureVariants(element, config);

  // ID必須チェック
  if (!idAttr) {
    _logger.warn(`[Data] 断面: ID属性が不足 (tag=${element.tagName})`);
    return null;
  }

  // STB仕様: IDは整数として扱う。ただし数値でない場合は文字列として保持
  const parsedId = parseInt(idAttr, 10);
  const id = isNaN(parsedId) ? idAttr : parsedId;

  const sectionData = {
    id: id,
    name: name,
    sectionType: element.tagName,
    shapeName:
      (steelFigureInfo?.primaryShape || steelFigureInfo?.fallbackShape || null) ??
      extractShapeName(element, config),
  };

  if (idSteel) {
    sectionData.id_steel = idSteel;
    if (!sectionData.shapeName) sectionData.shapeName = idSteel;
  }

  // S造・SRC造柱のisReferenceDirection属性を読み込む
  // （鋼材の基準方向に対する配置を示す: true=基準方向、false=90度回転）
  if (element.tagName === 'StbSecColumn_S' || element.tagName === 'StbSecColumn_SRC') {
    const isRefDir = element.getAttribute('isReferenceDirection');
    // デフォルト値はtrue（XSDスキーマに従う）
    sectionData.isReferenceDirection = isRefDir === null || isRefDir === 'true';
  }

  if (steelFigureInfo) {
    if (steelFigureInfo.variants && steelFigureInfo.variants.length > 0) {
      sectionData.steelVariants = steelFigureInfo.variants;
    }
    if (steelFigureInfo.same || (steelFigureInfo.notSame && steelFigureInfo.notSame.length > 0)) {
      sectionData.sameNotSamePattern = {
        hasSame: Boolean(steelFigureInfo.same),
        notSameCount: steelFigureInfo.notSame.length,
      };
    }

    // 多断面ジオメトリ対応: mode と shapes フィールドを正規化
    normalizeSectionMode(sectionData, steelFigureInfo);

    // S造断面の寸法をdimensionsに追加
    const steelDims = extractSteelDimensions(steelFigureInfo);
    if (steelDims && Object.keys(steelDims).length > 0) {
      sectionData.dimensions = {
        ...(sectionData.dimensions || {}),
        ...steelDims,
      };

      // SRC造の場合に備えて、RC寸法で上書きされる前の鉄骨プロファイル情報を保存
      // S部分メッシュの生成に使用する（H鋼断面等）
      sectionData.steelProfile = {
        section_type: steelDims.profile_hint || null,
        dimensions: { ...steelDims },
      };

      // クロスH断面フラグ（shape_X / shape_Y を持つSRC造柱専用断面）
      if (steelDims.profile_hint === 'CROSS_H') {
        sectionData.isCrossH = true;
      }
    }
  }

  // RC / SRC / CFT などコンクリート図形寸法の抽出
  // SRC造では鉄骨寸法とマージされるため、クリーンなコンクリート寸法を別途保持する
  let concreteDimsClean = null;
  try {
    concreteDimsClean = extractConcreteDimensions(element, config);
    if (concreteDimsClean) {
      sectionData.dimensions = {
        ...(sectionData.dimensions || {}),
        ...concreteDimsClean,
      };

      // 断面タイプの推定（RC円形の優先、次にRC矩形のデフォルト）
      if (concreteDimsClean.profile_hint === 'CIRCLE') {
        sectionData.section_type = 'CIRCLE';
      } else if (!sectionData.section_type && /_RC$/i.test(element.tagName)) {
        sectionData.section_type = 'RECTANGLE';
      }

      // RC等でsteel形状が無い場合、寸法から形状名を補完
      if (!sectionData.shapeName) {
        const d = concreteDimsClean.diameter || concreteDimsClean.outer_diameter;
        if (d) {
          sectionData.shapeName = `CIRCLE_D${d}`;
        } else {
          const w =
            concreteDimsClean.width ||
            concreteDimsClean.outer_width ||
            concreteDimsClean.overall_width;
          const h =
            concreteDimsClean.height || concreteDimsClean.overall_depth || concreteDimsClean.depth;
          if (w && h) {
            sectionData.shapeName = `RECT_${w}x${h}`;
          } else if (w) {
            sectionData.shapeName = `RECT_W${w}`;
          } else if (h) {
            sectionData.shapeName = `RECT_H${h}`;
          }
        }
      }
    }
  } catch (e) {
    _logger.warn(`[Data] 断面: コンクリート寸法解析失敗 (id=${id})`, e);
  }

  // 鋼管杭(StbSecPile_S)の寸法抽出
  // 複数セグメントのlength_pileを合計して総杭長を計算
  try {
    const steelPileDims = extractSteelPileDimensions(element, config);
    if (steelPileDims) {
      sectionData.dimensions = {
        ...(sectionData.dimensions || {}),
        ...steelPileDims,
      };

      // 断面タイプを設定
      if (steelPileDims.profile_hint === 'CIRCLE') {
        sectionData.section_type = 'CIRCLE';
      }

      // shapeName を設定
      if (!sectionData.shapeName && steelPileDims.D) {
        sectionData.shapeName = `PIPE_D${steelPileDims.D}`;
      }
    }
  } catch (e) {
    _logger.warn(`[Data] 断面: 鋼管杭寸法解析失敗 (id=${id})`, e);
  }

  // 既製杭(StbSecPileProduct)の寸法抽出
  // PHC杭、SC杭、CPRC杭、節杭などの複数セグメントからlength_pileを合計
  try {
    const pileProductDims = extractPileProductDimensions(element, config);
    if (pileProductDims) {
      sectionData.dimensions = {
        ...(sectionData.dimensions || {}),
        ...pileProductDims,
      };

      // 断面タイプを設定
      if (pileProductDims.profile_hint === 'CIRCLE') {
        sectionData.section_type = 'CIRCLE';
      }

      // shapeName を設定
      if (!sectionData.shapeName && pileProductDims.D) {
        sectionData.shapeName = `PHC_D${pileProductDims.D}`;
      }
    }
  } catch (e) {
    _logger.warn(`[Data] 断面: 既製杭寸法解析失敗 (id=${id})`, e);
  }

  // 断面タイプの正規化（section_type, profile_type, sectionType の統一）
  resolveGeometryProfileTypeInPlace(sectionData);

  // SRC造の判定とフラグ設定
  const isSRC = /_SRC$/i.test(element.tagName);
  if (isSRC) {
    sectionData.isSRC = true;

    // RC部分の寸法を明示的に格納（SRC複合ジオメトリ生成用）
    // クリーンなコンクリート寸法（鉄骨寸法とマージ前）を使用して
    // 鉄骨の width/height が混入するのを防止する
    const rcSource = concreteDimsClean || sectionData.dimensions;
    if (rcSource) {
      const rcProfileType = rcSource.profile_hint === 'CIRCLE' ? 'CIRCLE' : 'RECTANGLE';
      sectionData.concreteProfile = {
        // 柱・ポスト用（width_X, width_Y）
        width_X: rcSource.width_X,
        width_Y: rcSource.width_Y,
        // 梁用（幅・せい）— コンクリート固有の属性を優先し、鉄骨値の混入を防ぐ
        width: rcSource.width_X || rcSource.outer_width || rcSource.width,
        height: rcSource.width_Y || rcSource.overall_depth || rcSource.depth || rcSource.height,
        // 円形断面用
        diameter: rcSource.diameter || rcSource.D,
        // プロファイルタイプ（矩形 or 円形）
        profileType: rcProfileType,
      };

      // SRC造の外形ジオメトリはRC部分で生成するため、
      // section_type をRC型に強制設定（鉄骨の profile_hint が優先されるのを防止）
      sectionData.section_type = rcProfileType;

      // dimensions の width/height もRC寸法で上書きし、
      // RECTANGLE プロファイル生成時に鉄骨寸法が使われるのを防止する
      if (sectionData.dimensions) {
        const rcWidth = sectionData.concreteProfile.width;
        const rcHeight = sectionData.concreteProfile.height;
        if (rcWidth) {
          sectionData.dimensions.width = rcWidth;
          sectionData.dimensions.outer_width = rcWidth;
        }
        if (rcHeight) {
          sectionData.dimensions.height = rcHeight;
          sectionData.dimensions.outer_height = rcHeight;
        }
        // profile_hint もRC型に統一
        sectionData.dimensions.profile_hint = rcProfileType;
      }
    }

    // SRC造梁の鋼材図形からoffset/levelを抽出
    // STB仕様:
    //   offset = 鉄骨ウェブ芯までの距離（RC梁芯基準で水平方向）
    //   level = 鉄骨天端までの距離（RC梁天端基準で下方向）
    // これらが指定されていない場合、断面の芯が一致することを意味する
    //   → S梁天端はRC梁天端より(RC梁せい-S梁せい)/2だけ下がる
    try {
      const steelFigureOffset = extractSteelFigureOffsetLevel(element, config);
      if (steelFigureOffset) {
        sectionData.steelFigureOffset = steelFigureOffset;
      }
    } catch (e) {
      _logger.warn(`[Data] SRC造断面: offset/level抽出失敗 (id=${id})`, e);
    }
  }

  // ベースプレート（柱脚）データの抽出
  // S造・SRC造・CFT造の柱断面に付属するベースプレート情報を読み取る
  try {
    const basePlateData = extractBasePlateData(element, config);
    if (basePlateData) {
      sectionData.basePlate = basePlateData;
    }
  } catch (e) {
    _logger.warn(`[Data] 断面: ベースプレートデータ解析失敗 (id=${id})`, e);
  }

  return sectionData;
}

/**
 * 要素から形状名を抽出
 * @param {Element} element - DOM要素
 * @param {Object} config - 抽出設定
 * @returns {string|null} 形状名またはnull
 */
function extractShapeName(element, config) {
  // 鋼材図形から形状名を抽出
  if (config.steelFigures) {
    for (const figureSelector of config.steelFigures) {
      const figureElement = findFigureElement(element, figureSelector);
      if (figureElement) {
        const shapeElement =
          (typeof figureElement.querySelector === 'function' &&
            figureElement.querySelector('*[shape]')) ||
          findFirstShapeElement(figureElement);
        if (shapeElement) {
          return shapeElement.getAttribute('shape');
        }
      }
    }
  }

  return null;
}

/**
 * 空の結果オブジェクトを作成
 * @returns {Object} 空の断面マップ
 */
function createEmptyResult() {
  const result = {};
  Object.keys(_sectionConfig).forEach((elementType) => {
    const sectionKey = `${elementType.toLowerCase()}Sections`;
    result[sectionKey] = new Map();
  });
  return result;
}

/**
 * 抽出結果をログ出力
 * @param {Object} result - 抽出結果
 */
function logExtractionResults(result) {
  const summary = Object.entries(result)
    .map(([key, sections]) => `${key}: ${sections.size}`)
    .join(', ');

  _logger.log(`Extracted sections - ${summary}`);
}

// ---------------- 追加ヘルパー: S造断面寸法抽出 ----------------
/**
 * steelFigureInfoからS造断面の寸法を抽出
 * @param {Object} steelFigureInfo - SectionShapeProcessorからの出力
 * @returns {Object|null} 寸法オブジェクト {H, A, B, t1, t2, r, ...}
 */
function extractSteelDimensions(steelFigureInfo) {
  if (!steelFigureInfo) return null;

  // クロスH断面（shape_X / shape_Y）の場合は専用処理
  if (steelFigureInfo.crossH) {
    const { shapeX, shapeY } = steelFigureInfo.crossH;
    return {
      profile_hint: 'CROSS_H',
      crossH_shapeX: shapeX,
      crossH_shapeY: shapeY || shapeX,
    };
  }

  // 優先順位: same > notSame[0] > beamMultiSection[0] > variants[0]
  let sourceVariant = null;

  if (steelFigureInfo.same) {
    sourceVariant = steelFigureInfo.same;
  } else if (steelFigureInfo.notSame && steelFigureInfo.notSame.length > 0) {
    sourceVariant = steelFigureInfo.notSame[0];
  } else if (steelFigureInfo.beamMultiSection && steelFigureInfo.beamMultiSection.length > 0) {
    sourceVariant = steelFigureInfo.beamMultiSection[0];
  } else if (steelFigureInfo.variants && steelFigureInfo.variants.length > 0) {
    sourceVariant = steelFigureInfo.variants[0];
  }

  if (!sourceVariant) return null;

  const dims = {};

  // 鋼材寸法の標準属性名
  const steelAttrs = ['H', 'A', 'B', 't1', 't2', 'r', 'D', 'd', 't'];

  // 属性はsourceVariant.attributesに格納されている
  const attrSource = sourceVariant.attributes || sourceVariant;

  for (const attr of steelAttrs) {
    if (attrSource[attr] !== undefined) {
      const val = parseFloat(attrSource[attr]);
      if (isFinite(val)) {
        dims[attr] = val;
      }
    }
  }

  // 形状タイプからプロファイルヒントを設定
  if (sourceVariant.shape) {
    const shapeName = sourceVariant.shape.toUpperCase();
    if (shapeName.includes('H-') || shapeName.startsWith('H ') || /^H\d/.test(shapeName)) {
      dims.profile_hint = 'H';
    } else if (
      shapeName.includes('BOX') ||
      shapeName.includes('□') ||
      shapeName.includes('BCP') ||
      shapeName.includes('BCR')
    ) {
      dims.profile_hint = 'BOX';
    } else if (shapeName.includes('PIPE') || shapeName.includes('○') || shapeName.includes('STK')) {
      dims.profile_hint = 'PIPE';
    } else if (shapeName.includes('[-') || shapeName.startsWith('C ') || /^C\d/.test(shapeName)) {
      dims.profile_hint = 'C';
    } else if (shapeName.includes('L-') || shapeName.startsWith('L ') || /^L\d/.test(shapeName)) {
      dims.profile_hint = 'L';
    } else if (shapeName.includes('T-') || /^(T|CT)\d/.test(shapeName)) {
      dims.profile_hint = 'T';
    } else if (
      shapeName.includes('FB-') ||
      shapeName.startsWith('FB ') ||
      /^FB\d/.test(shapeName)
    ) {
      dims.profile_hint = 'FB';
    } else if (
      shapeName.includes('RB-') ||
      shapeName.startsWith('RB ') ||
      /^RB\d/.test(shapeName)
    ) {
      dims.profile_hint = 'CIRCLE';
    }
  }

  // H形鋼の場合、幅と高さを設定
  if (dims.H && dims.B) {
    // H形鋼: H=せい、B=フランジ幅
    dims.height = dims.H;
    dims.width = dims.B;
  } else if (dims.A && dims.B) {
    // 角形鋼管など: A=せい、B=幅
    dims.height = dims.A;
    dims.width = dims.B;
  } else if (dims.D) {
    // 円形鋼管: D=直径
    dims.diameter = dims.D;
  } else if (dims.d) {
    dims.diameter = dims.d;
  }

  // 属性から寸法が取れなかった場合、shape名から解析
  if (!dims.width && !dims.height && !dims.diameter && sourceVariant.shape) {
    const parsedDims = parseDimensionsFromShapeName(sourceVariant.shape);
    if (parsedDims) {
      Object.assign(dims, parsedDims);
    }
  }

  return Object.keys(dims).length > 0 ? dims : null;
}

/**
 * 形状名から寸法を解析
 * 例: "H-250x250x9x14x13", "□-400x400x22x66", "P-100x10"
 * @param {string} shapeName - 形状名
 * @returns {Object|null} 寸法オブジェクト
 */
function parseDimensionsFromShapeName(shapeName) {
  if (!shapeName) return null;

  const dims = {};

  // 数値部分を抽出（-の後の数値をxで分割）
  const match = shapeName.match(/[-]?([\d.]+(?:x[\d.]+)*)/);
  if (!match) return null;

  const numbers = match[1]
    .split('x')
    .map((n) => parseFloat(n))
    .filter((n) => isFinite(n));
  if (numbers.length === 0) return null;

  const upperName = shapeName.toUpperCase();

  // H形鋼: H-HxBxt1xt2xr
  if (upperName.startsWith('H-') || upperName.startsWith('H ') || /^H\d/.test(upperName)) {
    if (numbers.length >= 2) {
      dims.H = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t1 = numbers[2];
      if (numbers[3]) dims.t2 = numbers[3];
      if (numbers[4]) dims.r = numbers[4];
      dims.profile_hint = 'H';
    }
  }
  // 角形鋼管: □-AxBxtxr or BCP/BCR-AxBxt
  else if (
    upperName.includes('□') ||
    upperName.includes('BCP') ||
    upperName.includes('BCR') ||
    upperName.includes('BOX')
  ) {
    if (numbers.length >= 2) {
      dims.A = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t = numbers[2];
      if (numbers[3]) dims.r = numbers[3];
      dims.profile_hint = 'BOX';
    } else if (numbers.length === 1) {
      // 正方形の場合
      dims.A = numbers[0];
      dims.B = numbers[0];
      dims.height = numbers[0];
      dims.width = numbers[0];
      dims.profile_hint = 'BOX';
    }
  }
  // 円形鋼管: P-Dxt or ○-Dxt or STK-Dxt
  else if (
    upperName.startsWith('P-') ||
    upperName.startsWith('P ') ||
    upperName.includes('○') ||
    upperName.includes('STK')
  ) {
    if (numbers.length >= 1) {
      dims.D = numbers[0];
      dims.diameter = numbers[0];
      if (numbers[1]) dims.t = numbers[1];
      dims.profile_hint = 'PIPE';
    }
  }
  // C形鋼: [-HxBxt1xt2
  else if (upperName.includes('[-') || upperName.startsWith('C-') || upperName.startsWith('C ')) {
    if (numbers.length >= 2) {
      dims.H = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t1 = numbers[2];
      if (numbers[3]) dims.t2 = numbers[3];
      dims.profile_hint = 'C';
    }
  }
  // L形鋼: L-AxBxt
  else if (upperName.startsWith('L-') || upperName.startsWith('L ')) {
    if (numbers.length >= 2) {
      dims.A = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t = numbers[2];
      dims.profile_hint = 'L';
    }
  }
  // T形鋼やCT形鋼
  else if (upperName.startsWith('T-') || upperName.startsWith('CT-')) {
    if (numbers.length >= 2) {
      dims.H = numbers[0];
      dims.B = numbers[1];
      dims.height = numbers[0];
      dims.width = numbers[1];
      if (numbers[2]) dims.t1 = numbers[2];
      if (numbers[3]) dims.t2 = numbers[3];
      dims.profile_hint = 'T';
    }
  }
  // フラットバー（平鋼）: FB-Bxt
  else if (upperName.startsWith('FB-') || upperName.startsWith('FB ')) {
    if (numbers.length >= 2) {
      dims.B = numbers[0];
      dims.t = numbers[1];
      dims.width = numbers[0];
      dims.thickness = numbers[1];
      dims.profile_hint = 'FB';
    } else if (numbers.length === 1) {
      dims.B = numbers[0];
      dims.width = numbers[0];
      dims.profile_hint = 'FB';
    }
  }
  // 丸鋼（中実円）: RB-D
  else if (upperName.startsWith('RB-') || upperName.startsWith('RB ')) {
    if (numbers.length >= 1) {
      dims.D = numbers[0];
      dims.diameter = numbers[0];
      dims.profile_hint = 'CIRCLE';
    }
  }
  // 不明な形式でも数値があれば設定
  else if (numbers.length >= 2) {
    dims.height = numbers[0];
    dims.width = numbers[1];
  } else if (numbers.length === 1) {
    dims.diameter = numbers[0];
  }

  return Object.keys(dims).length > 0 ? dims : null;
}

// ---------------- 追加ヘルパー: コンクリート図形寸法抽出 ----------------
function extractConcreteDimensions(element, config) {
  if (!config.concreteFigures || config.concreteFigures.length === 0) return null;
  let dims = null;
  for (const figSel of config.concreteFigures) {
    let fig = null;
    try {
      fig = element.querySelector(figSel);
    } catch (_) {
      fig = null;
    }
    if (!fig && typeof element.getElementsByTagNameNS === 'function') {
      const nsList = element.getElementsByTagNameNS(STB_NS, figSel);
      fig = nsList && nsList[0];
    }
    if (!fig) {
      // タグ名で直接検索を試みる（querySelector が失敗する場合のフォールバック）
      const children = element.children || element.childNodes || [];
      for (let i = 0; i < children.length; i++) {
        if (children[i].tagName === figSel || children[i].localName === figSel) {
          fig = children[i];
          break;
        }
      }
    }
    if (!fig) continue;
    // 子要素内の shape を持つもの or 寸法属性を持つものを調査
    const candidates = Array.from(fig.children || []);
    for (const c of candidates) {
      const d = deriveDimensionsFromAttributes(c.attributes);
      if (d) {
        // 円/矩形のヒントをタグ名から付与
        if (/Circle/i.test(c.tagName)) d.profile_hint = 'CIRCLE';
        if (/Rect/i.test(c.tagName)) d.profile_hint = d.profile_hint || 'RECTANGLE';

        // 杭の直杭(Straight)で直径がある場合は円形プロファイル
        // StbSecPile_RC_Straightは名前にCircleを含まないが円形断面
        if (/Straight/i.test(c.tagName) && (d.diameter || d.D)) {
          d.profile_hint = d.profile_hint || 'CIRCLE';
        }

        // 拡底杭タイプをタグ名から判定
        const pileTypeFromTag = extractPileTypeFromTagName(c.tagName);
        if (pileTypeFromTag) {
          d.pile_type = pileTypeFromTag;
          // 直杭(Straight)は円形断面なのでprofile_hintを上書きしない
          // 拡底杭のみEXTENDED_PILEを設定
          if (pileTypeFromTag !== 'Straight') {
            d.profile_hint = 'EXTENDED_PILE';
          }
          d.pileTagName = c.tagName; // デバッグ用にタグ名も保存
        }

        dims = dims ? { ...dims, ...d } : d;
      }
    }
    // fig 自身の属性も確認
    const selfDims = deriveDimensionsFromAttributes(fig.attributes);
    if (selfDims) {
      if (/Circle/i.test(fig.tagName)) selfDims.profile_hint = 'CIRCLE';
      if (/Rect/i.test(fig.tagName)) selfDims.profile_hint = selfDims.profile_hint || 'RECTANGLE';

      // 杭の直杭(Straight)で直径がある場合は円形プロファイル
      if (/Straight/i.test(fig.tagName) && (selfDims.diameter || selfDims.D)) {
        selfDims.profile_hint = selfDims.profile_hint || 'CIRCLE';
      }

      // 拡底杭タイプをタグ名から判定
      const pileTypeFromTag = extractPileTypeFromTagName(fig.tagName);
      if (pileTypeFromTag) {
        selfDims.pile_type = pileTypeFromTag;
        // 直杭(Straight)は円形断面なのでprofile_hintを上書きしない
        // 拡底杭のみEXTENDED_PILEを設定
        if (pileTypeFromTag !== 'Straight') {
          selfDims.profile_hint = 'EXTENDED_PILE';
        }
        selfDims.pileTagName = fig.tagName;
      }

      dims = dims ? { ...dims, ...selfDims } : selfDims;
    }
  }
  return dims;
}

/**
 * 鋼管杭(StbSecPile_S)の寸法データを抽出
 * 複数のStbSecPile_S_Straight要素からlength_pileを合計し、
 * 先頭要素からD（直径）とt（肉厚）を取得
 *
 * @param {Element} element - StbSecPile_S要素
 * @param {Object} config - 抽出設定
 * @returns {Object|null} 寸法データ { length_pile, D, t, diameter, profile_hint, pile_type, segments }
 */
function extractSteelPileDimensions(element, _config) {
  const tagName = element.tagName || element.localName;

  // StbSecPile_S以外は処理しない
  if (tagName !== 'StbSecPile_S') {
    return null;
  }

  // StbSecFigurePile_S > StbSecPile_S_Straight の構造を探す
  let figureElement = null;
  const steelFigureSelectors = ['StbSecFigurePile_S'];

  for (const sel of steelFigureSelectors) {
    try {
      figureElement = element.querySelector(sel);
    } catch (_) {
      figureElement = null;
    }
    if (!figureElement && typeof element.getElementsByTagNameNS === 'function') {
      const nsList = element.getElementsByTagNameNS(STB_NS, sel);
      figureElement = nsList && nsList[0];
    }
    if (!figureElement) {
      // 直接子要素をタグ名で検索
      const children = element.children || [];
      for (let i = 0; i < children.length; i++) {
        if (children[i].tagName === sel || children[i].localName === sel) {
          figureElement = children[i];
          break;
        }
      }
    }
    if (figureElement) break;
  }

  if (!figureElement) {
    return null;
  }

  // StbSecPile_S_Straight 要素を収集
  const straightElements = [];
  const children = figureElement.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childTag = child.tagName || child.localName;
    if (childTag === 'StbSecPile_S_Straight') {
      straightElements.push(child);
    }
  }

  if (straightElements.length === 0) {
    return null;
  }

  // id_order でソート（昇順）
  straightElements.sort((a, b) => {
    const orderA = parseInt(a.getAttribute('id_order') || '0', 10);
    const orderB = parseInt(b.getAttribute('id_order') || '0', 10);
    return orderA - orderB;
  });

  // 各セグメントからデータを抽出し、合計長さを計算
  let totalLength = 0;
  const segments = [];

  for (const seg of straightElements) {
    const lengthPile = parseFloat(seg.getAttribute('length_pile') || '0');
    const D = parseFloat(seg.getAttribute('D') || '0');
    const t = parseFloat(seg.getAttribute('t') || '0');
    const idOrder = parseInt(seg.getAttribute('id_order') || '0', 10);

    if (lengthPile > 0) {
      totalLength += lengthPile;
    }

    segments.push({
      id_order: idOrder,
      length_pile: lengthPile,
      D: D,
      t: t,
    });
  }

  // 先頭セグメントからD（直径）を取得（杭頭部の直径）
  const firstSeg = segments[0];
  const D = firstSeg?.D || 0;
  const t = firstSeg?.t || 0;

  if (totalLength === 0 && D === 0) {
    return null;
  }

  const dims = {
    pile_type: 'Straight',
    profile_hint: 'CIRCLE',
  };

  if (totalLength > 0) {
    dims.length_pile = totalLength;
  }

  if (D > 0) {
    dims.D = D;
    dims.diameter = D;
    dims.radius = D / 2;
    dims.width = D;
    dims.height = D;
  }

  if (t > 0) {
    dims.t = t;
    dims.thickness = t;
  }

  // セグメント情報を保持（将来的に多段杭の可視化に使用可能）
  if (segments.length > 1) {
    dims.segments = segments;
    dims.segmentCount = segments.length;
  }

  return dims;
}

/**
 * 既製杭(StbSecPileProduct)の寸法データを抽出
 * 複数のStbSecPileProduct_*要素からlength_pileを合計し、
 * 先頭要素からD（直径）を取得
 *
 * 対応する既製杭タイプ:
 * - StbSecPileProduct_PHC (高強度プレストレストコンクリート杭)
 * - StbSecPileProduct_SC (鋼管ソイルセメント杭)
 * - StbSecPileProduct_CPRC (遠心力鉄筋コンクリート杭)
 * - StbSecPileProductNodular_PHC (節杭PHC)
 *
 * @param {Element} element - StbSecPileProduct要素
 * @param {Object} config - 抽出設定
 * @returns {Object|null} 寸法データ { length_pile, D, diameter, profile_hint, pile_type, segments }
 */
function extractPileProductDimensions(element, _config) {
  const tagName = element.tagName || element.localName;

  // StbSecPileProduct以外は処理しない
  if (tagName !== 'StbSecPileProduct') {
    return null;
  }

  // StbSecFigurePileProduct を探す
  let figureElement = null;
  const figureSelector = 'StbSecFigurePileProduct';

  try {
    figureElement = element.querySelector(figureSelector);
  } catch (_) {
    figureElement = null;
  }
  if (!figureElement && typeof element.getElementsByTagNameNS === 'function') {
    const nsList = element.getElementsByTagNameNS(STB_NS, figureSelector);
    figureElement = nsList && nsList[0];
  }
  if (!figureElement) {
    // 直接子要素をタグ名で検索
    const children = element.children || [];
    for (let i = 0; i < children.length; i++) {
      if (children[i].tagName === figureSelector || children[i].localName === figureSelector) {
        figureElement = children[i];
        break;
      }
    }
  }

  if (!figureElement) {
    return null;
  }

  // 既製杭セグメント要素を収集
  // StbSecPileProduct_PHC, StbSecPileProduct_SC, StbSecPileProduct_CPRC,
  // StbSecPileProductNodular_PHC など
  const pileSegmentElements = [];
  const children = figureElement.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childTag = child.tagName || child.localName;
    // StbSecPileProduct_ または StbSecPileProductNodular_ で始まる要素を収集
    if (/^StbSecPileProduct/.test(childTag)) {
      pileSegmentElements.push(child);
    }
  }

  if (pileSegmentElements.length === 0) {
    return null;
  }

  // id_order でソート（昇順）
  pileSegmentElements.sort((a, b) => {
    const orderA = parseInt(a.getAttribute('id_order') || '0', 10);
    const orderB = parseInt(b.getAttribute('id_order') || '0', 10);
    return orderA - orderB;
  });

  // 各セグメントからデータを抽出し、合計長さを計算
  let totalLength = 0;
  const segments = [];

  for (const seg of pileSegmentElements) {
    const lengthPile = parseFloat(seg.getAttribute('length_pile') || '0');
    // D, D1（節杭の場合の主径）のいずれかから直径を取得
    const D = parseFloat(seg.getAttribute('D') || seg.getAttribute('D1') || '0');
    // t, tc（コンクリート肉厚）のいずれかから肉厚を取得
    const t = parseFloat(seg.getAttribute('t') || seg.getAttribute('tc') || '0');
    const idOrder = parseInt(seg.getAttribute('id_order') || '0', 10);

    if (lengthPile > 0) {
      totalLength += lengthPile;
    }

    segments.push({
      id_order: idOrder,
      length_pile: lengthPile,
      D: D,
      t: t,
      tagName: seg.tagName || seg.localName,
    });
  }

  // 先頭セグメントからD（直径）を取得（杭頭部の直径）
  const firstSeg = segments[0];
  const D = firstSeg?.D || 0;
  const t = firstSeg?.t || 0;

  if (totalLength === 0 && D === 0) {
    return null;
  }

  const dims = {
    pile_type: 'Straight',
    profile_hint: 'CIRCLE',
  };

  if (totalLength > 0) {
    dims.length_pile = totalLength;
  }

  if (D > 0) {
    dims.D = D;
    dims.diameter = D;
    dims.radius = D / 2;
    dims.width = D;
    dims.height = D;
  }

  if (t > 0) {
    dims.t = t;
    dims.thickness = t;
  }

  // セグメント情報を保持（将来的に多段杭の可視化に使用可能）
  if (segments.length > 1) {
    dims.segments = segments;
    dims.segmentCount = segments.length;
  }

  return dims;
}

/**
 * タグ名から拡底杭タイプを抽出
 * @param {string} tagName - XML要素のタグ名
 * @returns {string|null} 杭タイプ ('ExtendedFoot', 'ExtendedTop', 'ExtendedTopFoot', 'Straight') または null
 */
function extractPileTypeFromTagName(tagName) {
  if (!tagName) return null;

  // StbSecPile_RC_ExtendedTopFoot - 頭部・根固め部拡大杭（先に判定）
  if (/ExtendedTopFoot/i.test(tagName)) {
    return 'ExtendedTopFoot';
  }
  // StbSecPile_RC_ExtendedFoot - 根固め部拡大杭
  if (/ExtendedFoot/i.test(tagName)) {
    return 'ExtendedFoot';
  }
  // StbSecPile_RC_ExtendedTop - 頭部拡大杭
  if (/ExtendedTop/i.test(tagName)) {
    return 'ExtendedTop';
  }
  // StbSecPile_RC_Straight - 直杭
  if (/Pile.*Straight/i.test(tagName)) {
    return 'Straight';
  }

  return null;
}

function extractSteelFigureVariants(element, config) {
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

function findFigureElement(element, selector) {
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

function findFirstShapeElement(root) {
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
function normalizeSectionMode(sectionData, steelFigureInfo) {
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
function extractBasePlateData(element, config) {
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
function extractBaseType(element, config) {
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
function extractSteelFigureOffsetLevel(element, config) {
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

