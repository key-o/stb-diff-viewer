/**
 * @fileoverview 新規部材タイプのジオメトリ分類（単一情報源）
 *
 * 「節点 / 線材 / 面材 / 点部材」というジオメトリ上の分類は、入力フォーム
 * （AddMemberForm）と作成前検証（addMemberValidation）の双方が参照する。
 * かつては両ファイルが同一の Set を各自で持っていたため、新しい部材タイプを
 * 追加するたびに 2 箇所を同期更新する必要があった。この分類をここに集約し、
 * 両者がこのモジュールだけを参照するようにする。
 *
 * （XML 生成上「StbNodeIdOrder を持つか」は EditMode の
 *  NEW_MEMBER_DEFINITIONS[*].nodeList が担う別の関心事。面材＝nodeList と一致するが、
 *  レイヤーが異なるため二重管理ではなくそれぞれの責務として持つ。）
 *
 * @module ui/panels/element-info/memberCategories
 */

/** 座標（X/Y/Z）で定義される節点タイプ。 */
export const NODE_TYPES = new Set(['Node']);

/** 2節点で定義される線材タイプ（端部節点・断面・回転を共通検証する）。パラペットも含む。 */
export const LINE_MEMBER_TYPES = new Set(['Column', 'Post', 'Girder', 'Beam', 'Brace', 'Parapet']);

/** 3点以上の節点列（StbNodeIdOrder）で定義される面材タイプ。 */
export const PANEL_MEMBER_TYPES = new Set(['Slab', 'Wall']);

/** 1節点（id_node）で配置される点部材タイプ（杭・基礎・基礎柱）。 */
export const POINT_MEMBER_TYPES = new Set(['Pile', 'Footing', 'FoundationColumn']);

/**
 * 部材タイプのジオメトリ分類を返す。
 * @param {string} elementType
 * @returns {'node'|'line'|'panel'|'point'|'unknown'}
 */
export function memberCategoryOf(elementType) {
  if (NODE_TYPES.has(elementType)) return 'node';
  if (LINE_MEMBER_TYPES.has(elementType)) return 'line';
  if (PANEL_MEMBER_TYPES.has(elementType)) return 'panel';
  if (POINT_MEMBER_TYPES.has(elementType)) return 'point';
  return 'unknown';
}
