/**
 * @fileoverview STB共通パーサーモジュール
 *
 * ST-Bridge形式のXMLデータを解析するための共通機能を提供します。
 * MatrixCalcとStbDiffViewerの両プロジェクトで使用されます。
 *
 * @module common/stb/parser
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
} from './stbXmlParser.js';

export { SameNotSameProcessor } from './SameNotSameProcessor.js';

// バージョン検出ユーティリティの再エクスポート
export { findRootElement, isSameVersion, ROOT_ELEMENT_NAMES } from './utils/versionDetector.js';
