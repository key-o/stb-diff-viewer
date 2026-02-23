/**
 * @fileoverview DXFエクスポーターモジュール
 *
 * 特定のレイヤーを選択してDXF形式で2D CADデータとしてエクスポートします。
 */

import { createLogger } from '../../utils/logger.js';
import { eventBus, ToastEvents } from '../../app/events/index.js';
import { downloadBlob } from '../../utils/downloadHelper.js';

const log = createLogger('DXFExporter');

/**
 * RGB色値をAutoCAD Color Index (ACI) に変換
 * @param {number} rgb - RGB色値
 * @returns {number} ACI値
 */
function rgbToAci(rgb) {
  // 標準色のマッピング（逆引き）
  const aciColors = {
    0x000000: 0, // ByBlock
    0xff0000: 1, // Red
    0xffff00: 2, // Yellow
    0x00ff00: 3, // Green
    0x00ffff: 4, // Cyan
    0x0000ff: 5, // Blue
    0xff00ff: 6, // Magenta
    0xffffff: 7, // White
    0x808080: 8, // Dark Gray
    0xc0c0c0: 9, // Light Gray
  };

  return aciColors[rgb] !== undefined ? aciColors[rgb] : 7; // デフォルトは白
}

/**
 * DXFヘッダーセクションを生成（R12形式 - AC1009）
 * JWCADが出力する形式に準拠
 * @param {Object} bounds - バウンディングボックス {min, max}
 * @returns {string} DXFヘッダー文字列
 */
function generateHeader(bounds) {
  // JWCADと同じ形式でスペースパディング付き
  const lines = [
    '  0',
    'SECTION',
    '  2',
    'HEADER',
    '  9',
    '$ACADVER',
    '  1',
    'AC1009',
    '  9',
    '$INSBASE',
    ' 10',
    '0',
    ' 20',
    '0',
    ' 30',
    '0',
    '  9',
    '$EXTMIN',
    ' 10',
    Math.floor(bounds.min.x).toString(),
    ' 20',
    Math.floor(bounds.min.y).toString(),
    '  9',
    '$EXTMAX',
    ' 10',
    Math.ceil(bounds.max.x).toString(),
    ' 20',
    Math.ceil(bounds.max.y).toString(),
    '  9',
    '$LIMMIN',
    ' 10',
    Math.floor(bounds.min.x).toString(),
    ' 20',
    Math.floor(bounds.min.y).toString(),
    '  9',
    '$LIMMAX',
    ' 10',
    Math.ceil(bounds.max.x).toString(),
    ' 20',
    Math.ceil(bounds.max.y).toString(),
    '  9',
    '$LTSCALE',
    ' 40',
    '10',
    '  0',
    'ENDSEC',
  ];

  return lines.join('\n');
}

/**
 * DXFテーブルセクションを生成（JWCAD互換形式）
 * @param {Array} layers - レイヤー情報の配列
 * @param {Object} bounds - バウンディングボックス
 * @returns {string} DXFテーブル文字列
 */
function generateTables(layers, bounds) {
  // 図面の中心点を計算
  const centerX = Math.floor((bounds.min.x + bounds.max.x) / 2);
  const centerY = Math.floor((bounds.min.y + bounds.max.y) / 2);
  const height = Math.ceil(bounds.max.y - bounds.min.y) || 1000;

  const lines = [
    '  0',
    'SECTION',
    '  2',
    'TABLES',
    // VPORTテーブル（ビューポート）- AcDbマーカー付き
    '  0',
    'TABLE',
    '  2',
    'VPORT',
    '  5',
    '    1',
    '100',
    'AcDbSymbolTable',
    ' 70',
    '    1',
    '  0',
    'VPORT',
    '  5',
    '    2',
    '100',
    'AcDbSymbolTableRecord',
    '100',
    'AcDbViewportTableRecord',
    '  2',
    '*Active',
    ' 70',
    '    0',
    ' 10',
    '0',
    ' 20',
    '0',
    ' 11',
    '1',
    ' 21',
    '1',
    ' 12',
    centerX.toString(),
    ' 22',
    centerY.toString(),
    ' 13',
    '0',
    ' 23',
    '0',
    ' 14',
    '10',
    ' 24',
    '10',
    ' 15',
    '10',
    ' 25',
    '10',
    ' 16',
    '0',
    ' 26',
    '0',
    ' 36',
    '100',
    ' 17',
    '0',
    ' 27',
    '0',
    ' 37',
    '0',
    ' 40',
    height.toString(),
    ' 41',
    '1.5',
    ' 42',
    '50',
    ' 43',
    '0',
    ' 44',
    '0',
    ' 50',
    '0',
    ' 51',
    '0',
    ' 71',
    '    0',
    ' 72',
    '  100',
    ' 73',
    '    1',
    ' 74',
    '    3',
    ' 75',
    '    0',
    ' 76',
    '    0',
    ' 77',
    '    0',
    ' 78',
    '    0',
    '  0',
    'ENDTAB',
    // ラインタイプテーブル（LTYPE）- CONTINUOUSのみ定義
    '  0',
    'TABLE',
    '  2',
    'LTYPE',
    ' 70',
    '     1',
    '  0',
    'LTYPE',
    '  2',
    'CONTINUOUS',
    ' 70',
    '    64',
    '  3',
    'Solid line',
    ' 72',
    '    65',
    ' 73',
    '     0',
    ' 40',
    '0.0',
    '  0',
    'ENDTAB',
    // STYLEテーブル（テキストスタイル）- AcDbマーカー付き
    '  0',
    'TABLE',
    '  2',
    'STYLE',
    '  5',
    '3',
    '100',
    'AcDbSymbolTable',
    ' 70',
    '     1',
    '  0',
    'STYLE',
    '  5',
    '10',
    '100',
    'AcDbSymbolTableRecord',
    '100',
    'AcDbTextStyleTableRecord',
    '  2',
    'STANDARD',
    ' 70',
    '     0',
    ' 40',
    '0.0',
    ' 41',
    '1.0',
    ' 50',
    '0.0',
    ' 71',
    '     0',
    ' 42',
    '0.2',
    '  3',
    'txt',
    '  4',
    'bigfont.shx',
    '  0',
    'ENDTAB',
    // レイヤーテーブル
    '  0',
    'TABLE',
    '  2',
    'LAYER',
    ' 70',
    '    ' + layers.length.toString(),
  ];

  // 各レイヤーを定義
  for (const layer of layers) {
    lines.push(
      '  0',
      'LAYER',
      '  2',
      layer.name,
      ' 70',
      '   64',
      ' 62',
      '    ' + rgbToAci(layer.color).toString(),
      '  6',
      'CONTINUOUS',
    );
  }

  lines.push('  0', 'ENDTAB');
  lines.push('  0', 'ENDSEC');

  return lines.join('\n');
}

/**
 * DXF BLOCKSセクションを生成（JWCAD形式 - 空のセクション）
 * @returns {string} DXF BLOCKSセクション文字列
 */
function generateBlocks() {
  const lines = ['  0', 'SECTION', '  2', 'BLOCKS', '  0', 'ENDSEC'];
  return lines.join('\n');
}

/**
 * LINE エンティティを生成（JWCAD互換形式）
 * @param {Object} line - 線分データ
 * @param {number} color - ACI色番号（オプション）
 * @returns {string} DXF LINE文字列
 */
function generateLine(line, color) {
  const lines = [
    '  0',
    'LINE',
    '  8',
    line.layer,
    '  6',
    'CONTINUOUS',
    ' 62',
    '  ' + (color || 7).toString(),
    ' 10',
    Math.round(line.start.x).toString(),
    ' 20',
    Math.round(line.start.y).toString(),
    ' 11',
    Math.round(line.end.x).toString(),
    ' 21',
    Math.round(line.end.y).toString(),
  ];

  return lines.join('\n');
}

/**
 * CIRCLE エンティティを生成（JWCAD形式）
 * @param {Object} circle - 円データ
 * @returns {string} DXF CIRCLE文字列
 */
function generateCircle(circle) {
  const lines = [
    '  0',
    'CIRCLE',
    '  8',
    circle.layer,
    '  6',
    'CONTINUOUS',
    ' 10',
    Math.round(circle.center.x).toString(),
    ' 20',
    Math.round(circle.center.y).toString(),
    ' 40',
    Math.round(circle.radius).toString(),
  ];

  return lines.join('\n');
}

/**
 * ARC エンティティを生成（JWCAD形式）
 * @param {Object} arc - 円弧データ
 * @returns {string} DXF ARC文字列
 */
function generateArc(arc) {
  // DXFの角度は度数法（0-360）
  let startAngle = arc.startAngle;
  let endAngle = arc.endAngle;

  // ラジアンから度に変換（必要な場合）
  if (Math.abs(startAngle) <= Math.PI * 2 && Math.abs(endAngle) <= Math.PI * 2) {
    startAngle = startAngle * (180 / Math.PI);
    endAngle = endAngle * (180 / Math.PI);
  }

  const lines = [
    '  0',
    'ARC',
    '  8',
    arc.layer,
    '  6',
    'CONTINUOUS',
    ' 10',
    Math.round(arc.center.x).toString(),
    ' 20',
    Math.round(arc.center.y).toString(),
    ' 40',
    Math.round(arc.radius).toString(),
    ' 50',
    Math.round(startAngle).toString(),
    ' 51',
    Math.round(endAngle).toString(),
  ];

  return lines.join('\n');
}

/**
 * POLYLINE エンティティを生成（JWCAD形式）
 * @param {Object} polyline - ポリラインデータ
 * @returns {string} DXF POLYLINE文字列
 */
function generatePolyline(polyline) {
  const lines = [
    '  0',
    'POLYLINE',
    '  8',
    polyline.layer,
    '  6',
    'CONTINUOUS',
    ' 66',
    '1',
    ' 70',
    polyline.closed ? '1' : '0',
    ' 10',
    '0',
    ' 20',
    '0',
  ];

  // 頂点を追加
  for (const point of polyline.points) {
    lines.push(
      '  0',
      'VERTEX',
      '  8',
      polyline.layer,
      ' 10',
      Math.round(point.x).toString(),
      ' 20',
      Math.round(point.y).toString(),
    );
    // バルジ（円弧セグメント）がある場合
    if (point.bulge && point.bulge !== 0) {
      lines.push(' 42', point.bulge.toFixed(6));
    }
  }

  // SEQEND でポリライン終了
  lines.push('  0', 'SEQEND', '  8', polyline.layer);

  return lines.join('\n');
}

/**
 * POINT エンティティを生成（JWCAD形式）
 * @param {Object} point - 点データ
 * @returns {string} DXF POINT文字列
 */
function generatePoint(point) {
  const lines = [
    '  0',
    'POINT',
    '  8',
    point.layer,
    ' 10',
    Math.round(point.position.x).toString(),
    ' 20',
    Math.round(point.position.y).toString(),
  ];

  return lines.join('\n');
}

/**
 * TEXT エンティティを生成（JWCAD互換形式）
 * @param {Object} text - テキストデータ
 * @returns {string} DXF TEXT文字列
 */
function generateText(text) {
  const lines = [
    '  0',
    'TEXT',
    '  8',
    text.layer,
    ' 10',
    Math.round(text.position.x).toString(),
    ' 20',
    Math.round(text.position.y).toString(),
    ' 40',
    Math.round(text.height || 200).toString(),
    '  1',
    text.text || '',
  ];

  return lines.join('\n');
}

/**
 * DIMENSION エンティティを生成（基本的なLINEとTEXTに分解）（R12形式）
 * @param {Object} dimension - 寸法データ
 * @returns {string} DXF要素の文字列
 */
function generateDimension(dimension) {
  const elements = [];

  // 寸法を構成する要素を線分とテキストで再現
  // 線形寸法の場合
  if (dimension.dimensionType === 0 || dimension.dimensionType === 1) {
    // 寸法補助線1
    if (dimension.extLine1 && dimension.anchorPoint) {
      elements.push(
        generateLine({
          start: dimension.extLine1,
          end: dimension.anchorPoint,
          layer: dimension.layer,
        }),
      );
    }

    // 寸法テキスト
    if (dimension.extLine1 && dimension.text) {
      elements.push(
        generateText({
          position: dimension.extLine1,
          text: dimension.text || dimension.actualMeasurement?.toFixed(0) || '',
          height: 200,
          rotation: dimension.rotation || 0,
          layer: dimension.layer,
        }),
      );
    }
  }

  return elements.join('\n');
}

/**
 * DXFエンティティセクションを生成（JWCAD形式）
 * @param {Object} entities - エンティティデータ
 * @param {Array<string>} selectedLayers - 出力するレイヤー名の配列
 * @returns {string} DXFエンティティ文字列
 */
function generateEntities(entities, selectedLayers) {
  const entityStrings = ['  0', 'SECTION', '  2', 'ENTITIES'];

  // レイヤーフィルタ関数
  const isLayerSelected = (layerName) => {
    if (!selectedLayers || selectedLayers.length === 0) return true;
    return selectedLayers.includes(layerName);
  };

  // LINE
  for (const line of entities.lines || []) {
    if (isLayerSelected(line.layer)) {
      entityStrings.push(generateLine(line));
    }
  }

  // CIRCLE
  for (const circle of entities.circles || []) {
    if (isLayerSelected(circle.layer)) {
      entityStrings.push(generateCircle(circle));
    }
  }

  // ARC
  for (const arc of entities.arcs || []) {
    if (isLayerSelected(arc.layer)) {
      entityStrings.push(generateArc(arc));
    }
  }

  // POLYLINE（R12形式）
  for (const polyline of entities.lwpolylines || []) {
    if (isLayerSelected(polyline.layer)) {
      entityStrings.push(generatePolyline(polyline));
    }
  }

  // POINT
  for (const point of entities.points || []) {
    if (isLayerSelected(point.layer)) {
      entityStrings.push(generatePoint(point));
    }
  }

  // TEXT
  for (const text of entities.texts || []) {
    if (isLayerSelected(text.layer)) {
      entityStrings.push(generateText(text));
    }
  }

  // DIMENSION（線分とテキストに分解）
  for (const dimension of entities.dimensions || []) {
    if (isLayerSelected(dimension.layer)) {
      const dimStr = generateDimension(dimension);
      if (dimStr) {
        entityStrings.push(dimStr);
      }
    }
  }

  entityStrings.push('  0', 'ENDSEC');

  return entityStrings.join('\n');
}

/**
 * 選択されたレイヤーのバウンディングボックスを計算
 * @param {Object} entities - エンティティデータ
 * @param {Array<string>} selectedLayers - 選択されたレイヤー名
 * @returns {Object} バウンディングボックス {min, max}
 */
function calculateSelectedBounds(entities, selectedLayers) {
  const bounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };

  const isLayerSelected = (layerName) => {
    if (!selectedLayers || selectedLayers.length === 0) return true;
    return selectedLayers.includes(layerName);
  };

  function updateBounds(point) {
    bounds.min.x = Math.min(bounds.min.x, point.x);
    bounds.min.y = Math.min(bounds.min.y, point.y);
    bounds.min.z = Math.min(bounds.min.z, point.z || 0);
    bounds.max.x = Math.max(bounds.max.x, point.x);
    bounds.max.y = Math.max(bounds.max.y, point.y);
    bounds.max.z = Math.max(bounds.max.z, point.z || 0);
  }

  // 線分
  for (const line of entities.lines || []) {
    if (isLayerSelected(line.layer)) {
      updateBounds(line.start);
      updateBounds(line.end);
    }
  }

  // ポリライン
  for (const pl of entities.lwpolylines || []) {
    if (isLayerSelected(pl.layer)) {
      for (const pt of pl.points) {
        updateBounds(pt);
      }
    }
  }

  // 円
  for (const circle of entities.circles || []) {
    if (isLayerSelected(circle.layer)) {
      updateBounds({
        x: circle.center.x - circle.radius,
        y: circle.center.y - circle.radius,
        z: circle.center.z,
      });
      updateBounds({
        x: circle.center.x + circle.radius,
        y: circle.center.y + circle.radius,
        z: circle.center.z,
      });
    }
  }

  // 円弧
  for (const arc of entities.arcs || []) {
    if (isLayerSelected(arc.layer)) {
      updateBounds({ x: arc.center.x - arc.radius, y: arc.center.y - arc.radius, z: arc.center.z });
      updateBounds({ x: arc.center.x + arc.radius, y: arc.center.y + arc.radius, z: arc.center.z });
    }
  }

  // 点
  for (const point of entities.points || []) {
    if (isLayerSelected(point.layer)) {
      updateBounds(point.position);
    }
  }

  // テキスト
  for (const text of entities.texts || []) {
    if (isLayerSelected(text.layer)) {
      updateBounds(text.position);
    }
  }

  // 有効なバウンドがない場合のデフォルト
  if (bounds.min.x === Infinity) {
    bounds.min = { x: 0, y: 0, z: 0 };
    bounds.max = { x: 1000, y: 1000, z: 0 };
  }

  return bounds;
}

/**
 * DXFファイルをエクスポート
 * @param {Object} entities - エンティティデータ
 * @param {Array} layers - レイヤー情報の配列
 * @param {Array<string>} selectedLayers - 出力するレイヤー名の配列（空の場合は全レイヤー）
 * @param {string} filename - ファイル名（拡張子なし）
 * @returns {boolean} エクスポート成功フラグ
 */
export function exportDxf(entities, layers, selectedLayers = [], filename = 'export') {
  try {
    log.info('DXFエクスポート開始:', {
      totalLayers: layers.length,
      selectedLayers: selectedLayers.length || 'all',
    });

    // 出力するレイヤーをフィルタリング
    const exportLayers =
      selectedLayers.length > 0 ? layers.filter((l) => selectedLayers.includes(l.name)) : layers;

    if (exportLayers.length === 0) {
      throw new Error('エクスポートするレイヤーがありません');
    }

    // バウンディングボックスを計算
    const bounds = calculateSelectedBounds(entities, selectedLayers);

    // DXFコンテンツを生成
    const dxfContent = [
      generateHeader(bounds),
      generateTables(exportLayers, bounds),
      generateBlocks(),
      generateEntities(entities, selectedLayers),
      '  0',
      'EOF',
    ].join('\n');

    // ファイルをダウンロード
    downloadDxf(dxfContent, filename);

    log.info('DXFエクスポート完了');
    return true;
  } catch (error) {
    log.error('DXFエクスポートエラー:', error);
    eventBus.emit(ToastEvents.SHOW_ERROR, {
      message: `DXFエクスポートに失敗しました: ${error.message}`,
    });
    return false;
  }
}

/**
 * DXFファイルをダウンロード
 * @param {string} content - DXFファイル内容
 * @param {string} filename - ファイル名（拡張子なし）
 */
function downloadDxf(content, filename) {
  const blob = new Blob([content], { type: 'application/dxf' });
  downloadBlob(blob, `${filename}.dxf`);
}

/**
 * エンティティ統計を取得
 * @param {Object} entities - エンティティデータ
 * @param {Array<string>} selectedLayers - 選択されたレイヤー名
 * @returns {Object} 統計情報
 */
export function getExportStats(entities, selectedLayers = []) {
  const isLayerSelected = (layerName) => {
    if (!selectedLayers || selectedLayers.length === 0) return true;
    return selectedLayers.includes(layerName);
  };

  const stats = {
    lines: 0,
    circles: 0,
    arcs: 0,
    polylines: 0,
    points: 0,
    texts: 0,
    dimensions: 0,
    total: 0,
  };

  for (const line of entities.lines || []) {
    if (isLayerSelected(line.layer)) stats.lines++;
  }
  for (const circle of entities.circles || []) {
    if (isLayerSelected(circle.layer)) stats.circles++;
  }
  for (const arc of entities.arcs || []) {
    if (isLayerSelected(arc.layer)) stats.arcs++;
  }
  for (const pl of entities.lwpolylines || []) {
    if (isLayerSelected(pl.layer)) stats.polylines++;
  }
  for (const point of entities.points || []) {
    if (isLayerSelected(point.layer)) stats.points++;
  }
  for (const text of entities.texts || []) {
    if (isLayerSelected(text.layer)) stats.texts++;
  }
  for (const dim of entities.dimensions || []) {
    if (isLayerSelected(dim.layer)) stats.dimensions++;
  }

  stats.total =
    stats.lines +
    stats.circles +
    stats.arcs +
    stats.polylines +
    stats.points +
    stats.texts +
    stats.dimensions;

  return stats;
}

// グローバルにエクスポート
window.exportDxf = exportDxf;
window.getExportStats = getExportStats;
