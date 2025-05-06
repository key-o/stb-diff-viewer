/**
 * @fileoverview 3Dラベル生成・管理モジュール
 *
 * このファイルは、3D空間内のラベル表示に関する機能を提供します:
 * - 要素情報を表示するためのラベルスプライトの生成
 * - カメラ視点に応じたラベル表示の動的調整
 * - ラベルの視認性と表示制御
 * - 各種要素（柱、梁、階、通り芯など）用の特殊ラベル
 * - ビューフラスタムとクリッピングに対応したラベル表示
 *
 * このモジュールは、3Dモデル内の要素に識別情報を付加し、
 * ユーザーの視点に合わせた読みやすいラベル表示を実現します。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";

/**
 * 指定されたテキストと位置を持つラベルスプライトを作成し、指定されたグループに追加する。
 * カメラからの距離に応じてスプライトのスケールを調整する。
 * StoryとAxisラベルはクリッピングの影響を受けない。 // コメント修正
 * StoryとAxisラベルはビュー範囲外判定をスキップする。 // コメント追加
 * @param {string} text - ラベルに表示するテキスト。
 * @param {THREE.Vector3} position - ラベルを表示する3D空間上の元の位置。
 * @param {THREE.Group} spriteGroup - 作成したスプライトを追加するグループ。
 * @param {string} elementType - ラベルが属する要素タイプ (表示制御用)。
 * @returns {THREE.Sprite|null} 作成されたラベルスプライト、またはエラー時にnull。
 */
export function createLabelSprite(text, position, spriteGroup, elementType) {
  const labelFontSize = 45;
  const labelCanvasWidth = 512;
  const labelCanvasHeight = 64;
  const labelBaseScaleX = 640;
  const labelBaseScaleY = 80;
  const labelOffsetX = labelCanvasWidth / 2;
  const labelOffsetY = labelCanvasHeight / 2;
  const referenceDistance = 5000;
  // ★★★ 最小スケール係数を引き上げ ★★★
  // const minScaleFactor = 1.0; // 元の値
  const minScaleFactor = 5.0; // より大きくする (例えば 5.0 や 10.0 などで試す)
  const maxScaleFactor = 30.0;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = labelCanvasWidth;
    canvas.height = labelCanvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to get 2D context for label canvas.");
      return null;
    }
    ctx.clearRect(0, 0, labelCanvasWidth, labelCanvasHeight);
    ctx.font = `bold ${labelFontSize}px sans-serif`;
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    ctx.strokeText(text, labelOffsetX, labelOffsetY);
    ctx.fillText(text, labelOffsetX, labelOffsetY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      sizeAttenuation: true,
      // ★★★ テスト用: 深度テストを一時的に無効化してみる ★★★
      // depthTest: true, // 通常はこちら
      depthTest: true, // <<< テストする場合はこちらを有効化 (他の要素との前後関係がおかしくなります)
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);

    const baseScale = new THREE.Vector3(labelBaseScaleX, labelBaseScaleY, 1);
    sprite.userData.baseScale = baseScale;
    sprite.userData.referenceDistance = referenceDistance;
    sprite.userData.minScaleFactor = minScaleFactor; // 更新された minScaleFactor を使用
    sprite.userData.maxScaleFactor = maxScaleFactor;
    sprite.userData.elementType = elementType;
    sprite.userData.originalPosition = position.clone();

    sprite.position.copy(position);

    sprite.onBeforeRender = function (rendererInstance, scene, cameraInstance) {
      const originalPos = this.userData.originalPosition;
      const elementType = this.userData.elementType;
      let currentPos = originalPos.clone();
      const initialVisibility = this.visible; // UIによる表示状態
      let shouldBeVisible = initialVisibility; // 基本的にUIの状態に従う
      // let isClipped = false; // クリッピング判定フラグ (削除またはコメントアウト)
      let isOutsideView = false;

      // --- クリッピングチェック (削除またはコメントアウト) ---
      /*
      if (rendererInstance.localClippingEnabled && rendererInstance.clippingPlanes.length > 0) {
        const planes = rendererInstance.clippingPlanes;
        for (const plane of planes) {
          // ラベルの元の位置がクリップ平面の外側ならフラグを立てる
          if (plane.distanceToPoint(originalPos) < 0) {
            isClipped = true;
            break;
          }
        }
        // AxisとStory以外のラベルで、クリップされていたら非表示にする
        if (isClipped && elementType !== 'Story' && elementType !== 'Axis') {
          shouldBeVisible = false;
        }
      }
      */
      // --- ここまでクリッピングチェック削除 ---

      // --- ビュー範囲 (Frustum) チェック ---
      // ★★★ shouldBeVisible が true で、かつ Story/Axis 以外の場合のみチェック ★★★
      if (
        shouldBeVisible &&
        elementType !== "Story" &&
        elementType !== "Axis"
      ) {
        // ... (frustum culling logic - unchanged) ...
        const worldPosition = new THREE.Vector3();
        this.getWorldPosition(worldPosition);
        const projectedPosition = worldPosition.clone().project(cameraInstance);
        const margin = 1.1;
        if (
          projectedPosition.x < -margin ||
          projectedPosition.x > margin ||
          projectedPosition.y < -margin ||
          projectedPosition.y > margin ||
          projectedPosition.z < -1 ||
          projectedPosition.z > 1
        ) {
          shouldBeVisible = false;
          isOutsideView = true;
        }
      }

      // --- デバッグログ (変更時のみ、かつUIで表示ONの場合) ---
      if (this.visible !== shouldBeVisible && initialVisibility) {
        let reason = "";
        // if (isClipped && elementType !== 'Story' && elementType !== 'Axis' && !shouldBeVisible) reason += `Clipped (${elementType}); `; // 削除
        if (isOutsideView && !shouldBeVisible) reason += "Outside view; ";
        if (reason === "" && !shouldBeVisible) reason = "Unknown reason; ";
        console.log(
          `Label '${text}' (${elementType}): Visibility changing ${this.visible} -> ${shouldBeVisible}. Reason: ${reason}`
        );
      }

      // --- 最終設定 ---
      this.position.copy(currentPos);
      // ★★★ UIによる表示状態とビュー範囲外判定のみで表示を決定 ★★★
      this.visible = initialVisibility && shouldBeVisible;

      // --- スケール調整 ---
      if (this.visible) {
        // ... (scale adjustment logic - unchanged) ...
        const spriteWorldPosition = new THREE.Vector3();
        this.getWorldPosition(spriteWorldPosition);
        const distance = spriteWorldPosition.distanceTo(
          cameraInstance.position
        );
        let scaleFactor = distance / this.userData.referenceDistance;
        scaleFactor = Math.max(
          this.userData.minScaleFactor,
          Math.min(scaleFactor, this.userData.maxScaleFactor)
        );
        this.scale.copy(this.userData.baseScale).multiplyScalar(scaleFactor);
      }
    };

    spriteGroup.add(sprite);
    return sprite;
  } catch (error) {
    console.error("Error creating label sprite:", error);
    return null;
  }
}

/**
 * ラベル用のスプライトを作成する
 * @param {string} text - 表示するテキスト
 * @param {number} x - X座標
 * @param {number} y - Y座標
 * @param {number} z - Z座標
 * @param {string} elementType - 要素タイプ (例: 'Node', 'Column')
 * @param {string} elementId - 要素ID
 * @param {string} modelSource - モデルソース ('A', 'B', 'matched')
 * @param {Object} [options={}] - オプション (fontSize, colorなど)
 * @returns {THREE.Sprite} 作成されたラベルスプライト
 */
// ★★★ 関数名を createLabel に変更し、export を追加 ★★★
export function createLabel(
  text,
  x,
  y,
  z,
  elementType,
  elementId,
  modelSource,
  options = {}
) {
  const fontSize = options.fontSize || 16;
  const fontFamily = options.fontFamily || "Arial";
  const textColor = options.color || "rgba(0, 0, 0, 1)"; // デフォルトは黒
  const backgroundColor = options.backgroundColor || "rgba(255, 255, 255, 0.7)"; // デフォルトは半透明白
  const padding = options.padding || 4;
  const borderRadius = options.borderRadius || 2;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `${fontSize}px ${fontFamily}`;

  // テキスト幅を測定
  const textMetrics = context.measureText(text);
  const textWidth = textMetrics.width;

  // キャンバスサイズを設定 (パディング込み)
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 2; // 高さもフォントサイズとパディング基準に

  // 背景を描画
  context.fillStyle = backgroundColor;
  // 角丸矩形を描画 (オプション)
  if (borderRadius > 0) {
    context.beginPath();
    context.moveTo(borderRadius, 0);
    context.lineTo(canvas.width - borderRadius, 0);
    context.quadraticCurveTo(canvas.width, 0, canvas.width, borderRadius);
    context.lineTo(canvas.width, canvas.height - borderRadius);
    context.quadraticCurveTo(
      canvas.width,
      canvas.height,
      canvas.width - borderRadius,
      canvas.height
    );
    context.lineTo(borderRadius, canvas.height);
    context.quadraticCurveTo(0, canvas.height, 0, canvas.height - borderRadius);
    context.lineTo(0, borderRadius);
    context.quadraticCurveTo(0, 0, borderRadius, 0);
    context.closePath();
    context.fill();
  } else {
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  // テキストを描画
  context.font = `${fontSize}px ${fontFamily}`; // 再度フォント設定 (重要)
  context.fillStyle = textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false, // 他のオブジェクトに隠れないようにする (必要に応じて調整)
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);

  // スプライトのスケールを調整して、画面上でのサイズ感を一定に保つ
  // (カメラからの距離に応じてスケールを変えるなどの高度な処理も可能)
  const scaleFactor = 0.1; // この値を調整して基本サイズを決める
  sprite.scale.set(
    canvas.width * scaleFactor,
    canvas.height * scaleFactor,
    1.0
  );

  sprite.position.set(x, y, z);

  // ユーザーデータに情報を追加
  sprite.userData = {
    ...sprite.userData, // 既存のuserDataを保持
    isLabel: true,
    elementType: elementType, // ラベルがどの要素タイプに属するか
    elementId: elementId, // 関連する要素のID
    modelSource: modelSource, // どのモデル由来か
    originalText: text, // 元のテキスト
  };

  // 初期状態は非表示にする (ui.jsで制御)
  sprite.visible = false;

  return sprite;
}
