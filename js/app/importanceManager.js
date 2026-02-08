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
import { DEFAULT_IMPORTANCE_SETTINGS, getXPathPattern } from '../config/importanceConfig.js';
import { loadConfigById } from '../config/importanceConfigLoader.js';
import { IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES } from '../constants/importanceLevels.js';
import {
  loadXsdSchema,
  getElementAttributes,
  getElementDefinition,
} from '../common-stb/parser/xsdSchemaParser.js';

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
    this.orderedElementPaths = [];
    this.elementPathsByTab = new Map();
    this.isInitialized = false;
    this.currentConfigId = 'mvd-combined'; // デフォルト: S2+S4
    this.currentConfigName = 'デフォルト';
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
   * 要素階層からXPathパスを再帰的に生成する
   * @param {string} elementName - 要素名
   * @param {string} parentPath - 親要素のパス
   * @param {Object} elementDef - 要素定義 {name, attributes, children, documentation}
   * @returns {string[]} 生成されたXPathパスの配列
   */
  generatePathsFromHierarchy(elementName, parentPath, elementDef) {
    const paths = [];
    const currentPath = `${parentPath}/${elementName}`;

    // 0. 要素自体のパスを追加（重要！）
    paths.push(currentPath);

    // 1. 属性パスを生成
    if (elementDef.attributes) {
      for (const [attrName] of elementDef.attributes) {
        paths.push(`${currentPath}/@${attrName}`);
      }
    }

    // 2. 子要素パスを再帰的に生成
    if (elementDef.children) {
      for (const [childName, childDef] of elementDef.children) {
        // 再帰呼び出しで子要素とその子孫のパスを取得
        const childPaths = this.generatePathsFromHierarchy(childName, currentPath, childDef);
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
        return;
      }

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

          // 要素タイプに応じた親パスを決定
          // セクション要素（StbSecColumn_RC、StbSecBeam_RC など）は //ST_BRIDGE/StbSections の下
          // 構造要素（StbColumn、StbBeam など）やその他の要素は //ST_BRIDGE の下
          // セクション要素は "StbSec" で始まる（STB_ELEMENT_TABSに含まれるルート要素のみ）
          const parentPath = elementId.startsWith('StbSec')
            ? '//ST_BRIDGE/StbSections'
            : '//ST_BRIDGE';

          // 階層から全パスを生成
          const paths = this.generatePathsFromHierarchy(elementId, parentPath, elementDef);

          for (const path of paths) {
            // リストに追加
            if (!currentPaths.includes(path)) {
              currentPaths.push(path);
            }
            if (!this.orderedElementPaths.includes(path)) {
              this.orderedElementPaths.push(path);
            }

            // 重要度設定がなければ追加
            if (!this.userImportanceSettings.has(path)) {
              // 属性はOPTIONAL、要素はREQUIRED
              const isAttribute = path.includes('/@');
              const level = isAttribute
                ? IMPORTANCE_LEVELS.OPTIONAL
                : IMPORTANCE_LEVELS.REQUIRED;
              this.userImportanceSettings.set(path, level);
            }
          }
        }
      }
    } catch (error) {
       console.error('XSD解析と設定生成中にエラーが発生しました:', error);
    }
  }

  /**
   * デフォルト重要度設定を読み込む
   * MVDベースのDEFAULT_IMPORTANCE_SETTINGSから設定を読み込む
   */
  async loadDefaultSettings() {
    // DEFAULT_IMPORTANCE_SETTINGSから設定を読み込む
    for (const [path, importance] of Object.entries(DEFAULT_IMPORTANCE_SETTINGS)) {
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
        // 重複チェック
        if (!this.orderedElementPaths.includes(path)) {
          this.orderedElementPaths.push(path);
          // DEFAULT_IMPORTANCE_SETTINGSにない場合はREQUIREDをデフォルトとする
          if (!this.userImportanceSettings.has(path)) {
            this.userImportanceSettings.set(path, IMPORTANCE_LEVELS.REQUIRED);
          }
          this.elementPathsByTab.get(tab.id).push(path);
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
    // 基本的な要素パス生成ロジック
    // 実際のXSDパーサーとの統合時により詳細に実装
    const basePaths = [
      `//ST_BRIDGE/${tabId}`,
      `//ST_BRIDGE/${tabId}/@id`,
      `//ST_BRIDGE/${tabId}/@guid`,
      `//ST_BRIDGE/${tabId}/@name`,
    ];

    // 特定要素の追加属性
    const additionalPaths = this.getAdditionalPathsForElement(tabId);

    return [...basePaths, ...additionalPaths];
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
    const importance = this.userImportanceSettings.get(elementPath);

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
      stats.undefinedPaths.add(elementPath);
      setState('importance.fallbackStats', stats);

      // デバッグログ（開発時のみ）
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.debug(`[Importance] Fallback to OPTIONAL: ${elementPath}`);
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

    this.userImportanceSettings.set(elementPath, importanceLevel);
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
    return segments.some((segment) => {
      if (candidates.has(segment)) {
        return true;
      }

      for (const candidate of candidates) {
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
    const candidates = this.buildTabPathCandidates(tabId);
    const matchedPaths = new Set(staticPaths);
    const allPaths = [...this.userImportanceSettings.keys()];
    const descendantRoots = new Set();

    const getPathElements = (path) =>
      this.extractPathElementSegments(path).filter((segment) => segment !== 'st_bridge');

    const collectDescendantRoots = (segments, triggerSegments) => {
      for (let i = 0; i < segments.length - 1; i++) {
        if (triggerSegments.has(segments[i])) {
          descendantRoots.add(segments[i + 1]);
        }
      }
    };

    for (const path of allPaths) {
      if (this.pathMatchesTab(path, candidates)) {
        matchedPaths.add(path);
        collectDescendantRoots(getPathElements(path), candidates);
      }
    }

    let expanded = true;
    while (expanded) {
      expanded = false;

      for (const path of allPaths) {
        if (matchedPaths.has(path)) {
          continue;
        }

        const segments = getPathElements(path);
        const belongsToDescendant = segments.some((segment) => {
          if (descendantRoots.has(segment)) {
            return true;
          }

          for (const root of descendantRoots) {
            if (segment.startsWith(`${root}_`)) {
              return true;
            }
          }

          return false;
        });

        if (belongsToDescendant) {
          matchedPaths.add(path);
          collectDescendantRoots(segments, descendantRoots);
          expanded = true;
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
    const lines = ['Element Path,Importance Level'];

    for (const path of this.orderedElementPaths) {
      const importance = this.getImportanceLevel(path);
      const importanceName = IMPORTANCE_LEVEL_NAMES[importance];
      lines.push(`"${path}","${importanceName}"`);
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

      // ヘッダー行をスキップ
      const dataLines = lines.slice(1);

      for (const line of dataLines) {
        const [pathStr, importanceStr] = this.parseCSVLine(line);
        if (pathStr && importanceStr) {
          const importanceLevel = this.getImportanceLevelFromName(importanceStr);
          if (importanceLevel && this.userImportanceSettings.has(pathStr)) {
            this.userImportanceSettings.set(pathStr, importanceLevel);
          }
        }
      }

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
   * @returns {[string, string]} パスと重要度の配列
   */
  parseCSVLine(line) {
    // 簡単なCSVパーサー（"で囲まれた値に対応）
    const matches = line.match(/"([^"]+)","([^"]+)"/);
    if (matches) {
      return [matches[1], matches[2]];
    }

    // カンマ区切りの場合
    const parts = line.split(',');
    if (parts.length >= 2) {
      return [parts[0].trim(), parts[1].trim()];
    }

    return [null, null];
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
      const config = await loadConfigById(configId);

      // 現在の設定をクリア
      this.userImportanceSettings.clear();
      this.orderedElementPaths = [];

      // 外部設定を読み込む
      for (const [path, importance] of Object.entries(config.settings)) {
        if (!this.orderedElementPaths.includes(path)) {
          this.orderedElementPaths.push(path);
        }
        this.userImportanceSettings.set(path, importance);
      }

      // 現在の設定IDを保存
      this.currentConfigId = configId;
      this.currentConfigName = config.name;

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
    this.currentConfigId = null;
    this.currentConfigName = null;
    this.loadDefaultSettings();
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
