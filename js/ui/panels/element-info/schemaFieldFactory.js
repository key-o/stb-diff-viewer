/**
 * @fileoverview スキーマ駆動 入力フィールド生成
 *
 * sectionTemplateModel の TemplateAttr から、型・列挙・制約に応じた入力コントロール行を生成する。
 * SectionBuilderForm（および将来は AddMemberForm）から再利用する。
 *
 * @module ui/panels/element-info/schemaFieldFactory
 */

/** DOM id の一意性を保つための連番（同名属性が複数インスタンスに現れるため） */
let fieldSeq = 0;

/**
 * 属性 1 件の入力行を生成する。
 * @param {import('../../../common-stb/import/section/sectionTemplateModel.js').TemplateAttr} attr
 * @param {Object} [options]
 * @param {number} [options.indexDefault] - enum 属性の既定値を enum[indexDefault] にする
 *   （NotSame の pos のように、インスタンスごとに異なる既定値を与えたい場合）
 * @returns {{ row: HTMLElement, name: string, getValue: () => string }}
 */
export function createAttrFieldRow(attr, options = {}) {
  const row = document.createElement('div');
  row.className = 'add-member-row';

  const fieldId = `sec-field-${attr.name}-${(fieldSeq += 1)}`;

  const label = document.createElement('label');
  label.className = 'add-member-label';
  label.textContent = attr.required ? `${attr.name} *` : attr.name;
  label.htmlFor = fieldId;
  row.appendChild(label);

  const input = createInput(attr, options);
  input.id = fieldId;
  input.dataset.attr = attr.name;
  row.appendChild(input);

  return { row, name: attr.name, getValue: () => input.value };
}

/**
 * 属性の型・制約から入力コントロールを生成する。
 * @param {import('../../../common-stb/import/section/sectionTemplateModel.js').TemplateAttr} attr
 * @param {{indexDefault?: number}} options
 * @returns {HTMLInputElement|HTMLSelectElement}
 */
function createInput(attr, options) {
  // 列挙値 → セレクト
  if (attr.enum && attr.enum.length > 0) {
    const select = document.createElement('select');
    select.className = 'parameter-dropdown';
    for (const value of attr.enum) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
    const idxDefault =
      Number.isInteger(options.indexDefault) && attr.enum[options.indexDefault] !== undefined
        ? attr.enum[options.indexDefault]
        : null;
    const preferred = idxDefault ?? attr.default ?? attr.enum[0];
    if (attr.enum.includes(preferred)) select.value = preferred;
    return select;
  }

  // boolean → true/false セレクト
  if (attr.type === 'boolean') {
    const select = document.createElement('select');
    select.className = 'parameter-dropdown';
    for (const value of ['', 'true', 'false']) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value || '（未設定）';
      select.appendChild(opt);
    }
    if (attr.default != null) select.value = String(attr.default);
    return select;
  }

  // 数値 → number 入力（制約反映）
  if (attr.type === 'number' || attr.type === 'integer') {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'parameter-text-input parameter-number-input';
    const c = attr.constraints;
    if (c) {
      if (c.minInclusive != null) input.min = String(c.minInclusive);
      if (c.maxInclusive != null) input.max = String(c.maxInclusive);
    }
    if (attr.type === 'integer') input.step = '1';
    if (attr.default != null) input.value = String(attr.default);
    return input;
  }

  // string（既定）
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'parameter-text-input';
  if (attr.default != null) input.value = String(attr.default);
  return input;
}
