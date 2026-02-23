/**
 * @fileoverview STB共通インポートモジュール
 *
 * ST-Bridge形式のXMLデータの読み込み・解析・抽出のための共通機能を提供します。
 * @module common/stb/import
 */

export {
  // ユーティリティ
  parseElements,
  setLogger,
  STB_NAMESPACE,
  // バージョン検出
  detectStbVersion,
  getVersionInfo,
  isVersion210,
  isVersion202,
  // ノード・階・軸
  buildNodeMap,
  parseStories,
  parseAxes,
  // 鋼材断面
  extractSteelSections,
  // 柱・梁・ブレース
  extractColumnElements,
  extractBeamElements,
  extractGirderElements,
  extractBraceElements,
  extractPostElements,
  // 杭・基礎
  extractPileElements,
  extractFootingElements,
  extractFoundationColumnElements,
  extractStripFootingElements,
  // 床・壁
  extractSlabElements,
  extractWallElements,
  // パラペット・開口・継手
  extractParapetElements,
  extractOpeningElements,
  extractJointElements,
} from './parser/stbXmlParser.js';

export { SectionShapeProcessor } from './extractor/SectionShapeProcessor.js';

// バージョン検出ユーティリティの再エクスポート
export {
  findRootElement,
  isSameVersion,
  ROOT_ELEMENT_NAMES,
} from './parser/utils/versionDetector.js';

// STB計算データ（荷重等）の抽出
export * from './extractor/StbCalDataExtractor.js';

// JSON Schemaローダー（メイン）
export * as jsonSchemaLoader from './parser/jsonSchemaLoader.js';

// XSDスキーマ解析（後方互換・テスト用）
export * as xsdSchemaParser from './parser/xsdSchemaParser.js';

// 座標範囲計算
export * as coordinateRangeCalculator from './extractor/utils/coordinateRangeCalculator.js';

// 統一断面抽出エンジン
export * as sectionExtractor from './extractor/sectionExtractor.js';
