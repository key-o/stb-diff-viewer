/**
 * @fileoverview AR要素情報の表示文言整形（FR-6.1）
 *
 * ARピック結果（userData）から情報カードに表示するテキストを組み立てます。
 * DOM非依存の純関数として実装し、ユニットテストの対象とします。
 */

/** 要素タイプの日本語表示名（未定義のタイプは英語名のまま表示） */
const ELEMENT_TYPE_LABELS = {
  Node: '節点',
  Column: '柱',
  Post: '間柱',
  Girder: '大梁',
  Beam: '小梁',
  Brace: 'ブレース',
  Slab: 'スラブ',
  Wall: '壁',
  Footing: '基礎',
  StripFooting: '布基礎',
  Pile: '杭',
  FoundationColumn: '基礎柱',
  Parapet: 'パラペット',
  Joint: '継手',
  Open: '開口',
};

/** モデルソースの日本語表示名 */
const MODEL_SOURCE_LABELS = {
  matched: 'A/B 一致',
  onlyA: 'Aのみ',
  onlyB: 'Bのみ',
  A: 'Aのみ',
  B: 'Bのみ',
};

/** 差分状態の日本語表示名（diffStatus / toleranceState 共通） */
const DIFF_STATUS_LABELS = {
  exact: '完全一致',
  tolerance: '許容差内',
  mismatch: '不一致',
  onlyA: 'Aのみ',
  onlyB: 'Bのみ',
};

/**
 * AR要素情報カードの表示テキスト
 * @typedef {Object} ArElementInfoText
 * @property {string} title - 1行目（要素タイプとID）
 * @property {string} detail - 2行目（モデルソース・差分状態など。無い場合は空文字）
 */

/**
 * ピック結果から情報カードの表示テキストを組み立てる
 * @param {{elementType: string, userData: Object}|null} picked - ARピック結果
 * @returns {ArElementInfoText|null} 表示テキスト（pickedがnullならnull）
 */
export function formatArElementInfo(picked) {
  if (!picked || !picked.userData) return null;
  const ud = picked.userData;
  const elementType = picked.elementType || ud.elementType || ud.stbNodeType || '';
  const typeLabel = ELEMENT_TYPE_LABELS[elementType] || elementType || '要素';

  const idA = ud.elementIdA ?? null;
  const idB = ud.elementIdB ?? null;
  const singleId = ud.elementId ?? ud.id ?? null;

  let idText;
  if (idA != null && idB != null) {
    idText = String(idA) === String(idB) ? `ID ${idA}` : `A:${idA} / B:${idB}`;
  } else if (idA != null || idB != null || singleId != null) {
    idText = `ID ${idA ?? idB ?? singleId}`;
  } else {
    idText = '';
  }

  const details = [];
  const sourceLabel = MODEL_SOURCE_LABELS[ud.modelSource];
  if (sourceLabel) details.push(sourceLabel);
  const diffLabel = DIFF_STATUS_LABELS[ud.diffStatus] || DIFF_STATUS_LABELS[ud.toleranceState];
  if (diffLabel && diffLabel !== sourceLabel) details.push(`差分: ${diffLabel}`);
  if (ud.name) details.push(String(ud.name));

  return {
    title: idText ? `${typeLabel} ${idText}` : typeLabel,
    detail: details.join(' ・ '),
  };
}
