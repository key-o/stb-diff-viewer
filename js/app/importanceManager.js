/**
 * @fileoverview 重要度管理システム
 *
 * StbDiffCheckerの重要度判定機能をJavaScriptに移植した中核システム。
 * ST-Bridge要素の重要度設定、管理、検証を提供します。
 *
 * 定数は constants/importanceConstants.js、
 * パス正規化は data/importance/pathNormalizer.js、
 * CSV入出力は app/importance/csvSerializer.js、
 * 統計収集は app/importance/statisticsCollector.js に分離。
 *
 * @module app/importanceManager
 */

import { validateImportanceSettings } from '../common-stb/validation/importanceValidation.js';
import { setState } from './globalState.js';
import { eventBus, ImportanceEvents } from '../data/events/index.js';
import { FALLBACK_IMPORTANCE_SETTINGS } from '../config/importanceConfig.js';
import { loadConfigById } from '../config/importanceConfigLoader.js';
import { IMPORTANCE_LEVELS } from '../constants/importanceLevels.js';
import {
  initializeXsdSchemas,
  getElementDefinition,
  validateAttributeValue,
} from '../common-stb/import/parser/xsdSchemaParser.js';
import { createLogger } from '../utils/logger.js';

// 分離モジュールからインポート
import {
  MVD_MODES,
  IMPORTANCE_PRIORITY,
  STB_ELEMENT_TABS,
  TAB_PARENT_PATHS,
} from '../constants/importanceConstants.js';
import {
  normalizeImportancePath,
  shouldSkipImportancePath,
} from '../data/importance/pathNormalizer.js';
import {
  exportToCSV as csvExportToCSV,
  importFromCSV as csvImportFromCSV,
} from './importance/csvSerializer.js';
import {
  collectStatistics,
  resetFallbackStats,
  recordFallback,
  recordCheck,
} from './importance/statisticsCollector.js';

const log = createLogger('app:importanceManager');

// STB_ELEMENT_TABSを再エクスポート（外部利用者の互換性維持）
export { STB_ELEMENT_TABS };

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
    this.s2ParameterChecks = new Map();
    this.orderedElementPaths = [];
    this.elementPathsByTab = new Map();
    this.isInitialized = false;
    this.currentConfigId = MVD_MODES.COMBINED;
    this.currentConfigName = 'MVD 統合';
  }

  /**
   * 生成済みの重要度設定・パス情報をクリアする
   */
  resetGeneratedSettings() {
    this.userImportanceSettings.clear();
    this.mvdImportanceSettings = {
      [MVD_MODES.S2]: new Map(),
      [MVD_MODES.S4]: new Map(),
    };
    this.defaultMvdImportanceSettings = {
      [MVD_MODES.S2]: new Map(),
      [MVD_MODES.S4]: new Map(),
    };
    this.s2ParameterChecks.clear();
    this.orderedElementPaths = [];
    this.elementPathsByTab = new Map();
  }

  normalizePath(path) {
    const normalized = normalizeImportancePath(path);
    if (!normalized || shouldSkipImportancePath(normalized)) {
      return null;
    }
    return normalized;
  }

  /**
   * 既存パス群に合わせて、大小文字違いの重複パスを正規化する
   * @param {string} path
   * @returns {string|null}
   */
  resolveCanonicalPath(path) {
    const normalized = this.normalizePath(path);
    if (!normalized) return null;

    if (this.orderedElementPaths.includes(normalized)) {
      return normalized;
    }

    const lower = normalized.toLowerCase();
    const orderedMatch = this.orderedElementPaths.find((p) => p.toLowerCase() === lower);
    if (orderedMatch) {
      return orderedMatch;
    }

    for (const existingPath of this.mvdImportanceSettings[MVD_MODES.S2].keys()) {
      if (existingPath.toLowerCase() === lower) {
        return existingPath;
      }
    }
    for (const existingPath of this.mvdImportanceSettings[MVD_MODES.S4].keys()) {
      if (existingPath.toLowerCase() === lower) {
        return existingPath;
      }
    }

    return normalized;
  }

  /**
   * 重要度管理システムを初期化する
   * @param {string} _xsdContent - ST-Bridge XSDスキーマ内容
   * @returns {Promise<boolean>} 初期化成功フラグ
   */
  async initialize(_xsdContent = null, options = {}) {
    const { reset = false } = options;
    try {
      if (reset) {
        this.resetGeneratedSettings();
      }

      // XSD解析と設定生成を実行（デフォルト設定ロード含む）
      // ファイルからのXSDロードを試み、パラメータを補完します
      await this.parseXsdAndGenerateSettings(_xsdContent);

      this.isInitialized = true;
      this.notifySettingsChanged();

      return true;
    } catch (error) {
      log.error('重要度マネージャーの初期化に失敗しました:', error);
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
      log.warn('[ImportanceManager] MVD設定ファイルの読み込みに失敗しました:', error);
    }

    this.s2ParameterChecks.clear();

    // 設定ファイルが読めなかった場合は機能利用不可
    if (!s2Config || !s4Config) {
      log.error(
        '[ImportanceManager] MVD設定ファイルが読み込めないため重要度設定を利用できません。',
      );
      this.mvdImportanceSettings[MVD_MODES.S2] = new Map();
      this.mvdImportanceSettings[MVD_MODES.S4] = new Map();
      this.rebuildEffectiveImportanceSettings();
      return;
    }

    // S2/S4 の REQUIRED パスセットを構築
    const s2RequiredPaths = new Set();
    for (const [rawPath, level] of Object.entries(s2Config.settings || {})) {
      if (level !== IMPORTANCE_LEVELS.REQUIRED) continue;
      const path = this.resolveCanonicalPath(rawPath);
      if (path) s2RequiredPaths.add(path);
    }

    const s4RequiredPaths = new Set();
    for (const [rawPath, level] of Object.entries(s4Config.settings || {})) {
      if (level !== IMPORTANCE_LEVELS.REQUIRED) continue;
      const path = this.resolveCanonicalPath(rawPath);
      if (path) s4RequiredPaths.add(path);
    }

    // S4 は S2 を包含するため S2 の REQUIRED は S4 にも追加
    for (const path of s2RequiredPaths) {
      s4RequiredPaths.add(path);
    }

    // 全既知パスを収集（XSD由来 + S2/S4 JSON由来）
    const allPaths = new Set([
      ...this.orderedElementPaths.map((p) => this.normalizePath(p)).filter(Boolean),
      ...s2RequiredPaths,
      ...s4RequiredPaths,
    ]);

    // orderedElementPaths を更新（JSON由来の新規パスを追加）
    for (const path of allPaths) {
      if (!this.orderedElementPaths.includes(path)) {
        this.orderedElementPaths.push(path);
      }
    }

    // フラットパス（JSON由来）から「要素名/@属性名」の末尾キーセットを構築。
    // XSD由来の階層パス（StbSecColumn_RC/StbSecFigureColumn_RC/StbSecColumn_RC_Rect/@width_X）
    // とフラットパス（StbSecColumn_RC_Rect/@width_X）のマッチングに使用。
    const buildTailKeySet = (requiredPaths) => {
      const tails = new Set();
      for (const p of requiredPaths) {
        const atIdx = p.lastIndexOf('/@');
        if (atIdx === -1) continue;
        const slashBefore = p.lastIndexOf('/', atIdx - 1);
        if (slashBefore === -1) continue;
        tails.add(p.slice(slashBefore + 1)); // "ElementName/@attrName"
      }
      return tails;
    };
    const s2TailKeys = buildTailKeySet(s2RequiredPaths);
    const s4TailKeys = buildTailKeySet(s4RequiredPaths);

    const matchesTailKey = (path, tailKeys) => {
      const atIdx = path.lastIndexOf('/@');
      if (atIdx === -1) return false;
      const slashBefore = path.lastIndexOf('/', atIdx - 1);
      if (slashBefore === -1) return false;
      return tailKeys.has(path.slice(slashBefore + 1));
    };

    // S2/S4 マップを構築：JSON の required リストに含まれる → REQUIRED、それ以外 → NOT_APPLICABLE
    const s2Map = new Map();
    const s4Map = new Map();
    for (const path of allPaths) {
      const isS2 = s2RequiredPaths.has(path) || matchesTailKey(path, s2TailKeys);
      const isS4 = s4RequiredPaths.has(path) || matchesTailKey(path, s4TailKeys);
      s2Map.set(path, isS2 ? IMPORTANCE_LEVELS.REQUIRED : IMPORTANCE_LEVELS.NOT_APPLICABLE);
      s4Map.set(path, isS4 ? IMPORTANCE_LEVELS.REQUIRED : IMPORTANCE_LEVELS.NOT_APPLICABLE);
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
    const normalizedPath = this.resolveCanonicalPath(path);
    if (!normalizedPath) return null;
    if (!this.orderedElementPaths.includes(normalizedPath)) {
      this.orderedElementPaths.push(normalizedPath);
    }
    // 未登録パスは対象外として追加
    if (!this.mvdImportanceSettings[MVD_MODES.S2].has(normalizedPath)) {
      this.mvdImportanceSettings[MVD_MODES.S2].set(
        normalizedPath,
        IMPORTANCE_LEVELS.NOT_APPLICABLE,
      );
    }
    if (!this.mvdImportanceSettings[MVD_MODES.S4].has(normalizedPath)) {
      this.mvdImportanceSettings[MVD_MODES.S4].set(
        normalizedPath,
        IMPORTANCE_LEVELS.NOT_APPLICABLE,
      );
    }
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
      this.currentConfigName = 'MVD 統合';
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
      return IMPORTANCE_LEVELS.NOT_APPLICABLE;
    }

    const map =
      mvdMode === MVD_MODES.S2
        ? this.mvdImportanceSettings[MVD_MODES.S2]
        : this.mvdImportanceSettings[MVD_MODES.S4];
    return map.get(normalizedPath) ?? IMPORTANCE_LEVELS.NOT_APPLICABLE;
  }

  /**
   * パスがXSDで必須かどうかを取得
   * @param {string} elementPath
   * @returns {{required: boolean, kind: 'attribute'|'element'|'unknown'}}
   */
  getSchemaRequirement(elementPath) {
    const normalizedPath = this.normalizePath(elementPath);
    if (!normalizedPath) {
      return { required: false, kind: 'unknown' };
    }

    const attrMarkerIndex = normalizedPath.lastIndexOf('/@');
    if (attrMarkerIndex < 0) {
      return { required: false, kind: 'element' };
    }

    const elementPathOnly = normalizedPath.slice(0, attrMarkerIndex);
    const attrName = normalizedPath.slice(attrMarkerIndex + 2);
    const elementName = elementPathOnly.split('/').filter(Boolean).pop();
    if (!elementName || !attrName) {
      return { required: false, kind: 'unknown' };
    }

    const elementDef = getElementDefinition(elementName);
    const attrDef = elementDef?.attributes?.get?.(attrName);
    if (!attrDef) {
      return { required: false, kind: 'attribute' };
    }

    return { required: !!attrDef.required, kind: 'attribute' };
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
      log.error(`無効な重要度レベル: ${importanceLevel}`);
      return false;
    }
    if (mvdMode !== MVD_MODES.S2 && mvdMode !== MVD_MODES.S4) {
      log.error(`無効なMVDモード: ${mvdMode}`);
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
    const normalizedParentPath =
      typeof parentPath === 'string' && parentPath.endsWith('/') && parentPath.length > 1
        ? parentPath.slice(0, -1)
        : parentPath;
    const parentEndsWithElementAtRoot =
      depth === 0 &&
      typeof normalizedParentPath === 'string' &&
      normalizedParentPath.toLowerCase().endsWith(`/${elementName.toLowerCase()}`);
    const currentPath = parentEndsWithElementAtRoot
      ? normalizedParentPath
      : `${normalizedParentPath}/${elementName}`;

    // 最大深度チェック（無限再帰防止）
    const MAX_DEPTH = 20;
    if (depth >= MAX_DEPTH) {
      log.warn(`[ImportanceManager] Max depth ${MAX_DEPTH} reached at: ${currentPath}`);
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
      // XSDをロード
      const loaded = await initializeXsdSchemas();
      if (!loaded) {
        log.warn('XSDのロードに失敗しました。補完をスキップします。');
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
      log.error('XSD解析と設定生成中にエラーが発生しました:', error);
    }

    await this.initializeMvdSettings();
  }

  /**
   * デフォルト重要度設定を読み込む
   * MVDベースのFALLBACK_IMPORTANCE_SETTINGSから設定を読み込む
   */
  async loadDefaultSettings() {
    // FALLBACK_IMPORTANCE_SETTINGSから設定を読み込む
    for (const [rawPath, importance] of Object.entries(FALLBACK_IMPORTANCE_SETTINGS)) {
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

        // FALLBACK_IMPORTANCE_SETTINGSにない場合はREQUIREDをデフォルトとする
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

    if (!importance) {
      recordFallback(normalizedPath);

      // デバッグログ（開発時のみ）
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        log.debug(`[Importance] Fallback to OPTIONAL: ${normalizedPath}`);
      }
    } else {
      recordCheck();
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
      log.error(`無効な重要度レベル: ${importanceLevel}`);
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
    return csvExportToCSV(
      this.orderedElementPaths,
      (path, mode) => this.getMvdImportanceLevel(path, mode),
      (path) => this.getImportanceLevel(path),
    );
  }

  /**
   * 重要度設定をJSON形式（mvd-s2.json互換フォーマット）でエクスポートする
   * @param {string} mvdLevel - 's2' | 's4' | 'combined'
   * @returns {string} JSON形式の文字列
   */
  exportToJSON(mvdLevel = 'combined') {
    const elements = {};

    if (mvdLevel === 'combined' || mvdLevel === 's2') {
      for (const [path, level] of this.mvdImportanceSettings[MVD_MODES.S2].entries()) {
        if (level !== IMPORTANCE_LEVELS.REQUIRED) continue;
        // path例: //ST_BRIDGE/StbColumn/@id → elementName: StbColumn, attr: id
        const match = path.match(/\/\/ST_BRIDGE\/([^/]+)\/@(.+)/);
        if (!match) continue;
        const [, elementName, attr] = match;
        if (!elements[elementName]) elements[elementName] = { required: [] };
        if (!elements[elementName].required.includes(attr)) {
          elements[elementName].required.push(attr);
        }
      }
    }

    const result = {
      version: '1.0',
      mvdLevel: mvdLevel === 'combined' ? 'combined' : mvdLevel,
      schemaVersion: '2.0.2',
      description: `MVD ${mvdLevel.toUpperCase()} - エクスポート設定`,
      elements,
    };
    return JSON.stringify(result, null, 2);
  }

  /**
   * JSON形式の重要度設定をインポートする（mvd-s2.json互換フォーマット）
   * @param {string} jsonContent - JSON文字列
   * @returns {boolean} インポート成功フラグ
   */
  importFromJSON(jsonContent) {
    try {
      const config = JSON.parse(jsonContent);
      if (!config.elements || typeof config.elements !== 'object') {
        return false;
      }

      const targetMvd = config.mvdLevel === 's4' ? [MVD_MODES.S4] : [MVD_MODES.S2, MVD_MODES.S4];

      for (const [elementName, elementDef] of Object.entries(config.elements)) {
        for (const attr of elementDef.required || []) {
          const path = `//ST_BRIDGE/${elementName}/@${attr}`;
          for (const mode of targetMvd) {
            this.setMvdImportanceLevel(path, mode, IMPORTANCE_LEVELS.REQUIRED, {
              notify: false,
              rebuild: false,
            });
          }
        }
      }

      this.rebuildEffectiveImportanceSettings();
      this.notifySettingsChanged();
      return true;
    } catch (error) {
      log.error('JSONのインポートに失敗しました:', error);
      return false;
    }
  }

  /**
   * CSV形式の重要度設定をインポートする
   * @param {string} csvContent - CSV形式の文字列
   * @returns {boolean} インポート成功フラグ
   */
  importFromCSV(csvContent) {
    return csvImportFromCSV(
      csvContent,
      (path, mode, level, opts) => this.setMvdImportanceLevel(path, mode, level, opts),
      () => this.rebuildEffectiveImportanceSettings(),
      () => this.notifySettingsChanged(),
      log,
    );
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
      log.error('[ImportanceManager] 外部設定の読み込みに失敗:', error);
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
    this.currentConfigName = 'MVD 統合';
    this.loadDefaultSettings();
    this.rebuildEffectiveImportanceSettings();
    this.notifySettingsChanged();
  }

  /**
   * 統計情報を取得する
   * @returns {Object} 統計情報
   */
  getStatistics() {
    return collectStatistics(
      this.orderedElementPaths,
      this.userImportanceSettings,
      (path, mode) => this.getMvdImportanceLevel(path, mode),
      (path) => this.getSchemaRequirement(path),
    );
  }

  /**
   * フォールバック統計をリセット
   */
  resetFallbackStats() {
    resetFallbackStats();
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

    const resolvedType = type.startsWith('Stb') ? type : `Stb${type}`;

    const getElementAttributeValue = (target, attrName) => {
      if (!target) return undefined;
      if (typeof target.getAttribute === 'function') {
        const value = target.getAttribute(attrName);
        return value === null ? undefined : value;
      }
      return target[attrName];
    };

    const elementDef = getElementDefinition(resolvedType);
    const schemaAttributes = new Set(
      elementDef?.attributes ? Array.from(elementDef.attributes.keys()) : [],
    );

    // この要素タイプに対して設定されている属性重要度パスを対象に、
    // 必須チェック + 値制約チェック（JSONスキーマ）を行う。
    const pathMarker = `/${resolvedType}/@`;
    let hasTargetViolation = false;

    for (const [path, configuredLevel] of this.userImportanceSettings.entries()) {
      if (!path || !path.includes(pathMarker)) continue;
      if (configuredLevel !== IMPORTANCE_LEVELS.REQUIRED) continue;

      const markerIndex = path.lastIndexOf('/@');
      if (markerIndex < 0) continue;
      const attrName = path.slice(markerIndex + 2);
      if (!attrName) continue;
      if (schemaAttributes.size > 0 && !schemaAttributes.has(attrName)) continue;

      const checkOptions = this.s2ParameterChecks.get(path) || {
        checkRequired: true,
        checkValue: true,
      };
      if (!checkOptions.checkRequired && !checkOptions.checkValue) {
        continue;
      }

      const value = getElementAttributeValue(element, attrName);
      const isMissing = value === undefined || value === null || value === '';
      if (isMissing && checkOptions.checkRequired) {
        hasTargetViolation = true;
        continue;
      }

      if (!isMissing && checkOptions.checkValue) {
        const validation = validateAttributeValue(resolvedType, attrName, String(value));
        if (!validation.valid) {
          hasTargetViolation = true;
        }
      }
    }

    if (hasTargetViolation) {
      return IMPORTANCE_LEVELS.REQUIRED;
    }

    return IMPORTANCE_LEVELS.NOT_APPLICABLE;
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
        log.info('XSDスキーマを読み込みました: schemas/ST-Bridge202.xsd');
      }
    } catch (error) {
      log.warn('XSDスキーマの読み込みに失敗しました:', error);
    }
  }

  await manager.initialize(xsdContent);
  return manager;
}

// デフォルトエクスポート
export default ImportanceManager;
