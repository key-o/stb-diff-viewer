/**
 * @fileoverview ラベルテキスト生成モジュール
 *
 * 要素のラベルテキストを生成する純粋なデータ変換関数を提供します。
 * ui/viewer3d/unifiedLabelManager.js から分離し、viewer層（L4）に配置することで
 * app層（L2）からのui層（L5）への依存を解消します。
 *
 * @module viewer/annotations/labelTextGenerator
 */

import { getState } from '../../data/state/globalState.js';
import { LABEL_CONTENT_TYPES } from '../../constants/displayModes.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('labelTextGenerator');

/**
 * 要素のラベルテキストを生成
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} 生成されたラベルテキスト
 */
export function generateLabelText(element, elementType) {
  const contentType = getState('ui.labelContentType') || LABEL_CONTENT_TYPES.ID;

  try {
    switch (contentType) {
      case LABEL_CONTENT_TYPES.ID:
        return generateIdLabel(element, elementType);
      case LABEL_CONTENT_TYPES.NAME:
        return generateNameLabel(element, elementType);
      case LABEL_CONTENT_TYPES.SECTION:
        return generateSectionIdLabel(element, elementType);
      case LABEL_CONTENT_TYPES.SECTION_NAME:
        return generateSectionNameLabel(element, elementType);
      default:
        log.warn(`[LabelTextGenerator] Unknown content type: ${contentType}, falling back to ID`);
        return generateIdLabel(element, elementType);
    }
  } catch (error) {
    log.error(`[LabelTextGenerator] Error generating label for ${elementType}:`, error);
    return element.id || elementType;
  }
}

/**
 * ID表示用のラベルテキストを生成
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} IDラベル
 */
function generateIdLabel(element, elementType) {
  return element.id || elementType;
}

/**
 * インスタンス名表示用のラベルテキストを生成
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} インスタンス名ラベル
 */
function generateNameLabel(element, elementType) {
  const nameFields = ['name', 'instance_name', 'label', 'title'];

  for (const field of nameFields) {
    if (element[field] && typeof element[field] === 'string' && element[field].trim() !== '') {
      return element[field];
    }
  }

  return element.id || `${elementType}_unknown`;
}

/**
 * 断面IDを返す（id_section属性値）
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} 断面IDラベル
 */
function generateSectionIdLabel(element, elementType) {
  if (element.id_section) return String(element.id_section);
  return element.id || `${elementType}_no_section`;
}

/**
 * 断面のname属性を返す（sectionMapsからname属性を引く）
 * @param {Object} element - 要素データ
 * @param {string} elementType - 要素タイプ
 * @returns {string} 断面nameラベル
 */
function generateSectionNameLabel(element, elementType) {
  const sectionMaps = getState('models.sectionMaps');
  if (sectionMaps && element.id_section) {
    const sectionKey = parseInt(element.id_section, 10);
    const key = isNaN(sectionKey) ? element.id_section : sectionKey;
    const sectionMap = _getSectionMap(sectionMaps, elementType);
    if (sectionMap?.has?.(key)) {
      const sectionInfo = sectionMap.get(key);
      if (sectionInfo?.name) return sectionInfo.name;
    }
  }

  if (element.id_section) return String(element.id_section);
  return element.id || `${elementType}_no_section`;
}

function _getSectionMap(sectionMaps, elementType) {
  switch (elementType) {
    case 'Column':
      return sectionMaps.columnSections;
    case 'Girder':
      return sectionMaps.girderSections || sectionMaps.beamSections;
    case 'Beam':
      return sectionMaps.beamSections;
    case 'Brace':
      return sectionMaps.braceSections;
    case 'IsolatingDevice':
      return sectionMaps.isolatingDeviceSections;
    case 'DampingDevice':
    case 'FrameDampingDevice':
      return sectionMaps.dampingDeviceSections;
    default:
      return null;
  }
}
