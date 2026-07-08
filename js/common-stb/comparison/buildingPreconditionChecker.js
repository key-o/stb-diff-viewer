/**
 * @fileoverview 同一建物プリコンディション判定（C2）
 *
 * 異ソフト間比較モードは「同一建物を別ソフトで出力したSTB」の比較を想定している。
 * 誤って別建物のモデル同士を比較した場合、階正準化や許容差緩和が
 * 無意味な対応付けを量産しうるため、比較前提（プリコンディション）として
 * 建物の骨格情報の類似度を判定し、「別建物の可能性」を検出する。
 *
 * 判定に使う骨格情報（ソフト間の符号化差の影響を受けにくい数値列）:
 * - 階標高列: StbStory の height 昇順列。階数差は分母 max(件数) で自然に減点される。
 *   接地階の基準差（実測150mm）を吸収するため許容差既定は300mm。
 * - 通り芯距離列: StbParallelAxis の distance 昇順列（X/Y全グループ合算）。
 *   グリッド間隔は建物固有性が高く、別建物の判別に最も効く。
 *
 * 決定的・純関数（DOM 2つ → 判定オブジェクト）。設定・UI・状態には依存しない。
 * 検証根拠: docs/reports/cross-software-match-benchmark.md（C2 / ガード付き許容差緩和）
 */

/**
 * 判定オプションの既定値。
 * - heightTolerance: 階標高の一致許容差 [mm]（接地階基準差150mm実測を吸収）
 * - distanceTolerance: 通り芯距離の一致許容差 [mm]（配置比較の推奨許容差と同値）
 * - similarityThreshold: これ未満の類似度を「別建物の可能性」と判定する閾値
 */
export const DEFAULT_PRECONDITION_OPTIONS = Object.freeze({
  heightTolerance: 300,
  distanceTolerance: 150,
  similarityThreshold: 0.5,
});

/**
 * 指定タグの数値属性を収集し昇順ソートして返す。
 * @param {Document} doc - STBドキュメント
 * @param {string} tagName - 収集対象タグ名
 * @param {string} attrName - 数値属性名
 * @returns {number[]} 昇順の数値列（非数値は除外）
 */
function collectSortedNumbers(doc, tagName, attrName) {
  if (!doc?.getElementsByTagName) return [];
  return Array.from(doc.getElementsByTagName(tagName))
    .map((el) => parseFloat(el.getAttribute(attrName)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

/**
 * 昇順ソート済み数値列同士を貪欲2ポインタで突き合わせ、
 * 許容差内で一致したペア数を返す（各要素は高々1回だけ対応）。
 * @param {number[]} sortedA - 昇順数値列A
 * @param {number[]} sortedB - 昇順数値列B
 * @param {number} tolerance - 一致とみなす差の上限
 * @returns {number} 一致ペア数
 */
function countMatchesWithinTolerance(sortedA, sortedB, tolerance) {
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < sortedA.length && j < sortedB.length) {
    const diff = sortedA[i] - sortedB[j];
    if (Math.abs(diff) <= tolerance) {
      matched++;
      i++;
      j++;
    } else if (diff < 0) {
      i++;
    } else {
      j++;
    }
  }
  return matched;
}

/**
 * 数値列成分の類似度を計算する。
 * 分母を max(件数) にすることで、値のずれと件数差の双方を減点する。
 * @param {number[]} valuesA - 昇順数値列A
 * @param {number[]} valuesB - 昇順数値列B
 * @param {number} tolerance - 一致許容差
 * @returns {{countA: number, countB: number, matchedCount: number, score: number}|null}
 *   両モデルとも0件の場合は判定不能として null
 */
function scoreNumberSequence(valuesA, valuesB, tolerance) {
  const maxCount = Math.max(valuesA.length, valuesB.length);
  if (maxCount === 0) return null;
  const matchedCount = countMatchesWithinTolerance(valuesA, valuesB, tolerance);
  return {
    countA: valuesA.length,
    countB: valuesB.length,
    matchedCount,
    score: matchedCount / maxCount,
  };
}

/**
 * 2つのSTBドキュメントが「同一建物」の前提を満たすかを判定する（C2）。
 *
 * 階標高列と通り芯距離列の類似度（0..1）を平均し、閾値未満なら
 * 「別建物の可能性あり（similar=false）」とする。
 * 両成分とも判定材料が無い場合（StbStory も StbParallelAxis も無い）は
 * judgeable=false・similar=true（警告しない）を返す。
 *
 * 同一ドキュメント同士では常に score=1・similar=true（自己比較100%維持）。
 *
 * @param {Document} documentA - モデルAのSTBドキュメント
 * @param {Document} documentB - モデルBのSTBドキュメント
 * @param {Object} [options] - DEFAULT_PRECONDITION_OPTIONS の部分上書き
 * @returns {{
 *   similar: boolean,
 *   judgeable: boolean,
 *   score: number|null,
 *   details: {
 *     story: {countA: number, countB: number, matchedCount: number, score: number}|null,
 *     axis: {countA: number, countB: number, matchedCount: number, score: number}|null,
 *   },
 * }} 判定結果
 */
export function checkBuildingPrecondition(documentA, documentB, options = {}) {
  const opts = { ...DEFAULT_PRECONDITION_OPTIONS, ...options };

  const story = scoreNumberSequence(
    collectSortedNumbers(documentA, 'StbStory', 'height'),
    collectSortedNumbers(documentB, 'StbStory', 'height'),
    opts.heightTolerance,
  );
  const axis = scoreNumberSequence(
    collectSortedNumbers(documentA, 'StbParallelAxis', 'distance'),
    collectSortedNumbers(documentB, 'StbParallelAxis', 'distance'),
    opts.distanceTolerance,
  );

  const components = [story, axis].filter((component) => component !== null);
  if (components.length === 0) {
    return { similar: true, judgeable: false, score: null, details: { story, axis } };
  }

  const score = components.reduce((sum, component) => sum + component.score, 0) / components.length;

  return {
    similar: score >= opts.similarityThreshold,
    judgeable: true,
    score,
    details: { story, axis },
  };
}
