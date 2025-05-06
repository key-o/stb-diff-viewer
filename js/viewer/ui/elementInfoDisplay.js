/**
 * @fileoverview 要素情報表示モジュール
 *
 * このファイルは、選択された構造要素の詳細情報を表示する機能を提供します:
 * - モデルA/B間での要素属性の比較表示
 * - STB要素の詳細属性と子要素の表示
 * - 断面情報と形状データの表示
 * - 差分のハイライト表示
 * - 折りたたみ可能な階層表示
 *
 * このモジュールは、ユーザーが選択した要素の詳細を分析するための
 * リッチな情報パネルを生成し、モデル間の差異を明確に示します。
 */

// XMLドキュメントへの参照 (main.jsのwindowオブジェクト経由で設定される想定)
// const docA = window.docA;
// const docB = window.docB;

/**
 * 指定されたIDに基づいてモデルAとモデルBの要素情報を比較表示する。
 * main.jsから呼び出される。
 * @param {string | null} idA - 表示するモデルAの要素ID。nullの場合はモデルAの要素は検索しない。
 * @param {string | null} idB - 表示するモデルBの要素ID。nullの場合はモデルBの要素は検索しない。
 * @param {string | null} elementType - 要素のタイプ ('Node', 'Column' など)。nullの場合はパネルをクリア。
 */
export function displayElementInfo(idA, idB, elementType) {
  // --- デバッグ用ログを更新 ---
  console.log("displayElementInfo called with:", {
    idA,
    idB,
    elementType,
  });
  console.log("window.docA exists:", !!window.docA);
  console.log("window.docB exists:", !!window.docB);
  // --- デバッグ用ログここまで ---

  const panel = document.getElementById("component-info");
  if (!panel) {
    console.error("Component info panel not found!");
    return;
  }

  // --- 追加: パネルの幅を画面の20%に設定 ---
  panel.style.width = "20vw";
  panel.style.minWidth = "240px"; // 必要に応じて最小幅を設定
  panel.style.maxWidth = "60vw"; // 必要に応じて最大幅を設定

  // IDやタイプがnullならパネルをクリア
  if (elementType === null || (idA === null && idB === null)) {
    panel.innerHTML = "要素を選択してください。"; // デフォルトメッセージ
    return;
  }

  let nodeA = null;
  let nodeB = null;
  let title = "";
  const tagName = elementType === "Node" ? "StbNode" : `Stb${elementType}`;

  // モデルAの要素を取得試行
  if (idA && window.docA) {
    nodeA = window.docA.querySelector(`${tagName}[id="${idA}"]`);
    if (!nodeA) {
      console.warn(
        `Element ${elementType} with ID ${idA} not found in model A.`
      );
      // 見つからなくてもエラーにはしない（Bのみ表示の場合もある）
    }
  } else if (idA && !window.docA) {
    console.error(`XML document for model A not found.`);
    // モデルAのデータがない場合はエラーメッセージを表示しても良いが、ここでは警告のみ
  }

  // モデルBの要素を取得試行
  if (idB && window.docB) {
    nodeB = window.docB.querySelector(`${tagName}[id="${idB}"]`);
    if (!nodeB) {
      console.warn(
        `Element ${elementType} with ID ${idB} not found in model B.`
      );
      // 見つからなくてもエラーにはしない（Aのみ表示の場合もある）
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

  // タイトル設定
  if (nodeA && nodeB) {
    title = `比較: ${elementType} (A: ${idA}, B: ${idB})`;
  } else if (nodeA) {
    title = `モデル A: ${elementType} (ID: ${idA})`;
  } else {
    // nodeB のみ
    title = `モデル B: ${elementType} (ID: ${idB})`;
  }

  // showInfoを呼び出して情報を表示 (nodeA, nodeB を渡す)
  showInfo(nodeA, nodeB, panel, title);
}

/**
 * モデルAとモデルBのXML要素ノードを受け取り、比較情報を整形してパネルに表示する。
 * 属性、子要素、断面情報を1つのテーブルに統合して比較表示する。
 * @param {Element | null} nodeA - モデルAのXML要素ノード (存在しない場合は null)。
 * @param {Element | null} nodeB - モデルBのXML要素ノード (存在しない場合は null)。
 * @param {HTMLElement} panel - 表示先のHTML要素。
 * @param {string} title - パネルに表示するタイトル。
 */
function showInfo(nodeA, nodeB, panel, title) {
  console.log("Title:", title);
  if (!panel) return;

  let content = `<h3>${title}</h3>`;

  // --- 統合比較テーブルの生成 ---
  // tbodyにidを付与して、イベントデリゲーションで折りたたみ制御
  content += '<table class="unified-comparison-table">';
  content +=
    '<thead><tr><th style="width: 40%;">要素 / 属性</th><th style="width: 30%;">モデル A</th><th style="width: 30%;">モデル B</th></tr></thead>';
  content += `<tbody id="element-info-tbody">`;

  // ルート要素の比較表示
  content += renderComparisonRecursive(nodeA, nodeB, 0, "root");

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

    // 断面情報セクションのヘッダー行を追加 (オプション)
    content += `<tr class="section-header-row"><td colspan="3">▼ 断面情報 (A: ${
      sectionIdA ?? "なし"
    }, B: ${sectionIdB ?? "なし"})</td></tr>`;

    // 断面要素の比較表示 (ルート要素と同じレベルで表示)
    content += renderComparisonRecursive(sectionNodeA, sectionNodeB, 0); // レベル0から開始
  }

  content += "</tbody></table>";

  panel.innerHTML = content;

  // --- 折りたたみイベントの追加 ---
  const tbody = panel.querySelector("#element-info-tbody");
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
    `;
}

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
 * XML要素とその子孫を再帰的に比較処理し、3列比較テーブルの行HTMLを生成する。
 * @param {Element | null} nodeA - モデルAの要素。
 * @param {Element | null} nodeB - モデルBの要素。
 * @param {number} level - 現在の階層レベル (インデント用)。
 * @param {string} parentId - 親要素のID (折りたたみ制御用)。
 * @returns {string} テーブル行(<tr>...</tr>)のHTML文字列。子孫要素の行も含む。
 */
function renderComparisonRecursive(nodeA, nodeB, level, parentId) {
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
  rowsHtml += "<td></td><td></td>";
  rowsHtml += "</tr>";

  // --- 属性行 ---
  const attrsA = nodeA ? getAttributesMap(nodeA) : new Map();
  const attrsB = nodeB ? getAttributesMap(nodeB) : new Map();
  const allAttrNames = new Set([...attrsA.keys(), ...attrsB.keys()]);

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
      const displayValueA = valueA ?? '<span class="no-value">-</span>';
      const displayValueB = valueB ?? '<span class="no-value">-</span>';
      const differs =
        nodeA &&
        nodeB &&
        valueA !== valueB &&
        valueA !== undefined &&
        valueB !== undefined;
      const highlightClass = differs ? ' class="differs"' : "";

      rowsHtml += `<tr data-parent="${rowId}"${attrRowDisplay}>`;
      rowsHtml += `<td style="${attrIndentStyle}"><span class="attr-name">${attrName}</span></td>`;
      rowsHtml += `<td${highlightClass}>${displayValueA}</td>`;
      rowsHtml += `<td${highlightClass}>${displayValueB}</td>`;
      rowsHtml += "</tr>";
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

  // --- 4. 子要素の行を再帰的に生成して追加 ---
  const childrenA = nodeA?.children ? Array.from(nodeA.children) : [];
  const childrenB = nodeB?.children ? Array.from(nodeB.children) : [];
  const maxLen = Math.max(childrenA.length, childrenB.length);

  for (let i = 0; i < maxLen; i++) {
    const childA = childrenA[i] ?? null;
    const childB = childrenB[i] ?? null;
    if (childA && childB && childA.tagName !== childB.tagName) {
      rowsHtml += renderComparisonRecursive(childA, null, level + 1, rowId);
      rowsHtml += renderComparisonRecursive(null, childB, level + 1, rowId);
    } else {
      rowsHtml += renderComparisonRecursive(childA, childB, level + 1, rowId);
    }
  }

  // --- shape属性を持つ「直接の子要素」だけ寸法付きで1行ずつ表示 ---
  // ※「直接の子要素」が1つもない場合は何も出さない
  // ※「直接の子要素」だけを判定し、孫要素以降は再帰で処理
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

// createAttributeRow は不要になったため削除可能
// function createAttributeRow(...) { ... }
