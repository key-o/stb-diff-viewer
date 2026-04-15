/**
 * @fileoverview ImportancePanel state update methods.
 */

export const importancePanelStateMethods = {
  selectCategory(categoryId) {
    this.currentTab = categoryId;
    this._treeExpandedState.clear();

    if (this.categoryListContainer) {
      this.categoryListContainer.querySelectorAll('.category-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.id === categoryId);
      });
    }

    this.refreshParameterTable();
  },

  refreshParameterTable() {
    if (!this.elementContainer) return;

    const elementPaths = this.manager.getElementPathsByTab(this.currentTab);
    this.renderParameterTable(this.filterElementPaths(elementPaths));
  },

  refreshCurrentTab() {
    if (!this.currentTab) {
      this.currentTab = 'StbCommon';
    }

    this.renderCategoryList();
    this.refreshParameterTable();
    this.updateStatistics();
  },

  filterElementPaths(elementPaths) {
    return elementPaths.filter((path) => {
      if (this.filterText && !path.toLowerCase().includes(this.filterText.toLowerCase())) {
        return false;
      }

      if (this.filterImportance !== 'all') {
        const importance = this.normalizeBinaryLevel(this.manager.getImportanceLevel(path));
        if (importance !== this.filterImportance) {
          return false;
        }
      }

      return true;
    });
  },

  applyCategoryListFilter() {
    const filterText = (this.categoryFilterText || '').toLowerCase();
    if (!this.categoryListContainer) return;

    this.categoryListContainer.querySelectorAll('.category-group').forEach((group) => {
      const items = group.querySelectorAll('.category-item');
      let anyVisible = false;
      items.forEach((item) => {
        const name = (item.querySelector('.category-name')?.textContent || '').toLowerCase();
        const visible = name.includes(filterText);
        item.style.display = visible ? 'flex' : 'none';
        if (visible) anyVisible = true;
      });
      group.style.display = anyVisible ? '' : 'none';
      if (filterText && anyVisible) {
        group.classList.remove('collapsed');
      }
    });

    this.categoryListContainer.querySelectorAll(':scope > .category-item').forEach((item) => {
      const name = (item.querySelector('.category-name')?.textContent || '').toLowerCase();
      item.style.display = name.includes(filterText) ? 'flex' : 'none';
    });
  },

  updateSort(sortKey) {
    if (!sortKey) return;

    if (this.parameterSortKey === sortKey) {
      this.parameterSortDirection = this.parameterSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.parameterSortKey = sortKey;
      this.parameterSortDirection = sortKey === 'xsdRequired' ? 'desc' : 'asc';
    }

    this.refreshParameterTable();
  },

  handleImportanceChange(path, importance) {
    this.manager.setImportanceLevel(path, importance);
  },

  updateStatistics() {
    if (!this.statisticsContainer) return;

    const stats = this.manager.getStatistics();

    this.statisticsContainer.innerHTML = `
      <div class="statistics-grid">
        <div class="stat-item total-parameters">
          <div class="stat-label">STB内パラメータ数</div>
          <div class="stat-value">${stats.totalParameterCount || 0}</div>
        </div>
        <div class="stat-item xsd-required">
          <div class="stat-label">XSD必須数</div>
          <div class="stat-value">${stats.xsdRequiredCount || 0}</div>
        </div>
        <div class="stat-item s2-target">
          <div class="stat-label">S2対象数</div>
          <div class="stat-value">${stats.s2TargetCount || 0}</div>
        </div>
        <div class="stat-item s4-target">
          <div class="stat-label">S4対象数</div>
          <div class="stat-value">${stats.s4TargetCount || 0}</div>
        </div>
      </div>
    `;
  },
};

export default importancePanelStateMethods;
