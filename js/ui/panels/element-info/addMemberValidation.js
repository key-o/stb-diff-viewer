/**
 * @fileoverview 新規部材の作成前バリデーション（純関数）
 *
 * AddMemberForm から作成直前に呼ぶ検証ロジック。DOM・グローバル状態に触れず、
 * 呼び出し側が用意したコンテキスト（既存ID集合・スキーマ検証関数）だけで判定するため
 * 単体テスト可能。結果は errors / warnings に分類して返す。
 *
 * - errors:   致命的（必須未入力・型不正・上下端節点が同一・参照先が存在しない等）→ 作成不可
 * - warnings: スキーマ範囲外など軽微な逸脱 → 作成は許可（ユーザー判断に委ねる）
 *
 * @module ui/panels/element-info/addMemberValidation
 */

import { LINE_MEMBER_TYPES, PANEL_MEMBER_TYPES, POINT_MEMBER_TYPES } from './memberCategories.js';

/**
 * 配列/Set のいずれでも受け取れるよう Set 化する。
 * @param {Set<string>|string[]|undefined} src
 * @returns {Set<string>}
 */
function toIdSet(src) {
  if (src instanceof Set) return src;
  return new Set((Array.isArray(src) ? src : []).map(String));
}

/**
 * 値が空（未入力扱い）か。
 * @param {*} v
 * @returns {boolean}
 */
function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * 値が有限の数値か。
 * @param {*} v
 * @returns {boolean}
 */
function isNumeric(v) {
  return !isEmpty(v) && Number.isFinite(Number(v));
}

/**
 * 線材（2節点で定義される部材）の端部節点属性ラベル。
 * @type {Object<string, string>}
 */
const NODE_REF_LABELS = {
  id_node_bottom: '下端節点',
  id_node_top: '上端節点',
  id_node_start: '始端節点',
  id_node_end: '終端節点',
};

/** 任意の節点列（StbNodeIdList）で節点を紐づけるタイプ（階・各種通り芯）。節点数の下限は無い。 */
const NODE_LINK_TYPES = new Set(['Story', 'Axis', 'ArcAxis', 'RadialAxis']);

/** 通り芯グループの許容値。 */
const AXIS_GROUPS = new Set(['X', 'Y']);
/**
 * 新規部材の属性を検証する。
 * @param {string} elementType - NEW_MEMBER_DEFINITIONS のキー（Node / Column / Post / Girder / Beam / Brace / Slab / Wall / Pile / Footing / FoundationColumn / Parapet / Story / Axis）
 * @param {Object<string, string>} attrs - 入力属性
 * @param {Object} [ctx]
 * @param {{required?: string[]}} [ctx.definition] - NEW_MEMBER_DEFINITIONS[elementType]
 * @param {Set<string>|string[]} [ctx.nodeIds] - 既存節点ID集合
 * @param {Set<string>|string[]} [ctx.sectionIds] - 既存断面ID集合
 * @param {(attr: string, value: string) => ({valid: boolean, error?: string})} [ctx.validateAttr]
 *   スキーマ検証関数（jsonSchemaLoader.validateAttributeValue をラップしたもの）
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateNewMember(elementType, attrs = {}, ctx = {}) {
  const errors = [];
  const warnings = [];

  const required = ctx.definition?.required || [];
  const nodeIds = toIdSet(ctx.nodeIds);
  const sectionIds = toIdSet(ctx.sectionIds);

  // 共通: 必須属性
  const missing = required.filter((key) => isEmpty(attrs[key]));
  if (missing.length > 0) {
    errors.push(`必須項目が未入力です: ${missing.join(', ')}`);
  }

  if (elementType === 'Node') {
    for (const axis of ['X', 'Y', 'Z']) {
      if (!isEmpty(attrs[axis]) && !isNumeric(attrs[axis])) {
        errors.push(`${axis} 座標は数値で入力してください`);
      }
    }
  }

  if (LINE_MEMBER_TYPES.has(elementType)) {
    // 端部節点: 存在チェック（複数種別の属性名に対応）
    const refKeys = Object.keys(attrs).filter((k) => k.startsWith('id_node'));
    for (const key of refKeys) {
      const v = attrs[key];
      if (!isEmpty(v) && nodeIds.size > 0 && !nodeIds.has(String(v))) {
        errors.push(`${NODE_REF_LABELS[key] || key} #${v} が存在しません`);
      }
    }
    // 両端が同一節点ならエラー
    const endpoints = refKeys
      .map((k) => attrs[k])
      .filter((v) => !isEmpty(v))
      .map(String);
    if (endpoints.length === 2 && endpoints[0] === endpoints[1]) {
      errors.push('両端の節点が同一です');
    }
    if (
      !isEmpty(attrs.id_section) &&
      sectionIds.size > 0 &&
      !sectionIds.has(String(attrs.id_section))
    ) {
      errors.push(`断面 #${attrs.id_section} が存在しません`);
    }
    if (!isEmpty(attrs.rotate) && !isNumeric(attrs.rotate)) {
      errors.push('回転角は数値で入力してください');
    }
  }

  if (PANEL_MEMBER_TYPES.has(elementType)) {
    // 節点列: 配列・スペース区切り文字列の双方を受け付ける
    const rawNodeIds = attrs.node_ids;
    const ids = (Array.isArray(rawNodeIds) ? rawNodeIds : String(rawNodeIds ?? '').split(/\s+/))
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (ids.length < 3) {
      errors.push('面材には3点以上の節点が必要です');
    }
    // 参照節点の存在チェック
    for (const v of ids) {
      if (nodeIds.size > 0 && !nodeIds.has(v)) {
        errors.push(`節点 #${v} が存在しません`);
      }
    }
    // 連続する同一節点（縮退辺）はエラー
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] === ids[i - 1]) {
        errors.push('節点列に連続する同一節点があります');
        break;
      }
    }
    if (
      !isEmpty(attrs.id_section) &&
      sectionIds.size > 0 &&
      !sectionIds.has(String(attrs.id_section))
    ) {
      errors.push(`断面 #${attrs.id_section} が存在しません`);
    }
  }

  if (POINT_MEMBER_TYPES.has(elementType)) {
    // 配置節点（単一）の存在チェック
    if (!isEmpty(attrs.id_node) && nodeIds.size > 0 && !nodeIds.has(String(attrs.id_node))) {
      errors.push(`配置節点 #${attrs.id_node} が存在しません`);
    }
    // 断面の存在チェック: 基礎柱は id_section_FD（必須）/id_section_WR（任意）、他は id_section。
    const sectionKeys =
      elementType === 'FoundationColumn' ? ['id_section_FD', 'id_section_WR'] : ['id_section'];
    for (const key of sectionKeys) {
      const v = attrs[key];
      if (!isEmpty(v) && sectionIds.size > 0 && !sectionIds.has(String(v))) {
        errors.push(`断面 #${v} が存在しません`);
      }
    }
    // レベル・回転・オフセットは数値
    for (const key of ['level_top', 'level_bottom', 'rotate', 'offset']) {
      if (!isEmpty(attrs[key]) && !isNumeric(attrs[key])) {
        errors.push(`${key} は数値で入力してください`);
      }
    }
  }

  if (NODE_LINK_TYPES.has(elementType)) {
    // 階: 高さは数値。各種通り芯: 寸法・角度は数値、平行軸のグループは X/Y。
    if (elementType === 'Story' && !isEmpty(attrs.height) && !isNumeric(attrs.height)) {
      errors.push('高さは数値で入力してください');
    }
    if (elementType === 'Axis') {
      if (!isEmpty(attrs.distance) && !isNumeric(attrs.distance)) {
        errors.push('距離は数値で入力してください');
      }
      if (!isEmpty(attrs.group) && !AXIS_GROUPS.has(String(attrs.group))) {
        errors.push('軸グループは X または Y を指定してください');
      }
    }
    if (elementType === 'ArcAxis' || elementType === 'RadialAxis') {
      // 円弧軸=radius、放射軸=angle が軸寸法。中心・角度フィールドも数値。
      const numericKeys =
        elementType === 'ArcAxis'
          ? ['radius', 'center_x', 'center_y', 'start_angle', 'end_angle']
          : ['angle', 'center_x', 'center_y'];
      for (const key of numericKeys) {
        if (!isEmpty(attrs[key]) && !isNumeric(attrs[key])) {
          errors.push(`${key} は数値で入力してください`);
        }
      }
      // XSD 範囲: radius は stb:length（>0）、各角度は stb:angle（0以上360未満）。
      if (elementType === 'ArcAxis' && isNumeric(attrs.radius) && Number(attrs.radius) <= 0) {
        errors.push('半径は 0 より大きい値で入力してください');
      }
      const angleKeys = elementType === 'ArcAxis' ? ['start_angle', 'end_angle'] : ['angle'];
      for (const key of angleKeys) {
        if (isNumeric(attrs[key]) && (Number(attrs[key]) < 0 || Number(attrs[key]) >= 360)) {
          errors.push(`${key} は 0 以上 360 未満で入力してください`);
        }
      }
    }
    // 紐づける節点（任意・0個可）の存在チェック。数の下限は課さない。
    const rawNodeIds = attrs.node_ids;
    const ids = (Array.isArray(rawNodeIds) ? rawNodeIds : String(rawNodeIds ?? '').split(/\s+/))
      .map((v) => String(v).trim())
      .filter(Boolean);
    for (const v of ids) {
      if (nodeIds.size > 0 && !nodeIds.has(v)) {
        errors.push(`節点 #${v} が存在しません`);
      }
    }
    // StbNodeIdList は xs:key により同一リスト内の id 重複を禁止する。
    if (new Set(ids).size !== ids.length) {
      errors.push('紐づける節点に重複があります');
    }
  }

  // スキーマ検証（範囲外・列挙外など）→ 警告。node_ids は属性ではないため対象外。
  if (typeof ctx.validateAttr === 'function') {
    // group・軸グループ属性フィールド（中心/角度）は親グループ要素の属性のため軸要素の検証対象外。
    const groupFieldKeys = new Set((ctx.definition?.groupAttrFields || []).map((f) => f.field));
    for (const [attr, value] of Object.entries(attrs)) {
      // node_ids は子要素、group は親グループ名のため、要素属性のスキーマ検証対象外。
      if (attr === 'node_ids' || attr === 'group' || groupFieldKeys.has(attr) || isEmpty(value)) {
        continue;
      }
      const result = ctx.validateAttr(attr, String(value));
      if (result && result.valid === false) {
        warnings.push(result.error || `${attr} の値がスキーマに適合しません`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * 既存の階・通り芯への節点後追い紐づけを検証する（純関数）。
 * @param {string} targetId - 紐づけ先の要素ID（未選択は空）
 * @param {string[]|string} nodeIdsInput - 紐づける節点ID（配列またはスペース区切り）
 * @param {Object} [ctx]
 * @param {Set<string>|string[]} [ctx.nodeIds] - 既存節点ID集合
 * @param {Set<string>|string[]} [ctx.linkedNodeIds] - 紐づけ先に既に登録済みの節点ID集合
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateNodeLink(targetId, nodeIdsInput, ctx = {}) {
  const errors = [];
  const warnings = [];
  const nodeIds = toIdSet(ctx.nodeIds);
  const linked = toIdSet(ctx.linkedNodeIds);

  if (isEmpty(targetId)) {
    errors.push('紐づけ先を選択してください');
  }
  const ids = (Array.isArray(nodeIdsInput) ? nodeIdsInput : String(nodeIdsInput ?? '').split(/\s+/))
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (ids.length === 0) {
    errors.push('紐づける節点を指定してください');
  }
  for (const v of ids) {
    if (nodeIds.size > 0 && !nodeIds.has(v)) {
      errors.push(`節点 #${v} が存在しません`);
    }
  }
  if (new Set(ids).size !== ids.length) {
    errors.push('紐づける節点に重複があります');
  }
  // 既に紐づけ済みの節点は追加時に無視される（重複登録は xs:key 違反になるため）→ 警告にとどめる
  const already = ids.filter((v) => linked.has(v));
  if (already.length > 0) {
    warnings.push(`節点 #${already.join(', #')} は既に紐づけ済みです（追加されません）`);
  }
  return { errors, warnings };
}
