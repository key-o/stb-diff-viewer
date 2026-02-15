/**
 * @fileoverview レンダリング関連の定数定義
 *
 * Three.jsレンダリング、カメラ、UI表示に関する定数を一元管理します。
 * マジックナンバーを排除し、保守性を向上させます。
 */

// ============================================================================
// カメラ設定
// ============================================================================

/**
 * 正投影カメラのズーム設定
 */
export const CAMERA_ORTHOGRAPHIC = {
  ZOOM_FACTOR: 0.001,
  MIN_ZOOM: 0.01,
  MAX_ZOOM: 50,
};

/**
 * カメラ操作設定
 */
export const CAMERA_CONTROLS = {
  DRAG_THRESHOLD_PX: 3, // ドラッグと判定する最小ピクセル数
};

// ============================================================================
// ラベル表示設定
// ============================================================================

/**
 * ラベルキャンバスとフォント設定
 */
export const LABEL_SETTINGS = {
  // 標準ラベル
  FONT_SIZE: 45,
  CANVAS_WIDTH: 512,
  CANVAS_HEIGHT: 64,
  BASE_SCALE_X: 640,
  BASE_SCALE_Y: 80,
  OFFSET_X: 256, // CANVAS_WIDTH / 2
  OFFSET_Y: 32, // CANVAS_HEIGHT / 2

  // 通り芯ラベル（丸い背景）
  BALLOON_SIZE: 64,
  BALLOON_FONT_SIZE: 28,

  // 階ラベル（四角い背景）
  STORY_BOX_WIDTH: 80,
  STORY_BOX_HEIGHT: 48,
  STORY_FONT_SIZE: 24,

  // スケーリング設定
  REFERENCE_DISTANCE: 5000,
  MIN_SCALE_FACTOR: 5.0,
  MAX_SCALE_FACTOR: 30.0,
};

/**
 * ラベルオクルージョンチェック設定
 * ラベルの遮蔽判定と位置補間を制御します
 */
export const LABEL_OCCLUSION_SETTINGS = {
  // チェック頻度（間引き設定）
  CHECK_INTERVAL_FRAMES: 10, // フレーム間引き数（0で毎フレーム）
  CAMERA_MOVE_THRESHOLD: 100, // カメラ移動検出閾値 (mm)
  CAMERA_ROTATE_THRESHOLD: 0.02, // カメラ回転検出閾値 (ラジアン)

  // ヒステリシス設定（状態変化の安定化）
  HYSTERESIS_FRAMES: 5, // 状態変化に必要な連続フレーム数

  // 位置補間設定
  LERP_FACTOR: 0.15, // 補間係数（0.0-1.0、小さいほど滑らか）

  // 押し出し設定
  MAX_PUSH_DISTANCE: 500, // 最大押し出し距離 (mm)
  PUSH_DISTANCE_RATIO: 0.1, // 距離に対する押し出し比率
};

// ============================================================================
// グリッド設定
// ============================================================================

/**
 * グリッドヘルパーの設定
 */
export const GRID_SETTINGS = {
  SIZE: 100000, // グリッドのサイズ (mm)
  DIVISIONS: 100, // グリッドの分割数
  CENTER_LINE_COLOR: 0x888888, // 中心線の色
  GRID_LINE_COLOR: 0xcccccc, // グリッド線の色
};

// ============================================================================
// 通り芯・階表示設定
// ============================================================================

/**
 * 通り芯線のダッシュパターン（一点鎖線）
 */
export const AXIS_LINE_PATTERN = {
  DASH_LENGTH: 500, // 長い実線部分 (mm) - 短くしてサイクル数を増やす
  DOT_LENGTH: 200, // 点部分 (mm) - 視認性向上のため拡大
  GAP_LENGTH: 150, // 隙間 (mm) - 少し短く
};

// ============================================================================
// デフォルトエクスポート
// ============================================================================

export default {
  CAMERA_ORTHOGRAPHIC,
  CAMERA_CONTROLS,
  LABEL_SETTINGS,
  LABEL_OCCLUSION_SETTINGS,
  GRID_SETTINGS,
  AXIS_LINE_PATTERN,
};
