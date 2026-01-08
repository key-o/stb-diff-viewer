/* global self */
/**
 * @fileoverview ジオメトリ処理Web Worker
 *
 * メインスレッドをブロックせずに重い計算処理を実行します。
 * - 断面プロファイルの頂点計算
 * - ジオメトリデータの生成
 * - バッチ変換処理
 *
 * @module StbDiffViewer/workers/geometryWorker
 */

/**
 * ワーカーのバージョン
 */
const WORKER_VERSION = '1.0.0';

/**
 * メッセージハンドラ
 */
self.onmessage = function (event) {
  const { type, id, payload } = event.data;

  try {
    let result;

    switch (type) {
      case 'ping':
        result = { version: WORKER_VERSION, timestamp: Date.now() };
        break;

      case 'generateProfileVertices':
        result = generateProfileVertices(payload);
        break;

      case 'generateExtrusionData':
        result = generateExtrusionData(payload);
        break;

      case 'batchTransform':
        result = batchTransform(payload);
        break;

      case 'calculateBoundingBox':
        result = calculateBoundingBox(payload);
        break;

      case 'mergeVertexArrays':
        result = mergeVertexArrays(payload);
        break;

      case 'generateGridVertices':
        result = generateGridVertices(payload);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: { message: error.message, stack: error.stack },
    });
  }
};

/**
 * 断面プロファイルの頂点を生成
 * @param {Object} params
 * @param {string} params.profileType - 断面タイプ（H, Box, Pipe, L等）
 * @param {Object} params.dimensions - 寸法パラメータ
 * @returns {Float32Array} 頂点配列
 */
function generateProfileVertices({ profileType, dimensions }) {
  switch (profileType) {
    case 'H':
      return generateHProfileVertices(dimensions);
    case 'Box':
      return generateBoxProfileVertices(dimensions);
    case 'Pipe':
      return generatePipeProfileVertices(dimensions);
    case 'L':
      return generateLProfileVertices(dimensions);
    case 'T':
      return generateTProfileVertices(dimensions);
    case 'C':
      return generateCProfileVertices(dimensions);
    case 'Rectangle':
      return generateRectangleProfileVertices(dimensions);
    case 'Circle':
      return generateCircleProfileVertices(dimensions);
    default:
      throw new Error(`Unknown profile type: ${profileType}`);
  }
}

/**
 * H形断面の頂点生成
 */
function generateHProfileVertices({ H, B, tw, tf }) {
  // H形断面の外形（12点）
  const halfH = H / 2;
  const halfB = B / 2;
  const halfTw = tw / 2;

  return new Float32Array([
    // 上フランジ外側
    -halfB,
    halfH,
    halfB,
    halfH,
    // 上フランジ内側
    halfB,
    halfH - tf,
    halfTw,
    halfH - tf,
    // ウェブ右上
    halfTw,
    -halfH + tf,
    // 下フランジ右内側
    halfB,
    -halfH + tf,
    halfB,
    -halfH,
    // 下フランジ左外側
    -halfB,
    -halfH,
    -halfB,
    -halfH + tf,
    // ウェブ左下
    -halfTw,
    -halfH + tf,
    -halfTw,
    halfH - tf,
    // 上フランジ左内側
    -halfB,
    halfH - tf,
  ]);
}

/**
 * Box断面の頂点生成
 */
function generateBoxProfileVertices({ B, H, t }) {
  const halfB = B / 2;
  const halfH = H / 2;

  // 外形（4点）+ 内形（4点）
  return new Float32Array([
    // 外形
    -halfB,
    -halfH,
    halfB,
    -halfH,
    halfB,
    halfH,
    -halfB,
    halfH,
    // 内形
    -halfB + t,
    -halfH + t,
    halfB - t,
    -halfH + t,
    halfB - t,
    halfH - t,
    -halfB + t,
    halfH - t,
  ]);
}

/**
 * Pipe断面の頂点生成
 */
function generatePipeProfileVertices({ D, t, segments = 32 }) {
  const outerRadius = D / 2;
  const innerRadius = outerRadius - t;
  const vertices = new Float32Array(segments * 4); // 外周 + 内周

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // 外周
    vertices[i * 2] = cos * outerRadius;
    vertices[i * 2 + 1] = sin * outerRadius;

    // 内周
    vertices[segments * 2 + i * 2] = cos * innerRadius;
    vertices[segments * 2 + i * 2 + 1] = sin * innerRadius;
  }

  return vertices;
}

/**
 * L形断面の頂点生成
 */
function generateLProfileVertices({ H, B, tw, tf }) {
  // prettier-ignore
  return new Float32Array([0, 0, B, 0, B, tf, tw, tf, tw, H, 0, H]);
}

/**
 * T形断面の頂点生成
 */
function generateTProfileVertices({ H, B, tw, tf }) {
  const halfB = B / 2;
  const halfTw = tw / 2;

  return new Float32Array([
    -halfB,
    H,
    halfB,
    H,
    halfB,
    H - tf,
    halfTw,
    H - tf,
    halfTw,
    0,
    -halfTw,
    0,
    -halfTw,
    H - tf,
    -halfB,
    H - tf,
  ]);
}

/**
 * C形断面の頂点生成
 */
function generateCProfileVertices({ H, B, tw, tf }) {
  // prettier-ignore
  return new Float32Array([0, 0, B, 0, B, tf, tw, tf, tw, H - tf, B, H - tf, B, H, 0, H]);
}

/**
 * 矩形断面の頂点生成
 */
function generateRectangleProfileVertices({ B, H }) {
  const halfB = B / 2;
  const halfH = H / 2;

  return new Float32Array([-halfB, -halfH, halfB, -halfH, halfB, halfH, -halfB, halfH]);
}

/**
 * 円形断面の頂点生成
 */
function generateCircleProfileVertices({ D, segments = 32 }) {
  const radius = D / 2;
  const vertices = new Float32Array(segments * 2);

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices[i * 2] = Math.cos(angle) * radius;
    vertices[i * 2 + 1] = Math.sin(angle) * radius;
  }

  return vertices;
}

/**
 * 押し出しジオメトリデータを生成
 * @param {Object} params
 * @param {Float32Array} params.profileVertices - 断面頂点
 * @param {number} params.length - 押し出し長さ
 * @param {boolean} [params.closed] - 閉じた形状か
 * @returns {Object} positions, normals, indices
 */
function generateExtrusionData({ profileVertices, length, closed = true }) {
  const numProfilePoints = profileVertices.length / 2;
  const numVertices = numProfilePoints * 2 + (closed ? numProfilePoints * 2 : 0);

  const positions = new Float32Array(numVertices * 3);
  const normals = new Float32Array(numVertices * 3);
  const indices = [];

  // 側面の頂点
  for (let i = 0; i < numProfilePoints; i++) {
    const x = profileVertices[i * 2];
    const y = profileVertices[i * 2 + 1];

    // 始点側
    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = 0;

    // 終点側
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = length;

    // 法線（簡易計算）
    const nx = x / Math.sqrt(x * x + y * y) || 0;
    const ny = y / Math.sqrt(x * x + y * y) || 0;
    normals[i * 6] = nx;
    normals[i * 6 + 1] = ny;
    normals[i * 6 + 2] = 0;
    normals[i * 6 + 3] = nx;
    normals[i * 6 + 4] = ny;
    normals[i * 6 + 5] = 0;
  }

  // 側面のインデックス
  for (let i = 0; i < numProfilePoints; i++) {
    const next = (i + 1) % numProfilePoints;
    const a = i * 2;
    const b = i * 2 + 1;
    const c = next * 2 + 1;
    const d = next * 2;

    indices.push(a, b, c, a, c, d);
  }

  // 端面（閉じている場合）
  if (closed) {
    const capStartIndex = numProfilePoints * 2;

    // 始点側の端面
    for (let i = 0; i < numProfilePoints; i++) {
      const idx = capStartIndex + i;
      positions[idx * 3] = profileVertices[i * 2];
      positions[idx * 3 + 1] = profileVertices[i * 2 + 1];
      positions[idx * 3 + 2] = 0;
      normals[idx * 3] = 0;
      normals[idx * 3 + 1] = 0;
      normals[idx * 3 + 2] = -1;
    }

    // 終点側の端面
    for (let i = 0; i < numProfilePoints; i++) {
      const idx = capStartIndex + numProfilePoints + i;
      positions[idx * 3] = profileVertices[i * 2];
      positions[idx * 3 + 1] = profileVertices[i * 2 + 1];
      positions[idx * 3 + 2] = length;
      normals[idx * 3] = 0;
      normals[idx * 3 + 1] = 0;
      normals[idx * 3 + 2] = 1;
    }

    // 端面のインデックス（fan状）
    for (let i = 1; i < numProfilePoints - 1; i++) {
      // 始点側（反転）
      indices.push(capStartIndex, capStartIndex + i + 1, capStartIndex + i);
      // 終点側
      indices.push(
        capStartIndex + numProfilePoints,
        capStartIndex + numProfilePoints + i,
        capStartIndex + numProfilePoints + i + 1,
      );
    }
  }

  return {
    positions,
    normals,
    indices: new Uint32Array(indices),
  };
}

/**
 * バッチ変換処理
 * @param {Object} params
 * @param {Float32Array} params.positions - 頂点位置配列
 * @param {Array} params.transforms - 変換行列配列（各16要素）
 * @returns {Float32Array} 変換後の頂点配列
 */
function batchTransform({ positions, transforms }) {
  const numVertices = positions.length / 3;
  const numInstances = transforms.length;
  const result = new Float32Array(numVertices * 3 * numInstances);

  for (let instance = 0; instance < numInstances; instance++) {
    const matrix = transforms[instance];
    const offset = instance * numVertices * 3;

    for (let v = 0; v < numVertices; v++) {
      const x = positions[v * 3];
      const y = positions[v * 3 + 1];
      const z = positions[v * 3 + 2];

      // 4x4行列変換
      result[offset + v * 3] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      result[offset + v * 3 + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      result[offset + v * 3 + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    }
  }

  return result;
}

/**
 * バウンディングボックスを計算
 * @param {Object} params
 * @param {Float32Array} params.positions - 頂点位置配列
 * @returns {Object} min, max, center, size
 */
function calculateBoundingBox({ positions }) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  const numVertices = positions.length / 3;

  for (let i = 0; i < numVertices; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    min.z = Math.min(min.z, z);
    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
    max.z = Math.max(max.z, z);
  }

  return {
    min,
    max,
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    },
    size: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
  };
}

/**
 * 複数の頂点配列をマージ
 * @param {Object} params
 * @param {Array<Float32Array>} params.arrays - マージする配列
 * @returns {Float32Array} マージされた配列
 */
function mergeVertexArrays({ arrays }) {
  // 合計サイズを計算
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }

  // マージ
  const result = new Float32Array(totalLength);
  let offset = 0;

  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

/**
 * グリッド頂点を生成
 * @param {Object} params
 * @param {number} params.width - 幅
 * @param {number} params.height - 高さ
 * @param {number} params.divisionsX - X方向分割数
 * @param {number} params.divisionsY - Y方向分割数
 * @returns {Object} positions, indices
 */
function generateGridVertices({ width, height, divisionsX, divisionsY }) {
  const numVerticesX = divisionsX + 1;
  const numVerticesY = divisionsY + 1;
  const positions = new Float32Array(numVerticesX * numVerticesY * 3);
  const indices = [];

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // 頂点生成
  for (let y = 0; y < numVerticesY; y++) {
    for (let x = 0; x < numVerticesX; x++) {
      const idx = (y * numVerticesX + x) * 3;
      positions[idx] = (x / divisionsX) * width - halfWidth;
      positions[idx + 1] = (y / divisionsY) * height - halfHeight;
      positions[idx + 2] = 0;
    }
  }

  // インデックス生成（三角形）
  for (let y = 0; y < divisionsY; y++) {
    for (let x = 0; x < divisionsX; x++) {
      const a = y * numVerticesX + x;
      const b = a + 1;
      const c = a + numVerticesX;
      const d = c + 1;

      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    positions,
    indices: new Uint32Array(indices),
  };
}
