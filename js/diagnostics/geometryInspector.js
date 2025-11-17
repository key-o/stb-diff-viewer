import { createLogger } from "../utils/logger.js";
import { ensureUnifiedSectionType } from "../common/sectionTypeUtil.js";
import {
  getWidth,
  getHeight,
  getDimensions,
} from "../common/sectionDataAccessor.js";

const log = createLogger("diagnostics:geom");
const clog = createLogger("diagnostics:compare");

/**
 * 断面データから期待される寸法を解決
 * sectionDataAccessorを使用して統一的にデータを取得し、
 * 取得できない場合のみshapeNameやsteelSectionsからフォールバック
 *
 * @param {Object} sectionMeta - 断面メタデータ
 * @returns {Object} { width, height, source } 解決された寸法と取得元
 */
function resolveExpectedDimensions(sectionMeta) {
  if (!sectionMeta) {
    return { width: undefined, height: undefined, source: "none" };
  }

  // 1. sectionDataAccessorを使用して標準的な方法で取得を試みる
  let w = getWidth(sectionMeta);
  let h = getHeight(sectionMeta);
  let source = "accessor";

  // 2. 取得できない場合のみフォールバック処理
  if (w === undefined || h === undefined) {
    // shapeName からの抽出（H形鋼や□/BOX表記など）
    // 例: "H-346x174x6x9" / "□-550x550x12x30" / "BOX-400x300x12"
    const shapeName = sectionMeta.shapeName || sectionMeta.ShapeName;
    if (typeof shapeName === "string" && shapeName.length > 0) {
      // 全数値を抽出
      const nums = shapeName.match(/\d+(?:\.\d+)?/g)?.map((v) => +v) || [];
      if (nums.length >= 2) {
        // 先頭を高さ/せい、次を幅と解釈（H, BOX, □, RECTANGLE 共通ルール）
        if (h === undefined) h = nums[0];
        if (w === undefined) w = nums[1];
        source = "shapeName";
      }

      // steelSections マップから正規寸法を引き当てる
      if (
        (w === undefined || h === undefined) &&
        typeof window !== "undefined"
      ) {
        const steelSections = window.steelSections;
        if (
          steelSections &&
          steelSections.get &&
          steelSections.has(shapeName)
        ) {
          const ss = steelSections.get(shapeName);
          // 代表的パラメータ: A(高さ), B(幅)
          const A = parseFloat(ss.A || ss.a);
          const B = parseFloat(ss.B || ss.b);
          if (!isNaN(A) && h === undefined) h = A;
          if (!isNaN(B) && w === undefined) w = B;
          // BOX系: outer dimensions A/B ではなく H/B 表記の場合は同じ扱い
          const H = parseFloat(ss.H || ss.h);
          if (!isNaN(H) && h === undefined) h = H;
          if (!isNaN(H) && w === undefined && isNaN(B)) w = H; // 正方形想定
          source = "steelSections";
        }
      }
    }
  }

  return { width: w, height: h, source };
}

/**
 * メッシュの断面寸法と STB セクション寸法を比較
 * - XY 平面でのバウンディングを断面とみなす（押し出し前提）
 * - 差異率を算出して返す
 */
export function inspectSectionMismatch(mesh) {
  if (!mesh || !mesh.geometry) {
    log.warn("inspectSectionMismatch: mesh or geometry missing");
    return null;
  }
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  // 断面はローカル空間の X-Y を想定（押し出しが Z）
  const width = Math.abs(bb.max.x - bb.min.x);
  const depth = Math.abs(bb.max.y - bb.min.y);

  const meta =
    mesh.userData?.sectionDataOriginal ||
    mesh.userData?.beamData?.section ||
    mesh.userData?.columnData?.section;
  // section_type を正規化（profile_type 等の別名を吸収）
  if (meta) ensureUnifiedSectionType(meta);
  const { width: expectedW, height: expectedD } =
    resolveExpectedDimensions(meta);
  const sectionTypeUnified = meta?.section_type;

  const result = {
    elementId: mesh.userData?.elementId,
    elementType: mesh.userData?.elementType,
    profileSource: mesh.userData?.profileMeta?.profileSource,
    sectionTypeUnified,
    actual: { width, depth },
    expected: { width: expectedW, depth: expectedD },
    mismatch: {
      width: expectedW ? (width - expectedW) / expectedW : null,
      depth: expectedD ? (depth - expectedD) / expectedD : null,
    },
  };

  // 詳細は trace に格下げ（spam防止）
  log.trace("Section inspection:", result);
  return result;
}

/**
 * シーン内の指定タイプのメッシュを走査し、断面差異を集計
 */
export function scanSceneForSectionMismatches(
  scene,
  elementType = null,
  limit = 50
) {
  const out = [];
  let count = 0;
  scene.traverse((obj) => {
    if (count >= limit) return;
    if (obj.isMesh && obj.userData?.profileBased) {
      if (!elementType || obj.userData.elementType === elementType) {
        const r = inspectSectionMismatch(obj);
        if (r) {
          out.push(r);
          count++;
        }
      }
    }
  });
  log.info(`Scanned ${out.length} objects for section mismatches`);
  return out;
}

/**
 * 既知のグローバルからシーンを推測してスキャン
 */
export function scanDefaultScene(elementType = null, limit = 50) {
  const s = getDefaultScene();
  if (!s) {
    log.warn("scanDefaultScene: scene not found in known globals");
    return [];
  }
  return scanSceneForSectionMismatches(s, elementType, limit);
}

export function getDefaultScene() {
  const candidates = [
    () => window?.viewer?.scene,
    () => window?.stbViewer?.scene,
    () => window?.app?.scene,
    () => window?.scene,
  ];
  for (const get of candidates) {
    try {
      const s = get();
      if (s) return s;
    } catch (_) {}
  }
  return null;
}

/**
 * 差異のある要素をハイライト表示
 */
export function highlightMismatches(scene, results, tolerance = 0.02) {
  const ids = new Set(
    results
      .filter((r) => {
        const w = Math.abs(r.mismatch.width ?? 0);
        const d = Math.abs(r.mismatch.depth ?? 0);
        return w > tolerance || d > tolerance || r.profileSource === "manual";
      })
      .map((r) => r.elementId)
      .filter(Boolean)
  );
  let n = 0;
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.userData) return;
    const id = obj.userData.elementId;
    if (ids.has(id)) {
      n++;
      try {
        if (obj.material && obj.material.color) {
          obj.material.color.set("#ff3366");
          if ("emissive" in obj.material && obj.material.emissive) {
            obj.material.emissive.set("#661122");
          }
        }
      } catch (_) {}
    }
  });
  log.info(`Highlighted ${n} mismatched elements`);
  return n;
}

/**
 * 結果を簡易パネルで表示
 */
export function showMismatchPanel(results, tolerance = 0.02) {
  const id = "diag-mismatch-panel";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    Object.assign(el.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      zIndex: 99999,
      maxHeight: "60vh",
      width: "520px",
      overflow: "auto",
      background: "rgba(15,15,20,0.95)",
      color: "#eee",
      border: "1px solid #444",
      borderRadius: "8px",
      padding: "8px",
      font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    });
    document.body.appendChild(el);
  }
  const rows = results
    .map((r) => {
      const w =
        r.mismatch.width != null
          ? (r.mismatch.width * 100).toFixed(1) + "%"
          : "-";
      const d =
        r.mismatch.depth != null
          ? (r.mismatch.depth * 100).toFixed(1) + "%"
          : "-";
      const bad =
        Math.abs(r.mismatch.width ?? 0) > tolerance ||
        Math.abs(r.mismatch.depth ?? 0) > tolerance ||
        r.profileSource === "manual";
      return `<tr style="background:${bad ? "#3a0010" : "transparent"}"><td>${
        r.elementType ?? ""
      }</td><td>${r.elementId ?? ""}</td><td>${r.profileSource ?? ""}</td><td>${
        r.sectionTypeUnified ?? ""
      }</td><td>${r.actual.width?.toFixed?.(1) ?? ""} x ${
        r.actual.depth?.toFixed?.(1) ?? ""
      }</td><td>${r.expected.width ?? ""} x ${
        r.expected.depth ?? ""
      }</td><td>${w} / ${d}</td></tr>`;
    })
    .join("");
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <strong>断面差異レポート</strong>
      <button id="diag-close" style="margin-left:auto">×</button>
    </div>
    <div style="margin-bottom:6px;opacity:0.8">しきい値: ${(
      tolerance * 100
    ).toFixed(1)}% を超える差異、または profileSource=manual を強調表示</div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
  <tr><th style="text-align:left">Type</th><th style="text-align:left">ID</th><th>Src</th><th>section_type</th><th>Actual (W x D)</th><th>Expected</th><th>ΔW / ΔD</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  el.querySelector("#diag-close")?.addEventListener("click", () => el.remove());
}

/**
 * 断面比較ログをコンソール出力（1要素=1行）
 */
export function logSectionComparisons(
  scene,
  elementType = null,
  limit = 100,
  options = {}
) {
  const { tolerance = 0.02, level = "info" } = options;
  const logger = typeof clog[level] === "function" ? clog[level] : clog.info;
  let total = 0;
  let flagged = 0;
  scene.traverse((obj) => {
    if (total >= limit) return;
    if (!obj.isMesh || !obj.userData?.profileBased) return;
    if (elementType && obj.userData.elementType !== elementType) return;
    const r = inspectSectionMismatch(obj);
    if (!r) return;
    total++;
    const over =
      Math.abs(r.mismatch.width ?? 0) > tolerance ||
      Math.abs(r.mismatch.depth ?? 0) > tolerance ||
      r.profileSource === "manual";
    if (over) flagged++;
    const fmt = (n, d = 1) => (n == null ? "-" : Number(n).toFixed(d));
    const dw = r.mismatch.width != null ? r.mismatch.width * 100 : null;
    const dd = r.mismatch.depth != null ? r.mismatch.depth * 100 : null;
    const sDW = dw == null ? "-" : `${dw >= 0 ? "+" : ""}${fmt(dw, 1)}%`;
    const sDD = dd == null ? "-" : `${dd >= 0 ? "+" : ""}${fmt(dd, 1)}%`;
    const msg = `${over ? "!" : " "} [${r.elementType ?? ""}] id=${
      r.elementId ?? ""
    } src=${r.profileSource ?? ""}/${r.sectionTypeUnified ?? ""} actual=${fmt(
      r.actual.width
    )}x${fmt(r.actual.depth)} expected=${fmt(r.expected.width)}x${fmt(
      r.expected.depth
    )} dW=${sDW} dD=${sDD}`;
    logger(msg);
  });
  clog.info(
    `Compared ${total} elements, flagged ${flagged} (tol=${(
      tolerance * 100
    ).toFixed(1)}%)`
  );
  return { total, flagged };
}

export function logDefaultSceneComparisons(
  elementType = null,
  limit = 100,
  options = {}
) {
  const s = getDefaultScene();
  if (!s) {
    clog.warn("logDefaultSceneComparisons: scene not found");
    return { total: 0, flagged: 0 };
  }
  return logSectionComparisons(s, elementType, limit, options);
}

/**
 * 期待寸法が抽出できなかった要素の sectionDataOriginal 構造をダンプ
 * - width / height のどちらかが未解決 (undefined) のものを対象
 * - 利用可能なキー一覧とネスト1段目までのオブジェクト構造を簡易出力
 */
export function debugMissingExpectedDimensions(
  scene,
  elementType = null,
  limit = 50
) {
  const s = scene || getDefaultScene();
  if (!s) {
    clog.warn("debugMissingExpectedDimensions: scene not found");
    return [];
  }
  const out = [];
  let counted = 0;
  s.traverse((obj) => {
    if (counted >= limit) return;
    if (!obj.isMesh || !obj.userData?.profileBased) return;
    if (elementType && obj.userData.elementType !== elementType) return;
    const raw =
      obj.userData?.sectionDataOriginal ||
      obj.userData?.beamData?.section ||
      obj.userData?.columnData?.section;
    if (!raw) return;
    const dims = raw.dimensions || raw;
    const { width: w, height: h } = resolveExpectedDimensions(raw);
    if (w !== undefined && h !== undefined) return; // 解決済みはスキップ

    // 1段目キー
    const topKeys = Object.keys(raw);
    const dimKeys = raw.dimensions ? Object.keys(raw.dimensions) : [];

    // ネスト1段目の数値候補を収集
    const numericEntries = [];
    for (const [k, v] of Object.entries(dims)) {
      if (typeof v === "number" && isFinite(v)) {
        numericEntries.push(`${k}=${v}`);
      } else if (typeof v === "string" && !isNaN(+v)) {
        numericEntries.push(`${k}=${+v}`);
      }
    }

    const sample = {
      elementId: obj.userData.elementId,
      elementType: obj.userData.elementType,
      profileSource: obj.userData?.profileMeta?.profileSource,
      sectionTypeUnified: raw?.section_type,
      widthResolved: w,
      heightResolved: h,
      rawKeys: topKeys,
      dimensionsKeys: dimKeys,
      numericCandidates: numericEntries.slice(0, 12),
      rawPreview: JSON.stringify(
        raw.dimensions ? raw.dimensions : raw,
        (k, v) => (typeof v === "number" ? Number(v.toFixed(3)) : v),
        0
      ).slice(0, 400),
    };
    out.push(sample);
    counted++;
    clog.warn(
      `[MISSING] id=${sample.elementId} type=${sample.elementType} src=${
        sample.profileSource
      }/${sample.sectionTypeUnified ?? ""} keys=${sample.dimensionsKeys.join(
        ","
      )} nums=${sample.numericCandidates.join(",")} rawPreview=${
        sample.rawPreview
      }`
    );
  });
  clog.info(
    `debugMissingExpectedDimensions: collected ${out.length} unresolved items (limit=${limit})`
  );
  return out;
}

// 便利関数をグローバルに公開（開発用）
if (typeof window !== "undefined") {
  window.GeometryDiagnostics = {
    inspectSectionMismatch,
    scanSceneForSectionMismatches,
    scanDefaultScene,
    getDefaultScene,
    showMismatchPanel,
    highlightMismatches,
    logSectionComparisons,
    logDefaultSceneComparisons,
    debugMissingExpectedDimensions,
  };
}
