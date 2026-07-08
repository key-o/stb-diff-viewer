/**
 * @fileoverview 階（floor）表記の正準化
 *
 * 異ソフト間で異なる階名表記（NBUS `1` / SEIN `1FL` / `Z01` 等）を吸収するため、
 * StbStory を標高（height）昇順にソートした「階序数」へ floor を正準化する（A4方式）。
 * StbStory に存在しない floor は文字列正規化（末尾FL除去・先頭ゼロ除去）へ
 * フォールバックする（B2方式）。
 *
 * 標高順の序数対応のため、階名の文字列差にも接地階の基準標高差（150mm等）にも頑健。
 * 検証根拠: docs/reports/cross-software-match-benchmark.md（Stage B2 / A4）
 */

/**
 * 階名の文字列正規化（B2方式）。
 * trim・大文字化・末尾 `FL` 除去・先頭ゼロ除去を行う。
 * @param {string|null|undefined} floor - 階名
 * @returns {string} 正規化した階名（空値は空文字）
 */
export function normalizeFloorLabel(floor) {
  if (!floor) return '';
  return String(floor)
    .trim()
    .toUpperCase()
    .replace(/FL$/, '')
    .replace(/^0+(\d)/, '$1');
}

/**
 * StbStory を標高昇順にソートし、階名（大文字化）→ 階序数（0基点）の Map を作る。
 * 同名の StbStory が複数ある場合（データ不整合）、その階名は序数が定まらないため
 * Map から除外し、文字列正規化フォールバックに委ねる。
 * @param {Document} doc - STBドキュメント
 * @returns {Map<string, number>} 階名 → 階序数
 */
export function buildStoryOrdinalMap(doc) {
  const map = new Map();
  if (!doc?.getElementsByTagName) return map;
  const stories = Array.from(doc.getElementsByTagName('StbStory'))
    .map((el) => ({
      name: String(el.getAttribute('name') || '').trim(),
      height: parseFloat(el.getAttribute('height')),
    }))
    .filter((story) => story.name && Number.isFinite(story.height))
    .sort((a, b) => a.height - b.height);
  const ambiguous = new Set();
  stories.forEach((story, index) => {
    const key = story.name.toUpperCase();
    if (map.has(key)) {
      ambiguous.add(key);
      return;
    }
    map.set(key, index);
  });
  ambiguous.forEach((key) => map.delete(key));
  return map;
}

/**
 * ドキュメント専用の floor 正準化関数を生成する。
 * StbStory に存在する階名は `ord:N`（標高順の序数トークン）、
 * 存在しない階名は normalizeFloorLabel の結果を返す。
 * @param {Document} doc - STBドキュメント
 * @returns {(floor: string|null|undefined) => string} floor 正準化関数
 */
export function createFloorCanonicalizer(doc) {
  const ordinalMap = buildStoryOrdinalMap(doc);
  return (floor) => {
    if (!floor) return '';
    const key = String(floor).trim().toUpperCase();
    return ordinalMap.has(key) ? `ord:${ordinalMap.get(key)}` : normalizeFloorLabel(floor);
  };
}
