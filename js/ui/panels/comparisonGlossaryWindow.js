/**
 * @fileoverview 配置要素の対応判定 用語ヘルプ（フローティングウィンドウ）
 *
 * 色付けモード設定で使う用語（配置要素・点/線/面基準・オフセット・許容差）を
 * ST-Bridge定義に沿って解説するフローティングウィンドウを提供する。
 * 本体UIを操作しながら参照できるよう、モーダルではなく非モーダルの
 * FloatingWindow として登録する。設定パネル内の「用語ヘルプ」ボタンで開閉する。
 */

import { floatingWindowManager } from './floatingWindowManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ComparisonGlossaryWindow');

const WINDOW_ID = 'comparison-glossary-float';
/** トグルボタンは comparisonKeySelector のパネル内に生成される */
const TOGGLE_BUTTON_ID = 'comparison-glossary-btn';
const STYLE_ID = 'comparison-glossary-styles';

/**
 * 用語ヘルプの本文HTML。
 * ST-Bridge要素名・節点参照属性・オフセット属性の出所は
 * elementComparison.js / comparator.js の実装に基づく。
 */
function createGlossaryBodyHTML() {
  return `
    <div class="glossary-body">
      <p class="glossary-lead">
        「配置要素の対応判定基準」は、2つのモデル間で<strong>どの要素とどの要素が「同じ配置要素」か</strong>を
        決めるルールです。判定の単位は要素の形状により <strong>点基準・線基準・面基準</strong> の3種に分かれます。
      </p>

      <h4 class="glossary-h">配置要素</h4>
      <p>
        ST-Bridgeで節点(<code>StbNode</code>)を参照して座標配置される実体要素です。
        節点(<code>StbNode</code>)・階(<code>StbStory</code>)・通り芯(<code>StbAxis</code>)自体は非配置要素です。
      </p>
      <div class="glossary-table-wrap">
        <table class="glossary-table">
          <thead>
            <tr><th>基準</th><th>ST-Bridge要素</th><th>参照する節点</th><th>一致条件</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>点基準</strong></td>
              <td><code>StbNode</code></td>
              <td>自身の座標</td>
              <td>その1点が一致</td>
            </tr>
            <tr>
              <td><strong>線基準（縦材）</strong></td>
              <td><code>StbColumn</code>／<code>StbPost</code>／<code>StbFoundationColumn</code>／<code>StbPile</code>／<code>StbFooting</code></td>
              <td><code>id_node_bottom</code>（下端）・<code>id_node_top</code>（上端）<br><span class="glossary-note">1節点形式は <code>id_node</code>＋<code>level_top</code>/<code>level_bottom</code> から線分を合成</span></td>
              <td>下端・上端の<strong>両点が一致</strong></td>
            </tr>
            <tr>
              <td><strong>線基準（横材）</strong></td>
              <td><code>StbGirder</code>（大梁）／<code>StbBeam</code>（小梁）／<code>StbBrace</code>／<code>StbParapet</code>／<code>StbStripFooting</code></td>
              <td><code>id_node_start</code>（始点）・<code>id_node_end</code>（終点）</td>
              <td>始点・終点の<strong>両点が一致</strong></td>
            </tr>
            <tr>
              <td><strong>面基準</strong></td>
              <td><code>StbSlab</code>（スラブ）／<code>StbWall</code>・<code>StbShearWall</code>（壁）</td>
              <td><code>StbNodeIdOrder</code>（頂点列）</td>
              <td><strong>全頂点が一致</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="glossary-note">
        ※ 線基準は「始点と終点の<strong>両方</strong>」、面基準は「<strong>全頂点</strong>」が一致して初めて同一部材として認識します。
      </p>

      <h4 class="glossary-h">オフセット（ST-Bridge由来のデータ）</h4>
      <p>
        節点位置から実際の配置位置までのずれ量で、ST-Bridgeファイルに記録された値です（アプリの設定値ではありません）。
        「＋オフセット」系の判定基準を選ぶと、節点座標にこの値を<strong>加算した最終座標</strong>で対応を判定します。
        取得元は基準ごとに異なります。
      </p>
      <ul class="glossary-list">
        <li><strong>線基準（横材）</strong>: 要素自身の <code>offset_start_X/Y/Z</code>（始点）・<code>offset_end_X/Y/Z</code>（終点）</li>
        <li><strong>線基準（縦材・1節点形式）</strong>: <code>offset_X</code>・<code>offset_Y</code> と <code>level_top</code>/<code>level_bottom</code></li>
        <li><strong>面基準</strong>: <code>StbSlabOffsetList</code>／<code>StbWallOffsetList</code> 内の頂点ごとの <code>offset_X/Y/Z</code></li>
      </ul>

      <h4 class="glossary-h">許容差（このアプリ内の設定）</h4>
      <p>
        「許容差設定」パネルで指定する閾値です。対応付けようとする<strong>2モデルの基準とする点どうしの座標差</strong>が
        この範囲内であれば「一致」とみなします。オフセットを加算した後の最終座標に対して適用されます。
      </p>

      <h4 class="glossary-h">断面の判定基準</h4>
      <p>
        配置要素の対応が取れたペアについて、参照している断面を「同じ断面」とみなす条件です。
        <strong>何を対応の拠り所にするか</strong>で3系統に分かれます。
      </p>
      <div class="glossary-table-wrap">
        <table class="glossary-table">
          <thead>
            <tr><th>系統</th><th>選択肢</th><th>拠り所・判定ロジック</th></tr>
          </thead>
          <tbody>
            <tr>
              <td rowspan="2"><strong>A. 配置要素に紐づく</strong></td>
              <td><strong>配置対応を継承</strong></td>
              <td>上段「配置要素の対応判定」で同一と判定されたペアの断面を同一とみなす（断面差は型差分として表示）</td>
            </tr>
            <tr>
              <td><strong>配置対応を継承＋第一Node所属階</strong></td>
              <td>上記に加え、配置要素の<strong>第一Node</strong>（線材=始点/下端、面材=頂点列先頭、点=自身）が所属する<strong>階名</strong>も一致条件に加える</td>
            </tr>
            <tr>
              <td><strong>B. GUIDに紐づく</strong></td>
              <td><strong>断面GUID</strong></td>
              <td>断面要素の <code>guid</code> 属性で対応（同一ソフト・同一モデル向け。異ソフト間では一致しない）</td>
            </tr>
            <tr>
              <td rowspan="5"><strong>C. 断面要素で独立</strong></td>
              <td><strong>断面id</strong></td>
              <td>断面参照ID <code>id_section</code> で対応（同一ソフト・同一モデル向け）</td>
            </tr>
            <tr>
              <td><strong>断面名称</strong></td>
              <td>断面 <code>name</code>（符号）で対応（同符号・別形状は型差分として検出）</td>
            </tr>
            <tr>
              <td><strong>名称＋階正準化（異ソフト間）</strong></td>
              <td>断面名称で対応しつつ、断面定義ツリーの階を <code>StbStory</code> 標高で正準化し
                  階名の表記差（1 / 1FL / Z01 等）を吸収する（別ソフト出力の同一建物比較向け）</td>
            </tr>
            <tr>
              <td><strong>同一ジオメトリ形状</strong></td>
              <td>生成される3D立体の外形（<strong>GSS</strong>）で対応。下記参照</td>
            </tr>
            <tr>
              <td><strong>全属性</strong></td>
              <td>断面の全構成属性（種別・寸法・材質・強度・鉄筋等）が一致する場合のみ同一とみなす</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="glossary-note">
        <strong>GSS（Geometry Shape Signature ＝ 同一ジオメトリ形状）</strong>:
        断面から生成される3D立体の外形（RC外形／S形鋼プロファイル／SRC複合）が一致すれば同一断面とみなす指標です。
        鉄筋配置・材質・強度・断面名は無視し、寸法は0.1mm精度で厳密一致を判定します。
      </p>
    </div>
  `;
}

/**
 * 用語ヘルプ本文のスタイルを注入（初回のみ）。
 * ウィンドウ枠（ヘッダー・閉じるボタン・ドラッグ/リサイズ）は
 * FloatingWindow 共通スタイルが担うため、ここでは本文のみを対象とする。
 */
function injectGlossaryStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${WINDOW_ID} { width: 560px; }

    .glossary-body {
      font-size: var(--font-size-sm);
      line-height: 1.6;
    }

    .glossary-body p { margin: 0 0 10px; }

    .glossary-lead {
      background: var(--color-info-bg, #e7f5ff);
      border-left: 3px solid var(--color-info, #1c7ed6);
      padding: 8px 12px;
      border-radius: 4px;
    }

    .glossary-h {
      margin: 16px 0 6px;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-primary, #1c7ed6);
    }

    .glossary-list { margin: 0 0 10px; padding-left: 20px; }
    .glossary-list li { margin-bottom: 4px; }

    .glossary-note {
      font-size: var(--font-size-xs);
      color: var(--color-text-muted, #6c757d);
    }

    .glossary-table-wrap { overflow-x: auto; }

    .glossary-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 8px;
      font-size: var(--font-size-xs);
    }

    .glossary-table th,
    .glossary-table td {
      border: 1px solid var(--color-border, #dee2e6);
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }

    .glossary-table th {
      background: var(--color-surface-alt, #f8f9fa);
      font-weight: var(--font-weight-semibold);
    }

    .glossary-body code {
      background: var(--color-surface-alt, #f1f3f5);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 0.92em;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 用語ヘルプのフローティングウィンドウを登録する。
 * トグルボタン（comparison-glossary-btn）がDOMに存在した後に呼ぶこと
 * （comparisonKeySelector のパネル描画後）。二重登録は manager 側で防止される。
 */
export function initializeComparisonGlossaryWindow() {
  const toggleButton = document.getElementById(TOGGLE_BUTTON_ID);
  if (!toggleButton) {
    logger.warn(`トグルボタン #${TOGGLE_BUTTON_ID} が見つからないため登録をスキップ`);
    return;
  }

  injectGlossaryStyles();

  // ウィンドウ本体がまだ無ければ生成
  if (!document.getElementById(WINDOW_ID)) {
    floatingWindowManager.createWindow({
      windowId: WINDOW_ID,
      title: '配置要素の対応判定 用語ヘルプ',
      icon: '📖',
      content: createGlossaryBodyHTML(),
    });
  }

  // パネル再描画でトグルボタンが作り直された場合に備え、登録済みなら一旦解除して
  // 最新のボタン要素へ再結線する（初回は no-op）。
  floatingWindowManager.unregisterWindow(WINDOW_ID);

  floatingWindowManager.registerWindow({
    windowId: WINDOW_ID,
    toggleButtonId: TOGGLE_BUTTON_ID,
    closeButtonId: `close-${WINDOW_ID}-btn`,
    headerId: `${WINDOW_ID}-header`,
    draggable: true,
    resizable: true,
    autoShow: false,
  });

  logger.debug('Comparison glossary floating window registered');
}
