/**
 * @fileoverview 重要度に基づく表示機能
 *
 * 属性の重要度レベルに基づいてインジケータを生成する機能を提供します。
 * 重要度は属性名セルの丸インジケータ（●）で表現し、
 * セル背景色は比較結果（differs）専用とします。
 */

import { IMPORTANCE_LEVELS } from '../../../constants/importanceLevels.js';
import { DEFAULT_IMPORTANCE_SETTINGS } from '../../../config/importanceConfig.js';
import { getImportanceManager } from './ElementInfoProviders.js';

// 構造部材のマッピング (StbMembers配下)
const MEMBER_MAPPING = {
  Column: 'StbModel/StbMembers/StbColumns/StbColumn',
  Post: 'StbModel/StbMembers/StbPosts/StbPost',
  Girder: 'StbModel/StbMembers/StbGirders/StbGirder',
  Beam: 'StbModel/StbMembers/StbBeams/StbBeam',
  Brace: 'StbModel/StbMembers/StbBraces/StbBrace',
  Slab: 'StbModel/StbMembers/StbSlabs/StbSlab',
  Wall: 'StbModel/StbMembers/StbWalls/StbWall',
  Footing: 'StbModel/StbMembers/StbFootings/StbFooting',
  StripFooting: 'StbModel/StbMembers/StbStripFootings/StbStripFooting',
  Pile: 'StbModel/StbMembers/StbPiles/StbPile',
  FoundationColumn: 'StbModel/StbMembers/StbFoundationColumns/StbFoundationColumn',
  Parapet: 'StbModel/StbMembers/StbParapets/StbParapet',
  Open: 'StbModel/StbMembers/StbOpens/StbOpen',
};

// その他の要素マッピング
const OTHER_MAPPING = {
  Node: 'StbModel/StbNodes/StbNode',
  Story: 'StbModel/StbStories/StbStory',
};

/**
 * 要素タイプと属性名からXPathスタイルの属性パスを構築する
 * @param {string} elementType - 要素タイプ
 * @param {string} attributeName - 属性名
 * @returns {string|null} 属性パス（構築できない場合はnull）
 */
function buildAttributePath(elementType, attributeName) {
  if (!elementType || !attributeName) return null;

  // 構造部材
  if (MEMBER_MAPPING[elementType]) {
    return `//ST_BRIDGE/${MEMBER_MAPPING[elementType]}/@${attributeName}`;
  }
  // その他の要素
  if (OTHER_MAPPING[elementType]) {
    return `//ST_BRIDGE/${OTHER_MAPPING[elementType]}/@${attributeName}`;
  }
  // 断面要素
  if (elementType.startsWith('Sec') || elementType.startsWith('StbSec')) {
    const stbElementName = elementType.startsWith('Stb') ? elementType : `Stb${elementType}`;
    return `//ST_BRIDGE/StbModel/StbSections/${stbElementName}/@${attributeName}`;
  }
  // 接合部要素
  if (elementType.startsWith('Joint') || elementType.startsWith('StbJoint')) {
    const stbElementName = elementType.startsWith('Stb') ? elementType : `Stb${elementType}`;
    return `//ST_BRIDGE/StbModel/StbJoints/${stbElementName}/@${attributeName}`;
  }
  // その他（フォールバック）
  const stbElementName = elementType.startsWith('Stb') ? elementType : `Stb${elementType}`;
  return `//ST_BRIDGE/StbModel/${stbElementName}/@${attributeName}`;
}

/**
 * DEFAULT_IMPORTANCE_SETTINGS から直接重要度を検索する（フォールバック用）
 * 大文字小文字の差異にも対応（例: id_section vs id_Section）
 * @param {string} attributePath - 属性パス
 * @returns {string|undefined} 重要度レベル（見つからない場合はundefined）
 */
function lookupDefaultImportance(attributePath) {
  // 完全一致
  const exact = DEFAULT_IMPORTANCE_SETTINGS[attributePath];
  if (exact) return exact;

  // 旧設定互換: StbModel 省略パス
  const legacyPath = attributePath.replace('//ST_BRIDGE/StbModel/', '//ST_BRIDGE/');
  const legacyExact = DEFAULT_IMPORTANCE_SETTINGS[legacyPath];
  if (legacyExact) return legacyExact;

  // 大文字小文字を無視した検索（属性名のケース差異に対応）
  const lowerPath = attributePath.toLowerCase();
  for (const [key, value] of Object.entries(DEFAULT_IMPORTANCE_SETTINGS)) {
    if (key.toLowerCase() === lowerPath) {
      return value;
    }
  }
  return undefined;
}

/**
 * 属性の重要度レベルを取得する
 * DIマネージャー → DEFAULT_IMPORTANCE_SETTINGS直接参照 の順にフォールバック
 * @param {string} elementType - 要素タイプ (例: 'Column', 'Node', 'SecColumn_RC')
 * @param {string} attributeName - 属性名 (例: 'id', 'name')
 * @returns {string} 重要度レベル ('required', 'optional', 'unnecessary', 'notApplicable')
 */
export function getAttributeImportanceLevel(elementType, attributeName) {
  try {
    const attributePath = buildAttributePath(elementType, attributeName);
    if (!attributePath) return IMPORTANCE_LEVELS.OPTIONAL;

    // 1. DIマネージャー経由で取得を試みる
    const manager = getImportanceManager();
    if (manager?.isInitialized) {
      return manager.getImportanceLevel(attributePath);
    }

    // 2. フォールバック: DEFAULT_IMPORTANCE_SETTINGS から直接検索
    const directLevel = lookupDefaultImportance(attributePath);
    return directLevel || IMPORTANCE_LEVELS.OPTIONAL;
  } catch (error) {
    console.warn(
      `[Importance] Failed to get importance for ${elementType}.${attributeName}:`,
      error,
    );
    return IMPORTANCE_LEVELS.OPTIONAL;
  }
}

/**
 * 重要度レベルに対応する丸インジケータHTMLを取得する
 * XSD赤丸と同様に、属性名セルに表示する。
 *   REQUIRED → 🔵（青丸）
 *   OPTIONAL → 🟢（緑丸）
 *   その他   → 表示なし
 * @param {string} elementType - 要素タイプ
 * @param {string} attributeName - 属性名
 * @returns {string} インジケータのHTML文字列
 */
export function getImportanceCircleHtml(elementType, attributeName) {
  if (!elementType || !attributeName) return '';

  const level = getAttributeImportanceLevel(elementType, attributeName);
  switch (level) {
    case IMPORTANCE_LEVELS.REQUIRED:
      return '<span style="color:#1976D2;font-size:var(--font-size-md);" title="重要度: 必須 (S2)">&#9679;</span> ';
    case IMPORTANCE_LEVELS.OPTIONAL:
      return '<span style="color:#388E3C;font-size:var(--font-size-md);" title="重要度: 任意 (S4)">&#9679;</span> ';
    default:
      return '';
  }
}
