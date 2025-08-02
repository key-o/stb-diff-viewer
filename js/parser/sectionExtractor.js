/**
 * @fileoverview 統一断面抽出エンジン
 * 
 * 設定駆動による統一的な断面データ抽出機能を提供します。
 * 従来の個別関数（extractColumnSections等）を統合し、
 * 重複コードを排除した効率的な実装を実現します。
 */

import { SECTION_CONFIG } from '../config/sectionConfig.js';

/**
 * 全要素タイプの断面データを一括抽出
 * @param {Document} xmlDoc - パース済みのXMLドキュメント
 * @returns {Object} 全断面データマップ {columnSections: Map, beamSections: Map, braceSections: Map}
 */
export function extractAllSections(xmlDoc) {
  if (!xmlDoc) {
    console.warn('extractAllSections: xmlDoc is null or undefined');
    return createEmptyResult();
  }
  
  const result = {};
  
  // 設定に基づいて各要素タイプを処理
  Object.entries(SECTION_CONFIG).forEach(([elementType, config]) => {
    const sectionKey = `${elementType.toLowerCase()}Sections`;
    result[sectionKey] = extractSectionsByType(xmlDoc, elementType, config);
  });
  
  logExtractionResults(result);
  return result;
}

/**
 * 指定要素タイプの断面データを抽出
 * @param {Document} xmlDoc - XMLドキュメント
 * @param {string} elementType - 要素タイプ
 * @param {Object} config - 抽出設定
 * @returns {Map} 断面データマップ
 */
function extractSectionsByType(xmlDoc, elementType, config) {
  const sections = new Map();
  
  try {
    // 設定されたセレクターで要素を取得
    const selector = config.selectors.join(', ');
    const elements = xmlDoc.querySelectorAll(selector);
    
    elements.forEach(element => {
      const sectionData = extractSectionData(element, config);
      if (sectionData && sectionData.id) {
        sections.set(sectionData.id, sectionData);
      }
    });
    
  } catch (error) {
    console.error(`Error extracting ${elementType} sections:`, error);
  }
  
  return sections;
}

/**
 * 単一要素から断面データを抽出
 * @param {Element} element - DOM要素
 * @param {Object} config - 抽出設定
 * @returns {Object|null} 断面データまたはnull
 */
function extractSectionData(element, config) {
  const id = element.getAttribute('id');
  const name = element.getAttribute('name');
  
  // ID必須チェック
  if (!id) {
    console.warn('Skipping section due to missing id attribute:', element.tagName);
    return null;
  }
  
  const sectionData = {
    id: id,
    name: name,
    sectionType: element.tagName,
    shapeName: extractShapeName(element, config)
  };
  
  return sectionData;
}

/**
 * 要素から形状名を抽出
 * @param {Element} element - DOM要素
 * @param {Object} config - 抽出設定
 * @returns {string|null} 形状名またはnull
 */
function extractShapeName(element, config) {
  // 鋼材図形から形状名を抽出
  if (config.steelFigures) {
    for (const figureSelector of config.steelFigures) {
      const figureElement = element.querySelector(figureSelector);
      if (figureElement) {
        const shapeElement = figureElement.querySelector('*[shape]');
        if (shapeElement) {
          return shapeElement.getAttribute('shape');
        }
      }
    }
  }
  
  return null;
}

/**
 * 空の結果オブジェクトを作成
 * @returns {Object} 空の断面マップ
 */
function createEmptyResult() {
  const result = {};
  Object.keys(SECTION_CONFIG).forEach(elementType => {
    const sectionKey = `${elementType.toLowerCase()}Sections`;
    result[sectionKey] = new Map();
  });
  return result;
}

/**
 * 抽出結果をログ出力
 * @param {Object} result - 抽出結果
 */
function logExtractionResults(result) {
  const summary = Object.entries(result)
    .map(([key, sections]) => `${key}: ${sections.size}`)
    .join(', ');
  
  console.log(`Extracted sections - ${summary}`);
}