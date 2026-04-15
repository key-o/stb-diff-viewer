/**
 * @fileoverview ImportancePanel rendering methods.
 */

import { STB_ELEMENT_TABS } from '../../app/importanceManager.js';
import { IMPORTANCE_LEVELS } from '../../constants/importanceLevels.js';
import { IMPORTANCE_COLORS } from '../../config/colorConfig.js';
import { CATEGORY_HIERARCHY } from './importancePanelHierarchy.js';

export const importancePanelRenderMethods = {
  renderCategoryList() {
    if (!this.categoryListContainer) return;
    const settings = this.manager.getAllImportanceSettings();

    this.categoryListContainer.innerHTML = this.renderHierarchy(CATEGORY_HIERARCHY, settings, 0);

    this.categoryListContainer.querySelectorAll('.category-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.selectCategory(item.dataset.id);
      });
    });

    this.categoryListContainer.querySelectorAll('.category-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        const group = header.closest('.category-group');
        if (group) {
          group.classList.toggle('collapsed');
        }
      });
    });

    this.applyCategoryListFilter();
  },

  renderHierarchy(nodes, settings, depth) {
    return nodes
      .map((node) => {
        if (node.type === 'item') {
          return this.renderCategoryItem(node.id, settings, depth);
        }

        const childrenHtml = node.children
          ? this.renderHierarchy(node.children, settings, depth + 1)
          : (node.items || [])
              .map((id) => this.renderCategoryItem(id, settings, depth + 1))
              .join('');

        return `
        <li class="category-group">
          <div class="category-group-header" style="padding-left: ${8 + depth * 12}px">
            <span class="group-toggle-icon"></span>
            <span class="group-label">${node.label}</span>
          </div>
          <ul class="category-group-children">${childrenHtml}</ul>
        </li>`;
      })
      .join('');
  },

  renderCategoryItem(tabId, settings, depth) {
    const tab = STB_ELEMENT_TABS.find((item) => item.id === tabId);
    if (!tab) return '';
    const paths = this.manager.getElementPathsByTab(tab.id);
    const count = paths.filter((path) => settings.has(path)).length;
    const isActive = this.currentTab === tab.id;

    return `
      <li class="category-item ${isActive ? 'active' : ''}" data-id="${tab.id}" style="padding-left: ${8 + depth * 12}px">
        <span class="category-name">${tab.name}</span>
        <span class="count-badge">${count}</span>
      </li>`;
  },

  renderSortableHeader(label, sortKey, extraClass = '') {
    const isActive = this.parameterSortKey === sortKey;
    const direction = isActive ? this.parameterSortDirection : null;
    const indicator = direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕';
    const classes = ['sortable-header', extraClass, isActive ? 'active' : '']
      .filter(Boolean)
      .join(' ');

    return `
      <th class="${classes}" data-sort-key="${sortKey}">
        <span class="sortable-label">${label}<span class="sort-indicator">${indicator}</span></span>
      </th>
    `;
  },

  renderXsdRequiredCell(path) {
    const isRequired = this.isXsdRequired(path);
    const label = isRequired ? '必須' : '-';
    const badgeClass = isRequired ? 'xsd-required-badge required' : 'xsd-required-badge optional';
    const title = isRequired ? 'XSD必須項目' : 'XSD任意項目';
    return `<span class="${badgeClass}" title="${title}">${label}</span>`;
  },

  renderParameterRows(paths) {
    return paths
      .map((path) => {
        const s2Importance = this.normalizeBinaryLevel(
          this.manager.getMvdImportanceLevel(path, 's2'),
        );
        const s4Importance = this.normalizeBinaryLevel(
          this.manager.getMvdImportanceLevel(path, 's4'),
        );
        const paramName = this.extractParameterName(path);
        const selectableLevels = [IMPORTANCE_LEVELS.REQUIRED, IMPORTANCE_LEVELS.NOT_APPLICABLE];

        return `
          <tr class="importance-path-row attribute-row" data-path="${path}">
            <td class="xsd-required-col">${this.renderXsdRequiredCell(path)}</td>
            <td class="param-name-col" title="${path}">
              <span class="param-name">${paramName}</span>
            </td>
            <td class="mvd-col">
              <div class="importance-select-wrapper">
                <span class="status-dot status-dot-s2" style="background-color: ${IMPORTANCE_COLORS[s2Importance]};" title="${this.getBinaryLabel(s2Importance)}"></span>
                <select class="importance-select importance-select-s2" data-path="${path}" data-mvd="s2">
                  ${selectableLevels
                    .map(
                      (value) => `
                        <option value="${value}" ${value === s2Importance ? 'selected' : ''}>
                          ${this.getBinaryLabel(value)}
                        </option>
                      `,
                    )
                    .join('')}
                </select>
              </div>
            </td>
            <td class="mvd-col">
              <div class="importance-select-wrapper">
                <span class="status-dot status-dot-s4" style="background-color: ${IMPORTANCE_COLORS[s4Importance]};" title="${this.getBinaryLabel(s4Importance)}"></span>
                <select class="importance-select importance-select-s4" data-path="${path}" data-mvd="s4">
                  ${selectableLevels
                    .map(
                      (value) => `
                        <option value="${value}" ${value === s4Importance ? 'selected' : ''}>
                          ${this.getBinaryLabel(value)}
                        </option>
                      `,
                    )
                    .join('')}
                </select>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  renderPathsTable(paths, compact = false) {
    if (!paths.length) {
      return '';
    }

    const rowsHTML = this.renderParameterRows(this.sortParameterPaths(paths));
    if (compact) {
      return `
        <table class="importance-table importance-table-compact">
          <thead>
            <tr>
              ${this.renderSortableHeader('XSD必須', 'xsdRequired', 'xsd-required-col')}
              ${this.renderSortableHeader('項目名', 'paramName', 'param-name-col')}
              <th class="mvd-col">S2</th>
              <th class="mvd-col">S4</th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      `;
    }

    return `
      <table class="importance-table">
        <thead>
          <tr>
            ${this.renderSortableHeader('XSD必須', 'xsdRequired', 'xsd-required-col')}
            ${this.renderSortableHeader('項目名', 'paramName', 'param-name-col')}
            <th class="mvd-col">S2</th>
            <th class="mvd-col">S4</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    `;
  },

  renderTreeNode(node, depth = 0, nodePath = '') {
    const directPaths = this.collectDirectPaths(node);
    const childNodes = this.getSortedElementChildren(node);
    const pathCount = this.countTreePaths(node);
    const nodeId = `importance-node-${++this.treeNodeCounter}`;
    const currentNodePath = nodePath ? `${nodePath}/${node.name}` : node.name;
    const isExpanded = this._treeExpandedState.has(currentNodePath)
      ? this._treeExpandedState.get(currentNodePath)
      : depth === 0;
    const indent = Math.min(depth, 6) * 16;

    return `
      <div class="importance-tree-node depth-${Math.min(depth, 6)}">
        <div class="importance-tree-summary" style="padding-left:${10 + indent}px;">
          <span class="toggle-btn importance-toggle-btn" data-target-id="${nodeId}" data-node-path="${currentNodePath}">${isExpanded ? '-' : '+'}</span>
          <span class="tree-node-name">${node.name}</span>
          <span class="tree-node-count">${pathCount}</span>
        </div>
        <div class="importance-tree-content" data-tree-id="${nodeId}" style="display:${isExpanded ? 'block' : 'none'};">
          ${directPaths.length ? this.renderPathsTable(directPaths, true) : ''}
          ${childNodes.map((childNode) => this.renderTreeNode(childNode, depth + 1, currentNodePath)).join('')}
        </div>
      </div>
    `;
  },

  renderParameterTable(elementPaths) {
    if (!elementPaths.length) {
      this.elementContainer.innerHTML =
        '<div class="no-elements">該当するパラメータがありません</div>';
      return;
    }

    this.elementContainer.querySelectorAll('.importance-toggle-btn').forEach((btn) => {
      const nodePath = btn.dataset.nodePath;
      if (nodePath) {
        const targetId = btn.dataset.targetId;
        const targetEl = this.elementContainer.querySelector(`[data-tree-id="${targetId}"]`);
        if (targetEl) {
          this._treeExpandedState.set(nodePath, targetEl.style.display !== 'none');
        }
      }
    });

    const tree = this.buildParameterTree([...new Set(elementPaths)]);
    const rootNodes = this.getSortedElementChildren(tree);
    this.treeNodeCounter = 0;

    if (!rootNodes.length) {
      this.elementContainer.innerHTML =
        '<div class="no-elements">該当するパラメータがありません</div>';
      return;
    }

    this.elementContainer.innerHTML = `
      <div class="importance-tree-root">
        ${rootNodes.map((node) => this.renderTreeNode(node)).join('')}
      </div>
    `;

    this.elementContainer.querySelectorAll('.importance-select').forEach((select) => {
      select.addEventListener('change', (event) => {
        const path = event.target.dataset.path;
        const mvdMode = event.target.dataset.mvd;
        this.manager.setMvdImportanceLevel(path, mvdMode, event.target.value);
        this.updateRenderedPathState(path);
      });
    });

    this.elementContainer.querySelectorAll('.importance-toggle-btn').forEach((toggleBtn) => {
      toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const targetId = toggleBtn.dataset.targetId;
        const nodePath = toggleBtn.dataset.nodePath;
        const targetEl = this.elementContainer.querySelector(`[data-tree-id="${targetId}"]`);
        if (!targetEl) return;
        const isVisible = targetEl.style.display !== 'none';
        targetEl.style.display = isVisible ? 'none' : 'block';
        toggleBtn.textContent = isVisible ? '+' : '-';
        if (nodePath) {
          this._treeExpandedState.set(nodePath, !isVisible);
        }
      });
    });

    this.elementContainer.querySelectorAll('.sortable-header').forEach((header) => {
      header.addEventListener('click', () => {
        this.updateSort(header.dataset.sortKey);
      });
    });
  },

  updateRenderedPathState(path) {
    const rows = this.elementContainer?.querySelectorAll(`tr[data-path="${path}"]`);
    if (!rows || rows.length === 0) {
      return;
    }

    const s2Importance = this.normalizeBinaryLevel(this.manager.getMvdImportanceLevel(path, 's2'));
    const s4Importance = this.normalizeBinaryLevel(this.manager.getMvdImportanceLevel(path, 's4'));

    rows.forEach((row) => {
      const s2Select = row.querySelector('.importance-select-s2');
      const s4Select = row.querySelector('.importance-select-s4');
      const s2Dot = row.querySelector('.status-dot-s2');
      const s4Dot = row.querySelector('.status-dot-s4');

      if (s2Select && s2Select.value !== s2Importance) {
        s2Select.value = s2Importance;
      }
      if (s4Select && s4Select.value !== s4Importance) {
        s4Select.value = s4Importance;
      }
      if (s2Dot) {
        s2Dot.style.backgroundColor = IMPORTANCE_COLORS[s2Importance];
        s2Dot.title = this.getBinaryLabel(s2Importance);
      }
      if (s4Dot) {
        s4Dot.style.backgroundColor = IMPORTANCE_COLORS[s4Importance];
        s4Dot.title = this.getBinaryLabel(s4Importance);
      }
    });
  },
};

export default importancePanelRenderMethods;
