/**
 * @fileoverview STB XMLパーサーモジュール（バレルファイル）
 *
 * このファイルは、ST-Bridge形式のXMLデータを解析する各サブモジュールを
 * 統合的に再エクスポートします。既存のインポートとの後方互換性を維持します。
 *
 * サブモジュール構成:
 * - stbParserCore.js: コア機能（ロガー、汎用パース、ノードマップ、階・軸情報）
 * - stbSteelSectionParser.js: 鋼材断面データ抽出
 * - stbLinearElementParser.js: 線状構造要素（柱・梁・ブレース等）抽出
 * - stbFoundationElementParser.js: 基礎要素（杭・基礎・基礎柱・布基礎）抽出
 * - stbPanelElementParser.js: パネル・その他要素（床・壁・開口・継手等）抽出
 *
 * STB 2.0.2 and 2.1.0 対応
 *
 * @module common/stb/parser/stbXmlParser
 */

// --- コア機能 ---
export {
  setLogger,
  getLogger,
  parseStbExtensions,
  parseElements,
  buildNodeMap,
  parseStories,
  parseAxes,
  buildNodeStoryAxisLookup,
  STB_NAMESPACE,
} from './stbParserCore.js';

// --- 鋼材断面 ---
export { extractSteelSections } from './stbSteelSectionParser.js';

// --- 線状構造要素 ---
export {
  extractColumnElements,
  extractBeamElements,
  extractGirderElements,
  extractBraceElements,
  extractIsolatingDeviceElements,
  extractDampingDeviceElements,
  extractFrameDampingDeviceElements,
  extractPostElements,
} from './stbLinearElementParser.js';

// --- 基礎要素 ---
export {
  extractPileElements,
  extractFootingElements,
  extractFoundationColumnElements,
  extractStripFootingElements,
} from './stbFoundationElementParser.js';

// --- パネル・その他要素 ---
export {
  extractSlabElements,
  extractWallElements,
  extractParapetElements,
  extractOpeningElements,
  extractJointElements,
  extractJointArrangements,
  applyJointArrangementsToElements,
} from './stbPanelElementParser.js';

// --- バージョン検出ユーティリティ（再エクスポート） ---
export {
  detectStbVersion,
  getVersionInfo,
  isVersion210,
  isVersion202,
} from './utils/versionDetector.js';
