/**
 * @fileoverview 形状生成ファクトリーモジュール
 *
 * このファイルは、STBデータに基づく3D形状生成の共通ロジックを提供します:
 * - 鋼材形状（H形鋼、BOX、Pipe、L形鋼、T形鋼、C形鋼）の統一生成
 * - RC/SRC形状（矩形、円形）の統一生成
 * - 形状パラメータの検証と最適化
 * - ExtrudeGeometry/BoxGeometry/CylinderGeometryの統一管理
 *
 * このモジュールにより、梁・柱生成の重複コードを排除し、
 * 新しい形状タイプの追加を容易にします。
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";

/**
 * 鋼材形状を生成するファクトリークラス
 */
export class SteelShapeFactory {
  /**
   * 共通の座標オフセット計算
   * @param {number} height - 形状の高さ
   * @param {string} originType - 原点タイプ ('center' | 'top-center' | 'bottom-center')
   * @returns {number} Y軸オフセット
   */
  static calculateYOffset(height, originType = "center") {
    const halfHeight = height / 2;
    if (originType === "top-center") {
      return -halfHeight; // 上端中心: 断面を下方向に移動
    } else if (originType === "bottom-center") {
      return halfHeight; // 下端中心: 断面を上方向に移動
    }
    return 0; // center: オフセットなし
  }

  /**
   * 共通のパラメータ解析
   * @param {Object} steelShape - 鋼材形状データ
   * @param {Array<string>} paramNames - パラメータ名配列
   * @returns {Array<number>|null} 解析されたパラメータまたはnull
   */
  static parseShapeParams(steelShape, paramNames) {
    const params = paramNames.map((name) => parseFloat(steelShape[name]));
    return this.validateParams(params) ? params : null;
  }

  /**
   * 形状作成の共通ボイラープレート
   * @param {Object} steelShape - 鋼材形状データ
   * @param {Array<string>} paramNames - 必要なパラメータ名
   * @param {string} originType - 原点タイプ
   * @param {Function} shapeCreator - 形状作成関数
   * @returns {THREE.Shape|null} 生成された形状またはnull
   */
  static createShapeWithValidation(
    steelShape,
    paramNames,
    originType,
    shapeCreator
  ) {
    const params = this.parseShapeParams(steelShape, paramNames);
    if (!params) return null;

    return shapeCreator(params, this.calculateYOffset(params[0], originType));
  }
  /**
   * H形鋼の断面形状を生成（Z軸方向にI型になるようにXZ平面で定義）
   * @param {Object} steelShape - 鋼材形状データ
   * @param {string} originType - 断面原点タイプ ('center' | 'top-center')
   * @returns {THREE.Shape|null} 生成された形状またはnull
   */
  static createHShape(steelShape, originType = "center") {
    return this.createShapeWithValidation(
      steelShape,
      ["A", "B", "t1", "t2"],
      originType,
      (params, yOffset) => {
        const [H, B, tw, tf] = params;

        // H形鋼特有のバリデーション
        if (tw >= B || 2 * tf >= H) {
          return null;
        }

        return this._createHShapeGeometry(H, B, tw, tf, yOffset);
      }
    );
  }

  /**
   * H形鋼の実際のジオメトリ作成
   * @private
   */
  static _createHShapeGeometry(H, B, tw, tf, yOffset) {
    const shape = new THREE.Shape();
    const halfB = B / 2;
    const halfH = H / 2;
    const halfTw = tw / 2;
    const innerH_half = halfH - tf;

    // XY平面でH形を定義（X軸：フランジ幅、Y軸：成高）
    shape.moveTo(-halfB, halfH + yOffset);
    shape.lineTo(halfB, halfH + yOffset);
    shape.lineTo(halfB, innerH_half + yOffset);
    shape.lineTo(halfTw, innerH_half + yOffset);
    shape.lineTo(halfTw, -innerH_half + yOffset);
    shape.lineTo(halfB, -innerH_half + yOffset);
    shape.lineTo(halfB, -halfH + yOffset);
    shape.lineTo(-halfB, -halfH + yOffset);
    shape.lineTo(-halfB, -innerH_half + yOffset);
    shape.lineTo(-halfTw, -innerH_half + yOffset);
    shape.lineTo(-halfTw, innerH_half + yOffset);
    shape.lineTo(-halfB, innerH_half + yOffset);
    shape.closePath();

    return shape;
  }

  /**
   * 角形鋼管の断面形状を生成
   * @param {Object} steelShape - 鋼材形状データ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.Shape|null} 生成された形状またはnull
   */
  static createBoxShape(steelShape, originType = "center") {
    return this.createShapeWithValidation(
      steelShape,
      ["A", "B"],
      originType,
      (params, yOffset) => {
        const [H, B] = params;
        const t = parseFloat(steelShape.t);
        const t1 = parseFloat(steelShape.t1);
        const t2 = parseFloat(steelShape.t2);
        const isBuildBox = steelShape.shapeTypeAttr?.includes("Build-BOX");

        return this._createBoxShapeGeometry(
          H,
          B,
          t,
          t1,
          t2,
          isBuildBox,
          yOffset
        );
      }
    );
  }

  /**
   * BOX形状の実際のジオメトリ作成
   * @private
   * @param {number} H - 高さ（mm）
   * @param {number} B - 幅（mm）
   * @param {number} t - 板厚（mm）
   * @param {number} t1 - 上下フランジ厚（mm）
   * @param {number} t2 - 左右フランジ厚（mm）
   * @param {boolean} isBuildBox - 組立BOXかどうか
   * @param {number} yOffset - Y軸オフセット
   * @returns {THREE.Shape} BOX断面形状
   */
  static _createBoxShapeGeometry(H, B, t, t1, t2, isBuildBox, yOffset) {
    const shape = new THREE.Shape();
    const H_half = H / 2;
    const W_half = B / 2;
    const topY = H_half + yOffset;
    const bottomY = -H_half + yOffset;

    // 外形輪郭の作成（時計回り）
    // 角形鋼管の外周を矩形として定義
    shape.moveTo(-W_half, topY);
    shape.lineTo(W_half, topY);
    shape.lineTo(W_half, bottomY);
    shape.lineTo(-W_half, bottomY);
    shape.closePath();

    // 内部中空部の追加（反時計回りで穴として定義）
    this._addBoxHole(shape, H, B, t, t1, t2, isBuildBox, topY, bottomY, W_half);

    return shape;
  }

  /**
   * BOX形状に穴を追加
   * @private
   */
  static _addBoxHole(
    shape,
    H,
    B,
    t,
    t1,
    t2,
    isBuildBox,
    topY,
    bottomY,
    W_half
  ) {
    let innerTopY, innerBottomY, innerLeftX, innerRightX;

    if (isBuildBox && this.validateParams([t1, t2]) && t1 < B && 2 * t2 < H) {
      innerTopY = topY - t2;
      innerBottomY = bottomY + t2;
      innerLeftX = -W_half + t1;
      innerRightX = W_half - t1;
    } else if (
      !isBuildBox &&
      this.validateParams([t]) &&
      2 * t < H &&
      2 * t < B
    ) {
      innerTopY = topY - t;
      innerBottomY = bottomY + t;
      innerLeftX = -W_half + t;
      innerRightX = W_half - t;
    }

    if (innerTopY > innerBottomY && innerRightX > innerLeftX) {
      const hole = new THREE.Path();
      hole.moveTo(innerLeftX, innerTopY);
      hole.lineTo(innerRightX, innerTopY);
      hole.lineTo(innerRightX, innerBottomY);
      hole.lineTo(innerLeftX, innerBottomY);
      hole.closePath();
      shape.holes.push(hole);
    }
  }

  /**
   * 円形鋼管の断面形状を生成
   * @param {Object} steelShape - 鋼材形状データ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.Shape|null} 生成された形状またはnull
   */
  static createPipeShape(steelShape, originType = "center") {
    const D = parseFloat(steelShape.D);
    const t = parseFloat(steelShape.t);

    if (!this.validateParams([D, t]) || 2 * t >= D) {
      return null;
    }

    const shape = new THREE.Shape();
    const radius = D / 2;
    const innerRadius = radius - t;

    // 原点タイプに応じた座標調整
    const centerY = originType === "top-center" ? -radius : 0;

    shape.absarc(0, centerY, radius, 0, Math.PI * 2, false);

    if (innerRadius > 1e-6) {
      const hole = new THREE.Path();
      hole.absarc(0, centerY, innerRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }

    return shape;
  }

  /**
   * 山形鋼の断面形状を生成
   * @param {Object} steelShape - 鋼材形状データ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.Shape|null} 生成された形状またはnull
   */
  static createLShape(steelShape, originType = "center") {
    const H = parseFloat(steelShape.H || steelShape.A);
    const B = parseFloat(steelShape.B);
    const tw = parseFloat(steelShape.tw || steelShape.t1);
    const tf = parseFloat(steelShape.tf || steelShape.t2);

    if (!this.validateParams([H, B, tw, tf]) || tw >= B || tf >= H) {
      return null;
    }

    const shape = new THREE.Shape();

    // 原点タイプに応じた座標調整
    const originX = originType === "top-center" ? -B / 2 : 0;
    const originY = originType === "top-center" ? -H : 0;

    shape.moveTo(originX, originY);
    shape.lineTo(originX + B, originY);
    shape.lineTo(originX + B, originY + tf);
    shape.lineTo(originX + tw, originY + tf);
    shape.lineTo(originX + tw, originY + H);
    shape.lineTo(originX, originY + H);
    shape.closePath();

    return shape;
  }

  /**
   * T形鋼の断面形状を生成
   * @param {Object} steelShape - 鋼材形状データ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.Shape|null} 生成された形状またはnull
   */
  static createTShape(steelShape, originType = "center") {
    const H = parseFloat(steelShape.H || steelShape.A);
    const B = parseFloat(steelShape.B);
    const tw = parseFloat(steelShape.tw || steelShape.t1);
    const tf = parseFloat(steelShape.tf || steelShape.t2);

    if (!this.validateParams([H, B, tw, tf]) || tw >= B || tf >= H) {
      return null;
    }

    const shape = new THREE.Shape();
    const halfB = B / 2;
    const halfTw = tw / 2;

    // 原点タイプに応じた座標調整
    const yOffset = originType === "top-center" ? -H : 0;
    const topY = H + yOffset;
    const bottomY = 0 + yOffset;
    const flangeBottomY = H - tf + yOffset;

    shape.moveTo(-halfB, topY);
    shape.lineTo(halfB, topY);
    shape.lineTo(halfB, flangeBottomY);
    shape.lineTo(halfTw, flangeBottomY);
    shape.lineTo(halfTw, bottomY);
    shape.lineTo(-halfTw, bottomY);
    shape.lineTo(-halfTw, flangeBottomY);
    shape.lineTo(-halfB, flangeBottomY);
    shape.closePath();

    return shape;
  }

  /**
   * 溝形鋼の断面形状を生成
   * @param {Object} steelShape - 鋼材形状データ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.Shape|null} 生成された形状またはnull
   */
  static createCShape(steelShape, originType = "center") {
    const H = parseFloat(steelShape.H || steelShape.A);
    const B = parseFloat(steelShape.B);
    const tw = parseFloat(steelShape.tw || steelShape.t1);
    const tf = parseFloat(steelShape.tf || steelShape.t2);

    if (!this.validateParams([H, B, tw, tf]) || tw >= B || 2 * tf >= H) {
      return null;
    }

    const shape = new THREE.Shape();

    // 原点タイプに応じた座標調整
    const originX = originType === "top-center" ? -B / 2 : 0;
    const originY = originType === "top-center" ? -H : 0;

    shape.moveTo(originX, originY + H);
    shape.lineTo(originX + B, originY + H);
    shape.lineTo(originX + B, originY + H - tf);
    shape.lineTo(originX + tw, originY + H - tf);
    shape.lineTo(originX + tw, originY + tf);
    shape.lineTo(originX + B, originY + tf);
    shape.lineTo(originX + B, originY);
    shape.lineTo(originX, originY);
    shape.closePath();

    return shape;
  }

  /**
   * パラメータの妥当性を検証
   * @param {number[]} params - 検証するパラメータ配列
   * @returns {boolean} すべてのパラメータが有効かどうか
   */
  static validateParams(params) {
    return params.every((p) => !isNaN(p) && p > 0);
  }
}

/**
 * コンクリート形状を生成するファクトリークラス
 */
export class ConcreteShapeFactory {
  /**
   * RC矩形断面の形状を生成
   * @param {Object} concreteShape - コンクリート形状データ
   * @param {number} length - 部材長さ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.BoxGeometry|null} 生成されたジオメトリまたはnull
   */
  static createRectShape(concreteShape, length, originType = "center") {
    const widthX = parseFloat(concreteShape.width_X);
    const widthY = parseFloat(concreteShape.width_Y);

    if (isNaN(widthX) || isNaN(widthY) || widthX <= 0 || widthY <= 0) {
      return null;
    }

    const geometry = new THREE.BoxGeometry(widthX, widthY, length);

    if (originType === "top-center") {
      geometry.translate(0, -widthY / 2, -length / 2);
    }

    return geometry;
  }

  /**
   * RC円形断面の形状を生成
   * @param {Object} concreteShape - コンクリート形状データ
   * @param {number} length - 部材長さ
   * @returns {THREE.CylinderGeometry|null} 生成されたジオメトリまたはnull
   */
  static createCircleShape(concreteShape, length) {
    const D = parseFloat(concreteShape.D);

    if (isNaN(D) || D <= 0) {
      return null;
    }

    return new THREE.CylinderGeometry(D / 2, D / 2, length, 32);
  }
}

/**
 * 統合形状ファクトリー
 */
export class ShapeFactory {
  /**
   * 鋼材形状を生成
   * @param {Object} steelShape - 鋼材形状データ
   * @param {number} length - 部材長さ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.ExtrudeGeometry|null} 生成されたジオメトリまたはnull
   */
  static createSteelShape(steelShape, length, originType = "center") {
    const shapeType = steelShape.shapeTypeAttr || steelShape.elementTag;
    let shape = null;

    if (shapeType.includes("H")) {
      shape = SteelShapeFactory.createHShape(steelShape, originType);
    } else if (shapeType.includes("BOX")) {
      shape = SteelShapeFactory.createBoxShape(steelShape, originType);
    } else if (shapeType.includes("Pipe")) {
      shape = SteelShapeFactory.createPipeShape(steelShape, originType);
    } else if (shapeType.includes("L")) {
      shape = SteelShapeFactory.createLShape(steelShape, originType);
    } else if (shapeType.includes("T")) {
      shape = SteelShapeFactory.createTShape(steelShape, originType);
    } else if (shapeType.includes("C")) {
      shape = SteelShapeFactory.createCShape(steelShape, originType);
    }

    if (!shape) {
      return null;
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: false,
      steps: 1,
    });

    // 押し出し方向の中心調整
    geometry.translate(0, 0, -length / 2);

    return geometry;
  }

  /**
   * コンクリート形状を生成
   * @param {Object} concreteShape - コンクリート形状データ
   * @param {number} length - 部材長さ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.Geometry|null} 生成されたジオメトリまたはnull
   */
  static createConcreteShape(concreteShape, length, originType = "center") {
    if (
      concreteShape.type === "StbSecColumn_RC_Rect" ||
      concreteShape.type === "StbSecBeam_RC_Straight"
    ) {
      return ConcreteShapeFactory.createRectShape(
        concreteShape,
        length,
        originType
      );
    } else if (
      concreteShape.type === "StbSecColumn_Circle" ||
      concreteShape.type === "StbSecColumn_RC_Circle"
    ) {
      return ConcreteShapeFactory.createCircleShape(concreteShape, length);
    }

    return null;
  }

  /**
   * デフォルト形状を生成
   * @param {number} length - 部材長さ
   * @param {string} originType - 断面原点タイプ
   * @returns {THREE.BoxGeometry} デフォルトのボックス形状
   */
  static createDefaultShape(length, originType = "center") {
    const defaultSize = 300; // mm
    const geometry = new THREE.BoxGeometry(defaultSize, defaultSize, length);

    if (originType === "top-center") {
      geometry.translate(0, -defaultSize / 2, 0);
    }
    // 中心原点の場合はそのまま（BoxGeometryは既に中心が原点）

    return geometry;
  }
}
