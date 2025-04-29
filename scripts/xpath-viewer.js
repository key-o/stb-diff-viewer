let editor, xmlModel;
let lastStack = [],
  lastAttr = null;
let baseStack = null,
  baseAttr = null;
let namespace = false;
let searchResults = []; // 検索結果を保存する配列
let currentResultIndex = -1; // 現在表示中の検索結果インデックス
let searchDecoration = []; // エディタのハイライト装飾を保存

// Monaco Editorの初期化
require.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs",
  },
});

require(["vs/editor/editor.main"], () => {
  // エディターの初期化
  editor = monaco.editor.create(document.getElementById("editor"), {
    language: "xml",
    theme: "vs-dark",
    automaticLayout: true,
    folding: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: true },
    lineNumbers: "on",
  });
  xmlModel = editor.getModel();

  // イベントリスナー設定
  editor.onDidChangeCursorPosition(updateXPathFromCursor);
  editor.onDidChangeCursorPosition((e) => {
    updateStatusBar(e.position);
  });

  // ステータスバーの作成
  createStatusBar();
});

// ステータスバーを作成する
function createStatusBar() {
  const statusBar = document.createElement("div");
  statusBar.className = "status-bar";
  statusBar.innerHTML = `
    <div id="cursorPosition">行: 1, 列: 1</div>
    <div id="fileInfo"></div>
  `;
  document.getElementById("main").appendChild(statusBar);
}

// ステータスバーを更新する
function updateStatusBar(position) {
  const cursorPositionEl = document.getElementById("cursorPosition");
  if (cursorPositionEl) {
    cursorPositionEl.textContent = `行: ${position.lineNumber}, 列: ${position.column}`;
  }
}

// XMLファイルを読み込む
function loadXml(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = (e) => {
    editor.setValue(e.target.result);

    // ファイル情報を表示
    const fileInfo = document.getElementById("fileInfo");
    if (fileInfo) {
      const size = (e.total / 1024).toFixed(2);
      fileInfo.textContent = `${f.name} (${size} KB)`;
    }

    setTimeout(updateXPathFromCursor, 50);
  };
  r.readAsText(f, "utf-8");
}

// カーソル位置のXPathを更新する
function updateXPathFromCursor() {
  const pos = editor.getPosition();
  if (!pos) return;
  const offset = xmlModel.getOffsetAt(pos);
  const info = parseXPath(xmlModel.getValue(), offset);
  if (!info) return;
  lastStack = info.stack;
  lastAttr = info.attr;
  document.getElementById("xpathCurrent").value = abs(lastStack, lastAttr);
  document.getElementById("relXPath").value = baseStack ? rel() : "";
}

// 絶対XPathを生成する
const abs = (st, a) => {
  if (!st.length) return "";
  let path = "/";

  if (namespace) {
    // 名前空間を含むXPathを生成
    path += st.join("/");
  } else {
    // 名前空間を含まないXPathを生成（標準）
    path += st
      .map((tag) => {
        // 名前空間プレフィックス（名前:ローカル名の形式）を処理
        const parts = tag.split(":");
        return parts.length > 1 ? parts[1] : tag;
      })
      .join("/");
  }

  return path + (a ? "/@" + a : "");
};

// 相対XPathを生成する
function rel() {
  if (baseAttr) return "(基準が属性のため相対不可)";
  let i = 0;
  while (
    i < baseStack.length &&
    i < lastStack.length &&
    baseStack[i] === lastStack[i]
  )
    i++;
  const up = "../".repeat(baseStack.length - i).replace(/\/$/, "");
  const down = lastStack.slice(i).join("/");
  let p = (up && (down ? up + "/" + down : up)) || down || ".";
  if (lastAttr) p += "/@" + lastAttr;
  return p;
}

// XMLからXPathを解析する
function parseXPath(txt, off) {
  const tagRe = /<\/(?:[^>]+)>|<([^!?][^>]*?)>/g;
  const stack = [];
  let m,
    lastOpen = null;
  while ((m = tagRe.exec(txt))) {
    const idx = m.index;
    if (idx > off) break; // 早期判定で余分プッシュ防止
    const tag = m[0];
    if (tag.startsWith("</")) {
      stack.pop();
      continue;
    }
    const selfClose = tag.endsWith("/>");
    const name = m[1].split(/\s+/)[0];
    stack.push(name);
    lastOpen = { start: idx, end: tagRe.lastIndex, code: tag, selfClose };
    if (selfClose && lastOpen.end <= off) {
      stack.pop();
    }
  }
  if (!stack.length) return null;
  let attr = null;
  if (lastOpen && off >= lastOpen.start && off <= lastOpen.end) {
    const rel = off - lastOpen.start;
    const attrRe = /([\w:\-]+)\s*=\s*("[^"]*"|'[^']*')/g;
    let a;
    while ((a = attrRe.exec(lastOpen.code))) {
      const s = a.index,
        e = s + a[0].length;
      if (rel >= s && rel <= e) {
        attr = a[1];
        break;
      }
    }
  }
  return { stack: [...stack], attr };
}

// 基準XPathを設定する
function setBase() {
  if (!lastStack.length) return;
  baseStack = [...lastStack];
  baseAttr = lastAttr;
  document.getElementById("baseXPath").value = abs(baseStack, baseAttr);
  updateXPathFromCursor();
}

// 指定されたフィールドの内容をクリップボードにコピーする
function copyField(id) {
  const el = document.getElementById(id);
  el.select();
  document.execCommand("copy");

  // コピー完了メッセージを表示
  const tooltip = document.createElement("span");
  tooltip.className = "copied";
  tooltip.textContent = "コピーしました！";
  el.parentNode.appendChild(tooltip);

  setTimeout(() => {
    tooltip.classList.add("show-tooltip");
    setTimeout(() => {
      tooltip.classList.remove("show-tooltip");
      setTimeout(() => {
        if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
      }, 300);
    }, 1500);
  }, 10);
}

// 名前空間表示切替
function toggleNamespace() {
  namespace = !namespace;
  document.getElementById("namespaceToggle").textContent = namespace
    ? "名前空間あり"
    : "名前空間なし";
  updateXPathFromCursor();
}

/**
 * 入力されたXPathを使用してXML内を検索する
 */
function searchXPath() {
  const xpathQuery = document.getElementById("xpathSearch").value;
  if (!xpathQuery) return;

  // 前回の検索結果をクリア
  clearSearchResults();

  try {
    // XMLテキストをDOMに変換
    const xmlText = editor.getValue();
    const xmlDoc = parseXmlToDoc(xmlText);

    if (!xmlDoc) {
      showMessage("有効なXMLドキュメントではありません。", true);
      return;
    }

    console.log("XMLドキュメント解析完了:", xmlDoc.documentElement.nodeName);

    // 名前空間の処理
    // ST-Bridgeなどの名前空間を検出
    const namespaces = detectNamespaces(xmlDoc);
    console.log("検出された名前空間:", namespaces);

    // カスタム名前空間リゾルバを作成
    const nsResolver = createNamespaceResolver(xmlDoc, namespaces);

    // XPathを評価する前に、必要に応じて名前空間プレフィックスを付加
    let processedQuery = xpathQuery;

    // エラーデバッグ用にクエリを出力
    console.log(`元のXPathクエリ: "${xpathQuery}"`);

    try {
      // 名前空間モードが無効かつクエリに名前空間プレフィックスがない場合、
      // デフォルト名前空間の要素に対してはプレフィックスを自動的に追加
      if (!namespace && namespaces.default) {
        // ST-Bridgeの要素に対してstbプレフィックスを追加
        // 重要: 既に名前空間プレフィックスがある場合は追加しない

        // 完全一致を確保するための厳密なパターンマッチング
        processedQuery = processedQuery.replace(
          // ノードテストを検出 (既存のプレフィックスは含まない)
          /(\/\/)([^:\/\[\]\s]+)|(\/)([^:\/\[\]\s@]+)(?=\/|$|\[|\s|@)/g,
          function (match, slashes1, name1, slash2, name2) {
            if (slashes1 && name1) {
              // //Node パターン
              return `${slashes1}stb:${name1}`;
            } else if (slash2 && name2) {
              // /Node パターン
              return `${slash2}stb:${name2}`;
            }
            return match; // マッチしない場合は変更なし
          }
        );

        console.log(`処理後のXPathクエリ: "${processedQuery}"`);
      }

      // XPathを評価前にクエリの妥当性チェック
      if (!processedQuery || processedQuery.trim() === "") {
        showMessage("空のXPathクエリは評価できません。", true);
        return;
      }

      // XPathを評価
      console.log(`XPath評価開始: "${processedQuery}"`);
      const xpathResult = xmlDoc.evaluate(
        processedQuery,
        xmlDoc,
        nsResolver,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const resultCount = xpathResult.snapshotLength;
      console.log(`XPath検索結果: ${resultCount}件見つかりました`);

      // 結果がない場合
      if (resultCount === 0) {
        showMessage(`一致する要素はありませんでした: ${xpathQuery}`, true);
        return;
      }

      // 検索結果を処理
      searchResults = [];

      // それぞれのノードに対して位置を特定
      for (let i = 0; i < resultCount; i++) {
        const node = xpathResult.snapshotItem(i);
        console.log(`検索結果 ${i + 1}/${resultCount}:`, node.nodeName);

        const range = findNodePositionInEditor(xmlText, node);
        if (range) {
          searchResults.push({
            range: range,
            node: node,
          });
        }
      }

      // 結果があれば最初の結果に移動
      if (searchResults.length > 0) {
        showMessage(`${searchResults.length}個の要素が一致しました。`);

        // 前後移動ボタンを有効化
        enableNavigationButtons(true);

        // 最初の結果に移動
        navigateToResult(0);
      } else {
        showMessage(
          "一致する要素の位置をエディタ内で特定できませんでした。",
          true
        );
      }
    } catch (evalError) {
      // XPath評価中のエラーを詳細にキャプチャ
      console.error("XPath評価エラー:", evalError);
      showMessage(`XPathクエリエラー: ${evalError.message}`, true);
      return;
    }
  } catch (e) {
    showMessage(`XPath検索エラー: ${e.message}`, true);
    console.error("XPath Search Error:", e);
  }
}

/**
 * 前後移動ボタンを有効化/無効化する
 * @param {boolean} enable - 有効にする場合はtrue
 */
function enableNavigationButtons(enable = false) {
  const prevButton = document.querySelector('button[data-action="prev"]');
  const nextButton = document.querySelector('button[data-action="next"]');

  if (prevButton) {
    prevButton.disabled = !enable;
    if (enable) {
      prevButton.classList.remove("disabled");
    } else {
      prevButton.classList.add("disabled");
    }
  }

  if (nextButton) {
    nextButton.disabled = !enable;
    if (enable) {
      nextButton.classList.remove("disabled");
    } else {
      nextButton.classList.add("disabled");
    }
  }

  // デバッグログ
  console.log(`ナビゲーションボタン状態更新: ${enable ? "有効" : "無効"}`);
}

/**
 * XMLドキュメントから名前空間を検出
 */
function detectNamespaces(xmlDoc) {
  const namespaces = {
    default: null,
    prefixes: {},
  };

  if (!xmlDoc || !xmlDoc.documentElement) {
    console.warn("XMLドキュメントまたは要素が見つかりません");
    return namespaces;
  }

  const root = xmlDoc.documentElement;

  try {
    // デフォルト名前空間の検出
    if (root.namespaceURI) {
      namespaces.default = root.namespaceURI;
    }

    // 属性を調査して名前空間宣言を検出
    if (root.attributes) {
      for (let i = 0; i < root.attributes.length; i++) {
        const attr = root.attributes[i];
        if (attr.name === "xmlns") {
          namespaces.default = attr.value;
        } else if (attr.name.startsWith("xmlns:")) {
          const prefix = attr.name.split(":")[1];
          namespaces.prefixes[prefix] = attr.value;
        }
      }
    }

    // ST-Bridge向け特別対応
    if (
      namespaces.default &&
      namespaces.default.includes("building-smart.or.jp")
    ) {
      // デフォルト名前空間に対するstbプレフィックスを追加
      namespaces.prefixes["stb"] = namespaces.default;
      console.log(
        `ST-Bridge名前空間を検出し、stbプレフィックスを追加: ${namespaces.default}`
      );
    }
  } catch (e) {
    console.error("名前空間検出エラー:", e);
  }

  return namespaces;
}

/**
 * カスタム名前空間リゾルバを作成
 */
function createNamespaceResolver(document, namespaces) {
  // 詳細なデバッグ情報
  console.log("名前空間リゾルバを作成:", {
    useNamespaceMode: namespace,
    defaultNamespace: namespaces.default,
    prefixes: Object.keys(namespaces.prefixes),
  });

  return function (prefix) {
    console.log(`名前空間リゾルバが呼ばれました。プレフィックス: "${prefix}"`);

    // stbプレフィックスの特別処理
    if (prefix === "stb" && namespaces.default) {
      console.log(
        `stbプレフィックスに対してデフォルト名前空間を返します: ${namespaces.default}`
      );
      return namespaces.default;
    }

    // 空のプレフィックスはデフォルト名前空間を意味する
    if (prefix === "" && namespaces.default) {
      console.log(
        `空プレフィックスに対してデフォルト名前空間を返します: ${namespaces.default}`
      );
      return namespaces.default;
    }

    // 登録されているプレフィックスから探す
    if (namespaces.prefixes[prefix]) {
      console.log(
        `プレフィックス ${prefix} に対応する名前空間を返します: ${namespaces.prefixes[prefix]}`
      );
      return namespaces.prefixes[prefix];
    }

    // 名前空間モードがオフの場合はnullを返す
    if (!namespace) {
      console.log(
        `名前空間モードがオフのため、プレフィックス ${prefix} に対してnullを返します`
      );
      return null;
    }

    // 最後の手段としてドキュメントからリゾルバを使う
    try {
      const docResolver = document.createNSResolver(document.documentElement);
      const result = docResolver.lookupNamespaceURI(prefix);
      console.log(
        `ドキュメントリゾルバからプレフィックス ${prefix} の結果: ${result}`
      );
      return result;
    } catch (e) {
      console.warn(
        `プレフィックス ${prefix} の名前空間解決に失敗: ${e.message}`
      );
      return null;
    }
  };
}

/**
 * XMLノードに対応するエディタ内の位置を見つける
 * 完全一致する要素のみを検索するよう改善
 */
function findNodePositionInEditor(xmlText, node) {
  try {
    // ノードの種類に応じて検索方法を分ける
    const nodeType = node.nodeType;

    // 要素ノードの場合
    if (nodeType === Node.ELEMENT_NODE) {
      // 完全一致の検索のためのノード情報を収集
      const nodeName = node.nodeName;

      // 属性情報を収集して、より具体的な検索を行う
      const attributes = [];
      for (let i = 0; i < node.attributes.length; i++) {
        attributes.push({
          name: node.attributes[i].name,
          value: node.attributes[i].value,
        });
      }

      // ID属性がある場合はそれを優先的に使用
      const id = node.getAttribute("id");
      if (id) {
        // id属性を持つ要素を検索し、完全一致を確保
        const tagPattern = new RegExp(
          `<${nodeName}[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>`,
          "g"
        );
        const idMatches = [...xmlText.matchAll(tagPattern)];
        if (idMatches.length > 0) {
          const match = idMatches[0];
          return positionToRange(xmlText, match.index, match[0].length);
        }
      }

      // 他の属性を使って検索する（複数の属性で完全一致を目指す）
      if (attributes.length > 0) {
        // 基本的なタグパターン
        const tagPattern = new RegExp(`<${nodeName}[^>]*>`, "g");
        const matches = [...xmlText.matchAll(tagPattern)];

        // タグの候補から、属性が一致するものを探す
        for (const match of matches) {
          const tagContent = match[0];
          let allAttributesMatch = true;

          // すべての属性が一致するか確認
          for (const attr of attributes) {
            const attrRegex = new RegExp(
              `\\b${attr.name}\\s*=\\s*["']${escapeRegExp(attr.value)}["']`
            );
            if (!attrRegex.test(tagContent)) {
              allAttributesMatch = false;
              break;
            }
          }

          if (allAttributesMatch) {
            // すべての属性が一致する要素を見つけた
            return positionToRange(xmlText, match.index, tagContent.length);
          }
        }
      }

      // 単純なタグ名での検索（最終手段）- ただし複数一致する場合は最初の一致を使用
      const tagPattern = new RegExp(`<${nodeName}[^>]*>`, "g");
      const matches = [...xmlText.matchAll(tagPattern)];
      if (matches.length > 0) {
        const match = matches[0];
        return positionToRange(xmlText, match.index, match[0].length);
      }
    }
    // テキストノードの場合
    else if (nodeType === Node.TEXT_NODE) {
      // テキスト内容をトリム
      const text = node.nodeValue.trim();
      if (text) {
        // 親要素のコンテキスト内でテキストを検索
        const parent = node.parentNode;
        if (parent && parent.nodeName) {
          const pattern = new RegExp(
            `<${parent.nodeName}[^>]*>[^<]*${escapeRegExp(text)}[^<]*</${
              parent.nodeName
            }>`,
            "g"
          );
          const matches = [...xmlText.matchAll(pattern)];
          if (matches.length > 0) {
            const match = matches[0];
            // テキスト部分だけをハイライト
            const textStart = match[0].indexOf(text);
            if (textStart >= 0) {
              return positionToRange(
                xmlText,
                match.index + textStart,
                text.length
              );
            }
            return positionToRange(xmlText, match.index, match[0].length);
          }
        }
      }
    }
    // 属性ノードの場合
    else if (nodeType === Node.ATTRIBUTE_NODE) {
      const attrName = node.nodeName;
      const attrValue = node.nodeValue;
      // 属性を持つ親要素を検索
      const pattern = new RegExp(
        `<[^>]*${attrName}\\s*=\\s*["']${escapeRegExp(attrValue)}["'][^>]*>`,
        "g"
      );
      const matches = [...xmlText.matchAll(pattern)];
      if (matches.length > 0) {
        const match = matches[0];
        // 属性部分だけをハイライト
        const attrPattern = new RegExp(
          `${attrName}\\s*=\\s*["']${escapeRegExp(attrValue)}["']`
        );
        const attrMatch = attrPattern.exec(match[0]);
        if (attrMatch) {
          const attrStart = match.index + attrMatch.index;
          return positionToRange(xmlText, attrStart, attrMatch[0].length);
        }
        return positionToRange(xmlText, match.index, match[0].length);
      }
    }

    // 見つからない場合
    console.warn("ノードの位置を特定できませんでした:", node);
    return null;
  } catch (e) {
    console.error("ノード位置検索エラー:", e);
    return null;
  }
}

/**
 * 正規表現で使用する特殊文字をエスケープする
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ノードの情報を抽出する
 */
function getNodeInfo(node) {
  // ノードタイプに基づいて情報を収集
  const nodeType = node.nodeType;

  // 要素ノードの場合
  if (nodeType === Node.ELEMENT_NODE) {
    // タグ名を取得（名前空間を含む可能性あり）
    const tagName = node.tagName;
    // 親要素のパスを構築
    let path = "";
    let parent = node.parentNode;
    while (parent && parent.nodeType === Node.ELEMENT_NODE) {
      path = parent.tagName + "/" + path;
      parent = parent.parentNode;
    }

    // 同じタグ名の兄弟要素中での位置を特定
    let position = 1;
    let sibling = node.previousSibling;
    while (sibling) {
      if (
        sibling.nodeType === Node.ELEMENT_NODE &&
        sibling.tagName === tagName
      ) {
        position++;
      }
      sibling = sibling.previousSibling;
    }

    // 属性リストを収集
    const attributes = [];
    for (const attr of node.attributes) {
      attributes.push({
        name: attr.name,
        value: attr.value,
      });
    }

    return {
      type: "element",
      tagName: tagName,
      path: path,
      position: position,
      attributes: attributes,
      // シリアライズされた文字列も保存
      outerXml: node.outerHTML,
    };
  }
  // テキストノードの場合
  else if (nodeType === Node.TEXT_NODE) {
    return {
      type: "text",
      content: node.textContent.trim(),
      parentTagName: node.parentNode ? node.parentNode.tagName : null,
    };
  }
  // 属性ノードの場合
  else if (nodeType === Node.ATTRIBUTE_NODE) {
    return {
      type: "attribute",
      name: node.name,
      value: node.value,
      ownerTagName: node.ownerElement ? node.ownerElement.tagName : null,
    };
  }

  return {
    type: "unknown",
    nodeType: nodeType,
  };
}

/**
 * ノード情報を基にエディタ内でノードを検索する
 */
function findNodeInEditor(xmlText, nodeInfo) {
  if (nodeInfo.type === "element") {
    // 要素の開始タグを検索
    const tagPattern = new RegExp(`<${nodeInfo.tagName}[^>]*>`, "g");
    const matches = [...xmlText.matchAll(tagPattern)];

    // 位置情報を使用して正しい要素を特定
    if (matches.length >= nodeInfo.position && nodeInfo.position > 0) {
      const matchIndex = nodeInfo.position - 1;
      const match = matches[matchIndex];

      // 属性を使って要素をさらに絞り込む
      if (nodeInfo.attributes.length > 0) {
        for (const attr of nodeInfo.attributes) {
          if (
            match[0].includes(`${attr.name}="${attr.value}"`) ||
            match[0].includes(`${attr.name}='${attr.value}'`)
          ) {
            // 属性が一致する場合、この要素を使用
            return positionToRange(xmlText, match.index, match[0].length);
          }
        }
      }

      // 属性での絞り込みができなければ、位置のみで特定
      return positionToRange(xmlText, match.index, match[0].length);
    }

    // パターンB: outerXmlを使ってより正確に検索
    if (nodeInfo.outerXml) {
      const escapedXml = escapeRegExp(nodeInfo.outerXml);
      const exactPattern = new RegExp(escapedXml, "g");
      const exactMatch = exactPattern.exec(xmlText);

      if (exactMatch) {
        return positionToRange(xmlText, exactMatch.index, exactMatch[0].length);
      }
    }
  } else if (nodeInfo.type === "attribute") {
    // 属性の検索パターン
    const attrPattern = new RegExp(
      `${nodeInfo.name}\\s*=\\s*["']${escapeRegExp(nodeInfo.value)}["']`,
      "g"
    );
    const matches = [...xmlText.matchAll(attrPattern)];

    if (matches.length > 0) {
      // 簡単のため最初の一致を使用（より正確には親要素の特定も必要）
      const match = matches[0];
      return positionToRange(xmlText, match.index, match[0].length);
    }
  } else if (nodeInfo.type === "text") {
    // テキストノードの検索（単純なテキスト検索ではなく、親タグのコンテキストを考慮）
    const trimmedContent = nodeInfo.content.trim();
    if (trimmedContent) {
      const escapedContent = escapeRegExp(trimmedContent);
      const parentTag = nodeInfo.parentTagName ? nodeInfo.parentTagName : "";

      // 親タグが分かる場合はそのコンテキスト内で検索
      if (parentTag) {
        const parentPattern = new RegExp(
          `<${parentTag}[^>]*>[^<]*${escapedContent}[^<]*</${parentTag}>`,
          "g"
        );
        const parentMatches = [...xmlText.matchAll(parentPattern)];

        if (parentMatches.length > 0) {
          const match = parentMatches[0];
          // テキスト部分のみをハイライト
          const textStart = match[0].indexOf(trimmedContent);
          if (textStart >= 0) {
            const absoluteStart = match.index + textStart;
            return positionToRange(
              xmlText,
              absoluteStart,
              trimmedContent.length
            );
          }
        }
      }

      // 親タグでの検索に失敗した場合は単純なテキスト検索
      const simplePattern = new RegExp(`>${escapedContent}<`, "g");
      const simpleMatches = [...xmlText.matchAll(simplePattern)];

      if (simpleMatches.length > 0) {
        const match = simpleMatches[0];
        return positionToRange(xmlText, match.index + 1, trimmedContent.length);
      }
    }
  }

  return null;
}

/**
 * XMLを整形する
 */
function formatXml(xml) {
  try {
    // XMLパース
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, "text/xml");

    // パースエラーチェック
    if (xmlDoc.querySelector("parsererror")) {
      return xml; // パースエラーがある場合は元のXMLを返す
    }

    // シリアライズして整形
    const serializer = new XMLSerializer();
    let formatted = "";
    const INDENT = "  "; // インデント文字列

    function format(node, level) {
      let result = "";

      // インデント
      const indent = INDENT.repeat(level);

      // ノードタイプによって処理を分ける
      switch (node.nodeType) {
        case Node.ELEMENT_NODE:
          result += indent + "<" + node.nodeName;

          // 属性を追加
          for (let i = 0; i < node.attributes.length; i++) {
            const attr = node.attributes[i];
            result += " " + attr.name + '="' + attr.value + '"';
          }

          // 子ノードがあるか
          if (node.childNodes.length === 0) {
            result += "/>\n";
          } else {
            result += ">\n";

            // 子ノードを処理
            let hasElementChild = false;
            for (let i = 0; i < node.childNodes.length; i++) {
              const child = node.childNodes[i];
              if (child.nodeType === Node.ELEMENT_NODE) {
                hasElementChild = true;
              }
              result += format(child, level + 1);
            }

            if (hasElementChild) {
              result += indent;
            }
            result += "</" + node.nodeName + ">\n";
          }
          break;

        case Node.TEXT_NODE:
          const text = node.nodeValue.trim();
          if (text) {
            result += indent + text + "\n";
          }
          break;

        case Node.COMMENT_NODE:
          result += indent + "<!--" + node.nodeValue + "-->\n";
          break;
      }

      return result;
    }

    // ルート要素からフォーマット開始
    formatted = format(xmlDoc.documentElement, 0);
    return formatted;
  } catch (e) {
    console.error("XML formatting error:", e);
    return xml; // エラーが発生した場合は元のXMLを返す
  }
}

/**
 * XMLテキスト内の位置からMonacoエディタの範囲オブジェクトを作成
 */
function positionToRange(text, offset, length) {
  try {
    const startPosition = editor.getModel().getPositionAt(offset);
    const endPosition = editor.getModel().getPositionAt(offset + length);

    return {
      startLineNumber: startPosition.lineNumber,
      startColumn: startPosition.column,
      endLineNumber: endPosition.lineNumber,
      endColumn: endPosition.column,
    };
  } catch (e) {
    console.error("Error converting position to range:", e);

    // フォールバック: テキストベースの計算
    const before = text.substring(0, offset);
    const lines = before.split("\n");
    const lineNumber = lines.length;
    const column = lines[lines.length - 1].length + 1;

    // 終了位置を計算
    const content = text.substring(offset, offset + length);
    const contentLines = content.split("\n");
    const endLineNumber = lineNumber + contentLines.length - 1;
    const endColumn =
      contentLines.length > 1
        ? contentLines[contentLines.length - 1].length + 1
        : column + content.length;

    return {
      startLineNumber: lineNumber,
      startColumn: column,
      endLineNumber: endLineNumber,
      endColumn: endColumn,
    };
  }
}

/**
 * 次の検索結果に移動
 */
function nextSearchResult() {
  console.log("次の結果ボタンがクリックされました");
  if (searchResults.length === 0) {
    console.log("検索結果がありません");
    return;
  }

  // イベントの重複呼び出しをデバッグするための対策
  if (window.isNavigating) {
    console.log("ナビゲーション処理中のため、重複呼び出しをスキップします");
    return;
  }

  window.isNavigating = true;
  setTimeout(() => {
    window.isNavigating = false;
  }, 50); // 短い遅延後にロックを解除

  currentResultIndex = (currentResultIndex + 1) % searchResults.length;
  console.log(
    `次の結果へ移動: ${currentResultIndex + 1}/${searchResults.length}`
  );
  navigateToResult(currentResultIndex);
}

/**
 * 前の検索結果に移動
 */
function prevSearchResult() {
  console.log("前の結果ボタンがクリックされました");
  if (searchResults.length === 0) {
    console.log("検索結果がありません");
    return;
  }

  // イベントの重複呼び出しをデバッグするための対策
  if (window.isNavigating) {
    console.log("ナビゲーション処理中のため、重複呼び出しをスキップします");
    return;
  }

  window.isNavigating = true;
  setTimeout(() => {
    window.isNavigating = false;
  }, 50); // 短い遅延後にロックを解除

  currentResultIndex =
    (currentResultIndex - 1 + searchResults.length) % searchResults.length;
  console.log(
    `前の結果へ移動: ${currentResultIndex + 1}/${searchResults.length}`
  );
  navigateToResult(currentResultIndex);
}

/**
 * 指定されたインデックスの検索結果に移動してハイライト
 */
function navigateToResult(index) {
  if (index < 0 || index >= searchResults.length) {
    console.warn(
      `無効なインデックス: ${index}, 検索結果数: ${searchResults.length}`
    );
    return;
  }

  currentResultIndex = index;
  console.log(`結果 ${index + 1}/${searchResults.length} に移動`);

  // 前回のハイライトをクリア
  if (searchDecoration.length > 0) {
    editor.deltaDecorations(searchDecoration, []);
    searchDecoration = [];
  }

  const result = searchResults[index];

  // エディタの位置を設定
  editor.revealRangeInCenter(result.range);
  editor.setPosition({
    lineNumber: result.range.startLineNumber,
    column: result.range.startColumn,
  });

  // ハイライト装飾を適用
  searchDecoration = editor.deltaDecorations(
    [],
    [
      {
        range: result.range,
        options: {
          inlineClassName: "search-highlight",
          stickiness:
            monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]
  );

  // ステータス更新
  updateSearchStatus(index + 1, searchResults.length);
}

/**
 * 検索ステータスの更新
 */
function updateSearchStatus(current, total) {
  const statusElement = document.getElementById("searchStatus");
  if (statusElement) {
    statusElement.textContent = `${current} / ${total}`;
    statusElement.style.display = "inline";
  }
}

/**
 * XML文字列をDOMドキュメントに変換
 */
function parseXmlToDoc(xmlText) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // XMLパースエラーをチェック
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
      throw new Error("XMLパースエラー");
    }

    return xmlDoc;
  } catch (e) {
    console.error("XML parse error:", e);
    return null;
  }
}

/**
 * 検索結果をクリア
 */
function clearSearchResults() {
  searchResults = [];
  currentResultIndex = -1;

  // エディタのハイライトをクリア
  if (searchDecoration.length > 0) {
    editor.deltaDecorations(searchDecoration, []);
    searchDecoration = [];
  }

  // ステータス表示をリセット
  const statusElement = document.getElementById("searchStatus");
  if (statusElement) {
    statusElement.style.display = "none";
  }

  // 前後移動ボタンを無効化
  enableNavigationButtons(false);
}

/**
 * メッセージを表示
 */
function showMessage(message, isError = false) {
  const statusBar = document.getElementById("statusMessage");
  if (statusBar) {
    statusBar.textContent = message;
    statusBar.className = isError ? "status-message error" : "status-message";

    // 一定時間後に消える
    setTimeout(() => {
      statusBar.textContent = "";
      statusBar.className = "status-message";
    }, 5000);
  } else {
    alert(message);
  }
}

// EnterキーでXPath検索を実行
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM読み込み完了 - イベントリスナー設定");

  // Enterキーイベント設定
  const xpathSearchInput = document.getElementById("xpathSearch");
  if (xpathSearchInput) {
    xpathSearchInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        searchXPath();
      }
    });
  }

  // 前後ボタンにイベントリスナーを設定
  const prevButton = document.querySelector('button[data-action="prev"]');
  const nextButton = document.querySelector('button[data-action="next"]');

  if (prevButton) {
    console.log("前へボタン検出: 単一イベントリスナーを設定します");
    // 既存のイベントリスナーをクリア
    prevButton.removeEventListener("click", prevSearchResult);
    // 新しいイベントリスナーを設定
    prevButton.addEventListener("click", function (e) {
      e.preventDefault();
      console.log("前へボタンがクリックされました（イベントリスナーのみ）");
      prevSearchResult();
    });
  }

  if (nextButton) {
    console.log("次へボタン検出: 単一イベントリスナーを設定します");
    // 既存のイベントリスナーをクリア
    nextButton.removeEventListener("click", nextSearchResult);
    // 新しいイベントリスナーを設定
    nextButton.addEventListener("click", function (e) {
      e.preventDefault();
      console.log("次へボタンがクリックされました（イベントリスナーのみ）");
      nextSearchResult();
    });
  }

  // 重複イベントの対策用の変数を初期化
  window.isNavigating = false;

  // 初期状態では前後ボタンを無効化
  enableNavigationButtons(false);

  // リサイズ機能を初期化
  initResizer();
});

/**
 * リサイザー機能の初期化
 */
function initResizer() {
  const resizer = document.getElementById("resizer");
  const sidebar = document.getElementById("sidebar");
  const main = document.getElementById("main");

  if (!resizer || !sidebar || !main) return;

  let startX, startWidth;

  // リサイザーのドラッグ開始時
  resizer.addEventListener("mousedown", function (e) {
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;

    // リサイズ中のスタイルを適用
    document.body.classList.add("resizing");
    resizer.classList.add("active");
    sidebar.classList.add("resizing");

    // ドラッグ中とドラッグ終了のイベントを追加
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // イベントのデフォルト動作とバブリングを防止
    e.preventDefault();
  });

  // ドラッグ中の処理
  function onMouseMove(e) {
    // 新しい幅を計算（ピクセル単位）
    const newWidth = startWidth + (e.clientX - startX);

    // 最小幅と最大幅の制限
    const minWidth = 200; // 最小幅（ピクセル）
    const maxWidth = window.innerWidth * 0.8; // 最大幅（ウィンドウの80%）

    // 制限内の幅を適用
    const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);

    // サイドバーの幅をパーセントで設定（レスポンシブ対応）
    const widthPercent = (clampedWidth / window.innerWidth) * 100;
    sidebar.style.width = `${widthPercent}%`;

    // エディターのレイアウトを更新（サイズ変更に対応）
    if (editor) {
      editor.layout();
    }
  }

  // ドラッグ終了時の処理
  function onMouseUp() {
    // リサイズ中のスタイルを解除
    document.body.classList.remove("resizing");
    resizer.classList.remove("active");
    sidebar.classList.remove("resizing");

    // イベントリスナーを削除
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    // エディターのレイアウトを更新（最終的なサイズに対応）
    if (editor) {
      setTimeout(() => editor.layout(), 100);
    }
  }
}
