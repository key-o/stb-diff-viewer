/**
 * @fileoverview STB Version Detector
 *
 * ST-Bridge XMLファイルのバージョンを検出するユーティリティ
 * 実装は constants/stbVersionDetection.js に移動。後方互換性のため再エクスポート。
 *
 * @module common/stb/parser/utils/versionDetector
 */

export {
  detectStbVersion,
  findRootElement,
  getVersionInfo,
  isVersion210,
  isVersion202,
  isSameVersion,
  ROOT_ELEMENT_NAMES,
  STB_NAMESPACE,
} from '../../../../constants/stbVersionDetection.js';
