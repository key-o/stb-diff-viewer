/**
 * @fileoverview UIイベント処理モジュール
 *
 * このモジュールはUIイベントリスナーと相互作用を管理します：
 * - イベントリスナー設定と管理
 * - UI相互作用処理
 * - イベント委譲と調整
 * - モデル可視性切り替え処理
 *
 * より良い整理のため、大きなui.jsモジュールから分割されました。
 */

import { updateLabelVisibility } from './unifiedLabelManager.js';
import {
  applyStoryClip,
  applyAxisClip,
  updateClippingRange,
  clearAllClippingPlanes
} from './clipping.js';
import { setState, getState } from '../core/globalState.js';
import displayModeManager from '../viewer/rendering/displayModeManager.js';
import labelDisplayManager from '../viewer/rendering/labelDisplayManager.js';
import { REDRAW_REQUIRED_ELEMENT_TYPES } from '../config/uiElementConfig.js';
import {
  extractProfileFromSection,
  getSectionHeight,
  mapToCalculatorParams
} from '../common/profileExtractor.js';
import {
  calculateHShapeProfile,
  calculateBoxProfile,
  calculatePipeProfile,
  calculateRectangleProfile,
  calculateLShapeProfile,
  calculateChannelProfile,
  calculateTShapeProfile
} from '../viewer/geometry/core/ProfileCalculator.js';
import { drawAxes, elementGroups } from '../viewer/index.js';
import { getModelData } from '../modelLoader.js';
import { getCameraMode, CAMERA_MODES } from '../viewer/camera/cameraManager.js';

// --- UI Element References ---
const toggleModelACheckbox = document.getElementById('toggleModelA');
const toggleModelBCheckbox = document.getElementById('toggleModelB');
const legendPanel = document.getElementById('legendPanel');

// --- 重要度関連イベント定数 ---
export const IMPORTANCE_EVENTS = {
  RATING_CHANGED: 'importance:ratingChanged',
  MODE_SWITCHED: 'importance:modeSwitched',
  FILTER_UPDATED: 'importance:filterUpdated',
  SETTINGS_LOADED: 'importance:settingsLoaded',
  EVALUATION_COMPLETE: 'importance:evaluationComplete',
  EVALUATION_STARTED: 'importance:evaluationStarted',
  LEVEL_CHANGED: 'importance:levelChanged'
};

// --- 比較キー関連イベント定数 ---
export const COMPARISON_KEY_EVENTS = {
  KEY_TYPE_CHANGED: 'comparisonKey:typeChanged'
};

/**
 * Setup all UI event listeners
 */
export function setupUIEventListeners() {
  try {
    setupModelVisibilityListeners();
    setupSelectorChangeListeners();
    setupLabelToggleListeners(); // ラベル表示切替イベントリスナーを追加
    setupLabelContentListener();
    setupLegendToggleListener();
    setupIfcExportListener(); // IFC出力ボタンリスナーを追加
    setupAccordionListeners();
    setupClippingRangeListeners();
    setupClippingButtonListeners();
    setupKeyboardShortcuts();
    setupWindowResizeListener();
  } catch (error) {
    console.error('UIイベントリスナーの設定中にエラーが発生しました:', error);
  }
}

/**
 * Setup model visibility toggle listeners
 */
function setupModelVisibilityListeners() {
  if (toggleModelACheckbox) {
    toggleModelACheckbox.addEventListener('change', handleModelAToggle);
  }

  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.addEventListener('change', handleModelBToggle);
  }
}

/**
 * Setup selector change listeners
 */
function setupSelectorChangeListeners() {
  const storySelector = document.getElementById('storySelector');
  const xAxisSelector = document.getElementById('xAxisSelector');
  const yAxisSelector = document.getElementById('yAxisSelector');

  if (storySelector) {
    storySelector.addEventListener('change', handleStorySelectionChange);
  }

  if (xAxisSelector) {
    xAxisSelector.addEventListener('change', handleXAxisSelectionChange);
  }

  if (yAxisSelector) {
    yAxisSelector.addEventListener('change', handleYAxisSelectionChange);
  }
}

/**
 * Setup label toggle checkbox listeners to update label visibility
 */
function setupLabelToggleListeners() {
  const labelToggles = document.querySelectorAll('input[name="labelToggle"]');
  labelToggles.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const elementType = checkbox.value;

      // labelDisplayManagerと同期
      labelDisplayManager.setLabelVisibility(elementType, checkbox.checked);

      // 立体表示モードの場合は再描画が必要
      const needsRedraw = checkIfRedrawNeeded(elementType);

      if (needsRedraw) {
        // 立体表示モードの再描画を実行
        triggerViewModeRedraw(elementType);
      } else {
        // 通常のラベル表示更新
        updateLabelVisibility();
        // Request render if available
        if (typeof window.requestRender === 'function') {
          window.requestRender();
        }
      }
    });
  });
}

/**
 * Check if redraw is needed for solid view modes
 * 設定ファイルの REDRAW_REQUIRED_ELEMENT_TYPES を使用
 * @param {string} elementType - Element type
 * @returns {boolean} Whether redraw is needed
 */
function checkIfRedrawNeeded(elementType) {
  return REDRAW_REQUIRED_ELEMENT_TYPES.has(elementType);
}

/**
 * 要素タイプと再描画関数名のマッピング
 * @type {Object.<string, string>}
 */
const ELEMENT_REDRAW_FUNCTION_MAP = {
  Column: 'redrawColumnsForViewMode',
  Post: 'redrawPostsForViewMode',
  Girder: 'redrawBeamsForViewMode',
  Beam: 'redrawBeamsForViewMode',
  Brace: 'redrawBracesForViewMode',
  Pile: 'redrawPilesForViewMode',
  Footing: 'redrawFootingsForViewMode',
  FoundationColumn: 'redrawFoundationColumnsForViewMode'
};

/**
 * Trigger view mode redraw for specific element types
 * @param {string} elementType - Element type
 */
function triggerViewModeRedraw(elementType) {
  const functionName = ELEMENT_REDRAW_FUNCTION_MAP[elementType];
  if (!functionName) {
    // 未サポートの要素タイプは通常のラベル更新
    updateLabelVisibility();
    if (typeof window.requestRender === 'function') {
      window.requestRender();
    }
    return;
  }

  // Import redraw functions dynamically to avoid circular dependencies
  import('../viewModes.js')
    .then((viewModes) => {
      const scheduleRender = window.requestRender || (() => {});
      const redrawFn = viewModes[functionName];
      if (redrawFn) {
        redrawFn(scheduleRender);
      }
    })
    .catch((error) => {
      console.error('Failed to import view mode functions:', error);
      // Fallback to normal label update
      updateLabelVisibility();
      if (typeof window.requestRender === 'function') {
        window.requestRender();
      }
    });
}

/**
 * Setup legend toggle listener
 */
function setupLegendToggleListener() {
  const toggleLegendBtn = document.getElementById('toggleLegendBtn');

  if (toggleLegendBtn) {
    toggleLegendBtn.addEventListener('click', handleLegendToggle);
  }
}

/**
 * Setup IFC export button listener
 */
function setupIfcExportListener() {
  const exportIfcBtn = document.getElementById('exportIfcBtn');

  if (exportIfcBtn) {
    exportIfcBtn.addEventListener('click', handleIfcExport);
  }
}

/**
 * Handle IFC export button click
 */
async function handleIfcExport() {
  const exportIfcBtn = document.getElementById('exportIfcBtn');

  try {
    // ボタンを無効化して処理中表示
    if (exportIfcBtn) {
      exportIfcBtn.disabled = true;
      exportIfcBtn.textContent = '📦 変換中...';
    }

    // IFCSTBExporterを動的インポート（統合エクスポーター）
    const { IFCSTBExporter } = await import('../export/ifc/IFCSTBExporter.js');

    // 各要素データを並行して取得
    const [beamData, columnData, braceData, slabData, wallData] = await Promise.all([
      collectBeamDataForExport(),
      collectColumnDataForExport(),
      collectBraceDataForExport(),
      collectSlabDataForExport(),
      collectWallDataForExport()
    ]);

    const totalElements = beamData.length + columnData.length + braceData.length + slabData.length + wallData.length;

    if (totalElements === 0) {
      alert('エクスポートする構造要素がありません。\nモデルを読み込んでください。');
      return;
    }

    // globalStateから階データを取得
    const { getState } = await import('../core/globalState.js');
    const stories = getState('models.stories') || [];

    // エクスポーター作成
    const exporter = new IFCSTBExporter();

    // 階データを設定
    if (stories.length > 0) {
      exporter.setStories(stories);
      console.log(`[IFC Export] ${stories.length}階のデータを設定`);
    }

    // 梁を追加（マルチセクション梁とシングルセクション梁を区別）
    for (const beam of beamData) {
      if (beam.isMultiSection && beam.sections && beam.sections.length >= 2) {
        // マルチセクション梁はaddTaperedBeamを使用
        exporter.addTaperedBeam(beam);
      } else {
        exporter.addBeam(beam);
      }
    }

    // 柱を追加
    for (const column of columnData) {
      exporter.addColumn(column);
    }

    // ブレースを追加
    for (const brace of braceData) {
      exporter.addBrace(brace);
    }

    // 床を追加
    for (const slab of slabData) {
      exporter.addSlab(slab);
    }

    // 壁を追加
    for (const wall of wallData) {
      exporter.addWall(wall);
    }

    // 出力ファイル名を決定（入力STBファイル名の拡張子を.ifcに変更）
    const originalFileA = getState('files.originalFileA');
    const originalFileB = getState('files.originalFileB');
    const originalFile = originalFileA || originalFileB;

    let fileName;
    if (originalFile && originalFile.name) {
      // 入力ファイル名の拡張子を.ifcに置換
      fileName = originalFile.name.replace(/\.stb$/i, '.ifc');
      // 拡張子がなかった場合は.ifcを追加
      if (!fileName.endsWith('.ifc')) {
        fileName = fileName + '.ifc';
      }
    } else {
      // フォールバック: タイムスタンプ付きのデフォルト名
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      fileName = `stb_export_${timestamp}.ifc`;
    }

    // ダウンロード
    exporter.download({ fileName });

    console.log(`✅ IFC出力完了: 梁${beamData.length}本, 柱${columnData.length}本, ブレース${braceData.length}本, 床${slabData.length}枚, 壁${wallData.length}枚をエクスポートしました`);

  } catch (error) {
    console.error('IFC出力エラー:', error);
    alert(`IFC出力に失敗しました:\n${error.message}`);
  } finally {
    // ボタンを復元
    if (exportIfcBtn) {
      exportIfcBtn.disabled = false;
      exportIfcBtn.textContent = '📦 IFCファイルに変換';
    }
  }
}

/**
 * globalStateからパース済み構造データを取得、なければXMLから抽出
 * @returns {Promise<Object>} 構造データ {nodeMap, steelSections, elementData, sectionMaps}
 */
async function getOrParseStructureData() {
  const { getState } = await import('../core/globalState.js');

  // globalStateからパース済みデータを確認
  const cachedNodeMap = getState('models.nodeMapRawA') || getState('models.nodeMapRawB');
  const cachedSteelSections = getState('models.steelSections');
  const cachedElementData = getState('models.elementData');
  const cachedSectionMaps = getState('models.sectionMaps');

  // パース済みデータが利用可能か確認
  const hasCachedData = cachedNodeMap && cachedNodeMap.size > 0 &&
                        cachedSteelSections &&
                        cachedElementData &&
                        cachedSectionMaps;

  if (hasCachedData) {
    console.log('[IFC Export] Using cached parsed data from globalState');
    return {
      nodeMap: cachedNodeMap,
      steelSections: cachedSteelSections,
      elementData: cachedElementData,
      sectionMaps: cachedSectionMaps
    };
  }

  // フォールバック: XMLから抽出
  console.log('[IFC Export] Parsing XML document (no cached data)');
  const modelADocument = getState('models.documentA');
  const modelBDocument = getState('models.documentB');
  const xmlDoc = modelADocument || modelBDocument;

  if (!xmlDoc) {
    console.warn('XMLドキュメントが見つかりません');
    return null;
  }

  // パーサーをインポート
  const {
    buildNodeMap,
    extractGirderElements,
    extractBeamElements,
    extractColumnElements,
    extractPostElements,
    extractBraceElements,
    extractSlabElements,
    extractWallElements,
    extractSteelSections,
    extractOpeningElements
  } = await import('../parser/stbXmlParser.js');

  const { extractAllSections } = await import('../parser/sectionExtractor.js');

  // データを抽出
  const nodeMap = buildNodeMap(xmlDoc);
  const steelSections = extractSteelSections(xmlDoc);
  const allSections = extractAllSections(xmlDoc);
  const openingElements = extractOpeningElements(xmlDoc);

  return {
    nodeMap,
    steelSections,
    elementData: {
      girderElements: extractGirderElements(xmlDoc),
      beamElements: extractBeamElements(xmlDoc),
      columnElements: extractColumnElements(xmlDoc),
      postElements: extractPostElements(xmlDoc),
      braceElements: extractBraceElements(xmlDoc),
      slabElements: extractSlabElements(xmlDoc),
      wallElements: extractWallElements(xmlDoc),
      openingElements: openingElements
    },
    sectionMaps: {
      girderSections: allSections.girderSections || new Map(),
      beamSections: allSections.beamSections || new Map(),
      columnSections: allSections.columnSections || new Map(),
      postSections: allSections.postSections || new Map(),
      braceSections: allSections.braceSections || new Map(),
      slabSections: allSections.slabSections || new Map(),
      wallSections: allSections.wallSections || new Map()
    }
  };
}

/**
 * 現在のモデルから梁データを収集
 * @returns {Promise<Array>} IFCBeamExporter用の梁データ配列
 */
async function collectBeamDataForExport() {
  const beamData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return beamData;

  const { nodeMap, steelSections, elementData, sectionMaps } = structureData;
  const girderElements = elementData.girderElements || [];
  const beamElements = elementData.beamElements || [];
  const girderSections = sectionMaps.girderSections || new Map();
  const beamSections = sectionMaps.beamSections || new Map();

  console.log(`IFC出力: 大梁${girderElements.length}本, 小梁${beamElements.length}本を検出`);

  // 大梁を処理
  for (const girder of girderElements) {
    const beam = convertElementToBeamData(girder, nodeMap, girderSections, steelSections, 'Girder');
    if (beam) beamData.push(beam);
  }

  // 小梁を処理
  for (const beam of beamElements) {
    const beamEntry = convertElementToBeamData(beam, nodeMap, beamSections, steelSections, 'Beam');
    if (beamEntry) beamData.push(beamEntry);
  }

  return beamData;
}

/**
 * STB要素をIFCBeamExporter用のデータに変換
 * 天端基準配置をサポート（水平梁・傾斜梁両方に対応）
 * マルチセクション（ハンチ）梁にも対応
 */
function convertElementToBeamData(element, nodeMap, sectionMap, steelSections, elementType) {
  try {
    const startNode = nodeMap.get(element.id_node_start);
    const endNode = nodeMap.get(element.id_node_end);

    if (!startNode || !endNode) {
      console.warn(`ノードが見つかりません: ${element.id}`);
      return null;
    }

    // 断面情報を取得
    const section = sectionMap.get(element.id_section);
    const profile = extractProfileFromSection(section, steelSections);

    // 断面高さを取得（天端基準調整用）
    const sectionHeight = getSectionHeight(profile);

    // 回転角度を取得
    const rotation = element.rotate || element.angle || 0;

    // オフセット情報を取得（STBの梁はXYZ方向のオフセットを持つ）
    const offsetStartX = element.offset_start_X || 0;
    const offsetStartY = element.offset_start_Y || 0;
    const offsetStartZ = element.offset_start_Z || 0;
    const offsetEndX = element.offset_end_X || 0;
    const offsetEndY = element.offset_end_Y || 0;
    const offsetEndZ = element.offset_end_Z || 0;

    // 基本データ
    const beamData = {
      name: element.name || element.id || `${elementType}-${element.id}`,
      startPoint: {
        x: startNode.x + offsetStartX,
        y: startNode.y + offsetStartY,
        z: startNode.z + offsetStartZ
      },
      endPoint: {
        x: endNode.x + offsetEndX,
        y: endNode.y + offsetEndY,
        z: endNode.z + offsetEndZ
      },
      profile,
      rotation,
      placementMode: 'top-aligned',
      sectionHeight
    };

    // マルチセクション（ハンチ）梁の検出
    // sectionにmode='double'または'multi'が設定されている場合
    if (section && (section.mode === 'double' || section.mode === 'multi') && section.shapes) {
      const multiSectionData = convertToMultiSectionData(section, steelSections, element);
      if (multiSectionData) {
        beamData.isMultiSection = true;
        beamData.sections = multiSectionData.sections;
      }
    }

    return beamData;
  } catch (error) {
    console.warn(`要素変換エラー (${element.id}):`, error);
    return null;
  }
}

/**
 * プロファイルタイプから頂点計算関数を取得
 * @param {string} profileType - プロファイルタイプ (H, BOX, PIPE等)
 * @returns {Function|null} 頂点計算関数
 */
function getProfileCalculator(profileType) {
  const type = (profileType || '').toUpperCase();
  switch (type) {
    case 'H':
    case 'I':
      return calculateHShapeProfile;
    case 'BOX':
    case 'CFT':
      return calculateBoxProfile;
    case 'PIPE':
      return calculatePipeProfile;
    case 'L':
      return calculateLShapeProfile;
    case 'C':
    case 'U':
      return calculateChannelProfile;
    case 'T':
      return calculateTShapeProfile;
    case 'RECTANGLE':
    case 'RC':
    case 'stb-diff-viewer':
    default:
      return calculateRectangleProfile;
  }
}

/**
 * プロファイルから断面頂点を計算
 * @param {Object} profile - プロファイル情報 {type, params}
 * @returns {Array<{x: number, y: number}>} 断面頂点配列
 */
function calculateProfileVertices(profile) {
  if (!profile) return null;

  const calculator = getProfileCalculator(profile.type);
  if (!calculator) return null;

  const params = mapToCalculatorParams(profile);
  const result = calculator(params);

  return result?.vertices || null;
}

/**
 * マルチセクション断面情報をIFC出力用の形式に変換
 * @param {Object} section - 断面情報 (mode, shapes配列を含む)
 * @param {Map} steelSections - 鋼材断面マップ
 * @param {Object} element - 梁要素 (haunch_start, haunch_end を含む可能性)
 * @returns {Object|null} マルチセクションデータ {sections: [{pos, vertices}]}
 */
function convertToMultiSectionData(section, steelSections, element) {
  try {
    const shapes = section.shapes;
    if (!shapes || shapes.length < 2) return null;

    // 梁長さを計算する必要がある（既にstartPoint/endPointから計算可能）
    // ここでは相対位置(0-1)を使用

    const sections = [];

    for (const shape of shapes) {
      // 位置を0-1の相対値に変換
      const pos = convertPositionToRatio(shape.pos, shapes, element);

      // 形状名から断面寸法を取得
      let profile = null;
      if (shape.shapeName && steelSections) {
        const steelShape = steelSections.get(shape.shapeName);
        if (steelShape) {
          profile = extractProfileFromSection({
            dimensions: steelShape,
            shapeName: shape.shapeName
          }, steelSections);
        }
      }

      // 形状がvariantに含まれている場合
      if (!profile && shape.variant?.shape && steelSections) {
        const steelShape = steelSections.get(shape.variant.shape);
        if (steelShape) {
          profile = extractProfileFromSection({
            dimensions: steelShape,
            shapeName: shape.variant.shape
          }, steelSections);
        }
      }

      if (!profile) {
        console.warn(`[IFC Export] マルチセクション断面の形状が見つかりません: ${shape.shapeName || shape.variant?.shape}`);
        continue;
      }

      // プロファイルから頂点を計算
      const vertices = calculateProfileVertices(profile);
      if (!vertices || vertices.length < 3) {
        console.warn(`[IFC Export] マルチセクション断面の頂点計算に失敗: ${shape.shapeName}`);
        continue;
      }

      sections.push({ pos, vertices });
    }

    // 位置でソート
    sections.sort((a, b) => a.pos - b.pos);

    if (sections.length < 2) return null;

    return { sections };
  } catch (error) {
    console.warn('[IFC Export] マルチセクションデータ変換エラー:', error);
    return null;
  }
}

/**
 * 位置指定文字列を0-1の相対位置に変換
 * @param {string} pos - 位置指定 (START, CENTER, END, HAUNCH_S, HAUNCH_E等)
 * @param {Array} allShapes - 全形状配列
 * @param {Object} element - 梁要素
 * @returns {number} 相対位置 (0-1)
 */
function convertPositionToRatio(pos, allShapes, element) {
  const posUpper = (pos || 'CENTER').toUpperCase();

  // ハンチ長さ（要素にある場合）
  // haunch_start/haunch_end は絶対距離(mm)なので相対値に変換が必要
  // ここでは簡易的に0.15 (15%)をデフォルトハンチ長さとする
  const defaultHaunchRatio = 0.15;

  switch (posUpper) {
    case 'START':
    case 'TOP':
      return 0;
    case 'HAUNCH_S':
      return defaultHaunchRatio;
    case 'CENTER':
      // 2断面(START/CENTER)の場合、CENTERはハンチ終了位置
      // 3断面以上の場合、CENTERは中央
      const hasStart = allShapes.some(s => (s.pos || '').toUpperCase() === 'START');
      const hasEnd = allShapes.some(s => (s.pos || '').toUpperCase() === 'END');
      if (hasStart && !hasEnd) {
        return defaultHaunchRatio;
      } else if (!hasStart && hasEnd) {
        return 1 - defaultHaunchRatio;
      }
      return 0.5;
    case 'HAUNCH_E':
      return 1 - defaultHaunchRatio;
    case 'END':
    case 'BOTTOM':
      return 1;
    default:
      // 数値の場合はそのまま使用
      const numValue = parseFloat(pos);
      if (!isNaN(numValue)) {
        return numValue <= 1 ? numValue : numValue / 100; // パーセンテージか相対値か
      }
      return 0.5;
  }
}

// extractProfileFromSection, getSectionHeight は ../common/profileExtractor.js からインポート

/**
 * 現在のモデルから柱データを収集
 * @returns {Promise<Array>} IFCBeamExporter用の柱データ配列
 */
async function collectColumnDataForExport() {
  const columnData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return columnData;

  const { nodeMap, steelSections, elementData, sectionMaps } = structureData;
  const columnElements = elementData.columnElements || [];
  const postElements = elementData.postElements || [];
  const columnSections = sectionMaps.columnSections || new Map();
  const postSections = sectionMaps.postSections || new Map();

  console.log(`IFC出力: 柱${columnElements.length}本, 間柱${postElements.length}本を検出`);

  // 柱を処理
  for (const column of columnElements) {
    const col = convertColumnToExportData(column, nodeMap, columnSections, steelSections, 'Column');
    if (col) columnData.push(col);
  }

  // 間柱を処理
  for (const post of postElements) {
    const col = convertColumnToExportData(post, nodeMap, postSections, steelSections, 'Post');
    if (col) columnData.push(col);
  }

  return columnData;
}

/**
 * 柱要素をエクスポート用データに変換
 * @param {Object} element - 柱要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @param {Map} steelSections - 鋼材断面マップ
 * @param {string} elementType - 要素タイプ
 * @returns {Object|null} エクスポート用データ
 */
function convertColumnToExportData(element, nodeMap, sectionMap, steelSections, elementType) {
  try {
    const bottomNode = nodeMap.get(element.id_node_bottom);
    const topNode = nodeMap.get(element.id_node_top);

    if (!bottomNode || !topNode) {
      console.warn(`ノードが見つかりません: ${element.id}`);
      return null;
    }

    // 断面情報を取得
    const section = sectionMap.get(element.id_section);
    const profile = extractProfileFromSection(section, steelSections);

    // 回転角度を取得
    const rotation = element.rotate || element.angle || 0;

    // isReferenceDirectionを取得（断面データから）
    // デフォルトはtrue（STB仕様: 未指定時はtrue）
    const isReferenceDirection = section?.isReferenceDirection !== false;

    // オフセット情報を取得（STBの柱はXY方向のオフセットを持つ）
    const offsetBottomX = element.offset_bottom_X || 0;
    const offsetBottomY = element.offset_bottom_Y || 0;
    const offsetTopX = element.offset_top_X || 0;
    const offsetTopY = element.offset_top_Y || 0;

    return {
      name: element.name || element.id || `${elementType}-${element.id}`,
      bottomPoint: {
        x: bottomNode.x + offsetBottomX,
        y: bottomNode.y + offsetBottomY,
        z: bottomNode.z
      },
      topPoint: {
        x: topNode.x + offsetTopX,
        y: topNode.y + offsetTopY,
        z: topNode.z
      },
      profile,
      rotation,
      isReferenceDirection
    };
  } catch (error) {
    console.warn(`柱変換エラー (${element.id}):`, error);
    return null;
  }
}

/**
 * 現在のモデルからブレースデータを収集
 * @returns {Promise<Array>} IFCBeamExporter用のブレースデータ配列
 */
async function collectBraceDataForExport() {
  const braceData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return braceData;

  const { nodeMap, steelSections, elementData, sectionMaps } = structureData;
  const braceElements = elementData.braceElements || [];
  const braceSections = sectionMaps.braceSections || new Map();

  console.log(`IFC出力: ブレース${braceElements.length}本を検出`);

  // ブレースを処理
  for (const brace of braceElements) {
    const br = convertBraceToExportData(brace, nodeMap, braceSections, steelSections);
    if (br) braceData.push(br);
  }

  return braceData;
}

/**
 * ブレース要素をエクスポート用データに変換
 * @param {Object} element - ブレース要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @param {Map} steelSections - 鋼材断面マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertBraceToExportData(element, nodeMap, sectionMap, steelSections) {
  try {
    const startNode = nodeMap.get(element.id_node_start);
    const endNode = nodeMap.get(element.id_node_end);

    if (!startNode || !endNode) {
      console.warn(`ノードが見つかりません: ${element.id}`);
      return null;
    }

    // 断面情報を取得
    const section = sectionMap.get(element.id_section);
    const profile = extractProfileFromSection(section, steelSections);

    // 回転角度を取得
    const rotation = element.rotate || element.angle || 0;

    return {
      name: element.name || element.id || `Brace-${element.id}`,
      startPoint: { x: startNode.x, y: startNode.y, z: startNode.z },
      endPoint: { x: endNode.x, y: endNode.y, z: endNode.z },
      profile,
      rotation
    };
  } catch (error) {
    console.warn(`ブレース変換エラー (${element.id}):`, error);
    return null;
  }
}

/**
 * 現在のモデルから床データを収集
 * @returns {Promise<Array>} IFCSTBExporter用の床データ配列
 */
async function collectSlabDataForExport() {
  const slabData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return slabData;

  const { nodeMap, elementData, sectionMaps } = structureData;
  const slabElements = elementData.slabElements || [];
  const slabSections = sectionMaps.slabSections || new Map();

  console.log(`IFC出力: 床${slabElements.length}枚を検出`);

  for (const slab of slabElements) {
    const slabEntry = convertSlabToExportData(slab, nodeMap, slabSections);
    if (slabEntry) slabData.push(slabEntry);
  }

  return slabData;
}

/**
 * 床要素をエクスポート用データに変換
 * @param {Object} element - 床要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertSlabToExportData(element, nodeMap, sectionMap) {
  try {
    const nodeIds = element.node_ids;
    if (!nodeIds || nodeIds.length < 3) {
      console.warn(`床 ${element.id}: ノードが3点未満`);
      return null;
    }

    // 頂点座標を取得（オフセット適用）
    const vertices = [];
    const offsets = element.offsets || new Map();

    for (const nodeId of nodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        console.warn(`床 ${element.id}: ノード ${nodeId} が見つかりません`);
        return null;
      }

      const offset = offsets.get ? offsets.get(nodeId) : offsets[nodeId];
      const offsetX = offset?.offset_X || 0;
      const offsetY = offset?.offset_Y || 0;
      const offsetZ = offset?.offset_Z || 0;

      vertices.push({
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: node.z + offsetZ
      });
    }

    // 断面データから厚さを取得
    let thickness = 150;
    if (sectionMap) {
      const sectionData = sectionMap.get(element.id_section);
      if (sectionData) {
        thickness = sectionData.depth ||
                    sectionData.dimensions?.depth ||
                    sectionData.t ||
                    sectionData.thickness ||
                    150;
      }
    }

    // 床タイプを決定
    let predefinedType = 'FLOOR';
    if (element.isFoundation) {
      predefinedType = 'BASESLAB';
    } else if (element.kind_slab === 'ROOF') {
      predefinedType = 'ROOF';
    }

    return {
      name: element.name || `Slab_${element.id}`,
      vertices,
      thickness,
      predefinedType
    };
  } catch (error) {
    console.warn(`床変換エラー (${element.id}):`, error);
    return null;
  }
}

/**
 * 現在のモデルから壁データを収集
 * @returns {Promise<Array>} IFCSTBExporter用の壁データ配列
 */
async function collectWallDataForExport() {
  const wallData = [];

  const structureData = await getOrParseStructureData();
  if (!structureData) return wallData;

  const { nodeMap, elementData, sectionMaps } = structureData;
  const wallElements = elementData.wallElements || [];
  const wallSections = sectionMaps.wallSections || new Map();
  const openingElements = elementData.openingElements || new Map();

  console.log(`IFC出力: 壁${wallElements.length}枚を検出、開口${openingElements.size}個`);

  for (const wall of wallElements) {
    const wallEntry = convertWallToExportData(wall, nodeMap, wallSections, openingElements);
    if (wallEntry) wallData.push(wallEntry);
  }

  return wallData;
}

/**
 * 壁要素をエクスポート用データに変換
 * @param {Object} element - 壁要素
 * @param {Map} nodeMap - ノードマップ
 * @param {Map} sectionMap - 断面マップ
 * @param {Map} openingElements - 開口情報マップ
 * @returns {Object|null} エクスポート用データ
 */
function convertWallToExportData(element, nodeMap, sectionMap, openingElements = new Map()) {
  try {
    const nodeIds = element.node_ids;
    if (!nodeIds || nodeIds.length < 4) {
      console.warn(`壁 ${element.id}: ノードが4点未満`);
      return null;
    }

    // 頂点座標を取得（オフセット適用）
    const vertices = [];
    const offsets = element.offsets || new Map();

    for (const nodeId of nodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        console.warn(`壁 ${element.id}: ノード ${nodeId} が見つかりません`);
        return null;
      }

      const offset = offsets.get ? offsets.get(nodeId) : offsets[nodeId];
      const offsetX = offset?.offset_X || 0;
      const offsetY = offset?.offset_Y || 0;
      const offsetZ = offset?.offset_Z || 0;

      vertices.push({
        x: node.x + offsetX,
        y: node.y + offsetY,
        z: node.z + offsetZ
      });
    }

    // 4点から壁の始点・終点・高さを計算
    const p0 = vertices[0];
    const p1 = vertices[1];
    const p2 = vertices[2];
    const p3 = vertices[3];

    const bottomZ = Math.min(p0.z, p1.z);
    const topZ = Math.max(p2.z, p3.z);
    const height = topZ - bottomZ;

    if (height <= 0) {
      console.warn(`壁 ${element.id}: 高さが0以下`);
      return null;
    }

    const startPoint = { x: p0.x, y: p0.y, z: bottomZ };
    const endPoint = { x: p1.x, y: p1.y, z: bottomZ };

    // 断面データから厚さを取得
    let thickness = 200;
    if (sectionMap) {
      const sectionData = sectionMap.get(element.id_section);
      if (sectionData) {
        thickness = sectionData.t ||
                    sectionData.thickness ||
                    sectionData.dimensions?.t ||
                    sectionData.dimensions?.thickness ||
                    200;
      }
    }

    // 壁タイプを決定
    let predefinedType = 'STANDARD';
    if (element.kind_wall === 'WALL_SHEAR') {
      predefinedType = 'SHEAR';
    } else if (element.kind_wall === 'WALL_PARTITION') {
      predefinedType = 'PARTITIONING';
    }

    // 開口情報を収集
    const openings = [];
    if (element.open_ids && element.open_ids.length > 0 && openingElements.size > 0) {
      for (const openId of element.open_ids) {
        const opening = openingElements.get(openId);
        if (opening) {
          openings.push({
            id: opening.id,
            name: opening.name,
            positionX: opening.position_X,
            positionY: opening.position_Y,
            width: opening.length_X,
            height: opening.length_Y,
            rotate: opening.rotate
          });
        }
      }
    }

    return {
      name: element.name || `Wall_${element.id}`,
      startPoint,
      endPoint,
      height,
      thickness,
      predefinedType,
      openings
    };
  } catch (error) {
    console.warn(`壁変換エラー (${element.id}):`, error);
    return null;
  }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

/**
 * Setup window resize listener for responsive UI
 */
function setupWindowResizeListener() {
  window.addEventListener('resize', handleWindowResize);
}

// --- Event Handlers ---

/**
 * Handle Model A visibility toggle
 * @param {Event} event - Change event
 */
function handleModelAToggle(event) {
  const isVisible = event.target.checked;

  // Trigger model visibility update through view modes
  if (typeof window.setModelVisibility === 'function') {
    window.setModelVisibility('A', isVisible, window.requestRender);
  } else {
    console.warn('setModelVisibility function not available');
  }
}

/**
 * Handle Model B visibility toggle
 * @param {Event} event - Change event
 */
function handleModelBToggle(event) {
  const isVisible = event.target.checked;

  // Trigger model visibility update through view modes
  if (typeof window.setModelVisibility === 'function') {
    window.setModelVisibility('B', isVisible, window.requestRender);
  } else {
    console.warn('setModelVisibility function not available');
  }
}

/**
 * Handle story selection change
 * @param {Event} event - Change event
 */
function handleStorySelectionChange(event) {
  const selectedStoryId = event.target.value;

  // Apply story clipping if not "all"
  if (selectedStoryId !== 'all') {
    applyStoryClip(selectedStoryId);
  }

  // Redraw axes at the selected story level
  redrawAxesAtStory(selectedStoryId);

  // Update label visibility
  updateLabelVisibility();

  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * Redraw axes at the specified story level
 * @param {string} targetStoryId - Target story ID ('all' for lowest story)
 */
export function redrawAxesAtStory(targetStoryId) {
  try {
    const modelData = getModelData();
    const { stories, axesData, modelBounds } = modelData;

    if (!axesData || (!axesData.xAxes.length && !axesData.yAxes.length)) {
      return;
    }

    const axisGroup = elementGroups['Axis'];
    if (!axisGroup) {
      console.warn('Axis group not found');
      return;
    }

    // Get label toggle state from the checkbox
    const axisCheckbox = document.getElementById('toggleAxisView');
    const labelToggle = axisCheckbox ? axisCheckbox.checked : true;

    // Get current camera mode to determine axis extension
    const currentCameraMode = getCameraMode();
    const is2DMode = currentCameraMode === CAMERA_MODES.ORTHOGRAPHIC;

    // Redraw axes at the target story
    drawAxes(
      axesData,
      stories,
      axisGroup,
      modelBounds,
      labelToggle,
      null,
      {
        targetStoryId: targetStoryId === 'all' ? null : targetStoryId,
        is2DMode
      }
    );
  } catch (error) {
    console.error('Error redrawing axes at story:', error);
  }
}

/**
 * Handle X-axis selection change
 * @param {Event} event - Change event
 */
function handleXAxisSelectionChange(event) {
  const selectedAxisId = event.target.value;

  // Apply axis clipping if not "all"
  if (selectedAxisId !== 'all') {
    applyAxisClip('X', selectedAxisId);
  }

  // Update label visibility
  updateLabelVisibility();

  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * Handle Y-axis selection change
 * @param {Event} event - Change event
 */
function handleYAxisSelectionChange(event) {
  const selectedAxisId = event.target.value;

  // Apply axis clipping if not "all"
  if (selectedAxisId !== 'all') {
    applyAxisClip('Y', selectedAxisId);
  }

  // Update label visibility
  updateLabelVisibility();

  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * Handle legend toggle
 * @param {Event} event - Click event
 */
function handleLegendToggle(event) {
  event.preventDefault();
  toggleLegend();
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyboardShortcuts(event) {
  // Only handle shortcuts when not typing in inputs
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return;
  }

  switch (event.key.toLowerCase()) {
    case 'l':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleLegend();
      }
      break;

    case '1':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleModelAVisibility();
      }
      break;

    case '2':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleModelBVisibility();
      }
      break;

    case 'r':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        resetAllSelectors();
      }
      break;
  }
}

/**
 * Handle window resize
 * @param {Event} event - Resize event
 */
function handleWindowResize(event) {
  // Debounce resize handling
  clearTimeout(window.resizeTimeout);
  window.resizeTimeout = setTimeout(() => {
    console.log('Window resized, updating UI layout');
    // Could trigger layout updates here if needed
  }, 250);
}

// --- Helper Functions ---

/**
 * Toggle Model A visibility programmatically
 */
export function toggleModelAVisibility() {
  if (toggleModelACheckbox) {
    toggleModelACheckbox.checked = !toggleModelACheckbox.checked;
    toggleModelACheckbox.dispatchEvent(new Event('change'));
  }
}

/**
 * Toggle Model B visibility programmatically
 */
export function toggleModelBVisibility() {
  if (toggleModelBCheckbox) {
    toggleModelBCheckbox.checked = !toggleModelBCheckbox.checked;
    toggleModelBCheckbox.dispatchEvent(new Event('change'));
  }
}

/**
 * Toggle legend visibility
 */
export function toggleLegend() {
  if (!legendPanel) {
    console.warn('Legend panel element not found');
    return;
  }

  const isCurrentlyVisible = !legendPanel.classList.contains('hidden');

  if (isCurrentlyVisible) {
    legendPanel.classList.add('hidden');
    console.log('Legend hidden');
  } else {
    legendPanel.classList.remove('hidden');
    updateLegendContent(); // 凡例内容を更新
    console.log('Legend shown');
  }

  // Update toggle button text if it exists
  const toggleBtn = document.getElementById('toggleLegendBtn');
  if (toggleBtn) {
    toggleBtn.textContent = isCurrentlyVisible ? '凡例を表示' : '凡例を非表示';
  }
}

/**
 * Reset all selectors to default values
 */
export function resetAllSelectors() {
  const storySelector = document.getElementById('storySelector');
  const xAxisSelector = document.getElementById('xAxisSelector');
  const yAxisSelector = document.getElementById('yAxisSelector');

  if (storySelector) storySelector.value = 'all';
  if (xAxisSelector) xAxisSelector.value = 'all';
  if (yAxisSelector) yAxisSelector.value = 'all';

  // Clear clipping planes
  if (typeof window.clearClippingPlanes === 'function') {
    window.clearClippingPlanes();
  }

  // Update label visibility
  updateLabelVisibility();

  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }

  console.log('All selectors reset to default values');
}

/**
 * Setup label content selector listener
 */
function setupLabelContentListener() {
  const labelContentSelector = document.getElementById('labelContentSelector');

  if (labelContentSelector) {
    labelContentSelector.addEventListener('change', handleLabelContentChange);
    console.log('Label content selector listener setup');
  } else {
    console.warn('Label content selector not found');
  }
}

/**
 * Handle label content type change
 * @param {Event} event - Change event
 */
function handleLabelContentChange(event) {
  const newContentType = event.target.value;
  console.log(`Label content type changed to: ${newContentType}`);

  // Update global state
  setState('ui.labelContentType', newContentType);

  // Trigger label regeneration
  if (typeof window.regenerateAllLabels === 'function') {
    window.regenerateAllLabels();
  } else {
    console.warn(
      'regenerateAllLabels function not found - labels will update on next model reload'
    );
  }

  // Request render update
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  }
}

/**
 * Setup accordion event listeners
 */
function setupAccordionListeners() {
  const accordionHeaders = document.querySelectorAll('.accordion-header');

  accordionHeaders.forEach((header) => {
    header.addEventListener('click', handleAccordionToggle);
  });

  // Initialize accordion states
  initializeAccordionStates();

  console.log(
    `Accordion listeners setup for ${accordionHeaders.length} sections`
  );
}

/**
 * Handle accordion section toggle
 * @param {Event} event - Click event
 */
function handleAccordionToggle(event) {
  const header = event.currentTarget;
  const targetId = header.dataset.target;
  const content = document.getElementById(targetId);

  if (!content) {
    console.warn(`Accordion content not found for target: ${targetId}`);
    return;
  }

  const isCollapsed = content.classList.contains('collapsed');

  if (isCollapsed) {
    // Expand
    content.classList.remove('collapsed');
    header.classList.remove('collapsed');
    console.log(`Accordion section expanded: ${targetId}`);
  } else {
    // Collapse
    content.classList.add('collapsed');
    header.classList.add('collapsed');
    console.log(`Accordion section collapsed: ${targetId}`);
  }

  // Save accordion state to localStorage
  saveAccordionState(targetId, !isCollapsed);
}

/**
 * Initialize accordion states from localStorage or defaults
 */
function initializeAccordionStates() {
  const defaultOpenSections = [
    'file-loading',
    'display-settings',
    'element-settings'
  ];
  const accordionSections = document.querySelectorAll('.accordion-section');

  accordionSections.forEach((section, index) => {
    const header = section.querySelector('.accordion-header');
    const content = section.querySelector('.accordion-content');

    if (!header || !content) return;

    const targetId = header.dataset.target;
    const savedState = getAccordionState(targetId);
    const shouldBeOpen =
      savedState !== null ? savedState : defaultOpenSections.includes(targetId);

    if (shouldBeOpen) {
      content.classList.remove('collapsed');
      header.classList.remove('collapsed');
    } else {
      content.classList.add('collapsed');
      header.classList.add('collapsed');
    }
  });

  console.log('Accordion states initialized');
}

/**
 * Save accordion state to localStorage
 * @param {string} sectionId - Section identifier
 * @param {boolean} isOpen - Whether section is open
 */
function saveAccordionState(sectionId, isOpen) {
  try {
    const accordionStates = JSON.parse(
      localStorage.getItem('accordionStates') || '{}'
    );
    accordionStates[sectionId] = isOpen;
    localStorage.setItem('accordionStates', JSON.stringify(accordionStates));
  } catch (error) {
    console.warn('Failed to save accordion state:', error);
  }
}

/**
 * Get accordion state from localStorage
 * @param {string} sectionId - Section identifier
 * @returns {boolean|null} Saved state or null if not found
 */
function getAccordionState(sectionId) {
  try {
    const accordionStates = JSON.parse(
      localStorage.getItem('accordionStates') || '{}'
    );
    return accordionStates[sectionId] !== undefined
      ? accordionStates[sectionId]
      : null;
  } catch (error) {
    console.warn('Failed to get accordion state:', error);
    return null;
  }
}

/**
 * Expand all accordion sections
 */
export function expandAllAccordions() {
  const contents = document.querySelectorAll('.accordion-content');
  const headers = document.querySelectorAll('.accordion-header');

  contents.forEach((content) => content.classList.remove('collapsed'));
  headers.forEach((header) => header.classList.remove('collapsed'));

  // Save states
  headers.forEach((header) => {
    const targetId = header.dataset.target;
    saveAccordionState(targetId, true);
  });

  console.log('All accordion sections expanded');
}

/**
 * Collapse all accordion sections
 */
export function collapseAllAccordions() {
  const contents = document.querySelectorAll('.accordion-content');
  const headers = document.querySelectorAll('.accordion-header');

  contents.forEach((content) => content.classList.add('collapsed'));
  headers.forEach((header) => header.classList.add('collapsed'));

  // Save states
  headers.forEach((header) => {
    const targetId = header.dataset.target;
    saveAccordionState(targetId, false);
  });

  console.log('All accordion sections collapsed');
}

/**
 * Setup clipping range slider listeners
 */
function setupClippingRangeListeners() {
  // Story clipping range slider
  const storyRangeSlider = document.getElementById('storyClipRange');
  const storyRangeValue = document.getElementById('storyRangeValue');

  if (storyRangeSlider && storyRangeValue) {
    storyRangeSlider.addEventListener('input', (event) => {
      const rangeValue = parseInt(event.target.value);
      storyRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
    console.log('Story clipping range slider listener setup');
  }

  // X-axis clipping range slider
  const xAxisRangeSlider = document.getElementById('xAxisClipRange');
  const xAxisRangeValue = document.getElementById('xAxisRangeValue');

  if (xAxisRangeSlider && xAxisRangeValue) {
    xAxisRangeSlider.addEventListener('input', (event) => {
      const rangeValue = parseInt(event.target.value);
      xAxisRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
    console.log('X-axis clipping range slider listener setup');
  }

  // Y-axis clipping range slider
  const yAxisRangeSlider = document.getElementById('yAxisClipRange');
  const yAxisRangeValue = document.getElementById('yAxisRangeValue');

  if (yAxisRangeSlider && yAxisRangeValue) {
    yAxisRangeSlider.addEventListener('input', (event) => {
      const rangeValue = parseInt(event.target.value);
      yAxisRangeValue.textContent = (rangeValue / 1000).toFixed(1);
      updateClippingRange(rangeValue);
    });
    console.log('Y-axis clipping range slider listener setup');
  }
}

/**
 * Setup clipping button listeners
 */
function setupClippingButtonListeners() {
  // Story clipping apply button
  const storyClipButton = document.getElementById('applyStoryClipButton');
  if (storyClipButton) {
    storyClipButton.addEventListener('click', () => {
      const storySelector = document.getElementById('storySelector');
      const storyRange = document.getElementById('storyClipRange');
      if (storySelector && storyRange) {
        const storyId = storySelector.value;
        const range = parseInt(storyRange.value);
        applyStoryClip(storyId, range);
      }
    });
    console.log('Story clipping apply button listener setup');
  }

  // X-axis clipping apply button
  const xAxisClipButton = document.getElementById('applyXAxisClipButton');
  if (xAxisClipButton) {
    xAxisClipButton.addEventListener('click', () => {
      const xAxisSelector = document.getElementById('xAxisSelector');
      const xAxisRange = document.getElementById('xAxisClipRange');
      if (xAxisSelector && xAxisRange) {
        const axisId = xAxisSelector.value;
        const range = parseInt(xAxisRange.value);
        applyAxisClip('X', axisId, range);
      }
    });
    console.log('X-axis clipping apply button listener setup');
  }

  // Y-axis clipping apply button
  const yAxisClipButton = document.getElementById('applyYAxisClipButton');
  if (yAxisClipButton) {
    yAxisClipButton.addEventListener('click', () => {
      const yAxisSelector = document.getElementById('yAxisSelector');
      const yAxisRange = document.getElementById('yAxisClipRange');
      if (yAxisSelector && yAxisRange) {
        const axisId = yAxisSelector.value;
        const range = parseInt(yAxisRange.value);
        applyAxisClip('Y', axisId, range);
      }
    });
    console.log('Y-axis clipping apply button listener setup');
  }

  // Clear clipping button
  const clearClipButton = document.getElementById('clearClipButton');
  if (clearClipButton) {
    clearClipButton.addEventListener('click', () => {
      clearAllClippingPlanes();
    });
    console.log('Clear clipping button listener setup');
  }
}

/**
 * 色分けモードに応じて凡例内容を更新
 */
export function updateLegendContent() {
  if (!legendPanel) return;

  // 現在の色分けモードを取得
  import('../colorModes.js').then(({ getCurrentColorMode, COLOR_MODES }) => {
    const currentMode = getCurrentColorMode();
    const legendContent = legendPanel.querySelector('.legend-content');

    if (!legendContent) return;

    switch (currentMode) {
      case COLOR_MODES.IMPORTANCE:
        updateImportanceLegend(legendContent);
        break;
      case COLOR_MODES.ELEMENT:
        updateElementLegend(legendContent);
        break;
      case COLOR_MODES.SCHEMA:
        updateSchemaLegend(legendContent);
        break;
      case COLOR_MODES.DIFF:
      default:
        updateDiffLegend(legendContent);
        break;
    }
  });
}

/**
 * 重要度別凡例を生成
 */
function updateImportanceLegend(container) {
  import('../core/importanceManager.js').then(
    ({ IMPORTANCE_LEVELS, IMPORTANCE_LEVEL_NAMES }) => {
      import('../config/importanceConfig.js').then(({ IMPORTANCE_COLORS }) => {
        // ランタイム色設定があれば使用
        const runtimeColors =
          window.runtimeImportanceColors || IMPORTANCE_COLORS;

        const html = `
        <div class="panel-header">重要度別凡例</div>
        ${Object.entries(IMPORTANCE_LEVELS)
    .map(([key, level]) => {
      const color = runtimeColors[level] || IMPORTANCE_COLORS[level];
      const name = IMPORTANCE_LEVEL_NAMES[level];
      return `
            <div class="legend-item">
              <span class="legend-color" style="background-color: ${color};"></span>
              <span>${name}</span>
            </div>
          `;
    })
    .join('')}
        <hr />
        <div class="legend-item">
          <span><b>操作方法:</b></span>
        </div>
        <div class="legend-item">
          <span>回転: 左ドラッグ</span>
        </div>
        <div class="legend-item">
          <span>平行移動: 右ドラッグ</span>
        </div>
        <div class="legend-item">
          <span>ズーム: ホイール</span>
        </div>
      `;
        container.innerHTML = html;
      });
    }
  );
}

/**
 * 部材別凡例を生成
 */
function updateElementLegend(container) {
  import('../colorModes.js').then(({ getElementColors }) => {
    const elementColors = getElementColors();
    const html = `
      <div class="panel-header">部材別凡例</div>
      ${Object.entries(elementColors)
    .map(
      ([type, color]) => `
        <div class="legend-item">
          <span class="legend-color" style="background-color: ${color};"></span>
          <span>${type}</span>
        </div>
      `
    )
    .join('')}
      <hr />
      <div class="legend-item">
        <span><b>操作方法:</b></span>
      </div>
      <div class="legend-item">
        <span>回転: 左ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>平行移動: 右ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>ズーム: ホイール</span>
      </div>
    `;
    container.innerHTML = html;
  });
}

/**
 * スキーマエラー凡例を生成
 */
function updateSchemaLegend(container) {
  import('../colorModes.js').then(({ getSchemaColors }) => {
    const schemaColors = getSchemaColors();
    const html = `
      <div class="panel-header">スキーマ検証凡例</div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${schemaColors.valid};"></span>
        <span>正常要素</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${schemaColors.error};"></span>
        <span>エラー要素</span>
      </div>
      <hr />
      <div class="legend-item">
        <span><b>操作方法:</b></span>
      </div>
      <div class="legend-item">
        <span>回転: 左ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>平行移動: 右ドラッグ</span>
      </div>
      <div class="legend-item">
        <span>ズーム: ホイール</span>
      </div>
    `;
    container.innerHTML = html;
  });
}

/**
 * 差分表示凡例を生成（デフォルト）
 */
function updateDiffLegend(container) {
  const html = `
    <div class="panel-header">凡例</div>
    <div class="legend-item">
      <span class="legend-color legend-color-matched"></span>
      <span>一致要素</span>
    </div>
    <div class="legend-item">
      <span class="legend-color legend-color-onlya"></span>
      <span>モデルAのみ</span>
    </div>
    <div class="legend-item">
      <span class="legend-color legend-color-onlyb"></span>
      <span>モデルBのみ</span>
    </div>
    <hr />
    <div class="legend-item">
      <span><b>操作方法:</b></span>
    </div>
    <div class="legend-item">
      <span>回転: 左ドラッグ</span>
    </div>
    <div class="legend-item">
      <span>平行移動: 右ドラッグ</span>
    </div>
    <div class="legend-item">
      <span>ズーム: ホイール</span>
    </div>
  `;
  container.innerHTML = html;
}

/**
 * Get current UI event listener status
 * @returns {Object} Event listener status
 */
export function getEventListenerStatus() {
  return {
    modelAToggle: !!toggleModelACheckbox,
    modelBToggle: !!toggleModelBCheckbox,
    legendPanel: !!legendPanel,
    storySelector: !!document.getElementById('storySelector'),
    xAxisSelector: !!document.getElementById('xAxisSelector'),
    yAxisSelector: !!document.getElementById('yAxisSelector'),
    toggleLegendBtn: !!document.getElementById('toggleLegendBtn'),
    accordionSections: document.querySelectorAll('.accordion-section').length,
    clippingRangeSliders:
      document.querySelectorAll('.clip-range-slider').length
  };
}
