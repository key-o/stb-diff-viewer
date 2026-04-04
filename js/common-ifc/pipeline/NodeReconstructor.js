/**
 * @fileoverview Stage 3: 共有節点テーブル構築
 *
 * IFC要素の配置情報から始点・終点を抽出し、
 * 近接点をマージして共有節点テーブルを構築する。
 *
 * @module NodeReconstructor
 */

/** デフォルトの節点マージ許容差 (mm) */
const DEFAULT_TOLERANCE = 1.0;

export class NodeReconstructor {
  /**
   * @param {number} [tolerance=1.0] - 節点マージ許容差 (mm)
   */
  constructor(tolerance = DEFAULT_TOLERANCE) {
    this.tolerance = tolerance;
    /** @type {Map<string, {id: string, x: number, y: number, z: number}>} */
    this.nodeMap = new Map();
    this.nextId = 1;
  }

  /**
   * 座標から空間ハッシュキーを生成
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {string}
   */
  _hashKey(x, y, z) {
    const precision = this.tolerance;
    const rx = Math.round(x / precision) * precision;
    const ry = Math.round(y / precision) * precision;
    const rz = Math.round(z / precision) * precision;
    return `${rx.toFixed(1)}_${ry.toFixed(1)}_${rz.toFixed(1)}`;
  }

  /**
   * 座標を登録し、節点IDを返す。近接する既存節点があればそのIDを返す。
   * @param {number} x - mm
   * @param {number} y - mm
   * @param {number} z - mm
   * @returns {string} 節点ID
   */
  addOrGet(x, y, z) {
    const key = this._hashKey(x, y, z);

    // 既存節点を検索（ハッシュキーが同一 = 許容差以内）
    if (this.nodeMap.has(key)) {
      return this.nodeMap.get(key).id;
    }

    // 隣接セルも検索（境界付近の点を見逃さないため）
    for (const neighbor of this._neighborKeys(x, y, z)) {
      if (this.nodeMap.has(neighbor)) {
        const existing = this.nodeMap.get(neighbor);
        const dx = existing.x - x;
        const dy = existing.y - y;
        const dz = existing.z - z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= this.tolerance) {
          return existing.id;
        }
      }
    }

    // 新規節点を登録
    const id = String(this.nextId++);
    const node = {
      id,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z: Math.round(z * 100) / 100,
    };
    this.nodeMap.set(key, node);
    return id;
  }

  /**
   * 隣接する空間ハッシュキーを生成（26近傍）
   */
  *_neighborKeys(x, y, z) {
    const p = this.tolerance;
    for (const dx of [-p, 0, p]) {
      for (const dy of [-p, 0, p]) {
        for (const dz of [-p, 0, p]) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const rx = Math.round((x + dx) / p) * p;
          const ry = Math.round((y + dy) / p) * p;
          const rz = Math.round((z + dz) / p) * p;
          yield `${rx.toFixed(1)}_${ry.toFixed(1)}_${rz.toFixed(1)}`;
        }
      }
    }
  }

  /**
   * 全節点をSTB形式の配列で返す
   * @returns {Array<{id: string, x: number, y: number, z: number}>}
   */
  getNodes() {
    const nodes = [...this.nodeMap.values()];
    nodes.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    return nodes;
  }
}
