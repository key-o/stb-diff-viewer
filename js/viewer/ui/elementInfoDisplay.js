/**
 * @fileoverview 要素情報表示モジュール
 *
 * このファイルは、選択された構造要素の詳細情報を表示する機能を提供します:
 * - モデルA/B間での要素属性の比較表示
 * - XSDスキーマに基づく完全な属性リストの表示
 * - STB要素の詳細属性と子要素の表示
 * - 断面情報と形状データの表示
 * - 差分のハイライト表示
 * - 折りたたみ可能な階層表示
 *
 * このモジュールは、ユーザーが選択した要素の詳細を分析するための
 * リッチな情報パネルを生成し、モデル間の差異を明確に示します。
 */

// XSDスキーマパーサーをインポート
import {
  isSchemaLoaded,
  getAllAttributeNames,
  getAttributeInfo,
  loadXsdSchema,
  validateAttributeValue,
  validateElement,
} from "../../parser/xsdSchemaParser.js";

// 新しいパラメータ編集機能をインポート
import { ParameterEditor } from "../../ui/parameterEditor.js";
import { SuggestionEngine } from "../../core/suggestionEngine.js";

// STBエクスポーターをインポート
import {
  exportModifiedStb,
  validateDocumentForExport,
  generateModificationReport,
} from "../../exporter/stbExporter.js";

// 重要度管理機能をインポート
import {
  getImportanceManager,
  IMPORTANCE_LEVELS,
} from "../../core/importanceManager.js";
import { IMPORTANCE_COLORS } from "../../config/importanceConfig.js";

// XMLドキュメントへの参照 (main.jsのwindowオブジェクト経由で設定される想定)

// パネル幅の状態を保持するグローバル変数とlocalStorage連携
let storedPanelWidth = localStorage.getItem("stbDiffViewer_panelWidth") || null;
let storedPanelHeight =
  localStorage.getItem("stbDiffViewer_panelHeight") || null;

// XSDスキーマの初期化フラグ
let schemaInitialized = false;

// 編集機能の状態管理
let editMode = false;
let modifications = []; // 修正履歴 [{elementType, id, attribute, oldValue, newValue}]
let currentEditingElement = null;

/**
 * XSDスキーマを初期化する（初回のみ実行）
 */
async function initializeSchema() {
  if (schemaInitialized) return;

  try {
    // ST-Bridge202.xsdファイルを使用
    const xsdPath = "./schemas/ST-Bridge202.xsd";
    const success = await loadXsdSchema(xsdPath);
    if (success) {
      console.log("XSD schema initialized successfully");
    } else {
      console.warn("XSD schema initialization failed, using fallback mode");
    }
  } catch (error) {
    console.warn("XSD schema initialization error:", error);
  } finally {
    schemaInitialized = true;
  }
}

/**
 * 属性の重要度レベルを取得する
 * @param {string} elementType - 要素タイプ (例: 'Column', 'Node')
 * @param {string} attributeName - 属性名 (例: 'id', 'name')
 * @returns {string} 重要度レベル ('required', 'optional', 'unnecessary', 'notApplicable')
 */
function getAttributeImportanceLevel(elementType, attributeName) {
  try {
    const manager = getImportanceManager();
    if (!manager) {
      console.warn("[Importance] ImportanceManager not available");
      return IMPORTANCE_LEVELS.OPTIONAL;
    }

    if (!manager.isInitialized) {
      console.warn("[Importance] ImportanceManager not initialized");
      return IMPORTANCE_LEVELS.OPTIONAL;
    }

    // 要素タイプに対応するコンテナ名のマッピング
    const containerMapping = {
      Node: "StbNodes",
      Column: "StbColumns",
      Girder: "StbGirders",
      Beam: "StbBeams",
      Brace: "StbBraces",
      Slab: "StbSlabs",
      Wall: "StbWalls",
      Story: "StbStories",
      Axis: "StbAxes", // 注: AxisはStbParallelAxes, StbArcAxes, StbRadialAxesなど複数ある
    };

    // ST-Bridge要素名を構築 (例: StbColumn, StbNode)
    const stbElementName =
      elementType === "Node" ? "StbNode" : `Stb${elementType}`;

    // コンテナ名を取得
    const containerName = containerMapping[elementType] || `Stb${elementType}s`;

    // 属性のパスを構築 (例: //ST_BRIDGE/StbColumns/StbColumn/@id)
    const attributePath = `//ST_BRIDGE/${containerName}/${stbElementName}/@${attributeName}`;

    // 重要度を取得
    const importance = manager.getImportanceLevel(attributePath);

    console.log(`[Importance] ${attributePath} -> ${importance}`);
    return importance;
  } catch (error) {
    console.warn(
      `[Importance] Failed to get importance for ${elementType}.${attributeName}:`,
      error
    );
    return IMPORTANCE_LEVELS.OPTIONAL; // フォールバック
  }
}

/**
 * 重要度レベルに基づいて背景色を取得する
 * @param {string} importanceLevel - 重要度レベル
 * @param {string} modelSource - モデルソース ('A', 'B', 'matched', またはnull)
 * @returns {string} CSS背景色スタイル
 */
function getImportanceBasedBackgroundColor(importanceLevel, modelSource) {
  // モデルソースが指定されていない場合は色付けしない
  if (!modelSource) {
    return "";
  }

  // ランタイム色設定または設定ファイルの色を使用
  const runtimeColors = window.runtimeImportanceColors || IMPORTANCE_COLORS;
  const baseColor =
    runtimeColors[importanceLevel] ||
    IMPORTANCE_COLORS[IMPORTANCE_LEVELS.OPTIONAL];

  // 16進数カラーからRGBAに変換し、透明度を適用
  const hexToRgba = (hex, alpha = 0.1) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return `background-color: ${hexToRgba(baseColor, 0.15)};`;
}

/**
 * モデルソースに基づいてプロパティ値セルの背景色を取得する（重要度ベース）
 * @param {string} modelSource - 'A', 'B', 'matched', またはnull
 * @param {boolean} hasValueA - モデルAに値があるかどうか
 * @param {boolean} hasValueB - モデルBに値があるかどうか
 * @param {string} elementType - 要素タイプ
 * @param {string} attributeName - 属性名
 * @returns {string} CSS背景色スタイル
 */
function getModelSourceBackgroundColor(
  modelSource,
  hasValueA,
  hasValueB,
  elementType = null,
  attributeName = null
) {
  // 重要度ベースの色付けを使用する場合
  if (elementType && attributeName) {
    const importanceLevel = getAttributeImportanceLevel(
      elementType,
      attributeName
    );
    return getImportanceBasedBackgroundColor(importanceLevel, modelSource);
  }

  // フォールバック: 従来の固定色を使用
  if (!modelSource) {
    return "";
  }

  switch (modelSource) {
    case "A":
      return "background-color: rgba(0, 255, 0, 0.1);"; // 緑の薄い背景
    case "B":
      return "background-color: rgba(255, 0, 0, 0.1);"; // 赤の薄い背景
    case "matched":
      return "background-color: rgba(0, 170, 255, 0.1);"; // 青の薄い背景
    default:
      return "";
  }
}

/**
 * 個別のプロパティ値セルの背景色を取得する（単一カラム表示用・重要度ベース）
 * @param {string} modelSource - 'A', 'B', 'matched', またはnull
 * @param {string} elementType - 要素タイプ
 * @param {string} attributeName - 属性名
 * @returns {string} CSS背景色スタイル
 */
function getSingleValueBackgroundColor(
  modelSource,
  elementType = null,
  attributeName = null
) {
  // 重要度ベースの色付けを使用する場合
  if (elementType && attributeName) {
    const importanceLevel = getAttributeImportanceLevel(
      elementType,
      attributeName
    );
    return getImportanceBasedBackgroundColor(importanceLevel, modelSource);
  }

  // フォールバック: 従来の固定色を使用
  if (!modelSource) {
    return "";
  }

  switch (modelSource) {
    case "A":
      return "background-color: rgba(0, 255, 0, 0.1);"; // 緑の薄い背景
    case "B":
      return "background-color: rgba(255, 0, 0, 0.1);"; // 赤の薄い背景
    case "matched":
      return "background-color: rgba(0, 170, 255, 0.1);"; // 青の薄い背景
    default:
      return "";
  }
}

/**
 * 指定されたIDに基づいてモデルAとモデルBの要素情報を比較表示する。
 * main.jsから呼び出される。
 * @param {string | null} idA - 表示するモデルAの要素ID。nullの場合はモデルAの要素は検索しない。
 * @param {string | null} idB - 表示するモデルBの要素ID。nullの場合はモデルBの要素は検索しない。
 * @param {string | null} elementType - 要素のタイプ ('Node', 'Column' など)。nullの場合はパネルをクリア。
 * @param {string | null} modelSource - 要素のモデルソース ('A', 'B', 'matched', またはnull)
 */
export async function displayElementInfo(
  idA,
  idB,
  elementType,
  modelSource = null
) {
  // XSDスキーマを初期化（初回のみ）
  await initializeSchema();

  // 現在編集中の要素を記録
  currentEditingElement = { idA, idB, elementType, modelSource };

  // --- デバッグ用ログを更新 ---
  console.log("displayElementInfo called with:", {
    idA,
    idB,
    elementType,
  });
  console.log("window.docA exists:", !!window.docA);
  console.log("window.docB exists:", !!window.docB);
  console.log("XSD schema loaded:", isSchemaLoaded());
  // --- デバッグ用ログここまで ---

  const panel = document.getElementById("component-info");
  const contentDiv = document.getElementById("element-info-content");
  if (!panel || !contentDiv) {
    console.error("Component info panel or content div not found!");
    return;
  }

  // --- パネル幅の設定と保持機能 ---
  // 初回設定時のデフォルト幅を増加し、一度設定した幅を保持する
  if (!storedPanelWidth) {
    // デフォルト幅を大きめに設定
    const hasModelA = !!window.docA;
    const hasModelB = !!window.docB;
    const isSingleModel =
      (hasModelA && !hasModelB) || (!hasModelA && hasModelB);

    if (isSingleModel) {
      storedPanelWidth = "25vw"; // 単一モデル時は25vw（以前の15vwより大きく）
    } else {
      storedPanelWidth = "30vw"; // 比較モード時は30vw（以前の20vwより大きく）
    }
  }

  // ResizeObserverを一時的に無効化（プログラム的な変更では反応しないように）
  panel._ignoreResize = true;

  // MutationObserverでプログラム的なスタイル変更を監視
  if (!panel.hasMutationObserver) {
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          // スタイル変更を検出したら、一時的にResizeObserverを無効化
          panel._ignoreResize = true;
          console.log(
            "MutationObserver: スタイル変更を検出、ResizeObserver一時無効化"
          );

          // 少し遅延してから再有効化
          setTimeout(() => {
            panel._ignoreResize = false;
            console.log("MutationObserver: ResizeObserver再有効化");
          }, 500);
        }
      });
    });

    mutationObserver.observe(panel, {
      attributes: true,
      attributeFilter: ["style"],
    });
    panel.hasMutationObserver = true;
    console.log("MutationObserver設定完了");
  }

  // 保存された幅を適用
  if (storedPanelWidth) {
    // 保存された幅がピクセル単位の場合、最小幅をチェック
    if (storedPanelWidth.endsWith("px")) {
      const widthValue = parseInt(storedPanelWidth);
      if (widthValue >= 300) {
        panel.style.width = storedPanelWidth;
      } else {
        panel.style.width = "300px"; // 最小幅を強制適用
        storedPanelWidth = "300px";
        localStorage.setItem("stbDiffViewer_panelWidth", storedPanelWidth);
      }
    } else {
      // vw単位などの場合はそのまま適用
      panel.style.width = storedPanelWidth;
    }
  }
  panel.style.minWidth = "300px"; // 最小幅も大きめに設定（以前の240pxより大きく）
  panel.style.maxWidth = "70vw"; // 最大幅も少し大きめに設定

  // 少し遅延してResizeObserverを再有効化
  setTimeout(() => {
    panel._ignoreResize = false;

    // 現在のサイズを記録（初期化）
    if (panel.hasResizeObserver) {
      // ResizeObserver内のlastKnownSizeを更新するため、カスタムイベントを使用
      panel.dispatchEvent(
        new CustomEvent("initializeSize", {
          detail: {
            width: panel.offsetWidth,
            height: panel.offsetHeight,
          },
        })
      );
    }
  }, 600); // MutationObserverより少し長めに設定

  // パネルサイズが変更された時の監視を設定（ResizeObserverを使用）
  if (!panel.hasResizeObserver) {
    let resizeTimeout;
    let userIsResizing = false;
    let lastKnownSize = { width: 0, height: 0 };

    // より確実なユーザーリサイズ検出
    panel.addEventListener("mousedown", (e) => {
      // リサイズハンドル付近でのマウスダウンを検出（範囲を広げる）
      const rect = panel.getBoundingClientRect();
      const isNearRightBorder = e.clientX > rect.right - 20; // 20pxまで拡大
      const isNearBottomBorder = e.clientY > rect.bottom - 20; // 20pxまで拡大

      if (isNearRightBorder || isNearBottomBorder) {
        userIsResizing = true;
        // 現在のサイズを記録
        lastKnownSize.width = panel.offsetWidth;
        lastKnownSize.height = panel.offsetHeight;
        console.log(
          `ユーザーリサイズ開始: ${lastKnownSize.width}x${lastKnownSize.height}`
        );
      }
    });

    // サイズ初期化用のカスタムイベントリスナー
    panel.addEventListener("initializeSize", (e) => {
      lastKnownSize.width = e.detail.width;
      lastKnownSize.height = e.detail.height;
      console.log(
        `lastKnownSize初期化: ${lastKnownSize.width}x${lastKnownSize.height}`
      );
    });

    document.addEventListener("mouseup", () => {
      if (userIsResizing) {
        // リサイズ終了時に少し遅延してサイズを保存
        setTimeout(() => {
          const currentWidth = panel.offsetWidth;
          const currentHeight = panel.offsetHeight;

          // サイズが実際に変わった場合のみ保存
          if (
            currentWidth !== lastKnownSize.width ||
            currentHeight !== lastKnownSize.height
          ) {
            console.log(
              `ユーザーリサイズ完了: ${lastKnownSize.width}x${lastKnownSize.height} → ${currentWidth}x${currentHeight}`
            );

            if (currentWidth > 300) {
              storedPanelWidth = `${currentWidth}px`;
              localStorage.setItem(
                "stbDiffViewer_panelWidth",
                storedPanelWidth
              );
              console.log(`Panel width saved on mouseup: ${currentWidth}px`);
            }
            if (currentHeight > 100) {
              storedPanelHeight = `${currentHeight}px`;
              localStorage.setItem(
                "stbDiffViewer_panelHeight",
                storedPanelHeight
              );
              console.log(`Panel height saved on mouseup: ${currentHeight}px`);
            }
          }

          userIsResizing = false;
        }, 100); // マウスアップ後少し待つ
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      // プログラム的な変更を無視
      if (panel._ignoreResize) {
        console.log("ResizeObserver: 無視（プログラム的な変更）");
        return;
      }

      // デバウンス処理：連続的なリサイズイベントを制限
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // 再度チェック（デバウンス期間中にフラグが変わる可能性があるため）
        if (panel._ignoreResize) {
          console.log("ResizeObserver: 遅延後も無視");
          return;
        }

        // サイズが変更されたかチェック
        const currentWidth = panel.offsetWidth;
        const currentHeight = panel.offsetHeight;

        // 既知のサイズと異なる場合（ユーザーリサイズまたは他の要因）
        if (
          currentWidth !== lastKnownSize.width ||
          currentHeight !== lastKnownSize.height
        ) {
          console.log(
            `ResizeObserver: サイズ変更検出 ${lastKnownSize.width}x${lastKnownSize.height} → ${currentWidth}x${currentHeight}`
          );

          // ユーザーがリサイズ中、または一定以上のサイズ変更の場合に保存
          const isSignificantChange =
            Math.abs(currentWidth - lastKnownSize.width) > 10 ||
            Math.abs(currentHeight - lastKnownSize.height) > 10;

          if (userIsResizing || isSignificantChange) {
            if (currentWidth > 300) {
              storedPanelWidth = `${currentWidth}px`;
              localStorage.setItem(
                "stbDiffViewer_panelWidth",
                storedPanelWidth
              );
              console.log(
                `Panel width saved by ResizeObserver: ${currentWidth}px`
              );
            }
            if (currentHeight > 100) {
              storedPanelHeight = `${currentHeight}px`;
              localStorage.setItem(
                "stbDiffViewer_panelHeight",
                storedPanelHeight
              );
              console.log(
                `Panel height saved by ResizeObserver: ${currentHeight}px`
              );
            }
          }

          // 最後に確認したサイズを更新
          lastKnownSize.width = currentWidth;
          lastKnownSize.height = currentHeight;
        }
      }, 200); // デバウンス時間
    });
    resizeObserver.observe(panel);
    panel.hasResizeObserver = true;
    console.log("ResizeObserver設定完了");
  }

  // 保存された高さがあれば適用
  if (storedPanelHeight) {
    panel.style.height = storedPanelHeight;
  }

  // IDやタイプがnullならパネルをクリア
  if (elementType === null || (idA === null && idB === null)) {
    contentDiv.innerHTML = "要素を選択してください。"; // デフォルトメッセージ
    return;
  }

  let nodeA = null;
  let nodeB = null;
  let title = "";
  const tagName = elementType === "Node" ? "StbNode" : `Stb${elementType}`;

  // モデルAの要素を取得試行
  if (idA && window.docA) {
    console.log(`Searching for ${tagName}[id="${idA}"] in model A`); // デバッグ用
    nodeA = window.docA.querySelector(`${tagName}[id="${idA}"]`);
    if (!nodeA) {
      console.warn(
        `Element ${elementType} with ID ${idA} not found in model A.`
      );
      // 全ての該当要素を確認
      const allElements = window.docA.querySelectorAll(tagName);
      console.log(`Total ${tagName} elements in model A:`, allElements.length);
      if (allElements.length > 0) {
        console.log(
          `First few IDs:`,
          Array.from(allElements)
            .slice(0, 5)
            .map((el) => el.getAttribute("id"))
        );
      }
    } else {
      console.log(`Found element ${elementType} with ID ${idA} in model A`); // デバッグ用
    }
  } else if (idA && !window.docA) {
    console.error(`XML document for model A not found.`);
    // モデルAのデータがない場合はエラーメッセージを表示しても良いが、ここでは警告のみ
  }

  // モデルBの要素を取得試行
  if (idB && window.docB) {
    console.log(`Searching for ${tagName}[id="${idB}"] in model B`); // デバッグ用
    nodeB = window.docB.querySelector(`${tagName}[id="${idB}"]`);
    if (!nodeB) {
      console.warn(
        `Element ${elementType} with ID ${idB} not found in model B.`
      );
      // 全ての該当要素を確認
      const allElements = window.docB.querySelectorAll(tagName);
      console.log(`Total ${tagName} elements in model B:`, allElements.length);
      if (allElements.length > 0) {
        console.log(
          `First few IDs:`,
          Array.from(allElements)
            .slice(0, 5)
            .map((el) => el.getAttribute("id"))
        );
      }
    } else {
      console.log(`Found element ${elementType} with ID ${idB} in model B`); // デバッグ用
    }
  } else if (idB && !window.docB) {
    console.error(`XML document for model B not found.`);
  }

  // 要素が両方見つからない場合はエラー表示
  if (!nodeA && !nodeB) {
    panel.textContent = `エラー: ID ${idA ? `A:${idA}` : ""}${
      idA && idB ? ", " : ""
    }${idB ? `B:${idB}` : ""} の ${elementType} 要素が見つかりません。`;
    console.error(
      `Element ${elementType} with ID A:${idA} or B:${idB} not found.`
    );
    return;
  }

  // タイトル設定（XSDスキーマ状況を含む）
  let schemaInfo = "";
  const schemaElementName =
    elementType === "Node" ? "StbNode" : `Stb${elementType}`;

  if (isSchemaLoaded()) {
    const attrCount = getAllAttributeNames(schemaElementName).length;
    if (attrCount > 0) {
      schemaInfo = ` <span style="color: green; font-size: 0.8em;">[XSD: ${attrCount}属性]</span>`;
    } else {
      schemaInfo = ` <span style="color: orange; font-size: 0.8em;">[XSD: ${schemaElementName}未定義]</span>`;
      console.warn(
        `XSD schema loaded but ${schemaElementName} not found in definitions`
      );
    }
  } else {
    schemaInfo =
      ' <span style="color: red; font-size: 0.8em;">[XSD: 未読込]</span>';
  }

  // デバッグ出力
  console.log(`Schema status for ${schemaElementName}:`, {
    schemaLoaded: isSchemaLoaded(),
    attributeCount: getAllAttributeNames(schemaElementName).length,
    availableElements: isSchemaLoaded() ? "Available in console" : "None",
  });

  // スキーマが読み込まれている場合、利用可能な要素一覧をコンソールに出力
  if (isSchemaLoaded()) {
    import("../../parser/xsdSchemaParser.js").then(
      ({ getAvailableElements }) => {
        console.log("Available XSD elements:", getAvailableElements());
      }
    );
  }

  if (nodeA && nodeB) {
    title = `比較: ${elementType} (A: ${idA}, B: ${idB})${schemaInfo}`;
  } else if (nodeA) {
    title = `モデル A: ${elementType} (ID: ${idA})${schemaInfo}`;
  } else {
    // nodeB のみ
    title = `モデル B: ${elementType} (ID: ${idB})${schemaInfo}`;
  }

  // showInfoを呼び出して情報を表示 (nodeA, nodeB を渡す)
  showInfo(nodeA, nodeB, panel, title, contentDiv, modelSource, elementType);
}

/**
 * モデルAとモデルBのXML要素ノードを受け取り、比較情報を整形してパネルに表示する。
 * 属性、子要素、断面情報を1つのテーブルに統合して比較表示する。
 * モデルが一つだけの場合は、単一モデル用の表示にレイアウトを調整する。
 * @param {Element | null} nodeA - モデルAのXML要素ノード (存在しない場合は null)。
 * @param {Element | null} nodeB - モデルBのXML要素ノード (存在しない場合は null)。
 * @param {HTMLElement} panel - 表示先のHTML要素。
 * @param {string} title - パネルに表示するタイトル。
 * @param {HTMLElement} contentDiv - コンテンツ表示用のHTML要素。
 * @param {string | null} modelSource - 要素のモデルソース ('A', 'B', 'matched', またはnull)
 * @param {string | null} elementType - 要素タイプ (色付け用)
 */
function showInfo(
  nodeA,
  nodeB,
  panel,
  title,
  contentDiv,
  modelSource = null,
  elementType = null
) {
  console.log("Title:", title);
  if (!panel || !contentDiv) {
    console.error("Panel or contentDiv is missing in showInfo");
    return;
  }

  let content = `<h3>${title}</h3>`;

  // モデルが一つだけかどうかを判定
  const hasModelA = !!window.docA;
  const hasModelB = !!window.docB;
  const isSingleModel = (hasModelA && !hasModelB) || (!hasModelA && hasModelB);
  const hasOnlyA = nodeA && !nodeB;
  const hasOnlyB = !nodeA && nodeB;
  const showSingleColumn = isSingleModel || hasOnlyA || hasOnlyB;

  // --- 統合比較テーブルの生成 ---
  // tbodyにidを付与して、イベントデリゲーションで折りたたみ制御
  content += '<table class="unified-comparison-table">';

  if (showSingleColumn) {
    // 単一モデル表示用のテーブルヘッダー
    const modelName = hasOnlyA || hasModelA ? "モデル A" : "モデル B";
    content += `<thead><tr><th style="width: 50%;">要素 / 属性</th><th style="width: 50%;">${modelName}</th></tr></thead>`;
  } else {
    // 比較表示用のテーブルヘッダー（従来通り）
    content +=
      '<thead><tr><th style="width: 40%;">要素 / 属性</th><th style="width: 30%;">モデル A</th><th style="width: 30%;">モデル B</th></tr></thead>';
  }

  content += `<tbody id="element-info-tbody">`;

  // ルート要素の比較表示
  content += renderComparisonRecursive(
    nodeA,
    nodeB,
    0,
    "root",
    showSingleColumn,
    modelSource,
    elementType
  );

  // 断面情報の比較表示 (id_section があれば)
  const sectionIdA = nodeA?.getAttribute("id_section");
  const sectionIdB = nodeB?.getAttribute("id_section");
  const hasSectionInfo = sectionIdA || sectionIdB; // どちらかに断面IDがあれば処理

  if (hasSectionInfo) {
    const sectionNodeA = sectionIdA
      ? findSectionNode(window.docA, sectionIdA)
      : null;
    const sectionNodeB = sectionIdB
      ? findSectionNode(window.docB, sectionIdB)
      : null;

    // 断面情報セクションのヘッダー行を追加
    if (showSingleColumn) {
      const sectionId = sectionIdA || sectionIdB;
      content += `<tr class="section-header-row"><td colspan="2">▼ 断面情報 (ID: ${sectionId})</td></tr>`;
    } else {
      content += `<tr class="section-header-row"><td colspan="3">▼ 断面情報 (A: ${
        sectionIdA ?? "なし"
      }, B: ${sectionIdB ?? "なし"})</td></tr>`;
    }

    // 断面要素の比較表示 (ルート要素と同じレベルで表示)
    content += renderComparisonRecursive(
      sectionNodeA,
      sectionNodeB,
      0,
      "section",
      showSingleColumn,
      modelSource,
      elementType
    ); // レベル0から開始
  }

  content += "</tbody></table>";

  contentDiv.innerHTML = content;

  // --- 折りたたみイベントの追加 ---
  const tbody = contentDiv.querySelector("#element-info-tbody");
  if (tbody) {
    tbody.addEventListener("click", function (e) {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      const targetId = btn.dataset.targetId;
      if (!targetId) return;
      const rows = tbody.querySelectorAll(`tr[data-parent='${targetId}']`);
      const expanded = btn.textContent === "-";
      btn.textContent = expanded ? "+" : "-";
      rows.forEach((row) => {
        row.style.display = expanded ? "none" : "";
        // 折りたたむときは子孫も再帰的に閉じる
        if (expanded) {
          const childBtn = row.querySelector(".toggle-btn");
          if (childBtn && childBtn.textContent === "-") {
            childBtn.textContent = "+";
            const childId = childBtn.dataset.targetId;
            const childRows = tbody.querySelectorAll(
              `tr[data-parent='${childId}']`
            );
            childRows.forEach((r) => (r.style.display = "none"));
          }
        }
      });
    });
  }

  // --- スタイル定義 ---
  let style = panel.querySelector("style#element-info-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "element-info-styles";
    panel.appendChild(style);
  }
  style.textContent = `
        /* --- 統合比較テーブル --- */
        .unified-comparison-table {
            width: 100%; border-collapse: collapse; margin-bottom: 1em; font-size: 0.85em;
            table-layout: fixed;
        }
        .unified-comparison-table th, .unified-comparison-table td {
            border: 1px solid #e0e0e0; padding: 3px 5px; text-align: left; vertical-align: top;
            word-wrap: break-word;
        }
        .unified-comparison-table th { background-color: #f8f8f8; font-weight: bold; }

        /* 要素名の行 */
        .unified-comparison-table tr.element-row > td:first-child {
             background-color: #f0f8ff; /* 要素行の背景色 */
             white-space: nowrap;
             overflow: hidden;
             text-overflow: ellipsis;
             font-weight: bold; /* 要素名を太字に */
        }
        /* 属性名/ラベルの行 */
        .unified-comparison-table tr:not(.element-row) > td:first-child {
             color: #666; /* 属性名/ラベルの色 */
             white-space: nowrap;
        }
        /* 差分ハイライト */
        .unified-comparison-table td.differs {
            background-color: #fff3cd;
            font-weight: bold;
        }
        /* 断面情報ヘッダー行 */
        .unified-comparison-table tr.section-header-row > td {
            background-color: #e9ecef;
            font-weight: bold;
            text-align: center;
            padding: 5px;
            border-top: 2px solid #ccc; /* 上に区切り線 */
            margin-top: 5px; /* 少し間隔を空ける */
        }

        /* テキスト要素のスタイル */
        .unified-comparison-table .tag-name { /* .tag-name は要素名セル内で使用 */ }
        .unified-comparison-table .attr-name { /* .attr-name は属性名セル内で使用 */ }
        .unified-comparison-table .attr-value { color: #007acc; }
        .unified-comparison-table .text-label { font-style: italic; color: #555; }
        .unified-comparison-table .text-content {
            font-style: italic; color: #555;
            white-space: pre-wrap;
            word-break: break-all;
        }
        /* 値がない場合のスタイル */
        .unified-comparison-table .no-value {
             color: #999;
             font-style: italic;
        }
        
        /* 単一モデル表示時のパネル幅調整 */
        ${
          showSingleColumn
            ? `
        .unified-comparison-table th:first-child,
        .unified-comparison-table td:first-child {
            width: 50% !important;
        }
        .unified-comparison-table th:last-child,
        .unified-comparison-table td:last-child {
            width: 50% !important;
        }
        `
            : `
        /* 比較モード時は3カラムのままでCSSによる幅制御は最小限に */
        `
        }
    `;
}

/**
 * 編集モードの切り替え
 */
export function toggleEditMode() {
  editMode = !editMode;
  const editButton = document.getElementById("edit-mode-button");
  if (editButton) {
    editButton.textContent = editMode ? "終了" : "編集";
    if (editMode) {
      editButton.style.background = "#fff3cd";
      editButton.style.borderColor = "#ffeaa7";
      editButton.style.color = "#856404";
    } else {
      editButton.style.background = "#f8f9fa";
      editButton.style.borderColor = "#dee2e6";
      editButton.style.color = "#6c757d";
    }
  }

  // 現在表示中の要素を再表示して編集UIを反映
  if (currentEditingElement) {
    const { idA, idB, elementType, modelSource } = currentEditingElement;
    displayElementInfo(idA, idB, elementType, modelSource);
  }
}

/**
 * 修正をエクスポート
 */
export function exportModifications() {
  if (modifications.length === 0) {
    alert("修正がありません。");
    return;
  }

  // モデルAまたはBのドキュメントを選択
  const sourceDoc = window.docA || window.docB;
  if (!sourceDoc) {
    alert("エクスポート対象のドキュメントがありません。");
    return;
  }

  // エクスポート前のバリデーション
  const validation = validateDocumentForExport(sourceDoc);
  console.log("Export validation:", validation);

  // ユーザーに確認
  const proceed = confirm(
    `${modifications.length}件の修正をエクスポートしますか？\n\n` +
      `バリデーション: ${validation.message}`
  );

  if (proceed) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `modified_stb_${timestamp}.stb`;

    exportModifiedStb(sourceDoc, modifications, filename).then((success) => {
      if (success) {
        alert(
          `STBファイルが正常にエクスポートされました。\nファイル名: ${filename}`
        );

        // 修正レポートも生成
        const report = generateModificationReport(modifications);
        console.log("Modification Report:\n", report);
      } else {
        alert(
          "エクスポートに失敗しました。コンソールでエラーを確認してください。"
        );
      }
    });
  }
}

/**
 * 属性値を編集（新しいParameterEditorを使用）
 * @param {string} elementType - 要素タイプ
 * @param {string} elementId - 要素ID
 * @param {string} attributeName - 属性名
 * @param {string} currentValue - 現在の値
 */
async function editAttributeValue(
  elementType,
  elementId,
  attributeName,
  currentValue
) {
  try {
    // サジェスト候補を取得
    const suggestions = SuggestionEngine.getSuggestions(
      elementType,
      attributeName,
      { currentValue, elementId }
    );

    // 属性情報を取得
    const tagName = elementType === "Node" ? "StbNode" : `Stb${elementType}`;
    const attrInfo = getAttributeInfo(tagName, attributeName);

    // ParameterEditorの設定
    const config = {
      attributeName,
      currentValue: currentValue || "",
      suggestions,
      elementType,
      elementId,
      allowFreeText:
        !attrInfo || !suggestions.length || suggestions.length > 10,
      required: attrInfo ? attrInfo.required : false,
    };

    // 新しいParameterEditorモーダルを表示
    const newValue = await ParameterEditor.show(config);

    if (newValue === null) {
      console.log("編集がキャンセルされました");
      return; // キャンセル
    }

    // 使用統計を記録
    SuggestionEngine.recordUsage(elementType, attributeName, newValue);

    // 修正を記録
    modifications.push({
      elementType,
      id: elementId,
      attribute: attributeName,
      oldValue: currentValue,
      newValue: newValue,
    });

    // UIを更新（現在の要素を再表示）
    if (currentEditingElement) {
      const { idA, idB, modelSource } = currentEditingElement;
      displayElementInfo(idA, idB, elementType, modelSource);
    }

    console.log(
      `修正を記録: ${elementType}(${elementId}).${attributeName} = "${newValue}"`
    );
    updateEditingSummary();
  } catch (error) {
    console.error("属性編集中にエラーが発生しました:", error);

    // フォールバック: 従来のprompt()を使用
    console.log("フォールバック: 従来の編集方法を使用します");
    const newValue = prompt(
      `属性「${attributeName}」の新しい値を入力してください:`,
      currentValue || ""
    );

    if (newValue === null) return; // キャンセル

    // XSDバリデーション
    if (isSchemaLoaded()) {
      const tagName = elementType === "Node" ? "StbNode" : `Stb${elementType}`;
      const validation = validateAttributeValue(
        tagName,
        attributeName,
        newValue
      );

      if (!validation.valid) {
        const proceed = confirm(
          `警告: ${validation.error}\n\n` +
            (validation.suggestions
              ? `推奨値: ${validation.suggestions.join(", ")}\n\n`
              : "") +
            "それでも続行しますか？"
        );
        if (!proceed) return;
      }
    }

    // 修正を記録
    modifications.push({
      elementType,
      id: elementId,
      attribute: attributeName,
      oldValue: currentValue,
      newValue: newValue,
    });

    // UIを更新
    if (currentEditingElement) {
      const { idA, idB, modelSource } = currentEditingElement;
      displayElementInfo(idA, idB, elementType, modelSource);
    }

    console.log(
      `修正を記録: ${elementType}(${elementId}).${attributeName} = "${newValue}"`
    );
    updateEditingSummary();
  }
}

/**
 * 編集サマリーを更新
 */
function updateEditingSummary() {
  const summaryElement = document.getElementById("editing-summary");
  if (summaryElement) {
    summaryElement.innerHTML = `
      修正: ${modifications.length}件
      ${
        modifications.length > 0
          ? '<button id="export-btn" style="font-size: 0.6em; padding: 1px 4px; margin-left: 3px; background: #d4edda; border: 1px solid #c3e6cb; color: #155724;" onclick="window.exportModifications()">出力</button>'
          : ""
      }
      ${
        modifications.length > 0
          ? '<button id="clear-modifications-btn" style="font-size: 0.6em; padding: 1px 4px; margin-left: 2px; background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24;" onclick="window.clearModifications()">削除</button>'
          : ""
      }
    `;
  }
}

/**
 * 修正履歴をクリア
 */
export function clearModifications() {
  if (modifications.length === 0) return;

  const proceed = confirm(
    `${modifications.length}件の修正履歴をクリアしますか？`
  );
  if (proceed) {
    modifications = [];
    updateEditingSummary();
    console.log("修正履歴をクリアしました");
  }
}

// グローバル関数として登録（HTML内のonclickから呼び出すため）
window.exportModifications = exportModifications;
window.clearModifications = clearModifications;
window.toggleEditMode = toggleEditMode;
window.editAttribute = editAttributeValue;

/**
 * 指定されたドキュメントの StbSections 内から、指定IDを持つ断面要素を検索する。
 * @param {XMLDocument | null} doc - 検索対象のXMLドキュメント。
 * @param {string} sectionId - 検索する断面ID。
 * @returns {Element | null} 見つかった断面要素、または null。
 */
function findSectionNode(doc, sectionId) {
  if (!doc || !sectionId) {
    return null;
  }
  // StbSections 内のすべての直接の子要素から ID で検索
  return doc.querySelector(`StbSections > *[id="${sectionId}"]`);
}

/**
 * S造断面寸法をStbSecSteelから引き当てる関数
 * @param {string} shapeName - 断面形状名
 * @returns {Object | null} 断面寸法情報、または null
 */
function findSteelSectionInfo(shapeName) {
  if (!window.docA && !window.docB) return null;
  // どちらかのdocからStbSecSteelを取得
  const doc = window.docA || window.docB;
  if (!doc) return null;
  const steel = doc.querySelector("StbSecSteel");
  if (!steel) return null;
  // H形鋼
  let el = steel.querySelector(`StbSecRoll-H[name="${shapeName}"]`);
  if (el) {
    return {
      type: "H",
      A: el.getAttribute("A"),
      B: el.getAttribute("B"),
      t1: el.getAttribute("t1"),
      t2: el.getAttribute("t2"),
      r: el.getAttribute("r"),
    };
  }
  // 角形鋼管
  el = steel.querySelector(`StbSecRoll-BOX[name="${shapeName}"]`);
  if (el) {
    return {
      type: "BOX",
      A: el.getAttribute("A"),
      B: el.getAttribute("B"),
      t: el.getAttribute("t"),
      r: el.getAttribute("r"),
    };
  }
  // L形鋼
  el = steel.querySelector(`StbSecRoll-L[name="${shapeName}"]`);
  if (el) {
    return {
      type: "L",
      A: el.getAttribute("A"),
      B: el.getAttribute("B"),
      t1: el.getAttribute("t1"),
      t2: el.getAttribute("t2"),
      r1: el.getAttribute("r1"),
      r2: el.getAttribute("r2"),
    };
  }
  // その他必要に応じて追加
  return null;
}

/**
 * XML要素とその子孫を再帰的に比較処理し、3列比較テーブルまたは2列単一モデルテーブルの行HTMLを生成する。
 * @param {Element | null} nodeA - モデルAの要素。
 * @param {Element | null} nodeB - モデルBの要素。
 * @param {number} level - 現在の階層レベル (インデント用)。
 * @param {string} parentId - 親要素のID (折りたたみ制御用)。
 * @param {boolean} showSingleColumn - 単一モデル表示かどうか。
 * @param {string | null} modelSource - 要素のモデルソース ('A', 'B', 'matched', またはnull)
 * @param {string | null} elementType - 要素タイプ (色付け用)
 * @returns {string} テーブル行(<tr>...</tr>)のHTML文字列。子孫要素の行も含む。
 */
function renderComparisonRecursive(
  nodeA,
  nodeB,
  level,
  parentId,
  showSingleColumn = false,
  modelSource = null,
  elementType = null
) {
  if (!nodeA && !nodeB) return ""; // 両方なければ何も表示しない

  let rowsHtml = "";
  const indentStyle = `padding-left: ${level * 1.5}em;`;
  const attrIndentStyle = `padding-left: ${(level + 1.5) * 1.5}em;`;

  // --- 一意なID生成 ---
  const tagNameA = nodeA?.tagName;
  const tagNameB = nodeB?.tagName;
  const displayTagName = tagNameA ?? tagNameB;
  const idA = nodeA?.getAttribute?.("id") ?? "";
  const idB = nodeB?.getAttribute?.("id") ?? "";
  const rowId = `row_${displayTagName}_${idA}_${idB}_${level}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  // --- 要素タイプの判定 ---
  // パラメータから渡されたelementTypeを優先し、なければタグ名から推定
  let currentElementType = elementType;
  if (!currentElementType && displayTagName) {
    // STBタグ名から要素タイプを抽出 (例: StbColumn -> Column, StbNode -> Node)
    if (displayTagName.startsWith("Stb")) {
      currentElementType = displayTagName.slice(3); // "Stb"を除去
      if (currentElementType === "Node") {
        currentElementType = "Node"; // 特別な場合
      }
    }
  }

  // --- 要素名行 ---
  rowsHtml += `<tr class="element-row" data-id="${rowId}"${
    parentId ? ` data-parent="${parentId}"` : ""
  }>`;
  let elementCell = `<td style="${indentStyle} white-space: nowrap;">`;
  elementCell += `<span class="toggle-btn" data-target-id="${rowId}" style="margin-right:5px;display:inline-block;width:1em;text-align:center;font-weight:bold;cursor:pointer;color:#666;">-</span>`;
  elementCell += `<span class="tag-name">${displayTagName}</span>`;
  if (tagNameA && tagNameB && tagNameA !== tagNameB) {
    elementCell += ` <span style="color: red; font-size: 0.8em;">(A: ${tagNameA}, B: ${tagNameB})</span>`;
  }
  elementCell += "</td>";
  rowsHtml += elementCell;

  if (showSingleColumn) {
    rowsHtml += "<td></td>";
  } else {
    rowsHtml += "<td></td><td></td>";
  }
  rowsHtml += "</tr>";
  // --- 属性行（XSDスキーマ対応版） ---
  const attrsA = nodeA ? getAttributesMap(nodeA) : new Map();
  const attrsB = nodeB ? getAttributesMap(nodeB) : new Map();

  // XSDスキーマから完全な属性リストを取得
  let allAttrNames = new Set([...attrsA.keys(), ...attrsB.keys()]);

  // XSDスキーマが利用可能な場合、スキーマ定義の属性も追加
  if (isSchemaLoaded() && displayTagName) {
    const schemaAttributes = getAllAttributeNames(displayTagName);
    schemaAttributes.forEach((attr) => allAttrNames.add(attr));
  }

  const attrRowDisplay = "";

  if (allAttrNames.size > 0) {
    const sortedAttrNames = Array.from(allAttrNames).sort((a, b) => {
      const prioritized = ["id", "guid", "name"];
      const idxA = prioritized.indexOf(a);
      const idxB = prioritized.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const attrName of sortedAttrNames) {
      // shape属性は子要素ノードで個別に表示するためここではスキップ
      if (attrName === "shape") continue;

      const valueA = attrsA.get(attrName);
      const valueB = attrsB.get(attrName);

      // XSDスキーマから属性情報を取得
      const attrInfo = isSchemaLoaded()
        ? getAttributeInfo(displayTagName, attrName)
        : null;
      const isRequired = attrInfo?.required || false;
      const hasDefault = attrInfo?.default || attrInfo?.fixed;
      const documentation = attrInfo?.documentation;

      if (showSingleColumn) {
        // 単一モデル表示の場合
        const singleValue = valueA || valueB;
        let displayValue = singleValue ?? '<span class="no-value">-</span>';

        // 編集モードの場合、編集ボタンを追加
        if (editMode && currentEditingElement) {
          const { elementType: currentElementType } = currentEditingElement;
          const currentId = valueA ? idA : idB;
          displayValue += ` <button class="edit-btn" style="font-size: 0.6em; padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentElementType}', '${currentId}', '${attrName}', '${
            singleValue || ""
          }')" title="編集">✏️</button>`;
        }

        // XSDスキーマからの情報を付加
        if (attrInfo) {
          let attrLabel = "";
          if (isRequired)
            attrLabel +=
              '<span style="color:red;font-size:0.9em;" title="必須パラメータ">🔴</span> ';
          attrLabel += attrName;
          if (hasDefault)
            attrLabel += ` <span style="color:blue;font-size:0.8em;" title="デフォルト値: ${hasDefault}">(${hasDefault})</span>`;

          rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
          rowsHtml += `<td style="${attrIndentStyle}" title="${
            documentation || ""
          }"><span class="attr-name">${attrLabel}</span></td>`;
          // モデルソースに基づく背景色を適用（重要度ベース）
          const valueStyle = getSingleValueBackgroundColor(
            modelSource,
            currentElementType,
            attrName
          );
          rowsHtml += `<td style="${valueStyle}">${displayValue}</td>`;
          rowsHtml += "</tr>";
        } else {
          rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
          rowsHtml += `<td style="${attrIndentStyle}"><span class="attr-name">${attrName}</span></td>`;
          // モデルソースに基づく背景色を適用（重要度ベース）
          const valueStyle = getSingleValueBackgroundColor(
            modelSource,
            currentElementType,
            attrName
          );
          rowsHtml += `<td style="${valueStyle}">${displayValue}</td>`;
          rowsHtml += "</tr>";
        }
      } else {
        // 比較表示の場合
        let displayValueA = valueA ?? '<span class="no-value">-</span>';
        let displayValueB = valueB ?? '<span class="no-value">-</span>';

        // 編集モードの場合、編集ボタンを追加
        if (editMode && currentEditingElement) {
          const { elementType: currentElementType } = currentEditingElement;
          if (valueA !== undefined && idA) {
            displayValueA += ` <button class="edit-btn" style="font-size: 0.6em; padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentElementType}', '${idA}', '${attrName}', '${
              valueA || ""
            }')" title="編集">✏️</button>`;
          }
          if (valueB !== undefined && idB) {
            displayValueB += ` <button class="edit-btn" style="font-size: 0.6em; padding: 1px 2px; background: none; border: none; opacity: 0.5; cursor: pointer;" onclick="window.editAttribute('${currentElementType}', '${idB}', '${attrName}', '${
              valueB || ""
            }')" title="編集">✏️</button>`;
          }
        }

        const differs =
          nodeA &&
          nodeB &&
          valueA !== valueB &&
          valueA !== undefined &&
          valueB !== undefined;
        const highlightClass = differs ? ' class="differs"' : "";

        // 各値の背景色を設定（比較表示用・重要度ベース）
        const valueAStyle =
          valueA !== undefined && valueA !== null
            ? modelSource === "B"
              ? ""
              : getModelSourceBackgroundColor(
                  "A",
                  true,
                  false,
                  currentElementType,
                  attrName
                )
            : "";
        const valueBStyle =
          valueB !== undefined && valueB !== null
            ? modelSource === "A"
              ? ""
              : getModelSourceBackgroundColor(
                  "B",
                  false,
                  true,
                  currentElementType,
                  attrName
                )
            : "";

        // XSDスキーマからの情報を付加
        if (attrInfo) {
          let attrLabel = "";
          if (isRequired)
            attrLabel +=
              '<span style="color:red;font-size:0.9em;" title="必須パラメータ">🔴</span> ';
          attrLabel += attrName;
          if (hasDefault)
            attrLabel += ` <span style="color:blue;font-size:0.8em;" title="デフォルト値: ${hasDefault}">(${hasDefault})</span>`;

          rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
          rowsHtml += `<td style="${attrIndentStyle}" title="${
            documentation || ""
          }"><span class="attr-name">${attrLabel}</span></td>`;
          rowsHtml += `<td${highlightClass} style="${valueAStyle}">${displayValueA}</td>`;
          rowsHtml += `<td${highlightClass} style="${valueBStyle}">${displayValueB}</td>`;
          rowsHtml += "</tr>";
        } else {
          rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
          rowsHtml += `<td style="${attrIndentStyle}"><span class="attr-name">${attrName}</span></td>`;
          rowsHtml += `<td${highlightClass} style="${valueAStyle}">${displayValueA}</td>`;
          rowsHtml += `<td${highlightClass} style="${valueBStyle}">${displayValueB}</td>`;
          rowsHtml += "</tr>";
        }
      }
    }
  }

  // --- shape属性を持つ「直接の子要素」だけ寸法付きで1行ずつ表示 ---
  function renderShapeWithSteelInfo(shape) {
    if (!shape) return "";
    const steelInfo = findSteelSectionInfo(shape);
    if (!steelInfo) return `<span>${shape}</span>`;
    if (steelInfo.type === "H") {
      return `<span>${shape} <span style="color:#888;font-size:0.9em;">[A=${steelInfo.A}, B=${steelInfo.B}, t1=${steelInfo.t1}, t2=${steelInfo.t2}, r=${steelInfo.r}]</span></span>`;
    }
    if (steelInfo.type === "BOX") {
      return `<span>${shape} <span style="color:#888;font-size:0.9em;">[A=${steelInfo.A}, B=${steelInfo.B}, t=${steelInfo.t}, r=${steelInfo.r}]</span></span>`;
    }
    if (steelInfo.type === "L") {
      return `<span>${shape} <span style="color:#888;font-size:0.9em;">[A=${steelInfo.A}, B=${steelInfo.B}, t1=${steelInfo.t1}, t2=${steelInfo.t2}, r1=${steelInfo.r1}, r2=${steelInfo.r2}]</span></span>`;
    }
    return `<span>${shape}</span>`;
  }

  // --- 3. テキストコンテンツを表示する行 ---
  const textA = nodeA?.textContent?.trim();
  const textB = nodeB?.textContent?.trim();
  let hasMeaningfulTextA = false;
  let hasMeaningfulTextB = false;

  if (nodeA && nodeA.children.length === 0 && textA) {
    let attrsTextA = "";
    for (let i = 0; i < nodeA.attributes.length; i++) {
      attrsTextA += nodeA.attributes[i].value;
    }
    if (textA !== attrsTextA.trim()) hasMeaningfulTextA = true;
  }
  if (nodeB && nodeB.children.length === 0 && textB) {
    let attrsTextB = "";
    for (let i = 0; i < nodeB.attributes.length; i++) {
      attrsTextB += nodeB.attributes[i].value;
    }
    if (textB !== attrsTextB.trim()) hasMeaningfulTextB = true;
  }
  const textRowDisplay = "";
  if (hasMeaningfulTextA || hasMeaningfulTextB) {
    if (showSingleColumn) {
      // 単一モデル表示の場合
      const singleText = hasMeaningfulTextA
        ? textA
        : hasMeaningfulTextB
        ? textB
        : "";
      const displayText = singleText
        ? singleText
        : '<span class="no-value">-</span>';

      rowsHtml += `<tr data-parent="${rowId}"${textRowDisplay}>`;
      rowsHtml += `<td style="${attrIndentStyle}"><span class="text-label">(内容)</span></td>`;
      rowsHtml += `<td><span class="text-content">${displayText}</span></td>`;
      rowsHtml += "</tr>";
    } else {
      // 比較表示の場合（従来通り）
      const displayTextA = hasMeaningfulTextA
        ? textA
        : '<span class="no-value">-</span>';
      const displayTextB = hasMeaningfulTextB
        ? textB
        : '<span class="no-value">-</span>';
      const differs =
        nodeA &&
        nodeB &&
        hasMeaningfulTextA &&
        hasMeaningfulTextB &&
        textA !== textB;
      const highlightClass = differs ? ' class="differs"' : "";

      rowsHtml += `<tr data-parent="${rowId}"${textRowDisplay}>`;
      rowsHtml += `<td style="${attrIndentStyle}"><span class="text-label">(内容)</span></td>`;
      rowsHtml += `<td${highlightClass}><span class="text-content">${displayTextA}</span></td>`;
      rowsHtml += `<td${highlightClass}><span class="text-content">${displayTextB}</span></td>`;
      rowsHtml += "</tr>";
    }
  }

  // --- 4. 子要素の行を再帰的に生成して追加 ---
  const childrenA = nodeA?.children ? Array.from(nodeA.children) : [];
  const childrenB = nodeB?.children ? Array.from(nodeB.children) : [];
  const maxLen = Math.max(childrenA.length, childrenB.length);

  for (let i = 0; i < maxLen; i++) {
    const childA = childrenA[i] ?? null;
    const childB = childrenB[i] ?? null;
    if (childA && childB && childA.tagName !== childB.tagName) {
      rowsHtml += renderComparisonRecursive(
        childA,
        null,
        level + 1,
        rowId,
        showSingleColumn,
        modelSource,
        null // 子要素では自動判定させる
      );
      rowsHtml += renderComparisonRecursive(
        null,
        childB,
        level + 1,
        rowId,
        showSingleColumn,
        modelSource,
        null // 子要素では自動判定させる
      );
    } else {
      rowsHtml += renderComparisonRecursive(
        childA,
        childB,
        level + 1,
        rowId,
        showSingleColumn,
        modelSource,
        null // 子要素では自動判定させる
      );
    }
  }

  // --- shape属性を持つ「直接の子要素」だけ寸法付きで1行ずつ表示 ---
  // ※「直接の子要素」が1つもない場合は何も出さない
  // ※「直接の子要素」だけを判定し、孫要素以降は再帰で処理
  if (showSingleColumn) {
    // 単一モデル表示の場合
    const children = childrenA.length > 0 ? childrenA : childrenB;
    if (children.length > 0) {
      for (const child of children) {
        if (child.hasAttribute && child.hasAttribute("shape")) {
          const shape = child.getAttribute("shape");
          rowsHtml += `<tr data-parent="${rowId}"><td style="${attrIndentStyle}"><span class="attr-name">shape</span></td><td>${renderShapeWithSteelInfo(
            shape
          )}</td></tr>`;
        }
      }
    }
  } else {
    // 比較表示の場合（従来通り）
    if (childrenA.length > 0) {
      for (const child of childrenA) {
        if (child.hasAttribute && child.hasAttribute("shape")) {
          const shape = child.getAttribute("shape");
          rowsHtml += `<tr data-parent="${rowId}"><td style="${attrIndentStyle}"><span class="attr-name">shape</span></td><td>${renderShapeWithSteelInfo(
            shape
          )}</td><td><span class="no-value">-</span></td></tr>`;
        }
      }
    }
    if (childrenB.length > 0) {
      for (const child of childrenB) {
        if (child.hasAttribute && child.hasAttribute("shape")) {
          const shape = child.getAttribute("shape");
          rowsHtml += `<tr data-parent="${rowId}"><td style="${attrIndentStyle}"><span class="attr-name">shape</span></td><td><span class="no-value">-</span></td><td>${renderShapeWithSteelInfo(
            shape
          )}</td></tr>`;
        }
      }
    }
  }

  return rowsHtml;
}

/**
 * 要素の属性をMap形式で取得するヘルパー関数
 * @param {Element} node
 * @returns {Map<string, string>} 属性名と値のマップ
 */
function getAttributesMap(node) {
  const map = new Map();
  if (node && node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      map.set(node.attributes[i].name, node.attributes[i].value);
    }
  }
  return map;
}
