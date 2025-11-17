/**
 * @fileoverview JSON統合データパーサー
 *
 * このファイルは、JavaScript-Python統合システムで生成されたJSON形式の
 * 建築構造データを解析・処理し、3D表示システムで利用可能な形式に変換します。
 *
 * 主な機能:
 * - JSON構造データの読み込みと検証
 * - 各種構造要素（柱、梁、ブレース、壁、床、基礎）の抽出
 * - STB XML形式との互換性維持
 * - 3Dレンダリング用データ構造への変換
 */

import { ensureUnifiedSectionType } from '../common/sectionTypeUtil.js';
import {
  deriveDimensionsFromAttributes,
  extractDimensions,
  getWidth,
  getHeight,
  getDiameter,
  getRadius,
  isCircularProfile,
  isRectangularProfile,
  validateDimensions,
} from '../common/dimensionNormalizer.js';

/**
 * JSON統合データパーサークラス
 */
export class JsonDataParser {
  constructor() {
    this.jsonData = null;
    this.metadata = null;
    this.parsedElements = {
      columns: [],
      beams: [],
      braces: [],
      walls: [],
      slabs: [],
      footings: [],
      piles: [],
    };
    this.statistics = {
      totalElements: 0,
      elementCounts: {},
      parseTime: 0,
      errors: [],
      warnings: [],
    };
  }

  /**
   * JSONファイルからデータを読み込み、解析を実行
   * @param {string|File} input - JSONファイルパスまたはFileオブジェクト
   * @returns {Promise<Object>} 解析結果
   */
  async parseFromFile(input) {
    console.log("JsonDataParser: Starting JSON file parsing...");
    const startTime = performance.now();

    try {
      let jsonContent;

      if (input instanceof File) {
        jsonContent = await this._readFileContent(input);
      } else if (typeof input === "string") {
        // URLまたはファイルパスからの読み込み
        const response = await fetch(input);
        if (!response.ok) {
          throw new Error(`Failed to fetch JSON file: ${response.status}`);
        }
        jsonContent = await response.text();
      } else {
        throw new Error(
          "Invalid input type. Expected File object or string path."
        );
      }

      // JSON解析
      this.jsonData = JSON.parse(jsonContent);

      // データ検証
      this._validateJsonStructure();

      // メタデータ抽出
      this._extractMetadata();

      // 要素解析
      this._parseAllElements();

      // 統計情報更新
      this.statistics.parseTime = performance.now() - startTime;
      this.statistics.totalElements = this._calculateTotalElements();

      console.log(
        `JsonDataParser: Parsing completed in ${this.statistics.parseTime.toFixed(
          1
        )}ms`
      );
      console.log(
        `JsonDataParser: Found ${this.statistics.totalElements} structural elements`
      );

      return this._createParsingResult();
    } catch (error) {
      this.statistics.errors.push(`JSON parsing failed: ${error.message}`);
      console.error("JsonDataParser: Parsing failed:", error);
      throw new Error(`JSON data parsing failed: ${error.message}`);
    }
  }

  /**
   * JSONオブジェクトから直接解析（テスト用）
   * @param {Object} jsonObject - JSONオブジェクト
   * @returns {Object} 解析結果
   */
  parseFromObject(jsonObject) {
    console.log("JsonDataParser: Parsing from JSON object...");
    const startTime = performance.now();

    try {
      this.jsonData = jsonObject;

      this._validateJsonStructure();
      this._extractMetadata();
      this._parseAllElements();

      this.statistics.parseTime = performance.now() - startTime;
      this.statistics.totalElements = this._calculateTotalElements();

      console.log(
        `JsonDataParser: Object parsing completed in ${this.statistics.parseTime.toFixed(
          1
        )}ms`
      );

      return this._createParsingResult();
    } catch (error) {
      this.statistics.errors.push(
        `JSON object parsing failed: ${error.message}`
      );
      console.error("JsonDataParser: Object parsing failed:", error);
      throw new Error(`JSON object parsing failed: ${error.message}`);
    }
  }

  /**
   * STB形式との互換性を保つためのデータ変換
   * @returns {Object} STB互換形式データ
   */
  toStbCompatibleFormat() {
    console.log("JsonDataParser: Converting to STB compatible format...");

    const stbData = {
      // STB XML風のメタデータ
      projectInfo: {
        name: this.metadata?.description || "JSON Imported Model",
        version: this.metadata?.version || "1.0",
        timestamp: this.metadata?.timestamp || new Date().toISOString(),
      },

      // ノード情報（JSONでは直接座標を使用するため、仮想ノードマップを作成）
      nodeMap: this._createVirtualNodeMap(),

      // 各種構造要素
      columns: this._convertToStbFormat(this.parsedElements.columns, "column"),
      beams: this._convertToStbFormat(this.parsedElements.beams, "beam"),
      braces: this._convertToStbFormat(this.parsedElements.braces, "brace"),
      walls: this._convertToStbFormat(this.parsedElements.walls, "wall"),
      slabs: this._convertToStbFormat(this.parsedElements.slabs, "slab"),
      footings: this._convertToStbFormat(
        this.parsedElements.footings,
        "footing"
      ),
      piles: this._convertToStbFormat(this.parsedElements.piles, "pile"),
    };

    console.log("JsonDataParser: STB conversion completed");
    return stbData;
  }

  /**
   * ファイル内容を読み込み
   * @private
   */
  async _readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = (error) =>
        reject(new Error(`File reading failed: ${error}`));
      reader.readAsText(file, "utf-8");
    });
  }

  /**
   * JSON構造の検証
   * @private
   */
  _validateJsonStructure() {
    if (!this.jsonData) {
      throw new Error("JSON data is null or undefined");
    }

    // Python生成のJSON構造 (直接ルートに要素配列) または JS期待構造 (elements内) をサポート
    const hasElementsWrapper = this.jsonData.elements;
    const hasDirectElements =
      this.jsonData.beam_defs ||
      this.jsonData.column_defs ||
      this.jsonData.brace_defs;

    if (!hasElementsWrapper && !hasDirectElements) {
      throw new Error(
        'Missing structural element data. Expected either "elements" field or direct element arrays'
      );
    }

    // Python生成JSON構造の場合、elements wrapperを作成
    if (!hasElementsWrapper && hasDirectElements) {
      console.log(
        "JsonDataParser: Detected Python-generated JSON structure, creating elements wrapper"
      );
      this.jsonData = {
        elements: {
          beam_defs: this.jsonData.beam_defs || [],
          column_defs: this.jsonData.column_defs || [],
          brace_defs: this.jsonData.brace_defs || [],
          wall_defs: this.jsonData.wall_defs || [],
          slab_defs: this.jsonData.slab_defs || [],
          footing_defs: this.jsonData.footing_defs || [],
          pile_defs: this.jsonData.pile_defs || [],
        },
        metadata: this.jsonData.metadata || {},
      };
    }

    // メタデータの検証（オプション）
    if (this.jsonData.metadata) {
      const metadata = this.jsonData.metadata;
      if (metadata.version && !this._isValidVersion(metadata.version)) {
        this.statistics.warnings.push(
          `Potentially incompatible version: ${metadata.version}`
        );
      }
    }

    console.log(
      "JsonDataParser: JSON structure validation and normalization completed"
    );
  }

  /**
   * メタデータの抽出
   * @private
   */
  _extractMetadata() {
    this.metadata = this.jsonData.metadata || {};

    console.log("JsonDataParser: Extracted metadata:", {
      source: this.metadata.source,
      version: this.metadata.version,
      totalElements: this.metadata.total_elements,
      description: this.metadata.description,
    });
  }

  /**
   * 全構造要素の解析
   * @private
   */
  _parseAllElements() {
    console.log("JsonDataParser: Parsing all structural elements...");

    const elements = this.jsonData.elements;

    // 各要素タイプの解析
    this.parsedElements.columns = this._parseElementArray(
      elements.column_defs || [],
      "column"
    );
    this.parsedElements.beams = this._parseElementArray(
      elements.beam_defs || [],
      "beam"
    );
    this.parsedElements.braces = this._parseElementArray(
      elements.brace_defs || [],
      "brace"
    );
    this.parsedElements.walls = this._parseElementArray(
      elements.wall_defs || [],
      "wall"
    );
    this.parsedElements.slabs = this._parseElementArray(
      elements.slab_defs || [],
      "slab"
    );
    this.parsedElements.footings = this._parseElementArray(
      elements.footing_defs || [],
      "footing"
    );
    this.parsedElements.piles = this._parseElementArray(
      elements.pile_defs || [],
      "pile"
    );

    // 統計更新
    this.statistics.elementCounts = {
      columns: this.parsedElements.columns.length,
      beams: this.parsedElements.beams.length,
      braces: this.parsedElements.braces.length,
      walls: this.parsedElements.walls.length,
      slabs: this.parsedElements.slabs.length,
      footings: this.parsedElements.footings.length,
      piles: this.parsedElements.piles.length,
    };

    console.log(
      "JsonDataParser: Element parsing summary:",
      this.statistics.elementCounts
    );
  }

  /**
   * 要素配列の解析
   * @private
   */
  _parseElementArray(elementArray, elementType) {
    const parsedElements = [];

    elementArray.forEach((element, index) => {
      try {
        const parsedElement = this._parseElement(element, elementType);
        if (parsedElement) {
          parsedElements.push(parsedElement);
        }
      } catch (error) {
        this.statistics.errors.push(
          `Failed to parse ${elementType} at index ${index}: ${error.message}`
        );
        console.warn(
          `JsonDataParser: Skipping ${elementType} at index ${index}:`,
          error
        );
      }
    });

    return parsedElements;
  }

  /**
   * 個別要素の解析
   * @private
   */
  _parseElement(element, elementType) {
    // 基本検証
    if (!element.id) {
      throw new Error('Element missing required "id" field');
    }

    if (!element.geometry) {
      throw new Error('Element missing required "geometry" field');
    }

    // 断面データの検証（可変断面構造に対応）
    const sectionData = this._extractSectionData(element, elementType);
    if (!sectionData) {
      throw new Error('Element missing required "section" field');
    }

    // 座標データの正規化
    const geometry = this._normalizeGeometry(element.geometry);
    const section = this._normalizeSection(sectionData);

    // 解析済み要素の作成
    const parsedElement = {
      // 基本情報
      id: element.id,
      name: element.name || `${elementType}_${element.id}`,
      tag: element.tag || element.id,
      elementType: elementType,

      // 幾何情報
      geometry: geometry,

      // 断面情報
      section: section,

      // 材料情報
      material: element.material || { type: "Unknown", name: "Default" },

      // 構造情報
      structural_info: element.structural_info || {},

      // JSON形式フラグ
      isJsonInput: true,

      // 元データ参照
      originalData: element,
    };

    return parsedElement;
  }

  /**
   * 断面データの抽出（可変断面構造対応）
   * @private
   */
  _extractSectionData(element, elementType) {
    // 通常の単一断面
    if (element.section) {
      return element.section;
    }

    // 可変断面（テーパー要素）の処理
    if (element.section_start && element.section_end) {
      // 開始断面を使用（ProfileBased生成器は単一断面を期待）
      console.log(
        `JsonDataParser: ${elementType} "${
          element.name || element.id
        }" - タペッド要素検出、開始断面を使用`
      );
      return element.section_start;
    }

    // 開始断面のみの場合
    if (element.section_start) {
      console.log(
        `JsonDataParser: ${elementType} "${
          element.name || element.id
        }" - 開始断面のみ検出`
      );
      return element.section_start;
    }

    // 終了断面のみの場合
    if (element.section_end) {
      console.log(
        `JsonDataParser: ${elementType} "${
          element.name || element.id
        }" - 終了断面のみ検出`
      );
      return element.section_end;
    }

    // 断面データが見つからない場合
    console.warn(
      `JsonDataParser: ${elementType} "${
        element.name || element.id
      }" - 断面データが見つかりません`
    );
    return null;
  }

  /**
   * 幾何情報の正規化
   * @private
   */
  _normalizeGeometry(geometry) {
    const normalized = { ...geometry };

    // 座標データの正規化（配列形式に統一）
    if (geometry.start_point) {
      normalized.start_point = Array.isArray(geometry.start_point)
        ? geometry.start_point
        : [
            geometry.start_point.x || 0,
            geometry.start_point.y || 0,
            geometry.start_point.z || 0,
          ];
    }

    if (geometry.end_point) {
      normalized.end_point = Array.isArray(geometry.end_point)
        ? geometry.end_point
        : [
            geometry.end_point.x || 0,
            geometry.end_point.y || 0,
            geometry.end_point.z || 0,
          ];
    }

    // 長さの計算（提供されていない場合）
    if (!normalized.length && normalized.start_point && normalized.end_point) {
      const dx = normalized.end_point[0] - normalized.start_point[0];
      const dy = normalized.end_point[1] - normalized.start_point[1];
      const dz = normalized.end_point[2] - normalized.start_point[2];
      normalized.length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // 回転角の正規化
    if (geometry.rotation === null || geometry.rotation === undefined) {
      normalized.rotation = 0;
    }

    // 座標系の確認（mm単位であることをログ出力）
    if (
      normalized.start_point &&
      normalized.start_point.some((coord) => Math.abs(coord) > 100)
    ) {
      console.debug(
        "JsonDataParser: Detected coordinates in mm scale (Python JSON format)"
      );
    }

    return normalized;
  }

  /**
   * 断面情報の正規化
   * @private
   */
  _normalizeSection(section) {
    const normalized = { ...section };

    // 断面タイプの統一（profile_type / sectionType の alias を section_type に集約）
    ensureUnifiedSectionType(normalized);

    // profile_type も同期（後方互換性のため）
    if (normalized.section_type) {
      normalized.profile_type = normalized.section_type;
    }

    // 断面寸法の正規化（dimensionNormalizerを使用）
    if (section.dimensions) {
      // オブジェクト形式の寸法データをNamedNodeMap風に変換
      const normalizedDims = deriveDimensionsFromAttributes(section.dimensions);

      if (normalizedDims) {
        // 既存の寸法データとマージ（正規化された値を優先）
        normalized.dimensions = {
          ...section.dimensions,
          ...normalizedDims,
        };

        // 寸法データの検証
        const validation = validateDimensions(normalized.dimensions);
        if (!validation.valid) {
          console.warn(
            `JsonDataParser: Section dimension validation failed:`,
            validation.errors
          );
        }

        // デバッグ情報（開発時のみ）
        if (validation.warnings.length > 0) {
          console.debug(
            `JsonDataParser: Section dimension warnings:`,
            validation.warnings
          );
        }
      }

      // 単位はmm単位を前提（Python JSONと同一）
      const dimensionKeys = Object.keys(normalized.dimensions);
      if (dimensionKeys.length > 0) {
        console.debug(
          `JsonDataParser: Section dimensions normalized: ${dimensionKeys.join(
            ", "
          )}`
        );
      }
    }

    return normalized;
  }

  /**
   * 仮想ノードマップの作成（STB互換性のため）
   * @private
   */
  _createVirtualNodeMap() {
    const nodeMap = new Map();
    const processedNodes = new Set();

    // 全要素から座標点を抽出
    Object.values(this.parsedElements).forEach((elementArray) => {
      elementArray.forEach((element) => {
        if (element.geometry.start_point) {
          const nodeKey = this._createNodeKey(element.geometry.start_point);
          if (!processedNodes.has(nodeKey)) {
            nodeMap.set(`virtual_node_${nodeMap.size + 1}`, {
              x: element.geometry.start_point[0],
              y: element.geometry.start_point[1],
              z: element.geometry.start_point[2],
            });
            processedNodes.add(nodeKey);
          }
        }

        if (element.geometry.end_point) {
          const nodeKey = this._createNodeKey(element.geometry.end_point);
          if (!processedNodes.has(nodeKey)) {
            nodeMap.set(`virtual_node_${nodeMap.size + 1}`, {
              x: element.geometry.end_point[0],
              y: element.geometry.end_point[1],
              z: element.geometry.end_point[2],
            });
            processedNodes.add(nodeKey);
          }
        }
      });
    });

    console.log(`JsonDataParser: Created ${nodeMap.size} virtual nodes`);
    return nodeMap;
  }

  /**
   * ノードキーの作成（座標の一意識別用）
   * @private
   */
  _createNodeKey(coordinate) {
    // 小数点以下の精度を制限して一意性を確保
    const precision = 1; // 1mm精度
    const x = Math.round(coordinate[0] / precision) * precision;
    const y = Math.round(coordinate[1] / precision) * precision;
    const z = Math.round(coordinate[2] / precision) * precision;
    return `${x},${y},${z}`;
  }

  /**
   * STB形式への変換
   * @private
   */
  _convertToStbFormat(elements, elementType) {
    return elements.map((element) => ({
      ...element,
      // STB形式フラグを削除
      isJsonInput: undefined,
      // STB互換フィールドの追加
      stbElementType: elementType,
      convertedFromJson: true,
    }));
  }

  /**
   * バージョンの有効性確認
   * @private
   */
  _isValidVersion(version) {
    // サポート対象バージョンの確認（例: 2.x.x系列）
    return version.match(/^2\.\d+\.\d+$/);
  }

  /**
   * 総要素数の計算
   * @private
   */
  _calculateTotalElements() {
    return Object.values(this.statistics.elementCounts).reduce(
      (sum, count) => sum + count,
      0
    );
  }

  /**
   * 解析結果の作成
   * @private
   */
  _createParsingResult() {
    return {
      success: true,
      data: this.parsedElements,
      metadata: this.metadata,
      statistics: this.statistics,
      stbCompatible: this.toStbCompatibleFormat(),

      // 便利メソッド
      getAllElements: () => {
        const allElements = [];
        Object.values(this.parsedElements).forEach((elementArray) => {
          allElements.push(...elementArray);
        });
        return allElements;
      },

      getElementsByType: (elementType) => {
        return this.parsedElements[elementType] || [];
      },

      getElementById: (elementId) => {
        const allElements = this.getAllElements();
        return allElements.find((element) => element.id === elementId);
      },
    };
  }

  /**
   * 解析統計の取得
   */
  getStatistics() {
    return {
      ...this.statistics,
      hasErrors: this.statistics.errors.length > 0,
      hasWarnings: this.statistics.warnings.length > 0,
    };
  }

  /**
   * 解析エラーの詳細取得
   */
  getErrors() {
    return this.statistics.errors;
  }

  /**
   * 解析警告の詳細取得
   */
  getWarnings() {
    return this.statistics.warnings;
  }

  /**
   * パーサーのリセット（再利用時）
   */
  reset() {
    this.jsonData = null;
    this.metadata = null;
    this.parsedElements = {
      columns: [],
      beams: [],
      braces: [],
      walls: [],
      slabs: [],
      footings: [],
      piles: [],
    };
    this.statistics = {
      totalElements: 0,
      elementCounts: {},
      parseTime: 0,
      errors: [],
      warnings: [],
    };
  }
}

/**
 * JSON統合データパーサーのユーティリティ関数
 */
export class JsonParserUtils {
  /**
   * JSON形式の構造データかどうかを判定
   * @param {Object} data - 判定対象データ
   * @returns {boolean} JSON統合形式かどうか
   */
  static isJsonStructuralData(data) {
    return (
      data &&
      typeof data === "object" &&
      data.elements &&
      typeof data.elements === "object"
    );
  }

  /**
   * サポート対象要素タイプの一覧取得
   * @returns {Array<string>} サポート要素タイプ
   */
  static getSupportedElementTypes() {
    return [
      "columns",
      "beams",
      "braces",
      "walls",
      "slabs",
      "footings",
      "piles",
    ];
  }

  /**
   * JSON形式の要素を3Dレンダリング用に変換
   * @param {Array} elements - JSON要素配列
   * @param {string} elementType - 要素タイプ
   * @returns {Array} 3Dレンダリング用要素配列
   */
  static convertForRendering(elements, elementType) {
    return elements.map((element) => ({
      ...element,
      // 3Dレンダリング用のフラグ追加
      renderingInfo: {
        elementType: elementType,
        isJsonInput: true,
        requiresConversion: false,
      },
    }));
  }

  /**
   * ファイルサイズの検証
   * @param {File} file - 検証対象ファイル
   * @param {number} maxSizeMB - 最大サイズ（MB）
   * @returns {boolean} サイズが適切かどうか
   */
  static validateFileSize(file, maxSizeMB = 50) {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  }

  /**
   * JSONファイルの拡張子確認
   * @param {File} file - 確認対象ファイル
   * @returns {boolean} JSON拡張子かどうか
   */
  static isJsonFile(file) {
    return file.name.toLowerCase().endsWith(".json");
  }
}

// デバッグ・テスト支援
if (typeof window !== "undefined") {
  window.JsonDataParser = JsonDataParser;
  window.JsonParserUtils = JsonParserUtils;
}

export default JsonDataParser;
