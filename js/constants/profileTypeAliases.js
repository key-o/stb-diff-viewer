/**
 * @fileoverview プロファイルタイプのエイリアス定義
 *
 * 各種断面タイプの文字列エイリアスを正規化された（canonical）形式にマッピングする。
 * IFCエクスポート、ビューアジオメトリ、データ収集の3システムで共通利用される。
 *
 * Layer 0（constants）: 全レイヤーからimport可能
 *
 * @module constants/profileTypeAliases
 */

/**
 * エイリアス文字列から正規化されたプロファイルタイプへのマッピング
 *
 * 正規化タイプ一覧:
 * H, BOX, PIPE, RECTANGLE, CIRCLE, C, L, T, FB,
 * SRC, CFT, 2L-BB, 2L-FF, 2C-BB, 2C-FF, CROSS, CROSS_H
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PROFILE_TYPE_ALIASES = Object.freeze({
  // H形鋼
  'H': 'H',
  'I': 'H',
  'IBEAM': 'H',
  'H-SECTION': 'H',

  // 角形鋼管 (BOX)
  'BOX': 'BOX',
  'BOX-SECTION': 'BOX',
  'SQUARE-SECTION': 'BOX',

  // 円形鋼管 (PIPE)
  'PIPE': 'PIPE',
  'PIPE-SECTION': 'PIPE',
  'ROUND-SECTION': 'PIPE',

  // 矩形
  'RECTANGLE': 'RECTANGLE',
  'RECT': 'RECTANGLE',
  'RC-SECTION': 'RECTANGLE',
  'RC': 'RECTANGLE',

  // 円形（中実）
  'CIRCLE': 'CIRCLE',

  // 溝形鋼 (C/U)
  'C': 'C',
  'CHANNEL': 'C',
  'U-SHAPE': 'C',
  'U': 'C',

  // L形鋼
  'L': 'L',
  'L-SHAPE': 'L',

  // T形鋼
  'T': 'T',
  'T-SHAPE': 'T',

  // フラットバー
  'FLAT': 'FB',
  'FB': 'FB',

  // 複合タイプ
  'SRC': 'SRC',
  'STB-DIFF-VIEWER': 'SRC',
  'CFT': 'CFT',

  // 組合せ断面
  '2L-BB': '2L-BB',
  '2L-BACKTOBACK': '2L-BB',
  '2L-FF': '2L-FF',
  '2L-FACETOFACE': '2L-FF',
  '2C-BB': '2C-BB',
  '2C-BACKTOBACK': '2C-BB',
  '2C-FF': '2C-FF',
  '2C-FACETOFACE': '2C-FF',

  // クロス断面
  'CROSS': 'CROSS',
  '+': 'CROSS',
  'CROSS_H': 'CROSS_H',
});

/**
 * プロファイルタイプ文字列を正規化された形式に変換する
 * @param {string} profileType - 生のプロファイルタイプ文字列
 * @returns {string|null} 正規化されたプロファイルタイプ。未認識の場合はnull
 */
export function resolveProfileType(profileType) {
  if (!profileType) return null;
  return PROFILE_TYPE_ALIASES[profileType.toUpperCase()] || null;
}
