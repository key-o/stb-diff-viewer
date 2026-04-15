/**
 * @fileoverview DXF座標変換ユーティリティ
 *
 * DXF座標を3D座標に変換する関数を提供します。
 * dxfViewer、dxfEntityRenderers、dxfTextRendererから使用されます。
 */

/**
 * DXF座標を3D座標に変換
 * 配置面に応じて座標軸を変換する
 * @param {number} x - DXFのX座標
 * @param {number} y - DXFのY座標
 * @param {number} z - DXFのZ座標（通常は0）
 * @param {Object} transformOptions - 変換オプション
 * @returns {Object} 変換後の座標 {x, y, z}
 */
export function transformCoordinates(x, y, z, transformOptions) {
  const { scale = 1, offsetX = 0, offsetY = 0, offsetZ = 0, plane = 'xy' } = transformOptions;

  let tx, ty, tz;

  switch (plane) {
    case 'xy':
      // XY平面（平面図） - そのまま
      tx = x * scale + offsetX;
      ty = y * scale + offsetY;
      tz = z * scale + offsetZ;
      break;

    case 'xz':
      // XZ平面（Y通り断面図） - DXFのY→3DのZ
      tx = x * scale + offsetX;
      ty = offsetY; // Y通りの位置
      tz = y * scale + offsetZ;
      break;

    case 'yz':
      // YZ平面（X通り断面図） - DXFのX→3DのY, DXFのY→3DのZ
      tx = offsetX; // X通りの位置
      ty = x * scale + offsetY;
      tz = y * scale + offsetZ;
      break;

    default:
      tx = x * scale + offsetX;
      ty = y * scale + offsetY;
      tz = z * scale + offsetZ;
  }

  return { x: tx, y: ty, z: tz };
}
