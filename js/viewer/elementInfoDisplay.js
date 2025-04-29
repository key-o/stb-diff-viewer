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
 * @param {Element | null} nodeA - モデルAのXML要素ノード (存在しない場合は null)。
 * @param {Element | null} nodeB - モデルBのXML要素ノード (存在しない場合は null)。
 * @param {HTMLElement} panel - 表示先のHTML要素。
 * @param {string} title - パネルに表示するタイトル。
 */
function showInfo(nodeA, nodeB, panel, title) {
  console.log("Title:", title); // ← タイトル確認用ログを追加
  if (!panel) return;
  // nodeA と nodeB が両方 null のケースは displayElementInfo で処理済み

  let content = `<h3>${title}</h3>`;

  // --- 属性を比較表形式で表示 ---
  content += "<h4>属性比較</h4>";

  const attrsA = nodeA ? getAttributesMap(nodeA) : new Map();
  const attrsB = nodeB ? getAttributesMap(nodeB) : new Map();
  const allAttrNames = new Set([...attrsA.keys(), ...attrsB.keys()]); // AとBの全属性名を取得

  if (allAttrNames.size > 0) {
    content += '<table class="info-table comparison-table">';
    content += "<thead><tr><th>属性名</th>";
    // nodeA があればモデルA列ヘッダーを追加
    if (nodeA) content += "<th>モデル A</th>";
    // nodeB があればモデルB列ヘッダーを追加
    if (nodeB) content += "<th>モデル B</th>";
    content += "</tr></thead>";
    content += "<tbody>";

    // ID, GUID, Name を優先表示
    const prioritizedAttrs = ["id", "guid", "name"];
    for (const attrName of prioritizedAttrs) {
      if (allAttrNames.has(attrName)) {
        content += createAttributeRow(
          attrName,
          attrsA,
          attrsB,
          !!nodeA,
          !!nodeB
        );
        allAttrNames.delete(attrName);
      }
    }

    // 残りの属性をアルファベット順で表示
    const sortedAttrNames = Array.from(allAttrNames).sort();
    for (const attrName of sortedAttrNames) {
      content += createAttributeRow(attrName, attrsA, attrsB, !!nodeA, !!nodeB);
    }
    content += "</tbody></table>";
  } else {
    content += "<p>(属性なし)</p>";
  }

  // --- 子要素の表示 ---
  // モデルAの子要素
  if (nodeA) {
    content += "<h4 style='margin-top: 1em;'>モデル A の子要素</h4>";
    const childNodesA = nodeA.children;
    if (childNodesA.length > 0) {
      content += '<table class="info-table">';
      content += "<thead><tr><th>要素名</th><th>内容</th></tr></thead>";
      content += "<tbody>";
      for (let i = 0; i < childNodesA.length; i++) {
        const child = childNodesA[i];
        const childContent = child.textContent ? child.textContent.trim() : "";
        content += `<tr><td>${child.tagName}</td><td>${childContent}</td></tr>`;
      }
      content += "</tbody></table>";
    } else {
      content += "<p>(子要素なし)</p>";
    }
  }
  // モデルBの子要素
  if (nodeB) {
    content += "<h4 style='margin-top: 1em;'>モデル B の子要素</h4>";
    const childNodesB = nodeB.children;
    if (childNodesB.length > 0) {
      content += '<table class="info-table">';
      content += "<thead><tr><th>要素名</th><th>内容</th></tr></thead>";
      content += "<tbody>";
      for (let i = 0; i < childNodesB.length; i++) {
        const child = childNodesB[i];
        const childContent = child.textContent ? child.textContent.trim() : "";
        content += `<tr><td>${child.tagName}</td><td>${childContent}</td></tr>`;
      }
      content += "</tbody></table>";
    } else {
      content += "<p>(子要素なし)</p>";
    }
  }

  panel.innerHTML = content;

  // スタイル定義 (既存のスタイルを適用する場合)
  const style = document.createElement("style");
  style.textContent = `
        .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 1em;
            font-size: 0.9em;
        }
        .info-table th, .info-table td {
            border: 1px solid #ddd;
            padding: 4px 6px;
            text-align: left;
            vertical-align: top;
            word-wrap: break-word; /* 長い文字列を折り返す */
        }
        .info-table th {
            background-color: #f2f2f2;
            font-weight: bold;
        }
        .info-table tbody tr:nth-child(odd) {
            background-color: #f9f9f9;
        }
        .comparison-table td.differs {
            background-color: #fff3cd; /* 差分ハイライト色 */
            font-weight: bold;
        }
    `;
  // 既存のスタイルがあれば削除してから追加
  const existingStyle = panel.querySelector("style");
  if (existingStyle) {
    panel.removeChild(existingStyle);
  }
  panel.appendChild(style);
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

/**
 * 属性比較表の行HTMLを生成するヘルパー関数
 * @param {string} attrName 属性名
 * @param {Map<string, string>} attrsA モデルAの属性マップ
 * @param {Map<string, string>} attrsB モデルBの属性マップ
 * @param {boolean} hasNodeA モデルAの要素が存在するか
 * @param {boolean} hasNodeB モデルBの要素が存在するか
 * @returns {string} テーブル行のHTML文字列
 */
function createAttributeRow(attrName, attrsA, attrsB, hasNodeA, hasNodeB) {
  const valueA = attrsA.get(attrName) ?? "-"; // 存在しない場合は "-"
  const valueB = attrsB.get(attrName) ?? "-"; // 存在しない場合は "-"
  let row = `<tr><td>${attrName}</td>`;
  let highlightClass = "";
  // AとB両方存在し、値が異なり、かつ両方とも "-" でない場合にハイライト
  if (
    hasNodeA &&
    hasNodeB &&
    valueA !== valueB &&
    valueA !== "-" &&
    valueB !== "-"
  ) {
    highlightClass = ' class="differs"';
  }

  // モデルAの列を表示 (nodeAが存在する場合)
  if (hasNodeA) {
    row += `<td${highlightClass}>${valueA}</td>`;
  }
  // モデルBの列を表示 (nodeBが存在する場合)
  if (hasNodeB) {
    // B単独表示、または比較表示でAと同じ値の場合はハイライトしない
    const highlightB = hasNodeA && highlightClass ? highlightClass : ""; // Aも存在しハイライトされている場合のみBもハイライト
    row += `<td${highlightB}>${valueB}</td>`;
  }
  row += "</tr>";
  return row;
}

// --- 初期化コード (削除) ---
// ...
