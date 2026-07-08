/**
 * @fileoverview 断面の「作成されるジオメトリ立体形状」を表す正規化シグネチャ (GSS)
 *
 * 梁/大梁断面を、部材軸方向の正規化位置 t∈[0,1] ごとのプロファイル列に抽象化し、
 * 定数区間を縮退した正規化文字列（Geometry Shape Signature）を返す。
 * 2つの断面の GSS が一致することは、生成されるジオメトリ立体が等価であることを意味する。
 *
 * **対象はレンダリング立体の外形のみ**:
 *   - RC  : コンクリート矩形 / 円形の外形
 *   - S   : 鉄骨プロファイル（形鋼）
 *   - SRC : コンクリート外形 + 内蔵鉄骨
 *
 * 鉄筋配置・強度・材質・断面名などの非形状属性は GSS に含めない。
 * 寸法は 0.1mm に丸めて厳密一致で比較する（許容誤差%は用いない）。
 *
 * レイヤー: services(L3)。viewer(L4) を import せず、生成器と同じ区間-プロファイル
 * モデルをデータ層で再現する（テッセレーション mesh ではなく抽象形状列）。
 *
 * @module geometryShapeSignature
 */

import { normalizeProfileTypeToken } from '../import/section/sectionTypeUtil.js';

/** 寸法の丸め桁（0.1mm）。STB 実寸法精度に合わせる。 */
const DIM_DECIMALS = 1;
const DIM_SCALE = 10 ** DIM_DECIMALS;

/**
 * pos ラベル → 正規化位置 t∈[0,1]。
 * 実ハンチ長は断面ではなく配置(梁)側の属性のため、GSS では pos の相対順序のみを表現する。
 * 縮退により実質均一な断面は t に依らず単一プロファイルへ潰れる。
 */
const POS_T = {
  START: 0,
  BOTTOM: 0,
  HAUNCH_S: 0.25,
  CENTER: 0.5,
  HAUNCH_E: 0.75,
  END: 1,
  TOP: 1,
  SAME: 0,
};

function roundDim(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!isFinite(n)) return null;
  // 整数スケールで丸めて割ることで浮動小数点誤差を避ける
  return Math.round(n * DIM_SCALE) / DIM_SCALE;
}

function firstFinite(dims, keys) {
  if (!dims) return null;
  for (const key of keys) {
    const r = roundDim(dims[key]);
    if (r != null) return r;
  }
  return null;
}

function pickWidth(dims) {
  return firstFinite(dims, ['width', 'outer_width', 'overall_width', 'B']);
}

function pickHeight(dims) {
  return firstFinite(dims, ['height', 'overall_depth', 'depth', 'D2', 'A']);
}

function pickDiameter(dims) {
  const d = firstFinite(dims, ['diameter', 'D', 'outer_diameter']);
  if (d != null) return d;
  const r = firstFinite(dims, ['radius', 'r']);
  return r != null ? roundDim(r * 2) : null;
}

function pickHParams(dims) {
  const depth = firstFinite(dims, ['overall_depth', 'H', 'A', 'height']);
  const width = firstFinite(dims, ['overall_width', 'B', 'width']);
  if (depth == null || width == null) return null;
  const tw = firstFinite(dims, ['web_thickness', 't1', 'tw']) ?? 0;
  const tf = firstFinite(dims, ['flange_thickness', 't2', 'tf']) ?? 0;
  return `${depth}x${width}x${tw}x${tf}`;
}

function normalizeShapeName(name) {
  return String(name).trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * 形鋼名称を「幾何形状を決める正規トークン」に変換する。
 * ソフト間で表記が異なる同一形鋼（例: 圧延H `H-800x300x16x25` / 溶接H `BH-...` /
 * `SH-...`、末尾フィレット `...x25x0` の有無）を同一形状として扱うため、
 * プレフィックス（製法差）と末尾の付加寸法を落として外形決定寸法のみを残す。
 *   - H形鋼系（H/SH/BH/WH/I…）: せい×幅×ウェブ厚×フランジ厚 の4値 → `H:axbxcxd`
 *   - 円形鋼管（○/⌀/P）: 径×肉厚 の2値 → `P:dxt`
 *   - 判別不能: 正規化した名称そのまま `N:<name>`
 *
 * @param {string} shapeName
 * @returns {string}
 */
function canonicalSteelToken(shapeName) {
  const raw = normalizeShapeName(shapeName);
  const numbers = raw.match(/\d+(?:\.\d+)?/g) || [];
  const prefix = (raw.match(/^[^0-9]+/) || [''])[0];
  const letters = prefix.replace(/[^A-Z]/g, '');
  const isPipe = /[○⌀ΦФ]/.test(prefix) || letters === 'P' || letters === 'PIPE';
  const isH = /H$/.test(letters) || letters === 'I' || letters === 'IH';

  if (isH && numbers.length >= 4) return `H:${numbers.slice(0, 4).join('x')}`;
  if (isPipe && numbers.length >= 2) return `P:${numbers.slice(0, 2).join('x')}`;
  return `N:${raw}`;
}

function serializeGenericDims(dims) {
  if (!dims || typeof dims !== 'object') return '';
  return Object.keys(dims)
    .filter((k) => {
      const r = roundDim(dims[k]);
      return r != null;
    })
    .sort()
    .map((k) => `${k}=${roundDim(dims[k])}`)
    .join(',');
}

/**
 * プロファイル形状を表す正規化トークンを生成する。
 * profileType と寸法から構造化トークンを作る。RC矩形/円形/H形鋼を優先し、
 * 判別不能な鉄骨は形鋼名称、最終手段として型+整列寸法にフォールバックする。
 *
 * @param {string} profileType - 断面タイプ（RECTANGLE/CIRCLE/H など）
 * @param {Object} dims - 寸法辞書
 * @param {string} [shapeName] - 形鋼名称等（フォールバック用）
 * @returns {string} プロファイルトークン
 */
export function buildProfileToken(profileType, dims, shapeName) {
  const type = normalizeProfileTypeToken(profileType) || '';

  // コンクリート系（矩形・円形）は寸法が形状の権威。
  if (type === 'RECTANGLE') {
    const w = pickWidth(dims);
    const h = pickHeight(dims);
    if (w != null && h != null) return `R:${w}x${h}`;
  }
  if (type === 'CIRCLE') {
    const d = pickDiameter(dims);
    if (d != null) return `C:${d}`;
  }

  // 鉄骨系の形鋼名称は、寸法列を含む場合だけ寸法より優先する。多断面（Haunch/Joint 等）
  // では shapes[].dimensions が無いことが多いため形鋼名称が必要だが、id_steel 由来の
  // 任意名（例: H1）だけで形状等価とみなすと危険なため、寸法があれば寸法を権威にする。
  const canonicalShapeName = shapeName ? canonicalSteelToken(shapeName) : null;
  if (canonicalShapeName && !canonicalShapeName.startsWith('N:')) return canonicalShapeName;

  if (type === 'H') {
    const params = pickHParams(dims);
    if (params != null) return `H:${params}`;
  }

  if (canonicalShapeName) return canonicalShapeName;

  return `${type}:${serializeGenericDims(dims)}`;
}

/**
 * 断面データを t 順のステーション列 `[{t, token}]` に展開する。
 * 区間データ（RC ハンチの shapeStations、または Taper/鉄骨多断面の shapes）があれば
 * pos ごとに、なければ単一断面として扱う。
 */
function buildStations(sectionData, dimsFallback, shapeNameFallback) {
  const type =
    sectionData.section_type || sectionData.profile_type || sectionData.sectionType || null;
  // shapeStations: RC/SRC ハンチ用の等価判定専用 pos 別寸法（各要素が dimensions を持つ）
  // shapes: Taper / 鉄骨多断面（鉄骨は dimensions を持たず shapeName が区間ごとに変わる）
  const stationsSource =
    (Array.isArray(sectionData.shapeStations) && sectionData.shapeStations.length > 0
      ? sectionData.shapeStations
      : null) ||
    (Array.isArray(sectionData.shapes) && sectionData.shapes.length > 0
      ? sectionData.shapes
      : null);

  if (stationsSource) {
    return stationsSource.map((station) => {
      const pos = String(station.pos || 'CENTER').toUpperCase();
      const t = pos in POS_T ? POS_T[pos] : 0.5;
      const stationType = station.section_type || type;
      const dims = station.dimensions || dimsFallback;
      const token = buildProfileToken(stationType, dims, station.shapeName || shapeNameFallback);
      return { t, token };
    });
  }

  const token = buildProfileToken(type, dimsFallback, shapeNameFallback);
  return [{ t: 0, token }];
}

function buildConcreteStations(sectionData, concreteType, concreteDims) {
  if (Array.isArray(sectionData.shapeStations) && sectionData.shapeStations.length > 0) {
    return sectionData.shapeStations.map((station) => {
      const pos = String(station.pos || 'CENTER').toUpperCase();
      const t = pos in POS_T ? POS_T[pos] : 0.5;
      const stationType = station.section_type || concreteType;
      const dims = station.dimensions || concreteDims;
      return { t, token: buildProfileToken(stationType, dims, null) };
    });
  }
  return [{ t: 0, token: buildProfileToken(concreteType, concreteDims, null) }];
}

function buildSteelStations(sectionData, steelProfile) {
  const steelSection = {
    section_type: steelProfile?.section_type || sectionData.section_type,
    shapes: sectionData.shapes,
  };
  return buildStations(
    steelSection,
    steelProfile?.dimensions || sectionData.dimensions,
    sectionData.shapeName,
  );
}

/**
 * ステーション列を縮退した構造を返す。
 * 前後と同一プロファイルの中間ステーションを除去し、全て同一なら単一プロファイルへ潰す。
 *
 * @param {Array<{t:number, token:string}>} stations
 * @returns {{uniform: boolean, kept: Array<{t:number, token:string}>}}
 */
function collapseStationsCore(stations) {
  if (!Array.isArray(stations) || stations.length === 0) {
    return { uniform: true, kept: [] };
  }
  if (stations.length === 1) {
    return { uniform: true, kept: [stations[0]] };
  }

  const sorted = [...stations].sort((a, b) => a.t - b.t || (a.token < b.token ? -1 : 1));

  const kept = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = kept[kept.length - 1];
    const next = sorted[i + 1];
    // 定数区間の内部ステーション（前後と同一）は形状に影響しないため除去
    if (prev && next && prev.token === cur.token && cur.token === next.token) {
      continue;
    }
    kept.push(cur);
  }

  const uniform = kept.every((s) => s.token === kept[0].token);
  return { uniform, kept: uniform ? [kept[0]] : kept };
}

/**
 * ステーション列を縮退して直列化パーツ列（`token` または `t@token`）を返す。
 *
 * @param {Array<{t:number, token:string}>} stations
 * @returns {string[]}
 */
function collapseStations(stations) {
  const { uniform, kept } = collapseStationsCore(stations);
  if (kept.length === 0) return [];
  if (uniform) return [kept[0].token];
  return kept.map((s) => `${roundDim(s.t)}@${s.token}`);
}

/**
 * この断面が GSS 対象（梁/大梁）かを判定する。
 *
 * @param {Object} sectionData
 * @param {string} elementType
 * @returns {boolean}
 */
export function isGeometrySignatureSupported(sectionData, elementType) {
  if (elementType === 'Beam' || elementType === 'Girder') return true;
  const tag = sectionData?.sectionType;
  return typeof tag === 'string' && /StbSec(Beam|Girder)/i.test(tag);
}

/**
 * 断面の Geometry Shape Signature (GSS) を生成する。
 * 対象外（梁/大梁以外）の場合は null を返し、呼び出し側は従来シグネチャへフォールバックする。
 *
 * @param {Object} sectionData - 断面データ（extractSectionData の出力）
 * @param {string} elementType - 要素タイプ（'Beam' / 'Girder' 等）
 * @returns {string|null} GSS 文字列、対象外なら null
 */
export function buildGeometryShapeSignature(sectionData, elementType) {
  if (!sectionData || typeof sectionData !== 'object') return null;
  if (!isGeometrySignatureSupported(sectionData, elementType)) return null;

  const signature = buildSignatureString(sectionData);
  // 寸法を1つも解決できなかった（数値を含まない）シグネチャは信頼できないため、
  // null を返して従来シグネチャへフォールバックし、空寸法同士の誤等価を防ぐ。
  if (signature == null || !/\d/.test(signature)) return null;
  return signature;
}

function buildSignatureString(sectionData) {
  if (sectionData.isSRC) {
    // SRC: コンクリート外形 + 内蔵鉄骨の2系統を併記する
    const concreteProfile = sectionData.concreteProfile || null;
    const concreteType = concreteProfile?.profileType || sectionData.section_type;
    const concreteStations = buildConcreteStations(
      sectionData,
      concreteType,
      concreteProfile || sectionData.dimensions,
    );

    const steelProfile = sectionData.steelProfile || null;
    const steelStations = buildSteelStations(sectionData, steelProfile);

    const concretePart = collapseStations(concreteStations).join(';');
    const steelPart = collapseStations(steelStations).join(';');
    return `c=${concretePart}|s=${steelPart}`;
  }

  const stations = buildStations(sectionData, sectionData.dimensions, sectionData.shapeName);
  return `o=${collapseStations(stations).join(';')}`;
}

// ---------------- 人間可読な形状記述（UI 表示用） ----------------

/** プロファイルトークンを日本語の形状名に変換する。 */
function describeToken(token) {
  if (typeof token !== 'string') return '不明';
  const [kind, rest = ''] = token.split(/:(.*)/s);
  switch (kind) {
    case 'R':
      return `矩形 ${rest.replace('x', '×')}`;
    case 'C':
      return `円形 φ${rest}`;
    case 'H':
      return `H形鋼 ${rest.replace(/x/g, '×')}`;
    case 'P':
      return `円形鋼管 φ${rest.replace('x', '×肉厚')}`;
    case 'N':
      return rest;
    default:
      return token;
  }
}

/** 正規化位置 t を区間ラベルに変換する。 */
function describeTLabel(t) {
  if (t === 0) return '始端';
  if (t === 1) return '終端';
  if (t === 0.5) return '中央';
  if (t === 0.25) return 'ハンチ始';
  if (t === 0.75) return 'ハンチ終';
  return `t=${t}`;
}

/** ステーション列を「一様」または「N区間 [ラベル 形状 / …]」の文で記述する。 */
function describePart(stations) {
  const { uniform, kept } = collapseStationsCore(stations);
  if (kept.length === 0) return '不明';
  if (uniform) return `${describeToken(kept[0].token)}（一様）`;
  const parts = kept.map((s) => `${describeTLabel(s.t)} ${describeToken(s.token)}`);
  return `${kept.length}区間 [${parts.join(' / ')}]`;
}

/**
 * 断面の「作成されるジオメトリ形状」を人間可読な文字列で記述する（UI 表示用）。
 * GSS の判定根拠を利用者に提示するために用いる。対象外・形状不明なら null。
 *
 * @param {Object} sectionData
 * @param {string} elementType
 * @returns {string|null}
 */
export function describeGeometryShape(sectionData, elementType) {
  if (!sectionData || typeof sectionData !== 'object') return null;
  if (!isGeometrySignatureSupported(sectionData, elementType)) return null;
  // 形状シグネチャが成立しない（寸法解決不可）場合は記述しない
  if (buildGeometryShapeSignature(sectionData, elementType) == null) return null;

  if (sectionData.isSRC) {
    const concreteProfile = sectionData.concreteProfile || null;
    const concreteType = concreteProfile?.profileType || sectionData.section_type;
    const concreteStations = buildConcreteStations(
      sectionData,
      concreteType,
      concreteProfile || sectionData.dimensions,
    );
    const steelProfile = sectionData.steelProfile || null;
    const steelStations = buildSteelStations(sectionData, steelProfile);
    return `コンクリート: ${describePart(concreteStations)} ／ 鉄骨: ${describePart(steelStations)}`;
  }

  return describePart(buildStations(sectionData, sectionData.dimensions, sectionData.shapeName));
}
