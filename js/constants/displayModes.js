/**
 * 表示モード関連定数
 * カメラモード、ラベル表示タイプなどを一元管理
 */

// カメラモード
export const CAMERA_MODES = {
  PERSPECTIVE: 'perspective',
  ORTHOGRAPHIC: 'orthographic',
};

// ラベル内容タイプ
export const CAMERA_CONTEXTS = {
  SOLID: 'solid',
  DRAWING: 'drawing',
};

export const LABEL_CONTENT_TYPES = {
  ID: 'id',
  NAME: 'name',
  SECTION: 'section',
  SECTION_NAME: 'sectionName',
};

// ラベル内容の説明
export const LABEL_CONTENT_DESCRIPTIONS = {
  [LABEL_CONTENT_TYPES.ID]: 'タグ（デフォルト）',
  [LABEL_CONTENT_TYPES.NAME]: 'インスタンス名（Name）',
  [LABEL_CONTENT_TYPES.SECTION]: '断面ID（id_section）',
  [LABEL_CONTENT_TYPES.SECTION_NAME]: '断面名（name属性）',
};

// 表示モード（line/solid）
export const DISPLAY_MODES = {
  LINE: 'line',
  SOLID: 'solid',
};
