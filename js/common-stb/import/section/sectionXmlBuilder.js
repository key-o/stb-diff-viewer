/**
 * @fileoverview スキーマ駆動 断面 XML ビルダー
 *
 * SectionBuilderForm が組み立てた formState（テンプレートに沿った属性 + 子ツリー）を
 * ネストした DOM 要素へ変換する。純粋なシリアライズに徹し、id 採番やコンテナへの
 * 追加は EditMode 側が行う。
 *
 * @module common-stb/import/section/sectionXmlBuilder
 */

import { getElementAttributes } from '../parser/jsonSchemaLoader.js';

/**
 * @typedef {Object} SectionFormState
 * @property {string} elementName 要素タグ名
 * @property {Object<string, string>} [attrs] 属性値（空文字・未設定は出力しない）
 * @property {SectionFormState[]} [children] 子要素の formState
 */

/**
 * formState から DOM 要素ツリーを構築する（id は付与しない）。
 * 名前空間は親（StbModel 等）から継承するため、ルートのドキュメント要素の
 * namespaceURI を既定として使う。明示指定があればそれを優先する。
 *
 * fixed（const）属性はスキーマから自動補完する。
 *
 * @param {Document} doc
 * @param {SectionFormState} formState
 * @param {string|null} [ns] 名前空間 URI（省略時は documentElement から継承）
 * @returns {Element}
 */
export function buildSectionElement(doc, formState, ns = undefined) {
  if (!doc) throw new Error('buildSectionElement: doc が必要です');
  if (!formState || !formState.elementName) {
    throw new Error('buildSectionElement: formState.elementName が必要です');
  }

  const namespace = ns !== undefined ? ns : (doc.documentElement?.namespaceURI ?? null);

  const element = namespace
    ? doc.createElementNS(namespace, formState.elementName)
    : doc.createElement(formState.elementName);

  // fixed（const）属性をスキーマから補完
  const attrMap = getElementAttributes(formState.elementName);
  const fixedNames = new Set();
  if (attrMap) {
    for (const [name, def] of attrMap) {
      if (def.fixed !== null && def.fixed !== undefined) {
        element.setAttribute(name, String(def.fixed));
        fixedNames.add(name);
      }
    }
  }

  // 入力属性を設定（空値・fixed 属性はスキップ。fixed はスキーマ値を優先する）
  for (const [name, value] of Object.entries(formState.attrs || {})) {
    if (fixedNames.has(name)) continue;
    if (value === undefined || value === null || String(value).trim() === '') continue;
    element.setAttribute(name, String(value));
  }

  // 子要素を再帰構築（名前空間を継承）
  for (const child of formState.children || []) {
    element.appendChild(buildSectionElement(doc, child, namespace));
  }

  return element;
}
