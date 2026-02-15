/**
 * @fileoverview 重要度管理システム
 *
 * StbDiffCheckerの重要度判定機能をJavaScriptに移植した中核システム。
 * ST-Bridge要素の重要度設定、管理、検証を提供します。
 *
 * 重要度レベル:
 * - required: 高重要度（必須）
 * - optional: 中重要度（任意）
 * - unnecessary: 低重要度（不要）
 * - notApplicable: 対象外
 */

import { validateImportanceSettings } from '../common-stb/validation/importanceValidation.js';
import { getState, setState } from './globalState.js';
import { eventBus, ImportanceEvents } from './events/index.js';
import { DEFAULT_IMPORTANCE_SETTINGS } from '../config/importanceConfig.js';
import { loadConfigById } from '../config/importanceConfigLoader.js';
import { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from '../constants/importanceLevels.js';
import { loadXsdSchema, getElementDefinition } from '../common-stb/parser/xsdSchemaParser.js';

const MVD_MODES = {
  S2: 's2',
  S4: 's4',
  COMBINED: 'mvd-combined',
};

const IMPORTANCE_PRIORITY = {
  [IMPORTANCE_LEVELS.NOT_APPLICABLE]: 0,
  [IMPORTANCE_LEVELS.UNNECESSARY]: 1,
  [IMPORTANCE_LEVELS.OPTIONAL]: 2,
  [IMPORTANCE_LEVELS.REQUIRED]: 3,
};

const MODEL_CONTAINER_PATHS = new Set([
  '//ST_BRIDGE/StbModel/StbNodes',
  '//ST_BRIDGE/StbModel/StbAxes',
  '//ST_BRIDGE/StbModel/StbStories',
  '//ST_BRIDGE/StbModel/StbMembers',
  '//ST_BRIDGE/StbModel/StbSections',
  '//ST_BRIDGE/StbModel/StbJoints',
  '//ST_BRIDGE/StbModel/StbConnections',
  '//ST_BRIDGE/StbModel/StbWeld',
]);

const MEMBER_COLLECTION_NAMES = [
  'StbColumns',
  'StbPosts',
  'StbGirders',
  'StbBeams',
  'StbBraces',
  'StbSlabs',
  'StbWalls',
  'StbFootings',
  'StbStripFootings',
  'StbPiles',
  'StbFoundationColumns',
  'StbParapets',
  'StbOpens',
];

const COLLECTION_ID_ATTR_PATTERN = new RegExp(
  `^//ST_BRIDGE/StbModel/(?:StbNodes|StbAxes|StbStories|StbMembers|StbSections|StbJoints|StbConnections|StbWeld|StbMembers/(?:${MEMBER_COLLECTION_NAMES.join('|')}))/@(?:id|guid|name)$`,
);

const MODEL_CONTAINER_ATTR_PATTERN = new RegExp(
  '^//ST_BRIDGE/StbModel/(?:StbNodes|StbAxes|StbStories|StbMembers|StbSections|StbJoints|StbConnections|StbWeld)/@',
);

const MODEL_PREFIXED_ROOT_NAMES = [
  'StbNodes',
  'StbAxes',
  'StbStories',
  'StbMembers',
  'StbSections',
  'StbJoints',
  'StbConnections',
  'StbWeld',
];

const AXIS_COLLECTION_NAMES = ['StbParallelAxes', 'StbArcAxes', 'StbRadialAxes', 'StbDrawingAxes'];

const SINGULAR_ELEMENT_PARENT_MAP = {
  StbNode: 'StbNodes',
  StbStory: 'StbStories',
  StbParallelAxis: 'StbAxes/StbParallelAxes',
  StbArcAxis: 'StbAxes/StbArcAxes',
  StbRadialAxis: 'StbAxes/StbRadialAxes',
  StbColumn: 'StbMembers/StbColumns',
  StbPost: 'StbMembers/StbPosts',
  StbGirder: 'StbMembers/StbGirders',
  StbBeam: 'StbMembers/StbBeams',
  StbBrace: 'StbMembers/StbBraces',
  StbSlab: 'StbMembers/StbSlabs',
  StbWall: 'StbMembers/StbWalls',
  StbFooting: 'StbMembers/StbFootings',
  StbStripFooting: 'StbMembers/StbStripFootings',
  StbPile: 'StbMembers/StbPiles',
  StbFoundationColumn: 'StbMembers/StbFoundationColumns',
  StbParapet: 'StbMembers/StbParapets',
  StbOpen: 'StbMembers/StbOpens',
};

/**
 * タブIDから正確な親XPathへのマッピング
 * ST-Bridgeスキーマの階層構造に基づく
 */
const TAB_PARENT_PATHS = {
  StbCommon: '//ST_BRIDGE',
  StbNodes: '//ST_BRIDGE/StbModel/StbNodes',
  StbParallelAxes: '//ST_BRIDGE/StbModel/StbAxes/StbParallelAxes',
  StbArcAxes: '//ST_BRIDGE/StbModel/StbAxes/StbArcAxes',
  StbRadialAxes: '//ST_BRIDGE/StbModel/StbAxes/StbRadialAxes',
  StbDrawingLineAxis: '//ST_BRIDGE/StbModel/StbAxes/StbDrawingAxes',
  StbDrawingArcAxis: '//ST_BRIDGE/StbModel/StbAxes/StbDrawingAxes',
  StbStories: '//ST_BRIDGE/StbModel/StbStories',
  StbColumns: '//ST_BRIDGE/StbModel/StbMembers/StbColumns',
  StbPosts: '//ST_BRIDGE/StbModel/StbMembers/StbPosts',
  StbGirders: '//ST_BRIDGE/StbModel/StbMembers/StbGirders',
  StbBeams: '//ST_BRIDGE/StbModel/StbMembers/StbBeams',
  StbBraces: '//ST_BRIDGE/StbModel/StbMembers/StbBraces',
  StbSlabs: '//ST_BRIDGE/StbModel/StbMembers/StbSlabs',
  StbWalls: '//ST_BRIDGE/StbModel/StbMembers/StbWalls',
  StbFootings: '//ST_BRIDGE/StbModel/StbMembers/StbFootings',
  StbStripFootings: '//ST_BRIDGE/StbModel/StbMembers/StbStripFootings',
  StbPiles: '//ST_BRIDGE/StbModel/StbMembers/StbPiles',
  StbFoundationColumns: '//ST_BRIDGE/StbModel/StbMembers/StbFoundationColumns',
  StbParapets: '//ST_BRIDGE/StbModel/StbMembers/StbParapets',
  StbOpens: '//ST_BRIDGE/StbModel/StbMembers/StbOpens',
  StbSecColumn_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecColumn_RC',
  StbSecColumn_S: '//ST_BRIDGE/StbModel/StbSections/StbSecColumn_S',
  StbSecColumn_SRC: '//ST_BRIDGE/StbModel/StbSections/StbSecColumn_SRC',
  StbSecColumn_CFT: '//ST_BRIDGE/StbModel/StbSections/StbSecColumn_CFT',
  StbSecBeam_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecBeam_RC',
  StbSecBeam_S: '//ST_BRIDGE/StbModel/StbSections/StbSecBeam_S',
  StbSecBeam_SRC: '//ST_BRIDGE/StbModel/StbSections/StbSecBeam_SRC',
  StbSecBrace_S: '//ST_BRIDGE/StbModel/StbSections/StbSecBrace_S',
  StbSecSlab_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecSlab_RC',
  StbSecSlabDeck: '//ST_BRIDGE/StbModel/StbSections/StbSecSlabDeck',
  StbSecSlabPrecast: '//ST_BRIDGE/StbModel/StbSections/StbSecSlabPrecast',
  StbSecWall_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecWall_RC',
  StbSecFoundation_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecFoundation_RC',
  StbSecPile_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecPile_RC',
  StbSecPile_S: '//ST_BRIDGE/StbModel/StbSections/StbSecPile_S',
  StbSecPileProduct: '//ST_BRIDGE/StbModel/StbSections/StbSecPileProduct',
  StbSecParapet_RC: '//ST_BRIDGE/StbModel/StbSections/StbSecParapet_RC',
  StbJoints: '//ST_BRIDGE/StbModel/StbJoints',
};

function normalizeImportancePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let path = rawPath.trim();
  if (!path) return null;

  path = path.replace(/\/Stbposts\b/g, '/StbPosts').replace(/\/Stbpost\b/g, '/StbPost');
  path = path.replace(/^\/\/ST_BRIDGE\/ST_BRIDGE\b/, '//ST_BRIDGE');
  path = path.replace(
    /^\/\/ST_BRIDGE\/StbMode\/(StbNodes|StbAxes|StbStories|StbMembers|StbSections|StbJoints|StbConnections|StbWeld)\b/,
    '//ST_BRIDGE/StbModel/$1',
  );

  for (const name of MODEL_PREFIXED_ROOT_NAMES) {
    path = path.replace(
      new RegExp(`^//ST_BRIDGE/(?:StbModel/)?${name}\\b`),
      `//ST_BRIDGE/StbModel/${name}`,
    );
  }

  for (const name of MEMBER_COLLECTION_NAMES) {
    path = path.replace(
      new RegExp(`^//ST_BRIDGE/(?:StbModel/)?${name}\\b`),
      `//ST_BRIDGE/StbModel/StbMembers/${name}`,
    );
  }

  for (const name of AXIS_COLLECTION_NAMES) {
    path = path.replace(
      new RegExp(`^//ST_BRIDGE/(?:StbModel/)?${name}\\b`),
      `//ST_BRIDGE/StbModel/StbAxes/${name}`,
    );
  }

  for (const [name, parent] of Object.entries(SINGULAR_ELEMENT_PARENT_MAP)) {
    path = path.replace(
      new RegExp(`^//ST_BRIDGE/(?:StbModel/)?${name}\\b`),
      `//ST_BRIDGE/StbModel/${parent}/${name}`,
    );
  }

  path = path.replace(
    /^\/\/ST_BRIDGE\/(?:StbModel\/)?StbSec(?!tions\b)/,
    '//ST_BRIDGE/StbModel/StbSections/StbSec',
  );
  path = path.replace(
    /^\/\/ST_BRIDGE\/(?:StbModel\/)?StbJoint(?!s\b)/,
    '//ST_BRIDGE/StbModel/StbJoints/StbJoint',
  );
  path = path.replace(
    /^\/\/ST_BRIDGE\/StbModel\/StbAxes\/StbParallelAxis\b/,
    '//ST_BRIDGE/StbModel/StbAxes/StbParallelAxes/StbParallelAxis',
  );
  path = path.replace(
    /^\/\/ST_BRIDGE\/StbModel\/StbAxes\/StbArcAxis\b/,
    '//ST_BRIDGE/StbModel/StbAxes/StbArcAxes/StbArcAxis',
  );
  path = path.replace(
    /^\/\/ST_BRIDGE\/StbModel\/StbAxes\/StbRadialAxis\b/,
    '//ST_BRIDGE/StbModel/StbAxes/StbRadialAxes/StbRadialAxis',
  );
  path = path.replace('/StbModel/StbSections/StbSections', '/StbModel/StbSections');
  path = path.replace('/StbModel/StbModel/', '/StbModel/');

  return path;
}

function shouldSkipImportancePath(path) {
  if (!path) return true;
  if (MODEL_CONTAINER_PATHS.has(path)) return true;
  if (COLLECTION_ID_ATTR_PATTERN.test(path)) return true;
  if (MODEL_CONTAINER_ATTR_PATTERN.test(path)) return true;
  return false;
}

// STB要素のタブ別グループ化定義（C#版ImportanceSetting.csと対応）
export const STB_ELEMENT_TABS = [
  { id: 'StbCommon', name: 'StbCommon', xsdElem: 'StbCommon' },
  { id: 'StbNodes', name: 'StbNodes', xsdElem: 'StbNode' },
  { id: 'StbParallelAxes', name: 'StbParallelAxes', xsdElem: 'StbParallelAxis' },
  { id: 'StbArcAxes', name: 'StbArcAxes', xsdElem: 'StbArcAxis' },
  { id: 'StbRadialAxes', name: 'StbRadialAxes', xsdElem: 'StbRadialAxis' },
  { id: 'StbDrawingLineAxis', name: 'StbDrawingLineAxis', xsdElem: 'StbDrawingLineAxis' },
  { id: 'StbDrawingArcAxis', name: 'StbDrawingArcAxis', xsdElem: 'StbDrawingArcAxis' },
  { id: 'StbStories', name: 'StbStories', xsdElem: 'StbStory' },
  { id: 'StbColumns', name: 'StbColumns', xsdElem: 'StbColumn' },
  { id: 'StbPosts', name: 'StbPosts', xsdElem: 'StbPost' },
  { id: 'StbGirders', name: 'StbGirders', xsdElem: 'StbGirder' },
  { id: 'StbBeams', name: 'StbBeams', xsdElem: 'StbBeam' },
  { id: 'StbBraces', name: 'StbBraces', xsdElem: 'StbBrace' },
  { id: 'StbSlabs', name: 'StbSlabs', xsdElem: 'StbSlab' },
  { id: 'StbWalls', name: 'StbWalls', xsdElem: 'StbWall' },
  { id: 'StbFootings', name: 'StbFootings', xsdElem: 'StbFooting' },
  { id: 'StbStripFootings', name: 'StbStripFootings', xsdElem: 'StbStripFooting' },
  { id: 'StbPiles', name: 'StbPiles', xsdElem: 'StbPile' },
  { id: 'StbFoundationColumns', name: 'StbFoundationColumns', xsdElem: 'StbFoundationColumn' },
  { id: 'StbParapets', name: 'StbParapets', xsdElem: 'StbParapet' },
  { id: 'StbOpens', name: 'StbOpens', xsdElem: 'StbOpen' },
  { id: 'StbSecColumn_RC', name: 'StbSecColumn_RC' },
  { id: 'StbSecColumn_S', name: 'StbSecColumn_S' },
  { id: 'StbSecColumn_SRC', name: 'StbSecColumn_SRC' },
  { id: 'StbSecColumn_CFT', name: 'StbSecColumn_CFT' },
  { id: 'StbSecBeam_RC', name: 'StbSecBeam_RC' },
  { id: 'StbSecBeam_S', name: 'StbSecBeam_S' },
  { id: 'StbSecBeam_SRC', name: 'StbSecBeam_SRC' },
  { id: 'StbSecBrace_S', name: 'StbSecBrace_S' },
  { id: 'StbSecSlab_RC', name: 'StbSecSlab_RC' },
  { id: 'StbSecSlabDeck', name: 'StbSecSlabDeck' },
  { id: 'StbSecSlabPrecast', name: 'StbSecSlabPrecast' },
  { id: 'StbSecWall_RC', name: 'StbSecWall_RC' },
  { id: 'StbSecFoundation_RC', name: 'StbSecFoundation_RC' },
  { id: 'StbSecPile_RC', name: 'StbSecPile_RC' },
  { id: 'StbSecPile_S', name: 'StbSecPile_S' },
  { id: 'StbSecPileProduct', name: 'StbSecPileProduct' },
  { id: 'StbSecParapet_RC', name: 'StbSecParapet_RC' },
  { id: 'StbJoints', name: 'StbJoints' },
];

/**
 * 重要度管理システムのメインクラス
 */
class ImportanceManager {
  constructor() {
    this.userImportanceSettings = new Map();
    this.mvdImportanceSettings = {
      [MVD_MODES.S2]: new Map(),
      [MVD_MODES.S4]: new Map(),
    };
    this.defaultMvdImportanceSettings = {
      [MVD_MODES.S2]: new Map(),
      [MVD_MODES.S4]: new Map(),
    };
    this.orderedElementPaths = [];
    this.elementPathsByTab = new Map();
    this.isInitialized = false;
    this.currentConfigId = MVD_MODES.COMBINED;
    this.currentConfigName = 'MVD S2+S4 (結合)';
  }

  normalizePath(path) {
    const normalized = normalizeImportancePath(path);
    if (!normalized || shouldSkipImportancePath(normalized)) {
      return null;
    }
    return normalized;
  }

  /**
   * 重要度管理システムを初期化する
   * @param {string} _xsdContent - ST-Bridge XSDスキーマ内容
   * @returns {Promise<boolean>} 初期化成功フラグ
   */
  async initialize(_xsdContent = null) {
    try {
      // XSD解析と設定生成を実行（デフォルト設定ロード含む）
      // ファイルからのXSDロードを試み、パラメータを補完します
      await this.parseXsdAndGenerateSettings(_xsdContent);

      this.isInitialized = true;
      this.notifySettingsChanged();

      return true;
    } catch (error) {
      console.error('重要度マネージャーの初期化に失敗しました:', error);
      return false;
    }
  }

  /**
   * S2/S4 のMVD設定を初期化する
   */
  async initializeMvdSettings() {
    let s2Config = null;
    let s4Config = null;

    try {
      [s2Config, s4Config] = await Promise.all([
        loadConfigById(MVD_MODES.S2),
        loadConfigById(MVD_MODES.S4),
      ]);
    } catch (error) {
      console.warn(
        '[ImportanceManager] MVD設定ファイルの読み込みに失敗したため既定値を使用します:',
        error,
      );
    }

    const s2Map = new Map();
    const s4Map = new Map();

    // 既知パスを最初に登録
    for (const rawPath of this.orderedElementPaths) {
      const path = this.normalizePath(rawPath);
      if (!path) continue;
      s2Map.set(path, IMPORTANCE_LEVELS.OPTIONAL);
      s4Map.set(path, IMPORTANCE_LEVELS.OPTIONAL);
    }

    // S2パターンを適用（明示設定より低い優先度）
    this.applyPatterns(s2Map, s2Config?.patterns);

    // S2設定を反映（パターンを上書き）
    const s2Settings = s2Config?.settings || {};
    for (const [rawPath, level] of Object.entries(s2Settings)) {
      const path = this.normalizePath(rawPath);
      if (!path) continue;
      if (!this.orderedElementPaths.includes(path)) {
        this.orderedElementPaths.push(path);
      }
      s2Map.set(path, level);
      if (!s4Map.has(path)) {
        s4Map.set(path, IMPORTANCE_LEVELS.OPTIONAL);
      }
    }

    // S4パターンを適用（明示設定より低い優先度）
    this.applyPatterns(s4Map, s4Config?.patterns);

    // S4設定を反映（パターンを上書き）
    const s4Settings = s4Config?.settings || {};
    for (const [rawPath, level] of Object.entries(s4Settings)) {
      const path = this.normalizePath(rawPath);
      if (!path) continue;
      if (!this.orderedElementPaths.includes(path)) {
        this.orderedElementPaths.push(path);
      }
      s4Map.set(path, level);
      if (!s2Map.has(path)) {
        s2Map.set(path, IMPORTANCE_LEVELS.OPTIONAL);
      }
    }

    // S2/S4設定で追加されたパスにもパターンを適用
    const s2ExplicitPaths = new Set(
      Object.keys(s2Settings)
        .map((p) => this.normalizePath(p))
        .filter(Boolean),
    );
    const s4ExplicitPaths = new Set(
      Object.keys(s4Settings)
        .map((p) => this.normalizePath(p))
        .filter(Boolean),
    );
    this.applyPatterns(s2Map, s2Config?.patterns, s2ExplicitPaths);
    this.applyPatterns(s4Map, s4Config?.patterns, s4ExplicitPaths);

    // S4 は S2 を包含するため、S4 が未指定・または弱い場合は S2 を継承
    const allPaths = new Set([...s2Map.keys(), ...s4Map.keys(), ...this.orderedElementPaths]);
    for (const path of allPaths) {
      if (!s2Map.has(path)) {
        s2Map.set(path, IMPORTANCE_LEVELS.OPTIONAL);
      }
      const normalizedS4 = this.normalizeS4Level(path, s2Map.get(path), s4Map.get(path));
      s4Map.set(path, normalizedS4);
    }

    // 設定ファイルが読めなかった場合のフォールバック
    if (!s2Config && !s4Config) {
      for (const [rawPath, level] of Object.entries(DEFAULT_IMPORTANCE_SETTINGS)) {
        const path = this.normalizePath(rawPath);
        if (!path) continue;
        s4Map.set(path, level);
        s2Map.set(
          path,
          level === IMPORTANCE_LEVELS.REQUIRED
            ? IMPORTANCE_LEVELS.REQUIRED
            : IMPORTANCE_LEVELS.OPTIONAL,
        );
      }
    }

    this.mvdImportanceSettings[MVD_MODES.S2] = s2Map;
    this.mvdImportanceSettings[MVD_MODES.S4] = s4Map;

    if (this.defaultMvdImportanceSettings[MVD_MODES.S2].size === 0) {
      this.defaultMvdImportanceSettings[MVD_MODES.S2] = new Map(s2Map);
      this.defaultMvdImportanceSettings[MVD_MODES.S4] = new Map(s4Map);
    }

    this.rebuildEffectiveImportanceSettings();
  }

  /**
   * S4レベルをS2包含ルールで正規化
   * @param {string} path
   * @param {string} s2Level
   * @param {string} s4Level
   * @returns {string}
   */
  normalizeS4Level(path, s2Level, s4Level) {
    const fallbackS2 = s2Level || IMPORTANCE_LEVELS.OPTIONAL;
    const candidateS4 = s4Level || fallbackS2;
    return this.getPriority(candidateS4) >= this.getPriority(fallbackS2) ? candidateS4 : fallbackS2;
  }

  /**
   * 重要度レベルの優先度を取得
   * @param {string} level
   * @returns {number}
   */
  getPriority(level) {
    return IMPORTANCE_PRIORITY[level] ?? IMPORTANCE_PRIORITY[IMPORTANCE_LEVELS.OPTIONAL];
  }

  /**
   * パターンに基づいて重要度マップを更新する
   * @param {Map<string, string>} map - 重要度マップ
   * @param {Array<{contains: string, level: string}>} patterns - パターン配列
   * @param {Set<string>} [excludePaths] - 除外するパス（明示設定済み）
   */
  applyPatterns(map, patterns, excludePaths) {
    if (!patterns || patterns.length === 0) return;
    for (const [path] of map) {
      if (excludePaths && excludePaths.has(path)) continue;
      const pathLower = path.toLowerCase();
      for (const { contains, level } of patterns) {
        if (pathLower.includes(contains.toLowerCase())) {
          map.set(path, level);
          break;
        }
      }
    }
  }

  /**
   * MVD設定にパスが存在することを保証
   * @param {string} path
   */
  ensurePathExistsInMvdSettings(path) {
    const normalizedPath = this.normalizePath(path);
    if (!normalizedPath) return null;
    if (!this.orderedElementPaths.includes(normalizedPath)) {
      this.orderedElementPaths.push(normalizedPath);
    }
    if (!this.mvdImportanceSettings[MVD_MODES.S2].has(normalizedPath)) {
      this.mvdImportanceSettings[MVD_MODES.S2].set(normalizedPath, IMPORTANCE_LEVELS.OPTIONAL);
    }
    const s2 = this.mvdImportanceSettings[MVD_MODES.S2].get(normalizedPath);
    const s4 = this.mvdImportanceSettings[MVD_MODES.S4].get(normalizedPath);
    this.mvdImportanceSettings[MVD_MODES.S4].set(
      normalizedPath,
      this.normalizeS4Level(normalizedPath, s2, s4),
    );
    return normalizedPath;
  }

  /**
   * 現在の評価モードで有効な重要度設定を再構築
   */
  rebuildEffectiveImportanceSettings() {
    const sourceMode = this.currentConfigId === MVD_MODES.S2 ? MVD_MODES.S2 : MVD_MODES.S4;
    const allPaths = new Set([
      ...this.orderedElementPaths,
      ...this.mvdImportanceSettings[MVD_MODES.S2].keys(),
      ...this.mvdImportanceSettings[MVD_MODES.S4].keys(),
    ]);

    this.userImportanceSettings.clear();

    for (const path of allPaths) {
      const level = this.getMvdImportanceLevel(path, sourceMode);
      this.userImportanceSettings.set(path, level);
    }

    if (!this.currentConfigId) {
      this.currentConfigId = MVD_MODES.COMBINED;
    }

    if (this.currentConfigId === MVD_MODES.S2) {
      this.currentConfigName = 'MVD S2 (必須)';
    } else if (this.currentConfigId === MVD_MODES.S4) {
      this.currentConfigName = 'MVD S4 (任意)';
    } else {
      this.currentConfigName = 'MVD S2+S4 (結合)';
    }
  }

  /**
   * 指定MVDでの重要度を取得
   * @param {string} elementPath
   * @param {'s2'|'s4'} mvdMode
   * @returns {string}
   */
  getMvdImportanceLevel(elementPath, mvdMode) {
    const normalizedPath = this.ensurePathExistsInMvdSettings(elementPath);
    if (!normalizedPath) {
      return IMPORTANCE_LEVELS.OPTIONAL;
    }

    if (mvdMode === MVD_MODES.S2) {
      return (
        this.mvdImportanceSettings[MVD_MODES.S2].get(normalizedPath) || IMPORTANCE_LEVELS.OPTIONAL
      );
    }

    const s2Level =
      this.mvdImportanceSettings[MVD_MODES.S2].get(normalizedPath) || IMPORTANCE_LEVELS.OPTIONAL;
    const s4Level = this.mvdImportanceSettings[MVD_MODES.S4].get(normalizedPath);
    return this.normalizeS4Level(normalizedPath, s2Level, s4Level);
  }

  /**
   * 指定MVDでの重要度を設定
   * @param {string} elementPath
   * @param {'s2'|'s4'} mvdMode
   * @param {string} importanceLevel
   * @param {Object} [options]
   * @param {boolean} [options.notify=true]
   * @param {boolean} [options.rebuild=true]
   * @returns {boolean}
   */
  setMvdImportanceLevel(elementPath, mvdMode, importanceLevel, options = {}) {
    const { notify = true, rebuild = true } = options;
    if (!Object.values(IMPORTANCE_LEVELS).includes(importanceLevel)) {
      console.error(`無効な重要度レベル: ${importanceLevel}`);
      return false;
    }
    if (mvdMode !== MVD_MODES.S2 && mvdMode !== MVD_MODES.S4) {
      console.error(`無効なMVDモード: ${mvdMode}`);
      return false;
    }

    const normalizedPath = this.ensurePathExistsInMvdSettings(elementPath);
    if (!normalizedPath) {
      return false;
    }

    if (mvdMode === MVD_MODES.S2) {
      this.mvdImportanceSettings[MVD_MODES.S2].set(normalizedPath, importanceLevel);
      const currentS4 = this.mvdImportanceSettings[MVD_MODES.S4].get(normalizedPath);
      this.mvdImportanceSettings[MVD_MODES.S4].set(
        normalizedPath,
        this.normalizeS4Level(normalizedPath, importanceLevel, currentS4),
      );
    } else {
      const s2Level = this.mvdImportanceSettings[MVD_MODES.S2].get(normalizedPath);
      this.mvdImportanceSettings[MVD_MODES.S4].set(
        normalizedPath,
        this.normalizeS4Level(normalizedPath, s2Level, importanceLevel),
      );
    }

    if (rebuild) {
      this.rebuildEffectiveImportanceSettings();
    }
    if (notify) {
      this.notifySettingsChanged();
    }
    return true;
  }

  /**
   * 要素階層からXPathパスを再帰的に生成する
   * @param {string} elementName - 要素名
   * @param {string} parentPath - 親要素のパス
   * @param {Object} elementDef - 要素定義 {name, attributes, children, documentation}
   * @param {Set<string>} [visitedPaths=new Set()] - 循環参照防止用の訪問済みパスセット
   * @param {number} [depth=0] - 現在の再帰深度
   * @returns {string[]} 生成されたXPathパスの配列
   */
  generatePathsFromHierarchy(
    elementName,
    parentPath,
    elementDef,
    visitedPaths = new Set(),
    depth = 0,
  ) {
    const paths = [];
    const currentPath = `${parentPath}/${elementName}`;

    // 最大深度チェック（無限再帰防止）
    const MAX_DEPTH = 20;
    if (depth >= MAX_DEPTH) {
      console.warn(`[ImportanceManager] Max depth ${MAX_DEPTH} reached at: ${currentPath}`);
      return paths;
    }

    // 循環参照チェック：同じパスを2回訪問しない
    if (visitedPaths.has(currentPath)) {
      return paths;
    }
    visitedPaths.add(currentPath);

    // 0. 要素自体のパスを追加（重要！）
    paths.push(currentPath);

    // ref参照で解決された子要素はattributes/childrenが未設定の場合がある
    // その場合、getElementDefinitionで完全な定義を取得して補完する
    let resolvedDef = elementDef;
    if (!elementDef.attributes && !elementDef.children) {
      const fullDef = getElementDefinition(elementName);
      if (fullDef) {
        resolvedDef = fullDef;
      }
    }

    // 1. 属性パスを生成
    if (resolvedDef.attributes) {
      for (const [attrName] of resolvedDef.attributes) {
        paths.push(`${currentPath}/@${attrName}`);
      }
    }

    // 2. 子要素パスを再帰的に生成
    if (resolvedDef.children) {
      for (const [childName, childDef] of resolvedDef.children) {
        // 再帰呼び出しで子要素とその子孫のパスを取得
        const childPaths = this.generatePathsFromHierarchy(
          childName,
          currentPath,
          childDef,
          visitedPaths,
          depth + 1,
        );
        paths.push(...childPaths);
      }
    }

    return paths;
  }

  /**
   * XSDスキーマから要素パスを解析して重要度設定を生成する
   * @param {string} _xsdContent - XSDスキーマ内容
   */
  async parseXsdAndGenerateSettings(_xsdContent) {
    // デフォルト設定を先にロード
    await this.loadDefaultSettings();

    try {
      // XSDスキーマをロード
      // note: _xsdContentが渡されても、ファイルから正規のスキーマを読み込むことを優先
      const loaded = await loadXsdSchema();
      if (!loaded) {
        console.warn('XSDスキーマのロードに失敗しました。補完をスキップします。');
      } else {
        // 各タブについて、XSDから階層的にパスを生成
        for (const tab of STB_ELEMENT_TABS) {
          // xsdElemが定義されていればそれを使用、なければidを使用
          const elementId = tab.xsdElem || tab.id;
          const elementDef = getElementDefinition(elementId);

          if (elementDef) {
            if (!this.elementPathsByTab.has(tab.id)) {
              this.elementPathsByTab.set(tab.id, []);
            }
            const currentPaths = this.elementPathsByTab.get(tab.id);

            // TAB_PARENT_PATHSから正確な親パスを取得
            const parentPath = TAB_PARENT_PATHS[tab.id] || '//ST_BRIDGE/StbModel';

            // 階層から全パスを生成（循環参照防止のため新しいvisitedPathsセットを使用）
            const visitedPaths = new Set();
            const paths = this.generatePathsFromHierarchy(
              elementId,
              parentPath,
              elementDef,
              visitedPaths,
              0,
            );

            // 重複を排除してパスを追加
            const uniquePaths = [
              ...new Set(paths.map((p) => this.normalizePath(p)).filter(Boolean)),
            ];

            for (const path of uniquePaths) {
              // タブ別リストに追加（重複チェック）
              if (!currentPaths.includes(path)) {
                currentPaths.push(path);
              }
              // 全体リストに追加（重複チェック）
              if (!this.orderedElementPaths.includes(path)) {
                this.orderedElementPaths.push(path);
              }

              // 重要度設定がなければ追加
              if (!this.userImportanceSettings.has(path)) {
                // 属性はOPTIONAL、要素はREQUIRED
                const isAttribute = path.includes('/@');
                const level = isAttribute ? IMPORTANCE_LEVELS.OPTIONAL : IMPORTANCE_LEVELS.REQUIRED;
                this.userImportanceSettings.set(path, level);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('XSD解析と設定生成中にエラーが発生しました:', error);
    }

    await this.initializeMvdSettings();
  }

  /**
   * デフォルト重要度設定を読み込む
   * MVDベースのDEFAULT_IMPORTANCE_SETTINGSから設定を読み込む
   */
  async loadDefaultSettings() {
    // DEFAULT_IMPORTANCE_SETTINGSから設定を読み込む
    for (const [rawPath, importance] of Object.entries(DEFAULT_IMPORTANCE_SETTINGS)) {
      const path = this.normalizePath(rawPath);
      if (!path) continue;
      if (!this.orderedElementPaths.includes(path)) {
        this.orderedElementPaths.push(path);
      }
      this.userImportanceSettings.set(path, importance);
    }

    // 各タブの要素パスを生成（タブ表示用）
    for (const tab of STB_ELEMENT_TABS) {
      const elementPaths = this.generateElementPathsForTab(tab.id);

      if (!this.elementPathsByTab.has(tab.id)) {
        this.elementPathsByTab.set(tab.id, []);
      }

      for (const path of elementPaths) {
        const normalizedPath = this.normalizePath(path);
        if (!normalizedPath) continue;

        const tabPaths = this.elementPathsByTab.get(tab.id);

        // 全体リストへの重複チェック
        if (!this.orderedElementPaths.includes(normalizedPath)) {
          this.orderedElementPaths.push(normalizedPath);
        }

        // タブ別リストへの重複チェック
        if (!tabPaths.includes(normalizedPath)) {
          tabPaths.push(normalizedPath);
        }

        // DEFAULT_IMPORTANCE_SETTINGSにない場合はREQUIREDをデフォルトとする
        if (!this.userImportanceSettings.has(normalizedPath)) {
          this.userImportanceSettings.set(normalizedPath, IMPORTANCE_LEVELS.REQUIRED);
        }
      }
    }
  }

  /**
   * 指定されたタブIDの要素パスを生成する
   * @param {string} tabId - タブID
   * @returns {string[]} 要素パスの配列
   */
  generateElementPathsForTab(tabId) {
    const tab = STB_ELEMENT_TABS.find((item) => item.id === tabId);
    const baseElementName = tab?.xsdElem || tabId;

    // 基本的な要素パス生成ロジック
    // 実際のXSDパーサーとの統合時により詳細に実装
    const basePaths = [
      `//ST_BRIDGE/${baseElementName}`,
      `//ST_BRIDGE/${baseElementName}/@id`,
      `//ST_BRIDGE/${baseElementName}/@guid`,
      `//ST_BRIDGE/${baseElementName}/@name`,
    ];

    // 特定要素の追加属性
    const additionalPaths = this.getAdditionalPathsForElement(tabId);

    const normalizedPaths = [...basePaths, ...additionalPaths]
      .map((path) => this.normalizePath(path))
      .filter(Boolean);

    return [...new Set(normalizedPaths)];
  }

  /**
   * 要素タイプに応じた追加パスを取得する
   * @param {string} elementType - 要素タイプ
   * @returns {string[]} 追加パスの配列
   */
  getAdditionalPathsForElement(elementType) {
    const additionalPaths = {
      StbColumns: [
        '//ST_BRIDGE/StbColumns/StbColumn/@id_node_bottom',
        '//ST_BRIDGE/StbColumns/StbColumn/@id_node_top',
        '//ST_BRIDGE/StbColumns/StbColumn/@id_section',
        '//ST_BRIDGE/StbColumns/StbColumn/@rotate',
      ],
      StbGirders: [
        '//ST_BRIDGE/StbGirders/StbGirder/@id_node_start',
        '//ST_BRIDGE/StbGirders/StbGirder/@id_node_end',
        '//ST_BRIDGE/StbGirders/StbGirder/@id_section',
        '//ST_BRIDGE/StbGirders/StbGirder/@rotate',
      ],
      StbBeams: [
        '//ST_BRIDGE/StbBeams/StbBeam/@id_node_start',
        '//ST_BRIDGE/StbBeams/StbBeam/@id_node_end',
        '//ST_BRIDGE/StbBeams/StbBeam/@id_section',
        '//ST_BRIDGE/StbBeams/StbBeam/@rotate',
      ],
      StbNodes: [
        '//ST_BRIDGE/StbNodes/StbNode/@X',
        '//ST_BRIDGE/StbNodes/StbNode/@Y',
        '//ST_BRIDGE/StbNodes/StbNode/@Z',
      ],
    };

    return additionalPaths[elementType] || [];
  }

  /**
   * 要素パスの重要度を取得する
   * @param {string} elementPath - 要素パス
   * @returns {string} 重要度レベル（設定がない場合はOPTIONAL）
   */
  getImportanceLevel(elementPath) {
    const normalizedPath = this.normalizePath(elementPath);
    if (!normalizedPath) {
      return IMPORTANCE_LEVELS.OPTIONAL;
    }

    const importance = this.userImportanceSettings.get(normalizedPath);

    // 統計収集
    const stats = getState('importance.fallbackStats') || {
      totalChecks: 0,
      fallbackCount: 0,
      undefinedPaths: new Set(),
    };

    stats.totalChecks++;

    if (!importance) {
      // フォールバック発生
      stats.fallbackCount++;
      stats.undefinedPaths.add(normalizedPath);
      setState('importance.fallbackStats', stats);

      // デバッグログ（開発時のみ）
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.debug(`[Importance] Fallback to OPTIONAL: ${normalizedPath}`);
      }
    }

    // 設定がない場合はOPTIONAL（MVDに記載されていない要素は任意扱い）
    return importance || IMPORTANCE_LEVELS.OPTIONAL;
  }

  /**
   * 要素パスの重要度を設定する
   * @param {string} elementPath - 要素パス
   * @param {string} importanceLevel - 重要度レベル
   * @returns {boolean} 設定成功フラグ
   */
  setImportanceLevel(elementPath, importanceLevel) {
    if (!Object.values(IMPORTANCE_LEVELS).includes(importanceLevel)) {
      console.error(`無効な重要度レベル: ${importanceLevel}`);
      return false;
    }

    // 互換性維持: 単一レベル変更は S2/S4 の両方へ適用
    const setS2 = this.setMvdImportanceLevel(elementPath, MVD_MODES.S2, importanceLevel, {
      notify: false,
      rebuild: false,
    });
    const setS4 = this.setMvdImportanceLevel(elementPath, MVD_MODES.S4, importanceLevel, {
      notify: false,
      rebuild: false,
    });

    if (!setS2 || !setS4) {
      return false;
    }

    this.rebuildEffectiveImportanceSettings();
    this.notifySettingsChanged();
    return true;
  }

  /**
   * 全ての重要度設定を取得する
   * @returns {Map<string, string>} 要素パスと重要度のマップ
   */
  getAllImportanceSettings() {
    return new Map(this.userImportanceSettings);
  }

  /**
   * タブに対応するパス判定用セグメント一覧を生成する
   * @param {string} tabId - タブID
   * @returns {Set<string>} 判定用セグメント（小文字）
   */
  buildTabPathCandidates(tabId) {
    const tab = STB_ELEMENT_TABS.find((item) => item.id === tabId);
    const rawNames = new Set([tabId]);

    if (tab?.xsdElem) {
      rawNames.add(tab.xsdElem);
    }

    const candidates = new Set();
    rawNames.forEach((name) => {
      if (!name || typeof name !== 'string') return;

      const normalized = name.trim();
      if (!normalized) return;

      candidates.add(normalized.toLowerCase());

      if (normalized.endsWith('s') && normalized.length > 1) {
        candidates.add(normalized.slice(0, -1).toLowerCase());
      } else {
        candidates.add(`${normalized}s`.toLowerCase());
      }
    });

    return candidates;
  }

  /**
   * XPath文字列を要素セグメント配列に分解する
   * @param {string} path - XPath
   * @returns {string[]} 要素セグメント配列
   */
  extractPathElementSegments(path) {
    if (!path || typeof path !== 'string') {
      return [];
    }

    return path
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment && !segment.startsWith('@'))
      .map((segment) => segment.toLowerCase());
  }

  /**
   * XPathがタブ候補に一致するか判定する
   * @param {string} path - XPath
   * @param {Set<string>} candidates - 判定用セグメント
   * @returns {boolean} 一致する場合true
   */
  pathMatchesTab(path, candidates) {
    if (!candidates || candidates.size === 0) {
      return false;
    }

    const segments = this.extractPathElementSegments(path);

    // パスに /StbSections/ が含まれているかチェック
    const isInSectionsPath = path.includes('/StbSections/');

    return segments.some((segment) => {
      // 完全一致
      if (candidates.has(segment)) {
        return true;
      }

      // プレフィックス一致の場合、より厳密にチェック
      for (const candidate of candidates) {
        // StbSectionsパス内の要素は、セクション関連タブにのみマッチさせる
        if (isInSectionsPath) {
          // セクションタブ（StbSec*）の場合のみマッチ
          if (candidate.startsWith('stbsec') && segment.startsWith(`${candidate}_`)) {
            return true;
          }
          // セクションタブ以外では、完全一致のみ許可
          continue;
        }

        // StbSections外のパスでは、従来通りプレフィックスマッチを許可
        if (segment.startsWith(`${candidate}_`)) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * タブ別の要素パスを取得する
   * @param {string} tabId - タブID
   * @returns {string[]} 要素パスの配列
   */
  getElementPathsByTab(tabId) {
    const staticPaths = this.elementPathsByTab.get(tabId) || [];

    // TAB_PARENT_PATHSに定義された親パスを使用して、正確にフィルタリング
    const parentPath = TAB_PARENT_PATHS[tabId];
    const matchedPaths = new Set(staticPaths);

    if (parentPath) {
      // タブの要素名を取得
      const tab = STB_ELEMENT_TABS.find((t) => t.id === tabId);
      const tabElementName = tab?.xsdElem || tabId;

      // 実際のターゲットパス（親パス + タブ要素名）
      // parentPathが既にtabElementNameで終わっている場合は、重複を避ける
      let targetPrefix;
      if (parentPath.endsWith(`/${tabElementName}`)) {
        targetPrefix = parentPath;
      } else {
        targetPrefix = `${parentPath}/${tabElementName}`;
      }

      // ターゲットパス配下の要素のみを追加
      const allPaths = [...this.userImportanceSettings.keys()];
      for (const path of allPaths) {
        // targetPrefixで始まるか、targetPrefixと完全一致するパスのみ
        if (path === targetPrefix || path.startsWith(targetPrefix + '/')) {
          matchedPaths.add(path);
        }
      }
    } else {
      // フォールバック: 従来のマッチングロジック
      const candidates = this.buildTabPathCandidates(tabId);
      const allPaths = [...this.userImportanceSettings.keys()];
      for (const path of allPaths) {
        if (this.pathMatchesTab(path, candidates)) {
          matchedPaths.add(path);
        }
      }
    }

    const ordered = [];
    const seen = new Set();
    const pushOrdered = (path) => {
      if (matchedPaths.has(path) && !seen.has(path)) {
        ordered.push(path);
        seen.add(path);
      }
    };

    this.orderedElementPaths.forEach(pushOrdered);
    matchedPaths.forEach(pushOrdered);

    return ordered;
  }

  /**
   * 重要度設定をCSV形式でエクスポートする
   * @returns {string} CSV形式の文字列
   */
  exportToCSV() {
    const lines = ['Element Path,S2 Level,S4 Level,Effective Level'];

    for (const path of this.orderedElementPaths) {
      const s2Level = this.getMvdImportanceLevel(path, MVD_MODES.S2);
      const s4Level = this.getMvdImportanceLevel(path, MVD_MODES.S4);
      const effectiveLevel = this.getImportanceLevel(path);
      lines.push(
        `"${path}","${IMPORTANCE_LEVEL_NAMES[s2Level]}","${IMPORTANCE_LEVEL_NAMES[s4Level]}","${IMPORTANCE_LEVEL_NAMES[effectiveLevel]}"`,
      );
    }

    return lines.join('\n');
  }

  /**
   * CSV形式の重要度設定をインポートする
   * @param {string} csvContent - CSV形式の文字列
   * @returns {boolean} インポート成功フラグ
   */
  importFromCSV(csvContent) {
    try {
      const lines = csvContent.split('\n').filter((line) => line.trim());
      if (lines.length <= 1) {
        return false;
      }

      // ヘッダー行をスキップ
      const dataLines = lines.slice(1);
      let updated = false;

      for (const line of dataLines) {
        const [pathStr, s2Name, s4Name, effectiveName] = this.parseCSVLine(line);
        if (!pathStr) {
          continue;
        }

        const s2Level = this.getImportanceLevelFromName(s2Name);
        const s4Level = this.getImportanceLevelFromName(s4Name);
        const effectiveLevel = this.getImportanceLevelFromName(effectiveName);

        if (s2Level) {
          this.setMvdImportanceLevel(pathStr, MVD_MODES.S2, s2Level, {
            notify: false,
            rebuild: false,
          });
          updated = true;
        }

        if (s4Level) {
          this.setMvdImportanceLevel(pathStr, MVD_MODES.S4, s4Level, {
            notify: false,
            rebuild: false,
          });
          updated = true;
        }

        // 旧形式（Element Path,Importance Level）も受け入れる
        if (!s2Level && !s4Level && effectiveLevel) {
          this.setMvdImportanceLevel(pathStr, MVD_MODES.S2, effectiveLevel, {
            notify: false,
            rebuild: false,
          });
          this.setMvdImportanceLevel(pathStr, MVD_MODES.S4, effectiveLevel, {
            notify: false,
            rebuild: false,
          });
          updated = true;
        }
      }

      if (!updated) {
        return false;
      }

      this.rebuildEffectiveImportanceSettings();
      this.notifySettingsChanged();
      return true;
    } catch (error) {
      console.error('CSVのインポートに失敗しました:', error);
      return false;
    }
  }

  /**
   * CSV行を解析する
   * @param {string} line - CSV行
   * @returns {[string, string, string, string]} パス/S2/S4/有効重要度
   */
  parseCSVLine(line) {
    if (!line || typeof line !== 'string') {
      return [null, null, null, null];
    }

    // "..." で囲まれたカラムを優先的に解析
    const quoted = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    if (quoted.length >= 4) {
      return [quoted[0], quoted[1], quoted[2], quoted[3]];
    }
    if (quoted.length >= 2) {
      return [quoted[0], quoted[1], null, null];
    }

    const parts = line.split(',').map((part) => part.trim());
    if (parts.length >= 4) {
      return [parts[0], parts[1], parts[2], parts[3]];
    }
    if (parts.length >= 2) {
      return [parts[0], parts[1], null, null];
    }

    return [null, null, null, null];
  }

  /**
   * 日本語名から重要度レベルを取得する
   * @param {string} importanceName - 重要度の日本語名
   * @returns {string|null} 重要度レベル
   */
  getImportanceLevelFromName(importanceName) {
    for (const [level, name] of Object.entries(IMPORTANCE_LEVEL_NAMES)) {
      if (name === importanceName) {
        return level;
      }
    }
    return null;
  }

  /**
   * 重要度設定の変更を関連システムに通知する
   */
  notifySettingsChanged() {
    // グローバル状態を更新
    setState('importanceSettings', {
      userSettings: Object.fromEntries(this.userImportanceSettings),
      mvdSettings: {
        s2: Object.fromEntries(this.mvdImportanceSettings[MVD_MODES.S2]),
        s4: Object.fromEntries(this.mvdImportanceSettings[MVD_MODES.S4]),
      },
      orderedPaths: [...this.orderedElementPaths],
      elementPathsByTab: Object.fromEntries(this.elementPathsByTab),
      lastModified: new Date().toISOString(),
    });

    // MVD設定情報をglobalStateに反映
    setState('importance.currentConfigId', this.currentConfigId);
    setState('importance.currentConfigName', this.currentConfigName);

    // EventBus経由でイベントを発行
    eventBus.emit(ImportanceEvents.SETTINGS_CHANGED, {
      manager: this,
      timestamp: Date.now(),
    });
  }

  /**
   * 重要度設定を検証する
   * @returns {Object} 検証結果
   */
  validateSettings() {
    const settingsObject = {
      elements: Object.fromEntries(this.userImportanceSettings),
      attributes: {},
      lastModified: new Date().toISOString(),
    };

    return validateImportanceSettings(settingsObject);
  }

  /**
   * 外部設定ファイルから重要度設定を読み込む
   * @param {string} configId - 設定ID ('mvd-combined', 's2', 's4')
   * @returns {Promise<boolean>} 読み込み成功フラグ
   */
  async loadExternalConfig(configId) {
    try {
      const normalizedConfigId = configId || MVD_MODES.COMBINED;

      if (![MVD_MODES.S2, MVD_MODES.S4, MVD_MODES.COMBINED].includes(normalizedConfigId)) {
        throw new Error(`不明な設定ID: ${configId}`);
      }

      // 初期化前の利用にも対応
      if (
        this.mvdImportanceSettings[MVD_MODES.S2].size === 0 ||
        this.mvdImportanceSettings[MVD_MODES.S4].size === 0
      ) {
        await this.initializeMvdSettings();
      }

      this.currentConfigId = normalizedConfigId;
      this.rebuildEffectiveImportanceSettings();

      this.notifySettingsChanged();
      return true;
    } catch (error) {
      console.error('[ImportanceManager] 外部設定の読み込みに失敗:', error);
      return false;
    }
  }

  /**
   * 現在の設定IDを取得
   * @returns {string|null} 設定ID
   */
  getCurrentConfigId() {
    return this.currentConfigId || null;
  }

  /**
   * 現在の設定名を取得
   * @returns {string|null} 設定名
   */
  getCurrentConfigName() {
    return this.currentConfigName || 'デフォルト';
  }

  /**
   * 重要度設定をリセットする
   */
  resetToDefaults() {
    this.userImportanceSettings.clear();
    this.orderedElementPaths = [];
    this.elementPathsByTab.clear();
    this.mvdImportanceSettings[MVD_MODES.S2] = new Map(
      this.defaultMvdImportanceSettings[MVD_MODES.S2],
    );
    this.mvdImportanceSettings[MVD_MODES.S4] = new Map(
      this.defaultMvdImportanceSettings[MVD_MODES.S4],
    );
    this.currentConfigId = MVD_MODES.COMBINED;
    this.currentConfigName = 'MVD S2+S4 (結合)';
    this.loadDefaultSettings();
    this.rebuildEffectiveImportanceSettings();
    this.notifySettingsChanged();
  }

  /**
   * 統計情報を取得する
   * @returns {Object} 統計情報
   */
  getStatistics() {
    const stats = {
      total: this.orderedElementPaths.length,
      byLevel: {},
    };

    // レベル別の統計
    for (const level of Object.values(IMPORTANCE_LEVELS)) {
      stats.byLevel[level] = 0;
    }

    for (const importance of this.userImportanceSettings.values()) {
      stats.byLevel[importance]++;
    }

    return stats;
  }

  /**
   * フォールバック統計をリセット
   */
  resetFallbackStats() {
    setState('importance.fallbackStats', {
      totalChecks: 0,
      fallbackCount: 0,
      undefinedPaths: new Set(),
    });
  }

  /**
   * 要素の重要度を取得する
   * @param {Object} element - 要素データ
   * @param {string} elementType - 要素タイプ（オプション）
   * @returns {string} 重要度レベル
   */
  getElementImportance(element, elementType = null) {
    if (!this.isInitialized) {
      return IMPORTANCE_LEVELS.REQUIRED; // デフォルト
    }

    // 要素タイプの決定
    let type = elementType;
    if (!type && element) {
      // element から要素タイプを推測
      if (typeof element.getAttribute === 'function') {
        // DOM Element の場合（あまり使われないが念のため）
        type = element.tagName;
      } else if (typeof element === 'object') {
        // JavaScript object の場合
        // elementType プロパティがあればそれを使用
        type = element.elementType || element.type;
      }
    }

    if (!type) {
      return IMPORTANCE_LEVELS.REQUIRED; // デフォルト
    }

    // 基本的な要素パス
    const basePath = `//ST_BRIDGE/${type}`;
    let importance = this.userImportanceSettings.get(basePath);

    if (importance === undefined) {
      // デフォルト値を返す
      importance = IMPORTANCE_LEVELS.REQUIRED;
    }

    return importance;
  }
}

// シングルトンインスタンス
let importanceManagerInstance = null;

/**
 * ImportanceManagerのシングルトンインスタンスを取得する
 * @returns {ImportanceManager} インスタンス
 */
export function getImportanceManager() {
  if (!importanceManagerInstance) {
    importanceManagerInstance = new ImportanceManager();
  }
  return importanceManagerInstance;
}

/**
 * 重要度管理システムを初期化する
 * @param {string} xsdContent - XSDスキーマ内容（オプション）
 * @returns {Promise<ImportanceManager>} 初期化済みのインスタンス
 */
export async function initializeImportanceManager(xsdContent = null) {
  const manager = getImportanceManager();

  // XSDコンテンツが提供されていない場合、スキーマファイルを読み込む
  if (!xsdContent) {
    try {
      const response = await fetch('./schemas/ST-Bridge202.xsd');
      if (response.ok) {
        xsdContent = await response.text();
        console.log('XSDスキーマを読み込みました: schemas/ST-Bridge202.xsd');
      }
    } catch (error) {
      console.warn('XSDスキーマの読み込みに失敗しました:', error);
    }
  }

  await manager.initialize(xsdContent);
  return manager;
}

// デフォルトエクスポート
export default ImportanceManager;
