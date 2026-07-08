/**
 * @fileoverview 色付けモード一括適用モジュール
 *
 * 全要素へのマテリアル一括適用と再描画リクエストを提供します。
 * colorModeManager と各色付けモードモジュールの循環依存を
 * 解消するために分離されています。
 *
 * @module colorModes/applyColorMode
 */

import { UI_TIMING } from '../config/uiTimingConfig.js';
import { elementGroups, getMaterialForElementWithMode } from '../viewer/index.js';
import { scheduleRender } from '../utils/renderScheduler.js';
import { createLogger } from '../utils/logger.js';
import { normalizeModelSourceToComparisonState } from './modelSourceMapping.js';
import { styleClonedAsModelBOverlay } from '../constants/overlayStyle.js';

const log = createLogger('colorModes:applyColorMode');

/**
 * 色付けモード変更時の再描画をリクエスト
 */
export function requestColorModeRedraw() {
  scheduleRender();

  // さらに確実にするため、少し遅延させて再度描画をリクエスト
  setTimeout(() => {
    scheduleRender();
  }, UI_TIMING.COLOR_MODE_APPLY_DELAY_MS);
}

/**
 * 共通: 全要素にマテリアルを適用
 * @param {string} modeName - モード名（ログ用）
 */
export function applyColorModeToAllObjects(modeName) {
  // elementGroupsは直接インポートしたものを使用
  if (!elementGroups || Object.keys(elementGroups).length === 0) {
    log.warn(`[Render] ${modeName}: elementGroupsが未設定`);
    return;
  }

  // 全オブジェクトを収集
  const allObjects = [];
  const groups = Array.isArray(elementGroups) ? elementGroups : Object.values(elementGroups);

  groups.forEach((group) => {
    group.traverse((object) => {
      if ((object.isMesh || object.isLine) && object.userData && object.userData.elementType) {
        allObjects.push(object);
      }
    });
  });

  // マテリアルを適用（現在のカラーモードに基づいて自動選択される）
  const CHUNK_SIZE = 200;
  {
    let index = 0;

    function processChunk() {
      const end = Math.min(index + CHUNK_SIZE, allObjects.length);

      for (; index < end; index++) {
        const object = allObjects[index];
        const elementType = object.userData.elementType;

        if (elementType === 'Axis' || elementType === 'Story') {
          continue;
        }

        // このチャンク処理はフレームをまたいで進行するため、途中で再描画により
        // group.clear() されたオブジェクト（parent=null）に追いつくことがある。
        // 既にシーンから外れたオブジェクトへのマテリアル再適用・dispose は
        // 無駄かつオーバーレイclone材質の二重disposeを招くのでスキップする。
        if (!object.parent) {
          continue;
        }

        const modelSource = object.userData.modelSource || 'matched';
        const comparisonState = normalizeModelSourceToComparisonState(modelSource);
        const isLine = object.isLine || object.userData.isLine || false;
        const isPoly = object.userData.isPoly || false;
        const elementId = object.userData.elementId || null;
        const toleranceState = object.userData.toleranceState || null;
        const materialOptions = {
          isTransparent: object.userData.isSRCConcrete === true,
          srcComponentType: object.userData.srcComponentType || null,
          modelSource: object.userData.modelSource || null,
          diffStatus: object.userData.diffStatus || null,
          positionState: object.userData.positionState || null,
          attributeState: object.userData.attributeState || null,
        };

        const newMaterial = getMaterialForElementWithMode(
          elementType,
          comparisonState,
          isLine,
          isPoly,
          elementId,
          toleranceState,
          materialOptions,
        );

        if (newMaterial) {
          if (object.userData.isOverlayModelB) {
            // モデルBオーバーレイは半透明を維持する。共有マテリアルをそのまま
            // 割り当てると不透明になってしまうため、clone して半透明化する。
            // 旧オーバーレイclone材質はGPUリソース解放のため破棄する。
            const prev = object.material;
            object.material = styleClonedAsModelBOverlay(
              Array.isArray(newMaterial) ? newMaterial.map((m) => m.clone()) : newMaterial.clone(),
            );
            if (prev && prev !== newMaterial) {
              if (Array.isArray(prev)) {
                prev.forEach((m) => m && m.dispose && m.dispose());
              } else if (prev.dispose) {
                prev.dispose();
              }
            }
          } else {
            object.material = newMaterial;
          }
        }
      }

      if (index < allObjects.length) {
        scheduleRender();
        requestAnimationFrame(processChunk);
      } else {
        requestColorModeRedraw();
      }
    }

    processChunk();
  }
}
