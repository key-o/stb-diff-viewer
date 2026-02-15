/**
 * @fileoverview 要素情報表示モジュール（メインオーケストレーター）
 *
 * このファイルは、選択された構造要素の詳細情報を表示する機能のメインエントリポイントです。
 * 各サブモジュールを統合し、要素情報パネルの表示・更新を制御します。
 *
 * **パラメータ比較機能**:
 * - モデルA/B間での属性値の詳細比較表示
 * - 差分あり属性のハイライト表示
 *
 * **スキーマ連携機能**:
 * - XSDスキーマに基づく完全な属性リストの表示
 * - STB要素の詳細属性と子要素の表示
 */

// XSDスキーマパーサーをインポート
import {
  isSchemaLoaded,
  getAllAttributeNames,
  loadXsdSchema,
} from '../../../common-stb/parser/xsdSchemaParser.js';

// ストレージヘルパー
import { storageHelper } from '../../../utils/storageHelper.js';

// Logger
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('viewer:element-info');

// グローバル状態とimportanceManagerをインポート
import { getState } from '../../../app/globalState.js';
import { getImportanceManager } from '../../../app/importanceManager.js';

// バリデーション連携機能をインポート
import { generateValidationInfoHtml } from '../../../common-stb/validation/validationManager.js';

// サブモジュールのインポート
import { setElementInfoProviders, getFloatingWindowManager } from './ElementInfoProviders.js';
import {
  setDisplayElementInfoFn,
  setCurrentEditingElement,
  getCurrentEditingElement,
  toggleEditMode,
  exportModifications,
  clearModifications,
} from './EditMode.js';
import {
  renderComparisonRecursive,
  renderSectionInfo,
  renderOpeningInfo,
  generateTableStyles,
  setupCollapseHandlers,
} from './ComparisonRenderer.js';

// パネル幅の状態を保持するグローバル変数（storageHelper経由で永続化）
let storedPanelWidth = storageHelper.get('panelWidth');
let storedPanelHeight = storageHelper.get('panelHeight');

// XSDスキーマの初期化フラグ
let schemaInitialized = false;

/**
 * XSDスキーマを初期化する（初回のみ実行）
 */
async function initializeSchema() {
  if (schemaInitialized) return;

  // まず既に読み込まれているかチェック
  if (isSchemaLoaded()) {
    schemaInitialized = true;
    return;
  }

  try {
    // ST-Bridge202.xsdファイルを使用（相対パスで指定）
    const xsdPath = './schemas/ST-Bridge202.xsd';
    const success = await loadXsdSchema(xsdPath);
    if (!success) {
      logger.warn('XSD schema initialization failed, using fallback mode');
    }
  } catch (error) {
    logger.warn('XSD schema initialization error:', error);
  } finally {
    schemaInitialized = true;
  }
}

/**
 * パネルのリサイズ監視を設定
 * @param {HTMLElement} panel - パネル要素
 */
function setupPanelResizeObserver(panel) {
  if (panel.hasResizeObserver) return;

  let resizeTimeout;
  let userIsResizing = false;
  const lastKnownSize = { width: 0, height: 0 };

  // より確実なユーザーリサイズ検出
  panel.addEventListener('mousedown', (e) => {
    const rect = panel.getBoundingClientRect();
    const isNearRightBorder = e.clientX > rect.right - 20;
    const isNearBottomBorder = e.clientY > rect.bottom - 20;

    if (isNearRightBorder || isNearBottomBorder) {
      userIsResizing = true;
      lastKnownSize.width = panel.offsetWidth;
      lastKnownSize.height = panel.offsetHeight;
    }
  });

  // サイズ初期化用のカスタムイベントリスナー
  panel.addEventListener('initializeSize', (e) => {
    lastKnownSize.width = e.detail.width;
    lastKnownSize.height = e.detail.height;
  });

  document.addEventListener('mouseup', () => {
    if (userIsResizing) {
      setTimeout(() => {
        const currentWidth = panel.offsetWidth;
        const currentHeight = panel.offsetHeight;

        if (currentWidth !== lastKnownSize.width || currentHeight !== lastKnownSize.height) {
          if (currentWidth > 300) {
            storedPanelWidth = `${currentWidth}px`;
            storageHelper.set('panelWidth', storedPanelWidth);
          }
          if (currentHeight > 100) {
            storedPanelHeight = `${currentHeight}px`;
            storageHelper.set('panelHeight', storedPanelHeight);
          }
        }

        userIsResizing = false;
      }, 100);
    }
  });

  const resizeObserver = new ResizeObserver((_entries) => {
    if (panel._ignoreResize) {
      return;
    }

    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (panel._ignoreResize) {
        return;
      }

      const currentWidth = panel.offsetWidth;
      const currentHeight = panel.offsetHeight;

      if (currentWidth !== lastKnownSize.width || currentHeight !== lastKnownSize.height) {
        const isSignificantChange =
          Math.abs(currentWidth - lastKnownSize.width) > 10 ||
          Math.abs(currentHeight - lastKnownSize.height) > 10;

        if (userIsResizing || isSignificantChange) {
          if (currentWidth > 300) {
            storedPanelWidth = `${currentWidth}px`;
            storageHelper.set('panelWidth', storedPanelWidth);
          }
          if (currentHeight > 100) {
            storedPanelHeight = `${currentHeight}px`;
            storageHelper.set('panelHeight', storedPanelHeight);
          }
        }

        lastKnownSize.width = currentWidth;
        lastKnownSize.height = currentHeight;
      }
    }, 200);
  });
  resizeObserver.observe(panel);
  panel.hasResizeObserver = true;
}

/**
 * パネル幅を設定
 * @param {HTMLElement} panel - パネル要素
 */
function applyPanelSize(panel) {
  // ResizeObserverを一時的に無効化
  panel._ignoreResize = true;

  // MutationObserverでプログラム的なスタイル変更を監視
  if (!panel.hasMutationObserver) {
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          panel._ignoreResize = true;

          setTimeout(() => {
            panel._ignoreResize = false;
          }, 500);
        }
      });
    });

    mutationObserver.observe(panel, {
      attributes: true,
      attributeFilter: ['style'],
    });
    panel.hasMutationObserver = true;
  }

  // 初回設定時のデフォルト幅
  if (!storedPanelWidth) {
    const hasModelA = !!window.docA;
    const hasModelB = !!window.docB;
    const isSingleModel = (hasModelA && !hasModelB) || (!hasModelA && hasModelB);

    if (isSingleModel) {
      storedPanelWidth = '25vw';
    } else {
      storedPanelWidth = '30vw';
    }
  }

  // 保存された幅を適用
  if (storedPanelWidth) {
    if (storedPanelWidth.endsWith('px')) {
      const widthValue = parseInt(storedPanelWidth);
      if (widthValue >= 300) {
        panel.style.width = storedPanelWidth;
      } else {
        panel.style.width = '300px';
        storedPanelWidth = '300px';
        storageHelper.set('panelWidth', storedPanelWidth);
      }
    } else {
      panel.style.width = storedPanelWidth;
    }
  }
  panel.style.minWidth = '300px';
  panel.style.maxWidth = '70vw';

  // 保存された高さがあれば適用
  if (storedPanelHeight) {
    panel.style.height = storedPanelHeight;
  }

  // 少し遅延してResizeObserverを再有効化
  setTimeout(() => {
    panel._ignoreResize = false;

    if (panel.hasResizeObserver) {
      panel.dispatchEvent(
        new CustomEvent('initializeSize', {
          detail: {
            width: panel.offsetWidth,
            height: panel.offsetHeight,
          },
        }),
      );
    }
  }, 600);
}

/**
 * フォールバック表示（XMLドキュメントがない場合のThree.jsメッシュからの情報取得）
 * @param {string} elementType - 要素タイプ
 * @param {string|null} idA - モデルAのID
 * @param {string|null} idB - モデルBのID
 * @param {HTMLElement} contentDiv - コンテンツ表示要素
 * @returns {boolean} フォールバック表示が成功したか
 */
function tryFallbackDisplay(elementType, idA, idB, contentDiv) {
  try {
    const scene = window?.viewer?.scene || window?.scene;
    if (!scene) return false;

    let targetMesh = null;
    scene.traverse((o) => {
      if (targetMesh) return;
      if (o.isMesh && o.userData && o.userData.elementType === elementType) {
        const eid = o.userData.elementId;
        if (eid && (eid === idA || eid === idB || (!idA && !idB))) {
          targetMesh = o;
        }
      }
    });

    if (targetMesh) {
      const ud = targetMesh.userData || {};
      const sec = ud.sectionDataOriginal || ud.beamData?.section || ud.columnData?.section || {};
      const dims = sec.dimensions || sec;
      const dimPairs = Object.entries(dims)
        .filter(
          ([_k, v]) =>
            typeof v === 'number' || (typeof v === 'string' && v.match(/^\d+(?:\.\d+)?$/)),
        )
        .map(([key, v]) => `${key}: ${v}`)
        .slice(0, 24)
        .join('<br>');
      const metaPairs = Object.entries(ud.profileMeta || {})
        .map(([key, v]) => `${key}: ${v}`)
        .join('<br>');
      contentDiv.innerHTML = `
        <div style="font-weight:var(--font-weight-bold);margin-bottom:4px;">${elementType} (Mesh UserData)</div>
        <div><strong>ID:</strong> ${ud.elementId || '-'}</div>
        <div><strong>Section Type:</strong> ${
          ud.sectionType || ud.profileMeta?.sectionTypeResolved || '-'
        }</div>
        <div><strong>Profile Source:</strong> ${ud.profileMeta?.profileSource || '-'}</div>
        <div style="margin-top:6px;"><strong>Dimensions (from enriched section):</strong><br>${
          dimPairs || '-'
        }</div>
        <div style="margin-top:6px;"><strong>Profile Meta:</strong><br>${metaPairs || '-'}</div>
        <div style="margin-top:6px;"><strong>Raw shapeName:</strong> ${
          sec.shapeName || ud.shapeName || '-'
        }</div>
      `;

      const fwm = getFloatingWindowManager();
      if (fwm) {
        fwm.showWindow('component-info');
      }
      return true;
    }
  } catch (e) {
    logger.warn('Fallback element info display failed:', e);
  }
  return false;
}

/**
 * 座標重複時のフォールバック用：類似要素タイプのマッピング
 */
const fallbackTypes = {
  Girder: ['Beam'],
  Beam: ['Girder'],
};

/**
 * 継手XML要素のタグ名一覧
 */
const JOINT_XML_TAGS = [
  'StbJointBeamShapeH',
  'StbJointColumnShapeH',
  'StbJointBeamShapeBox',
  'StbJointColumnShapeBox',
  'StbJointBeamShapeT',
  'StbJointColumnShapeT',
];

/**
 * 継手メッシュIDから継手定義IDを抽出
 * @param {string} meshId - 継手メッシュID (例: "joint_165_start", "joint_42_end")
 * @returns {string|null} 継手定義ID (例: "165", "42")
 */
function extractJointIdFromMeshId(meshId) {
  if (!meshId) return null;
  // パターン: "joint_{id}_{position}" または "joint_{id}"
  const match = meshId.match(/^joint_(\d+)(?:_(?:start|end))?$/);
  return match ? match[1] : null;
}

/**
 * XMLドキュメントから継手要素を検索
 * @param {Document} doc - XMLドキュメント
 * @param {string} jointId - 継手定義ID
 * @returns {Element|null} 見つかった継手XML要素
 */
function findJointXmlNode(doc, jointId) {
  if (!doc || !jointId) return null;

  for (const tagName of JOINT_XML_TAGS) {
    const node = doc.querySelector(`${tagName}[id="${jointId}"]`);
    if (node) return node;
  }
  return null;
}

/**
 * 3Dシーンから継手メッシュのuserDataを取得
 * @param {string} jointMeshId - 継手メッシュID (例: "joint_165_start")
 * @returns {Object|null} メッシュのuserData
 */
function findJointMeshData(jointMeshId) {
  const scene = window?.viewer?.scene || window?.scene;
  if (!scene) return null;

  let result = null;
  scene.traverse((obj) => {
    if (result) return;
    if (obj.isMesh && obj.userData && obj.userData.id === jointMeshId) {
      result = obj.userData;
    }
  });
  return result;
}

/**
 * ドキュメントから要素を検索（フォールバック対応）
 * @param {Document} doc - XMLドキュメント
 * @param {string} id - 要素ID
 * @param {string} primaryTagName - 最初に検索するタグ名
 * @param {string} elementType - 要素タイプ
 * @param {string} modelLabel - ログ用のモデルラベル
 * @returns {{node: Element|null, foundType: string}} 見つかった要素と実際のタイプ
 */
function findElementWithFallback(doc, id, primaryTagName, elementType, modelLabel) {
  // まず指定されたタグ名で検索
  let node = doc.querySelector(`${primaryTagName}[id="${id}"]`);
  if (node) {
    return { node, foundType: elementType };
  }

  // 見つからない場合、フォールバックタイプで検索
  const fallbacks = fallbackTypes[elementType] || [];
  for (const fallbackType of fallbacks) {
    const fallbackTagName = `Stb${fallbackType}`;
    node = doc.querySelector(`${fallbackTagName}[id="${id}"]`);
    if (node) {
      logger.warn(
        `Element with ID ${id} found as ${fallbackType} (not ${elementType}) in model ${modelLabel}. ` +
          `This may indicate overlapping elements in 3D view.`,
      );
      return { node, foundType: fallbackType };
    }
  }

  // どちらでも見つからない場合
  logger.warn(`Element ${elementType} with ID ${id} not found in model ${modelLabel}.`);
  return { node: null, foundType: elementType };
}

/**
 * モデルAとモデルBのXML要素ノードを受け取り、比較情報を整形してパネルに表示する。
 * @param {Element | null} nodeA - モデルAのXML要素ノード
 * @param {Element | null} nodeB - モデルBのXML要素ノード
 * @param {HTMLElement} panel - 表示先のHTML要素
 * @param {string} title - パネルに表示するタイトル
 * @param {HTMLElement} contentDiv - コンテンツ表示用のHTML要素
 * @param {string | null} modelSource - 要素のモデルソース
 * @param {string | null} elementType - 要素タイプ
 * @param {Object | null} jointMeshDataA - 継手メッシュデータA（継手の場合のみ）
 * @param {Object | null} jointMeshDataB - 継手メッシュデータB（継手の場合のみ）
 */
function showInfo(
  nodeA,
  nodeB,
  panel,
  title,
  contentDiv,
  modelSource = null,
  elementType = null,
  jointMeshDataA = null,
  jointMeshDataB = null,
) {
  if (!panel || !contentDiv) {
    logger.error('Panel or contentDiv is missing in showInfo');
    return;
  }

  const idA = nodeA ? nodeA.getAttribute('id') : null;
  const idB = nodeB ? nodeB.getAttribute('id') : null;

  let content = `<h3>${title}</h3>`;

  // モデルが一つだけかどうかを判定
  const hasModelA = !!window.docA;
  const hasModelB = !!window.docB;
  const isSingleModel = (hasModelA && !hasModelB) || (!hasModelA && hasModelB);
  const hasOnlyA = nodeA && !nodeB;
  const hasOnlyB = !nodeA && nodeB;
  const showSingleColumn = isSingleModel || hasOnlyA || hasOnlyB;

  // --- 統合比較テーブルの生成 ---
  content += '<table class="unified-comparison-table">';

  if (showSingleColumn) {
    const modelName = hasOnlyA || hasModelA ? 'モデル A' : 'モデル B';
    content += `<thead><tr><th style="width: 50%;">要素 / 属性</th><th style="width: 50%;">${modelName}</th></tr></thead>`;
  } else {
    content +=
      '<thead><tr><th style="width: 40%;">要素 / 属性</th><th style="width: 30%;">モデル A</th><th style="width: 30%;">モデル B</th></tr></thead>';
  }

  content += `<tbody id="element-info-tbody">`;

  // ルート要素の比較表示
  content += renderComparisonRecursive(
    nodeA,
    nodeB,
    0,
    'root',
    showSingleColumn,
    modelSource,
    elementType,
  );

  // 断面情報の比較表示（継手以外）
  content += renderSectionInfo(nodeA, nodeB, showSingleColumn, modelSource, elementType);

  // 壁・スラブの開口情報表示（v2.1.0: StbOpenArrangement経由）
  if (elementType === 'Wall' || elementType === 'Slab') {
    content += renderOpeningInfo(nodeA, nodeB, showSingleColumn);
  }

  // 継手の場合は親部材情報を追加
  if (jointMeshDataA || jointMeshDataB) {
    content += renderJointParentInfo(jointMeshDataA, jointMeshDataB, showSingleColumn, modelSource);
  }

  content += '</tbody></table>';

  // バリデーション情報を追加
  const elementId = idA || idB;
  if (elementId) {
    const validationHtml = generateValidationInfoHtml(elementId);
    if (validationHtml) {
      content += validationHtml;
    }
  }

  contentDiv.innerHTML = content;

  // --- 折りたたみイベントの追加 ---
  const tbody = contentDiv.querySelector('#element-info-tbody');
  setupCollapseHandlers(tbody);

  // --- スタイル定義 ---
  let style = panel.querySelector('style#element-info-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'element-info-styles';
    panel.appendChild(style);
  }
  style.textContent = generateTableStyles(showSingleColumn);
}

/**
 * 継手の親部材情報をレンダリング
 * @param {Object|null} jointMeshDataA - 継手メッシュデータA
 * @param {Object|null} jointMeshDataB - 継手メッシュデータB
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @param {string|null} _modelSource - モデルソース（未使用）
 * @returns {string} HTML文字列
 */
function renderJointParentInfo(jointMeshDataA, jointMeshDataB, showSingleColumn, _modelSource) {
  const jdA = jointMeshDataA?.jointData || {};
  const jdB = jointMeshDataB?.jointData || {};

  // 親部材情報がない場合はスキップ
  if (!jdA.parent_element_type && !jdB.parent_element_type) {
    return '';
  }

  let html = '';
  const rowId = `row_parent_info_${Math.random().toString(36).slice(2, 7)}`;

  // セクションヘッダー
  html += `<tr class="element-row" data-id="${rowId}">`;
  html += '<td style="padding-left: 0; white-space: nowrap;">';
  html += `<span class="toggle-btn" data-target-id="${rowId}" style="margin-right:5px;display:inline-block;width:1em;text-align:center;font-weight:var(--font-weight-bold);cursor:pointer;color:#666;">-</span>`;
  html += '<span class="tag-name">親部材情報</span>';
  html += '</td>';
  if (showSingleColumn) {
    html += '<td></td>';
  } else {
    html += '<td></td><td></td>';
  }
  html += '</tr>';

  // 親部材タイプ
  const parentTypeA = jdA.parent_element_type || '-';
  const parentTypeB = jdB.parent_element_type || '-';
  html += renderJointParentRow('親部材タイプ', parentTypeA, parentTypeB, showSingleColumn, rowId);

  // 親部材ID
  const parentIdA = jdA.parent_element_id || jointMeshDataA?.elementId || '-';
  const parentIdB = jdB.parent_element_id || jointMeshDataB?.elementId || '-';
  html += renderJointParentRow('親部材ID', parentIdA, parentIdB, showSingleColumn, rowId);

  // 配置位置
  const posA =
    jointMeshDataA?.jointPosition === 'start'
      ? '始端'
      : jointMeshDataA?.jointPosition === 'end'
        ? '終端'
        : '-';
  const posB =
    jointMeshDataB?.jointPosition === 'start'
      ? '始端'
      : jointMeshDataB?.jointPosition === 'end'
        ? '終端'
        : '-';
  html += renderJointParentRow('配置位置', posA, posB, showSingleColumn, rowId);

  // 継手中心座標
  if (jdA.center || jdB.center) {
    const centerA = jdA.center
      ? `X: ${jdA.center.x?.toFixed(1) || '-'}, Y: ${jdA.center.y?.toFixed(1) || '-'}, Z: ${jdA.center.z?.toFixed(1) || '-'} mm`
      : '-';
    const centerB = jdB.center
      ? `X: ${jdB.center.x?.toFixed(1) || '-'}, Y: ${jdB.center.y?.toFixed(1) || '-'}, Z: ${jdB.center.z?.toFixed(1) || '-'} mm`
      : '-';
    html += renderJointParentRow('継手中心座標', centerA, centerB, showSingleColumn, rowId);
  }

  return html;
}

/**
 * 継手親部材情報の行をレンダリング
 * @param {string} label - ラベル
 * @param {string} valueA - モデルAの値
 * @param {string} valueB - モデルBの値
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか
 * @param {string} parentRowId - 親行ID
 * @returns {string} HTML文字列
 */
function renderJointParentRow(label, valueA, valueB, showSingleColumn, parentRowId) {
  const attrIndentStyle = 'padding-left: 2.25em;';
  let html = `<tr data-parent="${parentRowId}">`;
  html += `<td style="${attrIndentStyle}"><span class="attr-name">${label}</span></td>`;

  if (showSingleColumn) {
    const value = valueA !== '-' ? valueA : valueB;
    html += `<td>${value}</td>`;
  } else {
    const isDiff = valueA !== valueB;
    const highlightClass = isDiff ? ' class="differs"' : '';
    html += `<td${highlightClass}>${valueA}</td>`;
    html += `<td${highlightClass}>${valueB}</td>`;
  }

  html += '</tr>';
  return html;
}

/**
 * 継手のメッシュデータのみで情報を表示（XMLが見つからない場合のフォールバック）
 * @param {HTMLElement} panel - パネル要素
 * @param {string} title - タイトル
 * @param {HTMLElement} contentDiv - コンテンツ表示要素
 * @param {Object|null} jointMeshDataA - 継手メッシュデータA
 * @param {Object|null} jointMeshDataB - 継手メッシュデータB
 */
function showJointMeshDataOnly(panel, title, contentDiv, jointMeshDataA, jointMeshDataB) {
  const hasModelA = !!window.docA;
  const hasModelB = !!window.docB;
  const isSingleModel = (hasModelA && !hasModelB) || (!hasModelA && hasModelB);
  const hasOnlyA = jointMeshDataA && !jointMeshDataB;
  const hasOnlyB = !jointMeshDataA && jointMeshDataB;
  const showSingleColumn = isSingleModel || hasOnlyA || hasOnlyB;

  let content = `<h3>${title}</h3>`;
  content += '<table class="unified-comparison-table">';

  if (showSingleColumn) {
    const modelName = hasOnlyA || hasModelA ? 'モデル A' : 'モデル B';
    content += `<thead><tr><th style="width: 50%;">属性</th><th style="width: 50%;">${modelName}</th></tr></thead>`;
  } else {
    content +=
      '<thead><tr><th style="width: 40%;">属性</th><th style="width: 30%;">モデル A</th><th style="width: 30%;">モデル B</th></tr></thead>';
  }

  content += '<tbody>';

  // 親部材情報を表示
  content += renderJointParentInfo(jointMeshDataA, jointMeshDataB, showSingleColumn, null);

  content += '</tbody></table>';
  content +=
    '<p style="color: orange; font-size: var(--font-size-md); margin-top: 8px;">※ XML内に継手定義が見つかりませんでした。メッシュデータのみを表示しています。</p>';

  contentDiv.innerHTML = content;

  // 折りたたみイベントの追加
  const tbody = contentDiv.querySelector('tbody');
  if (tbody) {
    setupCollapseHandlers(tbody);
  }

  // スタイル定義
  let style = panel.querySelector('style#element-info-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'element-info-styles';
    panel.appendChild(style);
  }
  style.textContent = generateTableStyles(showSingleColumn);
}

// ============================================================================
// 汎用要素情報表示
// ============================================================================

/**
 * 指定されたIDに基づいてモデルAとモデルBの要素情報を比較表示する。
 * main.jsから呼び出される。
 * @param {string | null} idA - 表示するモデルAの要素ID
 * @param {string | null} idB - 表示するモデルBの要素ID
 * @param {string | null} elementType - 要素のタイプ ('Node', 'Column' など)
 * @param {string | null} modelSource - 要素のモデルソース ('A', 'B', 'matched', またはnull)
 */
export async function displayElementInfo(idA, idB, elementType, modelSource = null) {
  // --- null パラメータの処理（選択解除時） ---
  if (!elementType || (!idA && !idB)) {
    setCurrentEditingElement(null);
    return;
  }

  // XSDスキーマを初期化（初回のみ）
  await initializeSchema();

  // 現在編集中の要素を記録
  setCurrentEditingElement({ idA, idB, elementType, modelSource });

  const panel = document.getElementById('component-info');
  const contentDiv = document.getElementById('element-info-content');
  if (!panel || !contentDiv) {
    logger.error('Component info panel or content div not found!');
    return;
  }

  // 要素情報を表示する際にパネルを自動的に表示
  if (elementType && (idA || idB)) {
    const fwm = getFloatingWindowManager();
    if (fwm) {
      fwm.showWindow('component-info');
    }
  }

  // --- 単一モデル / XML未ロード時のフォールバック ---
  if (elementType && !window.docA && !window.docB) {
    if (tryFallbackDisplay(elementType, idA, idB, contentDiv)) {
      return;
    }
  }

  // パネルサイズ設定
  applyPanelSize(panel);
  setupPanelResizeObserver(panel);

  // IDやタイプがnullならパネルをクリア
  if (elementType === null || (idA === null && idB === null)) {
    contentDiv.innerHTML = '要素を選択してください。';
    return;
  }

  let nodeA = null;
  let nodeB = null;
  let title = '';
  let actualElementType = elementType;
  let jointMeshDataA = null;
  let jointMeshDataB = null;

  // 継手要素の場合の特別処理
  if (elementType === 'Joint') {
    // メッシュのuserDataを取得（親部材情報用）
    jointMeshDataA = idA ? findJointMeshData(idA) : null;
    jointMeshDataB = idB ? findJointMeshData(idB) : null;

    // 継手定義IDを取得（優先順位: userData.jointId > メッシュIDから抽出）
    const jointIdA = jointMeshDataA?.jointId?.toString() || extractJointIdFromMeshId(idA);
    const jointIdB = jointMeshDataB?.jointId?.toString() || extractJointIdFromMeshId(idB);

    logger.debug(
      `Joint ID extraction: idA=${idA} -> jointIdA=${jointIdA}, idB=${idB} -> jointIdB=${jointIdB}`,
    );

    // XMLから継手要素を検索
    if (jointIdA && window.docA) {
      nodeA = findJointXmlNode(window.docA, jointIdA);
      logger.debug(`Joint XML search in docA for id=${jointIdA}: ${nodeA ? 'found' : 'not found'}`);
    }
    if (jointIdB && window.docB) {
      nodeB = findJointXmlNode(window.docB, jointIdB);
      logger.debug(`Joint XML search in docB for id=${jointIdB}: ${nodeB ? 'found' : 'not found'}`);
    }

    // 継手の実際のタグ名から要素タイプを取得
    if (nodeA) {
      actualElementType = nodeA.tagName.replace('Stb', '');
    } else if (nodeB) {
      actualElementType = nodeB.tagName.replace('Stb', '');
    }
  } else {
    // 通常の要素
    const tagName =
      elementType === 'Axis'
        ? 'StbParallelAxis'
        : elementType === 'Node'
          ? 'StbNode'
          : `Stb${elementType}`;

    // モデルAの要素を取得試行
    if (idA && window.docA) {
      const resultA = findElementWithFallback(window.docA, idA, tagName, elementType, 'A');
      nodeA = resultA.node;
      if (nodeA) {
        actualElementType = resultA.foundType;
      }
    } else if (idA && !window.docA) {
      logger.error(`XML document for model A not found.`);
    }

    // モデルBの要素を取得試行
    if (idB && window.docB) {
      const resultB = findElementWithFallback(window.docB, idB, tagName, elementType, 'B');
      nodeB = resultB.node;
      if (nodeB && !nodeA) {
        actualElementType = resultB.foundType;
      }
    } else if (idB && !window.docB) {
      logger.error(`XML document for model B not found.`);
    }
  }

  // 要素が両方見つからない場合
  if (!nodeA && !nodeB) {
    // 継手の場合はメッシュデータがあれば親部材情報だけでも表示
    if (elementType === 'Joint' && (jointMeshDataA || jointMeshDataB)) {
      logger.warn(`Joint XML not found for ID A:${idA} or B:${idB}, showing mesh data only.`);
      // メッシュデータのみで表示（XMLなしでも親部材情報は表示可能）
      const jointMeshData = jointMeshDataA || jointMeshDataB;
      const jd = jointMeshData?.jointData || {};
      const posLabel =
        jointMeshData?.jointPosition === 'start'
          ? '始端'
          : jointMeshData?.jointPosition === 'end'
            ? '終端'
            : '';
      const parentInfoStr = `${jd.parent_element_type || ''} ID:${jd.parent_element_id || ''} ${posLabel}`;
      const jointId = jointMeshData?.jointId || extractJointIdFromMeshId(idA || idB);

      title = `継手 ID:${jointId} (${parentInfoStr})`;
      title += ' <span style="color: orange; font-size: var(--font-size-sm);">[XML未検出]</span>';

      // メッシュデータのみで簡易表示
      showJointMeshDataOnly(panel, title, contentDiv, jointMeshDataA, jointMeshDataB);
      return;
    }

    contentDiv.innerHTML = `<p>エラー: ID ${idA ? `A:${idA}` : ''}${
      idA && idB ? ', ' : ''
    }${idB ? `B:${idB}` : ''} の ${elementType} 要素が見つかりません。</p>`;
    logger.error(`Element ${elementType} with ID A:${idA} or B:${idB} not found.`);
    return;
  }

  // タイトル設定（XSDスキーマ状況を含む）
  let schemaInfo = '';
  const schemaElementName = actualElementType === 'Node' ? 'StbNode' : `Stb${actualElementType}`;

  if (isSchemaLoaded()) {
    const attrCount = getAllAttributeNames(schemaElementName).length;
    if (attrCount > 0) {
      schemaInfo = ` <span style="color: green; font-size: var(--font-size-sm);">[XSD: ${attrCount}属性]</span>`;
    } else {
      schemaInfo = ` <span style="color: orange; font-size: var(--font-size-sm);">[XSD: ${schemaElementName}未定義]</span>`;
      logger.warn(`XSD schema loaded but ${schemaElementName} not found in definitions`);
    }
  } else {
    schemaInfo = ' <span style="color: red; font-size: var(--font-size-sm);">[XSD: 未読込]</span>';
  }

  // タイトル生成
  const typeNote =
    actualElementType !== elementType && elementType !== 'Joint'
      ? ` <span style="color: orange; font-size: var(--font-size-sm);">[実際は${actualElementType}]</span>`
      : '';

  // 継手の場合は親部材情報をタイトルに含める
  let parentInfo = '';
  if (elementType === 'Joint') {
    const jointMeshData = jointMeshDataA || jointMeshDataB;
    if (jointMeshData?.jointData) {
      const jd = jointMeshData.jointData;
      const posLabel =
        jointMeshData.jointPosition === 'start'
          ? '始端'
          : jointMeshData.jointPosition === 'end'
            ? '終端'
            : '';
      parentInfo = ` (${jd.parent_element_type || ''} ID:${jd.parent_element_id || ''} ${posLabel})`;
    }
  }

  /**
   * 評価基準バッジを生成
   * @returns {string} HTMLバッジ文字列
   */
  function generateEvaluationBadge() {
    try {
      const manager = getImportanceManager();
      const configId = manager.getCurrentConfigId();
      const activeXsdVersion = getState('models.activeXsdVersion');

      if (!configId && !activeXsdVersion) {
        return ''; // 初期化前はスキップ
      }

      // MVD設定名の短縮
      const shortName =
        {
          'mvd-combined': 'S2+S4',
          s2: 'S2',
          s4: 'S4',
        }[configId] || 'デフォルト';

      // XSDバージョンの短縮
      const xsdLabel = activeXsdVersion === '2.1.0' ? '210' : '202';

      return ` <span style="background: rgba(0,120,215,0.15); padding: 2px 6px; border-radius: 3px; font-size: var(--font-size-xs); font-weight: normal; margin-left: 4px;">[評価: ${shortName}, XSD:${xsdLabel}]</span>`;
    } catch (error) {
      logger.warn('Failed to generate evaluation badge:', error);
      return '';
    }
  }

  const evaluationBadge = generateEvaluationBadge();
  const displayId = nodeA?.getAttribute('id') || nodeB?.getAttribute('id') || idA || idB;

  if (nodeA && nodeB) {
    const idADisplay = nodeA.getAttribute('id') || idA;
    const idBDisplay = nodeB.getAttribute('id') || idB;
    title = `比較: ${actualElementType}${parentInfo} (A: ${idADisplay}, B: ${idBDisplay})${typeNote}${schemaInfo}${evaluationBadge}`;
  } else if (nodeA) {
    title = `モデル A: ${actualElementType}${parentInfo} (ID: ${displayId})${typeNote}${schemaInfo}${evaluationBadge}`;
  } else {
    title = `モデル B: ${actualElementType}${parentInfo} (ID: ${displayId})${typeNote}${schemaInfo}${evaluationBadge}`;
  }

  // showInfoを呼び出して情報を表示（継手の場合は親部材情報も渡す）
  showInfo(
    nodeA,
    nodeB,
    panel,
    title,
    contentDiv,
    modelSource,
    actualElementType,
    jointMeshDataA,
    jointMeshDataB,
  );
}

/**
 * 現在選択中の要素情報パネルを更新
 * 色付けモード変更時などに呼び出される
 */
export function refreshElementInfoPanel() {
  const currentElement = getCurrentEditingElement();
  if (currentElement) {
    const { idA, idB, elementType, modelSource } = currentElement;
    displayElementInfo(idA, idB, elementType, modelSource);
  }
}

/**
 * 現在選択中の要素情報を取得
 * @returns {Object|null} 選択中の要素情報
 */
export { getCurrentEditingElement as getCurrentSelectedElement };

// 循環依存回避のため、EditModeにdisplayElementInfo関数を登録
setDisplayElementInfoFn(displayElementInfo);

// エクスポート（互換性維持）
export { setElementInfoProviders, toggleEditMode, exportModifications, clearModifications };
