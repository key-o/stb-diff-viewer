/**
 * @fileoverview メッシュのuserDataから構造種別を判定するユーティリティ
 *
 * @module data/structuralSystemResolver
 */

import { STRUCTURAL_SYSTEM } from '../constants/structuralSystems.js';
import { SECTION_TYPE } from '../constants/sectionTypes.js';

const RC_TYPES = new Set([SECTION_TYPE.RECTANGLE, SECTION_TYPE.CIRCLE]);
const STEEL_ONLY_TYPES = new Set([
  SECTION_TYPE.H,
  SECTION_TYPE.BOX,
  SECTION_TYPE.PIPE,
  SECTION_TYPE.C,
  SECTION_TYPE.L,
  SECTION_TYPE.T,
  SECTION_TYPE.FB,
]);

/**
 * メッシュのuserDataから構造種別（RC/S/SRC/CFT）を判定
 *
 * @param {Object} userData - メッシュのuserData
 * @returns {string|null} 構造種別（STRUCTURAL_SYSTEMの値）、判定不能の場合null
 */
export function resolveStructuralSystem(userData) {
  if (!userData) return null;
  if (userData.isBasePlate || userData.isOutline) return null;

  // SRC: 専用マーカーを優先チェック
  if (userData.srcComponentType || userData.isSRCConcrete) {
    return STRUCTURAL_SYSTEM.SRC;
  }

  // CFT: sectionTypeから判定
  if (userData.sectionType === SECTION_TYPE.CFT) {
    return STRUCTURAL_SYSTEM.CFT;
  }

  // 元の断面タグから判定（sectionDataOriginalがあれば）
  const originalTag = userData.sectionDataOriginal?.sectionType;
  if (originalTag) {
    const tagUpper = String(originalTag).toUpperCase();
    if (tagUpper.endsWith('_SRC')) return STRUCTURAL_SYSTEM.SRC;
    if (tagUpper.endsWith('_CFT')) return STRUCTURAL_SYSTEM.CFT;
    if (tagUpper.endsWith('_S')) return STRUCTURAL_SYSTEM.S;
    if (tagUpper.endsWith('_RC')) return STRUCTURAL_SYSTEM.RC;
  }

  // 解決済みsectionTypeからフォールバック判定
  const st = userData.sectionType;
  if (RC_TYPES.has(st)) return STRUCTURAL_SYSTEM.RC;
  if (STEEL_ONLY_TYPES.has(st)) return STRUCTURAL_SYSTEM.S;

  return null;
}
