/**
 * @fileoverview 重要度に基づく色付け機能
 *
 * 属性の重要度レベルに基づいて背景色を決定する機能を提供します。
 * XSD スキーマの必須/オプション定義と連携し、視覚的な重要度表示を実現します。
 */

import { IMPORTANCE_LEVELS } from '../../../constants/importanceLevels.js';
import { IMPORTANCE_COLORS } from '../../../config/importanceConfig.js';
import { getImportanceManager } from './ElementInfoProviders.js';

/**
 * 属性の重要度レベルを取得する
 * @param {string} elementType - 要素タイプ (例: 'Column', 'Node', 'SecColumn_RC')
 * @param {string} attributeName - 属性名 (例: 'id', 'name')
 * @returns {string} 重要度レベル ('required', 'optional', 'unnecessary', 'notApplicable')
 */
export function getAttributeImportanceLevel(elementType, attributeName) {
  try {
    const manager = getImportanceManager();
    if (!manager) {
      return IMPORTANCE_LEVELS.OPTIONAL;
    }

    if (!manager.isInitialized) {
      return IMPORTANCE_LEVELS.OPTIONAL;
    }

    // 構造部材のマッピング (StbMembers配下)
    const memberMapping = {
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
    const otherMapping = {
      Node: 'StbNodes/StbNode',
      Story: 'StbStories/StbStory',
    };

    let attributePath;

    // 構造部材
    if (memberMapping[elementType]) {
      attributePath = `//ST_BRIDGE/${memberMapping[elementType]}/@${attributeName}`;
    }
    // その他の要素
    else if (otherMapping[elementType]) {
      attributePath = `//ST_BRIDGE/${otherMapping[elementType]}/@${attributeName}`;
    }
    // 断面要素 (Stb で始まり Sec を含む、または elementType が Sec で始まる)
    else if (elementType.startsWith('Sec') || elementType.startsWith('StbSec')) {
      const stbElementName = elementType.startsWith('Stb') ? elementType : `Stb${elementType}`;
      attributePath = `//ST_BRIDGE/StbSections/${stbElementName}/@${attributeName}`;
    }
    // 接合部要素
    else if (elementType.startsWith('Joint') || elementType.startsWith('StbJoint')) {
      const stbElementName = elementType.startsWith('Stb') ? elementType : `Stb${elementType}`;
      attributePath = `//ST_BRIDGE/StbJoints/${stbElementName}/@${attributeName}`;
    }
    // その他（フォールバック）
    else {
      const stbElementName = elementType.startsWith('Stb') ? elementType : `Stb${elementType}`;
      attributePath = `//ST_BRIDGE/${stbElementName}/@${attributeName}`;
    }

    // 重要度を取得
    const importance = manager.getImportanceLevel(attributePath);
    return importance;
  } catch (error) {
    console.warn(
      `[Importance] Failed to get importance for ${elementType}.${attributeName}:`,
      error,
    );
    return IMPORTANCE_LEVELS.OPTIONAL; // フォールバック
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
