/**
 * @fileoverview 重要度に基づく色付け機能
 *
 * 属性の重要度レベルに基づいて背景色を決定する機能を提供します。
 * XSD スキーマの必須/オプション定義と連携し、視覚的な重要度表示を実現します。
 */

import { IMPORTANCE_LEVELS } from '../../../constants/importanceLevels.js';
import {
  IMPORTANCE_COLORS,
  DEFAULT_IMPORTANCE_SETTINGS,
} from '../../../config/importanceConfig.js';
import { getImportanceManager } from './ElementInfoProviders.js';

// 構造部材のマッピング (StbMembers配下)
const MEMBER_MAPPING = {
  Column: 'StbMembers/StbColumns/StbColumn',
  Post: 'StbMembers/StbPosts/StbPost',
  Girder: 'StbMembers/StbGirders/StbGirder',
  Beam: 'StbMembers/StbBeams/StbBeam',
  Brace: 'StbMembers/StbBraces/StbBrace',
  Slab: 'StbMembers/StbSlabs/StbSlab',
  Wall: 'StbMembers/StbWalls/StbWall',
  Footing: 'StbMembers/StbFootings/StbFooting',
  StripFooting: 'StbMembers/StbStripFootings/StbStripFooting',
  Pile: 'StbMembers/StbPiles/StbPile',
  FoundationColumn: 'StbMembers/StbFoundationColumns/StbFoundationColumn',
  Parapet: 'StbMembers/StbParapets/StbParapet',
  Open: 'StbMembers/StbOpens/StbOpen',
};

// その他の要素マッピング
const OTHER_MAPPING = {
  Node: 'StbNodes/StbNode',
  Story: 'StbStories/StbStory',
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
    return `//ST_BRIDGE/StbSections/${stbElementName}/@${attributeName}`;
  }
  // 接合部要素
  if (elementType.startsWith('Joint') || elementType.startsWith('StbJoint')) {
    const stbElementName = elementType.startsWith('Stb') ? elementType : `Stb${elementType}`;
    return `//ST_BRIDGE/StbJoints/${stbElementName}/@${attributeName}`;
  }
  // その他（フォールバック）
  const stbElementName = elementType.startsWith('Stb') ? elementType : `Stb${elementType}`;
  return `//ST_BRIDGE/${stbElementName}/@${attributeName}`;
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
 * 16進数カラーをRGBAに変換
 * @param {string} hex - 16進数カラーコード (例: '#ff0000')
 * @param {number} alpha - 透明度 (0-1)
 * @returns {string} RGBA形式のカラー文字列
 */
function hexToRgba(hex, alpha = 0.1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 値が未入力とみなされるか判定する
 * @param {any} value - 判定対象
 * @returns {boolean} 未入力の場合true
 */
export function isMissingValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/**
 * 重要度レベルに基づいて背景色を取得する
 * @param {string} importanceLevel - 重要度レベル
 * @param {string} modelSource - モデルソース ('A', 'B', 'matched', またはnull)
 * @returns {string} CSS背景色スタイル
 */
export function getImportanceBasedBackgroundColor(importanceLevel, modelSource) {
  // モデルソースが指定されていない場合は色付けしない
  if (!modelSource) {
    return '';
  }

  // ランタイム色設定または設定ファイルの色を使用
  const runtimeColors = window.runtimeImportanceColors || IMPORTANCE_COLORS;
  const baseColor = runtimeColors[importanceLevel] || IMPORTANCE_COLORS[IMPORTANCE_LEVELS.OPTIONAL];

  return `background-color: ${hexToRgba(baseColor, 0.15)};`;
}

/**
 * モデルソースに基づいてプロパティ値セルの背景色を取得する（重要度ベース）
 * @param {string} modelSource - 'A', 'B', 'matched', またはnull
 * @param {boolean} hasValueA - モデルAに値があるかどうか
 * @param {boolean} hasValueB - モデルBに値があるかどうか
 * @param {string} elementType - 要素タイプ
 * @param {string} attributeName - 属性名
 * @returns {string} CSS背景色スタイル
 */
export function getModelSourceBackgroundColor(
  modelSource,
  hasValueA,
  hasValueB,
  elementType = null,
  attributeName = null,
) {
  // 重要度ベースの色付けを使用する場合
  if (elementType && attributeName) {
    const importanceLevel = getAttributeImportanceLevel(elementType, attributeName);
    return getImportanceBasedBackgroundColor(importanceLevel, modelSource);
  }

  // フォールバック: 従来の固定色を使用
  if (!modelSource) {
    return '';
  }

  switch (modelSource) {
    case 'A':
      return 'background-color: rgba(0, 255, 0, 0.1);'; // 緑の薄い背景
    case 'B':
      return 'background-color: rgba(255, 0, 0, 0.1);'; // 赤の薄い背景
    case 'matched':
      return 'background-color: rgba(0, 170, 255, 0.1);'; // 青の薄い背景
    default:
      return '';
  }
}

/**
 * 個別のプロパティ値セルの背景色を取得する（単一カラム表示用・重要度ベース）
 * @param {string} modelSource - 'A', 'B', 'matched', またはnull
 * @param {string} elementType - 要素タイプ
 * @param {string} attributeName - 属性名
 * @returns {string} CSS背景色スタイル
 */
export function getSingleValueBackgroundColor(
  modelSource,
  elementType = null,
  attributeName = null,
) {
  // 重要度ベースの色付けを使用する場合
  if (elementType && attributeName) {
    const importanceLevel = getAttributeImportanceLevel(elementType, attributeName);
    return getImportanceBasedBackgroundColor(importanceLevel, modelSource);
  }

  // フォールバック: 従来の固定色を使用
  if (!modelSource) {
    return '';
  }

  switch (modelSource) {
    case 'A':
      return 'background-color: rgba(0, 255, 0, 0.1);'; // 緑の薄い背景
    case 'B':
      return 'background-color: rgba(255, 0, 0, 0.1);'; // 赤の薄い背景
    case 'matched':
      return 'background-color: rgba(0, 170, 255, 0.1);'; // 青の薄い背景
    default:
      return '';
  }
}

/**
 * 必須属性の未入力（違反）セル用背景色を取得する
 * @param {string} modelSource - 'A', 'B', 'matched', またはnull
 * @param {boolean} hasValue - 値が存在するかどうか
 * @param {string} elementType - 要素タイプ
 * @param {string} attributeName - 属性名
 * @returns {string} CSS背景色スタイル
 */
export function getMissingRequiredBackgroundColor(
  modelSource,
  hasValue,
  elementType = null,
  attributeName = null,
) {
  if (!modelSource || hasValue || !elementType || !attributeName) {
    return '';
  }

  const importanceLevel = getAttributeImportanceLevel(elementType, attributeName);
  if (importanceLevel !== IMPORTANCE_LEVELS.REQUIRED) {
    return '';
  }

  const runtimeColors = window.runtimeImportanceColors || IMPORTANCE_COLORS;
  const requiredColor = runtimeColors[IMPORTANCE_LEVELS.REQUIRED] || IMPORTANCE_COLORS.required;
  return `background-color: ${hexToRgba(requiredColor, 0.26)};`;
}

/**
 * 重要度レベルに基づくアンダーラインスタイルを取得する
 * S2(required)=青線、S4(optional)=緑線で属性値を装飾する
 * @param {string} elementType - 要素タイプ
 * @param {string} attributeName - 属性名
 * @returns {string} CSSアンダーラインスタイル
 */
export function getImportanceUnderlineStyle(elementType, attributeName) {
  if (!elementType || !attributeName) return '';

  const importanceLevel = getAttributeImportanceLevel(elementType, attributeName);

  // ユーザー要望により一時的に非表示 (2026/02/08)
  return '';
  /*
  switch (importanceLevel) {
    case IMPORTANCE_LEVELS.REQUIRED:
      return 'text-decoration: underline; text-decoration-color: #1976D2; text-underline-offset: 3px; text-decoration-thickness: 2px;';
    case IMPORTANCE_LEVELS.OPTIONAL:
      return 'text-decoration: underline; text-decoration-color: #388E3C; text-underline-offset: 3px; text-decoration-thickness: 2px;';
    default:
      return '';
  }
  */
}
