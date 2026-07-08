/**
 * @fileoverview スキーマ駆動 断面テンプレートモデル
 *
 * JSON Schema の要素定義（属性 + x-children）を再帰的に辿り、
 * UI が雛形フォームを描画するための「テンプレート記述子」を構築する。
 *
 * - 純関数（DOM に依存しない）
 * - 版差は jsonSchemaLoader のアクティブバージョンに従う
 * - フォーム描画（ui/）と XML 生成（sectionXmlBuilder）は本モデルを共通の中間表現として使う
 *
 * @module common-stb/import/section/sectionTemplateModel
 */

import { getElementAttributes, getElementChildren } from '../parser/jsonSchemaLoader.js';

/**
 * @typedef {Object} TemplateAttr
 * @property {string} name 属性名
 * @property {string} type 'string' | 'number' | 'integer' | 'boolean'
 * @property {boolean} required 必須属性か
 * @property {string|null} default 既定値
 * @property {string[]} enum 列挙値（無ければ空配列）
 * @property {Object|null} constraints 数値・文字列制約（jsonSchemaLoader の constraints）
 */

/**
 * @typedef {Object} TemplateChildGroup
 * 子要素グループ。choiceGroup ごと、または非 choice の単一子要素ごとに 1 件。
 * @property {'choice'|'required'|'optional'} kind
 *   - choice: 同一 choiceGroup の中から 1 つを選ぶ
 *   - required: 非 choice で minOccurs>=1（常に展開）
 *   - optional: 非 choice で minOccurs=0（任意展開）
 * @property {string|null} group choiceGroup 名（kind==='choice' のみ）
 * @property {Array<{name: string, minOccurs: number, maxOccurs: number}>} options
 *   選択肢（choice 以外は要素 1 件のみ）
 */

/**
 * @typedef {Object} TemplateNode
 * @property {string} elementName STB 要素タグ名
 * @property {TemplateAttr[]} attributes
 * @property {TemplateChildGroup[]} childGroups
 */

/** maxOccurs の 'unbounded' を数値に正規化（大きな有限値として扱う） */
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

/**
 * minOccurs/maxOccurs を数値へ正規化する。
 * @param {number|string|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function toOccurs(value, fallback) {
  if (value === 'unbounded') return UNBOUNDED;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 要素の属性定義を TemplateAttr 配列へ変換する。
 * fixed（const）属性は UI 入力対象外のため除外する（XML 生成時に補完する）。
 * @param {string} elementName
 * @returns {TemplateAttr[]}
 */
function buildAttributes(elementName) {
  const attrMap = getElementAttributes(elementName);
  if (!attrMap) return [];

  const attrs = [];
  for (const [name, def] of attrMap) {
    if (def.fixed !== null && def.fixed !== undefined) continue;
    attrs.push({
      name,
      type: def.type || 'string',
      required: !!def.required,
      default: def.default ?? null,
      enum: def.constraints?.enumerations ? [...def.constraints.enumerations] : [],
      constraints: def.constraints ?? null,
    });
  }
  return attrs;
}

/**
 * 要素の子要素定義を TemplateChildGroup 配列へ変換する。
 * 同一 choiceGroup の子要素は 1 つの choice グループにまとめる。
 * 非 choice の子要素は minOccurs により required / optional に振り分ける。
 * @param {string} elementName
 * @returns {TemplateChildGroup[]}
 */
function buildChildGroups(elementName) {
  const children = getElementChildren(elementName);
  if (!children || children.length === 0) return [];

  const groups = [];
  /** @type {Map<string, TemplateChildGroup>} */
  const choiceGroups = new Map();

  for (const child of children) {
    const option = {
      name: child.name,
      minOccurs: toOccurs(child.minOccurs, 1),
      maxOccurs: toOccurs(child.maxOccurs, 1),
    };

    if (child.choiceGroup) {
      let group = choiceGroups.get(child.choiceGroup);
      if (!group) {
        group = { kind: 'choice', group: child.choiceGroup, options: [] };
        choiceGroups.set(child.choiceGroup, group);
        groups.push(group); // 出現順を保つ
      }
      // 同名オプションの重複を除去（XSD の sequence/choice 由来で同一要素が複数現れる場合がある）
      if (!group.options.some((o) => o.name === option.name)) {
        group.options.push(option);
      }
    } else {
      groups.push({
        kind: option.minOccurs >= 1 ? 'required' : 'optional',
        group: null,
        options: [option],
      });
    }
  }

  return groups;
}

/**
 * 指定要素のテンプレートノードを構築する（1 階層分。子のノードは遅延構築する）。
 * 再帰的なツリー全体ではなく、UI が選択を確定した時点で子ノードを `buildTemplateNode`
 * で取得する設計とし、choice の分岐で不要な枝を展開しないようにする。
 * @param {string} elementName
 * @returns {TemplateNode|null} スキーマ未定義なら null
 */
export function buildTemplateNode(elementName) {
  const attrMap = getElementAttributes(elementName);
  const children = getElementChildren(elementName);
  // 属性・子要素のいずれもスキーマに無ければ未定義要素とみなす
  if (!attrMap && (!children || children.length === 0)) return null;

  return {
    elementName,
    attributes: buildAttributes(elementName),
    childGroups: buildChildGroups(elementName),
  };
}

/**
 * 葉要素（子要素を持たない）かどうかを返す。
 * @param {string} elementName
 * @returns {boolean}
 */
export function isLeafElement(elementName) {
  const children = getElementChildren(elementName);
  return !children || children.length === 0;
}
