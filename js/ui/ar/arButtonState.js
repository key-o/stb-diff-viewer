/**
 * @fileoverview ARボタンの表示・活性状態を決定する純関数
 *
 * DOM に依存しないロジックとして分離し、ユニットテストを可能にします。
 * 実際の DOM への反映は arButton.js が行います。
 */

/** モデル未読み込みでARを開始できないときに提示する理由文言 */
export const AR_DISABLED_REASON_NO_MODEL = 'モデルを読み込むとAR表示を利用できます';

/**
 * ARボタンの表示・活性状態を計算する
 * @param {Object} params
 * @param {boolean} params.supported - WebXR immersive-ar が利用可能か
 * @param {boolean} params.modelLoaded - モデルが読み込み済みか
 * @param {boolean} params.sessionActive - ARセッションがアクティブか
 * @returns {{visible: boolean, enabled: boolean, reason: string|null}}
 *   visible: ボタンを表示するか / enabled: 操作を受け付けるか /
 *   reason: 無効時にユーザーへ提示する理由（有効時は null）
 */
export function computeArButtonState({ supported, modelLoaded, sessionActive }) {
  if (!supported) {
    return { visible: false, enabled: false, reason: null };
  }
  if (sessionActive) {
    // AR中は「AR終了」操作を常に受け付ける
    return { visible: true, enabled: true, reason: null };
  }
  if (!modelLoaded) {
    return { visible: true, enabled: false, reason: AR_DISABLED_REASON_NO_MODEL };
  }
  return { visible: true, enabled: true, reason: null };
}
