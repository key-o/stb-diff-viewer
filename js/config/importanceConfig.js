/**
 * @fileoverview 重要度設定のデフォルト構成
 * 
 * ST-Bridge要素の詳細な重要度設定とデフォルト値を定義します。
 * C#版のImportanceSetting.csと互換性を持つ設定構造を提供します。
 */

import { IMPORTANCE_LEVELS } from '../core/importanceManager.js';

/**
 * デフォルト重要度設定
 * ST-Bridge要素パスとその重要度レベルのマッピング
 */
export const DEFAULT_IMPORTANCE_SETTINGS = {
  // === 共通要素 ===
  '//ST_BRIDGE': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/@version': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/@xmlns': IMPORTANCE_LEVELS.NOT_APPLICABLE,
  
  // === 節点 ===
  '//ST_BRIDGE/StbNodes': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodes/StbNode': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodes/StbNode/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodes/StbNode/@guid': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbNodes/StbNode/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbNodes/StbNode/@X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodes/StbNode/@Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodes/StbNode/@Z': IMPORTANCE_LEVELS.REQUIRED,
  
  // === 軸 ===
  '//ST_BRIDGE/StbAxes': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbParallelAxes': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbParallelAxes/StbParallelAxis': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbParallelAxes/StbParallelAxis/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbAxes/StbParallelAxes/StbParallelAxis/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbParallelAxes/StbParallelAxis/@distance': IMPORTANCE_LEVELS.REQUIRED,
  
  '//ST_BRIDGE/StbAxes/StbArcAxes': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbArcAxes/StbArcAxis': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbArcAxes/StbArcAxis/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbAxes/StbArcAxes/StbArcAxis/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbArcAxes/StbArcAxis/@radius': IMPORTANCE_LEVELS.REQUIRED,
  
  '//ST_BRIDGE/StbAxes/StbRadialAxes': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbRadialAxes/StbRadialAxis': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbRadialAxes/StbRadialAxis/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbAxes/StbRadialAxes/StbRadialAxis/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbAxes/StbRadialAxes/StbRadialAxis/@angle': IMPORTANCE_LEVELS.REQUIRED,
  
  // === 階 ===
  '//ST_BRIDGE/StbStories': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@guid': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbStories/StbStory/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@height': IMPORTANCE_LEVELS.REQUIRED,
  
  // === 構造部材 ===
  
  // 柱
  '//ST_BRIDGE/StbMembers/StbColumns': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@guid': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_node_bottom': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_node_top': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@rotate': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  
  // 間柱
  '//ST_BRIDGE/StbMembers/StbPosts': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbPosts/StbPost': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbPosts/StbPost/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPosts/StbPost/@id_node_bottom': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPosts/StbPost/@id_node_top': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPosts/StbPost/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  
  // 大梁
  '//ST_BRIDGE/StbMembers/StbGirders': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@guid': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_node_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@rotate': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  
  // 小梁
  '//ST_BRIDGE/StbMembers/StbBeams': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@guid': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_node_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@rotate': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  
  // ブレース
  '//ST_BRIDGE/StbMembers/StbBraces': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_node_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  
  // スラブ
  '//ST_BRIDGE/StbMembers/StbSlabs': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@guid': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/StbNodeIdOrder': IMPORTANCE_LEVELS.REQUIRED,
  
  // 壁
  '//ST_BRIDGE/StbMembers/StbWalls': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@guid': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/StbNodeIdOrder': IMPORTANCE_LEVELS.REQUIRED,
  
  // === 断面定義 ===
  
  // 柱断面
  '//ST_BRIDGE/StbSections/StbSecColumn_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/StbSecColumn_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/StbSecColumn_RC/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/StbSecColumn_RC/@name': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/StbSecColumn_RC/@strength_concrete': IMPORTANCE_LEVELS.REQUIRED,
  
  '//ST_BRIDGE/StbSections/StbSecColumn_S': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/StbSecColumn_S': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/StbSecColumn_S/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/StbSecColumn_S/@name': IMPORTANCE_LEVELS.OPTIONAL,
  
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/StbSecColumn_SRC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/StbSecColumn_SRC/@id': IMPORTANCE_LEVELS.REQUIRED,
  
  '//ST_BRIDGE/StbSections/StbSecColumn_CFT': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_CFT/StbSecColumn_CFT': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_CFT/StbSecColumn_CFT/@id': IMPORTANCE_LEVELS.REQUIRED,
  
  // 梁断面
  '//ST_BRIDGE/StbSections/StbSecBeam_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBeam_RC/StbSecBeam_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBeam_RC/StbSecBeam_RC/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBeam_RC/StbSecBeam_RC/@strength_concrete': IMPORTANCE_LEVELS.REQUIRED,
  
  '//ST_BRIDGE/StbSections/StbSecBeam_S': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBeam_S/StbSecBeam_S': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBeam_S/StbSecBeam_S/@id': IMPORTANCE_LEVELS.REQUIRED,
  
  '//ST_BRIDGE/StbSections/StbSecBeam_SRC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBeam_SRC/StbSecBeam_SRC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBeam_SRC/StbSecBeam_SRC/@id': IMPORTANCE_LEVELS.REQUIRED,
  
  // ブレース断面
  '//ST_BRIDGE/StbSections/StbSecBrace_S': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBrace_S/StbSecBrace_S': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBrace_S/StbSecBrace_S/@id': IMPORTANCE_LEVELS.REQUIRED,
  
  // スラブ断面
  '//ST_BRIDGE/StbSections/StbSecSlab_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecSlab_RC/StbSecSlab_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecSlab_RC/StbSecSlab_RC/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecSlab_RC/StbSecSlab_RC/@strength_concrete': IMPORTANCE_LEVELS.REQUIRED,
  
  // 壁断面
  '//ST_BRIDGE/StbSections/StbSecWall_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecWall_RC/StbSecWall_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecWall_RC/StbSecWall_RC/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecWall_RC/StbSecWall_RC/@strength_concrete': IMPORTANCE_LEVELS.REQUIRED,
  
  // === 継手 ===
  '//ST_BRIDGE/StbJoints': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbJoints/StbJointBeamShapeH': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbJoints/StbJointColumnShapeCross': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbJoints/StbJointColumnShapeH': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbJoints/StbJointColumnShapeT': IMPORTANCE_LEVELS.OPTIONAL
};

/**
 * 要素タイプ別の重要度設定テンプレート
 * 新しい要素追加時の参考として使用
 */
export const ELEMENT_IMPORTANCE_TEMPLATES = {
  // 構造部材の基本テンプレート
  structuralMember: {
    '@id': IMPORTANCE_LEVELS.REQUIRED,
    '@guid': IMPORTANCE_LEVELS.OPTIONAL,
    '@name': IMPORTANCE_LEVELS.OPTIONAL,
    '@id_section': IMPORTANCE_LEVELS.REQUIRED,
    '@kind_structure': IMPORTANCE_LEVELS.REQUIRED
  },
  
  // 線形部材（柱、梁、ブレース）の追加属性
  linearMember: {
    '@id_node_start': IMPORTANCE_LEVELS.REQUIRED,
    '@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
    '@rotate': IMPORTANCE_LEVELS.OPTIONAL
  },
  
  // 面部材（スラブ、壁）の追加属性
  surfaceMember: {
    'StbNodeIdOrder': IMPORTANCE_LEVELS.REQUIRED,
    '@id_floor': IMPORTANCE_LEVELS.OPTIONAL
  },
  
  // 断面定義の基本テンプレート
  section: {
    '@id': IMPORTANCE_LEVELS.REQUIRED,
    '@name': IMPORTANCE_LEVELS.OPTIONAL,
    '@strength_concrete': IMPORTANCE_LEVELS.REQUIRED,
    '@strength_rebar': IMPORTANCE_LEVELS.REQUIRED
  }
};

/**
 * 重要度による色分け設定
 */
export const IMPORTANCE_COLORS = {
  [IMPORTANCE_LEVELS.REQUIRED]: '#ff4444',      // 赤 - 高重要度
  [IMPORTANCE_LEVELS.OPTIONAL]: '#ffaa00',      // オレンジ - 中重要度  
  [IMPORTANCE_LEVELS.UNNECESSARY]: '#888888',   // グレー - 低重要度
  [IMPORTANCE_LEVELS.NOT_APPLICABLE]: '#cccccc' // 薄グレー - 対象外
};

/**
 * 重要度レベルの優先順位
 * 数値が小さいほど高優先度
 */
export const IMPORTANCE_PRIORITY = {
  [IMPORTANCE_LEVELS.REQUIRED]: 1,
  [IMPORTANCE_LEVELS.OPTIONAL]: 2,
  [IMPORTANCE_LEVELS.UNNECESSARY]: 3,
  [IMPORTANCE_LEVELS.NOT_APPLICABLE]: 4
};

/**
 * デフォルト重要度設定を生成する関数
 * @param {string[]} elementPaths - 要素パスの配列
 * @param {string} defaultLevel - デフォルト重要度レベル
 * @returns {Map<string, string>} 重要度設定マップ
 */
export function generateDefaultImportanceSettings(elementPaths, defaultLevel = IMPORTANCE_LEVELS.REQUIRED) {
  const settings = new Map();
  
  for (const path of elementPaths) {
    // デフォルト設定にある場合はそれを使用、なければdefaultLevelを使用
    const importance = DEFAULT_IMPORTANCE_SETTINGS[path] || defaultLevel;
    settings.set(path, importance);
  }
  
  return settings;
}

/**
 * 要素タイプから推奨重要度を取得する
 * @param {string} elementPath - 要素パス
 * @returns {string} 推奨重要度レベル
 */
export function getRecommendedImportance(elementPath) {
  // 構造的に重要な要素
  const criticalElements = [
    'StbNode', 'StbColumn', 'StbGirder', 'StbBeam', 'StbSlab', 'StbWall',
    '@id', '@id_node_', '@id_section', '@X', '@Y', '@Z'
  ];
  
  // オプショナルな要素
  const optionalElements = [
    '@guid', '@name', 'StbBrace', 'StbPost', '@rotate'
  ];
  
  // 対象外要素
  const notApplicableElements = [
    '@xmlns', 'text()', 'comment()'
  ];
  
  for (const critical of criticalElements) {
    if (elementPath.includes(critical)) {
      return IMPORTANCE_LEVELS.REQUIRED;
    }
  }
  
  for (const optional of optionalElements) {
    if (elementPath.includes(optional)) {
      return IMPORTANCE_LEVELS.OPTIONAL;
    }
  }
  
  for (const notApplicable of notApplicableElements) {
    if (elementPath.includes(notApplicable)) {
      return IMPORTANCE_LEVELS.NOT_APPLICABLE;
    }
  }
  
  // デフォルト
  return IMPORTANCE_LEVELS.OPTIONAL;
}

/**
 * 設定の妥当性をチェックする
 * @param {Map<string, string>} settings - 重要度設定
 * @returns {Object} チェック結果
 */
export function validateImportanceConfig(settings) {
  const issues = [];
  let validCount = 0;
  
  for (const [path, importance] of settings.entries()) {
    // 重要度レベルの妥当性チェック
    if (!Object.values(IMPORTANCE_LEVELS).includes(importance)) {
      issues.push(`Invalid importance level "${importance}" for path "${path}"`);
      continue;
    }
    
    // パスの形式チェック
    if (!path.startsWith('//ST_BRIDGE')) {
      issues.push(`Path "${path}" does not start with //ST_BRIDGE`);
      continue;
    }
    
    validCount++;
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    validCount,
    totalCount: settings.size,
    validPercentage: (validCount / settings.size) * 100
  };
}