/**
 * @fileoverview ST-Bridge 幾何学的制約バリデータ
 *
 * stbValidator.js から分割。柱・梁の長さが異常に短い/長い場合を検出する。
 */

import { parseElements } from '../../import/parser/stbXmlParser.js';
import { STB_TAG_NAMES } from '../../../constants/elementTypes.js';
import { SEVERITY, CATEGORY } from '../validationConstants.js';

/**
 * 幾何学的制約の検証
 */
export function validateGeometricConstraints(xmlDoc, nodeMap, issues) {
  // 柱の長さ検証
  const columns = parseElements(xmlDoc, STB_TAG_NAMES.COLUMN);
  for (const col of columns) {
    const id = col.getAttribute('id');
    const bottomId = col.getAttribute('id_node_bottom');
    const topId = col.getAttribute('id_node_top');

    if (bottomId && topId && nodeMap.has(bottomId) && nodeMap.has(topId)) {
      const bottom = nodeMap.get(bottomId);
      const top = nodeMap.get(topId);

      const length = Math.sqrt(
        Math.pow(top.x - bottom.x, 2) +
          Math.pow(top.y - bottom.y, 2) +
          Math.pow(top.z - bottom.z, 2),
      );

      if (length < 100) {
        // 100mm未満
        issues.push({
          severity: SEVERITY.WARNING,
          category: CATEGORY.GEOMETRY,
          message: `StbColumn ${id} の長さが ${length.toFixed(1)}mm で非常に短いです`,
          elementType: STB_TAG_NAMES.COLUMN,
          elementId: id,
          value: length,
          repairable: true,
          repairSuggestion: '長さが100mm未満の要素を削除',
        });
      }

      if (length > 50000) {
        // 50m超
        issues.push({
          severity: SEVERITY.WARNING,
          category: CATEGORY.GEOMETRY,
          message: `StbColumn ${id} の長さが ${length.toFixed(1)}mm で非常に長いです`,
          elementType: STB_TAG_NAMES.COLUMN,
          elementId: id,
          value: length,
          repairable: false,
        });
      }
    }
  }

  // 梁の長さ検証（同様のロジック）
  const beamTypes = [STB_TAG_NAMES.GIRDER, STB_TAG_NAMES.BEAM];
  for (const beamType of beamTypes) {
    const beams = parseElements(xmlDoc, beamType);
    for (const beam of beams) {
      const id = beam.getAttribute('id');
      const startId = beam.getAttribute('id_node_start');
      const endId = beam.getAttribute('id_node_end');

      if (startId && endId && nodeMap.has(startId) && nodeMap.has(endId)) {
        const start = nodeMap.get(startId);
        const end = nodeMap.get(endId);

        const length = Math.sqrt(
          Math.pow(end.x - start.x, 2) +
            Math.pow(end.y - start.y, 2) +
            Math.pow(end.z - start.z, 2),
        );

        if (length < 100) {
          issues.push({
            severity: SEVERITY.WARNING,
            category: CATEGORY.GEOMETRY,
            message: `${beamType} ${id} の長さが ${length.toFixed(1)}mm で非常に短いです`,
            elementType: beamType,
            elementId: id,
            value: length,
            repairable: true,
            repairSuggestion: '長さが100mm未満の要素を削除',
          });
        }

        if (length > 30000) {
          // 30m超
          issues.push({
            severity: SEVERITY.WARNING,
            category: CATEGORY.GEOMETRY,
            message: `${beamType} ${id} の長さが ${length.toFixed(1)}mm で非常に長いです`,
            elementType: beamType,
            elementId: id,
            value: length,
            repairable: false,
          });
        }
      }
    }
  }
}
