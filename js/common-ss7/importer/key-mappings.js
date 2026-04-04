/**
 * key-mappings.js
 * SS7 CSVパーサーのキーマッピング定義
 *
 * 責務:
 * - ヘッダー名の揺れに対応するマッピング定義
 * - 安全なキー取得ヘルパー関数
 *
 * ported from MatrixCalc for StbDiffViewer
 *
 * 使用例:
 *   import { COLUMN_PLACEMENT_KEYS, getValue } from './key-mappings.js';
 *   const floor = getValue(row, COLUMN_PLACEMENT_KEYS.floor);
 */

// =============================================================================
// 配置セクション（members/）のキーマッピング
// =============================================================================

/**
 * 柱配置のキーマッピング
 * セクション名: '柱配置'
 * ヘッダー例: ["階", "軸-軸", "符号", "反転/X", "Y"]
 */
export const COLUMN_PLACEMENT_KEYS = {
  floor: ['階', '階名'],
  axis: ['軸-軸', 'X軸-Y軸'],
  symbol: ['符号', '柱符号', '断面符号'],
  flipX: ['反転/X', '反転X', 'FlipX'],
  flipY: ['Y', '反転/Y', '反転Y', 'FlipY'],
};

/**
 * 大梁配置のキーマッピング
 * セクション名: '大梁配置'
 * ヘッダー例: ["層", "フレーム-軸-軸", "符号", "反転配置", "断面反転"]
 */
export const GIRDER_PLACEMENT_KEYS = {
  story: ['層', '層名'],
  frameAxis: ['フレーム-軸-軸', 'フレーム軸-軸-軸'],
  symbol: ['符号', '梁符号', '断面符号'],
  flip: ['反転配置', '反転'],
  sectionFlip: ['断面反転', '断面反転配置'],
};

/**
 * 小梁配置のキーマッピング
 * セクション名: '小梁配置'
 *
 * 2種類のフォーマット:
 * - 4軸形式: 層, 面, 二重, 1次, 2次, 3次, 4次, 5次, 床組領域No, 符号, 反転, 自動判定
 * - 3軸形式: 層, フレーム-軸-軸, 符号, オフセット, 反転配置, 二重
 */
export const SUB_BEAM_PLACEMENT_KEYS = {
  // 共通
  story: ['層', '層名'],
  symbol: ['符号', '梁符号'],
  level: ['二重'],
  // 4軸形式用
  surface: ['面', 'グリッド範囲'],
  index1: ['1次'],
  index2: ['2次'],
  index3: ['3次'],
  index4: ['4次'],
  index5: ['5次'],
  regionNo: ['床組領域No', '床組No', '床組小梁No'],
  flip4: ['反転', '反転配置'],
  autoDirection: ['自動判定'],
  // 3軸形式用
  frameAxis: ['フレーム-軸-軸', 'フレーム軸-軸-軸'],
  offset: ['オフセット'],
  flip3: ['反転配置'],
};

/**
 * ブレース配置のキーマッピング
 * セクション名: 'ブレース配置', '鉛直ブレース配置'
 */
export const BRACE_PLACEMENT_KEYS = {
  story: ['階', '層', '層名'],
  frame: ['フレーム-軸-軸', 'フレーム', '軸-軸'],
  symbol: ['符号', 'ブレース符号'],
  braceType: ['タイプ', '形状', 'ブレース形状'],
  pair: ['ペア', '配置'],
  eccLeft: ['K形偏心距離-左', '偏心距離左', 'K形偏心距離/左'],
  eccRight: ['K形偏心距離-右', '偏心距離右', '右'],
  throughFloorDir: ['通し/階方向', '通し階方向', '階方向'],
  throughSpanDir: ['通し/スパン方向', 'スパン方向'],
};

/**
 * 壁配置のキーマッピング
 * セクション名: '壁配置'
 */
export const WALL_PLACEMENT_KEYS = {
  story: ['層', '層名', '階'],
  frame: ['フレーム'],
  axis: ['軸-軸', 'フレーム-軸-軸'],
  symbol: ['符号', '壁符号'],
  openingRatio: ['開口率'],
};

/**
 * 壁開口配置のキーマッピング
 * セクション名: '壁開口配置'
 * ヘッダー例(2行): ["階", "フレーム-軸-軸", "識別カウンタ", "押えタイプ", "開口の寸法と位置", "", "", "", "開口重量"]
 *                  ["",   "",               "",           "",           "L1",          "L2","H1","H2",""]
 * マージ後: ["階", "フレーム-軸-軸", "識別カウンタ", "押えタイプ", "開口の寸法と位置/L1", "L2", "H1", "H2", "開口重量"]
 */
export const WALL_OPENING_PLACEMENT_KEYS = {
  story: ['階', '層', '層名'],
  axis: ['フレーム-軸-軸', '軸-軸'],
  counter: ['識別カウンタ', '識別子'],
  holdType: ['押えタイプ'],
  l1: ['開口の寸法と位置/L1', 'L1', '開口幅'],
  l2: ['L2'],
  h1: ['H1', '開口高さ'],
  h2: ['H2'],
};

/**
 * パラペット配置のキーマッピング
 * セクション名: 'パラペット配置'
 * ヘッダー例: ["層", "フレーム-軸-軸", "符号", "高さ", "先端移動"]
 */
export const PARAPET_PLACEMENT_KEYS = {
  story: ['層', '層名'],
  frameAxis: ['フレーム-軸-軸', 'フレーム軸-軸-軸'],
  symbol: ['符号', 'パラペット符号'],
  height: ['高さ'],
  tipMovement: ['先端移動'],
};

/**
 * パラペット断面のキーマッピング
 * セクション名: 'パラペット断面'
 * ヘッダー例: ["壁符号", "t", "仕上", "重量", "コンクリート材料"]
 */
export const PARAPET_SECTION_KEYS = {
  symbol: ['壁符号', '符号'],
  thickness: ['t', '壁厚'],
  finishLoad: ['仕上', '仕上荷重'],
  weight: ['重量'],
  material: ['コンクリート材料', 'コンクリート/材料', '材料'],
};

/**
 * 通し柱のキーマッピング
 * セクション名: '通し柱'
 */
export const CONTINUOUS_COLUMN_KEYS = {
  story: ['層', '層名'],
  axis: ['軸-軸'],
  isContinuous: ['一本柱', '通し柱'],
};

/**
 * 特殊荷重登録 梁のキーマッピング
 * セクション名: '特殊荷重登録 梁'
 */
export const SPECIAL_LOAD_REGISTRATION_KEYS = {
  id: ['No.', 'No'],
  name: ['荷重名称', '名称'],
  type: ['タイプ'],
  P1: ['P1'],
  P2: ['P2'],
  P3: ['P3'],
  P4: ['P4'],
  P5: ['P5'],
  P6: ['P6'],
  cmoQoOnly: ['CMoQoのみ'],
  llTl: ['LL/TL'],
  seismicSnow: ['地/ラ'],
};

/**
 * 大梁特殊荷重配置のキーマッピング
 * セクション名: '大梁特殊荷重配置'
 */
export const GIRDER_SPECIAL_LOAD_PLACEMENT_KEYS = {
  story: ['層', '層名'],
  frameAxis: ['フレーム-軸-軸', 'フレーム軸-軸-軸'],
  placementIndex: ['配置インデックス'],
  specialLoadId: ['梁特殊荷重登録リスト'],
  reverse: ['反転配置'],
};

/**
 * フレーム外雑壁断面のキーマッピング
 * セクション名: 'フレーム外雑壁断面'
 */
export const OUT_OF_FRAME_WALL_SECTION_KEYS = {
  symbol: ['壁符号', '符号'],
  thickness: ['t'],
  finishWeight: ['仕上'],
  totalWeight: ['重量'],
  material: ['コンクリート材料', '材料'],
};

/**
 * フレーム外雑壁配置のキーマッピング
 * セクション名: 'フレーム外雑壁配置'
 */
export const OUT_OF_FRAME_WALL_PLACEMENT_KEYS = {
  id: ['ID'],
  placementName: ['配置名'],
  axis: ['軸-軸'],
  floor: ['階'],
  floorTo: ['col4'], // 空ヘッダー列（パーサーが colN 形式で生成）
  startX: ['始点/X', '始点'],
  startY: ['Y'],
  endX: ['終点/X', '終点'],
  endY: ['Y_2'],
  symbol: ['符号'],
  considerWeight: ['重量の考慮'],
};

// =============================================================================
// 断面セクション（sections/）のキーマッピング
// =============================================================================

/**
 * 壁断面のキーマッピング
 * セクション名: '壁断面'
 */
export const WALL_SECTION_KEYS = {
  symbol: ['壁符号', '符号'],
  thickness: ['t', '壁厚'],
  finishLoad: ['仕上', '仕上重量'],
  weight: ['重量'],
  material: ['コンクリート/材料', '材料'],
  cover: ['コンクリート/かぶり', 'かぶり'],
  fc: ['コンクリート/Fc', 'Fc'],
  // 縦筋 (vertical rebar) - 重複ヘッダー対応: suffix なし（最初の出現）
  verticalArrangement: ['縦筋/配筋'],
  verticalDia: ['径1'],
  verticalPitch: ['ピッチ'],
  verticalMat: ['材料1'],
  // 横筋 (horizontal rebar) - 重複ヘッダー対応: _2 接尾辞（2番目の出現）
  horizontalArrangement: ['横筋/配筋'],
  horizontalDia: ['径1_2'],
  horizontalPitch: ['ピッチ_2'],
  horizontalMat: ['材料1_2'],
};

/**
 * RC柱断面のキーマッピング
 * セクション名: 'RC柱断面'
 * 注意: 重複ヘッダーがあるため、sectionToObjects({ handleDuplicates: 'suffix' }) を使用
 */
export const RC_COLUMN_SECTION_KEYS = {
  floor: ['階', '階名'],
  symbol: ['柱符号', '符号'],
  suffix: ['添字'],
  shape: ['コンクリート/形状', '形状'],
  dx: ['Dx', '幅'],
  dy: ['Dy', '奥行'],
  material: ['材料', 'コンクリート材料'],
  loadDx: ['荷重剛性用Dx'],
  loadDy: ['荷重剛性用Dy'],
  // 主筋本数
  mainRebarCountTopX: ['主筋本数/柱頭X'],
  mainRebarCountTopY: ['柱頭Y'],
  mainRebarCountBottomX: ['柱脚X'],
  mainRebarCountBottomY: ['柱脚Y'],
  // 主筋径 (重複対応: _2 接尾辞)
  mainRebarDiaTopX: ['主筋径/柱頭X'],
  mainRebarDiaTopY: ['柱頭Y_2'],
  mainRebarDiaBottomX: ['柱脚X_2'],
  mainRebarDiaBottomY: ['柱脚Y_2'],
  // 主筋材料 (重複対応: _3 接尾辞)
  mainRebarMatTopX: ['主筋材料/柱頭X'],
  mainRebarMatTopY: ['柱頭Y_3'],
  mainRebarMatBottomX: ['柱脚X_3'],
  mainRebarMatBottomY: ['柱脚Y_3'],
  // 帯筋
  hoopCountX: ['帯筋本数/X'],
  hoopCountY: ['Y'],
  hoopDiameter: ['帯筋径'],
  hoopPitch: ['帯筋ピッチ'],
  hoopMaterial: ['帯筋材料'],
};

/**
 * RC梁断面のキーマッピング
 * セクション名: 'RC梁断面'
 * 注意: 重複ヘッダーがあるため、sectionToObjects({ handleDuplicates: 'suffix' }) を使用
 */
export const RC_BEAM_SECTION_KEYS = {
  story: ['層', '層名'],
  symbol: ['梁符号', '符号'],
  suffix: ['添字'],
  // ハンチ
  haunchLeft: ['ハンチ/左端'],
  haunchRight: ['右端'],
  // コンクリート寸法
  leftB: ['コンクリート/左端b'],
  leftD: ['左端D'],
  centerB: ['中央b'],
  centerD: ['中央D'],
  rightB: ['右端b'],
  rightD: ['右端D'],
  material: ['材料'],
  // コンクリート荷重剛性用寸法（梁のレベル調整による打増し効果を含む）
  // 左端bのみ親ヘッダーが付き、他はsuffix dedup（_2）で解決される
  loadLeftB: ['コンクリート荷重剛性用/左端b'],
  loadLeftD: ['左端D_2'],
  loadCenterB: ['中央b_2'],
  loadCenterD: ['中央D_2'],
  loadRightB: ['右端b_2'],
  loadRightD: ['右端D_2'],
  // 主筋本数（左端/中央/右端 × 上/下）
  mainRebarCountLeftTop: ['主筋本数/左上'],
  mainRebarCountLeftBottom: ['左下'],
  mainRebarCountCenterTop: ['中央上'],
  mainRebarCountCenterBottom: ['中央下'],
  mainRebarCountRightTop: ['右上'],
  mainRebarCountRightBottom: ['右下'],
  // 主筋径（左端/中央/右端 × 上/下）suffix modeで_2が付く
  mainRebarDiaLeftTop: ['主筋径/左上'],
  mainRebarDiaLeftBottom: ['左下_2'],
  mainRebarDiaCenterTop: ['中央上_2'],
  mainRebarDiaCenterBottom: ['中央下_2'],
  mainRebarDiaRightTop: ['右上_2'],
  mainRebarDiaRightBottom: ['右下_2'],
  // 主筋材料（左端/中央/右端 × 上/下）suffix modeで_3が付く
  mainRebarMatLeftTop: ['主筋材料/左上'],
  mainRebarMatLeftBottom: ['左下_3'],
  mainRebarMatCenterTop: ['中央上_3'],
  mainRebarMatCenterBottom: ['中央下_3'],
  mainRebarMatRightTop: ['右上_3'],
  mainRebarMatRightBottom: ['右下_3'],
  // 主筋dt1（左端/中央/右端 × 上/下）suffix modeで_4が付く
  mainRebarDt1LeftTop: ['主筋dt1/左上'],
  mainRebarDt1LeftBottom: ['左下_4'],
  mainRebarDt1CenterTop: ['中央上_4'],
  mainRebarDt1CenterBottom: ['中央下_4'],
  mainRebarDt1RightTop: ['右上_4'],
  mainRebarDt1RightBottom: ['右下_4'],
  // 主筋2本数（2段筋）suffix modeで_8が付く
  mainRebar2CountLeftTop: ['主筋2本数/左上'],
  mainRebar2CountLeftBottom: ['左下_8'],
  mainRebar2CountCenterTop: ['中央上_8'],
  mainRebar2CountCenterBottom: ['中央下_8'],
  mainRebar2CountRightTop: ['右上_8'],
  mainRebar2CountRightBottom: ['右下_8'],
  // 中段筋
  midRebar: ['中段筋'],
  // あばら筋（左端）
  stirrupCountLeft: ['あばら筋左端/本数'],
  stirrupDiaLeft: ['径'],
  stirrupPitchLeft: ['ピッチ'],
  // あばら筋（中央）suffix modeで_2が付く
  stirrupCountCenter: ['あばら筋中央/本数'],
  stirrupDiaCenter: ['径_2'],
  stirrupPitchCenter: ['ピッチ_2'],
  // あばら筋（右端）suffix modeで_3が付く
  stirrupCountRight: ['あばら筋右端/本数'],
  stirrupDiaRight: ['径_3'],
  stirrupPitchRight: ['ピッチ_3'],
  // あばら筋材料
  stirrupMatLeft: ['あばら筋材料/左端'],
  stirrupMatCenter: ['中央'],
  stirrupMatRight: ['右端_2'],
};

/**
 * S柱断面のキーマッピング
 * セクション名: 'S柱断面'
 */
export const S_COLUMN_SECTION_KEYS = {
  floor: ['階', '階名'],
  symbol: ['柱符号', '符号'],
  suffix: ['添字'],
  shape: ['鉄骨形状', '断面形状', '形状'],
  sectionName: ['鉄骨断面', '鉄骨断面/登録形状X', '断面名', '断面'],
  sectionType: ['タイプ', 'タイプX', '断面タイプ'],
  material: ['材料', '鉄骨材料', '鉄骨材料/フランジX'],
  concreteMaterial: ['充填コンクリート', '充填コンクリート/材料'],
};

/**
 * 露出柱脚断面のキーマッピング
 * セクション名: '露出柱脚断面'
 */
export const EXPOSED_COLUMN_BASE_KEYS = {
  floor: ['階', '階名'],
  symbol: ['柱符号', '符号'],
  plateDx: ['ベースプレート/Dx', 'Dx'],
  plateDy: ['Dy'],
  plateThickness: ['厚さ'],
  plateCorner: ['隅切長'],
  plateDtX: ['dtX'],
  plateDtY: ['dtY'],
  plateMaterial: ['材料'],
  holeDiameter: ['孔径'],
  anchorBoltName: ['アンカーボルト/径'],
  anchorBoltTotal: ['全本数'],
  anchorBoltCountX: ['X本数'],
  anchorBoltCountY: ['Y本数'],
  anchorBoltLength: ['定着長'],
  anchorBoltEffectiveLength: ['有効長'],
  anchorBoltMaterial: ['材料_2'],
  baseHardware: ['定着金物'],
  foundationDx: ['基礎柱/Dx'],
  foundationDy: ['Dy_2'],
  foundationHeight: ['h'],
};

/**
 * S梁断面のキーマッピング
 * セクション名: 'S梁断面'
 */
export const S_BEAM_SECTION_KEYS = {
  story: ['層', '層名'],
  symbol: ['梁符号', '符号'],
  suffix: ['添字'],
  haunchLeft: ['ハンチ左', 'ハンチ/左端'],
  haunchRight: ['ハンチ右', 'ハンチ/右端'],
  shape: ['鉄骨形状', '断面形状', '形状'],
  // 左端・中央・右端の断面名
  sectionNameLeft: ['鉄骨登録形状左', '登録形状左'],
  sectionNameCenter: ['鉄骨登録形状中央', '登録形状中央', '中央'],
  sectionNameRight: ['鉄骨登録形状右', '登録形状右', '右端'],
  // 材料（左端・中央・右端）
  materialLeft: ['フランジ材料左', 'フランジ材料/左端'],
  materialCenter: ['フランジ材料中央', '中央'],
  materialRight: ['フランジ材料右', '右端'],
};

/**
 * S小梁断面のキーマッピング
 * セクション名: 'S小梁断面'
 */
export const S_SUB_BEAM_SECTION_KEYS = {
  symbol: ['梁符号', '符号'],
  shape: ['鉄骨形状', '断面形状', '形状'],
  sectionName: ['登録形状', '断面名', '断面'],
  sectionType: ['形状タイプ', 'タイプ'],
  material: ['材料/フランジ', '材料', '鉄骨材料'],
};

/**
 * S片持梁断面のキーマッピング
 * セクション名: 'S片持梁断面'
 */
export const S_CANTI_BEAM_SECTION_KEYS = {
  symbol: ['梁符号', '符号'],
  haunchLength: ['ハンチ長'],
  shape: ['鉄骨形状', '断面形状', '形状'],
  sectionNameRoot: ['登録形状/元端', '登録形状元端', '断面名'],
  sectionNameTip: ['先端', '登録形状/先端'],
  material: ['材料/フランジ', '材料', '鉄骨材料'],
};

/**
 * 床断面のキーマッピング
 * セクション名: '床断面', 'デッキ床断面', 'RC床断面'
 *
 * デッキ床: 床符号, t, te, デッキ高さ, 積載荷重, 床総荷重, 仕上, D.L, 方向, コンクリート材料
 * RC床: 床符号, t, te, 積載荷重, 床総荷重, 仕上, D.L, 方向, コンクリート材料
 */
export const FLOOR_SECTION_KEYS = {
  symbol: ['床符号', '符号'],
  t: ['t', '厚さ', '床厚'],
  te: ['te', '元端te', '有効厚さ', '有効床厚'],
  deckHeight: ['デッキ高さ'],
  loadName: ['積載荷重', '積載荷重名', '積載荷重名称'],
  totalLoad: ['床総荷重'],
  finish: ['仕上', '仕上荷重'],
  dl: ['D.L', 'DL'],
  direction: ['方向'],
  concrete: ['コンクリート材料', '材料', 'コンクリート'],
};

/**
 * ブレース断面のキーマッピング
 * セクション名: 'Sブレース断面', '鉛直ブレース断面（鉛直ブレース）', '鉛直ブレース断面'
 */
export const BRACE_SECTION_KEYS = {
  story: ['層', '層名'],
  symbol: ['符号', 'ブレース符号'],
  suffix: ['添字'],
  shape: ['登録形状', '鉄骨形状', '断面形状', '形状'],
  sectionName: ['断面名', '断面'],
  material: ['材料', '鉄骨材料'],
};

/**
 * 片持梁配置のキーマッピング
 * セクション名: '片持梁配置'
 */
export const CANTILEVER_GIRDER_PLACEMENT_KEYS = {
  story: ['層', '層名'],
  axis: ['軸-軸', 'X軸-Y軸'],
  direction: ['方向'],
  symbol: ['符号', '梁符号'],
  length: ['長さ'],
  offsetXY: ['先端移動/左右'],
  offsetZ: ['上下'],
};

/**
 * 片持床配置のキーマッピング
 * セクション名: '片持床配置'
 */
export const CANTILEVER_SLAB_PLACEMENT_KEYS = {
  story: ['層', '層名'],
  frameAxis: ['フレーム-軸-軸', 'フレーム軸-軸-軸'],
  level: ['二重'],
  counter: ['識別カウンタ'],
  index1: ['1次'],
  regionNo: ['床組領域No', '床組No'],
  symbol: ['符号', '床符号'],
  angle: ['床の角度'],
};

/**
 * 片持床形状配置のキーマッピング
 * セクション名: '片持床形状配置'
 */
export const CANTILEVER_SLAB_SHAPE_KEYS = {
  story: ['層', '層名'],
  frameAxis: ['フレーム-軸-軸', 'フレーム軸-軸-軸'],
  level: ['二重'],
  counter: ['識別カウンタ'],
  direction: ['出の方向'],
  length: ['跳出し長さ'],
  tipMovement: ['先端移動'],
  rangeLeft: ['範囲/左'],
  rangeRight: ['右'],
};

// =============================================================================
// グリッド・層セクション（gridLevelParser）のキーマッピング
// =============================================================================

/**
 * 軸名のキーマッピング
 * セクション名: '軸名'
 */
export const AXIS_KEYS = {
  name: ['軸名', '軸'],
};

/**
 * 層名のキーマッピング
 * セクション名: '層名'
 */
export const STORY_KEYS = {
  name: ['層名', '層'],
};

/**
 * 階名のキーマッピング
 * セクション名: '階名'
 */
export const FLOOR_KEYS = {
  name: ['階名', '階'],
};

/**
 * 基準スパン長のキーマッピング
 * セクション名: '基準スパン長'
 */
export const SPAN_KEYS = {
  axisRange: ['軸－軸', '軸-軸'],
  length: ['スパン長', '長さ'],
};

/**
 * 標準階高のキーマッピング
 * セクション名: '標準階高'
 */
export const STORY_HEIGHT_KEYS = {
  floor: ['階名', '階'],
  height: ['階高', '高さ'],
};

/**
 * 各層主体構造のキーマッピング
 * セクション名: '各層主体構造'
 */
export const STRUCTURE_TYPE_KEYS = {
  story: ['層名', '層'],
  type: ['主体構造', '構造種別'],
};

/**
 * 節点の上下移動のキーマッピング
 * セクション名: '節点の上下移動'
 */
export const NODE_VERTICAL_MOVEMENT_KEYS = {
  story: ['層', '層名'],
  axis: ['軸-軸', 'X軸-Y軸'],
  deltaZ: ['ΔZ', 'deltaZ', '移動量'],
};

/**
 * 節点の同一化のキーマッピング
 * セクション名: '節点の同一化'
 */
export const NODE_UNIFICATION_KEYS = {
  fromStory: ['移動元層', '移動元/層', '層'],
  fromAxis: ['移動元軸-軸', '軸-軸'],
  toStory: ['移動先層', '移動先/層'],
  toAxis: ['移動先軸-軸', '移動先/軸-軸', '軸-軸_2'],
};

/**
 * 軸振れのキーマッピング
 * セクション名: '軸振れ'
 */
export const AXIS_DEVIATION_KEYS = {
  axis: ['軸-軸', 'X軸-Y軸'],
  deltaX: ['ΔX', 'deltaX'],
  deltaY: ['ΔY', 'deltaY'],
};

/**
 * 部材の寄りのキーマッピング
 * セクション名: '部材の寄り'
 */
export const MEMBER_ECCENTRICITY_KEYS = {
  frame: ['フレーム', '軸'],
  control: ['押さえ'],
  columnOffset: ['柱'],
  girderOffset: ['梁'],
  wallOffset: ['壁'],
};

/**
 * 梁のレベル調整のキーマッピング
 * セクション名: '梁のレベル調整'
 */
export const GIRDER_LEVEL_ADJUSTMENT_KEYS = {
  story: ['層名', '層'],
  control: ['押さえ'],
  level: ['レベル'],
};

// =============================================================================
// 床関連セクションのキーマッピング
// =============================================================================

/**
 * 積載荷重のキーマッピング
 * セクション名: '積載荷重'
 */
export const LOAD_TABLE_KEYS = {
  name: ['荷重名', '名称'],
  slab: ['スラブ用', 'スラブ'],
  beam: ['小梁用', '小梁'],
  frame: ['ラーメン用', 'ラーメン'],
  seismic: ['地震用', '地震'],
  editable: ['編集'],
};

/**
 * 床配置のキーマッピング
 * セクション名: '床配置'
 */
export const FLOOR_LAYOUT_KEYS = {
  level: ['層', '層名'],
  surface: ['面', 'グリッド範囲'],
  doubleType: ['二重'],
  index1: ['1次'],
  index2: ['2次'],
  index3: ['3次'],
  index4: ['4次'],
  index5: ['5次'],
  floorGroupNo: ['床組領域No', '床組No'],
  symbol: ['符号', '床符号'],
  rotation: ['床の角度', '角度'],
};

/**
 * 片持床配置のキーマッピング
 * セクション名: '片持床配置'
 */
export const CANTILEVER_FLOOR_LAYOUT_KEYS = {
  level: ['層', '層名'],
  frameAxis: ['フレーム-軸-軸', 'フレーム軸-軸-軸'],
  doubleType: ['二重'],
  identifier: ['識別カウンタ', '識別子'],
  index1: ['1次'],
  floorGroupNo: ['床組領域No', '床組No'],
  symbol: ['符号', '床符号'],
  rotation: ['床の角度', '角度'],
};

/**
 * 床符号のキーマッピング
 * セクション名: '床符号'
 */
export const FLOOR_CODE_KEYS = {
  no: ['No', '番号'],
  type: ['タイプ', '種類'],
  code: ['床符号', '符号'],
};

/**
 * 床組形状のキーマッピング
 * セクション名: '床組形状'
 * 注意: 列数が多いため、sectionToObjectsを使用
 */
export const FLOOR_GROUP_SHAPE_KEYS = {
  id: ['No', 'ID', '形状ID'],
  direction: ['小梁の架け方', '方向'],
  subBeamCountX: ['小梁本数/X', 'X方向小梁本数', 'X本数', 'X'],
  subBeamCountY: ['Y', '小梁本数/Y', 'Y方向小梁本数', 'Y本数'],
  // shapeRefs: 1-10 のインデックスで動的にアクセス
  shapeRef1: ['床組形状1', '形状参照1'],
  shapeRef2: ['床組形状2', '形状参照2'],
  shapeRef3: ['床組形状3', '形状参照3'],
  shapeRef4: ['床組形状4', '形状参照4'],
  shapeRef5: ['床組形状5', '形状参照5'],
  shapeRef6: ['床組形状6', '形状参照6'],
  shapeRef7: ['床組形状7', '形状参照7'],
  shapeRef8: ['床組形状8', '形状参照8'],
  shapeRef9: ['床組形状9', '形状参照9'],
  shapeRef10: ['床組形状10', '形状参照10'],
  // スパンX: 1-10
  spanX1: ['スパンX1', 'X1'],
  spanX2: ['スパンX2', 'X2'],
  spanX3: ['スパンX3', 'X3'],
  spanX4: ['スパンX4', 'X4'],
  spanX5: ['スパンX5', 'X5'],
  spanX6: ['スパンX6', 'X6'],
  spanX7: ['スパンX7', 'X7'],
  spanX8: ['スパンX8', 'X8'],
  spanX9: ['スパンX9', 'X9'],
  spanX10: ['スパンX10', 'X10'],
  // スパンY: 1-10
  spanY1: ['スパンY1', 'Y1'],
  spanY2: ['スパンY2', 'Y2'],
  spanY3: ['スパンY3', 'Y3'],
  spanY4: ['スパンY4', 'Y4'],
  spanY5: ['スパンY5', 'Y5'],
  spanY6: ['スパンY6', 'Y6'],
  spanY7: ['スパンY7', 'Y7'],
  spanY8: ['スパンY8', 'Y8'],
  spanY9: ['スパンY9', 'Y9'],
  spanY10: ['スパンY10', 'Y10'],
  angle: ['床組角度', '角度'],
};

/**
 * 床組配置のキーマッピング
 * セクション名: '床組配置'
 */
export const FLOOR_GROUP_LAYOUT_KEYS = {
  story: ['層', '層名'],
  gridRange: ['面', 'グリッド範囲'],
  level: ['二重'],
  shapeId: ['形状', '床組形状No', '形状ID'],
  roofSurface: ['屋根面'],
  flipX: ['X反転', '反転X'],
  flipY: ['Y反転', '反転Y'],
  angle: ['床組角度', '角度'],
};

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 安全なキー取得ヘルパー
 * 複数の候補キーから最初に見つかった値を返す
 *
 * @param {Object} row - オブジェクト化された行データ
 * @param {string[]} keys - 候補キー配列
 * @param {*} [defaultValue=undefined] - キーが見つからない場合のデフォルト値
 * @returns {*} 値
 *
 * @example
 * const floor = getValue(row, COLUMN_PLACEMENT_KEYS.floor);
 * const symbol = getValue(row, ['符号', '柱符号'], 'unknown');
 */
export function getValue(row, keys, defaultValue = undefined) {
  if (!row || !keys) {
    return defaultValue;
  }

  for (const key of keys) {
    if (row[key] !== undefined) {
      return row[key];
    }
  }

  return defaultValue;
}

/**
 * 数値として安全にキー取得
 *
 * @param {Object} row - オブジェクト化された行データ
 * @param {string[]} keys - 候補キー配列
 * @param {number} [defaultValue=0] - キーが見つからない場合のデフォルト値
 * @returns {number} 数値
 */
export function getNumericValue(row, keys, defaultValue = 0) {
  const value = getValue(row, keys);
  if (value === undefined || value === '' || value === null) {
    return defaultValue;
  }
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * 整数として安全にキー取得
 *
 * @param {Object} row - オブジェクト化された行データ
 * @param {string[]} keys - 候補キー配列
 * @param {number} [defaultValue=0] - キーが見つからない場合のデフォルト値
 * @returns {number} 整数
 */
export function getIntValue(row, keys, defaultValue = 0) {
  const value = getValue(row, keys);
  if (value === undefined || value === '' || value === null) {
    return defaultValue;
  }
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * ブーリアンとして安全にキー取得
 *
 * @param {Object} row - オブジェクト化された行データ
 * @param {string[]} keys - 候補キー配列
 * @param {string[]} [trueValues=['YES', 'する', 'true', '1']] - trueとして扱う値
 * @returns {boolean} ブーリアン値
 */
export function getBoolValue(row, keys, trueValues = ['YES', 'する', 'true', '1']) {
  const value = getValue(row, keys, '');
  if (typeof value === 'boolean') {
    return value;
  }
  return trueValues.includes(String(value).toUpperCase());
}

/**
 * キーの存在チェック
 *
 * @param {Object} row - オブジェクト化された行データ
 * @param {string[]} keys - 候補キー配列
 * @returns {boolean} いずれかのキーが存在するか
 */
export function hasKey(row, keys) {
  if (!row || !keys) {
    return false;
  }

  for (const key of keys) {
    if (row[key] !== undefined) {
      return true;
    }
  }

  return false;
}

/**
 * 実際に使用されているキー名を取得
 *
 * @param {Object} row - オブジェクト化された行データ
 * @param {string[]} keys - 候補キー配列
 * @returns {string|null} 見つかったキー名、見つからない場合はnull
 */
export function getActualKey(row, keys) {
  if (!row || !keys) {
    return null;
  }

  for (const key of keys) {
    if (row[key] !== undefined) {
      return key;
    }
  }

  return null;
}
