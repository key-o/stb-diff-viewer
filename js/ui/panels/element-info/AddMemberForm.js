/**
 * @fileoverview 新規部材追加フォーム（フローティング版）
 *
 * 節点・柱などの新規部材を、3Dビューと連動しながら直接作成するフローティングUI。
 * モーダルではなくドラッグ可能なフローティングパネルとし、開いたまま3Dビューを操作できる。
 * 編集モードのON/OFFとは独立して利用できる（モデルAが読込済みであればよい）。
 *
 * 主な機能:
 * - 3D節点ピック: 柱の上下端節点を3Dビューのクリックで指定（nodePickService 経由）。
 * - 既存節点スナップ: 新規節点作成時、既存節点をクリックして座標をコピー。
 * - 確認サマリ＋ライブ検証: 入力のたびに addMemberValidation を実行し、
 *   エラーがあれば「作成」を無効化（警告は許可）。選択中の節点は3Dでハイライト。
 * - 断面選択に応じて kind_structure を自動整合（StbSecColumn_RC → RC など）。
 *
 * XML変更ロジックは持たず、EditMode.addNewMember を呼ぶだけに徹する
 * （XML変更の唯一の責務は EditMode に集約する）。
 *
 * @module ui/panels/element-info/AddMemberForm
 */

import { createLogger } from '../../../utils/logger.js';
import { getState } from '../../../data/state/globalState.js';
import { showError } from '../../common/toast.js';
import {
  addNewMember,
  getNewMemberDefinitions,
  getNodeLinkTargets,
  linkNodesToExisting,
} from './EditMode.js';
import { openSectionBuilder } from './SectionBuilderForm.js';
import { floatingWindowManager } from '../floatingWindowManager.js';
import * as nodePick from './nodePickService.js';
import { validateNewMember, validateNodeLink } from './addMemberValidation.js';
import { PANEL_MEMBER_TYPES, POINT_MEMBER_TYPES } from './memberCategories.js';
import {
  isSchemaLoaded,
  getAttributeInfo,
  validateAttributeValue,
} from '../../../common-stb/import/parser/jsonSchemaLoader.js';

const log = createLogger('ui:panels:add-member-form');

/** 部材タイプの表示ラベル */
const TYPE_LABELS = {
  Node: '節点',
  Column: '柱',
  Post: '間柱',
  Girder: '大梁',
  Beam: '小梁',
  Brace: 'ブレース',
  Slab: '床',
  Wall: '壁',
  Pile: '杭',
  Footing: '基礎',
  FoundationColumn: '基礎柱',
  Parapet: 'パラペット',
  Story: '階',
  Axis: '通り芯',
  ArcAxis: '円弧軸',
  RadialAxis: '放射軸',
};

/** 任意の節点列（StbNodeIdList）で節点を紐づけるタイプ（階・各種通り芯）。節点数の下限なし。 */
const NODELIST_TYPES = new Set(['Story', 'Axis', 'ArcAxis', 'RadialAxis']);

/** group フィールドを自由入力テキスト（グループ名）として扱う軸タイプ（平行軸は X/Y の enum）。 */
const FREE_GROUP_TYPES = new Set(['ArcAxis', 'RadialAxis']);
/**
 * kind_structure の許容値（部材タイプ別）。STBスキーマで床・壁・基礎系は線材と異なる列挙を持つため、
 * S/SRC/CFT を選べないよう上書きする。未定義タイプは FIELD_DEFS.kind_structure.options を使う。
 * （基礎は kind_structure 属性を持たないため、TYPE_FIELDS にフィールド自体を含めない）
 * @type {Object<string, string[]>}
 */
const STRUCTURE_OPTIONS_BY_TYPE = {
  Slab: ['RC', 'DECK', 'PRECAST', 'LOAD'],
  Wall: ['RC', 'LOAD'],
  Pile: ['RC', 'S', 'PC'],
  FoundationColumn: ['RC'],
  Parapet: ['RC'],
};

/**
 * 属性ごとのフィールド定義。
 * - label: 表示名
 * - kind: 'number' | 'node' | 'section' | 'enum' | 'text'
 * - options: enum の選択肢
 * - default: 初期値
 * @type {Object<string, {label: string, kind: string, options?: string[], default?: string}>}
 */
const FIELD_DEFS = {
  X: { label: 'X 座標 (mm)', kind: 'number', default: '0' },
  Y: { label: 'Y 座標 (mm)', kind: 'number', default: '0' },
  Z: { label: 'Z 座標 (mm)', kind: 'number', default: '0' },
  id_node_bottom: { label: '下端節点', kind: 'node' },
  id_node_top: { label: '上端節点', kind: 'node' },
  id_node_start: { label: '始端節点', kind: 'node' },
  id_node_end: { label: '終端節点', kind: 'node' },
  id_node: { label: '配置節点', kind: 'node' },
  id_section: { label: '断面', kind: 'section' },
  id_section_FD: { label: '基礎部断面', kind: 'section' },
  id_section_WR: { label: '立上り部断面（任意）', kind: 'section' },
  rotate: { label: '回転角 (度)', kind: 'number', default: '0' },
  level_top: { label: '杭頭レベル (mm)', kind: 'number', default: '0' },
  level_bottom: { label: '底面レベル (mm)', kind: 'number', default: '0' },
  offset: { label: 'オフセット (mm)', kind: 'number', default: '0' },
  kind_structure: {
    label: '構造種別',
    kind: 'enum',
    options: ['S', 'RC', 'SRC', 'CFT'],
    default: 'S',
  },
  // 面材（床・壁）の種別属性
  kind_slab: { label: '床種別', kind: 'enum', options: ['NORMAL', 'CANTI'], default: 'NORMAL' },
  isFoundation: { label: '基礎床', kind: 'enum', options: ['false', 'true'], default: 'false' },
  kind_layout: {
    label: '配置種別',
    kind: 'enum',
    options: ['ON_GIRDER', 'ON_BEAM', 'ON_SLAB'],
    default: 'ON_GIRDER',
  },
  // 階（StbStory）・通り芯（StbParallelAxis）用フィールド
  name: { label: '名称', kind: 'text' },
  height: { label: '高さ (mm)', kind: 'number', default: '0' },
  distance: { label: '距離 (mm)', kind: 'number', default: '0' },
  group: { label: '軸グループ', kind: 'enum', options: ['X', 'Y'], default: 'X' },
  // 円弧軸・放射軸（StbArcAxis/StbRadialAxis）用フィールド。
  // 半径は stb:length（>0）、各角度は stb:angle（[0,360)・360 は不正）。
  radius: { label: '半径 (mm)', kind: 'number', default: '1000' },
  angle: { label: '角度 (度)', kind: 'number', default: '0' },
  center_x: { label: '中心 X (mm)', kind: 'number', default: '0' },
  center_y: { label: '中心 Y (mm)', kind: 'number', default: '0' },
  start_angle: { label: '開始角 (度)', kind: 'number', default: '0' },
  end_angle: { label: '終了角 (度)', kind: 'number', default: '90' },
  kind: {
    label: '階種別',
    kind: 'enum',
    options: ['GENERAL', 'BASEMENT', 'ROOF', 'PENTHOUSE', 'ISOLATION', 'DEPENDENCE'],
    default: 'GENERAL',
  },
};

/** タイプごとに入力させる属性（必須＋主要な任意属性） */
const TYPE_FIELDS = {
  Node: ['X', 'Y', 'Z'],
  Column: ['id_node_bottom', 'id_node_top', 'id_section', 'rotate', 'kind_structure'],
  Post: ['id_node_bottom', 'id_node_top', 'id_section', 'rotate', 'kind_structure'],
  Girder: ['id_node_start', 'id_node_end', 'id_section', 'rotate', 'kind_structure'],
  Beam: ['id_node_start', 'id_node_end', 'id_section', 'rotate', 'kind_structure'],
  Brace: ['id_node_start', 'id_node_end', 'id_section', 'rotate', 'kind_structure'],
  // 面材は端部節点を持たず、断面・種別属性＋節点リストUI（renderFields で別途描画）で構成する
  Slab: ['id_section', 'kind_structure', 'kind_slab', 'isFoundation'],
  Wall: ['id_section', 'kind_structure', 'kind_layout'],
  // 点部材は1節点（id_node）で配置。基礎は kind_structure 属性を持たない。
  // StbPile は rotate 属性を持たない（schema additionalProperties:false）ため含めない。
  Pile: ['id_node', 'id_section', 'kind_structure', 'level_top'],
  Footing: ['id_node', 'id_section', 'level_bottom', 'rotate'],
  // 基礎柱は FD（基礎部・必須）／WR（立上り部・任意）の2断面で定義する。
  FoundationColumn: ['id_node', 'id_section_FD', 'id_section_WR', 'kind_structure', 'rotate'],
  // パラペットは2節点線材。配置種別とオフセットを持つ。
  Parapet: [
    'id_node_start',
    'id_node_end',
    'id_section',
    'kind_structure',
    'kind_layout',
    'offset',
  ],
  // 階・通り芯は断面・端部節点を持たず、属性＋紐づけ節点リスト（renderFields で別途描画）で構成する。
  Story: ['name', 'height', 'kind'],
  Axis: ['group', 'name', 'distance'],
  // 円弧軸・放射軸はグループ（中心・角度）属性を含む。group は自由入力（グループ名）。
  ArcAxis: ['group', 'name', 'radius', 'center_x', 'center_y', 'start_angle', 'end_angle'],
  RadialAxis: ['group', 'name', 'angle', 'center_x', 'center_y'],
};

/**
 * 部材タイプごとの断面設定。
 * - prefixes: 候補に含める断面タグの接頭辞（StbSecColumn_RC / StbSecBeam_S 等）
 * - newRoot:  「＋新規」で起動する断面ビルダーの既定ルート要素
 * 間柱は柱断面（StbSecColumn）、大梁は StbSecGirder/StbSecBeam を参照する。
 * @type {Object<string, {prefixes: string[], newRoot: string}>}
 */
const MEMBER_SECTION_CONFIG = {
  Column: { prefixes: ['StbSecColumn'], newRoot: 'StbSecColumn_RC' },
  Post: { prefixes: ['StbSecColumn'], newRoot: 'StbSecColumn_RC' },
  Girder: { prefixes: ['StbSecGirder', 'StbSecBeam'], newRoot: 'StbSecBeam_RC' },
  Beam: { prefixes: ['StbSecBeam'], newRoot: 'StbSecBeam_RC' },
  Brace: { prefixes: ['StbSecBrace'], newRoot: 'StbSecBrace_S' },
  Slab: { prefixes: ['StbSecSlab'], newRoot: 'StbSecSlab_RC' },
  Wall: { prefixes: ['StbSecWall'], newRoot: 'StbSecWall_RC' },
  Pile: { prefixes: ['StbSecPile'], newRoot: 'StbSecPile_RC' },
  Footing: { prefixes: ['StbSecFoundation'], newRoot: 'StbSecFoundation_RC' },
  // 基礎柱は FD/WR とも基礎断面（StbSecFoundation）プールから選ぶ
  FoundationColumn: { prefixes: ['StbSecFoundation'], newRoot: 'StbSecFoundation_RC' },
  Parapet: { prefixes: ['StbSecParapet'], newRoot: 'StbSecParapet_RC' },
};

const WINDOW_ID = 'add-member-window';

/** @type {HTMLElement|null} */
let windowEl = null;
/** @type {Function|null} ドラッグ機能のクリーンアップ */
let dragCleanup = null;
/** @type {Function|null} Escape キーで閉じるためのハンドラ参照 */
let onKeydown = null;

// 入力のたびに documentA を走査しないよう、節点ID・柱断面をフォーム表示中はキャッシュする。
// （モデル変更や断面新規作成のタイミングで refreshModelData() を呼んで更新する）
/** @type {string[]} */
let cachedNodeIds = [];
/** @type {Array<{id: string, tag: string, structure: string}>} */
let cachedSections = [];

// 面材（床・壁）の輪郭節点列。3Dピックで順番に追加し、StbNodeIdOrder として作成する。
// 属性ではなくこの配列で保持し、リストUIはこれを反映描画する。
/** @type {string[]} */
let panelNodeIds = [];

/**
 * 節点ID・断面のキャッシュを documentA から再取得する。
 * 断面候補は部材タイプによって参照する断面種別が異なるため、タイプを指定して取得する。
 * @param {string} elementType - 現在選択中の部材タイプ
 */
function refreshModelData(elementType) {
  cachedNodeIds = getNodeIds();
  cachedSections = getMemberSections(elementType);
}

/**
 * documentA から節点ID一覧を取得する（昇順）。
 * @returns {string[]}
 */
function getNodeIds() {
  const doc = getState('models.documentA');
  if (!doc) return [];
  const ids = [];
  for (const node of doc.querySelectorAll('StbNode')) {
    const id = node.getAttribute('id');
    if (id) ids.push(id);
  }
  return ids.sort((a, b) => Number(a) - Number(b));
}

/**
 * documentA から指定部材タイプの断面を {id, tag, structure} の配列で取得する（昇順）。
 * structure は断面タグの構造種別接尾辞（StbSecColumn_RC → 'RC'、StbSecBeam_SRC → 'SRC'）。
 * @param {string} elementType - 部材タイプ（MEMBER_SECTION_CONFIG のキー）
 * @returns {Array<{id: string, tag: string, structure: string}>}
 */
function getMemberSections(elementType) {
  const config = MEMBER_SECTION_CONFIG[elementType];
  const doc = getState('models.documentA');
  if (!config || !doc) return [];
  const sections = doc.querySelector('StbSections');
  if (!sections) return [];
  const result = [];
  for (const child of sections.children) {
    const prefix = config.prefixes.find((p) => child.tagName.startsWith(`${p}_`));
    if (!prefix) continue;
    const id = child.getAttribute('id');
    if (!id) continue;
    const structure = child.tagName.slice(prefix.length + 1).split('_')[0];
    result.push({ id, tag: child.tagName, structure });
  }
  return result.sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * 断面IDから構造種別（S/RC/SRC/CFT）を引く。未知なら null。
 * @param {string} sectionId
 * @returns {string|null}
 */
function structureForSection(sectionId) {
  const found = cachedSections.find((s) => s.id === String(sectionId));
  return found ? found.structure : null;
}

/**
 * セレクトの option を再構築する。候補が空なら空ラベルの 1 件を入れる。
 * @param {HTMLSelectElement} select
 * @param {string[]} options
 * @param {string} emptyLabel
 */
function populateSelectOptions(select, options, emptyLabel) {
  select.innerHTML = '';
  if (options.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = emptyLabel;
    select.appendChild(opt);
  }
  for (const value of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
}

/**
 * 1フィールドの入力コントロールを生成する。
 * @param {string} attr - 属性名
 * @param {{onChange: Function}} ctrl - フォームコントローラ（変更時コールバック等）
 * @param {string} elementType - 現在の部材タイプ（断面ビルダー起動に使用）
 * @returns {HTMLElement} ラベル＋入力を含む行要素
 */
function createFieldRow(attr, ctrl, elementType) {
  const def = FIELD_DEFS[attr] || { label: attr, kind: 'number' };

  const row = document.createElement('div');
  row.className = 'add-member-row';

  const label = document.createElement('label');
  label.className = 'add-member-label';
  label.textContent = def.label;
  label.htmlFor = `add-member-field-${attr}`;
  row.appendChild(label);

  // 円弧軸・放射軸の group は自由入力のグループ名（平行軸のみ X/Y の enum）
  const kind = attr === 'group' && FREE_GROUP_TYPES.has(elementType) ? 'text' : def.kind;

  let input;
  if (kind === 'node' || kind === 'section' || kind === 'enum') {
    input = document.createElement('select');
    input.className = 'parameter-dropdown';
    // kind_structure は部材タイプでスキーマ上の許容値が異なる（面材は S/SRC/CFT を持たない）
    const enumOptions =
      attr === 'kind_structure' && STRUCTURE_OPTIONS_BY_TYPE[elementType]
        ? STRUCTURE_OPTIONS_BY_TYPE[elementType]
        : def.options || [];
    const options =
      def.kind === 'node'
        ? cachedNodeIds
        : def.kind === 'section'
          ? cachedSections.map((s) => s.id)
          : enumOptions;
    const emptyLabel = def.kind === 'section' ? '（断面なし）' : '（候補なし）';
    populateSelectOptions(input, options, emptyLabel);
    if (def.default && options.includes(def.default)) input.value = def.default;
  } else if (kind === 'text') {
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'parameter-text-input';
    if (def.default !== undefined) input.value = def.default;
  } else {
    input = document.createElement('input');
    input.type = 'number';
    input.className = 'parameter-text-input parameter-number-input';
    if (def.default !== undefined) input.value = def.default;
  }
  input.id = `add-member-field-${attr}`;
  input.dataset.attr = attr;
  row.appendChild(input);

  // 節点欄: 3Dビューからのピック導線
  if (def.kind === 'node') {
    row.appendChild(
      makePickButton('🎯 3Dで選択', '3Dビューで節点をクリックして指定', (btn) =>
        ctrl.startNodePick(btn, input, false),
      ),
    );
  }

  // 断面欄: 「＋新規」ボタン（スキーマ駆動ビルダー）
  if (def.kind === 'section') {
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'parameter-editor-ok add-member-new-section-btn';
    newBtn.textContent = '＋新規';
    newBtn.addEventListener('click', async () => {
      const newRoot = MEMBER_SECTION_CONFIG[elementType]?.newRoot || 'StbSecColumn_RC';
      const result = await openSectionBuilder(newRoot);
      if (result?.id) {
        refreshModelData(elementType);
        populateSelectOptions(
          input,
          cachedSections.map((s) => s.id),
          '（断面なし）',
        );
        input.value = result.id;
        // 新規断面の構造種別に kind_structure を自動整合
        const structure = structureForSection(result.id);
        if (structure)
          setFieldValue(input.closest('.add-member-fields'), 'kind_structure', structure);
        ctrl.onChange();
      }
    });
    row.appendChild(newBtn);
  }

  return row;
}

/**
 * 選択中タイプのフィールド群を再構築する。
 * @param {HTMLElement} fieldsContainer
 * @param {string} elementType
 * @param {{onChange: Function, startNodePick: Function}} ctrl
 * @param {'create'|'link'} [mode] - 'link' は既存の階・通り芯への後追い紐づけ
 */
function renderFields(fieldsContainer, elementType, ctrl, mode = 'create') {
  fieldsContainer.innerHTML = '';

  // 既存の階・通り芯への節点後追い紐づけモード: 紐づけ先セレクト＋節点リストのみを描画
  if (mode === 'link' && NODELIST_TYPES.has(elementType)) {
    renderLinkFields(fieldsContainer, elementType, ctrl);
    return;
  }

  // 面材: 輪郭節点リストUIを先頭に配置（断面・種別属性の前に頂点を決める導線）
  if (PANEL_MEMBER_TYPES.has(elementType)) {
    fieldsContainer.appendChild(createNodeListBlock(ctrl));
  }

  for (const attr of TYPE_FIELDS[elementType] || []) {
    fieldsContainer.appendChild(createFieldRow(attr, ctrl, elementType));
  }

  // 階・通り芯: 属性入力の後に「紐づける節点」リストUIを配置（任意・0個可）
  if (NODELIST_TYPES.has(elementType)) {
    const label =
      elementType === 'Story'
        ? '紐づける節点（この階に属する節点・任意）'
        : '紐づける節点（この通り芯上の節点・任意）';
    fieldsContainer.appendChild(createNodeListBlock(ctrl, label));
  }

  // 面材は RC を既定の構造種別とする（断面選択で自動整合されるが初期値も RC に寄せる）
  if (PANEL_MEMBER_TYPES.has(elementType)) {
    setFieldValue(fieldsContainer, 'kind_structure', 'RC');
  }

  // 円弧/放射軸の group は自由入力テキスト。型定義の既定グループ名で初期化する。
  if (FREE_GROUP_TYPES.has(elementType)) {
    const def = getNewMemberDefinitions()[elementType];
    if (def?.defaults?.group) setFieldValue(fieldsContainer, 'group', def.defaults.group);
  }

  // 節点タイプ: 既存節点からのスナップ導線（X/Y/Z にまとめて反映）
  if (elementType === 'Node') {
    const snapRow = document.createElement('div');
    snapRow.className = 'add-member-row add-member-snap-row';
    snapRow.appendChild(
      makePickButton(
        '🎯 既存節点からスナップ',
        '3Dビューで既存節点をクリックして座標をコピー',
        (btn) => ctrl.startNodePick(btn, null, true),
      ),
    );
    fieldsContainer.appendChild(snapRow);
  }
}

/**
 * 既存の階・通り芯への後追い紐づけUI（紐づけ先セレクト＋追加する節点リスト）を描画する。
 * @param {HTMLElement} fieldsContainer
 * @param {string} elementType
 * @param {{onChange: Function, startNodeListPick: Function}} ctrl
 */
function renderLinkFields(fieldsContainer, elementType, ctrl) {
  const row = document.createElement('div');
  row.className = 'add-member-row';
  const label = document.createElement('label');
  label.className = 'add-member-label';
  label.textContent = '紐づけ先';
  label.htmlFor = 'add-member-link-target';
  const select = document.createElement('select');
  select.id = 'add-member-link-target';
  select.className = 'parameter-dropdown';
  select.dataset.role = 'link-target';
  const targets = getNodeLinkTargets(elementType);
  if (targets.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = `（${TYPE_LABELS[elementType] || elementType}が存在しません）`;
    select.appendChild(opt);
  }
  for (const t of targets) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.label;
    select.appendChild(opt);
  }
  row.appendChild(label);
  row.appendChild(select);
  fieldsContainer.appendChild(row);

  fieldsContainer.appendChild(createNodeListBlock(ctrl, '追加する節点（既存リストへ追記）'));
}

/**
 * 紐づけ先要素に既に登録済みの節点IDを取得する（重複追加の警告に使用）。
 * @param {string} elementType
 * @param {string} targetId
 * @returns {string[]}
 */
function getLinkedNodeIds(elementType, targetId) {
  const tagName = VALIDATION_TAG_OVERRIDES[elementType] || `Stb${elementType}`;
  const doc = getState('models.documentA');
  if (!targetId || !doc) return [];
  const el = doc.querySelector(`${tagName}[id="${String(targetId).replace(/"/g, '\\"')}"]`);
  if (!el) return [];
  return Array.from(el.getElementsByTagName('StbNodeId'))
    .map((n) => n.getAttribute('id'))
    .filter(Boolean);
}

/**
 * 節点リストブロックを生成する（面材の輪郭・階/通り芯の紐づけ節点で共用）。
 * 「🎯 3Dで節点を追加」で連続ピックを開始し、順序付きリスト（▲▼削除）で編集する。
 * @param {{onChange: Function, startNodeListPick: Function}} ctrl
 * @param {string} [labelText] - リスト見出し（面材＝輪郭、階/通り芯＝紐づけ）
 * @returns {HTMLElement}
 */
function createNodeListBlock(ctrl, labelText = '輪郭節点（3点以上・順序が外周）') {
  const block = document.createElement('div');
  block.className = 'add-member-nodelist';

  const label = document.createElement('div');
  label.className = 'add-member-label add-member-nodelist-label';
  label.textContent = labelText;
  block.appendChild(label);

  const listEl = document.createElement('ol');
  listEl.className = 'add-member-nodelist-items';
  block.appendChild(listEl);

  const addBtn = makePickButton(
    '🎯 3Dで節点を追加',
    '3Dビューで節点を順にクリックして輪郭を作成（もう一度押すと終了）',
    (btn) => ctrl.startNodeListPick(btn),
    'add-member-nodelist-add',
  );
  block.appendChild(addBtn);

  refreshNodeListUI(listEl, ctrl);
  return block;
}

/**
 * panelNodeIds の現在値から順序付きリストUIを再描画する（追加・削除・並べ替え後に呼ぶ）。
 * @param {HTMLElement} listEl - <ol> 要素
 * @param {{onChange: Function}} ctrl
 */
function refreshNodeListUI(listEl, ctrl) {
  listEl.replaceChildren();
  if (panelNodeIds.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'add-member-nodelist-empty';
    empty.textContent = '（節点が未選択です）';
    listEl.appendChild(empty);
    return;
  }
  panelNodeIds.forEach((nodeId, index) => {
    const li = document.createElement('li');
    li.className = 'add-member-nodelist-item';

    const idSpan = document.createElement('span');
    idSpan.className = 'add-member-nodelist-id';
    idSpan.textContent = `節点 #${nodeId}`;
    li.appendChild(idSpan);

    const ctrls = document.createElement('span');
    ctrls.className = 'add-member-nodelist-controls';
    // ▲: 1つ前へ
    const upBtn = makeListButton('▲', '上へ', index === 0, () => {
      [panelNodeIds[index - 1], panelNodeIds[index]] = [
        panelNodeIds[index],
        panelNodeIds[index - 1],
      ];
      refreshNodeListUI(listEl, ctrl);
      ctrl.onChange();
    });
    // ▼: 1つ後ろへ
    const downBtn = makeListButton('▼', '下へ', index === panelNodeIds.length - 1, () => {
      [panelNodeIds[index], panelNodeIds[index + 1]] = [
        panelNodeIds[index + 1],
        panelNodeIds[index],
      ];
      refreshNodeListUI(listEl, ctrl);
      ctrl.onChange();
    });
    // ✕: 削除
    const delBtn = makeListButton('✕', '削除', false, () => {
      panelNodeIds.splice(index, 1);
      refreshNodeListUI(listEl, ctrl);
      ctrl.onChange();
    });
    ctrls.append(upBtn, downBtn, delBtn);
    li.appendChild(ctrls);
    listEl.appendChild(li);
  });
}

/**
 * リスト操作用の小ボタンを生成する。
 * @param {string} text
 * @param {string} title
 * @param {boolean} disabled
 * @param {() => void} onClick
 * @returns {HTMLButtonElement}
 */
function makeListButton(text, title, disabled, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-member-nodelist-btn';
  btn.textContent = text;
  btn.title = title;
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * 3D節点ピック用のボタンを生成する。ピック中のトグル表示は共通の
 * 'add-member-pick-btn' クラスで管理するため、onClick には生成したボタン自身を渡す。
 * @param {string} label - ボタン表示テキスト
 * @param {string} title - ツールチップ
 * @param {(btn: HTMLButtonElement) => void} onClick - クリック時ハンドラ（ボタン自身を受け取る）
 * @param {string} [extraClass] - 追加クラス（例: 'add-member-nodelist-add'）
 * @returns {HTMLButtonElement}
 */
function makePickButton(label, title, onClick, extraClass) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = extraClass ? `add-member-pick-btn ${extraClass}` : 'add-member-pick-btn';
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

/**
 * フォームから属性値を収集する。面材は node_ids（節点列の配列）を併せて返す。
 * @param {HTMLElement} fieldsContainer
 * @param {string} elementType
 * @returns {Object<string, string|string[]>}
 */
function collectAttrs(fieldsContainer, elementType) {
  const attrs = {};
  for (const control of fieldsContainer.querySelectorAll('[data-attr]')) {
    attrs[control.dataset.attr] = control.value;
  }
  if (PANEL_MEMBER_TYPES.has(elementType) || NODELIST_TYPES.has(elementType)) {
    attrs.node_ids = [...panelNodeIds];
  }
  return attrs;
}

/**
 * 入力タイプに応じた検証コンテキストを構築する。
 * @param {string} elementType
 * @returns {Object} validateNewMember 用 ctx
 */
/** 部材タイプ → スキーマ検証用 XML タグ名（軸はタグ名が型名と異なる）。 */
const VALIDATION_TAG_OVERRIDES = {
  Node: 'StbNode',
  Axis: 'StbParallelAxis',
  ArcAxis: 'StbArcAxis',
  RadialAxis: 'StbRadialAxis',
};

function buildValidationContext(elementType) {
  const tagName = VALIDATION_TAG_OVERRIDES[elementType] || `Stb${elementType}`;
  const validateAttr = (attr, value) => {
    // スキーマ未読込・未定義属性は警告対象外（ノイズ回避）
    if (!isSchemaLoaded() || !getAttributeInfo(tagName, attr)) return { valid: true };
    return validateAttributeValue(tagName, attr, value);
  };
  return {
    definition: getNewMemberDefinitions()[elementType],
    nodeIds: cachedNodeIds,
    sectionIds: cachedSections.map((s) => s.id),
    validateAttr,
  };
}

/**
 * attrs から節点参照属性（id_node*）の値を入力順に取り出す。
 * @param {Object<string,string>} attrs
 * @returns {string[]}
 */
function nodeRefValues(attrs) {
  return Object.entries(attrs)
    .filter(([k]) => k.startsWith('id_node'))
    .map(([, v]) => v);
}

/**
 * 確認サマリ用の説明文を組み立てる（タイプ非依存）。
 * @param {string} elementType
 * @param {Object<string,string>} attrs
 * @returns {string}
 */
function describeMember(elementType, attrs) {
  const label = TYPE_LABELS[elementType] || elementType;
  if (elementType === 'Node') {
    return `${label}: (${attrs.X ?? ''}, ${attrs.Y ?? ''}, ${attrs.Z ?? ''})`;
  }
  if (elementType === 'Story') {
    const ids = Array.isArray(attrs.node_ids) ? attrs.node_ids : [];
    const linked = ids.length > 0 ? ` / 紐づけ節点 ${ids.length}点` : '';
    return `${label}: ${attrs.name || '(名称なし)'} / 高さ ${attrs.height ?? '-'}mm / 種別 ${attrs.kind || 'GENERAL'}${linked}`;
  }
  if (elementType === 'Axis') {
    const ids = Array.isArray(attrs.node_ids) ? attrs.node_ids : [];
    const linked = ids.length > 0 ? ` / 紐づけ節点 ${ids.length}点` : '';
    return `${label}: ${attrs.group || 'X'}軸 ${attrs.name || '(名称なし)'} / 距離 ${attrs.distance ?? '-'}mm${linked}`;
  }
  if (elementType === 'ArcAxis') {
    const ids = Array.isArray(attrs.node_ids) ? attrs.node_ids : [];
    const linked = ids.length > 0 ? ` / 紐づけ節点 ${ids.length}点` : '';
    return `${label}: ${attrs.group || ''} ${attrs.name || '(名称なし)'} / 半径 ${attrs.radius ?? '-'}mm / 中心(${attrs.center_x ?? 0}, ${attrs.center_y ?? 0})${linked}`;
  }
  if (elementType === 'RadialAxis') {
    const ids = Array.isArray(attrs.node_ids) ? attrs.node_ids : [];
    const linked = ids.length > 0 ? ` / 紐づけ節点 ${ids.length}点` : '';
    return `${label}: ${attrs.group || ''} ${attrs.name || '(名称なし)'} / 角度 ${attrs.angle ?? '-'}° / 中心(${attrs.center_x ?? 0}, ${attrs.center_y ?? 0})${linked}`;
  }
  if (PANEL_MEMBER_TYPES.has(elementType)) {
    const ids = Array.isArray(attrs.node_ids) ? attrs.node_ids : [];
    const struct = attrs.kind_structure ? ` / 構造 ${attrs.kind_structure}` : '';
    return `${label}: 節点[${ids.join(', ')}] (${ids.length}点) / 断面#${attrs.id_section || '-'}${struct}`;
  }
  if (POINT_MEMBER_TYPES.has(elementType)) {
    const node = `節点#${attrs.id_node || '-'}`;
    if (elementType === 'FoundationColumn') {
      const wr = attrs.id_section_WR ? ` / 立上り断面#${attrs.id_section_WR}` : '';
      return `${label}: ${node} / 基礎断面#${attrs.id_section_FD || '-'}${wr} / 構造 ${attrs.kind_structure || 'RC'}`;
    }
    const struct = attrs.kind_structure ? ` / 構造 ${attrs.kind_structure}` : '';
    return `${label}: ${node} / 断面#${attrs.id_section || '-'}${struct}`;
  }
  // 線材: 上下端（柱・間柱）か始終端（大梁・小梁・ブレース）かを属性で判別
  const endpoints =
    'id_node_bottom' in attrs || 'id_node_top' in attrs
      ? `下端#${attrs.id_node_bottom || '-'} → 上端#${attrs.id_node_top || '-'}`
      : `始端#${attrs.id_node_start || '-'} → 終端#${attrs.id_node_end || '-'}`;
  const struct = attrs.kind_structure ? ` / 構造 ${attrs.kind_structure}` : '';
  const rot = attrs.rotate !== undefined ? ` / 回転 ${attrs.rotate || '0'}°` : '';
  return `${label}: ${endpoints} / 断面#${attrs.id_section || '-'}${struct}${rot}`;
}

/**
 * 確認サマリ＋検証結果を描画し、検証結果を返す。
 * @param {HTMLElement} summaryEl
 * @param {string} elementType
 * @param {Object<string,string>} attrs
 * @returns {{errors: string[], warnings: string[]}}
 */
function renderSummary(summaryEl, elementType, attrs) {
  const validation = validateNewMember(elementType, attrs, buildValidationContext(elementType));
  paintSummary(summaryEl, describeMember(elementType, attrs), validation, '✅ 作成可能です');
  return validation;
}

/**
 * 既存への紐づけモードの確認サマリ＋検証を描画し、検証結果を返す。
 * @param {HTMLElement} summaryEl
 * @param {string} elementType
 * @param {string} targetId - 紐づけ先の要素ID
 * @returns {{errors: string[], warnings: string[]}}
 */
function renderLinkSummary(summaryEl, elementType, targetId) {
  const validation = validateNodeLink(targetId, panelNodeIds, {
    nodeIds: cachedNodeIds,
    linkedNodeIds: getLinkedNodeIds(elementType, targetId),
  });
  const label = TYPE_LABELS[elementType] || elementType;
  const desc = `${label} #${targetId || '-'} に節点[${panelNodeIds.join(', ')}] (${panelNodeIds.length}点) を追加`;
  paintSummary(summaryEl, desc, validation, '✅ 紐づけ可能です');
  return validation;
}

/**
 * 確認サマリ（説明文＋エラー/警告 or OK）を描画する。
 * ユーザー入力値を含むため innerHTML は使わず textContent で組み立てる（XSS回避）。
 * @param {HTMLElement} summaryEl
 * @param {string} desc
 * @param {{errors: string[], warnings: string[]}} validation
 * @param {string} okText
 */
function paintSummary(summaryEl, desc, validation, okText) {
  summaryEl.replaceChildren();
  const descEl = document.createElement('div');
  descEl.className = 'add-member-summary-desc';
  descEl.textContent = desc;
  summaryEl.appendChild(descEl);

  if (validation.errors.length > 0 || validation.warnings.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'add-member-issues';
    for (const e of validation.errors) {
      const li = document.createElement('li');
      li.className = 'add-member-issue-error';
      li.textContent = `⛔ ${e}`;
      ul.appendChild(li);
    }
    for (const w of validation.warnings) {
      const li = document.createElement('li');
      li.className = 'add-member-issue-warning';
      li.textContent = `⚠️ ${w}`;
      ul.appendChild(li);
    }
    summaryEl.appendChild(ul);
  } else {
    const ok = document.createElement('div');
    ok.className = 'add-member-ok';
    ok.textContent = okText;
    summaryEl.appendChild(ok);
  }
}

/** フォームを閉じる（ピックモード解除・ハイライト解除を必ず行う） */
function closeForm() {
  nodePick.cancelPick();
  nodePick.clearHighlights();
  if (onKeydown) {
    document.removeEventListener('keydown', onKeydown);
    onKeydown = null;
  }
  if (dragCleanup) {
    dragCleanup();
    dragCleanup = null;
  }
  if (windowEl) {
    windowEl.remove();
    windowEl = null;
  }
}

/**
 * 新規部材追加フローティングウィンドウを開く。
 */
export function openAddMemberForm() {
  // 編集モードとは独立して直接作成できる（編集モードのON/OFFに依存しない）
  if (!getState('models.documentA')) {
    showError('モデルAが読み込まれていません');
    return;
  }
  if (windowEl) return; // 二重表示防止

  const definitions = getNewMemberDefinitions();
  const types = Object.keys(definitions);

  // 面材の輪郭節点列をリセット（前回のフォーム残骸を持ち越さない）
  panelNodeIds = [];

  // 節点ID・断面をキャッシュ（以降の入力検証・候補生成はキャッシュを参照する）
  refreshModelData(types[0]);

  // ---- ウィンドウDOM（floating-window 構造を再利用）----
  windowEl = document.createElement('div');
  windowEl.id = WINDOW_ID;
  windowEl.className = 'floating-window add-member-window visible';
  windowEl.setAttribute('role', 'dialog');
  windowEl.setAttribute('aria-labelledby', 'add-member-title');

  const header = document.createElement('div');
  header.className = 'float-window-header';
  header.id = `${WINDOW_ID}-header`;
  header.innerHTML = `
    <span class="float-window-title" id="add-member-title">➕ 新規部材の追加</span>
    <div class="float-window-controls">
      <button type="button" class="float-window-btn" id="close-${WINDOW_ID}-btn" aria-label="閉じる">✕</button>
    </div>
  `;

  const content = document.createElement('div');
  content.className = 'float-window-content';

  // タイプ選択
  const typeRow = document.createElement('div');
  typeRow.className = 'add-member-row';
  const typeLabel = document.createElement('label');
  typeLabel.className = 'add-member-label';
  typeLabel.textContent = '部材タイプ';
  typeLabel.htmlFor = 'add-member-type';
  const typeSelect = document.createElement('select');
  typeSelect.id = 'add-member-type';
  typeSelect.className = 'parameter-dropdown';
  for (const type of types) {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = TYPE_LABELS[type] || type;
    typeSelect.appendChild(opt);
  }
  typeRow.appendChild(typeLabel);
  typeRow.appendChild(typeSelect);
  content.appendChild(typeRow);

  // モード選択（階・各種通り芯のみ表示）: 新規作成 / 既存に節点を追加
  const modeRow = document.createElement('div');
  modeRow.className = 'add-member-row';
  modeRow.style.display = 'none';
  const modeLabel = document.createElement('label');
  modeLabel.className = 'add-member-label';
  modeLabel.textContent = '操作';
  modeLabel.htmlFor = 'add-member-mode';
  const modeSelect = document.createElement('select');
  modeSelect.id = 'add-member-mode';
  modeSelect.className = 'parameter-dropdown';
  for (const [value, text] of [
    ['create', '新規作成'],
    ['link', '既存に節点を追加'],
  ]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    modeSelect.appendChild(opt);
  }
  modeRow.appendChild(modeLabel);
  modeRow.appendChild(modeSelect);
  content.appendChild(modeRow);

  /** 現在の操作モードを返す（NODELIST タイプ以外は常に新規作成）。 */
  const getMode = () =>
    NODELIST_TYPES.has(typeSelect.value) && modeSelect.value === 'link' ? 'link' : 'create';

  // 動的フィールド・サマリ・ボタン領域
  const fieldsContainer = document.createElement('div');
  fieldsContainer.className = 'add-member-fields';
  content.appendChild(fieldsContainer);

  const summaryEl = document.createElement('div');
  summaryEl.className = 'add-member-summary';
  content.appendChild(summaryEl);

  const buttonArea = document.createElement('div');
  buttonArea.className = 'parameter-editor-buttons';
  buttonArea.innerHTML = `
    <button type="button" class="parameter-editor-cancel">キャンセル</button>
    <button type="button" class="parameter-editor-ok add-member-submit">追加</button>
  `;
  content.appendChild(buttonArea);

  windowEl.appendChild(header);
  windowEl.appendChild(content);
  document.body.appendChild(windowEl);

  const submitBtn = buttonArea.querySelector('.add-member-submit');

  // ---- フォームコントローラ（フィールド行から参照する）----
  const ctrl = {
    onChange() {
      const elementType = typeSelect.value;
      if (getMode() === 'link') {
        // 既存への紐づけ: 紐づけ先＋追加節点を検証し、3Dハイライト
        const targetId = fieldsContainer.querySelector('[data-role="link-target"]')?.value || '';
        const { errors } = renderLinkSummary(summaryEl, elementType, targetId);
        submitBtn.disabled = errors.length > 0;
        const refs = panelNodeIds.filter(Boolean);
        if (refs.length > 0) nodePick.highlightNodes(refs);
        else nodePick.clearHighlights();
        return;
      }
      const attrs = collectAttrs(fieldsContainer, elementType);
      const { errors } = renderSummary(summaryEl, elementType, attrs);
      submitBtn.disabled = errors.length > 0;
      // 面材・階・通り芯は節点リスト、線材は端部節点を3Dハイライト（節点タイプはハイライト対象なし）
      const refs =
        PANEL_MEMBER_TYPES.has(elementType) || NODELIST_TYPES.has(elementType)
          ? panelNodeIds.filter(Boolean)
          : nodeRefValues(attrs).filter(Boolean);
      if (refs.length > 0) {
        nodePick.highlightNodes(refs);
      } else {
        nodePick.clearHighlights();
      }
    },
    /**
     * 3D節点ピックを開始する。targetInput が null の場合はスナップ（X/Y/Z へ座標反映）。
     * @param {HTMLButtonElement} btn
     * @param {HTMLSelectElement|null} targetInput
     * @param {boolean} isSnap
     */
    startNodePick(btn, targetInput, isSnap) {
      // 同じボタンの再クリックでピック解除（トグル）
      if (btn.classList.contains('picking')) {
        nodePick.cancelPick();
        btn.classList.remove('picking');
        return;
      }
      clearPickingButtons(fieldsContainer);
      btn.classList.add('picking');
      nodePick.beginPick(({ nodeId }) => {
        if (isSnap) {
          const coords = nodePick.getNodeCoords(nodeId);
          if (coords) {
            setFieldValue(fieldsContainer, 'X', coords.X);
            setFieldValue(fieldsContainer, 'Y', coords.Y);
            setFieldValue(fieldsContainer, 'Z', coords.Z);
          }
        } else if (targetInput) {
          ensureOption(targetInput, nodeId);
          targetInput.value = nodeId;
        }
        nodePick.cancelPick();
        btn.classList.remove('picking');
        ctrl.onChange();
      });
    },
    /**
     * 面材の輪郭節点を連続ピックする。クリックのたびに末尾へ追加し、リストUIを更新する。
     * もう一度ボタンを押すとピック終了（トグル）。
     * @param {HTMLButtonElement} btn
     */
    startNodeListPick(btn) {
      if (btn.classList.contains('picking')) {
        nodePick.cancelPick();
        btn.classList.remove('picking');
        return;
      }
      clearPickingButtons(fieldsContainer);
      btn.classList.add('picking');
      const listEl = fieldsContainer.querySelector('.add-member-nodelist-items');
      // 連続ピック: cancelPick せず、クリックのたびに追加し続ける
      nodePick.beginPick(({ nodeId }) => {
        // 直前と同一節点の連続クリックは無視（縮退辺を防ぐ）
        if (panelNodeIds[panelNodeIds.length - 1] !== String(nodeId)) {
          panelNodeIds.push(String(nodeId));
          if (listEl) refreshNodeListUI(listEl, ctrl);
          ctrl.onChange();
        }
      });
    },
  };

  renderFields(fieldsContainer, typeSelect.value, ctrl, getMode());
  ctrl.onChange();

  // タイプ変更でフィールド再構築（タイプにより参照する断面種別が変わるため再キャッシュ）
  typeSelect.addEventListener('change', () => {
    nodePick.cancelPick();
    clearPickingButtons(fieldsContainer);
    // タイプを跨ぐと節点列の意味が変わるためクリアする
    panelNodeIds = [];
    // モード選択は階・各種通り芯でのみ意味を持つ。タイプ変更時は新規作成へ戻す。
    modeRow.style.display = NODELIST_TYPES.has(typeSelect.value) ? '' : 'none';
    modeSelect.value = 'create';
    refreshModelData(typeSelect.value);
    renderFields(fieldsContainer, typeSelect.value, ctrl, getMode());
    ctrl.onChange();
  });

  // モード変更（新規作成 ⇄ 既存に追加）でフィールド再構築。節点列はクリアする。
  modeSelect.addEventListener('change', () => {
    nodePick.cancelPick();
    clearPickingButtons(fieldsContainer);
    panelNodeIds = [];
    renderFields(fieldsContainer, typeSelect.value, ctrl, getMode());
    ctrl.onChange();
  });

  // フィールド変更でライブ検証＋ハイライト更新。断面選択時は kind_structure を自動整合
  fieldsContainer.addEventListener('input', () => ctrl.onChange());
  fieldsContainer.addEventListener('change', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target?.dataset?.attr === 'id_section') {
      const structure = structureForSection(target.value);
      if (structure) setFieldValue(fieldsContainer, 'kind_structure', structure);
    }
    ctrl.onChange();
  });

  // ---- イベント配線 ----
  const onSubmit = () => {
    const elementType = typeSelect.value;
    if (getMode() === 'link') {
      const targetId = fieldsContainer.querySelector('[data-role="link-target"]')?.value || '';
      const { errors } = validateNodeLink(targetId, panelNodeIds, {
        nodeIds: cachedNodeIds,
        linkedNodeIds: getLinkedNodeIds(elementType, targetId),
      });
      if (errors.length > 0) {
        showError(errors[0]);
        return;
      }
      const result = linkNodesToExisting(elementType, targetId, panelNodeIds);
      if (result.success) {
        closeForm();
      } else {
        showError(result.error || '紐づけに失敗しました');
        log.warn('節点紐づけに失敗:', result.error);
      }
      return;
    }
    const attrs = collectAttrs(fieldsContainer, elementType);
    const { errors } = validateNewMember(elementType, attrs, buildValidationContext(elementType));
    if (errors.length > 0) {
      showError(errors[0]);
      return;
    }
    const result = addNewMember(elementType, attrs);
    if (result.success) {
      closeForm();
    } else {
      showError(result.error || '追加に失敗しました');
      log.warn('新規部材追加に失敗:', result.error);
    }
  };

  header.querySelector(`#close-${WINDOW_ID}-btn`)?.addEventListener('click', closeForm);
  buttonArea.querySelector('.parameter-editor-cancel')?.addEventListener('click', closeForm);
  submitBtn?.addEventListener('click', onSubmit);

  onKeydown = (e) => {
    if (e.key === 'Escape') closeForm();
  };
  document.addEventListener('keydown', onKeydown);

  // ドラッグ機能を付与（floatingWindowManager のドラッグ実装を再利用）
  dragCleanup = floatingWindowManager.makeDraggable(windowEl, header);
}

/**
 * セレクトに存在しない値が来た場合に option を追加する（ピックで未候補IDが来た場合の保険）。
 * @param {HTMLSelectElement} select
 * @param {string} value
 */
function ensureOption(select, value) {
  if (value == null || value === '') return;
  if ([...select.options].some((o) => o.value === String(value))) return;
  const opt = document.createElement('option');
  opt.value = String(value);
  opt.textContent = String(value);
  select.appendChild(opt);
}

/**
 * フィールドコンテナ内の指定属性の値を設定する。
 * @param {HTMLElement} fieldsContainer
 * @param {string} attr
 * @param {string} value
 */
function setFieldValue(fieldsContainer, attr, value) {
  const el = fieldsContainer.querySelector(`[data-attr="${attr}"]`);
  if (el != null && value != null) el.value = value;
}

/**
 * ピック中表示のボタンを全て解除する。
 * @param {HTMLElement} fieldsContainer
 */
function clearPickingButtons(fieldsContainer) {
  for (const btn of fieldsContainer.querySelectorAll('.add-member-pick-btn.picking')) {
    btn.classList.remove('picking');
  }
}

/**
 * 「＋部材追加」ボタンを配線する。
 */
export function initAddMemberForm() {
  const btn = document.getElementById('add-member-button');
  if (btn) {
    btn.addEventListener('click', openAddMemberForm);
  }
}
