/**
 * @fileoverview ViewCube DOM Renderer
 *
 * ViewCubeのDOM構造を生成するモジュール。
 * CSS 3D Transformで表示するキューブの各面を作成します。
 */

/**
 * 面の設定（日本語ラベル）
 * id: CSS classとdata-view属性に使用
 * label: 表示テキスト
 */
const FACE_CONFIG = [
  { id: 'top', label: '上' },
  { id: 'bottom', label: '下' },
  { id: 'front', label: '前' }, // CSS Front(Z+) = World Y-方向から見る = 正面図
  { id: 'back', label: '後' }, // CSS Back(Z-) = World Y+方向から見る = 背面図
  { id: 'right', label: '右' },
  { id: 'left', label: '左' },
];

/**
 * 辺の設定（12個）
 * 2面の境界線をクリックして45度ビューに切り替え
 */
const EDGE_CONFIG = [
  // 上面の辺
  { id: 'top-front' },
  { id: 'top-back' },
  { id: 'top-right' },
  { id: 'top-left' },
  // 下面の辺
  { id: 'bottom-front' },
  { id: 'bottom-back' },
  { id: 'bottom-right' },
  { id: 'bottom-left' },
  // 縦の辺
  { id: 'front-right' },
  { id: 'front-left' },
  { id: 'back-right' },
  { id: 'back-left' },
];

/**
 * 角の設定（8個）
 * キューブの頂点をクリックしてアイソメトリックビューに切り替え
 */
const CORNER_CONFIG = [
  // 上面の角
  { id: 'top-front-right' },
  { id: 'top-front-left' },
  { id: 'top-back-right' },
  { id: 'top-back-left' },
  // 下面の角
  { id: 'bottom-front-right' },
  { id: 'bottom-front-left' },
  { id: 'bottom-back-right' },
  { id: 'bottom-back-left' },
];

/**
 * ViewCubeのDOM構造を作成
 * @returns {HTMLElement} コンテナ要素
 */
export function createViewCubeDOM() {
  const container = document.createElement('div');
  container.className = 'view-cube-container';
  container.id = 'view-cube-container';

  const cube = document.createElement('div');
  cube.className = 'view-cube';
  cube.id = 'view-cube';

  // 各面を作成
  FACE_CONFIG.forEach(({ id, label }) => {
    const face = document.createElement('div');
    face.className = `view-cube-face ${id}`;
    face.dataset.view = id;
    face.textContent = label;

    // アクセシビリティ属性
    face.setAttribute('role', 'button');
    face.setAttribute('tabindex', '0');
    face.setAttribute('aria-label', `${label}から見る`);

    cube.appendChild(face);
  });

  // 各辺を作成
  EDGE_CONFIG.forEach(({ id }) => {
    const edge = document.createElement('div');
    edge.className = `view-cube-edge ${id}`;
    edge.dataset.view = id;

    // アクセシビリティ属性
    edge.setAttribute('role', 'button');
    edge.setAttribute('tabindex', '0');
    edge.setAttribute('aria-label', `${id}ビュー`);

    cube.appendChild(edge);
  });

  // 各角を作成
  CORNER_CONFIG.forEach(({ id }) => {
    const corner = document.createElement('div');
    corner.className = `view-cube-corner ${id}`;
    corner.dataset.view = id;

    // アクセシビリティ属性
    corner.setAttribute('role', 'button');
    corner.setAttribute('tabindex', '0');
    corner.setAttribute('aria-label', `${id}ビュー`);

    cube.appendChild(corner);
  });

  container.appendChild(cube);
  return container;
}

/**
 * コンテナからキューブ要素を取得
 * @param {HTMLElement} container - コンテナ要素
 * @returns {HTMLElement|null} キューブ要素
 */
export function getCubeElement(container) {
  return container?.querySelector('.view-cube') ?? null;
}

