import { getElementValidation } from '../../../common-stb/validation/validationManager.js';
import { getAttributeImportanceLevel } from './ImportanceColors.js';
import { downloadBlob } from '../../../utils/downloadHelper.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('viewer:element-info');

function xmlNodeToJson(node) {
  if (!node) return null;
  const obj = { tagName: node.tagName, attributes: {} };
  for (const attr of node.attributes) {
    obj.attributes[attr.name] = attr.value;
  }
  const childElements = Array.from(node.children);
  if (childElements.length > 0) {
    obj.children = childElements.map(xmlNodeToJson);
  } else {
    const text = node.textContent?.trim();
    if (text) obj.textContent = text;
  }
  return obj;
}

function collectImportanceViolations(nodeA, nodeB, elementType) {
  if (!nodeA || !nodeB || !elementType) return [];

  const allAttrs = new Set([
    ...Array.from(nodeA.attributes).map((a) => a.name),
    ...Array.from(nodeB.attributes).map((a) => a.name),
  ]);

  const violations = [];
  for (const attrName of allAttrs) {
    const level = getAttributeImportanceLevel(elementType, attrName);
    if (level !== 'required') continue;
    const valA = nodeA.getAttribute(attrName);
    const valB = nodeB.getAttribute(attrName);
    if (valA !== valB) {
      violations.push({ attribute: attrName, valueA: valA, valueB: valB });
    }
  }
  return violations;
}

export function exportElementInfoAsJson(displayNodes) {
  const { nodeA, nodeB, elementType } = displayNodes;
  if (!nodeA && !nodeB) {
    logger.warn('No element selected for JSON export');
    return;
  }

  const elementId = nodeA?.getAttribute('id') || nodeB?.getAttribute('id') || 'unknown';

  const elementTagName = nodeA?.tagName || nodeB?.tagName || '';
  const rawValidation = getElementValidation(elementId, {
    targetElementName: elementTagName || undefined,
  });
  const validation = rawValidation
    ? {
        errors: rawValidation.errors.map(
          ({ severity, category, message, repairable, repairSuggestion }) => ({
            severity,
            category,
            message,
            repairable,
            ...(repairSuggestion ? { repairSuggestion } : {}),
          }),
        ),
        warnings: rawValidation.warnings.map(
          ({ severity, category, message, repairable, repairSuggestion }) => ({
            severity,
            category,
            message,
            repairable,
            ...(repairSuggestion ? { repairSuggestion } : {}),
          }),
        ),
        errorCount: rawValidation.errors.length,
        warningCount: rawValidation.warnings.length,
      }
    : null;

  const importanceViolations = collectImportanceViolations(nodeA, nodeB, elementType);

  const json = {
    elementType,
    exportedAt: new Date().toISOString(),
    modelA: xmlNodeToJson(nodeA),
    modelB: xmlNodeToJson(nodeB),
    validation,
    importanceViolations: importanceViolations.length > 0 ? importanceViolations : null,
  };

  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `element_${elementType}_${elementId}.json`);
}
