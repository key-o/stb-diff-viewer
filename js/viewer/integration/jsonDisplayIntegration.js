/**
 * @fileoverview JSON統合データ3D表示統合モジュール
 *
 * このファイルは、JSON統合データパーサーと既存の3D表示システムを
 * 統合するためのブリッジ機能を提供します:
 *
 * - JSONデータから3Dメッシュ生成
 * - 既存レンダリングシステムとの統合
 * - STB形式との互換性維持
 * - パフォーマンス最適化
 */

import { JsonDataParser } from '../../parser/jsonDataParser.js';
// プロファイルベース実装（JSON統合データ用 - 新方式に移行）
import { ProfileBasedColumnGenerator } from '../geometry/ProfileBasedColumnGenerator.js';
import { ProfileBasedBeamGenerator } from '../geometry/ProfileBasedBeamGenerator.js';
import { ProfileBasedBraceGenerator } from '../geometry/ProfileBasedBraceGenerator.js';

/**
 * JSON統合データ3D表示統合クラス
 */
export class JsonDisplayIntegration {
  constructor() {
    this.parser = new JsonDataParser();
    this.parsedData = null;
    this.generatedMeshes = {
      columns: [],
      beams: [],
      braces: [],
      walls: [],
      slabs: [],
      footings: [],
      piles: [],
    };
    this.renderingStats = {
      totalMeshes: 0,
      generationTime: 0,
      memoryUsage: 0,
      errors: [],
    };
  }

  /**
   * JSONファイルから3D表示データを生成
   * @param {File|string} input - JSONファイルまたはパス
   * @param {Object} options - レンダリングオプション
   * @returns {Promise<Object>} 3D表示用データ
   */
  async generateFrom3DDataFromJson(input, options = {}) {
    const startTime = performance.now();

    try {
      // JSON解析
      this.parsedData =
        typeof input === 'string' && input.startsWith('{')
          ? this.parser.parseFromObject(JSON.parse(input))
          : await this.parser.parseFromFile(input);

      // 3Dメッシュ生成
      await this._generateAllMeshes(options);

      // 統計情報更新
      this.renderingStats.generationTime = performance.now() - startTime;
      this.renderingStats.totalMeshes = this._countTotalMeshes();

      return this._createDisplayResult();
    } catch (error) {
      this.renderingStats.errors.push(`3D generation failed: ${error.message}`);
      console.error('JsonDisplayIntegration: 3D generation failed:', error);
      throw new Error(`3D display generation failed: ${error.message}`);
    }
  }

  /**
   * JSONオブジェクトから直接3D表示データを生成（テスト用）
   * @param {Object} jsonObject - JSONオブジェクト
   * @param {Object} options - レンダリングオプション
   * @returns {Object} 3D表示用データ
   */
  generateFromJsonObject(jsonObject, options = {}) {
    const startTime = performance.now();

    try {
      // JSON解析
      this.parsedData = this.parser.parseFromObject(jsonObject);

      // 3Dメッシュ生成（同期版）
      this._generateAllMeshesSync(options);

      // 統計情報更新
      this.renderingStats.generationTime = performance.now() - startTime;
      this.renderingStats.totalMeshes = this._countTotalMeshes();

      return this._createDisplayResult();
    } catch (error) {
      this.renderingStats.errors.push(`Sync 3D generation failed: ${error.message}`);
      console.error('JsonDisplayIntegration: Sync 3D generation failed:', error);
      throw new Error(`Sync 3D display generation failed: ${error.message}`);
    }
  }

  /**
   * 全要素タイプの3Dメッシュを生成（非同期版）
   * @private
   */
  async _generateAllMeshes(options) {
    const generationTasks = [];

    // 並列でメッシュ生成を実行
    if (this.parsedData.data.braces.length > 0) {
      generationTasks.push(this._generateBraceMeshes(options));
    }

    if (this.parsedData.data.beams.length > 0) {
      generationTasks.push(this._generateBeamMeshes(options));
    }

    if (this.parsedData.data.columns.length > 0) {
      generationTasks.push(this._generateColumnMeshes(options));
    }

    // 他の要素タイプは後で実装
    if (this.parsedData.data.walls.length > 0) {
    }

    if (this.parsedData.data.slabs.length > 0) {
    }

    if (this.parsedData.data.footings.length > 0) {
    }

    if (this.parsedData.data.piles.length > 0) {
    }

    // 全タスクの完了を待機
    await Promise.all(generationTasks);
  }

  /**
   * 全要素タイプの3Dメッシュを生成（同期版）
   * @private
   */
  _generateAllMeshesSync(_options) {
    // ブレース要素（ProfileBased方式に移行）
    if (this.parsedData.data.braces.length > 0) {
      this.generatedMeshes.braces = ProfileBasedBraceGenerator.createBraceMeshes(
        this.parsedData.data.braces,
        null, // JSONではノードマップ不要
        null, // JSONでは断面マップ不要
        null, // JSONでは鋼材マップ不要
        'Brace',
        true, // JSON形式フラグ
      );
    }

    // 梁要素（ProfileBased方式に移行）
    if (this.parsedData.data.beams.length > 0) {
      this.generatedMeshes.beams = ProfileBasedBeamGenerator.createBeamMeshes(
        this.parsedData.data.beams,
        null,
        null,
        null,
        'Beam',
        true,
      );
    }

    // 柱要素（ProfileBased方式に移行）
    if (this.parsedData.data.columns.length > 0) {
      this.generatedMeshes.columns = ProfileBasedColumnGenerator.createColumnMeshes(
        this.parsedData.data.columns,
        null,
        null,
        null,
        'Column',
        true,
      );
    }
  }

  /**
   * ブレースメッシュの生成（ProfileBased方式）
   * @private
   */
  async _generateBraceMeshes(_options) {
    try {
      this.generatedMeshes.braces = ProfileBasedBraceGenerator.createBraceMeshes(
        this.parsedData.data.braces,
        null, // JSONではノードマップ不要
        null, // JSONでは断面マップ不要
        null, // JSONでは鋼材マップ不要
        'Brace',
        true, // JSON形式フラグ
      );
    } catch (error) {
      this.renderingStats.errors.push(`Brace mesh generation failed: ${error.message}`);
      console.error('JsonDisplayIntegration: Brace mesh generation failed:', error);
    }
  }

  /**
   * 梁メッシュの生成（ProfileBased方式）
   * @private
   */
  async _generateBeamMeshes(_options) {
    try {
      this.generatedMeshes.beams = ProfileBasedBeamGenerator.createBeamMeshes(
        this.parsedData.data.beams,
        null, // JSONではノードマップ不要
        null, // JSONでは断面マップ不要
        null, // JSONでは鋼材マップ不要
        'Beam',
        true, // JSON形式フラグ
      );
    } catch (error) {
      this.renderingStats.errors.push(`Beam mesh generation failed: ${error.message}`);
      console.error('JsonDisplayIntegration: Beam mesh generation failed:', error);
    }
  }

  /**
   * 柱メッシュの生成（ProfileBased方式）
   * @private
   */
  async _generateColumnMeshes(_options) {
    try {
      this.generatedMeshes.columns = ProfileBasedColumnGenerator.createColumnMeshes(
        this.parsedData.data.columns,
        null, // JSONではノードマップ不要
        null, // JSONでは断面マップ不要
        null, // JSONでは鋼材マップ不要
        'Column',
        true, // JSON形式フラグ
      );
    } catch (error) {
      this.renderingStats.errors.push(`Column mesh generation failed: ${error.message}`);
      console.error('JsonDisplayIntegration: Column mesh generation failed:', error);
    }
  }

  /**
   * 総メッシュ数をカウント
   * @private
   */
  _countTotalMeshes() {
    return Object.values(this.generatedMeshes).reduce((total, meshArray) => {
      return total + (Array.isArray(meshArray) ? meshArray.length : 0);
    }, 0);
  }

  /**
   * 3D表示結果の作成
   * @private
   */
  _createDisplayResult() {
    // 全メッシュを統合
    const allMeshes = [];
    Object.values(this.generatedMeshes).forEach((meshArray) => {
      if (Array.isArray(meshArray)) {
        allMeshes.push(...meshArray);
      }
    });

    return {
      success: true,
      meshes: this.generatedMeshes,
      allMeshes: allMeshes,
      statistics: {
        parsing: this.parsedData.statistics,
        rendering: this.renderingStats,
      },
      metadata: this.parsedData.metadata,

      // 便利メソッド
      getMeshesByType: (elementType) => {
        return this.generatedMeshes[elementType] || [];
      },

      getMeshById: (elementId) => {
        return allMeshes.find((mesh) => mesh.userData.elementId === elementId);
      },

      addToScene: (scene) => {
        allMeshes.forEach((mesh) => scene.add(mesh));
      },

      removeFromScene: (scene) => {
        allMeshes.forEach((mesh) => scene.remove(mesh));
      },
    };
  }

  /**
   * 既存のSTB表示システムとの統合
   * @param {Object} stbDisplayData - 既存のSTB表示データ
   * @returns {Object} 統合された表示データ
   */
  integrateWithStbDisplay(stbDisplayData) {
    if (!this.parsedData) {
      throw new Error('No JSON data parsed. Call generateFrom3DDataFromJson first.');
    }

    // JSON要素を既存のSTB構造に統合
    const integratedData = {
      // STBデータを基本とする
      ...stbDisplayData,

      // JSON由来の要素を追加
      jsonElements: this.generatedMeshes,
      jsonMetadata: this.parsedData.metadata,

      // 統合されたメッシュ配列
      allMeshes: [...(stbDisplayData.allMeshes || []), ...this._getAllJsonMeshes()],

      // 統合統計
      combinedStatistics: {
        stb: stbDisplayData.statistics || {},
        json: this.renderingStats,
        totalElements: (stbDisplayData.totalElements || 0) + this.renderingStats.totalMeshes,
      },
    };

    return integratedData;
  }

  /**
   * 全JSONメッシュの取得
   * @private
   */
  _getAllJsonMeshes() {
    const allJsonMeshes = [];
    Object.values(this.generatedMeshes).forEach((meshArray) => {
      if (Array.isArray(meshArray)) {
        allJsonMeshes.push(...meshArray);
      }
    });
    return allJsonMeshes;
  }

  /**
   * メッシュのクリーンアップ
   */
  cleanup() {
    Object.values(this.generatedMeshes).forEach((meshArray) => {
      if (Array.isArray(meshArray)) {
        meshArray.forEach((mesh) => {
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) mesh.material.dispose();
        });
      }
    });

    // リセット
    this.generatedMeshes = {
      columns: [],
      beams: [],
      braces: [],
      walls: [],
      slabs: [],
      footings: [],
      piles: [],
    };

    this.parsedData = null;
    this.renderingStats = {
      totalMeshes: 0,
      generationTime: 0,
      memoryUsage: 0,
      errors: [],
    };
  }

  /**
   * デバッグ情報の取得
   */
  getDebugInfo() {
    return {
      parsingStats: this.parsedData?.statistics,
      renderingStats: this.renderingStats,
      meshCounts: Object.fromEntries(
        Object.entries(this.generatedMeshes).map(([key, meshes]) => [
          key,
          Array.isArray(meshes) ? meshes.length : 0,
        ]),
      ),
      hasErrors: this.renderingStats.errors.length > 0,
      errors: this.renderingStats.errors,
    };
  }

  /**
   * パフォーマンス統計の取得
   */
  getPerformanceStats() {
    return {
      totalParsingTime: this.parsedData?.statistics.parseTime || 0,
      totalRenderingTime: this.renderingStats.generationTime,
      totalTime: (this.parsedData?.statistics.parseTime || 0) + this.renderingStats.generationTime,
      meshesPerSecond:
        this.renderingStats.generationTime > 0
          ? (this.renderingStats.totalMeshes / (this.renderingStats.generationTime / 1000)).toFixed(
              1,
            )
          : 0,
      memoryEstimate: this.renderingStats.totalMeshes * 1024, // 概算（バイト）
    };
  }
}

/**
 * JSON統合表示のユーティリティ関数
 */
export class JsonDisplayUtils {
  /**
   * JSON要素とSTB要素の互換性チェック
   * @param {Object} jsonElement - JSON要素
   * @param {Object} stbElement - STB要素
   * @returns {boolean} 互換性があるかどうか
   */
  static areElementsCompatible(jsonElement, stbElement) {
    // 基本的な互換性チェック
    return jsonElement.elementType === stbElement.elementType && jsonElement.id === stbElement.id;
  }

  /**
   * JSON要素をSTB形式に変換
   * @param {Object} jsonElement - JSON要素
   * @returns {Object} STB形式要素
   */
  static convertJsonElementToStb(jsonElement) {
    return {
      ...jsonElement,
      // JSON固有フィールドを削除
      isJsonInput: undefined,
      originalData: undefined,
      // STB互換フィールドを追加
      convertedFromJson: true,
      stbCompatible: true,
    };
  }

  /**
   * レンダリングオプションの検証
   * @param {Object} options - レンダリングオプション
   * @returns {Object} 検証済みオプション
   */
  static validateRenderingOptions(options) {
    return {
      enableLOD: options.enableLOD !== false,
      mergeSimilarMaterials: options.mergeSimilarMaterials !== false,
      generateBounds: options.generateBounds !== false,
      enableShadows: options.enableShadows === true,
      wireframe: options.wireframe === true,
      ...options,
    };
  }
}

// デバッグ・テスト支援
if (typeof window !== 'undefined') {
  window.JsonDisplayIntegration = JsonDisplayIntegration;
  window.JsonDisplayUtils = JsonDisplayUtils;
}

export default JsonDisplayIntegration;
