/**
 * @fileoverview IFCエクスポートハンドラー
 *
 * IFCファイルのエクスポート機能を処理します。
 *
 * @module ui/events/exportHandlers/ifcExportHandler
 */

import { showError, showWarning } from '../../common/toast.js';
import {
  collectBeamDataForExport,
  collectColumnDataForExport,
  collectBraceDataForExport,
  collectSlabDataForExport,
  collectWallDataForExport,
  collectPileDataForExport,
  collectFootingDataForExport,
  collectFoundationColumnDataForExport,
} from './ifcDataCollector.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ui:events:exportHandlers:ifcExportHandler');

/**
 * Setup IFC export button listener
 */
export function setupIfcExportListener() {
  const exportIfcBtn = document.getElementById('exportIfcBtn');

  if (exportIfcBtn) {
    exportIfcBtn.addEventListener('click', handleIfcExport);
  }
}

/**
 * Handle IFC export button click
 */
async function handleIfcExport() {
  const exportIfcBtn = document.getElementById('exportIfcBtn');

  try {
    // ボタンを無効化して処理中表示
    if (exportIfcBtn) {
      exportIfcBtn.disabled = true;
      exportIfcBtn.textContent = '📦 変換中...';
    }

    // IFCSTBExporterを動的インポート（統合エクスポーター）
    const { IFCSTBExporter } = await import('../../../export/ifc/IFCSTBExporter.js');

    // 各要素データを並行して取得
    const [
      beamData,
      columnData,
      braceData,
      slabData,
      wallData,
      pileData,
      footingData,
      foundationColumnData,
    ] = await Promise.all([
      collectBeamDataForExport(),
      collectColumnDataForExport(),
      collectBraceDataForExport(),
      collectSlabDataForExport(),
      collectWallDataForExport(),
      collectPileDataForExport(),
      collectFootingDataForExport(),
      collectFoundationColumnDataForExport(),
    ]);

    const totalElements =
      beamData.length +
      columnData.length +
      braceData.length +
      slabData.length +
      wallData.length +
      pileData.length +
      footingData.length +
      foundationColumnData.length;

    if (totalElements === 0) {
      showWarning('エクスポートする構造要素がありません。モデルを読み込んでください。');
      return;
    }

    // globalStateから階データを取得
    const { getState } = await import('../../../data/state/globalState.js');
    const stories = getState('models.stories') || [];

    // エクスポーター作成
    const exporter = new IFCSTBExporter();

    // 階データを設定
    if (stories.length > 0) {
      exporter.setStories(stories);
      log.info(`[IFC Export] ${stories.length}階のデータを設定`);
    }

    // 梁を追加（マルチセクション梁とシングルセクション梁を区別）
    for (const beam of beamData) {
      if (beam.isMultiSection && beam.sections && beam.sections.length >= 2) {
        // マルチセクション梁はaddTaperedBeamを使用
        exporter.addTaperedBeam(beam);
      } else {
        exporter.addBeam(beam);
      }
    }

    // 柱を追加
    for (const column of columnData) {
      if (column.stbType === 'StbPost') {
        exporter.addPost(column);
      } else {
        exporter.addColumn(column);
      }
    }

    // ブレースを追加
    for (const brace of braceData) {
      exporter.addBrace(brace);
    }

    // 床を追加
    for (const slab of slabData) {
      exporter.addSlab(slab);
    }

    // 壁を追加
    for (const wall of wallData) {
      exporter.addWall(wall);
    }

    // 杭を追加
    for (const pile of pileData) {
      exporter.addPile(pile);
    }

    // 基礎を追加
    for (const footing of footingData) {
      exporter.addFooting(footing);
    }

    // 基礎柱を追加
    for (const foundationColumn of foundationColumnData) {
      exporter.addFoundationColumn(foundationColumn);
    }

    // 出力ファイル名を決定（入力STBファイル名の拡張子を.ifcに変更）
    const originalFileA = getState('files.originalFileA');
    const originalFileB = getState('files.originalFileB');
    const originalFile = originalFileA || originalFileB;

    let fileName;
    if (originalFile && originalFile.name) {
      // 入力ファイル名の拡張子を.ifcに置換
      fileName = originalFile.name.replace(/\.stb$/i, '.ifc');
      // 拡張子がなかった場合は.ifcを追加
      if (!fileName.endsWith('.ifc')) {
        fileName = fileName + '.ifc';
      }
    } else {
      // フォールバック: タイムスタンプ付きのデフォルト名
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      fileName = `stb_export_${timestamp}.ifc`;
    }

    // ダウンロード
    exporter.download({ fileName });

    log.info(
      `[Process] IFC出力完了: 梁${beamData.length}本, 柱${columnData.length}本, ブレース${braceData.length}本, 床${slabData.length}枚, 壁${wallData.length}枚, 杭${pileData.length}本, 基礎${footingData.length}個, 基礎柱${foundationColumnData.length}本`,
    );
  } catch (error) {
    log.error('IFC出力エラー:', error);
    showError(`IFC出力に失敗しました: ${error.message}`);
  } finally {
    // ボタンを復元
    if (exportIfcBtn) {
      exportIfcBtn.disabled = false;
      exportIfcBtn.textContent = '📦 IFCファイルに変換';
    }
  }
}
