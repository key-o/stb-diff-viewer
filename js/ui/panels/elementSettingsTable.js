/**
 * @fileoverview 要素設定テーブルの動的生成
 *
 * @module ui/panels/elementSettingsTable
 */

import {
  STRUCTURAL_SYSTEM_ELEMENT_TYPES,
  STRUCTURAL_SYSTEM_LABELS,
} from '../../constants/structuralSystems.js';

const ELEMENT_SETTINGS = [
  {
    type: 'Node',
    label: '節点 (StbNode)',
    jpName: '節点',
    solidType: 'none',
    displayId: 'toggleNodeView',
    solidId: null,
    solidName: null,
    defaultVisible: true,
    defaultSolid: false,
    defaultLabel: false,
  },
  {
    type: 'Axis',
    label: '通り芯 (StbAxis)',
    jpName: '通り芯',
    solidType: 'none',
    displayId: 'toggleAxisView',
    solidId: null,
    solidName: null,
    defaultVisible: true,
    defaultSolid: false,
    defaultLabel: true,
  },
  {
    type: 'Story',
    label: '階 (StbStory)',
    jpName: '階',
    solidType: 'none',
    displayId: 'toggleStoryView',
    solidId: null,
    solidName: null,
    defaultVisible: true,
    defaultSolid: false,
    defaultLabel: true,
  },
  {
    type: 'Column',
    label: '柱 (StbColumn)',
    jpName: '柱',
    solidType: 'checkbox',
    displayId: null,
    solidId: 'toggleColumnView',
    solidName: 'columnViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Girder',
    label: '大梁 (StbGirder)',
    jpName: '大梁',
    solidType: 'checkbox',
    displayId: null,
    solidId: 'toggleGirderView',
    solidName: 'girderViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Beam',
    label: '小梁 (StbBeam)',
    jpName: '小梁',
    solidType: 'checkbox',
    displayId: null,
    solidId: 'toggleBeam3DView',
    solidName: 'beam3DViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Brace',
    label: 'ブレース (StbBrace)',
    jpName: 'ブレース',
    solidType: 'checkbox',
    displayId: 'toggleBraceView',
    solidId: 'toggleBrace3DView',
    solidName: 'brace3DViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Post',
    label: '間柱 (StbPost)',
    jpName: '間柱',
    solidType: 'checkbox',
    displayId: 'togglePostView',
    solidId: 'togglePost3DView',
    solidName: 'post3DViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Slab',
    label: 'スラブ (StbSlab)',
    jpName: 'スラブ',
    solidType: 'checkbox',
    displayId: 'toggleSlabView',
    solidId: 'toggleSlab3DView',
    solidName: 'slab3DViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Wall',
    label: '壁 (StbWall)',
    jpName: '壁',
    solidType: 'checkbox',
    displayId: 'toggleWallView',
    solidId: 'toggleWall3DView',
    solidName: 'wall3DViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Parapet',
    label: 'パラペット (StbParapet)',
    jpName: 'パラペット',
    solidType: 'checkbox',
    displayId: 'toggleParapetView',
    solidId: 'toggleParapet3DView',
    solidName: 'parapet3DViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Joint',
    label: '接合 (StbJoint)',
    jpName: '接合',
    solidType: 'solidOnly',
    displayId: 'toggleJointView',
    solidId: null,
    solidName: null,
    defaultVisible: false,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Pile',
    label: '杭 (StbPile)',
    jpName: '杭',
    solidType: 'checkbox',
    displayId: 'togglePileView',
    solidId: 'togglePile3DView',
    solidName: 'pile3DViewMode',
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Footing',
    label: '基礎 (StbFooting)',
    jpName: '基礎',
    solidType: 'solidOnly',
    displayId: 'toggleFootingView',
    solidId: null,
    solidName: null,
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'StripFooting',
    label: '布基礎 (StbStripFooting)',
    jpName: '布基礎',
    solidType: 'checkbox',
    displayId: 'toggleStripFootingView',
    solidId: 'toggleStripFooting3DView',
    solidName: 'stripFooting3DViewMode',
    defaultVisible: false,
    defaultSolid: false,
    defaultLabel: false,
  },
  {
    type: 'FoundationColumn',
    label: '基礎柱 (StbFoundationColumn)',
    jpName: '基礎柱',
    solidType: 'solidOnly',
    displayId: 'toggleFoundationColumnView',
    solidId: null,
    solidName: null,
    defaultVisible: true,
    defaultSolid: true,
    defaultLabel: false,
  },
  {
    type: 'Undefined',
    label: '未定義断面 (StbSecUndefined)',
    jpName: '未定義断面',
    solidType: 'lineOnly',
    displayId: 'toggleUndefinedView',
    solidId: null,
    solidName: null,
    defaultVisible: true,
    defaultSolid: false,
    defaultLabel: false,
    displayTitle: '未定義断面の要素を表示',
  },
];

function createDisplayCell(setting) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'elements';
  input.value = setting.type;
  if (setting.displayId) input.id = setting.displayId;
  input.title = setting.displayTitle || `${setting.jpName}を表示`;
  if (setting.defaultVisible) input.checked = true;
  td.appendChild(input);
  return td;
}

function createSolidCell(setting) {
  const td = document.createElement('td');
  if (setting.solidType === 'none') {
    td.textContent = '-';
  } else if (setting.solidType === 'solidOnly') {
    const span = document.createElement('span');
    span.className = 'solid-only-indicator';
    span.title = '常に立体表示';
    span.textContent = '\u25A0';
    td.appendChild(span);
  } else if (setting.solidType === 'lineOnly') {
    const span = document.createElement('span');
    span.className = 'line-only-indicator';
    span.title = '常にライン表示';
    span.textContent = '━';
    td.appendChild(span);
  } else {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = setting.solidId;
    input.name = setting.solidName;
    input.title = `${setting.jpName}を立体表示`;
    if (setting.defaultSolid) input.checked = true;
    td.appendChild(input);
  }
  return td;
}

function createLabelCell(setting) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'labelToggle';
  input.value = setting.type;
  input.id = `toggleLabel-${setting.type}`;
  input.title = `${setting.jpName}ラベルを表示`;
  if (setting.defaultLabel) input.checked = true;
  td.appendChild(input);
  return td;
}

function createColorCell(setting) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'element-color-input';
  input.dataset.elementType = setting.type;
  input.title = `${setting.jpName}の色を変更`;
  td.appendChild(input);
  return td;
}

/**
 * 構造種別サブ行を生成
 * @param {Object} setting - 親要素設定
 * @param {string[]} systems - 構造種別の配列
 * @returns {HTMLTableRowElement[]} サブ行の配列
 */
function createStructuralSystemRows(setting, systems) {
  return systems.map((system) => {
    const subTr = document.createElement('tr');
    subTr.className = 'structural-system-row';
    subTr.dataset.parentType = setting.type;
    subTr.dataset.structuralSystem = system;
    subTr.style.display = 'none';

    // インデント付きラベル
    const nameTd = document.createElement('td');
    nameTd.className = 'structural-system-label';
    nameTd.textContent = STRUCTURAL_SYSTEM_LABELS[system] || system;
    subTr.appendChild(nameTd);

    // 表示チェックボックス
    const displayTd = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'structuralSystemFilter';
    input.value = `${setting.type}:${system}`;
    input.checked = true;
    input.title = `${setting.jpName}の${system}を表示`;
    displayTd.appendChild(input);
    subTr.appendChild(displayTd);

    // 立体/ラベル/色は空セル
    for (let i = 0; i < 3; i++) {
      subTr.appendChild(document.createElement('td'));
    }

    return subTr;
  });
}

export function renderElementSettingsRows() {
  const tbody = document.getElementById('element-settings-body');
  if (!tbody) return;

  for (const setting of ELEMENT_SETTINGS) {
    const tr = document.createElement('tr');
    const subSystems = STRUCTURAL_SYSTEM_ELEMENT_TYPES[setting.type];

    // 要素名セル
    const nameTd = document.createElement('td');
    if (subSystems) {
      const toggle = document.createElement('span');
      toggle.className = 'structural-system-toggle';
      toggle.textContent = '\u25B6';
      toggle.title = '構造種別フィルタを展開';
      toggle.dataset.elementType = setting.type;
      nameTd.appendChild(toggle);
      nameTd.appendChild(document.createTextNode(' ' + setting.label));
      tr.classList.add('has-sub-categories');
    } else {
      nameTd.textContent = setting.label;
    }
    tr.appendChild(nameTd);

    tr.appendChild(createDisplayCell(setting));
    tr.appendChild(createSolidCell(setting));
    tr.appendChild(createLabelCell(setting));
    tr.appendChild(createColorCell(setting));

    tbody.appendChild(tr);

    // 構造種別サブ行を追加
    if (subSystems) {
      const subRows = createStructuralSystemRows(setting, subSystems);
      for (const subRow of subRows) {
        tbody.appendChild(subRow);
      }
    }
  }

  // トグル展開/折りたたみのイベントリスナー
  setupStructuralSystemToggles();
}

/**
 * 構造種別トグルの展開/折りたたみイベントを設定
 */
function setupStructuralSystemToggles() {
  const toggles = document.querySelectorAll('.structural-system-toggle');
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const elementType = toggle.dataset.elementType;
      const isExpanded = toggle.classList.toggle('expanded');
      toggle.textContent = isExpanded ? '\u25BC' : '\u25B6';
      toggle.title = isExpanded ? '構造種別フィルタを折りたたむ' : '構造種別フィルタを展開';

      // サブ行の表示/非表示を切り替え
      const subRows = document.querySelectorAll(
        `.structural-system-row[data-parent-type="${elementType}"]`,
      );
      subRows.forEach((row) => {
        row.style.display = isExpanded ? '' : 'none';
      });
    });
  });
}

export { ELEMENT_SETTINGS };
