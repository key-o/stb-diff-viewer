/**
 * @fileoverview STB ファイル読み込みモジュール（統合版）
 *
 * 統合版ビューア用のSTBファイル読み込み・パース・比較機能を提供します。
 * XMLドキュメントの解析、要素抽出、モデル比較を統一的に処理します。
 *
 * @module stbLoader
 */

import { createLogger } from '../utils/logger.js';

// STB パーサーのインポート
import {
  buildNodeMap,
  parseElements,
  extractColumnElements,
  extractGirderElements,
  extractBeamElements,
  extractBraceElements,
  extractSlabElements,
  extractWallElements,
  extractFoundationColumnElements,
  extractStripFootingElements,
  extractFootingElements,
  extractParapetElements,
  extractJointElements,
  parseAxes,
  parseStories,
} from '../common-stb/parser/stbXmlParser.js';

const log = createLogger('stbLoader');

/**
 * STBファイルをパースして構造データを抽出
 * @param {File} file - 読み込むSTBファイル
 * @returns {Promise<{doc: Document, nodeMap: Map, elements: Object}>}
 */
export async function parseStbFile(file) {
  try {
    log.info(`STBファイルをパースしています: ${file.name}`);

    // ファイルを文字列として読み込み
    const xmlString = await file.text();

    // XMLをパース
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // パースエラーをチェック
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML パースエラー: ${parserError.textContent}`);
    }

    log.info('XMLパース完了');

    // ノードマップを構築
    const nodeMap = buildNodeMap(doc);
    log.info(`ノードマップ構築完了: ${nodeMap.size} 個のノード`);

    // 各要素タイプを抽出
    const elements = {
      columns: extractColumnElements(doc, nodeMap),
      girders: extractGirderElements(doc, nodeMap),
      beams: extractBeamElements(doc, nodeMap),
      braces: extractBraceElements(doc, nodeMap),
      slabs: extractSlabElements(doc, nodeMap),
      walls: extractWallElements(doc, nodeMap),
      foundationColumns: extractFoundationColumnElements(doc, nodeMap),
      stripFootings: extractStripFootingElements(doc, nodeMap),
      footings: extractFootingElements(doc, nodeMap),
      parapets: extractParapetElements(doc, nodeMap),
      joints: extractJointElements(doc, nodeMap),
    };

    log.info('要素抽出完了', {
      columns: elements.columns.length,
      girders: elements.girders.length,
      beams: elements.beams.length,
      braces: elements.braces.length,
      slabs: elements.slabs.length,
      walls: elements.walls.length,
      foundationColumns: elements.foundationColumns.length,
      stripFootings: elements.stripFootings.length,
      footings: elements.footings.length,
      parapets: elements.parapets.length,
      joints: elements.joints.length,
    });

    // 軸と階を抽出
    const axes = parseAxes(doc);
    const stories = parseStories(doc);

    log.info('軸・階情報抽出完了', {
      axes: axes,
      stories: stories.length,
    });

    return { doc, nodeMap, elements, axes, stories };
  } catch (error) {
    log.error('STBファイルパースエラー:', error);
    throw error;
  }
}

/**
 * 2つのSTBモデルを比較
 * @param {Object} modelA - パース済みモデルA
 * @param {Object} modelB - パース済みモデルB
 * @returns {Object} 比較結果
 */
export function compareModels(modelA, modelB) {
  try {
    log.info('モデルを比較しています...');

    const comparisonResult = {
      matched: [],
      mismatch: [],
      onlyA: [],
      onlyB: [],
      timestamp: new Date().toISOString(),
    };

    // 各要素タイプごとに比較を実行
    const elementTypes = [
      'columns',
      'girders',
      'beams',
      'braces',
      'slabs',
      'walls',
      'foundationColumns',
      'stripFootings',
      'footings',
      'parapets',
      'joints',
    ];

    elementTypes.forEach((elementType) => {
      const elementsA = modelA.elements[elementType] || [];
      const elementsB = modelB.elements[elementType] || [];

      log.info(`${elementType} を比較中...`, {
        countA: elementsA.length,
        countB: elementsB.length,
      });

      // 簡単な比較: IDベースで一致するか確認
      const idsA = new Set(elementsA.map((e) => e.id));
      const idsB = new Set(elementsB.map((e) => e.id));

      elementsA.forEach((elemA) => {
        const elemB = elementsB.find((e) => e.id === elemA.id);
        if (elemB) {
          // ID一致 → 詳細比較を実施
          const hasMismatch = !isElementEqual(elemA, elemB);
          comparisonResult[hasMismatch ? 'mismatch' : 'matched'].push({
            id: elemA.id,
            type: elementType,
            elementA: elemA,
            elementB: elemB,
            hasMismatch,
          });
        } else {
          // Aにのみ存在
          comparisonResult.onlyA.push({
            id: elemA.id,
            type: elementType,
            element: elemA,
          });
        }
      });

      elementsB.forEach((elemB) => {
        if (!idsA.has(elemB.id)) {
          // Bにのみ存在
          comparisonResult.onlyB.push({
            id: elemB.id,
            type: elementType,
            element: elemB,
          });
        }
      });
    });

    log.info('比較完了', {
      matched: comparisonResult.matched.length,
      mismatch: comparisonResult.mismatch.length,
      onlyA: comparisonResult.onlyA.length,
      onlyB: comparisonResult.onlyB.length,
    });

    return comparisonResult;
  } catch (error) {
    log.error('モデル比較エラー:', error);
    throw error;
  }
}

/**
 * 2つの要素が等しいか比較
 * @param {Object} elemA - 要素A
 * @param {Object} elemB - 要素B
 * @returns {boolean} 等しい場合true
 */
function isElementEqual(elemA, elemB) {
  // 簡単な比較: 主要属性を確認
  const keysA = Object.keys(elemA || {}).filter((k) => !k.startsWith('_'));
  const keysB = Object.keys(elemB || {}).filter((k) => !k.startsWith('_'));

  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every((key) => {
    const valA = elemA[key];
    const valB = elemB[key];

    if (typeof valA === 'number' && typeof valB === 'number') {
      // 数値の場合は許容誤差で比較
      return Math.abs(valA - valB) < 0.01;
    }

    return valA === valB;
  });
}

/**
 * 比較結果を統合版ビューア用のフォーマットに変換
 * @param {Object} comparisonResult - 比較結果
 * @returns {Object} 統合版用フォーマット
 */
export function convertToUnifiedFormat(comparisonResult) {
  return {
    elements: [
      ...comparisonResult.matched.map((item) => ({
        id: item.id,
        modelSource: 'A',
        type: item.type,
        comparisonStatus: 'matched',
        hasMismatch: item.hasMismatch,
        data: item.elementA,
      })),
      ...comparisonResult.mismatch.map((item) => ({
        id: item.id,
        modelSource: 'A',
        type: item.type,
        comparisonStatus: 'matched',
        hasMismatch: true,
        data: item.elementA,
      })),
      ...comparisonResult.onlyA.map((item) => ({
        id: item.id,
        modelSource: 'A',
        type: item.type,
        comparisonStatus: 'onlyA',
        data: item.element,
      })),
      ...comparisonResult.onlyB.map((item) => ({
        id: item.id,
        modelSource: 'B',
        type: item.type,
        comparisonStatus: 'onlyB',
        data: item.element,
      })),
    ],
    summary: {
      matched: comparisonResult.matched.length,
      mismatch: comparisonResult.mismatch.length,
      onlyA: comparisonResult.onlyA.length,
      onlyB: comparisonResult.onlyB.length,
      timestamp: comparisonResult.timestamp,
    },
  };
}

/**
 * 2つのSTBファイルを読み込んで比較を実行
 * @param {File} fileA - モデルAのSTBファイル
 * @param {File} fileB - モデルBのSTBファイル（オプション）
 * @returns {Promise<Object>} 比較結果
 */
export async function loadAndCompareStbFiles(fileA, fileB) {
  try {
    log.info('STBファイルを読み込んで比較を実行します...');

    // モデルAを読み込み
    const modelA = await parseStbFile(fileA);
    log.info(`モデルA読み込み完了: ${fileA.name}`);

    // モデルBを読み込み（オプション）
    let modelB = null;
    if (fileB) {
      modelB = await parseStbFile(fileB);
      log.info(`モデルB読み込み完了: ${fileB.name}`);
    }

    // 比較を実行
    if (!modelB) {
      // Bがない場合はAのみを返す
      log.info('モデルBが指定されていません。モデルAのみを表示します。');
      return {
        modelA,
        modelB: null,
        comparisonResult: {
          elements: modelA.elements.columns.map((col) => ({
            id: col.id,
            modelSource: 'A',
            type: 'columns',
            comparisonStatus: 'onlyA',
            data: col,
          })),
          summary: {
            elementsA: modelA.elements,
          },
        },
      };
    }

    const comparisonResult = compareModels(modelA, modelB);
    const unifiedResult = convertToUnifiedFormat(comparisonResult);

    return {
      modelA,
      modelB,
      comparisonResult: unifiedResult,
    };
  } catch (error) {
    log.error('STBファイル読み込みと比較エラー:', error);
    throw error;
  }
}
