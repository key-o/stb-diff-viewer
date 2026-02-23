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

/**
 * フォールバック重要度設定（読み込み専用）
 * JSON設定ファイルの読み込みが失敗した際のフォールバックとしてのみ使用される。
 * 通常時は importance-s2.json / importance-s4.json が上書きするため直接参照しないこと。
 * 参照箇所: importanceManager.js の loadDefaultSettings() のみ
 *
 * ST-Bridge要素パスとその重要度レベルのマッピング
 * MVD（インプリメンテーション合意事項）に基づく
 */
export const FALLBACK_IMPORTANCE_SETTINGS = {
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
  '//ST_BRIDGE/StbBeam_RC_RebarPositionApply/@center_side': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarPositionApply/@center_top_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarPositionApply/@depth_cover_side': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarPositionApply/@depth_cover_top_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarPositionApply/@interval': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_RC_RebarPositionApply/@length_to_center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_BarSpacingApply/@pitch_bar_Spacing': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarPositionApply/@center_side': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarPositionApply/@center_top_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarPositionApply/@depth_cover_side': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarPositionApply/@depth_cover_top_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarPositionApply/@interval': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeam_SRC_RebarPositionApply/@length_to_center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbBeams/StbBeam': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbBraces/StbBrace': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbColumnViaNode/StbMemberOffsetList': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumnViaNode/StbNodeIdOrder': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_BarSpacingApply/@pitch_bar_Spacing': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_RebarPositionApply/@center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_RebarPositionApply/@depth_cover': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_RebarPositionApply/@interval': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_RC_RebarPositionApply/@length_to_center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_BarSpacingApply/@pitch_bar_Spacing': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_RebarPositionApply/@center': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_RebarPositionApply/@depth_cover': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_RebarPositionApply/@interval': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbColumn_SRC_RebarPositionApply/@length_to_center': IMPORTANCE_LEVELS.OPTIONAL,
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
  '//ST_BRIDGE/StbMemberOffsetList/@id_node': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMemberOffsetList/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMemberOffsetList/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMemberOffsetList/@offset_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@condition_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@condition_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@haunch_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@haunch_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_node_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@isFoundation': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@joint_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@joint_id_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@joint_id_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_haunch_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_haunch_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_joint_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@kind_joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offset_start_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offset_start_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offset_start_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offset_end_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offset_end_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@offset_end_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@type_haunch_H': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBeams/StbBeam/@type_haunch_V': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@condition_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@condition_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@feature_brace': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_node_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@joint_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@joint_id_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@joint_id_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@kind_joint_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@kind_joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offset_start_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offset_start_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offset_start_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offset_end_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offset_end_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@offset_end_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbBraces/StbBrace/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_node_bottom': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@id_node_top': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@joint_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@joint_id_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@joint_id_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@joint_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@kind_joint_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@kind_joint_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offset_bottom_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offset_bottom_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offset_bottom_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offset_top_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offset_top_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@offset_top_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbColumns/StbColumn/StbColumnViaNode': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@id_node': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@level_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@offset_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@offset_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFootings/StbFooting/@rotate': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@guid':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@id_section_FD':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@id_section_WR':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@id_node':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@kind_structure':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@length_FD':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@length_WR':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@name':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offset_FD_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offset_FD_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offset_WR_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offset_WR_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@offset_Z':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbFoundationColumns/StbFoundationColumn/@rotate':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@condition_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@condition_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@haunch_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@haunch_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_node_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@isFoundation': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@joint_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@joint_id_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@joint_id_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_haunch_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_haunch_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_joint_start': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@kind_joint_end': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offset_start_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offset_start_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offset_start_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offset_end_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offset_end_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@offset_end_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@type_haunch_H': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/@type_haunch_V': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbGirders/StbGirder/StbGirderViaNode': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@length_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@length_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@position_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@position_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbOpens/StbOpen/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@id_node_start': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@id_node_end': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@kind_layout': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbParapets/StbParapet/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@id_node': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@length_all': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@length_foot': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@length_head': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@level_top': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@offset_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbPiles/StbPile/@offset_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@angle_load': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@angle_main_bar_direction': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@direction_load': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@isFoundation': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@kind_slab': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@thickness_add_bottom': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@thickness_add_top': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/@type_haunch': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbSlabs/StbSlab/StbNodeIdOrder': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@id_node_start':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@id_node_end':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@kind_structure':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@length_ex_start':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@length_ex_end':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@level': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbStripFootings/StbStripFooting/@offset': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbMembers/StbWalls/StbWall/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
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
  '//ST_BRIDGE/StbSections/StbSecColumn_S/StbSecBaseConventional_S': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_S/StbSecBaseProduct_S': IMPORTANCE_LEVELS.OPTIONAL,
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
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeBox/@encaSe_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeBox/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeBox/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeCross/@offset_XX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeCross/@offset_XY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeCross/@offset_YX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeCross/@offset_YY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeCross/@strength_main_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeCross/@strength_main_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeCross/@strength_web_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeCross/@strength_web_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeH/@direction': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeH/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeH/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeH/@strength_main':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeH/@strength_web':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapePipe/@encaSe_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapePipe/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapePipe/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeT/@direction_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeT/@offset_HX': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeT/@offset_HY': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeT/@offset_T': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeT/@strength_main_H':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeT/@strength_main_T':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeT/@strength_web_H':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_NotSameShapeT/@strength_web_T':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_Rect/@width_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_Rect/@width_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeBox/@encaSe_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeBox/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeBox/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeCross/@offset_XX': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeCross/@offset_XY': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeCross/@offset_YX': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeCross/@offset_YY': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeCross/@strength_main_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeCross/@strength_main_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeCross/@strength_web_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeCross/@strength_web_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeH/@direction': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeH/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeH/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeH/@strength_main': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeH/@strength_web': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapePipe/@encaSe_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapePipe/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapePipe/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeT/@direction_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeT/@offset_HX': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeT/@offset_HY': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeT/@offset_T': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeT/@strength_main_H':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeT/@strength_main_T':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeT/@strength_web_H': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_SameShapeT/@strength_web_T': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeBox/@encaSe_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeBox/@offset_X':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeBox/@offset_Y':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@offset_XX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@offset_XY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@offset_YX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@offset_YY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeCross/@strength_main_X':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@direction':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@strength_main':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeH/@strength_web':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapePipe/@encaSe_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapePipe/@offset_X':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapePipe/@offset_Y':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@direction_type':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@offset_HX':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@offset_HY':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecColumn_SRC_ThreeTypesShapeT/@offset_T': IMPORTANCE_LEVELS.REQUIRED,
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
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S/@height_mortar': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC/@height_mortar': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_AnchorBolt/@arrangement_bolt':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_AnchorBolt/@kind_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_AnchorBolt/@length_bolt':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_AnchorBolt/@name_bolt':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_AnchorBolt/@strength_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_Plate/@offset_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_Plate/@offset_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_Plate/@t': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_RibPlate/@length_e_X':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_RibPlate/@length_e_Y':
    IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_SRC_RibPlate/@t': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_AnchorBolt/@arrangement_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_AnchorBolt/@kind_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_AnchorBolt/@length_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_AnchorBolt/@name_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_AnchorBolt/@strength_bolt':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_Plate/@offset_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_Plate/@offset_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_Plate/@t': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_RibPlate/@length_e_X':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_RibPlate/@length_e_Y':
    IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseConventional_S_RibPlate/@t': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseProduct_S/@direction_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseProduct_S/@height_mortar': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseProduct_S/@product_code': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseProduct_S/@product_company': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSections/StbSecBaseProduct_SRC/@direction_type': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseProduct_SRC/@height_mortar': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseProduct_SRC/@product_code': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbSections/StbSecBaseProduct_SRC/@product_company': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffset/@id_node': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffset/@offset_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffset/@offset_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffset/@offset_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabOffsetList/StbSlabOffset': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlab_RC_BarPositionApply/@a': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbSlabs/StbSlab': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@height': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@kind': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStories/StbStory/StbNodeIdList': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbStripFootings/StbStripFooting': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbWallOffset/@id_node': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWallOffset/@offset_X': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWallOffset/@offset_Y': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWallOffset/@offset_Z': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWallOffsetList/StbWallOffset': IMPORTANCE_LEVELS.OPTIONAL,
  '//ST_BRIDGE/StbWalls/StbWall': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@guid': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@id': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@id_section': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@id_node_bottom': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@id_node_top': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@kind_structure': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@name': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@offset_bottom_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@offset_bottom_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@offset_bottom_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@offset_top_X': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@offset_top_Y': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@offset_top_Z': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPost/@rotate': IMPORTANCE_LEVELS.REQUIRED,
  '//ST_BRIDGE/StbPosts/StbPost': IMPORTANCE_LEVELS.REQUIRED,
};

/**
 * 要素タイプ名からXPathパターンを生成するユーティリティ
 * @param {string} elementType - 要素タイプ名（例: 'StbColumn', 'StbGirder'）
 * @param {string} attribute - 属性名（例: 'id', 'name'）
 * @returns {string} XPathパターン
 */
export function getXPathPattern(elementType, attribute) {
  const parentMap = {
    StbColumn: 'StbModel/StbMembers/StbColumns',
    StbPost: 'StbModel/StbMembers/StbPosts',
    StbGirder: 'StbModel/StbMembers/StbGirders',
    StbBeam: 'StbModel/StbMembers/StbBeams',
    StbBrace: 'StbModel/StbMembers/StbBraces',
    StbSlab: 'StbModel/StbMembers/StbSlabs',
    StbWall: 'StbModel/StbMembers/StbWalls',
    StbFooting: 'StbModel/StbMembers/StbFootings',
    StbStripFooting: 'StbModel/StbMembers/StbStripFootings',
    StbPile: 'StbModel/StbMembers/StbPiles',
    StbFoundationColumn: 'StbModel/StbMembers/StbFoundationColumns',
    StbParapet: 'StbModel/StbMembers/StbParapets',
    StbOpen: 'StbModel/StbMembers/StbOpens',
    StbNode: 'StbModel/StbNodes',
    StbStory: 'StbModel/StbStories',
  };

  const parent = parentMap[elementType];
  if (parent) {
    return `//ST_BRIDGE/${parent}/${elementType}/@${attribute}`;
  }

  // 断面要素
  if (elementType.startsWith('StbSec')) {
    return `//ST_BRIDGE/StbModel/StbSections/${elementType}/@${attribute}`;
  }

  // 接合部要素
  if (elementType.startsWith('StbJoint')) {
    return `//ST_BRIDGE/StbModel/StbJoints/${elementType}/@${attribute}`;
  }

  return `//ST_BRIDGE/StbModel/${elementType}/@${attribute}`;
}

/**
 * 指定した要素・属性の重要度を取得
 * @param {string} elementType - 要素タイプ名
 * @param {string} attribute - 属性名
 * @returns {string|undefined} 重要度レベル
 */
export function getImportanceLevel(elementType, attribute) {
  const xpath = getXPathPattern(elementType, attribute);
  if (FALLBACK_IMPORTANCE_SETTINGS[xpath] !== undefined) {
    return FALLBACK_IMPORTANCE_SETTINGS[xpath];
  }

  // Backward compatibility: old settings omitted "StbModel" in many paths.
  const legacyPath = xpath.replace('//ST_BRIDGE/StbModel/', '//ST_BRIDGE/');
  if (FALLBACK_IMPORTANCE_SETTINGS[legacyPath] !== undefined) {
    return FALLBACK_IMPORTANCE_SETTINGS[legacyPath];
  }

  return undefined;
}
