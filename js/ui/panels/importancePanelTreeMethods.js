/**
 * @fileoverview ImportancePanel tree and path helper methods.
 */

import { STB_ELEMENT_TABS } from '../../app/importanceManager.js';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';

export const importancePanelTreeMethods = {
  parsePathSegments(path, tabId = this.currentTab) {
    if (!path || typeof path !== 'string') {
      return [];
    }

    const segments = path.split('/').filter(Boolean);
    if (segments[0] === 'ST_BRIDGE') {
      segments.shift();
    }

    if (!tabId || segments.length === 0) {
      return segments;
    }

    const tab = STB_ELEMENT_TABS.find((item) => item.id === tabId);
    const xsdElemLower = tab?.xsdElem?.toLowerCase();
    if (xsdElemLower) {
      const xsdIndex = segments.findIndex((segment) => segment.toLowerCase() === xsdElemLower);
      if (xsdIndex > 0) {
        return segments.slice(xsdIndex);
      }
    }

    const candidates = this.manager.buildTabPathCandidates(tabId);
    const tabIndex = segments.findIndex((segment) => {
      const lower = segment.toLowerCase();
      if (candidates.has(lower)) return true;
      for (const candidate of candidates) {
        if (lower.startsWith(`${candidate}_`)) return true;
      }
      return false;
    });

    return tabIndex > 0 ? segments.slice(tabIndex) : segments;
  },

  buildParameterTree(elementPaths) {
    const root = {
      name: 'ROOT',
      children: new Map(),
      terminalPaths: [],
    };

    elementPaths.forEach((path) => {
      const segments = this.parsePathSegments(path, this.currentTab);
      if (segments.length === 0) return;

      let node = root;
      segments.forEach((segment) => {
        if (!node.children.has(segment)) {
          node.children.set(segment, {
            name: segment,
            children: new Map(),
            terminalPaths: [],
          });
        }
        node = node.children.get(segment);
      });

      if (!node.terminalPaths.includes(path)) {
        node.terminalPaths.push(path);
      }
    });

    return root;
  },

  countTreePaths(node) {
    let count = node.terminalPaths.length;
    node.children.forEach((childNode) => {
      count += this.countTreePaths(childNode);
    });
    return count;
  },

  collectDirectPaths(node) {
    const directPaths = [];

    node.children.forEach((childNode, childName) => {
      if (childName.startsWith('@')) {
        directPaths.push(...childNode.terminalPaths);
      }
    });

    return [...new Set(directPaths)];
  },

  getSortedElementChildren(node) {
    return [...node.children.values()]
      .filter((childNode) => !childNode.name.startsWith('@'))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  isXsdRequired(path) {
    const requirement = this.manager.getSchemaRequirement(path);
    return requirement?.required === true;
  },

  sortParameterPaths(paths) {
    if (!this.parameterSortKey) {
      return [...paths];
    }

    const compareByName = (left, right) =>
      left.localeCompare(right, 'ja', { numeric: true, sensitivity: 'base' });
    const order = new Map(paths.map((path, index) => [path, index]));

    const sorted = [...paths].sort((a, b) => {
      let compareResult = 0;

      if (this.parameterSortKey === 'xsdRequired') {
        const aRank = this.isXsdRequired(a) ? 1 : 0;
        const bRank = this.isXsdRequired(b) ? 1 : 0;
        compareResult = aRank - bRank;
        if (compareResult === 0) {
          compareResult = compareByName(this.extractParameterName(a), this.extractParameterName(b));
        }
      } else if (this.parameterSortKey === 'paramName') {
        compareResult = compareByName(this.extractParameterName(a), this.extractParameterName(b));
      }

      if (this.parameterSortDirection === 'desc') {
        compareResult *= -1;
      }

      if (compareResult !== 0) {
        return compareResult;
      }

      return (order.get(a) || 0) - (order.get(b) || 0);
    });

    return sorted;
  },

  normalizeBinaryLevel(level) {
    return level === IMPORTANCE_LEVELS.NOT_APPLICABLE
      ? IMPORTANCE_LEVELS.NOT_APPLICABLE
      : IMPORTANCE_LEVELS.REQUIRED;
  },

  getBinaryLabel(level) {
    return this.normalizeBinaryLevel(level) === IMPORTANCE_LEVELS.NOT_APPLICABLE
      ? '対象外'
      : '対象';
  },

  extractParameterName(path) {
    if (!path) return '';
    if (path.includes('@')) {
      return path.split('@')[1];
    }

    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  },

  formatElementPath(path) {
    const parts = path.split('/');
    if (parts.length > 4) {
      const start = parts.slice(0, 2).join('/');
      const end = parts.slice(-2).join('/');
      return `${start}/.../${end}`;
    }
    return path;
  },
};

export default importancePanelTreeMethods;
