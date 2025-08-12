/**
 * @fileoverview 断面抽出統一設定
 *
 * 全要素タイプの断面データ抽出設定を一元管理します。
 * 新要素追加時は、この設定にエントリを追加するだけで
 * 自動的に全システムに反映されます。
 */

/**
 * 要素タイプ別断面設定
 * 各要素タイプの抽出ルールを定義
 */
export const SECTION_CONFIG = {
  Column: {
    selectors: [
      "StbSecColumn_RC",
      "StbSecColumn_S",
      "StbSecColumn_SRC",
      "StbSecColumn_CFT",
    ],
    steelFigures: [
      "StbSecSteelFigureColumn_S",
      "StbSecSteelFigureColumn_CFT",
      "StbSecSteelFigureColumn_SRC",
    ],
    // RCでは図形フィギュア要素だけでなく、直下にRect/Circle要素が来る形式もある
    // 例: <StbSecColumn_RC> <StbSecColumn_RC_Rect width_X="500" width_Y="500"/> </StbSecColumn_RC>
    // これらも寸法抽出の対象に含める
    concreteFigures: [
      "StbSecFigureColumn_RC",
      "StbSecFigureColumn_SRC",
      // 直下定義のRC図形
      "StbSecColumn_RC_Rect",
      "StbSecColumn_RC_Circle",
      // 将来拡張（SRC/CFTでも直下定義されるケース用、存在しなくても問題なし）
      "StbSecColumn_SRC_Rect",
      "StbSecColumn_SRC_Circle",
      "StbSecColumn_CFT_Rect",
      "StbSecColumn_CFT_Circle",
    ],
  },

  Beam: {
    selectors: [
      "StbSecGirder_RC",
      "StbSecGirder_S",
      "StbSecGirder_SRC",
      "StbSecBeam_RC",
      "StbSecBeam_S",
      "StbSecBeam_SRC",
    ],
    steelFigures: [
      "StbSecSteelFigureGirder_S",
      "StbSecSteelFigureBeam_S",
      "StbSecSteelFigureGirder_SRC",
      "StbSecSteelFigureBeam_SRC",
    ],
    concreteFigures: [
      "StbSecFigureBeam_RC",
      "StbSecFigureGirder_RC",
      "StbSecFigureBeam_SRC",
      "StbSecFigureGirder_SRC",
    ],
  },

  Brace: {
    selectors: ["StbSecBrace_S"],
    steelFigures: ["StbSecSteelFigureBrace_S"],
  },
};

/**
 * 設定の妥当性を検証
 * @returns {Array<string>} エラーメッセージの配列（空配列なら正常）
 */
export function validateSectionConfig() {
  const errors = [];

  for (const [elementType, config] of Object.entries(SECTION_CONFIG)) {
    // selectors必須チェック
    if (!config.selectors || config.selectors.length === 0) {
      errors.push(`${elementType}: selectors is required`);
      continue;
    }

    // セレクター形式チェック
    config.selectors.forEach((selector) => {
      if (!selector.match(/^StbSec\w+$/)) {
        errors.push(`${elementType}: Invalid selector format: ${selector}`);
      }
    });

    // 図形マッピング整合性チェック
    if (config.steelFigures) {
      config.steelFigures.forEach((figure) => {
        if (!figure.match(/^StbSec.*Figure/)) {
          errors.push(`${elementType}: Invalid steel figure format: ${figure}`);
        }
      });
    }
  }

  return errors;
}

/**
 * サポートされている要素タイプの一覧を取得
 * @returns {Array<string>} 要素タイプ配列
 */
export function getSupportedElementTypes() {
  return Object.keys(SECTION_CONFIG);
}
