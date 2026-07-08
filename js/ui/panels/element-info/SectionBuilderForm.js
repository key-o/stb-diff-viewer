/**
 * @fileoverview スキーマ駆動 断面ビルダーフォーム
 *
 * JSON Schema の要素ツリー（属性・choiceGroup・cardinality）を再帰的に辿り、
 * 「スキーマを選択しながら子・孫要素を組み立てる」モーダル UI を提供する。
 * 完成した formState は sectionXmlBuilder で XML 化し、EditMode.addNewSectionElement で
 * documentA に追加する。
 *
 * モーダルの見た目は parameter-editor.css / add-member-form.css を再利用する。
 *
 * @module ui/panels/element-info/SectionBuilderForm
 */

import { createLogger } from '../../../utils/logger.js';
import { getState } from '../../../data/state/globalState.js';
import { showError } from '../../common/toast.js';
import { buildTemplateNode } from '../../../common-stb/import/section/sectionTemplateModel.js';
import { buildSectionElement } from '../../../common-stb/import/section/sectionXmlBuilder.js';
import {
  validateElement,
  getActiveVersion,
  setActiveVersion,
} from '../../../common-stb/import/parser/jsonSchemaLoader.js';
import { detectStbVersion } from '../../../common-stb/import/parser/utils/stbVersionDetection.js';
import { addNewSectionElement } from './EditMode.js';
import { createAttrFieldRow } from './schemaFieldFactory.js';

const log = createLogger('ui:panels:section-builder');

/** id/guid は UI 入力対象外（id は自動採番、guid は省略可） */
const SKIP_ATTRS = new Set(['id', 'guid']);

/** 要素タグ名の表示ラベル（無ければタグ名をそのまま使う） */
const ELEMENT_LABELS = {
  StbSecFigureColumn_RC: '形状',
  StbSecBarArrangementColumn_RC: '配筋',
  StbSecColumn_RC_Rect: '矩形',
  StbSecColumn_RC_Circle: '円形',
  StbSecBarColumn_RC_RectSame: '矩形（同一）',
  StbSecBarColumn_RC_RectNotSame: '矩形（上下別）',
  StbSecBarColumn_RC_CircleSame: '円形（同一）',
  StbSecBarColumn_RC_CircleNotSame: '円形（上下別）',
  StbSecBarColumnXReinforced: 'X 補強',
};

/**
 * @param {string} name
 * @returns {string}
 */
function labelFor(name) {
  return ELEMENT_LABELS[name] || name;
}

/**
 * @typedef {Object} NodeController
 * @property {() => {elementName: string, attrs: Object<string,string>, children: Array}} collect
 */

/**
 * テンプレートノード（1 要素）を host に描画し、collect() で formState を返すコントローラを得る。
 * @param {string} elementName
 * @param {HTMLElement} host
 * @param {{posIndex?: number}} [opts]
 * @returns {NodeController}
 */
function renderNode(elementName, host, opts = {}) {
  const node = buildTemplateNode(elementName);
  if (!node) {
    return { collect: () => ({ elementName, attrs: {}, children: [] }) };
  }

  const fieldCtrls = [];
  for (const attr of node.attributes) {
    if (SKIP_ATTRS.has(attr.name)) continue;
    const indexDefault = attr.name === 'pos' ? opts.posIndex : undefined;
    const ctrl = createAttrFieldRow(attr, { indexDefault });
    host.appendChild(ctrl.row);
    fieldCtrls.push(ctrl);
  }

  const groupCollectors = node.childGroups.map((group) => renderChildGroup(group, host));

  return {
    collect: () => {
      const attrs = {};
      for (const c of fieldCtrls) attrs[c.name] = c.getValue();
      const children = groupCollectors.flatMap((gc) => gc());
      return { elementName, attrs, children };
    },
  };
}

/**
 * 子要素グループを描画し、collect 関数（() => 子 formState 配列）を返す。
 * @param {import('../../../common-stb/import/section/sectionTemplateModel.js').TemplateChildGroup} group
 * @param {HTMLElement} host
 * @returns {() => Array}
 */
function renderChildGroup(group, host) {
  if (group.kind === 'choice') return renderChoiceGroup(group, host);
  if (group.kind === 'optional') return renderOptionalGroup(group, host);
  return renderRequiredGroup(group, host);
}

/**
 * 必須の単一子要素（常に展開）。
 */
function renderRequiredGroup(group, host) {
  const option = group.options[0];
  const block = appendGroupBlock(host, labelFor(option.name));
  const ctrl = renderNode(option.name, block.body);
  return () => [ctrl.collect()];
}

/**
 * 任意の単一子要素（チェックボックスで展開/折りたたみ）。
 * 形状（Figure）は 3D 描画に必要なため既定で展開する。
 */
function renderOptionalGroup(group, host) {
  const option = group.options[0];
  const defaultOn = option.name.includes('Figure');

  const block = appendGroupBlock(host, labelFor(option.name), { optional: true, defaultOn });
  let ctrl = null;

  const rebuild = () => {
    block.body.innerHTML = '';
    ctrl = block.checkbox.checked ? renderNode(option.name, block.body) : null;
    block.body.style.display = block.checkbox.checked ? '' : 'none';
  };
  block.checkbox.addEventListener('change', rebuild);
  rebuild();

  return () => (ctrl ? [ctrl.collect()] : []);
}

/**
 * choiceGroup（選択肢から 1 つ選び、その要素を minOccurs 個展開）。
 */
function renderChoiceGroup(group, host) {
  const block = appendGroupBlock(host, '種別');

  const select = document.createElement('select');
  select.className = 'parameter-dropdown';
  for (const option of group.options) {
    const opt = document.createElement('option');
    opt.value = option.name;
    opt.textContent = labelFor(option.name);
    select.appendChild(opt);
  }
  const selectRow = document.createElement('div');
  selectRow.className = 'add-member-row';
  const selectLabel = document.createElement('label');
  selectLabel.className = 'add-member-label';
  selectLabel.textContent = '選択';
  selectRow.appendChild(selectLabel);
  selectRow.appendChild(select);
  block.body.appendChild(selectRow);

  const instanceHost = document.createElement('div');
  block.body.appendChild(instanceHost);

  let instanceCtrls = [];

  const rebuild = () => {
    instanceHost.innerHTML = '';
    instanceCtrls = [];
    const option = group.options.find((o) => o.name === select.value);
    if (!option) return;
    const count = Math.max(1, option.minOccurs);
    for (let i = 0; i < count; i += 1) {
      const instBlock =
        count > 1
          ? appendGroupBlock(instanceHost, `${labelFor(option.name)} #${i + 1}`)
          : { body: instanceHost };
      instanceCtrls.push(renderNode(option.name, instBlock.body, { posIndex: i }));
    }
  };
  select.addEventListener('change', rebuild);
  rebuild();

  return () => instanceCtrls.map((c) => c.collect());
}

/**
 * グループ用の入れ子ブロック（見出し + 本体）を host に追加する。
 * optional の場合はチェックボックス付きの見出しにする。
 * @returns {{ body: HTMLElement, checkbox?: HTMLInputElement }}
 */
function appendGroupBlock(host, title, { optional = false, defaultOn = false } = {}) {
  const block = document.createElement('div');
  block.className = 'section-builder-group';

  const heading = document.createElement('div');
  heading.className = 'section-builder-group-title';

  let checkbox;
  if (optional) {
    checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = defaultOn;
    const labelEl = document.createElement('label');
    labelEl.className = 'section-builder-group-check';
    labelEl.appendChild(checkbox);
    labelEl.appendChild(document.createTextNode(` ${title}`));
    heading.appendChild(labelEl);
  } else {
    heading.textContent = title;
  }
  block.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'section-builder-group-body';
  block.appendChild(body);

  host.appendChild(block);
  return { body, checkbox };
}

/**
 * formState ツリーを再帰的にスキーマ検証する。
 * id/guid は UI 入力対象外（id は採番）のため検証から除外する。
 * @param {{elementName: string, attrs: Object<string,string>, children?: Array}} formState
 * @returns {Array<{element: string, attr: string, error: string}>}
 */
function validateFormStateTree(formState) {
  const errors = [];
  const result = validateElement(formState.elementName, formState.attrs || {});
  for (const e of result.errors || []) {
    if (SKIP_ATTRS.has(e.attr)) continue;
    errors.push({ element: formState.elementName, attr: e.attr, error: e.error });
  }
  for (const child of formState.children || []) {
    errors.push(...validateFormStateTree(child));
  }
  return errors;
}

/**
 * 断面ビルダーモーダルを開く。
 * @param {string} [rootElementName='StbSecColumn_RC'] - 構築する断面ルート要素
 * @returns {Promise<{id: string, tagName: string}|null>} 追加した断面、またはキャンセル時 null
 */
export function openSectionBuilder(rootElementName = 'StbSecColumn_RC') {
  return new Promise((resolve) => {
    const docA = getState('models.documentA');
    if (!docA) {
      showError('モデルAが読み込まれていません');
      resolve(null);
      return;
    }

    // 断面は documentA に追加されるため、選択肢・属性をモデルAのバージョンに合わせる。
    // アクティブ版は比較表示用に A/B の新しい方が設定され得るので、モーダル表示中だけ
    // モデルAの版へ切り替え、閉じる際に必ず元へ復元する（判定不能時は切り替えない）。
    const modelAVersion = detectStbVersion(docA);
    const previousActiveVersion = getActiveVersion();
    const versionSwitched = modelAVersion !== 'unknown' && modelAVersion !== previousActiveVersion;
    if (versionSwitched) setActiveVersion(modelAVersion);

    let settled = false;
    let onKeydown = null;
    const overlay = document.createElement('div');
    overlay.className = 'parameter-editor-overlay add-member-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const close = (value) => {
      if (settled) return;
      settled = true;
      if (versionSwitched) setActiveVersion(previousActiveVersion);
      if (onKeydown) document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(value);
    };

    const container = document.createElement('div');
    container.className = 'parameter-editor-container';

    const header = document.createElement('div');
    header.className = 'parameter-editor-header';
    const title = document.createElement('h3');
    title.className = 'parameter-editor-title';
    title.textContent = `新規断面の作成（${labelFor(rootElementName)}）`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'parameter-editor-close';
    closeBtn.setAttribute('aria-label', '閉じる');
    closeBtn.textContent = '×';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const content = document.createElement('div');
    content.className = 'parameter-editor-content';

    const rootCtrl = renderNode(rootElementName, content);

    const buttonArea = document.createElement('div');
    buttonArea.className = 'parameter-editor-buttons';
    buttonArea.innerHTML = `
      <button type="button" class="parameter-editor-cancel">キャンセル</button>
      <button type="button" class="parameter-editor-ok">作成</button>
    `;

    container.appendChild(header);
    container.appendChild(content);
    container.appendChild(buttonArea);
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const onSubmit = () => {
      const doc = getState('models.documentA');
      const formState = rootCtrl.collect();

      // スキーマ検証（必須属性・値制約）。エラーがあれば先頭を通知して中断する。
      const errors = validateFormStateTree(formState);
      if (errors.length > 0) {
        const first = errors[0];
        showError(`入力エラー（${first.element} / ${first.attr}）: ${first.error}`);
        return;
      }

      let element;
      try {
        element = buildSectionElement(doc, formState);
      } catch (error) {
        log.warn('断面 XML の構築に失敗:', error);
        showError('断面の構築に失敗しました');
        return;
      }
      const result = addNewSectionElement(element);
      if (result.success) {
        close({ id: result.id, tagName: result.tagName });
      } else {
        showError(result.error || '断面の追加に失敗しました');
      }
    };

    header.querySelector('.parameter-editor-close')?.addEventListener('click', () => close(null));
    buttonArea
      .querySelector('.parameter-editor-cancel')
      ?.addEventListener('click', () => close(null));
    buttonArea.querySelector('.parameter-editor-ok')?.addEventListener('click', onSubmit);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    onKeydown = (e) => {
      if (e.key === 'Escape') close(null);
    };
    document.addEventListener('keydown', onKeydown);
  });
}
