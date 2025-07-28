/**
 * @fileoverview サジェストエンジン
 *
 * STBパラメータ編集時のサジェスト機能を提供するコアモジュール:
 * - XSDスキーマからの列挙値抽出
 * - 文脈に応じたサジェストソート
 * - 使用頻度ベースの最適化
 * - キャッシュ機能
 */

import { 
  getAttributeInfo, 
  hasEnumerationValues,
  isSchemaLoaded 
} from '../parser/xsdSchemaParser.js';

/**
 * サジェストエンジンクラス
 */
export class SuggestionEngine {
  constructor() {
    this.cache = new Map();
    this.usageStats = new Map();
    this.loadUsageStats();
  }

  /**
   * 指定された要素・属性のサジェスト候補を取得
   * @param {string} elementType - 要素タイプ (Column, Beam等)
   * @param {string} attributeName - 属性名
   * @param {Object} context - コンテキスト情報
   * @param {string} context.currentValue - 現在の値
   * @param {string} context.elementId - 要素ID
   * @returns {Array<string>} サジェスト候補の配列
   */
  static getSuggestions(elementType, attributeName, context = {}) {
    const engine = new SuggestionEngine();
    return engine.getSuggestions(elementType, attributeName, context);
  }

  /**
   * サジェスト候補を取得（インスタンスメソッド）
   */
  getSuggestions(elementType, attributeName, context = {}) {
    const cacheKey = `${elementType}:${attributeName}`;
    
    // キャッシュチェック
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      // 5分間有効
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return this.sortSuggestionsByRelevance(cached.suggestions, context.currentValue);
      }
    }

    // 新しいサジェストを生成
    const suggestions = this.generateSuggestions(elementType, attributeName, context);
    
    // キャッシュに保存
    this.cache.set(cacheKey, {
      suggestions,
      timestamp: Date.now()
    });

    return this.sortSuggestionsByRelevance(suggestions, context.currentValue);
  }

  /**
   * サジェスト候補を生成
   * @param {string} elementType - 要素タイプ
   * @param {string} attributeName - 属性名
   * @param {Object} context - コンテキスト
   * @returns {Array<string>} 生成されたサジェスト候補
   */
  generateSuggestions(elementType, attributeName, context) {
    let suggestions = [];

    // 1. XSDスキーマからの列挙値
    const enumerationSuggestions = this.getEnumerationSuggestions(elementType, attributeName);
    suggestions = suggestions.concat(enumerationSuggestions);

    // 2. 動的サジェスト（既存モデル内の使用値）
    const dynamicSuggestions = this.getDynamicSuggestions(elementType, attributeName, context);
    suggestions = suggestions.concat(dynamicSuggestions);

    // 3. 構造関連サジェスト
    const structuralSuggestions = this.getStructuralSuggestions(elementType, attributeName, context);
    suggestions = suggestions.concat(structuralSuggestions);

    // 重複を除去
    return [...new Set(suggestions)];
  }

  /**
   * XSDスキーマから列挙値を取得
   * @param {string} elementType - 要素タイプ
   * @param {string} attributeName - 属性名
   * @returns {Array<string>} 列挙値候補
   */
  getEnumerationSuggestions(elementType, attributeName) {
    if (!isSchemaLoaded()) {
      return [];
    }

    const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
    
    try {
      const attrInfo = getAttributeInfo(tagName, attributeName);
      if (attrInfo && attrInfo.type) {
        // XSDスキーマから列挙値を取得するヘルパー関数を使用
        return this.getEnumerationValuesFromSchema(attrInfo.type);
      }
      
      return [];
    } catch (error) {
      console.warn(`Error getting enumeration suggestions for ${tagName}.${attributeName}:`, error);
      return [];
    }
  }

  /**
   * XSDスキーマから列挙値を取得するヘルパー関数
   * @param {string} typeName - 型名
   * @returns {Array<string>} 列挙値の配列
   */
  getEnumerationValuesFromSchema(typeName) {
    if (!window.xsdSchema) return [];

    try {
      // カスタム型の定義を検索
      const simpleType = window.xsdSchema.querySelector(
        `xs\\:simpleType[name="${typeName}"], simpleType[name="${typeName}"]`
      );
      if (!simpleType) return [];

      // 列挙値を取得
      const enumerations = simpleType.querySelectorAll(
        'xs\\:enumeration, enumeration'
      );
      return Array.from(enumerations)
        .map(enumElement => enumElement.getAttribute('value'))
        .filter(v => v);
    } catch (error) {
      console.warn(`Error extracting enumeration values for type ${typeName}:`, error);
      return [];
    }
  }

  /**
   * 動的サジェスト（既存モデル内の値）を取得
   * @param {string} elementType - 要素タイプ
   * @param {string} attributeName - 属性名
   * @param {Object} context - コンテキスト
   * @returns {Array<string>} 動的サジェスト候補
   */
  getDynamicSuggestions(elementType, attributeName, context) {
    const suggestions = [];

    try {
      // 現在読み込まれているモデルから同種の属性値を収集
      const docs = [window.docA, window.docB].filter(doc => doc);
      
      for (const doc of docs) {
        const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
        const elements = doc.querySelectorAll(tagName);
        
        elements.forEach(element => {
          const value = element.getAttribute(attributeName);
          if (value && value.trim() && !suggestions.includes(value.trim())) {
            suggestions.push(value.trim());
          }
        });
      }
    } catch (error) {
      console.warn(`Error getting dynamic suggestions:`, error);
    }

    return suggestions.slice(0, 10); // 最大10個
  }

  /**
   * 構造関連サジェストを取得
   * @param {string} elementType - 要素タイプ
   * @param {string} attributeName - 属性名
   * @param {Object} context - コンテキスト
   * @returns {Array<string>} 構造関連サジェスト候補
   */
  getStructuralSuggestions(elementType, attributeName, context) {
    const suggestions = [];

    try {
      // 断面名の場合の標準的な値
      if (attributeName === 'id_section' || attributeName.includes('section')) {
        suggestions.push(...this.getSectionSuggestions(elementType));
      }

      // 材料強度の場合の標準値
      if (attributeName === 'strength_concrete') {
        suggestions.push('Fc21', 'Fc24', 'Fc27', 'Fc30', 'Fc33', 'Fc36');
      }

      // 鋼材強度の場合の標準値
      if (attributeName === 'strength_steel') {
        suggestions.push('SN400', 'SN490', 'SM400', 'SM490', 'SS400');
      }

      // kind属性の構造関連値
      if (attributeName === 'kind') {
        suggestions.push(...this.getKindSuggestions(elementType));
      }

    } catch (error) {
      console.warn(`Error getting structural suggestions:`, error);
    }

    return suggestions;
  }

  /**
   * 断面名のサジェストを取得
   * @param {string} elementType - 要素タイプ
   * @returns {Array<string>} 断面名候補
   */
  getSectionSuggestions(elementType) {
    const suggestions = [];

    try {
      // 既存の断面定義から候補を取得
      const docs = [window.docA, window.docB].filter(doc => doc);
      
      for (const doc of docs) {
        const sectionElements = doc.querySelectorAll('StbSections > *');
        sectionElements.forEach(section => {
          const id = section.getAttribute('id');
          const name = section.getAttribute('name');
          if (id && !suggestions.includes(id)) {
            suggestions.push(id);
          }
          if (name && !suggestions.includes(name)) {
            suggestions.push(name);
          }
        });
      }
    } catch (error) {
      console.warn('Error getting section suggestions:', error);
    }

    return suggestions;
  }

  /**
   * kind属性のサジェストを取得
   * @param {string} elementType - 要素タイプ
   * @returns {Array<string>} kind候補
   */
  getKindSuggestions(elementType) {
    // 要素タイプに応じた適切なkind値
    const kindMap = {
      'Column': ['ON_GIRDER', 'ON_BEAM', 'ON_GRID'],
      'Girder': ['ON_GIRDER', 'ON_COLUMN'],
      'Beam': ['ON_BEAM', 'ON_COLUMN', 'ON_GIRDER'],
      'Brace': ['ON_COLUMN', 'ON_BEAM'],
      'Slab': ['ON_SLAB', 'ON_BEAM', 'ON_GIRDER'],
      'Wall': ['ON_GRID', 'ON_COLUMN']
    };

    return kindMap[elementType] || [];
  }

  /**
   * 関連性に基づいてサジェストをソート
   * @param {Array<string>} suggestions - サジェスト候補
   * @param {string} currentValue - 現在の値
   * @returns {Array<string>} ソート済みサジェスト
   */
  sortSuggestionsByRelevance(suggestions, currentValue) {
    if (!suggestions || suggestions.length === 0) {
      return suggestions;
    }

    return suggestions.sort((a, b) => {
      // 1. 現在値との完全一致を最優先
      if (a === currentValue) return -1;
      if (b === currentValue) return 1;

      // 2. 部分一致による優先度
      if (currentValue) {
        const aMatches = this.getMatchScore(a, currentValue);
        const bMatches = this.getMatchScore(b, currentValue);
        if (aMatches !== bMatches) {
          return bMatches - aMatches;
        }
      }

      // 3. 使用頻度による優先度
      const aUsage = this.getUsageCount(a);
      const bUsage = this.getUsageCount(b);
      if (aUsage !== bUsage) {
        return bUsage - aUsage;
      }

      // 4. アルファベット順
      return a.localeCompare(b);
    });
  }

  /**
   * マッチスコアを計算
   * @param {string} suggestion - サジェスト候補
   * @param {string} currentValue - 現在の値
   * @returns {number} マッチスコア
   */
  getMatchScore(suggestion, currentValue) {
    if (!suggestion || !currentValue) return 0;

    const suggestionLower = suggestion.toLowerCase();
    const currentLower = currentValue.toLowerCase();

    // 完全一致
    if (suggestionLower === currentLower) return 100;

    // 前方一致
    if (suggestionLower.startsWith(currentLower)) return 80;

    // 後方一致
    if (suggestionLower.endsWith(currentLower)) return 60;

    // 部分一致
    if (suggestionLower.includes(currentLower)) return 40;

    // 類似度（Levenshtein距離ベース）
    const distance = this.levenshteinDistance(suggestionLower, currentLower);
    const maxLength = Math.max(suggestionLower.length, currentLower.length);
    const similarity = (maxLength - distance) / maxLength;
    
    return Math.floor(similarity * 20); // 0-20の範囲
  }

  /**
   * Levenshtein距離を計算
   * @param {string} str1 - 文字列1
   * @param {string} str2 - 文字列2
   * @returns {number} Levenshtein距離
   */
  levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,     // deletion
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 使用回数を取得
   * @param {string} value - 値
   * @returns {number} 使用回数
   */
  getUsageCount(value) {
    return this.usageStats.get(value) || 0;
  }

  /**
   * 使用統計を記録
   * @param {string} elementType - 要素タイプ
   * @param {string} attributeName - 属性名
   * @param {string} value - 使用された値
   */
  static recordUsage(elementType, attributeName, value) {
    const engine = new SuggestionEngine();
    engine.recordUsage(elementType, attributeName, value);
  }

  /**
   * 使用統計を記録（インスタンスメソッド）
   */
  recordUsage(elementType, attributeName, value) {
    if (!value || value.trim() === '') return;

    const normalizedValue = value.trim();
    const currentCount = this.usageStats.get(normalizedValue) || 0;
    this.usageStats.set(normalizedValue, currentCount + 1);

    // ローカルストレージに保存
    this.saveUsageStats();

    console.log(`Usage recorded: ${elementType}.${attributeName} = "${normalizedValue}" (count: ${currentCount + 1})`);
  }

  /**
   * 使用統計をローカルストレージから読み込み
   */
  loadUsageStats() {
    try {
      const stored = localStorage.getItem('stbDiffViewer_usageStats');
      if (stored) {
        const data = JSON.parse(stored);
        this.usageStats = new Map(Object.entries(data));
      }
    } catch (error) {
      console.warn('Error loading usage stats:', error);
      this.usageStats = new Map();
    }
  }

  /**
   * 使用統計をローカルストレージに保存
   */
  saveUsageStats() {
    try {
      const data = Object.fromEntries(this.usageStats);
      localStorage.setItem('stbDiffViewer_usageStats', JSON.stringify(data));
    } catch (error) {
      console.warn('Error saving usage stats:', error);
    }
  }

  /**
   * キャッシュをクリア
   */
  static clearCache() {
    const engine = new SuggestionEngine();
    engine.cache.clear();
    console.log('Suggestion cache cleared');
  }

  /**
   * 使用統計をクリア
   */
  static clearUsageStats() {
    const engine = new SuggestionEngine();
    engine.usageStats.clear();
    engine.saveUsageStats();
    console.log('Usage statistics cleared');
  }

  /**
   * デバッグ情報を出力
   */
  static getDebugInfo() {
    const engine = new SuggestionEngine();
    return {
      cacheSize: engine.cache.size,
      usageStatsSize: engine.usageStats.size,
      topUsedValues: Array.from(engine.usageStats.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }))
    };
  }
}

// デフォルトエクスポート
export default SuggestionEngine;