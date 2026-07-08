/**
 * @fileoverview STB読み込み共通カーネルのSDV固有セットアップ
 *
 * MatrixCalc の stb-parser-setup.js に相当するモジュール。
 * このモジュールをインポートすると、副作用として共通カーネル
 * （common-stb/import/）に StbDiffViewer 固有のロガーが注入されます。
 *
 * SECTION_CONFIG はカーネル同梱のデフォルト設定をそのまま使用するため
 * 注入しません（アプリ固有の設定が必要になった場合は
 * setSectionConfig で上書きできます）。
 *
 * @module app/initialization/stbKernelSetup
 */

import { createLogger } from '../../utils/logger.js';
import { setLoggerFactory } from '../../common-stb/import/config/kernelConfig.js';

// ロガー注入: カーネル内の名前空間付きログを SDV の軽量ロガー
// （レベル・名前空間フィルタ付き）へ接続する
setLoggerFactory(createLogger);
