/**
 * @fileoverview 重要度設定のデフォルト構成
 *
 * ST-Bridge要素の詳細な重要度設定とデフォルト値を定義します。
 * MVD（インプリメンテーション合意事項）に基づいて自動生成。
 * S2 → REQUIRED（高重要度）、S4のみ → OPTIONAL（中重要度）
 *
 * @module config/importanceConfig
 */

import { IMPORTANCE_LEVELS } from '../constants/importanceLevels.js';
import { IMPORTANCE_COLORS } from './colorConfig.js';

// Re-export for backwards compatibility
export { IMPORTANCE_COLORS };

/**
 * デフォルト重要度設定
 * ST-Bridge要素パスとその重要度レベルのマッピング
 * MVD（インプリメンテーション合意事項）に基づく
 */
export const DEFAULT_IMPORTANCE_SETTINGS = {
  // === ST_BRIDGE (ST_BRIDGE) ===
  '//ST_BRIDGE/ST_BRIDGE/@version': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/ST_BRIDGE/StbCommon': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/ST_BRIDGE/StbModel': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbArcAxes/@end_angle': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbArcAxes/@group_name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbArcAxes/StbArcAxis': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbArcAxis/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbArcAxis/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbArcAxis/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbArcAxis/@radius': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbArcAxis/StbNodeIdList': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbAxes/@angle': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbAxes/@group_name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbAxes/StbParallelAxis': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbBeam_RC_BarSpacingApply/@pitch_bar_Spacing': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarpositionApply/@center_side': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarpositionApply/@center_top_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarpositionApply/@depth_cover_side': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarpositionApply/@depth_cover_top_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarpositionApply/@interval': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarpositionApply/@length_to_center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_BarSpacingApply/@pitch_bar_Spacing': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarpositionApply/@center_side': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarpositionApply/@center_top_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarpositionApply/@depth_cover_side': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarpositionApply/@depth_cover_top_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarpositionApply/@interval': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarpositionApply/@length_to_center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeams/StbBeam': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbBraces/StbBrace': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbColumnViaNode/StbMemberOffSetList': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumnViaNode/StbNodeIdOrder': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_BarSpacingApply/@pitch_bar_Spacing': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_RebarpositionApply/@center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_RebarpositionApply/@depth_cover': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_RebarpositionApply/@interval': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_RebarpositionApply/@length_to_center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_BarSpacingApply/@pitch_bar_Spacing': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_RebarpositionApply/@center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_RebarpositionApply/@depth_cover': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_RebarpositionApply/@interval': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_RebarpositionApply/@length_to_center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumns/StbColumn': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbCommon/@app_name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbCommon/@app_version': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbCommon/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbCommon/@project_name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtElement/@object_name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtObject/@id_object': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtObject/@object_name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtProperty/@key': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtProperty/@type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtProperty/@value': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtPropertyDef/@key': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtPropertyDef/@type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbExtension/@identifier': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbFootings/StbFooting': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbFoundationColumns/StbFoundationColumn': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbGirderViaNode/StbNodeIdOrder': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbGirders/StbGirder': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMemberOffSetList/@id_node': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMemberOffSetList/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMemberOffSetList/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMemberOffSetList/@offSet_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@condition_Start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@condition_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@haunch_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@haunch_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_node_Start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@isFoundation': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@joint_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@joint_id_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@joint_id_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_haunch_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_haunch_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_joint_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offSet_Start_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offSet_Start_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offSet_Start_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offSet_end_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offSet_end_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offSet_end_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@type_haunch_H': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@type_haunch_V': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@condition_Start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@condition_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@feature_brace': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_node_Start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@joint_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@joint_id_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@joint_id_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@kind_joint_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@kind_joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offSet_Start_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offSet_Start_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offSet_Start_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offSet_end_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offSet_end_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offSet_end_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_node_bottom': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_node_top': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@joint_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@joint_id_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@joint_id_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@joint_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@kind_joint_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@kind_joint_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offSet_bottom_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offSet_bottom_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offSet_bottom_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offSet_top_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offSet_top_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offSet_top_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/StbColumnViaNode': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@id_node': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@level_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@offSet_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@offSet_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@rotate': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@guid':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@id_Section_FD':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@id_Section_WR':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@id_node':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@kind_Structure':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@length_FD':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@length_WR':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@name':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offSet_FD_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offSet_FD_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offSet_WR_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offSet_WR_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offSet_Z':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@rotate':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@condition_Start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@condition_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@haunch_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@haunch_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_node_Start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@isFoundation': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@joint_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@joint_id_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@joint_id_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_haunch_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_haunch_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_joint_Start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offSet_Start_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offSet_Start_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offSet_Start_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offSet_end_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offSet_end_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offSet_end_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@type_haunch_H': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@type_haunch_V': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/StbGirderViaNode': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@length_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@length_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@position_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@position_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@id_node_Start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@kind_layout': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@id_node': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@length_all': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@length_foot': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@length_head': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@level_top': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@offSet_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@offSet_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@angle_load': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@angle_main_bar_direction': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@direction_load': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@isFoundation': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@kind_Slab': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@thickness_add_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@thickness_add_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@type_haunch': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/StbNodeIdOrder': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@id_node_Start':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@id_node_end':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@kind_Structure':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@length_ex_Start':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@length_ex_end':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@level': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@offSet': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@kind_layout': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/StbNodeIdOrder': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMode/StbAxes': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMode/StbJoints': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMode/StbMembers': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMode/StbNodes': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMode/StbSections': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMode/StbStories': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodeId/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodeIdList/@id': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbNodeIdOrder/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodes/StbNode/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbNodes/StbNode/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbOpenId/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbOpenIdList/StbOpenId': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbOpens/StbOpen': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParallelAxes/@angle': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParallelAxes/@group_name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParallelAxes/StbParallelAxis': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParallelAxis/@distance': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParallelAxis/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParallelAxis/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParallelAxis/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParallelAxis/StbNodeIdList': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbParapets/StbParapet': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPiles/StbPile': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbRadialAxes/@a': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbRadialAxes/StbRadialAxis': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbRadialAxis/@angle': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbRadialAxis/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbRadialAxis/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbRadialAxis/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbRadialAxis/StbNodeIdList': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBarArrangementColumn_SRC/@center_Start_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarArrangementColumn_SRC/@center_Start_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarArrangementColumn_SRC/@center_end_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarArrangementColumn_SRC/@center_end_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarArrangementColumn_SRC/@depth_cover_Start_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarArrangementColumn_SRC/@depth_cover_Start_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarArrangementColumn_SRC/@depth_cover_end_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarArrangementColumn_SRC/@depth_cover_end_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_RC_CircleNotSame/@pitch_band':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_RC_CircleNotSame/@pos': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_RC_CircleSame/@pitch_band': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_RC_RectNotSame/@pitch_band': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_RC_RectNotSame/@pos': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_RC_RectSame/@pitch_band': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleNotSame/@pitch_band':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleNotSame/@pos': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleNotSame/@strength_axial':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleNotSame/@strength_band':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleNotSame/@strength_main':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleSame/@pitch_band': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleSame/@strength_axial':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleSame/@strength_band':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_CircleSame/@strength_main':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_RectNotSame/@pitch_band': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_RectNotSame/@pos': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBarColumn_SRC_RectSame/@pitch_band': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/@floor': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/@kind_column': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/StbSecBarArrangementColumn_RC':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC/StbSecFigureColumn_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC_Rect/@width_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_RC_Rect/@width_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/@floor': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/@isReferenceDirection': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/@kind_column': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/StbSecSteelFigureColumn_S': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/StbSecbaseConventional_S': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/StbSecbaseProduct_S': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/@floor': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/@kind_column': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/StbSecBarArrangementColumn_SRC':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/StbSecFigureColumn_SRC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC/StbSecSteelFigureColumn_SRC':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeBox/@encaSe_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeBox/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeBox/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeCross/@offSet_XX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeCross/@offSet_XY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeCross/@offSet_YX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeCross/@offSet_YY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeCross/@strength_main_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeCross/@strength_main_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeCross/@strength_web_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeCross/@strength_web_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeH/@direction': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeH/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeH/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeH/@strength_main':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeH/@strength_web':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapePipe/@encaSe_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapePipe/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapePipe/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeT/@direction_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeT/@offSet_HX': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeT/@offSet_HY': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeT/@offSet_T': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeT/@strength_main_H':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeT/@strength_main_T':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeT/@strength_web_H':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameshapeT/@strength_web_T':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_Rect/@width_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_Rect/@width_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeBox/@encaSe_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeBox/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeBox/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeCross/@offSet_XX': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeCross/@offSet_XY': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeCross/@offSet_YX': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeCross/@offSet_YY': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeCross/@strength_main_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeCross/@strength_main_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeCross/@strength_web_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeCross/@strength_web_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeH/@direction': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeH/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeH/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeH/@strength_main': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeH/@strength_web': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapePipe/@encaSe_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapePipe/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapePipe/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeT/@direction_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeT/@offSet_HX': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeT/@offSet_HY': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeT/@offSet_T': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeT/@strength_main_H':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeT/@strength_main_T':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeT/@strength_web_H': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameshapeT/@strength_web_T': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeBox/@encaSe_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeBox/@offSet_X':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeBox/@offSet_Y':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@offSet_XX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@offSet_XY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@offSet_YX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@offSet_YY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@strength_main_X':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@direction':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@strength_main':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@strength_web':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapePipe/@encaSe_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapePipe/@offSet_X':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapePipe/@offSet_Y':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@direction_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@offSet_HX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@offSet_HY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@offSet_T': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@strength_main_H':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@strength_main_T':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@strength_web_H':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@strength_web_T':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecFigureColumn_RC/@floor': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecFigureColumn_RC/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecFigureColumn_RC/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecFigureColumn_RC/@kind_column': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecFigureColumn_RC/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecFigureColumn_RC/@strength_concrete': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecFigureColumn_RC/StbSecBarArrangementColumn_RC':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecFigureColumn_RC/StbSecFigureColumn_RC': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecSteelColumn_S_NotSame/@pos': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecSteelColumn_S_NotSame/@strength_main': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelColumn_S_NotSame/@strength_web': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelColumn_S_Same/@strength_main': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelColumn_S_Same/@strength_web': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelColumn_S_ThreeTypes/@pos': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecSteelColumn_S_ThreeTypes/@strength_main':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelColumn_S_ThreeTypes/@strength_web':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelFigureColumn_S/@base_type': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelFigureColumn_S/@joint_id_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelFigureColumn_S/@joint_id_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelFigureColumn_SRC/@base_type': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelFigureColumn_SRC/@joint_id_bottom':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelFigureColumn_SRC/@joint_id_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecSteelFigureColumn_SRC/@length_embedded':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecUndefined/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecUndefined/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecUndefined/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S/@height_mortar': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC/@height_mortar': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_AnchorBolt/@arrangement_bolt':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_AnchorBolt/@kind_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_AnchorBolt/@length_bolt':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_AnchorBolt/@name_bolt':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_AnchorBolt/@strength_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_Plate/@offSet_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_Plate/@offSet_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_Plate/@t': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_RibPlate/@length_e_X':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_RibPlate/@length_e_Y':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_SRC_RibPlate/@t': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_AnchorBolt/@arrangement_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_AnchorBolt/@kind_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_AnchorBolt/@length_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_AnchorBolt/@name_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_AnchorBolt/@strength_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_Plate/@offSet_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_Plate/@offSet_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_Plate/@t': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_RibPlate/@length_e_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_RibPlate/@length_e_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseConventional_S_RibPlate/@t': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseProduct_S/@direction_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseProduct_S/@height_mortar': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseProduct_S/@product_code': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseProduct_S/@product_company': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecbaseProduct_SRC/@direction_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseProduct_SRC/@height_mortar': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseProduct_SRC/@product_code': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecbaseProduct_SRC/@product_company': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffSet/@id_node': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffSet/@offSet_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffSet/@offSet_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffSet/@offSet_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffSetList/StbSlablOffSet': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlab_RC_BarpositionApply/@a': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabs/StbSlab': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@height': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@kind': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/StbNodeIdList': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStripFootings/StbStripFooting': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbWallOffSet/@id_node': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWallOffSet/@offSet_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWallOffSet/@offSet_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWallOffSet/@offSet_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWallOffSetList/StbWallOffSet': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWalls/StbWall': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@id_Section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@id_node_bottom': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@id_node_top': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@kind_Structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@offSet_bottom_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@offSet_bottom_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@offSet_bottom_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@offSet_top_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@offSet_top_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@offSet_top_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbpost/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/Stbposts/Stbpost': IMPORTANCE_LEVELS.REQUIRED,
};

/**
 * 要素タイプ名からXPathパターンを生成するユーティリティ
 * @param {string} elementType - 要素タイプ名（例: 'StbColumn', 'StbGirder'）
 * @param {string} attribute - 属性名（例: 'id', 'name'）
 * @returns {string} XPathパターン
 */
export function getXPathPattern(elementType, attribute) {
  const parentMap = {
    StbColumn: 'StbMembers/StbColumns',
    StbPost: 'StbMembers/StbPosts',
    StbGirder: 'StbMembers/StbGirders',
    StbBeam: 'StbMembers/StbBeams',
    StbBrace: 'StbMembers/StbBraces',
    StbSlab: 'StbMembers/StbSlabs',
    StbWall: 'StbMembers/StbWalls',
    StbFooting: 'StbMembers/StbFootings',
    StbStripFooting: 'StbMembers/StbStripFootings',
    StbPile: 'StbMembers/StbPiles',
    StbFoundationColumn: 'StbMembers/StbFoundationColumns',
    StbParapet: 'StbMembers/StbParapets',
    StbOpen: 'StbMembers/StbOpens',
    StbNode: 'StbNodes',
    StbStory: 'StbStories',
  };

  const parent = parentMap[elementType];
  if (parent) {
    return `//ST_BRIDGE/${parent}/${elementType}/@${attribute}`;
  }

  // 断面要素
  if (elementType.startsWith('StbSec')) {
    return `//ST_BRIDGE/StbSections/${elementType}/@${attribute}`;
  }

  // 接合部要素
  if (elementType.startsWith('StbJoint')) {
    return `//ST_BRIDGE/StbJoints/${elementType}/@${attribute}`;
  }

  return `//ST_BRIDGE/${elementType}/@${attribute}`;
}

/**
 * 指定した要素・属性の重要度を取得
 * @param {string} elementType - 要素タイプ名
 * @param {string} attribute - 属性名
 * @returns {string|undefined} 重要度レベル
 */
export function getImportanceLevel(elementType, attribute) {
  const xpath = getXPathPattern(elementType, attribute);
  return DEFAULT_IMPORTANCE_SETTINGS[xpath];
}
