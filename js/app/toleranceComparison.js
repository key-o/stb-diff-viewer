/**
 * @fileoverview 許容差を考慮した座標比較関数（再エクスポート）
 *
 * 実装は common-stb/comparison/toleranceComparison.js に移動しました。
 * レイヤー違反解消のため、このファイルは後方互換性のための再エクスポートを提供します。
 */

export {
  compareCoordinatesWithTolerance,
  compareElementDataWithTolerance,
} from '../common-stb/comparison/toleranceComparison.js';
