/**
 * utils/story-formatter.js - 階層名フォーマットユーティリティ
 *
 * 責務: SS7/STBの階層名を断面名用のプレフィックスに変換
 *
 * ported from MatrixCalc for StbDiffViewer
 */

/**
 * 階層名から「F」「L」を除いて断面名用のプレフィックスを生成
 * @param {string} story - 階層名（例: "2F", "1F", "RFL", "2MFL"）
 * @returns {string} - フォーマット済み階層名（例: "2", "1", "RF", "2MF"）
 *
 * @example
 * formatStoryForSectionName('2F')    // => '2'
 * formatStoryForSectionName('1F')    // => '1'
 * formatStoryForSectionName('RFL')   // => 'RF'
 * formatStoryForSectionName('2MFL')  // => '2MF'
 * formatStoryForSectionName('B1F')   // => 'B1'
 * formatStoryForSectionName('')      // => ''
 */
export function formatStoryForSectionName(story) {
  if (!story) return '';

  // 文字列に変換（数値が渡された場合の対応）
  const storyStr = String(story);

  // 末尾の "F" または "L" を除去
  // - "2F" → "2"
  // - "RFL" → "RF"
  // - "2MFL" → "2MF"
  const formatted = storyStr.replace(/F$/i, '').replace(/L$/i, '');

  return formatted;
}
