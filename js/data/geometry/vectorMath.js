/**
 * @fileoverview 純粋なベクトル数学ユーティリティ
 *
 * Three.js非依存の3Dベクトル演算関数群。
 * IFCエクスポート層とビューア層の両方から参照される共通数学基盤。
 *
 * Layer 1（data）: viewer, export, ui からimport可能
 *
 * @module data/geometry/vectorMath
 */

/**
 * @typedef {Object} Vector3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * ベクトルを正規化
 * @param {Vector3} vector
 * @returns {Vector3} 正規化されたベクトル
 */
export function normalizeVector(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

/**
 * ベクトルの外積
 * @param {Vector3} a
 * @param {Vector3} b
 * @returns {Vector3} a × b
 */
export function crossProduct(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * ベクトルの内積
 * @param {Vector3} a
 * @param {Vector3} b
 * @returns {number}
 */
export function dotProduct(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * 梁の基底ベクトルを計算
 *
 * 梁軸方向（zAxis）に対して、ローカルX軸・Y軸を決定する。
 * - 水平に近い梁: xAxis = globalUp × zAxis, yAxis = zAxis × xAxis
 * - 垂直に近い梁: globalX基準でxAxis/yAxisを決定
 *
 * @param {Vector3} direction - 梁軸方向（正規化済み）
 * @returns {{ xAxis: Vector3, yAxis: Vector3, zAxis: Vector3 }}
 */
export function calculateBeamBasis(direction) {
  const zAxis = normalizeVector(direction);
  const globalUp = { x: 0, y: 0, z: 1 };

  const verticalDot = Math.abs(dotProduct(zAxis, globalUp));
  if (verticalDot > 0.99) {
    const globalX = { x: 1, y: 0, z: 0 };
    let xAxis = normalizeVector(globalX);
    const yAxis = normalizeVector(crossProduct(zAxis, xAxis));
    xAxis = normalizeVector(crossProduct(yAxis, zAxis));
    return { xAxis, yAxis, zAxis };
  }

  const xAxis = normalizeVector(crossProduct(globalUp, zAxis));
  const yAxis = normalizeVector(crossProduct(zAxis, xAxis));
  return { xAxis, yAxis, zAxis };
}

/**
 * Rodriguesの回転公式によるベクトル回転
 *
 * v' = v*cos(θ) + (k×v)*sin(θ) + k*(k·v)*(1-cos(θ))
 *
 * @param {Vector3} vector - 回転対象ベクトル
 * @param {Vector3} axis - 回転軸（正規化済み）
 * @param {number} angle - 回転角度（ラジアン）
 * @returns {Vector3} 回転後のベクトル（正規化済み）
 */
export function rotateVectorAroundAxis(vector, axis, angle) {
  const cosR = Math.cos(angle);
  const sinR = Math.sin(angle);

  const dotKV = dotProduct(axis, vector);
  const cross = crossProduct(axis, vector);

  const result = {
    x: vector.x * cosR + cross.x * sinR + axis.x * dotKV * (1 - cosR),
    y: vector.y * cosR + cross.y * sinR + axis.y * dotKV * (1 - cosR),
    z: vector.z * cosR + cross.z * sinR + axis.z * dotKV * (1 - cosR),
  };

  return normalizeVector(result);
}
