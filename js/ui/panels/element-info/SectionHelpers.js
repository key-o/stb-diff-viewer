/**
 * @fileoverview 断面情報ヘルパー関数
 *
 * STB断面情報の検索、抽出、および等価性評価結果の表示を行うヘルパー関数群。
 * 断面ノードの検索、鉄骨断面寸法の取得、断面データの抽出などを担当します。
 */

/**
 * 指定されたドキュメントの StbSections 内から、指定IDを持つ断面要素を検索する。
 * @param {XMLDocument | null} doc - 検索対象のXMLドキュメント。
 * @param {string} sectionId - 検索する断面ID。
 * @returns {Element | null} 見つかった断面要素、または null。
 */
export function findSectionNode(doc, sectionId) {
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
export function findSteelSectionInfo(shapeName) {
  if (!window.docA && !window.docB) return null;

  // どちらかのdocからStbSecSteelを取得
  const doc = window.docA || window.docB;
  if (!doc) return null;
  const steel = doc.querySelector('StbSecSteel');
  if (!steel) return null;

  // H形鋼
  let el = steel.querySelector(`StbSecRoll-H[name="${shapeName}"]`);
  if (el) {
    return {
      type: 'H',
      A: el.getAttribute('A'),
      B: el.getAttribute('B'),
      t1: el.getAttribute('t1'),
      t2: el.getAttribute('t2'),
      r: el.getAttribute('r'),
    };
  }

  // 角形鋼管
  el = steel.querySelector(`StbSecRoll-BOX[name="${shapeName}"]`);
  if (el) {
    return {
      type: 'BOX',
      A: el.getAttribute('A'),
      B: el.getAttribute('B'),
      t: el.getAttribute('t'),
      r: el.getAttribute('r'),
    };
  }

  // L形鋼
  el = steel.querySelector(`StbSecRoll-L[name="${shapeName}"]`);
  if (el) {
    return {
      type: 'L',
      A: el.getAttribute('A'),
      B: el.getAttribute('B'),
      t1: el.getAttribute('t1'),
      t2: el.getAttribute('t2'),
      r1: el.getAttribute('r1'),
      r2: el.getAttribute('r2'),
    };
  }

  // その他必要に応じて追加
  return null;
}

/**
 * XMLノードから断面データを抽出
 * @param {Element} sectionNode - 断面XML要素
 * @returns {Object|null} 抽出された断面データ
 */
export function extractSectionData(sectionNode) {
  if (!sectionNode) return null;

  const data = {
    type: sectionNode.tagName,
    material: null,
    strength_name: null,
  };

  // 全属性を取得
  Array.from(sectionNode.attributes).forEach((attr) => {
    data[attr.name] = attr.value;
  });

  // 材質と強度情報を抽出
  data.material = data.strength_name || data.material;

  // shapeName属性からの断面寸法取得
  if (data.shape) {
    const steelInfo = findSteelSectionInfo(data.shape);
    if (steelInfo) {
      Object.assign(data, steelInfo);
    }
  }

  // セクション種別に応じた正規化
  // StbSecColumn-S, StbSecBeam-S, StbSecColumn-RC, StbSecBeam-RC などのタグ名に対応
  if (data.type) {
    // タグ名から断面タイプを抽出
    if (data.type.includes('-S')) {
      data.section_type = data.type; // 鋼材断面
    } else if (
      data.type.includes('-RC') ||
      data.type.includes('-SRC') ||
      data.type.includes('-CFT')
    ) {
      data.section_type = 'RECTANGLE'; // RC断面はデフォルトで矩形
    }
  }

  return data;
}

/**
 * 等価性評価結果のHTML生成（テーブル行形式）
 * @param {Object} result - 評価結果オブジェクト
 * @returns {string} テーブル行のHTML
 */
export function generateEquivalenceSection(result) {
  const statusColor = result.isEquivalent ? '#28a745' : '#dc3545';
  const statusText = result.isEquivalent ? '✓ 等価' : '✗ 非等価';
  const statusBg = result.isEquivalent ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';

  let html = `
    <tr class="equivalence-status-row">
      <td colspan="3" style="background-color: ${statusBg}; padding: 8px; border-left: 4px solid ${statusColor};">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="color: ${statusColor}; font-size: var(--font-size-lg);">${statusText}</strong>
            <span style="margin-left: 10px; color: #666; font-size: var(--font-size-md);">${result.summary} (${result.passRate}%)</span>
          </div>
        </div>
      </td>
    </tr>
  `;

  // チェック結果の詳細
  for (const check of result.checks) {
    const icon = check.passed ? '✓' : '✗';
    const iconColor = check.passed ? '#28a745' : '#dc3545';
    const rowBg = check.passed ? 'rgba(40, 167, 69, 0.05)' : 'rgba(220, 53, 69, 0.05)';

    html += `
      <tr class="equivalence-check-row" style="background-color: ${rowBg};">
        <td style="padding-left: 2em; font-weight: var(--font-weight-bold);">
          <span style="color: ${iconColor}; margin-right: 5px;">${icon}</span>
          ${check.category}
        </td>
        <td colspan="2" style="font-size: var(--font-size-md); color: #555;">
          ${check.name}: ${check.details}
        </td>
      </tr>
    `;

    // サブチェックがある場合
    if (check.subChecks && check.subChecks.length > 0) {
      for (const subCheck of check.subChecks) {
        const subIcon = subCheck.passed ? '✓' : '✗';
        const subColor = subCheck.passed ? '#28a745' : '#dc3545';

        html += `
          <tr class="equivalence-subcheck-row">
            <td style="padding-left: 4em; font-size: var(--font-size-sm); color: #666;">
              <span style="color: ${subColor}; margin-right: 3px;">${subIcon}</span>
              ${subCheck.name}
            </td>
            <td colspan="2" style="font-size: var(--font-size-sm); color: #666;">
              ${subCheck.details}
            </td>
          </tr>
        `;
      }
    }
  }

  return html;
}

/**
 * 要素データからラベル表示用のデータを構築
 * @param {string} elementType - 要素タイプ
 * @param {Element} elementNode - XML要素ノード
 * @param {XMLDocument} doc - XMLドキュメント
 * @returns {Object|null} ラベル表示用のデータ
 */
export function buildElementDataForLabels(elementType, elementNode, doc) {
  if (!elementNode) {
    return null;
  }

  const data = {};
  Array.from(elementNode.attributes).forEach((attr) => {
    data[attr.name] = attr.value;
  });

  data.id = data.id || elementNode.getAttribute('id') || elementNode.getAttribute('name') || '';
  data.elementType = elementType;

  const sectionId = elementNode.getAttribute('id_section');
  if (doc && sectionId) {
    const sectionNode = findSectionNode(doc, sectionId);
    if (sectionNode) {
      data.sectionData = extractSectionData(sectionNode);
    }
  }

  return data;
}

/**
 * 要素の属性をMap形式で取得するヘルパー関数
 * @param {Element} node - XML要素ノード
 * @returns {Map<string, string>} 属性名と値のマップ
 */
export function getAttributesMap(node) {
  const map = new Map();
  if (node && node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      map.set(node.attributes[i].name, node.attributes[i].value);
    }
  }
  return map;
}

/**
 * shape属性を持つ鉄骨断面情報をHTML形式でレンダリング
 * @param {string} shape - 断面形状名
 * @returns {string} HTML文字列
 */
export function renderShapeWithSteelInfo(shape) {
  if (!shape) return '';
  const steelInfo = findSteelSectionInfo(shape);
  if (!steelInfo) return `<span>${shape}</span>`;

  if (steelInfo.type === 'H') {
    return `<span>${shape} <span style="color:#888;font-size:var(--font-size-md);">[A=${steelInfo.A}, B=${steelInfo.B}, t1=${steelInfo.t1}, t2=${steelInfo.t2}, r=${steelInfo.r}]</span></span>`;
  }
  if (steelInfo.type === 'BOX') {
    return `<span>${shape} <span style="color:#888;font-size:var(--font-size-md);">[A=${steelInfo.A}, B=${steelInfo.B}, t=${steelInfo.t}, r=${steelInfo.r}]</span></span>`;
  }
  if (steelInfo.type === 'L') {
    return `<span>${shape} <span style="color:#888;font-size:var(--font-size-md);">[A=${steelInfo.A}, B=${steelInfo.B}, t1=${steelInfo.t1}, t2=${steelInfo.t2}, r1=${steelInfo.r1}, r2=${steelInfo.r2}]</span></span>`;
  }
  return `<span>${shape}</span>`;
}
