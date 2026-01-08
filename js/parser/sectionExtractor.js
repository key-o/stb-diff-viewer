/**
 * @fileoverview 統一断面抽出エンジン（ブリッジファイル）
 *
 * 共通モジュール (common/stb/parser) からの再エクスポート。
 * StbDiffViewer固有のSECTION_CONFIGを注入します。
 *
 * @module StbDiffViewer/parser/sectionExtractor
 */

import { SECTION_CONFIG } from '../common-stb/section/sectionConfig.js';

import {
  setSectionConfig,
  setLogger,
  extractAllSections as _extractAllSections,
  extractSteelPileDimensions,
  extractPileProductDimensions,
  extractPileTypeFromTagName,
} from '../common-stb/parser/sectionExtractor.js';

// プロジェクト固有のSECTION_CONFIGを注入
setSectionConfig(SECTION_CONFIG);

// ロガーを設定（console使用）
setLogger({
  log: (...args) => {},
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
});

// 全機能を再エクスポート
export function extractAllSections(xmlDoc) {
  return _extractAllSections(xmlDoc);
}

export { extractSteelPileDimensions, extractPileProductDimensions, extractPileTypeFromTagName };
