/**
 * @fileoverview DXFビューアモジュール
 *
 * パースされたDXFデータをThree.jsで描画します。
 */

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createLogger } from '../utils/logger.js';
import { scene, camera, renderer, controls, getActiveCamera } from './core/core.js';

const log = createLogger('DXFViewer');

// DXFエンティティを保持するグループ
let dxfGroup = null;
let transformControl = null;

/**
 * DXFグループを取得または作成
 * @returns {THREE.Group} DXFエンティティを保持するグループ
 */
export function getDxfGroup() {
  if (!dxfGroup) {
    dxfGroup = new THREE.Group();
    dxfGroup.name = 'DXFEntities';
  }
  return dxfGroup;
}

/**
 * DXFグループをクリア
 */
export function clearDxfGroup() {
  if (dxfGroup) {
    while (dxfGroup.children.length > 0) {
      const child = dxfGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      dxfGroup.remove(child);
    }
  }
}

/**
 * DXF座標を3D座標に変換
 * 配置面に応じて座標軸を変換する
 * @param {number} x - DXFのX座標
 * @param {number} y - DXFのY座標
 * @param {number} z - DXFのZ座標（通常は0）
 * @param {Object} transformOptions - 変換オプション
 * @returns {Object} 変換後の座標 {x, y, z}
 */
function transformCoordinates(x, y, z, transformOptions) {
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

/**
 * DXFエンティティをシーンに描画
 * @param {Object} entities - 抽出されたエンティティ
 * @param {Object} options - 描画オプション
 * @returns {THREE.Group} 描画されたエンティティのグループ
 */
export function renderDxfEntities(entities, options = {}) {
  const {
    scale = 1,
    offsetX = 0,
    offsetY = 0,
    offsetZ = 0,
    plane = 'xy',
    visibleLayers = null, // nullの場合は全レイヤー表示
  } = options;

  // 座標変換オプションをまとめる
  const transformOptions = { scale, offsetX, offsetY, offsetZ, plane };

  clearDxfGroup();
  const group = getDxfGroup();

  // 線分を描画
  renderLines(entities.lines, group, transformOptions, visibleLayers);

  // ポリラインを描画
  renderPolylines(entities.lwpolylines, group, transformOptions, visibleLayers);

  // 円を描画
  renderCircles(entities.circles, group, transformOptions, visibleLayers);

  // 円弧を描画
  renderArcs(entities.arcs, group, transformOptions, visibleLayers);

  // 点を描画
  renderPoints(entities.points, group, transformOptions, visibleLayers);

  // 寸法を描画
  renderDimensions(entities.dimensions, group, transformOptions, visibleLayers);

  // テキストを描画
  renderTexts(entities.texts, group, transformOptions, visibleLayers);

  log.info('DXF描画完了:', {
    totalObjects: group.children.length,
    plane: plane,
  });

  return group;
}

/**
 * 線分を描画
 */
function renderLines(lines, group, transformOptions, visibleLayers) {
  for (const line of lines) {
    if (visibleLayers && !visibleLayers.includes(line.layer)) continue;

    const start = transformCoordinates(
      line.start.x,
      line.start.y,
      line.start.z || 0,
      transformOptions,
    );
    const end = transformCoordinates(line.end.x, line.end.y, line.end.z || 0, transformOptions);

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color: line.color,
      linewidth: 1,
    });

    const lineObj = new THREE.Line(geometry, material);
    lineObj.userData = {
      type: 'DXF_LINE',
      layer: line.layer,
      sourceType: 'dxf',
    };
    group.add(lineObj);
  }
}

/**
 * ポリラインを描画
 */
function renderPolylines(polylines, group, transformOptions, visibleLayers) {
  for (const pl of polylines) {
    if (visibleLayers && !visibleLayers.includes(pl.layer)) continue;

    const points = [];
    for (let i = 0; i < pl.points.length; i++) {
      const pt = pl.points[i];
      const transformed = transformCoordinates(pt.x, pt.y, pt.z || 0, transformOptions);
      points.push(new THREE.Vector3(transformed.x, transformed.y, transformed.z));

      // バルジ（円弧）の処理
      if (pt.bulge && Math.abs(pt.bulge) > 0.001 && i < pl.points.length - 1) {
        const nextPt = pl.points[i + 1];
        const arcPoints = calculateBulgeArc(pt, nextPt, pt.bulge, transformOptions);
        points.push(...arcPoints);
      }
    }

    // 閉じたポリラインの場合
    if (pl.closed && pl.points.length > 0) {
      const lastPt = pl.points[pl.points.length - 1];
      const firstPt = pl.points[0];

      if (lastPt.bulge && Math.abs(lastPt.bulge) > 0.001) {
        const arcPoints = calculateBulgeArc(lastPt, firstPt, lastPt.bulge, transformOptions);
        points.push(...arcPoints);
      }

      const firstTransformed = transformCoordinates(
        firstPt.x,
        firstPt.y,
        firstPt.z || 0,
        transformOptions,
      );
      points.push(new THREE.Vector3(firstTransformed.x, firstTransformed.y, firstTransformed.z));
    }

    if (points.length < 2) continue;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: pl.color,
      linewidth: 1,
    });

    const lineObj = new THREE.Line(geometry, material);
    lineObj.userData = {
      type: 'DXF_POLYLINE',
      layer: pl.layer,
      closed: pl.closed,
      sourceType: 'dxf',
    };
    group.add(lineObj);
  }
}

/**
 * バルジ（円弧セグメント）を計算
 */
function calculateBulgeArc(startPt, endPt, bulge, transformOptions) {
  const points = [];
  const segments = 16;

  const dx = endPt.x - startPt.x;
  const dy = endPt.y - startPt.y;
  const chord = Math.sqrt(dx * dx + dy * dy);

  if (chord < 0.0001) return points;

  const sagitta = (Math.abs(bulge) * chord) / 2;
  const radius = ((chord * chord) / 4 + sagitta * sagitta) / (2 * sagitta);

  const midX = (startPt.x + endPt.x) / 2;
  const midY = (startPt.y + endPt.y) / 2;

  const perpX = -dy / chord;
  const perpY = dx / chord;

  const direction = bulge > 0 ? 1 : -1;
  const centerOffset = direction * (radius - sagitta);

  const centerX = midX + perpX * centerOffset;
  const centerY = midY + perpY * centerOffset;

  const startAngle = Math.atan2(startPt.y - centerY, startPt.x - centerX);
  const endAngle = Math.atan2(endPt.y - centerY, endPt.x - centerX);

  let angleDiff = endAngle - startAngle;
  if (bulge > 0 && angleDiff < 0) angleDiff += 2 * Math.PI;
  if (bulge < 0 && angleDiff > 0) angleDiff -= 2 * Math.PI;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const angle = startAngle + angleDiff * t;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    const transformed = transformCoordinates(x, y, startPt.z || 0, transformOptions);
    points.push(new THREE.Vector3(transformed.x, transformed.y, transformed.z));
  }

  return points;
}

/**
 * 円を描画
 */
function renderCircles(circles, group, transformOptions, visibleLayers) {
  const segments = 64;

  for (const circle of circles) {
    if (visibleLayers && !visibleLayers.includes(circle.layer)) continue;

    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = circle.center.x + Math.cos(angle) * circle.radius;
      const y = circle.center.y + Math.sin(angle) * circle.radius;
      const transformed = transformCoordinates(x, y, circle.center.z || 0, transformOptions);
      points.push(new THREE.Vector3(transformed.x, transformed.y, transformed.z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: circle.color,
      linewidth: 1,
    });

    const circleObj = new THREE.Line(geometry, material);
    circleObj.userData = {
      type: 'DXF_CIRCLE',
      layer: circle.layer,
      radius: circle.radius,
      sourceType: 'dxf',
    };
    group.add(circleObj);
  }
}

/**
 * 円弧を描画
 */
function renderArcs(arcs, group, transformOptions, visibleLayers) {
  const segments = 32;

  for (const arc of arcs) {
    if (visibleLayers && !visibleLayers.includes(arc.layer)) continue;

    const startAngle = (arc.startAngle * Math.PI) / 180;
    let endAngle = (arc.endAngle * Math.PI) / 180;

    // 角度の正規化
    if (endAngle < startAngle) {
      endAngle += Math.PI * 2;
    }

    const angleDiff = endAngle - startAngle;
    const points = [];

    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * angleDiff;
      const x = arc.center.x + Math.cos(angle) * arc.radius;
      const y = arc.center.y + Math.sin(angle) * arc.radius;
      const transformed = transformCoordinates(x, y, arc.center.z || 0, transformOptions);
      points.push(new THREE.Vector3(transformed.x, transformed.y, transformed.z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: arc.color,
      linewidth: 1,
    });

    const arcObj = new THREE.Line(geometry, material);
    arcObj.userData = {
      type: 'DXF_ARC',
      layer: arc.layer,
      radius: arc.radius,
      sourceType: 'dxf',
    };
    group.add(arcObj);
  }
}

/**
 * 点を描画
 */
function renderPoints(points, group, transformOptions, visibleLayers) {
  const { plane = 'xy' } = transformOptions;

  for (const point of points) {
    if (visibleLayers && !visibleLayers.includes(point.layer)) continue;

    // 点を小さな十字で表現
    const size = 50;

    // 配置面に応じて十字の方向を決定
    let h1, h2, v1, v2;
    if (plane === 'xy') {
      // XY平面: Xに水平、Yに垂直
      h1 = transformCoordinates(point.position.x - size / 2, point.position.y, 0, transformOptions);
      h2 = transformCoordinates(point.position.x + size / 2, point.position.y, 0, transformOptions);
      v1 = transformCoordinates(point.position.x, point.position.y - size / 2, 0, transformOptions);
      v2 = transformCoordinates(point.position.x, point.position.y + size / 2, 0, transformOptions);
    } else if (plane === 'xz') {
      // XZ平面: Xに水平、Zに垂直
      h1 = transformCoordinates(point.position.x - size / 2, point.position.y, 0, transformOptions);
      h2 = transformCoordinates(point.position.x + size / 2, point.position.y, 0, transformOptions);
      v1 = transformCoordinates(point.position.x, point.position.y - size / 2, 0, transformOptions);
      v2 = transformCoordinates(point.position.x, point.position.y + size / 2, 0, transformOptions);
    } else {
      // YZ平面: Yに水平、Zに垂直
      h1 = transformCoordinates(point.position.x - size / 2, point.position.y, 0, transformOptions);
      h2 = transformCoordinates(point.position.x + size / 2, point.position.y, 0, transformOptions);
      v1 = transformCoordinates(point.position.x, point.position.y - size / 2, 0, transformOptions);
      v2 = transformCoordinates(point.position.x, point.position.y + size / 2, 0, transformOptions);
    }

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      // 水平線
      h1.x,
      h1.y,
      h1.z,
      h2.x,
      h2.y,
      h2.z,
      // 垂直線
      v1.x,
      v1.y,
      v1.z,
      v2.x,
      v2.y,
      v2.z,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color: point.color,
      linewidth: 1,
    });

    const pointObj = new THREE.LineSegments(geometry, material);
    pointObj.userData = {
      type: 'DXF_POINT',
      layer: point.layer,
      sourceType: 'dxf',
    };
    group.add(pointObj);
  }
}

/**
 * テキストを描画
 * @param {Array} texts - テキストエンティティの配列
 * @param {THREE.Group} group - 追加先グループ
 * @param {Object} transformOptions - 座標変換オプション
 * @param {Array|null} visibleLayers - 表示レイヤーリスト
 */
function renderTexts(texts, group, transformOptions, visibleLayers) {
  const { scale = 1 } = transformOptions;

  for (const text of texts) {
    if (visibleLayers && !visibleLayers.includes(text.layer)) continue;
    if (!text.text || text.text.trim() === '') continue;

    // デバッグ: 生のテキストデータを確認
    const rawBytes = [];
    for (let i = 0; i < text.text.length; i++) {
      rawBytes.push(text.text.charCodeAt(i).toString(16).padStart(4, '0'));
    }
    log.info('DXF TEXT raw:', {
      text: text.text,
      bytes: rawBytes.join(' '),
      layer: text.layer,
    });

    // 座標を変換
    const transformed = transformCoordinates(
      text.position.x,
      text.position.y,
      text.position.z || 0,
      transformOptions,
    );

    const sprite = createTextSprite(
      text.text,
      transformed.x / scale, // createTextSpriteが内部でscaleを掛けるので戻す
      transformed.y / scale,
      transformed.z / scale,
      scale,
      text.color,
      text.height,
      text.rotation,
    );

    if (sprite) {
      sprite.userData = {
        type: 'DXF_TEXT',
        layer: text.layer,
        sourceType: 'dxf',
        originalText: text.text,
        height: text.height,
        rotation: text.rotation,
      };
      group.add(sprite);
    }
  }
}

/**
 * DXF/AutoCADの特殊文字コードを標準文字に変換
 * @param {string} text - 変換元テキスト
 * @returns {string} 変換後テキスト
 */
function convertDxfSpecialChars(text) {
  if (!text) return '';

  let result = text;

  // AutoCAD %%コード（大文字小文字両方に対応）
  const specialCodes = {
    '%%C': 'φ', // 直径記号
    '%%c': 'φ',
    '%%D': '°', // 度記号
    '%%d': '°',
    '%%P': '±', // プラスマイナス
    '%%p': '±',
    '%%U': '', // 下線開始（表示のみなので除去）
    '%%u': '',
    '%%O': '', // 上線開始（表示のみなので除去）
    '%%o': '',
    '%%%': '%', // パーセント記号
    '%%NNN': '', // 3桁数字は後で処理
  };

  // %%コードを置換
  for (const [code, replacement] of Object.entries(specialCodes)) {
    result = result.split(code).join(replacement);
  }

  // %%nnn 形式（ASCII文字コード）を置換
  result = result.replace(/%%(\d{3})/g, (match, code) => {
    const charCode = parseInt(code, 10);
    return String.fromCharCode(charCode);
  });

  // \U+XXXX 形式（Unicode）を置換
  result = result.replace(/\\U\+([0-9A-Fa-f]{4})/g, (match, hex) => {
    const codePoint = parseInt(hex, 16);
    return String.fromCodePoint(codePoint);
  });

  // \M+nXXXX 形式（AutoCAD多言語文字）を置換
  // 例: \M+1002F（日本語のスラッシュ的な文字）
  result = result.replace(/\\M\+[0-9]([0-9A-Fa-f]{4})/g, (match, hex) => {
    const codePoint = parseInt(hex, 16);
    return String.fromCodePoint(codePoint);
  });

  // MTEXT書式コードを除去
  result = result
    .replace(/\\A[012];/g, '') // 垂直揃え
    .replace(/\\f[^;]*;/gi, '') // フォント指定
    .replace(/\\H[0-9.]+;/gi, '') // 高さ指定
    .replace(/\\H[0-9.]+x;/gi, '') // 高さ係数
    .replace(/\\W[0-9.]+;/gi, '') // 幅係数
    .replace(/\\Q[0-9.]+;/gi, '') // 斜体角度
    .replace(/\\T[0-9.]+;/gi, '') // トラッキング
    .replace(/\\[CLOR]/gi, '') // 色、行揃え
    .replace(/\\S[^;]*;/gi, '') // スタックテキスト
    .replace(/\{|\}/g, '') // グループ括弧
    .replace(/\\~/g, ' ') // 改行なしスペース
    .replace(/\\\\/g, '\\') // エスケープされたバックスラッシュ
    .replace(/\\P/gi, '\n') // 段落区切り（改行）
    .replace(/\\N/gi, '\n'); // 改行

  // SHXフォント外字・特殊記号の変換
  // これらはbigfont.shx、extfont.shx等で使われる日本語CAD特有の文字
  // Unicode Private Use Area (E000-F8FF) や特殊記号をマッピング
  result = convertShxSpecialChars(result);

  // 残った制御文字やゴミを除去
  // 0x00-0x1F（制御文字）を除去（ただし改行・タブは残す）
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return result.trim();
}

/**
 * SHXフォント外字・特殊記号を一般的な文字に変換
 * @param {string} text - 変換元テキスト
 * @returns {string} 変換後テキスト
 */
function convertShxSpecialChars(text) {
  let result = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // Unicode Private Use Area (E000-F8FF) - SHXフォント外字
    if (code >= 0xe000 && code <= 0xf8ff) {
      // よく使われる外字のマッピング（AutoCAD/Jw_cad等）
      const shxMapping = getShxCharMapping(code);
      if (shxMapping) {
        result += shxMapping;
      } else {
        // マッピングがない場合は除去または代替文字
        result += ''; // 除去
      }
    }
    // 罫線素片やBox Drawing文字（2500-257F）- 通常はそのまま
    else if (code >= 0x2500 && code <= 0x257f) {
      result += char;
    }
    // その他の特殊記号領域
    else if (code >= 0x25a0 && code <= 0x25ff) {
      // 幾何学的図形（◆◇○●等）
      // 建築記号として使われている可能性があるが、表示できる文字はそのまま
      result += char;
    }
    // 囲み文字（①②等 - 2460-24FF）
    else if (code >= 0x2460 && code <= 0x24ff) {
      result += char;
    }
    // CJK互換文字や特殊記号で表示できないもの
    else if (code >= 0xfe00 && code <= 0xfe0f) {
      // 異体字セレクタ - 除去
      continue;
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * SHX外字コードから一般的な文字へのマッピングを取得
 * @param {number} code - Unicodeコードポイント
 * @returns {string|null} マッピングされた文字、またはnull
 */
function getShxCharMapping(code) {
  // 日本語CADでよく使われるSHX外字のマッピング
  // これらは主にbigfont.shx、extfont2.shx等で定義される特殊記号
  const shxMappings = {
    // 建築記号
    0xe000: '─', // 横線
    0xe001: '│', // 縦線
    0xe002: '┌', // 角
    0xe003: '┐',
    0xe004: '└',
    0xe005: '┘',
    0xe006: '├',
    0xe007: '┤',
    0xe008: '┬',
    0xe009: '┴',
    0xe00a: '┼',

    // 構造記号（鉄骨等）
    0xe010: 'H', // H形鋼
    0xe011: 'C', // C形鋼
    0xe012: 'L', // アングル
    0xe013: '□', // 角パイプ
    0xe014: '○', // 丸パイプ

    // 寸法記号
    0xe020: 'φ', // 直径
    0xe021: 'R', // 半径
    0xe022: '°', // 度
    0xe023: '±', // プラスマイナス
    0xe024: '×', // 掛ける
    0xe025: '÷', // 割る

    // よく使われる日本語CAD記号
    0xe030: '通', // 通り芯
    0xe031: '芯',
    0xe032: '階',
    0xe033: 'F', // Floor
    0xe034: 'GL', // Ground Level
    0xe035: 'FL', // Floor Level
    0xe036: 'SL', // Slab Level
    0xe037: 'CH', // Ceiling Height

    // 矢印
    0xe040: '→',
    0xe041: '←',
    0xe042: '↑',
    0xe043: '↓',
    0xe044: '↗',
    0xe045: '↘',
    0xe046: '↖',
    0xe047: '↙',

    // 囲み数字の代替
    0xe050: '①',
    0xe051: '②',
    0xe052: '③',
    0xe053: '④',
    0xe054: '⑤',
    0xe055: '⑥',
    0xe056: '⑦',
    0xe057: '⑧',
    0xe058: '⑨',
    0xe059: '⑩',

    // 丸囲みアルファベット
    0xe060: 'Ⓐ',
    0xe061: 'Ⓑ',
    0xe062: 'Ⓒ',
    0xe063: 'Ⓓ',
    0xe064: 'Ⓔ',
    0xe065: 'Ⓕ',
    0xe066: 'Ⓖ',
    0xe067: 'Ⓗ',
    0xe068: 'Ⓘ',
    0xe069: 'Ⓙ',
    0xe06a: 'Ⓚ',
    0xe06b: 'Ⓛ',
    0xe06c: 'Ⓜ',
    0xe06d: 'Ⓝ',
    0xe06e: 'Ⓞ',
    0xe06f: 'Ⓟ',
    0xe070: 'Ⓠ',
    0xe071: 'Ⓡ',
    0xe072: 'Ⓢ',
    0xe073: 'Ⓣ',
    0xe074: 'Ⓤ',
    0xe075: 'Ⓥ',
    0xe076: 'Ⓦ',
    0xe077: 'Ⓧ',
    0xe078: 'Ⓨ',
    0xe079: 'Ⓩ',
  };

  return shxMappings[code] || null;
}

/**
 * テキストスプライトを作成（TEXT/MTEXT用）
 * @param {string} text - 表示するテキスト
 * @param {number} x - X座標
 * @param {number} y - Y座標
 * @param {number} z - Z座標
 * @param {number} scale - スケール
 * @param {number} color - テキスト色
 * @param {number} height - テキスト高さ
 * @param {number} rotation - 回転角度（度）
 * @returns {THREE.Sprite} テキストスプライト
 */
function createTextSprite(text, x, y, z, scale, color, height = 1, _rotation = 0) {
  // 特殊文字を変換
  const convertedText = convertDxfSpecialChars(text);

  // テキストを複数行に分割（MTEXTの場合）
  const lines = convertedText.split(/\n/);
  const lineCount = lines.length;

  // キャンバスサイズを動的に計算
  const fontSize = 48;
  const padding = 10;
  const lineHeight = fontSize * 1.2;

  // 最長行の幅を計算
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `${fontSize}px Arial, sans-serif`;

  let maxWidth = 0;
  for (const line of lines) {
    const width = tempCtx.measureText(line).width;
    if (width > maxWidth) maxWidth = width;
  }

  const canvasWidth = Math.max(256, Math.min(1024, maxWidth + padding * 2));
  const canvasHeight = Math.max(64, lineCount * lineHeight + padding * 2);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 背景（半透明白）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // テキスト描画
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // テキスト色を設定（colorは0xRRGGBB形式）
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

  // 複数行テキストを描画
  const startY = (canvasHeight - (lineCount - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    // 既にconvertDxfSpecialCharsで書式コード除去済み
    ctx.fillText(lines[i], canvasWidth / 2, startY + i * lineHeight);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);

  // スケール調整（DXFのテキスト高さに基づく）
  // height はDXF上のテキスト高さ（単位はモデル単位）
  const textScale = height * 10 * scale; // 適切なスケール係数
  const aspectRatio = canvasWidth / canvasHeight;
  sprite.scale.set(textScale * aspectRatio, textScale, 1);

  sprite.position.set(x * scale, y * scale, z * scale);

  return sprite;
}

/**
 * 寸法を描画
 * @param {Array} dimensions - 寸法エンティティの配列
 * @param {THREE.Group} group - 追加先グループ
 * @param {Object} transformOptions - 座標変換オプション
 * @param {Array|null} visibleLayers - 表示レイヤーリスト
 */
function renderDimensions(dimensions, group, transformOptions, visibleLayers) {
  // transformOptionsから個別の値を取り出す（既存の子関数との互換性のため）
  // 注意: 現在、寸法描画は座標変換(plane)に未対応。将来対応予定。
  const { scale = 1, offsetX = 0, offsetY = 0, offsetZ = 0 } = transformOptions;

  for (const dim of dimensions) {
    if (visibleLayers && !visibleLayers.includes(dim.layer)) continue;

    // 寸法グループを作成
    const dimGroup = new THREE.Group();
    dimGroup.userData = {
      type: 'DXF_DIMENSION',
      dimensionType: dim.dimensionType,
      layer: dim.layer,
      sourceType: 'dxf',
      text: dim.text,
      actualMeasurement: dim.actualMeasurement,
    };

    // 線形寸法 (type 0, 1) の描画
    if (dim.dimensionType === 0 || dim.dimensionType === 1) {
      renderLinearDimension(dim, dimGroup, scale, offsetX, offsetY, offsetZ);
    }
    // 半径寸法 (type 4) の描画
    else if (dim.dimensionType === 4) {
      renderRadiusDimension(dim, dimGroup, scale, offsetX, offsetY, offsetZ);
    }
    // 直径寸法 (type 3) の描画
    else if (dim.dimensionType === 3) {
      renderDiameterDimension(dim, dimGroup, scale, offsetX, offsetY, offsetZ);
    }
    // 角度寸法 (type 2, 5) の描画
    else if (dim.dimensionType === 2 || dim.dimensionType === 5) {
      renderAngularDimension(dim, dimGroup, scale, offsetX, offsetY, offsetZ);
    }
    // その他の寸法タイプはraw dataから可能な限り描画
    else {
      renderGenericDimension(dim, dimGroup, scale, offsetX, offsetY, offsetZ);
    }

    if (dimGroup.children.length > 0) {
      group.add(dimGroup);
    }
  }
}

/**
 * 線形寸法を描画
 */
function renderLinearDimension(dim, group, scale, offsetX, offsetY, offsetZ) {
  const raw = dim.raw;
  if (!raw) return;

  // dxf-parserから取得できる点
  // anchorPoint: 寸法線の定義点
  // middleOfText: テキスト中央位置
  // insertionPoint: ブロック挿入点
  // linearOrAngularPoint1, linearOrAngularPoint2: 測定点

  const color = dim.color;
  const material = new THREE.LineBasicMaterial({ color, linewidth: 1 });

  // 測定点を取得
  const p1 = raw.linearOrAngularPoint1 || raw.anchorPoint;
  const p2 = raw.linearOrAngularPoint2;

  if (!p1) return;

  // 寸法線の位置（通常はanchorPointかmiddleOfText付近）
  const dimLineY = raw.anchorPoint?.y || p1.y;

  // 寸法補助線1
  if (p1) {
    const ext1Vertices = new Float32Array([
      (p1.x + offsetX) * scale,
      (p1.y + offsetY) * scale,
      ((p1.z || 0) + offsetZ) * scale,
      (p1.x + offsetX) * scale,
      (dimLineY + offsetY) * scale,
      ((p1.z || 0) + offsetZ) * scale,
    ]);
    const ext1Geo = new THREE.BufferGeometry();
    ext1Geo.setAttribute('position', new THREE.BufferAttribute(ext1Vertices, 3));
    group.add(new THREE.Line(ext1Geo, material));
  }

  // 寸法補助線2
  if (p2) {
    const ext2Vertices = new Float32Array([
      (p2.x + offsetX) * scale,
      (p2.y + offsetY) * scale,
      ((p2.z || 0) + offsetZ) * scale,
      (p2.x + offsetX) * scale,
      (dimLineY + offsetY) * scale,
      ((p2.z || 0) + offsetZ) * scale,
    ]);
    const ext2Geo = new THREE.BufferGeometry();
    ext2Geo.setAttribute('position', new THREE.BufferAttribute(ext2Vertices, 3));
    group.add(new THREE.Line(ext2Geo, material));
  }

  // 寸法線
  if (p1 && p2) {
    const dimLineVertices = new Float32Array([
      (p1.x + offsetX) * scale,
      (dimLineY + offsetY) * scale,
      ((p1.z || 0) + offsetZ) * scale,
      (p2.x + offsetX) * scale,
      (dimLineY + offsetY) * scale,
      ((p2.z || 0) + offsetZ) * scale,
    ]);
    const dimLineGeo = new THREE.BufferGeometry();
    dimLineGeo.setAttribute('position', new THREE.BufferAttribute(dimLineVertices, 3));
    group.add(new THREE.Line(dimLineGeo, material));

    // 矢印を追加
    addArrowHead(group, p1.x + offsetX, dimLineY + offsetY, (p1.z || 0) + offsetZ, 1, scale, color);
    addArrowHead(
      group,
      p2.x + offsetX,
      dimLineY + offsetY,
      (p2.z || 0) + offsetZ,
      -1,
      scale,
      color,
    );

    // 寸法テキストを追加
    const displayText = getDimensionDisplayText(dim);
    if (displayText) {
      // テキスト位置は寸法線の中央
      const textX = (p1.x + p2.x) / 2 + offsetX;
      const textY = dimLineY + offsetY + 100; // 寸法線の少し上
      const textZ = (p1.z || 0) + offsetZ;
      const textSprite = createDimensionTextSprite(displayText, textX, textY, textZ, scale, color);
      if (textSprite) {
        group.add(textSprite);
      }
    }
  }
}

/**
 * 半径寸法を描画
 */
function renderRadiusDimension(dim, group, scale, offsetX, offsetY, offsetZ) {
  const raw = dim.raw;
  if (!raw) return;

  const color = dim.color;
  const material = new THREE.LineBasicMaterial({ color, linewidth: 1 });

  const center = raw.anchorPoint;
  const textPos = raw.middleOfText;

  if (center && textPos) {
    const vertices = new Float32Array([
      (center.x + offsetX) * scale,
      (center.y + offsetY) * scale,
      ((center.z || 0) + offsetZ) * scale,
      (textPos.x + offsetX) * scale,
      (textPos.y + offsetY) * scale,
      ((textPos.z || 0) + offsetZ) * scale,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    group.add(new THREE.Line(geo, material));

    // 矢印
    const dx = textPos.x - center.x;
    const dir = dx !== 0 ? (dx > 0 ? 1 : -1) : 0;
    addArrowHead(
      group,
      center.x + offsetX,
      center.y + offsetY,
      (center.z || 0) + offsetZ,
      dir,
      scale,
      color,
    );

    // 寸法テキストを追加（「R」プレフィックス付き）
    const displayText = getDimensionDisplayText(dim);
    if (displayText) {
      const textX = textPos.x + offsetX;
      const textY = textPos.y + offsetY + 100;
      const textZ = (textPos.z || 0) + offsetZ;
      const textSprite = createDimensionTextSprite(
        'R' + displayText,
        textX,
        textY,
        textZ,
        scale,
        color,
      );
      if (textSprite) {
        group.add(textSprite);
      }
    }
  }
}

/**
 * 直径寸法を描画
 */
function renderDiameterDimension(dim, group, scale, offsetX, offsetY, offsetZ) {
  // 直径は半径と同様だが両端に矢印
  const raw = dim.raw;
  if (!raw) return;

  const color = dim.color;
  const material = new THREE.LineBasicMaterial({ color, linewidth: 1 });

  const p1 = raw.linearOrAngularPoint1;
  const p2 = raw.linearOrAngularPoint2 || raw.anchorPoint;

  if (p1 && p2) {
    const vertices = new Float32Array([
      (p1.x + offsetX) * scale,
      (p1.y + offsetY) * scale,
      ((p1.z || 0) + offsetZ) * scale,
      (p2.x + offsetX) * scale,
      (p2.y + offsetY) * scale,
      ((p2.z || 0) + offsetZ) * scale,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    group.add(new THREE.Line(geo, material));

    // 両端に矢印
    addArrowHead(group, p1.x + offsetX, p1.y + offsetY, (p1.z || 0) + offsetZ, 1, scale, color);
    addArrowHead(group, p2.x + offsetX, p2.y + offsetY, (p2.z || 0) + offsetZ, -1, scale, color);

    // 寸法テキストを追加（「φ」プレフィックス付き）
    const displayText = getDimensionDisplayText(dim);
    if (displayText) {
      const textX = (p1.x + p2.x) / 2 + offsetX;
      const textY = (p1.y + p2.y) / 2 + offsetY + 100;
      const textZ = ((p1.z || 0) + (p2.z || 0)) / 2 + offsetZ;
      const textSprite = createDimensionTextSprite(
        'φ' + displayText,
        textX,
        textY,
        textZ,
        scale,
        color,
      );
      if (textSprite) {
        group.add(textSprite);
      }
    }
  }
}

/**
 * 角度寸法を描画
 */
function renderAngularDimension(dim, group, scale, offsetX, offsetY, offsetZ) {
  const raw = dim.raw;
  if (!raw) return;

  const color = dim.color;
  const material = new THREE.LineBasicMaterial({ color, linewidth: 1 });

  // 角度寸法は円弧で表示
  const center = raw.anchorPoint;
  const p1 = raw.linearOrAngularPoint1;
  const p2 = raw.linearOrAngularPoint2;

  if (center && p1 && p2) {
    const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
    const radius = Math.sqrt(Math.pow(p1.x - center.x, 2) + Math.pow(p1.y - center.y, 2));

    const segments = 32;
    const startAngle = angle1;
    let endAngle = angle2;
    if (endAngle < startAngle) endAngle += Math.PI * 2;

    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * (endAngle - startAngle);
      points.push(
        new THREE.Vector3(
          (center.x + Math.cos(angle) * radius + offsetX) * scale,
          (center.y + Math.sin(angle) * radius + offsetY) * scale,
          ((center.z || 0) + offsetZ) * scale,
        ),
      );
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geo, material));

    // 寸法テキストを追加（角度寸法は「°」サフィックス付き）
    const displayText = getDimensionDisplayText(dim);
    if (displayText) {
      // 円弧の中央付近にテキストを配置
      const midAngle = (startAngle + endAngle) / 2;
      const textRadius = radius * 1.2; // 少し外側に
      const textX = center.x + Math.cos(midAngle) * textRadius + offsetX;
      const textY = center.y + Math.sin(midAngle) * textRadius + offsetY;
      const textZ = (center.z || 0) + offsetZ;
      const textSprite = createDimensionTextSprite(
        displayText + '°',
        textX,
        textY,
        textZ,
        scale,
        color,
      );
      if (textSprite) {
        group.add(textSprite);
      }
    }
  }
}

/**
 * 汎用寸法を描画（raw dataから可能な限り）
 */
function renderGenericDimension(dim, group, scale, offsetX, offsetY, offsetZ) {
  const raw = dim.raw;
  if (!raw) return;

  const color = dim.color;
  const material = new THREE.LineBasicMaterial({ color, linewidth: 1 });

  // 利用可能な点を取得して線を描画
  const points = [];

  if (raw.anchorPoint) {
    points.push(raw.anchorPoint);
  }
  if (raw.middleOfText) {
    points.push(raw.middleOfText);
  }
  if (raw.linearOrAngularPoint1) {
    points.push(raw.linearOrAngularPoint1);
  }
  if (raw.linearOrAngularPoint2) {
    points.push(raw.linearOrAngularPoint2);
  }

  if (points.length >= 2) {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      const vertices = new Float32Array([
        (p1.x + offsetX) * scale,
        (p1.y + offsetY) * scale,
        ((p1.z || 0) + offsetZ) * scale,
        (p2.x + offsetX) * scale,
        (p2.y + offsetY) * scale,
        ((p2.z || 0) + offsetZ) * scale,
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      group.add(new THREE.Line(geo, material));
    }

    // 寸法テキストを追加
    const displayText = getDimensionDisplayText(dim);
    if (displayText) {
      // middleOfTextがあればそこに、なければ最初の点の近くに配置
      const textPoint = raw.middleOfText || points[0];
      const textX = textPoint.x + offsetX;
      const textY = textPoint.y + offsetY + 100;
      const textZ = (textPoint.z || 0) + offsetZ;
      const textSprite = createDimensionTextSprite(displayText, textX, textY, textZ, scale, color);
      if (textSprite) {
        group.add(textSprite);
      }
    }
  }
}

/**
 * 矢印ヘッドを追加
 */
function addArrowHead(group, x, y, z, direction, scale, color) {
  const arrowSize = 100 * scale; // 矢印のサイズ
  const arrowAngle = Math.PI / 6; // 30度

  const material = new THREE.LineBasicMaterial({ color, linewidth: 1 });

  // 矢印の2本の線
  const vertices = new Float32Array([
    x * scale,
    y * scale,
    z * scale,
    (x - direction * arrowSize * Math.cos(arrowAngle)) * scale,
    (y + arrowSize * Math.sin(arrowAngle)) * scale,
    z * scale,
    x * scale,
    y * scale,
    z * scale,
    (x - direction * arrowSize * Math.cos(arrowAngle)) * scale,
    (y - arrowSize * Math.sin(arrowAngle)) * scale,
    z * scale,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  group.add(new THREE.LineSegments(geo, material));
}

/**
 * 寸法テキストスプライトを作成
 * @param {string} text - 表示するテキスト
 * @param {number} x - X座標
 * @param {number} y - Y座標
 * @param {number} z - Z座標
 * @param {number} scale - スケール
 * @param {number} color - テキスト色
 * @param {number} rotation - 回転角度（ラジアン）
 * @returns {THREE.Sprite} テキストスプライト
 */
function createDimensionTextSprite(text, x, y, z, scale, color, _rotation = 0) {
  const fontSize = 32;
  const canvasWidth = 256;
  const canvasHeight = 64;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 背景（半透明白）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // テキスト描画
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // テキスト色を設定（colorは0xRRGGBB形式）
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

  ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);

  // スケール調整（寸法線のスケールに合わせる）
  const textScale = 300 * scale;
  sprite.scale.set(textScale, textScale * (canvasHeight / canvasWidth), 1);

  sprite.position.set(x * scale, y * scale, z * scale);

  sprite.userData = {
    type: 'DXF_DIMENSION_TEXT',
    sourceType: 'dxf',
    originalText: text,
  };

  return sprite;
}

/**
 * 寸法の表示テキストを取得
 * @param {Object} dim - 寸法データ
 * @returns {string} 表示テキスト
 */
function getDimensionDisplayText(dim) {
  // 明示的なテキストがあればそれを使用
  if (dim.text && dim.text.trim() !== '' && dim.text !== '<>') {
    // 特殊文字を変換して返す
    return convertDxfSpecialChars(dim.text);
  }

  // 実測値があれば数値として表示
  if (dim.actualMeasurement !== undefined && dim.actualMeasurement !== null) {
    // 小数点以下2桁で表示
    return dim.actualMeasurement.toFixed(2);
  }

  // rawデータからactualMeasurementを取得
  if (dim.raw && dim.raw.actualMeasurement !== undefined) {
    return dim.raw.actualMeasurement.toFixed(2);
  }

  return '';
}

/**
 * レイヤーの表示/非表示を切り替え
 * @param {string} layerName - レイヤー名
 * @param {boolean} visible - 表示状態
 */
export function setLayerVisibility(layerName, visible) {
  if (!dxfGroup) return;

  dxfGroup.traverse((object) => {
    if (object.userData && object.userData.layer === layerName) {
      object.visible = visible;
    }
  });
}

/**
 * DXFデータのバウンドに合わせてカメラを調整
 * @param {Object} bounds - バウンディングボックス
 * @param {THREE.Camera} camera - カメラ
 * @param {Object} controls - カメラコントロール
 */
export function fitCameraToDxfBounds(bounds, camera, controls) {
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;

  const sizeX = bounds.max.x - bounds.min.x;
  const sizeY = bounds.max.y - bounds.min.y;
  const sizeZ = bounds.max.z - bounds.min.z;

  const maxSize = Math.max(sizeX, sizeY, sizeZ);
  const distance = maxSize * 1.5;

  // カメラ位置を設定（上から見下ろす視点）
  camera.position.set(centerX, centerY, centerZ + distance);
  camera.lookAt(centerX, centerY, centerZ);

  // コントロールのターゲットを設定
  if (controls) {
    controls.setTarget(centerX, centerY, centerZ, false);
  }

  log.info('カメラ調整完了:', {
    center: { x: centerX, y: centerY, z: centerZ },
    size: { x: sizeX, y: sizeY, z: sizeZ },
    distance,
  });
}

/**
 * DXF位置編集モードの切り替え
 * @param {boolean} enabled - 有効にするかどうか
 */
export function toggleDxfEditMode(enabled) {
  const group = getDxfGroup();
  if (!group) return;

  if (enabled) {
    const currentCamera = getActiveCamera() || camera;

    if (!transformControl) {
      transformControl = new TransformControls(currentCamera, renderer.domElement);
      scene.add(transformControl);
    } else {
      transformControl.camera = currentCamera;
    }

    transformControl.attach(group);
    transformControl.setMode('translate');

    // モード中はカメラ操作を完全に無効化して誤操作を防ぐ
    if (controls) {
      controls.enabled = false;
    }

    log.info('DXF位置編集モード: ON');
  } else {
    if (transformControl) {
      transformControl.detach();
    }

    // モード終了時にカメラ操作を有効化
    if (controls) {
      controls.enabled = true;
    }
    log.info('DXF位置編集モード: OFF');
  }
}
